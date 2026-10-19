import { createEntity, refreshAppearance, startAnim, updateEntity, bodyHalf, type Env } from '../ai/behaviors'
import type { Entity, Pellet } from '../ai/entity'
import { coatOf } from '../config/species'
import type { Pet } from '../save/types'
import type { FarmEffect } from '../sim/commands'
import { isSleeping } from '../sim/rules'
import { lowStatNotices } from '../sim/stats'
import { isNight, type Weather } from '../sim/worldTime'
import { drawQuadruped } from './creatures/quadruped'
import { drawSea } from './creatures/sea'
import { Particles } from './effects'
import {
  SAND_TOP,
  WATER_TOP,
  WORLD_H,
  landRect,
  makeLayout,
  perspective,
  pondRect,
  type Layout,
} from './layout'
import { WeatherFx, drawBackground, drawDarkness, drawWaves } from './scene'

export interface FrameInfo {
  nowMs: number
  hour: number
  weather: Weather
  /** 頭上有禮物的寵物 id */
  gifts: string[]
}

export type Hit = { kind: 'pet' | 'gift'; id: string }

const TAU = Math.PI * 2

/** 場景引擎：不依賴 React，負責所有生物的行為更新與繪製 */
export class FarmEngine {
  layout: Layout = makeLayout(1600, 900)
  entities = new Map<string, Entity>()
  private fx = new Particles()
  private weatherFx = new WeatherFx()
  private pellets: Pellet[] = []
  private nextPellet = 1
  private time = 0
  private ambient = 0
  private floatStack = new Map<string, { n: number; t: number }>()
  private giftPos = new Map<string, { x: number; y: number }>()
  /** 上一次繪製的順序（最後畫的在最上層），點擊判定用 */
  private order: Entity[] = []
  private rand: () => number = Math.random

  setSize(cssW: number, cssH: number): void {
    this.layout = makeLayout(cssW, cssH)
  }

  private env(night: boolean, sunny: boolean): Env {
    return {
      layout: this.layout,
      land: landRect(this.layout),
      pond: pondRect(this.layout),
      night,
      sunny,
      pellets: this.pellets,
      removePellet: (id) => {
        this.pellets = this.pellets.filter((p) => p.id !== id)
      },
      fx: this.fx,
      rand: this.rand,
    }
  }

  /** 讓場景上的生物與存檔裡的寵物一致（新增、移除、外觀更新） */
  sync(pets: Pet[], nowMs: number): void {
    const ids = new Set(pets.map((p) => p.id))
    for (const id of [...this.entities.keys()]) if (!ids.has(id)) this.entities.delete(id)
    for (const pet of pets) {
      const e = this.entities.get(pet.id)
      if (e) refreshAppearance(e, pet, nowMs, this.layout)
      else this.entities.set(pet.id, createEntity(pet, nowMs, this.layout, this.rand))
    }
  }

  applyEffects(effects: FarmEffect[], night: boolean): void {
    for (const fx of effects) {
      if (fx.kind === 'float') {
        const e = this.entities.get(fx.petId)
        if (!e) continue
        const st = this.floatStack.get(fx.petId)
        const n = st && this.time - st.t < 1.2 ? st.n + 1 : 0
        this.floatStack.set(fx.petId, { n, t: this.time })
        const persp = e.def.domain === 'land' ? perspective(e.y) : 1
        const top = e.def.domain === 'land' ? 78 * e.sizeK * persp : bodyHalf(e).hh + 20
        this.fx.add({
          kind: 'text', x: e.x, y: e.y - top - n * 22, vy: -26, life: 1.9, size: 20,
          text: fx.text, color: fx.tone === 'good' ? '#9dff9d' : '#ffb0a0',
        })
      } else if (fx.kind === 'anim') {
        const e = this.entities.get(fx.petId)
        if (e) startAnim(e, fx.anim === 'pet' && e.def.domain === 'sea' ? 'pet' : fx.anim, this.env(night, false))
      } else if (fx.kind === 'pond') {
        const pond = pondRect(this.layout)
        if (fx.anim === 'feed') {
          for (let i = 0; i < 14; i++) {
            this.pellets.push({
              id: this.nextPellet++,
              x: pond.x0 + 30 + this.rand() * (pond.x1 - pond.x0 - 60),
              y: WATER_TOP - 40 - this.rand() * 90,
              vy: 40 + this.rand() * 18,
              rest: 3,
              sway: this.rand() * 6,
            })
          }
        } else {
          for (let i = 0; i < 70; i++) {
            this.fx.add({
              kind: 'sparkle',
              x: pond.x0 + this.rand() * (pond.x1 - pond.x0),
              y: WATER_TOP + this.rand() * (SAND_TOP - WATER_TOP),
              vy: -10 - this.rand() * 20, life: 0.8 + this.rand() * 1.2, size: 10 + this.rand() * 10, color: '#e9fbff',
            })
          }
        }
      }
    }
  }

