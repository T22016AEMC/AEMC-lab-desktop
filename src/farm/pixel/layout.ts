import { DEFAULT_POS, defaultPlacement, footprintAt, type Placement } from './placement'
import type { LayoutKind } from '../config/layoutItems'

/**
 * 像素場景的版面。
 *
 * v3.9.0 起場景是固定的 640×320 邏輯像素（SCENE_W × SCENE_H），放大規則見 sceneScale；S = 每個邏輯像素佔幾個「裝置像素」（已含 devicePixelRatio）。
 * 視窗多出來的空間由引擎畫天空、遠景、草地延伸（Layout.view），不是場景的一部分。
 *
 * v3.9.0 起所有物件的位置來自擺放結果（Layout.placement，見 placement.ts）：預設配置＝v3.8.1 在 640×320 的配置
 * （住家左下、路燈、樹、樹、鐘樓最右後排、水池在住家右上方），玩家可以在編輯模式移動或收進庫存。尺寸常數要和 manifest 一致（測試會檢查）。
 */

/**
 * v3.9.0：場景改成固定邏輯尺寸 SCENE_W × SCENE_H（和視窗大小無關），所有物件位置都是固定的場景座標。
 * 顯示：視窗比場景大時取最大整數倍；整數倍讓場景在「比較緊的那一邊」佔不到視窗的 WHOLE_MIN（七成五）就改用非整數倍；
 * 比場景小時等比縮小（非整數倍）。場景水平置中、底部貼齊，剩下的空間用天空、遠景、草地（右邊含沙土路）延伸填滿，不留黑邊。
 * 延伸區只是畫面，寵物與物件都不會進去。
 */
export const SCENE_W = 640
export const SCENE_H = 320
export const WHOLE_MIN = 0.75

export interface Layout {
  /** 裝置像素 / 邏輯像素（整數倍時是整數；非整數倍時是小數，見 whole） */
  S: number
  /** 是否整數倍放大（非整數倍時引擎先畫到 1 倍暫存畫布再等比放大） */
  whole: boolean
  /** 邏輯寬、高（固定 SCENE_W × SCENE_H） */
  W: number
  H: number
  /** 畫布（裝置像素）大小 */
  backW: number
  backH: number
  dpr: number
  /** 場景原點在畫布上的水平位移（裝置像素，>= 0；場景水平置中） */
  ox: number
  /** 場景原點在畫布上的垂直位移（裝置像素，>= 0；場景底部貼齊畫布底部，多出來的高度在天空） */
  offsetY: number
  /** 畫布可見範圍（邏輯座標，含延伸區）：x0 <= 0、y0 <= 0、x1 >= W、y1 >= H */
  view: Rect
  /** 遠景底邊（天空與草地的交界）*/
  farBottom: number
  /** 住家的位置與尺寸（由擺放結果算出，setPlacement 時更新） */
  house: { x0: number; x1: number; baseY: number }
  /** 已購買的建築 id（= placement.owned，保留給舊程式讀） */
  owned: ReadonlySet<string>
  /**
   * v3.9.0 擺放結果（引擎在存檔的 ownedBuildings 或 farmLayout 變動時換一個新的物件，見 setPlacement）。
   * 版面相關的快取一律以「同一個 Layout ＋ 同一個 placement 物件」為鍵（placement.rev 是給人看的擺放版本）。
   */
  placement: Placement
}

export const HOUSE_X0 = 6
export const HOUSE_W = 139
export const HOUSE_H = 134
export const TOWER_W = 123
export const TOWER_H = 160
export const LAMP_W = 51
export const LAMP_H = 84
/** 路燈素材的錨點 x（水平中心欄）；要和 manifest 的 lamp 圖一致（測試會檢查） */
export const LAMP_AX = 26
/**
 * 狗窩素材的錨點 x（水平中心欄）、尺寸。狗窩與路燈是前後排（路燈在前），兩個素材的「不透明像素」左右相接、不重疊：
 * 狗窩往右移到和路燈（燈罩與燈桿）的可見像素最窄處只留 1 像素縫（測試用素材的實際不透明像素逐列量過）。位置只由路燈決定，和視窗大小無關。
 */
