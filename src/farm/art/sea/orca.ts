import type { Box, Look } from '../look'
import { clipTo, ellD, eye, part } from '../util'
import { drawFlukes } from './flukes'

/** 虎鯨：設計長度約 300（鼻尖 x=150，尾鰭尖約 x=-186） */
export const BOX: Box = { x0: -246, y0: -110, x1: 152, y1: 60 }

const BLACK = '#1b2230'
const WHITE = '#f7f8fb'

// 身體（黑色）。鼻尖在 (150,6)，圓額頭、背最高處約 y=-43、尾柄在 x≈-134
const BODY =
  'M150 6C150-6 141-17 124-25C98-37 54-43 8-42C-42-41-88-31-118-16C-128-11-134-5-134 0C-134 6-128 11-118 16C-88 30-44 38 8 40C54 41 100 35 126 22C142 14 150 12 150 6Z'
// 白色腹部（下半身，到嘴角為止；沿著身體下緣往尾巴逐漸變細）
const BELLY = 'M152 6C128 7 106 17 80 19C50 21 12 15-24 17C-64 19-104 8-134 1L-134 60L152 60Z'
// 背鰭後方的淡灰色鞍斑
const SADDLE = 'M-62-37C-40-44-10-46 16-44C4-34-22-30-44-26C-57-24-66-30-62-37Z'
// 眼睛後上方的白色橢圓斑（★）
const EYE_PATCH = ellD(0, 0, 20, 7.5)
// 高聳的三角形背鰭（後緣微凹）
const DORSAL = 'M-8-41C6-70 22-96 33-110C37-84 43-60 47-41Z'
// 圓槳狀胸鰭（沿 +x 畫，支點在肩膀；實際使用時旋轉成貼著身側往後掃）
const FLIPPER = 'M0-7C14-11 34-10 48-4C56 0 56 8 48 11C34 15 14 11 0 7Z'
// 眼睛後下方、背鰭後面往上伸的白色側斑（從腹部白色延伸上來，尖端朝後上）
const FLANK = 'M16 44C10 22-6 2-46-4C-34 10-34 28-40 44Z'
const MOUTH = 'M149 7C140 13 130 15 120 13'

export function drawOrca(ctx: CanvasRenderingContext2D, look: Look): void {
  const swing = look.sleeping ? 0 : Math.sin(look.t * 3.1) * (look.moving ? 0.26 : 0.12)
  const young = look.stage === 'young'
  const fat = look.fat

  // 水平尾鰭（接在尾柄末端，隨游動上下擺）
  drawFlukes(ctx, -134, 0, swing, 1.55, BLACK, '#3a4254')

  // 遠側的胸鰭（比較暗，從身體下緣露出一點）
  part(ctx, FLIPPER, '#121722', { dx: 66, dy: 18 * fat, rot: 2.62 - Math.sin(look.t * 2.2) * 0.08, sx: 0.95, sy: 0.95 })

  // 身體：整體依胖瘦在垂直方向縮放
  ctx.save()
  ctx.scale(1, fat)
  part(ctx, BODY, BLACK)
  clipTo(ctx, BODY, () => {
    part(ctx, BELLY, WHITE)
    part(ctx, FLANK, WHITE)
    part(ctx, SADDLE, '#6f7889', { alpha: 0.9 })
  })
  // 嘴線與腮紅
  part(ctx, MOUTH, null, { stroke: '#56607a', lw: 2 })
  part(ctx, ellD(112, 17, 7, 4), '#ff9db3', { alpha: 0.55 })
  ctx.restore()

  // 眼睛後上方的白斑與眼睛
  part(ctx, EYE_PATCH, WHITE, { dx: 97, dy: -18 * fat, rot: 0.24 })
  part(ctx, ellD(122, -6 * fat, 7, 7), '#3b4660')
  eye(ctx, 122, -6 * fat, young ? 4.6 : 3.9, { closed: look.sleeping, color: '#0b0f18', ring: '#8a96b0' })

  // 背鰭
  part(ctx, DORSAL, BLACK, { dy: (fat - 1) * -42 })

  // 近側的胸鰭：一片圓槳貼在身側，往後下方掃，帶一圈淡淡的輪廓
  const fl = { dx: 58, dy: 14 * fat, rot: 2.5 + Math.sin(look.t * 2.2) * 0.07 }
  part(ctx, FLIPPER, '#2a3450', { ...fl, stroke: '#0b0f18', lw: 1.6 })
  part(ctx, 'M6-3C20-5 34-4 44-1', null, { ...fl, stroke: '#4a5778', lw: 1.6, alpha: 0.7 })

}
