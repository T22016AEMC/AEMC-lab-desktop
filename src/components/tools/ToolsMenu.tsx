import { useEffect, useRef, useState } from 'react'
import { TOOL_LIST } from '../../config/tools'
import { PixelSprite } from '../../farm/ui/PixelSprite'
import { CalendarIcon } from './CalendarIcon'
import { useUIStore } from '../../store/uiStore'

/**
 * 選單列右側的「工具」（v3.7.0，排在「收藏冊」之後）：下拉清單 計算機、碼表與倒數、公佈欄、簽到月曆（v3.10.0），每項帶 tools 圖集的圖示（簽到月曆是程式畫的）。
 * 用 click（滑鼠與觸控都會觸發）開關；點清單外面或按 Esc 收起。圖示以裝置像素 1:1 顯示（48×48 素材，整數倍）。
 */
export function ToolsMenu() {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        data-testid="tools-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`rounded px-2 py-px font-semibold hover:bg-white/20 ${open ? 'bg-white/25' : ''}`}
        title="工具"
      >
        工具
      </button>
      {open && (
        <div role="menu" data-testid="tools-menu" className="absolute right-0 top-[24px] z-[9600] min-w-[190px] overflow-hidden rounded-lg border border-white/20 bg-slate-900/95 py-1 text-white shadow-2xl backdrop-blur-xl">
          {TOOL_LIST.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              data-testid={`tools-item-${t.id}`}
              onClick={() => {
                setOpen(false)
                useUIStore.getState().setToolOpen(t.id)
              }}
              className="flex w-full items-center gap-2 px-2 py-1 text-left text-[13px] hover:bg-white/15"
            >
              {t.icon ? <PixelSprite frame={t.icon} scale={0.5} title="" /> : <CalendarIcon size={24} />}
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
