import { useEffect, useRef } from 'react'
import { parseBackup } from '../lib/backup'
import { exportBackup } from '../lib/backupActions'
import { useUIStore } from '../store/uiStore'
import { Logo } from './Logo'

const ITEM = 'block w-full px-3 py-1.5 text-left text-[13px] hover:bg-white/15'

/** 選單列最左邊的 Logo 與它的下拉選單：關於這個桌面、匯出存檔…、匯入存檔…、持久儲存狀態 */
export function LogoMenu() {
  const open = useUIStore((s) => s.logoMenuOpen)
  const setOpen = useUIStore((s) => s.setLogoMenuOpen)
  const persisted = useUIStore((s) => s.persisted)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  /** 選檔之後：先檢查大小與內容，通過就開確認視窗，沒通過就顯示原因；這裡完全不寫入 */
  const onFile = async (file: File | undefined) => {
    if (!file) return
    const ui = useUIStore.getState()
    let r
    try {
      r = file.size > 5 * 1024 * 1024 ? parseBackup('', file.size) : parseBackup(await file.text(), file.size)
    } catch {
      ui.setImportState({ kind: 'error', message: '讀取檔案失敗' })
      return
    }
    if (r.ok) ui.setImportState({ kind: 'confirm', backup: r.backup, summary: r.summary, fileName: file.name })
    else ui.setImportState({ kind: 'error', message: r.error })
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label="選單"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="logo-menu-button"
        onClick={() => setOpen(!open)}
        className={`flex h-5 items-center rounded px-2 hover:bg-white/20 ${open ? 'bg-white/20' : ''}`}
      >
        <Logo size={15} />
      </button>
      {open && (
        <div role="menu" data-testid="logo-menu" className="absolute left-0 top-[26px] z-[9600] min-w-[200px] overflow-hidden rounded-lg border border-white/20 bg-slate-900/95 py-1 text-white shadow-2xl backdrop-blur-xl">
          <button
            role="menuitem"
            className={ITEM}
            onClick={() => {
              setOpen(false)
              useUIStore.getState().setAboutOpen(true)
            }}
          >
            關於這個桌面
          </button>
          <div className="my-1 border-t border-white/15" />
          <button
            role="menuitem"
            className={ITEM}
            onClick={() => {
              setOpen(false)
              void exportBackup()
            }}
          >
            匯出存檔…
          </button>
          <button
            role="menuitem"
            className={ITEM}
            onClick={() => {
              setOpen(false)
              fileRef.current?.click()
            }}
          >
            匯入存檔…
          </button>
          <div className="my-1 border-t border-white/15" />
          <div data-testid="persist-status" className="px-3 py-1 text-[11px] text-white/60">
            持久儲存：{persisted ? '已啟用' : '未啟用'}
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        data-testid="import-file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          void onFile(f)
        }}
      />
    </div>
  )
}
