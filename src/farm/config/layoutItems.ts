/**
 * v3.9.0 農場自由擺放：場景上可以移動的物件表（存檔 farmLayout 的 id／kind 都必須在這張表裡）。
 *  - storable：能不能收進庫存（住家、鐘樓、池塘、公佈欄不能收；沙土路固定、不在表裡）
 *  - hasDefault：有沒有預設位置。沒有預設位置的物件（花槽 planter、珊瑚石堆 coral）沒有記錄時在庫存，
 *    存檔寫成擺放但座標壞掉或缺少時也當作在庫存（不能「回到預設位置」）
 *  - building：要買才有的建築（ownedBuildings 是購買依據；沒買的就算有擺放記錄也不出現）
 * 目前每種物件只有一個（樹兩棵：tree1 = 預設版面左邊那棵、tree2 = 右邊那棵），所以 id 是固定的。
 */
export type LayoutKind =
  | 'house'
  | 'tower'
  | 'pond'
  | 'board'
  | 'lamp'
  | 'kennel'
  | 'bowls'
  | 'catTree'
  | 'tree'
  | 'bush'
  | 'mushroom'
  | 'rocks'
  | 'flowers'
  | 'stump'
  | 'tall_grass'
  | 'planter'
  | 'coral'

export interface LayoutItemDef {
  id: string
  kind: LayoutKind
  name: string
  storable: boolean
  hasDefault: boolean
  building?: boolean
}

export const LAYOUT_ITEMS: readonly LayoutItemDef[] = [
  { id: 'house', kind: 'house', name: '住家', storable: false, hasDefault: true },
  { id: 'tower', kind: 'tower', name: '鐘樓', storable: false, hasDefault: true },
  { id: 'pond', kind: 'pond', name: '池塘', storable: false, hasDefault: true },
  { id: 'board', kind: 'board', name: '公佈欄', storable: false, hasDefault: true },
  { id: 'lamp', kind: 'lamp', name: '路燈', storable: true, hasDefault: true },
  { id: 'kennel', kind: 'kennel', name: '狗窩', storable: true, hasDefault: true, building: true },
  { id: 'bowls', kind: 'bowls', name: '食盆水盆', storable: true, hasDefault: true, building: true },
  { id: 'catTree', kind: 'catTree', name: '貓跳台', storable: true, hasDefault: true, building: true },
  { id: 'tree1', kind: 'tree', name: '樹', storable: true, hasDefault: true },
  { id: 'tree2', kind: 'tree', name: '樹', storable: true, hasDefault: true },
  { id: 'bush', kind: 'bush', name: '灌木', storable: true, hasDefault: true },
  { id: 'mushroom', kind: 'mushroom', name: '蘑菇', storable: true, hasDefault: true },
  { id: 'rocks', kind: 'rocks', name: '石頭', storable: true, hasDefault: true },
  { id: 'flowers', kind: 'flowers', name: '小花叢', storable: true, hasDefault: true },
  { id: 'stump', kind: 'stump', name: '樹樁', storable: true, hasDefault: true },
  { id: 'tall_grass', kind: 'tall_grass', name: '高草叢', storable: true, hasDefault: true },
  { id: 'planter', kind: 'planter', name: '花槽', storable: true, hasDefault: false },
  { id: 'coral', kind: 'coral', name: '珊瑚石堆', storable: true, hasDefault: false },
]

const BY_ID: ReadonlyMap<string, LayoutItemDef> = new Map(LAYOUT_ITEMS.map((d) => [d.id, d]))
const KINDS: ReadonlySet<string> = new Set(LAYOUT_ITEMS.map((d) => d.kind))

export const layoutItemDef = (id: unknown): LayoutItemDef | undefined => (typeof id === 'string' ? BY_ID.get(id) : undefined)
export const isLayoutKind = (v: unknown): v is LayoutKind => typeof v === 'string' && KINDS.has(v)

/** 存檔 farmLayout.items 原始陣列最多看這麼多筆（再多的直接略過，避免壞檔吃光時間） */
export const LAYOUT_MAX_ITEMS = 300
