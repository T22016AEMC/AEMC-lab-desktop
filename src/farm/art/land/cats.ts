import { bezierPts, bezierTaper, circ, ellD, lerp, part, rrD, shade, taper, type Pt } from '../util'
import { earPrickD, earRoundD, scallopD } from './shapes'
import { fadeMark, type Breed, type G } from './quad'

type C2 = CanvasRenderingContext2D

const WHITE = '#ffffff'

/** 描一條線，可選虛線（虎斑尾巴的環紋）與線頭樣式 */
function stroke(c: C2, d: string, color: string, w: number, opts: { dash?: number[]; cap?: CanvasLineCap } = {}): void {
  c.save()
  c.strokeStyle = color
  c.lineWidth = w
  c.lineCap = opts.cap ?? 'round'
  c.lineJoin = 'round'
  if (opts.dash) c.setLineDash(opts.dash)
  c.stroke(new Path2D(d))
  c.restore()
}

/** 舊版尾巴（睡覺姿勢維持原樣時使用） */
const TAIL_S = 'M0 1C-14 3-25-11-23-28C-21-41-14-49-8-53'
function legacyTail(c: C2, g: G, body: string, ring?: string, tip?: string, w = 7.5): void {
  c.rotate(g.wag * 0.6)
  stroke(c, TAIL_S, body, w)
  if (ring) stroke(c, TAIL_S, ring, w, { dash: [3.2, 6.4], cap: 'butt' })
  if (tip) stroke(c, 'M-12-49C-10-51-9-52-8-53', tip, w + 0.5)
}

/** 細長、由粗漸細的 S 形尾巴：先微微下垂再往上輕輕翹起，長度大約和身體一樣長 */
const TAIL_P: [Pt, Pt, Pt, Pt] = [[0, 2], [-8, -24], [-32, -10], [-48, -32]]

function longTail(c: C2, g: G, body: string, ring?: string, tip?: string, w0?: number): void {
  c.rotate(g.wag * 0.6)
  const w = w0 ?? g.breed.legW * 0.85
  const w1 = w * 0.8
  const n = 18
  const pts = bezierTaper(c, ...TAIL_P, w, w1, body, { steps: n, rings: ring ? { color: ring, every: 3 } : undefined })
  if (tip) {
    for (let i = n - 3; i < n; i++) taper(c, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], lerp(w, w1, i / n), lerp(w, w1, (i + 1) / n), tip)
    circ(c, pts[n][0], pts[n][1], w1 / 2 + 0.2, tip)
  }
  void bezierPts
}

function catEars(c: C2, g: G, far: boolean, o: { w?: number; h?: number; outer: string; inner: string; round?: boolean }): void {
  const w = g.hr * (o.w ?? 0.8)
  const h = g.hr * (o.h ?? 0.98)
  c.save()
  c.translate(far ? -g.hr * 0.5 : g.hr * 0.24, -g.hr * 0.78)
  c.rotate(far ? -0.2 : 0.18)
  const d = o.round ? earRoundD(w, h) : earPrickD(w, h)
  part(c, d, far ? shade(o.outer, -0.15) : o.outer)
  part(c, o.round ? earRoundD(w * 0.55, h * 0.62) : earPrickD(w * 0.5, h * 0.62), o.inner, { dy: -1.5 })
  c.restore()
}

// ============================ 橘虎斑 ============================
export const TABBY: Breed = {
  kind: 'cat', id: 'tabby', L: 62, D: 33, legH: 18, legW: 13, hr: 17,
  tail: (c, g) => longTail(c, g, g.pal.body, g.pal.stripe, g.pal.stripe),
  sitTail: (g) => ({ c: g.pal.body, ring: g.pal.stripe, tip: g.pal.stripe }),
  lieTail: (c, g) => legacyTail(c, g, g.pal.body, g.pal.stripe, g.pal.stripe),
  ears: (c, g, far) => catEars(c, g, far, { outer: g.pal.body, inner: g.pal.ear }),
  headMarks(c, g) {
    const { hr, pal } = g
    // 額頭的「M」紋與臉頰條紋
    for (const x of [-0.05, 0.28, 0.6]) stroke(c, `M${hr * x} ${-hr * 0.92}L${hr * (x + 0.02)} ${-hr * 0.5}`, pal.stripe, 2.8)
    stroke(c, `M${-hr * 0.9} ${hr * 0.1}L${-hr * 0.4} ${hr * 0.18}`, pal.stripe, 2.4)
    stroke(c, `M${-hr * 0.85} ${hr * 0.36}L${-hr * 0.35} ${hr * 0.36}`, pal.stripe, 2.4)
  },
  bodyMarks(c, g) {
    for (let i = 0; i < 6; i++) {
      const x = -g.L * 0.4 + i * g.L * 0.15
      stroke(c, `M${x} ${-g.D * 0.55}Q${x + 3} ${-g.D * 0.1} ${x - 2} ${g.D * 0.2}`, g.pal.stripe, 4.4)
    }
  },
  legMarks(c, g, len) {
    for (const y of [0.3, 0.55]) part(c, rrD(-20, len * y, 40, 3.6, 1.5), g.pal.stripe)
  },
}

