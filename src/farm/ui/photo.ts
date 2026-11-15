import type { Sprite } from '../pixel/assets'
import type { Rect } from '../pixel/layout'

/**
 * 野餐拍照（v3.8.0）：把場景（1 邏輯像素 = 1 畫布像素的快照）裁一塊，整數倍放大放進拍立得相框的窗口，相框疊在上面。
 * 像素一律維持銳利：只用整數倍、關掉平滑（imageSmoothingEnabled = false），不做任何非整數縮放。
 *
 * 倍率：相框 1 像素 = FRAME_SCALE 個輸出像素、照片 1 像素 = PHOTO_SCALE 個輸出像素。
 * 裁切範圍由窗口大小反推：寬 = ceil(窗口寬 × FRAME_SCALE ÷ PHOTO_SCALE)（高同理），所以照片剛好填滿窗口；
 * 除不盡時往上取整，多出來的最多 PHOTO_SCALE − 1 個輸出像素會壓在相框邊條下面（相框不透明、蓋在照片上），窗口裡不會有空隙。
 * 相框窗口約 50×49 → 裁切約 150×147 邏輯像素（墊子 104×63 加四周一圈草地，後排寵物的頭也在裡面）。
 */
export const FRAME_SCALE = 6
export const PHOTO_SCALE = 2
/** 下載的檔案再整數倍放大這麼多（畫面上顯示的是 1 倍） */
export const DOWNLOAD_SCALE = 2
export const POLAROID_KEYS = ['polaroid_hearts', 'polaroid_flowers', 'polaroid_stars'] as const

/** 相框窗口（meta.window，管線偵測）→ 裁切範圍的大小（邏輯像素） */
export function cropSizeFor(win: Rect): { w: number; h: number } {
  return { w: Math.ceil(((win.x1 - win.x0) * FRAME_SCALE) / PHOTO_SCALE), h: Math.ceil(((win.y1 - win.y0) * FRAME_SCALE) / PHOTO_SCALE) }
}

/** 下載檔名 picnic-YYYYMMDD-HHmmss.png（本機時間） */
export function photoFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `picnic-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`
}

/** 組出拍立得（輸出大小 = 相框 × FRAME_SCALE）：先畫照片（裁切範圍 × PHOTO_SCALE，左上角對齊窗口左上角），再疊相框 */
export function composePolaroid(scene: HTMLCanvasElement, crop: Rect, frame: Sprite, win: Rect): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = frame.w * FRAME_SCALE
  out.height = frame.h * FRAME_SCALE
  const ctx = out.getContext('2d')
  if (!ctx) return out
  ctx.imageSmoothingEnabled = false
  const cw = crop.x1 - crop.x0
  const ch = crop.y1 - crop.y0
  ctx.drawImage(scene, crop.x0, crop.y0, cw, ch, win.x0 * FRAME_SCALE, win.y0 * FRAME_SCALE, cw * PHOTO_SCALE, ch * PHOTO_SCALE)
  ctx.drawImage(frame.img, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w * FRAME_SCALE, frame.h * FRAME_SCALE)
  return out
}

/** 整數倍放大（最近鄰） */
export function upscale(src: HTMLCanvasElement, k: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = src.width * k
  out.height = src.height * k
  const ctx = out.getContext('2d')
  if (!ctx) return out
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return out
}

export function canvasBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'))
}
