import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { getApp } from '../config/registry'
import { itemDef } from './config/items'
import { useUIStore } from '../store/uiStore'
import { useWindowStore } from '../store/windowStore'
import { BALANCE } from './config/balance'
import { gameNow, overrides, worldHour, worldWeather } from './overrides'
import { assets } from './pixel/assets'
import { PixelEngine, type FrameInfo } from './pixel/engine'
import * as layoutMod from './pixel/layout'
import * as findsMod from './pixel/finds'
import { bowlLeft } from './sim/buildings'
import { findsBlock } from './sim/dig'
import { useFarmStore } from './store/farmStore'
import { AdoptDialog } from './ui/AdoptDialog'
import { ShopDialog } from './ui/ShopDialog'
import { EventDialog } from './ui/EventDialog'
import { LegacyRefundNotice } from './ui/LegacyRefundNotice'
import { NewerDataNotice } from './ui/NewerDataNotice'
import { ResetNotice } from './ui/ResetNotice'
import { BuildLayer } from './ui/BuildLayer'
import { EditLayer } from './ui/EditLayer'
import { PICK_TEXT, PicnicPickLayer } from './ui/PicnicPickLayer'
import { isFarmHotkey } from './ui/farmHotkey'
import { PetMenu } from './ui/PetMenu'
import { RehomeDialog } from './ui/RehomeDialog'
import { rehomeBlock } from './sim/rehome'
import { ballCursor } from './ui/ballCursor'
import { toyOf, type PlayToyId } from './sim/commands'
import { TOOLS } from '../config/tools'
import { BoardThumbs } from './ui/BoardThumbs'
import { PICNIC_TEXT, picnicBlock, picnicEndDue, rollDecor } from './sim/picnic'
import { photoCrop, picnicSpotCheck } from './pixel/picnic'
import type { Rect } from './pixel/layout'
import { POLAROID_KEYS, DOWNLOAD_SCALE, canvasBlob, composePolaroid, cropSizeFor, photoFileName, upscale } from './ui/photo'
import { PolaroidDialog, type PolaroidShot } from './ui/PolaroidDialog'
import { PixelSprite } from './ui/PixelSprite'

