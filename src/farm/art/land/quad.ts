import { appearanceOf } from '../../config/appearance'
import type { Box, Look, Pose } from '../look'
import { bezierTaper, clipTo, ellD, eye, part, rgba, shade, circ, rrD, type Pt } from '../util'
import { legD, pawD, torsoD } from './shapes'

type C2 = CanvasRenderingContext2D

/** 狗與貓共用的骨架＋每個品種／花色自己的部件（耳、尾、花紋…） */
export interface Breed {
  kind: 'dog' | 'cat'
  id: string
  /** 軀幹長、厚、腿露出的長度、腿寬、頭半徑（設計座標，地面在 y=0） */
  L: number
  D: number
  legH: number
  legW: number
  hr: number
  chest?: number
  /** 狗吻部長度與高度（以頭半徑為單位） */
  muzzleL?: number
  muzzleH?: number
  /** 頭的寬度倍率（英短、哈士奇較圓寬） */
  skullW?: number
  /** 尾巴：原點在尾根，朝 -x（向後） */
  tail: (c: C2, g: G) => void
  /** 耳朵：原點在頭中心；far=true 先畫（頭後面的那一隻），false 在頭之後畫（近側） */
  ears: (c: C2, g: G, far: boolean) => void
  /** 軀幹花紋（已裁切在軀幹內，原點在軀幹中心） */
  bodyMarks?: (c: C2, g: G) => void
  /** 頭部花紋（在頭的骨架之上、眼睛之下，原點在頭中心） */
  headMarks?: (c: C2, g: G) => void
  /** 腿的花紋／襪子（已裁切在該條腿內，原點在腿上端） */
  legMarks?: (c: C2, g: G, len: number, far: boolean) => void
  /** 腳掌顏色，預設同身體 */
  pawColor?: (g: G) => string
  /** 自訂軀幹輪廓（貴賓的捲毛）；預設用 torsoD */
  torsoPath?: (L: number, D: number) => string
  /** 睡覺（趴姿）時用的尾巴；沒給就用 tail。睡覺姿勢維持原樣，不跟著站姿的尾巴改版 */
  lieTail?: (c: C2, g: G) => void
  /** 坐姿時軀幹的傾斜角（預設 0.92，柯基這種長身體要小一點才不會坐得太高） */
  sitTilt?: number
  /** 坐姿時的尾巴樣式：貼地、從後面繞到腳的前面 */
  sitTail?: (g: G) => SitTail
  /** 外輪廓線顏色（貴賓：奶油色身體需要深一點的描邊才不會糊進背景） */
  outline?: (g: G) => string
  /** 圓屁股（柯基）：在軀幹後端多畫一團，倍率 */
  rump?: number
  /** 腿外面的裝飾（貴賓腳踝上的毛球），不裁切 */
  legExtra?: (c: C2, g: G, len: number, far: boolean) => void
}

export interface SitTail {
  c?: string
  tip?: string
  ring?: string
  /** 尾根粗細（往尾端漸細） */
  w?: number
  /** 長度（以軀幹長為單位） */
  len?: number
  fuzzy?: number
}

/** 在腿上畫一段由透明漸變成指定顏色的色塊（襪子、重點色：顏色是漸層過渡，不是貼上去的硬邊） */
export function fadeMark(c: C2, color: string, from: number, to: number, len: number): void {
  const y0 = len * from
  const y1 = len * to
  const gr = c.createLinearGradient(0, y0, 0, y1)
  gr.addColorStop(0, rgba(color, 0))
  gr.addColorStop(1, color)
  c.fillStyle = gr
  c.fillRect(-40, y0, 80, len)
}

export interface G {
  look: Look
  pal: Record<string, string>
  breed: Breed
  L: number
  D: number
  hr: number
  legH: number
  t: number
  wag: number
  happy: boolean
  closedEyes: boolean
  young: boolean
}

interface LegPose {
  id: 'nf' | 'ff' | 'nh' | 'fh'
  x: number
  y: number
  rot: number
  len: number
  far: boolean
}

interface Geo {
  torso: { x: number; y: number; rot: number; sy: number }
  tail: { x: number; y: number; rot: number }
  head: { x: number; y: number; rot: number }
  legs: LegPose[]
  /** 坐姿／趴姿時的大腿（側面一團圓） */
  haunch?: { x: number; y: number; rx: number; ry: number }
  /** 趴姿、坐姿時前掌 */
  paws?: { x: number; y: number }[]
  /** 坐姿時貼地的後腳（從大腿往前平放到 x1）；尾巴也從這裡繞過 */
  hindFoot?: { x0: number; x1: number }
}

