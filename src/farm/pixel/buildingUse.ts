import { BALANCE } from '../config/balance'
import type { BuildingId } from '../config/buildings'
import type { BuildingSlot } from './layout'
import type { Action, Actor, BehaviorEnv } from './pets'

/**
 * 寵物使用建築的行為（邏輯）。只決定「去哪裡、做什麼動作（名稱）」，畫哪一幀由 pets.ts 的 ANIMS 表對應；不旋轉、不縮放。
 *
 *  - 食盆水盆（bowls）：飽食度低於門檻、沒在睡覺／洗澡／被操作、今天還有份量 → 走到食盆前吃（eat 動作），吃完走開。最多 2 隻同時吃，其他等待（照常閒晃，之後再檢查）。
 *  - 狗窩（kennel）／貓跳台（catTree）：睡覺時間走到旁邊（建築前方）睡（sleep 動作）；下雨時走到旁邊坐著躲雨（sit／idle）。各最多 2 隻。
 *    之後若有爬台素材再加貓爬上貓跳台的動畫（本版沒有素材，只站在旁邊）。
 *  - 建築被占滿、或這個視窗放不下建築 → 用原本的睡覺與（沒有）躲雨行為，不會互相推擠。
 */

export type UsePurpose = 'eat' | 'sleep' | 'shelter'

export interface BuildingUse {
  id: BuildingId
  seat: number
  purpose: UsePurpose
  /** walk：正在走去座位；at：已經在座位上 */
  phase: 'walk' | 'at'
  /** 這個階段已經過的時間（秒） */
  t: number
  /** 躲雨：雨停之後再待多久才離開（null = 還在下雨） */
  leaveIn: number | null
  /** 躲雨：下一次換姿勢（坐／站）的倒數（秒） */
  poseIn: number
  /** 走去座位的兩段路：lane = 先走到建築前方的走道（離已經坐著的寵物遠一點），再從下面走上座位 */
  stage: 'lane' | 'seat'
}

export interface Seat {
  x: number
  y: number
  /** 面向：1 = 右、-1 = 左 */
  face: 1 | -1
}

/** 座位離建築中心的水平距離：兩個座位並排，素材最寬的睡姿（黃金獵犬 56）也不重疊 */
const SEAT_DX: Partial<Record<BuildingId, number>> = { kennel: 30, bowls: 26, catTree: 22 }
/** 座位在建築腳底線再往下（前方）多少：站在建築前面，畫面上排在建築之前 */
const SEAT_DY: Record<UsePurpose, number> = { sleep: 7, shelter: 8, eat: 10 }

export function capacityOf(id: BuildingId): number {
  if (id === 'bowls') return BALANCE.buildings.bowls.capacity
  if (id === 'kennel') return BALANCE.buildings.kennel.capacity
  if (id === 'catTree') return BALANCE.buildings.catTree.capacity
  return 0
}

/** 一個建築的座位（腳底座標）：左右並排；食盆朝向中間，狗窩／貓跳台朝外 */
export function seatsOf(id: BuildingId, slot: BuildingSlot, purpose: UsePurpose): Seat[] {
  const n = capacityOf(id)
  const dx = SEAT_DX[id] ?? 24
  const out: Seat[] = []
  for (let i = 0; i < n; i++) {
    const side = n === 1 ? 0 : i === 0 ? -1 : 1
    const inward = id === 'bowls'
    out.push({ x: slot.x + side * dx, y: slot.y + SEAT_DY[purpose], face: (inward ? -side || 1 : side || 1) as 1 | -1 })
  }
  return out
}

/** 寵物回自己睡覺／躲雨的建築 */
/** 建築前方走道的位置（座位再往前 LANE_DY）：從草地或側面來的寵物先走到這條線，再往上走到座位，不會從別的寵物身上穿過去 */
const LANE_DY = 24

export function homeOf(a: Actor): BuildingId {
  return a.pet.species === 'dog' ? 'kennel' : 'catTree'
}

export function releaseUse(a: Actor): void {
  a.bld = null
  a.path = []
  a.pathKey = ''
}

/** 這個座位現在有沒有別的寵物占著（走過去的、坐著的都算） */
function seatTaken(env: BehaviorEnv, id: BuildingId, seat: number, except: Actor): boolean {
  for (const o of env.others) if (o !== except && o.bld && o.bld.id === id && o.bld.seat === seat) return true
  return false
}