  update(dt: number, f: FrameInfo): void {
    this.time += dt
    const night = isNight(f.hour)
    const sunny = !night && f.weather !== 'rain' && f.weather !== 'snow' && f.hour > 8 && f.hour < 17
    const env = this.env(night, sunny)

    for (const e of this.entities.values()) {
      e.sleeping = isSleeping(e.pet, f.hour, f.nowMs)
      updateEntity(e, dt, env)
    }

    // 飼料下沉，沉到沙地後過幾秒消失
    for (const p of this.pellets) {
      if (p.y < SAND_TOP - 4) {
        p.y += p.vy * dt
        p.x += Math.sin(this.time * 2 + p.sway) * 8 * dt
      } else p.rest -= dt
    }
    this.pellets = this.pellets.filter((p) => p.rest > 0)

    // 池塘裡偶爾冒出小氣泡
    this.ambient -= dt
    if (this.ambient <= 0) {
      this.ambient = 0.5 + this.rand() * 1.2
      const pond = pondRect(this.layout)
      this.fx.add({
        kind: 'bubble', x: pond.x0 + this.rand() * (pond.x1 - pond.x0), y: SAND_TOP,
        vx: (this.rand() - 0.5) * 8, vy: -(26 + this.rand() * 24), life: 14, size: 2 + this.rand() * 4,
      })
    }
    this.fx.update(dt)
    this.weatherFx.update(dt, this.layout, f.weather, this.rand)
  }

  render(ctx: CanvasRenderingContext2D, dpr: number, f: FrameInfo): void {
    const l = this.layout
    ctx.setTransform(dpr * l.s, 0, 0, dpr * l.s, 0, 0)
    ctx.clearRect(0, 0, l.Wl, WORLD_H)

    const sea = [...this.entities.values()].filter((e) => e.def.domain === 'sea')
    const seaPets = sea.map((e) => e.pet.cleanliness)
    const pondClean = seaPets.length ? seaPets.reduce((a, b) => a + b, 0) / seaPets.length : 90
    const dark = drawBackground(ctx, l, { hour: f.hour, weather: f.weather, time: this.time, pondClean })

    // 池塘生物：大的先畫，小的在前面
    sea.sort((a, b) => b.def.length * b.sizeK - a.def.length * a.sizeK)
    for (const e of sea) drawSea(ctx, e)
    for (const p of this.pellets) {
      ctx.fillStyle = '#b8793a'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4.2, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#d99a58'
      ctx.beginPath()
      ctx.arc(p.x - 1, p.y - 1, 1.8, 0, TAU)
      ctx.fill()
    }

    // 陸地生物：越下面越近，後畫
    const land = [...this.entities.values()].filter((e) => e.def.domain === 'land').sort((a, b) => a.y - b.y)
    for (const e of land) {
      const persp = perspective(e.y)
      const coat = coatOf(e.pet.species, e.pet.coat)
      if (e.anim?.kind === 'eat') this.drawBowl(ctx, e, persp)
      drawQuadruped(ctx, e, coat?.colors ?? {}, persp)
      if (e.anim?.kind === 'bath') this.drawFoam(ctx, e, persp)
    }
    this.order = [...sea, ...land]

    this.fx.draw(ctx, WATER_TOP, 'world')
    drawWaves(ctx, l, { hour: f.hour, weather: f.weather, time: this.time, pondClean })
    this.weatherFx.draw(ctx, f.weather)
    drawDarkness(ctx, l, dark)

    // 頭上的提示泡泡與禮物（在暗色之上，保持清楚）
    this.giftPos.clear()
    for (const e of this.order) this.drawBubbles(ctx, e, f)
    this.fx.draw(ctx, WATER_TOP, 'text')
  }

