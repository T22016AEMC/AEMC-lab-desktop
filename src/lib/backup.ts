import { buildingDef } from '../farm/config/buildings'
import { migrate, takeMigrationNotice } from '../farm/save/migrate'
import { CURRENT_SCHEMA_VERSION, type SaveData, type SaveStorage } from '../farm/save/types'
import { APP_LIST_SCHEMA_VERSION, parseAppList, type AppListData } from '../store/appListStore'
import type { DocumentStorage } from './documentStorage'

/**
 * 存檔匯出／匯入（純函式 + 批次寫入，不碰 DOM，可在 Node 測試）。
 * 個人存檔，不做防竄改。檔案是一個 JSON：養殖場存檔＋啟動台程式清單（含使用者上傳的圖示）。
 */
export const BACKUP_FORMAT = 'aemc-desktop-backup'
export const BACKUP_FORMAT_VERSION = 1
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024
export const NEWER_VERSION_MESSAGE = '這個存檔來自較新版本，請重新整理網頁更新後再試'

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  /** ISO 時間字串 */
  exportedAt: string
  appVersion: string
  data: { farm: SaveData; appList: AppListData }
}

export function buildBackup(farm: SaveData, appList: AppListData, appVersion: string, now: Date): BackupFile {
  return { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, exportedAt: now.toISOString(), appVersion, data: { farm, appList } }
}

/** aemc-desktop-backup-YYYYMMDD-HHmm.json（本地時間） */
export function backupFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `aemc-desktop-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
}

export interface BackupSummary {
  exportedAt: string
  appVersion: string
  petNames: string[]
  points: number
  buildings: string[]
  appCount: number
}

export type ParseResult = { ok: true; backup: BackupFile; summary: BackupSummary } | { ok: false; error: string }

const fail = (error: string): ParseResult => ({ ok: false, error })

export function summarize(b: BackupFile): BackupSummary {
  return {
    exportedAt: b.exportedAt,
    appVersion: b.appVersion,
    petNames: b.data.farm.pets.map((p) => p.name),
    points: b.data.farm.points,
    buildings: b.data.farm.ownedBuildings.map((id) => buildingDef(id)?.name ?? id),
    appCount: b.data.appList.apps.length,
  }
}

/**
 * 依序檢查：檔案大小 → JSON 可解析 → format → 版本（較新的拒絕）→ 存檔升級流程（v3 → v4…）→ 啟動台清單。
 * 任何一步失敗都回傳原因；這個函式本身不寫入，所以失敗時不會改動任何資料。
 */
export function parseBackup(text: string, sizeBytes: number): ParseResult {
  if (sizeBytes > MAX_BACKUP_BYTES) return fail('檔案太大（上限 5 MB），這不像是備份檔')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('這個檔案不是有效的 JSON，無法讀取')
  }
  if (!raw || typeof raw !== 'object' || (raw as Record<string, unknown>).format !== BACKUP_FORMAT) return fail('這不是 AEMC Lab Desktop 的備份檔（format 不符）')
  const r = raw as Record<string, unknown>
  if (typeof r.formatVersion !== 'number' || !Number.isInteger(r.formatVersion) || r.formatVersion < 1) return fail('備份檔的格式版本無法辨識')
  if (r.formatVersion > BACKUP_FORMAT_VERSION) return fail(NEWER_VERSION_MESSAGE)
  const data = r.data as Record<string, unknown> | null | undefined
  if (!data || typeof data !== 'object') return fail('備份檔缺少資料（data）')
  const farmRaw = data.farm as Record<string, unknown> | null | undefined
  if (!farmRaw || typeof farmRaw !== 'object' || typeof farmRaw.schemaVersion !== 'number') return fail('備份檔裡的養殖場存檔無法辨識')
  const listRaw = data.appList as Record<string, unknown> | null | undefined
  if (!listRaw || typeof listRaw !== 'object') return fail('備份檔裡的啟動台程式清單無法辨識')
  if (farmRaw.schemaVersion > CURRENT_SCHEMA_VERSION || (typeof listRaw.schemaVersion === 'number' && listRaw.schemaVersion > APP_LIST_SCHEMA_VERSION)) return fail(NEWER_VERSION_MESSAGE)
  const farm = migrate(farmRaw)
  takeMigrationNotice() // 只是預覽，不要讓「海洋已取消」的提示留到下次
  if (!farm) return fail('備份檔裡的養殖場存檔無法辨識或已損毀')
  const appList = parseAppList(listRaw)
  if (!appList) return fail('備份檔裡的啟動台程式清單無法辨識或已損毀')
  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: r.formatVersion,
    exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : '',
    appVersion: typeof r.appVersion === 'string' ? r.appVersion : '',
    data: { farm, appList },
  }
  return { ok: true, backup, summary: summarize(backup) }
}

/**
 * 寫入（整批成功或整批不寫）：先記下兩份現有資料，依序寫入，任何一份失敗就把已寫的還原。
 * 回傳 null = 成功，否則是失敗原因（現有資料保持原樣）。
 */
export async function applyBackup(backup: BackupFile, farm: SaveStorage, appList: DocumentStorage<AppListData>): Promise<string | null> {
  const before = { farm: await farm.snapshot(), appList: await appList.snapshot() }
  try {
    await farm.saveStrict(backup.data.farm)
    await appList.saveStrict(backup.data.appList)
    return null
  } catch {
    await farm.restore(before.farm)
    await appList.restore(before.appList)
    return '寫入失敗（瀏覽器空間可能已滿），現有存檔沒有被改動'
  }
}
