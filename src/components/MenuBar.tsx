import { useClock } from '../hooks/useClock'
import { formatMenuBarTime } from '../lib/format'
import { getMetrics } from '../lib/layout'
import { PET_CAPACITY } from '../farm/config/balance'
import { useFarmStore } from '../farm/store/farmStore'
import { getApp } from '../config/registry'
import { useUIStore } from '../store/uiStore'
import { useActiveApp, useWindowStore } from '../store/windowStore'
import { Logo } from './Logo'

export function MenuBar() {
  const now = useClock()
  const aboutOpen = useUIStore((s) => s.aboutOpen)
  const setAboutOpen = useUIStore((s) => s.setAboutOpen)
  const activeApp = useActiveApp()
  const points = useFarmStore((st) => st.save?.points ?? null)
  const petCount = useFarmStore((st) => st.save?.pets.length ?? null)
  const launchpadOpen = useUIStore((s) => s.launchpadOpen)
  const setLaunchpadOpen = useUIStore((s) => s.setLaunchpadOpen)
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
        {/* 啟動台的備用入口（主要入口是住家的門；快捷鍵 F4） */}
        <button
          type="button"
          aria-label="啟動台（F4）"
          title="啟動台（F4）"
          onClick={() => setLaunchpadOpen(!launchpadOpen)}
          className="flex h-5 w-6 items-center justify-center rounded hover:bg-white/20"
        >
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            {[0, 4.5, 9].flatMap((y) => [0, 4.5, 9].map((x) => <rect key={x + '-' + y} x={x} y={y} width="3" height="3" rx="0.6" />))}
          </svg>
        </button>
        {/* 遊戲館的備用入口（主要入口是鐘塔的門） */}
        <button
          type="button"
          aria-label="遊戲館"
          title="遊戲館"
          onClick={() => {
            const hall = getApp('game-hall')
            if (hall) useWindowStore.getState().openApp(hall)
          }}
          className="flex h-5 w-6 items-center justify-center rounded hover:bg-white/20"
        >
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <path d="M1 11V4.5L3 3V1.5h1V3l2-1.2L8 3V1.5h1V3l2 1.5V11H7.2V8a1.2 1.2 0 0 0-2.4 0v3z" />
          </svg>
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-3 px-2">
        {petCount !== null && (
          <button
            type="button"
            onClick={() => useUIStore.getState().setAdoptOpen(true)}
            className="rounded px-2 py-px font-semibold hover:bg-white/20"
            title="領養寵物"
          >
            ＋領養
          </button>
        )}
        {petCount !== null && (
          <span className="tabular-nums" title="寵物數量" aria-label={`寵物 ${petCount}/${PET_CAPACITY}`}>
            🐾 {petCount}/{PET_CAPACITY}
          </span>
        )}
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
