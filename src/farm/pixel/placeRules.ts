import { layoutItemDef, type LayoutKind } from '../config/layoutItems'
import type { BuildingId } from '../config/buildings'
import {
  BACK_BASE, CAT_TREE_H, KENNEL_AX, KENNEL_H, TOWER_H, boardGreenRect, catTreeHitsTower, doorRect, ownedSlots, setPlacement, towerClockRect, towerDoorRect,
  towerSignRect, towerWindowRect, waterEllipse, type Layout, type Rect,
} from './layout'
import { CAT_TREE_MID_SEAT, CAT_TREE_TOP_SEAT, KENNEL_DOOR_CLIP, seatsOf } from './buildingUse'
import { hasIsolatedRegion, isReachable } from './nav'
import { footprintAt, runsHit, spriteBoxAt, withMove, type Placement, type PlacedItem } from './placement'
import { pondStand, pondStandFound } from './reach'

/**
 * v3.9.0 農場自由擺放的規則（純邏輯）：玩家在編輯模式放下物件時才檢查；不合法就顯示紅色並退回原位（介面在 ui/EditLayer.tsx）。
 * 載入存檔時不檢查（照存檔畫，不改寫），所以這裡只看「被移動的那個物件」和其他物件的關係，加上整個場景的連通。
 *
 *  1. 範圍（outside）：素材外框整個在場景寬度內；腳底 y ≤ GROUND_BOTTOM；腳底 y ≥ minFootY（住家、公佈欄可以到草地上緣＝公佈欄那條線，
 *     鐘樓同時整張圖不超出畫面頂端，其他物件到草地上緣 + BACK_BASE）
 *  2. 重疊（overlap）：腳下佔地和其他物件的腳下佔地相隔至少 MIN_GAP（12）
 *  3. 互動區（covers）：畫在前面（腳底比較低）的物件的不透明像素不能蓋到互動區：住家門、塔門與招牌、窗戶、鐘面、水面中心、
 *     公佈欄黑板、狗窩門洞、貓跳台的兩層平台；貓跳台＋睡在頂層的貓不能碰塔門與招牌
 *  4. 連通（disconnected）：可走範圍除了最大的區塊，不能有比一隻寵物身體大的區塊
 *  5. 走得到（unreachable）：所有建築座位旁的位置、洗澡站位都在最大的區塊上
 */
export const MIN_GAP = 12
/**
 * 鐘樓能往後（往畫面上方）移到哪裡：鐘樓素材頂端的 y 不能小於這個值（0 = 整張圖不超出畫面頂端；
 * 改成負數就能再往後，例如 -20 = 頂端可以超出畫面 20 像素）。鐘樓腳底的下限只由這個常數與草地上緣決定（minFootY）。
 */
export const TOWER_TOP_MIN = 0
export const GROUND_BOTTOM = 316

export type PlaceReason = 'outside' | 'overlap' | 'covers' | 'disconnected' | 'unreachable' | 'unknown'
export type PlaceResult = { ok: true } | { ok: false; reason: PlaceReason; detail: string }

export const PLACE_REASON_TEXT: Readonly<Record<PlaceReason, string>> = {
  outside: '超出可以擺放的範圍',
  overlap: '離其他東西太近',
  covers: '會擋住門、鐘面或水面',
  disconnected: '會把草地隔成走不到的區塊',
  unreachable: '寵物會走不到座位或洗澡的地方',
  unknown: '不能放在這裡',
}

/** 這個物件可以收進庫存嗎（住家、鐘樓、池塘、公佈欄不行；建築要先買） */
export function canStore(L: Layout, id: string): boolean {
  const def = layoutItemDef(id)
  if (!def || !def.storable) return false
  if (def.building && !L.placement.owned.has(id)) return false
  return L.placement.placed.has(id)
}

/** 腳底 y 的上限（往後、往畫面上方）：住家、公佈欄可以到草地上緣（公佈欄那條線）；鐘樓還要整張圖不超出畫面頂端；其他到草地上緣 + BACK_BASE */
export function minFootY(L: Layout, kind: LayoutKind): number {
  if (kind === 'house' || kind === 'board') return L.farBottom
  if (kind === 'tower') return Math.max(L.farBottom, TOWER_H + TOWER_TOP_MIN)
  return L.farBottom + BACK_BASE
}

/** 某個物件可以擺放的腳底範圍（x 依素材外框不出場景；y 依 minFootY 與 GROUND_BOTTOM） */
export function placeRange(L: Layout, kind: LayoutKind): { x0: number; x1: number; y0: number; y1: number } {
  const b = spriteBoxAt(kind, 0, 0)
  return { x0: -b.x0, x1: L.W - b.x1, y0: minFootY(L, kind), y1: GROUND_BOTTOM }
}

const hitGap = (a: Rect, b: Rect, g: number): boolean => a.x0 < b.x1 + g && a.x1 > b.x0 - g && a.y0 < b.y1 + g && a.y1 > b.y0 - g

