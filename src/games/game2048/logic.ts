export type Dir = 'up' | 'down' | 'left' | 'right'

export const SIZE = 4

export interface Tile {
  id: number
  value: number
  row: number
  col: number
  /** 合併次數，用來讓畫面重播合併動畫 */
  gen: number
  /** 這一步新出現的方塊 */
  isNew: boolean
  /** 這一步被合併掉的方塊：滑到合併位置後就會被移除 */
  dying: boolean
}

export function makeTile(id: number, value: number, row: number, col: number): Tile {
  return { id, value, row, col, gen: 0, isNew: false, dying: false }
}

function lineCoords(dir: Dir, line: number): { row: number; col: number }[] {
  // 回傳該行／列由「目標邊」往外的格子順序
  const cells: { row: number; col: number }[] = []
  for (let k = 0; k < SIZE; k++) {
    if (dir === 'left') cells.push({ row: line, col: k })
    else if (dir === 'right') cells.push({ row: line, col: SIZE - 1 - k })
    else if (dir === 'up') cells.push({ row: k, col: line })
    else cells.push({ row: SIZE - 1 - k, col: line })
  }
  return cells
}

export interface MoveResult {
  tiles: Tile[]
  moved: boolean
  gained: number
}

/** 往某個方向滑動一步（不產生新方塊）。回傳新的方塊清單，被合併的方塊會標成 dying */
export function move(prev: Tile[], dir: Dir): MoveResult {
  const live = prev.filter((t) => !t.dying).map((t) => ({ ...t, isNew: false }))
  const out: Tile[] = []
  let moved = false
  let gained = 0

  for (let line = 0; line < SIZE; line++) {
    const coords = lineCoords(dir, line)
    const inLine = live
      .filter((t) => coords.some((c) => c.row === t.row && c.col === t.col))
      .sort(
        (a, b) =>
          coords.findIndex((c) => c.row === a.row && c.col === a.col) -
          coords.findIndex((c) => c.row === b.row && c.col === b.col),
      )
    let slot = 0
    let last: Tile | null = null
    let lastMerged = false
    for (const t of inLine) {
      if (last && !lastMerged && last.value === t.value) {
        // 合併：t 滑到 last 的位置後消失，last 的數值加倍
        if (t.row !== last.row || t.col !== last.col) moved = true
        t.row = last.row
        t.col = last.col
        t.dying = true
        last.value *= 2
        last.gen += 1
        gained += last.value
        lastMerged = true
        moved = true
        out.push(t)
      } else {
        const target = coords[slot++]
        if (t.row !== target.row || t.col !== target.col) moved = true
        t.row = target.row
        t.col = target.col
        last = t
        lastMerged = false
        out.push(t)
      }
    }
  }
  return { tiles: moved ? out : prev, moved, gained }
}

export function emptyCells(tiles: Tile[]): { row: number; col: number }[] {
  const occupied = new Set(tiles.filter((t) => !t.dying).map((t) => t.row * SIZE + t.col))
  const out: { row: number; col: number }[] = []
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (!occupied.has(i)) out.push({ row: Math.floor(i / SIZE), col: i % SIZE })
  }
  return out
}

/** 在隨機空格放一個 2（90%）或 4（10%）。沒有空格時回傳原清單 */
export function spawnTile(tiles: Tile[], nextId: () => number, rand: () => number = Math.random): Tile[] {
  const free = emptyCells(tiles)
  if (free.length === 0) return tiles
  const pos = free[Math.floor(rand() * free.length)]
  const tile = makeTile(nextId(), rand() < 0.9 ? 2 : 4, pos.row, pos.col)
  tile.isNew = true
  return [...tiles, tile]
}

export function canMove(tiles: Tile[]): boolean {
  const live = tiles.filter((t) => !t.dying)
  if (live.length < SIZE * SIZE) return true
  const grid = new Map(live.map((t) => [t.row * SIZE + t.col, t.value]))
  for (const t of live) {
    if (grid.get(t.row * SIZE + t.col + 1) === t.value && t.col < SIZE - 1) return true
    if (grid.get((t.row + 1) * SIZE + t.col) === t.value) return true
  }
  return false
}

export function maxValue(tiles: Tile[]): number {
  return tiles.reduce((m, t) => (t.dying ? m : Math.max(m, t.value)), 0)
}