// ============================ 黑貓 ============================
export const BLACK: Breed = {
  kind: 'cat', id: 'black', L: 62, D: 33, legH: 18, legW: 13, hr: 17,
  tail: (c, g) => longTail(c, g, g.pal.body),
  sitTail: (g) => ({ c: g.pal.body }),
  lieTail: (c, g) => legacyTail(c, g, g.pal.body),
  ears: (c, g, far) => catEars(c, g, far, { outer: g.pal.body, inner: g.pal.ear }),
  bodyMarks(c, g) {
    part(c, ellD(-g.L * 0.05, -g.D * 0.45, g.L * 0.5, g.D * 0.12), '#ffffff', { alpha: 0.1 })
  },
}

// ============================ 三花 ============================
export const CALICO: Breed = {
  kind: 'cat', id: 'calico', L: 62, D: 33, legH: 18, legW: 13, hr: 17,
  tail: (c, g) => longTail(c, g, g.pal.patchB, undefined, g.pal.patchA),
  sitTail: (g) => ({ c: g.pal.patchB, tip: g.pal.patchA }),
  lieTail: (c, g) => legacyTail(c, g, g.pal.patchB, undefined, g.pal.patchA),
  ears: (c, g, far) => catEars(c, g, far, { outer: far ? g.pal.patchB : g.pal.patchA, inner: g.pal.ear }),
  headMarks(c, g) {
    const { hr, pal } = g
    part(c, ellD(-hr * 0.18, -hr * 0.4, hr * 0.62, hr * 0.5), pal.patchA, { alpha: 0.98 })
    part(c, ellD(hr * 0.78, -hr * 0.42, hr * 0.34, hr * 0.4), pal.patchB, { alpha: 0.98 })
  },
  bodyMarks(c, g) {
    const { L, D, pal } = g
    part(c, ellD(-L * 0.3, -D * 0.2, L * 0.24, D * 0.38), pal.patchA)
    part(c, ellD(L * 0.04, -D * 0.34, L * 0.18, D * 0.3), pal.patchB)
    part(c, ellD(L * 0.34, -D * 0.05, L * 0.14, D * 0.34), pal.patchA)
    part(c, ellD(-L * 0.46, D * 0.2, L * 0.1, D * 0.3), pal.patchB)
  },
}

// ============================ 暹羅 ============================
// 米白身體，臉、耳朵、腳、尾巴為深色重點色，藍眼睛
export const SIAMESE: Breed = {
  kind: 'cat', id: 'siamese', L: 62, D: 28, legH: 22, legW: 11.5, hr: 16,
  tail: (c, g) => longTail(c, g, g.pal.point),
  sitTail: (g) => ({ c: g.pal.point, w: 6 }),
  lieTail: (c, g) => legacyTail(c, g, g.pal.point, undefined, undefined, 6),
  ears: (c, g, far) => catEars(c, g, far, { w: 0.92, h: 1.3, outer: g.pal.point, inner: shade(g.pal.point, 0.25) }),
  headMarks(c, g) {
    const { hr, pal } = g
    part(c, ellD(hr * 0.58, hr * 0.28, hr * 0.62, hr * 0.64), pal.point, { alpha: 0.95 })
    part(c, ellD(hr * 0.5, -hr * 0.2, hr * 0.36, hr * 0.46), pal.point, { alpha: 0.4 })
    part(c, ellD(hr * 0.62, hr * 0.42, hr * 0.3, hr * 0.2), shade(pal.body, 0.05), { alpha: 0.7 })
  },
  bodyMarks(c, g) {
    part(c, ellD(-g.L * 0.42, 0, g.L * 0.12, g.D * 0.5), g.pal.point, { alpha: 0.18 })
  },
  pawColor: (g) => g.pal.point,
  legMarks(c, g, len) {
    fadeMark(c, g.pal.point, 0.12, 0.78, len)
  },
}

