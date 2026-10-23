/**
 * 像素場景的版面。
 *
 * 畫布以「整數倍放大」顯示：S = 每個邏輯像素佔幾個「裝置像素」（已含 devicePixelRatio，所以一定是整數，不會模糊）。
 * 邏輯高度盡量接近 270，視窗更寬就向左右延伸，天空與草地鋪滿；底部貼地（多出來的高度從天空上緣裁掉）。
 *
 * 配置（由左到右）：住家（最左下）→ 路燈 → 樹 → 樹 → 鐘樓（最右側的後排，貼近右邊緣）。
 * 裝飾物散布在小路兩側的草地，位置固定（不是隨機）。尺寸常數要和 public/assets/manifest.json 一致（測試會檢查）。
 */

export const TARGET_H = 270
/** 邏輯寬度的下限：寬度夠才放得下住家、路燈、2 棵樹與鐘樓；實在太窄的視窗（例如 1024）才退到 MIN_W_NARROW */
export const MIN_W = 560
export const MIN_W_NARROW = 440

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
export const HOUSE_W = 139
export const HOUSE_H = 134
export const TOWER_W = 123
export const TOWER_H = 160
export const LAMP_W = 51
export const LAMP_H = 84
export const TREE_W = 82
export const TREE_H = 103
export const FAR_H = 37
export const PATH_H = 67
/** 鐘樓離右邊緣的邊距 */
export const TOWER_MARGIN = 10
/** 鐘樓周圍不放裝飾物的範圍：約 1.5 倍鐘樓寬（左右各 0.75 倍） */
export const TOWER_CLEAR = Math.round(TOWER_W * 0.75)

