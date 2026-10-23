import type { Pet } from '../save/types'
import type { FarmEffect } from '../sim/commands'
import { isSleeping } from '../sim/rules'
import { lowStatNotices } from '../sim/stats'
import type { Weather } from '../sim/worldTime'
import { assets, drawSprite, type Sprite } from './assets'
import {
  DOOR, HOUSE_H, HOUSE_W, computeLayout, doorRect, fromCss, sceneObjects, toCss, type Layout,
} from './layout'
import {
  clampActor, computeSeparation, createActor, frameKeyOf, triggerAnim, updateActor, type Actor, type BehaviorEnv,
} from './pets'
import {
  drawClouds, drawCelestial, drawDarkness, drawDrops, drawFar, drawGlow, drawGrass, drawPath, drawSky, drawStars,
  makeDrops, updateDrops, type Drop,
} from './scene'

export interface FrameInfo {
  nowMs: number
  hour: number
  weather: Weather
  /** 頭上有禮物的寵物 id */
  gifts: string[]
}

export type Hit = { kind: 'pet' | 'gift'; id: string } | { kind: 'door' }

interface Particle {
  key: string
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
}

interface Float {
  x: number
  y: number
  text: string
  tone: 'good' | 'bad'
  t: number
}

/** 場景引擎：不依賴 React，負責寵物行為更新與像素繪製（邏輯像素座標，整數倍放大） */
export class PixelEngine {
  layout: Layout = computeLayout(1280, 692, 1)
  actors = new Map<string, Actor>()
  selectedId: string | null = null
  /** 滑鼠在住家的門上 */
  doorHover = false
  time = 0
  private particles: Particle[] = []
  private floats: Float[] = []
  private drops: Drop[] = []
  private giftT = 0
  private lastFrame: FrameInfo = { nowMs: Date.now(), hour: 12, weather: 'sunny', gifts: [] }
  rand: () => number = Math.random

  /** 設定畫布大小（裝置像素）；既有寵物依新範圍夾回 */
  setSize(backW: number, backH: number, dpr: number): void {
    this.layout = computeLayout(Math.max(1, backW), Math.max(1, backH), dpr)
    for (const a of this.actors.values()) clampActor(a, this.layout)
  }

  /** 讓場景上的寵物與存檔裡的寵物一致（新增、移除、資料更新） */
  sync(pets: Pet[]): void {
    const ids = new Set(pets.map((p) => p.id))
    for (const id of [...this.actors.keys()]) if (!ids.has(id)) this.actors.delete(id)
    for (const pet of pets) {
      const a = this.actors.get(pet.id)
      if (a) a.pet = pet
      else this.actors.set(pet.id, createActor(pet, this.layout, this.rand))
    }
    if (this.selectedId && !this.actors.has(this.selectedId)) this.selectedId = null
  }

  applyEffects(effects: FarmEffect[]): void {
    for (const fx of effects) {
      const a = this.actors.get(fx.petId)
      if (!a) continue
      if (fx.kind === 'float') {
        const n = this.floats.filter((f) => f.t < 0.5 && Math.abs(f.x - a.x) < 6).length
        this.floats.push({ x: a.x, y: a.y - 34 - n * 9, text: fx.text, tone: fx.tone, t: 0 })
      } else triggerAnim(a, fx.anim, this.rand)
    }
  }

  private emit = (kind: 'heart' | 'bubble' | 'note', x: number, y: number): void => {
    const key = kind === 'heart' ? 'fx_heart' : kind === 'bubble' ? 'fx_bubble' : 'fx_note'
    this.particles.push({ key, x, y, vx: (this.rand() - 0.5) * 8, vy: -(10 + this.rand() * 10), life: 0, max: 1.1 + this.rand() * 0.5 })
  }

  update(dt: number, f: FrameInfo): void {
    this.time += dt
    this.lastFrame = f
    const list = [...this.actors.values()]
    computeSeparation(list)
    const env: BehaviorEnv = {
      layout: this.layout, nowMs: f.nowMs, hour: f.hour, rand: this.rand, selectedId: this.selectedId, others: list, emit: this.emit,
    }
    for (const a of list) updateActor(a, dt, env)
    // 粒子與浮字
    for (const p of this.particles) {
      p.life += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    this.particles = this.particles.filter((p) => p.life < p.max)
    for (const fl of this.floats) fl.t += dt
    this.floats = this.floats.filter((fl) => fl.t < 1.9)
    // 天氣粒子
    this.drops = makeDrops(this.layout, f.weather, this.drops)
    updateDrops(this.drops, this.layout, f.weather, dt)
    this.giftT += dt
  }

  // ---------------------------------------------------------------------
  // 繪製
  // ---------------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D): void {
    const L = this.layout
    const f = this.lastFrame
    if (!assets.ready) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, L.backW, L.backH)
    ctx.setTransform(L.S, 0, 0, L.S, 0, L.offsetY)

