import { layoutItemDef } from '../config/layoutItems'
import type { Layout } from './layout'
import { PLACE_ORDER, envCovers, envelopeOf, type Placement } from './placement'
import { PLACE_REASON_TEXT, canPlace, canStore } from './placeRules'

/**
 * v3.9.0 擺設模式（農場模式）的拖曳邏輯（純邏輯，不碰 DOM，可在 Node 測試）。畫面層（ui/EditLayer.tsx）只負責把指標事件轉成這裡的呼叫。
 *
 *  - 按下：pickObject 用不透明像素找「最上層」的物件（點到透明的地方不會抓到後面的東西；寵物、寶物在擺設模式點不到）
 *  - 移動超過 CLICK_SLOP_CSS（4 CSS 像素）才算拖曳；沒超過就是「點一下」（選取，旁邊出現小卡片）
 *  - 放開：dropDecision 決定擺上去／收進庫存／退回原位（附原因）／取消
 *  - Esc：拖曳中 = 取消（退回原位，存檔不變）
 */

/** 點一下和拖曳的分界：按下後移動超過這麼多 CSS 像素才算拖曳 */
export const CLICK_SLOP_CSS = 4

export const isDragMove = (dxCss: number, dyCss: number): boolean => Math.hypot(dxCss, dyCss) > CLICK_SLOP_CSS

/** 畫的前後順序（後畫的在上層）：腳底 y 大的在前；一樣時依 PLACE_ORDER（排在後面的後畫） */
function drawRank(P: Placement): string[] {
  return [...P.placed.values()]
    .sort((a, b) => a.y - b.y || PLACE_ORDER.indexOf(a.id) - PLACE_ORDER.indexOf(b.id))
    .map((it) => it.id)
}

/** 場景座標 (x, y) 上最上層的物件 id（用不透明像素判斷）；沒有 = null */
export function pickObject(P: Placement, x: number, y: number): string | null {
  const order = drawRank(P)
  for (let i = order.length - 1; i >= 0; i--) {
    const it = P.placed.get(order[i])!
    if (envCovers(it.kind, it.x, it.y, x, y)) return it.id
  }
  return null
}

export interface EditDrag {
  id: string
  /** 從場景上抓起來的，或從庫存列拖出來的 */
  source: 'scene' | 'inventory'
  /** 腳底 = 指標位置 + grab（場景座標）；從庫存拖出來時指標在素材中央 */
  grabX: number
  grabY: number
  /** 原本的位置（從場景抓起來的才有） */
  fromX: number | null
  fromY: number | null
}

/** 從場景上抓起物件 id（指標在場景座標 px、py） */
export function beginSceneDrag(P: Placement, id: string, px: number, py: number): EditDrag | null {
  const it = P.placed.get(id)
  if (!it) return null
  return { id, source: 'scene', grabX: it.x - px, grabY: it.y - py, fromX: it.x, fromY: it.y }
}

/** 從庫存列拖出物件 id：指標在素材中央 */
export function beginInventoryDrag(P: Placement, id: string): EditDrag | null {
  const def = layoutItemDef(id)
  if (!def || !P.stored.has(id)) return null
  const e = envelopeOf(def.kind)
  return { id, source: 'inventory', grabX: 0, grabY: Math.round(e.h / 2), fromX: null, fromY: null }
}

/** 拖曳中，指標在場景座標 (px, py) 時物件腳底的位置（整數） */
export function footAt(d: EditDrag, px: number, py: number): { x: number; y: number } {
  return { x: Math.round(px + d.grabX), y: Math.round(py + d.grabY) }
}

/** 拖到倉庫列卻不能收（住家、鐘樓、池塘、公佈欄）的原因；畫面上的「庫存」一律叫「倉庫」（程式內部名稱不變） */
export const cantStoreText = (name: string): string => `${name}不能收進倉庫`

export type DropDecision =
  | { kind: 'place'; x: number; y: number }
  | { kind: 'store' }
  | { kind: 'revert'; reason: string }
  | { kind: 'cancel' }

/**
 * 放開時怎麼辦：
 *  - 放在庫存列上：場景上的物件 → 能收就收進庫存，不能收（住家、鐘樓、池塘、公佈欄）就退回並說明；從庫存拖出來的 → 取消（留在庫存）
 *  - 放在場景上：合法 → 擺上去；不合法 → 退回原位（從庫存拖出來的就留在庫存），原因用擺放規則的文字
 *  - 沒移動（從場景抓起來、放回原位）→ 取消
 */
export function dropDecision(L: Layout, d: EditDrag, foot: { x: number; y: number } | null, overInventory: boolean): DropDecision {
  const def = layoutItemDef(d.id)
  if (!def) return { kind: 'cancel' }
  if (overInventory) {
    if (d.source === 'inventory') return { kind: 'cancel' }
    return canStore(L, d.id) ? { kind: 'store' } : { kind: 'revert', reason: cantStoreText(def.name) }
  }
  if (!foot) return { kind: 'cancel' }
  if (d.source === 'scene' && foot.x === d.fromX && foot.y === d.fromY) return { kind: 'cancel' }
  const r = canPlace(L, d.id, foot.x, foot.y)
  if (r.ok) return { kind: 'place', x: foot.x, y: foot.y }
  return { kind: 'revert', reason: PLACE_REASON_TEXT[r.reason] }
}
