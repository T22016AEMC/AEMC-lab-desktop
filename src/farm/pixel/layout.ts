/**
 * 像素場景的版面。
 *
 * 畫布以「整數倍放大」顯示：S = 每個邏輯像素佔幾個「裝置像素」（已含 devicePixelRatio，所以一定是整數，不會模糊）。
 * 邏輯高度盡量接近 270（寬度至少 400），視窗更寬就向左右延伸，天空與草地鋪滿；底部貼地（多出來的高度從天空上緣裁掉）。
 */

export const TARGET_H = 270
export const MIN_W = 400

export interface Layout {
  /** 裝置像素 / 邏輯像素（整數） */
  S: number
  /** 邏輯寬、高 */
  W: number
  H: number
  /** 畫布（裝置像素）大小 */
  backW: number
  backH: number
  dpr: number
  /** 畫布往上平移的裝置像素（<= 0）：讓邏輯畫面的底部對齊畫布底部 */
  offsetY: number
  /** 遠景底邊（天空與草地的交界）*/
  farBottom: number
  /** 住家的位置與尺寸 */
  house: { x0: number; x1: number; baseY: number }
}

export const HOUSE_X0 = 6
export const HOUSE_W = 121
export const HOUSE_H = 117
export const FAR_H = 37
export const PATH_H = 67

export function computeLayout(backW: number, backH: number, dpr: number): Layout {
  let best = { S: 1, score: Infinity }
  for (let S = 1; S <= 12; S++) {
    const W = Math.ceil(backW / S)
    const H = Math.ceil(backH / S)
    const score = Math.abs(H - TARGET_H) + (W < MIN_W ? 1000 : 0) + (H < 190 ? 300 : 0)
    if (score < best.score) best = { S, score }
  }
  const S = best.S
  const W = Math.ceil(backW / S)
  const H = Math.ceil(backH / S)
  const farBottom = Math.round(H * 0.4) + 8
  return {
    S,
    W,
    H,
    backW,
    backH,
    dpr,
    offsetY: backH - H * S,
    farBottom,
    house: { x0: HOUSE_X0, x1: HOUSE_X0 + HOUSE_W, baseY: H - 6 },
  }
}

/** 邏輯座標 → 畫布的 CSS 座標（疊在畫布上的 DOM 元素用） */
export function toCss(L: Layout, x: number, y: number): { x: number; y: number } {
  return { x: (x * L.S) / L.dpr, y: (y * L.S + L.offsetY) / L.dpr }
}

/** 畫布上的 CSS 座標 → 邏輯座標 */
export function fromCss(L: Layout, cx: number, cy: number): { x: number; y: number } {
  return { x: (cx * L.dpr) / L.S, y: (cy * L.dpr - L.offsetY) / L.S }
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

/** 寵物活動範圍（腳底座標）：地面帶，不含天空與遠景，也不含住家那一塊 */
export function petBounds(L: Layout): { x0: number; x1: number; y0: number; y1: number } {
  return { x0: L.house.x1 + 8, x1: L.W - 10, y0: L.farBottom + 58, y1: L.H - 4 }
}

export interface SceneObject {
  key: string
  /** 水平中心、腳底 y */
  x: number
  y: number
}

/**
 * 固定位置的場景物件（不是隨機）：路燈、鐘樓、樹與裝飾。
 * 大型物件都放在「後排帶」（遠景下方一小段），中間與前面留給寵物活動與小路；
 * 住家在最左下，物件依腳底 y 與寵物一起排前後。
 */
export function sceneObjects(L: Layout): SceneObject[] {
  const { W, H, farBottom: fb } = L
  const lo = HOUSE_X0 + HOUSE_W + 24
  const span = W - lo - 36
  const at = (f: number): number => Math.round(lo + span * f)
  return [
    { key: 'lamp', x: HOUSE_X0 + HOUSE_W + 26, y: H - 12 },
    // 鐘樓：高 131，腳底至少要在 137 以下，頂端才不會被畫面上緣切掉
    { key: 'clocktower', x: Math.round(W * 0.56), y: Math.max(fb + 34, 137) },
    { key: 'tree', x: at(0.0), y: fb + 46 },
    { key: 'tree', x: at(0.64), y: fb + 42 },
    { key: 'tree', x: at(0.97), y: fb + 52 },
    { key: 'bush', x: at(0.36), y: fb + 40 },
    { key: 'rocks', x: at(0.82), y: fb + 38 },
    { key: 'flowers', x: at(0.02), y: fb + 38 },
    { key: 'stump', x: at(0.52), y: fb + 54 },
    { key: 'mushroom', x: at(0.28), y: fb + 56 },
    { key: 'tall_grass', x: W - 26, y: H - 4 },
  ]
}

/** 保留給之後建築（澡盆、蹺蹺板、沙坑、篝火、野餐墊、食盆水盆、花圃、狗窩、貓跳台）的空位；本版不顯示 */
export function buildingSlots(L: Layout): { id: string; x: number; y: number }[] {
  const { W, H, farBottom: fb } = L
  const G = H - fb
  return [
    { id: 'slot1', x: Math.round(W * 0.3), y: fb + Math.round(G * 0.45) },
    { id: 'slot2', x: Math.round(W * 0.66), y: fb + Math.round(G * 0.62) },
    { id: 'slot3', x: Math.round(W * 0.82), y: fb + Math.round(G * 0.78) },
  ]
}
