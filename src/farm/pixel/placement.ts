import { LAYOUT_ITEMS, isInstanceId, layoutItemDef, parseInstanceId, type LayoutKind } from '../config/layoutItems'
import type { DecorInstance, FarmLayout, SaveData } from '../save/types'
import { ENVELOPES, type Envelope } from './envelopes'

/**
 * v3.9.0 農場自由擺放：擺放結果（純邏輯，不依賴 layout.ts，可在 Node 測試）。
 *
 * resolvePlacement(已購買的建築, 存檔的 farmLayout) → 每個物件「擺在哪裡（腳底中心，固定場景座標）」或「在庫存」。
 *  - 沒有紀錄：有預設位置的擺在 DEFAULT_POS；沒有預設位置的（灌木、高草叢、花槽、珊瑚石堆）在庫存
 *  - 建築（狗窩、食盆水盆、貓跳台）沒買就不存在（不擺也不在庫存；紀錄保留）
 *  - 紀錄是 stored → 庫存；placed 有座標 → 那裡；placed 沒座標 → 預設位置
 *  - v4.0 商店買來的實例（存檔 shop.decor，id「種類#編號」）：沒有紀錄 = 在庫存（擁有與擺放分開記）；不在 shop.decor 裡的實例紀錄一律忽略
 * 載入時不檢查重疊、連通（照存檔畫，不改寫）；擺放規則在 placeRules.ts，只在玩家放下物件時用。
 */

export interface Pt {
  x: number
  y: number
}
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface PlacedItem {
  id: string
  kind: LayoutKind
  /** 腳底中心（素材錨點），固定場景座標 */
  x: number
  y: number
}

export interface Placement {
  /** 擺放版本：每次產生新的 Placement 就 +1（各種快取的鍵也會比對物件本身） */
  rev: number
  /** 已購買的建築 id */
  owned: ReadonlySet<string>
  /** 擺出來的物件（id → 位置），順序固定 = PLACE_ORDER（畫圖時腳底 y 相同的物件依這個順序） */
  placed: ReadonlyMap<string, PlacedItem>
  /** 在庫存裡的物件 id */
  stored: ReadonlySet<string>
  /** 物件的固定順序（v4.0）：PLACE_ORDER，商店實例依編號插在珊瑚石堆之後、建築之前（畫圖時腳底 y 相同的物件依這個順序） */
  order: readonly string[]
}

/**
 * 預設位置（腳底中心），= v3.8.1 在 640×320 版面算出來的位置（測試會用 v3.8.1 的程式重算一次比對）。
 * 狗窩、食盆水盆的預設位置是常數，不跟著路燈的實際位置算：玩家搬動路燈時，沒動過的狗窩不會跟著跑。
 * 灌木、高草叢在 640×320 的預設版面放不下（v3.8.1 也沒畫），所以沒有預設位置。
 */
export const DEFAULT_POS: Readonly<Record<string, Pt>> = {
  house: { x: 76, y: 314 },
  tower: { x: 568, y: 166 },
  pond: { x: 57, y: 217 },
  board: { x: 80, y: 136 },
  lamp: { x: 171, y: 308 },
  kennel: { x: 226, y: 271 },
  bowls: { x: 305, y: 271 },
  catTree: { x: 574, y: 271 },
  tree1: { x: 289, y: 146 },
  tree2: { x: 394, y: 146 },
  mushroom: { x: 148, y: 146 },
  rocks: { x: 234, y: 146 },
  flowers: { x: 338, y: 146 },
  stump: { x: 451, y: 146 },
}

/** 畫圖與排序用的物件順序（v3.8.1：後排景物 → 裝飾物，裝飾物依 DECOR_ANCHORS 的順序） */
export const PLACE_ORDER: readonly string[] = ['house', 'board', 'lamp', 'tower', 'pond', 'tree1', 'tree2', 'mushroom', 'rocks', 'flowers', 'stump', 'bush', 'tall_grass', 'planter', 'coral', 'kennel', 'bowls', 'catTree']

