import { BALANCE } from '../config/balance'
import { SPECIES } from '../config/species'
import {
  BACK_BASE, buildingSlots, isWalkable, pathTopOf, petBounds, slotFootprint, type Layout, type Rect,
} from './layout'
import { coverFraction, footprintAt, type Placement } from './placement'
import type { Action, Actor, BehaviorEnv } from './pets'

/**
 * 野餐（v3.8.0）的場景部分：墊子放哪裡、寵物坐哪裡、相機提示與照片裁切範圍，以及參加的寵物每個影格的行為。
 * 存檔（次數、冷卻、清潔與心情）在 sim/picnic.ts。墊子是臨時的：不是建築、不擋路（寵物可以走過去），野餐結束就消失。
 */

/** 野餐墊素材的大小（picnic_mat_*，三款同大小；要和 manifest 一致，測試會比對） */
export const MAT_W = 104
export const MAT_H = 63

/**
 * 墊子上的位置（素材座標，腳底）。墊子是斜放的四邊形（上角約 (46,0)、右角 (104,13)、下角 (72,63)、左角 (0,45)），
 * 這些點都在墊面內（測試用素材的 meta.mat 逐列檢查）。座位依序排：先左右兩邊、再前後，每多一隻都排在離前面的最遠處附近；6 隻時分散在墊面上（會有部分重疊，但不會全疊在一起）。
 */
export const MAT_SEATS: readonly (readonly [number, number])[] = [
  [36, 30], [76, 30], [56, 46], [56, 16], [86, 42], [22, 38],
]
/** 野餐籃（左角）與食物（右角、上角）的位置（素材座標，腳底） */
export const MAT_BASKET: readonly [number, number] = [14, 46]
export const MAT_FOODS: readonly (readonly [number, number])[] = [[92, 21], [44, 9]]
export const FOOD_KEYS = ['picnic_food_sandwich', 'picnic_food_fruit', 'picnic_food_cake', 'picnic_food_juice'] as const
export const MAT_KEYS = ['picnic_mat_red', 'picnic_mat_blue', 'picnic_mat_pink'] as const
export const BASKET_KEYS = ['picnic_basket_closed', 'picnic_basket_open'] as const
/** 相機圖示大小（picnic_camera） */
export const CAMERA_W = 20
export const CAMERA_H = 16

/** 墊子外框離其他東西的最小空隙（邏輯像素） */
const MAT_GAP = 4

const hitR = (a: Rect, b: Rect, g = 0): boolean => a.x0 < b.x1 + g && a.x1 > b.x0 - g && a.y0 < b.y1 + g && a.y1 > b.y0 - g

/**
 * 不能和墊子外框重疊的東西（v3.9.0）：所有擺出來的物件的「腳下佔地」（墊子平鋪在地上，物件的上半部可以畫在墊子前面），
 * 加上還沒買的建築在預設位置的腳下佔地（買了會出現在那裡，墊子的位置才不會因為買了建築而跳）。收進庫存的不算。
 * 另外 6 個座位要站得住、而且不被前面的物件蓋住超過一半（野餐的寵物要看得到，見 picnicMatRect）。
 */
function matObstacles(L: Layout): Rect[] {
  const out: Rect[] = []
  for (const it of L.placement.placed.values()) out.push(footprintAt(it.kind, it.x, it.y))
  for (const s of buildingSlots(L)) if (!L.placement.owned.has(s.id)) out.push(slotFootprint(s))
  return out
}

/**
 * 墊子中心的偏好位置（v3.9.0 起固定）：水平 x = PICNIC_PREF_X（= v3.8.1 預設配置下「食盆右緣與貓跳台左緣的正中間」），
 * 垂直在草地中段的中間。以前跟著食盆、貓跳台算，現在這兩個建築可以移動或收起來，所以改成固定值。
 */
export const PICNIC_PREF_X = 436

