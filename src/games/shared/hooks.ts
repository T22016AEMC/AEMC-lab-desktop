import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { readNumber, writeNumber } from '../../lib/storage'
import type { BuiltinAppProps } from '../../types'

export type GameStatus = 'ready' | 'playing' | 'paused' | 'over'

/**
 * 遊戲狀態機：ready → playing ⇄ paused → over。
 * 視窗最小化、不是作用中視窗、分頁隱藏或瀏覽器失去焦點時，自動從 playing 轉為 paused。
 */
export function useGameStatus({ active, minimized }: BuiltinAppProps) {
  const [status, setStatus] = useState<GameStatus>('ready')

  const start = useCallback(() => setStatus('playing'), [])
  const pause = useCallback(() => setStatus((s) => (s === 'playing' ? 'paused' : s)), [])
  const resume = useCallback(() => setStatus((s) => (s === 'paused' ? 'playing' : s)), [])
  const finish = useCallback(() => setStatus('over'), [])
  const reset = useCallback(() => setStatus('ready'), [])

  useEffect(() => {
    if (!active || minimized) pause()
  }, [active, minimized, pause])

  useEffect(() => {
    const onHidden = () => document.hidden && pause()
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('blur', pause)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('blur', pause)
    }
  }, [pause])

  return { status, start, pause, resume, finish, reset }
}

/** 最高紀錄（存在 localStorage）。lowerIsBetter 用於「時間越短越好」的紀錄 */
export function useBest(key: string, lowerIsBetter = false) {
  const [best, setBest] = useState<number | null>(() => readNumber(key))

  useEffect(() => {
    setBest(readNumber(key))
  }, [key])

  /** 提交成績；回傳是否破紀錄 */
  const submit = useCallback(
    (value: number): boolean => {
      const cur = readNumber(key)
      const better = cur === null || (lowerIsBetter ? value < cur : value > cur)
      if (better) {
        writeNumber(key, value)
        setBest(value)
      }
      return better
    },
    [key, lowerIsBetter],
  )

  return { best, submit }
}

export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

/** requestAnimationFrame 迴圈，dt 為秒（上限 0.05，避免切回分頁時一次跳很大） */
export function useAnimationFrame(callback: (dt: number) => void): void {
  const cb = useRef(callback)
  cb.current = callback
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      cb.current(dt)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
}

/** 鍵盤事件；enabled 為 false 時不監聽。回傳 true 表示已處理（會 preventDefault） */
export function useKeys(
  onKeyDown: ((e: KeyboardEvent) => boolean | void) | null,
  onKeyUp: ((e: KeyboardEvent) => boolean | void) | null,
  enabled: boolean,
): void {
  const down = useRef(onKeyDown)
  const up = useRef(onKeyUp)
  down.current = onKeyDown
  up.current = onKeyUp
  useEffect(() => {
    if (!enabled) return
    const kd = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (down.current?.(e)) e.preventDefault()
    }
    const ku = (e: KeyboardEvent) => {
      if (up.current?.(e)) e.preventDefault()
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [enabled])
}

/** 滑動手勢（觸控或滑鼠拖曳），回傳要綁在元素上的事件 */
export function useSwipe(onSwipe: (dir: 'up' | 'down' | 'left' | 'right') => void, threshold = 24) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const handler = useRef(onSwipe)
  handler.current = onSwipe
  return {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current
      if (!s || s.id !== e.pointerId) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return
      start.current = null
      if (Math.abs(dx) > Math.abs(dy)) handler.current(dx > 0 ? 'right' : 'left')
      else handler.current(dy > 0 ? 'down' : 'up')
    },
    onPointerUp: () => {
      start.current = null
    },
    onPointerCancel: () => {
      start.current = null
    },
  }
}
