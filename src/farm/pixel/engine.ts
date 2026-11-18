import type { Find, Pet, PicnicActive } from '../save/types'
import { picnicEligible } from '../sim/picnic'
import { BASKET_KEYS, FOOD_KEYS, MAT_BASKET, MAT_FOODS, MAT_KEYS, cameraRect, picnicMatRect, type PicnicSeat } from './picnic'
import type { FarmEffect } from '../sim/commands'
import { skinDef } from '../config/skins'
import type { RevealResult } from '../sim/dig'
import { BALANCE } from '../config/balance'
import { buildingDef } from '../config/buildings'
import { variantOf } from '../config/species'
import { isSleeping } from '../sim/rules'
import { lowStatNotices } from '../sim/stats'
import type { Weather } from '../sim/worldTime'
import { assets, drawSprite, type Sprite } from './assets'
import { drawClock } from './clock'
import { drawEmptyIcon } from './icons'
import {
  DOOR, HOUSE_H, HOUSE_W, KENNEL_AX, KENNEL_H, TOWER_DOOR, TOWER_H, TOWER_W, computeLayout, doorRect, fromCss, inWater, nearestWalkable, ownedSlots, pondPos, sceneObjects,
  setPlacement, toCss, towerBase, towerDoorRect, towerSignCenter, towerTopLeft, towerX, waterEllipse, type BuildingSlot, type Layout,
  boardPos, boardGreenRect, rectCss, toolHitRects, type Rect as LayoutRect, type ToolHits,
} from './layout'
import { KENNEL_DOOR_CLIP, KENNEL_DOOR_CX, KENNEL_INSIDE_BOTTOM, KENNEL_INSIDE_RIGHT, isOverflowSeat, releaseUse, seatsOf } from './buildingUse'
import {
  PLAY_OPS, assetPrefix, beginBathWalk, cancelBath, clampActor, computeSeparation, createActor, dropKind, enterPond, frameKeyOf, frameNameOf, isBathing, triggerAnim,
  updateActor, usesPond, type Actor, type BehaviorEnv,
} from './pets'
import { ballPos, beginPlay, checkThrow, endPlay, isCarrying, mouthOffset, throwBall, type PlayBall, type PlayEnd, type PlayEnv, type PlayToyId, type ThrowCheck } from './play'
import { isCarryingBundle } from './finder'
import { HoverController, type HoverEnv } from './hover'
import { PERSONALITY_ICONS } from '../config/personality'
import { findCap, findPositions, worldToFind } from './finds'
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

export type Hit = { kind: 'pet' | 'gift' | 'find'; id: string } | { kind: 'door' }

/** 引擎對外的連接點：扣點洗澡、叫醒、提示訊息（由畫面層接到 store 與 toast） */
export interface EngineHooks {
  /** 申請洗澡（扣 1 點、更新數值）；回傳 null 成功，否則失敗原因 */
  requestBath: (petId: string) => string | null
  /** 睡覺中的寵物被拖起來 */
  wake: (petId: string) => void
  notify: (message: string) => void
  /** 寵物在食盆吃一份（用掉今日份量、回復飽食度）；回傳 null 成功，否則失敗原因 */
  eatAtBowl: (petId: string) => string | null
  /** 玩耍結算（撿回次數、留下的寶物數）：心情、體重、飽食度 */
  settlePlay: (petId: string, catches: number, toy: PlayToyId) => void
  /** 挖寶、尋寶：留下一個寶物（座標是草地範圍內的相對位置）；滿了回傳 false */
  addFind: (petId: string, kind: 'mound' | 'bundle', fx: number, fy: number) => boolean
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

/**
 * 座位上的寵物的畫法（窩裡、平台上；地面座位和一般寵物一樣畫）：
 * x、y = 畫出來的腳底位置；clip = 只畫這些矩形裡的部分（窩裡的狗被門洞裁切，身體被窩的前緣與門框擋住）；
 * sortY = 前後排序用的 y（排在建築之後、建築前方的寵物之前）；iconBottom = 頭上圖示（ZZZ）的底邊。
 */
interface SeatView {
  x: number
  y: number
  clip: { x0: number; y0: number; x1: number; y1: number }[] | null
  sortY: number
  /** 頭上圖示（ZZZ）的水平中心與底邊 */
  iconX: number
  iconBottom: number
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

/**
 * render 的指定視角（拍照、非整數倍的暫存畫布用）：放大倍率、平移（裝置像素）、畫布大小；ext = 要畫的可見範圍（邏輯座標，沒給 = 只畫場景本身）
 */
export interface RenderView {
  scale: number
  offsetX?: number
  offsetY: number
  w: number
  h: number
  ext?: LayoutRect
}

import { KIND_GEOM, defaultPlacement, resolvePlacement, type Placement } from './placement'
import type { FarmLayout } from '../save/types'

/** 場景引擎：不依賴 React，負責寵物行為更新與像素繪製（邏輯像素座標，整數倍放大） */
export class PixelEngine {
  layout: Layout = computeLayout(1280, 692, 1)
  actors = new Map<string, Actor>()
  selectedId: string | null = null
  /** 滑鼠在住家的門上 */
  doorHover = false
  /** 滑鼠在鐘樓的門上 */
  towerHover = false
  /**
   * 滑鼠互動（v3.8.1，hover.ts）：停下來看你、黏人靠近、膽小閃開、摸頭、小名字標籤、貓拍狗吠。
   * enabled 由畫面層依「這個裝置有沒有 hover 能力（桌面滑鼠）」設定；預設關閉（Node 測試與觸控裝置不受影響）。
   */
  hover = new HoverController()
  hooks: EngineHooks = { requestBath: () => null, wake: () => {}, notify: () => {}, eatAtBowl: () => null, settlePlay: () => {}, addFind: () => false }
  /** 還沒揭曉的寶物（存檔 finds）、各部位穿的外觀（'gold' = 金色版；不在清單或圖集還沒載入就用預設圖） */
  private finds: readonly Find[] = []
  private findPos: { L: Layout; P: Placement; list: readonly Find[]; pts: Map<string, { x: number; y: number }> } | null = null
  skins: Readonly<Record<string, string>> = {}
  /** 揭曉動畫：寶物位置、結果、已經過的時間 */
  private reveals: { x: number; y: number; result: RevealResult; t: number }[] = []
  /** 已購買的建築 id（存檔的 ownedBuildings）；食盆今天還剩幾份 */
  /** v3.9.0：存檔的 farmLayout 與算出來的擺放結果（setLayoutData 時換新的） */
  private farmLayout: FarmLayout | undefined = undefined
  placement: Placement = defaultPlacement()
  bowlLeft = 0
  private bmap: { L: Layout; P: Placement; map: Map<string, BuildingSlot> } | null = null
  private anims: Anim[] = []
  private dragOff = { dx: 0, dy: 0 }
  private draggingId: string | null = null
  time = 0
  private particles: Particle[] = []
  private floats: Float[] = []
  /** 丟球點到不合法的位置：小小的叉叉（0.45 秒） */
  private marks: { x: number; y: number; t: number; color: string }[] = []
  private drops: Drop[] = []
  private giftT = 0
  private lastFrame: FrameInfo = { nowMs: Date.now(), hour: 12, weather: 'sunny', gifts: [] }
  rand: () => number = Math.random
  /**
   * 野餐（v3.8.0）：存檔裡進行中的那一場（active，由 syncPicnic 同步）、墊子飛下來的時間、是否已落地。
   * 墊子落地後才把座位分給參加的寵物（a.picnic）；存檔的 active 消失（結束）就收掉墊子、放掉所有座位。
   */
  private picnicState: { active: PicnicActive; key: number; dropT: number; landed: boolean } | null = null

