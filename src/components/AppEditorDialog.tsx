import { useRef, useState } from 'react'
import { normalizeUrl } from '../lib/appUrl'
import { imageFileToIcon } from '../lib/iconImage'
import type { ExternalApp } from '../types'
import { AppIcon } from './AppIcon'

interface Props {
  /** 有值 = 編輯這個程式；沒有 = 新增 */
  app?: ExternalApp
  onSave: (v: { name: string; url: string; icon: string }) => void
  onCancel: () => void
}

const field =
  'mt-1 w-full rounded-lg border border-white/25 bg-white/15 px-3 py-2 text-sm text-white placeholder-white/45 outline-none focus:bg-white/25'

/** 新增／編輯程式：網址、名稱、圖示（上傳圖片或自動文字圖示） */
export function AppEditorDialog({ app, onSave, onCancel }: Props) {
  const [url, setUrl] = useState(app?.url ?? '')
  const [name, setName] = useState(app?.name ?? '')
  // 圖示：'' = 自動文字圖示；其他 = 圖片（路徑或 data URL）
  const [icon, setIcon] = useState(app?.icon ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      setIcon(await imageFileToIcon(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : '無法讀取這張圖片')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const submit = () => {
    const finalUrl = normalizeUrl(url)
    if (!finalUrl) {
      setError('請輸入有效的網址（只接受 http 或 https）')
      return
    }
    if (!name.trim()) {
      setError('請輸入名稱')
      return
    }
    onSave({ name: name.trim(), url: finalUrl, icon })
  }

  const usingImage = icon !== ''

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 p-4"
      onClick={(e) => {
        e.stopPropagation()
        onCancel()
      }}
    >
      <div
        role="dialog"
        aria-label={app ? '編輯程式' : '新增程式'}
        className="w-full max-w-sm rounded-2xl border border-white/25 bg-slate-900/90 p-5 text-white shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault()
            submit()
          }
        }}
      >
        <div className="text-center text-lg font-semibold">{app ? '編輯程式' : '新增程式'}</div>

        <label className="mt-4 block text-xs text-white/65">
          網址
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            aria-label="網址"
            className={field}
            style={{ userSelect: 'text' }}
            autoFocus
          />
        </label>
        <label className="mt-3 block text-xs text-white/65">
          名稱
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="程式名稱"
            aria-label="名稱"
            className={field}
            style={{ userSelect: 'text' }}
          />
        </label>

        <div className="mt-3 text-xs text-white/65">圖示</div>
        <div className="mt-1 flex items-center gap-3">
          <AppIcon app={{ name: name || '?', icon }} size={64} />
          <div className="flex flex-col gap-1.5 text-xs">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-white/25 bg-white/15 px-3 py-1 hover:bg-white/25 disabled:opacity-50"
            >
              上傳圖片…
            </button>
            <button
              type="button"
              disabled={!usingImage}
              onClick={() => setIcon('')}
              className="rounded-full border border-white/25 bg-white/15 px-3 py-1 hover:bg-white/25 disabled:opacity-40"
            >
              使用文字圖示
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            aria-label="上傳圖示圖片"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
        <div className="mt-1 text-[11px] text-white/45">
          {usingImage ? '圖片會裁成正方形並縮成 256×256' : '文字圖示：取名稱前 1～2 個字，顏色依名稱決定'}
        </div>

        {error && (
          <div role="alert" className="mt-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="rounded-full bg-gradient-to-b from-amber-300 to-orange-500 px-5 py-1.5 text-sm font-bold text-slate-900 shadow hover:brightness-110 disabled:opacity-50"
          >
            {app ? '儲存' : '新增'}
          </button>
        </div>
      </div>
    </div>
  )
}
