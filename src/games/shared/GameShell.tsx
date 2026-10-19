import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import type { BuiltinAppProps } from '../../types'
import type { GameStatus } from './hooks'
import { isSoundEnabled, setSoundEnabled, subscribeSound } from './sound'

interface Props {
  title: string
  icon: string
  /** 開始畫面上的操作說明 */
  help: string[]
  appProps: BuiltinAppProps
  status: GameStatus
  onStart: () => void
  onResume: () => void
  onPause: () => void
  onRestart: () => void
  /** 標題列下方的狀態列內容（分數、最高分…） */
  stats: ReactNode
  /** 開始畫面的額外內容（例如選難度） */
  startExtra?: ReactNode
  /** 遊戲結束畫面的標題與說明 */
  overTitle?: string
  overDetail?: ReactNode
  /** 遊戲結束時用底部橫幅，不遮住盤面（方便看最後的盤面） */
  overBanner?: boolean
  /** 開始畫面按鈕文字 */
  startLabel?: string
  /** 暫停時是否遮住遊戲畫面（踩地雷避免偷看） */
  hideWhenPaused?: boolean
  children: ReactNode
}

function useSound() {
  return useSyncExternalStore(subscribeSound, isSoundEnabled)
}

export function GameShell({
  title,
  icon,
  help,
  appProps,
  status,
  onStart,
  onResume,
  onPause,
  onRestart,
  stats,
  startExtra,
  overTitle = '遊戲結束',
  overDetail,
  startLabel = '開始遊戲',
  overBanner,
  hideWhenPaused,
  children,
}: Props) {
  const sound = useSound()
  const listening = appProps.active && !appProps.minimized

  // 共通按鍵：Enter／空白鍵開始、繼續、重來；P 或 Esc 暫停
  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (status === 'ready' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        onStart()
      } else if (status === 'playing' && (e.key === 'p' || e.key === 'P' || e.key === 'Escape')) {
        e.preventDefault()
        onPause()
      } else if (status === 'paused' && (e.key === 'Enter' || e.key === ' ' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        onResume()
      } else if (status === 'over' && (e.key === 'Enter' || e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        onRestart()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [listening, status, onStart, onResume, onPause, onRestart])

  return (
    <div className="relative flex h-full w-full select-none flex-col bg-slate-900 text-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-slate-800/80 px-3 py-1.5 text-sm">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-0.5 tabular-nums">{stats}</div>
        <button
          type="button"
          onClick={() => setSoundEnabled(!sound)}
          title={sound ? '音效：開' : '音效：關'}
          aria-label={sound ? '關閉音效' : '開啟音效'}
          aria-pressed={sound}
          className="rounded px-1.5 py-0.5 text-base hover:bg-white/10"
        >
          {sound ? '🔊' : '🔇'}
        </button>
        {(status === 'playing' || status === 'paused') && (
          <button
            type="button"
            onClick={onRestart}
            title="重新開始"
            aria-label="重新開始"
            className="rounded px-1.5 py-0.5 text-base hover:bg-white/10"
          >
            ↻
          </button>
        )}
        {status === 'playing' && (
          <button
            type="button"
            onClick={onPause}
            title="暫停 (P)"
            aria-label="暫停"
            className="rounded px-1.5 py-0.5 text-base hover:bg-white/10"
          >
            ⏸
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div className={`h-full w-full ${hideWhenPaused && status === 'paused' ? 'invisible' : ''}`}>{children}</div>

        {status === 'ready' && (
          <Overlay>
            <div className="text-5xl">{icon}</div>
            <div className="mt-2 text-2xl font-bold">{title}</div>
            <ul className="mt-3 max-w-xs space-y-1 text-center text-xs leading-relaxed text-white/70">
              {help.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            {startExtra && <div className="mt-4">{startExtra}</div>}
            <PrimaryButton onClick={onStart}>{startLabel}</PrimaryButton>
          </Overlay>
        )}

        {status === 'paused' && (
          <Overlay>
            <div className="text-4xl">⏸</div>
            <div className="mt-2 text-xl font-bold">已暫停</div>
            <PrimaryButton onClick={onResume}>繼續</PrimaryButton>
            <div className="mt-2 text-xs text-white/50">按 Enter 或 P 繼續</div>
          </Overlay>
        )}

        {status === 'over' && !overBanner && (
          <Overlay>
            <div className="text-2xl font-bold">{overTitle}</div>
            {overDetail && <div className="mt-2 text-center text-sm text-white/80">{overDetail}</div>}
            <PrimaryButton onClick={onRestart}>重新開始</PrimaryButton>
            <div className="mt-2 text-xs text-white/50">按 Enter 重新開始</div>
          </Overlay>
        )}

        {status === 'over' && overBanner && (
          <div className="absolute inset-x-3 bottom-3 z-30 flex flex-col items-center rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 shadow-2xl backdrop-blur">
            <div className="text-lg font-bold">{overTitle}</div>
            {overDetail && <div className="mt-0.5 text-center text-sm text-white/80">{overDetail}</div>}
            <PrimaryButton onClick={onRestart}>重新開始</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      {children}
    </div>
  )
}

export function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 px-7 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 hover:brightness-110 active:scale-95"
    >
      {children}
    </button>
  )
}
