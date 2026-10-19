import type { Box, Look } from '../look'
import { clipTo, ellD, eye, part } from '../util'
import { drawFlukes } from './flukes'

/** 白鯨：設計長度約 235（短嘴鼻尖 x=114，尾鰭尖約 x=-160） */
export const BOX: Box = { x0: -224, y0: -54, x1: 108, y1: 54 }

const CREAM = '#f7f2e6'
const SHADE = '#e6dcc6'

// 身體：魚雷形（長約高的 3 倍），額頭圓鼓鼓凸出、額頭後面有一道脖子凹痕，從背峰平順收細到尾柄；背上沒有背鰭
const BODY =
  'M104 12C108 6 105 0 97-4C99-22 90-38 70-40C60-40 54-34 46-34C30-38 10-38-10-34C-45-28-80-14-112-2C-114 0-114 2-112 4C-80 14-45 30-10 36C20 40 60 40 82 32C96 28 102 22 104 12Z'
// 頸部的皺褶
const NECK = 'M52-33C46-20 46-4 52 14'
// 小而圓的胸鰭（沿 +x 畫，貼著身側往後掃）
const FLIPPER = 'M0-7C10-10 24-8 33-2C37 3 33 10 24 12C14 14 5 10 0 7Z'

export function drawBeluga(ctx: CanvasRenderingContext2D, look: Look): void {
  const swing = look.sleeping ? 0 : Math.sin(look.t * 2.4) * (look.moving ? 0.24 : 0.1)
  const fat = look.fat
  const young = look.stage === 'young'

  // 水平尾鰭（和虎鯨同一種畫法，隨游動上下擺）
  drawFlukes(ctx, -110, 0, swing, 1.5, CREAM, '#d9ccb0', '#a39474')

  ctx.save()
  ctx.scale(1, fat)
  // 遠側胸鰭
  part(ctx, FLIPPER, '#d3c6aa', { dx: 46, dy: 18, rot: 2.45 - Math.sin(look.t * 2) * 0.08 })
  part(ctx, BODY, CREAM)
  clipTo(ctx, BODY, () => {
    // 腹側淡淡的陰影，讓身體有立體感
    part(ctx, ellD(-2, 40, 122, 11), SHADE, { alpha: 0.85 })
    part(ctx, ellD(72, -33, 16, 6), '#ffffff', { alpha: 0.75 })
  })
  part(ctx, BODY, null, { stroke: '#a39474', lw: 3.2 })
  part(ctx, NECK, null, { stroke: '#e0d5bd', lw: 2.2 })
  // 嘴角上揚像在微笑
  part(ctx, 'M104 17C96 23 86 23 78 17C77 16 76 15 75 13', null, { stroke: '#b3a07a', lw: 2.4 })
  part(ctx, ellD(80, 8, 7, 4.5), '#ff9fb4', { alpha: 0.55 })
  ctx.restore()

  eye(ctx, 86, -6 * fat, young ? 4 : 3.2, { closed: look.sleeping, color: '#2b2230' })

  // 小而圓的胸鰭（近側）
  part(ctx, FLIPPER, SHADE, { dx: 38, dy: 18 * fat, rot: 2.35 + Math.sin(look.t * 2) * 0.1, stroke: '#c2b392', lw: 1.6 })
}
