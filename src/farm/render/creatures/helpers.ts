export const TAU = Math.PI * 2

export function ell(
  ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0,
): void {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU)
  ctx.fill()
}

export function circ(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU)
  ctx.fill()
}

/** 圓頭粗線（腿、尾巴、鰭） */
export function limb(
  ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

export function curve(
  ctx: CanvasRenderingContext2D, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, w: number, color: string,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.quadraticCurveTo(cx, cy, x2, y2)
  ctx.stroke()
}

/** 把 #rrggbb 調亮或調暗（amt：-1～1） */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number): number => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `rgb(${r},${g},${b})`
}

/** 可愛的眼睛：圓形黑眼珠＋高光，閉眼時畫一條弧線 */
export function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, closed: boolean, color = '#2b2230'): void {
  if (closed) {
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1.2, r * 0.5)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(x, y - r * 0.2, r * 0.9, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
    return
  }
  circ(ctx, x, y, r, color)
  circ(ctx, x + r * 0.3, y - r * 0.35, r * 0.38, '#ffffff')
}
