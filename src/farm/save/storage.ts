import { LocalStorageDocument } from '../../lib/documentStorage'
import { isResetSchema, parseSave } from './migrate'
import type { LoadResult, SaveData, SaveStorage } from './types'

const KEY = 'aemc-desktop:farm-save'
/** v3.4.0 重置前，舊存檔的原封不動複本：只寫一次、不讀取、不顯示、不進匯出檔，只是留在瀏覽器裡以防萬一 */
export const PRE_V5_BACKUP_KEY = 'aemc-desktop:farm-pre-v5-backup'

/** 養殖場存檔：存在瀏覽器 localStorage（通用儲存層 LocalStorageDocument 的特化） */
export class LocalStorageAdapter extends LocalStorageDocument<SaveData> implements SaveStorage {
  private readonly backupSlot: LocalStorageDocument<unknown>

  constructor(key: string = KEY, backupKey: string = PRE_V5_BACKUP_KEY) {
    super(key, parseSave)
    this.backupSlot = new LocalStorageDocument<unknown>(backupKey, (r) => r)
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
    if (!isResetSchema(obj)) return { save: parseSave(obj), reset: 'none' }
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