const rotPt = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]

function solve(g: G, pose: Pose): Geo {
  const { L, D, hr, legH, look, t } = g
  const cy = -(legH + D * 0.5)
  const legLen = legH + D * 0.3
  const moving = look.moving && pose === 'stand'
  const s = moving ? Math.sin(t * 10) : 0
  const bob = moving ? -Math.abs(Math.sin(t * 10)) * 1.6 : 0
  const eat = look.eating ? 1 : 0
  const headStandX = L / 2 + hr * 0.55
  const headStandY = cy - D * 0.42 - hr * 0.1

  const mkLegs = (ys: number, len: number, rotNF = 0, rotFF = 0, rotNH = 0, rotFH = 0): LegPose[] => [
    { id: 'fh', x: -L * 0.3 + 8, y: ys, rot: rotFH, len, far: true },
    { id: 'ff', x: L * 0.3 - 8, y: ys, rot: rotFF, len, far: true },
    { id: 'nh', x: -L * 0.3, y: ys, rot: rotNH, len, far: false },
    { id: 'nf', x: L * 0.3, y: ys, rot: rotNF, len, far: false },
  ]

  if (pose === 'sit') {
    const th = -(g.breed.sitTilt ?? 0.92)
    const px = -L * 0.36
    const py = -D * 0.46
    const [cx, cyy] = rotPt(-px, cy - py, th)
    const [hx, hy] = rotPt(headStandX - px, headStandY - py, th)
    const [sx, sy] = rotPt(L * 0.3 - px, cy + D * 0.2 - py, th)
    const [tx, ty] = rotPt(-L / 2 + 3 - px, cy - D * 0.18 - py, th)
    const frontLen = -(py + sy)
    return {
      torso: { x: px + cx, y: py + cyy, rot: th, sy: 1 },
      tail: { x: px + tx, y: py + ty + D * 0.3, rot: 1.0 },
      head: { x: px + hx + hr * 0.1, y: py + hy - hr * 0.05, rot: 0.16 + eat * 0.4 },
      legs: [
        { id: 'ff', x: px + sx - 7, y: py + sy, rot: 0, len: frontLen, far: true },
        { id: 'nf', x: px + sx, y: py + sy, rot: 0, len: frontLen, far: false },
      ],
      // 後腿彎起來平放在地上：圓圓的大腿加上往前伸平的後腳；前腳直直撐著、胸口抬高
      haunch: { x: px + 4, y: -D * 0.4, rx: D * 0.52, ry: D * 0.42 },
      hindFoot: { x0: px + 2, x1: px + sx + 6 },
    }
  }

  if (pose === 'lie') {
    return {
      torso: { x: 0, y: -D * 0.44, rot: 0, sy: 0.88 },
      tail: { x: -L / 2 + 3, y: -D * 0.55, rot: 0.55 },
      head: { x: L / 2 + hr * 0.25, y: -hr * 0.82, rot: 0.2 },
      legs: [],
      haunch: { x: -L * 0.2, y: -D * 0.36, rx: D * 0.44, ry: D * 0.34 },
      paws: [{ x: L * 0.46, y: -5 }, { x: L * 0.36, y: -4 }],
    }
  }

  if (pose === 'stretch') {
    const th = 0.2
    const px = -L / 2 + 6
    const py = cy
    const lift = -D * 0.22
    const [cx, cyy] = rotPt(-px, 0, th)
    const [hx, hy] = rotPt(headStandX - px, headStandY - py, th)
    const [sx, sy] = rotPt(L * 0.3 - px, D * 0.2, th)
    const hip = cy + D * 0.2 + lift
    return {
      torso: { x: px + cx, y: py + cyy + lift, rot: th, sy: 1 },
      tail: { x: -L / 2 + 3, y: cy - D * 0.2 + lift, rot: -0.3 },
      head: { x: px + hx + hr * 0.2, y: Math.min(-hr * 0.7, py + hy + lift + D * 0.45), rot: 0.5 },
      legs: [
        { id: 'fh', x: -L * 0.3 + 8, y: hip, rot: 0, len: -hip, far: true },
        { id: 'ff', x: px + sx - 8, y: py + sy + lift, rot: -1.25, len: legLen * 1.0, far: true },
        { id: 'nh', x: -L * 0.3, y: hip, rot: 0, len: -hip, far: false },
        { id: 'nf', x: px + sx, y: py + sy + lift, rot: -1.2, len: legLen * 1.05, far: false },
      ],
    }
  }

  // stand
  const ys = cy + D * 0.2
  return {
    torso: { x: 0, y: cy + bob, rot: 0, sy: 1 },
    tail: { x: -L / 2 + 3, y: cy - D * 0.18 + bob, rot: 0 },
    head: { x: headStandX, y: headStandY + bob + eat * hr * 0.9, rot: eat * 0.5 + (moving ? Math.sin(t * 10) * 0.03 : 0) },
    legs: mkLegs(ys + bob, legLen, s * 0.55, -s * 0.55, -s * 0.55, s * 0.55),
  }
}

