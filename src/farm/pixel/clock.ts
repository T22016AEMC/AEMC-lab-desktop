/**
 * 鐘樓的時鐘：鐘面（金色外框、奶油色底、12 個刻度）與指針完全由程式用像素畫出來，
 * 疊在鐘樓素材上，蓋過原圖那個小的空白鐘面。
 */

/**
 * 指針角度（度）。以 12 點鐘方向為 0 度、順時針增加。
 * hour 是「遊戲的時間來源」給的小時（含小數，例如 14.5 = 14:30，小數部分含秒）。
 *  - 分針 = 分鐘 × 6（含秒的連續值）
 *  - 時針 = (時 % 12) × 30 + 分鐘 × 0.5
 */
export function clockAngles(hour: number): { hour: number; minute: number } {
  const total = ((hour % 24) + 24) % 24
  const h = Math.floor(total + 1e-9)
  const minutes = (total - h) * 60
  return { hour: (h % 12) * 30 + minutes * 0.5, minute: minutes * 6 }
}

/** 鐘面的半徑（邏輯像素）：直徑約 48 */
export const CLOCK_RADIUS = 24

const GOLD = '#e0a82e'
const GOLD_LIGHT = '#f7d36a'
const GOLD_DARK = '#b07a14'
const OUTLINE = '#4a3010'
const CREAM = '#fff3d4'
const INK = '#3b2a1c'
const DOT = '#b8472c'

let dial: HTMLCanvasElement | null = null

/** 靜態的鐘面（外框＋底＋刻度），只畫一次 */
function getDial(): HTMLCanvasElement {
  if (dial) return dial
  const R = CLOCK_RADIUS
  const size = R * 2 + 5
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  const cx = size / 2
  const cy = size / 2
  const px = (x: number, y: number, color: string): void => {
    g.fillStyle = color
    g.fillRect(x, y, 1, 1)
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d > R) continue
      if (d > R - 1) px(x, y, OUTLINE)
      else if (d > R - 4) px(x, y, x + y < cx + cy - 6 ? GOLD_LIGHT : x + y > cx + cy + 8 ? GOLD_DARK : GOLD)
      else if (d > R - 5) px(x, y, OUTLINE)
      else px(x, y, CREAM)
    }
  // 刻度：12、3、6、9 點較粗較長
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6
    const major = k % 3 === 0
    const r0 = R - (major ? 11 : 9)
    const r1 = R - 7
    for (let r = r0; r <= r1; r += 0.5) {
      const x = Math.round(cx + Math.sin(a) * r - (major ? 1 : 0.5))
      const y = Math.round(cy - Math.cos(a) * r - (major ? 1 : 0.5))
      g.fillStyle = INK
      g.fillRect(x, y, major ? 2 : 1, major ? 2 : 1)
    }
  }
  dial = c
  return c
}

/** 畫一根指針（像素線）：從中心往 angle 方向畫 len 像素，粗 w */
function hand(ctx: CanvasRenderingContext2D, cx: number, cy: number, angleDeg: number, len: number, w: number, color: string): void {
  const a = (angleDeg * Math.PI) / 180
  ctx.fillStyle = color
  const off = Math.floor((w - 1) / 2)
  for (let t = 0; t <= len; t += 0.4) {
    ctx.fillRect(Math.round(cx + Math.sin(a) * t) - off, Math.round(cy - Math.cos(a) * t) - off, w, w)
  }
}

/** 畫整個時鐘；(cx, cy) 是鐘面中心（邏輯座標，取整數） */
export function drawClock(ctx: CanvasRenderingContext2D, cx: number, cy: number, hour: number): void {
  const R = CLOCK_RADIUS
  const d = getDial()
  const x = Math.round(cx)
  const y = Math.round(cy)
  ctx.drawImage(d, x - Math.floor(d.width / 2), y - Math.floor(d.height / 2))
  const ang = clockAngles(hour)
  hand(ctx, x, y, ang.minute, R - 8, 1, INK)
  hand(ctx, x, y, ang.hour, Math.round(R * 0.5), 2, INK)
  ctx.fillStyle = DOT
  ctx.fillRect(x - 1, y - 1, 3, 3)
}
