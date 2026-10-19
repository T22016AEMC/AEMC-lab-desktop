import type { Box, Look } from '../look'
import { clipTo, ellD, eye, part } from '../util'

/** 小丑魚：單隻長約 48（x=-24..26），一次領養 3 隻成群 */
export const BOX: Box = { x0: -106, y0: -50, x1: 36, y1: 50 }

const ORANGE = '#ff7a14'
const ORANGE_L = '#ffa14a'
const BLACK = '#1a1210'

// 圓滾滾的橘色身體
const BODY = 'M24 2C24-8 14-15 2-15C-10-15-18-10-22-4L-24-3L-24 3C-18 10-10 15 2 15C14 15 24 10 24 2Z'
// 鰭：邊緣都是黑色
const TAIL = 'M2 0C-4-8-10-14-18-12C-13-4-13 4-18 12C-10 14-4 8 2 0Z'
const DORSAL = 'M-8-13C-4-24 8-25 14-13Z'
const ANAL = 'M-8 13C-4 20 4 20 8 13Z'
const PELVIC = 'M6 12C8 20 14 20 15 12Z'
const PECTORAL = 'M0-2C8-4 14 2 12 8C6 8 1 4 0-2Z'

/** ★ 三條白色橫帶（每條旁邊有細黑邊）：眼睛後方、身體中間、尾巴根部 */
function band(bx: number, bw: number): { black: string; white: string } {
  const mk = (w: number): string =>
    `M${bx - w / 2} -18Q${bx - w / 2 + 2.5} 0 ${bx - w / 2} 18L${bx + w / 2} 18Q${bx + w / 2 + 2.5} 0 ${bx + w / 2} -18Z`
  return { black: mk(bw + 2.2), white: mk(bw) }
}
const BANDS = [band(6, 4.4), band(-7, 4.8), band(-19, 3)]

/** 畫單隻小丑魚（原點在身體中心，面向右） */
export function drawClownfishOne(ctx: CanvasRenderingContext2D, look: Look, phase = 0): void {
  const t = look.t + phase
  const wag = look.sleeping ? 0 : Math.sin(t * 9) * (look.moving ? 0.4 : 0.22)
  const fat = look.fat
  const young = look.stage === 'young'

  ctx.save()
  ctx.scale(1.3, fat)
  // 背鰭與腹鰭（黑邊）
  part(ctx, DORSAL, ORANGE, { stroke: BLACK, lw: 1.6, dy: Math.sin(t * 5) * 0.4 })
  part(ctx, ANAL, ORANGE, { stroke: BLACK, lw: 1.6 })
  part(ctx, PELVIC, ORANGE_L, { stroke: BLACK, lw: 1.4, px: 10, py: 12, rot: Math.sin(t * 6) * 0.15 })
  // 尾鰭
  part(ctx, TAIL, ORANGE, { stroke: BLACK, lw: 1.7, dx: -23, rot: wag })
  // 身體與三條白帶
  part(ctx, BODY, ORANGE)
  clipTo(ctx, BODY, () => {
    part(ctx, ellD(2, 8, 20, 7), ORANGE_L, { alpha: 0.6 })
    for (const b of BANDS) {
      part(ctx, b.black, BLACK)
      part(ctx, b.white, '#ffffff')
    }
  })
  part(ctx, BODY, null, { stroke: BLACK, lw: 1.1, alpha: 0.7 })
  ctx.restore()

  // 胸鰭
  part(ctx, PECTORAL, ORANGE_L, { stroke: BLACK, lw: 1.2, dx: 8, dy: 3.5 * fat, px: 0, py: 0, rot: Math.sin(t * 7) * 0.3 })
  eye(ctx, 19.5, -4.5 * fat, young ? 3.8 : 3.2, { closed: look.sleeping, color: '#1a1210' })
  part(ctx, ellD(18, 4.5 * fat, 3.6, 2.2), '#ff7a8e', { alpha: 0.5 })
}

/** 圖鑑與預覽：一次領養的 3 隻成群（場景上由實體的魚群位置各畫一隻） */
export function drawClownfish(ctx: CanvasRenderingContext2D, look: Look): void {
  const offsets: [number, number, number][] = [
    [0, 0, 0],
    [-56, -26, 1.3],
    [-42, 28, 2.6],
  ]
  for (const [dx, dy, ph] of offsets.sort((a, b) => a[1] - b[1])) {
    ctx.save()
    ctx.translate(dx, dy + Math.sin(look.t * 1.7 + ph) * 1.5)
    drawClownfishOne(ctx, look, ph)
    ctx.restore()
  }
}
