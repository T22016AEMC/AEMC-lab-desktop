import { useCallback, useEffect, useRef, useState } from 'react'
import type { BuiltinAppProps } from '../../types'
import { GameShell } from '../shared/GameShell'
import { useBest, useElementSize, useGameStatus, useKeys, useRoundReward, useSwipe } from '../shared/hooks'
import { playSfx } from '../shared/sound'
import { SIZE, canMove, maxValue, move, spawnTile, type Dir, type Tile } from './logic'

const TILE_STYLE: Record<number, { bg: string; fg: string }> = {
  2: { bg: '#eee4da', fg: '#776e65' },
  4: { bg: '#ede0c8', fg: '#776e65' },
  8: { bg: '#f2b179', fg: '#f9f6f2' },
  16: { bg: '#f59563', fg: '#f9f6f2' },
  32: { bg: '#f67c5f', fg: '#f9f6f2' },
  64: { bg: '#f65e3b', fg: '#f9f6f2' },
  128: { bg: '#edcf72', fg: '#f9f6f2' },
  256: { bg: '#edcc61', fg: '#f9f6f2' },
  512: { bg: '#edc850', fg: '#f9f6f2' },
  1024: { bg: '#edc53f', fg: '#f9f6f2' },
  2048: { bg: '#edc22e', fg: '#f9f6f2' },
}

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
}

const SLIDE_MS = 120

function initialTiles(idRef: { current: number }): Tile[] {
  const nextId = () => ++idRef.current
  return spawnTile(spawnTile([], nextId), nextId)
}

export default function Game2048(props: BuiltinAppProps) {
  const game = useGameStatus(props)
  const reward = useRoundReward('game-2048')
  const idRef = useRef(0)
  const [tiles, setTiles] = useState<Tile[]>([])
  const [score, setScore] = useState(0)
  const [won, setWon] = useState(false) // 已達成 2048，等待玩家決定
  const [keepGoing, setKeepGoing] = useState(false)
  const { best, submit } = useBest('2048:best')

  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const side = Math.max(160, Math.min(560, Math.min(area.width, area.height) - 20))
  const cell = side / SIZE
  const gap = Math.max(4, side * 0.028)

  const newGame = useCallback(() => {
    setTiles(initialTiles(idRef))
    setScore(0)
    setWon(false)
    setKeepGoing(false)
  }, [])

  const start = () => {
    // 2048 沒有明確的結束：玩到一半重新開始，也把上一局當作結束判定一次
    if (reward.pending()) reward.report({ maxTile: maxValue(tiles) })
    newGame()
    reward.arm()
    game.start()
  }

  // 被合併的方塊滑到位置後移除
  useEffect(() => {
    if (!tiles.some((t) => t.dying)) return
    const timer = window.setTimeout(() => setTiles((ts) => ts.filter((t) => !t.dying)), SLIDE_MS + 20)
    return () => window.clearTimeout(timer)
  }, [tiles])

  const doMove = (dir: Dir) => {
    if (game.status !== 'playing' || (won && !keepGoing)) return
    const res = move(tiles, dir)
    if (!res.moved) return
    const next = spawnTile(res.tiles, () => ++idRef.current)
    setTiles(next)
    const newScore = score + res.gained
    setScore(newScore)
    submit(newScore)
    playSfx(res.gained > 0 ? 'merge' : 'move')
    if (!keepGoing && maxValue(next) >= 2048) {
      setWon(true)
      reward.report({ maxTile: maxValue(next) })
      playSfx('win')
      return
    }
    if (!canMove(next)) {
      playSfx('lose')
      reward.report({ maxTile: maxValue(next) })
      game.finish()
    }
  }

  const listening = props.active && !props.minimized && game.status === 'playing'
  useKeys(
    (e) => {
      const dir = KEY_DIR[e.key]
      if (!dir) return false
      doMove(dir)
      return true
    },
    null,
    listening,
  )
  const swipe = useSwipe(doMove)

  const fontFor = (v: number) => cell * (v >= 1024 ? 0.3 : v >= 128 ? 0.36 : 0.46)

  return (
    <GameShell
      title="2048"
      icon="🔢"
      appProps={props}
      status={game.status}
      onStart={start}
      onResume={game.resume}
      onPause={game.pause}
      onRestart={start}
      overBanner
      help={['方向鍵或 WASD 移動方塊，相同數字相撞會合併', '觸控裝置：在盤面上滑動', '合出 2048 就過關，過關後可繼續挑戰']}
      overTitle="沒有可移動的方塊了"
      overDetail={<>最終分數 {score}</>}
      stats={
        <>
          <span>分數 {score}</span>
          <span className="text-white/60">最高分 {best ?? 0}</span>
        </>
      }
    >
      <div ref={areaRef} className="flex h-full w-full items-center justify-center overflow-hidden">
        <div
          {...swipe}
          data-testid="board-2048"
          className="relative touch-none rounded-xl"
          style={{ width: side, height: side, background: '#bbada0', padding: 0 }}
        >
          {/* 底格 */}
          {Array.from({ length: SIZE * SIZE }, (_, i) => (
            <div
              key={i}
              className="absolute rounded-md"
              style={{
                width: cell - gap,
                height: cell - gap,
                left: (i % SIZE) * cell + gap / 2,
                top: Math.floor(i / SIZE) * cell + gap / 2,
                background: 'rgba(238,228,218,0.35)',
              }}
            />
          ))}
          {/* 方塊：外層負責位置（有滑動動畫），內層負責出現與合併動畫 */}
          {tiles.map((t) => {
            const style = TILE_STYLE[t.value] ?? { bg: '#3c3a32', fg: '#f9f6f2' }
            return (
              <div
                key={t.id}
                className="absolute left-0 top-0"
                style={{
                  width: cell,
                  height: cell,
                  transform: `translate(${t.col * cell}px, ${t.row * cell}px)`,
                  transition: `transform ${SLIDE_MS}ms ease-in-out`,
                  zIndex: t.dying ? 1 : 2,
                }}
              >
                <div
                  key={t.gen}
                  className={`flex items-center justify-center rounded-md font-bold ${
                    t.isNew ? 'tile-appear' : t.gen > 0 ? 'tile-pop' : ''
                  }`}
                  style={{
                    margin: gap / 2,
                    width: cell - gap,
                    height: cell - gap,
                    background: style.bg,
                    color: style.fg,
                    fontSize: fontFor(t.value),
                  }}
                >
                  {t.value}
                </div>
              </div>
            )
          })}

          {won && !keepGoing && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-yellow-300/70 text-center text-neutral-800 backdrop-blur-[2px]">
              <div className="text-3xl font-extrabold">🎉 你得到 2048！</div>
              <div className="mt-1 text-sm">分數 {score}</div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setKeepGoing(true)
                    setWon(false)
                  }}
                  className="rounded-full bg-neutral-800 px-5 py-1.5 text-sm font-semibold text-white"
                >
                  繼續挑戰
                </button>
                <button
                  type="button"
                  onClick={start}
                  className="rounded-full bg-white/80 px-5 py-1.5 text-sm font-semibold text-neutral-800"
                >
                  重新開始
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </GameShell>
  )
}
