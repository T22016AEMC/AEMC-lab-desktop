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
/**
 * 寵物點心（v3.10.0，純裝飾、不存檔）：狗餅乾（15×8）、貓小魚乾（15×4），放在籃子右下方的墊面上（素材座標，腳底）。
 * 有狗參加才放餅乾、有貓參加才放小魚乾（看開始時的參加名單 picnic.active.pets）。
 * 位置：籃子佔 x 3～24、y 24～46；座位腳底最低 y 46，所以點心（y 44～56）永遠畫在坐著的寵物前面、不會被擋住；
 * 兩個點心、籃子、食物彼此不重疊，整個在墊面內（測試用 meta.mat 逐列檢查）。
 */
export const MAT_SNACKS = { dog: [33, 52], cat: [50, 56] } as const
export const SNACK_KEYS = { dog: 'picnic_snack_dog', cat: 'picnic_snack_cat' } as const

/** 這場野餐要放哪些點心：參加的寵物裡有狗就放餅乾、有貓就放小魚乾（species 查不到的寵物不算） */
export function picnicSnacks(petIds: readonly string[], speciesOf: (id: string) => 'dog' | 'cat' | undefined): ('dog' | 'cat')[] {
  const has = new Set(petIds.map(speciesOf))
  return (['dog', 'cat'] as const).filter((k) => has.has(k))
}
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
 * v3.9.1 墊子位置的判斷（自動找位置、手動選位置、野餐中離開編輯農場都用這一個）。依序：
 *  1. outside：外框不在「草地中段」範圍內（左右在寵物活動範圍、頂端在後排景物腳底之下、底邊在走道上緣之上），
 *     或座位上的寵物、相機提示、照片裁切範圍會超出場景（目前的範圍內不會發生，是保險；見 PICNIC_PET_REACH）
 *  2. overlap：外框碰到 matObstacles（空隙 MAT_GAP）
 *  3. seat：有座位站不住（isWalkable；v3.9.0 起的規則，不另外檢查「走得到」）
 *  4. covered：有座位被前面的物件蓋住超過一半
 * 回傳的 seat = 第一個出問題的座位編號（畫預覽時標紅）。
 */
export type MatSpotReason = 'outside' | 'overlap' | 'seat' | 'covered'
export type MatSpotResult = { ok: true } | { ok: false; reason: MatSpotReason; seat?: number }

/** 不能放的原因（和擺放規則 PLACE_REASON_TEXT 同樣的短句；outside、overlap 兩句完全相同） */
export const MAT_SPOT_TEXT: Readonly<Record<MatSpotReason, string>> = {
  outside: '超出可以擺放的範圍',
  overlap: '離其他東西太近',
  seat: '座位上站不下寵物',
  covered: '座位會被前面的東西擋住',
}

/** 座位上的寵物（坐、開心、走路各姿勢）從腳底往左右、往上最多伸出多少（manifest 實測左 29、右 28、上 48；測試會比對） */
export const PICNIC_PET_REACH = { side: 30, up: 50 }
/** 照片裁切範圍的最小寬高（三款相框窗口換算；測試會用 manifest 比對） */
export const PICNIC_CROP_MIN = { w: 150, h: 144 }

/** 墊子外框可以放的範圍（x0、y0 的最小與最大值，整數） */
export function matRange(L: Layout): { x0: number; x1: number; y0: number; y1: number } {
  const b = petBounds(L)
  const yTop = L.farBottom + BACK_BASE + 4
  const yBot = pathTopOf(L)
  return { x0: Math.ceil(b.x0), x1: Math.floor(b.x1 - MAT_W), y0: Math.ceil(yTop), y1: Math.floor(yBot - MAT_H) }
}

/** 墊子連同座位上寵物的外框（拍照要拍到、不能超出場景的範圍） */
export function matGroupBox(mat: Rect): Rect {
  let x0 = mat.x0, x1 = mat.x1, y0 = mat.y0
  for (const [sx, sy] of MAT_SEATS) {
    x0 = Math.min(x0, mat.x0 + sx - PICNIC_PET_REACH.side)
    x1 = Math.max(x1, mat.x0 + sx + PICNIC_PET_REACH.side)
    y0 = Math.min(y0, mat.y0 + sy - PICNIC_PET_REACH.up)
  }
  return { x0, y0, x1, y1: mat.y1 }
}

const inside = (a: Rect, b: Rect): boolean => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1

