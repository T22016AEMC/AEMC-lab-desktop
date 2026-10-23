import { SPECIES, variantOf, type SpeciesId } from '../config/species'
import type { Pet } from '../save/types'
import { isSleeping } from '../sim/rules'
import type { Layout } from './layout'
import { blockers, inWater, isWalkable, petBounds, pondStand, waterEllipse } from './layout'

/**
 * 寵物的行為（邏輯）。這一層只決定「現在在做什麼（動作名稱）」與位置，不管怎麼畫：
 * 畫圖層用 ANIMS 表把「物種＋動作名稱」對應到像素幀。之後要加玩耍動作，
 * 只要在 Action 加名稱、在 ANIMS 加幀，再讓行為去觸發它即可。
 * 不做旋轉、傾斜、縮放；往左走用水平翻轉。
 */

export type Action = 'idle' | 'walk' | 'sit' | 'sleep' | 'eat' | 'happy' | 'groom'

export interface Anim {
  /** 幀名稱（manifest 裡 dog_<品種>_<名稱> 的名稱） */
  frames: string[]
  /** 每秒換幀次數 */
  fps: number
}

/** 動作名稱 → 像素幀。貓沒有 happy 專用幀，用坐姿；貓的 sit_b 是背面，不使用 */
export const ANIMS: Record<SpeciesId, Record<Action, Anim>> = {
  dog: {
    idle: { frames: ['stand'], fps: 1 },
    walk: { frames: ['walk_a', 'walk_b'], fps: 5 },
    sit: { frames: ['sit_a', 'sit_b'], fps: 1.4 },
    sleep: { frames: ['sleep'], fps: 1 },
    eat: { frames: ['eat'], fps: 1 },
    happy: { frames: ['happy', 'stand'], fps: 3 },
    groom: { frames: ['sit_a'], fps: 1 },
  },
  cat: {
    idle: { frames: ['stand'], fps: 1 },
    walk: { frames: ['walk_a', 'walk_b'], fps: 4 },
    sit: { frames: ['sit_a'], fps: 1 },
    sleep: { frames: ['sleep'], fps: 1 },
    eat: { frames: ['eat'], fps: 1 },
    happy: { frames: ['sit_a', 'stand'], fps: 2 },
    groom: { frames: ['groom'], fps: 1 },
  },
}

/** 水池洗澡的流程：走到水池前 → 跳進去 → 泡澡 → 爬出來 → 甩水 */
export interface BathState {
  phase: 'walk' | 'jump' | 'soak' | 'climb' | 'shake'
  /** 這個階段已經過的時間 */
  t: number
  /** 跳進去、爬出來的起點 */
  fromX: number
  fromY: number
}

/** 泡澡各階段的時間（秒）；soak 約 4.5 秒 */
export const BATH_TIMES = { jump: 0.5, soak: 4.5, climb: 0.55, shake: 1.5 } as const

export interface Actor {
  id: string
  pet: Pet
  x: number
  y: number
  tx: number
  ty: number
  facing: 1 | -1
  action: Action
  /** 目前動作已經過的時間、預計持續時間 */
  t: number
  dur: number
  /** 指令觸發的短動作（吃、開心、梳毛…）；結束後回到 idle */
  override: { action: Action; left: number; speedMul: number; tag: string } | null
  /** 跳一下：剩餘時間（秒，0.4 → 0） */
  hop: number
  /** 目前滑鼠在這隻寵物身上 */
  hovered: boolean
  /** 避讓產生的速度（像素／秒） */
  sepX: number
  sepY: number
  /** 卡住偵測 */
  stuckT: number
  lastX: number
  lastY: number
  /** 動畫時間（秒），選幀用 */
  animT: number
  moving: boolean
  /** 被滑鼠拖著：腳底位置跟著游標，畫面上抬高 lift 個邏輯像素 */
  drag: boolean
  lift: number
  /** 放開後飛回可站位置（彈回）的過程 */
  fly: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number } | null
  /** 落地彈跳剩餘時間（秒） */
  bounceT: number
  /** 水池洗澡的狀態；null = 沒在洗 */
  bath: BathState | null
  /** 甩水時的水平抖動（邏輯像素） */
  shakeX: number
}

