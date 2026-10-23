import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { gameApps } from '../config/registry'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useAppListStore } from '../store/appListStore'
import { useUIStore } from '../store/uiStore'
import { useWindowStore } from '../store/windowStore'
import type { BuiltinApp, ExternalApp } from '../types'
import { AppEditorDialog } from './AppEditorDialog'
import { AppIcon } from './AppIcon'

const GAME_FOLDER_LABEL = '遊戲'
const ICON_SIZE = 72

type Item = { kind: 'external'; app: ExternalApp } | { kind: 'builtin'; app: BuiltinApp }

interface Menu {
  x: number
  y: number
  item: Item
}

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; app: ExternalApp }
  | { kind: 'delete'; app: ExternalApp }
  | { kind: 'restore' }

function AppTile({ item, onOpen, onMenu }: { item: Item; onOpen: (i: Item) => void; onMenu: (e: React.MouseEvent, i: Item) => void }) {
  return (
    <button
      type="button"
      data-app-id={item.app.id}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(item)
      }}
      onContextMenu={(e) => onMenu(e, item)}
      className="flex flex-col items-center gap-2 rounded-xl p-2 outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95"
    >
      <AppIcon app={item.app} size={ICON_SIZE} />
      <span className="max-w-full truncate text-sm text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        {item.app.name}
      </span>
    </button>
  )
}

/** 資料夾圖示：2x2 縮圖 */
function FolderTile({ label, apps, onOpen }: { label: string; apps: BuiltinApp[]; onOpen: () => void }) {
  const mini = ICON_SIZE * 0.4
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
        style={{ width: ICON_SIZE, height: ICON_SIZE }}
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

function LaunchpadView() {
  const close = () => useUIStore.getState().setLaunchpadOpen(false)
  const openBuiltin = useWindowStore((s) => s.openApp)
  const coarse = useMediaQuery('(pointer: coarse)')
  const externalApps = useAppListStore((s) => s.apps)
  const hidden = useAppListStore((s) => s.hiddenBuiltins)
  const { addApp, updateApp, removeApp, hideBuiltin, restoreDefaults } = useAppListStore.getState()
  const [query, setQuery] = useState('')
  const [folderOpen, setFolderOpen] = useState(false)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (menu) setMenu(null)
      else if (dialog) setDialog(null)
      else if (folderOpen) setFolderOpen(false)
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [folderOpen, menu, dialog])

  const visibleGames = gameApps.filter((g) => !hidden.includes(g.id))

  const launch = (item: Item) => {
    close()
    // 外部程式一律用瀏覽器新分頁開啟；內建遊戲在桌面開視窗
    if (item.kind === 'external') window.open(item.app.url, '_blank', 'noopener,noreferrer')
    else openBuiltin(item.app)
  }

  const onMenu = (e: React.MouseEvent, item: Item) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, item })
  }

  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const ext: Item[] = externalApps.map((app) => ({ kind: 'external', app }))
  const games: Item[] = visibleGames.map((app) => ({ kind: 'builtin', app }))
  const visible = searching ? [...ext, ...games].filter((i) => i.app.name.toLowerCase().includes(q)) : ext

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
          {visible.map((item) => (
            <AppTile key={item.app.id} item={item} onOpen={launch} onMenu={onMenu} />
          ))}
          {!searching && visibleGames.length > 0 && (
            <FolderTile label={GAME_FOLDER_LABEL} apps={visibleGames} onOpen={() => setFolderOpen(true)} />
          )}
        </div>
        {searching && visible.length === 0 && <div className="mt-16 text-center text-white/70">找不到符合的程式</div>}
        {!searching && externalApps.length === 0 && visibleGames.length === 0 && (
          <div className="mt-16 text-center text-white/70">還沒有程式，按右上角的「＋」新增，或「恢復預設程式」</div>
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
              {games.length === 0 ? (
                <div className="py-10 text-center text-sm text-white/70">尚無遊戲</div>
              ) : (
                <div className="grid gap-x-3 gap-y-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))' }}>
                  {games.map((item) => (
                    <AppTile key={item.app.id} item={item} onOpen={launch} onMenu={onMenu} />
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 右鍵選單：外部程式可編輯、刪除；內建遊戲只能隱藏 */}
      {menu && (
        <div
          role="menu"
          className="fixed z-20 min-w-[120px] overflow-hidden rounded-lg border border-white/25 bg-slate-900/95 py-1 text-sm text-white shadow-2xl backdrop-blur-xl"
          style={{ left: Math.min(menu.x, window.innerWidth - 140), top: Math.min(menu.y, window.innerHeight - 100) }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.item.kind === 'external' ? (
            <>
              <button
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left hover:bg-white/15"
                onClick={() => {
                  const app = menu.item.app as ExternalApp
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
                  const app = menu.item.app as ExternalApp
                  setMenu(null)
                  setDialog({ kind: 'delete', app })
                }}
              >
                刪除
              </button>
            </>
          ) : (
            <button
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left hover:bg-white/15"
              onClick={() => {
                hideBuiltin(menu.item.app.id)
                setMenu(null)
              }}
            >
              隱藏
            </button>
          )}
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
          message="要恢復成預設的 5 個程式嗎？你新增與編輯過的程式會被移除，隱藏的遊戲也會重新顯示。"
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
