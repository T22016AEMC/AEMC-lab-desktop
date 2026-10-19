import { bezierPts, bezierTaper, part, ellD, rrD, shade, taper, type Pt } from '../util'
import { earFloppyD, earPrickD, legD, scallopD } from './shapes'
import { fadeMark, type Breed, type G } from './quad'

type C2 = CanvasRenderingContext2D

const WHITE = '#ffffff'

/** 襪子：從腿的 from 位置開始漸漸染上顏色（柔和的過渡，不是貼上去的硬邊） */
const sock = (color: string, from: number) => (c: C2, _g: G, len: number) => fadeMark(c, color, from - 0.04, from + 0.03, len)

// ============================ 柴犬 ============================
// ★ 捲成圈的尾巴；黃褐色、臉頰與腹部白色、三角立耳
export const SHIBA: Breed = {
  kind: 'dog', id: 'shiba', L: 74, D: 42, legH: 22, legW: 15, hr: 20, muzzleL: 0.8, muzzleH: 0.6,
  tail(c, g) {
    c.rotate(g.wag * 0.5)
    c.scale(0.82, 0.82)
    const curl = 'M2 3C-9 0-15-10-10-21C-5-32 10-34 16-25C20-18 14-11 7-13'
    part(c, curl, null, { stroke: g.pal.body, lw: 14 })
    part(c, curl, null, { stroke: g.pal.belly, lw: 5 })
  },
  ears(c, g, far) {
    const w = g.hr * 0.8
    const h = g.hr * 0.95
    c.save()
    c.translate(far ? -g.hr * 0.5 : g.hr * 0.04, -g.hr * 0.8)
    c.rotate(far ? -0.12 : 0.04)
    part(c, earPrickD(w, h), far ? shade(g.pal.ear, -0.2) : g.pal.ear)
    if (!far) part(c, earPrickD(w * 0.52, h * 0.62), g.pal.earIn, { dy: -1 })
    c.restore()
  },
  headMarks(c, g) {
    const { hr, pal } = g
    part(c, ellD(hr * 0.34, hr * 0.46, hr * 0.62, hr * 0.42), pal.cheek)
    part(c, ellD(hr * 0.44, -hr * 0.46, hr * 0.1, hr * 0.08), pal.cheek)
    part(c, ellD(hr * 0.2, -hr * 0.5, hr * 0.09, hr * 0.07), pal.cheek)
  },
  bodyMarks(c, g) {
    part(c, ellD(g.L * 0.42, g.D * 0.16, g.L * 0.2, g.D * 0.42), g.pal.belly)
  },
  pawColor: (g) => g.pal.belly,
  legMarks: (c, g, len) => sock(g.pal.belly, 0.62)(c, g, len),
  sitTail: (g) => ({ c: g.pal.body, tip: g.pal.belly, w: 12, len: 0.5 }),
}

// ============================ 柯基 ============================
// ★ 超短腿、長身體、大立耳、圓屁股
export const CORGI: Breed = {
  kind: 'dog', id: 'corgi', L: 90, D: 38, legH: 8, legW: 15, hr: 19, muzzleL: 0.95, muzzleH: 0.58, chest: 1.15, rump: 1.08, sitTilt: 0.62,
  sitTail: (g) => ({ c: g.pal.body, tip: g.pal.belly, w: 13, len: 0.3 }),
  tail(c, g) {
    c.rotate(g.wag * 1.6)
    part(c, ellD(-3, -1, 9, 7.5), g.pal.body)
    part(c, ellD(-8, 0, 4, 4), g.pal.belly, { alpha: 0.9 })
  },
  ears(c, g, far) {
    const w = g.hr * 1.0
    const h = g.hr * 1.4
    c.save()
    c.translate(far ? -g.hr * 0.62 : g.hr * 0.0, -g.hr * 0.74)
    c.rotate(far ? -0.14 : 0.06)
    part(c, earPrickD(w, h), far ? shade(g.pal.ear, -0.2) : g.pal.ear)
    if (!far) part(c, earPrickD(w * 0.6, h * 0.7), g.pal.earIn, { dy: -1 })
    c.restore()
  },
  headMarks(c, g) {
    const { hr, pal } = g
    part(c, ellD(hr * 0.34, hr * 0.44, hr * 0.62, hr * 0.42), pal.cheek)
    part(c, ellD(hr * 0.52, -hr * 0.12, hr * 0.17, hr * 0.62), WHITE, { rot: 0.22, alpha: 0.95 })
  },
  bodyMarks(c, g) {
    part(c, ellD(g.L * 0.4, g.D * 0.2, g.L * 0.22, g.D * 0.5), WHITE)
    part(c, ellD(0, g.D * 0.5, g.L * 0.5, g.D * 0.22), WHITE)
  },
  pawColor: () => WHITE,
  legMarks: (c, g, len) => sock(WHITE, 0.1)(c, g, len),
}

