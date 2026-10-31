import { BALANCE } from '../config/balance'
import type { Find } from '../save/types'
import {
  DECOR_SIZE, HOUSE_H, LAMP_AX, LAMP_H, LAMP_W, POND_AX, POND_H, POND_W, TOWER_H, TOWER_W, TREE_W, isWalkable, nearestWalkable, ownedSlots, pathTopOf, petBounds, pondPos, pondStrip,
  sceneObjects, slotBox, towerTopLeft, type Layout, type Rect,
} from './layout'
import { isClear, type Pt } from './nav'

/**
 * 寶物（土堆、貓的布包）在場景上的位置與挑點（v3.6.0）。純邏輯，可在 Node 測試。
 * 草地範圍 = 寵物活動範圍裡「小路上緣以上」的那一塊（小路上有狗窩、食盆、貓跳台，走道留給寵物）；
 * 存檔裡的座標是草地範圍內的相對位置（0～1），換視窗大小時重新換算。
 *
 * 擺放規則：寶物的外框（土堆約 25×15、布包 12×13，見 BALANCE.dig.box）離所有障礙物的外框至少 BALANCE.dig.clearance 像素，
 * 障礙物 = 建築素材外框（狗窩、食盆水盆、貓跳台、住家、鐘樓含底部花叢、路燈）、水池與洗澡通道、樹根、裝飾物（石頭、蘑菇、花叢、樹樁、灌木、高草叢）、
 * 別的寶物；外框也不能超出草地範圍，上緣不能碰到草地上緣的遠景。用素材外框（比腳下佔地大）是故意的：不要壓在建築邊緣或花叢上。
 */

const B = BALANCE.dig

/** 草地範圍（腳底座標） */
export function grassRect(L: Layout): Rect {
  const b = petBounds(L)
  return { x0: b.x0, x1: b.x1, y0: b.y0, y1: Math.max(b.y0 + 4, pathTopOf(L) - 2) }
}

export type FindKind = Find['kind']

/** 寶物外框（腳底中心在 (x, y)，往上 h） */
export function findBox(kind: FindKind, x: number, y: number): Rect {
  const b = B.box[kind]
  return { x0: x - b.halfW, x1: x + b.halfW, y0: y - b.h, y1: y }
}

const intersects = (a: Rect, b: Rect, gap: number): boolean => a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.y0 < b.y1 + gap && a.y1 > b.y0 - gap

const obstacleCache = new WeakMap<Layout, { owned: ReadonlySet<string>; rects: Rect[] }>()

/** 寶物要避開的障礙物外框（不含擴張的空隙）；同一個 Layout、同一份 owned 會快取 */
export function obstacleRects(L: Layout): Rect[] {
  const hit = obstacleCache.get(L)
  if (hit && hit.owned === L.owned) return hit.rects
  const out: Rect[] = [{ x0: L.house.x0, x1: L.house.x1, y0: L.house.baseY - HOUSE_H, y1: L.house.baseY }]
  const pd = pondPos(L)
  out.push({ x0: pd.x - POND_AX, x1: pd.x - POND_AX + POND_W, y0: pd.y - POND_H, y1: pd.y })
  const tl = towerTopLeft(L)
  out.push({ x0: tl.x, x1: tl.x + TOWER_W, y0: tl.y, y1: tl.y + TOWER_H })
  const strip = pondStrip(L)
  if (strip) out.push(strip)
  for (const o of sceneObjects(L)) {
    if (o.key === 'lamp') out.push({ x0: o.x - LAMP_AX, x1: o.x - LAMP_AX + LAMP_W, y0: o.y - LAMP_H, y1: o.y })
    else if (o.key === 'tree') out.push({ x0: o.x - TREE_W * 0.4, x1: o.x + TREE_W * 0.4, y0: o.y - 30, y1: o.y + 2 }) // 樹根與樹下的花草
    else if (DECOR_SIZE[o.key]) out.push({ x0: o.x - DECOR_SIZE[o.key][0] / 2, x1: o.x + DECOR_SIZE[o.key][0] / 2, y0: o.y - DECOR_SIZE[o.key][1], y1: o.y })
  }
  for (const s of ownedSlots(L)) out.push(slotBox(s))
  obstacleCache.set(L, { owned: L.owned, rects: out })
  return out
}

export interface Placed {
  kind: FindKind
  x: number
  y: number
}

/** 這個位置放得下這種寶物嗎：在草地範圍內、可站、外框離所有障礙物與已放的寶物至少 clearance */
export function spotValid(L: Layout, kind: FindKind, x: number, y: number, placed: readonly Placed[] = []): boolean {
  const g = grassRect(L)
  const box = findBox(kind, x, y)
  if (box.x0 < g.x0 || box.x1 > g.x1 || y < g.y0 || y > g.y1 || box.y0 < L.farBottom + 4) return false
  if (!isClear(L, x, y) || !isWalkable(L, x, y)) return false
  for (const r of obstacleRects(L)) if (intersects(box, r, B.clearance)) return false
  for (const p of placed) if (intersects(box, findBox(p.kind, p.x, p.y), B.clearance)) return false
  return true
}