export interface BehaviorEnv {
  layout: Layout
  nowMs: number
  hour: number
  rand: () => number
  /** 目前選取的寵物（氣泡選單開著）不會亂跑 */
  selectedId: string | null
  /** 其他寵物的位置（挑目標時避開） */
  others: Actor[]
  /** 效果粒子（愛心、泡泡） */
  emit: (kind: 'heart' | 'bubble' | 'note' | 'wbubble' | 'drop', x: number, y: number) => void
  /** 水花、漣漪（引擎負責演出） */
  fx: (kind: 'splash' | 'ripple', x: number, y: number) => void
  /** 走到水池前之後申請洗澡（扣點）；回傳 null 表示成功，否則是失敗原因 */
  requestBath: (a: Actor) => string | null
  notify: (message: string) => void
}

const rr = (rand: () => number, a: number, b: number): number => a + rand() * (b - a)

export function createActor(pet: Pet, L: Layout, rand: () => number): Actor {
  const b = petBounds(L)
  const x = rr(rand, b.x0, b.x1)
  const y = rr(rand, b.y0, b.y1)
  const actor: Actor = {
    id: pet.id, pet, x, y, tx: x, ty: y,
    facing: rand() < 0.5 ? 1 : -1, action: 'idle', t: 0, dur: rr(rand, 0.5, 2.5),
    override: null, hop: 0, hovered: false, sepX: 0, sepY: 0, stuckT: 0, lastX: x, lastY: y, animT: rand() * 10, moving: false,
    drag: false, lift: 0, fly: null, bounceT: 0, bath: null, shakeX: 0,
  }
  clampActor(actor, L) // 剛好出生在障礙物裡就推出來
  actor.tx = actor.x
  actor.ty = actor.y
  actor.lastX = actor.x
  actor.lastY = actor.y
  return actor
}

/** 放開滑鼠：該怎麼落地。在水面上 = 'water'；站得住 = 'land'；否則 'return'（彈回最近的可站位置） */
export function dropKind(L: Layout, x: number, y: number): 'water' | 'land' | 'return' {
  if (inWater(L, x, y, 1.12)) return 'water'
  return isWalkable(L, x, y) ? 'land' : 'return'
}

/** 點是否落在障礙物裡 */
function blocked(L: Layout, x: number, y: number): boolean {
  return blockers(L).some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)
}

/** 把位置限制在活動範圍內（也就是不會走進住家、不會停在燈柱後面），並把站進障礙物的寵物推到最近的出口 */
export function clampActor(a: Actor, L: Layout): void {
  const b = petBounds(L)
  a.x = Math.min(b.x1, Math.max(b.x0, a.x))
  a.y = Math.min(b.y1, Math.max(b.y0, a.y))
  for (const r of blockers(L)) {
    if (!(a.x > r.x0 && a.x < r.x1 && a.y > r.y0 && a.y < r.y1)) continue
    const toDown = r.y1 - a.y
    const toLeft = a.x - r.x0
    const toRight = r.x1 - a.x
    const m = Math.min(toDown, toLeft, toRight)
    if (m === toDown) a.y = Math.min(b.y1, r.y1 + 0.5)
    else if (m === toLeft && r.x0 - 0.5 >= b.x0) a.x = r.x0 - 0.5
    else if (m === toRight && r.x1 + 0.5 <= b.x1) a.x = r.x1 + 0.5
    else a.y = Math.min(b.y1, r.y1 + 0.5)
  }
}