export const KENNEL_W = 99
export const KENNEL_H = 83
export const KENNEL_AX = 50
export const KENNEL_DX_FROM_LAMP = 55
export const CAT_TREE_W = 72
export const CAT_TREE_H = 90
export const BOWLS_W = 57
export const BOWLS_H = 27
/** 食盆水盆緊貼狗窩右緣：食盆水盆的錨點 x = 狗窩的錨點 x + 這個值（兩個素材的不透明像素逐列量過，最窄處只留 1 像素縫，不重疊） */
export const BOWLS_DX_FROM_KENNEL = 79
/** 貓跳台中心 = 鐘樓中心 + 這個值（v3.3.1 是 −6，v3.4.0 往右移 12）；右緣離畫面右緣約 30 */
export const CAT_TREE_DX_FROM_TOWER = 6
/** 貓跳台右緣離畫面右緣至少這麼遠 */
export const CAT_TREE_RIGHT_MARGIN = 28
/** 貓跳台頂端再往上這麼多（睡在頂層平台的貓比平台高約 10 像素；頂層貓的 ZZZ 畫在頭旁邊，不再往上）要在塔門下緣之下 */
export const CAT_TREE_HEADROOM = 12
/**
 * v3.4.2：貓跳台放不下時（頂端含睡在頂層平台的貓會碰到塔門或招牌）往左挪，最多挪這麼多（實際只挪到剛好不碰）。
 * 判斷用「貓跳台＋頂層貓」的逐列不透明像素輪廓，不是外框：CAT_TREE_ENVELOPE[i] = 第 (CAT_TREE_ENVELOPE_ROW0 + i) 列
 * （相對貓跳台素材頂端）的 [左緣, 右緣)，相對貓跳台水平中心；是貓跳台與 6 種貓睡姿圖（面向左、座位在 CAT_TREE_TOP_SEAT）的聯集。
 * 由圖集像素算出，測試會用圖集重新量一次比對。4.0-R 起由 tests-archive/v400r/cat-tree-envelope.mjs 產生（換貓跳台或貓的睡姿圖後重跑、貼上）。
 */
export const CAT_TREE_MAX_SHIFT = 120
/** 招牌的判定範圍：中心 TOWER_SIGN ± 這個半寬、半高 */
export const TOWER_SIGN_HALF = { w: 12, h: 8 }
export const CAT_TREE_ENVELOPE_ROW0 = -12
export const CAT_TREE_ENVELOPE: readonly (readonly [number, number])[] = [
  [5, 17], [3, 19], [-6, 20], [-6, 22], [-6, 23], [-6, 23],
  [-6, 24], [-6, 25], [-6, 26], [-7, 26], [-7, 26], [-7, 27],
  [-7, 27], [-9, 28], [-11, 29], [-12, 30], [-13, 31], [-14, 31],
  [-14, 32], [-14, 32], [-14, 32], [-14, 32], [-14, 32], [-14, 32],
  [-14, 32], [-14, 31], [-13, 31], [-12, 30], [-11, 28], [-6, 24],
  [1, 24], [1, 24], [0, 24], [0, 24], [0, 24], [0, 24],
  [0, 24], [-23, 24], [-28, 24], [-30, 24], [-32, 24], [-35, 26],
  [-36, 27], [-36, 28], [-36, 28], [-36, 28], [-36, 28], [-36, 27],
  [-36, 26], [-36, 26], [-34, 25], [-24, 13], [-24, 13], [-24, 13],
  [-24, 13], [-24, 25], [-24, 30], [-24, 30], [-24, 30], [-24, 30],
  [-24, 30], [-24, 30], [-24, 30], [-24, 30], [-24, 30], [-24, 30],
  [-24, 30], [-24, 30], [-24, 30], [-24, 30], [-24, 30], [-24, 30],
  [-24, 30], [-24, 30], [-24, 30], [-24, 30], [-24, 30], [-24, 30],
  [-24, 30], [-24, 30], [-24, 30], [-24, 30], [-24, 29], [-24, 27],
  [-25, 26], [-26, 26], [-29, 33], [-30, 35], [-32, 35], [-34, 35],
  [-35, 36], [-36, 35], [-36, 35], [-36, 34], [-36, 33], [-36, 31],
  [-36, 30], [-34, 28], [-27, 27], [-18, 25], [-17, 23], [-7, -2],
]
export const TREE_W = 82
export const TREE_H = 103
export const FAR_H = 37
export const PATH_H = 67
/** 水池素材（只有一幀，水面靜止）與它的水面橢圓（相對素材左上角），要和 manifest 一致（測試會檢查） */
export const POND_W = 110
export const POND_H = 79
export const POND_AX = 55
export const WATER = { cx: 55, cy: 41, rx: 43, ry: 26 }
/** 水池素材左緣（邏輯座標）：住家正上方、靠左，整個水池（含石頭）不超出畫面左緣；右緣 x=112 離煙囪（約 x=105～128、住家素材最上面 26 列）保持細縫 */
export const POND_LEFT = 2
/** 樹幹（腳底往上）的佔地：寵物不會站進去 */
export const TRUNK_HALF_W = 9
export const TRUNK_H = 12
/** 鐘樓的門（相對於鐘樓素材外框的比例）與招牌中心：滑鼠移上去開門、點擊開啟遊戲館 */
export const TOWER_DOOR = { x0: 0.4, x1: 0.6, y0: 0.74, y1: 0.97 }
export const TOWER_SIGN = { x: 0.655, y: 0.84 }
/**
 * v3.7.0：鐘樓上的另外兩個點擊區（相對鐘樓素材左上角的像素座標；關門版、開門版、黃金鐘樓都適用，測試用圖集像素比對）。
 *  - TOWER_WINDOW：時鐘上面的窗戶（藍灰玻璃與窗框，x 56～68、y 38～53），點擊開計算機
 *  - 鐘面：中心與半徑用素材的 meta.clock（管線偵測），外框再加 TOWER_CLOCK_FRAME（程式畫的金框），點擊開碼表與倒數
 * 和塔門（TOWER_DOOR，y ≥ 118）三個區域各自獨立、不重疊。
 */
