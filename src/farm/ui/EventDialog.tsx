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
export function EventDialog() {
  const notice = useFarmStore((s) => s.pendingEvents[0])
  const blocked = useFarmStore((s) => s.save?.resetNotice === true || s.resetFailed || s.legacyRefund > 0 || s.newerData)
  const toolOpen = useUIStore((s) => s.toolOpen !== null)
  const dismiss = useFarmStore((s) => s.dismissEvent)
  const def = notice ? eventDef(notice.id) : undefined
  if (!notice || !def || blocked || toolOpen) return null
  return (
    <div className="absolute inset-0 z-[55] flex items-center justify-center bg-black/55 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <div role="alertdialog" aria-label={def.title} data-testid="event-dialog" data-event={def.id} className="px-panel w-full max-w-sm p-4 text-center">
        <div className="text-base font-bold">{def.title}</div>
        <div className="mt-3 flex items-center justify-center gap-2">
          {def.images.map((k) => (
            <PixelSprite key={k} frame={k} scale={2} />
          ))}
        </div>
        <p className="mt-3 text-sm leading-relaxed" data-testid="event-body">
          {def.body(notice.coins)}
        </p>
        <button type="button" data-testid="event-ok" className="px-btn mt-3 px-5 py-1 text-sm" onClick={dismiss}>
          確定
        </button>
      </div>
    </div>
  )
}
