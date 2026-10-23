import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { getApp } from '../config/registry'
import { useUIStore } from '../store/uiStore'
import { useWindowStore } from '../store/windowStore'
import { BALANCE } from './config/balance'
import { gameNow, overrides, worldHour, worldWeather } from './overrides'
import { assets } from './pixel/assets'
import { PixelEngine, type FrameInfo } from './pixel/engine'
import * as layoutMod from './pixel/layout'
import { bowlLeft } from './sim/buildings'
import { useFarmStore } from './store/farmStore'
import { AdoptDialog } from './ui/AdoptDialog'
import { BuildLayer } from './ui/BuildLayer'
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
  const towerDoorRef = useRef<HTMLButtonElement | null>(null)
  const towerSignRef = useRef<HTMLDivElement | null>(null)
  /** 按住寵物的過程：按住約 150 ms 或移動超過 4 px 就開始拖曳；沒拖就是點擊（開氣泡選單） */
  const gesture = useRef<{ id: string; startX: number; startY: number; curX: number; curY: number; dragging: boolean; timer: number } | null>(null)
  const engine = useMemo(() => new PixelEngine(), [])
  const [selected, setSelected] = useState<string | null>(null)
  const [assetsReady, setAssetsReady] = useState(assets.ready)
  const [doorHover, setDoorHover] = useState(false)
  const [towerHover, setTowerHover] = useState(false)
  const [lit, setLit] = useState(false)
  const litRef = useRef(false)
  const [assetError, setAssetError] = useState<string | null>(null)
  const [progress, setProgress] = useState(assets.progress)

  const status = useFarmStore((s) => s.status)
  const hasSave = useFarmStore((s) => s.save !== null)
  const petCount = useFarmStore((s) => s.save?.pets.length ?? 0)
  const adoptOpen = useUIStore((s) => s.adoptOpen)
  const launchpadOpen = useUIStore((s) => s.launchpadOpen)
  const buildMode = useUIStore((s) => s.buildMode)
  /** 視窗大小改變（版面重算）時遞增，建築模式的虛線框跟著重新定位 */
  const [layoutVersion, setLayoutVersion] = useState(0)

  // 有視窗最大化時，場景被蓋住，暫停動畫
  const covered = useWindowStore((s) => Object.values(s.windows).some((w) => !w.minimized && w.maximized))
  const coveredRef = useRef(covered)
  coveredRef.current = covered

  const loadAssets = (): void => {
    setAssetError(null)
    assets.load().then(() => setAssetsReady(true), (e: Error) => setAssetError(e.message))
  }
  useEffect(() => {
    void useFarmStore.getState().init()
    const off = assets.onProgress(setProgress)
    loadAssets()
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 引擎的對外連接：水池洗澡扣點、睡覺中被拖起來醒來、提示訊息
  useEffect(() => {
    engine.hooks = {
      requestBath: (id) => useFarmStore.getState().runAction('bath', id),
      wake: (id) => useFarmStore.getState().wakeForDrag(id),
      notify: (m) => useUIStore.getState().showToast(m),
      eatAtBowl: (id) => useFarmStore.getState().eatAtBowl(id),
    }
  }, [engine])

  // 開發環境才暴露引擎，方便自動化測試取得寵物位置（正式 build 會被移除）
  useEffect(() => {
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>
      w.__farm = engine
      w.__farmStore = useFarmStore
      w.__overrides = overrides
      w.__layout = layoutMod
    }
  }, [engine])

  // 數值結算（每 10 秒）與禮物擲骰（每分鐘）。不受動畫暫停影響，用真實時間
  useEffect(() => {
    const stat = window.setInterval(() => useFarmStore.getState().tick(engine.sleepersAtBuilding()), BALANCE.statTickSeconds * 1000)
    const gift = window.setInterval(() => useFarmStore.getState().rollGift(), 60_000)
    return () => {
      window.clearInterval(stat)
      window.clearInterval(gift)
    }
  }, [engine])

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
      setLayoutVersion((n) => n + 1)
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
    let lastOwned: unknown = null
    let lastDraw = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden || coveredRef.current) {
        last = now
        return
      }
      // 高更新率螢幕最多畫到約 80 幀，省電
      if (now - lastDraw < 12) return
      lastDraw = now
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return

      const st = useFarmStore.getState()
      const nowMs = gameNow()
      const frame: FrameInfo = { nowMs, hour: worldHour(nowMs), weather: worldWeather(nowMs), gifts: st.gifts }
      if (st.save?.ownedBuildings !== lastOwned) {
        lastOwned = st.save?.ownedBuildings
        engine.setOwned(st.save?.ownedBuildings ?? [])
      }
      engine.bowlLeft = st.save ? bowlLeft(st.save, nowMs) : 0
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
      const tdoor = towerDoorRef.current
      if (tdoor) {
        const d = engine.towerDoorCss()
        tdoor.style.left = `${Math.round(d.x0)}px`
        tdoor.style.top = `${Math.round(d.y0)}px`
        tdoor.style.width = `${Math.round(d.x1 - d.x0)}px`
        tdoor.style.height = `${Math.round(d.y1 - d.y0)}px`
        tdoor.style.visibility = 'visible'
        const tsign = towerSignRef.current
        if (tsign) {
          const c = engine.towerSignCss()
          tsign.style.left = `${Math.round(c.x)}px`
          tsign.style.top = `${Math.round(c.y)}px`
          tsign.style.fontSize = `${Math.max(10, Math.round(c.scale * 4.5))}px`
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
          const l = engine.isHouseLit(worldHour(gameNow()))
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
    if (adoptOpen || launchpadOpen) {
      setSelected(null)
      useUIStore.getState().setBuildMode(false)
    }
  }, [adoptOpen, launchpadOpen])
  // 建築模式：關掉氣泡選單；沒有存檔（還沒領養）時不能進入
  useEffect(() => {
    if (buildMode) setSelected(null)
  }, [buildMode])
  useEffect(() => {
    if (!hasSave && buildMode) useUIStore.getState().setBuildMode(false)
  }, [hasSave, buildMode])

  const local = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const startDrag = (): void => {
    const g = gesture.current
    if (!g || g.dragging) return
    window.clearTimeout(g.timer)
    if (engine.beginDrag(g.id, g.startX, g.startY)) {
      g.dragging = true
      engine.dragTo(g.curX, g.curY)
      setSelected(null)
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
    } else gesture.current = null
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = local(e)
    const g = gesture.current
    if (g) {
      g.curX = p.x
      g.curY = p.y
      if (!g.dragging && Math.hypot(p.x - g.startX, p.y - g.startY) > 4) startDrag()
      if (g.dragging) {
        engine.dragTo(p.x, p.y)
        return
      }
    }
    const id = engine.pointerMove(p.x, p.y)
    e.currentTarget.style.cursor = id || engine.hitTest(p.x, p.y)?.kind === 'gift' ? 'pointer' : 'default'
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const p = local(e)
    const hit = engine.hitTest(p.x, p.y)
    if (hit?.kind === 'gift') useFarmStore.getState().collectGift(hit.id)
    else if (hit?.kind === 'pet') {
      // 走去水池的途中被點到或拖曳：取消洗澡
      engine.cancelBathWalk(hit.id)
      window.clearTimeout(gesture.current?.timer)
      gesture.current = { id: hit.id, startX: p.x, startY: p.y, curX: p.x, curY: p.y, dragging: false, timer: window.setTimeout(startDrag, 150) }
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* 部分環境不支援，忽略 */
      }
    } else setSelected(null) // 點空白處關閉
  }

  const endGesture = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean): void => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    window.clearTimeout(g.timer)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* 忽略 */
    }
    if (g.dragging) {
      engine.endDrag()
      e.currentTarget.style.cursor = 'default'
    } else if (!cancelled) setSelected(g.id) // 沒拖：單純點擊 → 氣泡選單
  }

  const onBath = (id: string): void => {
    const err = engine.sendToBath(id)
    if (err) useUIStore.getState().showToast(err)
    else {
      useUIStore.getState().hideToast()
      setSelected(null)
    }
  }

  const openHall = (): void => {
    const hall = getApp('game-hall')
    if (hall) useWindowStore.getState().openApp(hall)
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
        onPointerUp={(e) => endGesture(e, false)}
        onPointerCancel={(e) => endGesture(e, true)}
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
          {/* 鐘塔的門：滑鼠移上去換成開門版、招牌出現「遊戲」，點擊開啟遊戲館 */}
          <button
            ref={towerDoorRef}
            type="button"
            aria-label="遊戲館"
            title="遊戲館"
            data-testid="tower-door"
            className="absolute cursor-pointer bg-transparent outline-none"
            style={{ visibility: 'hidden' }}
            onMouseEnter={() => {
              engine.towerHover = true
              setTowerHover(true)
            }}
            onMouseLeave={() => {
              engine.towerHover = false
              setTowerHover(false)
            }}
            onFocus={() => {
              engine.towerHover = true
              setTowerHover(true)
            }}
            onBlur={() => {
              engine.towerHover = false
              setTowerHover(false)
            }}
            onClick={openHall}
          />
          <div
            ref={towerSignRef}
            aria-hidden
            data-testid="tower-sign"
            className="pointer-events-none absolute whitespace-nowrap border-2 border-[#3b2a1c] px-1.5 py-px font-bold leading-tight"
            style={{
              transform: 'translate(-50%, -50%)',
              visibility: towerHover ? 'visible' : 'hidden',
              background: '#ffe28a',
              color: '#5a3410',
              boxShadow: '0 0 12px 4px rgba(255,214,102,0.95), 2px 2px 0 rgba(0,0,0,0.4)',
              fontFamily: "'Microsoft JhengHei','PingFang TC',monospace",
              imageRendering: 'pixelated',
            }}
          >
            遊戲
          </div>
        </>
      )}

      {!assetsReady && !assetError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#bfe3a0] text-sm font-bold text-[#3b2a1c]">
          <div>載入中…</div>
          <div
            role="progressbar"
            aria-label="素材載入進度"
            aria-valuemin={0}
            aria-valuemax={progress.total || 1}
            aria-valuenow={progress.loaded}
            className="h-3 w-48 border-2 border-[#3b2a1c] bg-[#e8dcc0] p-px"
          >
            <div className="h-full bg-[#e8892b]" style={{ width: `${progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0}%` }} />
          </div>
          <div className="text-xs font-normal tabular-nums">
            {progress.loaded} / {progress.total || '…'}
          </div>
        </div>
      )}
      {assetError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#bfe3a0] px-6 text-center text-sm font-bold text-[#c0392b]">
          <div role="alert">{assetError}</div>
          <button type="button" className="px-btn px-3 py-1 text-xs text-[#3b2a1c]" onClick={loadAssets}>
            重試
          </button>
        </div>
      )}

      {buildMode && hasSave && assetsReady && <BuildLayer engine={engine} layoutVersion={layoutVersion} />}

      {selected && <PetMenu ref={menuRef} petId={selected} onBath={onBath} />}

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
