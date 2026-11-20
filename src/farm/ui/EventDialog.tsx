import { eventDef } from '../config/events'
import { useUIStore } from '../../store/uiStore'
import { useFarmStore } from '../store/farmStore'
import { PixelSprite } from './PixelSprite'

/**
 * 一次性事件的對話框（罰款、違約金、傳說集齊獎勵）。事件旗標在觸發時就寫進存檔，所以重新整理後不會再出現；
 * 一次只顯示一個，按「確定」才換下一個，不會被提示訊息蓋掉。
 * 重置提示、存檔來自更新版本的提示顯示時先不顯示（那些是更重要的）。
 * v3.10.1：工具視窗（月曆等，z-9900）開著時也先排隊，關閉後才顯示；事件留在 pendingEvents，不會丟失。
 */
/** v4.0：載入時補發的收藏獎勵，彈窗開頭的字（4.0-R：原本「（更新補發）」，合併彈窗會變成「（更新補發）…補發給你」重複） */
export const RETRO_PREFIX = '更新補發：'
export const RETRO_BATCH_TITLE = '收藏獎勵補發'

export function EventDialog() {
  const notice = useFarmStore((s) => s.pendingEvents[0])
  const blocked = useFarmStore((s) => s.save?.resetNotice === true || s.resetFailed || s.legacyRefund > 0 || s.newerData)
  // v4.0：商店（同樣是 z-9900 的工具視窗外框）開著時也先排隊
  const toolOpen = useUIStore((s) => s.toolOpen !== null || s.shopTab !== null)
  const dismiss = useFarmStore((s) => s.dismissEvent)
  if (!notice || blocked || toolOpen) return null
  // v4.0：載入時一次補發 2 個以上的收藏獎勵 → 合併成一個彈窗
  if (notice.id === 'retroBatch') {
    return (
      <div className="absolute inset-0 z-[55] flex items-center justify-center bg-black/55 p-3" onPointerDown={(e) => e.stopPropagation()}>
        <div role="alertdialog" aria-label={RETRO_BATCH_TITLE} data-testid="event-dialog" data-event="retroBatch" className="px-panel w-full max-w-sm p-4 text-center">
          <div className="text-base font-bold">{RETRO_BATCH_TITLE}</div>
          <p className="mt-3 text-sm leading-relaxed" data-testid="event-body">
            {RETRO_PREFIX}收藏冊的集齊獎勵
          </p>
          <ul className="mx-auto mt-2 w-fit text-left text-sm" data-testid="event-parts">
            {(notice.parts ?? []).map((p) => (
              <li key={p.id} data-testid={`event-part-${p.id}`}>
                ・{(eventDef(p.id)?.title ?? p.id).replace(/！$/, '')}　+{p.coins} 金幣
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm font-bold" data-testid="event-total">
            合計 +{notice.coins} 金幣
          </p>
          <button type="button" data-testid="event-ok" className="px-btn mt-3 px-5 py-1 text-sm" onClick={dismiss}>
            確定
          </button>
        </div>
      </div>
    )
  }
  const def = eventDef(notice.id)
  if (!def) return null
  return (
    <div className="absolute inset-0 z-[55] flex items-center justify-center bg-black/55 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <div role="alertdialog" aria-label={def.title} data-testid="event-dialog" data-event={def.id} className="px-panel w-full max-w-sm p-4 text-center">
        <div className="text-base font-bold">{def.title}</div>
        {def.images.length > 0 && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {def.images.map((k) => (
              <PixelSprite key={k} frame={k} scale={2} />
            ))}
          </div>
        )}
        <p className="mt-3 text-sm leading-relaxed" data-testid="event-body">
          {notice.retro ? RETRO_PREFIX : ''}
          {def.body(notice.coins)}
        </p>
        <button type="button" data-testid="event-ok" className="px-btn mt-3 px-5 py-1 text-sm" onClick={dismiss}>
          確定
        </button>
      </div>
    </div>
  )
}