function drawLeg(c: C2, g: G, lg: LegPose): void {
  const { pal, breed } = g
  const col = lg.far ? shade(pal.body, -0.2) : pal.body
  const w = breed.legW
  c.save()
  c.translate(lg.x, lg.y)
  c.rotate(lg.rot)
  const d = legD(w, lg.len, Math.abs(lg.rot) < 0.8 && g.legH >= 14 ? g.D * 0.3 * (breed.chest ?? 1) - 4 : 0)
  part(c, d, col)
  if (breed.legMarks) clipTo(c, d, () => breed.legMarks!(c, g, lg.len, lg.far))
  const pawCol = breed.pawColor ? breed.pawColor(g) : pal.body
  part(c, pawD(w, lg.len), lg.far ? shade(pawCol, -0.2) : pawCol)
  if (breed.outline) part(c, d, null, { stroke: breed.outline(g), lw: 2 })
  breed.legExtra?.(c, g, lg.len, lg.far)
  c.restore()
}

function drawDogHead(c: C2, g: G): void {
  const { pal, breed, hr, look } = g
  const mL = breed.muzzleL ?? 0.95
  const mH = breed.muzzleH ?? 0.62
  const sw = breed.skullW ?? 1
  breed.ears(c, g, true)
  part(c, ellD(0, 0, hr * sw, hr * 0.98), pal.body)
  if (breed.outline) part(c, ellD(0, 0, hr * sw, hr * 0.98), null, { stroke: breed.outline(g), lw: 2.4 })
  // 吻部
  const mx0 = hr * 0.15
  const mx1 = hr * (0.2 + mL)
  const my = hr * 0.24
  const mh = hr * mH
  const muzzle = pal.muzzle ?? pal.belly ?? pal.body
  part(c, rrD(mx0, my - mh / 2, mx1 - mx0, mh, mh * 0.5), muzzle)
  if (breed.outline) part(c, rrD(mx0, my - mh / 2, mx1 - mx0, mh, mh * 0.5), null, { stroke: breed.outline(g), lw: 2 })
  breed.headMarks?.(c, g)
  // 眼睛（品種可以有自己的虹膜顏色，如哈士奇的藍眼睛）
  eye(c, hr * 0.4, -hr * 0.16, hr * (pal.eye ? 0.17 : 0.14), { closed: g.closedEyes, iris: pal.eye, color: pal.dark ?? '#2b2230' })
  // 鼻子、嘴
  part(c, ellD(mx1 - hr * 0.04, my - mh * 0.3, hr * 0.16, hr * 0.12), '#2a1f22')
  const jx = mx1 - hr * 0.08
  part(c, `M${jx} ${my - mh * 0.12}C${jx - 2} ${my + mh * 0.3} ${jx - hr * 0.3} ${my + mh * 0.42} ${mx0 + hr * 0.15} ${my + mh * 0.2}`, null, {
    stroke: shade(pal.dark ?? '#3a2a20', 0.1),
    lw: 1.6,
  })
  if (g.happy || look.eating || look.yawn) {
    part(c, ellD(jx - hr * 0.3, my + mh * 0.5, hr * 0.17, hr * (look.yawn ? 0.3 : 0.24)), look.yawn ? '#7a2a3a' : '#ff7f9c')
  }
  part(c, ellD(hr * 0.3, hr * 0.28, hr * 0.17, hr * 0.1), '#ff8fa8', { alpha: 0.4 })
  breed.ears(c, g, false)
}