  private drawBowl(ctx: CanvasRenderingContext2D, e: Entity, persp: number): void {
    const k = e.sizeK * persp
    const x = e.x + e.facing * 44 * k
    ctx.save()
    ctx.translate(x, e.y + 2)
    ctx.scale(k, k)
    ctx.fillStyle = 'rgba(0,0,0,0.16)'
    ctx.beginPath()
    ctx.ellipse(0, 4, 22, 6, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#e8665a'
    ctx.beginPath()
    ctx.ellipse(0, -4, 20, 9, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#c4a46a'
    ctx.beginPath()
    ctx.ellipse(0, -8, 15, 6, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#8b5a2b'
    for (const dx of [-7, 0, 7]) {
      ctx.beginPath()
      ctx.arc(dx, -10, 3.4, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawFoam(ctx: CanvasRenderingContext2D, e: Entity, persp: number): void {
    const k = e.sizeK * persp
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + this.time * 0.6
      const x = e.x + Math.cos(a) * 30 * k + Math.sin(this.time * 3 + i) * 3
      const y = e.y - (38 + Math.sin(a * 1.7) * 16) * k
      const r = (9 + (i % 3) * 3) * k * (0.9 + Math.sin(this.time * 4 + i) * 0.1)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(180,225,255,0.5)'
      ctx.beginPath()
      ctx.arc(x + r * 0.2, y + r * 0.25, r * 0.55, 0, TAU)
      ctx.fill()
    }
  }

  private headPos(e: Entity): { x: number; y: number } {
    if (e.def.domain === 'land') {
      const persp = perspective(e.y)
      return { x: e.x, y: e.y - 92 * e.sizeK * persp }
    }
    const { hh } = bodyHalf(e)
    if (e.pet.species === 'clownfish') {
      const top = Math.min(...e.school.map((s) => s.y))
      return { x: e.x, y: top - 30 }
    }
    return { x: e.x, y: Math.max(WATER_TOP - 6, e.y - hh - 34) }
  }

  private drawBubbles(ctx: CanvasRenderingContext2D, e: Entity, f: FrameInfo): void {
    const head = this.headPos(e)
    const bob = Math.sin(this.time * 3 + e.t) * 3
    let y = head.y + bob
    const notices = e.sleeping ? [] : lowStatNotices(e.pet)
    if (notices.length) {
      const n = notices[Math.floor(this.time / 2.5) % notices.length]
      const text = `${n.emoji} ${n.text}`
      ctx.font = 'bold 20px sans-serif'
      const w = ctx.measureText(text).width + 24
      const x = head.x
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(x - w / 2, y - 32, w, 34, 17)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.beginPath()
      ctx.moveTo(x - 6, y + 1)
      ctx.lineTo(x + 6, y + 1)
      ctx.lineTo(x, y + 10)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#4a3a3a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, x, y - 14)
      y -= 44
    }
    if (f.gifts.includes(e.id)) {
      const gy = y - 20 + Math.sin(this.time * 4) * 3
      const pulse = 1 + Math.sin(this.time * 6) * 0.08
      ctx.save()
      ctx.translate(head.x, gy)
      ctx.scale(pulse, pulse)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.strokeStyle = '#ffc94d'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(0, 0, 21, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.font = '26px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🎁', 0, 2)
      ctx.restore()
      this.giftPos.set(e.id, { x: head.x, y: gy })
    }
  }

  /** 螢幕座標（相對畫布左上角）轉邏輯座標後做點擊判定：禮物優先，其次最上層的寵物 */
  hitTest(px: number, py: number): Hit | null {
    const x = px / this.layout.s
    const y = py / this.layout.s
    for (const [id, p] of this.giftPos) {
      if (Math.hypot(p.x - x, p.y - y) < 28) return { kind: 'gift', id }
    }
    for (let i = this.order.length - 1; i >= 0; i--) {
      const e = this.order[i]
      if (e.def.domain === 'land') {
        const k = e.sizeK * perspective(e.y)
        const cx = e.x
        const cy = e.y - 38 * k
        if (((x - cx) / (56 * k)) ** 2 + ((y - cy) / (52 * k)) ** 2 <= 1) return { kind: 'pet', id: e.id }
      } else if (e.pet.species === 'clownfish') {
        if (e.school.some((s) => Math.hypot(s.x - x, s.y - y) < 30)) return { kind: 'pet', id: e.id }
      } else {
        const { hw, hh } = bodyHalf(e)
        if (((x - e.x) / (hw * 1.05)) ** 2 + ((y - e.y) / (hh * 1.5)) ** 2 <= 1) return { kind: 'pet', id: e.id }
      }
    }
    return null
  }
}