/** 一個物件的互動區（擺放結果套用到 L 之後算） */
export function zonesOf(L: Layout, it: PlacedItem): Rect[] {
  switch (it.kind) {
    case 'house':
      return [doorRect(L)]
    case 'tower':
      return [towerDoorRect(L), towerSignRect(L), towerWindowRect(L), towerClockRect(L, null)]
    case 'pond': {
      // 水面中心那一塊（拖曳寵物放下去的地方）；預設配置裡住家屋頂本來就蓋住水面下半部，所以不用整個橢圓
      const w = waterEllipse(L)
      return [{ x0: w.cx - 16, x1: w.cx + 16, y0: w.cy - 10, y1: w.cy }]
    }
    case 'board':
      return [boardGreenRect(L)]
    case 'kennel': {
      const left = it.x - KENNEL_AX
      const top = it.y - KENNEL_H
      return KENNEL_DOOR_CLIP.map((r) => ({ x0: left + r.x0, x1: left + r.x1, y0: top + r.y0, y1: top + r.y1 }))
    }
    case 'catTree': {
      const tl = { x: it.x - 36, y: it.y - CAT_TREE_H }
      const seat = (s: { x: number; y: number }): Rect => ({ x0: tl.x + s.x - 12, x1: tl.x + s.x + 12, y0: tl.y + s.y - 14, y1: tl.y + s.y })
      return [seat(CAT_TREE_TOP_SEAT), seat(CAT_TREE_MID_SEAT)]
    }
    default:
      return []
  }
}

/** 一個複製的版面，換上擺放結果 P（擺放規則的試算用，不動引擎的版面） */
export function layoutWith(L: Layout, P: Placement): Layout {
  const T: Layout = { ...L }
  setPlacement(T, P)
  return T
}

/** 擺放結果 P 下，物件 id 和其他物件的互動區有沒有互相蓋到（只看牽涉到 id 的配對） */
function coversCheck(T: Layout, P: Placement, id: string): string | null {
  const me = P.placed.get(id)
  if (!me) return null
  for (const other of P.placed.values()) {
    if (other.id === id) continue
    // 前面的蓋後面的：腳底比較低（y 大）的畫在後面、蓋在上面
    const pairs: [PlacedItem, PlacedItem][] = []
    if (other.y > me.y) pairs.push([me, other])
    else if (me.y > other.y) pairs.push([other, me])
    else pairs.push([me, other], [other, me])
    for (const [back, front] of pairs)
      for (const z of zonesOf(T, back)) if (runsHit(front.kind, front.x, front.y, z)) return `${front.id} 蓋到 ${back.id} 的互動區`
  }
  // 貓跳台＋睡在頂層的貓：不能碰塔門與招牌（逐列輪廓，v3.4.2 的規則）
  const ct = P.placed.get('catTree')
  if (ct && (id === 'catTree' || id === 'tower') && catTreeHitsTower(T, ct.x, ct.y - CAT_TREE_H)) return '貓跳台（含頂層的貓）碰到塔門或招牌'
  return null
}

/**
 * 物件 id 放在 (x, y)（腳底中心）合法嗎。L = 目前的版面（含目前的擺放結果）；這個物件可以是擺著的、在庫存的、剛買的。
 * 回傳 ok 或第一個不合法的原因。全程不丟錯誤。
 */
export function canPlace(L: Layout, id: string, x: number, y: number): PlaceResult {
  try {
    const def = layoutItemDef(id)
    if (!def) return { ok: false, reason: 'unknown', detail: '物件表沒有 ' + id }
    if (def.building && !L.placement.owned.has(id)) return { ok: false, reason: 'unknown', detail: '還沒買 ' + id }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: 'outside', detail: '座標不是數字' }
    // 1. 範圍
    const r = placeRange(L, def.kind)
    if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) return { ok: false, reason: 'outside', detail: `腳底 (${x}, ${y}) 不在 x ${r.x0}～${r.x1}、y ${r.y0}～${r.y1}` }
    // 2. 重疊＋最小間距
    const fp = footprintAt(def.kind, x, y)
    for (const o of L.placement.placed.values()) {
      if (o.id === id) continue
      if (hitGap(fp, footprintAt(o.kind, o.x, o.y), MIN_GAP)) return { ok: false, reason: 'overlap', detail: `離 ${o.id} 不到 ${MIN_GAP}` }
    }
    // 3. 互動區
    const P = withMove(L.placement, id, x, y)
    const T = layoutWith(L, P)
    const cov = coversCheck(T, P, id)
    if (cov) return { ok: false, reason: 'covers', detail: cov }
    // 4. 連通
    if (hasIsolatedRegion(T)) return { ok: false, reason: 'disconnected', detail: '可走範圍有走不到的區塊' }
    // 5. 座位、洗澡站位走得到
    for (const s of ownedSlots(T))
      for (const purpose of ['eat', 'sleep', 'shelter'] as const)
        for (const st of seatsOf(s.id as BuildingId, s, purpose)) {
          if (s.id === 'bowls' && purpose !== 'eat') continue
          if (s.id !== 'bowls' && purpose === 'eat') continue
          if (!isReachable(T, st.near.x, st.near.y)) return { ok: false, reason: 'unreachable', detail: `${s.id} 的座位旁 (${Math.round(st.near.x)}, ${Math.round(st.near.y)}) 走不到` }
        }
    const stand = pondStand(T)
    if (!pondStandFound(T) || !isReachable(T, stand.x, stand.y)) return { ok: false, reason: 'unreachable', detail: '洗澡站位走不到' }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: 'unknown', detail: String(e) }
  }
}
