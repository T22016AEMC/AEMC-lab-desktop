export type Domain = 'land' | 'sea'
export type SpeciesId = 'dog' | 'cat' | 'clownfish' | 'crab' | 'turtle' | 'beluga' | 'orca' | 'whaleshark'

export interface Coat {
  id: string
  name: string
  /** 選擇毛色時顯示的色塊 */
  swatch: string
  colors: Record<string, string>
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
  coats?: Coat[]
  nameIdeas: string[]
}

const DOG_COATS: Coat[] = [
  { id: 'shiba', name: '柴犬黃', swatch: '#e0a25a', colors: { body: '#e0a25a', belly: '#fff1dc', ear: '#c9803a', dark: '#3a2a20' } },
  { id: 'bw', name: '黑白', swatch: '#35353b', colors: { body: '#35353b', belly: '#ffffff', ear: '#222227', dark: '#111' } },
  { id: 'cream', name: '奶油白', swatch: '#f4e6cc', colors: { body: '#f4e6cc', belly: '#fff8ea', ear: '#e3cfa8', dark: '#5a4630' } },
  { id: 'choco', name: '巧克力', swatch: '#7a4a2b', colors: { body: '#7a4a2b', belly: '#b07a52', ear: '#5d3520', dark: '#2a1a10' } },
]

const CAT_COATS: Coat[] = [
  { id: 'orange', name: '橘貓', swatch: '#f2a04a', colors: { body: '#f2a04a', stripe: '#d9792a', belly: '#ffe2b8', ear: '#f7b8a0', dark: '#3a2a20' } },
  { id: 'black', name: '黑貓', swatch: '#2a2a30', colors: { body: '#2a2a30', stripe: '#1c1c20', belly: '#3a3a42', ear: '#6b4a58', dark: '#111' } },
  { id: 'graywhite', name: '灰白', swatch: '#a9afba', colors: { body: '#a9afba', stripe: '#8b92a0', belly: '#ffffff', ear: '#f0c4c4', dark: '#2a2a33' } },
  { id: 'calico', name: '三花', swatch: '#ffffff', colors: { body: '#ffffff', patchA: '#f2a04a', patchB: '#2f2f36', belly: '#ffffff', ear: '#f7b8a0', dark: '#2a2a33' } },
]

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  dog: {
    id: 'dog', name: '狗', emoji: '🐶', domain: 'land', slots: 1, cost: 15, length: 96, baseCm: 52, speed: 150,
    touchable: true, groupSize: 1, coats: DOG_COATS, nameIdeas: ['小黃', '豆豆', '球球', '旺財', '黑皮', '年糕'],
  },
  cat: {
    id: 'cat', name: '貓', emoji: '🐱', domain: 'land', slots: 1, cost: 15, length: 80, baseCm: 25, speed: 90,
    touchable: true, groupSize: 1, coats: CAT_COATS, nameIdeas: ['咪咪', '橘子', '小花', '墨墨', '麻糬', '花捲'],
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

export function coatOf(speciesId: SpeciesId, coatId: string | undefined): Coat | undefined {
  const coats = SPECIES[speciesId].coats
  if (!coats) return undefined
  return coats.find((c) => c.id === coatId) ?? coats[0]
}