export const TOWER_WINDOW = { x0: 56, y0: 38, x1: 69, y1: 54 }
export const TOWER_CLOCK_FRAME = 3
/** 管線偵測不到鐘面時的備用值（目前 clocktower 的 meta.clock） */
export const TOWER_CLOCK_FALLBACK = { cx: 62, cy: 81.5, r: 16.5 }
/** 鐘樓離右邊緣的邊距 */
export const TOWER_MARGIN = 10
/** 鐘樓周圍不放裝飾物的範圍：約 1.5 倍鐘樓寬（左右各 0.75 倍） */
export const TOWER_CLEAR = Math.round(TOWER_W * 0.75)

/**
 * 放大倍率：exact = 場景塞進畫布的最大倍率（可有小數）；整數倍 floor(exact) 只要 >= 1 而且 floor(exact) / exact >= WHOLE_MIN 就用整數倍，
 * 否則用 exact（非整數倍）。純函式，測試用。
 */
export function sceneScale(backW: number, backH: number): { S: number; whole: boolean } {
  const exact = Math.min(backW / SCENE_W, backH / SCENE_H)
  const k = Math.floor(exact + 1e-9)
  if (k >= 1 && k / exact >= WHOLE_MIN - 1e-9) return { S: k, whole: true }
  return { S: exact, whole: false }
}

export function computeLayout(backW: number, backH: number, dpr: number): Layout {
  const { S, whole } = sceneScale(backW, backH)
  const W = SCENE_W
  const H = SCENE_H
  const ox = Math.max(0, Math.round((backW - W * S) / 2))
  const offsetY = Math.max(0, Math.round(backH - H * S))
  const farBottom = Math.round(H * 0.4) + 8
  return {
    S,
    whole,
    W,
    H,
    backW,
    backH,
    dpr,
    ox,
    offsetY,
    view: { x0: -ox / S, y0: -offsetY / S, x1: (backW - ox) / S, y1: (backH - offsetY) / S },
    farBottom,
    house: { x0: HOUSE_X0, x1: HOUSE_X0 + HOUSE_W, baseY: H - 6 },
    owned: new Set(),
    placement: DEFAULT_PLACEMENT,
  }
}

const DEFAULT_PLACEMENT = defaultPlacement()

/** 換擺放結果（引擎用）：同步 owned 與住家位置 */
export function setPlacement(L: Layout, P: Placement): void {
  L.placement = P
  L.owned = P.owned
  const h = P.placed.get('house') ?? DEFAULT_POS.house
  const x0 = h.x - (DEFAULT_POS.house.x - HOUSE_X0)
  L.house = { x0, x1: x0 + HOUSE_W, baseY: h.y }
}