/** 挑下一個目標：在範圍內（草地與小路都會去）、不在障礙物裡、離別的寵物與牠們的目標都遠一點 */
function pickTarget(a: Actor, env: BehaviorEnv, far = false): void {
  const b = petBounds(env.layout)
  let best = { x: a.x, y: a.y, score: -1 }
  for (let i = 0; i < 12; i++) {
    const x = rr(env.rand, b.x0, b.x1)
    const y = rr(env.rand, b.y0, b.y1)
    if (blocked(env.layout, x, y)) continue
    let near = Infinity
    for (const o of env.others) {
      if (o === a) continue
      near = Math.min(near, Math.hypot((o.x - x) / 46, (o.y - y) / 15), Math.hypot((o.tx - x) / 46, (o.ty - y) / 15))
    }
    // 想要的是：離別的寵物遠、移動距離適中（散步時要遠）
    const dist = Math.hypot(x - a.x, y - a.y)
    const score = Math.min(near, 2.5) * 40 + (far ? dist * 0.5 : Math.min(dist, 120) * 0.15) + env.rand() * 10
    if (score > best.score) best = { x, y, score }
  }
  a.tx = best.x
  a.ty = best.y
}

function setAction(a: Actor, action: Action, dur: number): void {
  a.action = action
  a.t = 0
  a.dur = dur
}

/** 指令觸發的動作（對應 FarmEffect 的 anim） */
export function triggerAnim(a: Actor, anim: 'eat' | 'pet' | 'bath' | 'walk' | 'groom' | 'wake', rand: () => number): void {
  const cat = a.pet.species === 'cat'
  switch (anim) {
    case 'eat':
      a.override = { action: 'eat', left: 2.6, speedMul: 0, tag: 'eat' }
      break
    case 'pet':
      a.override = { action: 'happy', left: 2, speedMul: 0, tag: 'pet' }
      break
    case 'bath':
      a.override = { action: cat ? 'sit' : 'happy', left: 2.6, speedMul: 0, tag: 'bath' }
      break
    case 'walk':
      a.override = { action: 'walk', left: 6, speedMul: 2.4, tag: 'walk' }
      a.tx = a.x
      a.ty = a.y
      break
    case 'groom':
      a.override = { action: 'groom', left: 2.8, speedMul: 0, tag: 'groom' }
      break
    case 'wake':
      a.override = { action: cat ? 'idle' : 'happy', left: 1.4, speedMul: 0, tag: 'wake' }
      break
  }
  a.hop = 0.4
  void rand
}

