import { PET_CAPACITY } from '../config/balance'
import { buildingDef, isPurchasable } from '../config/buildings'
import { instanceId, layoutItemDef } from '../config/layoutItems'
import { ENV_DEFAULT, ENV_SLOT, SHOP_COMING_SOON, SHOP_ITEMS, SHOP_LIMITS, shopItem, type ShopItem } from '../config/shop'
import { withoutRecord } from '../pixel/placement'
import type { SaveData } from '../save/types'

/**
 * 商店的購買規則（純函式，v4.0 階段 A）。購買 = 一次產生新的存檔物件：扣金幣與得到的東西在同一份存檔裡，
 * 寫入時一次寫完（存檔是單一 JSON），不會有「扣了錢沒有東西」的半套狀態。金幣不足、超過上限、前置條件不符 → 存檔不變。
 * 寵物不在這裡買（要選品種、取名字，走 sim/rules.ts 的 adopt）；這裡只用來顯示寵物分頁的狀態。
 */

export const SHOP_TEXT = {
  notOpen: '這個商品還沒開放',
  noSave: '尚未開始',
  otherTab: '另一個分頁接手了存檔，這次購買沒有完成',
  newer: '存檔來自更新的版本，請重新整理網頁',
  petViaAdopt: '寵物請在寵物分頁領養',
  owned: '已擁有',
  comingSoon: '即將開放',
  notEnough: (price: number, points: number): string => `金幣不足（需要 ${price} 金幣，目前 ${points} 金幣）`,
  already: (name: string): string => `已經擁有${name}了`,
  perKind: (n: number): string => `這種裝飾最多 ${n} 個`,
  total: (n: number): string => `裝飾品已達上限（全部最多 ${n} 個）`,
  needs: (name: string): string => `需要先擁有${name}`,
  petsFull: `寵物已滿（貓狗合計最多 ${PET_CAPACITY} 隻），可以先幫一隻寵物找新主人`,
  /** 購買成功的提示 */
  boughtDecor: (name: string): string => `已購買${name}，已放進倉庫，到編輯農場擺放`,
  boughtBuilding: (name: string, price: number): string => `購買了${name}（−${price} 金幣）`,
  boughtSkin: (name: string): string => `已購買${name}`,
} as const

/** 買下但預設位置被佔住、放進倉庫時的提示（v3.9.0 的文字，v4.0 起顯示在商店） */
export const BOUGHT_TO_INVENTORY = (name: string): string => `${name}的預設位置被其他擺設佔住，已放進倉庫。請到編輯農場，從倉庫拿出來擺`

/** 購買的裝飾實例合計幾個 */
export const decorTotal = (save: SaveData): number => save.shop?.decor.length ?? 0

/** 某種裝飾買了幾個（只算購買的實例；原本免費的內建擺設不算） */
export const decorOfKind = (save: SaveData, kind: string): number => (save.shop?.decor ?? []).filter((d) => d.kind === kind).length

/** 外觀目前穿的（slot = 部位；環境主題沒有穿 = 預設草地） */
export function equippedSkin(save: SaveData, slot: string): string | undefined {
  const v = save.skins.equipped[slot]
  if (v) return v
  return slot === ENV_SLOT ? ENV_DEFAULT : undefined
}

/** 這個商品已經擁有幾個 */
export function ownedCount(save: SaveData, item: ShopItem): number {
  const g = item.grant
  switch (g.type) {
    case 'pet':
      return save.pets.length
    case 'building':
      return save.ownedBuildings.includes(g.building) ? 1 : 0
    case 'decor':
      return decorOfKind(save, g.kind)
    case 'skin':
      return g.skin === ENV_DEFAULT || save.skins.owned.includes(g.skin) ? 1 : 0
  }
}

/** 不能買的原因（金幣以外）；null = 可以買（還要看金幣） */
export function blockReason(save: SaveData, item: ShopItem, catalog: readonly ShopItem[] = SHOP_ITEMS): string | null {
  if (SHOP_COMING_SOON.includes(item.category)) return SHOP_TEXT.notOpen
  const g = item.grant
  if (g.type === 'pet') return save.pets.length >= PET_CAPACITY ? SHOP_TEXT.petsFull : null
  if (g.type === 'building' && !isPurchasable(g.building)) return SHOP_TEXT.notOpen
  const have = ownedCount(save, item)
  if (!item.repeatable && have >= 1) return SHOP_TEXT.already(item.name)
  if (g.type === 'decor') {
    if (have >= item.maxOwned) return SHOP_TEXT.perKind(item.maxOwned)
    if (decorTotal(save) >= SHOP_LIMITS.decorTotal) return SHOP_TEXT.total(SHOP_LIMITS.decorTotal)
  } else if (have >= item.maxOwned) return SHOP_TEXT.already(item.name)
  for (const r of item.requires ?? []) {
    if (r.building && !save.ownedBuildings.includes(r.building)) return SHOP_TEXT.needs(buildingDef(r.building)?.name ?? r.building)
    if (r.item) {
      const need = shopItem(r.item, catalog)
      if (!need || ownedCount(save, need) < 1) return SHOP_TEXT.needs(need?.name ?? r.item)
    }
  }
  return null
}

