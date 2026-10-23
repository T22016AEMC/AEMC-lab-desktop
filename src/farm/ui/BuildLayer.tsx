import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { PURCHASABLE, buildingDef, type BuildingId } from '../config/buildings'
import { buildingAvailability, buildingSlots, slotBox, SLOT_UNAVAILABLE_MESSAGE, toCss } from '../pixel/layout'
import type { PixelEngine } from '../pixel/engine'
import { useFarmStore } from '../store/farmStore'

/**
 * 建築模式的畫面層：草地與走道上顯示本版可購買的虛線空位（名稱＋價格），已購買的不再顯示；
 * 點空位彈出小卡片（名稱、價格、一句功能說明、購買）。視窗放不下的建築不顯示空位，改顯示提示。
 * 其他 5 個空位（遊樂設施、營火、野餐墊、花圃、沙坑）v3.3.0 才開放，這裡不會出現。
 * layoutVersion：視窗大小改變（版面重算）時遞增，讓虛線框跟著重新定位。
 */
export function BuildLayer({ engine, layoutVersion }: { engine: PixelEngine; layoutVersion: number }) {
  const owned = useFarmStore((s) => s.save?.ownedBuildings)
  const points = useFarmStore((s) => s.save?.points ?? 0)
  const [cardId, setCardId] = useState<BuildingId | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  void layoutVersion

  // Esc 離開建築模式（卡片一併關閉）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        useUIStore.getState().setBuildMode(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const L = engine.layout
  const slots = buildingSlots(L)
  const avail = buildingAvailability(L)
  const todo = PURCHASABLE.filter((id) => !owned?.includes(id))
  const hidden = todo.filter((id) => !avail.find((a) => a.id === id)?.available)
  const cssW = (L.W * L.S) / L.dpr

  const buy = (id: BuildingId): void => {
    const def = buildingDef(id)
    const err = useFarmStore.getState().buyBuilding(id)
    if (err) useUIStore.getState().showToast(err)
    else {
      useUIStore.getState().showToast(`購買了${def?.name ?? ''}（−${def?.price ?? 0} 金幣）`)
      setCardId(null)
    }
  }

  const card = cardId ? slots.find((s) => s.id === cardId) : null
  const cardDef = cardId ? buildingDef(cardId) : null
  const renderCard = () => {
    if (!card || !cardDef) return null
    const b = slotBox(card)
    const a = toCss(L, (b.x0 + b.x1) / 2, b.y0)
    const bt = toCss(L, (b.x0 + b.x1) / 2, b.y1)
    const CARD_W = 236
    const left = Math.max(6, Math.min(cssW - CARD_W - 6, Math.round(a.x - CARD_W / 2)))
    // 優先放在空位上方；上方放不下就放下方
    const above = a.y - 150 >= 6
    const style: React.CSSProperties = above ? { left, top: Math.round(a.y - 8), transform: 'translateY(-100%)', width: CARD_W } : { left, top: Math.round(bt.y + 8), width: CARD_W }
    const enough = points >= cardDef.price
    return (
      <div
        data-testid="build-card"
        role="dialog"
        aria-label={`購買${cardDef.name}`}
        className="pointer-events-auto absolute z-30 border-2 border-[#3b2a1c] bg-[#fff3d0] p-2.5 text-[#3b2a1c] shadow-[3px_3px_0_rgba(0,0,0,0.45)]"
        style={{ ...style, fontFamily: "'Microsoft JhengHei','PingFang TC',monospace" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <b className="text-sm">{cardDef.name}</b>
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold tabular-nums">🪙 {cardDef.price}</span>
            <button type="button" aria-label="關閉" onClick={() => setCardId(null)} className="px-1 text-sm leading-none text-[#5a3410]/70 hover:text-[#3b2a1c]">
              ✕
            </button>
          </span>
        </div>
        <p className="mt-1 text-xs leading-snug text-[#5a3410]">{cardDef.blurb}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-[#5a3410]/80 tabular-nums">目前 {points} 金幣</span>
          <button
            type="button"
            data-testid="build-buy"
            disabled={!enough}
            onClick={() => buy(cardDef.id)}
            className="border-2 border-[#3b2a1c] bg-[#e8892b] px-3 py-0.5 text-sm font-bold text-white enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:bg-[#b9ab94] disabled:text-[#6b5a44]"
          >
            {enough ? '購買' : '金幣不足'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0 z-20" data-testid="build-layer">
      <div
        data-testid="build-banner"
        className="pointer-events-none absolute inset-x-0 top-2 flex flex-col items-center gap-1 text-center"
        style={{ fontFamily: "'Microsoft JhengHei','PingFang TC',monospace" }}
      >
        <div className="border-2 border-[#3b2a1c] bg-[#fff3d0]/95 px-3 py-0.5 text-xs font-bold text-[#3b2a1c] shadow-[2px_2px_0_rgba(0,0,0,0.4)]">
          建築模式：點虛線空位購買（再按一次「建築」或 Esc 離開）
        </div>
        {hidden.length > 0 && (
          <div data-testid="build-unavailable" className="border-2 border-[#7a2b1c] bg-[#ffe1d6]/95 px-3 py-0.5 text-xs font-bold text-[#7a2b1c] shadow-[2px_2px_0_rgba(0,0,0,0.4)]">
            {SLOT_UNAVAILABLE_MESSAGE}
          </div>
        )}
        {todo.length === 0 && <div className="border-2 border-[#3b2a1c] bg-[#e4f5d0]/95 px-3 py-0.5 text-xs font-bold text-[#2f5a1c]">本版的建築都買齊了</div>}
      </div>

      {todo.map((id) => {
        const slot = slots.find((s) => s.id === id)
        const def = buildingDef(id)
        if (!slot || !def) return null
        const b = slotBox(slot)
        const p0 = toCss(L, b.x0, b.y0)
        const p1 = toCss(L, b.x1, b.y1)
        const active = cardId === id
        return (
          <button
            key={id}
            type="button"
            data-testid={`slot-${id}`}
            aria-label={`${def.name}，${def.price} 金幣`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setCardId(active ? null : id)}
            className={`pointer-events-auto absolute flex flex-col items-center justify-center gap-0.5 border-2 border-dashed text-center outline-none transition-colors ${
              active ? 'border-[#ffe28a] bg-white/30' : 'border-white/90 bg-white/15 hover:bg-white/30'
            }`}
            style={{ left: Math.round(p0.x), top: Math.round(p0.y), width: Math.round(p1.x - p0.x), height: Math.round(p1.y - p0.y), fontFamily: "'Microsoft JhengHei','PingFang TC',monospace" }}
          >
            <span className="bg-[#2b1d12]/75 px-1.5 text-sm font-bold text-white">{def.name}</span>
            <span className="bg-[#2b1d12]/75 px-1.5 text-xs font-bold tabular-nums text-[#ffe28a]">🪙 {def.price}</span>
          </button>
        )
      })}
      {renderCard()}
    </div>
  )
}
