import type { SpeciesId } from '../config/species'
import { SPECIES } from '../config/species'
import type { Box, Look } from './look'
import { drawLand, landBox } from './land'
import { drawBeluga, BOX as BELUGA_BOX } from './sea/beluga'
import { drawClownfish, BOX as CLOWNFISH_BOX } from './sea/clownfish'
import { drawCrab, BOX as CRAB_BOX } from './sea/crab'
import { drawOrca, BOX as ORCA_BOX } from './sea/orca'
import { drawTurtle, BOX as TURTLE_BOX } from './sea/turtle'
import { drawWhaleShark, BOX as WHALESHARK_BOX } from './sea/whaleshark'

/**
 * 部件式生物繪圖入口。每種生物一個繪圖函式（SVG 路徑資料＋可分別活動的部件）。
 * 呼叫前由呼叫端 translate 到生物位置並 scale 成想要的大小；這裡負責面向（水平翻轉）與海洋生物的俯仰。
 */
interface Drawer {
  draw: (ctx: CanvasRenderingContext2D, look: Look) => void
  box: Box | ((variant: string | undefined) => Box)
}

const REGISTRY: Partial<Record<SpeciesId, Drawer>> = {
  orca: { draw: drawOrca, box: ORCA_BOX },
  beluga: { draw: drawBeluga, box: BELUGA_BOX },
  whaleshark: { draw: drawWhaleShark, box: WHALESHARK_BOX },
  turtle: { draw: drawTurtle, box: TURTLE_BOX },
  crab: { draw: drawCrab, box: CRAB_BOX },
  clownfish: { draw: drawClownfish, box: CLOWNFISH_BOX },
  dog: { draw: drawLand, box: (v) => landBox('dog', v) },
  cat: { draw: drawLand, box: (v) => landBox('cat', v) },
}

export function hasArt(species: SpeciesId): boolean {
  return REGISTRY[species] !== undefined
}

export function creatureBox(species: SpeciesId, variant?: string): Box {
  const d = REGISTRY[species]
  if (!d) return { x0: -50, y0: -50, x1: 50, y1: 50 }
  return typeof d.box === 'function' ? d.box(variant) : d.box
}

export function drawCreature(ctx: CanvasRenderingContext2D, look: Look): void {
  const d = REGISTRY[look.species]
  ctx.save()
  if (look.facing === -1) ctx.scale(-1, 1)
  if (SPECIES[look.species].domain === 'sea' && look.pitch) ctx.rotate(look.pitch)
  if (d) d.draw(ctx, look)
  else {
    // 還沒畫好的生物：灰色橢圓佔位
    ctx.fillStyle = 'rgba(120,120,140,0.5)'
    ctx.beginPath()
    ctx.ellipse(0, 0, 50, 30, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
