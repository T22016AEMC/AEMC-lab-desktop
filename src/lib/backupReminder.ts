import { todayKey } from '../farm/sim/points'

const DAY_MS = 86_400_000
/** 從未匯出：有寵物領養滿幾天才開始提醒；已匯出過：距上次超過幾天再提醒 */
export const REMIND_AFTER_PET_DAYS = 3
export const REMIND_AFTER_EXPORT_DAYS = 14

/** 現在該不該顯示備份提醒（純函式，給測試用） */
export function shouldRemind(s: { lastExportAt: number | null; remindOff: boolean; lastRemindDate: string }, petAdoptedAt: number[], nowMs: number): boolean {
  if (s.remindOff || s.lastRemindDate === todayKey(nowMs)) return false
  if (s.lastExportAt === null) return petAdoptedAt.some((t) => nowMs - t >= REMIND_AFTER_PET_DAYS * DAY_MS)
  return nowMs - s.lastExportAt > REMIND_AFTER_EXPORT_DAYS * DAY_MS
}

