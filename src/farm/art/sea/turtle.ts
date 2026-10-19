import type { Box, Look } from '../look'
import { clipTo, ellD, eye, hexD, part, shade } from '../util'

/** 海龜：設計長度約 165（鳥喙尖 x=66，後鰭尖約 x=-100），含向上下划動的前肢 */
export const BOX: Box = { x0: -104, y0: -72, x1: 110, y1: 92 }

const SHELL = '#7b8f3a'
const SHELL_D = '#566a26'
const SCUTE = '#a68a3a'
const SKIN = '#c9d07f'

// ★ 扁平水滴狀的龜甲：前寬後窄、尾端尖，不是高隆起的圓頂
const CARAPACE = 'M54 0C54-22 30-33 0-33C-34-33-62-18-80 4C-62 18-34 26 0 26C30 26 54 20 54 0Z'
// ★ 又長又扁的鰭狀前肢（槳）：以肩膀為支點，指向 +x，尖端微彎
const FLIPPER = 'M0-11C20-18 48-15 78-4C85 0 85 4 78 8C48 19 20 18 0 11Z'
// 較小的槳狀後肢
const HIND = 'M0-5C12-8 26-6 36-1C39 1 39 3 36 5C26 9 12 8 0 5Z'
// 頭（不縮進殼裡）與鳥喙般的嘴
const HEAD = 'M0-9C14-15 30-13 40-5C46-1 46 5 40 9C30 15 12 14 0 10Z'
const BEAK = 'M38-6C48-7 56-3 58 2C56 7 48 8 38 6Z'

export function drawTurtle(ctx: CanvasRenderingContext2D, look: Look): void {
  const flap = look.sleeping ? 0.15 : Math.sin(look.t * 3.2) * (look.moving ? 0.55 : 0.35)
  const fat = look.fat
  const young = look.stage === 'young'
  const skinD = shade(SKIN, -0.15)

  // 遠側的前鰭：從殼上緣露出來，往後上方斜斜掃開；兩片前鰭同步上下划，像展開的翅膀
  part(ctx, FLIPPER, skinD, { dx: 24, dy: -14 * fat, sy: -1, rot: -(2.78 - flap * 0.8) })
  // 遠側後鰭
  part(ctx, HIND, skinD, { dx: -56, dy: -6 * fat, sy: -1, rot: -(2.5 + flap * 0.25) })

  // 殼
  ctx.save()
  ctx.scale(1, fat)
  // 殼下緣露出一點淡色的腹甲
  part(ctx, ellD(-4, 24, 58, 6), '#efe2a8')
  part(ctx, CARAPACE, SHELL)
  clipTo(ctx, CARAPACE, () => {
    // 邊緣的緣盾（較暗的一圈）
    part(ctx, CARAPACE, null, { stroke: SHELL_D, lw: 9 })
    // ★ 明顯的鱗甲花紋：背中央 5 片椎盾，兩側各 4 片肋盾
    const verts: [number, number, number, number][] = [
      [34, -4, 12, 10], [14, -4, 14, 12], [-8, -4, 14, 12], [-30, -4, 12, 10], [-50, -3, 9, 7],
    ]
    for (const [x, y, rx, ry] of verts) part(ctx, hexD(x, y, rx, ry), SCUTE, { stroke: SHELL_D, lw: 2 })
    const ribs: [number, number, number, number][] = [
      [24, -19, 11, 8], [2, -21, 12, 8], [-22, -17, 11, 8], [-44, -12, 8, 6],
      [24, 12, 11, 8], [2, 14, 12, 8], [-22, 11, 11, 8], [-44, 8, 8, 6],
    ]
    for (const [x, y, rx, ry] of ribs) part(ctx, hexD(x, y, rx, ry), shade(SCUTE, -0.05), { stroke: SHELL_D, lw: 1.8 })
    part(ctx, ellD(-6, -26, 34, 5), '#ffffff', { alpha: 0.2 })
  })
  ctx.restore()

  // 後鰭（近側）
  part(ctx, HIND, SKIN, { dx: -58, dy: 8 * fat, rot: 2.65 + flap * 0.3 })

  // 頭與脖子
  const bob = look.sleeping ? 0.08 : Math.sin(look.t * 1.6) * 0.04
  ctx.save()
  ctx.translate(46, -2 * fat)
  ctx.rotate(bob)
  part(ctx, HEAD, SKIN, { sx: young ? 1.15 : 1, sy: young ? 1.15 : 1 })
  part(ctx, BEAK, '#8f9a44')
  eye(ctx, 29, -4, young ? 4.2 : 3.4, { closed: look.sleeping, color: '#1f2a18' })
  part(ctx, ellD(30, 4, 5, 3), '#ff9fb4', { alpha: 0.45 })
  part(ctx, 'M54 4C50 8 44 8 40 5', null, { stroke: '#5a6a2a', lw: 1.8 })
  ctx.restore()

  // ★ 近側前鰭：又長又扁，往後下方斜斜掃開，像翅膀一樣上下划動
  part(ctx, FLIPPER, SKIN, { dx: 32, dy: 18 * fat, rot: 2.55 + flap * 0.8, sx: 0.9, sy: 0.9, stroke: skinD, lw: 1.2 })
}