/** 商品卡的狀態：能不能買、不能買的原因（含金幣不足） */
export function itemStatus(save: SaveData, item: ShopItem, catalog: readonly ShopItem[] = SHOP_ITEMS): { canBuy: boolean; reason: string | null; owned: number } {
  const owned = ownedCount(save, item)
  const block = blockReason(save, item, catalog)
  if (block) return { canBuy: false, reason: block, owned }
  if (save.points < item.price) return { canBuy: false, reason: SHOP_TEXT.notEnough(item.price, save.points), owned }
  return { canBuy: true, reason: null, owned }
}

export interface PurchaseOptions {
  catalog?: readonly ShopItem[]
  /** 建築：預設位置被佔住，買下後直接放進倉庫 */
  storeIt?: boolean
}

export type PurchaseResult = { ok: true; save: SaveData; item: ShopItem; instanceId?: string } | { ok: false; save: SaveData; error: string }

/**
 * 購買：條件都成立才產生新的存檔（扣金幣＋得到東西＋編號遞增，一次完成）；否則原樣回傳存檔與原因。
 *  - decor：新的實例「種類#編號」加進 shop.decor（沒有擺放紀錄 = 在倉庫）
 *  - building：加進 ownedBuildings；存檔裡這棟建築以前殘留的擺放紀錄一律忽略（v3.9.0 的規則）；storeIt = 寫一筆 stored
 *  - skin：加進 skins.owned 並穿到 slot（環境主題同一時間只有一個生效）
 */
export function purchase(save: SaveData, itemId: string, opts: PurchaseOptions = {}): PurchaseResult {
  const catalog = opts.catalog ?? SHOP_ITEMS
  const item = shopItem(itemId, catalog)
  if (!item) return { ok: false, save, error: SHOP_TEXT.notOpen }
  if (item.grant.type === 'pet') return { ok: false, save, error: SHOP_TEXT.petViaAdopt }
  const st = itemStatus(save, item, catalog)
  if (!st.canBuy) return { ok: false, save, error: st.reason ?? SHOP_TEXT.notOpen }
  const g = item.grant
  let next: SaveData = { ...save, points: save.points - item.price }
  let id: string | undefined
  if (g.type === 'decor') {
    const shop = save.shop ?? { decor: [], nextDecorId: 1 }
    id = instanceId(g.kind, shop.nextDecorId)
    next.shop = { decor: [...shop.decor, { id, kind: g.kind }], nextDecorId: shop.nextDecorId + 1 }
  } else if (g.type === 'building') {
    next.ownedBuildings = [...save.ownedBuildings, g.building]
    const kept = withoutRecord(next.farmLayout, g.building)
    if (kept) next.farmLayout = kept
    else delete next.farmLayout
    if (opts.storeIt) {
      const def = layoutItemDef(g.building)
      if (def) next = { ...next, farmLayout: { items: [...(next.farmLayout?.items ?? []), { id: g.building, kind: def.kind, state: 'stored' }] } }
    }
  } else if (g.type === 'skin') {
    next.skins = {
      owned: save.skins.owned.includes(g.skin) ? save.skins.owned : [...save.skins.owned, g.skin],
      equipped: { ...save.skins.equipped, [g.slot]: g.skin },
    }
  }
  return { ok: true, save: next, item, ...(id ? { instanceId: id } : {}) }
}

/**
 * 切換外觀（環境主題等）：skinId = null 或預設主題 → 換回預設（從 equipped 拿掉）；沒擁有的不能穿（存檔不變）。
 */
export function equipSkin(save: SaveData, slot: string, skinId: string | null): SaveData {
  const equipped = { ...save.skins.equipped }
  if (skinId === null || (slot === ENV_SLOT && skinId === ENV_DEFAULT)) {
    if (!(slot in equipped)) return save
    delete equipped[slot]
  } else {
    if (!save.skins.owned.includes(skinId) || equipped[slot] === skinId) return save
    equipped[slot] = skinId
  }
  return { ...save, skins: { owned: save.skins.owned, equipped } }
}