/** 住家、鐘樓、池塘、公佈欄不能收，一定有位置（萬一沒有就用預設位置） */
const must = (L: Layout, id: string): { x: number; y: number } => L.placement.placed.get(id) ?? DEFAULT_POS[id]

/** 邏輯座標 → 畫布的 CSS 座標（疊在畫布上的 DOM 元素用） */
export function toCss(L: Layout, x: number, y: number): { x: number; y: number } {
  return { x: (x * L.S + L.ox) / L.dpr, y: (y * L.S + L.offsetY) / L.dpr }
}

/** 畫布上的 CSS 座標 → 邏輯座標（延伸區會得到場景範圍外的座標） */
export function fromCss(L: Layout, cx: number, cy: number): { x: number; y: number } {
  return { x: (cx * L.dpr - L.ox) / L.S, y: (cy * L.dpr - L.offsetY) / L.S }
}

/** 住家的門（相對於住家素材外框的比例）：滑鼠移上去開門、點擊開啟啟動台 */
export const DOOR = { x0: 0.26, x1: 0.45, y0: 0.6, y1: 0.93 }

export function doorRect(L: Layout): { x0: number; y0: number; x1: number; y1: number } {
  const top = L.house.baseY - HOUSE_H
  return {
    x0: L.house.x0 + DOOR.x0 * HOUSE_W,
    x1: L.house.x0 + DOOR.x1 * HOUSE_W,
    y0: top + DOOR.y0 * HOUSE_H,
    y1: top + DOOR.y1 * HOUSE_H,
  }
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface SceneObject {
  /** 素材種類（v3.8.1 起的名稱：lamp、clocktower、pond、tree、各裝飾…；花槽 planter、珊瑚石堆 coral） */
  key: string
  /** v3.9.0：擺放物件 id（tree1、tree2…）與種類 */
  id: string
  kind: LayoutKind
  /** 水平中心、腳底 y */
  x: number
  y: number
}

/** 鐘樓的水平中心、腳底（v3.9.0：擺放結果；預設 = 右緣離畫面右緣 TOWER_MARGIN、草地上緣 + 10 但整張圖不超出畫面頂端） */
export const towerX = (L: Layout): number => must(L, 'tower').x
export const towerBase = (L: Layout): number => must(L, 'tower').y
/** 後排景物腳底離草地上緣的距離，以及寵物活動範圍離草地上緣的邊距 */
export const BACK_BASE = 10
export const BACK_MARGIN = 14

/** 鐘樓素材左上角（邏輯座標） */
export const towerTopLeft = (L: Layout): { x: number; y: number } => ({ x: towerX(L) - Math.round(TOWER_W / 2), y: towerBase(L) - TOWER_H })

export function towerDoorRect(L: Layout): Rect {
  const t = towerTopLeft(L)
  return { x0: t.x + TOWER_DOOR.x0 * TOWER_W, x1: t.x + TOWER_DOOR.x1 * TOWER_W, y0: t.y + TOWER_DOOR.y0 * TOWER_H, y1: t.y + TOWER_DOOR.y1 * TOWER_H }
}

/** 開門版鐘塔上招牌的中心（邏輯座標）：疊上「遊戲」兩個字 */
export function towerSignCenter(L: Layout): { x: number; y: number } {
  const t = towerTopLeft(L)
  return { x: t.x + TOWER_SIGN.x * TOWER_W, y: t.y + TOWER_SIGN.y * TOWER_H }
}

/** 開門版鐘樓招牌的判定矩形（邏輯座標） */
export function towerSignRect(L: Layout): Rect {
  const c = towerSignCenter(L)
  return { x0: c.x - TOWER_SIGN_HALF.w, x1: c.x + TOWER_SIGN_HALF.w, y0: c.y - TOWER_SIGN_HALF.h, y1: c.y + TOWER_SIGN_HALF.h }
}

/**
 * 貓跳台（水平中心 x、素材頂端 top）加上睡在頂層平台的貓，會不會碰到塔門（外擴 1 像素）或招牌：逐列用不透明像素輪廓判斷。
 * 頂端（含頂層貓高出的 CAT_TREE_HEADROOM）整個在塔門之下就一定不碰，直接回傳 false。
 */
export function catTreeHitsTower(L: Layout, x: number, top: number): boolean {
  const door = towerDoorRect(L)
  if (top - CAT_TREE_HEADROOM >= door.y1 + 1) return false
  const boxes: Rect[] = [{ x0: door.x0 - 1, x1: door.x1 + 1, y0: door.y0 - 1, y1: door.y1 + 1 }, towerSignRect(L)]
  for (let i = 0; i < CAT_TREE_ENVELOPE.length; i++) {
    const [lo, hi] = CAT_TREE_ENVELOPE[i]
    if (hi <= lo) continue
    const y = top + CAT_TREE_ENVELOPE_ROW0 + i
    for (const b of boxes) if (y < b.y1 && y + 1 > b.y0 && x + lo < b.x1 && x + hi > b.x0) return true
  }
  return false
}

/**
 * 水池：放在住家正上方的空地、靠左。x = 水平中心、y = 腳底（素材底邊）。
 * y 由草地上緣算出來：整個素材（含最高的蘆葦尖端）都在草地上緣以下、不伸進遠景樹林，所以 y 的下限 = 草地上緣 + 素材高 + 2。
 * 底部石頭會被住家屋頂尖端蓋住一小部分（y 排序自然發生，約 3～5% 面積），水面中心完全可見。
 */
export function pondPos(L: Layout): { x: number; y: number } {
  const p = must(L, 'pond')
  return { x: p.x, y: p.y }
}

/** 水面橢圓（邏輯座標） */
export function waterEllipse(L: Layout): { cx: number; cy: number; rx: number; ry: number } {
  const p = pondPos(L)
  return { cx: p.x - POND_AX + WATER.cx, cy: p.y - POND_H + WATER.cy, rx: WATER.rx, ry: WATER.ry }
}

/** 點是否在水面上（pad > 1 把橢圓放大一些，拖曳放開時比較好瞄準） */
export function inWater(L: Layout, x: number, y: number, pad = 1): boolean {
  const w = waterEllipse(L)
  return ((x - w.cx) / (w.rx * pad)) ** 2 + ((y - w.cy) / (w.ry * pad)) ** 2 <= 1
}

/** 洗澡站位離水池素材右緣的水平距離：寵物半身寬（大型犬約 28）；站位的寵物不被水池的石頭蓋住（水池腳底較低、排在寵物之前） */
export const POND_STAND_DX = 28

/** 所有可走的區域（v3.9.0：只有整片地面一塊；洗澡通道已取消） */
export function walkZones(L: Layout): Rect[] {
  return [petBounds(L)]
}

/** 把位置夾進可走區域 */
export function clampToWalk(L: Layout, x: number, y: number): { x: number; y: number } {
  const b = petBounds(L)
  return { x: Math.min(b.x1, Math.max(b.x0, x)), y: Math.min(b.y1, Math.max(b.y0, y)) }
}

/** 地面左右兩邊留給寵物半身的邊距（寵物腳底不貼著畫面邊緣） */
export const GROUND_SIDE = 12

/**
 * 寵物活動範圍（腳底座標）：v3.9.0 起是整片地面（草地＋沙土路），不含天空與遠景；不再有「路燈右邊 42」之類的特例。
 * 物件擋住的地方由 blockers（各物件的腳下佔地）扣掉。
 */
export function petBounds(L: Layout): Rect {
  return { x0: GROUND_SIDE, x1: L.W - GROUND_SIDE, y0: L.farBottom + BACK_MARGIN, y1: L.H - 4 }
}

const blockerCache = new WeakMap<Layout, { P: Placement; rects: Rect[] }>()

/**
 * 寵物不能站進去的矩形（腳底座標）＝每個擺出來的物件的腳下佔地（placement.ts 的 KIND_GEOM），四周放大一點（寵物不會貼著牆擠進去）。
 * v3.9.0：不再從畫面頂端往下延伸（鐘樓、水池後面也是地面），路燈也有佔地。在庫存裡的、沒買的建築沒有障礙。
 * 同一個 Layout、同一個 placement 的結果會快取。
 */
export function blockers(L: Layout): Rect[] {
  const hit = blockerCache.get(L)
  if (hit && hit.P === L.placement) return hit.rects
  const out: Rect[] = []
  for (const it of L.placement.placed.values()) {
    const r = footprintAt(it.kind, it.x, it.y)
    out.push({ x0: r.x0 - 2, x1: r.x1 + 2, y0: r.y0 - 2, y1: r.y1 + 1 })
  }
  blockerCache.set(L, { P: L.placement, rects: out })
  return out
}

/** 這個腳底位置站得住嗎（在活動範圍內、不在任何障礙物裡） */
export function isWalkable(L: Layout, x: number, y: number): boolean {
  const b = petBounds(L)
  if (!(x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1)) return false
  return !blockers(L).some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)
}

