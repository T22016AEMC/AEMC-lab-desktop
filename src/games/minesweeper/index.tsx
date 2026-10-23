import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BuiltinAppProps } from '../../types'
import { GameShell } from '../shared/GameShell'
import { useBest, useElementSize, useGameStatus, useRoundReward } from '../shared/hooks'
import { playSfx } from '../shared/sound'
import {
  DIFFICULTIES,
  chordCell,
  emptyBoard,
  isWon,
  placeMines,
  revealAllMines,
  revealCell,
  toggleFlag,
  type Cell,
  type Difficulty,
  type DifficultyId,
} from './logic'

const NUMBER_COLORS = ['', '#3b82f6', '#16a34a', '#ef4444', '#6d28d9', '#b91c1c', '#0891b2', '#111827', '#6b7280']
const LONG_PRESS_MS = 420

function pad3(n: number): string {
  return String(Math.max(0, Math.min(999, n))).padStart(3, '0')
}

export default function Minesweeper(props: BuiltinAppProps) {
  const game = useGameStatus(props)
  const reward = useRoundReward('game-minesweeper')
  const [difficultyId, setDifficultyId] = useState<DifficultyId>('beginner')
  const difficulty = useMemo<Difficulty>(() => DIFFICULTIES.find((d) => d.id === difficultyId)!, [difficultyId])
  const [board, setBoard] = useState<Cell[]>(() => emptyBoard(DIFFICULTIES[0]))
  const [started, setStarted] = useState(false) // 已佈雷（第一下點擊之後）
  const [seconds, setSeconds] = useState(0)
  const [result, setResult] = useState<'won' | 'lost' | null>(null)
  const [newRecord, setNewRecord] = useState(false)
  const { best, submit } = useBest(`minesweeper:best:${difficultyId}`, true)

  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const cellSize = Math.max(
    12,
    Math.min(44, Math.floor(Math.min((area.width - 16) / difficulty.cols, (area.height - 16) / difficulty.rows)) || 12),
  )

  const flags = board.reduce((n, c) => n + (c.flagged ? 1 : 0), 0)

  const newGame = useCallback((d: Difficulty) => {
    setBoard(emptyBoard(d))
    setStarted(false)
    setSeconds(0)
    setResult(null)
    setNewRecord(false)
  }, [])

  // 計時：第一下點擊之後、遊戲進行中才跑
  useEffect(() => {
    if (game.status !== 'playing' || !started) return
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [game.status, started])

  const finishGame = (next: Cell[], won: boolean, time: number) => {
    setBoard(revealAllMines(next, won))
    setResult(won ? 'won' : 'lost')
    reward.report({ won })
    if (won) {
      setNewRecord(submit(time))
      playSfx('win')
    } else {
      playSfx('lose')
    }
    game.finish()
  }

  const onReveal = (index: number) => {
    if (game.status !== 'playing') return
    let cur = board
    let isStarted = started
    if (!isStarted) {
      if (cur[index].flagged) return
      cur = placeMines(cur, difficulty, index)
      isStarted = true
      setStarted(true)
    }
    const cell = cur[index]
    const res = cell.revealed ? chordCell(cur, difficulty, index) : revealCell(cur, difficulty, index)
    if (res.board === cur && isStarted === started) return
    playSfx('click')
    if (res.hitMine) return finishGame(res.board, false, seconds)
    if (isWon(res.board)) return finishGame(res.board, true, Math.max(1, seconds))
    setBoard(res.board)
  }

  const onFlag = (index: number) => {
    if (game.status !== 'playing') return
    if (board[index].revealed) return
    playSfx('flag')
    setBoard(toggleFlag(board, index))
  }

  const lastPointerType = useRef('mouse')
  const longTimer = useRef<number | undefined>(undefined)
  const longFired = useRef(false)

  const cellHandlers = (index: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      lastPointerType.current = e.pointerType
      longFired.current = false
      if (e.pointerType !== 'mouse') {
        window.clearTimeout(longTimer.current)
        longTimer.current = window.setTimeout(() => {
          longFired.current = true
          navigator.vibrate?.(15)
          onFlag(index)
        }, LONG_PRESS_MS)
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      window.clearTimeout(longTimer.current)
      if (e.pointerType === 'mouse') {
        if (e.button === 0) onReveal(index)
      } else if (!longFired.current) {
        onReveal(index)
      }
    },
    onPointerLeave: () => window.clearTimeout(longTimer.current),
    onPointerCancel: () => window.clearTimeout(longTimer.current),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      // 觸控長按在部分瀏覽器也會觸發 contextmenu，已由長按計時處理，這裡只處理滑鼠右鍵
      if (lastPointerType.current === 'mouse') onFlag(index)
    },
  })

  const start = () => {
    newGame(difficulty)
    reward.arm()
    game.start()
  }

  const changeDifficulty = (id: DifficultyId) => {
    setDifficultyId(id)
    newGame(DIFFICULTIES.find((d) => d.id === id)!)
    game.reset()
  }

  const difficultyButtons = (
    <div className="flex gap-2">
      {DIFFICULTIES.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => changeDifficulty(d.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            d.id === difficultyId ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
          }`}
        >
          {d.label}
        </button>
      ))}
    </div>
  )

  return (
    <GameShell
      title="踩地雷"
      icon="💣"
      appProps={props}
      status={game.status}
      onStart={start}
      onResume={game.resume}
      onPause={game.pause}
      onRestart={start}
      hideWhenPaused
      overBanner
      help={['左鍵翻開、右鍵插旗；點已翻開的數字可快速翻開周圍', '觸控裝置：輕點翻開、長按插旗', '第一下一定安全']}
      startExtra={difficultyButtons}
      overTitle={result === 'won' ? '🎉 過關！' : '💥 踩到地雷'}
      overDetail={
        result === 'won' ? (
          <>
            用時 {seconds} 秒{newRecord ? '（新紀錄！）' : best !== null ? `，最佳 ${best} 秒` : ''}
          </>
        ) : (
          '再試一次吧'
        )
      }
      stats={
        <>
          <span title="剩餘地雷">🚩 {pad3(difficulty.mines - flags)}</span>
          <span title="時間">⏱ {pad3(seconds)}</span>
          <span className="text-white/60" title="此難度最佳時間">
            🏆 {best !== null ? `${best} 秒` : '—'}
          </span>
          <select
            value={difficultyId}
            onChange={(e) => changeDifficulty(e.target.value as DifficultyId)}
            aria-label="難度"
            className="rounded bg-white/10 px-1 py-0.5 text-xs text-white outline-none"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d.id} value={d.id} className="text-black">
                {d.label}
              </option>
            ))}
          </select>
        </>
      }
    >
      <div ref={areaRef} className="flex h-full w-full items-center justify-center overflow-hidden p-2">
        <div
          data-testid="ms-board"
          className="grid touch-none gap-px rounded bg-slate-600 p-px shadow-xl"
          style={{
            gridTemplateColumns: `repeat(${difficulty.cols}, ${cellSize}px)`,
            gridAutoRows: `${cellSize}px`,
          }}
        >
          {board.map((c, i) => {
            const wrongFlag = result === 'lost' && c.flagged && !c.mine
            let content: React.ReactNode = null
            let cls = 'bg-slate-400 hover:bg-slate-300 shadow-[inset_-2px_-2px_0_rgba(0,0,0,0.25),inset_2px_2px_0_rgba(255,255,255,0.45)]'
            if (c.revealed) {
              cls = 'bg-slate-200'
              if (c.mine) {
                cls = 'bg-red-400'
                content = '💣'
              } else if (c.adjacent > 0) {
                content = <span style={{ color: NUMBER_COLORS[c.adjacent] }}>{c.adjacent}</span>
              }
            } else if (wrongFlag) {
              content = '❌'
            } else if (c.flagged) {
              content = '🚩'
            }
            return (
              <div
                key={i}
                {...cellHandlers(i)}
                className={`flex items-center justify-center font-bold leading-none ${cls}`}
                style={{ fontSize: cellSize * 0.58 }}
              >
                {content}
              </div>
            )
          })}
        </div>
      </div>
    </GameShell>
  )
}
