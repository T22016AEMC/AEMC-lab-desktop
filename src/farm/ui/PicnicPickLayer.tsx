import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import type { PixelEngine } from '../pixel/engine'
import { fromCss, type Rect } from '../pixel/layout'
import { MAT_H, MAT_W, MAT_SPOT_TEXT, matRectAtCursor, picnicMatRect, picnicSpotCheck } from '../pixel/picnic'

/** 選野餐位置的文字（集中在這裡） */
export const PICK_TEXT = {
  hint: '移動游標選擇野餐位置，點一下開始',
  auto: '自動選位置',
  autoTitle: '自動找位置並開始野餐',
  cancel: '取消',
  cancelTitle: '取消（Esc）',
  closeFirst: '請先關閉目前開著的視窗，再選野餐位置',
} as const

const FONT = "'Microsoft JhengHei','PingFang TC',monospace"

/**
 * v3.9.1 選野餐位置的初始預覽：上次手動選的位置（uiStore.picnicSpot）現在還放得下就用它，否則自動找位置（和「自動選位置」相同）。
 * 都沒有 = null（呼叫端進入前已確認自動位置存在，所以實際上不會是 null）。
 */
export function initialPickRect(engine: Pick<PixelEngine, 'layout'>, spot: { x0: number; y0: number } | null): Rect | null {
  if (spot) {
    const r = { x0: spot.x0, y0: spot.y0, x1: spot.x0 + MAT_W, y1: spot.y0 + MAT_H }
    if (picnicSpotCheck(engine.layout, r).ok) return r
  }
  return picnicMatRect(engine.layout)
}

/**
 * v3.9.1 選野餐位置的畫面層（uiStore.picnicPick 時顯示，蓋住畫布：寵物、入口點不到）。
 *  - 游標 = 墊子中心；預覽由引擎畫（engine.picnicGhost：半透明墊子、6 個座位、綠／紅外框），只有整數位置變了才重新判斷
 *  - 不能放：游標旁顯示原因（擺放規則風格的短句）；點一下也只提示原因，留在選位置
 *  - 能放：點一下 → 開始野餐（墊子用這個位置），記住這個位置（只在這次開著的網頁）
 *  - 「自動選位置」：和 v3.9.0 相同的自動位置、一鍵開始（不記位置）
 *  - Esc、「取消」：回到平常畫面（不扣次數、存檔不變）
 *  - 選位置中條件失效（下雨、天黑、冷卻、寵物都不能參加…）：每 0.5 秒檢查一次，失效就提示原因並離開
 */
