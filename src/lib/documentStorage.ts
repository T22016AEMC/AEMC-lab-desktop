/**
 * 通用的「單一文件」儲存層介面：存檔、桌面程式清單等都用它。
 * 目前實作是 LocalStorageDocument（瀏覽器 localStorage），之後會換成綁定帳號的雲端儲存，
 * 所以方法都回傳 Promise；呼叫端不可以直接碰 localStorage。
 */
export interface DocumentStorage<T> {
  load(): Promise<T | null>
  save(data: T): Promise<void>
  clear(): Promise<void>
  /**
   * 匯入存檔用：寫入失敗時丟出例外（save 會吞掉錯誤並顯示提示）。
   * 搭配 snapshot／restore 可以做到「整批成功或整批不寫」。換成雲端儲存時整組一起實作。
   */
  saveStrict(data: T): Promise<void>
  /** 目前儲存的原始內容（沒有資料 = null），給 restore 還原用 */
  snapshot(): Promise<string | null>
  restore(snapshot: string | null): Promise<void>
}

type ErrorHandler = (message: string) => void
let errorHandler: ErrorHandler | null = null
let lastReport = 0

/** 註冊「儲存失敗」的處理函式（畫面層用來顯示提示）；寫入失敗時，所有儲存層共用 */
export function setStorageErrorHandler(handler: ErrorHandler | null): void {
  errorHandler = handler
}

/** 同一段時間內只通知一次，避免寫入失敗時每次存檔都跳提示 */
function reportFailure(): void {
  const now = Date.now()
  if (now - lastReport < 15_000) return
  lastReport = now
  errorHandler?.('儲存失敗，瀏覽器空間可能已滿')
}

/** 存在 localStorage 的 JSON 文件；所有讀寫都包在 try/catch，失敗就當作沒有資料 */
export class LocalStorageDocument<T> implements DocumentStorage<T> {
  /** parse 負責驗證與版本轉換；回傳 null 代表資料不可用 */
  constructor(
    private readonly key: string,
    private readonly parse: (raw: unknown) => T | null,
  ) {}

  async load(): Promise<T | null> {
    try {
      const raw = localStorage.getItem(this.key)
      if (!raw) return null
      return this.parse(JSON.parse(raw))
    } catch {
      return null
    }
  }

  async save(data: T): Promise<void> {
    try {
      localStorage.setItem(this.key, JSON.stringify(data))
    } catch {
      // 無痕模式、被封鎖或空間已滿：不會讓程式當掉，但要讓使用者知道沒有存到
      reportFailure()
    }
  }

  async saveStrict(data: T): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify(data))
  }

  async snapshot(): Promise<string | null> {
    try {
      return localStorage.getItem(this.key)
    } catch {
      return null
    }
  }

  async restore(snapshot: string | null): Promise<void> {
    try {
      if (snapshot === null) localStorage.removeItem(this.key)
      else localStorage.setItem(this.key, snapshot)
    } catch {
      // 還原也失敗時沒有更多辦法
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(this.key)
    } catch {
      // 忽略
    }
  }
}
