/**
 * 像素場景的版面。
 *
 * 畫布以「整數倍放大」顯示：S = 每個邏輯像素佔幾個「裝置像素」（已含 devicePixelRatio，所以一定是整數，不會模糊）。
 * 邏輯高度盡量接近 270，視窗更寬就向左右延伸，天空與草地鋪滿；底部貼地（多出來的高度從天空上緣裁掉）。
 *
 * 配置（由左到右）：住家（最左下）→ 路燈 → 樹 → 樹 → 鐘樓（最右側的後排，貼近右邊緣）；水池在住家右上方的後排（左邊那棵樹的左側）。
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
/**
 * 後排景物（鐘樓、樹）的腳底貼近草地上緣：樹 = 草地上緣 + 10、+8；鐘樓同樣是草地上緣 + 10，
 * 但鐘樓很高（160），腳底不能高到讓頂端被畫面上緣切掉（>= 166），所以矮一點的視窗會比樹低幾個像素。
 */
export const towerBase = (L: Layout): number => Math.max(L.farBottom + BACK_BASE, TOWER_H + 6)
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

/**
 * 水池：放在住家正上方的空地、靠左。x = 水平中心、y = 腳底（素材底邊）。
 * y 由草地上緣算出來：整個素材（含最高的蘆葦尖端）都在草地上緣以下、不伸進遠景樹林，所以 y 的下限 = 草地上緣 + 素材高 + 2。
 * 底部石頭會被住家屋頂尖端蓋住一小部分（y 排序自然發生，約 3～5% 面積），水面中心完全可見。
 */
