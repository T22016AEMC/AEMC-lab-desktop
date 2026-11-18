import { blockers, walkZones, type Layout } from './layout'
import type { Placement } from './placement'

/**
 * 寵物繞行障礙的尋路（純邏輯，可在 Node 測試）。
 *
 * 寵物平常是朝目標直線走、撞到障礙就被 clampActor 推出來，樹幹、裝飾物這種小障礙沒問題；
 * 購買後的建築（腳下佔地 66×22 等）會在走道上形成一道牆，直線走過去會卡住，所以要規劃繞行路線。
 * 做法：把活動範圍切成 CELL 像素的格子，格子「可走」= 在活動範圍內、離任何障礙至少 MARGIN 像素；
 * 用 A* 找格子路徑，再用視線檢查把多餘的轉折拉直，回傳路徑點（不含起點）。
 * 同一個 Layout、同一個擺放結果（placement）的格子表會快取。
 */

export interface Pt {
  x: number
  y: number
}

const CELL = 4
/** 路徑點離障礙的最小距離：比 clampActor 的判定寬一點，寵物沿著牆走不會被推擠 */
const MARGIN = 3
/** 視線檢查（直線走得通嗎）把障礙放寬的距離 */
const LINE_PAD = 1.5

interface Grid {
  cols: number
  rows: number
  ok: Uint8Array
}

const gridCache = new WeakMap<Layout, { P: Placement; grid: Grid }>()

/** 睡著或坐在建築座位上的寵物（不會動）：路徑要離牠們一小段距離，不要從牠們身上穿過去 */
export interface FixedPet extends Pt {
  id: string
}
const AVOID_X = 38
const AVOID_Y = 13
const inAvoid = (avoid: readonly Pt[], x: number, y: number): boolean => avoid.some((p) => ((x - p.x) / AVOID_X) ** 2 + ((y - p.y) / AVOID_Y) ** 2 < 1)

/** 這個點離所有障礙至少 MARGIN 像素、而且在活動範圍內嗎 */
export function isClear(L: Layout, x: number, y: number): boolean {
  if (!walkZones(L).some((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1)) return false
  for (const r of blockers(L)) if (x > r.x0 - MARGIN && x < r.x1 + MARGIN && y > r.y0 - MARGIN && y < r.y1 + MARGIN) return false
  return true
}

function gridOf(L: Layout): Grid {
  const hit = gridCache.get(L)
  if (hit && hit.P === L.placement) return hit.grid
  const cols = Math.ceil(L.W / CELL) + 1
  const rows = Math.ceil(L.H / CELL) + 1
  const ok = new Uint8Array(cols * rows)
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) ok[cy * cols + cx] = isClear(L, cx * CELL, cy * CELL) ? 1 : 0
  const grid = { cols, rows, ok }
  gridCache.set(L, { P: L.placement, grid })
  return grid
}

/** 兩點之間的直線（每 2 像素取樣）有沒有碰到障礙 */
export function lineClear(L: Layout, x0: number, y0: number, x1: number, y1: number, avoid: readonly Pt[] = []): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0)
  const n = Math.max(1, Math.ceil(d / 2))
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    // 只檢查障礙（起點可能剛好貼著牆）；障礙往外放寬一點，路徑才不會擦著牆角走
    if (avoid.length && inAvoid(avoid, x, y)) return false
    for (const r of blockers(L)) if (x > r.x0 - LINE_PAD && x < r.x1 + LINE_PAD && y > r.y0 - LINE_PAD && y < r.y1 + LINE_PAD) return false
  }
  return true
}

/** 離 (x, y) 最近的可走格子（找不到回傳 -1） */
function nearestCell(g: Grid, x: number, y: number): number {
  const cx0 = Math.round(x / CELL)
  const cy0 = Math.round(y / CELL)
  let best = -1
  let bd = Infinity
  for (let r = 0; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const cx = cx0 + dx
        const cy = cy0 + dy
        if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows || !g.ok[cy * g.cols + cx]) continue
        const d = Math.hypot(cx * CELL - x, (cy * CELL - y) * 1.6)
        if (d < bd) {
          bd = d
          best = cy * g.cols + cx
        }
      }
    if (best >= 0) return best
  }
  return -1
}

/**
 * 從 (x0, y0) 到 (x1, y1) 的路徑點（不含起點，最後一點是目標本身）。
 * 直線走得通 → 只有目標一個點；繞得過去 → 轉折點；目標在牆裡面或不可達 → null（呼叫端退回直線走）。
 */
