export type SpeciesId = 'dog' | 'cat'

/** 狗的品種、貓的花色／品種 */
export interface Variant {
  id: string
  name: string
  /** 像素素材的鍵名（public/assets/manifest.json 裡的 dog_<key>_*、cat_<key>_*、front_*） */
  assetKey: string
  /** 成年、身高係數 1 時的身高（公分，資訊卡顯示用） */
  baseCm: number
}

export interface SpeciesDef {
  id: SpeciesId
  name: string
  emoji: string
  cost: number
  /** 移動速度（邏輯像素／秒） */
  speed: number
  /** 狗：品種；貓：花色／品種 */
  variants: Variant[]
  /** 選單上這個欄位的名稱 */
  variantLabel: string
  nameIdeas: string[]
}

const DOG_VARIANTS: Variant[] = [
  { id: 'shiba', name: '柴犬', assetKey: 'shiba', baseCm: 38 },
  { id: 'corgi', name: '柯基', assetKey: 'corgi', baseCm: 28 },
  { id: 'husky', name: '哈士奇', assetKey: 'husky', baseCm: 58 },
  { id: 'golden', name: '黃金獵犬', assetKey: 'golden', baseCm: 60 },
  { id: 'bordercollie', name: '邊牧', assetKey: 'collie', baseCm: 52 },
  { id: 'poodle', name: '貴賓', assetKey: 'poodle', baseCm: 32 },
]

const CAT_VARIANTS: Variant[] = [
  { id: 'tabby', name: '橘虎斑', assetKey: 'orange', baseCm: 25 },
  { id: 'black', name: '黑貓', assetKey: 'black', baseCm: 25 },
  { id: 'calico', name: '三花', assetKey: 'calico', baseCm: 24 },
  { id: 'siamese', name: '暹羅', assetKey: 'siamese', baseCm: 24 },
  { id: 'britishblue', name: '英短藍貓', assetKey: 'bluecat', baseCm: 28 },
  { id: 'ragdoll', name: '布偶貓', assetKey: 'ragdoll', baseCm: 30 },
]

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  dog: {
    id: 'dog', name: '狗', emoji: '🐶', cost: 15, speed: 38,
    variants: DOG_VARIANTS, variantLabel: '品種',
    nameIdeas: ['小黃', '豆豆', '球球', '旺財', '黑皮', '年糕'],
  },
  cat: {
    id: 'cat', name: '貓', emoji: '🐱', cost: 15, speed: 24,
    variants: CAT_VARIANTS, variantLabel: '花色／品種',
    nameIdeas: ['咪咪', '橘子', '小花', '墨墨', '麻糬', '花捲'],
  },
}

export const SPECIES_LIST: SpeciesDef[] = Object.values(SPECIES)

export function isSpeciesId(v: unknown): v is SpeciesId {
  return v === 'dog' || v === 'cat'
}

/** 取得品種／花色定義；id 不存在時退回第一個 */
export function variantOf(species: SpeciesId, id: string | undefined): Variant {
  const list = SPECIES[species].variants
  return list.find((v) => v.id === id) ?? list[0]
}

export function isVariantId(species: SpeciesId, id: unknown): id is string {
  return typeof id === 'string' && SPECIES[species].variants.some((v) => v.id === id)
}