/** 每個影格更新一隻寵物 */
export function updateActor(a: Actor, dt: number, env: BehaviorEnv): void {
  const sp = SPECIES[a.pet.species]
  a.animT += dt
  a.t += dt
  if (a.hop > 0) a.hop = Math.max(0, a.hop - dt)
  if (a.bounceT > 0) a.bounceT = Math.max(0, a.bounceT - dt)
  a.moving = false

  // 被拖著、飛回去、洗澡：這些期間不走一般的行為
  const liftTo = a.drag ? 9 : a.fly || a.bath ? a.lift : 0
  a.lift += (liftTo - a.lift) * Math.min(1, dt * 22)
  if (Math.abs(a.lift - liftTo) < 0.05) a.lift = liftTo
  if (a.drag) {
    if (a.action !== 'happy') setAction(a, 'happy', 1e9)
    a.override = null
    return
  }
  if (a.fly) {
    const f = a.fly
    f.t += dt
    const k = Math.min(1, f.t / f.dur)
    a.x = f.fx + (f.tx - f.fx) * k
    a.y = f.fy + (f.ty - f.fy) * k
    a.lift = Math.sin(k * Math.PI) * 16
    if (Math.abs(f.tx - f.fx) > 1) a.facing = f.tx > f.fx ? 1 : -1
    if (k >= 1) {
      a.fly = null
      a.lift = 0
      a.bounceT = 0.5
      a.tx = a.x
      a.ty = a.y
      setAction(a, 'idle', rr(env.rand, 0.8, 1.6))
    }
    return
  }
  if (a.bath) {
    updateBath(a, dt, env)
    return
  }

  // 選取中（氣泡選單開著）：停在原地等你選，但指令的動作（吃、開心…）照樣演出
  const frozen = env.selectedId === a.id

  // 睡覺：夜間規則沿用（23:00～6:00，被叫醒或互動後閒置一段時間才回去睡）
  const sleeping = isSleeping(a.pet, env.hour, env.nowMs)
  if (sleeping) {
    a.override = a.override?.tag === 'pet' ? a.override : null
    if (a.action !== 'sleep') setAction(a, 'sleep', 1e9)
    if (a.override) {
      a.override.left -= dt
      if (a.override.left <= 0) a.override = null
    }
    return
  }
  if (a.action === 'sleep') setAction(a, 'idle', rr(env.rand, 0.6, 1.4))

  // 指令觸發的動作
  if (a.override) {
    const o = a.override
    o.left -= dt
    const shown: Action = frozen && o.speedMul > 0 ? 'happy' : o.action // 選單開著時散步改成原地開心
    if (a.action !== shown) setAction(a, shown, o.left)
    if (o.tag === 'pet' && env.rand() < dt * 2.2) env.emit('heart', a.x + rr(env.rand, -8, 8), a.y - 28)
    if (o.tag === 'bath' && env.rand() < dt * 9) env.emit('bubble', a.x + rr(env.rand, -14, 14), a.y - rr(env.rand, 6, 30))
    if (o.tag === 'groom' && env.rand() < dt * 1.2) env.emit('heart', a.x, a.y - 30)
    if (o.speedMul > 0 && !frozen) {
      // 散步：快步繞著走
      const d = Math.hypot(a.tx - a.x, a.ty - a.y)
      if (d < 6) pickTarget(a, env, true)
      moveToward(a, dt, sp.speed * o.speedMul, env)
      if (env.rand() < dt * 1.5) env.emit('note', a.x, a.y - 30)
    }
    if (o.left <= 0) {
      a.override = null
      setAction(a, 'idle', rr(env.rand, 0.8, 2))
    }
    return
  }

  if (frozen) {
    if (a.action === 'walk') setAction(a, 'idle', 1)
    return
  }

  switch (a.action) {
    case 'walk': {
      const d = Math.hypot(a.tx - a.x, a.ty - a.y)
      if (d < 3 || a.t > 14) {
        const cat = a.pet.species === 'cat'
        const r = env.rand()
        if (r < (cat ? 0.5 : 0.3)) setAction(a, 'sit', rr(env.rand, 3, 8))
        else setAction(a, 'idle', rr(env.rand, 1, 3.5))
        break
      }
      moveToward(a, dt, sp.speed, env)
      // 卡住偵測：兩秒內幾乎沒移動 → 換個目標
      a.stuckT += dt
      if (a.stuckT > 2) {
        if (Math.hypot(a.x - a.lastX, a.y - a.lastY) < 4) pickTarget(a, env)
        a.stuckT = 0
        a.lastX = a.x
        a.lastY = a.y
      }
      break
    }
    case 'sit':
    case 'idle':
    case 'happy':
    case 'eat':
    case 'groom': {
      if (a.t >= a.dur) {
        const cat = a.pet.species === 'cat'
        const r = env.rand()
        if (a.action === 'idle' && r < (cat ? 0.45 : 0.7)) {
          pickTarget(a, env)
          setAction(a, 'walk', 0)
          a.stuckT = 0
          a.lastX = a.x
          a.lastY = a.y
        } else if (a.action !== 'sit' && r < 0.7) setAction(a, 'sit', rr(env.rand, 3, 8))
        else setAction(a, 'idle', rr(env.rand, 1.5, 4))
      }
      // 靜止時也被輕輕推開，避免疊在一起
      a.x += a.sepX * dt * 1.0
      a.y += a.sepY * dt * 1.0
      break
    }
    default:
      break
  }
  clampActor(a, env.layout)
}

/** 水池洗澡中的寵物（跳進去、泡澡、爬出來、甩水）；走去水池前不算 */
export function isBathing(a: Actor): boolean {
  return a.bath !== null && a.bath.phase !== 'walk'
}

