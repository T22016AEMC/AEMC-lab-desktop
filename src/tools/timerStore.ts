import { create } from 'zustand'
import { TOOLS } from '../config/tools'
import { useUIStore } from '../store/uiStore'
import { cdCheck, cdPause, cdReset, cdStart, newCountdown, newStopwatch, swLap, swPause, swReset, swStart, type Countdown, type Stopwatch } from './timer'

/**
 * 碼表與倒數的狀態（v3.7.0）：只存在記憶體（不進存檔）。關掉視窗後繼續跑，重新整理網頁就清掉。
 * 時間來源是真實時間（Date.now），不受測試模式的遊戲時間平移影響。
 * 倒數到 0：用 toast 提示「倒數完成」（視窗關著也會提示）。提示時機由「結束時間」決定：
 * 排一個 setTimeout 到結束時間再檢查，分頁回到前景（visibilitychange）時也檢查一次；
 * 背景分頁的計時器可能被瀏覽器延後觸發，但顯示的剩餘時間永遠是用時間戳記算的，不會漂移。
 */

interface TimerState {
  sw: Stopwatch
  cd: Countdown
  swStart: () => void
  swPause: () => void
  swReset: () => void
  swLap: () => void
  /** 開始倒數（idle 時用傳入的長度；paused 時繼續） */
  cdStart: (durationMs?: number) => void
  cdPause: () => void
  cdReset: () => void
  /** 檢查倒數是否到時間（到了就提示一次） */
  cdCheck: () => void
}

/** 測試可以換掉時間來源 */
let clock: () => number = () => Date.now()
export function setTimerClock(fn: () => number): void {
  clock = fn
}

let doneTimer: ReturnType<typeof setTimeout> | undefined
function schedule(cd: Countdown): void {
  if (doneTimer !== undefined) clearTimeout(doneTimer)
  doneTimer = undefined
  if (cd.status !== 'running') return
  // 多等 20 ms：計時器可能比預定時間早一點點觸發
  doneTimer = setTimeout(() => useTimerStore.getState().cdCheck(), Math.max(0, cd.endAt - clock()) + 20)
}

export const useTimerStore = create<TimerState>((set, get) => ({
  sw: newStopwatch(),
  cd: newCountdown(),
  swStart: () => set((s) => ({ sw: swStart(s.sw, clock()) })),
  swPause: () => set((s) => ({ sw: swPause(s.sw, clock()) })),
  swReset: () => set({ sw: swReset() }),
  swLap: () => set((s) => ({ sw: swLap(s.sw, clock()) })),
  cdStart: (durationMs) => {
    const cd = cdStart(get().cd, clock(), durationMs ?? get().cd.durationMs)
    set({ cd })
    schedule(cd)
  },
  cdPause: () => {
    const cd = cdPause(get().cd, clock())
    set({ cd })
    schedule(cd)
  },
  cdReset: () => {
    const cd = cdReset(get().cd)
    set({ cd })
    schedule(cd)
  },
  cdCheck: () => {
    const r = cdCheck(get().cd, clock())
    if (r.finished) {
      set({ cd: r.next })
      useUIStore.getState().showToast(TOOLS.timer.doneMessage, TOOLS.timer.doneToastMs, 'event')
    } else schedule(r.next)
  },
}))

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) useTimerStore.getState().cdCheck()
  })
}
