import type { SaveData } from '../save/types'
import { EVENTS } from './events'

/**
 * 4.0-C 傳說展示台（擺設種類 legend_stand，不賣）：任一對傳說（狗：保險箱鑰匙＋保險箱；貓：亞特蘭提斯雷射＋山銅）集齊就送一個，放進倉庫，只送一次
 * （事件 `legendStand` 的旗標 = 送出的時間；載入時補送已集齊的舊存檔，旗標保證只送一次）。台面放「最先集齊的那一對」的兩件傳說道具；
 * 兩對都集齊時，點展示台切換顯示（切換的選擇存在 events.legendStandView：1 = 顯示後集齊的那一對，沒有 = 先集齊的）。
 * 展示台不佔 decorTotal（購買上限）：sim/shop.ts 的 decorTotal／decorOfKind 不算它；但它是一般的擺設，會佔場景擺放空間。
 */
export const LEGEND_STAND_KIND = 'legend_stand'
export const LEGEND_STAND_EVENT = 'legendStand'
export const LEGEND_STAND_VIEW_FLAG = 'legendStandView'
export type LegendPair = 'dog' | 'cat'
/** 各對傳說的兩件道具（收藏冊圖示素材鍵名，圖集 items） */
export const PAIR_ITEMS: Readonly<Record<LegendPair, readonly [string, string]>> = { dog: ['item_L001', 'item_L002'], cat: ['item_L003', 'item_L004'] }
export const PAIR_EVENT: Readonly<Record<LegendPair, 'dogVault' | 'catAtlantis'>> = { dog: 'dogVault', cat: 'catAtlantis' }
export const PAIR_NAME: Readonly<Record<LegendPair, string>> = { dog: '保險箱鑰匙與保險箱', cat: '亞特蘭提斯雷射與山銅' }

/** 這對傳說集齊了嗎（看收藏，不看事件旗標） */
export const pairDone = (save: Pick<SaveData, 'collection'>, pair: LegendPair): boolean => EVENTS.find((e) => e.id === PAIR_EVENT[pair])?.met(save.collection) ?? false

export interface LegendStandView {
  /** 台面現在顯示哪一對；一對都沒集齊 = null */
  pair: LegendPair | null
  /** 兩對都集齊了（點展示台可以切換） */
  canToggle: boolean
}

/** 展示台現在的顯示狀態（純函式）：先集齊的那一對（依事件旗標的時間，沒有就狗先）；兩對都集齊且 legendStandView = 1 → 顯示另一對 */
export function legendStandView(save: Pick<SaveData, 'collection' | 'events'>): LegendStandView {
  const dog = pairDone(save, 'dog'), cat = pairDone(save, 'cat')
  if (!dog && !cat) return { pair: null, canToggle: false }
  if (dog !== cat) return { pair: dog ? 'dog' : 'cat', canToggle: false }
  const td = save.events.dogVault, tc = save.events.catAtlantis
  const first: LegendPair = tc !== undefined && (td === undefined || tc < td) ? 'cat' : 'dog'
  const alt = save.events[LEGEND_STAND_VIEW_FLAG] === 1
  return { pair: alt ? (first === 'dog' ? 'cat' : 'dog') : first, canToggle: true }
}
