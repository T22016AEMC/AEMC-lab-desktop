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

/**
 * v3.10.0 相框日期：三款相框的下白邊都畫滿了裝飾，沒有空位寫日期，所以在相框底部加高一條白邊（DATE_STRIP 個相框像素），
 * 日期寫在新白邊正中（「2026/11/19」，3×5 點陣、深灰色）。
 * 做法（三款相同）：相框的第 0 列～倒數第 3 列照原樣畫在上面 → 中間 DATE_STRIP 列：左右邊框照「倒數第 3 列」的邊框延伸（從外往內到第一個白色像素為止），
 * 中間填白色（倒數第 2 列最常見的白色）→ 最後 2 列（底邊的白邊與外框）照原樣畫在最下面。所以邊框與圓角接得起來，裝飾沒有被拉長。
 * 字用內建的點陣（DATE_FONT），一點 = 一個相框像素，以 fillRect 畫，輸出時和相框一起整數倍放大，不會糊。
 */
export const DATE_STRIP = 8
export const DATE_COLOR = '#4a4642'
/** 3×5 點陣：0～9 與「/」，每個字 5 列、每列 3 個點（1 = 畫） */
export const DATE_FONT: Record<string, readonly string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '/': ['001', '001', '010', '100', '100'],
}

/** 拍照日期文字「YYYY/MM/DD」（本機日期） */
export function photoDateText(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
}

/** 點陣文字的點（相框像素座標，左上角 = (0,0)）；字距 1 點。寬 = 字數 × 4 − 1、高 5 */
export function dateDots(text: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  ;[...text].forEach((ch, i) => {
    const g = DATE_FONT[ch]
    if (!g) return
    g.forEach((row, y) => [...row].forEach((b, x) => b === '1' && out.push({ x: i * 4 + x, y })))
  })
  return out
}
export const dateTextWidth = (text: string): number => [...text].length * 4 - 1

/** 加高白邊用的資料：倒數第 3 列左右邊框的寬度與像素、白色（由相框圖的像素算出，每款相框算一次就快取） */
export interface StripEdges {
  left: { w: number }
  right: { w: number }
  white: string
}
const isWhiteish = (r: number, g: number, b: number, a: number): boolean => a > 0 && r >= 232 && g >= 232 && b >= 232

/** 從相框的像素（frame.w × frame.h 的 RGBA）算出加高白邊的邊框寬度與白色 */
export function stripEdgesFrom(px: Uint8ClampedArray, w: number, h: number): StripEdges {
  const at = (x: number, y: number) => { const o = (y * w + x) * 4; return [px[o], px[o + 1], px[o + 2], px[o + 3]] as const }
  const row = h - 3
  let lw = 0
  while (lw < w && !isWhiteish(...at(lw, row))) lw++
  let rw = 0
  while (rw < w && !isWhiteish(...at(w - 1 - rw, row))) rw++
  // 白色：倒數第 2 列最常見的白色
  const count = new Map<string, number>()
  for (let x = 0; x < w; x++) {
    const [r, g, b, a] = at(x, h - 2)
    if (!isWhiteish(r, g, b, a)) continue
    const k = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  let white = '#fefcf7'
  let best = 0
  for (const [k, c] of count) if (c > best) { best = c; white = k }
  return { left: { w: lw + 1 }, right: { w: rw + 1 }, white }
}

const edgeCache = new WeakMap<object, Map<string, StripEdges>>()
function stripEdges(frame: Sprite): StripEdges {
  let m = edgeCache.get(frame.img)
  if (!m) { m = new Map(); edgeCache.set(frame.img, m) }
  const key = `${frame.x},${frame.y}`
  const hit = m.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = frame.w
  c.height = frame.h
  const cx = c.getContext('2d')
  let e: StripEdges = { left: { w: 3 }, right: { w: 3 }, white: '#fefcf7' }
  if (cx) {
    cx.drawImage(frame.img, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h)
    e = stripEdgesFrom(cx.getImageData(0, 0, frame.w, frame.h).data, frame.w, frame.h)
  }
  m.set(key, e)
  return e
}

/** 下載檔名 picnic-YYYYMMDD-HHmmss.png（本機時間） */
export function photoFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `picnic-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`
}

/**
 * 組出拍立得：先畫照片（裁切範圍 × PHOTO_SCALE，左上角對齊窗口左上角），再疊相框。
 * date（v3.10.0）：有給就在相框底部加高 DATE_STRIP 列白邊、寫上日期（輸出高度 = (相框高 + DATE_STRIP) × FRAME_SCALE）；沒給 = 和 v3.9.x 相同。
 */
export function composePolaroid(scene: HTMLCanvasElement, crop: Rect, frame: Sprite, win: Rect, date?: Date): HTMLCanvasElement {
  const F = FRAME_SCALE
  const extra = date ? DATE_STRIP : 0
  const out = document.createElement('canvas')
  out.width = frame.w * F
  out.height = (frame.h + extra) * F
  const ctx = out.getContext('2d')
  if (!ctx) return out
  ctx.imageSmoothingEnabled = false
  const cw = crop.x1 - crop.x0
  const ch = crop.y1 - crop.y0
  ctx.drawImage(scene, crop.x0, crop.y0, cw, ch, win.x0 * F, win.y0 * F, cw * PHOTO_SCALE, ch * PHOTO_SCALE)
  if (!date) {
    ctx.drawImage(frame.img, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w * F, frame.h * F)
    return out
  }
  const top = frame.h - 2 // 照原樣畫的上半部列數（到倒數第 3 列）
  const e = stripEdges(frame)
  ctx.drawImage(frame.img, frame.x, frame.y, frame.w, top, 0, 0, frame.w * F, top * F)
  // 加高的白邊：中間填白，左右邊框用倒數第 3 列的邊框往下延伸
  ctx.fillStyle = e.white
  ctx.fillRect(e.left.w * F, top * F, (frame.w - e.left.w - e.right.w) * F, extra * F)
  ctx.drawImage(frame.img, frame.x, frame.y + top - 1, e.left.w, 1, 0, top * F, e.left.w * F, extra * F)
  ctx.drawImage(frame.img, frame.x + frame.w - e.right.w, frame.y + top - 1, e.right.w, 1, (frame.w - e.right.w) * F, top * F, e.right.w * F, extra * F)
  // 底邊 2 列照原樣
  ctx.drawImage(frame.img, frame.x, frame.y + top, frame.w, 2, 0, (top + extra) * F, frame.w * F, 2 * F)
  // 日期：新白邊（加上底下那一列白邊共 extra + 1 列）正中
  const text = photoDateText(date)
  const x0 = Math.floor((frame.w - dateTextWidth(text)) / 2)
  const y0 = top + Math.floor((extra + 1 - 5) / 2)
  ctx.fillStyle = DATE_COLOR
  for (const d of dateDots(text)) ctx.fillRect((x0 + d.x) * F, (y0 + d.y) * F, F, F)
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