/**
 * 每種物件的幾何：素材（envelopes.ts 的鍵、畫圖用的素材鍵；鐘樓、住家的圖由引擎依狀態挑）、腳下佔地（相對腳底：x0～x1、往上 d）。
 * 腳下佔地＝寵物不能站進去的地方、也是擺放時「重疊＋最小間距」的判斷範圍。大多數沿用 v3.8.1 的數字：
 * 住家整個寬 × 30、鐘樓 123 × 16、樹幹 18 × 12、裝飾 0.8 倍寬 × 10、狗窩 76×22、食盆 48×12、貓跳台 53×22；
 * 池塘平鋪在地上，整個水池都不能走（最上面 13 列是遠側的石頭與蘆葦，在草地上緣附近，不算）；路燈只有燈座（v3.8.1 的佔地 25.5×10）；公佈欄兩根柱腳之間 40×6。
 */
export interface KindGeom {
  env: string
  sprite: string | null
  foot: { x0: number; x1: number; d: number }
}
const decorFoot = (w: number): KindGeom['foot'] => ({ x0: -w * 0.4, x1: w * 0.4, d: 10 })
export const KIND_GEOM: Readonly<Record<LayoutKind, KindGeom>> = {
  house: { env: 'house', sprite: null, foot: { x0: -70, x1: 69, d: 30 } },
  tower: { env: 'clocktower', sprite: null, foot: { x0: -61.5, x1: 61.5, d: 16 } },
  pond: { env: 'pond', sprite: 'pond', foot: { x0: -55, x1: 55, d: 66 } },
  board: { env: 'board', sprite: 'board', foot: { x0: -20, x1: 20, d: 6 } },
  lamp: { env: 'lamp', sprite: 'lamp', foot: { x0: -12.75, x1: 12.75, d: 10 } },
  kennel: { env: 'doghouse', sprite: 'doghouse', foot: { x0: -38, x1: 38, d: 22 } },
  bowls: { env: 'bowls', sprite: 'bowls', foot: { x0: -24, x1: 24, d: 12 } },
  catTree: { env: 'cat_tree', sprite: 'cat_tree', foot: { x0: -26.5, x1: 26.5, d: 22 } },
  tree: { env: 'tree', sprite: 'tree', foot: { x0: -9, x1: 9, d: 12 } },
  bush: { env: 'bush', sprite: 'bush', foot: decorFoot(47) },
  mushroom: { env: 'mushroom', sprite: 'mushroom', foot: decorFoot(37) },
  rocks: { env: 'rocks', sprite: 'rocks', foot: decorFoot(52) },
  flowers: { env: 'flowers', sprite: 'flowers', foot: decorFoot(39) },
  stump: { env: 'stump', sprite: 'stump', foot: decorFoot(53) },
  tall_grass: { env: 'tall_grass', sprite: 'tall_grass', foot: decorFoot(44) },
  // 花槽、珊瑚石堆（素材縮放係數都是 0.7，62×45、59×50）。腳下佔地由 envelopes.ts 逐列不透明像素量出：
  // 底下 2 列是圓角／碎石的不規則邊，往上 10 列（第 3～12 列）平均寬都是 53.6，取 54（±27）、深 10（和其他裝飾的深度一樣）
  planter: { env: 'planter', sprite: 'planter', foot: { x0: -27, x1: 27, d: 10 } },
  coral: { env: 'coral', sprite: 'coral', foot: { x0: -27, x1: 27, d: 10 } },
}

export const envelopeOf = (kind: LayoutKind): Envelope => ENVELOPES[KIND_GEOM[kind].env]

/** 腳下佔地（固定場景座標） */
export function footprintAt(kind: LayoutKind, x: number, y: number): Box {
  const f = KIND_GEOM[kind].foot
  return { x0: x + f.x0, x1: x + f.x1, y0: y - f.d, y1: y }
}

/** 素材外框（固定場景座標） */
export function spriteBoxAt(kind: LayoutKind, x: number, y: number): Box {
  const e = envelopeOf(kind)
  return { x0: x - e.ax, x1: x - e.ax + e.w, y0: y - e.ay, y1: y - e.ay + e.h }
}

let revCounter = 0

/** v4.0：物件順序 = PLACE_ORDER，商店實例依編號插在建築（kennel）之前；沒有實例時就是 PLACE_ORDER 本身 */
export function orderWith(decor: readonly DecorInstance[] | undefined): readonly string[] {
  if (!decor || decor.length === 0) return PLACE_ORDER
  const ids = decor.filter((d) => isInstanceId(d.id)).map((d) => d.id)
  ids.sort((a, b) => (parseInstanceId(a)?.n ?? 0) - (parseInstanceId(b)?.n ?? 0))
  const at = PLACE_ORDER.indexOf('kennel')
  return [...PLACE_ORDER.slice(0, at), ...new Set(ids), ...PLACE_ORDER.slice(at)]
}

