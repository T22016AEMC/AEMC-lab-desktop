import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { BALANCE } from './config/balance'
import { getMetrics } from '../lib/layout'
import { useWindowStore } from '../store/windowStore'
import { worldHour, worldWeather } from './overrides'
import { FarmEngine, type FrameInfo } from './render/engine'
import { useFarmStore } from './store/farmStore'
import { CommandPanel } from './ui/CommandPanel'
import { FirstPetPicker } from './ui/FirstPetPicker'
import { PetCard } from './ui/PetCard'

/** 場景動畫的幀率上限 */
const FRAME_MS = 1000 / 30

// 測試模式面板：只在開發環境載入。正式 build 時 import.meta.env.DEV 會被替換成 false，
// 這個分支連同動態 import 的內容都會被整段移除。
const DevPanel = import.meta.env.DEV ? lazy(() => import('../dev/DevPanel')) : null

export function Farm() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const engine = useMemo(() => new FarmEngine(), [])
  const [selected, setSelected] = useState<{ id: string; x: number; y: number } | null>(null)

  const status = useFarmStore((s) => s.status)
  const hasSave = useFarmStore((s) => s.save !== null)

  // 有視窗最大化時，場景被蓋住，暫停動畫
  const covered = useWindowStore((s) => Object.values(s.windows).some((w) => !w.minimized && w.maximized))
  const coveredRef = useRef(covered)
  coveredRef.current = covered

  useEffect(() => {
    void useFarmStore.getState().init()
  }, [])

  // 開發環境才暴露引擎，方便自動化測試取得生物位置（正式 build 會被移除）
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __farm?: FarmEngine }).__farm = engine
  }, [engine])

  // 數值結算（每 10 秒）與禮物擲骰（每分鐘）。不受動畫暫停影響，用真實時間
  useEffect(() => {
    const stat = window.setInterval(() => useFarmStore.getState().tick(), BALANCE.statTickSeconds * 1000)
    const gift = window.setInterval(() => useFarmStore.getState().rollGift(), 60_000)
    return () => {
      window.clearInterval(stat)
      window.clearInterval(gift)
    }
  }, [])

  // 畫布大小跟隨容器
  useEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    if (!box || !canvas) return
    const resize = () => {
      const w = Math.max(1, box.clientWidth)
      const h = Math.max(1, box.clientHeight)
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      engine.setSize(w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(box)
    return () => ro.disconnect()
  }, [engine])

  // 主迴圈：30fps；分頁在背景或被視窗蓋住時不更新也不繪製
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastPets: unknown = null
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden || coveredRef.current) {
        last = now
        return
      }
      const elapsed = now - last
      if (elapsed < FRAME_MS - 2) return
      last = now
      const dt = Math.min(0.1, elapsed / 1000)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return

      const st = useFarmStore.getState()
      const nowMs = Date.now()
      const hour = worldHour(nowMs)
      const frame: FrameInfo = { nowMs, hour, weather: worldWeather(nowMs), gifts: st.gifts }
      const pets = st.save?.pets ?? []
      if (st.save?.pets !== lastPets) {
        lastPets = st.save?.pets
        engine.sync(pets, nowMs)
      }
      const effects = st.drainEffects()
      if (effects.length) engine.applyEffects(effects, hour >= 19.5 || hour < 5)
      engine.update(dt, frame)
      engine.render(ctx, canvas.width / engine.layout.cssW, frame)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const hit = engine.hitTest(px, py)
    if (hit?.kind === 'gift') {
      useFarmStore.getState().collectGift(hit.id)
    } else if (hit?.kind === 'pet') {
      setSelected({ id: hit.id, x: px, y: py })
    } else setSelected(null)
  }

  const { menuBar } = getMetrics()

  return (
    <div ref={boxRef} className="absolute inset-x-0 bottom-0 overflow-hidden bg-sky-300" style={{ top: menuBar }}>
      <canvas ref={canvasRef} className="block h-full w-full" onPointerDown={onPointerDown} />
      {status === 'ready' && !hasSave && <FirstPetPicker />}
      {hasSave && <CommandPanel />}
      {selected && <PetCard petId={selected.id} x={selected.x} y={selected.y} onClose={() => setSelected(null)} />}
      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </div>
  )
}
