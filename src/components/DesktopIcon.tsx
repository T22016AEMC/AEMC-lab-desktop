import { useRef } from 'react'
import type { DesktopApp } from '../types'
import { AppIcon } from './AppIcon'

interface Props {
  app: DesktopApp
  selected: boolean
  iconSize: number
  onSelect: () => void
  onOpen: () => void
}

/** 桌面圖示：滑鼠雙擊開啟；觸控（含手寫筆）單擊開啟 */
export function DesktopIcon({ app, selected, iconSize, onSelect, onOpen }: Props) {
  const lastPointer = useRef<string>('mouse')

  return (
    <button
      type="button"
      className="flex flex-col items-center gap-1 rounded-lg p-1.5 outline-none"
      style={{ width: iconSize + 48 }}
      onPointerDown={(e) => {
        lastPointer.current = e.pointerType
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (lastPointer.current === 'touch' || lastPointer.current === 'pen') onOpen()
        else onSelect()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className={`rounded-[22%] ${selected ? 'ring-2 ring-white/70' : ''}`}>
        <AppIcon id={app.id} icon={app.icon} size={iconSize} />
      </div>
      <span
        className={`max-w-full break-words rounded px-1.5 text-center text-xs leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)] ${
          selected ? 'bg-blue-500/80' : ''
        }`}
      >
        {app.name}
      </span>
    </button>
  )
}
