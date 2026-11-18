/**
 * 像素場景的版面。
 *
 * v3.9.0 起場景是固定的 640×320 邏輯像素（SCENE_W × SCENE_H），放大規則見 sceneScale；S = 每個邏輯像素佔幾個「裝置像素」（已含 devicePixelRatio）。
 * 視窗多出來的空間由引擎畫天空、遠景、草地延伸（Layout.view），不是場景的一部分。
 *
 * 配置（由左到右）：住家（最左下）→ 路燈 → 樹 → 樹 → 鐘樓（最右側的後排，貼近右邊緣）；水池在住家右上方的後排（左邊那棵樹的左側）。
 * 裝飾物散布在小路兩側的草地，位置固定（不是隨機）。尺寸常數要和 public/assets/manifest.json 一致（測試會檢查）。
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
  /** 住家的位置與尺寸 */
  house: { x0: number; x1: number; baseY: number }
  /**
   * 已購買的建築 id（引擎在存檔變動時換一個新的 Set）。購買後的建築腳下佔地才加入障礙（blockers），
   * 太窄的視窗放不下的建築不在 buildingSlots 裡，所以紀錄還在、但沒有畫面也沒有障礙。
   */
  owned: ReadonlySet<string>
}

const NO_OWNED: ReadonlySet<string> = new Set()

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
export const BOWLS_H = 26
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
 * 由圖集像素算出，測試會用圖集重新量一次比對。
 */
export const CAT_TREE_MAX_SHIFT = 120
/** 招牌的判定範圍：中心 TOWER_SIGN ± 這個半寬、半高 */
export const TOWER_SIGN_HALF = { w: 12, h: 8 }
export const CAT_TREE_ENVELOPE_ROW0 = -12
export const CAT_TREE_ENVELOPE: readonly (readonly [number, number])[] = [
  [6, 16], [4, 18], [-5, 20], [-6, 21], [-6, 22], [-6, 23],
  [-6, 24], [-6, 25], [-6, 25], [-6, 26], [-7, 26], [-7, 27],
  [-7, 27], [-7, 28], [-9, 29], [-11, 31], [-12, 32], [-13, 33],
  [-13, 33], [-13, 33], [-13, 33], [-13, 33], [-13, 33], [-13, 33],
  [-13, 33], [-13, 32], [-12, 32], [-11, 31], [-10, 29], [-6, 26],
  [2, 25], [2, 25], [2, 25], [2, 25], [2, 25], [2, 25],
  [2, 25], [2, 25], [-24, 25], [-28, 25], [-31, 25], [-34, 27],
  [-35, 28], [-35, 29], [-36, 29], [-36, 29], [-36, 29], [-36, 29],
  [-36, 28], [-35, 27], [-34, 26], [-23, 14], [-23, 14], [-23, 14],
  [-23, 14], [-23, 22], [-23, 30], [-23, 31], [-23, 31], [-23, 31],
  [-23, 31], [-23, 31], [-23, 31], [-23, 31], [-23, 31], [-23, 31],
  [-23, 31], [-23, 31], [-23, 31], [-23, 31], [-23, 31], [-23, 31],
  [-23, 31], [-23, 31], [-23, 31], [-23, 31], [-23, 31], [-23, 31],
  [-23, 31], [-23, 31], [-23, 31], [-23, 31], [-23, 31], [-23, 30],
  [-23, 29], [-24, 27], [-26, 31], [-29, 35], [-31, 36], [-33, 36],
  [-34, 36], [-35, 36], [-36, 36], [-36, 36], [-36, 35], [-36, 34],
  [-36, 32], [-34, 30], [-33, 29], [-21, 27], [-16, 25], [-7, 0],
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
export const TOWER_CLOCK_FALLBACK = { cx: 62, cy: 82, r: 17 }
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
    owned: NO_OWNED,
  }
}

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
  key: string
  /** 水平中心、腳底 y */
  x: number
  y: number
}

export const lampX = (): number => HOUSE_X0 + HOUSE_W + 26
/** 狗窩的水平中心（錨點）：和路燈的不透明像素相接（見 KENNEL_DX_FROM_LAMP） */
export const kennelX = (): number => lampX() + KENNEL_DX_FROM_LAMP
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

