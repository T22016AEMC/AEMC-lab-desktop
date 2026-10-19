export type DifficultyId = 'beginner' | 'intermediate' | 'expert'

export interface Difficulty {
  id: DifficultyId
  label: string
  rows: number
  cols: number
  mines: number
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'beginner', label: '初級 9×9', rows: 9, cols: 9, mines: 10 },
  { id: 'intermediate', label: '中級 16×16', rows: 16, cols: 16, mines: 40 },
  { id: 'expert', label: '高級 30×16', rows: 16, cols: 30, mines: 99 },
]

export interface Cell {
  mine: boolean
  adjacent: number
  revealed: boolean
  flagged: boolean
}

export function emptyBoard(d: Difficulty): Cell[] {
  return Array.from({ length: d.rows * d.cols }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false }))
}

export function neighbors(index: number, d: Pick<Difficulty, 'rows' | 'cols'>): number[] {
  const r = Math.floor(index / d.cols)
  const c = index % d.cols
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nr < d.rows && nc >= 0 && nc < d.cols) out.push(nr * d.cols + nc)
    }
  }
  return out
}

/** 第一下點擊之後才佈雷：點擊的格子與它周圍一圈一定沒有雷。rand 可注入以便測試 */
export function placeMines(board: Cell[], d: Difficulty, safeIndex: number, rand: () => number = Math.random): Cell[] {
  const next = board.map((c) => ({ ...c }))
  const banned = new Set([safeIndex, ...neighbors(safeIndex, d)])
  let candidates = next.map((_, i) => i).filter((i) => !banned.has(i))
  // 格子太少放不下時（極端自訂），退而只保護點擊的那一格
  if (candidates.length < d.mines) candidates = next.map((_, i) => i).filter((i) => i !== safeIndex)
  for (let n = 0; n < d.mines; n++) {
    const k = Math.floor(rand() * candidates.length)
    next[candidates[k]].mine = true
    candidates.splice(k, 1)
  }
  next.forEach((cell, i) => {
    cell.adjacent = neighbors(i, d).filter((j) => next[j].mine).length
  })
  return next
}

/** 翻開一格；周圍沒有雷的空格會連鎖翻開。回傳新盤面與是否踩雷 */
export function revealCell(board: Cell[], d: Difficulty, index: number): { board: Cell[]; hitMine: boolean } {
  const start = board[index]
  if (start.revealed || start.flagged) return { board, hitMine: false }
  const next = board.map((c) => ({ ...c }))
  if (next[index].mine) {
    next[index].revealed = true
    return { board: next, hitMine: true }
  }
  const stack = [index]
  while (stack.length) {
    const i = stack.pop()!
    const cell = next[i]
    if (cell.revealed || cell.flagged || cell.mine) continue
    cell.revealed = true
    if (cell.adjacent === 0) stack.push(...neighbors(i, d))
  }
  return { board: next, hitMine: false }
}

/** 對已翻開的數字：周圍旗子數等於數字時，翻開其餘鄰格 */
export function chordCell(board: Cell[], d: Difficulty, index: number): { board: Cell[]; hitMine: boolean } {
  const cell = board[index]
  if (!cell.revealed || cell.adjacent === 0) return { board, hitMine: false }
  const around = neighbors(index, d)
  if (around.filter((j) => board[j].flagged).length !== cell.adjacent) return { board, hitMine: false }
  let cur = board
  let hit = false
  for (const j of around) {
    if (cur[j].revealed || cur[j].flagged) continue
    const res = revealCell(cur, d, j)
    cur = res.board
    hit = hit || res.hitMine
  }
  return { board: cur, hitMine: hit }
}

export function toggleFlag(board: Cell[], index: number): Cell[] {
  if (board[index].revealed) return board
  const next = board.slice()
  next[index] = { ...board[index], flagged: !board[index].flagged }
  return next
}

export function isWon(board: Cell[]): boolean {
  return board.every((c) => c.mine || c.revealed)
}

/** 輸了以後顯示所有地雷；贏了以後自動把地雷插旗 */
export function revealAllMines(board: Cell[], won: boolean): Cell[] {
  return board.map((c) => (c.mine ? (won ? { ...c, flagged: true } : { ...c, revealed: !c.flagged }) : c))
}
