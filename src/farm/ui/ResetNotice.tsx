import { useFarmStore } from '../store/farmStore'

/**
 * v3.4.0 一次性重置之後第一次畫面的提示（旗標 resetNotice 存在新存檔裡，按「確定」清掉，之後不再出現；全新玩家沒有這個旗標）。
 * 也負責重置寫入失敗時的說明（舊存檔沒有被改動，下次載入重試）。
 */
export const RESET_NOTICE_TEXT = '養殖場已重新開始，所有寵物與金幣已重置，請重新領養。'
export const RESET_FAILED_TEXT = '養殖場存檔重置失敗（瀏覽器空間可能已滿）。你原本的存檔沒有被改動；請清出一些瀏覽器空間後重新整理網頁，會再試一次。'

export function ResetNotice() {
  const notice = useFarmStore((s) => s.save?.resetNotice === true)
  const failed = useFarmStore((s) => s.resetFailed)
  const dismiss = useFarmStore((s) => s.dismissResetNotice)
  if (!notice && !failed) return null
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <div role="alertdialog" aria-label={failed ? '重置失敗' : '養殖場已重新開始'} data-testid="reset-notice" className="px-panel w-full max-w-sm p-4 text-center">
        <div className="text-sm font-bold leading-relaxed">{failed ? RESET_FAILED_TEXT : RESET_NOTICE_TEXT}</div>
        {!failed && (
          <button type="button" className="px-btn mt-3 px-5 py-1 text-sm" onClick={dismiss}>
            確定
          </button>
        )}
      </div>
    </div>
  )
}
