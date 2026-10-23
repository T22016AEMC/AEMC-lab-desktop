/**
 * 程式畫的小狀態圖示（沒有素材檔）。風格沿用 fx 圖示：像素、深色外框、約 15 像素高。
 * 目前只有食盆份量用完時的「空」。
 */

/** 「空」字的點陣（11 × 9，1 像素筆畫）：宀＋八＋工 */
const KONG = [
  '.....#.....',
  '.#########.',
  '.#.......#.',
  '...#...#...',
  '..#.....#..',
  '...#####...',
  '.....#.....',
  '.....#.....',
  '..#######..',
]

const PAD = 2
export const EMPTY_ICON = { w: KONG[0].length + PAD * 2, h: KONG.length + PAD * 2 }

/** 在 (cx, bottomY) 畫「空」：深色小徽章加奶油色字，水平置中、底邊在 bottomY（邏輯像素，整數座標） */
export function drawEmptyIcon(ctx: CanvasRenderingContext2D, cx: number, bottomY: number): void {
  const { w, h } = EMPTY_ICON
  const x0 = Math.round(cx) - Math.floor(w / 2)
  const y0 = Math.round(bottomY) - h
  // 徽章：奶油色外框、深棕底，四角各切掉一格
  ctx.fillStyle = '#fff3d0'
  ctx.fillRect(x0 + 1, y0, w - 2, h)
  ctx.fillRect(x0, y0 + 1, w, h - 2)
  ctx.fillStyle = '#5a2a0c'
  ctx.fillRect(x0 + 2, y0 + 1, w - 4, h - 2)
  ctx.fillRect(x0 + 1, y0 + 2, w - 2, h - 4)
  ctx.fillStyle = '#ffe9a0'
  for (let r = 0; r < KONG.length; r++)
    for (let c = 0; c < KONG[r].length; c++) if (KONG[r][c] === '#') ctx.fillRect(x0 + PAD + c, y0 + PAD + r, 1, 1)
}
