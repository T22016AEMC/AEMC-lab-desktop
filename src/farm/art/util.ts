export const TAU = Math.PI * 2

const cache = new Map<string, Path2D>()

/** SVG 路徑字串 → Path2D（快取，每條路徑只解析一次） */
export function P(d: string): Path2D {
  let p = cache.get(d)
  if (!p) {
    p = new Path2D(d)
    cache.set(d, p)
  }
  return p
}

export interface PartOpts {
  /** 旋轉／縮放的支點（部件自己的座標） */
  px?: number
  py?: number
  rot?: number
  sx?: number
  sy?: number
  /** 平移（在旋轉之後套用，讓部件隨關節移動） */
  dx?: number
  dy?: number
  alpha?: number
  stroke?: string
  lw?: number
}

function place(ctx: CanvasRenderingContext2D, o: PartOpts): void {
  const px = o.px ?? 0
  const py = o.py ?? 0
  ctx.translate((o.dx ?? 0) + px, (o.dy ?? 0) + py)
  if (o.rot) ctx.rotate(o.rot)
  if (o.sx !== undefined || o.sy !== undefined) ctx.scale(o.sx ?? 1, o.sy ?? 1)
  ctx.translate(-px, -py)
}

/**
 * 繪製一個部件：SVG 路徑資料 d 以指定顏色填色（可再描邊），可整體旋轉／縮放／平移。
 * 每個可活動的部件都用這個函式畫，動畫就是改變 opts。
 */
export function part(ctx: CanvasRenderingContext2D, d: string, fill: string | null, o: PartOpts = {}): void {
  ctx.save()
  place(ctx, o)
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha
  const path = P(d)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill(path)
  }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke
    ctx.lineWidth = o.lw ?? 1.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke(path)
  }
  ctx.restore()
}

/** 把後面的繪製裁切在某條路徑內（花紋、斑點不會超出身體） */
export function clipTo(ctx: CanvasRenderingContext2D, d: string, draw: () => void, o: PartOpts = {}): void {
  ctx.save()
  place(ctx, o)
  ctx.clip(P(d))
  draw()
  ctx.restore()
}

export function ellD(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`
}

export function rrD(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2)
  return `M${x + rr} ${y}H${x + w - rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${y + h - rr}a${rr} ${rr} 0 0 1 ${-rr} ${rr}H${x + rr}a${rr} ${rr} 0 0 1 ${-rr} ${-rr}V${y + rr}a${rr} ${rr} 0 0 1 ${rr} ${-rr}Z`
}

/** 把 #rrggbb 調亮（amt > 0）或調暗（amt < 0） */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const ch = (v: number): number => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`
}

export interface EyeOpts {
  closed?: boolean
  /** 虹膜顏色（藍眼睛等）；沒有就是單色圓眼 */
  iris?: string
  color?: string
  /** 外圈（讓黑色眼睛在黑色身體上也看得見） */
  ring?: string
  /** 貓的直瞳 */
  slit?: boolean
}

/** 可愛的眼睛：圓形＋高光；閉眼時是向下彎的弧線 */
export function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, o: EyeOpts = {}): void {
  const color = o.color ?? '#2b2230'
  if (o.closed) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1.3, r * 0.5)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(x, y - r * 0.15, r * 0.95, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
    ctx.restore()
    return
  }
  ctx.save()
  if (o.ring) {
    ctx.fillStyle = o.ring
    ctx.beginPath()
    ctx.arc(x, y, r * 1.28, 0, TAU)
    ctx.fill()
  }
  if (o.iris) {
    ctx.fillStyle = o.iris
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
    ctx.fillStyle = color
    if (o.slit) {
      ctx.beginPath()
      ctx.ellipse(x, y, r * 0.32, r * 0.92, 0, 0, TAU)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, r * 0.55, 0, TAU)
      ctx.fill()
    }
  } else {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(x + r * 0.32, y - r * 0.36, r * 0.34, 0, TAU)
  ctx.fill()
  ctx.restore()
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))

