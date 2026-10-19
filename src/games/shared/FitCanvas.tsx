import type { RefObject } from 'react'
import { useElementSize } from './hooks'

interface Props {
  /** 邏輯尺寸（遊戲座標系），畫面會等比縮放到容器內 */
  width: number
  height: number
  canvasRef: RefObject<HTMLCanvasElement | null>
  className?: string
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerCancel?: (e: React.PointerEvent<HTMLCanvasElement>) => void
}

/** 依容器大小等比縮放的畫布，內部解析度跟隨 devicePixelRatio */
export function FitCanvas({ width, height, canvasRef, className, ...handlers }: Props) {
  const [boxRef, size] = useElementSize<HTMLDivElement>()
  const scale = size.width > 0 && size.height > 0 ? Math.min(size.width / width, size.height / height) : 0
  const cssW = Math.floor(width * scale)
  const cssH = Math.floor(height * scale)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  return (
    <div ref={boxRef} className={`flex h-full w-full items-center justify-center overflow-hidden ${className ?? ''}`}>
      {scale > 0 && (
        <canvas
          ref={canvasRef}
          width={Math.max(1, Math.round(cssW * dpr))}
          height={Math.max(1, Math.round(cssH * dpr))}
          style={{ width: cssW, height: cssH, touchAction: 'none' }}
          {...handlers}
        />
      )}
    </div>
  )
}

/** 設定好邏輯座標轉換後回傳 2D context；每個影格開頭呼叫一次 */
export function beginFrame(canvas: HTMLCanvasElement, logicalW: number, logicalH: number): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(canvas.width / logicalW, 0, 0, canvas.height / logicalH, 0, 0)
  return ctx
}

/** 把指標事件的座標轉成邏輯座標 */
export function toLogical(
  canvas: HTMLCanvasElement,
  e: { clientX: number; clientY: number },
  logicalW: number,
  logicalH: number,
): { x: number; y: number } {
  const r = canvas.getBoundingClientRect()
  return { x: ((e.clientX - r.left) / r.width) * logicalW, y: ((e.clientY - r.top) / r.height) * logicalH }
}
