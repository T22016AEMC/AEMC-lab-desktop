import type { SpeciesId } from '../config/species'

/**
 * 目前的存檔格式。v5（v3.4.0）起，舊格式（v4 以前）不再升級，第一次載入時一律重置為全新存檔（見 storage.ts 的 loadOrReset）。
 */
export const CURRENT_SCHEMA_VERSION = 5

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

/**
 * 賺金幣的記錄（v4 起）。純前端、存在瀏覽器，無法防作弊（之後帳號與雲端階段再處理）。
 * 時間一律來自遊戲時間來源（overrides.gameNow），不是 Date.now()。
 */
export interface EarningState {
  /** 今日進度所屬的本地日期（YYYY-MM-DD）；日期變了就把今日金幣歸零 */
  date: string
  /** 今日從啟動台程式賺到的金幣（上限 BALANCE.earn.program.dailyMax） */
  programCoins: number
  /** 今日玩遊戲賺到的金幣（上限 BALANCE.earn.game.dailyMax） */
  gameCoins: number
  /** 各程式上次給金幣的時間（毫秒時間戳，程式 id → 時間）；冷卻跨日也有效 */
  lastAward: Record<string, number>
}

/** 食盆水盆今日已用掉的份量（本地日期 00:00 補滿） */
export interface BowlState {
  date: string
  used: number
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
  /** 已購買的建築 id（v4 起）；視窗太小放不下的建築紀錄仍保留，畫面上隱藏 */
  ownedBuildings: string[]
  earning: EarningState
  bowl: BowlState
  /** 重置後第一次畫面要顯示的一次性提示（按「確定」後清掉）；全新玩家沒有這個欄位 */
  resetNotice?: true
}

/**
 * 儲存層介面：目前實作是 LocalStorageAdapter，之後會換成綁定帳號的雲端存檔，
 * 所以方法都回傳 Promise。
 */
/** loadOrReset 的結果：reset = 'done' 剛把舊存檔換成全新存檔；'failed' 寫入新存檔失敗（舊存檔原封不動，下次載入重試） */
export interface LoadResult {
  save: SaveData | null
  reset: 'none' | 'done' | 'failed'
}

export interface SaveStorage {
  load(): Promise<SaveData | null>
  /**
   * 啟動時讀存檔。schema 4 或更舊的存檔：先把原始內容備份到獨立的鍵（只寫一次，失敗不阻擋），
   * 再換成 makeFresh() 做的全新存檔；寫入新存檔失敗就不改動舊存檔。
   */
  loadOrReset(makeFresh: () => SaveData): Promise<LoadResult>
  save(data: SaveData): Promise<void>
  clear(): Promise<void>
  /** 匯入存檔用（見 DocumentStorage）：失敗丟例外、可還原 */
  saveStrict(data: SaveData): Promise<void>
  snapshot(): Promise<string | null>
  restore(snapshot: string | null): Promise<void>
}
