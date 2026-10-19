import type { Box, Look } from '../look'
import { circ, clipTo, eye, part } from '../util'

/** 鯨鯊：設計長度約 380（頭部正前方 x=190，尾鰭尖約 x=-215） */
export const BOX: Box = { x0: -218, y0: -106, x1: 196, y1: 78 }

const BLUE = '#4f78a6'
const BLUE_D = '#40658f'
const BELLY_C = '#e2eaf3'

// 身體：頭又寬又扁、前端鈍圓（不是一般鯊魚的尖頭）
const BODY =
  'M190-22C190-29 184-34 172-35L120-36C100-37 80-46 40-52C-20-58-80-48-120-34C-150-24-168-12-180-4L-184 0L-180 4C-168 12-150 26-120 36C-80 48-20 54 40 52C90 50 130 42 170 34C186 30 190 28 190 22Z'
const BELLY = 'M200 16C150 22 90 30 30 33C-50 36-130 20-190 8L-190 80L200 80Z'
const DORSAL1 = 'M-6-52C4-70 14-88 28-100C36-84 42-68 48-50Z'
const DORSAL2 = 'M-124-34L-114-52L-100-36Z'
const PECTORAL = 'M-6-6C20-2 52 14 70 42C54 42 26 30-6-6Z'
const CAUDAL_UP = 'M8 0C-2-16-14-40-26-74C-10-66 6-50 16-28C18-16 14-6 8 0Z'
const CAUDAL_DOWN = 'M8 0C0 12-10 30-18 52C-6 46 6 34 14 18C16 10 14 4 8 0Z'

export function drawWhaleShark(ctx: CanvasRenderingContext2D, look: Look): void {
  const swing = look.sleeping ? 0 : Math.sin(look.t * 2) * (look.moving ? 0.2 : 0.1)
  const fat = look.fat
  const open = look.sleeping ? 0.15 : look.mouthOpen

  // 尾鰭（大新月形，上葉較長）
  part(ctx, CAUDAL_DOWN, BLUE_D, { dx: -176, rot: swing })
  part(ctx, CAUDAL_UP, BLUE, { dx: -180, rot: swing })
  // 第二背鰭
  part(ctx, DORSAL2, BLUE_D, { dy: (fat - 1) * -34 })

  // 遠側胸鰭
  part(ctx, PECTORAL, BLUE_D, { dx: 62, dy: 38 * fat, rot: -0.15 + Math.sin(look.t * 1.6) * 0.1, alpha: 0.9 })

  ctx.save()
  ctx.scale(1, fat)
  part(ctx, BODY, BLUE)
  clipTo(ctx, BODY, () => {
    part(ctx, BELLY, BELLY_C)
    // ★ 格紋：淡色的直線與橫線交織，交點上是白色圓點
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    const rows = [-40, -24, -8, 8, 24]
    for (let x = -150; x <= 160; x += 34) {
      ctx.beginPath()
      ctx.moveTo(x, -60)
      ctx.lineTo(x + 4, 34)
      ctx.stroke()
    }
    ctx.lineWidth = 2
    for (const y of rows) {
      ctx.beginPath()
      ctx.moveTo(-180, y - 6)
      ctx.lineTo(190, y)
      ctx.stroke()
    }
    ctx.restore()
    for (const y of rows) {
      for (let x = -150; x <= 160; x += 34) {
        if (y > 10 && x > 100) continue
        circ(ctx, x + 2 + (y + 40) * 0.07, y, 4.4, 'rgba(255,255,255,0.96)')
      }
    }
    // 身體兩側的縱向稜脊
    ctx.strokeStyle = 'rgba(255,255,255,0.38)'
    ctx.lineWidth = 2.6
    for (const [y0, y1] of [[-30, -14], [-6, 2], [22, 14]]) {
      ctx.beginPath()
      ctx.moveTo(158, y0)
      ctx.bezierCurveTo(60, y0 - 5, -80, y1 - 6, -170, y1)
      ctx.stroke()
    }
  })
  ctx.restore()

  // 嘴巴：頭部最前端一條又寬又扁的橫縫（深色、不露牙齒，沒有粉紅色）
  const mh = 2.2 + open * 11
  ctx.save()
  ctx.scale(1, fat)
  // 頭前端平整的一面，用一道淡淡的輪廓線帶出方正的感覺
  part(ctx, 'M187-22C191-12 191 12 187 22', null, { stroke: BLUE_D, lw: 2.2, alpha: 0.8 })
  part(ctx, `M191 -1C178 ${-3 - mh * 0.2} 164 ${-mh * 0.2} 150 3C164 ${3 + mh} 178 ${3 + mh} 191 ${4 + mh * 0.4}Z`, '#13243a')
  part(ctx, 'M191-1C178-4 164-2 150 3', null, { stroke: '#8fb0d4', lw: 2 })
  ctx.restore()

  // 小眼睛在頭部側面
  eye(ctx, 146, -16 * fat, 3.8, { closed: look.sleeping, color: '#10202e' })

  // 背鰭與近側胸鰭
  part(ctx, DORSAL1, BLUE_D, { dy: (fat - 1) * -52 })
  part(ctx, PECTORAL, BLUE, { dx: 74, dy: 42 * fat, rot: 0.1 + Math.sin(look.t * 1.6 + 1) * 0.12 })
}
