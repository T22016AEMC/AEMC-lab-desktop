import { useEffect, useRef, useState } from 'react'
import { assets } from '../pixel/assets'

/** 把一張像素素材（例如 front_dog_shiba）以整數倍放大畫在小畫布上，保持銳利 */
export function PixelSprite({ frame, scale = 2, className = '', title, silhouette = false, fit }: { frame: string; scale?: number; className?: string; title?: string; silhouette?: boolean; fit?: number }) {
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
    // fit：縮到長邊不超過 fit 個 CSS 像素（收藏冊的獎勵縮圖，素材比格子大；最近鄰縮放，不是整數倍）
    const k = fit ? Math.min(scale, fit / Math.max(s.w, s.h)) * dpr : Math.max(1, Math.round(scale * dpr))
    c.width = Math.max(1, Math.round(s.w * k))
    c.height = Math.max(1, Math.round(s.h * k))
    c.style.width = `${c.width / dpr}px`
    c.style.height = `${c.height / dpr}px`
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, c.width, c.height)
    // 剪影（收藏冊還沒收集的項目）：用原圖的透明輪廓，整塊填暗色；不需要另外的素材
    if (silhouette) {
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = '#2e2218'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.globalCompositeOperation = 'source-over'
    }
  }, [s, scale, silhouette, fit])
  return (
    <canvas
      ref={ref}
      className={className}
      style={{ imageRendering: 'pixelated' }}
      data-frame={frame}
      data-silhouette={silhouette || undefined}
      role="img"
      aria-label={title ?? (silhouette ? '？？？' : frame)}
    />
  )
}
