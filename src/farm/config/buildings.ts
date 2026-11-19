import { BALANCE } from './balance'

/**
 * 建築目錄。id 同時是建築空位的專用標記（pixel/layout.ts 的 SLOT_SPECS）與存檔 ownedBuildings 裡的值。
 * 這個檔案不依賴版面，存檔層（migrate）與介面都可以用。
 */
export type BuildingId = 'kennel' | 'bowls' | 'catTree' | 'picnicMat'

/** 建築的 id（存檔驗證用；野餐墊未開放，資料與判斷保留）。舊存檔裡的 campfire（v3.5.1 移除，退款）與 sandbox（v3.6.0 開發期間做過又取消，從來沒有發布）認不得，載入時由 migrate 過濾 */
export const ALL_BUILDING_IDS: readonly BuildingId[] = ['kennel', 'bowls', 'catTree', 'picnicMat']

export function isBuildingId(v: unknown): v is BuildingId {
  return typeof v === 'string' && (ALL_BUILDING_IDS as readonly string[]).includes(v)
}

export interface BuildingDef {
  id: BuildingId
  name: string
  /** 一句功能說明（購買卡片） */
  blurb: string
  price: number
  /** 圖集裡的素材鍵名 */
  sprite: string
}

/** 可購買的建築（v4.0 起在商店的建築分類購買，見 config/shop.ts；野餐墊還沒開放，留給之後的版本） */
export const PURCHASABLE: readonly BuildingId[] = ['kennel', 'bowls', 'catTree']

const DEFS: Partial<Record<BuildingId, BuildingDef>> = {
  kennel: {
    id: 'kennel',
    name: '狗窩',
    blurb: '夜晚狗狗會睡在窩裡和窩門口（最多 2 隻），睡得更好；下雨時也會來躲雨',
    price: BALANCE.buildings.price.kennel,
    sprite: 'doghouse',
  },
  bowls: {
    id: 'bowls',
    name: '食盆水盆',
    blurb: `肚子餓的寵物會自己來吃，每隻寵物每天 ${BALANCE.buildings.bowls.portionsPerPet} 份，隔天補滿`,
    price: BALANCE.buildings.price.bowls,
    sprite: 'bowls',
  },
  catTree: {
    id: 'catTree',
    name: '貓跳台',
    blurb: '夜晚貓咪會睡在跳台的兩層平台上（最多 2 隻），睡得更好；下雨時也會躲在旁邊',
    price: BALANCE.buildings.price.catTree,
    sprite: 'cat_tree',
  },
}

export function buildingDef(id: string): BuildingDef | undefined {
  return DEFS[id as BuildingId]
}

export function isPurchasable(id: string): id is BuildingId {
  return (PURCHASABLE as readonly string[]).includes(id)
}