export function PicnicPickLayer({
  engine,
  layoutVersion,
  startBlock,
  onStart,
}: {
  engine: PixelEngine
  layoutVersion: number
  startBlock: () => string | null
  onStart: (mat: Rect | null) => boolean
}) {
  void layoutVersion
  const boxRef = useRef<HTMLDivElement | null>(null)
  const tagRef = useRef<HTMLDivElement | null>(null)
  const lastKey = useRef('')
  const lastRes = useRef<{ rect: Rect; ok: boolean; reason: string | null } | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const ui = useUIStore.getState

  // 進入：寵物暫停、畫初始預覽；離開：恢復、清掉預覽
  useEffect(() => {
    engine.editing = true
    const r = initialPickRect(engine, ui().picnicSpot)
    if (r) {
      engine.picnicGhost = { rect: r, ok: true, seat: null }
      lastRes.current = { rect: r, ok: true, reason: null }
    }
    return () => {
      engine.editing = false
      engine.picnicGhost = null
    }
  }, [engine, ui])

  const blockRef = useRef(startBlock)
  blockRef.current = startBlock
  // 條件失效就離開（提示原因）
  useEffect(() => {
    const t = window.setInterval(() => {
      const why = blockRef.current()
      if (why) {
        ui().showToast(why)
        ui().setPicnicPick(false)
      }
    }, 500)
    return () => window.clearInterval(t)
  }, [ui])

  // Esc：取消（捕捉階段，不讓別的地方收到）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      ui().setPicnicPick(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ui])

  const localOf = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = boxRef.current?.getBoundingClientRect()
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) }
  }

  /** 游標在 (clientX, clientY)：算出墊子位置、判斷（位置沒變就沿用上次結果）、更新引擎的預覽 */
  const track = (clientX: number, clientY: number): { rect: Rect; ok: boolean; reason: string | null } => {
    const L = engine.layout
    const c = localOf(clientX, clientY)
    const p = fromCss(L, c.x, c.y)
    const rect = matRectAtCursor(p.x, p.y)
    const key = `${rect.x0}|${rect.y0}|${L.placement.rev}`
    const tag = tagRef.current
    if (tag) {
      tag.style.left = `${Math.round(c.x + 14)}px`
      tag.style.top = `${Math.round(c.y - 28)}px`
    }
    if (key === lastKey.current && lastRes.current) return lastRes.current
    lastKey.current = key
    const r = picnicSpotCheck(L, rect)
    const res = { rect, ok: r.ok, reason: r.ok ? null : MAT_SPOT_TEXT[r.reason] }
    lastRes.current = res
    engine.picnicGhost = { rect, ok: r.ok, seat: r.ok ? null : r.seat ?? null }
    setReason(res.reason)
    return res
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    track(e.clientX, e.clientY)
  }

  const onClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const res = track(e.clientX, e.clientY)
    if (!res.ok) {
      if (res.reason) ui().showToast(res.reason, 2200)
      return
    }
    const spot = { x0: res.rect.x0, y0: res.rect.y0 }
    if (onStart(res.rect)) ui().setPicnicSpot(spot)
  }

  return (
    <div ref={boxRef} className="absolute inset-0 z-[15]" data-testid="picnic-pick-layer" style={{ fontFamily: FONT }}>
      <div
        className="absolute inset-0"
        data-testid="picnic-pick-surface"
        data-ok={reason === null ? '1' : '0'}
        onPointerMove={onMove}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault()
          ui().setPicnicPick(false)
        }}
        style={{ cursor: 'crosshair', touchAction: 'none' }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center text-center">
        <div
          className="pointer-events-auto flex items-center gap-2 border-2 border-[#3b2a1c] bg-[#fff3d0]/95 px-2 py-1 text-xs font-bold text-[#3b2a1c] shadow-[2px_2px_0_rgba(0,0,0,0.4)]"
          data-testid="picnic-pick-banner"
        >
          <span className="px-2" data-testid="picnic-pick-hint">
            {PICK_TEXT.hint}
          </span>
          <button
            type="button"
            data-testid="picnic-pick-auto"
            title={PICK_TEXT.autoTitle}
            onClick={() => void onStart(null)}
            className="border-2 border-[#3b2a1c] bg-[#e8892b] px-2 py-px text-white hover:brightness-110"
          >
            {PICK_TEXT.auto}
          </button>
          <button
            type="button"
            data-testid="picnic-pick-cancel"
            title={PICK_TEXT.cancelTitle}
            onClick={() => ui().setPicnicPick(false)}
            className="border-2 border-[#3b2a1c] bg-white px-2 py-px hover:bg-[#ffe9b0]"
          >
            {PICK_TEXT.cancel}
          </button>
        </div>
      </div>
      {/* 不能放的原因：跟著游標（位置由 track 直接改 style，不經過 React） */}
      <div
        ref={tagRef}
        data-testid="picnic-pick-reason"
        className="pointer-events-none absolute z-20 whitespace-nowrap border-2 border-[#7a2b1c] bg-[#ffe1d6] px-2 py-px text-xs font-bold text-[#7a2b1c] shadow-[2px_2px_0_rgba(0,0,0,0.4)]"
        style={{ visibility: reason ? 'visible' : 'hidden' }}
      >
        {reason}
      </div>
    </div>
  )
}
