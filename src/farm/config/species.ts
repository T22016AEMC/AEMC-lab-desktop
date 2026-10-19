export type Domain = 'land' | 'sea'
export type SpeciesId = 'dog' | 'cat' | 'clownfish' | 'crab' | 'turtle' | 'beluga' | 'orca' | 'whaleshark'

/** 體型級別：決定基本大小（再乘上領養時隨機的身高係數與體重胖瘦） */
export type SizeClass = 'S' | 'M' | 'L'

export const SIZE_SCALE: Record<SizeClass, number> = { S: 0.82, M: 1, L: 1.22 }

/** 狗的品種、貓的花色／品種 */
export interface Variant {
  id: string
  name: string
  /** 選擇時顯示的色塊 */
  swatch: string
  sizeClass: SizeClass
  /** 成年、身高係數 1 時的身高（公分，資訊卡顯示用） */
  baseCm: number
  /** 繪製用的色票（鍵名由各品種的繪圖程式決定；body／belly／ear／dark／stripe／patchA／patchB 也供舊版繪圖使用） */
  palette: Record<string, string>
}

export interface SpeciesDef {
  id: SpeciesId
  name: string
  emoji: string
  domain: Domain
  /** 池塘佔用格數（陸地生物以隻數計，不用這個） */
  slots: number
  cost: number
  /** 成年時的身長（邏輯像素，邏輯畫面高度固定 900） */
  length: number
  /** 成年、身高係數 1 時的身高／體長（公分，資訊卡顯示用） */
  baseCm: number
  /** 移動速度（邏輯像素／秒） */
  speed: number
  /** 可以撫摸 */
  touchable: boolean
  /** 一次領養的隻數（小丑魚 3 隻成群） */
  groupSize: number
  /** 狗：品種；貓：花色／品種 */
  variants?: Variant[]
  /** 選單上這個欄位的名稱 */
  variantLabel?: string
  nameIdeas: string[]
}

const DOG_VARIANTS: Variant[] = [
  {
    id: 'shiba', name: '柴犬', swatch: '#d9944a', sizeClass: 'M', baseCm: 38,
    palette: { body: '#d9944a', belly: '#fff3e0', ear: '#c27a35', earIn: '#f2c9a0', dark: '#3a2a20', cheek: '#fff3e0' },
  },
  {
    id: 'corgi', name: '柯基', swatch: '#e2a04f', sizeClass: 'S', baseCm: 28,
    palette: { body: '#e2a04f', belly: '#ffffff', ear: '#cf8a3a', earIn: '#f4b6a0', dark: '#3a2a20', cheek: '#ffffff' },
  },
  {
    id: 'husky', name: '哈士奇', swatch: '#6d7785', sizeClass: 'L', baseCm: 58,
    palette: { body: '#6d7785', cap: '#39414d', belly: '#ffffff', ear: '#4a525e', earIn: '#d9a0a8', dark: '#22262c', eye: '#4aa8e8' },
  },
  {
    id: 'golden', name: '黃金獵犬', swatch: '#e6b25a', sizeClass: 'L', baseCm: 60,
    palette: { body: '#e6b25a', fringe: '#f4cf86', belly: '#f6d79a', ear: '#d19a3e', earIn: '#e8b878', dark: '#3a2a20' },
  },
  {
    id: 'bordercollie', name: '邊牧', swatch: '#2b2c31', sizeClass: 'M', baseCm: 52,
    palette: { body: '#2b2c31', belly: '#ffffff', ear: '#1d1e22', earIn: '#d9a0a8', dark: '#111214', white: '#ffffff' },
  },
  {
    id: 'poodle', name: '貴賓', swatch: '#f4ead8', sizeClass: 'S', baseCm: 32,
    palette: { body: '#f4ead8', shade: '#e2d2b4', belly: '#f4ead8', ear: '#f4ead8', dark: '#3b2f2a' },
  },
]

