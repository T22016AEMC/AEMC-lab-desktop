import { useEffect, useRef, type ReactNode } from 'react'
import { PixelSprite } from '../../farm/ui/PixelSprite'

/**
 * 工具視窗的外框（v3.7.0）：沿用收藏冊的樣式與關閉方式（半透明遮罩、像素風面板、右上角「關閉」、Esc、點遮罩關閉）。
 *
 * 鍵盤隔離：視窗開著時，在 window 的「捕捉階段」攔下所有 keydown 並停止傳遞，
 * 所以 F4（啟動台）、建築模式的 Esc、玩耍的 Esc、小遊戲的方向鍵等全域快捷鍵都收不到；
 * 只把按鍵交給 onKey（計算機用來輸入）。不呼叫 preventDefault（除非 onKey 處理了），所以輸入框照常打字、Tab 照常移動焦點。
 * keyup 不攔（避免小遊戲在視窗打開前按住的鍵放不開）。
 */
export function ToolDialog({
  id,
  title,
  icon,
  iconNode,
  width = 520,
  onClose,
  onKey,
  children,
}: {
  id: string
  title: string
  /** tools 圖集的圖示鍵名；沒有素材的工具（簽到月曆）改傳 iconNode */
  icon?: string
  iconNode?: ReactNode
  width?: number
  /** 使用者要求關閉（Esc、右上角、點遮罩）；要不要真的關由呼叫端決定（例如公佈欄有未儲存的修改時先確認） */
  onClose: () => void
  /** 回傳 true = 已處理（會 preventDefault） */
  onKey?: (e: KeyboardEvent) => boolean
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const keyRef = useRef(onKey)
  keyRef.current = onKey

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      e.stopPropagation()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (keyRef.current?.(e)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    // 開啟時把焦點移到視窗上（否則焦點可能還留在後面的輸入框，按鍵的預設動作會打字進去）
    panel.current?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <div className="fixed inset-0 z-[9900] flex items-center justify-center bg-black/35 p-4" onClick={() => closeRef.current()} data-testid={`${id}-overlay`}>
      <div
        ref={panel}
        role="dialog"
        aria-label={title}
        aria-modal="true"
        tabIndex={-1}
        data-testid={`${id}-dialog`}
        className="px-panel flex max-h-[88vh] w-full flex-col outline-none"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b-2 border-[#3b2a1c]/40 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-base font-bold">
            {iconNode ?? (icon ? <PixelSprite frame={icon} scale={0.5} title="" /> : null)}
            <span className="truncate">{title}</span>
          </div>
          <button type="button" aria-label="關閉" data-testid={`${id}-close`} className="px-btn shrink-0 px-2 py-0.5 text-sm" onClick={() => closeRef.current()}>
            關閉
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
