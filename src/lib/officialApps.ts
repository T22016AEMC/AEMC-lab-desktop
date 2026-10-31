import { LEGACY_DEFAULT_APP_IDS, OFFICIAL_APPS, isOfficialAppId } from '../config/apps'
import type { ExternalApp } from '../types'

const LEGACY_IDS = new Set(LEGACY_DEFAULT_APP_IDS)

/** 比較網址用：交給 URL 正規化（主機名稱小寫、根路徑補斜線）；無法解析就用原字串 */
export function urlKey(url: string): string {
  try {
    return new URL(url).href
  } catch {
    return url
  }
}

const OFFICIAL_URL_KEYS = new Map(OFFICIAL_APPS.map((a) => [urlKey(a.url), a]))

/** 這個網址若與某個官方程式完全相同，回傳那個官方程式（使用者新增或編輯時用來擋重複） */
export function officialAppWithUrl(url: string): ExternalApp | null {
  return OFFICIAL_URL_KEYS.get(urlKey(url)) ?? null
}

/**
 * 把官方程式合併進清單（每次載入、每次修改後都會做，所以結果一定是穩定、可重複套用的）：
 * 1. 官方 7 個依 OFFICIAL_APPS 的順序放最前面，內容（名稱、網址、圖示）以程式碼為準；少了就補回、有差就更新。
 * 2. 後面接使用者自己新增的項目，保持原本的相對順序。
 * 3. 移除：官方 id 的存檔項目（已由第 1 點取代）、舊版預設程式的確切 id、
 *    與官方程式網址完全相同的項目（視為同一個，只留官方那筆）、重複的 id（留第一筆）。
 * 其他任何項目都保留，不論有沒有 id 的格式（沒有 id 的項目在 parseAppList 就已補上穩定的 id）。
 */
export function mergeOfficialApps(apps: readonly ExternalApp[]): ExternalApp[] {
  const merged: ExternalApp[] = OFFICIAL_APPS.map((a) => ({ ...a }))
  const seen = new Set(merged.map((a) => a.id))
  for (const a of apps) {
    if (isOfficialAppId(a.id) || LEGACY_IDS.has(a.id)) continue
    if (OFFICIAL_URL_KEYS.has(urlKey(a.url))) continue
    if (seen.has(a.id)) continue
    seen.add(a.id)
    merged.push(a)
  }
  return merged
}
