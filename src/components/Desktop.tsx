import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { allApps, showsOnDesktop } from '../config/registry'
import { getMetrics } from '../lib/layout'
import { useUIStore } from '../store/uiStore'
import { useWindowStore } from '../store/windowStore'
import { DesktopIcon } from './DesktopIcon'
import { Window } from './Window'

const desktopApps = allApps.filter(showsOnDesktop)

export function Desktop() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const compact = useUIStore((s) => s.compact)
  const openApp = useWindowStore((s) => s.openApp)
  const windowIds = useWindowStore((s) => Object.keys(s.windows).join('|'))
  const { menuBar, dockReserve } = getMetrics(compact)
  const iconSize = compact ? 36 : 52

  return (
    <div className="wallpaper absolute inset-0" onClick={() => setSelectedId(null)}>
      {/* 桌面圖示：右上角、由上往下排，排不下時往左換行 */}
      <div
        className="absolute right-3 flex flex-col flex-wrap-reverse content-start gap-1"
        style={{ top: menuBar + 8, height: `calc(100% - ${menuBar + dockReserve + 16}px)` }}
      >
        {desktopApps.map((app) => (
          <DesktopIcon
            key={app.id}
            app={app}
            iconSize={iconSize}
            selected={selectedId === app.id}
            onSelect={() => setSelectedId(app.id)}
            onOpen={() => {
              setSelectedId(null)
              openApp(app)
            }}
          />
        ))}
      </div>

      {/* 視窗層 */}
      <AnimatePresence>
        {windowIds
          .split('|')
          .filter(Boolean)
          .map((id) => (
            <Window key={id} id={id} />
          ))}
      </AnimatePresence>
    </div>
  )
}
