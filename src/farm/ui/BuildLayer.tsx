import { useRef, useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { PURCHASABLE, buildingDef, type BuildingId } from '../config/buildings'
import { buildingSlots, slotBox, toCss } from '../pixel/layout'
import { DEFAULT_POS, resolvePlacement } from '../pixel/placement'
import { canPlace, layoutWith } from '../pixel/placeRules'
import type { PixelEngine } from '../pixel/engine'
import { useFarmStore } from '../store/farmStore'

/**
 * 農場模式（v3.9.0 起和擺設模式是同一個模式）裡的購買：在沒買的建築的預設位置顯示虛線框（名稱＋價格）＝「買了會放在哪裡」；
 * 已購買的（包含收進庫存的）不再顯示。點虛線框彈出小卡片（名稱、價格、一句功能說明、購買）。
 * 購買時預設位置被其他擺設佔住（擺放規則判斷不合法）→ 買下後直接放進庫存並提示（buyBuilding 的 storeIt）。
 * v3.9.0 起場景固定，不再有「視窗太小放不下」的提示。橫幅與 Esc 由擺設模式（EditLayer）處理。
 * layoutVersion：視窗大小改變（版面重算）時遞增，讓虛線框跟著重新定位。
 */
/** 買下但預設位置被佔住、放進倉庫時的提示卡文字（購買分頁橫幅下方，不自動消失，附「到編輯分頁擺放」按鈕） */
export const BOUGHT_TO_INVENTORY = (name: string): string => `${name}的預設位置被其他擺設佔住，已放進倉庫。請切到編輯分頁，從倉庫拿出來擺`
export function BuildLayer({ engine, layoutVersion }: { engine: PixelEngine; layoutVersion: number }) {
  const owned = useFarmStore((s) => s.save?.ownedBuildings)
  const points = useFarmStore((s) => s.save?.points ?? 0)
  const [cardId, setCardId] = useState<BuildingId | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  void layoutVersion

  const L = engine.layout
  const slots = buildingSlots(L)
  const todo = PURCHASABLE.filter((id) => !owned?.includes(id))
  // 畫布的 CSS 寬度（v3.9.0 起場景可能置中、左右有延伸區，卡片以整個畫布為界）
  const cssW = L.backW / L.dpr

  const buy = (id: BuildingId): void => {
    const def = buildingDef(id)
    const save = useFarmStore.getState().save
    // 預設位置現在放得下嗎：假設已經買了（擺在預設位置），用擺放規則判斷
    const d = DEFAULT_POS[id]
    const T = save ? layoutWith(L, resolvePlacement([...save.ownedBuildings, id], save.farmLayout)) : null
    const blocked = !T || !d || !canPlace(T, id, d.x, d.y).ok
    const err = useFarmStore.getState().buyBuilding(id, blocked)
    if (err) useUIStore.getState().showToast(err)
    else {
      const name = def?.name ?? ''
      useUIStore.getState().showToast(`購買了${name}（−${def?.price ?? 0} 金幣）`)
      useUIStore.getState().setFarmBuyNotice(blocked ? name : null)
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
      {/* 「本版的建築都買齊了」由編輯農場的橫幅（EditLayer）顯示在橫幅下方，和提示卡排在一起不重疊 */}

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
