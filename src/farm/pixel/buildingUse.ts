import { BALANCE } from '../config/balance'
import type { BuildingId } from '../config/buildings'
import { KENNEL_AX, KENNEL_H, CAT_TREE_H, CAMPFIRE_SIDE_SEAT_DX, petMinX, type BuildingSlot } from './layout'
import { campfireLit } from '../sim/rules'
import type { Action, Actor, BehaviorEnv } from './pets'

/**
 * 寵物使用建築的行為（邏輯）。只決定「去哪裡、做什麼動作（名稱）」，畫哪一幀由 pets.ts 的 ANIMS 表對應；不旋轉、不縮放。
 *
 *  - 食盆水盆（bowls）：飽食度低於門檻、沒在睡覺／洗澡／被操作、今天還有份量 → 走到食盆前吃（eat 動作），吃完走開。最多 2 隻同時吃，其他等待（照常閒晃，之後再檢查）。
 *  - 狗窩（kennel）／貓跳台（catTree）：睡覺時間走到座位旁，直接出現在座位上睡（沒有跳上去、走進去的過場）；各 2 個座位：
 *      狗窩 0 = 窩裡（只露出頭與 ZZZ，身體被窩的前緣遮住，畫面上裁切到門洞）、1 = 窩門口（完整躺在窩前，與座位 0 錯開約半個身體）；
 *      貓跳台 0 = 頂部圓平台、1 = 中間平台。下雨時狗窩的狗用同樣兩個座位（窩裡的狗躺著、門口的狗坐著），貓跳台的貓睡著就繼續睡在平台上，
 *      醒著的貓躲在跳台旁（建築前方的地面座位，沒有爬台素材）。
 *  - 座位坐滿時多出來的寵物睡覺、躲雨改站在建築「前方」（index >= capacity，沒有心情加成）；建築被占滿、或這個視窗放不下建築 → 用原本的睡覺行為，不會互相推擠。
 */

export type UsePurpose = 'eat' | 'sleep' | 'shelter' | 'gather'

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
  /** 營火聚集：這次要待多久（秒） */
  dur: number
  /** 座位旁邊的地面位置（走得到的地方）：走到這裡才出現在座位上；座位被放掉（叫醒、建築消失）時寵物回到這裡 */
  near: { x: number; y: number }
}

/**
 * 座位種類：ground = 地面（腳底就是座位）；inside = 狗窩裡（畫面上裁切到門洞，只露出頭）；platform = 貓跳台的平台（腳底在平台表面）。
 * inside／platform 的座位不在可走範圍內，寵物走到 near 之後直接出現在座位上。
 */
export type SeatKind = 'ground' | 'inside' | 'platform'

export interface Seat {
  x: number
  y: number
  /** 面向：1 = 右、-1 = 左 */
  face: 1 | -1
  kind: SeatKind
  /** 走到座位旁邊的地面位置（ground 座位就是座位本身） */
  near: { x: number; y: number }
}

/** 食盆、貓跳台躲雨的地面座位離建築中心的水平距離：兩個座位並排，素材最寬的睡姿（黃金獵犬 56）也不重疊 */
const SEAT_DX: Partial<Record<BuildingId, number>> = { bowls: 26, catTree: 24 }
/** 地面座位在建築腳底線再往下（前方）多少：站在建築前面，畫面上排在建築之前 */
const SEAT_DY: Record<UsePurpose, number> = { sleep: 7, shelter: 8, eat: 10, gather: 12 }

/**
 * 狗窩的座位幾何（座標都相對於狗窩素材左上角，像素）：門洞內部（要和素材一致，素材改尺寸要重量）。
 * 窩裡的狗畫在狗窩素材之後、裁切到門洞（KENNEL_DOOR_CLIP 是門洞的階梯形矩形，頂端是拱形），底邊貼在窩內墊子前緣（KENNEL_INSIDE_BOTTOM）；
 * 吻部對齊門洞右緣（KENNEL_INSIDE_RIGHT），身體被左邊的門框擋住，所以只露出頭。窩前的框緣在門洞底邊之下，不會被狗蓋到。
 */
