import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useAppListStore } from '../store/appListStore'
import { useUIStore } from '../store/uiStore'
import type { ExternalApp } from '../types'
import { AppEditorDialog } from './AppEditorDialog'
import { AppIcon } from './AppIcon'

const ICON_SIZE = 72

interface Menu {
  x: number
  y: number
  app: ExternalApp
}

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; app: ExternalApp }
  | { kind: 'delete'; app: ExternalApp }
  | { kind: 'restore' }

function AppTile({ app, onOpen, onMenu }: { app: ExternalApp; onOpen: (a: ExternalApp) => void; onMenu: (e: React.MouseEvent, a: ExternalApp) => void }) {
  return (
    <button
      type="button"
      data-app-id={app.id}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(app)
      }}
      onContextMenu={(e) => onMenu(e, app)}
      className="flex flex-col items-center gap-2 rounded-xl p-2 outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95"
    >
      <AppIcon app={app} size={ICON_SIZE} />
      <span className="max-w-full truncate text-sm text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{app.name}</span>
    </button>
  )
}

function ConfirmDialog({ message, confirmLabel, onYes, onNo }: { message: string; confirmLabel: string; onYes: () => void; onNo: () => void }) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 p-4"
      onClick={(e) => {
        e.stopPropagation()
        onNo()
      }}
    >
      <div
        role="alertdialog"
        aria-label="確認"
        className="w-full max-w-xs rounded-2xl border border-white/25 bg-slate-900/90 p-5 text-center text-white shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm leading-relaxed">{message}</div>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={onNo} className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20">
            取消
          </button>
          <button type="button" onClick={onYes} className="rounded-full bg-rose-500 px-5 py-1.5 text-sm font-bold text-white hover:brightness-110">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 啟動台：只放使用者自己的程式（內建小遊戲在鐘塔的遊戲館裡） */
function LaunchpadView() {
  const close = () => useUIStore.getState().setLaunchpadOpen(false)
  const coarse = useMediaQuery('(pointer: coarse)')
  const externalApps = useAppListStore((s) => s.apps)
  const { addApp, updateApp, removeApp, restoreDefaults } = useAppListStore.getState()
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<Menu | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (menu) setMenu(null)
      else if (dialog) setDialog(null)
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, dialog])

  const launch = (app: ExternalApp) => {
    close()
    // 外部程式一律用瀏覽器新分頁開啟
    window.open(app.url, '_blank', 'noopener,noreferrer')
  }

  const onMenu = (e: React.MouseEvent, app: ExternalApp) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, app })
  }

  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const visible = searching ? externalApps.filter((a) => a.name.toLowerCase().includes(q)) : externalApps

  const toolBtn = 'rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-xs text-white backdrop-blur-md hover:bg-white/25'

  return (
    <motion.div
      className="fixed inset-0 z-[8900] flex flex-col items-center bg-black/45 backdrop-blur-2xl"
      initial={{ opacity: 0, scale: 1.08 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.22 }}
      onClick={() => (menu ? setMenu(null) : close())}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu(null)
      }}
    >
      <div className="relative flex w-full items-start justify-center px-6 pt-14">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          autoFocus={!coarse}
          placeholder="搜尋"
          aria-label="搜尋程式"
          className="w-72 rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-center text-sm text-white placeholder-white/60 outline-none backdrop-blur-md focus:bg-white/25"
          style={{ userSelect: 'text' }}
        />
        <div className="absolute right-6 top-14 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button type="button" className={toolBtn} onClick={() => setDialog({ kind: 'restore' })}>
            恢復預設程式
          </button>
          <button
            type="button"
            aria-label="新增程式"
            title="新增程式"
            onClick={() => setDialog({ kind: 'add' })}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/15 text-xl leading-none text-white backdrop-blur-md hover:bg-white/25"
          >
            ＋
          </button>
        </div>
      </div>

      <div className="w-full flex-1 overflow-y-auto px-6 pb-24 pt-8">
        <div className="mx-auto grid max-w-5xl gap-x-4 gap-y-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}>
          {visible.map((app) => (
            <AppTile key={app.id} app={app} onOpen={launch} onMenu={onMenu} />
          ))}
        </div>
        {searching && visible.length === 0 && <div className="mt-16 text-center text-white/70">找不到符合的程式</div>}
        {!searching && externalApps.length === 0 && (
          <div className="mt-16 text-center text-white/70" data-testid="launchpad-empty">
            還沒有程式，按右上角的「＋」新增你的程式
          </div>
        )}
      </div>

      {/* 右鍵選單：編輯、刪除 */}
      {menu && (
        <div
          role="menu"
          className="fixed z-20 min-w-[120px] overflow-hidden rounded-lg border border-white/25 bg-slate-900/95 py-1 text-sm text-white shadow-2xl backdrop-blur-xl"
          style={{ left: Math.min(menu.x, window.innerWidth - 140), top: Math.min(menu.y, window.innerHeight - 100) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left hover:bg-white/15"
            onClick={() => {
              const app = menu.app
              setMenu(null)
              setDialog({ kind: 'edit', app })
            }}
          >
            編輯
          </button>
          <button
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-rose-300 hover:bg-white/15"
            onClick={() => {
              const app = menu.app
              setMenu(null)
              setDialog({ kind: 'delete', app })
            }}
          >
            刪除
          </button>
        </div>
      )}

      {dialog?.kind === 'add' && (
        <AppEditorDialog
          onCancel={() => setDialog(null)}
          onSave={(v) => {
            addApp(v)
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'edit' && (
        <AppEditorDialog
          app={dialog.app}
          onCancel={() => setDialog(null)}
          onSave={(v) => {
            updateApp(dialog.app.id, v)
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          message={`確定要刪除「${dialog.app.name}」嗎？`}
          confirmLabel="刪除"
          onNo={() => setDialog(null)}
          onYes={() => {
            removeApp(dialog.app.id)
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'restore' && (
        <ConfirmDialog
          message="要恢復成預設的 5 個程式嗎？你新增與編輯過的程式會被移除。"
          confirmLabel="恢復預設"
          onNo={() => setDialog(null)}
          onYes={() => {
            restoreDefaults()
            setDialog(null)
          }}
        />
      )}
    </motion.div>
  )
}

export function Launchpad() {
  const open = useUIStore((s) => s.launchpadOpen)
  return <AnimatePresence>{open && <LaunchpadView key="launchpad" />}</AnimatePresence>
}