/**
 * 算出擺放結果。owned = 存檔的 ownedBuildings；layout = 存檔的 farmLayout（已由 parseSave 清理過；沒有 = 全部預設）。
 * 純函式（除了 rev 遞增），同樣的輸入得到同樣的 placed／stored。
 */
export function resolvePlacement(owned: readonly string[], layout?: FarmLayout | null, decor?: readonly DecorInstance[]): Placement {
  const own = new Set(owned)
  const order = orderWith(decor)
  const rec = new Map<string, FarmLayout['items'][number]>()
  for (const it of layout?.items ?? []) if (!rec.has(it.id)) rec.set(it.id, it)
  const placed = new Map<string, PlacedItem>()
  const stored = new Set<string>()
  for (const id of order) {
    const def = layoutItemDef(id)
    if (!def) continue
    if (def.building && !own.has(id)) continue
    const r = rec.get(id)
    const d = DEFAULT_POS[id]
    if (r?.state === 'stored' && def.storable) {
      stored.add(id)
      continue
    }
    if (r && r.state === 'placed' && typeof r.x === 'number' && typeof r.y === 'number') {
      placed.set(id, { id, kind: def.kind, x: r.x, y: r.y })
      continue
    }
    if (d) placed.set(id, { id, kind: def.kind, x: d.x, y: d.y })
    else stored.add(id)
  }
  return { rev: ++revCounter, owned: own, placed, stored, order }
}

/** 存檔的擺放結果（已購買的建築、擺放紀錄、商店實例）。介面與引擎一律用這個，不要漏掉實例 */
export const placementOf = (save: Pick<SaveData, 'ownedBuildings' | 'farmLayout' | 'shop'>): Placement => resolvePlacement(save.ownedBuildings, save.farmLayout, save.shop?.decor)

/** 預設擺放（沒有存檔紀錄）。owned 省略 = 沒買任何建築 */
export const defaultPlacement = (owned: readonly string[] = []): Placement => resolvePlacement(owned, null)

/** 把擺放結果寫回存檔用的紀錄：只記和預設不同的物件（編輯模式用） */
export function placementToLayout(P: Placement): FarmLayout {
  const items: FarmLayout['items'] = []
  // 內建物件依物件表的順序（和 v3.9.x 寫出的紀錄順序相同），之後是商店實例（依編號）；實例沒有預設位置，所以在倉庫的不寫紀錄（擁有記在 shop.decor）
  const defs = [...LAYOUT_ITEMS]
  for (const id of P.order) {
    if (!isInstanceId(id)) continue
    const d = layoutItemDef(id)
    if (d) defs.push(d)
  }
  for (const def of defs) {
    if (def.building && !P.owned.has(def.id)) continue
    const p = P.placed.get(def.id)
    const d = DEFAULT_POS[def.id]
    if (P.stored.has(def.id)) {
      if (d) items.push({ id: def.id, kind: def.kind, state: 'stored' })
    } else if (p && (!d || d.x !== p.x || d.y !== p.y)) items.push({ id: def.id, kind: def.kind, state: 'placed', x: p.x, y: p.y })
  }
  return { items }
}

/**
 * 依「目前存檔」（不是引擎上一個影格的擺放結果）算移動／收進庫存之後要寫回的擺放紀錄（x、y 皆 null = 收進庫存）。
 * 擺設介面寫入存檔時一律走這裡：同一個影格內連續兩次寫入（例如剛買下建築放進倉庫、緊接著又放下別的東西）時，
 * 第二次要看得到第一次的結果，否則第一次的變更會被覆蓋。
 */
export function layoutAfterMove(owned: readonly string[], layout: FarmLayout | undefined, id: string, x: number | null, y: number | null, decor?: readonly DecorInstance[]): FarmLayout {
  return placementToLayout(withMove(resolvePlacement(owned, layout, decor), id, x, y))
}

/** 拿掉某個物件的擺放紀錄（買建築時忽略存檔裡這棟建築以前殘留的紀錄）；沒有紀錄可拿時原樣回傳 */
export function withoutRecord(layout: FarmLayout | undefined, id: string): FarmLayout | undefined {
  if (!layout || !layout.items.some((it) => it.id === id)) return layout
  const items = layout.items.filter((it) => it.id !== id)
  return items.length > 0 ? { items } : undefined
}

