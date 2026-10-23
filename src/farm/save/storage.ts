import { LocalStorageDocument } from '../../lib/documentStorage'
import { migrate } from './migrate'
import type { SaveData, SaveStorage } from './types'

const KEY = 'aemc-desktop:farm-save'

/** 養殖場存檔：存在瀏覽器 localStorage（通用儲存層 LocalStorageDocument 的特化） */
export class LocalStorageAdapter extends LocalStorageDocument<SaveData> implements SaveStorage {
  constructor(key: string = KEY) {
    super(key, migrate)
  }
}
