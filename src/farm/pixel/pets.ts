import { SPECIES, variantOf, type SpeciesId } from '../config/species'
import type { Pet } from '../save/types'
import { isSleeping } from '../sim/rules'
import type { Layout } from './layout'
import { petBounds } from './layout'

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
  emit: (kind: 'heart' | 'bubble' | 'note', x: number, y: number) => void
}

const rr = (rand: () => number, a: number, b: number): number => a + rand() * (b - a)

export function createActor(pet: Pet, L: Layout, rand: () => number): Actor {
  const b = petBounds(L)
  const x = rr(rand, b.x0, b.x1)
  const y = rr(rand, b.y0, b.y1)
  return {
    id: pet.id, pet, x, y, tx: x, ty: y,
    facing: rand() < 0.5 ? 1 : -1, action: 'idle', t: 0, dur: rr(rand, 0.5, 2.5),
    override: null, hop: 0, hovered: false, sepX: 0, sepY: 0, stuckT: 0, lastX: x, lastY: y, animT: rand() * 10, moving: false,
  }
}

/** 把位置限制在活動範圍內（也就是不會走進住家） */
export function clampActor(a: Actor, L: Layout): void {
  const b = petBounds(L)
  a.x = Math.min(b.x1, Math.max(b.x0, a.x))
  a.y = Math.min(b.y1, Math.max(b.y0, a.y))
}

/** 挑下一個目標：在範圍內、離其他寵物遠一點 */
function pickTarget(a: Actor, env: BehaviorEnv, far = false): void {
  const b = petBounds(env.layout)
  let best = { x: a.x, y: a.y, score: -1 }
  for (let i = 0; i < 6; i++) {
    const x = rr(env.rand, b.x0, b.x1)
    const y = rr(env.rand, b.y0, b.y1)
    let near = Infinity
    for (const o of env.others) if (o !== a) near = Math.min(near, Math.hypot((o.x - x) * 0.7, (o.y - y) * 1.6))
    // 想要的是：離別的寵物遠、移動距離適中（散步時要遠）
    const dist = Math.hypot(x - a.x, y - a.y)
    const score = Math.min(near, 60) + (far ? dist * 0.5 : Math.min(dist, 90) * 0.2) + env.rand() * 8
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
  a.moving = false

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
      a.x += a.sepX * dt * 0.6
      a.y += a.sepY * dt * 0.6
      break
    }
    default:
      break
  }
  clampActor(a, env.layout)
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
      const rx = 40
      const ry = 12
      let dx = A.x - B.x
      let dy = A.y - B.y
      const d = Math.hypot(dx / rx, dy / ry)
      if (d >= 1.3) continue
      if (d < 1e-3) {
        dx = (i % 2 ? 1 : -1) * 0.5
        dy = 0.2
      }
      const s = (1.3 - Math.min(d, 1.3)) / 1.3
      const gl = Math.hypot(dx / (rx * rx), dy / (ry * ry)) || 1
      const ux = dx / (rx * rx) / gl
      const uy = dy / (ry * ry) / gl
      const push = s * 26
      // 睡著的不動，由醒著的那隻讓開
      const wa = A.action === 'sleep' ? 0 : B.action === 'sleep' ? 1 : 0.5
      A.sepX += ux * push * wa * 2
      A.sepY += uy * push * wa * 2
      B.sepX -= ux * push * (1 - wa) * 2
      B.sepY -= uy * push * (1 - wa) * 2
    }
  for (const a of actors) {
    const m = Math.hypot(a.sepX, a.sepY)
    if (m > 30) {
      a.sepX *= 30 / m
      a.sepY *= 30 / m
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