/** 想去這個建築：挑離自己最近、還空著的座位；沒有空位回傳 false */
function claim(a: Actor, env: BehaviorEnv, id: BuildingId, purpose: UsePurpose): boolean {
  const slot = env.buildings.get(id)
  if (!slot) return false
  const seats = seatsOf(id, slot, purpose)
  let best = -1
  let bd = Infinity
  for (let i = 0; i < seats.length; i++) {
    if (seatTaken(env, id, i, a)) continue
    const d = Math.hypot(seats[i].x - a.x, (seats[i].y - a.y) * 1.6)
    if (d < bd) {
      bd = d
      best = i
    }
  }
  if (best < 0) return false
  const near = a.y >= slot.y + LANE_DY - 6 && Math.abs(a.x - seats[best].x) < 60
  a.bld = { id, seat: best, purpose, phase: 'walk', t: 0, leaveIn: null, poseIn: 0, stage: near ? 'seat' : 'lane' }
  a.tx = seats[best].x
  a.ty = seats[best].y
  a.path = []
  a.pathKey = ''
  return true
}

export interface UseOps {
  setAction: (a: Actor, action: Action, dur: number) => void
  moveToward: (a: Actor, dt: number, speed: number, env: BehaviorEnv) => void
}

const rr = (rand: () => number, a: number, b: number): number => a + rand() * (b - a)

/** 要不要因為飽食度去食盆 */
function wantsToEat(a: Actor, env: BehaviorEnv): boolean {
  return a.pet.satiety < BALANCE.buildings.bowls.threshold && env.bowlLeft > 0 && a.bowlCool <= 0
}

/**
 * 每個影格呼叫（睡覺、一般行為之前）。回傳 true = 這隻寵物這個影格由建築行為處理（走去座位或在座位上），
 * 呼叫端就不再跑一般行為；false = 沒在使用建築，照一般行為走。
 * 睡覺中、被叫醒、被拖曳、洗澡等既有互動：拖曳與洗澡在呼叫之前就處理掉了（並呼叫 releaseUse），
 * 叫醒、餵食、撫摸會產生 override 或讓 isSleeping 變 false，這裡會放掉座位，離開建築後恢復一般行為。
 */
