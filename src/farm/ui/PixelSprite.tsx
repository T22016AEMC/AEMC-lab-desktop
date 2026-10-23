import { useEffect, useRef, useState } from 'react'
import { assets } from '../pixel/assets'

/** 把一張像素素材（例如 front_dog_shiba）以整數倍放大畫在小畫布上，保持銳利 */
export function PixelSprite({ frame, scale = 2, className = '', title }: { frame: string; scale?: number; className?: string; title?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const [ready, setReady] = useState(assets.ready)
  useEffect(() => {
    if (!ready) void assets.load().then(() => setReady(true))
  }, [ready])
  const s = ready ? assets.get(frame) : null
  useEffect(() => {
    const c = ref.current
    if (!c || !s) return
    const dpr = window.devicePixelRatio || 1
    // 裝置像素上的整數倍：scale × dpr 取整，不會糊
    const k = Math.max(1, Math.round(scale * dpr))
    c.width = s.w * k
    c.height = s.h * k
    c.style.width = `${(s.w * k) / dpr}px`
    c.style.height = `${(s.h * k) / dpr}px`
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, c.width, c.height)
  }, [s, scale])
  return (
    <canvas
      ref={ref}
      className={className}
      style={{ imageRendering: 'pixelated' }}
      data-frame={frame}
      role="img"
      aria-label={title ?? frame}
    />
  )
}