export const KENNEL_DOOR_CLIP: readonly { x0: number; x1: number; y0: number; y1: number }[] = [
  { x0: 32, x1: 45, y0: 44, y1: 45 },
  { x0: 30, x1: 47, y0: 45, y1: 47 },
  { x0: 28, x1: 49, y0: 47, y1: 49 },
  { x0: 28, x1: 50, y0: 49, y1: 73 },
]
export const KENNEL_INSIDE_RIGHT = 49
export const KENNEL_INSIDE_BOTTOM = 73
/** 門洞中心 x（相對素材左緣） */
export const KENNEL_DOOR_CX = 39
/** 窩門口的狗：身體中心離門洞中心的水平距離（約半個身體），頭朝左靠著窩 */
const KENNEL_FRONT_DX = 21
/** 貓跳台平台的位置（相對素材左上角）：頂部圓平台表面中心、中間平台表面前緣中心；貓的腳底落在這裡 */
export const CAT_TREE_TOP_SEAT = { x: 46, y: 9 }
export const CAT_TREE_MID_SEAT = { x: 19, y: 34 }

export function capacityOf(id: BuildingId): number {
  if (id === 'campfire') return BALANCE.buildings.campfire.capacity
  if (id === 'bowls') return BALANCE.buildings.bowls.capacity
  if (id === 'kennel') return BALANCE.buildings.kennel.capacity
  if (id === 'catTree') return BALANCE.buildings.catTree.capacity
  return 0
}

/**
 * 座位坐滿時多出來的寵物（睡覺、躲雨）改睡在建築「前方」的可走位置：腳底比建築腳底低 OVERFLOW_DY，
 * 不會被屋頂遮住，也離洗澡通道很遠。每個建築 2 個，排在真正的座位之後（index >= capacity）。食盆沒有。
 */
const OVERFLOW_DX: Partial<Record<BuildingId, [number, number]>> = { kennel: [20, 76], catTree: [-40, 40] }
const OVERFLOW_DY = 28

/** 這個座位是「多出來的」前方位置（不是建築旁的真座位，沒有睡覺心情加成） */
export function isOverflowSeat(id: BuildingId, seat: number): boolean {
  return seat >= capacityOf(id)
}

/** 一個建築的座位（腳底座標）。狗窩（睡覺、躲雨）：0 = 窩裡、1 = 窩門口；貓跳台睡覺：0 = 頂部平台、1 = 中間平台；
 *  其餘（食盆、貓跳台躲雨）是建築前方的地面座位，左右並排；食盆朝向中間 */
export function seatsOf(id: BuildingId, slot: BuildingSlot, purpose: UsePurpose): Seat[] {
  const n = capacityOf(id)
  const out: Seat[] = []
  const left = slot.x - KENNEL_AX
  if (id === 'kennel' && purpose !== 'eat') {
    const doorX = left + KENNEL_DOOR_CX
    // 狗窩在路燈後面、門在可走範圍的左緣附近：窩前的位置只能站在 petMinX 右邊（左邊被燈座的石圈蓋住）
    const minX = petMinX() + 3
    out.push({ x: left + KENNEL_INSIDE_RIGHT - 24, y: slot.y - KENNEL_H + KENNEL_INSIDE_BOTTOM, face: 1, kind: 'inside', near: { x: Math.max(doorX - 4, minX), y: slot.y + 20 } })
    // 躲雨時站著或坐著（比躺著高），再往右一點，不擋住窩裡的狗的頭
    const front = { x: Math.max(doorX + KENNEL_FRONT_DX + (purpose === 'shelter' ? 14 : 0), minX + 4), y: slot.y + 8 }
    out.push({ ...front, face: -1, kind: 'ground', near: front })
  } else if (id === 'catTree' && purpose === 'sleep') {
    const top = slot.y - CAT_TREE_H
    const tl = slot.x - 36
    out.push({ x: tl + CAT_TREE_TOP_SEAT.x, y: top + CAT_TREE_TOP_SEAT.y, face: -1, kind: 'platform', near: { x: slot.x + 8, y: slot.y + 12 } })
    out.push({ x: tl + CAT_TREE_MID_SEAT.x, y: top + CAT_TREE_MID_SEAT.y, face: 1, kind: 'platform', near: { x: slot.x - 16, y: slot.y + 12 } })
  } else if (id === 'campfire') {
    // 營火前方與兩側（不在火的後面）：前面兩個、左右各一個，面向火堆
    for (const [dx, dy, face] of [[-30, 16, 1], [30, 16, -1], [-CAMPFIRE_SIDE_SEAT_DX, 2, 1], [CAMPFIRE_SIDE_SEAT_DX, 2, -1]] as const) {
      const g = { x: slot.x + dx, y: slot.y + dy }
      out.push({ ...g, face, kind: 'ground', near: g })
    }
  } else {
    const dx = SEAT_DX[id] ?? 24
    for (let i = 0; i < n; i++) {
      const side = n === 1 ? 0 : i === 0 ? -1 : 1
      const inward = id === 'bowls'
      const g = { x: slot.x + side * dx, y: slot.y + SEAT_DY[purpose] }
      out.push({ ...g, face: (inward ? -side || 1 : side || 1) as 1 | -1, kind: 'ground', near: g })
    }
  }
  const odx = OVERFLOW_DX[id]
  if (odx !== undefined && purpose !== 'eat')
    odx.forEach((dx, i) => {
      const g = { x: slot.x + dx, y: slot.y + OVERFLOW_DY }
      out.push({ ...g, face: (i === 0 ? -1 : 1) as 1 | -1, kind: 'ground', near: g })
    })
  return out
}