/**
 * v3.9.0：已經鋪好的墊子（野餐進行中，位置固定）在目前的擺放下還放得下嗎：外框不碰任何物件的腳下佔地（間距 MAT_GAP）、
 * 6 個座位站得住而且不被前面的物件蓋住超過一半。擺設模式離開時用來決定要不要提前結束野餐。
 */
export function picnicMatFitsAt(L: Layout, r: Rect): boolean {
  if (matObstacles(L).some((o) => hitR(r, o, MAT_GAP))) return false
  return MAT_SEATS.every(([sx, sy]) => isWalkable(L, r.x0 + sx, r.y0 + sy) && coverFraction(L.placement, r.x0 + sx, r.y0 + sy) <= 0.5)
}

const matCache = new WeakMap<Layout, { P: Placement; r: Rect | null }>()

/**
 * 野餐墊落地的位置（素材外框，邏輯座標）；這個視窗放不下 = null。
 * 規則（不手調座標，全部由版面算出）：在草地中段——頂端在後排景物腳底（草地上緣 + BACK_BASE）之下、底邊在走道上緣之上；
 * 左右在寵物活動範圍內；外框不碰 matObstacles（空隙 MAT_GAP）；6 個座位都站得住。
 * 偏好位置：水平在「食盆水盆右緣」與「貓跳台左緣」的正中間，垂直在草地中段的中間；挑離偏好位置最近的。
 */
export function picnicMatRect(L: Layout): Rect | null {
  const mc = matCache.get(L)
  if (mc && mc.P === L.placement) return mc.r
  const b = petBounds(L)
  const yTop = L.farBottom + BACK_BASE + 4
  const yBot = pathTopOf(L)
  const ax = PICNIC_PREF_X
  const ay = (yTop + yBot) / 2 // 墊子中心
  const obs = matObstacles(L)
  let best: { r: Rect; cost: number } | null = null
  for (let y0 = Math.ceil(yTop); y0 + MAT_H <= yBot; y0++)
    for (let x0 = Math.ceil(b.x0); x0 + MAT_W <= b.x1; x0++) {
      const r = { x0, y0, x1: x0 + MAT_W, y1: y0 + MAT_H }
      const cost = Math.abs(x0 + MAT_W / 2 - ax) + 1.6 * Math.abs(y0 + MAT_H / 2 - ay)
      if (best && cost >= best.cost) continue
      if (obs.some((o) => hitR(r, o, MAT_GAP))) continue
      if (!MAT_SEATS.every(([sx, sy]) => isWalkable(L, x0 + sx, y0 + sy) && coverFraction(L.placement, x0 + sx, y0 + sy) <= 0.5)) continue
      best = { r, cost }
    }
  const out = best?.r ?? null
  matCache.set(L, { P: L.placement, r: out })
  return out
}

/** 第 i 個座位的腳底位置（邏輯座標） */
export function seatPos(mat: Rect, i: number): { x: number; y: number } {
  const [sx, sy] = MAT_SEATS[i % MAT_SEATS.length]
  return { x: mat.x0 + sx, y: mat.y0 + sy }
}

/**
 * 相機提示的位置（相機圖示的外框，邏輯座標）：墊子右上方（墊子右角的上面），右邊放不下就放左上方；整個在畫面內。
 * 點擊區由畫面層放大到至少 24 CSS 像素。
 */
export function cameraRect(L: Layout, mat: Rect): Rect {
  let x0 = mat.x1 - 8
  if (x0 + CAMERA_W > L.W - 2) x0 = mat.x0 - CAMERA_W + 8
  const y0 = Math.max(L.farBottom + 2, mat.y0 - CAMERA_H - 2)
  return { x0, y0, x1: x0 + CAMERA_W, y1: y0 + CAMERA_H }
}

/**
 * 照片的裁切範圍（邏輯座標）：寬 w、高 h（由相框窗口換算，見 ui/photo.ts），水平以墊子為中心；
 * 垂直讓「墊子底邊再往下 8」貼著裁切下緣往上算，所以後排寵物的頭（墊子頂端往上約 35）也在裡面；最後夾在畫面內。
 */