// ============================ 哈士奇 ============================
// ★ 藍眼睛；灰黑配白、臉部面罩、蓬鬆尾巴
export const HUSKY: Breed = {
  kind: 'dog', id: 'husky', L: 82, D: 44, legH: 26, legW: 16, hr: 21, muzzleL: 0.85, muzzleH: 0.6, skullW: 1.05,
  tail(c, g) {
    c.rotate(g.wag * 0.8)
    // 蓬鬆的毛尾巴：從尾根往上捲到背上，像一把鐮刀（深色在上、白色在下，邊緣毛茸茸）
    const P0: Pt = [0, 3]
    const P1: Pt = [-13, -3]
    const P2: Pt = [-9, -27]
    const P3: Pt = [15, -33]
    bezierTaper(c, P0, P1, P2, P3, 13, 20, g.pal.body, { steps: 22, fuzzy: 3.4 })
    bezierTaper(c, [1, -1], [-12, -7], [-9, -28], [14, -37], 5, 10, g.pal.cap, { steps: 22 })
    bezierTaper(c, [0, 7], [-14, 2], [-10, -20], [11, -27], 3, 5, WHITE, { steps: 20 })
  },
  lieTail(c, g) {
    c.rotate(g.wag * 0.8)
    const d = 'M0 3C-16 5-32-8-36-27C-38-38-32-46-24-48'
    part(c, d, null, { stroke: g.pal.body, lw: 19 })
    part(c, d, null, { stroke: g.pal.cap, lw: 9, alpha: 0.9 })
    part(c, 'M-4 10C-20 12-38-2-43-24', null, { stroke: WHITE, lw: 5, alpha: 0.9 })
    part(c, ellD(-22, -49, 8, 7), g.pal.body)
  },
  ears(c, g, far) {
    const w = g.hr * 0.82
    const h = g.hr * 1.05
    c.save()
    c.translate(far ? -g.hr * 0.52 : g.hr * 0.02, -g.hr * 0.78)
    c.rotate(far ? -0.1 : 0.02)
    part(c, earPrickD(w, h), far ? shade(g.pal.cap, -0.2) : g.pal.cap)
    if (!far) part(c, earPrickD(w * 0.55, h * 0.66), WHITE, { dy: -1, alpha: 0.9 })
    c.restore()
  },
  headMarks(c, g) {
    const { hr, pal } = g
    // 深色頭罩 + 白色面罩
    part(c, ellD(-hr * 0.05, -hr * 0.3, hr * 1.0, hr * 0.68), pal.cap)
    part(c, ellD(hr * 0.46, hr * 0.3, hr * 0.66, hr * 0.62), WHITE)
    part(c, ellD(hr * 0.36, -hr * 0.18, hr * 0.14, hr * 0.5), WHITE, { rot: 0.1 })
    part(c, ellD(hr * 0.4, -hr * 0.46, hr * 0.13, hr * 0.09), pal.cap)
    // 臉頰的白色毛簇
    part(c, `M${-hr * 0.7} ${hr * 0.4}L${-hr * 1.12} ${hr * 0.86}L${-hr * 0.3} ${hr * 0.92}Z`, WHITE)
  },
  bodyMarks(c, g) {
    part(c, ellD(-g.L * 0.04, -g.D * 0.55, g.L * 0.62, g.D * 0.44), g.pal.cap)
    part(c, ellD(g.L * 0.42, g.D * 0.18, g.L * 0.2, g.D * 0.46), WHITE)
  },
  pawColor: () => WHITE,
  legMarks: (c, g, len) => sock(WHITE, 0.55)(c, g, len),
  sitTail: (g) => ({ c: g.pal.body, tip: WHITE, w: 15, len: 0.6, fuzzy: 2.6 }),
}

