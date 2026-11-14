import { TOOLS } from '../config/tools'

/**
 * 碼表與倒數的計時邏輯（v3.7.0）：純函式、時間由呼叫端傳入（毫秒時間戳），可以用假時鐘測試。
 * 一律用「時間戳記的差值」計算（開始時記下時間，顯示時用現在減開始），不用 setInterval 累加，
 * 所以分頁在背景、計時器被瀏覽器節流時也不會漂移。
 */

export interface Lap {
  /** 第幾次（1 起算） */
  n: number
  /** 這一圈的時間（和上一次計次的差） */
  split: number
  /** 累計時間 */
  total: number
}

export interface Stopwatch {
  running: boolean
  /** 這一段開始的時間戳（running 時才有意義） */
  startedAt: number
  /** 之前各段累計的毫秒 */
  accMs: number
  /** 新的在最前面 */
  laps: Lap[]
}

export const newStopwatch = (): Stopwatch => ({ running: false, startedAt: 0, accMs: 0, laps: [] })

export function swElapsed(s: Stopwatch, now: number): number {
  return s.accMs + (s.running ? Math.max(0, now - s.startedAt) : 0)
}

export function swStart(s: Stopwatch, now: number): Stopwatch {
  return s.running ? s : { ...s, running: true, startedAt: now }
}

export function swPause(s: Stopwatch, now: number): Stopwatch {
  return s.running ? { ...s, running: false, accMs: swElapsed(s, now) } : s
}

export const swReset = (): Stopwatch => newStopwatch()

/** 還能計次嗎（計時中、而且沒到上限） */
export function swCanLap(s: Stopwatch): boolean {
  return s.running && s.laps.length < TOOLS.timer.lapMax
}

export function swLap(s: Stopwatch, now: number): Stopwatch {
  if (!swCanLap(s)) return s
  const total = swElapsed(s, now)
  const prev = s.laps[0]?.total ?? 0
  return { ...s, laps: [{ n: s.laps.length + 1, split: total - prev, total }, ...s.laps] }
}

export type CountdownStatus = 'idle' | 'running' | 'paused' | 'done'

export interface Countdown {
  status: CountdownStatus
  /** 設定的總長（毫秒） */
  durationMs: number
  /** running：結束的時間戳 */
  endAt: number
  /** paused：暫停時剩下的毫秒 */
  leftMs: number
}

export const newCountdown = (durationMs = 0): Countdown => ({ status: 'idle', durationMs, endAt: 0, leftMs: durationMs })

/** 時分秒 → 毫秒（各欄夾在合法範圍、取整數）；不合法的輸入當成 0 */
export function hmsToMs(h: number, m: number, s: number): number {
  const clamp = (v: number, max: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0)
  return (clamp(h, TOOLS.timer.maxHours) * 3600 + clamp(m, 59) * 60 + clamp(s, 59)) * 1000
}

export function cdLeft(c: Countdown, now: number): number {
  if (c.status === 'running') return Math.max(0, c.endAt - now)
  if (c.status === 'paused') return c.leftMs
  if (c.status === 'done') return 0
  return c.durationMs
}

/** 開始（idle 用設定的長度；paused 從剩下的時間繼續）；長度是 0 就不動 */
export function cdStart(c: Countdown, now: number, durationMs = c.durationMs): Countdown {
  if (c.status === 'running') return c
  if (c.status === 'paused') return { ...c, status: 'running', endAt: now + c.leftMs }
  if (durationMs <= 0) return c
  return { status: 'running', durationMs, endAt: now + durationMs, leftMs: durationMs }
}

export function cdPause(c: Countdown, now: number): Countdown {
  return c.status === 'running' ? { ...c, status: 'paused', leftMs: cdLeft(c, now) } : c
}

export function cdReset(c: Countdown): Countdown {
  return newCountdown(c.durationMs)
}

/** 到時間了嗎：running 而且現在 >= 結束時間 → 回傳 done 狀態（呼叫端只在這時候提示一次） */
export function cdCheck(c: Countdown, now: number): { next: Countdown; finished: boolean } {
  if (c.status === 'running' && now >= c.endAt) return { next: { ...c, status: 'done', leftMs: 0 }, finished: true }
  return { next: c, finished: false }
}

/** 碼表顯示：mm:ss.cc（滿 1 小時是 h:mm:ss.cc），百分之一秒無條件捨去 */
export function formatStopwatch(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 10))
  const cs = t % 100
  const s = Math.floor(t / 100) % 60
  const m = Math.floor(t / 6000) % 60
  const h = Math.floor(t / 360000)
  const p = (n: number) => String(n).padStart(2, '0')
  return (h > 0 ? `${h}:${p(m)}` : p(m)) + `:${p(s)}.${p(cs)}`
}

/** 倒數顯示：h:mm:ss（不到 1 小時是 mm:ss），秒數無條件進位（剩 0.2 秒顯示 00:01，到 0 才顯示 00:00） */
export function formatCountdown(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000))
  const s = t % 60
  const m = Math.floor(t / 60) % 60
  const h = Math.floor(t / 3600)
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`
}
