import { useEffect, useRef, useState } from 'react'
import { NOTE_COLORS, NOTE_CSS, TOOLS, type NoteColor } from '../../config/tools'
import { useFarmStore } from '../../farm/store/farmStore'
import { PixelSprite } from '../../farm/ui/PixelSprite'
import { useUIStore } from '../../store/uiStore'
import { canAdd, charCount, clip, validateDraft, type Note } from '../../tools/notes'
import { ToolDialog } from './ToolDialog'

/**
 * 公佈欄（v3.7.0）：便利貼列表、單張全文、新增／編輯、刪除（要確認）。資料在養殖場存檔的 notes（farmStore 的 addNote 等）。
 * 文字一律用 React 的文字節點顯示（不用 innerHTML），換行照原樣（white-space: pre-wrap）。
 * 字數用 Array.from 計（emoji 算 1 個字）；輸入或貼上超過上限會截斷並提示（輸入法組字中先不截，組字完成再截）。
 */

type View = { kind: 'list' } | { kind: 'view'; id: string } | { kind: 'edit'; id: string | null }
interface Draft {
  title: string
  body: string
  color: NoteColor
}
const EMPTY: Draft = { title: '', body: '', color: 'yellow' }

const p2 = (n: number): string => String(n).padStart(2, '0')
export function formatNoteTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export function NotesDialog() {
  const setToolOpen = useUIStore((s) => s.setToolOpen)
  const notes = useFarmStore((s) => s.save?.notes) ?? []
  const hasSave = useFarmStore((s) => s.save !== null)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [dirty, setDirty] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<null | { kind: 'delete'; id: string } | { kind: 'discard'; then: () => void }>(null)
  const composing = useRef(false)

  // 正在看的那張被刪掉了（例如另一個操作）：回到列表
  useEffect(() => {
    if ((view.kind === 'view' || (view.kind === 'edit' && view.id)) && !notes.some((n) => n.id === view.id)) setView({ kind: 'list' })
  }, [notes, view])

  const close = (): void => setToolOpen(null)
  /** 要離開編輯畫面（關閉視窗、回列表）：有未儲存的修改就先確認 */
  const leaveEdit = (then: () => void): void => {
    if (view.kind === 'edit' && dirty) setConfirm({ kind: 'discard', then })
    else then()
  }
  const requestClose = (): void => {
    if (confirm) {
      setConfirm(null)
      return
    }
    leaveEdit(close)
  }

  const startEdit = (n: Note | null): void => {
    setDraft(n ? { title: n.title, body: n.body, color: n.color } : EMPTY)
    setDirty(false)
    setHint(null)
    setView({ kind: 'edit', id: n?.id ?? null })
  }

  /** 改標題或內容：超過上限就截斷並提示（組字中不截） */
  const change = (field: 'title' | 'body', value: string): void => {
    const max = field === 'title' ? TOOLS.notes.titleMax : TOOLS.notes.bodyMax
    let text = value
    if (!composing.current) {
      const c = clip(value, max)
      text = c.text
      if (c.cut) setHint(`${field === 'title' ? '標題' : '內容'}最多 ${max} 字，超過的部分已截斷`)
    }
    setDraft((d) => ({ ...d, [field]: text }))
    setDirty(true)
  }
  const compositionEnd = (field: 'title' | 'body', value: string): void => {
    composing.current = false
    change(field, value)
  }

  const save = (): void => {
    if (view.kind !== 'edit') return
    const fs = useFarmStore.getState()
    const err = view.id ? fs.updateNote(view.id, draft) : fs.addNote(draft)
    if (err) {
      setHint(err)
      return
    }
    setDirty(false)
    setHint(null)
    useUIStore.getState().showToast(view.id ? '便利貼已更新' : '已新增便利貼')
    if (view.id) setView({ kind: 'view', id: view.id })
    else setView({ kind: 'list' })
  }

  const full = !canAdd(notes)
  const draftError = validateDraft(draft.title, draft.body)
  const current = view.kind === 'view' ? notes.find((n) => n.id === view.id) : undefined

  return (
    <ToolDialog id="notes" title="公佈欄" icon="tool_board" width={600} onClose={requestClose}>
      <div className="relative px-3 pb-3 pt-2">
        {!hasSave && <div className="py-8 text-center text-sm" data-testid="notes-nosave">{TOOLS.notes.noSaveMessage}</div>}

        {hasSave && view.kind === 'list' && (
          <div data-testid="notes-list">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold">
                便利貼 <span className="font-normal tabular-nums text-[#8a5a2b]" data-testid="notes-count">{notes.length}／{TOOLS.notes.max}</span>
              </div>
              <button type="button" data-testid="notes-add" className="px-btn px-3 py-1 text-sm" disabled={full} onClick={() => startEdit(null)}>
                ＋ 新增
              </button>
            </div>
            {full && (
              <p className="mt-1 text-right text-xs font-bold text-[#c0392b]" data-testid="notes-full">
                {TOOLS.notes.fullMessage}
              </p>
            )}
            {notes.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#8a7d66]">公佈欄還是空的，按「新增」貼一張便利貼。</p>
            ) : (
              <ul className="mt-2 grid grid-cols-2 gap-2">
                {notes.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      data-testid="notes-card"
                      data-note-id={n.id}
                      onClick={() => setView({ kind: 'view', id: n.id })}
                      className="flex h-full w-full flex-col items-stretch border-2 px-2 pb-1.5 pt-1 text-left shadow-[2px_2px_0_rgba(0,0,0,0.3)] hover:brightness-105"
                      style={{ background: NOTE_CSS[n.color].bg, borderColor: NOTE_CSS[n.color].edge }}
                    >
                      <span className="truncate text-sm font-bold" data-testid="notes-card-title">
                        {n.title}
                      </span>
                      <span className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-snug text-[#3b2a1c]/85">{n.body || '（沒有內容）'}</span>
                      <span className="mt-auto pt-1 text-right text-[10px] tabular-nums text-[#3b2a1c]/60">{formatNoteTime(n.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {hasSave && view.kind === 'view' && current && (
          <div data-testid="notes-view">
            <div className="border-2 px-3 pb-2 pt-2 shadow-[3px_3px_0_rgba(0,0,0,0.3)]" style={{ background: NOTE_CSS[current.color].bg, borderColor: NOTE_CSS[current.color].edge }}>
              <h3 className="break-words text-base font-bold" data-testid="notes-view-title">
                {current.title}
              </h3>
              <p className="mt-1 min-h-[60px] whitespace-pre-wrap break-words text-sm leading-relaxed" data-testid="notes-view-body">
                {current.body}
              </p>
              <p className="mt-2 text-right text-[10px] tabular-nums text-[#3b2a1c]/60">
                建立 {formatNoteTime(current.createdAt)}
                {current.updatedAt !== current.createdAt ? `・修改 ${formatNoteTime(current.updatedAt)}` : ''}
              </p>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className="px-btn px-3 py-1 text-sm" data-testid="notes-back" onClick={() => setView({ kind: 'list' })} style={{ background: '#fffdf4' }}>
                返回列表
              </button>
              <button type="button" className="px-btn ml-auto px-3 py-1 text-sm" data-testid="notes-edit" onClick={() => startEdit(current)}>
                編輯
              </button>
              <button type="button" className="px-btn px-3 py-1 text-sm" data-testid="notes-delete" style={{ background: '#f6c9a8' }} onClick={() => setConfirm({ kind: 'delete', id: current.id })}>
                刪除
              </button>
            </div>
          </div>
        )}

        {hasSave && view.kind === 'edit' && (
          <div data-testid="notes-edit-form">
            <div className="text-sm font-bold">{view.id ? '編輯便利貼' : '新增便利貼'}</div>
            <label className="mt-2 block text-xs font-bold">
              <span className="flex justify-between">
                標題
                <span className="font-normal tabular-nums text-[#8a5a2b]" data-testid="notes-title-count">
                  {charCount(draft.title)}／{TOOLS.notes.titleMax}
                </span>
              </span>
              <input
                type="text"
                data-testid="notes-title"
                value={draft.title}
                onChange={(e) => change('title', e.target.value)}
                onCompositionStart={() => (composing.current = true)}
                onCompositionEnd={(e) => compositionEnd('title', e.currentTarget.value)}
                className="px-input mt-0.5 w-full px-2 py-1 text-sm font-normal"
                placeholder="例如：週三開會"
                autoFocus
              />
            </label>
            <label className="mt-2 block text-xs font-bold">
              <span className="flex justify-between">
                內容
                <span className="font-normal tabular-nums text-[#8a5a2b]" data-testid="notes-body-count">
                  {charCount(draft.body)}／{TOOLS.notes.bodyMax}
                </span>
              </span>
              <textarea
                data-testid="notes-body"
                value={draft.body}
                rows={6}
                onChange={(e) => change('body', e.target.value)}
                onCompositionStart={() => (composing.current = true)}
                onCompositionEnd={(e) => compositionEnd('body', e.currentTarget.value)}
                className="px-input mt-0.5 w-full resize-none px-2 py-1 text-sm font-normal leading-relaxed"
              />
            </label>
            <div className="mt-2 flex items-center gap-2 text-xs font-bold" role="radiogroup" aria-label="顏色">
              顏色
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === c}
                  aria-label={NOTE_CSS[c].label}
                  title={NOTE_CSS[c].label}
                  data-testid={`notes-color-${c}`}
                  onClick={() => {
                    setDraft((d) => ({ ...d, color: c }))
                    setDirty(true)
                  }}
                  className={`flex items-center justify-center border-2 p-0.5 ${draft.color === c ? 'border-[#3b2a1c] bg-[#f4c95d]' : 'border-transparent'}`}
                >
                  <PixelSprite frame={`note_${c}`} scale={1} title={NOTE_CSS[c].label} />
                </button>
              ))}
            </div>
            {(hint || (dirty && draftError)) && (
              <p className="mt-2 text-xs font-bold text-[#c0392b]" data-testid="notes-hint" role="status">
                {hint ?? draftError}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="px-btn px-3 py-1 text-sm" data-testid="notes-cancel" style={{ background: '#fffdf4' }} onClick={() => leaveEdit(() => setView(view.id ? { kind: 'view', id: view.id } : { kind: 'list' }))}>
                取消
              </button>
              <button type="button" className="px-btn px-4 py-1 text-sm" data-testid="notes-save" disabled={!!draftError} onClick={save}>
                儲存
              </button>
            </div>
          </div>
        )}

        {confirm && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#fff6df]/85 p-4" data-testid="notes-confirm">
            <div className="px-panel w-full max-w-xs p-3 text-sm">
              {confirm.kind === 'delete' ? (
                <>
                  <p className="break-words font-bold">確定要刪除「{notes.find((n) => n.id === confirm.id)?.title ?? ''}」嗎？</p>
                  <p className="mt-1 text-xs text-[#8a5a2b]">刪除後無法復原。</p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" className="px-btn px-3 py-1" data-testid="notes-confirm-cancel" style={{ background: '#fffdf4' }} onClick={() => setConfirm(null)}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="px-btn px-3 py-1"
                      data-testid="notes-confirm-delete"
                      style={{ background: '#e8735a', color: '#fff' }}
                      onClick={() => {
                        useFarmStore.getState().deleteNote(confirm.id)
                        setConfirm(null)
                        setView({ kind: 'list' })
                        useUIStore.getState().showToast('已刪除便利貼')
                      }}
                    >
                      刪除
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-bold">還沒儲存，確定要放棄修改嗎？</p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" className="px-btn px-3 py-1" data-testid="notes-confirm-keep" style={{ background: '#fffdf4' }} onClick={() => setConfirm(null)}>
                      繼續編輯
                    </button>
                    <button
                      type="button"
                      className="px-btn px-3 py-1"
                      data-testid="notes-confirm-discard"
                      onClick={() => {
                        const then = confirm.then
                        setConfirm(null)
                        setDirty(false)
                        then()
                      }}
                    >
                      放棄修改
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </ToolDialog>
  )
}