/** 寵物回自己睡覺／躲雨的建築 */
/** 建築前方走道的位置（座位再往前 LANE_DY）：從草地或側面來的寵物先走到這條線，再往上走到座位，不會從別的寵物身上穿過去 */
const LANE_DY = 24

export function homeOf(a: Actor): BuildingId {
  return a.pet.species === 'dog' ? 'kennel' : 'catTree'
}

/**
 * 放掉座位。原本在窩裡、平台上的寵物（座位不在可走範圍內）回到座位旁邊的地面（叫醒、建築消失時），
 * 不會留在半空中；拖曳開始時 toGround 傳 false（寵物跟著游標，位置由拖曳決定）。
 */
export function releaseUse(a: Actor, toGround = true): void {
  const u = a.bld
  if (u && toGround && u.phase === 'at') {
    a.x = u.near.x
    a.y = u.near.y
    a.tx = a.x
    a.ty = a.y
  }
  a.bld = null
  a.path = []
  a.pathKey = ''
}

/** 這個座位現在有沒有別的寵物占著（走過去的、坐著的都算） */
function seatTaken(env: BehaviorEnv, id: BuildingId, seat: number, except: Actor): boolean {
  for (const o of env.others) if (o !== except && o.bld && o.bld.id === id && o.bld.seat === seat) return true
  return false
}

/** 夜晚營火亮著、醒著而且沒在做別的事的寵物：有一定機率走去營火旁聚集。回傳是否有去 */
function tryGather(a: Actor, env: BehaviorEnv, dt: number): boolean {
  const cfg = BALANCE.buildings.campfire
  if (!env.buildings.has('campfire') || a.gatherCool > 0 || !campfireLit(env.hour) || env.rand() >= (dt * cfg.chancePerMinute) / 60) return false
  if (!claim(a, env, 'campfire', 'gather')) return false
  a.bld!.dur = rr(env.rand, cfg.gatherSeconds[0], cfg.gatherSeconds[1])
  return true
}