    const night = this.isHouseLit(f.hour)
    drawSky(ctx, L, f.hour, f.weather)
    drawStars(ctx, L, f.hour, this.time)
    drawCelestial(ctx, L, f.hour, f.weather)
    drawClouds(ctx, L, f.weather, this.time, 0)
    drawFar(ctx, L)
    drawGrass(ctx, L)
    drawPath(ctx, L)

    // 物件與寵物依「腳底 y」排前後
    type Item = { y: number; draw: () => void }
    const items: Item[] = []
    const houseKey = night ? 'house_night' : this.doorHover ? 'house_open' : 'house_closed'
    items.push({
      y: L.house.baseY,
      draw: () => {
        const s = assets.get(houseKey)
        if (s) drawSprite(ctx, s, L.house.x0 + s.ax, L.house.baseY)
      },
    })
    for (const o of sceneObjects(L)) {
      const s = assets.get(o.key)
      if (s) items.push({ y: o.y, draw: () => drawSprite(ctx, s, o.x, o.y) })
    }
    for (const a of this.actors.values()) items.push({ y: a.y, draw: () => this.drawActor(ctx, a, f) })
    items.sort((p, q) => p.y - q.y)
    for (const it of items) it.draw()

    // 粒子（愛心、泡泡、音符）
    for (const p of this.particles) {
      const s = assets.get(p.key)
      if (!s) continue
      ctx.globalAlpha = Math.max(0, Math.min(1, (p.max - p.life) / 0.4))
      drawSprite(ctx, s, p.x, p.y)
    }
    ctx.globalAlpha = 1

    // 天氣
    if (f.weather === 'rain' || f.weather === 'snow') drawDrops(ctx, this.drops, f.weather)

    // 夜晚：暗色疊層，之後再畫路燈光暈與窗戶的光
    const dark = drawDarkness(ctx, L, f.hour, f.weather)
    const glow = Math.min(1, Math.max(0, (dark - 0.18) / 0.3))
    if (glow > 0) {
      const lamp = sceneObjects(L).find((o) => o.key === 'lamp')
      if (lamp) drawGlow(ctx, lamp.x, lamp.y - 62, glow)
    }

