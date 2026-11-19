import { useEffect, useRef, useState } from 'react'
import { gameNow } from '../../farm/overrides'
import { CHECKIN_TEXT, checkinDays, todayKey } from '../../farm/sim/points'
import { useFarmStore } from '../../farm/store/farmStore'
import { useUIStore } from '../../store/uiStore'
import { CalendarIcon } from './CalendarIcon'
import { ToolDialog } from './ToolDialog'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
/** 月曆開著時多久檢查一次「換日了沒」（毫秒）。跨午夜、分頁在前景 → 自動簽新的一天 */
const DAY_CHECK_MS = 15_000

type Shown = { y: number; m: number } // m：0～11

const monthOf = (key: string): Shown => ({ y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 })
const prevOf = (s: Shown): Shown => (s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 })
const sameMonth = (a: Shown, b: Shown): boolean => a.y === b.y && a.m === b.m
const p2 = (n: number): string => String(n).padStart(2, '0')

/**
 * 簽到月曆（v3.10.0）：打開就簽到今天（+5 金幣，每天一次，只能簽今天、不能補簽）。顯示當月，可以切到上個月看。
 * 沒有存檔：可以看、不能簽；被別的分頁接手或存檔來自較新版本：不能簽。
 * 時間一律用 gameNow()（測試模式可平移）。
 */
export function CalendarDialog() {
  const save = useFarmStore((s) => s.save)
  const [today, setToday] = useState(() => todayKey(gameNow()))
  const [shown, setShown] = useState<Shown>(() => monthOf(today))
  const [note, setNote] = useState<string>('')
  const todayRef = useRef(today)

  const sign = async (): Promise<void> => {
    const r = await useFarmStore.getState().checkIn()
    setNote(r.message)
  }

  // 打開就簽到（只做一次：開發模式的 StrictMode 會把 effect 跑兩次，第二次會回「今天已經簽到過了」蓋掉「簽到成功」）
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    void sign()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 開著時跨過午夜：分頁在前景才自動簽新的一天；在背景時等回到前景再簽
  useEffect(() => {
    const check = (): void => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      const now = todayKey(gameNow())
      if (now === todayRef.current) return
      const was = monthOf(todayRef.current)
      todayRef.current = now
      setToday(now)
      setShown((s) => (sameMonth(s, was) ? monthOf(now) : s))
      void sign()
    }
    const t = window.setInterval(check, DAY_CHECK_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', check)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = monthOf(today)
  const canPrev = sameMonth(shown, current)
  const canNext = !sameMonth(shown, current)
  const signed = checkinDays(save)
  const first = new Date(shown.y, shown.m, 1).getDay()
  const days = new Date(shown.y, shown.m + 1, 0).getDate()
  const cells: Array<{ day: number; key: string } | null> = []
  for (let i = 0; i < first; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push({ day: d, key: `${shown.y}-${p2(shown.m + 1)}-${p2(d)}` })
  while (cells.length % 7) cells.push(null)

  return (
    <ToolDialog id="calendar" title="簽到月曆" iconNode={<CalendarIcon size={24} />} width={360} onClose={() => useUIStore.getState().setToolOpen(null)}>
      <div className="px-3 pb-3 pt-2" data-testid="calendar-body">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className="px-btn px-2 py-0.5 text-sm disabled:opacity-40" disabled={!canPrev} onClick={() => setShown(prevOf(current))} aria-label="上個月" data-testid="calendar-prev">
            ◀
          </button>
          <div className="text-sm font-bold tabular-nums" data-testid="calendar-month">
            {shown.y}年{shown.m + 1}月
          </div>
          <button type="button" className="px-btn px-2 py-0.5 text-sm disabled:opacity-40" disabled={!canNext} onClick={() => setShown(current)} aria-label="這個月" data-testid="calendar-next">
            ▶
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs" role="grid" aria-label={`${shown.y}年${shown.m + 1}月`}>
          {WEEK.map((w, i) => (
            <div key={w} className={`py-0.5 font-bold ${i === 0 ? 'text-[#b5402a]' : 'text-[#3b2a1c]/70'}`}>
              {w}
            </div>
          ))}
          {cells.map((c, i) => {
            if (!c) return <div key={'e' + i} className="h-9" />
            const isToday = c.key === today
            const future = c.key > today
            const done = !future && signed.has(c.key)
            return (
              <div
                key={c.key}
                data-day={c.key}
                data-signed={done ? '1' : undefined}
                data-today={isToday ? '1' : undefined}
                className={`relative flex h-9 flex-col items-center justify-start rounded-sm border pt-0.5 tabular-nums ${
                  isToday ? 'border-[#b5402a] bg-[#fff1c9] font-bold' : 'border-[#3b2a1c]/15 bg-white/40'
                }`}
              >
                {future ? null : <span className="leading-none">{c.day}</span>}
                {done && (
                  <span className="mt-0.5 rounded-sm border border-[#b5402a] px-0.5 text-[11px] font-bold leading-tight text-[#b5402a]" aria-label="已簽到">
                    簽
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-2 min-h-[1.25rem] text-center text-xs font-bold text-[#3b2a1c]" aria-live="polite" data-testid="calendar-note">
          {note || (save ? '' : CHECKIN_TEXT.noSave)}
        </div>
      </div>
    </ToolDialog>
  )
}
