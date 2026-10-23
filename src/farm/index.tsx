import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import { useWindowStore } from '../store/windowStore'
import { BALANCE } from './config/balance'
import { overrides, worldHour, worldWeather } from './overrides'
import { assets } from './pixel/assets'
import { PixelEngine, type FrameInfo } from './pixel/engine'
import { useFarmStore } from './store/farmStore'
import { AdoptDialog } from './ui/AdoptDialog'
import { PetMenu } from './ui/PetMenu'

// 測試模式面板：只在開發環境載入。正式 build 時 import.meta.env.DEV 會被替換成 false，
// 這個分支連同動態 import 的內容都會被整段移除。
const DevPanel = import.meta.env.DEV ? lazy(() => import('../dev/DevPanel')) : null

/** 養殖場：像素風的草地場景。寵物、住家（啟動台入口）、氣泡選單、領養都在這裡 */
export function Farm() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const doorRef = useRef<HTMLButtonElement | null>(null)
  const signRef = useRef<HTMLDivElement | null>(null)
  const engine = useMemo(() => new PixelEngine(), [])
  const [selected, setSelected] = useState<string | null>(null)
  const [assetsReady, setAssetsReady] = useState(assets.ready)
  const [doorHover, setDoorHover] = useState(false)
  const [lit, setLit] = useState(false)
  const litRef = useRef(false)
  const [assetError, setAssetError] = useState<string | null>(null)

  const status = useFarmStore((s) => s.status)
  const hasSave = useFarmStore((s) => s.save !== null)
  const petCount = useFarmStore((s) => s.save?.pets.length ?? 0)
  const adoptOpen = useUIStore((s) => s.adoptOpen)
  const launchpadOpen = useUIStore((s) => s.launchpadOpen)

  // 有視窗最大化時，場景被蓋住，暫停動畫
  const covered = useWindowStore((s) => Object.values(s.windows).some((w) => !w.minimized && w.maximized))
  const coveredRef = useRef(covered)
  coveredRef.current = covered

  useEffect(() => {
    void useFarmStore.getState().init()
    assets.load().then(() => setAssetsReady(true), (e: Error) => setAssetError(e.message))
  }, [])

  // 開發環境才暴露引擎，方便自動化測試取得寵物位置（正式 build 會被移除）
  useEffect(() => {
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>
      w.__farm = engine
      w.__farmStore = useFarmStore
      w.__overrides = overrides
    }
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

  // 畫布大小：貼合容器（選單列以下的整個可視區域），以裝置像素計，所以放大倍率是整數、不會模糊
  useEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    if (!box || !canvas) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(box.clientWidth * dpr))
      const h = Math.max(1, Math.round(box.clientHeight * dpr))
      canvas.width = w
      canvas.height = h
      engine.setSize(w, h, dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(box)
    window.addEventListener('resize', resize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [engine])

  // 主迴圈：分頁在背景或被視窗蓋住時不更新也不繪製
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastPets: unknown = null
    let lastDraw = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden || coveredRef.current) {
        last = now
        return
      }
      // 高更新率螢幕也只畫到約 60 幀，省電
      if (now - lastDraw < 15) return
      lastDraw = now
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return

      const st = useFarmStore.getState()
      const nowMs = Date.now()
      const frame: FrameInfo = { nowMs, hour: worldHour(nowMs), weather: worldWeather(nowMs), gifts: st.gifts }
      if (st.save?.pets !== lastPets) {
        lastPets = st.save?.pets
        engine.sync(st.save?.pets ?? [])
      }
      const effects = st.drainEffects()
      if (effects.length) engine.applyEffects(effects)
      engine.update(dt, frame)
      engine.render(ctx)

      // 疊在畫布上的 DOM（氣泡選單、門牌）跟著場景走
      const menu = menuRef.current
      if (menu && engine.selectedId) {
        const head = engine.headOf(engine.selectedId)
        if (head) {
          const p = engine.cssOf(head.x, head.y)
          const boxEl = boxRef.current
          const maxX = (boxEl?.clientWidth ?? 9999) - 112
          menu.style.left = `${Math.max(112, Math.min(maxX, Math.round(p.x)))}px`
          menu.style.top = `${Math.max(menu.offsetHeight + 8, Math.round(p.y) - 8)}px`
          menu.style.visibility = 'visible'
        }
      }
      const door = doorRef.current
      if (door) {
        const d = engine.doorCss()
        door.style.left = `${Math.round(d.x0)}px`
        door.style.top = `${Math.round(d.y0)}px`
        door.style.width = `${Math.round(d.x1 - d.x0)}px`
        door.style.height = `${Math.round(d.y1 - d.y0)}px`
        door.style.visibility = engine.layout ? 'visible' : 'hidden'
        const sign = signRef.current
        if (sign) {
          sign.style.left = `${Math.round((d.x0 + d.x1) / 2)}px`
          sign.style.top = `${Math.round(d.y0 - 4)}px`
          sign.style.fontSize = `${Math.max(10, Math.round((d.x1 - d.x0) * 0.2))}px`
          // 夜晚住家亮燈，門牌也跟著微微發亮（滑鼠移上去更亮）
          const l = engine.isHouseLit(worldHour(Date.now()))
          if (l !== litRef.current) {
            litRef.current = l
            setLit(l)
          }
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  // 選取的寵物同步給引擎（氣泡選單開著時牠會停下來）；寵物不見了就關閉
  useEffect(() => {
    engine.selectedId = selected
  }, [engine, selected])
  useEffect(() => {
    if (selected && !useFarmStore.getState().save?.pets.some((p) => p.id === selected)) setSelected(null)
  }, [petCount, selected])
  // 領養視窗或啟動台開著時，關掉氣泡選單
  useEffect(() => {
    if (adoptOpen || launchpadOpen) setSelected(null)
  }, [adoptOpen, launchpadOpen])

  const local = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = local(e)
    const id = engine.pointerMove(p.x, p.y)
    e.currentTarget.style.cursor = id || engine.hitTest(p.x, p.y)?.kind === 'gift' ? 'pointer' : 'default'
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = local(e)
    const hit = engine.hitTest(p.x, p.y)
    if (hit?.kind === 'gift') useFarmStore.getState().collectGift(hit.id)
    else if (hit?.kind === 'pet') setSelected(hit.id)
    else setSelected(null) // 點空白處關閉
  }

  const openLaunchpad = () => useUIStore.getState().setLaunchpadOpen(true)

  return (
    <div ref={boxRef} className="absolute inset-x-0 bottom-0 top-[28px] overflow-hidden bg-sky-300">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ imageRendering: 'pixelated' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      />

      {/* 住家的門：滑鼠移上去開門、門牌發亮，點擊開啟啟動台（夜晚維持亮燈版，只有門牌發亮） */}
      {assetsReady && (
        <>
          <button
            ref={doorRef}
            type="button"
            aria-label="啟動台"
            title="啟動台"
            data-testid="launchpad-door"
            className="absolute cursor-pointer bg-transparent outline-none"
            style={{ visibility: 'hidden' }}
            onMouseEnter={() => {
              engine.doorHover = true
              setDoorHover(true)
            }}
            onMouseLeave={() => {
              engine.doorHover = false
              setDoorHover(false)
            }}
            onFocus={() => {
              engine.doorHover = true
              setDoorHover(true)
            }}
            onBlur={() => {
              engine.doorHover = false
              setDoorHover(false)
            }}
            onClick={openLaunchpad}
          />
          <div
            ref={signRef}
            aria-hidden
            className="pointer-events-none absolute whitespace-nowrap border-2 border-[#3b2a1c] px-1.5 py-px font-bold leading-tight"
            style={{
              transform: 'translate(-50%, -100%)',
              background: doorHover ? '#ffe28a' : lit ? '#f0c060' : '#c9893f',
              color: doorHover || lit ? '#5a3410' : '#fff3d0',
              boxShadow: doorHover
                ? '0 0 12px 4px rgba(255,214,102,0.95), 2px 2px 0 rgba(0,0,0,0.4)'
                : lit
                  ? '0 0 7px 2px rgba(255,214,102,0.55), 2px 2px 0 rgba(0,0,0,0.4)'
                  : '2px 2px 0 rgba(0,0,0,0.4)',
              fontFamily: "'Microsoft JhengHei','PingFang TC',monospace",
              imageRendering: 'pixelated',
            }}
          >
            啟動台
          </div>
        </>
      )}

      {!assetsReady && !assetError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#bfe3a0] text-sm font-bold text-[#3b2a1c]">載入中…</div>
      )}
      {assetError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#bfe3a0] px-6 text-center text-sm font-bold text-[#c0392b]">
          {assetError}，請重新整理網頁
        </div>
      )}

      {selected && <PetMenu ref={menuRef} petId={selected} />}

      {hasSave && assetsReady && (
        <button
          type="button"
          className="px-btn absolute bottom-2 left-2 z-20 px-3 py-1.5 text-sm"
          onClick={() => useUIStore.getState().setAdoptOpen(true)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          ＋ 領養
        </button>
      )}

      {status === 'ready' && assetsReady && !hasSave && <AdoptDialog first />}
      {hasSave && adoptOpen && <AdoptDialog />}

      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </div>
  )
}