export function findPath(L: Layout, x0: number, y0: number, x1: number, y1: number, fixed: readonly FixedPet[] = [], self = ''): Pt[] | null {
  // 起點或終點本身就在某隻不會動的寵物旁邊（例如走去自己的座位）：那一隻不算
  const avoid = fixed.filter((p) => p.id !== self && !inAvoid([p], x0, y0) && !inAvoid([p], x1, y1))
  if (lineClear(L, x0, y0, x1, y1, avoid)) return [{ x: x1, y: y1 }]
  const g = gridOf(L)
  const s = nearestCell(g, x0, y0)
  const e = nearestCell(g, x1, y1)
  if (s < 0 || e < 0) return null
  const { cols, rows } = g
  const gScore = new Float32Array(cols * rows).fill(Infinity)
  const prev = new Int32Array(cols * rows).fill(-1)
  const closed = new Uint8Array(cols * rows)
  const ex = e % cols
  const ey = (e / cols) | 0
  const h = (i: number): number => {
    const dx = Math.abs((i % cols) - ex)
    const dy = Math.abs(((i / cols) | 0) - ey)
    return Math.max(dx, dy) + 0.41 * Math.min(dx, dy)
  }
  // 二元堆積（最小 f）
  const heap: number[] = []
  const f = new Float32Array(cols * rows).fill(Infinity)
  const push = (i: number): void => {
    heap.push(i)
    let k = heap.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (f[heap[p]] <= f[heap[k]]) break
      ;[heap[p], heap[k]] = [heap[k], heap[p]]
      k = p
    }
  }
  const pop = (): number => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let k = 0
      for (;;) {
        const l = k * 2 + 1
        const r = l + 1
        let m = k
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r
        if (m === k) break
        ;[heap[m], heap[k]] = [heap[k], heap[m]]
        k = m
      }
    }
    return top
  }
  gScore[s] = 0
  f[s] = h(s)
  push(s)
  let found = false
  while (heap.length) {
    const cur = pop()
    if (closed[cur]) continue
    closed[cur] = 1
    if (cur === e) {
      found = true
      break
    }
    const cx = cur % cols
    const cy = (cur / cols) | 0
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        const ni = ny * cols + nx
        if (!g.ok[ni] || closed[ni]) continue
        if (avoid.length && ni !== e && inAvoid(avoid, nx * CELL, ny * CELL)) continue
        // 斜走不可切過牆角
        if (dx && dy && (!g.ok[cy * cols + nx] || !g.ok[ny * cols + cx])) continue
        // 垂直方向走得慢（斜視角），所以垂直步的代價高一點，路徑傾向橫向繞
        const step = (dx && dy ? 1.41 : 1) * (dy ? 1.2 : 1)
        const ng = gScore[cur] + step
        if (ng < gScore[ni]) {
          gScore[ni] = ng
          prev[ni] = cur
          f[ni] = ng + h(ni)
          push(ni)
        }
      }
  }
  if (!found) return null
  const cells: Pt[] = []
  for (let i = e; i !== -1; i = prev[i]) cells.push({ x: (i % cols) * CELL, y: ((i / cols) | 0) * CELL })
  cells.reverse()
  // 起點換成實際位置、終點換成實際目標，再用視線檢查拉直
  const pts: Pt[] = [{ x: x0, y: y0 }, ...cells.slice(1, -1), { x: x1, y: y1 }]
  const out: Pt[] = []
  let anchor = 0
  while (anchor < pts.length - 1) {
    let far = pts.length - 1
    while (far > anchor + 1 && !lineClear(L, pts[anchor].x, pts[anchor].y, pts[far].x, pts[far].y, avoid)) far--
    out.push(pts[far])
    anchor = far
  }
  return out
}

// ---------------------------------------------------------------------------
// v3.9.0：連通區塊（擺放規則的「連通」與寵物目的地「走得到」）
// ---------------------------------------------------------------------------

/** 4 像素格子上的連通區塊：label[i] = 區塊編號（不可走 = -1）、sizes[k] = 區塊 k 的格數、main = 最大的區塊 */
export interface Components {
  cols: number
  rows: number
  label: Int32Array
  sizes: number[]
  main: number
}

/** 比一隻寵物身體（約 24×12 像素 = 18 格）小的死角不算「不連通」，寵物也不會把那裡當目的地（使用者 2026-11-18 決定的寬鬆版本） */
export const POCKET_MAX_CELLS = Math.floor((24 / CELL) * (12 / CELL)) // 18
export const NAV_CELL = CELL

const compCache = new WeakMap<Layout, { P: Placement; c: Components }>()

/** 可走格子（離障礙至少 MARGIN）的連通區塊（8 方向，斜走不可切過牆角，和尋路相同）；同一個擺放結果會快取 */
export function components(L: Layout): Components {
  const hit = compCache.get(L)
  if (hit && hit.P === L.placement) return hit.c
  const g = gridOf(L)
  const { cols, rows } = g
  const label = new Int32Array(cols * rows).fill(-1)
  const sizes: number[] = []
  const stack: number[] = []
  for (let i = 0; i < cols * rows; i++) {
    if (!g.ok[i] || label[i] >= 0) continue
    const k = sizes.length
    let n = 0
    label[i] = k
    stack.push(i)
    while (stack.length) {
      const cur = stack.pop()!
      n++
      const cx = cur % cols
      const cy = (cur / cols) | 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
          const ni = ny * cols + nx
          if (!g.ok[ni] || label[ni] >= 0) continue
          if (dx && dy && (!g.ok[cy * cols + nx] || !g.ok[ny * cols + cx])) continue
          label[ni] = k
          stack.push(ni)
        }
    }
    sizes.push(n)
  }
  let main = -1
  for (let k = 0; k < sizes.length; k++) if (main < 0 || sizes[k] > sizes[main]) main = k
  const c = { cols, rows, label, sizes, main }
  compCache.set(L, { P: L.placement, c })
  return c
}

/** 這個腳底位置在主要區塊上嗎（離最近的可走格子 2 格以內，而且那一格屬於最大的區塊） */
export function isReachable(L: Layout, x: number, y: number): boolean {
  const c = components(L)
  if (c.main < 0) return false
  const g = gridOf(L)
  const i = nearestCell(g, x, y)
  if (i < 0) return false
  const dx = (i % c.cols) * CELL - x
  const dy = ((i / c.cols) | 0) * CELL - y
  return Math.hypot(dx, dy) <= CELL * 2 && c.label[i] === c.main
}

/** 除了最大的區塊之外，有沒有「比一隻寵物身體大」的區塊（有 = 不連通） */
export function hasIsolatedRegion(L: Layout): boolean {
  const c = components(L)
  return c.sizes.some((n, k) => k !== c.main && n > POCKET_MAX_CELLS)
}
