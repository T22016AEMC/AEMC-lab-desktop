import { useClock } from '../hooks/useClock'
import { formatMenuBarTime } from '../lib/format'
import { getMetrics } from '../lib/layout'
import { useFarmStore } from '../farm/store/farmStore'
import { useUIStore } from '../store/uiStore'
import { useActiveApp } from '../store/windowStore'
import { Logo } from './Logo'

export function MenuBar() {
  const now = useClock()
  const aboutOpen = useUIStore((s) => s.aboutOpen)
  const setAboutOpen = useUIStore((s) => s.setAboutOpen)
  const activeApp = useActiveApp()
  const points = useFarmStore((st) => st.save?.points ?? null)
  const { menuBar } = getMetrics()

  return (
    <header
      className="glass-dark fixed inset-x-0 top-0 z-[9500] flex items-center justify-between border-b border-white/10 px-2 text-white"
      style={{ height: menuBar, fontSize: 13 }}
    >
      <div className="flex min-w-0 items-center gap-1">
        <button
          aria-label="關於這個桌面"
          onClick={() => setAboutOpen(!aboutOpen)}
          className="flex h-5 items-center rounded px-2 hover:bg-white/20"
        >
          <Logo size={15} />
        </button>
        <span className="truncate px-1 font-semibold">{activeApp ? activeApp.name : '桌面'}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 px-2">
        {points !== null && (
          <span className="tabular-nums" title="點數" aria-label={`點數 ${points}`}>
            🪙 {points}
          </span>
        )}
        <time className="tabular-nums">{formatMenuBarTime(now)}</time>
      </div>
    </header>
  )
}