export function computeLayout(backW: number, backH: number, dpr: number): Layout {
  const score = (S: number, minW: number): number => {
    const W = Math.ceil(backW / S)
    const H = Math.ceil(backH / S)
    // 寵物活動的地面帶至少要有一定深度（六隻同場不會擠成一團），所以 H 偏小時額外扣分
    return Math.abs(H - TARGET_H) + (W < minW ? 1000 : 0) + (H < 190 ? 300 : 0) + Math.max(0, 258 - H) * 3
  }
  // 先要求寬度 >= MIN_W 且放大至少 2 倍；做不到（很窄的視窗）才放寬
  const pick = (minW: number, from: number): { S: number; score: number } => {
    let best = { S: from, score: Infinity }
    for (let S = from; S <= 12; S++) {
      const sc = score(S, minW)
      if (sc < best.score) best = { S, score: sc }
    }
    return best
  }
  let best = pick(MIN_W, 2)
  if (best.score >= 1000) best = pick(MIN_W_NARROW, 2)
  if (best.score >= 1000) best = pick(0, 1)
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

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface SceneObject {
  key: string
  /** 水平中心、腳底 y */
  x: number
  y: number
}

export const lampX = (): number => HOUSE_X0 + HOUSE_W + 26
export const towerX = (L: Layout): number => L.W - TOWER_MARGIN - Math.round(TOWER_W / 2)
/** 鐘樓腳底：和後排對齊，並確保頂端不會被畫面上緣切掉 */
export const towerBase = (L: Layout): number => Math.max(L.farBottom + 40, TOWER_H + 6)

/** 寵物活動範圍（腳底座標）：地面帶（含草地與小路），不含天空與遠景，也不含住家與路燈那一塊 */
export function petBounds(L: Layout): Rect {
  // x0：路燈右側再留一隻寵物的半寬，寵物不會停在燈柱後面被擋住
  return { x0: lampX() + 42, x1: L.W - 10, y0: L.farBottom + 36, y1: L.H - 4 }
}

/** 寵物不能站進去的矩形（腳底座標）：鐘樓的後面與底座（站在那裡會被鐘樓擋住）。鐘樓前方保持可走 */
export function blockers(L: Layout): Rect[] {
  const tx = towerX(L)
  return [{ x0: tx - TOWER_W / 2 - 8, x1: tx + TOWER_W / 2 + 8, y0: 0, y1: towerBase(L) + 3 }]
}

/**
 * 固定位置的場景物件（不是隨機）：路燈、鐘樓、2 棵樹與少量裝飾。
 * 大型物件在「後排帶」，裝飾物散布在小路兩側的草地；鐘樓周圍約 1.5 倍寬度不放任何裝飾物。
 * 太窄的視窗會自動少放樹與裝飾。
 */
export function sceneObjects(L: Layout): SceneObject[] {
  const { H, farBottom: fb } = L
  const G = H - fb
  const out: SceneObject[] = [
    { key: 'lamp', x: lampX(), y: H - 12 },
    { key: 'clocktower', x: towerX(L), y: towerBase(L) },
  ]
  const left = lampX() + LAMP_W / 2 + 10 // 路燈右邊
  const right = towerX(L) - TOWER_CLEAR // 鐘樓淨空範圍的左緣
  // 樹：中間偏左、中間偏右，不擋住住家與鐘樓
  const tLo = left + TREE_W / 2
  const tHi = right - TREE_W / 2
  const range = tHi - tLo
  if (range >= 70) {
    out.push({ key: 'tree', x: Math.round(tLo + range * 0.22), y: fb + 46 })
    if (range >= 100) out.push({ key: 'tree', x: Math.round(tLo + range * 0.78), y: fb + 42 })
  } else if (range >= 0) out.push({ key: 'tree', x: Math.round(tLo + range / 2), y: fb + 44 })
  // 裝飾物：最多 4 件，固定位置，散布在路兩側的草地
  const dLo = left + 14
  const dHi = right - 22
  const span = Math.max(0, dHi - dLo)
  const at = (f: number): number => Math.round(dLo + span * f)
  out.push({ key: 'bush', x: at(0.06), y: fb + Math.round(G * 0.62) })
  out.push({ key: 'mushroom', x: at(0.36), y: fb + Math.round(G * 0.38) })
  if (span >= 120) out.push({ key: 'rocks', x: at(0.64), y: fb + Math.round(G * 0.66) })
  if (span >= 160) out.push({ key: 'flowers', x: at(0.9), y: fb + Math.round(G * 0.42) })
  return out
}

/** 固定物件在地面上的佔地（用來確認建築空位不和它們重疊） */
export function footprints(L: Layout): Rect[] {
  const sizes: Record<string, [number, number]> = {
    lamp: [LAMP_W * 0.5, 10],
    clocktower: [TOWER_W, 16],
    tree: [TREE_W * 0.6, 14],
    bush: [47, 12],
    mushroom: [37, 10],
    rocks: [52, 12],
    flowers: [39, 10],
  }
  const out: Rect[] = [{ x0: L.house.x0, x1: L.house.x1, y0: L.house.baseY - 30, y1: L.house.baseY }]
  for (const o of sceneObjects(L)) {
    const [w, d] = sizes[o.key] ?? [40, 10]
    out.push({ x0: o.x - w / 2, x1: o.x + w / 2, y0: o.y - d, y1: o.y })
  }
  return out
}

/**
 * 保留給之後建築（澡盆、蹺蹺板、沙坑、篝火、野餐墊、食盆水盆、花圃、狗窩、貓跳台）的空位；本版不顯示。
 * 依序在草地上找不和固定物件、小路重疊且彼此分開的位置（結果是固定的，不是隨機）。
 */
export function buildingSlots(L: Layout): { id: string; x: number; y: number; w: number; h: number }[] {
  const { H, farBottom: fb } = L
  const fixed = footprints(L).map((r) => ({ x0: r.x0 - 6, x1: r.x1 + 6, y0: r.y0 - 12, y1: r.y1 + 4 }))
  const slots: { id: string; x: number; y: number; w: number; h: number }[] = []
  const w = 56
  const h = 40
  const towerL = towerX(L) - TOWER_CLEAR
  for (let yy = fb + 60; yy <= H - 12 && slots.length < 3; yy += 4) {
    for (let xx = lampX() + 70; xx <= towerL - w / 2; xx += 8) {
      const r = { x0: xx - w / 2, x1: xx + w / 2, y0: yy - h, y1: yy }
      if (fixed.some((f) => r.x0 < f.x1 && r.x1 > f.x0 && r.y0 < f.y1 && r.y1 > f.y0)) continue
      if (slots.some((s) => Math.abs(s.x - xx) < w + 18 && Math.abs(s.y - yy) < h + 10)) continue
      slots.push({ id: 'slot' + (slots.length + 1), x: xx, y: yy, w, h })
      if (slots.length >= 3) break
    }
  }
  return slots
}