  /** 設定畫布大小（裝置像素）；既有寵物依新範圍夾回 */
  setSize(backW: number, backH: number, dpr: number): void {
    const old = this.layout
    this.layout = computeLayout(Math.max(1, backW), Math.max(1, backH), dpr)
    setPlacement(this.layout, this.placement)
    for (const a of this.actors.values()) clampActor(a, this.layout)
    // v3.9.0：場景座標固定，改變視窗大小不影響場景裡的位置，只有邏輯尺寸變了才提前結算玩耍（目前不會發生）
    if (old.W !== this.layout.W || old.H !== this.layout.H) this.endPlay('resize')
  }

  /** 非整數倍放大用的 1 倍暫存畫布 */
  private scaledBuf: HTMLCanvasElement | null = null

  private renderScaled(ctx: CanvasRenderingContext2D): void {
    const L = this.layout
    if (typeof document === 'undefined') return
    const bx0 = Math.floor(L.view.x0)
    const by0 = Math.floor(L.view.y0)
    const bw = Math.ceil(L.view.x1) - bx0
    const bh = Math.ceil(L.view.y1) - by0
    const buf = this.scaledBuf ?? (this.scaledBuf = document.createElement('canvas'))
    if (buf.width !== bw) buf.width = bw
    if (buf.height !== bh) buf.height = bh
    const bctx = buf.getContext('2d')
    if (!bctx) return
    this.render(bctx, { scale: 1, offsetX: -bx0, offsetY: -by0, w: bw, h: bh, ext: L.view })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, L.backW, L.backH)
    ctx.drawImage(buf, 0, 0, bw, bh, L.ox + bx0 * L.S, L.offsetY + by0 * L.S, bw * L.S, bh * L.S)
  }

  /** 設定還沒揭曉的寶物（存檔 finds 變動時呼叫） */
  setFinds(list: readonly Find[]): void {
    this.finds = list
  }

  /** 這個視窗放得下幾個寶物（低視窗會比 holdMax 小） */
  findCapNow(): number {
    return findCap(this.layout)
  }

  /** 寶物在場景上的位置（id → 座標）；同一個 Layout、同一份 owned、同一份清單會快取 */
  findPoints(): Map<string, { x: number; y: number }> {
    const c = this.findPos
    if (c && c.L === this.layout && c.P === this.layout.placement && c.list === this.finds) return c.pts
    const pts = findPositions(this.layout, this.finds)
    this.findPos = { L: this.layout, P: this.layout.placement, list: this.finds, pts }
    return pts
  }

  /** 玩耍中的寵物留下一個寶物：場景座標 → 相對位置，交給存檔（滿了回傳 false） */
  private addFind = (a: Actor, kind: 'mound' | 'bundle', x: number, y: number): boolean => {
    const r = worldToFind(this.layout, x, y)
    return this.hooks.addFind(a.id, kind, r.fx, r.fy)
  }

  /** 揭曉動畫：在 (x, y) 冒出結果的圖示、泥土與星星（label = 浮字） */
  showReveal(x: number, y: number, result: RevealResult, label: string): void {
    this.reveals.push({ x, y, result, t: 0 })
    for (let i = 0; i < 8; i++) this.emit('dirt', x + (this.rand() - 0.5) * 12, y - 2)
    const good = result.kind !== 'empty'
    if (good) for (let i = 0; i < 3; i++) this.particles.push({ key: 'fx_sparkle', x: x + (this.rand() - 0.5) * 22, y: y - 12 - this.rand() * 8, vx: (this.rand() - 0.5) * 14, vy: -(8 + this.rand() * 10), life: 0, max: 0.9 })
    this.floats.push({ x, y: y - 34, text: label, tone: good ? 'good' : 'bad', t: 0 })
  }

  /** 寶物的點擊判定半徑（邏輯像素）：至少 24 個 CSS 像素，手指也點得到 */
  private findReach(): number {
    return Math.max(12, (24 * this.layout.dpr) / this.layout.S)
  }

  /** 讓場景上的寵物與存檔裡的寵物一致（新增、移除、資料更新） */
  sync(pets: Pet[]): void {
    const ids = new Set(pets.map((p) => p.id))
    for (const id of [...this.actors.keys()])
      if (!ids.has(id)) {
        this.actors.delete(id)
        this.hover.removePet(id)
      }
    for (const pet of pets) {
      const a = this.actors.get(pet.id)
      if (a) a.pet = pet
      else this.actors.set(pet.id, createActor(pet, this.layout, this.rand))
    }
    if (this.selectedId && !this.actors.has(this.selectedId)) this.selectedId = null
  }

  /**
   * 找新主人（v3.7.1）：把寵物從場景移除，要在存檔移除牠「之前」呼叫（玩耍結算需要寵物還在存檔裡）。
   *  - 正在玩耍：提前結算（和開視窗一樣只結算數值，不演開心跳；已經留下的寶物保留，進行到一半的那一次作廢）；
   *  - 走去水池的路上或在水池裡、被拖曳、飛回去：一起清掉（水池「使用中」是由場景上的寵物算出來的，移除後就空出來）；
   *  - 睡在狗窩／貓跳台座位上、在食盆吃東西：放掉座位（座位與食盆位置都是由場景上的寵物算出來的，別隻可以馬上用）；
   *  - 被氣泡選單選中：取消選取。頭上的狀態圖示、選取標記是畫寵物時一起畫的，寵物不見就不會再畫。
   * 回傳 false = 場景上沒有這隻（仍然可以照常移除存檔）。
   */
  removePet(id: string): boolean {
    const a = this.actors.get(id)
    if (!a) return false
    if (a.play) endPlay(a, 'rehome', this.playEnv(), PLAY_OPS)
    cancelBath(a)
    releaseUse(a, false)
    if (this.draggingId === id) this.draggingId = null
    this.hover.removePet(id)
    a.hv = null
    a.drag = false
    a.fly = null
    a.bath = null
    this.actors.delete(id)
    if (this.selectedId === id) this.selectedId = null
    return true
  }