/** 離 (x, y) 最近的放得下的位置（由近到遠、垂直方向算 1.6 倍距離）；找不到退回最近的可站位置 */
export function nearestValidSpot(L: Layout, kind: FindKind, x: number, y: number, placed: readonly Placed[] = []): Pt {
  let best: { x: number; y: number; d: number } | null = null
  const g = grassRect(L)
  for (let gy = g.y0; gy <= g.y1; gy += 2)
    for (let gx = g.x0; gx <= g.x1; gx += 2) {
      const d = Math.hypot(gx - x, (gy - y) * 1.6)
      if ((best && d >= best.d) || !spotValid(L, kind, gx, gy, placed)) continue
      best = { x: gx, y: gy, d }
    }
  return best ? { x: best.x, y: best.y } : nearestWalkable(L, x, y)
}

/** 相對位置 → 場景座標 */
export function projectFind(L: Layout, f: Pick<Find, 'fx' | 'fy'>): Pt {
  const g = grassRect(L)
  return { x: g.x0 + f.fx * (g.x1 - g.x0), y: g.y0 + f.fy * (g.y1 - g.y0) }
}

/** 場景座標 → 相對位置（夾在 0～1） */
export function worldToFind(L: Layout, x: number, y: number): { fx: number; fy: number } {
  const g = grassRect(L)
  const k = (v: number, a: number, b: number): number => Math.min(1, Math.max(0, (v - a) / Math.max(1, b - a)))
  return { fx: k(x, g.x0, g.x1), fy: k(y, g.y0, g.y1) }
}

/**
 * 一批寶物在這個版面上的位置（依清單順序）：換視窗大小、買了建築之後，原本的相對位置可能剛好壓到障礙或別的寶物，
 * 這時推到最近的放得下的位置；存檔裡的座標不改。
 */
export function findPositions(L: Layout, finds: readonly Pick<Find, 'id' | 'kind' | 'fx' | 'fy'>[]): Map<string, Pt> {
  const out = new Map<string, Pt>()
  const placed: Placed[] = []
  for (const f of finds) {
    let p = projectFind(L, f)
    if (!spotValid(L, f.kind, p.x, p.y, placed)) p = nearestValidSpot(L, f.kind, p.x, p.y, placed)
    out.set(f.id, p)
    placed.push({ kind: f.kind, x: p.x, y: p.y })
  }
  return out
}

const areaCache = new WeakMap<Layout, { owned: ReadonlySet<string>; area: number }>()

/** 放得下土堆的草地面積（邏輯像素²）：每個格點（2×2）上土堆的外框離障礙物都夠遠才算。同一個 Layout、同一份 owned 會快取 */
export function grassArea(L: Layout): number {
  const hit = areaCache.get(L)
  if (hit && hit.owned === L.owned) return hit.area
  const g = grassRect(L)
  let n = 0
  for (let y = g.y0; y <= g.y1; y += 2) for (let x = g.x0; x <= g.x1; x += 2) if (spotValid(L, 'mound', x, y)) n++
  const area = n * 4
  areaCache.set(L, { owned: L.owned, area })
  return area
}

/** 這個視窗放得下幾個寶物：min(上限, 可放面積 ÷ areaPerFind)；有位置放就至少 1，完全沒位置 = 0。低視窗不隱藏，只是上限變小 */
export function findCap(L: Layout): number {
  const area = grassArea(L)
  return area > 0 ? Math.max(1, Math.min(B.holdMax, Math.floor(area / B.areaPerFind))) : 0
}

export interface SpotQuery {
  L: Layout
  rand: () => number
  kind: FindKind
  /** 從哪裡算「走得到」的範圍（狗：目前位置；貓：玩耍開始時站的位置） */
  anchor: Pt
  /** 最遠距離（直線距離，邏輯像素） */
  reach: number
  /** 已經有的寶物（避開）；別的寵物（避開） */
  finds: readonly Pick<Find, 'id' | 'kind' | 'fx' | 'fy'>[]
  pets: readonly { x: number; y: number }[]
  /** 離 anchor 至少這麼遠（挖在腳下看起來怪） */
  minDist?: number
}

/**
 * 挑一個挖／尋的位置：草地範圍內隨機（寶物外框離障礙物與別的寶物夠遠、可站、離別的寵物有間隔、在可及的範圍內）。
 * 先隨機取樣；取樣不到（附近很擠）就掃整片草地的格點，挑不到回傳 null。
 */
export function pickFindSpot(q: SpotQuery): Pt | null {
  const { L, rand } = q
  const g = grassRect(L)
  const placed: Placed[] = [...findPositions(L, q.finds)].map(([id, p]) => ({ kind: q.finds.find((f) => f.id === id)!.kind, x: p.x, y: p.y }))
  const ok = (x: number, y: number): boolean => {
    const d = Math.hypot(x - q.anchor.x, y - q.anchor.y)
    if (d > q.reach || d < (q.minDist ?? 16)) return false
    for (const p of q.pets) if (((p.x - x) / B.petGap.x) ** 2 + ((p.y - y) / B.petGap.y) ** 2 < 1) return false
    return spotValid(L, q.kind, x, y, placed)
  }
  const pick = (c: Pt[]): Pt => c[Math.min(c.length - 1, Math.floor(rand() * c.length))]
  const rnd: Pt[] = []
  for (let i = 0; i < 80; i++) {
    const x = g.x0 + rand() * (g.x1 - g.x0)
    const y = g.y0 + rand() * (g.y1 - g.y0)
    if (ok(x, y)) rnd.push({ x, y })
  }
  if (rnd.length) return pick(rnd)
  const grid: Pt[] = []
  for (let y = g.y0; y <= g.y1; y += 4) for (let x = g.x0; x <= g.x1; x += 4) if (ok(x, y)) grid.push({ x, y })
  return grid.length ? pick(grid) : null
}
