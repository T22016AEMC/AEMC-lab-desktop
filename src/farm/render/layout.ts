/**
 * 場景版面。邏輯座標：畫面高度固定為 900，水平寬度 Wl 依視窗比例變化（16:9 時 1600）。
 * 背景一律畫滿 0～Wl，所以任何比例都不會有空白或黑邊；
 * 陸地與池塘各佔畫面寬度的一半，生物的活動範圍都由 Wl 推算。
 */
export const WORLD_H = 900

/** 地平線與水面（天空在它們上方） */
export const HORIZON_Y = 396
export const WATER_TOP = 414
export const SAND_TOP = 800

export const LAND_MIN_Y = 480
export const LAND_MAX_Y = 862

/** 池塘與陸地之間的邊牆寬度 */
export const WALL_W = 34

export interface Layout {
  cssW: number
  cssH: number
  /** 每個邏輯單位對應的 CSS 像素 */
  s: number
  /** 邏輯寬度 */
  Wl: number
  /** 陸地（左半）與池塘（右半）的分界 */
  half: number
  /** 依池塘寬度縮放海洋生物，讓大型生物放得進較窄的池塘 */
  fit: number
}

export function makeLayout(cssW: number, cssH: number): Layout {
  const s = cssH / WORLD_H
  const Wl = cssW / s
  const half = Wl / 2
  return { cssW, cssH, s, Wl, half, fit: Math.min(1, Math.max(0.4, half / 800)) }
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function landRect(l: Layout): Rect {
  return { x0: 56, y0: LAND_MIN_Y, x1: l.half - WALL_W - 36, y1: LAND_MAX_Y }
}

export function pondRect(l: Layout): Rect {
  return { x0: l.half + 14, y0: WATER_TOP + 6, x1: l.Wl - 22, y1: SAND_TOP }
}

/** 陸地越靠近畫面下方（越近）看起來越大 */
export function perspective(y: number): number {
  const t = Math.min(1, Math.max(0, (y - LAND_MIN_Y) / (LAND_MAX_Y - LAND_MIN_Y)))
  return 0.8 + t * 0.36
}

export const clamp = (v: number, a: number, b: number): number => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b))
