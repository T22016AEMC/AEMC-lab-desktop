import { useEffect } from 'react'
import { useFarmStore } from '../store/farmStore'

/**
 * v3.10.0：存檔已在另一個分頁開啟（那個分頁接手了寫入權）。這個分頁已停止存檔；整個畫面擋住（含選單列與工具），
 * 鍵盤快捷鍵也攔下，避免玩家以為還在存。只能重新整理（重新整理後這個分頁接手）或關掉分頁。
 */
export const OTHER_TAB_TEXT = '養殖場已在另一個分頁開啟，這個分頁已停止存檔，以免互相覆蓋。請重新整理（或關掉這個分頁）。'

export function OtherTabNotice() {
  const shown = useFarmStore((s) => s.otherTab)

  useEffect(() => {
    if (!shown) return
    // 捕捉階段攔下所有按鍵（F4、E、遊戲方向鍵…），只留瀏覽器自己的重新整理（不呼叫 preventDefault）
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [shown])

  if (!shown) return null
  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/60 p-4" onPointerDown={(e) => e.stopPropagation()} data-testid="other-tab-overlay">
      <div role="alertdialog" aria-label="養殖場已在另一個分頁開啟" data-testid="other-tab-notice" className="px-panel w-full max-w-sm p-4 text-center">
        <div className="text-sm font-bold leading-relaxed">{OTHER_TAB_TEXT}</div>
        <button type="button" className="px-btn mt-3 px-5 py-1 text-sm" autoFocus onClick={() => window.location.reload()}>
          重新整理
        </button>
      </div>
    </div>
  )
}