/** 座位上的寵物、相機提示、照片裁切都在場景內，而且裁切範圍包住墊子與寵物 */
export function matEdgeOk(L: Layout, mat: Rect): boolean {
  const scene = { x0: 0, y0: 0, x1: L.W, y1: L.H }
  const g = matGroupBox(mat)
  if (!inside(g, scene)) return false
  if (!inside(cameraRect(L, mat), scene)) return false
  return inside(g, photoCrop(L, mat, PICNIC_CROP_MIN.w, PICNIC_CROP_MIN.h))
}

function spotCheck(L: Layout, r: Rect, obs: readonly Rect[]): MatSpotResult {
  const R = matRange(L)
  if (r.x0 < R.x0 || r.x0 > R.x1 || r.y0 < R.y0 || r.y0 > R.y1 || !matEdgeOk(L, r)) return { ok: false, reason: 'outside' }
  if (obs.some((o) => hitR(r, o, MAT_GAP))) return { ok: false, reason: 'overlap' }
  for (let i = 0; i < MAT_SEATS.length; i++) if (!isWalkable(L, r.x0 + MAT_SEATS[i][0], r.y0 + MAT_SEATS[i][1])) return { ok: false, reason: 'seat', seat: i }
  for (let i = 0; i < MAT_SEATS.length; i++) if (coverFraction(L.placement, r.x0 + MAT_SEATS[i][0], r.y0 + MAT_SEATS[i][1]) > 0.5) return { ok: false, reason: 'covered', seat: i }
  return { ok: true }
}

const obsCache = new WeakMap<Layout, { P: Placement; obs: Rect[] }>()
function obstaclesOf(L: Layout): Rect[] {
  const c = obsCache.get(L)
  if (c && c.P === L.placement) return c.obs
  const obs = matObstacles(L)
  obsCache.set(L, { P: L.placement, obs })
  return obs
}

/** 墊子外框放在 r（素材外框，邏輯座標）可以嗎；不行的話是哪個原因 */
export function picnicSpotCheck(L: Layout, r: Rect): MatSpotResult {
  return spotCheck(L, r, obstaclesOf(L))
}

/** 游標在場景座標 (x, y) 時的墊子外框：游標 = 墊子中心，取整數 */
export function matRectAtCursor(x: number, y: number): Rect {
  const x0 = Math.round(x - MAT_W / 2)
  const y0 = Math.round(y - MAT_H / 2)
  return { x0, y0, x1: x0 + MAT_W, y1: y0 + MAT_H }
}

/**
 * v3.9.0：已經鋪好的墊子（野餐進行中，位置固定）在目前的擺放下還放得下嗎（picnicSpotCheck）。擺設模式離開時用來決定要不要提前結束野餐。
 */
export function picnicMatFitsAt(L: Layout, r: Rect): boolean {
  return picnicSpotCheck(L, r).ok
}

const matCache = new WeakMap<Layout, { P: Placement; r: Rect | null }>()

/**
 * 野餐墊落地的位置（素材外框，邏輯座標）；這個視窗放不下 = null。
 * 規則（不手調座標，全部由版面算出）：範圍內（matRange）每個整數位置用 picnicSpotCheck 判斷（和手動選位置同一個規則）。
 * 偏好位置：水平在「食盆水盆右緣」與「貓跳台左緣」的正中間，垂直在草地中段的中間；挑離偏好位置最近的。
 */
export function picnicMatRect(L: Layout): Rect | null {
  const mc = matCache.get(L)
  if (mc && mc.P === L.placement) return mc.r
  const yTop = L.farBottom + BACK_BASE + 4
  const yBot = pathTopOf(L)
  const R = matRange(L)
  const ax = PICNIC_PREF_X
  const ay = (yTop + yBot) / 2 // 墊子中心
  const obs = obstaclesOf(L)
  let best: { r: Rect; cost: number } | null = null
  for (let y0 = R.y0; y0 <= R.y1; y0++)
    for (let x0 = R.x0; x0 <= R.x1; x0++) {
      const r = { x0, y0, x1: x0 + MAT_W, y1: y0 + MAT_H }
      const cost = Math.abs(x0 + MAT_W / 2 - ax) + 1.6 * Math.abs(y0 + MAT_H / 2 - ay)
      if (best && cost >= best.cost) continue
      if (!spotCheck(L, r, obs).ok) continue
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
