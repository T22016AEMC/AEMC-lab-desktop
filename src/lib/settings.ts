import { create } from 'zustand'
import { LocalStorageDocument } from './documentStorage'

/**
 * 桌面本身的設定（備份提醒用）。放在獨立的鍵 `aemc-desktop:settings`：
 * 不寫進養殖場存檔，也不放進匯出檔（換瀏覽器匯入備份時，提醒要重新計算才合理）。
 */
export interface Settings {
  /** 上次匯出存檔的時間（毫秒時間戳，遊戲時間來源）；null = 從未匯出 */
  lastExportAt: number | null
  /** 按過「不再提醒」 */
  remindOff: boolean
  /** 上次顯示備份提醒的本地日期（YYYY-MM-DD），每天最多一次 */
  lastRemindDate: string
}

export const DEFAULT_SETTINGS: Settings = { lastExportAt: null, remindOff: false, lastRemindDate: '' }

export function parseSettings(raw: unknown): Settings | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return {
    lastExportAt: typeof r.lastExportAt === 'number' && Number.isFinite(r.lastExportAt) ? r.lastExportAt : null,
    remindOff: r.remindOff === true,
    lastRemindDate: typeof r.lastRemindDate === 'string' ? r.lastRemindDate : '',
  }
}

const storage = new LocalStorageDocument<Settings>('aemc-desktop:settings', parseSettings)

interface SettingsState extends Settings {
  loaded: boolean
  init: () => Promise<void>
  update: (patch: Partial<Settings>) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  init: async () => {
    const s = await storage.load()
    set({ ...(s ?? DEFAULT_SETTINGS), loaded: true })
  },
  update: (patch) => {
    set(patch)
    const { lastExportAt, remindOff, lastRemindDate } = get()
    void storage.save({ lastExportAt, remindOff, lastRemindDate })
  },
}))