/** 離 (x, y) 最近的可站位置：由近到遠一圈一圈找（垂直方向距離算比較重，因為場景是斜視角） */
export function nearestWalkable(L: Layout, x: number, y: number): { x: number; y: number } {
  const c = clampToWalk(L, x, y)
  if (isWalkable(L, c.x, c.y)) return c
  const b = petBounds(L)
  let best: { x: number; y: number; d: number } | null = null
  for (let gx = b.x0; gx <= b.x1; gx += 2)
    for (let gy = b.y0; gy <= b.y1; gy += 2) {
      if (!isWalkable(L, gx, gy)) continue
      const d = Math.hypot(gx - x, (gy - y) * 1.6)
      if (!best || d < best.d) best = { x: gx, y: gy, d }
    }
  return best ? { x: best.x, y: best.y } : c
}

/** 裝飾物的素材外框大小 */
export const DECOR_SIZE: Record<string, [number, number]> = {
  bush: [47, 40],
  mushroom: [37, 37],
  rocks: [52, 34],
  flowers: [39, 28],
  stump: [53, 36],
  tall_grass: [44, 38],
}

/** 草地上的小路上緣（路與草地的交界）；沙土路的位置固定 */
export const pathTopOf = (L: Layout): number => L.H - 6 - PATH_H

