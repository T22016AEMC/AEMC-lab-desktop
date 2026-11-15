import { useEffect, useRef } from 'react'

export interface PolaroidShot {
  /** 畫面顯示用（1 倍）與下載用（DOWNLOAD_SCALE 倍）的 blob 網址 */
  url: string
  downloadUrl: string
  fileName: string
  /** 1 倍圖的像素大小 */
  w: number
  h: number
  /** 相框款式（素材鍵名） */
  frame: string
}

/**
 * 拍立得成品（v3.8.0）：蓋在畫面上的對話框，顯示照片、可下載 PNG。不做相簿、不存進存檔，關掉就沒了。
 * 顯示大小：裝置像素的整數倍（最大不超過可視範圍的 80%，最小 1 倍），image-rendering: pixelated，像素不會糊。
 */
export function PolaroidDialog({ shot, onClose }: { shot: PolaroidShot; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  const dpr = window.devicePixelRatio || 1
  const maxH = window.innerHeight * 0.8 * dpr
  const maxW = window.innerWidth * 0.8 * dpr
  const k = Math.max(1, Math.floor(Math.min(maxH / shot.h, maxW / shot.w)))
  return (
    <div className="fixed inset-0 z-[9900] flex items-center justify-center bg-black/45" onPointerDown={(e) => e.target === e.currentTarget && onClose()} data-testid="polaroid-dialog">
      <div className="px-panel flex flex-col items-center gap-2 p-3" role="dialog" aria-label="拍立得">
        <img
          src={shot.url}
          alt="野餐照片"
          width={shot.w}
          height={shot.h}
          data-frame={shot.frame}
          data-testid="polaroid-image"
          style={{ width: (shot.w * k) / dpr, height: (shot.h * k) / dpr, imageRendering: 'pixelated' }}
        />
        <div className="flex gap-2">
          <a href={shot.downloadUrl} download={shot.fileName} className="px-btn px-3 py-1 text-xs" data-testid="polaroid-download">
            下載照片
          </a>
          <button ref={closeRef} type="button" className="px-btn px-3 py-1 text-xs" onClick={onClose} data-testid="polaroid-close">
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
