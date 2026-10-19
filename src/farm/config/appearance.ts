import { SIZE_SCALE, SPECIES, variantOf, type SpeciesId } from './species'

/**
 * 一隻生物的外觀描述：領養預覽、圖鑑與場景上的寵物都用同一個函式取得，
 * 所以選了什麼品種／花色，預覽與領養後的寵物一定長得一樣。
 */
export interface Appearance {
  species: SpeciesId
  /** 品種／花色 id（沒有品種的物種為 undefined） */
  variant: string | undefined
  /** 顯示名稱：狗貓為品種名，其他為物種名 */
  name: string
  palette: Record<string, string>
  /** 品種決定的基本體型倍率（小 0.82、中 1.0、大 1.22；沒有品種的為 1） */
  sizeScale: number
  baseCm: number
}

export function appearanceOf(species: SpeciesId, variant?: string): Appearance {
  const def = SPECIES[species]
  const v = variantOf(species, variant)
  return {
    species,
    variant: v?.id,
    name: v?.name ?? def.name,
    palette: v?.palette ?? {},
    sizeScale: v ? SIZE_SCALE[v.sizeClass] : 1,
    baseCm: v?.baseCm ?? def.baseCm,
  }
}
