import { create } from 'zustand'
import { OFFICIAL_APPS, isOfficialAppId } from '../config/apps'
import { LocalStorageDocument, type DocumentStorage } from '../lib/documentStorage'
import { mergeOfficialApps } from '../lib/officialApps'
import type { ExternalApp } from '../types'

/** 使用者自己的程式清單（存在瀏覽器；之後會搬到帳號雲端，所以是含 schemaVersion 的單一文件） */
export interface AppListData {
  schemaVersion: 1
  apps: ExternalApp[]
}

export const APP_LIST_SCHEMA_VERSION = 1

const KEY = 'aemc-desktop:app-list'

function hash36(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * 沒有可用 id 的項目（不是字串或空字串；程式自己寫的存檔不會有，手動編輯或舊格式才可能）：
 * 無法判斷是不是舊預設，一律當成使用者新增的保留，並補上由網址與名稱決定的穩定 id
 * （同樣內容的第 n 筆得到同一個 id，所以重複載入結果相同）。
 */
export function hasUsableId(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).id === 'string' && !!(raw as Record<string, unknown>).id
}

/** 原始存檔裡沒有可用 id 的項目（無法確定是舊預設還是使用者新增，合併時一律保留） */
export function findIdlessEntries(raw: unknown): unknown[] {
  const apps = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).apps : null
  return Array.isArray(apps) ? apps.filter((a) => a && typeof a === 'object' && !hasUsableId(a)) : []
}

function cleanApp(raw: unknown, idlessCount: Map<string, number>): ExternalApp | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  // 網址一定要是 http(s)（安全：不能留 javascript: 之類，之後會被 window.open 開啟）
  if (typeof r.url !== 'string' || !/^https?:\/\//i.test(r.url)) return null
  const named = typeof r.name === 'string' && r.name.trim() !== ''
  const name = named ? (r.name as string).slice(0, 40) : hostnameOf(r.url)
  let id = hasUsableId(raw) ? (r.id as string) : ''
  if (!id) {
    const key = r.url + '\n' + (named ? (r.name as string) : '')
    const n = idlessCount.get(key) ?? 0
    idlessCount.set(key, n + 1)
    id = `u-noid-${hash36(key)}-${n}`
  }
  return { id, name, url: r.url, icon: typeof r.icon === 'string' ? r.icon : '' }
}

/** 驗證並轉換儲存的資料；不認得的版本或壞掉的資料回傳 null（呼叫端改用預設清單）。這裡不合併官方程式 */
export function parseAppList(raw: unknown): AppListData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.schemaVersion !== APP_LIST_SCHEMA_VERSION || !Array.isArray(r.apps)) return null
  const seen = new Set<string>()
  const idless = new Map<string, number>()
  const apps: ExternalApp[] = []
  for (const a of r.apps) {
    const app = cleanApp(a, idless)
    if (app && !seen.has(app.id)) {
      seen.add(app.id)
      apps.push(app)
    }
  }
  // 舊版存檔裡的 hiddenBuiltins（隱藏內建遊戲）已經不存在：直接忽略，下次存檔就會清掉
  return { schemaVersion: APP_LIST_SCHEMA_VERSION, apps }
}

/** 沒有存檔的新使用者：官方程式 */
export function defaultAppList(): AppListData {
  return { schemaVersion: APP_LIST_SCHEMA_VERSION, apps: OFFICIAL_APPS.map((a) => ({ ...a })) }
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

/**
 * 載入已存的清單：合併官方程式（強制更新），結果和存檔內容不同才寫回。
 * 回傳要顯示的清單與是否需要寫回。只動 apps，其他存檔（養殖場、設定、備份鍵）不碰。
 */
export function applyOfficialToSaved(saved: AppListData, rawSnapshot: string | null): { data: AppListData; changed: boolean } {
  const data: AppListData = { schemaVersion: APP_LIST_SCHEMA_VERSION, apps: mergeOfficialApps(saved.apps) }
  return { data, changed: rawSnapshot !== JSON.stringify(data) }
}

function newId(): string {
  return 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export const useAppListStore = create<AppListState>((set, get) => {
  const commit = (patch: Partial<AppListData>): void => {
    // 每次修改後都再合併一次：官方程式永遠在最前面、不會被改掉，與官方網址相同的新增項目不會重複出現
    set(patch.apps ? { ...patch, apps: mergeOfficialApps(patch.apps) } : patch)
    void storage.save(snapshot(get()))
  }
  return {
    ...defaultAppList(),
    status: 'loading',

    init: async () => {
      const saved = await storage.load()
      if (!saved) {
        // 沒有存檔（新使用者）或存檔壞掉／版本不認得：顯示官方程式，不改動原本的存檔內容
        set({ ...defaultAppList(), status: 'ready' })
        return
      }
      const { data, changed } = applyOfficialToSaved(saved, await storage.snapshot())
      set({ ...data, status: 'ready' })
      if (changed) void storage.save(data)
    },

    addApp: ({ name, url, icon }) => {
      const app: ExternalApp = { id: newId(), name: name.trim(), url, icon }
      commit({ apps: [...get().apps, app] })
      return app
    },

    // 官方程式不能改名、不能刪除（介面不提供，這裡再擋一次）
    updateApp: (id, { name, url, icon }) => {
      if (isOfficialAppId(id)) return
      commit({ apps: get().apps.map((a) => (a.id === id ? { ...a, name: name.trim(), url, icon } : a)) })
    },

    removeApp: (id) => {
      if (isOfficialAppId(id)) return
      commit({ apps: get().apps.filter((a) => a.id !== id) })
    },

    /** 「恢復預設程式」：移除使用者新增的程式，只留官方程式 */
    restoreDefaults: () => {
      const d = defaultAppList()
      commit({ apps: d.apps })
    },
  }
})
