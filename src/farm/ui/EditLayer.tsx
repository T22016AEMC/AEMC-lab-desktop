import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { LAYOUT_ITEMS, layoutItemDef } from '../config/layoutItems'
import { PURCHASABLE } from '../config/buildings'
import type { PixelEngine } from '../pixel/engine'
import { beginInventoryDrag, beginSceneDrag, cantStoreText, dropDecision, footAt, isDragMove, type EditDrag } from '../pixel/editDrag'
import { BOUGHT_TO_INVENTORY } from './BuildLayer'
import { fromCss, rectCss } from '../pixel/layout'
import { KIND_GEOM, placementToLayout, resolvePlacement, spriteBoxAt, withMove } from '../pixel/placement'
import { PLACE_REASON_TEXT, canPlace, canStore } from '../pixel/placeRules'
import { useFarmStore } from '../store/farmStore'
import { PixelSprite } from './PixelSprite'

/** 擺設模式的文字（集中在這裡，不寫死在別處） */
export const EDIT_TEXT = {
  tabBuy: '購買',
  tabEdit: '編輯',
  hintBuy: '點虛線框購買建築',
  hintEdit: '拖曳移動，拖到倉庫收起',
  restore: '還原預設',
  done: '完成',
  doneTitle: '完成（E 或 Esc）',
  inventory: '倉庫',
  inventoryEmpty: '倉庫是空的',
  store: '收進倉庫',
  cantStore: '不能收進倉庫',
  toEdit: '到編輯分頁擺放',
  confirmTitle: '還原預設擺設',
  confirmBody: '所有擺設會回到預設位置；花槽、珊瑚石堆、灌木、高草叢會收進倉庫。確定嗎？',
  confirmOk: '確定還原',
  cancel: '取消',
  restored: '擺設已還原成預設',
  picnicWarn: '野餐進行中：離開擺設模式時如果放不下野餐墊，野餐會提前結束',
  stored: (name: string): string => `${name}已收進倉庫`,
} as const

const FONT = "'Microsoft JhengHei','PingFang TC',monospace"

interface DragState {
  d: EditDrag
  startX: number
  startY: number
  moved: boolean
  foot: { x: number; y: number } | null
  ok: boolean
  reason: string | null
  overInv: boolean
  cx: number
  cy: number
}

/**
 * v3.9.0 擺設模式（農場模式）的畫面層。拖曳邏輯在 pixel/editDrag.ts（純邏輯），這裡只把指標事件轉成呼叫：
 *  - 按下場景上的物件 → 移動超過 4 CSS 像素才算拖曳（沒超過 = 點一下，選取並顯示小卡片）
 *  - 拖曳中即時用擺放規則判斷，不合法時物件疊紅色、游標旁顯示原因；放開時合法就寫入存檔，不合法退回原位並提示
 *  - 拖到下方庫存列 = 收進庫存（住家、鐘樓、池塘、公佈欄不行）；從庫存列拖出來擺到場景
 *  - Esc：拖曳中取消（退回原位）；有選取時取消選取；否則離開擺設模式
 * 進入時引擎暫停寵物（engine.editing），畫面層隱藏畫布上的透明入口（farm/index.tsx）。
 *
 * 兩個分頁（uiStore.farmTab，只記在這次開著的網頁）：購買 = 只有建築的虛線框（BuildLayer）、透明遮罩擋住畫布（不能拖曳、點不到寵物）；
 * 編輯 = 拖曳、倉庫列、收進倉庫、還原預設。切換分頁時拖曳中的物件退回原位、清掉選取。兩個分頁都暫停寵物。
 */
