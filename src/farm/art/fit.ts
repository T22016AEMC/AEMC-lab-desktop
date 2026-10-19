import { SPECIES, type SpeciesId } from '../config/species'
import { creatureBox, drawCreature } from './index'
import { makeLook, type Look } from './look'
import { stageScale } from '../sim/stats'

/** 把一隻生物（用 Look 描述）縮放後畫進 w×h 的畫布：預覽縮圖、圖鑑共用。海洋置中，陸地腳底對齊地面線 */
export function drawFitted(
  ctx: CanvasRenderingContext2D, w: number, h: number, species: SpeciesId, variant: string | undefined, over: Partial<Look> = {},
  opts: { pad?: number; fixedPx?: number } = {},
): void {
  const pad = opts.pad ?? 4
  const box = creatureBox(species, variant)
  const bw = box.x1 - box.x0
  const bh = box.y1 - box.y0
  const fit = opts.fixedPx ? opts.fixedPx / Math.max(bw, bh) : Math.min((w - pad * 2) / bw, (h - pad * 2) / bh)
  const look = makeLook(species, variant, { t: 0.8, ...over })
  const k = fit * (look.stage === 'young' ? stageScale('young') : 1)
  const cx = ((box.x0 + box.x1) / 2) * look.facing
  ctx.save()
  if (SPECIES[species].domain === 'sea') {
    ctx.translate(w / 2, h / 2)
    ctx.scale(k, k)
    ctx.translate(-cx, -(box.y0 + box.y1) / 2)
  } else {
    ctx.translate(w / 2, h - pad)
    ctx.scale(k, k)
    ctx.translate(-cx, -box.y1)
  }
  drawCreature(ctx, look)
  ctx.restore()
}
