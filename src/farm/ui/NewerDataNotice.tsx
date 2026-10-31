import { useFarmStore } from '../store/farmStore'

/**
 * v3.6.0：儲存的養殖場資料來自比這份程式更新的版本（例如另一個分頁已經是新版）：這個分頁不讀、不覆寫它，只提示重新整理。
 */
export const NEWER_DATA_TEXT = '這份存檔來自更新的版本，這個分頁不會動它。請重新整理網頁，載入新版後再繼續。'

export function NewerDataNotice() {
  const newer = useFarmStore((s) => s.newerData)
  if (!newer) return null
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <div role="alertdialog" aria-label="存檔來自更新的版本" data-testid="newer-data-notice" className="px-panel w-full max-w-sm p-4 text-center">
        <div className="text-sm font-bold leading-relaxed">{NEWER_DATA_TEXT}</div>
        <button type="button" className="px-btn mt-3 px-5 py-1 text-sm" onClick={() => window.location.reload()}>
          重新整理
        </button>
      </div>
    </div>
  )
}