  /**
   * 設定已購買的建築（存檔變動時呼叫）：保留目前的擺放紀錄，重新算擺放結果（見 setLayoutData）。
   */
  setOwned(ids: readonly string[]): void {
    this.setLayoutData(ids, this.farmLayout)
  }

  /**
   * v3.9.0：設定已購買的建築與存檔的擺放紀錄（任一個變動時呼叫）→ 換一個新的擺放結果（擺放版本 +1，所有版面快取跟著失效）。
   * 擺出來的物件腳下佔地是障礙，寵物繞行；站在新障礙裡的寵物會被推出來。載入時不檢查重疊、不改寫存檔。
   */
  setLayoutData(owned: readonly string[], farmLayout: FarmLayout | undefined): void {
    this.farmLayout = farmLayout
    this.placement = resolvePlacement(owned, farmLayout)
    setPlacement(this.layout, this.placement)
    for (const a of this.actors.values()) {
      clampActor(a, this.layout)
      a.path = []
      a.pathKey = ''
    }
  }

  /** 已購買、而且目前視窗放得下的建築空位（id → 空位）；放不下的建築紀錄還在，只是畫面上隱藏、寵物也不會去 */
  buildings(): ReadonlyMap<string, BuildingSlot> {
    const c = this.bmap
    if (c && c.L === this.layout && c.P === this.layout.placement) return c.map
    const map = new Map(ownedSlots(this.layout).map((s) => [s.id, s]))
    this.bmap = { L: this.layout, P: this.layout.placement, map }
    return map
  }