/** 正在占用水池（同一時間只允許一隻） */
export function usesPond(a: Actor): boolean {
  const ph = a.bath?.phase
  return ph === 'jump' || ph === 'soak' || ph === 'climb'
}

/** 泡澡時，寵物腳底在水面上的位置（y 只用來排前後與氣泡選單錨點，實際畫在水面線以下一點） */
export function soakSpot(L: Layout): { x: number; y: number } {
  const w = waterEllipse(L)
  return { x: w.cx, y: w.cy + 8 }
}

/** 從氣泡選單選了「洗澡」：自己走到水池前，再跳進去。回傳 false 表示現在不能 */
export function beginBathWalk(a: Actor, L: Layout): boolean {
  if (a.bath || a.drag || a.fly) return false
  a.override = null
  a.bath = { phase: 'walk', t: 0, fromX: a.x, fromY: a.y }
  const st = pondStand(L)
  a.tx = st.x
  a.ty = st.y
  setAction(a, 'walk', 1e9)
  return true
}

/** 走去水池的途中被點到或拖曳：取消 */
export function cancelBath(a: Actor): void {
  if (a.bath?.phase !== 'walk') return
  a.bath = null
  a.tx = a.x
  a.ty = a.y
  setAction(a, 'idle', 1)
}

/** 直接跳進水池（拖曳放開在水面上，或走到水池前）。已經通過扣點與占用檢查 */
export function enterPond(a: Actor): void {
  a.bath = { phase: 'jump', t: 0, fromX: a.x, fromY: a.y }
  a.override = null
  setAction(a, 'sit', 1e9)
}

function updateBath(a: Actor, dt: number, env: BehaviorEnv): void {
  const b = a.bath!
  const L = env.layout
  const spot = soakSpot(L)
  const sp = SPECIES[a.pet.species]
  b.t += dt
  switch (b.phase) {
    case 'walk': {
      const st = pondStand(L)
      a.tx = st.x
      a.ty = st.y
      if (Math.hypot(a.tx - a.x, a.ty - a.y) < 3) {
        const err = env.requestBath(a)
        if (err) {
          env.notify(err)
          a.bath = null
          setAction(a, 'idle', 1.2)
          return
        }
        enterPond(a)
        return
      }
      moveToward(a, dt, sp.speed * 1.6, env)
      // 走太久（例如被擠開卡住）：放棄
      if (b.t > 20) {
        a.bath = null
        setAction(a, 'idle', 1)
      }
      break
    }
    case 'jump': {
      const k = Math.min(1, b.t / BATH_TIMES.jump)
      a.x = b.fromX + (spot.x - b.fromX) * k
      a.y = b.fromY + (spot.y - b.fromY) * k
      a.lift = Math.sin(k * Math.PI) * 14
      if (Math.abs(spot.x - b.fromX) > 1) a.facing = spot.x > b.fromX ? 1 : -1
      if (k >= 1) {
        a.lift = 0
        b.phase = 'soak'
        b.t = 0
        a.x = spot.x
        a.y = spot.y
        env.fx('splash', spot.x, spot.y - 2)
        setAction(a, 'sit', 1e9)
      }
      break
    }
    case 'soak': {
      a.x = spot.x
      a.y = spot.y
      if (env.rand() < dt * 5) env.emit('wbubble', spot.x + rr(env.rand, -14, 14), spot.y - 8)
      if (b.t >= BATH_TIMES.soak) {
        b.phase = 'climb'
        b.t = 0
        b.fromX = a.x
        b.fromY = a.y
        env.fx('splash', spot.x, spot.y - 2)
      }
      break
    }
    case 'climb': {
      const st = pondStand(L)
      const k = Math.min(1, b.t / BATH_TIMES.climb)
      a.x = b.fromX + (st.x - b.fromX) * k
      a.y = b.fromY + (st.y - b.fromY) * k
      a.lift = Math.sin(k * Math.PI) * 12
      a.facing = st.x >= b.fromX ? 1 : -1
      if (k >= 1) {
        a.lift = 0
        b.phase = 'shake'
        b.t = 0
        a.bounceT = 0.4
        setAction(a, a.pet.species === 'cat' ? 'idle' : 'happy', 1e9)
      }
      break
    }
    case 'shake': {
      // 甩水：水平快速抖動並噴水滴。貓甩完會坐下來瞪人
      const cat = a.pet.species === 'cat'
      a.shakeX = Math.floor(b.t / 0.07) % 2 === 0 ? -1 : 1
      if (cat && b.t > BATH_TIMES.shake - 0.6) {
        a.shakeX = 0
        if (a.action !== 'sit') setAction(a, 'sit', 1e9)
      } else if (env.rand() < dt * 14) env.emit('drop', a.x + rr(env.rand, -12, 12), a.y - rr(env.rand, 14, 30))
      if (b.t >= BATH_TIMES.shake) {
        a.shakeX = 0
        a.bath = null
        a.tx = a.x
        a.ty = a.y
        setAction(a, 'idle', rr(env.rand, 1, 2))
      }
      break
    }
  }
}

