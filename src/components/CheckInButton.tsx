import { gameNow } from '../farm/overrides'
import { isCheckedIn, todayKey } from '../farm/sim/points'
import { useFarmStore } from '../farm/store/farmStore'
import { useUIStore } from '../store/uiStore'

/**
 * 選單列最右邊的「簽到月曆＋日期時間」（v3.10.0）：同一顆按鈕，點了打開簽到月曆（打開就簽到今天）。
 * 今天還沒簽到時，「簽到月曆」右上角有小紅點；沒有存檔（或還沒有寵物）、分頁已停止存檔時沒有紅點。
 * 「今天」用遊戲時間來源 gameNow()；選單列每分鐘重畫一次（time 改變），跨午夜後紅點會自己出現。
 */
export function CheckInButton({ time }: { time: string }) {
  const save = useFarmStore((s) => s.save)
  const blocked = useFarmStore((s) => s.otherTab || s.newerData)
  const today = todayKey(gameNow())
  const dot = !!save && save.pets.length > 0 && !blocked && !isCheckedIn(save, today)
  return (
    <button
      type="button"
      data-testid="calendar-button"
      onClick={() => useUIStore.getState().setToolOpen('calendar')}
      className="flex items-center gap-1.5 rounded px-1.5 py-px hover:bg-white/20"
      title={dot ? '簽到月曆（今天還沒簽到）' : '簽到月曆'}
      aria-label={dot ? `簽到月曆（今天還沒簽到） ${time}` : `簽到月曆 ${time}`}
    >
      <span className="relative font-semibold">
        簽到月曆
        {dot && <span data-testid="calendar-dot" className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-[#ff3b30] ring-1 ring-black/40" aria-hidden />}
      </span>
      <time className="tabular-nums">{time}</time>
    </button>
  )
}
