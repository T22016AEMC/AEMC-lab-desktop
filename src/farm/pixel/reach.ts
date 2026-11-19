import { POND_AX, POND_H, POND_STAND_DX, POND_W, isWalkable, nearestWalkable, ownedSlots, pondPos, waterEllipse, type Layout } from './layout'
import { isClear, isReachable } from './nav'
import { PET_BOX, boxCovered, spriteBoxAt, type Box, type Placement } from './placement'
import { seatsOf } from './buildingUse'
import type { BuildingId } from '../config/buildings'

/**
 * v3.9.0：洗澡站位改成程式計算（以前是「水池右緣＋28、夾在洗澡通道裡」的固定公式）。
 * 走去洗澡的終點、洗完爬出來的落點，三種洗澡入口（氣泡選單、拖曳到水池、爬出甩水）共用同一個點。
 *
 * 在水池素材外框周圍 STAND_REACH 以內找一個點，條件：寵物站得住（不在障礙裡、離障礙夠遠）、在主要連通區塊上、
 * 整個身體（寬 30、高 34，往下多留 4）不碰畫在前面的物件的素材外框（找不到才放寬成只看不透明像素）、離建築座位夠遠。
 * 偏好位置沿用 v3.8.1：水池右緣 + POND_STAND_DX、水面中心往下 16；成本 = 3×水平距離 + 垂直距離（偏好貼著水池右邊）。
 * 預設配置的結果 = v3.8.1 的 (140, 176)（測試會比對）。找不到就退回離偏好位置最近的可站位置。
 */
const STAND_REACH = 34
const SEAT_CLEAR = 22

const cache = new WeakMap<Layout, { P: Placement; pt: { x: number; y: number }; found: boolean }>()

/** 洗澡站位（找不到合格的點就退回離偏好位置最近的可站位置） */
export function pondStand(L: Layout): { x: number; y: number } {
  return standOf(L).pt
}

/** 有沒有找到合格的洗澡站位（擺放規則用：放下物件後洗澡站位必須存在而且走得到） */
export function pondStandFound(L: Layout): boolean {
  return standOf(L).found
}

function standOf(L: Layout): { pt: { x: number; y: number }; found: boolean } {
  const hit = cache.get(L)
  if (hit && hit.P === L.placement) return hit
  const pd = pondPos(L)
  const w = waterEllipse(L)
  const box = { x0: pd.x - POND_AX, x1: pd.x - POND_AX + POND_W, y0: pd.y - POND_H, y1: pd.y }
  const pref = { x: box.x1 + POND_STAND_DX, y: w.cy + 16 }
  const seats: { x: number; y: number }[] = []
  for (const s of ownedSlots(L))
    for (const purpose of ['eat', 'sleep', 'shelter'] as const) for (const st of seatsOf(s.id as BuildingId, s, purpose)) seats.push(st.near)
  let best: { x: number; y: number; cost: number } | null = null
  // 第一輪：身體不碰前面物件的素材外框；第二輪（第一輪找不到）：只要不碰前面物件的不透明像素
  for (const strict of [true, false]) {
    if (best) break
  for (let y = Math.floor(box.y0 - STAND_REACH); y <= box.y1 + STAND_REACH; y++)
    for (let x = Math.floor(box.x0 - STAND_REACH); x <= box.x1 + STAND_REACH; x++) {
      const cost = 3 * Math.abs(x - pref.x) + Math.abs(y - pref.y)
      if (best && cost >= best.cost) continue
      // 離水池素材外框的距離
      const dx = Math.max(box.x0 - x, 0, x - box.x1)
      const dy = Math.max(box.y0 - y, 0, y - box.y1)
      if (Math.hypot(dx, dy) > STAND_REACH) continue
      if (!isWalkable(L, x, y) || !isClear(L, x, y) || !isReachable(L, x, y)) continue
      const body = { x0: x - PET_BOX.hw, x1: x + PET_BOX.hw, y0: y - PET_BOX.h, y1: y + 4 }
      if (strict ? frontBoxHit(L.placement, body, y) : boxCovered(L.placement, body, y)) continue
      if (seats.some((s) => Math.hypot(s.x - x, (s.y - y) * 1.6) < SEAT_CLEAR)) continue
      best = { x, y, cost }
    }
  }
  const out = { pt: best ? { x: best.x, y: best.y } : nearestWalkable(L, pref.x, pref.y), found: !!best }
  cache.set(L, { P: L.placement, ...out })
  return out
}

/** body 有沒有碰到「腳底比 y 低」（畫在前面）的物件的素材外框 */
function frontBoxHit(P: Placement, body: Box, y: number): boolean {
  for (const it of P.placed.values()) {
    if (it.y <= y) continue
    const b = spriteBoxAt(it.kind, it.x, it.y)
    if (b.x0 < body.x1 && b.x1 > body.x0 && b.y0 < body.y1 && b.y1 > body.y0) return true
  }
  return false
}