function moveToward(a: Actor, dt: number, speed: number, env: BehaviorEnv): void {
  const dx = a.tx - a.x
  const dy = a.ty - a.y
  const d = Math.hypot(dx, dy) || 1
  // 垂直方向走得慢一點（斜視角）
  let vx = (dx / d) * speed + a.sepX
  let vy = (dy / d) * speed * 0.55 + a.sepY * 0.6
  const m = Math.hypot(vx, vy)
  const lim = speed * 1.4
  if (m > lim) {
    vx *= lim / m
    vy *= lim / m
  }
  a.x += vx * dt
  a.y += vy * dt
  if (Math.abs(vx) > 1.5) a.facing = vx > 0 ? 1 : -1
  a.moving = true
  clampActor(a, env.layout)
}

/** 柔和的避讓：靠太近時各自多一點離開對方的速度（不是硬推開） */
export function computeSeparation(actors: Actor[]): void {
  for (const a of actors) {
    a.sepX = 0
    a.sepY = 0
  }
  for (let i = 0; i < actors.length; i++)
    for (let j = i + 1; j < actors.length; j++) {
      const A = actors[i]
      const B = actors[j]
      const rx = 50
      const ry = 16
      let dx = A.x - B.x
      let dy = A.y - B.y
      const d = Math.hypot(dx / rx, dy / ry)
      if (d >= 1.75) continue
      if (d < 1e-3) {
        dx = (i % 2 ? 1 : -1) * 0.5
        dy = 0.2
      }
      const s = (1.75 - Math.min(d, 1.75)) / 1.75
      const gl = Math.hypot(dx / (rx * rx), dy / (ry * ry)) || 1
      const ux = dx / (rx * rx) / gl
      const uy = dy / (ry * ry) / gl
      const push = s * 60
      // 睡著的不動，由醒著的那隻讓開
      const wa = A.action === 'sleep' ? 0 : B.action === 'sleep' ? 1 : 0.5
      A.sepX += ux * push * wa * 2
      A.sepY += uy * push * wa * 2
      B.sepX -= ux * push * (1 - wa) * 2
      B.sepY -= uy * push * (1 - wa) * 2
    }
  for (const a of actors) {
    const m = Math.hypot(a.sepX, a.sepY)
    if (m > 55) {
      a.sepX *= 55 / m
      a.sepY *= 55 / m
    }
  }
}

/** 資源鍵名：dog_shiba、cat_orange… */
export function assetPrefix(pet: Pet): string {
  return `${pet.species}_${variantOf(pet.species, pet.variant).assetKey}`
}

/** 目前這個動作該畫哪一幀的鍵名 */
export function frameKeyOf(a: Actor): string {
  const prefix = assetPrefix(a.pet)
  const anim = ANIMS[a.pet.species][a.action]
  const i = anim.frames.length > 1 ? Math.floor(a.animT * anim.fps) % anim.frames.length : 0
  return `${prefix}_${anim.frames[i]}`
}
