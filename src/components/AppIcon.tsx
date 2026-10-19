import { gradientFor, iconInitials, isImageIcon, resolveIconSrc } from '../lib/icon'
import type { DesktopApp } from '../types'
import { iconColorOf, isComingSoon } from '../config/registry'

interface Props {
  app: DesktopApp
  /** 像素大小；'fill' 表示填滿父層（Dock 放大效果用，emoji 與文字會跟著縮放） */
  size: number | 'fill'
}

/**
 * 圖示：圖片路徑直接顯示；emoji 放在依 id 決定底色的圓角方塊上；
 * icon 留空則顯示「文字圖示」（名稱前兩個字母）。
 * 尚未上線的程式圖示半透明，並在角落加「即將推出」標籤。
 */
export function AppIcon({ app, size }: Props) {
  const fill = size === 'fill'
  const box = fill ? { width: '100%', height: '100%' } : { width: size, height: size }
  const soon = isComingSoon(app)
  const background = gradientFor(app.id, iconColorOf(app))

  let inner
  if (app.icon && isImageIcon(app.icon)) {
    inner = (
      <img
        src={resolveIconSrc(app.icon)}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%' }}
        className="rounded-[22%] object-contain"
      />
    )
  } else {
    const text = app.icon || iconInitials(app.name)
    const isText = !app.icon
    inner = (
      <div
        className={`flex h-full w-full items-center justify-center rounded-[22%] shadow-md shadow-black/30 ${
          isText ? 'font-bold tracking-tight text-white' : ''
        }`}
        style={{
          background,
          fontSize: fill ? (isText ? '42cqw' : '55cqw') : size * (isText ? 0.42 : 0.55),
          lineHeight: 1,
        }}
        aria-hidden
      >
        {text}
      </div>
    )
  }

  return (
    <div className="relative" style={{ ...box, containerType: 'inline-size' }}>
      <div className={`h-full w-full ${soon ? 'opacity-50' : ''}`}>{inner}</div>
      {soon && (
        <span
          className="pointer-events-none absolute -bottom-1 -right-1 whitespace-nowrap rounded-full bg-neutral-900/90 px-1 py-px text-[8px] font-medium leading-tight text-white ring-1 ring-white/30"
        >
          即將推出
        </span>
      )}
    </div>
  )
}
