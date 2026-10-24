import { create } from 'zustand'
import { DEFAULT_APPS } from '../config/apps'
import { LocalStorageDocument, type DocumentStorage } from '../lib/documentStorage'
import type { ExternalApp } from '../types'

/** 使用者自己的程式清單（存在瀏覽器；之後會搬到帳號雲端，所以是含 schemaVersion 的單一文件） */
export interface AppListData {
  schemaVersion: 1
  apps: ExternalApp[]
}

export const APP_LIST_SCHEMA_VERSION = 1

const KEY = 'aemc-desktop:app-list'

function cleanApp(raw: unknown): ExternalApp | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || !r.name.trim()) return null
  if (typeof r.url !== 'string' || !/^https?:\/\//i.test(r.url)) return null
  return { id: r.id, name: r.name.slice(0, 40), url: r.url, icon: typeof r.icon === 'string' ? r.icon : '' }
}

/** 驗證並轉換儲存的資料；不認得的版本或壞掉的資料回傳 null（呼叫端改用預設清單） */
export function parseAppList(raw: unknown): AppListData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.schemaVersion !== APP_LIST_SCHEMA_VERSION || !Array.isArray(r.apps)) return null
  const seen = new Set<string>()
  const apps: ExternalApp[] = []
  for (const a of r.apps) {
    const app = cleanApp(a)
    if (app && !seen.has(app.id)) {
      seen.add(app.id)
      apps.push(app)
    }
  }
  // 舊版存檔裡的 hiddenBuiltins（隱藏內建遊戲）已經不存在：直接忽略，下次存檔就會清掉
  return { schemaVersion: APP_LIST_SCHEMA_VERSION, apps }
}

export function defaultAppList(): AppListData {
  return { schemaVersion: APP_LIST_SCHEMA_VERSION, apps: DEFAULT_APPS.map((a) => ({ ...a })) }
}

let storage: DocumentStorage<AppListData> = new LocalStorageDocument<AppListData>(KEY, parseAppList)
/** 之後換成雲端儲存時呼叫（測試也會用到） */
export function getAppListStorage(): DocumentStorage<AppListData> {
  return storage
}
export function setAppListStorage(next: DocumentStorage<AppListData>): void {
  storage = next
}

interface AppListState extends AppListData {
  status: 'loading' | 'ready'
  init: () => Promise<void>
  addApp: (input: { name: string; url: string; icon: string }) => ExternalApp
  updateApp: (id: string, patch: { name: string; url: string; icon: string }) => void
  removeApp: (id: string) => void
  restoreDefaults: () => void
}

function snapshot(s: AppListData): AppListData {
  return { schemaVersion: APP_LIST_SCHEMA_VERSION, apps: s.apps }
}

function newId(): string {
  return 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export const useAppListStore = create<AppListState>((set, get) => {
  const commit = (patch: Partial<AppListData>): void => {
    set(patch)
    void storage.save(snapshot(get()))
  }
  return {
    ...defaultAppList(),
    status: 'loading',

    init: async () => {
      const saved = await storage.load()
      set({ ...(saved ?? defaultAppList()), status: 'ready' })
    },

    addApp: ({ name, url, icon }) => {
      const app: ExternalApp = { id: newId(), name: name.trim(), url, icon }
      commit({ apps: [...get().apps, app] })
      return app
    },

    updateApp: (id, { name, url, icon }) =>
      commit({ apps: get().apps.map((a) => (a.id === id ? { ...a, name: name.trim(), url, icon } : a)) }),

    removeApp: (id) => commit({ apps: get().apps.filter((a) => a.id !== id) }),

    restoreDefaults: () => {
      const d = defaultAppList()
      commit({ apps: d.apps })
    },
  }
})