// ============================ 黃金獵犬 ============================
// ★ 下垂的耳朵；金色長毛、尾巴有飄逸的長毛
export const GOLDEN: Breed = {
  kind: 'dog', id: 'golden', L: 84, D: 44, legH: 25, legW: 16, hr: 21, muzzleL: 1.22, muzzleH: 0.6,
  tail(c, g) {
    c.rotate(g.wag * 0.9)
    // 尾巴順著身體往後下方垂，下緣是一整片飄逸的長毛（波浪狀的裙襬）
    const N = 14
    const pts: Pt[] = bezierPts([0, 0], [-16, 2], [-30, 10], [-44, 28], N)
    bezierTaper(c, [0, 0], [-16, 2], [-30, 10], [-44, 28], 13, 8, g.pal.body, { steps: N })
    // 下緣一排長長的毛束（由粗漸細、往後下方飄）
    for (let i = 1; i <= N; i++) {
      const [x, y] = pts[i]
      const [px, py] = pts[i - 1]
      const [qx, qy] = pts[Math.min(N, i + 1)]
      const tl = Math.hypot(qx - px, qy - py) || 1
      const tx = (qx - px) / tl
      const ty = (qy - py) / tl
      const nx = ty
      const ny = -tx
      const len = 9 + i * 0.9 + (i % 2 === 0 ? 4 : 0)
      const w0 = 6.2 - i * 0.18
      const x0 = x + nx * 2
      const y0 = y + ny * 2
      const x1 = x0 + nx * len * 0.55 + tx * len * 0.8
      const y1 = y0 + ny * len * 0.55 + ty * len * 0.8 + 2.5
      taper(c, x0, y0, x1, y1, Math.max(2.4, w0), 1.4, i % 2 === 0 ? g.pal.fringe : shade(g.pal.fringe, -0.08))
    }
  },
  lieTail(c, g) {
    c.rotate(g.wag * 1.3)
    const d = 'M0-2C-12-9-34-7-56 8C-60 14-52 23-39 23C-26 23-12 17 0 10Z'
    part(c, d, g.pal.body)
    for (const [y, l] of [[0, 52], [6, 46], [12, 38]] as const) {
      part(c, `M-2 ${y}C-16 ${y - 4} -36 ${y - 2} -${l} ${y + 8}`, null, { stroke: g.pal.fringe, lw: 3.4 })
    }
    part(c, 'M-44 22C-50 18-56 12-56 8', null, { stroke: g.pal.fringe, lw: 4 })
  },
  ears(c, g, far) {
    const w = g.hr * 0.95
    const h = g.hr * 1.4
    c.save()
    c.translate(far ? -g.hr * 0.1 : -g.hr * 0.38, -g.hr * 0.46)
    c.rotate(far ? 0.35 : 0.12 + Math.sin(g.t * 6) * (g.look.moving ? 0.1 : 0))
    part(c, earFloppyD(w, h), far ? shade(g.pal.ear, -0.2) : g.pal.ear)
    if (!far) part(c, earFloppyD(w * 0.6, h * 0.7), shade(g.pal.ear, 0.18), { dx: w * 0.08, dy: h * 0.08, alpha: 0.7 })
    c.restore()
  },
  headMarks(c, g) {
    const { hr, pal } = g
    part(c, ellD(hr * 0.2, -hr * 0.45, hr * 0.7, hr * 0.4), pal.fringe, { alpha: 0.6 })
  },
  bodyMarks(c, g) {
    // 胸前與腹下的長毛
    part(c, scallopD(g.L * 0.34, g.D * 0.22, g.L * 0.2, g.D * 0.42, 8, 3), g.pal.fringe)
    part(c, scallopD(0, g.D * 0.46, g.L * 0.5, g.D * 0.2, 14, 3), g.pal.fringe, { alpha: 0.85 })
  },
  legMarks(c, g, len) {
    part(c, rrD(-g.breed.legW * 0.56, len * 0.1, 7, len * 0.75, 3), g.pal.fringe, { alpha: 0.75 })
  },
  sitTail: (g) => ({ c: g.pal.body, tip: g.pal.fringe, w: 12, len: 0.7, fuzzy: 2.4 }),
}

