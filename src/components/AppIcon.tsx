import { gradientFor, isImageIcon, resolveIconSrc } from '../lib/icon'

interface Props {
  id: string
  icon: string
  /** 像素大小；'fill' 表示填滿父層（Dock 放大效果用，emoji 會跟著縮放） */
  size: number | 'fill'
}

/** 圖示：圖片路徑直接顯示，emoji 放在依 id 決定底色的圓角方塊上 */
export function AppIcon({ id, icon, size }: Props) {
  const fill = size === 'fill'
  const box = fill ? { width: '100%', height: '100%' } : { width: size, height: size }

  if (isImageIcon(icon)) {
    return (
      <img
        src={resolveIconSrc(icon)}
        alt=""
        draggable={false}
        style={box}
        className="rounded-[22%] object-contain"
      />
    )
  }
  return (
    <div style={{ ...box, containerType: 'inline-size' }}>
      <div
        className="flex h-full w-full items-center justify-center rounded-[22%] shadow-md shadow-black/30"
        style={{
          background: gradientFor(id),
          fontSize: fill ? '55cqw' : size * 0.55,
          lineHeight: 1,
        }}
        aria-hidden
      >
        {icon}
      </div>
    </div>
  )
}
