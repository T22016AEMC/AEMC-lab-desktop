/**
 * 通用的「單一文件」儲存層介面：存檔、桌面程式清單等都用它。
 * 目前實作是 LocalStorageDocument（瀏覽器 localStorage），之後會換成綁定帳號的雲端儲存，
 * 所以方法都回傳 Promise；呼叫端不可以直接碰 localStorage。
 */
export interface DocumentStorage<T> {
  load(): Promise<T | null>
  save(data: T): Promise<void>
  clear(): Promise<void>
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
      // 無痕模式或空間已滿，忽略
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
