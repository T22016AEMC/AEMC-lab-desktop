import { useEffect, useRef } from 'react'
import { drawFitted } from '../art/fit'
import type { SpeciesId } from '../config/species'

/**
 * 領養預覽縮圖：用場景上寵物完全相同的繪圖程式（art/）畫出來，
 * 選了什麼物種／品種，預覽就立刻換成那隻，領養後場景上的寵物長得一樣。
 */
export function CreaturePreview({
  species, variant, w, h, className = '',
}: { species: SpeciesId; variant?: string; w: number; h: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    drawFitted(ctx, w, h, species, variant)
  }, [species, variant, w, h])
  return (
    <canvas
      ref={ref}
      style={{ width: w, height: h }}
      className={className}
      data-preview-species={species}
      data-preview-variant={variant ?? ''}
      aria-hidden
    />
  )
}