function drawCatHead(c: C2, g: G): void {
  const { pal, breed, hr, look } = g
  const sw = breed.skullW ?? 1
  breed.ears(c, g, true)
  breed.ears(c, g, false)
  part(c, ellD(0, 0, hr * 1.1 * sw, hr * 0.95), pal.body)
  // 頰與吻部
  part(c, ellD(hr * 0.5, hr * 0.32, hr * 0.5 * sw, hr * 0.36), pal.muzzle ?? pal.belly ?? pal.body)
  breed.headMarks?.(c, g)
  // 3/4 側臉：兩隻眼睛（遠側的小一點）
  const er = hr * 0.2
  const ec = pal.dark ?? '#2b2230'
  eye(c, hr * 0.12, -hr * 0.14, er * 0.82, { closed: g.closedEyes, iris: pal.eye, color: ec, slit: true })
  eye(c, hr * 0.6, -hr * 0.12, er, { closed: g.closedEyes, iris: pal.eye, color: ec, slit: true })
  // 鼻子、嘴與鬍鬚
  part(c, `M${hr * 0.84} ${hr * 0.08}L${hr * 0.98} ${hr * 0.08}L${hr * 0.91} ${hr * 0.2}Z`, '#e88aa0')
  part(c, `M${hr * 0.91} ${hr * 0.2}C${hr * 0.9} ${hr * 0.34} ${hr * 0.74} ${hr * 0.38} ${hr * 0.68} ${hr * 0.3}M${hr * 0.91} ${hr * 0.2}C${hr * 0.94} ${hr * 0.34} ${hr * 1.06} ${hr * 0.38} ${hr * 1.1} ${hr * 0.3}`, null, {
    stroke: '#5a4048',
    lw: 1.4,
  })
  if (look.yawn || look.eating) part(c, ellD(hr * 0.92, hr * 0.46, hr * 0.13, hr * 0.17), '#7a2a3a')
  c.save()
  c.strokeStyle = 'rgba(70,60,70,0.55)'
  c.lineWidth = 1.1
  c.lineCap = 'round'
  for (const dy of [-0.04, 0.1, 0.24]) {
    c.beginPath()
    c.moveTo(hr * 0.9, hr * (0.2 + dy * 0.5))
    c.lineTo(hr * 1.55, hr * (0.08 + dy * 1.4))
    c.stroke()
  }
  c.restore()
  part(c, ellD(hr * 0.2, hr * 0.38, hr * 0.2, hr * 0.12), '#ff8fa8', { alpha: 0.4 })
}

/** 坐姿的尾巴：貼著地面從身後繞過大腿，尾端翹在腳的前面（一條由粗漸細的曲線） */
function drawSitTail(c: C2, g: G, geo: Geo): void {
  const { breed, pal } = g
  const st = breed.sitTail?.(g) ?? {}
  const cat = breed.kind === 'cat'
  const len = (st.len ?? (cat ? 0.98 : 0.66)) * g.L
  const w0 = st.w ?? (cat ? 7 : 11)
  const hx = geo.haunch!.x
  const toe = geo.hindFoot!.x1
  const lift = g.wag * 12
  const p0: Pt = [hx - 6, -14]
  const p1: Pt = [hx - len * 0.62, -1]
  const p2: Pt = [toe + len * 0.2, 5]
  const p3: Pt = [toe + len * 0.28, -11 - lift]
  const col = st.c ?? pal.body
  bezierTaper(c, p0, p1, p2, p3, w0, w0 * 0.66, col, { rings: st.ring ? { color: st.ring, every: 3 } : undefined, fuzzy: st.fuzzy })
  if (st.tip) circ(c, p3[0], p3[1], w0 * 0.33 + 0.4, st.tip)
}

