import { part } from '../util'

/**
 * 水平的鯨豚尾鰭（側視圖）：往後延伸的扁平薄片，帶一點斜角透視。
 * 近側的葉片比較大、較亮；遠側的葉片稍微往上錯開、較暗，露出一小段來暗示它是橫的。
 * 原點在尾柄末端，朝 -x。
 */
const BLADE = 'M3-3C-14-10-40-11-64-6L-57 0L-66 7C-42 10-14 9 3 3Z'
const BLADE_FAR = 'M3-3C-14-12-38-17-60-14L-54-9L-60-4C-40-5-16-2 3 0Z'

export function drawFlukes(
  ctx: CanvasRenderingContext2D, x: number, y: number, swing: number, scale: number, near: string, far: string, edge?: string,
): void {
  part(ctx, BLADE_FAR, far, { dx: x, dy: y, rot: swing - 0.12, sx: scale, sy: scale, stroke: edge, lw: 1.6 / scale })
  part(ctx, BLADE, near, { dx: x, dy: y, rot: swing + 0.06, sx: scale, sy: scale, stroke: edge, lw: 1.6 / scale })
}
