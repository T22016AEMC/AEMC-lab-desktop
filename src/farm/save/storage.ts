import { LocalStorageDocument } from '../../lib/documentStorage'
import { isNewerData, isResetSchema, legacyRefundOf, needsPersonalityFill, parseSave } from './migrate'
import type { LoadResult, SaveData, SaveStorage } from './types'

const KEY = 'aemc-desktop:farm-save'
/** v3.4.0 重置前，舊存檔的原封不動複本：只寫一次、不讀取、不顯示、不進匯出檔，只是留在瀏覽器裡以防萬一 */
export const PRE_V5_BACKUP_KEY = 'aemc-desktop:farm-pre-v5-backup'

type NewerHandler = () => void
let newerHandler: NewerHandler | null = null
/** 註冊「儲存的資料來自更新版本」的處理函式（畫面層：停止自動存檔、提示重新整理） */
export function setNewerDataHandler(h: NewerHandler | null): void {
  newerHandler = h
}

/** 養殖場存檔：存在瀏覽器 localStorage（通用儲存層 LocalStorageDocument 的特化） */
export class LocalStorageAdapter extends LocalStorageDocument<SaveData> implements SaveStorage {
  private readonly backupSlot: LocalStorageDocument<unknown>

  constructor(key: string = KEY, backupKey: string = PRE_V5_BACKUP_KEY) {
    super(key, parseSave)
    this.backupSlot = new LocalStorageDocument<unknown>(backupKey, (r) => r)
  }

  /**
   * 自動存檔：寫入前先看已存的資料。如果它來自比這份程式更新的版本（例如另一個分頁已經是新版），就不覆寫（否則新版的欄位會被洗掉），
   * 改成通知畫面層提示重新整理。匯入（saveStrict）不經過這裡。
   */
  async save(data: SaveData): Promise<void> {
    try {
      const raw = await this.snapshot()
      if (raw && isNewerData(JSON.parse(raw))) {
        newerHandler?.()
        return
      }
    } catch {
      /* 讀不到或壞掉的資料照一般流程寫入 */
    }
    await super.save(data)
  }

  async loadOrReset(makeFresh: () => SaveData): Promise<LoadResult> {
    const raw = await this.snapshot()
    if (raw === null) return { save: null, reset: 'none' }
    let obj: unknown
    try {
      obj = JSON.parse(raw)
    } catch {
      return { save: null, reset: 'none' }
    }
    // 更新版本寫的存檔：不讀、不重置、不覆寫（舊版程式只會看到「沒有存檔」並讓使用者重新領養，那會蓋掉它）
    if (isNewerData(obj)) return { save: null, reset: 'none', newer: true }
    if (!isResetSchema(obj)) {
      const save = parseSave(obj)
      const refund = legacyRefundOf(obj)
      // v3.8.0：有寵物缺個性欄位（v3.7.1 以前的存檔）→ 補上的固定個性也立刻寫回（同一個 id 算出來永遠一樣，所以寫入失敗、下次重算也是同一種）
      const fill = needsPersonalityFill(obj)
      if (!save || (refund <= 0 && !fill)) return { save, reset: 'none' }
      // 有已移除的建築：退款後的存檔立刻寫回（營火從儲存裡消失，下次載入不會再退）。寫入失敗也照用，下次載入會從同一份原始資料重算（還是退一次）
      try {
        await this.saveStrict(save)
      } catch {
        /* 忽略 */
      }
      return refund > 0 ? { save, reset: 'none', refund } : { save, reset: 'none' }
    }
    // 舊格式：先備份（已經有備份就不覆蓋；寫入失敗也不阻擋重置），再換成全新存檔
    if ((await this.backupSlot.snapshot()) === null) await this.backupSlot.restore(raw)
    const fresh = makeFresh()
    try {
      await this.saveStrict(fresh)
    } catch {
      return { save: null, reset: 'failed' } // 舊存檔沒有被改動，下次載入再試
    }
    return { save: fresh, reset: 'done' }
  }
}