export function pondPos(L: Layout): { x: number; y: number } {
  return { x: POND_LEFT + POND_AX, y: L.farBottom + POND_H + 2 }
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

/**
 * 水池右前方的一條可走帶（腳底座標）：水池在住家正上方，離寵物主要的活動範圍有一段距離，
 * 所以在水池右邊、路燈上方開一條窄的可走區，讓寵物走到水池旁邊再跳進去。
 * x 從水池右緣再過去一點開始（避開煙囪與屋頂的遮擋），y 在水池底邊以下、路燈頂端以上。太矮的視窗沒有這一條（回傳 null）。
 */
export function pondStrip(L: Layout): Rect | null {
  const p = pondPos(L)
  const b = petBounds(L)
  // x0 = 160：離住家屋頂右緣（約 x=144）夠遠，站在這裡的寵物不會被屋頂遮住；y 從草地上緣下方一路到路燈頂端以上
  const r = { x0: 160, x1: b.x0 + 4, y0: L.farBottom + BACK_MARGIN, y1: L.H - LAMP_H - 12 - 4 }
  return r.y1 - r.y0 >= 6 && r.x1 - r.x0 >= 10 && p.y + 10 <= r.y1 ? r : null
}

/** 水池旁邊走去洗澡、洗完爬出來的站位（腳底座標）：在上面那條可走帶裡，沒被住家與路燈遮住 */
export function pondStand(L: Layout): { x: number; y: number } {
  const st = pondStrip(L)
  const b = petBounds(L)
  if (!st) return { x: b.x0 + 6, y: Math.min(b.y1, pondPos(L).y + 12) }
  return { x: st.x0 + 26, y: Math.min(st.y1, pondPos(L).y + 10) }
}

/** 所有可走的區域：主要活動範圍＋水池旁那條可走帶 */
export function walkZones(L: Layout): Rect[] {
  const st = pondStrip(L)
  return st ? [petBounds(L), st] : [petBounds(L)]
}

/** 把位置夾進可走區域（離最近的那個區域） */
export function clampToWalk(L: Layout, x: number, y: number): { x: number; y: number } {
  let best = { x, y, d: Infinity }
  for (const z of walkZones(L)) {
    const cx = Math.min(z.x1, Math.max(z.x0, x))
    const cy = Math.min(z.y1, Math.max(z.y0, y))
    const d = Math.hypot(cx - x, cy - y)
    if (d < best.d) best = { x: cx, y: cy, d }
  }
  return { x: best.x, y: best.y }
}

/** 寵物活動範圍（腳底座標）：地面帶（含草地與小路），不含天空與遠景，也不含住家與路燈那一塊 */
export function petBounds(L: Layout): Rect {
  // x0：路燈右側再留一隻寵物的半寬，寵物不會停在燈柱後面被擋住
  // y0：草地上緣下方留一點邊距，草地中段也是活動範圍（不是只有一條窄帶）
  return { x0: lampX() + 42, x1: L.W - 10, y0: L.farBottom + BACK_MARGIN, y1: L.H - 4 }
}

const blockerCache = new WeakMap<Layout, Rect[]>()

/**
 * 寵物不能站進去的矩形（腳底座標）：鐘樓的後面與底座、水池整個（含石頭圍邊）、樹幹。
 * 鐘樓與水池的前方保持可走。同一個 Layout 的結果會快取。
 */
export function blockers(L: Layout): Rect[] {
  const hit = blockerCache.get(L)
  if (hit) return hit
  const tx = towerX(L)
  const pd = pondPos(L)
  const out: Rect[] = [
    { x0: tx - TOWER_W / 2 - 8, x1: tx + TOWER_W / 2 + 8, y0: 0, y1: towerBase(L) + 3 },
    { x0: pd.x - POND_AX - 6, x1: pd.x - POND_AX + POND_W + 6, y0: 0, y1: pd.y + 4 },
  ]
  for (const o of sceneObjects(L)) {
    if (o.key === 'tree') out.push({ x0: o.x - TRUNK_HALF_W, x1: o.x + TRUNK_HALF_W, y0: o.y - TRUNK_H, y1: o.y + 2 })
    // 裝飾物：腳下一小塊（寵物不會走進去、也不會站在被它遮住的位置）
    else if (DECOR_SIZE[o.key]) out.push({ x0: o.x - DECOR_SIZE[o.key][0] * 0.4, x1: o.x + DECOR_SIZE[o.key][0] * 0.4, y0: o.y - DECOR_BLOCK_D, y1: o.y + 1 })
  }
  blockerCache.set(L, out)
  return out
}

/** 這個腳底位置站得住嗎（在活動範圍內、不在任何障礙物裡） */
export function isWalkable(L: Layout, x: number, y: number): boolean {
  if (!walkZones(L).some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1)) return false
  return !blockers(L).some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)
}

