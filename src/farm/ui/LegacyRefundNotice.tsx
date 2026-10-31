import { useUIStore } from '../../store/uiStore'
import { useFarmStore } from '../store/farmStore'

/**
 * v3.5.1：營火移除後，舊存檔載入時自動退款的一次性對話框（按「確定」關閉）。
 * 旗標 legacyRefund 只存在記憶體（不進存檔、不新增存檔欄位）：退款本身在載入時已經寫回，所以重新整理後不會再出現。
 * 同一次載入若有每日登入獎勵的提示，排在它消失之後才出現。
 */
export const legacyRefundText = (coins: number): string => `營火已移除，已退還 ${coins} 金幣`

export function LegacyRefundNotice() {
  const coins = useFarmStore((s) => s.legacyRefund)
  const dismiss = useFarmStore((s) => s.dismissLegacyRefund)
  const toastShowing = useUIStore((s) => s.toast !== null)
  if (coins <= 0 || toastShowing) return null
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <div role="alertdialog" aria-label="營火已移除" data-testid="legacy-refund-notice" className="px-panel w-full max-w-sm p-4 text-center">
        <div className="text-sm font-bold leading-relaxed">{legacyRefundText(coins)}</div>
        <button type="button" data-testid="legacy-refund-ok" className="px-btn mt-3 px-5 py-1 text-sm" onClick={dismiss}>
          確定
        </button>
      </div>
    </div>
  )
}