export function updateBuildingUse(a: Actor, dt: number, env: BehaviorEnv, st: { sleeping: boolean; frozen: boolean }, ops: UseOps, speed: number): boolean {
  const cfg = BALANCE.buildings
  const raining = env.weather === 'rain'
  if (a.bldCool > 0) a.bldCool = Math.max(0, a.bldCool - dt)
  if (a.bowlCool > 0) a.bowlCool = Math.max(0, a.bowlCool - dt)
  // 躲雨的出發倒數：下雨後每隻隨機等一下才出發；雨停就清掉
  if (raining) {
    if (a.rainIn === null) a.rainIn = rr(env.rand, cfg.shelter.startDelay[0], cfg.shelter.startDelay[1])
    else if (a.rainIn > 0) a.rainIn -= dt
  } else a.rainIn = null

  let use = a.bld
  if (use) {
    const slot = env.buildings.get(use.id)
    let keep = !!slot
    if (keep && use.purpose === 'sleep' && !st.sleeping) keep = false
    if (keep && use.purpose === 'shelter' && st.sleeping) {
      // 躲雨躲到睡覺時間：留在原位，直接睡
      use.purpose = 'sleep'
      if (use.phase === 'at') ops.setAction(a, 'sleep', 1e9)
    }
    if (keep && use.purpose === 'eat' && st.sleeping) keep = false
    // 被操作（餵食、撫摸、叫醒、散步…）：離開建築去互動；睡著時被撫摸（override tag pet）不會醒，留在座位上
    if (keep && a.override && !(use.purpose === 'sleep' && use.phase === 'at' && a.override.tag === 'pet')) keep = false
    // 氣泡選單開著：還在走的就停下來；已經在座位上的繼續
    if (keep && st.frozen && use.phase === 'walk') keep = false
    if (!keep) {
      releaseUse(a)
      use = null
    }
  }

  if (!use && !st.frozen && !a.override) {
    const home = homeOf(a)
    if (st.sleeping) {
      if (a.bldCool <= 0 && env.buildings.has(home)) claim(a, env, home, 'sleep')
    } else if (a.bldCool <= 0) {
      if (env.buildings.has('bowls') && wantsToEat(a, env) && claim(a, env, 'bowls', 'eat')) {
        /* 去吃 */
      } else if (raining && a.rainIn !== null && a.rainIn <= 0 && env.buildings.has(home)) claim(a, env, home, 'shelter')
    }
    use = a.bld
  }
  if (!use) return false

  const slot = env.buildings.get(use.id)!
  const seat = seatsOf(use.id, slot, use.purpose)[use.seat]
  use.t += dt

  if (use.phase === 'walk') {
    // 先走到建築前方的走道（lane），再從下面走上座位
    const lane = { x: seat.x, y: slot.y + LANE_DY }
    if (use.stage === 'lane' && Math.hypot(lane.x - a.x, lane.y - a.y) < 4) use.stage = 'seat'
    const goal = use.stage === 'lane' ? lane : seat
    a.tx = goal.x
    a.ty = goal.y
    if (a.action !== 'walk') ops.setAction(a, 'walk', 1e9)
    if (use.stage === 'seat' && Math.hypot(seat.x - a.x, seat.y - a.y) < 2.5) {
      a.x = seat.x
      a.y = seat.y
      a.facing = seat.face
      a.moving = false
      if (use.purpose === 'eat') {
        const err = env.eatAtBowl(a)
        if (err) {
          // 份量被別人吃完了：放棄，隔一陣子再說
          releaseUse(a)
          a.bowlCool = 20
          ops.setAction(a, 'idle', 1)
          return true
        }
        use.phase = 'at'
        use.t = 0
        ops.setAction(a, 'eat', cfg.bowls.eatSeconds)
      } else if (use.purpose === 'sleep') {
        use.phase = 'at'
        use.t = 0
        ops.setAction(a, 'sleep', 1e9)
      } else {
        use.phase = 'at'
        use.t = 0
        use.poseIn = rr(env.rand, 4, 8)
        ops.setAction(a, 'sit', 1e9)
      }
      return true
    }
    ops.moveToward(a, dt, speed, env)
    // 兩秒幾乎沒走動（被擠住）：重新規劃路線；走太久（被擠開、繞不過去）：放棄，隔一陣子再試
    a.stuckT += dt
    if (a.stuckT > 2) {
      if (Math.hypot(a.x - a.lastX, a.y - a.lastY) < 3) a.pathKey = ''
      a.stuckT = 0
      a.lastX = a.x
      a.lastY = a.y
    }
    if (use.t > 40) {
      releaseUse(a)
      a.bldCool = 20
      ops.setAction(a, 'idle', 1)
    }
    return true
  }

  // 已經在座位上：位置固定（不受避讓推擠）
  a.x = seat.x
  a.y = seat.y
  a.tx = seat.x
  a.ty = seat.y
  a.moving = false
  if (use.purpose === 'sleep') {
    if (a.action !== 'sleep') ops.setAction(a, 'sleep', 1e9)
    if (a.override) {
      a.override.left -= dt
      if (a.override.left <= 0) a.override = null
    }
  } else if (use.purpose === 'eat') {
    if (a.action !== 'eat') ops.setAction(a, 'eat', cfg.bowls.eatSeconds)
    if (use.t >= cfg.bowls.eatSeconds) {
      releaseUse(a)
      a.bowlCool = cfg.bowls.revisitSeconds
      ops.setAction(a, 'idle', rr(env.rand, 0.8, 1.6))
    }
  } else {
    // 躲雨：坐一會兒、站一會兒；雨停後再待一下才離開
    if (raining) use.leaveIn = null
    else if (use.leaveIn === null) use.leaveIn = rr(env.rand, cfg.shelter.leaveDelay[0], cfg.shelter.leaveDelay[1])
    else {
      use.leaveIn -= dt
      if (use.leaveIn <= 0) {
        releaseUse(a)
        ops.setAction(a, 'idle', rr(env.rand, 0.8, 1.6))
        return true
      }
    }
    use.poseIn -= dt
    if (use.poseIn <= 0) {
      use.poseIn = rr(env.rand, 4, 8)
      ops.setAction(a, a.action === 'sit' ? 'idle' : 'sit', 1e9)
    }
  }
  return true
}
