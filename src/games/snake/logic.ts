export const COLS = 20
export const ROWS = 20

export type Dir = 'up' | 'down' | 'left' | 'right'
export interface Point {
  x: number
  y: number
}

export interface SnakeState {
  /** body[0] 是蛇頭 */
  body: Point[]
  dir: Dir
  food: Point
  score: number
  alive: boolean
}

const DELTA: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

export function isOpposite(a: Dir, b: Dir): boolean {
  return OPPOSITE[a] === b
}

export function placeFood(body: Point[], rand: () => number = Math.random): Point {
  const taken = new Set(body.map((p) => p.y * COLS + p.x))
  const free: Point[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (!taken.has(y * COLS + x)) free.push({ x, y })
  }
  // 蛇占滿整個畫面時沒有空位，放在蛇頭上（下一步就算贏）
  return free.length ? free[Math.floor(rand() * free.length)] : { ...body[0] }
}

export function newState(rand: () => number = Math.random): SnakeState {
  const cy = Math.floor(ROWS / 2)
  const body = [
    { x: 6, y: cy },
    { x: 5, y: cy },
    { x: 4, y: cy },
  ]
  return { body, dir: 'right', food: placeFood(body, rand), score: 0, alive: true }
}

/** 前進一步：撞牆或撞到自己就死亡；吃到食物就變長、加一分 */
export function step(state: SnakeState, dir: Dir, rand: () => number = Math.random): SnakeState {
  if (!state.alive) return state
  const d = DELTA[dir]
  const head = { x: state.body[0].x + d.x, y: state.body[0].y + d.y }
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) return { ...state, dir, alive: false }

  const ate = head.x === state.food.x && head.y === state.food.y
  // 沒吃到時尾巴會同時前進，所以下一步可以走進原本尾巴的格子
  const bodyAfter = ate ? state.body : state.body.slice(0, -1)
  if (bodyAfter.some((p) => p.x === head.x && p.y === head.y)) return { ...state, dir, alive: false }

  const body = [head, ...bodyAfter]
  return {
    body,
    dir,
    score: state.score + (ate ? 1 : 0),
    alive: true,
    food: ate ? placeFood(body, rand) : state.food,
  }
}

/** 每一步的間隔（毫秒）：分數越高越快，最快 60ms */
export function tickInterval(score: number): number {
  return Math.max(60, 150 - score * 3)
}