/** 工具包入口在場景上的提示文字（滑鼠移上去時顯示） */
const TOOL_SPOTS = [
  { key: 'window', label: '計算機', tool: 'calc', testid: 'tower-window' },
  { key: 'clock', label: '碼表與倒數', tool: 'timer', testid: 'tower-clock' },
  { key: 'board', label: '公佈欄', tool: 'notes', testid: 'bulletin-board' },
] as const

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
  const hudRef = useRef<HTMLDivElement | null>(null)
  /** 玩耍中（丟球）：游標換成球、顯示 HUD。由主迴圈每個影格同步（引擎是唯一的真相） */
  const playingRef = useRef(false)
  const lastInvalidToast = useRef(0)
  const towerDoorRef = useRef<HTMLButtonElement | null>(null)
  const towerSignRef = useRef<HTMLDivElement | null>(null)
  /** v3.7.0：窗戶（計算機）、鐘面（碼表與倒數）、公佈欄的點擊區；公佈欄上的標題縮圖 */
  const toolBtns = useRef<Record<'window' | 'clock' | 'board', HTMLButtonElement | null>>({ window: null, clock: null, board: null })
  const boardThumbRef = useRef<HTMLDivElement | null>(null)
  const [toolHover, setToolHover] = useState<'window' | 'clock' | 'board' | null>(null)
  /** 按住寵物的過程：按住約 150 ms 或移動超過 4 px 就開始拖曳；沒拖就是點擊（開氣泡選單） */
  const gesture = useRef<{ id: string; startX: number; startY: number; curX: number; curY: number; dragging: boolean; timer: number } | null>(null)
  const engine = useMemo(() => new PixelEngine(), [])
  const [selected, setSelected] = useState<string | null>(null)
  /** 找新主人的二次確認對話框：對象寵物 id（null = 沒開） */
  const [rehomeId, setRehomeId] = useState<string | null>(null)
  const [assetsReady, setAssetsReady] = useState(assets.ready)
  const [doorHover, setDoorHover] = useState(false)
  const [towerHover, setTowerHover] = useState(false)
  const [lit, setLit] = useState(false)
  const litRef = useRef(false)
  const [assetError, setAssetError] = useState<string | null>(null)
  /** v3.8.0 野餐：相機提示按鈕、拍照閃光、拍立得成品（只在記憶體，關掉就沒了） */
  const cameraRef = useRef<HTMLButtonElement | null>(null)
  const flashRef = useRef<HTMLDivElement | null>(null)
  const shootingRef = useRef(false)
  const [shot, setShot] = useState<PolaroidShot | null>(null)
  const shotRef = useRef<PolaroidShot | null>(null)
  shotRef.current = shot
  const picnicReq = useUIStore((s) => s.picnicReq)
  const [progress, setProgress] = useState(assets.progress)

  const status = useFarmStore((s) => s.status)
  const hasSave = useFarmStore((s) => s.save !== null)
  const petCount = useFarmStore((s) => s.save?.pets.length ?? 0)
  /** 還沒有任何寵物（全新玩家，或一次性重置之後）：走第一次領養流程（第一隻免費）；重置提示或失敗說明顯示期間先不顯示 */
  const needFirst = useFarmStore((s) => (s.save === null || s.save.pets.length === 0) && !s.save?.resetNotice && !s.resetFailed && !s.newerData)
  /** v4.0：商店開著（取代領養視窗） */
  const shopOpen = useUIStore((s) => s.shopTab !== null)
  const launchpadOpen = useUIStore((s) => s.launchpadOpen)
  const aboutOpen = useUIStore((s) => s.aboutOpen)
  const collectionOpen = useUIStore((s) => s.collectionOpen)
  const toolOpen = useUIStore((s) => s.toolOpen)
  const importState = useUIStore((s) => s.importState)
  const buildMode = useUIStore((s) => s.buildMode)
  const farmTab = useUIStore((s) => s.farmTab)
  /** v3.9.1 野餐選位置中（寵物暫停、入口與相機隱藏，和編輯農場一致） */
  const picnicPick = useUIStore((s) => s.picnicPick)
  /** v3.9.0 農場（擺設）模式、v3.9.1 選野餐位置：主迴圈每個影格看這個旗標隱藏透明入口、暫停野餐墊的檢查 */
  const editingRef = useRef(false)
  editingRef.current = buildMode || picnicPick
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
      settlePlay: (id, n, toy) => useFarmStore.getState().settlePlay(id, n, toy),
      addFind: (id, kind, fx, fy) => useFarmStore.getState().addFind(id, kind, fx, fy),
    }
  }, [engine])

  // 開發環境才暴露引擎，方便自動化測試取得寵物位置（正式 build 會被移除）
  useEffect(() => {
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>
      w.__farm = engine
      w.__farmStore = useFarmStore
      w.__ui = useUIStore
      w.__overrides = overrides
      w.__layout = layoutMod
      w.__finds = findsMod
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
    let lastLayout: unknown = null
    let lastShop: unknown = null
    let lastFinds: unknown = null
    let lastSkins: unknown = null
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
      // v3.9.0：已購買的建築或農場擺放變了 → 重新算擺放結果
      // v4.0：商店買來的擺設實例（shop）變了也要重算
      if (st.save?.ownedBuildings !== lastOwned || st.save?.farmLayout !== lastLayout || st.save?.shop !== lastShop) {
        lastOwned = st.save?.ownedBuildings
        lastLayout = st.save?.farmLayout
        lastShop = st.save?.shop
        engine.setLayoutData(st.save?.ownedBuildings ?? [], st.save?.farmLayout, st.save?.shop?.decor)
      }
      engine.bowlLeft = st.save ? bowlLeft(st.save, nowMs) : 0
      if (st.save?.finds !== lastFinds) {
        lastFinds = st.save?.finds
        engine.setFinds(st.save?.finds ?? [])
      }
      // 外觀（金色屋頂、黃金鐘樓）：解鎖才載入圖集，載入完成前引擎自己退回預設圖，載入完成立刻換
      if (st.save?.skins !== lastSkins) {
        lastSkins = st.save?.skins
        engine.skins = st.save?.skins.equipped ?? {}
        if (Object.keys(engine.skins).length > 0) assets.loadGroup('skins').catch(() => {})
      }
      if (st.save?.pets !== lastPets) {
        lastPets = st.save?.pets
        engine.sync(st.save?.pets ?? [])
      }
      const effects = st.drainEffects()
      if (effects.length) engine.applyEffects(effects)
      // v3.8.0 野餐：和存檔同步（開始 → 墊子飛下來；結束 → 收掉）
      const pact = st.save?.picnic?.active
      engine.syncPicnic(pact)
      engine.update(dt, frame)
      engine.render(ctx)
      // 野餐該結束了嗎：時間到、下雨、天黑（存檔判斷）；寵物都離開了、視窗太小放不下墊子（場景判斷）
      if (pact && st.save) {
        const due = picnicEndDue(st.save, frame)
        if (due) st.endPicnic(due)
        else if (!editingRef.current && !engine.picnicMatFits()) st.endPicnic('resize')
        else if (engine.picnicParticipants() === 0) st.endPicnic('empty')
      }
      // 相機提示：墊子上有寵物坐好才出現（拍照中、拍立得開著時不顯示）；點擊區至少 24 CSS 像素
      const cam = cameraRef.current
      if (cam) {
        const r = shootingRef.current || shotRef.current || editingRef.current ? null : engine.cameraCss()
        if (r) {
          const w = Math.max(TOOLS.minHitCss, r.x1 - r.x0)
          const h = Math.max(TOOLS.minHitCss, r.y1 - r.y0)
          const cx = (r.x0 + r.x1) / 2
          const cy = (r.y0 + r.y1) / 2
          cam.style.left = `${Math.round(cx - w / 2)}px`
          cam.style.top = `${Math.round(cy - h / 2 + Math.sin(performance.now() / 300) * 1.5)}px`
          cam.style.width = `${Math.round(w)}px`
          cam.style.height = `${Math.round(h)}px`
          cam.style.visibility = 'visible'
        } else cam.style.visibility = 'hidden'
      }

      // 玩耍：游標換成球、HUD 顯示剩餘秒數與撿回次數（不擋輸入）
      const hud = engine.playHud()
      const playing = hud !== null
      if (playing !== playingRef.current) {
        playingRef.current = playing
        if (canvas) canvas.style.cursor = playing ? ballCursor(engine.layout) : 'default'
      }
      const hudEl = hudRef.current
      if (hudEl) {
        if (hud) {
          const text = hud.toy === 'ball' ? `丟球 ${hud.left} 秒・撿回 ${hud.catches}` : hud.toy === 'dig' ? `挖寶 ${hud.left} 秒・挖到 ${hud.catches} 個` : `尋寶 ${hud.left} 秒・帶回 ${hud.catches} 個`
          if (hudEl.textContent !== text) hudEl.textContent = text
          hudEl.style.visibility = 'visible'
        } else hudEl.style.visibility = 'hidden'
      }

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
      // v3.7.0 工具包的入口：時鐘上面的窗戶、鐘面、公佈欄（點擊區不足 24 CSS 像素就放大，畫面不變）
      if (toolBtns.current.window) {
        const hits = engine.toolHits(TOOLS.minHitCss)
        for (const k of ['window', 'clock', 'board'] as const) {
          const el = toolBtns.current[k]
          if (!el) continue
          const r = hits[k]
          el.style.left = `${Math.round(r.x0)}px`
          el.style.top = `${Math.round(r.y0)}px`
          el.style.width = `${Math.round(r.x1 - r.x0)}px`
          el.style.height = `${Math.round(r.y1 - r.y0)}px`
          el.style.visibility = editingRef.current ? 'hidden' : 'visible'
        }
        const th = boardThumbRef.current
        if (th) {
          const g = engine.boardGreenCss()
          th.style.left = `${Math.round(g.x0)}px`
          th.style.top = `${Math.round(g.y0)}px`
          th.style.width = `${Math.round(g.x1 - g.x0)}px`
          th.style.height = `${Math.round(g.y1 - g.y0)}px`
        }
      }
      const tdoor = towerDoorRef.current
      if (tdoor) {
        const d = engine.towerDoorCss()
        tdoor.style.left = `${Math.round(d.x0)}px`
        tdoor.style.top = `${Math.round(d.y0)}px`
        tdoor.style.width = `${Math.round(d.x1 - d.x0)}px`
        tdoor.style.height = `${Math.round(d.y1 - d.y0)}px`
        tdoor.style.visibility = editingRef.current ? 'hidden' : 'visible'
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
        door.style.visibility = engine.layout && !editingRef.current ? 'visible' : 'hidden'
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
  // 找新主人的確認對話框只跟著目前選取的寵物：選單被關掉（開領養、啟動台、工具、建築模式…）或換了寵物就一起關掉，不執行
  useEffect(() => {
    if (rehomeId && rehomeId !== selected) setRehomeId(null)
  }, [rehomeId, selected])
  // v3.8.1 滑鼠互動：只在有 hover 能力的裝置（桌面滑鼠）啟用；手機、平板永遠關閉
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const apply = () => {
      engine.hover.enabled = mq.matches
      if (!mq.matches) engine.cursorLeave()
    }
    apply()
    mq.addEventListener('change', apply)
    // 視窗失焦、分頁被藏起來：互動立即解除
    const off = () => engine.cursorLeave()
    const vis = () => {
      if (document.hidden) engine.cursorLeave()
    }
    window.addEventListener('blur', off)
    document.addEventListener('visibilitychange', vis)
    document.documentElement.addEventListener('mouseleave', off)
    return () => {
      mq.removeEventListener('change', apply)
      window.removeEventListener('blur', off)
      document.removeEventListener('visibilitychange', vis)
      document.documentElement.removeEventListener('mouseleave', off)
    }
  }, [engine])
  // 開啟啟動台、領養、建築模式、關於、收藏冊、工具、匯入、找新主人、拍立得、視窗被蓋住：滑鼠互動立即解除（引擎每個影格看這個旗標）
  useEffect(() => {
    engine.hover.blocked = Boolean(shopOpen || launchpadOpen || buildMode || picnicPick || aboutOpen || collectionOpen || toolOpen || !!importState || rehomeId !== null || shot !== null || covered)
  }, [engine, shopOpen, launchpadOpen, buildMode, picnicPick, aboutOpen, collectionOpen, toolOpen, importState, rehomeId, shot, covered])
  // 開啟遊戲視窗、啟動台、領養、建築模式、關於、匯入對話框：玩耍提前結算（只結算數值，不演開心）
  useEffect(() => {
    if (shopOpen || launchpadOpen || buildMode || picnicPick || aboutOpen || collectionOpen || toolOpen || importState) engine.endPlay('window')
  }, [engine, shopOpen, launchpadOpen, buildMode, picnicPick, aboutOpen, collectionOpen, toolOpen, importState])
  // 開工具視窗：關掉氣泡選單（建築模式由 setToolOpen 自己關）
  useEffect(() => {
    if (toolOpen) setSelected(null)
  }, [toolOpen])
  useEffect(() => {
    if (covered) engine.endPlay('window')
  }, [engine, covered])
  useEffect(
    () =>
      useWindowStore.subscribe((s, prev) => {
        if (Object.keys(s.windows).length > Object.keys(prev.windows).length) engine.endPlay('window')
      }),
    [engine],
  )
  // Esc 提前結束玩耍：只在玩耍中才處理（不影響建築模式等其他地方的 Esc）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && engine.isPlaying()) {
        e.preventDefault()
        engine.endPlay('user')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine])
  // 領養視窗或啟動台開著時，關掉氣泡選單
  useEffect(() => {
    if (shopOpen || launchpadOpen) {
      setSelected(null)
      useUIStore.getState().setBuildMode(false)
      useUIStore.getState().setPicnicPick(false)
    }
  }, [shopOpen, launchpadOpen])
  // 農場（擺設）模式、選野餐位置：關掉氣泡選單、清掉入口的滑鼠停留狀態；沒有存檔（還沒領養）時不能進入
  useEffect(() => {
    if (buildMode || picnicPick) {
      setSelected(null)
      engine.doorHover = false
      engine.towerHover = false
      setDoorHover(false)
      setTowerHover(false)
      setToolHover(null)
    }
  }, [engine, buildMode, picnicPick])
  // v3.9.0 快捷鍵 E：進出農場（擺設）模式。輸入文字、有對話框或視窗開著時不觸發（isFarmHotkey）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ui = useUIStore.getState()
      const st = useFarmStore.getState()
      const windowsOpen = Object.values(useWindowStore.getState().windows).some((w) => !w.minimized)
      const blocked = ui.shopTab !== null || ui.launchpadOpen || ui.aboutOpen || ui.collectionOpen || !!ui.toolOpen || !!ui.importState || rehomeId !== null || shotRef.current !== null || windowsOpen
      const canEnter = !!st.save && st.save.pets.length > 0
      if (ui.picnicPick) return // v3.9.1：選野餐位置中不能進出編輯農場（要先取消）
      if (!isFarmHotkey(e, blocked)) return
      if (!ui.buildMode && !canEnter) return
      e.preventDefault()
      ui.setBuildMode(!ui.buildMode)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rehomeId])
  useEffect(() => {
    if ((!hasSave || petCount === 0) && buildMode) useUIStore.getState().setBuildMode(false)
    if ((!hasSave || petCount === 0) && picnicPick) useUIStore.getState().setPicnicPick(false)
  }, [hasSave, petCount, buildMode, picnicPick])
  // v3.9.1 選野餐位置中：有對話框打開（關於、收藏冊、匯入、找新主人、拍立得、事件與存檔提示）或視窗最大化 → 取消選位置
  const farmDialog = useFarmStore((s) => s.pendingEvents.length > 0 || s.save?.resetNotice === true || s.resetFailed || s.legacyRefund > 0 || s.newerData)
  const dialogOpen = Boolean(shopOpen || aboutOpen || collectionOpen || !!importState || rehomeId !== null || shot !== null || covered || farmDialog)
  useEffect(() => {
    if (dialogOpen && useUIStore.getState().picnicPick) useUIStore.getState().setPicnicPick(false)
  }, [dialogOpen])

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
    // v3.8.1 滑鼠互動：只記下最新游標位置（O(1)），反應在下一個影格處理；只有滑鼠（觸控不啟用，不影響觸控）
    if (e.pointerType === 'mouse') engine.cursorMove(p.x, p.y)
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
    const hk = engine.hitTest(p.x, p.y)?.kind
    const over = id || hk === 'gift' || hk === 'find'
    // 玩耍中：除了別的寵物與禮物，整個畫布都是球游標
    e.currentTarget.style.cursor = over ? 'pointer' : playingRef.current ? ballCursor(engine.layout) : 'default'
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const p = local(e)
    const hit = engine.hitTest(p.x, p.y)
    if (hit?.kind === 'gift') useFarmStore.getState().collectGift(hit.id)
    else if (hit?.kind === 'find') revealAt(hit.id)
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
    } else {
      setSelected(null) // 點空白處關閉
      // 玩耍中（丟球）：點哪裡就把球丟到哪裡（不合法的位置不丟，冒一個叉叉並提示）；挖寶、尋寶是寵物自己去，點畫面沒有作用
      if (engine.isPlayingBall()) throwBall(p.x, p.y)
    }
  }

  /** 點開一個寶物：抽選與發獎在存檔層，這裡只負責動畫與浮字 */
  const revealAt = (id: string): void => {
    const pt = engine.findPointOf(id)
    const out = useFarmStore.getState().revealFind(id)
    if (!out || !pt) return
    const r = out.result
    const label = r.kind === 'coin' ? `+${r.value} 金幣` : r.kind === 'item' ? (itemDef(r.id)?.name ?? r.id) : '什麼也沒有'
    engine.showReveal(pt.x, pt.y, r, label)
  }

  /** 挖寶、尋寶選單上的玩具：寶物已滿就不能開始（提示「先點開土堆」，不扣金幣） */
  const toyBlock = (toy: PlayToyId): string | null => {
    const save = useFarmStore.getState().save
    const pet = save?.pets.find((q) => q.id === selected)
    if (!save || !pet) return null
    return toyOf(pet.species, toy)?.needsRoom ? findsBlock(save, engine.findCapNow()) : null
  }

  const throwBall = (cssX: number, cssY: number): void => {
    const r = engine.throwAtCss(cssX, cssY)
    if (!r.ok && r.message && performance.now() - lastInvalidToast.current > BALANCE.play.invalidToastGapMs) {
      lastInvalidToast.current = performance.now()
      useUIStore.getState().showToast(r.message, 1600)
    }
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
    } else if (!cancelled && !engine.actors.get(g.id)?.play) setSelected(g.id) // 沒拖：單純點擊 → 氣泡選單（玩耍中的狗不開選單）
  }

  const onBath = (id: string): void => {
    const err = engine.sendToBath(id)
    if (err) useUIStore.getState().showToast(err)
    else {
      useUIStore.getState().hideToast()
      setSelected(null)
    }
  }

  /**
   * 找新主人（確認對話框按了「確認」）：先檢查能不能（最後一隻不行），再讓引擎清掉場景上的狀態（玩耍提前結算、座位、洗澡、拖曳、選取），
   * 最後才從存檔移除、返還金幣（玩耍結算要在寵物還在存檔裡的時候做）。
   */
  const confirmRehome = (): void => {
    const id = rehomeId
    setRehomeId(null)
    if (!id) return
    const ui = useUIStore.getState()
    const save = useFarmStore.getState().save
    const name = save?.pets.find((p) => p.id === id)?.name ?? ''
    const why = save ? rehomeBlock(save, id) : '尚未開始'
    if (why) {
      ui.showToast(why)
      return
    }
    engine.removePet(id)
    const err = useFarmStore.getState().rehomePet(id)
    setSelected(null)
    ui.showToast(err ?? `已幫${name}找到新主人，返還 ${BALANCE.rehome.refund} 金幣`)
  }

  /** 氣泡選單選了玩具：先確認引擎現在能玩，再扣金幣，最後開始 */
  const onPlay = (id: string, toy: PlayToyId): void => {
    const ui = useUIStore.getState()
    const why = engine.playBlock(id)
    if (why) {
      ui.showToast(why)
      return
    }
    const err = useFarmStore.getState().startPlay(id, toy, why, engine.findCapNow())
    if (err) {
      ui.showToast(err)
      return
    }
    const bad = engine.beginPlay(id, toy)
    if (bad) {
      ui.showToast(bad)
      return
    }
    setSelected(null)
    ui.showToast(toy === 'ball' ? `點草地或走道把球丟出去・${BALANCE.play.seconds} 秒・Esc 或右鍵結束` : toy === 'dig' ? `狗狗開始挖寶・${BALANCE.dig.seconds} 秒・點土堆揭曉・Esc 或右鍵結束` : `貓咪出門尋寶・${BALANCE.dig.seconds} 秒・點布包揭曉・Esc 或右鍵結束`, 3200)
  }

  /** 現在能不能開始野餐（存檔條件、墊子放得下、有寵物可以參加）；可以 = null，否則提示文字 */
  const picnicStartBlock = (): string | null => {
    const st = useFarmStore.getState()
    const nowMs = gameNow()
    const ctx = { nowMs, hour: worldHour(nowMs), weather: worldWeather(nowMs) }
    const why = picnicBlock(st.save, ctx)
    if (why) return why
    if (!engine.picnicMatFits()) return PICNIC_TEXT.noRoom
    if (engine.picnicCandidates(st.save!.pets, ctx).length === 0) return PICNIC_TEXT.busy
    return null
  }

  /**
   * 開始野餐：mat = 手動選的墊子位置（null = 自動找位置，和 v3.9.0 完全相同）。
   * 檢查條件 → 引擎挑參加的寵物 → 存檔開始（次數、清潔、心情）→ 墊子在下一個影格飛下來。回傳 true = 開始了
   */
  const beginPicnic = (mat: Rect | null): boolean => {
    const ui = useUIStore.getState()
    const st = useFarmStore.getState()
    const nowMs = gameNow()
    const ctx = { nowMs, hour: worldHour(nowMs), weather: worldWeather(nowMs) }
    const why = picnicStartBlock()
    if (why) {
      ui.showToast(why)
      return false
    }
    if (mat && !picnicSpotCheck(engine.layout, mat).ok) return false
    const ids = engine.picnicCandidates(st.save!.pets, ctx)
    engine.choosePicnicMat(mat)
    const err = st.startPicnic(ids, rollDecor())
    if (err) {
      engine.choosePicnicMat(null)
      ui.showToast(err)
      return false
    }
    setSelected(null)
    ui.setBuildMode(false)
    ui.setPicnicPick(false)
    assets.loadGroup('polaroid').catch(() => {}) // 相框先載入，拍照時不用等
    ui.showToast(`野餐開始！${ids.length} 隻寵物參加・${BALANCE.picnic.seconds / 60} 分鐘・寵物坐好後點相機拍照`, 3600)
    return true
  }

  /**
   * v3.9.1 選單列按了「野餐」：條件都符合才進入選位置（不符合沿用原本的提示，例如「草地太擠…」）。
   * 選位置中再按一次 = 取消。對話框開著不進入；啟動台、工具視窗自動關掉；編輯農場先離開（拖到一半的退回原位）；
   * 正在被拖著的寵物先放下。
   */
  useEffect(() => {
    if (picnicReq === 0) return
    const ui = useUIStore.getState()
    if (ui.picnicPick) {
      ui.setPicnicPick(false)
      return
    }
    if (dialogOpen) {
      ui.showToast(PICK_TEXT.closeFirst)
      return
    }
    const why = picnicStartBlock()
    if (why) {
      ui.showToast(why)
      return
    }
    if (ui.launchpadOpen) ui.setLaunchpadOpen(false)
    if (ui.toolOpen) ui.setToolOpen(null)
    if (ui.buildMode) ui.setBuildMode(false)
    if (engine.isDragging()) {
      gesture.current = null
      engine.endDrag()
      if (canvasRef.current) canvasRef.current.style.cursor = 'default'
    }
    setSelected(null)
    ui.setPicnicPick(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picnicReq])

  /** 點相機：墊上的寵物換開心姿勢 → 閃光 → 場景快照、裁切、放進隨機一款相框 → 跳出拍立得（可下載 PNG）。不加心情、不存檔 */
  const shoot = async (): Promise<void> => {
    if (shootingRef.current) return
    const mat = engine.picnicMat()
    if (!mat || engine.picnicCheer() === 0) return
    shootingRef.current = true
    try {
      const scene = engine.snapshot()
      const el = flashRef.current
      if (el?.animate) el.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' })
      await assets.loadGroup('polaroid')
      const key = POLAROID_KEYS[Math.floor(Math.random() * POLAROID_KEYS.length)]
      const frame = assets.get(key)
      const win = frame?.meta?.window
      if (!scene || !frame || !win) throw new Error('相框還沒載入')
      const { w, h } = cropSizeFor(win)
      const crop = photoCrop(engine.layout, mat, w, h)
      // v3.10.0：拍照當下取一次時間（遊戲時間來源），相框日期與下載檔名用同一個
      const shotAt = new Date(gameNow())
      const photo = composePolaroid(scene, crop, frame, win, shotAt)
      const [b1, b2] = await Promise.all([canvasBlob(photo), canvasBlob(upscale(photo, DOWNLOAD_SCALE))])
      if (!b1 || !b2) throw new Error('瀏覽器無法產生圖片')
      setShot({ url: URL.createObjectURL(b1), downloadUrl: URL.createObjectURL(b2), fileName: photoFileName(shotAt), w: photo.width, h: photo.height, frame: key })
    } catch (e) {
      useUIStore.getState().showToast('拍照失敗：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      shootingRef.current = false
    }
  }
  const closeShot = (): void => {
    setShot((s) => {
      if (s) {
        URL.revokeObjectURL(s.url)
        URL.revokeObjectURL(s.downloadUrl)
      }
      return null
    })
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
        onPointerLeave={() => engine.cursorLeave()}
        onContextMenu={(e) => {
          // 玩耍中右鍵 = 提前結束（只有玩耍中才攔截，其他時候維持瀏覽器原本的行為）
          if (engine.isPlaying()) {
            e.preventDefault()
            engine.endPlay('user')
          }
        }}
      />

      {/* 玩耍的 HUD：選單列的下面、場景上方正中央，不擋輸入；底色與邊框固定，日夜都看得清楚 */}
      <div
        ref={hudRef}
        aria-hidden
        data-testid="play-hud"
        className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 whitespace-nowrap border-2 border-[#3b2a1c] bg-[#fff6df] px-2.5 py-0.5 text-xs font-bold tabular-nums text-[#3b2a1c]"
        style={{ visibility: 'hidden', boxShadow: '2px 2px 0 rgba(0,0,0,0.4)', fontFamily: "'Microsoft JhengHei','PingFang TC',monospace" }}
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
          {/* v3.7.0 公佈欄上的標題縮圖（不擋點擊；點擊由下面的公佈欄按鈕處理） */}
          <div ref={boardThumbRef} aria-hidden className="pointer-events-none absolute overflow-hidden" data-testid="board-thumbs">
            <BoardThumbs engine={engine} layoutVersion={layoutVersion} />
          </div>
          {/* v3.7.0 工具包入口：時鐘上面的窗戶 → 計算機、鐘面 → 碼表與倒數、公佈欄 → 公佈欄。滑鼠移上去游標變手指並顯示名稱 */}
          {TOOL_SPOTS.map((t) => (
            <button
              key={t.key}
              ref={(el) => {
                toolBtns.current[t.key] = el
              }}
              type="button"
              aria-label={t.label}
              title={t.label}
              data-testid={t.testid}
              className="absolute cursor-pointer bg-transparent outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ffe28a]"
              style={{ visibility: 'hidden' }}
              onMouseEnter={() => setToolHover(t.key)}
              onMouseLeave={() => setToolHover((h) => (h === t.key ? null : h))}
              onFocus={() => setToolHover(t.key)}
              onBlur={() => setToolHover((h) => (h === t.key ? null : h))}
              onClick={() => useUIStore.getState().setToolOpen(t.tool)}
            >
              <span
                aria-hidden
                data-testid={`${t.testid}-label`}
                className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap border-2 border-[#3b2a1c] px-1.5 py-px text-xs font-bold leading-tight"
                style={{
                  visibility: toolHover === t.key ? 'visible' : 'hidden',
                  background: '#ffe28a',
                  color: '#5a3410',
                  boxShadow: '0 0 10px 3px rgba(255,214,102,0.9), 2px 2px 0 rgba(0,0,0,0.4)',
                  fontFamily: "'Microsoft JhengHei','PingFang TC',monospace",
                }}
              >
                {t.label}
              </span>
            </button>
          ))}
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

      {/* v3.8.0 野餐：相機提示（墊子上有寵物坐好才出現，點了拍照）與拍照閃光（白色、0.45 秒淡出、不擋點擊） */}
      {assetsReady && (
        <button
          ref={cameraRef}
          type="button"
          aria-label="拍照"
          title="拍照"
          data-testid="picnic-camera"
          className="absolute z-20 flex cursor-pointer items-center justify-center bg-transparent outline-none focus-visible:outline-2 focus-visible:outline-[#ffe28a]"
          style={{ visibility: 'hidden' }}
          onClick={() => void shoot()}
        >
          <PixelSprite frame="picnic_camera" scale={engine.layout.S / engine.layout.dpr} title="相機" />
        </button>
      )}
      <div ref={flashRef} aria-hidden data-testid="picnic-flash" className="pointer-events-none absolute inset-0 z-40 bg-white" style={{ opacity: 0 }} />
      {shot && <PolaroidDialog shot={shot} onClose={closeShot} />}

      {buildMode && hasSave && assetsReady && <EditLayer engine={engine} layoutVersion={layoutVersion} />}
      {picnicPick && !buildMode && hasSave && assetsReady && (
        <PicnicPickLayer engine={engine} layoutVersion={layoutVersion} startBlock={picnicStartBlock} onStart={beginPicnic} />
      )}
      {buildMode && hasSave && assetsReady && farmTab === 'buy' && <BuildLayer engine={engine} layoutVersion={layoutVersion} />}

      {selected && <PetMenu ref={menuRef} petId={selected} onBath={onBath} onPlay={onPlay} playBlock={engine.playBlock(selected)} toyBlock={toyBlock} onRehome={setRehomeId} />}
      {rehomeId && <RehomeDialog petId={rehomeId} onCancel={() => setRehomeId(null)} onConfirm={confirmRehome} />}

      {status === 'ready' && assetsReady && needFirst && <AdoptDialog first />}
      {status === 'ready' && assetsReady && <ResetNotice />}
      {status === 'ready' && assetsReady && <LegacyRefundNotice />}
      {status === 'ready' && assetsReady && <NewerDataNotice />}
      {status === 'ready' && assetsReady && <EventDialog />}
      {hasSave && !needFirst && shopOpen && assetsReady && <ShopDialog engine={engine} />}

      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </div>
  )
}
