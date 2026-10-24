import { useEffect, useRef, useState } from 'react'
import { gameNow } from '../farm/overrides'
import { todayKey } from '../farm/sim/points'
import { useFarmStore } from '../farm/store/farmStore'
import { shouldRemind } from '../lib/backupReminder'
import { exportBackup } from '../lib/backupActions'
import { useSettingsStore } from '../lib/settings'

/** 不擋操作的小提示（左下角）。每天最多出現一次；「不再提醒」存在獨立的設定鍵 */
export function BackupReminder() {
  const status = useFarmStore((s) => s.status)
  const pets = useFarmStore((s) => s.save?.pets)
  const loaded = useSettingsStore((s) => s.loaded)
  const [show, setShow] = useState(false)
  const checked = useRef(false)

  useEffect(() => {
    if (status !== 'ready' || !pets || !loaded || checked.current) return
    checked.current = true
    const t = window.setTimeout(() => {
      const st = useSettingsStore.getState()
      const now = gameNow()
      if (shouldRemind(st, pets.map((p) => p.adoptedAt), now)) {
        st.update({ lastRemindDate: todayKey(now) })
        setShow(true)
      }
    }, 3000)
    return () => window.clearTimeout(t)
  }, [status, pets, loaded])

  if (!show) return null
  return (
    <div role="region" aria-label="備份提醒" data-testid="backup-reminder" className="fixed bottom-4 left-4 z-[9400] max-w-[260px] rounded-xl border border-white/20 bg-neutral-900/90 p-3 text-xs text-white shadow-xl backdrop-blur-xl">
      <div className="leading-relaxed">存檔只存在這個瀏覽器裡，建議匯出一份備份。</div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          data-testid="reminder-export"
          onClick={() => {
            void exportBackup()
            setShow(false)
          }}
          className="rounded-full bg-[#e8892b] px-3 py-1 font-bold hover:brightness-110"
        >
          匯出
        </button>
        <button
          type="button"
          data-testid="reminder-off"
          onClick={() => {
            useSettingsStore.getState().update({ remindOff: true })
            setShow(false)
          }}
          className="rounded-full border border-white/25 bg-white/10 px-3 py-1 hover:bg-white/20"
        >
          不再提醒
        </button>
        <button type="button" aria-label="關閉" onClick={() => setShow(false)} className="ml-auto px-1 text-white/60 hover:text-white">
          ✕
        </button>
      </div>
    </div>
  )
}
