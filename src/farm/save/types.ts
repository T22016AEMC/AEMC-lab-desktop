import type { SpeciesId } from '../config/species'

export const CURRENT_SCHEMA_VERSION = 3

export interface Pet {
  id: string
  species: SpeciesId
  /** 狗的品種／貓的花色與品種 id */
  variant: string
  name: string
  /** 領養時間（毫秒時間戳），滿 3 天算成年（只是數值，不影響外觀） */
  adoptedAt: number
  /** 身高係數，約 0.85～1.15（資訊卡顯示身高用，不影響外觀） */
  heightFactor: number
  /** 體重 0～100（只是數值，不影響外觀） */
  weight: number
  satiety: number
  mood: number
  cleanliness: number
  /** 被叫醒後保持清醒到這個時間（毫秒時間戳），夜晚才有意義 */
  awakeUntil?: number
}

/** 存檔：單一物件，包含 schemaVersion 以便未來升級資料格式 */
export interface SaveData {
  schemaVersion: number
  pets: Pet[]
  points: number
  /** 最後一次結算數值的時間 */
  lastSeen: number
  /** 每日登入獎勵最後領取的本機日期（YYYY-MM-DD） */
  lastDailyClaim: string | null
  /** 今天已經出現幾次禮物 */
  gifts: { date: string; count: number }
  nextPetId: number
  createdAt: number
}

/**
 * 儲存層介面：目前實作是 LocalStorageAdapter，之後會換成綁定帳號的雲端存檔，
 * 所以方法都回傳 Promise。
 */
export interface SaveStorage {
  load(): Promise<SaveData | null>
  save(data: SaveData): Promise<void>
  clear(): Promise<void>
}