  /** 睡在狗窩／貓跳台旁邊的寵物 id（睡覺的心情回復倍率用） */
  sleepersAtBuilding(): Set<string> {
    const out = new Set<string>()
    for (const a of this.actors.values()) if (a.bld?.purpose === 'sleep' && a.bld.phase === 'at' && !isOverflowSeat(a.bld.id, a.bld.seat)) out.add(a.id)
    return out
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

  private emit = (kind: 'heart' | 'bubble' | 'note' | 'wbubble' | 'drop' | 'dirt', x: number, y: number): void => {
    if (kind === 'dirt') {
      this.particles.push({ key: 'dirt', x, y, vx: (this.rand() - 0.2) * 30, vy: -(16 + this.rand() * 18), life: 0, max: 0.55, g: 150 })
      return
    }
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
    this.updatePicnic(dt)
    const list = [...this.actors.values()]
    // 滑鼠互動：在寵物行為更新之前決定誰要看、靠近、退開、摸頭、貓拍狗吠（既有狀態優先：不符合的立刻解除）
    this.hover.update(dt, this.hoverEnv(list, f))
    // 被拖著、飛回去、洗澡中的寵物不參與避讓（也不會被別人推開）
    const free = list.filter((a) => !a.drag && !a.fly && !a.bath)
    for (const a of list) if (!free.includes(a)) a.sepX = a.sepY = 0
    computeSeparation(free)
    const env: BehaviorEnv = {
      layout: this.layout, nowMs: f.nowMs, hour: f.hour, rand: this.rand, selectedId: this.selectedId, others: list, emit: this.emit,
      fx: this.fx, requestBath: this.requestBath, notify: (m) => this.hooks.notify(m),
      weather: f.weather, buildings: this.buildings(), bowlLeft: this.bowlLeft, eatAtBowl: (a) => this.hooks.eatAtBowl(a.id), settlePlay: (id, n, toy) => this.hooks.settlePlay(id, n, toy),
      finds: this.finds, findCap: findCap(this.layout), addFind: this.addFind,
      fixed: list.filter((a) => !a.drag && !a.fly && !a.bath && (a.action === 'sleep' || a.bld?.phase === 'at')).map((a) => ({ id: a.id, x: a.x, y: a.y })),
      picnicMat: this.picnicState?.landed ? picnicMatRect(this.layout) : null,
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
    for (const m of this.marks) m.t += dt
    this.marks = this.marks.filter((m) => m.t < 0.45)
    for (const fl of this.floats) fl.t += dt
    this.floats = this.floats.filter((fl) => fl.t < 1.9)
    for (const r of this.reveals) r.t += dt
    this.reveals = this.reveals.filter((r) => r.t < BALANCE.dig.revealSeconds)
    // 天氣粒子
    this.drops = makeDrops(this.layout, f.weather, this.drops, this.layout.view)
    updateDrops(this.drops, this.layout, f.weather, dt, this.layout.view)
    this.giftT += dt
  }

  // ---------------------------------------------------------------------
  // 繪製
  // ---------------------------------------------------------------------

  /**
   * 畫整個場景。view（v3.8.0 拍照用）：改用指定的放大倍率、平移與畫布大小，例如 { scale: 1, offsetY: 0, w: W, h: H } = 1 個邏輯像素畫成 1 個畫布像素；
   * 沒給就用版面（畫在主畫布上）。
   */
  render(ctx: CanvasRenderingContext2D, view?: RenderView): void {
    const L = this.layout
    const f = this.lastFrame
    if (!assets.ready) return
    // v3.9.0 非整數倍：先在 1 倍的暫存畫布畫出整個可見範圍，再關掉平滑等比放大貼上（不會有接縫，像素寬度會差 1 個裝置像素）
    if (!view && !L.whole) {
      this.renderScaled(ctx)
      return
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, view?.w ?? L.backW, view?.h ?? L.backH)
    ctx.setTransform(view?.scale ?? L.S, 0, 0, view?.scale ?? L.S, view ? view.offsetX ?? 0 : L.ox, view?.offsetY ?? L.offsetY)
    // 可見範圍（含延伸區）；拍照只畫場景本身
    const ext = view ? view.ext : L.view

    const night = this.isHouseLit(f.hour)
    drawSky(ctx, L, f.hour, f.weather, ext)
    drawStars(ctx, L, f.hour, this.time, ext)
    drawCelestial(ctx, L, f.hour, f.weather)
    drawClouds(ctx, L, f.weather, this.time, 0, ext)
    drawFar(ctx, L, ext)
    drawGrass(ctx, L, ext)
    drawPath(ctx, L, ext)
    // v3.8.0 野餐墊（落地後）：平鋪在地上，畫在所有物件與寵物之前（墊子頂端在後排景物腳底之下，所以不會蓋到樹與裝飾）
    const pst = this.picnicState
    const mat = pst ? picnicMatRect(L) : null
    const matSpr = pst ? assets.get(MAT_KEYS[pst.active.mat] ?? MAT_KEYS[0]) : null
    if (pst?.landed && mat && matSpr) drawSprite(ctx, matSpr, mat.x0 + matSpr.ax, mat.y1)

    // 物件與寵物依「腳底 y」排前後
    type Item = { y: number; draw: () => void }
    const items: Item[] = []
    items.push({
      y: L.house.baseY,
      draw: () => {
        const s = this.houseSprite(night)
        if (s) drawSprite(ctx, s, L.house.x0 + s.ax, L.house.baseY)
      },
    })
    const pond = pondPos(L)
    // v3.7.0：公佈欄（水池上方的遠景區，腳底在草地上緣，排在所有後排物件之前）
    const board = assets.get('board')
    if (board) {
      const bp = boardPos(L)
      items.push({ y: bp.y, draw: () => drawSprite(ctx, board, bp.x, bp.y) })
    }
    for (const o of sceneObjects(L)) {
      if (o.key === 'pond') {
        // 水池（靜止，只有一幀）；泡澡中的寵物畫在水池上面（下半身被水面遮住）
        items.push({ y: o.y, draw: () => this.drawPond(ctx, o.x, o.y, f) })
        continue
      }
      const key = KIND_GEOM[o.kind].sprite
      const s = o.key === 'clocktower' ? this.towerSprite() : key ? assets.get(key) : null
      if (!s) continue
      items.push({
        y: o.y,
        draw: () => {
          drawSprite(ctx, s, o.x, o.y)
        },
      })
    }
    // 已購買的建築（這個視窗放得下的才畫）：依腳底 y 排前後；食盆空了在上方顯示「空」
    for (const slot of this.buildings().values()) {
      const def = buildingDef(slot.id)
      const spr = def?.sprite ? assets.get(def.sprite) : null
      if (spr) items.push({ y: slot.y, draw: () => drawSprite(ctx, spr, slot.x, slot.y) })
      if (slot.id === 'bowls' && this.bowlLeft <= 0) items.push({ y: slot.y + 60, draw: () => drawEmptyIcon(ctx, slot.x, slot.y - slot.h - 3 + Math.round(Math.sin(this.time * 3) * 1)) })
    }
    for (const a of this.actors.values()) {
      if (a.bath?.phase === 'soak') continue // 由水池一起畫
      // 跳進水池、爬出水池的過程要畫在水池前面；被拖著的畫在最上層
      const y = a.drag ? 1e6 : a.bath && (a.bath.phase === 'jump' || a.bath.phase === 'climb') ? Math.max(a.y, pond.y + 0.5) : this.seatView(a)?.sortY ?? a.y
      items.push({ y, draw: () => this.drawActor(ctx, a, f) })
    }
    // 寶物：狗的土堆、貓的布包（點開才揭曉；「可揭曉」的星星畫在上層）
    const fpts = this.findPoints()
    for (const fd of this.finds) {
      const pt = fpts.get(fd.id)
      if (!pt) continue
      items.push({
        y: pt.y,
        draw: () => {
          if (fd.kind === 'bundle') this.drawBundle(ctx, pt.x, pt.y)
          else {
            const m = assets.get('toy_dirt_mound_s')
            if (m) drawSprite(ctx, m, pt.x, pt.y)
          }
        },
      })
    }
    // 野餐墊上的籃子與食物（只是裝飾）：依腳底 y 和寵物排前後
    if (pst?.landed && mat) {
      const bk = assets.get(BASKET_KEYS[pst.active.basket] ?? BASKET_KEYS[0])
      if (bk) items.push({ y: mat.y0 + MAT_BASKET[1], draw: () => drawSprite(ctx, bk, mat.x0 + MAT_BASKET[0], mat.y0 + MAT_BASKET[1]) })
      pst.active.foods.forEach((fi, i) => {
        const fs = assets.get(FOOD_KEYS[fi] ?? FOOD_KEYS[0])
        const spot = MAT_FOODS[i]
        if (fs && spot) items.push({ y: mat.y0 + spot[1], draw: () => drawSprite(ctx, fs, mat.x0 + spot[0], mat.y0 + spot[1]) })
      })
    }
    // 玩耍中的球（飛行、落地彈跳、放在腳邊）；叼著的球畫在狗的嘴邊（drawActor）
    for (const a of this.actors.values()) {
      const b = a.play?.ball
      if (b) items.push({ y: ballPos(b).y, draw: () => this.drawBall(ctx, b) })
    }
    items.sort((p, q) => p.y - q.y)
    for (const it of items) it.draw()
    // 野餐墊飛下來（落地前）：從畫面上方落到位置，地上的影子越來越大；在所有東西的上面
    if (pst && !pst.landed && mat && matSpr) {
      const k = Math.min(1, pst.dropT / BALANCE.picnic.dropSeconds)
      const e = 1 - (1 - k) * (1 - k) * (1 - k)
      const fromY = -4
      const y = Math.round(fromY + (mat.y1 - fromY) * e)
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      const sw = Math.round((mat.x1 - mat.x0) * 0.8 * (0.3 + 0.7 * e))
      ctx.fillRect(Math.round((mat.x0 + mat.x1) / 2 - sw / 2), Math.round((mat.y0 + mat.y1) / 2) - 2, sw, 4)
      drawSprite(ctx, matSpr, mat.x0 + matSpr.ax, y)
    }

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
      ctx.globalAlpha = Math.max(0, Math.min(1, (p.max - p.life) / 0.4))
      if (p.key === 'dirt') {
        // 泥土粒子（程式畫的 2×2 小方塊，不用素材）
        ctx.fillStyle = p.life < p.max * 0.5 ? '#8a5a2b' : '#6b4524'
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
        continue
      }
      const s = assets.get(p.key)
      if (!s) continue
      drawSprite(ctx, s, p.x, p.y)
    }
    ctx.globalAlpha = 1

    // 天氣
    if (f.weather === 'rain' || f.weather === 'snow') drawDrops(ctx, this.drops, f.weather)

    // 夜晚：暗色疊層，之後再畫鐘面、路燈光暈
    const dark = drawDarkness(ctx, L, f.hour, f.weather, ext)
    // 鐘面完全由程式畫，疊在鐘樓上、蓋過原圖那個小鐘面；畫在暗色疊層之後，夜晚也清楚可讀
    const tower = this.towerSprite()
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

    // 「可揭曉」的星星（疊在每個寶物上方）與揭曉動畫（在暗色疊層之上，夜晚也清楚）
    const sparkle = assets.get('fx_reveal')
    if (sparkle) {
      for (const fd of this.finds) {
        const pt = fpts.get(fd.id)
        if (!pt) continue
        const base = fd.kind === 'bundle' ? 14 : (assets.get('toy_dirt_mound_s')?.h ?? 15)
        drawSprite(ctx, sparkle, pt.x, pt.y - base - 1 + Math.round(Math.sin(this.time * 3 + pt.x) * 1.5))
      }
    }
    for (const r of this.reveals) this.drawReveal(ctx, r)
    // 禮物與浮字（在暗色疊層之上，保持清楚）
    for (const id of f.gifts) {
      const a = this.actors.get(id)
      if (!a) continue
      const p = this.giftPos(a)
      this.drawGift(ctx, p.x, p.y)
    }
    // 丟球點到不合法位置的叉叉
    for (const m of this.marks) {
      ctx.globalAlpha = 1 - m.t / 0.45
      ctx.fillStyle = '#000'
      const mx = Math.round(m.x)
      const my = Math.round(m.y) - Math.round(m.t * 6)
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(mx + i - 1, my + i - 1, 3, 3)
        ctx.fillRect(mx + i - 1, my - i - 1, 3, 3)
      }
      ctx.fillStyle = m.color
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(mx + i, my + i, 1, 1)
        ctx.fillRect(mx + i, my - i, 1, 1)
      }
    }
    ctx.globalAlpha = 1
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
    // v3.8.1 小名字標籤（拍照不畫）
    if (!view) this.drawLabel(ctx)
  }

