import { useEffect, useRef } from 'react'
import { BALANCE } from '../config/balance'
import { SPECIES } from '../config/species'
import { REHOME_TEXT } from '../sim/rehome'
import { useFarmStore } from '../store/farmStore'

/**
 * 找新主人的二次確認對話框（v3.7.1）。按「確認」才執行（onConfirm），「取消」、Esc、點遮罩都只是關閉。
 * 預設焦點在「取消」，避免連按 Enter 誤觸。開著時在 window 的捕捉階段攔下所有 keydown（和工具視窗一樣），
 * 所以 F4、建築模式、玩耍的 Esc 都收不到；Esc 只關掉這個對話框。
 * 和工具視窗一樣蓋在所有東西上面（fixed、z-9900）：遊戲館等視窗開著時，確認框也不會被擋住。
 */
export function RehomeDialog({ petId, onCancel, onConfirm }: { petId: string; onCancel: () => void; onConfirm: () => void }) {
  const pet = useFarmStore((s) => s.save?.pets.find((p) => p.id === petId))
  const cancelBtn = useRef<HTMLButtonElement | null>(null)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      e.stopPropagation()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    cancelBtn.current?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  if (!pet) return null
  return (
    <div
      className="fixed inset-0 z-[9900] flex items-center justify-center bg-black/55 p-3"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => cancelRef.current()}
      data-testid="rehome-overlay"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={`幫${pet.name}找新主人`}
        data-testid="rehome-dialog"
        className="px-panel w-full max-w-sm p-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-bold">
          {SPECIES[pet.species].emoji} 幫{pet.name}找新主人？
        </div>
        <p className="mt-3 text-sm font-bold leading-relaxed text-[#c0392b]" data-testid="rehome-warning">
          {REHOME_TEXT.warning}
        </p>
        <p className="mt-2 text-sm" data-testid="rehome-refund">
          返還 {BALANCE.rehome.refund} 金幣
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button ref={cancelBtn} type="button" data-testid="rehome-cancel" className="px-btn px-5 py-1 text-sm" onClick={() => cancelRef.current()}>
            取消
          </button>
          <button
            type="button"
            data-testid="rehome-confirm"
            className="px-btn px-5 py-1 text-sm"
            style={{ background: '#e8735a', color: '#fff6df' }}
            onClick={onConfirm}
          >
            確認找新主人
          </button>
        </div>
      </div>
    </div>
  )
}
