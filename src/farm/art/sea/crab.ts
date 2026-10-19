import type { Box, Look } from '../look'
import { circ, clipTo, ellD, eye, part, shade, taper } from '../util'

/** 帝王蟹：身體寬約 76，加上腳全寬約 300（腳比身體寬得多） */
export const BOX: Box = { x0: -152, y0: -100, x1: 160, y1: 38 }

const RED = '#d9472b'
const RED_D = '#a8301c'
// 殼上的小突起：和身體同一色系、只是稍微深一點的圓丘
const SPIKE = '#b83a20'

// 心形的殼：前端收成尖尖的額角、後端圓寬
const SHELL = 'M0-34C12-30 26-24 34-10C40 2 36 18 20 28C10 34-10 34-20 28C-36 18-40 2-34-10C-26-24-12-30 0-34Z'

function spike(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, s: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.fillStyle = SPIKE
  ctx.beginPath()
  ctx.moveTo(-2.8 * s, 0)
  ctx.quadraticCurveTo(0, -6.2 * s, 2.8 * s, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 一條有關節的長腳：基部→膝（抬高）→腳尖（踩在地上），畫成三段漸細並帶尖刺 */
function leg(ctx: CanvasRenderingContext2D, side: number, bx: number, by: number, reach: number, phase: number, moving: boolean): void {
  const swing = moving ? Math.sin(phase) : Math.sin(phase * 0.3) * 0.15
  const lift = moving ? Math.max(0, Math.cos(phase)) * 9 : 0
  const kx = bx + side * (reach * 0.5)
  const ky = by - 34 - lift
  const fx = bx + side * (reach + 6) + swing * 11 * side
  const fy = 34 - lift * 0.5
  const c = RED
  taper(ctx, bx, by, kx, ky, 11, 9, c)
  taper(ctx, kx, ky, fx, fy, 8.5, 3.2, shade(c, -0.06))
  circ(ctx, kx, ky, 5.2, RED_D)
  // 尖刺（腳上的刺）
  for (const t of [0.35, 0.7]) {
    const sx = kx + (fx - kx) * t
    const sy = ky + (fy - ky) * t
    spike(ctx, sx, sy - 3, -0.7 * side, 0.9)
  }
  spike(ctx, kx, ky - 4, 0, 1.1)
}

function claw(ctx: CanvasRenderingContext2D, side: number, big: boolean, openness: number): void {
  const k = big ? 1.85 : 1.1
  const ax = side * 30
  const ay = -14
  const ex = side * (50 + (big ? 8 : 2))
  const ey = -36
  taper(ctx, ax, ay, ex, ey, 10 * k * 0.8, 8 * k * 0.8, RED)
  circ(ctx, ex, ey, 5 * k * 0.8, RED_D)
  ctx.save()
  ctx.translate(ex + side * 6 * k, ey - 6 * k)
  ctx.scale(side * k, k)
  // 螯的掌部與上下兩指（可開合）
  part(ctx, ellD(10, 2, 17, 13), RED)
  part(ctx, 'M22-6C36-12 46-4 44 4C38 0 31-1 22 1Z', RED_D, { px: 20, py: 0, rot: -openness })
  part(ctx, 'M22 3C36 3 46 10 42 18C36 13 30 10 22 8Z', RED, { px: 20, py: 5, rot: openness })
  for (const [x, y, a] of [[4, -10, -0.3], [14, -10, 0.2], [-2, -2, -1.2], [10, 9, 2.9]] as const) spike(ctx, x, y, a, 1)
  ctx.restore()
}

export function drawCrab(ctx: CanvasRenderingContext2D, look: Look): void {
  const t = look.t
  const moving = look.moving
  const fat = look.fat
  const phase = t * 8
  const young = look.stage === 'young'
  const sleeping = look.sleeping

  ctx.save()
  // 影子
  part(ctx, ellD(0, 36, 150, 7), 'rgba(0,0,0,0.16)')

  // 腳：每側 3 條，左右與前後交替擺動（★ 非常長，比身體還寬）
  const rows: [number, number][] = [[-12, 112], [4, 124], [16, 108]]
  for (const side of [-1, 1]) {
    rows.forEach(([by, reach], i) => {
      const alt = (i % 2) + (side > 0 ? 1 : 0)
      leg(ctx, side, side * 28, by, reach, phase + alt * Math.PI, moving)
    })
  }

  // 一大一小兩隻螯（大的在 +x 側，隨面向翻轉）
  const cl = sleeping ? 0.12 : 0.2 + (Math.sin(t * (look.eating ? 9 : 2.2)) * 0.5 + 0.5) * (look.eating ? 0.5 : 0.28)
  claw(ctx, -1, false, cl * 0.8)
  claw(ctx, 1, true, cl)

  // 殼
  ctx.save()
  ctx.scale(1.2, 1.2 * fat)
  part(ctx, SHELL, RED)
  clipTo(ctx, SHELL, () => {
    part(ctx, ellD(-6, -14, 24, 12), '#ff7a58', { alpha: 0.5 })
    part(ctx, ellD(0, 30, 40, 14), RED_D, { alpha: 0.5 })
  })
  part(ctx, SHELL, null, { stroke: RED_D, lw: 2.5 })
  // 殼上與邊緣的尖刺
  // （只沿著殼的邊緣與零星幾處，不對稱排列，避免排成臉的樣子）
  for (const [x, y, a] of [
    [0, -36, 0], [-14, -30, -0.4], [14, -30, 0.4], [-27, -18, -0.9], [27, -18, 0.9], [-36, -2, -1.3], [36, -2, 1.3],
    [-30, 16, -1.8], [30, 16, 1.8], [-18, 26, 2.6], [20, 28, 2.8], [-20, -2, -0.5], [22, 10, 0.9], [4, 14, 0.2],
  ] as const) {
    spike(ctx, x, y, a, 1.1)
  }
  ctx.restore()

  // 眼睛（眼柄）
  for (const side of [-1, 1]) {
    taper(ctx, side * 11, -36 * fat, side * 12, -52 * fat, 4.5, 4, RED_D)
    circ(ctx, side * 12, -54 * fat, young ? 6.4 : 5.6, '#ffffff')
    if (sleeping) {
      eye(ctx, side * 12, -54 * fat, 3.8, { closed: true, color: '#2b2230' })
    } else {
      circ(ctx, side * 12 + 1, -54 * fat, 3.3, '#1f1722')
      circ(ctx, side * 12 + 2, -55.5 * fat, 1.1, '#ffffff')
    }
  }
  // 嘴巴微笑
  part(ctx, 'M-9 16C-3 22 3 22 9 16', null, { stroke: '#6d1f10', lw: 2.4 })
  ctx.restore()
}