/** 離 (x, y) 最近的可站位置：由近到遠一圈一圈找（垂直方向距離算比較重，因為場景是斜視角） */
export function nearestWalkable(L: Layout, x: number, y: number): { x: number; y: number } {
  const c = clampToWalk(L, x, y)
  if (isWalkable(L, c.x, c.y)) return c
  let best: { x: number; y: number; d: number } | null = null
  for (const b of walkZones(L))
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
/** 裝飾物腳下不可站的深度 */
const DECOR_BLOCK_D = 10

const hit = (r: Rect, o: Rect, gx = 0, gy = gx): boolean => r.x0 < o.x1 + gx && r.x1 > o.x0 - gx && r.y0 < o.y1 + gy && r.y1 > o.y0 - gy
const sceneCache = new WeakMap<Layout, { back: SceneObject[]; slots: BuildingSlot[]; decor: SceneObject[] }>()

/** 草地上的小路上緣（路與草地的交界）；建築空位貼在這條線上 */
export const pathTopOf = (L: Layout): number => L.H - 6 - PATH_H

/**
 * 後排景物（固定位置、不是隨機）：路燈、鐘樓、水池、2 棵樹。鐘樓、樹的腳底貼近草地上緣（草地上緣 + 10 附近），
 * 水池因為整個素材（含蘆葦尖端）不可超出草地上緣，底邊只能在草地上緣 + 81。
 * 兩棵樹在路燈右邊到鐘樓淨空範圍之間的 22%、78%（對稱），不縮放；窄視窗只放 1 棵。
 */
function backRow(L: Layout): SceneObject[] {
  const { farBottom: fb } = L
  const pd = pondPos(L)
  const out: SceneObject[] = [
    { key: 'lamp', x: lampX(), y: L.H - 12 },
    { key: 'clocktower', x: towerX(L), y: towerBase(L) },
    { key: 'pond', x: pd.x, y: pd.y },
  ]
  const left = lampX() + LAMP_W / 2 + 10
  const right = towerX(L) - TOWER_CLEAR // 鐘樓淨空範圍的左緣
  const tLo = left + TREE_W / 2
  const tHi = right - TREE_W / 2
  const range = tHi - tLo
  if (range >= 70) {
    out.push({ key: 'tree', x: Math.round(tLo + range * 0.22), y: fb + BACK_BASE })
    if (range >= 100) out.push({ key: 'tree', x: Math.round(tLo + range * 0.78), y: fb + BACK_BASE - 2 })
  } else if (range >= 0) out.push({ key: 'tree', x: Math.round(tLo + range / 2), y: fb + BACK_BASE })
  return out
}

const FOOT_SIZES: Record<string, [number, number]> = {
  lamp: [LAMP_W * 0.5, 10],
  clocktower: [TOWER_W, 16],
  tree: [TREE_W * 0.6, 14],
  pond: [POND_W - 20, 22],
}

function backFootprints(L: Layout): Rect[] {
  const out: Rect[] = [{ x0: L.house.x0, x1: L.house.x1, y0: L.house.baseY - 30, y1: L.house.baseY }]
  for (const o of backRow(L)) {
    const [w, d] = FOOT_SIZES[o.key] ?? [40, 10]
    out.push({ x0: o.x - w / 2, x1: o.x + w / 2, y0: o.y - d, y1: o.y })
  }
  return out
}

/** 裝飾物（蘑菇、樹樁、灌木、高草叢、石頭、小花叢）的偏好位置：在草地範圍內的比例，故意不排整齊 */
const DECOR_ANCHORS: { key: string; fx: number; fy: number }[] = [
  { key: 'mushroom', fx: 0.1, fy: 0.3 },
  { key: 'stump', fx: 0.47, fy: 0.42 },
  { key: 'tall_grass', fx: 0.86, fy: 0.22 },
  { key: 'flowers', fx: 0.95, fy: 0.7 },
  { key: 'bush', fx: 0.04, fy: 0.84 },
  { key: 'rocks', fx: 0.66, fy: 0.9 },
]

/** 裝飾物：避開後排景物、住家、建築空位（含預留範圍）與彼此，離偏好位置最近的可放位置（固定，不是隨機） */
function decorRow(L: Layout, slots: BuildingSlot[], back: Rect[]): SceneObject[] {
  const b = petBounds(L)
  const xl = b.x0 + 6
  const xr = towerX(L) - TOWER_CLEAR - 16
  const yTop = L.farBottom + 30
  const yBot = pathTopOf(L) - 4
  const placed: { o: SceneObject; r: Rect }[] = []
  const walls = [...back.map((r) => ({ ...r, y0: r.y0 - 4 })), ...slots.map((s) => slotFootprint(s))]
  for (const a of DECOR_ANCHORS) {
    const [w, h] = DECOR_SIZE[a.key]
    const ax = xl + a.fx * (xr - xl)
    const ay = yTop + a.fy * (yBot - yTop)
    let best: { x: number; y: number; d: number } | null = null
    for (let y = yTop + h * 0.3; y <= yBot; y += 3)
      for (let x = xl + w / 2; x <= xr - w / 2; x += 3) {
        // 外框的下半部要和空位、後排景物的佔地分開；整個外框要和已放的裝飾分開
        // 腳下那一塊（素材外框下面 40%）要和空位、後排景物的佔地分開（裝飾物在空位後面被遮住是正常的 y 排序）
        const foot = { x0: x - w / 2, x1: x + w / 2, y0: y - h, y1: y }
        if (walls.some((r) => hit(foot, r, 4))) continue
        const full = { x0: x - w / 2, x1: x + w / 2, y0: y - h, y1: y }
        if (placed.some((q) => hit(full, q.r, 4))) continue
        const d = Math.hypot(x - ax, (y - ay) * 1.4)
        if (!best || d < best.d) best = { x, y, d }
      }
    if (best) placed.push({ o: { key: a.key, x: Math.round(best.x), y: Math.round(best.y) }, r: { x0: best.x - w / 2, x1: best.x + w / 2, y0: best.y - h, y1: best.y } })
  }
  return placed.map((q) => q.o)
}

function scene(L: Layout): { back: SceneObject[]; slots: BuildingSlot[]; decor: SceneObject[] } {
  const c = sceneCache.get(L)
  if (c) return c
  const back = backRow(L)
  const fixedFoot = backFootprints(L)
  // 順序：先排所有建築空位（8 個），裝飾物再依偏好位置擺在剩下的地方（避開空位的佔地、後排景物與彼此）
  const slots = computeSlots(L, SLOT_SPECS, [], fixedFoot)
  const decor = decorRow(L, slots, fixedFoot)
  const out = { back, slots, decor }
  sceneCache.set(L, out)
  return out
}

/** 固定位置的場景物件：後排景物＋裝飾物（太窄的視窗放不下的裝飾會省略） */
export function sceneObjects(L: Layout): SceneObject[] {
  const sc = scene(L)
  return [...sc.back, ...sc.decor]
}

/** 固定物件在地面上的佔地（含住家）；裝飾物用素材外框下面 40%（建築空位的佔地不可和它們重疊） */
export function footprints(L: Layout): Rect[] {
  const out = backFootprints(L)
  for (const o of scene(L).decor) {
    const [w, d] = DECOR_SIZE[o.key]
    out.push({ x0: o.x - w / 2, x1: o.x + w / 2, y0: o.y - d, y1: o.y })
  }
  return out
}

export type SlotKind = 'kennel' | 'catTree' | 'small' | 'large'

/**
 * 建築空位：x、y = 腳底中心（邏輯座標）；w、h = 之後放的素材外框大小（佔位範圍）；
 * fw、fd = 腳下的佔地（寬、深），空位彼此、與固定物件的佔地都不重疊。
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

interface SlotSpec {
  id: string
  kind: SlotKind
  w: number
  h: number
  fw: number
  fd: number
  /** 偏好位置：在可用範圍的水平比例；row：edge = 貼著走道上緣、mid = 草地中段、any = 草地到走道上緣之間 */
  fx: number
  fy: number
  row: 'edge' | 'mid' | 'any'
}