// ============================ 英短藍貓 ============================
// ★ 圓圓的大臉與胖嘟嘟的臉頰、銅色眼睛、短粗的尾巴
export const BRITISH: Breed = {
  kind: 'cat', id: 'britishblue', L: 58, D: 39, legH: 15, legW: 15, hr: 19.5, skullW: 1.12, chest: 1.12,
  tail(c, g) {
    c.rotate(g.wag * 0.5)
    bezierTaper(c, [0, 2], [-12, 2], [-22, -6], [-25, -21], 11.5, 7.5, g.pal.body, { steps: 14 })
  },
  sitTail: (g) => ({ c: g.pal.body, w: 11, len: 0.72 }),
  lieTail(c, g) {
    c.rotate(g.wag * 0.5)
    stroke(c, 'M0 2C-12 2-22-6-23-20', g.pal.body, 12.5)
  },
  ears: (c, g, far) => catEars(c, g, far, { w: 0.74, h: 0.72, outer: g.pal.body, inner: g.pal.ear, round: true }),
  headMarks(c, g) {
    const { hr, pal } = g
    // 胖嘟嘟的臉頰
    part(c, ellD(hr * 0.5, hr * 0.46, hr * 0.62, hr * 0.46), shade(pal.body, 0.12), { alpha: 0.85 })
    part(c, ellD(-hr * 0.3, hr * 0.42, hr * 0.42, hr * 0.36), shade(pal.body, 0.08), { alpha: 0.6 })
  },
  bodyMarks(c, g) {
    part(c, ellD(g.L * 0.05, -g.D * 0.46, g.L * 0.5, g.D * 0.1), '#ffffff', { alpha: 0.14 })
  },
}

// ============================ 布偶貓 ============================
// ★ 蓬鬆長毛與大毛尾巴；重點色、藍眼睛
export const RAGDOLL: Breed = {
  kind: 'cat', id: 'ragdoll', L: 66, D: 36, legH: 17, legW: 14, hr: 18.5, skullW: 1.04,
  tail(c, g) {
    c.rotate(g.wag * 0.7)
    // 大而蓬鬆的毛尾巴：整條同一個深褐色，邊緣毛茸茸，由根部往尾端更蓬
    c.rotate(g.wag * 0.7)
    // 寬而蓬鬆的羽毛尾巴：先往上翹再往後彎，外緣只有幾個大而柔和的毛尖
    const P: [Pt, Pt, Pt, Pt] = [[0, 3], [-10, -26], [-38, -14], [-56, -38]]
    const n = 20
    const pts = bezierTaper(c, ...P, 13, 21, g.pal.point, { steps: n })
    for (const [i, side] of [[5, -1], [8, 1], [11, -1], [14, 1], [17, -1]] as const) {
      const [x, y] = pts[i]
      const [px, py] = pts[i - 1]
      const [qx, qy] = pts[i + 1]
      const tl = Math.hypot(qx - px, qy - py) || 1
      const tx = (qx - px) / tl
      const ty = (qy - py) / tl
      const w = lerp(13, 21, i / n) / 2
      const bx = x - ty * w * side
      const by = y + tx * w * side
      taper(c, bx, by, bx - ty * 8 * side + tx * 12, by + tx * 8 * side + ty * 12, 11, 2, g.pal.point)
    }
    const e = pts[n]
    taper(c, e[0], e[1], e[0] + 10, e[1] - 9, 18, 3, g.pal.point)
  },
  sitTail: (g) => ({ c: g.pal.point, w: 12, len: 1.0, fuzzy: 2 }),
  lieTail(c, g) {
    c.rotate(g.wag * 0.7)
    const d = 'M0 5C-14 5-30-6-33-26C-34-40-27-50-19-53'
    stroke(c, d, g.pal.point, 23)
    stroke(c, 'M0 6C-12 6-24-2-28-14', g.pal.body, 14)
    stroke(c, d, shade(g.pal.point, 0.3), 10, { dash: [2, 5] })
    part(c, scallopD(-19, -53, 11, 9, 9, 2.6), g.pal.point)
  },
  ears(c, g, far) {
    catEars(c, g, far, { outer: g.pal.point, inner: shade(g.pal.point, 0.35) })
  },
  headMarks(c, g) {
    const { hr, pal } = g
    part(c, ellD(hr * 0.56, hr * 0.3, hr * 0.6, hr * 0.6), pal.point, { alpha: 0.9 })
    // 臉上白色倒 V 字
    part(c, `M${hr * 0.5} ${-hr * 0.5}L${hr * 0.28} ${hr * 0.36}L${hr * 0.74} ${hr * 0.36}Z`, WHITE, { alpha: 0.95 })
    // 蓬鬆的臉頰毛
    part(c, `M${-hr * 0.7} ${hr * 0.3}L${-hr * 1.1} ${hr * 0.6}L${-hr * 0.4} ${hr * 0.76}Z`, pal.body)
  },
  bodyMarks(c, g) {
    part(c, scallopD(g.L * 0.38, g.D * 0.2, g.L * 0.16, g.D * 0.42, 8, 3.2), WHITE)
    part(c, ellD(-g.L * 0.4, -g.D * 0.1, g.L * 0.14, g.D * 0.5), g.pal.point, { alpha: 0.3 })
  },
  pawColor: () => WHITE,
  legMarks(c, _g, len) {
    fadeMark(c, WHITE, 0.4, 0.66, len)
  },
}

export const CAT_BREEDS: Record<string, Breed> = {
  tabby: TABBY,
  black: BLACK,
  calico: CALICO,
  siamese: SIAMESE,
  britishblue: BRITISH,
  ragdoll: RAGDOLL,
}