// ============================ 邊牧 ============================
// ★ 臉中央一道白色條紋；黑白配色、白色頸圈與胸口、半立耳（耳尖往前折）
export const BORDER: Breed = {
  kind: 'dog', id: 'bordercollie', L: 80, D: 38, legH: 26, legW: 14, hr: 19, muzzleL: 0.95, muzzleH: 0.56,
  tail(c, g) {
    c.rotate(g.wag * 1.1)
    const d = 'M0-1C-12-6-32-3-50 10C-54 16-46 24-34 24C-22 24-10 17 0 9Z'
    part(c, d, g.pal.body)
    for (const [y, l] of [[2, 44], [9, 38]] as const) part(c, `M-2 ${y}C-14 ${y - 3} -30 ${y - 1} -${l} ${y + 8}`, null, { stroke: shade(g.pal.body, 0.22), lw: 3 })
    // 尾端白色
    part(c, ellD(-45, 17, 9, 7.5), WHITE)
  },
  ears(c, g, far) {
    // 兩個獨立的三角形耳朵：下半部直立，上 1/3 往前折下來（折下的部分顏色較深）
    const w = g.hr * 0.8
    const h = g.hr * 1.15
    const ear = far ? shade(g.pal.ear, -0.2) : g.pal.ear
    c.save()
    c.translate(far ? -g.hr * 0.62 : g.hr * 0.18, -g.hr * 0.76)
    c.rotate(far ? -0.14 : 0.05)
    part(c, `M${-w / 2} 0L${-w * 0.32} ${-h * 0.68}L${w * 0.32} ${-h * 0.68}L${w / 2} 0Z`, ear)
    part(c, `M${-w * 0.32} ${-h * 0.68}L${w * 0.32} ${-h * 0.68}L${w * 0.62} ${-h * 0.5}L${w * 0.1} ${-h * 1.0}Z`, shade(ear, -0.28))
    c.restore()
  },
  headMarks(c, g) {
    const { hr } = g
    // ★ 臉中央的白色條紋（從額頭一直到吻部）
    part(c, `M${hr * 0.05} ${-hr * 0.9}C${hr * 0.4} ${-hr * 0.85} ${hr * 0.62} ${-hr * 0.4} ${hr * 0.98} ${hr * 0.12}`, null, { stroke: WHITE, lw: hr * 0.38, alpha: 1 })
    part(c, rrD(hr * 0.2, hr * 0.06, hr * 0.8, hr * 0.34, hr * 0.17), WHITE)
  },
  bodyMarks(c, g) {
    // 白色胸口與頸圈
    part(c, ellD(g.L * 0.46, g.D * 0.12, g.L * 0.18, g.D * 0.58), WHITE)
    part(c, rrD(g.L * 0.3, -g.D * 0.6, g.L * 0.1, g.D * 1.3, 4), WHITE)
  },
  pawColor: () => WHITE,
  legMarks: (c, g, len) => sock(WHITE, 0.62)(c, g, len),
  sitTail: (g) => ({ c: g.pal.body, tip: WHITE, w: 12, len: 0.62, fuzzy: 1.8 }),
}