/** 裝飾物的腳底和兩棵樹的腳底同一條線（草地上緣 + BACK_BASE）：預設位置 */
export const DECOR_BASE = BACK_BASE

/** 畫在場景上的物件（不含住家、公佈欄與三個建築）的素材種類 */
const SCENE_KEY: Partial<Record<LayoutKind, string>> = { tower: 'clocktower' }
const NOT_SCENE = new Set(['house', 'board', 'kennel', 'bowls', 'catTree'])
const sceneCache = new WeakMap<Layout, { P: Placement; list: SceneObject[] }>()

/**
 * 擺出來的場景物件：路燈、鐘樓、水池、樹、裝飾物、花槽、珊瑚石堆（v3.9.0：位置來自擺放結果；在庫存裡的不在清單裡）。
 * 順序固定（擺放結果的 order = PLACE_ORDER＋商店實例），腳底 y 相同時畫圖的前後和 v3.8.1 一樣。
 */
export function sceneObjects(L: Layout): SceneObject[] {
  const c = sceneCache.get(L)
  if (c && c.P === L.placement) return c.list
  const list: SceneObject[] = []
  for (const id of L.placement.order) {
    if (NOT_SCENE.has(id)) continue
    const it = L.placement.placed.get(id)
    if (it) list.push({ key: SCENE_KEY[it.kind] ?? it.kind, id, kind: it.kind, x: it.x, y: it.y })
  }
  sceneCache.set(L, { P: L.placement, list })
  return list
}

/** 所有擺出來的物件（含住家、公佈欄、建築）的腳下佔地 */
export function footprints(L: Layout): Rect[] {
  return [...L.placement.placed.values()].map((it) => footprintAt(it.kind, it.x, it.y))
}

export type SlotKind = 'kennel' | 'catTree' | 'small'

/**
 * 建築空位：x、y = 腳底中心（邏輯座標）；w、h = 之後放的素材外框大小（佔位範圍）；
 * fw、fd = 腳下的佔地（寬、深），空位彼此、與固定物件的佔地都不重疊。
 * id 就是專用標記：kennel（狗窩）、bowls（食盆水盆）、catTree（貓跳台）、
 * picnicMat（野餐墊）。
 */
export interface BuildingSlot {
  id: string
  kind: SlotKind
  x: number
  y: number
  w: number
  h: number
  fw: number
  fd: number
}

export interface SlotSpec {
  id: string
  name: string
  kind: SlotKind
  w: number
  h: number
  fw: number
  fd: number
}

/** 4 種建築的空位規格，依排位優先順序（先排的先找位置） */
export const SLOT_SPECS: SlotSpec[] = [
  { id: 'kennel', name: '狗窩', kind: 'kennel', w: KENNEL_W, h: KENNEL_H, fw: 76, fd: 22 },
  { id: 'bowls', name: '食盆水盆', kind: 'small', w: BOWLS_W, h: BOWLS_H, fw: 48, fd: 12 },
  { id: 'catTree', name: '貓跳台', kind: 'catTree', w: CAT_TREE_W, h: CAT_TREE_H, fw: 53, fd: 22 },
]