/**
 * 要預留的空位，依優先順序（先排先找位置）：狗窩、貓跳台（走道上緣，彼此遠離）→ 大型 ×2（遊樂設施、篝火，草地中段）
 * → 小型 ×4（食盆水盆、花圃、沙坑、野餐墊，草地與走道上緣）。
 */
export const SLOT_SPECS: SlotSpec[] = [
  { id: 'kennel', kind: 'kennel', w: 87, h: 72, fw: 66, fd: 22, fx: 0.22, fy: 1, row: 'edge' },
  { id: 'catTree', kind: 'catTree', w: 63, h: 79, fw: 46, fd: 22, fx: 0.78, fy: 1, row: 'edge' },
  { id: 'large1', kind: 'large', w: 100, h: 75, fw: 84, fd: 24, fx: 0.25, fy: 0.45, row: 'mid' },
  { id: 'large2', kind: 'large', w: 100, h: 75, fw: 84, fd: 24, fx: 0.78, fy: 0.45, row: 'mid' },
  { id: 'small1', kind: 'small', w: 96, h: 66, fw: 68, fd: 18, fx: 0.5, fy: 1, row: 'edge' },
  { id: 'small2', kind: 'small', w: 96, h: 66, fw: 68, fd: 18, fx: 0.5, fy: 0.5, row: 'mid' },
  { id: 'small3', kind: 'small', w: 96, h: 66, fw: 68, fd: 18, fx: 0.05, fy: 0.75, row: 'any' },
  { id: 'small4', kind: 'small', w: 96, h: 66, fw: 68, fd: 18, fx: 0.95, fy: 0.8, row: 'any' },
]

