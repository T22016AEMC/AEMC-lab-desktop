import { NOTE_CSS, TOOLS } from '../../config/tools'
import type { PixelEngine } from '../pixel/engine'
import { useFarmStore } from '../store/farmStore'

/**
 * 場景上公佈欄的標題縮圖（v3.7.0）：疊在黑板的綠色範圍裡，只顯示前幾張便利貼的標題（最多 TOOLS.notes.thumbMax 張，
 * 還會依黑板在畫面上的大小減少，不擠滿）；沒顯示到的用「…共 N 張」。0 張時不顯示（黑板圖上原本就畫著三張空白便條）。
 * 標題用 React 文字節點顯示（不用 innerHTML），太長用省略號截斷。位置由 Farm 的主迴圈設定（外層 div），這裡只排內容。
 */
export function BoardThumbs({ engine, layoutVersion }: { engine: PixelEngine; layoutVersion: number }) {
  const notes = useFarmStore((s) => s.save?.notes)
  void layoutVersion
  if (!notes || notes.length === 0 || !engine.layout) return null
  const g = engine.boardGreenCss()
  const w = g.x1 - g.x0
  const h = g.y1 - g.y0
  // 1 個邏輯像素 = scale 個 CSS 像素；字級跟著黑板大小，但不小於 9、不大於 13
  const scale = engine.layout.S / engine.layout.dpr
  const font = Math.max(9, Math.min(13, Math.round(scale * 4.2)))
  const pad = Math.max(2, Math.round(scale * 1.5))
  const chipH = font + 5
  const gap = Math.max(1, Math.round(scale * 0.8))
  const moreH = font + 2
  const room = (n: number): number => pad * 2 + n * chipH + (n - 1) * gap + (notes.length > n ? moreH + gap : 0)
  let shown = Math.min(notes.length, TOOLS.notes.thumbMax)
  while (shown > 1 && room(shown) > h) shown--
  const rest = notes.length - shown
  return (
    <div className="flex h-full w-full flex-col" style={{ padding: pad, gap, fontFamily: "'Microsoft JhengHei','PingFang TC',sans-serif" }}>
      {notes.slice(0, shown).map((n) => (
        <div
          key={n.id}
          data-testid="board-thumb"
          className="truncate border-l-[3px] px-1 font-bold leading-none"
          style={{ height: chipH, lineHeight: `${chipH}px`, fontSize: font, background: NOTE_CSS[n.color].bg, borderColor: NOTE_CSS[n.color].edge, color: '#3b2a1c', boxShadow: '1px 1px 0 rgba(0,0,0,0.35)', maxWidth: w - pad * 2 }}
        >
          {n.title}
        </div>
      ))}
      {rest > 0 && (
        <div className="flex justify-end">
          <div data-testid="board-thumb-more" className="bg-[#22252f]/85 px-1 font-bold leading-none text-[#f3f0d8]" style={{ fontSize: Math.max(9, font - 1), paddingTop: 1, paddingBottom: 1 }}>
            …共 {notes.length} 張
          </div>
        </div>
      )}
    </div>
  )
}