// ============================ 貴賓 ============================
// ★ 全身捲毛，頭頂、耳朵、尾巴尖有毛球
const POM = (cx: number, cy: number, r: number): string => scallopD(cx, cy, r, r * 0.92, 9, r * 0.16)
export const POODLE: Breed = {
  kind: 'dog', id: 'poodle', L: 64, D: 36, legH: 24, legW: 11, hr: 17, muzzleL: 1.15, muzzleH: 0.42,
  torsoPath: (L, D) => scallopD(0, 0, L / 2, D / 2 + 1, 15, 3.6),
  outline: (g) => shade(g.pal.body, -0.48),
  sitTail: (g) => ({ c: g.pal.body, w: 8, len: 0.4, tip: g.pal.body }),
  tail(c, g) {
    c.rotate(g.wag * 0.9)
    part(c, 'M0 2C-8-6-10-14-12-22', null, { stroke: g.pal.body, lw: 5 })
    part(c, POM(-13, -29, 11), g.pal.body)
    part(c, POM(-13, -29, 11), null, { stroke: g.pal.shade, lw: 1.4 })
  },
  ears(c, g, far) {
    c.save()
    c.translate(far ? -g.hr * 0.2 : -g.hr * 0.42, -g.hr * 0.4)
    c.rotate(far ? 0.25 : 0.1 + Math.sin(g.t * 6) * (g.look.moving ? 0.1 : 0))
    part(c, scallopD(0, g.hr * 0.75, g.hr * 0.42, g.hr * 0.82, 11, 3), far ? g.pal.shade : g.pal.body)
    part(c, scallopD(0, g.hr * 0.75, g.hr * 0.42, g.hr * 0.82, 11, 3), null, { stroke: g.pal.shade, lw: 1.2 })
    c.restore()
  },
  headMarks(c, g) {
    const { hr, pal } = g
    // 頭頂的大毛球與臉頰的蓬毛
    part(c, POM(hr * 0.02, -hr * 1.02, hr * 0.66), pal.body)
    part(c, POM(hr * 0.02, -hr * 1.02, hr * 0.66), null, { stroke: pal.shade, lw: 1.4 })
    part(c, POM(-hr * 0.3, hr * 0.5, hr * 0.5), pal.body)
  },
  bodyMarks(c, g) {
    // 捲毛的陰影弧線
    for (const [x, y] of [[-0.3, -0.15], [0, 0.1], [0.25, -0.2], [-0.05, 0.32], [0.38, 0.12]] as const) {
      part(c, `M${g.L * x - 6} ${g.D * y}Q${g.L * x} ${g.D * y - 6} ${g.L * x + 6} ${g.D * y}`, null, { stroke: g.pal.shade, lw: 1.6 })
    }
  },
  legMarks: () => undefined,
  legExtra(c, g, len) {
    const { pal } = g
    part(c, POM(0, len * 0.18, g.breed.legW * 0.82), pal.body)
    part(c, POM(0, len * 0.18, g.breed.legW * 0.82), null, { stroke: pal.shade, lw: 1.2 })
    part(c, POM(0, len * 0.8, g.breed.legW * 0.78), pal.body)
    part(c, POM(0, len * 0.8, g.breed.legW * 0.78), null, { stroke: pal.shade, lw: 1.2 })
  },
}

export const DOG_BREEDS: Record<string, Breed> = {
  shiba: SHIBA,
  corgi: CORGI,
  husky: HUSKY,
  golden: GOLDEN,
  bordercollie: BORDER,
  poodle: POODLE,
}

void legD
