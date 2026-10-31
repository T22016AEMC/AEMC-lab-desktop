import { assets } from '../pixel/assets'
import type { Layout } from '../pixel/layout'

/**
 * 玩耍（丟球）時畫布上的游標：用場景裡同一張小球（toy_ball_s），以整數倍放大成好辨識的大小（每個邏輯像素至少 3 個 CSS 像素，
 * 場景放大倍率更高時跟著放大），熱點在球心。CSS 游標沒有延遲，離開畫布（選單列、按鈕）自動恢復一般游標。
 * 產生失敗（素材還沒載入、瀏覽器不支援）就退回十字游標。
 */
let cache: { m: number; css: string } | null = null

export function ballCursor(L: Layout): string {
  const s = assets.get('toy_ball_s')
  if (!s) return 'crosshair'
  const m = Math.max(Math.round(L.S / L.dpr), 3)
  if (cache?.m === m) return cache.css
  try {
    const c = document.createElement('canvas')
    c.width = s.w * m
    c.height = s.h * m
    const ctx = c.getContext('2d')
    if (!ctx) return 'crosshair'
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, c.width, c.height)
    const css = `url(${c.toDataURL('image/png')}) ${Math.round(c.width / 2)} ${Math.round(c.height / 2)}, crosshair`
    cache = { m, css }
    return css
  } catch {
    return 'crosshair'
  }
}