/** 空位的佔地矩形 */
export const slotFootprint = (s: BuildingSlot): Rect => ({ x0: s.x - s.fw / 2, x1: s.x + s.fw / 2, y0: s.y - s.fd, y1: s.y })

/**
 * 建築空位（本版不顯示、也不擋寵物）。建築購買之後才加入障礙：
 * 把已擁有的空位交給 slotBlockers，結果併進 blockers() 的陣列（腳下佔地稍微放大一點，寵物才不會貼著牆擠進去）。
 * 目前沒有任何建築，所以 blockers() 不含空位。
 */
export function slotBlockers(slots: BuildingSlot[], owned: ReadonlySet<string>): Rect[] {
  return slots.filter((s) => owned.has(s.id)).map((s) => {
    const r = slotFootprint(s)
    return { x0: r.x0 - 2, x1: r.x1 + 2, y0: r.y0 - 2, y1: r.y1 + 1 }
  })
}

function computeSlots(L: Layout, specs: SlotSpec[], before: BuildingSlot[], obstacles: Rect[]): BuildingSlot[] {
  const { farBottom: fb } = L
  const b = petBounds(L)
  const fixed = obstacles.map((r) => ({ x0: r.x0 - 4, x1: r.x1 + 4, y0: r.y0 - 6, y1: r.y1 + 4 }))
  const zones = walkZones(L)
  const xl = b.x0 + 6
  const xr = towerX(L) - TOWER_CLEAR
  const pathTop = pathTopOf(L)
  const yMax = pathTop + 2
  // 空位的佔地要完整落在可走區域裡（水池旁那條可走帶也算，不過那裡沒有走道上緣）
  const inside = (r: Rect, xMax: number): boolean => zones.some((z) => r.x0 >= z.x0 + 2 && r.x1 <= Math.min(z.x1, xMax) && r.y0 >= z.y0 && r.y1 <= z.y1 + 4)
  const placed: BuildingSlot[] = []
  for (const sp of specs) {
    // 狗窩：住家右邊、路燈右側的走道上緣，離路燈 44 像素以上；貓跳台：鐘樓正下方的走道上緣（鐘樓門前），離畫面右緣留 > 40 像素
    const xMax = sp.kind === 'catTree' ? L.W - 24 : xr
    const xMin = sp.kind === 'kennel' ? lampX() + LAMP_W / 2 + 44 + sp.fw / 2 : sp.kind === 'catTree' ? towerX(L) - 8 : zones[zones.length - 1].x0 + sp.fw / 2
    const ax = sp.kind === 'kennel' ? xMin : sp.kind === 'catTree' ? towerX(L) : xl + sp.fx * (xr - xl)
    const yLo = sp.row === 'edge' ? pathTop - 2 : Math.max(fb + BACK_MARGIN + sp.fd + 2, fb - 8 + sp.h)
    const yHi = sp.row === 'edge' ? yMax : pathTop - 6
    const ay = sp.row === 'edge' ? pathTop : yLo + sp.fy * (yHi - yLo)
    let best: { x: number; y: number; cost: number } | null = null
    for (let y = yLo; y <= yHi; y += 3)
      for (let x = Math.ceil(xMin); x <= (sp.kind === 'catTree' ? towerX(L) + 8 : xMax - sp.fw / 2); x += 2) {
        if (y - sp.h < fb - 8) continue // 素材頂端不能伸進遠景
        // 貓跳台的素材頂端要在鐘樓腳底之下（不蓋到塔門，也不擋塔門的 hover 與點擊範圍）
        if (sp.kind === 'catTree' && y - sp.h < towerBase(L) + 6) continue
        const r = { x0: x - sp.fw / 2, x1: x + sp.fw / 2, y0: y - sp.fd, y1: y }
        if (!inside(r, xMax)) continue
        if (fixed.some((f) => hit(r, f))) continue
        const pair = (q: BuildingSlot): boolean =>
          (sp.kind === 'catTree' && q.kind === 'kennel') || (sp.kind === 'kennel' && q.kind === 'catTree')
        // 狗窩與貓跳台彼此隔開（腳下佔地至少隔 12 像素）；其他空位之間留一點縫
        if (placed.some((q) => hit(r, slotFootprint(q), pair(q) ? 12 : 8, pair(q) ? 8 : 6)) || before.some((q) => hit(r, slotFootprint(q), pair(q) ? 12 : 8, pair(q) ? 8 : 6))) continue
        const cost = Math.abs(x - ax) + 1.6 * Math.abs(y - ay)
        if (!best || cost < best.cost) best = { x, y, cost }
      }
    if (best) placed.push({ id: sp.id, kind: sp.kind, x: best.x, y: best.y, w: sp.w, h: sp.h, fw: sp.fw, fd: sp.fd })
  }
  return placed
}