export function drawQuad(ctx: C2, look: Look, breed: Breed): void {
  const pal = appearanceOf(look.species, look.variant).palette
  const young = look.stage === 'young'
  const fatW = 1 + (look.fat - 1) * 0.5
  const L = breed.L * fatW * (young ? 0.9 : 1)
  const D = breed.D * look.fat * (young ? 0.96 : 1)
  const hr = breed.hr * (young ? 1.28 : 1)
  const legH = breed.legH * (young ? 0.82 : 1)
  const pose: Pose = look.sleeping && look.pose === 'stand' ? 'lie' : look.pose
  const happy = look.happy
  const wagSpeed = happy ? 13 : look.sleeping ? 0.4 : 3.2
  const wagAmp = happy ? 0.45 : 0.14
  const g: G = {
    look, pal, breed, L, D, hr, legH, t: look.t,
    wag: Math.sin(look.t * wagSpeed) * wagAmp,
    happy,
    closedEyes: look.sleeping || pose === 'lie',
    young,
  }
  const geo = solve(g, pose)

  ctx.save()
  // 影子
  part(ctx, ellD(0, 1, L * 0.62, 6), 'rgba(0,0,0,0.18)')

  // 尾巴（在身體後面）；坐姿的尾巴貼地，稍後畫
  if (pose !== 'sit') {
    ctx.save()
    ctx.translate(geo.tail.x, geo.tail.y)
    ctx.rotate(geo.tail.rot)
    ;(pose === 'lie' && breed.lieTail ? breed.lieTail : breed.tail)(ctx, g)
    ctx.restore()
  }

  // 腿（遠側先畫）：畫在軀幹後面，讓身體蓋住腿的上端
  for (const lg of geo.legs.filter((l) => l.far)) drawLeg(ctx, g, lg)
  for (const lg of geo.legs.filter((l) => !l.far)) drawLeg(ctx, g, lg)

  // 軀幹
  ctx.save()
  ctx.translate(geo.torso.x, geo.torso.y)
  ctx.rotate(geo.torso.rot)
  ctx.scale(1, geo.torso.sy)
  const body = breed.torsoPath ? breed.torsoPath(L, D) : torsoD(L, D, breed.chest ?? 1)
  part(ctx, body, pal.body)
  if (breed.rump) part(ctx, ellD(-L * 0.36, D * 0.02, D * 0.5 * breed.rump, D * 0.47 * breed.rump), pal.body)
  clipTo(ctx, body, () => {
    part(ctx, ellD(L * 0.04, D * 0.46, L * 0.5, D * 0.3), pal.belly ?? pal.body, { alpha: pal.belly ? 0.9 : 0 })
    breed.bodyMarks?.(ctx, g)
    part(ctx, ellD(-L * 0.1, -D * 0.4, L * 0.34, D * 0.08), '#ffffff', { alpha: 0.12 })
  })
  if (breed.outline) part(ctx, body, null, { stroke: breed.outline(g), lw: 2.4 })
  ctx.restore()

  if (pose === 'sit' && geo.haunch && geo.hindFoot) drawSitTail(ctx, g, geo)

  // 坐／趴時的大腿與前掌
  if (geo.haunch) {
    const h = geo.haunch
    part(ctx, ellD(h.x, h.y, h.rx, h.ry), shade(pal.body, -0.04))
    if (breed.outline) part(ctx, ellD(h.x, h.y, h.rx, h.ry), null, { stroke: breed.outline(g), lw: 2 })
    part(ctx, ellD(h.x + h.rx * 0.2, h.y + h.ry * 0.2, h.rx * 0.55, h.ry * 0.5), pal.belly ?? pal.body, { alpha: pal.belly ? 0.35 : 0 })
  }
  if (geo.hindFoot) {
    const f = geo.hindFoot
    const pawCol = breed.pawColor ? breed.pawColor(g) : pal.body
    part(ctx, ellD((f.x0 + f.x1) / 2, -5, (f.x1 - f.x0) / 2, 6.2), shade(pal.body, -0.04))
    part(ctx, ellD(f.x1 - 7, -5, 8.5, 6.2), pawCol)
  }
  if (geo.paws) {
    const pawCol = breed.pawColor ? breed.pawColor(g) : pal.body
    for (const p of geo.paws) part(ctx, ellD(p.x, p.y, breed.legW * 0.78, 6), pawCol)
  }

  // 頭
  ctx.save()
  ctx.translate(geo.head.x, geo.head.y)
  ctx.rotate(geo.head.rot)
  if (breed.kind === 'dog') drawDogHead(ctx, g)
  else drawCatHead(ctx, g)
  ctx.restore()

  ctx.restore()
  void circ
}

/** 外框（設計座標、面向右）：由尺寸推算，含坐姿時抬高的頭與耳朵 */
export function quadBox(breed: Breed): Box {
  // 含坐姿時抬高的頭與耳朵
  const top = -Math.max(breed.legH + breed.D + breed.hr * 2.9, breed.L * 0.95 + breed.hr * 3.4)
  return { x0: -breed.L / 2 - 50, y0: top, x1: breed.L / 2 + breed.hr * 2.1, y1: 6 }
}
