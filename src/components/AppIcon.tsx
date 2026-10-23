import { gradientFor, iconInitials, isImageIcon, resolveIconSrc } from '../lib/icon'

interface Props {
  /** 外部程式與內建程式都適用：只需要名稱、圖示（和選用的 id） */
  app: { id?: string; name: string; icon: string }
  /** 像素大小；'fill' 表示填滿父層（Dock 放大效果用，emoji 與文字會跟著縮放） */
  size: number | 'fill'
}

/**
 * 圖示：圖片路徑或 data URL 直接顯示；emoji 放在依 id 決定底色的圓角方塊上；
 * icon 留空則顯示「文字圖示」（名稱前 1～2 個字，背景色依名稱雜湊決定）。
 */
export function AppIcon({ app, size }: Props) {
  const fill = size === 'fill'
  const box = fill ? { width: '100%', height: '100%' } : { width: size, height: size }

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
    const isText = !app.icon
    const text = app.icon || iconInitials(app.name)
    inner = (
      <div
        className={`flex h-full w-full items-center justify-center rounded-[22%] shadow-md shadow-black/30 ${
          isText ? 'font-bold tracking-tight text-white' : ''
        }`}
        style={{
          background: gradientFor(isText ? app.name : (app.id ?? app.name)),
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
      <div className="h-full w-full">{inner}</div>
    </div>
  )
}
