import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { allApps, gameApps } from '../config/registry'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useUIStore } from '../store/uiStore'
import { useWindowStore } from '../store/windowStore'
import type { DesktopApp } from '../types'
import { AppIcon } from './AppIcon'

const GAME_FOLDER_LABEL = '遊戲'

function AppTile({ app, iconSize, onOpen }: { app: DesktopApp; iconSize: number; onOpen: (a: DesktopApp) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(app)
      }}
      className="flex flex-col items-center gap-2 rounded-xl p-2 outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95"
    >
      <AppIcon app={app} size={iconSize} />
      <span className="max-w-full truncate text-sm text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        {app.name}
      </span>
    </button>
  )
}

/** 資料夾圖示：2x2 縮圖 */
function FolderTile({ label, apps, iconSize, onOpen }: { label: string; apps: DesktopApp[]; iconSize: number; onOpen: () => void }) {
  const mini = iconSize * 0.4
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      className="flex flex-col items-center gap-2 rounded-xl p-2 outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95"
    >
      <div
        className="grid grid-cols-2 place-items-center gap-1 rounded-[22%] bg-white/25 p-1.5 backdrop-blur-md"
        style={{ width: iconSize, height: iconSize }}
      >
        {Array.from({ length: 4 }, (_, i) => {
          const app = apps[i]
          return app ? (
            <AppIcon key={app.id} app={app} size={mini} />
          ) : (
            <span key={i} className="rounded-[22%] bg-white/10" style={{ width: mini, height: mini }} />
          )
        })}
      </div>
      <span className="text-sm text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{label}</span>
    </button>
  )
}

function LaunchpadView() {
  const close = () => useUIStore.getState().setLaunchpadOpen(false)
  const openApp = useWindowStore((s) => s.openApp)
  const compact = useUIStore((s) => s.compact)
  const coarse = useMediaQuery('(pointer: coarse)')
  const [query, setQuery] = useState('')
  const [folderOpen, setFolderOpen] = useState(false)
  const iconSize = compact ? 52 : 72

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (folderOpen) setFolderOpen(false)
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [folderOpen])

  const launch = (app: DesktopApp) => {
    close()
    openApp(app)
  }

  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const topLevel = allApps.filter((a) => !(a.kind === 'builtin' && a.category === 'games'))
  const visible = searching ? allApps.filter((a) => a.name.toLowerCase().includes(q)) : topLevel

  return (
    <motion.div
      className="fixed inset-0 z-[8900] flex flex-col items-center bg-black/45 backdrop-blur-2xl"
      initial={{ opacity: 0, scale: 1.08 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.22 }}
      onClick={close}
    >
      <div className={compact ? 'pt-9' : 'pt-14'}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          autoFocus={!coarse}
          placeholder="搜尋"
          aria-label="搜尋程式"
          className="w-56 rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-center text-sm text-white placeholder-white/60 outline-none backdrop-blur-md focus:bg-white/25 sm:w-72"
          style={{ userSelect: 'text' }}
        />
      </div>

      <div className="w-full flex-1 overflow-y-auto px-6 pb-24 pt-8">
        <div
          className="mx-auto grid max-w-5xl gap-x-4 gap-y-6"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 84 : 112}px, 1fr))` }}
        >
          {visible.map((app) => (
            <AppTile key={app.id} app={app} iconSize={iconSize} onOpen={launch} />
          ))}
          {!searching && (
            <FolderTile
              label={GAME_FOLDER_LABEL}
              apps={gameApps}
              iconSize={iconSize}
              onOpen={() => setFolderOpen(true)}
            />
          )}
        </div>
        {searching && visible.length === 0 && (
          <div className="mt-16 text-center text-white/70">找不到符合的程式</div>
        )}
      </div>

      <AnimatePresence>
        {folderOpen && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center bg-black/20 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              e.stopPropagation()
              setFolderOpen(false)
            }}
          >
            <motion.div
              className="max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/25 bg-white/20 p-6 backdrop-blur-2xl"
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 text-center text-lg font-medium text-white">{GAME_FOLDER_LABEL}</div>
              {gameApps.length === 0 ? (
                <div className="py-10 text-center text-sm text-white/70">尚無遊戲</div>
              ) : (
                <div
                  className="grid gap-x-3 gap-y-5"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 84 : 108}px, 1fr))` }}
                >
                  {gameApps.map((app) => (
                    <AppTile key={app.id} app={app} iconSize={iconSize} onOpen={launch} />
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function Launchpad() {
  const open = useUIStore((s) => s.launchpadOpen)
  return <AnimatePresence>{open && <LaunchpadView key="launchpad" />}</AnimatePresence>
}