/** 建築空位（排好的結果會快取） */
export function buildingSlots(L: Layout): BuildingSlot[] {
  return scene(L).slots
}

/** 窄視窗放不下某個建築時，購買時顯示的提示 */
export const SLOT_UNAVAILABLE_MESSAGE = '此視窗大小空間不足，請放大視窗'

/** 之後會放的 8 種建築，各自要用哪一種空位（遊樂設施、篝火是大型；食盆水盆、花圃、沙坑、野餐墊是小型） */
export const BUILDING_NEEDS: { id: string; name: string; kind: SlotKind }[] = [
  { id: 'kennel', name: '狗窩', kind: 'kennel' },
  { id: 'catTree', name: '貓跳台', kind: 'catTree' },
  { id: 'playground', name: '遊樂設施', kind: 'large' },
  { id: 'campfire', name: '篝火', kind: 'large' },
  { id: 'bowls', name: '食盆水盆', kind: 'small' },
  { id: 'flowerbed', name: '花圃', kind: 'small' },
  { id: 'sandbox', name: '沙坑', kind: 'small' },
  { id: 'picnic', name: '野餐墊', kind: 'small' },
]

export interface BuildingAvailability {
  id: string
  name: string
  /** 這個視窗大小放得下嗎；放不下的建築先隱藏，購買時顯示 message（建築種類不會被刪掉，視窗放大後就會出現） */
  available: boolean
  slotId: string | null
  message: string | null
}

/**
 * 依目前視窗大小，哪些建築有空位可放（同種空位依序分配給同種建築）。
 * 本版還沒有購買介面，只提供這個判斷；介面做好之後：available 為 false 的建築先隱藏，點購買時顯示 message。
 */
export function buildingAvailability(L: Layout): BuildingAvailability[] {
  const free = buildingSlots(L).map((s) => ({ ...s }))
  return BUILDING_NEEDS.map((b) => {
    const i = free.findIndex((s) => s.kind === b.kind)
    if (i < 0) return { id: b.id, name: b.name, available: false, slotId: null, message: SLOT_UNAVAILABLE_MESSAGE }
    const [slot] = free.splice(i, 1)
    return { id: b.id, name: b.name, available: true, slotId: slot.id, message: null }
  })
}
