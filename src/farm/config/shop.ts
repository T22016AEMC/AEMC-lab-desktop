import { BALANCE, PET_CAPACITY } from './balance'
import { buildingDef, type BuildingId } from './buildings'
import { layoutItemDef, type LayoutKind } from './layoutItems'
import { SPECIES } from './species'
import { SKINS, SKIN_PART_GROUP, THEME_NAME, type SkinDef, type SkinPart } from './skins'
import { ENV_THEME_IDS, envSkinId, envThumb } from './envThemes'
import { DECOR_GROUP_OTHER, THEME_DECOR, type DecorSize, type ThemeDecorDef } from './themeDecor'

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
export type SizeClass = DecorSize

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
  /** 階段 A 的暫時商品（B2 已移除；欄位保留給舊測試與已經買的實例） */
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
  /** 4.0-B1：房子、鐘樓、池塘、公佈欄外裝的價格（小建築外殼＝該建築的本體價） */
  skinPrice: 30,
} as const

/**
 * 環境主題（地板＋小路＋遠景）用外觀機制：部位 slot = 'env'，同一時間只有一個生效（skins.equipped.env）。
 * 預設主題是現有的草地：免費、永遠擁有、不寫進存檔（equipped 沒有 env = 草地）。階段 A 沒有任何主題內容。
 */
export const ENV_SLOT = 'env'
export const ENV_DEFAULT = 'env.grass'
/** 環境主題放在商店的分類與小標題（裝飾品分頁的「環境主題」，排在「擺設」之前） */
export const ENV_CATEGORY: ShopCategory = 'decor'
export const ENV_GROUP = '環境主題'

/**
 * 環境主題商品（之後的階段加資料用）：買一次（maxOwned 1、不可重複），買了穿到 env（同一時間只有一個生效），之後可以切換（farmStore.equipSkin）。
 * 階段 A 沒有任何主題內容，SHOP_ITEMS 裡沒有環境主題商品（只在測試資料裡驗證）。
 */
export const envTheme = (id: string, name: string, sprite?: string, price: number = SHOP_LIMITS.envThemePrice): ShopItem => ({
  id,
  name,
  category: ENV_CATEGORY,
  group: ENV_GROUP,
  price,
  repeatable: false,
  maxOwned: 1,
  ...(sprite ? { sprite } : {}),
  blurb: '地板、小路與遠景一起換；買了之後可以切換',
  grant: { type: 'skin', skin: id, slot: ENV_SLOT },
})

/** 4.0-B2：主題裝飾商品（小標題 = 主題名稱＋「裝飾」、其他擺設；價格依尺寸級別） */
const decor = (d: ThemeDecorDef): ShopItem => ({
  id: 'decor.' + d.kind,
  name: d.name,
  category: 'decor',
  group: d.theme === 'extra' ? DECOR_GROUP_OTHER : THEME_NAME[d.theme] + '裝飾',
  price: SIZE_PRICE[d.size],
  repeatable: true,
  maxOwned: SHOP_LIMITS.decorPerKind,
  size: d.size,
  sprite: d.kind,
  blurb: '買了會先放進倉庫，到編輯農場擺放',
  grant: { type: 'decor', kind: d.kind },
})

/** 階段 A 的暫時裝飾商品的工廠（B2 起商店不賣了；測試用：商店流程不依賴商品表內容） */
const legacyDecor = (kind: LayoutKind, size: SizeClass): ShopItem => ({
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

/** 小建築外殼：要先有本體，價格＝本體價 */
const SKIN_BUILDING: Partial<Record<SkinPart, 'kennel' | 'bowls' | 'catTree'>> = { kennel: 'kennel', catTree: 'catTree', bowls: 'bowls' }
/** 外觀商品的 id（skin.<外觀 id>） */
export const skinItemId = (skinId: string): string => 'skin.' + skinId
function skinItem(d: SkinDef): ShopItem {
  const b = SKIN_BUILDING[d.part]
  return {
    id: skinItemId(d.id),
    name: d.name,
    category: 'building',
    group: SKIN_PART_GROUP[d.part],
    price: b ? BALANCE.buildings.price[b] : SHOP_LIMITS.skinPrice,
    repeatable: false,
    maxOwned: 1,
    ...(b ? { requires: [{ building: b }] } : {}),
    sprite: d.frames.closed,
    blurb: '買了立刻換上；之後可以換回原樣',
    grant: { type: 'skin', skin: d.id, slot: d.part },
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
  // 4.0-B2 環境主題（裝飾品分頁最上面的「環境主題」，地板＋小路＋遠景＋路燈＋樹一起買）：預設草地不在商品表裡（免費、永遠擁有）
  ...ENV_THEME_IDS.map((t) => envTheme(envSkinId(t), THEME_NAME[t] + '環境', envThumb(t))),
  // 4.0-B2 主題裝飾 48 種（六個主題各 6 種、其他擺設 12 種）。價格依尺寸級別：小 3／中 6／大 10（外框面積 小 < 1500、中 1500～2500、大 > 2500）
  ...THEME_DECOR.map(decor),
  building('bowls'),
  building('kennel'),
  building('catTree'),
  // 4.0-B1：外觀（建築分類，依部位分組）。傳說獎勵（亞特蘭提斯房屋、鐘樓）不在商店賣
  ...SKINS.filter((d) => !d.legend).map((d) => skinItem(d)),
]

/** 階段 A 的暫時商品（B2 起不賣；只供測試驗證「已經買的實例種類永遠認得」） */
export const LEGACY_TEMP_ITEMS: readonly ShopItem[] = [legacyDecor('mushroom', 'S'), legacyDecor('flowers', 'S'), legacyDecor('rocks', 'M'), legacyDecor('bush', 'M'), legacyDecor('planter', 'L'), legacyDecor('coral', 'L')]

export function shopItem(id: string, catalog: readonly ShopItem[] = SHOP_ITEMS): ShopItem | undefined {
  return catalog.find((it) => it.id === id)
}

export function itemsOf(category: ShopCategory, catalog: readonly ShopItem[] = SHOP_ITEMS): ShopItem[] {
  return catalog.filter((it) => it.category === category)
}

/** 建築 id → 商品（建築模式以外的地方要用到價格時） */
export const buildingItemId = (id: BuildingId): string => 'building.' + id