  /**
   * 小名字標籤：游標停在寵物上約 0.5 秒後，在頭上浮出「個性圖示＋名字」；放不下（上方出界）就放腳下，左右夾進畫面。
   * 游標移開、開選單、拖曳、開視窗時 hover 控制器就不回報 id，標籤立刻消失。
   */
  private drawLabel(ctx: CanvasRenderingContext2D): void {
    const id = this.hover.enabled && !this.hover.blocked ? this.hover.labelId() : null
    const a = id ? this.actors.get(id) : undefined
    if (!a || this.selectedId || this.draggingId) return
    const s = this.actorSprite(a)
    if (!s) return
    const L = this.layout
    const icon = a.pet.personality ? assets.get(PERSONALITY_ICONS[a.pet.personality]) : null
    ctx.font = 'bold 9px "Courier New", monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const tw = Math.ceil(ctx.measureText(a.pet.name).width)
    const pad = 3
    const w = pad + (icon ? icon.w + 2 : 0) + tw + pad
    const h = Math.max(icon ? icon.h : 0, 11) + 4
    const hop = this.hopOffset(a)
    const top = a.y - hop - s.ay
    let x = Math.round(a.x - w / 2)
    let y = Math.round(top - 3 - h)
    if (y < 2) y = Math.round(a.y - hop - s.ay + s.h + 3) // 頭上放不下：放腳下
    x = Math.max(2, Math.min(Math.floor(L.W) - w - 2, x))
    y = Math.max(2, Math.min(Math.floor(L.H) - h - 2, y))
    ctx.fillStyle = '#3b2a1c'
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2)
    ctx.fillStyle = '#fffdf4'
    ctx.fillRect(x, y, w, h)
    let tx = x + pad
    if (icon) {
      drawSprite(ctx, icon, tx + icon.ax, y + 2 + icon.ay)
      tx += icon.w + 2
    }
    ctx.fillStyle = '#3b2a1c'
    ctx.fillText(a.pet.name, tx, y + Math.round(h / 2) + 3)
  }

  /** 夜晚（暗到需要亮燈）：住家換成亮燈版 */
  isHouseLit(hour: number): boolean {
    const h = ((hour % 24) + 24) % 24
    return h >= 19.5 || h < 5.5
  }

  /** 水池本體＋泡澡中的寵物（用水面橢圓裁切，只露出水面以上）＋漣漪 */
  private drawPond(ctx: CanvasRenderingContext2D, x: number, y: number, f: FrameInfo): void {
    const s = assets.get('pond')
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
    // 窩裡的狗一律躺著（躲雨時醒著也是躺姿，只是沒有 ZZZ）：站姿、坐姿比門洞還高
    const key = a.bld?.phase === 'at' && a.bld.id === 'kennel' && a.bld.seat === 0 && a.bld.purpose !== 'eat' ? `${assetPrefix(a.pet)}_sleep` : frameKeyOf(a)
    return assets.get(key) ?? assets.get(`${a.pet.species === 'dog' ? 'dog_shiba' : 'cat_orange'}_stand`)
  }

  /** 這隻寵物在窩裡或貓跳台平台上時的畫法；其他情況（含地面座位）回傳 null */
  private seatView(a: Actor): SeatView | null {
    const u = a.bld
    if (!u || u.phase !== 'at' || u.purpose === 'eat') return null
    const slot = this.buildings().get(u.id)
    if (!slot) return null
    const seat = seatsOf(u.id, slot, u.purpose)[u.seat]
    if (!seat || seat.kind === 'ground') return null
    if (seat.kind === 'platform') {
      // 平台上的貓：ZZZ 畫在平台外側（左邊、貓頭的高度），不往上伸（才不會蓋到鐘樓的門），上下兩層的 ZZZ 也不會疊在一起
      return { x: seat.x, y: seat.y, clip: null, sortY: slot.y + 0.5, iconX: seat.x - 22, iconBottom: seat.y - 4 }
    }
    // 窩裡：吻部（素材朝右時的右緣）對齊門洞右緣，底邊貼在墊子前緣；只畫門洞裡的部分
    const spr = this.actorSprite(a)
    const left = slot.x - KENNEL_AX
    const top = slot.y - KENNEL_H
    return {
      x: left + KENNEL_INSIDE_RIGHT - (spr ? spr.w - spr.ax : 24),
      y: top + KENNEL_INSIDE_BOTTOM,
      clip: KENNEL_DOOR_CLIP.map((r) => ({ x0: left + r.x0, x1: left + r.x1, y0: top + r.y0, y1: top + r.y1 })),
      sortY: slot.y + 0.5,
      iconX: left + KENNEL_DOOR_CX,
      iconBottom: top + KENNEL_DOOR_CLIP[0].y0 - 2,
    }
  }

  private hopOffset(a: Actor): number {
    const hop = a.hop > 0 ? Math.round(Math.sin((1 - a.hop / 0.4) * Math.PI) * 4) : 0
    return hop + Math.round(a.lift) + this.bounceOffset(a)
  }

  private giftPos(a: Actor): { x: number; y: number } {
    const s = this.actorSprite(a)
    return { x: a.x, y: a.y - (s?.h ?? 40) - 16 + Math.round(Math.sin(this.giftT * 4) * 1.5) }
  }

  /** 球（飛行中離地 z、落地彈跳）：腳下一個小陰影，不旋轉 */
  private drawBall(ctx: CanvasRenderingContext2D, b: PlayBall): void {
    const s = assets.get('toy_ball_s')
    if (!s) return
    const p = ballPos(b)
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    const sw = Math.max(3, Math.round(s.w * 0.6 * (1 - Math.min(0.4, p.z / 90))))
    ctx.fillRect(Math.round(p.x) - Math.round(sw / 2), Math.round(p.y) - 1, sw, 2)
    drawSprite(ctx, s, p.x, p.y - p.z)
  }

  /** 住家的圖：穿了外觀（圖集 skins 已載入）就用外觀的，否則用預設圖 */
  private houseSprite(night: boolean): Sprite | null {
    const base = night ? 'house_night' : this.doorHover ? 'house_open' : 'house_closed'
    const def = this.skins.house ? skinDef(this.skins.house) : undefined
    const k = def ? (night ? def.frames.night : this.doorHover ? def.frames.open : def.frames.closed) : null
    return (k ? assets.get(k) : null) ?? assets.get(base)
  }

  /** 鐘樓的圖（滑鼠在門上換開門版）：穿了外觀就用外觀的 */
  private towerSprite(): Sprite | null {
    const base = this.towerHover ? 'clocktower_open' : 'clocktower'
    const def = this.skins.tower ? skinDef(this.skins.tower) : undefined
    const k = def ? (this.towerHover ? def.frames.open : def.frames.closed) : null
    return (k ? assets.get(k) : null) ?? assets.get(base)
  }

  /** 貓的布包（程式畫的通用外觀，12×13：看不出裡面是什麼）；腳底中心在 (x, y) */
  private drawBundle(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const px = Math.round(x)
    const py = Math.round(y)
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.fillRect(px - 5, py - 1, 10, 2)
    ctx.fillStyle = '#3b2a1c'
    ctx.fillRect(px - 6, py - 10, 12, 10)
    ctx.fillRect(px - 3, py - 13, 6, 3)
    ctx.fillStyle = '#c9985a'
    ctx.fillRect(px - 5, py - 9, 10, 8)
    ctx.fillStyle = '#dfb682'
    ctx.fillRect(px - 5, py - 9, 10, 2)
    ctx.fillStyle = '#a97a40'
    ctx.fillRect(px - 5, py - 3, 10, 2)
    ctx.fillStyle = '#e8453c'
    ctx.fillRect(px - 2, py - 12, 4, 2)
  }

  /** 揭曉動畫：結果的圖示從寶物位置升起、停一下、淡出（空 = 只有泥土與浮字） */
  private drawReveal(ctx: CanvasRenderingContext2D, r: { x: number; y: number; result: RevealResult; t: number }): void {
    const res = r.result
    const key = res.kind === 'coin' ? 'coin_' + res.coin : res.kind === 'item' ? (res.shard ? `item_${res.id}_${res.shard}` : `item_${res.id}`) : null
    const s = key ? assets.get(key) : null
    if (!s) return
    const k = r.t / BALANCE.dig.revealSeconds
    const rise = Math.min(1, k / 0.45)
    const e = 1 - (1 - rise) * (1 - rise)
    ctx.globalAlpha = k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1
    // 圖示大小固定（不縮放）：錢幣小、寶物 48，所以升得高一點
    drawSprite(ctx, s, r.x, r.y - 6 - e * (s.h > 20 ? 30 : 18))
    ctx.globalAlpha = 1
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
    const v = this.seatView(a)
    const px = v ? v.x : a.x
    const py = v ? v.y : a.y
    // 腳下小陰影（抬高時影子留在地面、變小一點）；窩裡的狗被裁切，不畫
    if (!v?.clip) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      const sw = Math.max(4, Math.round(s.w * 0.55 * (1 - Math.min(0.3, a.lift / 40))))
      ctx.fillRect(Math.round(px) - Math.round(sw / 2), Math.round(py) - 1, sw, 2)
    }
    if (v?.clip) {
      ctx.save()
      ctx.beginPath()
      for (const r of v.clip) ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
      ctx.clip()
    }
    drawSprite(ctx, s, px + a.shakeX, py - hop, a.facing === -1)
    if (v?.clip) ctx.restore()
    // 叼著球：球掛在嘴邊（各品種、各幀的位置在 play.ts 的 MOUTH，往左走時水平翻轉）
    if (a.play && isCarrying(a.play)) {
      const m = mouthOffset(variantOf(a.pet.species, a.pet.variant).assetKey, frameNameOf(a), a.facing)
      const ball = assets.get('toy_ball_s')
      if (m && ball) drawSprite(ctx, ball, px + a.shakeX + m.x, py - hop + m.y + Math.round(ball.h / 2))
    }
    // 貓尋寶：叼著布包走回來（布包掛在嘴邊：往前的那一側、身體高度約 28%；往左走時水平翻轉）
    if (a.play && isCarryingBundle(a.play)) this.drawBundle(ctx, px + a.shakeX + (s.w - s.ax - 5) * a.facing, py - hop - Math.round(s.h * 0.28))
    // 頭上的狀態圖示（餓＝驚嘆號、心情低＝汗滴、髒＝泡泡、睡覺＝ZZZ、開心＝愛心）
    const key = this.statusIcon(a, f)
    if (key) {
      const ic = assets.get(key)
      if (ic) drawSprite(ctx, ic, v ? v.iconX : px, (v ? v.iconBottom : a.y - s.h - 3) - hop + Math.round(Math.sin(this.time * 3 + a.animT) * 1))
    }
    // 選取中：腳下一圈小標記
    if (this.selectedId === a.id) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      const w = Math.round(s.w * 0.7)
      ctx.fillRect(Math.round(px) - Math.round(w / 2), Math.round(py) + 2, w, 1)
    }
  }

  statusIcon(a: Actor, f: FrameInfo): string | null {
    if (isSleeping(a.pet, f.hour, f.nowMs)) return a.action === 'sleep' ? 'fx_zzz' : null // 走去狗窩／貓跳台的路上還沒睡
    if (a.override?.tag === 'eat' || (a.bld?.purpose === 'eat' && a.bld.phase === 'at')) return null
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
    const v = this.seatView(a)
    // 窩裡的狗：選單的錨點是露出來的頭（門洞中央），不是被裁掉的身體中心
    if (v) return { x: v.clip ? (v.clip[3].x0 + v.clip[3].x1) / 2 : v.x, y: Math.max(v.y - (s?.h ?? 40), v.clip ? v.clip[0].y0 : -1e9) - this.hopOffset(a) }
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
    const sy = (a: Actor): number => (a.drag ? 1e6 : this.seatView(a)?.sortY ?? a.y)
    const list = [...this.actors.values()].filter((a) => !isBathing(a)).sort((p, q) => sy(q) - sy(p))
    for (const a of list) {
      const s = this.actorSprite(a)
      if (!s) continue
      const hop = this.hopOffset(a)
      const v = this.seatView(a)
      const x0 = (v ? v.x : a.x) - s.ax
      const y0 = (v ? v.y : a.y) - hop - s.ay
      if (!(lx >= x0 && lx < x0 + s.w && ly >= y0 && ly < y0 + s.h)) continue
      // 窩裡的狗只有門洞裡露出來的部分算點得到
      if (v?.clip && !v.clip.some((r) => lx >= r.x0 && lx < r.x1 && ly >= r.y0 && ly < r.y1)) continue
      return a
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
    // 寶物（土堆、布包，連同上方的「可揭曉」星星）：腳底往上約 2 倍半徑、往下半個半徑；y 大的在前面先判斷
    const R = this.findReach()
    const pts = this.findPoints()
    let hit: { id: string; y: number } | null = null
    for (const f of this.finds) {
      const p = pts.get(f.id)
      if (!p || Math.abs(p.x - x) > R || y < p.y - R * 2 || y > p.y + R * 0.5) continue
      if (!hit || p.y > hit.y) hit = { id: f.id, y: p.y }
    }
    return hit ? { kind: 'find', id: hit.id } : null
  }

  /** 寶物在場景上的位置（揭曉動畫要從這裡冒出來）；找不到 = null */
  findPointOf(id: string): { x: number; y: number } | null {
    return this.findPoints().get(id) ?? null
  }

  /** 滑鼠互動需要的東西（見 hover.ts 的 HoverEnv）；每個影格組一次 */
  private hoverEnv(list: Actor[], f: FrameInfo): HoverEnv {
    return {
      layout: this.layout,
      actors: list,
      rand: this.rand,
      selectedId: this.selectedId,
      dragging: this.draggingId !== null,
      sleeping: (a) => isSleeping(a.pet, f.hour, f.nowMs),
      petAt: (x, y) => this.petAt(x, y),
      box: (a) => {
        const s = this.actorSprite(a)
        if (!s) return null
        const hop = this.hopOffset(a)
        return { x0: a.x - s.ax, y0: a.y - hop - s.ay, x1: a.x - s.ax + s.w, y1: a.y - hop - s.ay + s.h }
      },
      emit: (kind, x, y) => this.emit(kind, x, y),
    }
  }

  /** 游標移動（CSS 座標）：只記下最新位置，實際反應在下一個影格的 update 裡處理（指標事件很密，不在事件裡做運算） */
  cursorMove(cssX: number, cssY: number): void {
    const p = fromCss(this.layout, cssX, cssY)
    this.hover.move(p.x, p.y)
  }

  /** 游標離開畫布、視窗失焦、分頁被藏起來：互動立即解除 */
  cursorLeave(): void {
    this.hover.leave()
  }

  /** 滑鼠移動：寵物稍微看向滑鼠並輕輕跳一下；回傳目前在哪隻寵物上 */
  pointerMove(cssX: number, cssY: number): string | null {
    const { x, y } = fromCss(this.layout, cssX, cssY)
    const hit = this.petAt(x, y)
    const a = hit?.play ? null : hit // 玩耍中的狗不會因為滑鼠經過而跳一下
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

  /**
   * v3.7.0 工具包的點擊區（CSS 座標）：窗戶（計算機）、鐘面（碼表與倒數）、塔門（遊戲館）、公佈欄。
   * 鐘面位置用目前鐘樓圖（含開門版、黃金鐘樓）的 meta.clock；不足 minCss 的點擊區放大（畫面不變）。
   */
  toolHits(minCss: number): ToolHits {
    return toolHitRects(this.layout, this.towerSprite()?.meta?.clock, minCss)
  }

  /** 公佈欄黑板的綠色範圍（CSS 座標）：疊標題縮圖 */
  boardGreenCss(): LayoutRect {
    return rectCss(this.layout, boardGreenRect(this.layout))
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
    // 玩耍中的狗被拖走：提前結算（不演開心跳）
    if (a.play) endPlay(a, 'drag', this.playEnv(), PLAY_OPS)
    // 座位上的寵物（窩裡、平台上）被拖起來：從畫面上的位置開始拖，座位釋放（不回到座位旁）
    const v = this.seatView(a)
    if (v) {
      a.x = v.x
      a.y = v.y
    }
    releaseUse(a, false)
    a.picnic = null // v3.8.0：被拖走 = 離開野餐
    a.hv = null // v3.8.1：滑鼠互動的暫時行為也清掉
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

  // ---------------------------------------------------------------------
  // 玩耍（丟球）
  // ---------------------------------------------------------------------

  /** 目前正在玩耍的狗（一次只有一隻） */
  playingActor(): Actor | null {
    for (const a of this.actors.values()) if (a.play) return a
    return null
  }

  isPlaying(): boolean {
    return this.playingActor() !== null
  }

  private playEnv(): PlayEnv {
    return {
      layout: this.layout, rand: this.rand, emit: this.emit, settlePlay: (id, n, toy) => this.hooks.settlePlay(id, n, toy),
      others: [...this.actors.values()], nowMs: this.lastFrame.nowMs, hour: this.lastFrame.hour,
      finds: this.finds, findCap: findCap(this.layout), addFind: this.addFind,
    }
  }

  /** 現在不能玩耍的原因（別隻在玩、洗澡中、被拖曳中）；可以玩 = null。金幣與睡覺由 petActions 判斷 */
  playBlock(id: string): string | null {
    const a = this.actors.get(id)
    if (!a) return '找不到這隻寵物'
    const other = this.playingActor()
    if (other) return other.id === id ? `${a.pet.name}正在玩耍` : `${other.pet.name}正在玩耍，一次只能玩一隻`
    if (a.bath) return `${a.pet.name}正在洗澡`
    if (a.drag || a.fly) return `${a.pet.name}正在被拖曳`
    return null
  }

  /** 開始玩耍（金幣已扣）。回傳 null 成功，否則原因 */
  beginPlay(id: string, toy: PlayToyId = 'ball'): string | null {
    const why = this.playBlock(id)
    if (why) return why
    const a = this.actors.get(id)
    if (!a) return '找不到這隻寵物'
    beginPlay(a, this.layout, PLAY_OPS.setAction, this.lastFrame.hour, toy)
    return null
  }

  /** 提前結束玩耍（沒在玩就什麼都不做）。user／time 演開心跳，其他原因只結算數值 */
  endPlay(reason: PlayEnd): void {
    const a = this.playingActor()
    if (a) endPlay(a, reason, this.playEnv(), PLAY_OPS)
  }

  /** 玩耍中點了畫布上的一個位置（CSS 座標）：合法就丟球，不合法在那裡冒一個叉叉。回傳判斷結果給畫面層決定要不要提示 */
  throwAtCss(cssX: number, cssY: number): ThrowCheck {
    const a = this.playingActor()
    if (!a || a.play?.toy !== 'ball') return { ok: false, reason: 'busy' }
    const { x, y } = fromCss(this.layout, cssX, cssY)
    const r = checkThrow(this.layout, a, [...this.actors.values()], x, y)
    if (r.ok) throwBall(a, r.x, r.y, PLAY_OPS.setAction)
    else this.marks.push({ x, y, t: 0, color: r.reason === 'busy' ? '#ffffff' : '#ff5a4a' })
    return r
  }

  /** 玩耍的 HUD 資料：剩餘秒數（無條件進位）與撿回次數；沒在玩 = null */
  playHud(): { left: number; catches: number; toy: PlayToyId } | null {
    const p = this.playingActor()?.play
    return p ? { left: Math.max(0, Math.ceil(p.left)), catches: p.catches, toy: p.toy } : null
  }

  /** 正在玩的是丟球（點畫面才丟球）；挖寶、尋寶是寵物自己去，點畫面沒有作用 */
  isPlayingBall(): boolean {
    return this.playingActor()?.play?.toy === 'ball'
  }

  // ---------------------------------------------------------------------
  // 野餐（v3.8.0）
  // ---------------------------------------------------------------------

  /** 和存檔同步：有進行中的那一場就讓墊子飛下來（同一場不重來）；沒有就收掉墊子、放掉所有座位 */
  syncPicnic(active: PicnicActive | undefined): void {
    if (!active) {
      if (this.picnicState) this.clearPicnic()
      return
    }
    if (this.picnicState?.key === active.startedAt) return
    if (this.picnicState) this.clearPicnic()
    this.picnicState = { active, key: active.startedAt, dropT: 0, landed: false }
  }

  private clearPicnic(): void {
    this.picnicState = null
    for (const a of this.actors.values()) {
      if (!a.picnic) continue
      a.picnic = null
      a.tx = a.x
      a.ty = a.y
      a.action = 'idle'
      a.t = 0
      a.dur = 1 + this.rand()
    }
  }

  /** 墊子飛下來的計時；落地時把座位分給參加的寵物（場景上還有空的才坐：被拖著、洗澡、玩耍中的不參加） */
  private updatePicnic(dt: number): void {
    const st = this.picnicState
    if (!st || st.landed) return
    st.dropT += dt
    if (st.dropT < BALANCE.picnic.dropSeconds) return
    st.landed = true
    st.active.pets.forEach((id, i) => {
      const a = this.actors.get(id)
      if (!a || !this.picnicFree(a)) return
      releaseUse(a)
      a.override = null
      a.seek = null
      a.path = []
      a.pathKey = ''
      a.picnic = { seat: i, arrived: false, t: 0, cheer: 0 } satisfies PicnicSeat
    })
  }

  /** 場景上有空參加野餐嗎：沒被拖、沒在飛、沒在洗澡（含走去水池）、沒在玩耍 */
  private picnicFree(a: Actor): boolean {
    return !a.drag && !a.fly && !a.bath && !a.play
  }

  /** 野餐墊這個視窗放得下嗎（放不下就不能開始） */
  picnicMatFits(): boolean {
    return picnicMatRect(this.layout) !== null
  }

  /**
   * 可以參加野餐的寵物 id（最多 6 隻）：存檔的數值符合（醒著、心情不差、清潔 >= 20，sim/picnic.ts 的 picnicEligible），
   * 而且場景上有空（沒被拖曳、沒在洗澡或走去洗澡、沒在玩耍）。睡在座位上的寵物一定是睡著的，所以不會被選到。
   */
  picnicCandidates(pets: readonly Pet[], ctx: { nowMs: number; hour: number }): string[] {
    const out: string[] = []
    for (const p of pets) {
      const a = this.actors.get(p.id)
      if (!a || !this.picnicFree(a) || !picnicEligible(p, ctx)) continue
      out.push(p.id)
      if (out.length >= 6) break
    }
    return out
  }

  /** 目前還在野餐的寵物數（走過去中＋坐在墊上）；墊子還在飛 = null（還沒分座位） */
  picnicParticipants(): number | null {
    if (!this.picnicState?.landed) return null
    let n = 0
    for (const a of this.actors.values()) if (a.picnic) n++
    return n
  }

  /** 墊子上已經坐好的寵物數（相機提示：至少 1 隻才顯示） */
  picnicSeated(): number {
    let n = 0
    for (const a of this.actors.values()) if (a.picnic?.arrived) n++
    return n
  }

  /** 拍照：墊子上坐好的寵物全部換成開心姿勢（不加心情）。回傳有幾隻 */
  picnicCheer(): number {
    let n = 0
    for (const a of this.actors.values()) {
      if (!a.picnic?.arrived) continue
      a.picnic.cheer = BALANCE.picnic.cheerSeconds
      a.action = 'happy'
      a.t = 0
      a.animT = 0
      n++
    }
    return n
  }

  /** 墊子（落地後）的外框（邏輯座標）；沒在野餐或還在飛 = null */
  picnicMat(): LayoutRect | null {
    return this.picnicState?.landed ? picnicMatRect(this.layout) : null
  }

  /** 相機提示的位置（CSS 座標）；不能拍（沒在野餐、墊子還在飛、墊上沒有寵物）= null */
  cameraCss(): LayoutRect | null {
    const mat = this.picnicMat()
    if (!mat || this.picnicSeated() === 0) return null
    return rectCss(this.layout, cameraRect(this.layout, mat))
  }

  /**
   * 拍照用：把整個場景以 1 個邏輯像素 = 1 個畫布像素畫到一張新畫布（W×H），不含疊在畫布上的 DOM（選單、相機提示）、不畫選取標記。
   * 回傳 null = 素材還沒好或瀏覽器不支援
   */
  snapshot(): HTMLCanvasElement | null {
    const L = this.layout
    if (!assets.ready || typeof document === 'undefined') return null
    const c = document.createElement('canvas')
    c.width = L.W
    c.height = L.H
    const ctx = c.getContext('2d')
    if (!ctx) return null
    const sel = this.selectedId
    this.selectedId = null
    try {
      this.render(ctx, { scale: 1, offsetY: 0, w: L.W, h: L.H })
    } finally {
      this.selectedId = sel
    }
    return c
  }

  houseSize(): { w: number; h: number } {
    return { w: HOUSE_W, h: HOUSE_H }
  }

  doorFractions(): typeof DOOR {
    return DOOR
  }
}
