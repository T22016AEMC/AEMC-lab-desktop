import { useEffect, useRef, useState } from 'react'
import type { BuiltinAppProps } from '../../types'
import { FitCanvas, beginFrame } from '../shared/FitCanvas'
import { GameShell } from '../shared/GameShell'
import { useAnimationFrame, useBest, useGameStatus, useKeys } from '../shared/hooks'
import { playSfx, type Sfx } from '../shared/sound'
import { drawPinball } from './draw'
import { H, START_LIVES, W, createPinball, type Pinball, type PinballEvent, type Phase } from './engine'

const SFX_MAP: Record<PinballEvent, Sfx> = {
  bounce: 'bounce',
  flip: 'flip',
  launch: 'launch',
  hit: 'hit',
  bonus: 'win',
  lose: 'lose',
  over: 'lose',
}

export default function PinballGame(props: BuiltinAppProps) {
  const game = useGameStatus(props)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tableRef = useRef<Pinball | null>(null)
  // 懶建立：React StrictMode 會在開發模式下卸載再掛載一次，所以銷毀後要能重新建立
  const getTable = (): Pinball => (tableRef.current ??= createPinball())
  const pointers = useRef(new Map<number, 'left' | 'right'>())
  const keysDown = useRef({ left: false, right: false, plunger: false })

  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(START_LIVES)
  const [phase, setPhase] = useState<Phase>('waiting')
  const [newRecord, setNewRecord] = useState(false)
  const { best, submit } = useBest('pinball:best')

  useEffect(
    () => () => {
      tableRef.current?.destroy()
      tableRef.current = null
    },
    [],
  )

  const releaseAll = () => {
    const pb = getTable()
    pointers.current.clear()
    keysDown.current = { left: false, right: false, plunger: false }
    pb.setFlipper('left', false)
    pb.setFlipper('right', false)
    pb.charging = false
  }

  const start = () => {
    tableRef.current?.destroy()
    tableRef.current = createPinball()
    releaseAll()
    setScore(0)
    setLives(START_LIVES)
    setPhase('waiting')
    setNewRecord(false)
    game.start()
  }

  // 暫停或離開遊戲時放開所有按鍵
  useEffect(() => {
    if (game.status !== 'playing') releaseAll()
  }, [game.status])

  const syncFlippers = () => {
    const pb = getTable()
    const touchL = [...pointers.current.values()].includes('left')
    const touchR = [...pointers.current.values()].includes('right')
    pb.setFlipper('left', keysDown.current.left || touchL)
    pb.setFlipper('right', keysDown.current.right || touchR)
  }

  const keyHandler = (down: boolean) => (e: KeyboardEvent) => {
    switch (e.key) {
      case 'z':
      case 'Z':
      case 'ArrowLeft':
        keysDown.current.left = down
        syncFlippers()
        return true
      case '/':
      case '?':
      case 'ArrowRight':
        keysDown.current.right = down
        syncFlippers()
        return true
      case ' ':
      case 'ArrowDown':
        if (keysDown.current.plunger !== down) {
          keysDown.current.plunger = down
          getTable().setPlunger(down)
        }
        return true
    }
    return false
  }
  const listening = props.active && !props.minimized && game.status === 'playing'
  useKeys(keyHandler(true), keyHandler(false), listening)

  // 觸控／滑鼠：點畫面左半邊控制左擋板，右半邊控制右擋板
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (game.status !== 'playing') return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    pointers.current.set(e.pointerId, e.clientX - rect.left < rect.width / 2 ? 'left' : 'right')
    syncFlippers()
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    syncFlippers()
  }

  useAnimationFrame((dt) => {
    const pb = getTable()
    if (game.status === 'playing') {
      pb.update(dt)
      for (const ev of pb.events) playSfx(SFX_MAP[ev])
      pb.events.length = 0
      setScore((s) => (s === pb.score ? s : pb.score))
      setLives((l) => (l === pb.lives ? l : pb.lives))
      setPhase((p) => (p === pb.phase ? p : pb.phase))
      if (pb.phase === 'over') {
        setNewRecord(submit(pb.score))
        game.finish()
      }
    }
    const canvas = canvasRef.current
    if (canvas) drawPinball(beginFrame(canvas, W, H), pb)
  })

  return (
    <GameShell
      title="彈珠台"
      icon="🎱"
      appProps={props}
      status={game.status}
      onStart={start}
      onResume={game.resume}
      onPause={game.pause}
      onRestart={start}
      overBanner
      help={[
        '鍵盤：Z 左擋板、/ 右擋板（也可用 ← →）；按住空白鍵蓄力，放開發射',
        '觸控：點畫面左半邊或右半邊控制擋板；按住下方「發射」按鈕蓄力，放開發射',
        '撞擊彈跳器、彈弓、立靶得分；點亮三個通道或三個立靶有額外獎勵。共 3 顆球',
      ]}
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
          <span title="剩餘球數">{'●'.repeat(Math.max(0, lives))}</span>
        </>
      }
    >
      <div
        className="relative h-full w-full touch-none p-1"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <FitCanvas width={W} height={H} canvasRef={canvasRef} />
        {phase === 'waiting' && game.status === 'playing' && (
          <button
            type="button"
            aria-label="按住蓄力，放開發射"
            onPointerDown={(e) => {
              e.stopPropagation() // 不要同時觸發擋板
              e.currentTarget.setPointerCapture(e.pointerId)
              getTable().setPlunger(true)
            }}
            onPointerUp={() => getTable().setPlunger(false)}
            onPointerCancel={() => getTable().setPlunger(false)}
            className="absolute bottom-3 right-3 z-10 touch-none select-none rounded-full bg-gradient-to-b from-amber-300 to-orange-500 px-5 py-3 text-sm font-bold text-slate-900 shadow-lg shadow-black/40 active:scale-95"
          >
            發射
          </button>
        )}
      </div>
    </GameShell>
  )
}