// ---------------------------------------------------------------------------
// 遮擋：寵物（腳底在 x、y）被「畫在牠前面的物件」蓋住多少
// ---------------------------------------------------------------------------

/** 寵物身體的大約範圍（相對腳底）：寬 30、高 34 */
export const PET_BOX = { hw: 15, h: 34 }

/** 素材在 (px, py) 的不透明像素有沒有蓋到場景座標 (x, y) */
export function envCovers(kind: LayoutKind, ox: number, oy: number, x: number, y: number): boolean {
  const e = envelopeOf(kind)
  const row = Math.floor(y) - (oy - e.ay)
  if (row < 0 || row >= e.h) return false
  const rx = Math.floor(x) - ox
  for (const [lo, hi] of e.rows[row]) if (rx >= lo && rx < hi) return true
  return false
}

/**
 * 寵物腳底在 (x, y) 時，身體範圍被前面物件（腳底比寵物低，畫在寵物之後）蓋住的比例（0～1，取樣 6×6 點）。
 * 閒晃與停留挑目的地時避開 > 0.5 的位置；有固定座位的行為不看這個。
 */
export function coverFraction(P: Placement, x: number, y: number): number {
  const front: PlacedItem[] = []
  for (const it of P.placed.values()) {
    if (it.y <= y) continue
    const b = spriteBoxAt(it.kind, it.x, it.y)
    if (b.x1 <= x - PET_BOX.hw || b.x0 >= x + PET_BOX.hw || b.y1 <= y - PET_BOX.h || b.y0 >= y) continue
    front.push(it)
  }
  if (!front.length) return 0
  let hit = 0
  const N = 6
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const sx = x - PET_BOX.hw + ((i + 0.5) / N) * PET_BOX.hw * 2
      const sy = y - PET_BOX.h + ((j + 0.5) / N) * PET_BOX.h
      if (front.some((it) => envCovers(it.kind, it.x, it.y, sx, sy))) hit++
    }
  return hit / (N * N)
}

/** 矩形 box 範圍內有沒有任何一個像素被「腳底比 frontOfY 低」的物件（畫在前面的）的不透明像素蓋到（逐列精確判斷） */
export function boxCovered(P: Placement, box: Box, frontOfY: number, skipId = ''): boolean {
  for (const it of P.placed.values()) {
    if (it.y <= frontOfY || it.id === skipId) continue
    if (runsHit(it.kind, it.x, it.y, box)) return true
  }
  return false
}

/** 物件（種類 kind、腳底 x、y）的不透明像素有沒有碰到 box */
export function runsHit(kind: LayoutKind, x: number, y: number, box: Box): boolean {
  const e = envelopeOf(kind)
  const top = y - e.ay
  const r0 = Math.max(0, Math.floor(box.y0) - top)
  const r1 = Math.min(e.h, Math.ceil(box.y1) - top)
  for (let r = r0; r < r1; r++)
    for (const [lo, hi] of e.rows[r]) if (x + lo < box.x1 && x + hi > box.x0) return true
  return false
}

/** 把一個物件移到 (x, y)（或收進庫存：x = null）得到新的擺放結果（不檢查規則；擺放版本 +1） */
export function withMove(P: Placement, id: string, x: number | null, y: number | null): Placement {
  const def = layoutItemDef(id)
  const placed = new Map(P.placed)
  const stored = new Set(P.stored)
  if (!def) return { ...P, rev: ++revCounter }
  if (x === null || y === null) {
    // 住家、鐘樓、池塘、公佈欄不能收：維持原樣（不會從畫面消失）
    if (!def.storable) return { ...P, rev: ++revCounter }
    placed.delete(id)
    stored.add(id)
  } else {
    stored.delete(id)
    // 保持 PLACE_ORDER 的順序（畫圖時腳底 y 相同的物件前後不變）
    const ordered = new Map<string, PlacedItem>()
    for (const k of P.order) {
      if (k === id) ordered.set(id, { id, kind: def.kind, x, y })
      else {
        const it = placed.get(k)
        if (it) ordered.set(k, it)
      }
    }
    return { rev: ++revCounter, owned: P.owned, placed: ordered, stored, order: P.order }
  }
  return { rev: ++revCounter, owned: P.owned, placed, stored, order: P.order }
}
