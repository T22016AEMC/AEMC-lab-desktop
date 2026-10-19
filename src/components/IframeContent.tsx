import { useEffect, useState } from 'react'

/** 超過這個時間還沒載入完成，就顯示逾時提示（Render 免費方案冷啟動可能要 30 秒以上） */
const LOAD_TIMEOUT_MS = 60_000
/** 超過這個時間顯示「冷啟動」說明 */
const SLOW_HINT_MS = 8_000

type Status = 'loading' | 'loaded' | 'timeout'

interface Props {
  url: string
  title: string
  onOpenInTab: () => void
}

export function IframeContent({ url, title, onOpenInTab }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [slow, setSlow] = useState(false)
  // 「繼續等待」會讓計時重新開始
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (status !== 'loading') return
    setSlow(false)
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_HINT_MS)
    const timeoutTimer = window.setTimeout(
      () => setStatus((s) => (s === 'loading' ? 'timeout' : s)),
      LOAD_TIMEOUT_MS,
    )
    return () => {
      window.clearTimeout(slowTimer)
      window.clearTimeout(timeoutTimer)
    }
  }, [status, attempt])

  return (
    <div className="relative h-full w-full bg-white">
      {/* 不加 sandbox：嵌入的程式需要能選擇本機檔案上傳、下載檔案 */}
      <iframe
        src={url}
        title={title}
        className="block h-full w-full border-0 bg-white"
        allow="clipboard-read; clipboard-write; fullscreen; autoplay"
        onLoad={() => setStatus('loaded')}
      />

      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-50 text-neutral-600">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-neutral-300 border-t-blue-500" />
          <div className="text-sm font-medium">載入中…</div>
          {slow && (
            <div className="max-w-xs px-4 text-center text-xs leading-relaxed text-neutral-400">
              伺服器可能正在冷啟動（Render 免費方案可能需要 30 秒以上），請稍候。
            </div>
          )}
        </div>
      )}

      {status === 'timeout' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-50 px-6 text-center text-neutral-600">
          <div className="text-3xl">⚠️</div>
          <div className="text-sm font-medium">無法載入，或載入時間過長</div>
          <div className="max-w-sm text-xs leading-relaxed text-neutral-400">
            可能是伺服器仍在啟動，或該網站不允許被嵌入在其他頁面中。你可以改用新分頁開啟。
          </div>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={onOpenInTab}
              className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
            >
              在新分頁開啟
            </button>
            <button
              type="button"
              onClick={() => {
                setStatus('loading')
                setAttempt((n) => n + 1)
              }}
              className="rounded-md bg-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-300"
            >
              繼續等待
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
