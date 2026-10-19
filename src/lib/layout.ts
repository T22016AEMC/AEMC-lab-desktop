import type { Rect, Size } from '../types'

export const DEFAULT_WINDOW_SIZE: Size = { width: 900, height: 600 }
export const DEFAULT_MIN_SIZE: Size = { width: 320, height: 220 }

/** 橫向高度小於此值視為手機尺寸 */
export const COMPACT_HEIGHT = 500

export interface Metrics {
  menuBar: number
  /** Dock 底部保留的空間（Dock 本體＋邊距） */
  dockReserve: number
  dockIcon: number
  titleBar: number
}

const NORMAL: Metrics = { menuBar: 28, dockReserve: 88, dockIcon: 52, titleBar: 36 }
const COMPACT: Metrics = { menuBar: 22, dockReserve: 52, dockIcon: 32, titleBar: 30 }

export function getMetrics(compact: boolean): Metrics {
  return compact ? COMPACT : NORMAL
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

/** 選單列與 Dock 之間可用的空間 */
export function workArea(vp: Size, compact: boolean): Rect {
  const m = getMetrics(compact)
  return { x: 0, y: m.menuBar, width: vp.width, height: Math.max(0, vp.height - m.menuBar - m.dockReserve) }
}

/** 把視窗矩形限制在畫面內（至少保留標題列可抓取的範圍） */
export function visibleRect(r: Rect, vp: Size, compact: boolean): Rect {
  const m = getMetrics(compact)
  const width = Math.min(r.width, vp.width)
  const height = Math.min(r.height, vp.height - m.menuBar)
  return {
    width,
    height,
    x: clamp(r.x, -(width - 100), vp.width - 100),
    y: clamp(r.y, m.menuBar, vp.height - 40),
  }
}
