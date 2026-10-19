import { useClock } from '../hooks/useClock'
import { formatMenuBarTime } from '../lib/format'
import { getMetrics } from '../lib/layout'
import { useUIStore } from '../store/uiStore'
import { useActiveApp } from '../store/windowStore'
import { Logo } from './Logo'

export function MenuBar() {
  const now = useClock()
  const compact = useUIStore((s) => s.compact)
  const aboutOpen = useUIStore((s) => s.aboutOpen)
  const setAboutOpen = useUIStore((s) => s.setAboutOpen)
  const activeApp = useActiveApp()
  const { menuBar } = getMetrics(compact)

  return (
    <header
      className="glass-dark fixed inset-x-0 top-0 z-[9500] flex items-center justify-between border-b border-white/10 px-2 text-white"
      style={{ height: menuBar, fontSize: compact ? 11 : 13 }}
    >
      <div className="flex min-w-0 items-center gap-1">
        <button
          aria-label="關於這個桌面"
          onClick={() => setAboutOpen(!aboutOpen)}
          className="flex h-5 items-center rounded px-2 hover:bg-white/20"
        >
          <Logo size={compact ? 12 : 15} />
        </button>
        <span className="truncate px-1 font-semibold">{activeApp ? activeApp.name : '桌面'}</span>
      </div>
      <time className="shrink-0 px-2 tabular-nums">{formatMenuBarTime(now)}</time>
    </header>
  )
}