    // 禮物與浮字（在暗色疊層之上，保持清楚）
    for (const id of f.gifts) {
      const a = this.actors.get(id)
      if (!a) continue
      const p = this.giftPos(a)
      this.drawGift(ctx, p.x, p.y)
    }
    for (const fl of this.floats) {
      ctx.font = 'bold 9px "Courier New", monospace'
      ctx.textAlign = 'center'
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, fl.t - 1.3) / 0.6)
      ctx.fillStyle = '#000'
      ctx.fillText(fl.text, Math.round(fl.x) + 1, Math.round(fl.y - fl.t * 12) + 1)
      ctx.fillStyle = fl.tone === 'good' ? '#9dff9d' : '#ffb0a0'
      ctx.fillText(fl.text, Math.round(fl.x), Math.round(fl.y - fl.t * 12))
    }
    ctx.globalAlpha = 1
  }

  /** 夜晚（暗到需要亮燈）：住家換成亮燈版 */
  isHouseLit(hour: number): boolean {
    const h = ((hour % 24) + 24) % 24
    return h >= 19.5 || h < 5.5
  }

  private actorSprite(a: Actor): Sprite | null {
    return assets.get(frameKeyOf(a)) ?? assets.get(`${a.pet.species === 'dog' ? 'dog_shiba' : 'cat_orange'}_stand`)
  }

  private hopOffset(a: Actor): number {
    return a.hop > 0 ? Math.round(Math.sin((1 - a.hop / 0.4) * Math.PI) * 4) : 0
  }

  private giftPos(a: Actor): { x: number; y: number } {
    const s = this.actorSprite(a)
    return { x: a.x, y: a.y - (s?.h ?? 40) - 16 + Math.round(Math.sin(this.giftT * 4) * 1.5) }
  }

  private drawGift(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const px = Math.round(x) - 5
    const py = Math.round(y) - 5
    ctx.fillStyle = '#000'
    ctx.fillRect(px - 1, py - 1, 12, 12)
    ctx.fillStyle = '#e8453c'
    ctx.fillRect(px, py, 10, 10)
    ctx.fillStyle = '#ffd34d'
    ctx.fillRect(px + 4, py, 2, 10)
    ctx.fillRect(px, py + 4, 10, 2)
    ctx.fillRect(px + 2, py - 2, 2, 2)
    ctx.fillRect(px + 6, py - 2, 2, 2)
  }

  private drawActor(ctx: CanvasRenderingContext2D, a: Actor, f: FrameInfo): void {
    const s = this.actorSprite(a)
    if (!s) return
    const hop = this.hopOffset(a)
    // 腳下小陰影
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    const sw = Math.round(s.w * 0.55)
    ctx.fillRect(Math.round(a.x) - Math.round(sw / 2), Math.round(a.y) - 1, sw, 2)
    drawSprite(ctx, s, a.x, a.y - hop, a.facing === -1)
    // 頭上的狀態圖示（餓＝驚嘆號、心情低＝汗滴、髒＝泡泡、睡覺＝ZZZ、開心＝愛心）
    const key = this.statusIcon(a, f)
    if (key) {
      const ic = assets.get(key)
      if (ic) drawSprite(ctx, ic, a.x, a.y - s.h - 3 - hop + Math.round(Math.sin(this.time * 3 + a.animT) * 1))
    }
    // 選取中：腳下一圈小標記
    if (this.selectedId === a.id) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      const w = Math.round(s.w * 0.7)
      ctx.fillRect(Math.round(a.x) - Math.round(w / 2), Math.round(a.y) + 2, w, 1)
    }
  }

  statusIcon(a: Actor, f: FrameInfo): string | null {
    if (isSleeping(a.pet, f.hour, f.nowMs)) return 'fx_zzz'
    if (a.override?.tag === 'eat') return null
    const n = lowStatNotices(a.pet)
    if (n.length) return n[Math.floor(this.time / 2.5) % n.length].icon === 'exclaim' ? 'fx_exclaim' : n[Math.floor(this.time / 2.5) % n.length].icon === 'sweat' ? 'fx_sweat' : 'fx_bubble'
    if (a.action === 'happy' || a.override?.tag === 'pet' || (a.pet.mood >= 92 && Math.floor(this.time / 3) % 3 === 0)) return 'fx_heart'
    return null
  }

  // ---------------------------------------------------------------------
  // 座標與點擊
  // ---------------------------------------------------------------------

  /** 邏輯座標 → 疊在畫布上的 DOM 用的 CSS 座標 */
  cssOf(x: number, y: number): { x: number; y: number } {
    return toCss(this.layout, x, y)
  }

  /** 寵物頭頂的位置（氣泡選單的錨點，邏輯座標） */
  headOf(id: string): { x: number; y: number } | null {
    const a = this.actors.get(id)
    if (!a) return null
    const s = this.actorSprite(a)
    return { x: a.x, y: a.y - (s?.h ?? 40) - this.hopOffset(a) }
  }

  /** 住家門的位置（CSS 座標，疊門牌用） */
  doorCss(): { x0: number; y0: number; x1: number; y1: number } {
    const d = doorRect(this.layout)
    const a = toCss(this.layout, d.x0, d.y0)
    const b = toCss(this.layout, d.x1, d.y1)
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }
  }

  petAt(lx: number, ly: number): Actor | null {
    // 後畫的在上層（y 大的在前）
    const list = [...this.actors.values()].sort((p, q) => q.y - p.y)
    for (const a of list) {
      const s = this.actorSprite(a)
      if (!s) continue
      const hop = this.hopOffset(a)
      const x0 = a.x - s.ax
      const y0 = a.y - hop - s.ay
      if (lx >= x0 && lx < x0 + s.w && ly >= y0 && ly < y0 + s.h) return a
    }
    return null
  }

  hitTest(cssX: number, cssY: number): Hit | null {
    const { x, y } = fromCss(this.layout, cssX, cssY)
    for (const id of this.lastFrame.gifts) {
      const a = this.actors.get(id)
      if (!a) continue
      const p = this.giftPos(a)
      if (Math.abs(p.x - x) < 8 && Math.abs(p.y - y) < 8) return { kind: 'gift', id }
    }
    const a = this.petAt(x, y)
    if (a) return { kind: 'pet', id: a.id }
    return null
  }

  /** 滑鼠移動：寵物稍微看向滑鼠並輕輕跳一下；回傳目前在哪隻寵物上 */
  pointerMove(cssX: number, cssY: number): string | null {
    const { x, y } = fromCss(this.layout, cssX, cssY)
    const a = this.petAt(x, y)
    for (const o of this.actors.values()) {
      if (o.hovered && o !== a) o.hovered = false
    }
    if (a && !a.hovered) {
      a.hovered = true
      if (a.action !== 'sleep' && this.selectedId !== a.id) {
        a.hop = 0.4
        if (a.action === 'idle' || a.action === 'sit') a.facing = x < a.x ? -1 : 1
      }
    }
    return a?.id ?? null
  }

  houseSize(): { w: number; h: number } {
    return { w: HOUSE_W, h: HOUSE_H }
  }

  doorFractions(): typeof DOOR {
    return DOOR
  }
}
