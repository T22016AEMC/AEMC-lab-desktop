import { migrate } from './migrate'
import type { SaveData, SaveStorage } from './types'

const KEY = 'aemc-desktop:farm-save'

/** 存在瀏覽器 localStorage；所有讀寫都包在 try/catch，失敗就當作沒有存檔 */
export class LocalStorageAdapter implements SaveStorage {
  constructor(private readonly key: string = KEY) {}

  async load(): Promise<SaveData | null> {
    try {
      const raw = localStorage.getItem(this.key)
      if (!raw) return null
      return migrate(JSON.parse(raw))
    } catch {
      return null
    }
  }

  async save(data: SaveData): Promise<void> {
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