export function photoCrop(L: Layout, mat: Rect, w: number, h: number): Rect {
  const cx = (mat.x0 + mat.x1) / 2
  let x0 = Math.round(cx - w / 2)
  let y0 = Math.round(mat.y1 + 8 - h)
  x0 = Math.max(0, Math.min(L.W - w, x0))
  y0 = Math.max(0, Math.min(L.H - h, y0))
  return { x0, y0, x1: x0 + w, y1: y0 + h }
}

/** 參加野餐的寵物的狀態（和 a.bath、a.play 一樣是 Actor 上的一個欄位；null = 沒參加） */
export interface PicnicSeat {
  /** 座位編號（MAT_SEATS 的索引） */
  seat: number
  /** 已經坐到墊子上 */
  arrived: boolean
  /** 走過去已經走了幾秒（超過 walkStuckSeconds 直接出現在座位上） */
  t: number
  /** 拍照的開心姿勢還剩幾秒 */
  cheer: number
}

export interface PicnicOps {
  setAction: (a: Actor, action: Action, dur: number) => void
  moveToward: (a: Actor, dt: number, speed: number, env: BehaviorEnv) => void
}

/**
 * 參加野餐的寵物每個影格（在 updateActor 裡，洗澡、玩耍之後、建築之前，所以野餐中不去食盆、不躲雨）。
 * 走去座位（walk）→ 坐著等（狗 sit_a／sit_b 輪換、貓 sit）→ 拍照時開心（happy）。不用吃的姿勢（吃的圖裡有碗）。
 * 氣泡選單的短動作（撫摸、餵食…）照樣演完再坐回去；選了散步就離開野餐。回傳 false = 已經離開野餐（交還一般行為）。
 */
export function updatePicnicSeat(a: Actor, dt: number, env: BehaviorEnv, mat: Rect | null, ops: PicnicOps): boolean {
  const p = a.picnic
  if (!p) return false
  if (!mat) {
    a.picnic = null
    return false
  }
  const target = seatPos(mat, p.seat)
  if (a.override && a.override.speedMul > 0) {
    // 散步：離開野餐
    a.picnic = null
    return false
  }
  if (!p.arrived) {
    p.t += dt
    const d = Math.hypot(target.x - a.x, target.y - a.y)
    if (d < 3 || p.t > BALANCE.picnic.walkStuckSeconds) {
      p.arrived = true
      a.x = target.x
      a.y = target.y
      a.path = []
      ops.setAction(a, 'sit', 1e9)
    } else {
      a.tx = target.x
      a.ty = target.y
      if (a.action !== 'walk') ops.setAction(a, 'walk', 1e9)
      ops.moveToward(a, dt, SPECIES[a.pet.species].speed * 1.3, env)
      return true
    }
  }
  // 坐在墊子上：位置固定、面向墊子中間
  a.x = target.x
  a.y = target.y
  a.tx = target.x
  a.ty = target.y
  a.facing = target.x <= (mat.x0 + mat.x1) / 2 ? 1 : -1
  if (p.cheer > 0) {
    p.cheer = Math.max(0, p.cheer - dt)
    if (a.action !== 'happy') ops.setAction(a, 'happy', 1e9)
    if (p.cheer === 0) ops.setAction(a, 'sit', 1e9)
    return true
  }
  if (a.override) {
    const o = a.override
    o.left -= dt
    if (a.action !== o.action) ops.setAction(a, o.action, o.left)
    if (o.tag === 'pet' && env.rand() < dt * 2.2) env.emit('heart', a.x + (env.rand() - 0.5) * 16, a.y - 28)
    if (o.left <= 0) {
      a.override = null
      ops.setAction(a, 'sit', 1e9)
    }
    return true
  }
  if (a.action !== 'sit') ops.setAction(a, 'sit', 1e9)
  return true
}
