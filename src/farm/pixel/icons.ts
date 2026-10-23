/**
 * 程式畫的小狀態圖示（沒有素材檔）。風格沿用 fx 圖示：像素、深色外框、約 15 像素高。
 * 目前只有食盆份量用完時的「空」。
 */

/** 「空」字的點陣（11 × 13）：宀＋八＋工 */
const KONG = [
  '.....##....',
  '.....##....',
  '.#########.',
  '.##.....##.',
  '.##.....##.',
  '....#.#....',
  '...##.##...',
  '..##...##..',
  '.##.....##.',
  '.....##....',
  '.....##....',
  '.#########.',
  '.#########.',
]

export const EMPTY_ICON = { w: KONG[0].length + 2, h: KONG.length + 2 }

/** 在 (cx, bottomY) 畫「空」：水平置中、底邊在 bottomY（邏輯像素，整數座標） */
export function drawEmptyIcon(ctx: CanvasRenderingContext2D, cx: number, bottomY: number): void {
  const w = KONG[0].length
  const h = KONG.length
  const x0 = Math.round(cx) - Math.floor(w / 2)
  const y0 = Math.round(bottomY) - h - 1
  ctx.fillStyle = '#3b1d0a'
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      if (KONG[r][c] !== '#') continue
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(x0 + c + dx, y0 + r + dy, 1, 1)
    }
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      if (KONG[r][c] !== '#') continue
      // 上亮下暗的簡單漸層，和其他狀態圖示的質感接近
      ctx.fillStyle = r < 5 ? '#fff6cf' : r < 9 ? '#ffe28a' : '#f2b94a'
      ctx.fillRect(x0 + c, y0 + r, 1, 1)
    }
}
