import { useRef, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import type { BuiltinAppProps } from '../../types'
import { FitCanvas, beginFrame } from '../shared/FitCanvas'
import { GameShell } from '../shared/GameShell'
import { useAnimationFrame, useBest, useElementSize, useGameStatus, useKeys, useSwipe } from '../shared/hooks'
import { playSfx } from '../shared/sound'
import { COLS, ROWS, isOpposite, newState, step, tickInterval, type Dir, type SnakeState } from './logic'

const CELL = 24
const W = COLS * CELL
const H = ROWS * CELL

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function draw(ctx: CanvasRenderingContext2D, s: SnakeState, time: number) {
  // 棋盤格背景
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#14231b' : '#182a20'
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
    }
  }
  // 食物（蘋果，輕微跳動）
  const pulse = 1 + Math.sin(time / 180) * 0.06
  const fx = s.food.x * CELL + CELL / 2
  const fy = s.food.y * CELL + CELL / 2
  ctx.save()
  ctx.translate(fx, fy)
  ctx.scale(pulse, pulse)
  ctx.shadowColor = 'rgba(255,80,80,0.8)'
  ctx.shadowBlur = 10
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(0, 1, CELL * 0.36, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#22c55e'
  ctx.beginPath()
  ctx.ellipse(3, -CELL * 0.34, 4, 2, -0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 蛇身：從頭到尾顏色漸淡
  const n = s.body.length
  for (let i = n - 1; i >= 0; i--) {
    const p = s.body[i]
    const t = n > 1 ? i / (n - 1) : 0
    ctx.fillStyle = `hsl(${140 - t * 20}, ${70 - t * 15}%, ${52 - t * 18}%)`
    roundRect(ctx, p.x * CELL + 1.5, p.y * CELL + 1.5, CELL - 3, CELL - 3, i === 0 ? 8 : 6)
    ctx.fill()
  }
  // 眼睛
  const head = s.body[0]
  const dx = s.dir === 'left' ? -1 : s.dir === 'right' ? 1 : 0
  const dy = s.dir === 'up' ? -1 : s.dir === 'down' ? 1 : 0
  const cx = head.x * CELL + CELL / 2
  const cy = head.y * CELL + CELL / 2
  for (const side of [-1, 1]) {
    const ex = cx + dx * 5 + -dy * side * 5
    const ey = cy + dy * 5 + dx * side * 5
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(ex, ey, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.arc(ex + dx * 1.2, ey + dy * 1.2, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
  if (!s.alive) {
    ctx.fillStyle = 'rgba(239,68,68,0.25)'
    ctx.fillRect(0, 0, W, H)
  }
}

export default function Snake(props: BuiltinAppProps) {
  const game = useGameStatus(props)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const state = useRef<SnakeState>(newState())
  const queue = useRef<Dir[]>([])
  const acc = useRef(0)
  const clock = useRef(0)
  const [score, setScore] = useState(0)
  const { best, submit } = useBest('snake:best')
  const [newRecord, setNewRecord] = useState(false)
  const touch = useMediaQuery('(pointer: coarse)')
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  // 橫向（寬大於高）時方向鍵放在右側，避免壓縮棋盤
  const sideways = area.width > area.height * 1.15

  const reset = () => {
    state.current = newState()
    queue.current = []
    acc.current = 0
    setScore(0)
    setNewRecord(false)
  }

  const start = () => {
    reset()
    game.start()
  }

  const steer = (dir: Dir) => {
    if (game.status !== 'playing') return
    const q = queue.current
    const last = q.length ? q[q.length - 1] : state.current.dir
    if (dir === last || isOpposite(dir, last) || q.length >= 2) return
    q.push(dir)
  }

  const listening = props.active && !props.minimized && game.status === 'playing'
  useKeys(
    (e) => {
      const dir = KEY_DIR[e.key]
      if (!dir) return false
      steer(dir)
      return true
    },
    null,
    listening,
  )
  const swipe = useSwipe(steer, 18)

  useAnimationFrame((dt) => {
    clock.current += dt * 1000
    if (game.status === 'playing') {
      acc.current += dt * 1000
      let guard = 0
      while (acc.current >= tickInterval(state.current.score) && state.current.alive && guard++ < 5) {
        acc.current -= tickInterval(state.current.score)
        const dir = queue.current.shift() ?? state.current.dir
        const before = state.current.score
        state.current = step(state.current, dir)
        if (state.current.score !== before) {
          setScore(state.current.score)
          playSfx('eat')
        }
        if (!state.current.alive) {
          setNewRecord(submit(state.current.score))
          playSfx('lose')
          game.finish()
          break
        }
      }
    }
    const canvas = canvasRef.current
    if (canvas) draw(beginFrame(canvas, W, H), state.current, clock.current)
  })

  const level = Math.floor((150 - tickInterval(score)) / 15) + 1

  const dpad = (dir: Dir, label: string, cls: string) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault()
        steer(dir)
      }}
      className={`absolute flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-lg active:bg-white/30 ${cls}`}
    >
      {label}
    </button>
  )

  return (
    <GameShell
      title="貪食蛇"
      icon="🐍"
      appProps={props}
      status={game.status}
      onStart={start}
      onResume={game.resume}
      onPause={game.pause}
      onRestart={start}
      overBanner
      help={['方向鍵或 WASD 控制方向', '觸控裝置：在畫面上滑動，或用下方方向鍵', '吃越多越快，撞牆或撞到自己就結束']}
      overTitle="遊戲結束"
      overDetail={
        <>
          得分 {score}
          {newRecord ? '（新紀錄！）' : ''}
        </>
      }
      stats={
        <>
          <span>分數 {score}</span>
          <span className="text-white/60">最高分 {best ?? 0}</span>
          <span className="text-white/60">速度 Lv.{level}</span>
        </>
      }
    >
      <div
        ref={areaRef}
        {...swipe}
        className={`flex h-full w-full touch-none ${sideways ? 'flex-row items-center' : 'flex-col'}`}
      >
        <div className="h-full min-h-0 min-w-0 flex-1 p-2">
          <FitCanvas width={W} height={H} canvasRef={canvasRef} />
        </div>
        {touch && (
          <div className={`relative h-[120px] w-[150px] shrink-0 ${sideways ? 'mr-3' : 'mx-auto mb-2'}`}>
            {dpad('up', '▲', 'left-[53px] top-0')}
            {dpad('left', '◀', 'left-0 top-[38px]')}
            {dpad('right', '▶', 'right-0 top-[38px]')}
            {dpad('down', '▼', 'left-[53px] top-[76px]')}
          </div>
        )}
      </div>
    </GameShell>
  )
}
