import type { Pet } from '../save/types'
import type { FarmEffect } from '../sim/commands'
import { isSleeping } from '../sim/rules'
import { lowStatNotices } from '../sim/stats'
import type { Weather } from '../sim/worldTime'
import { assets, drawSprite, type Sprite } from './assets'
import { drawClock } from './clock'
import {
  DOOR, HOUSE_H, HOUSE_W, TOWER_DOOR, TOWER_H, TOWER_W, computeLayout, doorRect, fromCss, inWater, nearestWalkable, pondPos, sceneObjects,
  toCss, towerBase, towerDoorRect, towerSignCenter, towerTopLeft, towerX, waterEllipse, type Layout,
} from './layout'
import {
  beginBathWalk, cancelBath, clampActor, computeSeparation, createActor, dropKind, enterPond, frameKeyOf, isBathing, triggerAnim,
  updateActor, usesPond, type Actor, type BehaviorEnv,
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

/** 引擎對外的連接點：扣點洗澡、叫醒、提示訊息（由畫面層接到 store 與 toast） */
export interface EngineHooks {
  /** 申請洗澡（扣 1 點、更新數值）；回傳 null 成功，否則失敗原因 */
  requestBath: (petId: string) => string | null
  /** 睡覺中的寵物被拖起來 */
  wake: (petId: string) => void
  notify: (message: string) => void
}

/** 放開拖曳的結果 */
export type DropResult = { kind: 'bath' } | { kind: 'land' } | { kind: 'return'; error?: string }

/** 水花、漣漪等短動畫 */
interface Anim {
  frames: string[]
  x: number
  y: number
  t: number
  dur: number
}

interface Particle {
  key: string
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  /** 重力（像素／秒²），水滴用 */
  g?: number
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
  /** 滑鼠在鐘樓的門上 */
  towerHover = false
  hooks: EngineHooks = { requestBath: () => null, wake: () => {}, notify: () => {} }
  private anims: Anim[] = []
  private dragOff = { dx: 0, dy: 0 }
  private draggingId: string | null = null
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
      // 洗澡的動畫由水池流程自己演（跳進去、泡澡、爬出來），這裡只顯示數值浮字
      if (fx.kind === 'anim' && fx.anim === 'bath') continue
      if (fx.kind === 'float') {
        const n = this.floats.filter((f) => f.t < 0.5 && Math.abs(f.x - a.x) < 6).length
        this.floats.push({ x: a.x, y: a.y - 34 - n * 9, text: fx.text, tone: fx.tone, t: 0 })
      } else triggerAnim(a, fx.anim, this.rand)
    }
  }

  private emit = (kind: 'heart' | 'bubble' | 'note' | 'wbubble' | 'drop', x: number, y: number): void => {
    if (kind === 'wbubble') {
      this.particles.push({ key: this.rand() < 0.6 ? 'water_bubble_s' : 'water_bubble_l', x, y, vx: (this.rand() - 0.5) * 6, vy: -(9 + this.rand() * 7), life: 0, max: 1.3 + this.rand() * 0.5 })
      return
    }
    if (kind === 'drop') {
      this.particles.push({ key: 'water_drop_' + (1 + Math.floor(this.rand() * 3)), x, y, vx: (this.rand() - 0.5) * 46, vy: -(18 + this.rand() * 22), life: 0, max: 0.75, g: 130 })
      return
    }
    const key = kind === 'heart' ? 'fx_heart' : kind === 'bubble' ? 'fx_bubble' : 'fx_note'
    this.particles.push({ key, x, y, vx: (this.rand() - 0.5) * 8, vy: -(10 + this.rand() * 10), life: 0, max: 1.1 + this.rand() * 0.5 })
  }

  /** 水花（3 幀）加漣漪（3 幀）：x、y 是水面線上的位置 */
  private fx = (kind: 'splash' | 'ripple', x: number, y: number): void => {
    if (kind === 'splash') {
      this.anims.push({ frames: ['water_splash_1', 'water_splash_2', 'water_splash_3'], x, y, t: 0, dur: 0.54 })
      this.anims.push({ frames: ['water_ripple_1', 'water_ripple_2', 'water_ripple_3'], x, y: y + 1, t: -0.18, dur: 0.7 })
    } else this.anims.push({ frames: ['water_ripple_1', 'water_ripple_2', 'water_ripple_3'], x, y, t: 0, dur: 0.7 })
  }

  /** 有誰正在占用水池（跳進去、泡澡、爬出來）；except = 不算這一隻 */
  pondBusy(except?: Actor): boolean {
    for (const a of this.actors.values()) if (a !== except && usesPond(a)) return true
    return false
  }

  private requestBath = (a: Actor): string | null => {
    if (this.pondBusy(a)) return '水池使用中'
    return this.hooks.requestBath(a.id)
  }

  update(dt: number, f: FrameInfo): void {
    this.time += dt
    this.lastFrame = f
    const list = [...this.actors.values()]
    // 被拖著、飛回去、洗澡中的寵物不參與避讓（也不會被別人推開）
    const free = list.filter((a) => !a.drag && !a.fly && !a.bath)
    for (const a of list) if (!free.includes(a)) a.sepX = a.sepY = 0
    computeSeparation(free)
    const env: BehaviorEnv = {
      layout: this.layout, nowMs: f.nowMs, hour: f.hour, rand: this.rand, selectedId: this.selectedId, others: list, emit: this.emit,
      fx: this.fx, requestBath: this.requestBath, notify: (m) => this.hooks.notify(m),
    }
    for (const a of list) updateActor(a, dt, env)
    for (const an of this.anims) an.t += dt
    this.anims = this.anims.filter((an) => an.t < an.dur)
    // 粒子與浮字
    for (const p of this.particles) {
      p.life += dt
      if (p.g) p.vy += p.g * dt
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
    const pond = pondPos(L)
    for (const o of sceneObjects(L)) {
      if (o.key === 'pond') {
        // 水池：2 幀水面閃動（約每 0.5 秒換一幀）；泡澡中的寵物畫在水池上面（下半身被水面遮住）
        items.push({ y: o.y, draw: () => this.drawPond(ctx, o.x, o.y, f) })
        continue
      }
      const key = o.key === 'clocktower' && this.towerHover ? 'clocktower_open' : o.key
      const s = assets.get(key)
      if (!s) continue
      items.push({
        y: o.y,
        draw: () => {
          drawSprite(ctx, s, o.x, o.y)
        },
      })
    }
    for (const a of this.actors.values()) {
      if (a.bath?.phase === 'soak') continue // 由水池一起畫
      // 跳進水池、爬出水池的過程要畫在水池前面；被拖著的畫在最上層
      const y = a.drag ? 1e6 : a.bath && (a.bath.phase === 'jump' || a.bath.phase === 'climb') ? Math.max(a.y, pond.y + 0.5) : a.y
      items.push({ y, draw: () => this.drawActor(ctx, a, f) })
    }
    items.sort((p, q) => p.y - q.y)
    for (const it of items) it.draw()

    // 水花與漣漪
    for (const an of this.anims) {
      if (an.t < 0) continue
      const k = an.t / an.dur
      const s = assets.get(an.frames[Math.min(an.frames.length - 1, Math.floor(k * an.frames.length))])
      if (!s) continue
      ctx.globalAlpha = k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1
      drawSprite(ctx, s, an.x, an.y)
    }
    ctx.globalAlpha = 1
    // 拖曳中：寵物在水面上時，水面冒出一圈漣漪當提示
    const dragged = this.draggingId ? this.actors.get(this.draggingId) : undefined
    if (dragged && inWater(L, dragged.x, dragged.y, 1.12)) {
      const w = waterEllipse(L)
      const rs = assets.get(['water_ripple_2', 'water_ripple_3'][Math.floor(this.time * 3) % 2])
      if (rs) drawSprite(ctx, rs, w.cx, w.cy + 6)
    }

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

    // 夜晚：暗色疊層，之後再畫鐘面、路燈光暈
    const dark = drawDarkness(ctx, L, f.hour, f.weather)
    // 鐘面完全由程式畫，疊在鐘樓上、蓋過原圖那個小鐘面；畫在暗色疊層之後，夜晚也清楚可讀
    const tower = assets.get(this.towerHover ? 'clocktower_open' : 'clocktower')
    const face = tower?.meta?.clock
    if (tower && face) drawClock(ctx, towerX(L) - tower.ax + face.cx, towerBase(L) - tower.ay + face.cy, f.hour)
    // 夜晚開門版：門縫裡的暖光不被暗色蓋掉（把門的範圍用原本的亮度再畫一次）
    if (this.towerHover && dark > 0.04 && tower) {
      const tl = towerTopLeft(L)
      const sx0 = Math.floor(TOWER_DOOR.x0 * TOWER_W) - 2
      const sx1 = Math.ceil(TOWER_DOOR.x1 * TOWER_W) + 2
      const sy0 = Math.floor(TOWER_DOOR.y0 * TOWER_H)
      const sy1 = Math.ceil(TOWER_DOOR.y1 * TOWER_H)
      ctx.drawImage(tower.img, tower.x + sx0, tower.y + sy0, sx1 - sx0, sy1 - sy0, tl.x + sx0, tl.y + sy0, sx1 - sx0, sy1 - sy0)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = 'rgba(255,190,90,0.10)'
      ctx.fillRect(tl.x + sx0 - 2, tl.y + sy0 - 2, sx1 - sx0 + 4, sy1 - sy0 + 4)
      ctx.restore()
    }
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

  /** 水池本體＋泡澡中的寵物（用水面橢圓裁切，只露出水面以上）＋漣漪 */
  private drawPond(ctx: CanvasRenderingContext2D, x: number, y: number, f: FrameInfo): void {
    const s = assets.get(Math.floor(this.time / 0.5) % 2 === 0 ? 'pond_a' : 'pond_b')
    if (!s) return
    drawSprite(ctx, s, x, y)
    const w = waterEllipse(this.layout)
    const line = w.cy + 6 // 水面線
    for (const a of this.actors.values()) {
      if (a.bath?.phase !== 'soak') continue
      const sp = this.actorSprite(a)
      if (!sp) continue
      // 裁切範圍：水面橢圓寬度內、水面線以上（程式裁切，不旋轉、不縮放）
      ctx.save()
      ctx.beginPath()
      ctx.rect(w.cx - w.rx, line - 90, w.rx * 2, 90)
      ctx.clip()
      drawSprite(ctx, sp, a.x + a.shakeX, line + Math.round(sp.h * 0.42), a.facing === -1)
      ctx.restore()
      // 漣漪：兩圈錯開，繞著寵物身體
      const k = Math.floor(this.time * 2.5)
      for (const i of [0, 1]) {
        const r = assets.get('water_ripple_' + (((k + i * 2) % 3) + 1))
        if (r) {
          ctx.globalAlpha = i === 0 ? 0.95 : 0.7
          drawSprite(ctx, r, w.cx, line + 1 + i)
        }
      }
      ctx.globalAlpha = 1
      void f
    }
  }

  /** 落地彈跳的高度（邏輯像素）：落地後衰減的小彈跳 */
  private bounceOffset(a: Actor): number {
    if (a.bounceT <= 0) return 0
    const k = 1 - a.bounceT / 0.5
    return Math.round(6 * (1 - k) * Math.abs(Math.sin(k * Math.PI * 2.5)))
  }

  private actorSprite(a: Actor): Sprite | null {
    return assets.get(frameKeyOf(a)) ?? assets.get(`${a.pet.species === 'dog' ? 'dog_shiba' : 'cat_orange'}_stand`)
  }

  private hopOffset(a: Actor): number {
    const hop = a.hop > 0 ? Math.round(Math.sin((1 - a.hop / 0.4) * Math.PI) * 4) : 0
    return hop + Math.round(a.lift) + this.bounceOffset(a)
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
    // 腳下小陰影（抬高時影子留在地面、變小一點）
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    const sw = Math.max(4, Math.round(s.w * 0.55 * (1 - Math.min(0.3, a.lift / 40))))
    ctx.fillRect(Math.round(a.x) - Math.round(sw / 2), Math.round(a.y) - 1, sw, 2)
    drawSprite(ctx, s, a.x + a.shakeX, a.y - hop, a.facing === -1)
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
    // 後畫的在上層（y 大的在前）。洗澡中（跳進去、泡澡、爬出來、甩水）的不能操作
    const list = [...this.actors.values()].filter((a) => !isBathing(a)).sort((p, q) => q.y - p.y)
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

  /** 鐘樓的門（CSS 座標）：滑鼠移上去開門 */
  towerDoorCss(): { x0: number; y0: number; x1: number; y1: number } {
    const d = towerDoorRect(this.layout)
    const a = toCss(this.layout, d.x0, d.y0)
    const b = toCss(this.layout, d.x1, d.y1)
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }
  }

  /** 開門版鐘樓的招牌中心（CSS 座標）：疊上「遊戲」；scale = 1 個邏輯像素等於幾個 CSS 像素 */
  towerSignCss(): { x: number; y: number; scale: number } {
    const c = towerSignCenter(this.layout)
    const p = toCss(this.layout, c.x, c.y)
    return { x: p.x, y: p.y, scale: this.layout.S / this.layout.dpr }
  }

  // ---------------------------------------------------------------------
  // 拖曳寵物、水池洗澡
  // ---------------------------------------------------------------------

  /** 開始拖曳：寵物離地、開心姿勢；睡覺中的醒來。回傳 false = 這隻現在不能拖（洗澡中） */
  beginDrag(id: string, cssX: number, cssY: number): boolean {
    const a = this.actors.get(id)
    if (!a || isBathing(a)) return false
    cancelBath(a)
    if (isSleeping(a.pet, this.lastFrame.hour, this.lastFrame.nowMs)) this.hooks.wake(id)
    const p = fromCss(this.layout, cssX, cssY)
    this.dragOff = { dx: a.x - p.x, dy: a.y - p.y }
    this.draggingId = id
    a.drag = true
    a.fly = null
    a.override = null
    a.hovered = false
    return true
  }

  /** 拖曳中：腳底位置跟著游標（整數縮放與 devicePixelRatio 都由 fromCss 處理） */
  dragTo(cssX: number, cssY: number): void {
    const a = this.draggingId ? this.actors.get(this.draggingId) : undefined
    if (!a) return
    const p = fromCss(this.layout, cssX, cssY)
    const nx = Math.min(this.layout.W, Math.max(0, p.x + this.dragOff.dx))
    const ny = Math.min(this.layout.H, Math.max(0, p.y + this.dragOff.dy))
    if (Math.abs(nx - a.x) > 0.6) a.facing = nx > a.x ? 1 : -1
    a.x = nx
    a.y = ny
    a.tx = nx
    a.ty = ny
  }

  isDragging(): boolean {
    return this.draggingId !== null
  }

  /** 放開：落在可站的地方就落地彈跳；在水面上就洗澡；不能站的地方彈回最近的可站位置 */
  endDrag(): DropResult | null {
    const a = this.draggingId ? this.actors.get(this.draggingId) : undefined
    this.draggingId = null
    if (!a) return null
    a.drag = false
    const L = this.layout
    const kind = dropKind(L, a.x, a.y)
    const flyBack = (): void => {
      const t = nearestWalkable(L, a.x, a.y)
      a.fly = { fx: a.x, fy: a.y, tx: t.x, ty: t.y, t: 0, dur: 0.3 }
    }
    if (kind === 'water') {
      const err = this.requestBath(a)
      if (!err) {
        enterPond(a)
        return { kind: 'bath' }
      }
      this.hooks.notify(err)
      flyBack()
      return { kind: 'return', error: err }
    }
    if (kind === 'land') {
      a.tx = a.x
      a.ty = a.y
      a.bounceT = 0.5
      a.action = 'idle'
      a.t = 0
      a.dur = 1 + this.rand() * 1.2
      return { kind: 'land' }
    }
    flyBack()
    return { kind: 'return' }
  }

  /** 氣泡選單的「洗澡」：寵物自己走到水池前再跳進去。回傳 null 成功，否則原因 */
  sendToBath(id: string): string | null {
    const a = this.actors.get(id)
    if (!a) return '找不到這隻寵物'
    if (this.pondBusy(a)) return '水池使用中'
    return beginBathWalk(a, this.layout) ? null : '現在不能洗澡'
  }

  /** 走去水池的途中點擊或拖曳：取消 */
  cancelBathWalk(id: string): void {
    const a = this.actors.get(id)
    if (a) cancelBath(a)
  }

  houseSize(): { w: number; h: number } {
    return { w: HOUSE_W, h: HOUSE_H }
  }

  doorFractions(): typeof DOOR {
    return DOOR
  }
}
