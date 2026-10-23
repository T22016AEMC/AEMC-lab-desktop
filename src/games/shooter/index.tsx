import { useRef, useState } from 'react'
import type { BuiltinAppProps } from '../../types'
import { FitCanvas, beginFrame } from '../shared/FitCanvas'
import { GameShell } from '../shared/GameShell'
import { useAnimationFrame, useBest, useGameStatus, useKeys, useRoundReward } from '../shared/hooks'
import { playSfx, type Sfx } from '../shared/sound'
import { drawShooter } from './draw'
import { H, W, createState, movePlayerBy, update, type ShooterState } from './engine'

const SFX_MAP: Record<string, Sfx> = {
  shoot: 'shoot',
  hit: 'hit',
  explode: 'explode',
  power: 'power',
  lose: 'lose',
  win: 'win',
}

/** 觸控／滑鼠拖曳：飛機跟著手指移動的相對位移（邏輯座標） */
export default function Shooter(props: BuiltinAppProps) {
  const game = useGameStatus(props)
  const reward = useRoundReward('game-shooter')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const state = useRef<ShooterState>(createState())
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const [score, setScore] = useState(0)
  const [wave, setWave] = useState(0)
  const [newRecord, setNewRecord] = useState(false)
  const { best, submit } = useBest('shooter:best')
  const shownScore = useRef(0)

  const start = () => {
    state.current = createState()
    shownScore.current = 0
    setScore(0)
    setWave(0)
    setNewRecord(false)
    reward.arm()
    game.start()
  }

  const keyHandler = (down: boolean) => (e: KeyboardEvent) => {
    const inp = state.current.input
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        inp.left = down
        return true
      case 'ArrowRight':
      case 'd':
      case 'D':
        inp.right = down
        return true
      case 'ArrowUp':
      case 'w':
      case 'W':
        inp.up = down
        return true
      case 'ArrowDown':
      case 's':
      case 'S':
        inp.down = down
        return true
    }
    return false
  }
  const listening = props.active && !props.minimized && game.status === 'playing'
  useKeys(keyHandler(true), keyHandler(false), listening)

  // 離開遊玩狀態時放開所有方向鍵，避免回來時飛機自己亂跑
  if (game.status !== 'playing') {
    const inp = state.current.input
    inp.left = inp.right = inp.up = inp.down = false
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (game.status !== 'playing') return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const canvas = canvasRef.current
    if (!d || d.id !== e.pointerId || game.status !== 'playing' || !canvas) return
    const k = W / canvas.getBoundingClientRect().width
    movePlayerBy(state.current, (e.clientX - d.x) * k, (e.clientY - d.y) * k)
    d.x = e.clientX
    d.y = e.clientY
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  useAnimationFrame((dt) => {
    const s = state.current
    if (game.status === 'playing') {
      update(s, dt)
      for (const ev of s.events) playSfx(SFX_MAP[ev])
      s.events.length = 0
      if (s.score !== shownScore.current) {
        shownScore.current = s.score
        setScore(s.score)
      }
      setWave((w) => (w === s.wave ? w : s.wave))
      if (s.over) {
        setNewRecord(submit(s.score))
        reward.report({ score: s.score })
        game.finish()
      }
    } else if (game.status === 'over') {
      update(s, dt) // 讓最後的爆炸播完
    }
    const canvas = canvasRef.current
    if (canvas) drawShooter(beginFrame(canvas, W, H), s)
  })

  return (
    <GameShell
      title="飛機打怪"
      icon="✈️"
      appProps={props}
      status={game.status}
      onStart={start}
      onResume={game.resume}
      onPause={game.pause}
      onRestart={start}
      overBanner
      help={[
        '飛機會自動射擊；方向鍵或 WASD 移動，也可用滑鼠／手指拖曳',
        '擊落敵機得分，每 5 波會有 Boss',
        '🅿 火力升級（最高 5 級）、🅢 護盾（8 秒免傷）；被打中會降 1 級火力',
      ]}
      overTitle="飛機被擊落了"
      overDetail={
        <>
          得分 {score}，撐到第 {wave} 波{newRecord ? '（新紀錄！）' : ''}
        </>
      }
      stats={
        <>
          <span>分數 {score}</span>
          <span className="text-white/60">最高分 {best ?? 0}</span>
          <span className="text-white/60">第 {wave} 波</span>
        </>
      }
    >
      <div
        className="h-full w-full touch-none p-1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <FitCanvas width={W} height={H} canvasRef={canvasRef} />
      </div>
    </GameShell>
  )
}
