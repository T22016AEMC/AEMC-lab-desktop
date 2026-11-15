import { BALANCE } from '../config/balance'
import type { SaveData } from '../save/types'

/**
 * 找新主人（v3.7.1，純函式，可在 Node 測試）：寵物從存檔移除、返還 BALANCE.rehome.refund 金幣，無法找回。
 *
 * 只動 pets 與 points。其餘欄位一律不動：
 *  - finds（還沒揭曉的土堆、布包）：寶物只記物種（by: 'dog' | 'cat'），沒有綁寵物 id，所以留在地上照常可以點開、到期自動揭曉；
 *  - collection、events、skins、notes、ownedBuildings、earning：與個別寵物無關；
 *  - bowl.used（今天已吃掉的盆數）：不變，食盆上限（寵物數 × 每隻盆數）查詢時即時算，所以會跟著少；
 *  - nextPetId：不變（id 不重複使用，之後領養的新寵物不會拿到舊 id）。
 * 最後 minPets 隻不能找新主人（見 balance.ts 的說明）。
 */

export const REHOME_TEXT = {
  /** 最後一隻：按鈕停用時顯示的原因 */
  keepOne: '至少要留一隻',
  /** 二次確認對話框 */
  warning: '找新主人後，牠就不會回來了，無法找回。',
  notFound: '找不到這隻寵物',
} as const

/** 現在不能幫這隻寵物找新主人的原因；可以 = null */
export function rehomeBlock(save: Pick<SaveData, 'pets'>, petId: string): string | null {
  if (!save.pets.some((p) => p.id === petId)) return REHOME_TEXT.notFound
  if (save.pets.length <= BALANCE.rehome.minPets) return REHOME_TEXT.keepOne
  return null
}

export interface RehomeResult {
  save: SaveData
  /** 實際返還的金幣（失敗 = 0） */
  refund: number
  error?: string
}

/** 執行找新主人：移除寵物、金幣 + refund。不能執行時回傳 error，存檔不變 */
export function rehomePet(save: SaveData, petId: string): RehomeResult {
  const why = rehomeBlock(save, petId)
  if (why) return { save, refund: 0, error: why }
  const refund = BALANCE.rehome.refund
  return { save: { ...save, pets: save.pets.filter((p) => p.id !== petId), points: save.points + refund }, refund }
}
