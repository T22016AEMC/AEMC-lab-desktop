import { THEME_DECOR_KINDS, themeDecorDef, type ThemeDecorKind } from './themeDecor'

/**
 * v3.9.0 農場自由擺放：場景上可以移動的物件表（存檔 farmLayout 的 id／kind 都必須在這張表裡）。
 *  - storable：能不能收進庫存（住家、鐘樓、池塘、公佈欄不能收；沙土路固定、不在表裡）
 *  - hasDefault：有沒有預設位置。沒有預設位置的物件（花槽 planter、珊瑚石堆 coral，以及 640×320 預設版面放不下的灌木 bush、高草叢 tall_grass）沒有記錄時在庫存，
 *    存檔寫成擺放但座標壞掉或缺少時也當作在庫存（不能「回到預設位置」）
 *  - building：要買才有的建築（ownedBuildings 是購買依據；沒買的就算有擺放記錄也不出現）
 * 目前每種物件只有一個（樹兩棵：tree1 = 預設版面左邊那棵、tree2 = 右邊那棵），所以 id 是固定的。
 */
export type BaseLayoutKind =
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

/** 4.0-B2：主題裝飾（48 種，themeDecor.ts）也是可擺放的擺設種類（只能從商店買實例，沒有內建的固定位置） */
export type LayoutKind = BaseLayoutKind | ThemeDecorKind | 'legend_stand'

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
  { id: 'bush', kind: 'bush', name: '灌木', storable: true, hasDefault: false },
  { id: 'mushroom', kind: 'mushroom', name: '蘑菇', storable: true, hasDefault: true },
  { id: 'rocks', kind: 'rocks', name: '石頭', storable: true, hasDefault: true },
  { id: 'flowers', kind: 'flowers', name: '小花叢', storable: true, hasDefault: true },
  { id: 'stump', kind: 'stump', name: '樹樁', storable: true, hasDefault: true },
  { id: 'tall_grass', kind: 'tall_grass', name: '高草叢', storable: true, hasDefault: false },
  { id: 'planter', kind: 'planter', name: '花槽', storable: true, hasDefault: false },
  { id: 'coral', kind: 'coral', name: '珊瑚石堆', storable: true, hasDefault: false },
]

const BY_ID: ReadonlyMap<string, LayoutItemDef> = new Map(LAYOUT_ITEMS.map((d) => [d.id, d]))
const KINDS: ReadonlySet<string> = new Set<string>([...LAYOUT_ITEMS.map((d) => d.kind), ...THEME_DECOR_KINDS, 'legend_stand'])

/**
 * v4.0：可以從商店買來「再多一個」的擺設種類（實例 id「種類#編號」，例如 rocks#3；存檔 shop.decor）。
 * 這張表和商品設定表（config/shop.ts）分開管理：商品可以增減，種類只增不減（已經買的實例永遠認得）；
 * 存檔驗證（migrate.ts 的 cleanShop、cleanFarmLayout）只看這張表，不看商品表。
 * 路燈（有燈光）、樹（樹根有特別處理、很大）、住家等有特殊機制的不在表裡。
 */
export const INSTANCE_KINDS: readonly LayoutKind[] = ['mushroom', 'flowers', 'rocks', 'bush', 'planter', 'coral', 'stump', 'tall_grass', ...THEME_DECOR_KINDS, 'legend_stand']
const INSTANCE_KIND_SET: ReadonlySet<string> = new Set(INSTANCE_KINDS)
export const isInstanceKind = (v: unknown): v is LayoutKind => typeof v === 'string' && INSTANCE_KIND_SET.has(v)

/** 實例編號上限（防壞檔；正常遊戲一輩子也到不了） */
export const INSTANCE_N_MAX = 999999
export const instanceId = (kind: LayoutKind, n: number): string => `${kind}#${n}`
/** 「種類#編號」→ 種類與編號；格式不對、種類不在表裡 → null */
export function parseInstanceId(id: unknown): { kind: LayoutKind; n: number } | null {
  if (typeof id !== 'string') return null
  const m = /^([a-z_]+)#([1-9]\d{0,5})$/.exec(id)
  if (!m || !isInstanceKind(m[1])) return null
  return { kind: m[1], n: Number(m[2]) }
}
export const isInstanceId = (id: unknown): boolean => parseInstanceId(id) !== null

const instanceCache = new Map<string, LayoutItemDef>()
/** 實例的物件定義：名稱沿用同種類內建擺設的名稱、可以收進倉庫、沒有預設位置（沒有擺放紀錄 = 在倉庫） */
function instanceDef(id: string): LayoutItemDef | undefined {
  const hit = instanceCache.get(id)
  if (hit) return hit
  const p = parseInstanceId(id)
  if (!p) return undefined
  const base = LAYOUT_ITEMS.find((d) => d.kind === p.kind)
  const def: LayoutItemDef = { id, kind: p.kind, name: base?.name ?? themeDecorDef(p.kind)?.name ?? (p.kind === 'legend_stand' ? '傳說展示台' : p.kind), storable: true, hasDefault: false }
  if (instanceCache.size < 4096) instanceCache.set(id, def)
  return def
}

/** 物件定義：內建的 18 個固定 id，或商店買來的實例「種類#編號」（實例是否真的擁有看存檔 shop.decor） */
export const layoutItemDef = (id: unknown): LayoutItemDef | undefined => (typeof id === 'string' ? (BY_ID.get(id) ?? instanceDef(id)) : undefined)
export const isLayoutKind = (v: unknown): v is LayoutKind => typeof v === 'string' && KINDS.has(v)

/** 存檔 farmLayout.items 原始陣列最多看這麼多筆（再多的直接略過，避免壞檔吃光時間） */
export const LAYOUT_MAX_ITEMS = 300