const CAT_VARIANTS: Variant[] = [
  {
    id: 'tabby', name: '橘虎斑', swatch: '#f09a42', sizeClass: 'M', baseCm: 25,
    palette: { body: '#f09a42', stripe: '#cf6f22', belly: '#ffe3bd', ear: '#f6b7a0', dark: '#3a2a20', eye: '#c9a227' },
  },
  {
    id: 'black', name: '黑貓', swatch: '#2b2b33', sizeClass: 'M', baseCm: 25,
    palette: { body: '#2b2b33', stripe: '#1d1d22', belly: '#3a3a45', ear: '#6b4a58', dark: '#111111', eye: '#f2c230' },
  },
  {
    id: 'calico', name: '三花', swatch: '#ffffff', sizeClass: 'M', baseCm: 24,
    palette: { body: '#ffffff', patchA: '#f09a42', patchB: '#2e2e36', belly: '#ffffff', ear: '#f6b7a0', dark: '#2a2a33', eye: '#c9a227' },
  },
  {
    id: 'siamese', name: '暹羅', swatch: '#e9d6b4', sizeClass: 'M', baseCm: 24,
    palette: { body: '#f3e6cf', point: '#5b4636', belly: '#fbf2e0', ear: '#5b4636', dark: '#3a2a22', eye: '#4aa8e8' },
  },
  {
    id: 'britishblue', name: '英短藍貓', swatch: '#8c9bb0', sizeClass: 'M', baseCm: 28,
    palette: { body: '#8c9bb0', stripe: '#7a889d', belly: '#a2afc2', ear: '#c9a0a0', dark: '#2a3140', eye: '#d9822b' },
  },
  {
    id: 'ragdoll', name: '布偶貓', swatch: '#efe6d8', sizeClass: 'M', baseCm: 30,
    palette: { body: '#efe6d8', point: '#7a6652', belly: '#ffffff', ear: '#7a6652', dark: '#4a3a2e', eye: '#4aa8e8', white: '#ffffff' },
  },
]

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  dog: {
    id: 'dog', name: '狗', emoji: '🐶', domain: 'land', slots: 1, cost: 15, length: 96, baseCm: 52, speed: 150,
    touchable: true, groupSize: 1, variants: DOG_VARIANTS, variantLabel: '品種',
    nameIdeas: ['小黃', '豆豆', '球球', '旺財', '黑皮', '年糕'],
  },
  cat: {
    id: 'cat', name: '貓', emoji: '🐱', domain: 'land', slots: 1, cost: 15, length: 80, baseCm: 25, speed: 90,
    touchable: true, groupSize: 1, variants: CAT_VARIANTS, variantLabel: '花色／品種',
    nameIdeas: ['咪咪', '橘子', '小花', '墨墨', '麻糬', '花捲'],
  },
  clownfish: {
    id: 'clownfish', name: '小丑魚', emoji: '🐠', domain: 'sea', slots: 1, cost: 15, length: 46, baseCm: 9, speed: 90,
    touchable: false, groupSize: 3, nameIdeas: ['尼莫', '橘橘', '小丑隊', '泡泡'],
  },
  crab: {
    id: 'crab', name: '帝王蟹', emoji: '🦀', domain: 'sea', slots: 1, cost: 15, length: 80, baseCm: 40, speed: 28,
    touchable: false, groupSize: 1, nameIdeas: ['橫橫', '紅紅', '大鉗', '蟹老闆'],
  },
  turtle: {
    id: 'turtle', name: '海龜', emoji: '🐢', domain: 'sea', slots: 2, cost: 25, length: 130, baseCm: 110, speed: 38,
    touchable: true, groupSize: 1, nameIdeas: ['慢慢', '龜龜', '綠綠', '老爺'],
  },
  beluga: {
    id: 'beluga', name: '白鯨', emoji: '🐋', domain: 'sea', slots: 3, cost: 35, length: 240, baseCm: 450, speed: 55,
    touchable: true, groupSize: 1, nameIdeas: ['小白', '雪球', '白白', '雲朵'],
  },
  orca: {
    id: 'orca', name: '虎鯨', emoji: '🐳', domain: 'sea', slots: 3, cost: 35, length: 290, baseCm: 650, speed: 110,
    touchable: false, groupSize: 1, nameIdeas: ['黑白', '熊貓', '閃電', '大黑'],
  },
  whaleshark: {
    id: 'whaleshark', name: '鯨鯊', emoji: '🦈', domain: 'sea', slots: 4, cost: 35, length: 390, baseCm: 1100, speed: 42,
    touchable: false, groupSize: 1, nameIdeas: ['斑點', '大嘴', '藍藍', '巨巨'],
  },
}

export const SPECIES_LIST: SpeciesDef[] = Object.values(SPECIES)
export const LAND_SPECIES = SPECIES_LIST.filter((s) => s.domain === 'land')
export const SEA_SPECIES = SPECIES_LIST.filter((s) => s.domain === 'sea')

export function isSpeciesId(v: unknown): v is SpeciesId {
  return typeof v === 'string' && v in SPECIES
}

/** 取得品種／花色定義；id 不存在時退回第一個。沒有品種的物種回傳 undefined */
export function variantOf(species: SpeciesId, id: string | undefined): Variant | undefined {
  const list = SPECIES[species].variants
  if (!list) return undefined
  return list.find((v) => v.id === id) ?? list[0]
}

export function isVariantId(species: SpeciesId, id: unknown): id is string {
  return typeof id === 'string' && Boolean(SPECIES[species].variants?.some((v) => v.id === id))
}