/** 洗澡站位離水池素材右緣的水平距離：寵物半身寬（大型犬約 28）；站位的寵物不被水池的石頭蓋住（水池腳底較低、排在寵物之前） */
export const POND_STAND_DX = 28

/**
 * 水池右邊緊貼水池的一條可走帶（腳底座標）：水池在住家正上方，離寵物主要的活動範圍有一段距離，
 * 所以在水池右緣旁邊、住家屋頂與煙囪的上面開一條窄的可走區，一路接到主要活動範圍，讓寵物走到水池旁邊再跳進去。
 * y 的下緣 = 住家屋頂頂端往上 4（站在這裡的寵物整個身體都在屋頂之上，不會被住家蓋住），上緣 = 草地上緣下 BACK_MARGIN。
 * 太矮的視窗上下放不下（< 6）才回傳 null。
 */
export function pondStrip(L: Layout): Rect | null {
  const pd = pondPos(L)
  const b = petBounds(L)
  const r = { x0: pd.x - POND_AX + POND_W + 8, x1: b.x0 + 4, y0: L.farBottom + BACK_MARGIN, y1: L.house.baseY - HOUSE_H - 4 }
  return r.y1 - r.y0 >= 6 && r.x1 - r.x0 >= 10 ? r : null
}

/**
 * 洗澡的站位（腳底座標）：走去洗澡的終點、洗完爬出來的落點，三種洗澡入口（氣泡選單、拖曳到水池、洗完爬出甩水）共用同一個點。
 * 緊貼水池右緣（POND_STAND_DX），高度在水面中心偏下（但不低於通道下緣）；和有沒有買建築無關。
 */
export function pondStand(L: Layout): { x: number; y: number } {
  const pd = pondPos(L)
  const st = pondStrip(L)
  const w = waterEllipse(L)
  // v3.5.1：太矮的視窗（H < 287）沒有洗澡通道，原本的站位落在不可走的區域、寵物走不到。
  // 備援站位 = 主要活動範圍最左邊（再往右 4）、高度在水面中心偏下；起跳與爬出都用同一個點。H ≥ 287 完全不變。
  if (!st) return fallbackStand(L, w)
  const x = pd.x - POND_AX + POND_W + POND_STAND_DX
  const y0 = st ? st.y0 + 2 : L.farBottom + BACK_MARGIN
  const y1 = st ? st.y1 : L.house.baseY - HOUSE_H - 4
  return { x, y: Math.max(y0, Math.min(y1, w.cy + 16)) }
}

const fallbackCache = new WeakMap<Layout, { owned: ReadonlySet<string>; pt: { x: number; y: number } }>()
function fallbackStand(L: Layout, w: { cy: number }): { x: number; y: number } {
  const hit = fallbackCache.get(L)
  if (hit && hit.owned === L.owned) return hit.pt
  const b = petBounds(L)
  // 高度在水面中心偏下，但不低於狗窩素材頂端（狗窩的位置不看有沒有買：洗完的寵物不可站在狗窩屋頂後面被蓋住，v3.4.1 修過同樣的問題）
  const kennel = buildingSlots(L).find((s) => s.id === 'kennel')
  let y = Math.max(b.y0 + 2, Math.min(b.y1, w.cy + 16))
  if (kennel) y = Math.max(b.y0 + 2, Math.min(y, kennel.y - KENNEL_H - 1))
  const want = { x: b.x0 + 4, y }
  // 極端小的視窗（H 約 226～231）這個點被障礙擋住：換成最近的可站位置
  const pt = isWalkable(L, want.x, want.y) ? want : nearestWalkable(L, want.x, want.y)
  fallbackCache.set(L, { owned: L.owned, pt })
  return pt
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
  return { x0: petMinX(), x1: L.W - 10, y0: L.farBottom + BACK_MARGIN, y1: L.H - 4 }
}

/** 寵物活動範圍的左緣：路燈右側再留一隻寵物的半寬（燈座的石圈與燈罩不會蓋住站在這裡的寵物）。狗窩的門在這條線的左邊，窩前的座位旁只能站在這條線的右邊 */
export const petMinX = (): number => lampX() + 42

const blockerCache = new WeakMap<Layout, { owned: ReadonlySet<string>; rects: Rect[] }>()

/**
 * 寵物不能站進去的矩形（腳底座標）：鐘樓的後面與底座、水池整個（含石頭圍邊）、樹幹。
 * 鐘樓與水池的前方保持可走。已購買（而且這個視窗放得下）的建築腳下佔地也是障礙。
 * 同一個 Layout、同一份 owned 的結果會快取。
 */
