import { creatureBox, drawCreature } from '../../art'
import { drawClownfishOne } from '../../art/sea/clownfish'
import { breedOf } from '../../art/land'
import { makeLook, type Look, type Pose } from '../../art/look'
import type { Entity } from '../../ai/entity'
import type { SpeciesId } from '../../config/species'

/**
 * 場景實體 ↔ 部件式繪圖（art/）的橋接：
 * 把實體狀態轉成 Look，再用與圖鑑、領養預覽完全相同的繪圖程式畫出來。
 */

/** 池塘生物：art 設計座標下「身體長度」（對應 def.length），縮放比例 = def.length × sizeK ÷ 這個值 */
const SEA_ART_LEN: Partial<Record<SpeciesId, number>> = {
  orca: 284,
  beluga: 216,
  whaleshark: 374,
  turtle: 146,
  crab: 150,
  clownfish: 65,
}

/** 陸地生物：設計座標 → 場景像素的基本比例（再乘上 sizeK 與透視） */
export const LAND_K = 0.8

const clampN = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))

/** 游動時的俯仰角：往下游鼻子朝下；躍出水面時幾乎垂直 */
function pitchOf(e: Entity): number {
  if (e.state === 'breach') return clampN(Math.atan2(e.vy, Math.max(40, Math.abs(e.vx))), -1.35, 1.35)
  if (e.state === 'surface') return -0.3
  return clampN(Math.atan2(e.vy, Math.max(30, Math.abs(e.vx))), -0.45, 0.45) * 0.7
}

export function poseOf(e: Entity): Pose {
  if (e.sleeping || e.state === 'lie') return 'lie'
  const a = e.anim?.kind
  if (a === 'groom' || a === 'pet') return 'sit'
  if (a === 'bath' || a === 'eat' || a === 'wake' || a === 'walk') return 'stand'
  if (e.state === 'sit') return 'sit'
  if (e.state === 'stretch') return 'stretch'
  return 'stand'
}

export function lookOfEntity(e: Entity): Look {
  const a = e.anim?.kind
  const isDog = e.pet.species === 'dog'
  const eating = a === 'eat'
  return makeLook(e.pet.species, e.pet.variant, {
    facing: e.facing,
    t: e.t,
    stage: e.stage === 'young' ? 'young' : 'adult',
    fat: e.fat,
    sleeping: e.sleeping,
    moving: e.moving,
    pose: e.def.domain === 'land' ? poseOf(e) : 'stand',
    happy: a === 'pet' || a === 'groom' || a === 'walk' || (isDog && (e.state === 'run' || a === 'wake')),
    eating,
    yawn: a === 'wake',
    pitch: 0,
    mouthOpen: eating || e.foodId !== null ? 1 : 0.35,
    surfacing: e.state === 'surface',
  })
}

// ---------------------------------------------------------------------------
// 尺寸（碰撞、點擊、提示泡泡位置都由這裡推算，和實際畫出來的一致）
// ---------------------------------------------------------------------------

export function seaScale(e: Entity): number {
  return (e.def.length * e.sizeK) / (SEA_ART_LEN[e.pet.species] ?? e.def.length)
}

/** 池塘生物的半寬／半高：由 art 外框推算（外框以中心對齊，所以左右對稱） */
export function seaHalf(e: Entity): { hw: number; hh: number } {
  const b = creatureBox(e.pet.species, e.pet.variant)
  const k = seaScale(e)
  return { hw: ((b.x1 - b.x0) / 2) * k * (e.pet.species === 'crab' ? 0.85 : 1), hh: ((b.y1 - b.y0) / 2) * k * (0.5 + 0.5 * e.fat) }
}

/** 陸地生物（腳底原點）的實際大小：寬、高（像素） */
export function landSize(e: Entity, persp = 1): { w: number; h: number; k: number } {
  const br = breedOf(e.pet.species, e.pet.variant)
  const k = e.sizeK * persp * LAND_K
  return { w: (br.L + br.hr * 2.3) * k, h: (br.legH + br.D + br.hr * 2.1) * k, k }
}

// ---------------------------------------------------------------------------
// 繪製
// ---------------------------------------------------------------------------

export function drawSea(ctx: CanvasRenderingContext2D, e: Entity): void {
  const look = lookOfEntity(e)
  const k = seaScale(e)
  if (e.pet.species === 'clownfish') {
    const sorted = [...e.school].sort((a, b) => a.y - b.y)
    sorted.forEach((f, i) => {
      ctx.save()
      ctx.translate(f.x, f.y)
      ctx.scale(f.facing * k, k)
      drawClownfishOne(ctx, { ...look, facing: 1, t: e.t + f.ph + i }, 0)
      ctx.restore()
    })
    return
  }
  const box = creatureBox(e.pet.species, e.pet.variant)
  ctx.save()
  ctx.translate(e.x, e.y)
  ctx.scale(k, k)
  ctx.rotate(pitchOf(e))
  ctx.translate(-((box.x0 + box.x1) / 2) * e.facing, -(box.y0 + box.y1) / 2)
  drawCreature(ctx, look)
  ctx.restore()
}

export function drawLand(ctx: CanvasRenderingContext2D, e: Entity, persp: number): void {
  const k = e.sizeK * persp * LAND_K
  ctx.save()
  ctx.translate(e.x, e.y)
  ctx.scale(k, k)
  drawCreature(ctx, lookOfEntity(e))
  ctx.restore()
}
