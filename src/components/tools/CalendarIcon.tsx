/**
 * 簽到月曆的小圖示（v3.10.0）：12×12 的像素月曆，程式畫（tools 圖集沒有月曆素材）。
 * 用 SVG 的方格＋crispEdges，任何整數倍大小都清楚；size 是 CSS 像素（建議 12 的倍數）。
 */
const OUTLINE = '#3b2a1c'
const RED = '#c8432e'
const PAPER = '#fffdf4'
const GRID = '#b9a58a'
// 每一列：.＝透明、o＝外框、r＝紅色頁首、w＝紙、g＝日期格、k＝釘環
const ROWS = [
  '..k....k....',
  '.okoooookoo.',
  '.orrrrrrrro.',
  '.orrrrrrrro.',
  '.owwwwwwwwo.',
  '.owgwgwgwwo.',
  '.owwwwwwwwo.',
  '.owgwgwgwgo.',
  '.owwwwwwwwo.',
  '.owgwgwwwwo.',
  '.owwwwwwwwo.',
  '.oooooooooo.',
]
const COLORS: Record<string, string> = { o: OUTLINE, r: RED, w: PAPER, g: GRID, k: OUTLINE }

export function CalendarIcon({ size = 12 }: { size?: number }) {
  const rects: { x: number; y: number; c: string }[] = []
  ROWS.forEach((row, y) => [...row].forEach((ch, x) => COLORS[ch] && rects.push({ x, y, c: COLORS[ch] })))
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden className="shrink-0">
      {rects.map((r) => (
        <rect key={r.x + '-' + r.y} x={r.x} y={r.y} width={1} height={1} fill={r.c} />
      ))}
    </svg>
  )
}
