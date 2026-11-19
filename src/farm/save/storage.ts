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

/**
 * 兩個分頁的寫入權（v3.10.0）：獨立的鍵記錄「目前由哪個分頁寫存檔」，不在存檔裡、不進匯出檔。
 * 每個分頁載入時接手（claim），寫入存檔前檢查自己還是不是擁有者（isOwner）；被別的分頁接手就不寫、通知畫面層停止自動存檔並提示。
 * 最後開啟（或重新整理）的分頁繼續運作。這個鍵讀寫失敗（儲存不可用、例外、內容壞掉）時一律當作「可以寫」，退回 v3.9.x 的行為，絕不鎖死玩家。
 */
export const WRITER_KEY = 'aemc-desktop:farm-writer'
type OtherTabHandler = () => void
let otherTabHandler: OtherTabHandler | null = null
/** 註冊「存檔已被另一個分頁接手」的處理函式（畫面層：停止自動存檔、擋住畫面並提示重新整理） */
export function setOtherTabHandler(h: OtherTabHandler | null): void {
  otherTabHandler = h
}

/**
 * 這個頁面（分頁）的 id：只在記憶體，每次載入都不同。不能放 sessionStorage：瀏覽器「複製分頁」會連 sessionStorage 一起複製，兩個分頁就同一個 id。
 * 同一個頁面裡的所有儲存層物件共用這個 id。
 */
function makeTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* 退回下面的做法 */
  }
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}
const PAGE_TAB_ID = makeTabId()

/** 寫入權鍵的內容；壞掉或不是這個格式 = null（當作沒有人接手） */
function parseWriter(raw: string | null): { id: string; at: number } | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (o && typeof o.id === 'string' && o.id) return { id: o.id, at: typeof o.at === 'number' ? o.at : 0 }
  } catch {
    /* 壞掉 */
  }
  return null
}

/** 養殖場存檔：存在瀏覽器 localStorage（通用儲存層 LocalStorageDocument 的特化） */
export class LocalStorageAdapter extends LocalStorageDocument<SaveData> implements SaveStorage {
  private readonly backupSlot: LocalStorageDocument<unknown>
  /** 寫入權鍵讀寫失敗過：這個分頁不再管寫入權（退回 v3.9.x 行為） */
  private writerOff = false
  private takenOver = false

  /** tabId：測試用來模擬不同分頁；正式使用一律是這個頁面的 id */
  constructor(
    key: string = KEY,
    backupKey: string = PRE_V5_BACKUP_KEY,
    private readonly writerKey: string = WRITER_KEY,
    private readonly tabId: string = PAGE_TAB_ID,
  ) {
    super(key, parseSave)
    this.backupSlot = new LocalStorageDocument<unknown>(backupKey, (r) => r)
    // 別的分頁接手時立刻知道（不用等到下一次存檔）。storage 事件只會送到「其他」分頁，自己寫的不會收到
    try {
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('storage', (e: StorageEvent) => {
          if (e.key !== this.writerKey || this.writerOff) return
          const w = parseWriter(e.newValue)
          if (w && w.id !== this.tabId) this.lostWriter()
        })
      }
    } catch {
      /* 收不到事件也沒關係：寫入前還會再檢查 */
    }
  }

  /** 這個分頁接手寫入權（載入時、匯入前）。失敗 = 這個分頁不管寫入權（照舊寫入） */
  async claim(): Promise<void> {
    this.claimNow()
  }

  /** 這個分頁現在還能寫嗎：沒有人接手過、鍵壞掉或讀不到，都算可以（不鎖死） */
  async isOwner(): Promise<boolean> {
    return this.ownerNow()
  }

  // 內部用同步版本：localStorage 本來就是同步的，不多加 await，存檔流程的時序與 v3.9.x 相同
  private claimNow(): void {
    if (this.writerOff) return
    try {
      localStorage.setItem(this.writerKey, JSON.stringify({ id: this.tabId, at: Date.now() }))
      this.takenOver = false
    } catch {
      this.writerOff = true
    }
  }

  private ownerNow(): boolean {
    if (this.writerOff) return true
    try {
      const w = parseWriter(localStorage.getItem(this.writerKey))
      return w === null || w.id === this.tabId
    } catch {
      return true
    }
  }

  private lostWriter(): void {
    if (this.takenOver) return
    this.takenOver = true
    otherTabHandler?.()
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
    // v3.10.0：另一個分頁已經接手 → 不寫（否則兩個分頁互相覆蓋）
    if (!this.ownerNow()) {
      this.lostWriter()
      return
    }
    await super.save(data)
  }

  async loadOrReset(makeFresh: () => SaveData): Promise<LoadResult> {
    // v3.10.0：先接手寫入權再讀，讀到的就是別的分頁停筆前最後寫入的內容。
    // 更新版本寫的存檔不接手（新版分頁繼續運作），下面照舊回傳 newer。
    // 接手與讀取都在第一個 await 之前同步完成（snapshot 的本體是同步讀），時序與 v3.9.x 相同。
    let pre: string | null = null
    try {
      pre = localStorage.getItem(this.key)
    } catch {
      /* 讀不到：照下面的流程 */
    }
    let newerPre = false
    try {
      newerPre = pre !== null && isNewerData(JSON.parse(pre))
    } catch {
      /* 壞掉的存檔照下面的流程 */
    }
    if (!newerPre) this.claimNow()
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
