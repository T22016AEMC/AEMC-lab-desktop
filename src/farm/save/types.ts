import type { SpeciesId } from '../config/species'
import type { Note } from '../../tools/notes'
import type { PersonalityId } from '../config/personality'

/**
 * 目前的存檔格式。v5（v3.4.0）起，舊格式（v4 以前）不再升級，第一次載入時一律重置為全新存檔（見 storage.ts 的 loadOrReset）。
 */
export const CURRENT_SCHEMA_VERSION = 5
/**
 * 同一個 schema 內的資料修訂（v3.6.0 起寫進存檔的 dataRev）：舊存檔沒有這個欄位，視為 0。
 * 儲存層寫入前如果發現已存的資料 dataRev（或 schemaVersion）比這份程式認得的新，就不覆寫並提示重新整理（storage.ts）。
 */
export const DATA_REV = 3
// DATA_REV 歷史：1 = v3.6.0（寶物、收藏、事件、外觀）；2 = v3.7.0（公佈欄 notes）；3 = v3.8.0（寵物個性 personality、lastInteract、野餐 picnic）。
// 升到 3 的用意：v3.7.x 的舊分頁讀到 dataRev 3 會停止自動存檔並提示重新整理，不會把個性與野餐紀錄洗掉。
// 升到 2 的用意：v3.6.0～v3.6.3 的舊分頁讀到 dataRev 2 會停止自動存檔並提示重新整理，不會把 notes 洗掉。

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
  /**
   * 個性（v3.8.0）。領養時隨機；舊存檔沒有這個欄位的由 parseSave 用 id 算出固定的一種（personalityFromId）並寫回存檔。
   * 型別上可省略只是為了測試（沒有個性 = 所有倍率 1，數值與 v3.7.1 相同）；存檔讀進來一定有。
   */
  personality?: PersonalityId
  /** 上次互動時間（毫秒時間戳，v3.8.0；黏人個性「久沒互動」用）。舊存檔沒有的由 parseSave 補成存檔的 lastSeen */
  lastInteract?: number
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
  /** 今日挖寶／尋寶揭曉得到的金幣（貓狗共用，上限 BALANCE.dig.dailyCoinMax；歸零規則同上，用揭曉當下的本機日期）。v3.6.0 起；舊存檔沒有 = 0 */
  digCoins: number
}

/**
 * 寶物（v3.6.0）：狗挖出來的土堆（mound）、貓叼回來的布包（bundle），等玩家點開揭曉，10 分鐘沒點自動揭曉。
 * 座標是「草地範圍內的相對位置」（0～1），換視窗大小時重新換算成像素，不會因為版面不同跑到建築裡。
 */
export interface Find {
  id: string
  kind: 'mound' | 'bundle'
  by: 'dog' | 'cat'
  fx: number
  fy: number
  /** 建立時間（毫秒時間戳，遊戲時間來源） */
  at: number
}

/**
 * 外觀（v3.6.0 最小版）：owned = 已擁有的外觀 id（例如 house.gold）、equipped = 各部位目前穿的外觀 id。
 * 之後的外觀商店（金幣購買）只要把 id 加進 owned；換裝介面再改 equipped。
 */
export interface SkinState {
  owned: string[]
  equipped: Record<string, string>
}

/** 食盆水盆今日已用掉的份量（本地日期 00:00 補滿） */
export interface BowlState {
  date: string
  used: number
}

/**
 * 野餐（v3.8.0）的每日次數與冷卻。date = 次數所屬的本機日期（換日就從 0 算）；lastEnd = 上一場結束的時間（冷卻從這裡算，跨日也有效）；
 * active = 進行中的那一場（重新整理或離線回來時一律直接結束，見 sim/picnic.ts 的 settlePicnicOnLoad）。
 */
export interface PicnicActive {
  startedAt: number
  /** 預定結束時間（startedAt + BALANCE.picnic.seconds） */
  until: number
  /** 參加的寵物 id（開始時已經扣清潔、加心情） */
  pets: string[]
  /** 墊子顏色（0 紅、1 藍、2 粉）、籃子（0 闔上、1 打開）、食物（picnic_food 的索引，1～2 樣） */
  mat: number
  basket: number
  foods: number[]
}
export interface PicnicState {
  date: string
  count: number
  lastEnd: number
  active?: PicnicActive
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
  /** 寶物（收藏品）數量：鍵是物品編號，套組的片用「編號-片號」（config/items.ts）。v3.6.0 起；舊存檔沒有 = 空 */
  collection: Record<string, number>
  /** 還沒揭曉的寶物（土堆、貓的布包），最多 BALANCE.dig.holdMax 個 */
  finds: Find[]
  /** 一次性事件旗標：事件 id → 觸發時間（毫秒時間戳）。有這個 id 就不會再觸發 */
  events: Record<string, number>
  /** 外觀 */
  skins: SkinState
  /** 資料修訂（見 DATA_REV）；舊存檔沒有 = 0 */
  dataRev: number
  /**
   * 公佈欄的便利貼（v3.7.0，可缺少：v3.6.x 的存檔沒有這個欄位，讀進來視為空）。最多 8 張、新的在前。
   * 驗證在 tools/notes.ts 的 cleanNotes（壞掉的單張捨棄）。
   */
  notes?: Note[]
  /** 野餐的每日次數與冷卻（v3.8.0，可缺少：沒有 = 今天還沒野餐過、沒有冷卻） */
  picnic?: PicnicState
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
  /** 儲存的資料來自比這份程式更新的版本（schemaVersion 或 dataRev 較大）：不讀取、不覆寫，畫面提示重新整理 */
  newer?: boolean
  reset: 'none' | 'done' | 'failed'
  /** 載入時退還的已移除建築金幣（v3.5.1 起營火 20）；沒有 = 0 或省略。只給畫面層顯示一次性提示，不進存檔 */
  refund?: number
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