export function EditLayer({ engine, layoutVersion }: { engine: PixelEngine; layoutVersion: number }) {
  const farmLayout = useFarmStore((s) => s.save?.farmLayout)
  const owned = useFarmStore((s) => s.save?.ownedBuildings)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const invRef = useRef<HTMLDivElement | null>(null)
  const checkKey = useRef('')
  void layoutVersion
  /** 庫存列與選取卡片用存檔直接算的擺放結果（引擎要到下一個影格才換新的，不能等它） */
  const P = useMemo(() => resolvePlacement(owned ?? [], farmLayout), [owned, farmLayout])

  const tab = useUIStore((s) => s.farmTab)
  const buyNotice = useUIStore((s) => s.farmBuyNotice)
  const editing = tab === 'edit'
  const ui = useUIStore.getState
  const setD = (v: DragState | null): void => {
    dragRef.current = v
    setDrag(v)
  }

  // 進入：寵物暫停；野餐中提示。離開：恢復、清掉拖曳與選取的標記
  useEffect(() => {
    engine.editing = true
    if (useFarmStore.getState().save?.picnic?.active) ui().showToast(EDIT_TEXT.picnicWarn, 4200)
    return () => {
      engine.editing = false
      engine.editGhost = null
      engine.editSelected = null
    }
  }, [engine, ui])
  useEffect(() => {
    engine.editSelected = selected
  }, [engine, selected])
  // 切換分頁：拖曳中的物件退回原位（取消拖曳）、清掉選取與確認視窗
  useEffect(() => {
    engine.editGhost = null
    checkKey.current = ''
    dragRef.current = null
    setDrag(null)
    setSelected(null)
    setConfirm(false)
  }, [engine, tab])

  const localOf = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = boxRef.current?.getBoundingClientRect()
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) }
  }
  const overInventory = (clientX: number, clientY: number): boolean => {
    const r = invRef.current?.getBoundingClientRect()
    return !!r && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
  }

  /** 拖曳中：算出腳底位置、判斷合法、更新引擎的拖曳標記 */
  const track = (st: DragState, clientX: number, clientY: number): DragState => {
    const L = engine.layout
    const c = localOf(clientX, clientY)
    const p = fromCss(L, c.x, c.y)
    const overInv = overInventory(clientX, clientY)
    const inScene = p.x >= 0 && p.x <= L.W && p.y >= 0 && p.y <= L.H
    const foot = overInv || !inScene ? null : footAt(st.d, p.x, p.y)
    let ok = st.ok
    let reason = st.reason
    if (foot) {
      const key = `${st.d.id}|${foot.x}|${foot.y}|${L.placement.rev}`
      if (key !== checkKey.current) {
        checkKey.current = key
        const r = canPlace(L, st.d.id, foot.x, foot.y)
        ok = r.ok
        reason = r.ok ? null : PLACE_REASON_TEXT[r.reason]
      }
      const def = layoutItemDef(st.d.id)
      engine.editGhost = def ? { id: st.d.id, kind: def.kind, x: foot.x, y: foot.y, ok } : null
    } else {
      engine.editGhost = null
      ok = false
      reason = overInv ? (st.d.source === 'scene' && !canStore(L, st.d.id) ? cantStoreText(layoutItemDef(st.d.id)?.name ?? '') : null) : null
    }
    return { ...st, foot, ok, reason, overInv, cx: c.x, cy: c.y }
  }

  /** 放開：依 dropDecision 寫入存檔、收進庫存、或退回並提示 */
  const finish = (st: DragState): void => {
    engine.editGhost = null
    checkKey.current = ''
    const L = engine.layout
    const dec = dropDecision(L, st.d, st.foot, st.overInv)
    const name = layoutItemDef(st.d.id)?.name ?? ''
    const store = useFarmStore.getState()
    if (dec.kind === 'place') store.setFarmLayout(placementToLayout(withMove(L.placement, st.d.id, dec.x, dec.y)))
    else if (dec.kind === 'store') {
      store.setFarmLayout(placementToLayout(withMove(L.placement, st.d.id, null, null)))
      ui().showToast(EDIT_TEXT.stored(name), 1800)
      setSelected(null)
    } else if (dec.kind === 'revert') ui().showToast(dec.reason, 2500)
  }

  // 拖曳中（含還沒超過門檻的按住）：指標移動、放開、取消都在 window 上收（游標可以移出這一層、移到庫存列）
  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent): void => {
      const st = dragRef.current
      if (!st) return
      const c = localOf(e.clientX, e.clientY)
      if (!st.moved && !isDragMove(c.x - st.startX, c.y - st.startY)) return
      if (!st.moved && st.d.source === 'scene') {
        // 開始拖建築：坐在上面的寵物先回到地面
        engine.releaseUsersOf(st.d.id)
        setSelected(null)
      }
      setD(track({ ...st, moved: true }, e.clientX, e.clientY))
    }
    const up = (e: PointerEvent): void => {
      const st = dragRef.current
      setD(null)
      if (!st) return
      if (!st.moved) {
        engine.editGhost = null
        // 沒拖：點一下 = 選取（從庫存列點一下不做事）
        if (st.d.source === 'scene') setSelected((s) => (s === st.d.id ? null : st.d.id))
        return
      }
      finish(track(st, e.clientX, e.clientY))
    }
    const cancel = (): void => {
      engine.editGhost = null
      setD(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])

  // Esc：拖曳中取消；有選取時取消選取；確認視窗開著時關掉它；否則離開擺設模式（捕捉階段，不讓別的地方收到）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      if (dragRef.current) {
        engine.editGhost = null
        checkKey.current = ''
        setD(null)
      } else if (confirm) setConfirm(false)
      else if (selected) setSelected(null)
      else ui().setBuildMode(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [engine, confirm, selected, ui])

  const onScenePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    // 購買分頁：遮罩只擋住畫布，不能拖曳、不能選取
    if (e.button !== 0 || confirm || !editing) return
    const c = localOf(e.clientX, e.clientY)
    const L = engine.layout
    const id = engine.objectAt(c.x, c.y)
    if (!id) {
      setSelected(null)
      return
    }
    const p = fromCss(L, c.x, c.y)
    const d = beginSceneDrag(L.placement, id, p.x, p.y)
    if (!d) return
    e.preventDefault()
    setD({ d, startX: c.x, startY: c.y, moved: false, foot: null, ok: true, reason: null, overInv: false, cx: c.x, cy: c.y })
  }

  const onInventoryPointerDown = (e: React.PointerEvent<HTMLButtonElement>, id: string): void => {
    if (e.button !== 0 || confirm || !editing) return
    const d = beginInventoryDrag(engine.layout.placement, id)
    if (!d) return
    e.preventDefault()
    const c = localOf(e.clientX, e.clientY)
    setSelected(null)
    setD({ d, startX: c.x, startY: c.y, moved: false, foot: null, ok: false, reason: null, overInv: true, cx: c.x, cy: c.y })
  }

  const storeSelected = (): void => {
    const L = engine.layout
    if (!selected || !canStore(L, selected)) return
    const name = layoutItemDef(selected)?.name ?? ''
    useFarmStore.getState().setFarmLayout(placementToLayout(withMove(L.placement, selected, null, null)))
    ui().showToast(EDIT_TEXT.stored(name), 1800)
    setSelected(null)
  }

  const restore = (): void => {
    setConfirm(false)
    setSelected(null)
    useFarmStore.getState().restoreDefaultLayout()
    ui().showToast(EDIT_TEXT.restored, 1800)
  }

  const L = engine.layout
  const stored = LAYOUT_ITEMS.filter((d) => P.stored.has(d.id))
  const sel = selected ? P.placed.get(selected) : undefined
  const selBox = sel ? rectCss(L, spriteBoxAt(sel.kind, sel.x, sel.y)) : null
  const cssW = L.backW / L.dpr

  return (
    <div ref={boxRef} className="absolute inset-0 z-[15]" data-testid="edit-layer" style={{ fontFamily: FONT }}>
      {/* 遮罩：蓋在畫布上，寵物、入口都點不到；編輯分頁時也是拖曳層 */}
      <div className="absolute inset-0" data-testid="edit-surface" onPointerDown={onScenePointerDown} style={{ cursor: drag?.moved ? 'grabbing' : 'default', touchAction: 'none' }} />

      <div className="pointer-events-none absolute inset-x-0 top-2 flex flex-col items-center gap-1 text-center">
        <div className="pointer-events-auto flex items-center gap-2 border-2 border-[#3b2a1c] bg-[#fff3d0]/95 px-2 py-1 text-xs font-bold text-[#3b2a1c] shadow-[2px_2px_0_rgba(0,0,0,0.4)]" data-testid="edit-banner">
          <div role="tablist" aria-label="編輯農場" className="flex gap-1">
            {(['buy', 'edit'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                data-testid={`farm-tab-${t}`}
                onClick={() => ui().setFarmTab(t)}
                className={`border-2 border-[#3b2a1c] px-2.5 py-px ${tab === t ? 'bg-[#3b2a1c] text-[#ffe28a]' : 'bg-white hover:bg-[#ffe9b0]'}`}
              >
                {t === 'buy' ? EDIT_TEXT.tabBuy : EDIT_TEXT.tabEdit}
              </button>
            ))}
          </div>
          <span className="px-2" data-testid="edit-hint">
            {editing ? EDIT_TEXT.hintEdit : EDIT_TEXT.hintBuy}
          </span>
          {editing && (
            <button type="button" data-testid="edit-restore" onClick={() => setConfirm(true)} className="border-2 border-[#3b2a1c] bg-white px-2 py-px hover:bg-[#ffe9b0]">
              {EDIT_TEXT.restore}
            </button>
          )}
          <button type="button" data-testid="edit-done" title={EDIT_TEXT.doneTitle} onClick={() => ui().setBuildMode(false)} className="border-2 border-[#3b2a1c] bg-[#e8892b] px-2 py-px text-white hover:brightness-110">
            {EDIT_TEXT.done}
          </button>
        </div>
        {!editing && PURCHASABLE.every((id) => owned?.includes(id)) && (
          <div data-testid="build-all-done" className="border-2 border-[#3b2a1c] bg-[#e4f5d0]/95 px-3 py-0.5 text-xs font-bold text-[#2f5a1c]">
            本版的建築都買齊了
          </div>
        )}
        {/* 購買分頁：預設位置被佔住、放進倉庫的提示卡（不自動消失） */}
        {!editing && buyNotice && (
          <div data-testid="buy-notice" className="pointer-events-auto flex max-w-[92%] items-center gap-2 border-2 border-[#7a4b1c] bg-[#fff0c8] px-3 py-1 text-xs font-bold text-[#5a3410] shadow-[2px_2px_0_rgba(0,0,0,0.4)]">
            <span>{BOUGHT_TO_INVENTORY(buyNotice)}</span>
            <button type="button" data-testid="buy-notice-go" onClick={() => ui().setFarmTab('edit')} className="shrink-0 border-2 border-[#3b2a1c] bg-[#e8892b] px-2 py-px text-white hover:brightness-110">
              {EDIT_TEXT.toEdit}
            </button>
            <button type="button" aria-label="關閉" data-testid="buy-notice-close" onClick={() => ui().setFarmBuyNotice(null)} className="shrink-0 px-1 leading-none text-[#5a3410]/70">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 選取中的物件：小卡片（名稱、收進倉庫） */}
      {editing && sel && selBox && (
        <div
          data-testid="edit-card"
          className="absolute z-10 border-2 border-[#3b2a1c] bg-[#fff3d0] px-2 py-1.5 text-xs text-[#3b2a1c] shadow-[3px_3px_0_rgba(0,0,0,0.45)]"
          style={{ left: Math.max(6, Math.min(cssW - 150, Math.round((selBox.x0 + selBox.x1) / 2 - 70))), top: Math.max(40, Math.round(selBox.y0 - 46)), width: 140 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between font-bold">
            <span>{layoutItemDef(sel.id)?.name}</span>
            <button type="button" aria-label="關閉" onClick={() => setSelected(null)} className="px-1 leading-none text-[#5a3410]/70">
              ✕
            </button>
          </div>
          {canStore(L, sel.id) ? (
            <button type="button" data-testid="edit-store" onClick={storeSelected} className="mt-1 w-full border-2 border-[#3b2a1c] bg-white py-px font-bold hover:bg-[#ffe9b0]">
              {EDIT_TEXT.store}
            </button>
          ) : (
            <div className="mt-1 text-[#7a2b1c]" data-testid="edit-cant-store">
              {EDIT_TEXT.cantStore}
            </div>
          )}
        </div>
      )}

      {/* 不能放的原因：跟著游標 */}
      {drag?.moved && drag.reason && (
        <div
          data-testid="edit-reason"
          className="pointer-events-none absolute z-20 whitespace-nowrap border-2 border-[#7a2b1c] bg-[#ffe1d6] px-2 py-px text-xs font-bold text-[#7a2b1c] shadow-[2px_2px_0_rgba(0,0,0,0.4)]"
          style={{ left: Math.round(drag.cx + 14), top: Math.round(drag.cy - 28) }}
        >
          {drag.reason}
        </div>
      )}

      {/* 倉庫列（只在編輯分頁） */}
      {editing && (
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
        <div
          ref={invRef}
          data-testid="edit-inventory"
          className={`pointer-events-auto flex max-w-[95%] items-center gap-1.5 overflow-x-auto border-2 px-2 py-1 shadow-[2px_2px_0_rgba(0,0,0,0.4)] ${drag?.moved && drag.overInv ? (drag.reason ? 'border-[#c0392b] bg-[#ffe1d6]/95' : 'border-[#2f7a1c] bg-[#e4f5d0]/95') : 'border-[#3b2a1c] bg-[#fff3d0]/95'}`}
        >
          <span className="shrink-0 text-xs font-bold text-[#3b2a1c]">{EDIT_TEXT.inventory}</span>
          {stored.length === 0 && <span className="px-2 text-xs text-[#5a3410]/80" data-testid="edit-inventory-empty">{EDIT_TEXT.inventoryEmpty}</span>}
          {stored.map((d) => {
            const key = KIND_GEOM[d.kind].sprite
            return (
              <button
                key={d.id}
                type="button"
                data-testid={`inv-${d.id}`}
                title={`${d.name}（拖到場景上擺放）`}
                onPointerDown={(e) => onInventoryPointerDown(e, d.id)}
                className="flex h-14 w-14 shrink-0 cursor-grab flex-col items-center justify-end border-2 border-[#3b2a1c]/60 bg-white/70 pb-0.5 hover:bg-white"
                style={{ touchAction: 'none' }}
              >
                {key ? <PixelSprite frame={key} scale={1} fit={36} /> : <span className="text-[10px]">？</span>}
                <span className="text-[10px] font-bold leading-tight text-[#3b2a1c]">{d.name}</span>
              </button>
            )
          })}
        </div>
      </div>
      )}

      {confirm && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40" onPointerDown={(e) => e.stopPropagation()}>
          <div role="dialog" aria-label={EDIT_TEXT.confirmTitle} data-testid="edit-confirm" className="w-80 border-2 border-[#3b2a1c] bg-[#fff3d0] p-4 text-[#3b2a1c] shadow-[4px_4px_0_rgba(0,0,0,0.45)]">
            <div className="text-sm font-bold">{EDIT_TEXT.confirmTitle}</div>
            <p className="mt-2 text-xs leading-relaxed">{EDIT_TEXT.confirmBody}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" data-testid="restore-cancel" autoFocus onClick={() => setConfirm(false)} className="border-2 border-[#3b2a1c] bg-white px-3 py-0.5 text-xs font-bold">
                {EDIT_TEXT.cancel}
              </button>
              <button type="button" data-testid="restore-ok" onClick={restore} className="border-2 border-[#3b2a1c] bg-[#c0392b] px-3 py-0.5 text-xs font-bold text-white">
                {EDIT_TEXT.confirmOk}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