/** 想去這個建築：挑離自己最近、還空著的座位；沒有空位回傳 false */
function claim(a: Actor, env: BehaviorEnv, id: BuildingId, purpose: UsePurpose): boolean {
  const slot = env.buildings.get(id)
  if (!slot) return false
  const seats = seatsOf(id, slot, purpose)
  let best = -1
  let bd = Infinity
  // 先找真座位；都被占了才用建築前方多出來的位置
  for (const overflow of [false, true]) {
    for (let i = 0; i < seats.length; i++) {
      if (isOverflowSeat(id, i) !== overflow || seatTaken(env, id, i, a)) continue
      const d = Math.hypot(seats[i].near.x - a.x, (seats[i].near.y - a.y) * 1.6)
      if (d < bd) {
        bd = d
        best = i
      }
    }
    if (best >= 0) break
  }
  if (best < 0) return false
  const nr = seats[best].near
  const close = a.y >= slot.y + LANE_DY - 6 && Math.abs(a.x - nr.x) < 60
  const noLane = id === 'campfire' // 營火在草地上，直接走到座位旁（A* 繞行），不繞前方走道
  a.bld = { id, seat: best, purpose, phase: 'walk', t: 0, leaveIn: null, poseIn: 0, stage: close || noLane ? 'seat' : 'lane', near: nr, dur: 0 }
  a.tx = nr.x
  a.ty = nr.y
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
  if (a.gatherCool > 0) a.gatherCool = Math.max(0, a.gatherCool - dt)
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
    // 躲雨躲到睡覺時間：放掉躲雨座位（回到座位旁），下面再依睡覺座位重新分配（睡覺座位和躲雨座位的位置不一樣）
    if (keep && use.purpose === 'shelter' && st.sleeping) {
      keep = false
      a.bldCool = 0
    }
    if (keep && use.purpose === 'eat' && st.sleeping) keep = false
    // 營火聚集：睡覺時間、下雨、營火熄滅就離開（回到座位旁，之後恢復一般行為或去睡覺座位／躲雨）
    if (keep && use.purpose === 'gather' && (st.sleeping || raining || !campfireLit(env.hour))) keep = false
    // 還在走去食盆的路上、份量就被吃完了：放棄（已經在吃的讓牠吃完）
    if (keep && use.purpose === 'eat' && use.phase === 'walk' && env.bowlLeft <= 0) {
      keep = false
      a.bowlCool = 20
    }
    // 被操作（餵食、撫摸、叫醒、散步…）：離開建築去互動；睡著時被撫摸（override tag pet）不會醒，留在座位上
    if (keep && a.override && !(use.purpose === 'sleep' && use.phase === 'at' && a.override.tag === 'pet')) keep = false
    // 氣泡選單開著：還在走的就停下來；已經在座位上的繼續
    if (keep && st.frozen && use.phase === 'walk') keep = false
    if (!keep) {
      releaseUse(a)
      use = null
    }
  }

  // 睡在前方多出來位置的寵物：真座位空出來了就換過去
  if (use && use.phase === 'at' && use.purpose !== 'eat' && isOverflowSeat(use.id, use.seat)) {
    let free = false
    for (let i = 0; i < capacityOf(use.id); i++) if (!seatTaken(env, use.id, i, a)) free = true
    if (free) {
      const id = use.id
      const purpose = use.purpose
      releaseUse(a)
      claim(a, env, id, purpose)
      use = a.bld
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
      else if (!raining) tryGather(a, env, dt)
    }
    use = a.bld
  }
  if (!use) return false

  const slot = env.buildings.get(use.id)!
  const seat = seatsOf(use.id, slot, use.purpose)[use.seat]
  use.t += dt

  if (use.phase === 'walk') {
    // 先走到建築前方的走道（lane），再從下面走上座位
    const lane = { x: seat.near.x, y: slot.y + LANE_DY }
    if (use.stage === 'lane' && Math.hypot(lane.x - a.x, lane.y - a.y) < 4) use.stage = 'seat'
    const goal = use.stage === 'lane' ? lane : seat.near
    a.tx = goal.x
    a.ty = goal.y
    if (a.action !== 'walk') ops.setAction(a, 'walk', 1e9)
    // 走到座位旁邊：地面座位就站上去；窩裡、平台上的座位直接出現在座位上（沒有跳上去、走進去的過場）
    if (use.stage === 'seat' && Math.hypot(seat.near.x - a.x, seat.near.y - a.y) < 2.5) {
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
      } else if (use.purpose === 'gather') {
        use.phase = 'at'
        use.t = 0
        ops.setAction(a, 'sit', 1e9)
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
  } else if (use.purpose === 'gather') {
    // 營火聚集：坐著，心情每秒小幅上升（累積在 a.moodGain，由畫面層每次結算時併進存檔），時間到就離開
    if (a.pet.mood + a.moodGain < 100) a.moodGain += cfg.campfire.moodPerSecond * dt
    if (a.action !== 'sit') ops.setAction(a, 'sit', 1e9)
    if (use.t >= use.dur) {
      a.gatherCool = cfg.campfire.cooldown
      releaseUse(a)
      ops.setAction(a, 'idle', rr(env.rand, 0.8, 1.6))
      return true
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