/** 走道上的空位（狗窩、食盆水盆、貓跳台）腳底在走道上緣再往下這麼多：落在沙地走道的上半部 */
export const PATH_FOOT = 24
/** 走道下半部留給寵物走的最小寬度（腳底線到寵物可走範圍下緣，邏輯像素）：走道深 67，上半部放建築，下半部至少剩這麼多 */
export const PATH_FREE_MIN = 36
/** 走道上空位的腳底線 y */
export const pathFootY = (L: Layout): number => pathTopOf(L) + PATH_FOOT

/** 空位的素材外框（建築模式的虛線框、購買後建築的畫面範圍）：腳底中心在 (x, y)，往上 h */
export const slotBox = (s: BuildingSlot): Rect => ({ x0: s.x - s.w / 2, x1: s.x + s.w / 2, y0: s.y - s.h, y1: s.y })

/** 已購買而且擺出來的建築（畫面上畫出來、寵物會使用的建築；收進庫存的不算） */
export function ownedSlots(L: Layout): BuildingSlot[] {
  return buildingSlots(L).filter((s) => L.placement.placed.has(s.id))
}

/** 空位的佔地矩形 */
export const slotFootprint = (s: BuildingSlot): Rect => ({ x0: s.x - s.fw / 2, x1: s.x + s.fw / 2, y0: s.y - s.fd, y1: s.y })

/**
 * 建築空位（建築模式才顯示虛線；沒買的空位不擋寵物）。建築購買之後才加入障礙：
 * 把已擁有的空位交給 slotBlockers，結果併進 blockers() 的陣列（腳下佔地稍微放大一點，寵物才不會貼著牆擠進去）。
 * 購買後走道上（狗窩、食盆水盆、貓跳台）會變窄，寵物要繞行，所以走道下半部必須保留 PATH_FREE_MIN 以上的寬度。
 * blockers() 會把 L.owned 裡的（而且排得進這個視窗的）空位併進來。
 */
export function slotBlockers(slots: BuildingSlot[], owned: ReadonlySet<string>): Rect[] {
  return slots.filter((s) => owned.has(s.id)).map((s) => {
    const r = slotFootprint(s)
    return { x0: r.x0 - 2, x1: r.x1 + 2, y0: r.y0 - 2, y1: r.y1 + 1 }
  })
}

const slotCache = new WeakMap<Layout, { P: Placement; slots: BuildingSlot[] }>()

/**
 * 三個建築（狗窩、食盆水盆、貓跳台）的位置：擺出來的用實際位置，其他（沒買、在庫存）用預設位置（建築模式顯示購買位置用）。
 * v3.9.0：不再依視窗大小排位；野餐墊不再有空位。
 */
export function buildingSlots(L: Layout): BuildingSlot[] {
  const c = slotCache.get(L)
  if (c && c.P === L.placement) return c.slots
  const slots: BuildingSlot[] = []
  for (const sp of SLOT_SPECS) {
    const pos = L.placement.placed.get(sp.id) ?? DEFAULT_POS[sp.id]
    if (pos) slots.push({ id: sp.id, kind: sp.kind, x: pos.x, y: pos.y, w: sp.w, h: sp.h, fw: sp.fw, fd: sp.fd })
  }
  slotCache.set(L, { P: L.placement, slots })
  return slots
}


// ---------------------------------------------------------------------------
// v3.7.0：公佈欄、鐘樓的窗戶與鐘面（工具包的入口）
// ---------------------------------------------------------------------------

/** 公佈欄素材（tools 圖集的 board）的尺寸與黑板綠色範圍（相對素材左上角），要和 manifest 一致（測試會比對） */
export const BOARD_W = 64
export const BOARD_H = 50
export const BOARD_GREEN = { x0: 8, y0: 8, x1: 56, y1: 39 }

/**
 * 公佈欄的位置：水池上方的遠景區（草地上緣之上、蘑菇左邊那段空地）的右半邊：
 * 右緣對齊水池素材右緣（x = POND_LEFT + POND_W = 112），腳底在草地上緣（farBottom），所以在水池（頂端 farBottom + 2）的上面、不重疊；
 * 左邊 x 0～48 那段較小的空位留給之後的農場告示牌。位置只由水池與草地上緣決定（和視窗寬度、建築購買都無關）。
 * x = 水平中心（素材錨點）、y = 腳底。
 */