export function blockers(L: Layout): Rect[] {
  const hit = blockerCache.get(L)
  if (hit && hit.owned === L.owned) return hit.rects
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
  out.push(...slotBlockers(buildingSlots(L), L.owned))
  blockerCache.set(L, { owned: L.owned, rects: out })
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
/** 草地上的建築 id（排位時要檢查素材外框） */
const GRASS_IDS = ['picnicMat']
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
    if (range >= 100) out.push({ key: 'tree', x: Math.round(tLo + range * 0.78), y: fb + BACK_BASE })
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

/** 裝飾物的腳底和兩棵樹的腳底同一條線（草地上緣 + BACK_BASE）；它們往上伸進後面的遠景樹林 */
export const DECOR_BASE = BACK_BASE

/** 裝飾物（蘑菇、樹樁、灌木、高草叢、石頭、小花叢）的偏好位置：沿著後排帶的水平比例，故意疏密不同、不等距 */
const DECOR_ANCHORS: { key: string; fx: number }[] = [
  { key: 'mushroom', fx: 0.04 },
  { key: 'rocks', fx: 0.3 },
  { key: 'flowers', fx: 0.43 },
  { key: 'stump', fx: 0.6 },
  { key: 'bush', fx: 0.79 },
  { key: 'tall_grass', fx: 0.95 },
]

/**
 * 裝飾物：全部放在後排帶，腳底與樹同一個 y（草地上緣 + 10）。
 * 水平範圍：水池右緣再過去一點 → 鐘樓前面花叢左側；每個依偏好位置找最近、不壓到樹幹腳下與其他裝飾（留 8 像素縫）的位置。
 * 這條線在洗澡通道（寵物可走範圍從草地上緣 + 14 開始）的上面，裝飾腳下的障礙在草地上緣 + 11 以內，不會占用或擋住通道。
 * 空間不夠（窄視窗）放不下的就不放。
 */
function decorRow(L: Layout, back: SceneObject[]): SceneObject[] {
  const y = L.farBottom + DECOR_BASE
  const xL = POND_LEFT + POND_W + 16
  const xR = towerX(L) - TOWER_W / 2 - 24
  const walls: Rect[] = back
    .filter((o) => o.key === 'tree')
    .map((o) => ({ x0: o.x - TREE_W * 0.3 - 4, x1: o.x + TREE_W * 0.3 + 4, y0: 0, y1: 1e9 }))
  const placed: Rect[] = []
  const out: SceneObject[] = []
  for (const a of DECOR_ANCHORS) {
    const w = DECOR_SIZE[a.key][0]
    const ax = xL + a.fx * (xR - xL)
    let best: number | null = null
    for (let d = 0; d <= xR - xL; d += 2) {
      for (const x of d === 0 ? [ax] : [ax - d, ax + d]) {
        if (x - w / 2 < xL || x + w / 2 > xR) continue
        const r = { x0: x - w / 2, x1: x + w / 2, y0: 0, y1: 1e9 }
        if (walls.some((q) => hit(r, q)) || placed.some((q) => hit(r, q, 8))) continue
        best = x
        break
      }
      if (best !== null) break
    }
    if (best !== null) {
      placed.push({ x0: best - w / 2, x1: best + w / 2, y0: 0, y1: 1e9 })
      out.push({ key: a.key, x: Math.round(best), y })
    }
  }
  return out
}

function scene(L: Layout): { back: SceneObject[]; slots: BuildingSlot[]; decor: SceneObject[] } {
  const c = sceneCache.get(L)
  if (c) return c
  const back = backRow(L)
  const decor = decorRow(L, back)
  const slots = computeSlots(L, [...backFootprints(L), ...decor.map(decorRect)])
  const out = { back, slots, decor }
  sceneCache.set(L, out)
  return out
}

const decorRect = (o: SceneObject): Rect => ({ x0: o.x - DECOR_SIZE[o.key][0] / 2, x1: o.x + DECOR_SIZE[o.key][0] / 2, y0: o.y - DECOR_SIZE[o.key][1], y1: o.y })

/** 固定位置的場景物件：後排景物＋裝飾物（太窄的視窗放不下的裝飾會省略） */
export function sceneObjects(L: Layout): SceneObject[] {
  const sc = scene(L)
  return [...sc.back, ...sc.decor]
}

/** 固定物件在地面上的佔地（含住家）；裝飾物用整個素材外框 */
export function footprints(L: Layout): Rect[] {
  return [...backFootprints(L), ...scene(L).decor.map(decorRect)]
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
  { id: 'picnicMat', name: '野餐墊', kind: 'small', w: 117, h: 69, fw: 84, fd: 20 },
]

/** 走道上的空位（狗窩、食盆水盆、貓跳台）腳底在走道上緣再往下這麼多：落在沙地走道的上半部 */
export const PATH_FOOT = 24
/** 走道下半部留給寵物走的最小寬度（腳底線到寵物可走範圍下緣，邏輯像素）：走道深 67，上半部放建築，下半部至少剩這麼多 */
export const PATH_FREE_MIN = 36
/** 走道上空位的腳底線 y */
export const pathFootY = (L: Layout): number => pathTopOf(L) + PATH_FOOT

/** 空位的素材外框（建築模式的虛線框、購買後建築的畫面範圍）：腳底中心在 (x, y)，往上 h */
export const slotBox = (s: BuildingSlot): Rect => ({ x0: s.x - s.w / 2, x1: s.x + s.w / 2, y0: s.y - s.h, y1: s.y })

/** 已購買、而且這個視窗放得下的建築空位（畫面上畫出來、寵物會使用的建築） */
export function ownedSlots(L: Layout): BuildingSlot[] {
  return buildingSlots(L).filter((s) => L.owned.has(s.id))
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

/**
 * 排空位。不手調座標：全部依草地上緣、走道位置、視窗大小算出。
 *  走道上：狗窩（路燈後面，左緣被燈桿蓋住 KENNEL_TUCK 像素，位置固定）→ 食盆水盆（狗窩右邊、素材間隔 BOWLS_GAP）→ 貓跳台（鐘樓正下方偏左，右緣離畫面右緣 > 40）；腳底都在走道上半部。
 *  草地上：野餐墊（鐘樓前面、塔門正下方、貓跳台上方，貼地不遮塔門）。
 * 找不到位置的空位不放（回傳的陣列沒有它），由 buildingAvailability 轉成「此視窗大小空間不足」。
 */
function computeSlots(L: Layout, obstacles: Rect[]): BuildingSlot[] {
  const b = petBounds(L)
  const strip = pondStrip(L)
  const tx = towerX(L)
  const pathTop = pathTopOf(L)
  const foot = pathFootY(L)
  const fixed = obstacles.map((r) => ({ x0: r.x0 - 4, x1: r.x1 + 4, y0: r.y0 - 6, y1: r.y1 + 4 }))
  // 洗澡通道（水池右邊的窄可走帶）不可被任何空位占用
  if (strip) fixed.push({ x0: strip.x0 - 8, x1: strip.x1 + 8, y0: strip.y0 - 4, y1: strip.y1 + 4 })
  // v3.4.0：草地上的建築（素材外框）不可蓋住狗窩、食盆水盆、貓跳台、住家、路燈、水池、塔門、洗澡通道，彼此也要隔開（前後依腳底高度排，但外框不重疊比較好看）
  const pd = pondPos(L)
  const door = towerDoorRect(L)
  const avoid: Rect[] = [
    { x0: L.house.x0, x1: L.house.x1, y0: L.house.baseY - HOUSE_H, y1: L.house.baseY },
    { x0: lampX() - LAMP_AX, x1: lampX() - LAMP_AX + LAMP_W, y0: L.H - 12 - LAMP_H, y1: L.H - 12 },
    { x0: pd.x - POND_AX, x1: pd.x - POND_AX + POND_W, y0: pd.y - POND_H, y1: pd.y },
    { x0: door.x0 - 6, x1: door.x1 + 6, y0: door.y0 - 6, y1: door.y1 + 6 },
  ]
  if (strip) avoid.push({ x0: strip.x0, x1: strip.x1 + 8, y0: strip.y0 - 4, y1: strip.y1 + 4 })
  const placed: BuildingSlot[] = []
  const get = (id: string): BuildingSlot | undefined => placed.find((q) => q.id === id)
  const inMain = (r: Rect): boolean => r.x0 >= b.x0 + 2 && r.x1 <= b.x1 - 10 && r.y0 >= b.y0 && r.y1 <= b.y1

  for (const sp of SLOT_SPECS) {
    // 每個空位的搜尋視窗：x、y 範圍與偏好位置 (ax, ay)、與其他空位的最小間隔
    let x0 = 0, x1 = 0, y0 = foot, y1 = foot, ax = 0, ay = foot, gap = 10
    switch (sp.id) {
      case 'kennel':
        // 狗窩與路燈的不透明像素左右相接（位置固定，只由路燈決定）
        x0 = kennelX()
        x1 = x0
        ax = x0
        break
      case 'bowls': {
        // 食盆水盆緊貼狗窩右緣（不透明像素逐列量過，縫 1 像素）
        const k = get('kennel')
        if (!k) continue
        x0 = k.x + BOWLS_DX_FROM_KENNEL
        x1 = x0
        ax = x0
        break
      }
      case 'catTree':
        // 預設在鐘樓中心再往右 CAT_TREE_DX_FROM_TOWER（右緣離畫面右緣約 30）。放不下（頂端含頂層貓會碰到塔門或招牌）時
        // 才往左挪，挪到剛好不碰（cost 是離預設位置的距離，所以取最小的挪動量）
        x1 = tx + CAT_TREE_DX_FROM_TOWER
        x0 = x1 - CAT_TREE_MAX_SHIFT
        ax = x1
        break
      case 'picnicMat': {
        // 塔門正下方、貓跳台上方：素材頂端在塔腳之下（不蓋塔門、不擋塔門的 hover 與點擊範圍），腳下佔地不壓貓跳台
        const c = get('catTree')
        x0 = tx - 6
        x1 = tx + 6
        ax = tx
        y0 = towerBase(L) + 4 + sp.h
        y1 = (c ? c.y - c.fd : pathTop) - sp.fd - 10
        ay = (y0 + y1) / 2
        gap = 10
        break
      }
    }
    let best: { x: number; y: number; cost: number } | null = null
    const stepX = sp.id === 'catTree' ? 1 : 2
    for (let y = Math.ceil(y0); y <= y1; y += 2)
      for (let x = Math.ceil(x0); x <= x1; x += stepX) {
        const r = { x0: x - sp.fw / 2, x1: x + sp.fw / 2, y0: y - sp.fd, y1: y }
        // 狗窩的佔地左緣在可走範圍之外（燈桿後面），只要求右邊與上下界；其餘空位整個佔地都要在可走範圍內
        if (sp.id === 'kennel' ? !(r.x1 <= b.x1 - 10 && r.y0 >= b.y0 && r.y1 <= b.y1) : !inMain(r)) continue
        if (sp.id === 'catTree' && (x + sp.w / 2 > L.W - CAT_TREE_RIGHT_MARGIN || catTreeHitsTower(L, x, y - sp.h))) continue
        if (fixed.some((f) => hit(r, f))) continue
        if (GRASS_IDS.includes(sp.id)) {
          const box = { x0: x - Math.floor(sp.w / 2), x1: x - Math.floor(sp.w / 2) + sp.w, y0: y - sp.h, y1: y }
          if (avoid.some((q) => hit(box, q))) continue
          if (placed.some((q) => ['kennel', 'bowls', 'catTree'].includes(q.id) ? hit(box, slotBox(q), 4) : hit(box, slotBox(q), 6, 4))) continue
        }
        // 野餐墊、貓跳台與路燈之外的空位：和已放的空位保持 gap；走道上的空位彼此間隔 12
        if (placed.some((q) => hit(r, slotFootprint(q), gap, Math.max(6, gap / 2)))) continue
        const cost = Math.abs(x - ax) + 1.6 * Math.abs(y - ay)
        if (!best || cost < best.cost) best = { x, y, cost }
      }
    if (best) placed.push({ id: sp.id, kind: sp.kind, x: best.x, y: best.y, w: sp.w, h: sp.h, fw: sp.fw, fd: sp.fd })
  }
  return SLOT_SPECS.map((sp) => placed.find((q) => q.id === sp.id)).filter((q): q is BuildingSlot => !!q)
}

/** 建築空位（排好的結果會快取） */
export function buildingSlots(L: Layout): BuildingSlot[] {
  return scene(L).slots
}

/** 窄視窗放不下某個建築時，購買時顯示的提示（找不到放大到多少才放得下時的備用說法） */
export const SLOT_UNAVAILABLE_MESSAGE = '此視窗大小空間不足，請放大視窗'

const messageCache = new WeakMap<Layout, Map<string, string>>()

/**
 * 放不下 id 這個建築時的提示：用同一個高度與縮放倍率，由現在的寬度往上找第一個放得下的視窗寬度（CSS 像素，進位到 10），
 * 提示「請放大視窗寬度到約 N px 以上」；加寬仍放不下就改找高度；兩個都找不到才用備用說法。
 */
export function slotUnavailableMessage(L: Layout, id: string): string {
  let cache = messageCache.get(L)
  if (!cache) messageCache.set(L, (cache = new Map()))
  const hit = cache.get(id)
  if (hit) return hit
  const fits = (backW: number, backH: number): boolean => buildingSlots(computeLayout(backW, backH, L.dpr)).some((q) => q.id === id)
  const cssW = L.backW / L.dpr
  const cssH = L.backH / L.dpr
  let msg = SLOT_UNAVAILABLE_MESSAGE
  const round10 = (v: number): number => Math.ceil(v / 10) * 10
  let found = false
  for (let w = Math.ceil(cssW) + 2; w <= cssW + 800 && !found; w += 4)
    if (fits(Math.round(w * L.dpr), L.backH)) {
      msg = `此視窗大小空間不足，請放大視窗寬度到約 ${round10(w)}px 以上`
      found = true
    }
  for (let h = Math.ceil(cssH) + 2; h <= cssH + 500 && !found; h += 4)
    if (fits(L.backW, Math.round(h * L.dpr))) {
      // 畫布上方還有 28 CSS 像素的選單列，所以視窗高度 = 畫布高度 + 28
      msg = `此視窗大小空間不足，請放大視窗高度到約 ${round10(h + 28)}px 以上`
      found = true
    }
  cache.set(id, msg)
  return msg
}

// ---------------------------------------------------------------------------
// v3.7.0：公佈欄、鐘樓的窗戶與鐘面（工具包的入口）
// ---------------------------------------------------------------------------

/** 公佈欄素材（tools 圖集的 board）的尺寸與黑板綠色範圍（相對素材左上角），要和 manifest 一致（測試會比對） */
export const BOARD_W = 64
export const BOARD_H = 50
export const BOARD_GREEN = { x0: 8, y0: 7, x1: 56, y1: 39 }

/**
 * 公佈欄的位置：水池上方的遠景區（草地上緣之上、蘑菇左邊那段空地）的右半邊：
 * 右緣對齊水池素材右緣（x = POND_LEFT + POND_W = 112），腳底在草地上緣（farBottom），所以在水池（頂端 farBottom + 2）的上面、不重疊；
 * 左邊 x 0～48 那段較小的空位留給之後的農場告示牌。位置只由水池與草地上緣決定（和視窗寬度、建築購買都無關）。
 * x = 水平中心（素材錨點）、y = 腳底。
 */
export function boardPos(L: Layout): { x: number; y: number } {
  return { x: POND_LEFT + POND_W - BOARD_W / 2, y: L.farBottom }
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

export interface BuildingAvailability {
  id: string
  name: string
  /** 這個視窗大小放得下嗎；放不下的建築先隱藏，購買時顯示 message（建築種類不會被刪掉，視窗放大後就會出現） */
  available: boolean
  slotId: string | null
  message: string | null
}

/**
 * 依目前視窗大小，哪些建築有空位可放（每種建築有自己的專用標記空位）。
 * available 為 false 的建築（這個視窗放不下）：建築模式不顯示它的空位、只顯示 message；已購買的建築紀錄保留、畫面上隱藏，放大視窗後自動恢復。
 */
export function buildingAvailability(L: Layout): BuildingAvailability[] {
  const slots = buildingSlots(L)
  return SLOT_SPECS.map((sp) => {
    const slot = slots.find((q) => q.id === sp.id)
    return slot
      ? { id: sp.id, name: sp.name, available: true, slotId: slot.id, message: null }
      : {
          id: sp.id,
          name: sp.name,
          available: false,
          slotId: null,
          // 要掃描視窗大小才算得出來，所以讀取時才算（算過會快取）
          get message(): string {
            return slotUnavailableMessage(L, sp.id)
          },
        }
  })
}
