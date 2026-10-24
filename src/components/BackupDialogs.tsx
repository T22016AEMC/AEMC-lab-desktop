import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { applyBackup } from '../lib/backup'
import { exportBackup } from '../lib/backupActions'
import { suspendSaves, getSaveStorage } from '../farm/store/farmStore'
import { getAppListStorage } from '../store/appListStore'
import { useUIStore } from '../store/uiStore'

/** 匯入成功、重新整理之後顯示一次的提示（sessionStorage，不進任何存檔） */
export const IMPORTED_FLAG = 'aemc-desktop:just-imported'

function formatExportedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '（沒有記錄）'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 匯入存檔的確認視窗與錯誤提示。按「匯入」才寫入；寫入整批成功或整批不寫；成功後重新整理網頁載入新存檔 */
export function ImportDialog() {
  const state = useUIStore((s) => s.importState)
  const setState = useUIStore((s) => s.setImportState)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && setState(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, busy, setState])

  const doImport = async () => {
    if (!state || state.kind !== 'confirm') return
    setBusy(true)
    const err = await applyBackup(state.backup, getSaveStorage(), getAppListStorage())
    if (err) {
      setBusy(false)
      setState({ kind: 'error', message: err })
      return
    }
    suspendSaves() // 離開頁面時不要再把記憶體裡的舊存檔寫回去
    try {
      sessionStorage.setItem(IMPORTED_FLAG, '1')
    } catch {
      /* 沒有提示也沒關係 */
    }
    window.location.reload()
  }

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          key="import"
          className="fixed inset-0 z-[9910] flex items-center justify-center bg-black/35 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => !busy && setState(null)}
        >
          <motion.div
            role="alertdialog"
            aria-label={state.kind === 'error' ? '無法匯入' : '匯入存檔'}
            data-testid={state.kind === 'error' ? 'import-error' : 'import-confirm'}
            className="w-full max-w-sm rounded-2xl border border-white/25 bg-slate-900/95 p-5 text-white shadow-2xl backdrop-blur-xl"
            initial={{ scale: 0.95, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
          >
            {state.kind === 'error' ? (
              <>
                <div className="text-base font-bold text-rose-300">無法匯入</div>
                <p className="mt-2 text-sm leading-relaxed text-white/85" data-testid="import-error-message">
                  {state.message}
                </p>
                <p className="mt-2 text-xs text-white/50">目前的存檔沒有被改動。</p>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => setState(null)} className="rounded-full bg-white/15 px-5 py-1.5 text-sm hover:bg-white/25">
                    知道了
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-base font-bold">匯入存檔</div>
                <div className="mt-1 truncate text-xs text-white/50">{state.fileName}</div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-white/55">匯出時間</dt>
                  <dd>{formatExportedAt(state.summary.exportedAt)}</dd>
                  <dt className="text-white/55">寵物</dt>
                  <dd data-testid="import-pets">
                    {state.summary.petNames.length} 隻{state.summary.petNames.length ? `（${state.summary.petNames.join('、')}）` : ''}
                  </dd>
                  <dt className="text-white/55">金幣</dt>
                  <dd>{state.summary.points}</dd>
                  <dt className="text-white/55">已購建築</dt>
                  <dd>{state.summary.buildings.length ? state.summary.buildings.join('、') : '無'}</dd>
                  <dt className="text-white/55">啟動台程式</dt>
                  <dd>{state.summary.appCount} 個</dd>
                </dl>
                <p className="mt-3 rounded-lg bg-rose-500/20 px-3 py-2 text-xs font-semibold leading-relaxed text-rose-200">匯入會覆蓋目前的存檔，無法復原</p>
                <button
                  type="button"
                  data-testid="import-export-current"
                  onClick={() => void exportBackup()}
                  className="mt-3 w-full rounded-lg border border-white/25 bg-white/10 py-1.5 text-sm hover:bg-white/20"
                >
                  先匯出目前存檔
                </button>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" disabled={busy} onClick={() => setState(null)} className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20">
                    取消
                  </button>
                  <button type="button" disabled={busy} data-testid="import-go" onClick={() => void doImport()} className="rounded-full bg-rose-500 px-5 py-1.5 text-sm font-bold hover:brightness-110 disabled:opacity-60">
                    匯入
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