export function boardPos(L: Layout): { x: number; y: number } {
  const p = must(L, 'board')
  return { x: p.x, y: p.y }
}

/** 公佈欄素材外框（邏輯座標） */
export function boardRect(L: Layout): Rect {
  const p = boardPos(L)
  return { x0: p.x - BOARD_W / 2, x1: p.x + BOARD_W / 2, y0: p.y - BOARD_H, y1: p.y }
}

/** 黑板綠色範圍（邏輯座標）：場景上疊標題縮圖的地方 */
export function boardGreenRect(L: Layout): Rect {
  const r = boardRect(L)
  return { x0: r.x0 + BOARD_GREEN.x0, x1: r.x0 + BOARD_GREEN.x1, y0: r.y0 + BOARD_GREEN.y0, y1: r.y0 + BOARD_GREEN.y1 }
}

/** 時鐘上面的窗戶（邏輯座標） */
export function towerWindowRect(L: Layout): Rect {
  const t = towerTopLeft(L)
  return { x0: t.x + TOWER_WINDOW.x0, x1: t.x + TOWER_WINDOW.x1, y0: t.y + TOWER_WINDOW.y0, y1: t.y + TOWER_WINDOW.y1 }
}

/** 鐘面（含程式畫的金框）外接正方形（邏輯座標）；clock = 目前鐘樓素材的 meta.clock（相對素材左上角） */
export function towerClockRect(L: Layout, clock: { cx: number; cy: number; r: number } | null | undefined): Rect {
  const t = towerTopLeft(L)
  const c = clock ?? TOWER_CLOCK_FALLBACK
  const r = c.r + TOWER_CLOCK_FRAME
  return { x0: t.x + c.cx - r, x1: t.x + c.cx + r + 1, y0: t.y + c.cy - r, y1: t.y + c.cy + r + 1 }
}

/** 邏輯座標的矩形 → CSS 座標 */
export function rectCss(L: Layout, r: Rect): Rect {
  const a = toCss(L, r.x0, r.y0)
  const b = toCss(L, r.x1, r.y1)
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }
}

/** 點擊區不足 min CSS 像素的那一邊，以中心為準放大到 min（只放大點擊區，畫面不變） */
export function growHit(r: Rect, min: number): Rect {
  const out = { ...r }
  const w = r.x1 - r.x0
  const h = r.y1 - r.y0
  if (w < min) {
    out.x0 = r.x0 - (min - w) / 2
    out.x1 = out.x0 + min
  }
  if (h < min) {
    out.y0 = r.y0 - (min - h) / 2
    out.y1 = out.y0 + min
  }
  return out
}

export interface ToolHits {
  /** 時鐘上面的窗戶 → 計算機 */
  window: Rect
  /** 鐘面 → 碼表與倒數 */
  clock: Rect
  /** 塔門 → 遊戲館（沿用 v3.1.0 的範圍，不放大） */
  door: Rect
  /** 公佈欄 → 公佈欄視窗 */
  board: Rect
}

/**
 * 四個點擊區（CSS 座標）。窗戶、鐘面、公佈欄不足 minCss 就放大點擊區；窗戶放大後如果碰到鐘面，整個往上移（保持大小、和鐘面留 1 像素），
 * 鐘面放大後如果碰到塔門，往上移。塔門維持原本的範圍（v3.1.0 起的行為不變）。
 */
export function toolHitRects(L: Layout, clock: { cx: number; cy: number; r: number } | null | undefined, minCss: number): ToolHits {
  const door = rectCss(L, towerDoorRect(L))
  const clk = growHit(rectCss(L, towerClockRect(L, clock)), minCss)
  if (clk.y1 > door.y0 - 1) {
    const d = clk.y1 - (door.y0 - 1)
    clk.y0 -= d
    clk.y1 -= d
  }
  const win = growHit(rectCss(L, towerWindowRect(L)), minCss)
  if (win.y1 > clk.y0 - 1) {
    const d = win.y1 - (clk.y0 - 1)
    win.y0 -= d
    win.y1 -= d
  }
  return { window: win, clock: clk, door, board: growHit(rectCss(L, boardRect(L)), minCss) }
}
