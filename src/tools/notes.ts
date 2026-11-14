import { NOTE_COLORS, TOOLS, type NoteColor } from '../config/tools'

/**
 * 公佈欄的便利貼（v3.7.0）：純函式，不碰 DOM，可在 Node 測試。
 * 存在養殖場存檔的可缺少欄位 notes（舊存檔沒有 = 空），進匯出／匯入備份（匯出檔格式版本 4）。
 * 字數一律用 Array.from 計（以 Unicode 字元為單位，emoji 不會被切成半個）。
 */

export interface Note {
  id: string
  title: string
  body: string
  color: NoteColor
  /** 建立、最後修改時間（毫秒時間戳，真實時間） */
  createdAt: number
  updatedAt: number
}

/** 字數（Unicode 字元數） */
export const charCount = (s: string): number => Array.from(s).length

/** 截到最多 max 個字；回傳截斷後的字串與是否有截斷 */
export function clip(s: string, max: number): { text: string; cut: boolean } {
  const chars = Array.from(s)
  return chars.length > max ? { text: chars.slice(0, max).join(''), cut: true } : { text: s, cut: false }
}

export const isNoteColor = (v: unknown): v is NoteColor => typeof v === 'string' && (NOTE_COLORS as readonly string[]).includes(v)

/** 新的排前面（建立時間大的在前；同時間的維持原順序） */
export const sortNotes = (list: Note[]): Note[] => [...list].sort((a, b) => b.createdAt - a.createdAt)

/** 一張便利貼的內容是否合法（標題 1～20 字且不是只有空白、內容 0～200 字） */
export function validateDraft(title: string, body: string): string | null {
  if (title.trim() === '') return '請輸入標題'
  if (charCount(title) > TOOLS.notes.titleMax) return `標題最多 ${TOOLS.notes.titleMax} 字`
  if (charCount(body) > TOOLS.notes.bodyMax) return `內容最多 ${TOOLS.notes.bodyMax} 字`
  return null
}

/**
 * 讀取（存檔或匯入的備份）時驗證：型別、字數上限、顏色、時間、id 不重複；壞掉的單張捨棄，不會讓整份失敗。
 * 依建立時間新的在前排序，超過 8 張只留最新的 8 張。
 */
export function cleanNotes(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return []
  const out: Note[] = []
  const ids = new Set<string>()
  for (const n of raw) {
    if (!n || typeof n !== 'object' || Array.isArray(n)) continue
    const r = n as Record<string, unknown>
    if (typeof r.id !== 'string' || r.id === '' || r.id.length > TOOLS.notes.idMaxLength || ids.has(r.id)) continue
    if (typeof r.title !== 'string' || typeof r.body !== 'string') continue
    if (validateDraft(r.title, r.body)) continue
    if (!isNoteColor(r.color)) continue
    if (typeof r.createdAt !== 'number' || !Number.isFinite(r.createdAt) || typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt)) continue
    ids.add(r.id)
    out.push({ id: r.id, title: r.title, body: r.body, color: r.color, createdAt: r.createdAt, updatedAt: r.updatedAt })
  }
  return sortNotes(out).slice(0, TOOLS.notes.max)
}

export const canAdd = (list: readonly Note[]): boolean => list.length < TOOLS.notes.max

export function makeNoteId(now: number, rand: () => number = Math.random): string {
  return `n-${now.toString(36)}-${Math.floor(rand() * 36 ** 6).toString(36)}`
}

export type NoteResult = { ok: true; notes: Note[] } | { ok: false; error: string }

/** 新增（放在最前面）；已有 8 張或內容不合法就不加 */
export function addNote(list: Note[], draft: { title: string; body: string; color: NoteColor }, now: number, id = makeNoteId(now)): NoteResult {
  if (!canAdd(list)) return { ok: false, error: TOOLS.notes.fullMessage }
  const err = validateDraft(draft.title, draft.body)
  if (err) return { ok: false, error: err }
  if (!isNoteColor(draft.color)) return { ok: false, error: '顏色不正確' }
  const note: Note = { id, title: draft.title.trim(), body: draft.body, color: draft.color, createdAt: now, updatedAt: now }
  return { ok: true, notes: sortNotes([note, ...list.filter((n) => n.id !== id)]) }
}

/** 編輯（建立時間不變，所以排序位置不變） */
export function updateNote(list: Note[], id: string, draft: { title: string; body: string; color: NoteColor }, now: number): NoteResult {
  const cur = list.find((n) => n.id === id)
  if (!cur) return { ok: false, error: '找不到這張便利貼' }
  const err = validateDraft(draft.title, draft.body)
  if (err) return { ok: false, error: err }
  if (!isNoteColor(draft.color)) return { ok: false, error: '顏色不正確' }
  return { ok: true, notes: list.map((n) => (n.id === id ? { ...n, title: draft.title.trim(), body: draft.body, color: draft.color, updatedAt: now } : n)) }
}

export function deleteNote(list: Note[], id: string): Note[] {
  return list.filter((n) => n.id !== id)
}
