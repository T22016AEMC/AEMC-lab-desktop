import { BALANCE, PET_CAPACITY } from './balance'
import { buildingDef, type BuildingId } from './buildings'
import { layoutItemDef, type LayoutKind } from './layoutItems'
import { SPECIES } from './species'

/**
 * 商店（v4.0 階段 A）的商品設定表。商店程式只看這張表：之後的階段（建築外殼、主題裝飾、配件、環境主題）只要加資料，不必改商店程式。
 *
 *  - category：商店的分類分頁（寵物／裝飾品／建築／農場）。農場分頁目前只顯示「即將開放」，沒有商品。
 *  - group：同一個分類裡的小標題（例如裝飾品分頁的「環境主題」「擺設」），依第一次出現的順序排。
 *  - repeatable：可不可以重複購買；maxOwned：每種最多擁有幾個（建築、外觀 = 1）。
 *  - requires：前置條件（例如狗窩外殼要先有狗窩）。全部成立才能買。
 *  - size：裝飾品的尺寸級別（價格依 SIZE_PRICE）。
 *  - grant：買了得到什麼。pet = 走領養流程（名字、品種）；building = 存檔 ownedBuildings；
 *    decor = 一個新的擺設實例（存檔 shop.decor，id「種類#編號」，買了放進倉庫）；skin = 外觀（存檔 skins.owned，買了穿到 slot）。
 *  - temp：階段 A 的暫時商品（B2 換成主題裝飾時移除；已經買的實例種類永遠認得，見 layoutItems.ts 的 INSTANCE_KINDS）。
 *
 * 可複製的擺設種類（INSTANCE_KINDS）和這張表分開管理：商品可以增減，種類只增不減；存檔驗證只看種類表。
 * 不做賣回或退款。
 */
export type ShopCategory = 'pet' | 'decor' | 'building' | 'farm'
export type SizeClass = 'S' | 'M' | 'L'

export type ShopGrant =
  | { type: 'pet' }
  | { type: 'building'; building: BuildingId }
  | { type: 'decor'; kind: LayoutKind }
  | { type: 'skin'; skin: string; slot: string }

export interface ShopRequirement {
  /** 要先擁有這個建築 */
  building?: BuildingId
  /** 要先擁有這個商品（至少 1 個） */
  item?: string
}

export interface ShopItem {
  id: string
  name: string
  category: ShopCategory
  group?: string
  price: number
  repeatable: boolean
  maxOwned: number
  requires?: readonly ShopRequirement[]
  size?: SizeClass
  /** 商品卡的圖（圖集素材鍵名）；沒有 = 不顯示圖 */
  sprite?: string
  blurb?: string
  grant: ShopGrant
  temp?: true
}

export const SHOP_CATEGORIES: readonly ShopCategory[] = ['pet', 'decor', 'building', 'farm']
export const SHOP_CATEGORY_LABEL: Record<ShopCategory, string> = { pet: '寵物', decor: '裝飾品', building: '建築', farm: '農場' }
/** 還沒開放的分類（分頁灰色、不可點，顯示「即將開放」） */
export const SHOP_COMING_SOON: readonly ShopCategory[] = ['farm']

/** 裝飾品依尺寸的價格 */
export const SIZE_PRICE: Readonly<Record<SizeClass, number>> = { S: 3, M: 6, L: 10 }
export const SIZE_LABEL: Readonly<Record<SizeClass, string>> = { S: '小', M: '中', L: '大' }

export const SHOP_LIMITS = {
  /** 每種裝飾最多買幾個（只算購買的，原本免費的內建擺設不算） */
  decorPerKind: 10,
  /** 購買的裝飾合計最多幾個 */
  decorTotal: 60,
  /** 環境主題（地板＋小路＋遠景）的預設價格 */
  envThemePrice: 30,
} as const

/**
 * 環境主題（地板＋小路＋遠景）用外觀機制：部位 slot = 'env'，同一時間只有一個生效（skins.equipped.env）。
 * 預設主題是現有的草地：免費、永遠擁有、不寫進存檔（equipped 沒有 env = 草地）。階段 A 沒有任何主題內容。
 */
export const ENV_SLOT = 'env'
export const ENV_DEFAULT = 'env.grass'

const decor = (kind: LayoutKind, size: SizeClass): ShopItem => ({
  id: 'decor.' + kind,
  name: layoutItemDef(kind)?.name ?? kind,
  category: 'decor',
  group: '擺設',
  price: SIZE_PRICE[size],
  repeatable: true,
  maxOwned: SHOP_LIMITS.decorPerKind,
  size,
  sprite: kind,
  blurb: '買了會先放進倉庫，到編輯農場擺放',
  grant: { type: 'decor', kind },
  temp: true,
})

const building = (id: BuildingId): ShopItem => {
  const d = buildingDef(id)
  return {
    id: 'building.' + id,
    name: d?.name ?? id,
    category: 'building',
    price: d?.price ?? BALANCE.buildings.price[id as 'kennel' | 'bowls' | 'catTree'],
    repeatable: false,
    maxOwned: 1,
    sprite: d?.sprite,
    blurb: d?.blurb,
    grant: { type: 'building', building: id },
  }
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: 'pet.adopt',
    name: '領養寵物',
    category: 'pet',
    price: SPECIES.dog.cost,
    repeatable: true,
    maxOwned: PET_CAPACITY,
    grant: { type: 'pet' },
  },
  // 裝飾品（TEMP：階段 A 的暫時商品，B2 換成六主題裝飾）。尺寸依素材外框面積：小 < 1500、中 1500～2500、大 > 2500
  decor('mushroom', 'S'),
  decor('flowers', 'S'),
  decor('rocks', 'M'),
  decor('bush', 'M'),
  decor('planter', 'L'),
  decor('coral', 'L'),
  building('bowls'),
  building('kennel'),
  building('catTree'),
]

export function shopItem(id: string, catalog: readonly ShopItem[] = SHOP_ITEMS): ShopItem | undefined {
  return catalog.find((it) => it.id === id)
}

export function itemsOf(category: ShopCategory, catalog: readonly ShopItem[] = SHOP_ITEMS): ShopItem[] {
  return catalog.filter((it) => it.category === category)
}

/** 建築 id → 商品（建築模式以外的地方要用到價格時） */
export const buildingItemId = (id: BuildingId): string => 'building.' + id
