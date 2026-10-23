import type { Rect, Size } from '../types'

export const DEFAULT_WINDOW_SIZE: Size = { width: 900, height: 600 }
export const DEFAULT_MIN_SIZE: Size = { width: 320, height: 220 }

/** 可視寬度小於此值就不載入桌面，改顯示「僅支援電腦」提示頁（平板橫向寬度夠就當電腦） */
export const MIN_DESKTOP_WIDTH = 1024

export interface Metrics {
  menuBar: number
  /** Dock 底部保留的空間（Dock 本體＋邊距） */
  dockReserve: number
  dockIcon: number
  titleBar: number
}

const METRICS: Metrics = { menuBar: 28, dockReserve: 88, dockIcon: 52, titleBar: 36 }

export function getMetrics(): Metrics {
  return METRICS
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

/** 選單列與 Dock 之間可用的空間 */
export function workArea(vp: Size): Rect {
  const m = getMetrics()
  return { x: 0, y: m.menuBar, width: vp.width, height: Math.max(0, vp.height - m.menuBar - m.dockReserve) }
}

/** 把視窗矩形限制在畫面內（至少保留標題列可抓取的範圍） */
export function visibleRect(r: Rect, vp: Size): Rect {
  const m = getMetrics()
  const width = Math.min(r.width, vp.width)
  const height = Math.min(r.height, vp.height - m.menuBar)
  return {
    width,
    height,
    x: clamp(r.x, -(width - 100), vp.width - 100),
    y: clamp(r.y, m.menuBar, vp.height - 40),
  }
}