export function circ(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
}

/** 一段漸細的肢節（圓頭），用於蟹腳、螯臂等 */
export function taper(
  ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, color: string,
): void {
  const a = Math.atan2(y1 - y0, x1 - x0)
  const nx = -Math.sin(a)
  const ny = Math.cos(a)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x0 + (nx * w0) / 2, y0 + (ny * w0) / 2)
  ctx.lineTo(x1 + (nx * w1) / 2, y1 + (ny * w1) / 2)
  ctx.arc(x1, y1, w1 / 2, a + Math.PI / 2, a - Math.PI / 2, true)
  ctx.lineTo(x0 - (nx * w0) / 2, y0 - (ny * w0) / 2)
  ctx.arc(x0, y0, w0 / 2, a - Math.PI / 2, a + Math.PI / 2, true)
  ctx.closePath()
  ctx.fill()
}

/** 以中心點與半徑畫的六角形路徑（龜甲的甲片） */
export function hexD(cx: number, cy: number, rx: number, ry: number): string {
  let d = ''
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rx).toFixed(1)} ${(cy + Math.sin(a) * ry).toFixed(1)}`
  }
  return d + 'Z'
}

/** #rrggbb + 透明度 → rgba() 字串（漸層用） */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export type Pt = [number, number]

/** 三次貝茲曲線上的取樣點 */
export function bezierPts(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return out
}

export interface TaperOpts {
  steps?: number
  /** 環紋：每隔 every 段換成 ring 顏色（虎斑貓尾巴） */
  rings?: { color: string; every: number }
  /** 毛茸茸的邊緣：沿著尾巴兩側加小圓（同色） */
  fuzzy?: number
  /** 蓬鬆的圓弧：在尾巴上緣的這些位置（0～1）各加一個柔和的圓丘 */
  bumps?: number[]
}

/** 沿一條三次貝茲曲線畫由粗漸細的尾巴（圓頭），回傳取樣點方便再加裝飾 */
export function bezierTaper(
  ctx: CanvasRenderingContext2D, p0: Pt, p1: Pt, p2: Pt, p3: Pt, w0: number, w1: number, color: string, o: TaperOpts = {},
): Pt[] {
  const n = o.steps ?? 18
  const pts = bezierPts(p0, p1, p2, p3, n)
  for (let i = 0; i < n; i++) {
    const w = lerp(w0, w1, i / n)
    const wn = lerp(w0, w1, (i + 1) / n)
    const ring = o.rings && Math.floor(i / o.rings.every) % 2 === 1
    taper(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, wn, ring ? o.rings!.color : color)
  }
  if (o.bumps) {
    for (const f of o.bumps) {
      const i = Math.max(1, Math.min(n - 1, Math.round(f * n)))
      const [x, y] = pts[i]
      const [px, py] = pts[i - 1]
      const [qx, qy] = pts[i + 1]
      const tl = Math.hypot(qx - px, qy - py) || 1
      let nx = -(qy - py) / tl
      let ny = (qx - px) / tl
      if (ny > 0) {
        nx = -nx
        ny = -ny
      }
      const w = lerp(w0, w1, i / n)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x + nx * w * 0.32, y + ny * w * 0.32, w * 0.46, 0, TAU)
      ctx.fill()
    }
  }
  if (o.fuzzy) {
    for (let i = 1; i < n; i++) {
      const [x, y] = pts[i]
      const [px, py] = pts[i - 1]
      const [qx, qy] = pts[Math.min(n, i + 1)]
      const a = Math.atan2(qy - py, qx - px)
      const w = lerp(w0, w1, i / n) / 2
      for (const s of [-1, 1]) {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x - Math.sin(a) * w * s, y + Math.cos(a) * w * s, o.fuzzy * (0.9 + 0.3 * Math.sin(i * 2.3 + s)), 0, TAU)
        ctx.fill()
      }
    }
  }
  return pts
}
