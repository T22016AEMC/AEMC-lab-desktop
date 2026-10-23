/**
 * 像素素材處理管線：把 AI 生成的像素風原圖（洋紅底、格線、解析度偏糊）處理成遊戲用素材。
 *
 * 用法：  node scripts/process-assets.mjs [原圖資料夾]
 *   原圖資料夾預設是 repo 的上一層「像素風圖片」，也可以用環境變數 ASSET_SRC 指定。
 * 輸出：  public/assets/<組名>.<內容雜湊>.png（圖集）、public/assets/manifest.<內容雜湊>.json（每張的位置、尺寸、錨點、動畫幀順序）、
 *         src/farm/pixel/assetIndex.ts（目前 manifest 的檔名，程式靠它找到素材）。
 *         檔名一律帶內容雜湊：素材內容變了檔名就變，瀏覽器快取與 service worker 都不會把新程式配到舊圖集
 *         （vite-plugin-pwa 會把 assets/ 底下的檔案當成「檔名已帶雜湊」而不檢查內容有沒有變，所以這一點是必要的）。
 *         screenshots/assets-overview-dark.png / assets-overview-light.png（總覽）、screenshots/assets-report.txt（處理報告）
 *
 * 處理步驟（每張原圖）：
 *  1. 去背：洋紅（含漸層與較淺的格底、偏暗的邊緣）一律視為背景；細白框與格線（很薄或填充率極低的連通塊）移除。
 *  2. 切格：把前景連通塊依「欄×列」配置分組，每格裁到內容外框；錨點 = 水平中心、腳底（外框底邊）。
 *  3. 還原真像素：以傅立葉法估算原圖的「像素格大小」p 與相位，依格線重新取樣成 1 格 = 1 像素；
 *     alpha 只有 0 或 255。所有素材都是 1:1 的真像素，所以遊戲中一個像素的視覺大小一致。
 *  4. 縫合：遠景、小路左右鏡像拼接成可水平重複；草地方塊以 2×2 鏡像拼成可上下左右無縫。
 *  5. 打包成圖集並產生 manifest 與總覽圖、處理報告。
 */
import sharp from 'sharp'
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SRC = resolve(process.argv[2] ?? process.env.ASSET_SRC ?? join(ROOT, '..', '像素風圖片'))
const OUT = join(ROOT, 'public', 'assets')
const SHOTS = join(ROOT, 'screenshots')
mkdirSync(OUT, { recursive: true })
mkdirSync(SHOTS, { recursive: true })

const report = []
const warn = (msg) => {
  report.push('⚠ ' + msg)
  console.log('⚠ ' + msg)
}
const info = (msg) => {
  report.push(msg)
  console.log(msg)
}

// ---------------------------------------------------------------------------
// 影像基本功
// ---------------------------------------------------------------------------

/** 洋紅背景（含漸層、較淺的格底、偏暗的邊緣）。兩側的 R、B 接近，G 明顯偏低 */
const isBg = (r, g, b) => {
  const m = Math.min(r, b)
  if (m >= 80 && g <= m - 45 && Math.abs(r - b) < 45) return true
  // 偏玫瑰紅的洋紅陰影／邊緣（例如貓 extra 腳下的暗粉紅影子）：G 極低、B 明顯高於 G
  return r >= 120 && g < r * 0.4 && b > g + 55 && b > 60 && b < r - 25 && r - b < 120 && b > r * 0.35 && g < 60
}

async function load(file) {
  const path = join(SRC, file)
  if (!existsSync(path)) throw new Error('找不到原圖：' + path)
  const { data, info: i } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, W: i.width, H: i.height, file }
}

function fgMask(img) {
  const { data, W, H } = img
  const m = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) m[i] = isBg(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) ? 0 : 1
  return m
}

/** 連通塊標記（4 鄰接）。回傳 { label, comps[{id,x0,y0,x1,y1,area}] } */
function label(mask, W, H) {
  const lab = new Int32Array(W * H)
  const comps = []
  const stack = new Int32Array(W * H)
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s]) continue
    const id = comps.length + 1
    let sp = 0
    stack[sp++] = s
    lab[s] = id
    let x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0
    while (sp) {
      const p = stack[--sp]
      const x = p % W, y = (p / W) | 0
      area++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1 }
      if (x < W - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1 }
      if (y > 0 && mask[p - W] && !lab[p - W]) { lab[p - W] = id; stack[sp++] = p - W }
      if (y < H - 1 && mask[p + W] && !lab[p + W]) { lab[p + W] = id; stack[sp++] = p + W }
    }
    comps.push({ id, x0, y0, x1, y1, area })
  }
  return { lab, comps }
}

/** 去掉細白框、格線與雜點：很薄、或填充率極低的大連通塊、面積太小的碎屑 */
function keepComps(comps, minArea) {
  return comps.filter((c) => {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1
    if (c.area < minArea) return false
    if (Math.min(bw, bh) <= 6 && Math.max(bw, bh) >= 40) return false // 格線
    if (Math.max(bw, bh) > 150 && c.area / (bw * bh) < 0.04) return false // 細框
    return true
  })
}

// ---------------------------------------------------------------------------
// 像素格大小與相位（傅立葉）
// ---------------------------------------------------------------------------

function gradProfile(img, mask, axis, box) {
  const { data, W } = img
  const n = axis === 0 ? img.W : img.H
  const g = new Float64Array(n)
  const [bx0, by0, bx1, by1] = box
  for (let y = by0; y < by1; y++)
    for (let x = bx0; x < bx1; x++) {
      const i = y * W + x
      const j = axis === 0 ? i + 1 : i + W
      if (!mask[i] || !mask[j]) continue
      g[axis === 0 ? x : y] +=
        Math.abs(data[i * 3] - data[j * 3]) + Math.abs(data[i * 3 + 1] - data[j * 3 + 1]) + Math.abs(data[i * 3 + 2] - data[j * 3 + 2])
    }
  return g
}

function spectrum(g, pMin, pMax) {
  let total = 0
  for (const v of g) total += v
  const out = []
  for (let p = pMin; p <= pMax; p += 0.02) {
    let re = 0, im = 0
    for (let k = 0; k < g.length; k++) {
      if (!g[k]) continue
      const a = (2 * Math.PI * k) / p
      re += g[k] * Math.cos(a)
      im += g[k] * Math.sin(a)
    }
    out.push({ p, amp: total ? Math.hypot(re, im) / total : 0 })
  }
  return out
}

/** 估算整張圖的像素格大小 p（x、y 方向的頻譜相加，取最強的峰；偏好較小的 p 以免選到倍數） */
function estimateP(img, mask, range = [4, 12]) {
  const box = [0, 0, img.W - 1, img.H - 1]
  const sx = spectrum(gradProfile(img, mask, 0, box), range[0], range[1])
  const sy = spectrum(gradProfile(img, mask, 1, box), range[0], range[1])
  const sum = sx.map((r, i) => ({ p: r.p, amp: r.amp + sy[i].amp }))
  const best = Math.max(...sum.map((s) => s.amp))
  const peak = sum.find((s, i) => s.amp >= best * 0.85 && s.amp >= (sum[i - 1]?.amp ?? 0) && s.amp >= (sum[i + 1]?.amp ?? 0))
  return { p: peak.p, amp: best }
}

/** 在給定 p 下，估算某個外框內的格線相位（回傳第一條格線的位置，0 <= phase < p） */
function estimatePhase(img, mask, box, p, axis) {
  const g = gradProfile(img, mask, axis, box)
  let re = 0, im = 0
  for (let k = 0; k < g.length; k++) {
    if (!g[k]) continue
    const a = (2 * Math.PI * k) / p
    re += g[k] * Math.cos(a)
    im += g[k] * Math.sin(a)
  }
  // 差分 g[k] 在「格線之後」最大：格線位置 = k + 1
  let x0 = (Math.atan2(im, re) / (2 * Math.PI)) * p + 1
  x0 = ((x0 % p) + p) % p
  return x0
}

// ---------------------------------------------------------------------------
// 切格
// ---------------------------------------------------------------------------

/** 把一維的區間合併到只剩 n 組（每次合併間隙最小的相鄰兩組） */
function mergeTo(intervals, n) {
  const a = intervals.map((v) => ({ ...v })).sort((p, q) => p.lo - q.lo)
  // 先合併重疊的
  const merged = []
  for (const v of a) {
    const last = merged[merged.length - 1]
    if (last && v.lo <= last.hi + 1) {
      last.hi = Math.max(last.hi, v.hi)
      last.items.push(...v.items)
    } else merged.push({ lo: v.lo, hi: v.hi, items: [...v.items] })
  }
  while (merged.length > n) {
    let bi = 0, bg = Infinity
    for (let i = 0; i < merged.length - 1; i++) {
      const gap = merged[i + 1].lo - merged[i].hi
      if (gap < bg) { bg = gap; bi = i }
    }
    merged[bi].hi = merged[bi + 1].hi
    merged[bi].items.push(...merged[bi + 1].items)
    merged.splice(bi + 1, 1)
  }
  return merged
}

/**
 * 依欄×列把前景連通塊分到各格，回傳 cells[row*cols+col] = 連通塊陣列。
 * 大的連通塊（面積 >= 最大者的 25%）用「中心點」分群決定欄、列（相鄰格子的外框可能互相重疊，用外框會合併錯）；
 * 小的碎塊（飛盤、泥土、閃光…）再歸到距離最近的那一群。
 */
function groupCells(comps, cols, rows) {
  const maxArea = Math.max(...comps.map((c) => c.area))
  const big = comps.filter((c) => c.area >= maxArea * 0.25)
  const small = comps.filter((c) => c.area < maxArea * 0.25)
  const cy = (c) => (c.y0 + c.y1) / 2
  const cx = (c) => (c.x0 + c.x1) / 2
  // 全域的欄中心、列中心（用所有大塊一起分群，某一列缺格時也不會錯位）
  const mean = (g) => g.items.reduce((t, c) => t + g.key(c), 0) / g.items.length
  const centers = (key, n) => mergeTo(big.map((c) => ({ lo: key(c), hi: key(c), items: [c] })), n).map((g) => g.items.reduce((t, c) => t + key(c), 0) / g.items.length).sort((p, q) => p - q)
  void mean
  const colC = centers(cx, cols), rowC = centers(cy, rows)
  const nearest = (arr, v) => arr.reduce((bi, c, i) => (Math.abs(c - v) < Math.abs(arr[bi] - v) ? i : bi), 0)
  const cells = Array.from({ length: rows * cols }, () => [])
  for (const c of big) cells[nearest(rowC, cy(c)) * cols + nearest(colC, cx(c))].push(c)
  // 小碎塊：歸到外框最近的那一格
  const bboxOf = (items) => ({
    x0: Math.min(...items.map((c) => c.x0)), y0: Math.min(...items.map((c) => c.y0)),
    x1: Math.max(...items.map((c) => c.x1)), y1: Math.max(...items.map((c) => c.y1)),
  })
  const dist = (c, bb) => {
    const dx = Math.max(bb.x0 - cx(c), 0, cx(c) - bb.x1), dy = Math.max(bb.y0 - cy(c), 0, cy(c) - bb.y1)
    return Math.hypot(dx, dy)
  }
  for (const c of small) {
    const own = nearest(rowC, cy(c)) * cols + nearest(colC, cx(c))
    if (!cells[own].length) { cells[own].push(c); continue }
    let best = -1, bd = Infinity
    cells.forEach((items, i) => {
      if (!items.length) return
      const d = dist(c, bboxOf(items))
      if (d < bd) { bd = d; best = i }
    })
    if (best >= 0 && bd < 120) cells[best].push(c)
  }
  return cells
}

// ---------------------------------------------------------------------------
// 還原真像素
// ---------------------------------------------------------------------------

/**
 * 把原圖的 box（含連通塊 id 篩選）依格線取樣成 1 格 = 1 像素。
 * keep：Set，只保留這些連通塊 id 的像素（null = 用整張 fg 遮罩）
 */
function depixelate(img, mask, lab, keep, box, p, phases) {
  const { data, W } = img
  const [bx0, by0, bx1, by1] = box
  const [px, py] = phases
  const kx0 = Math.floor((bx0 - px) / p), kx1 = Math.floor((bx1 - px) / p)
  const ky0 = Math.floor((by0 - py) / p), ky1 = Math.floor((by1 - py) / p)
  const w = kx1 - kx0 + 1, h = ky1 - ky0 + 1
  const rgba = Buffer.alloc(w * h * 4)
  for (let ky = ky0; ky <= ky1; ky++)
    for (let kx = kx0; kx <= kx1; kx++) {
      const sx0 = Math.max(0, Math.round(px + kx * p)), sx1 = Math.min(W - 1, Math.round(px + (kx + 1) * p) - 1)
      const sy0 = Math.max(0, Math.round(py + ky * p)), sy1 = Math.min(img.H - 1, Math.round(py + (ky + 1) * p) - 1)
      let fg = 0, tot = 0, r = 0, g = 0, b = 0, cn = 0
      // 色彩只取區塊中央（避開被相鄰區塊混色的邊緣）
      const mx0 = sx0 + (sx1 - sx0) * 0.25, mx1 = sx1 - (sx1 - sx0) * 0.25
      const my0 = sy0 + (sy1 - sy0) * 0.25, my1 = sy1 - (sy1 - sy0) * 0.25
      for (let y = sy0; y <= sy1; y++)
        for (let x = sx0; x <= sx1; x++) {
          const i = y * W + x
          tot++
          if (!mask[i] || (keep && !keep.has(lab[i]))) continue
          fg++
          if (x >= mx0 && x <= mx1 && y >= my0 && y <= my1) {
            r += data[i * 3]; g += data[i * 3 + 1]; b += data[i * 3 + 2]; cn++
          }
        }
      const o = ((ky - ky0) * w + (kx - kx0)) * 4
      if (tot && fg / tot >= 0.5) {
        if (!cn) {
          // 中央沒有前景像素：改用整個區塊的前景像素
          for (let y = sy0; y <= sy1; y++)
            for (let x = sx0; x <= sx1; x++) {
              const i = y * W + x
              if (!mask[i] || (keep && !keep.has(lab[i]))) continue
              r += data[i * 3]; g += data[i * 3 + 1]; b += data[i * 3 + 2]; cn++
            }
        }
        rgba[o] = Math.round(r / cn); rgba[o + 1] = Math.round(g / cn); rgba[o + 2] = Math.round(b / cn); rgba[o + 3] = 255
      }
    }
  return { w, h, rgba }
}

/** 裁到不透明內容的外框，並清掉殘留的洋紅色像素、孤立的單點 */
function cleanSprite(s) {
  const { w, h, rgba } = s
  // 殘留的洋紅色（邊緣混色）→ 透明
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] && isBg(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])) rgba[i * 4 + 3] = 0
  }
  // 孤立單點（上下左右都沒有鄰居）→ 移除
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rgba[(y * w + x) * 4 + 3] === 255
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (solid(x, y) && !solid(x - 1, y) && !solid(x + 1, y) && !solid(x, y - 1) && !solid(x, y + 1)) rgba[(y * w + x) * 4 + 3] = 0
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  if (x1 < 0) return null
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1
  const out = Buffer.alloc(nw * nh * 4)
  for (let y = 0; y < nh; y++) rgba.copy(out, y * nw * 4, ((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + nw) * 4)
  return { w: nw, h: nh, rgba: out }
}

/** 偵測鐘樓的空白鐘面：最大的奶油色連通塊（不碰到素材邊緣）的中心與半徑，供程式畫時針分針 */
function detectClockFace(s) {
  const { w, h, rgba } = s
  const cream = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]
    cream[i] = rgba[i * 4 + 3] && r > 232 && g > 220 && b > 185 ? 1 : 0
  }
  const { comps } = label(cream, w, h)
  const face = comps.filter((c) => c.x0 > 2 && c.y0 > 2 && c.x1 < w - 3).sort((a, b) => b.area - a.area)[0]
  if (!face) return null
  return { cx: (face.x0 + face.x1 + 1) / 2, cy: (face.y0 + face.y1 + 1) / 2, r: Math.min(face.x1 - face.x0 + 1, face.y1 - face.y0 + 1) / 2 }
}

/**
 * 偵測水池的水面橢圓（相對於素材左上角）：藍色像素（水）的外框，取中心與半徑。
 * 睡蓮、荷葉在水面裡面，不影響外框；石頭與蘆葦不是藍色。
 */
function detectWater(s) {
  const { w, h, rgba } = s
  let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2]
      if (rgba[i + 3] && b > 180 && b > r + 70 && g > r + 20 && g < b) {
        n++
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  if (!n) return null
  return { cx: Math.round((x0 + x1 + 1) / 2), cy: Math.round((y0 + y1 + 1) / 2), rx: Math.round((x1 - x0 + 1) / 2), ry: Math.round((y1 - y0 + 1) / 2) }
}

// ---------------------------------------------------------------------------
// 圖集
// ---------------------------------------------------------------------------

const atlases = {} // name → { frames: [{key,w,h,rgba,ax,ay}] }
const manifest = { version: 1, pixelSize: 1, atlases: {}, frames: {}, animations: {}, notes: {} }

function addFrame(group, key, spr, extra = {}) {
  atlases[group] ??= []
  const frame = { key, w: spr.w, h: spr.h, rgba: spr.rgba, ax: extra.ax ?? Math.round(spr.w / 2), ay: extra.ay ?? spr.h, ...extra }
  atlases[group].push(frame)
  return frame
}

function flipX(s) {
  const out = Buffer.alloc(s.rgba.length)
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) s.rgba.copy(out, (y * s.w + x) * 4, (y * s.w + (s.w - 1 - x)) * 4, (y * s.w + (s.w - x)) * 4)
  return { w: s.w, h: s.h, rgba: out }
}
function flipY(s) {
  const out = Buffer.alloc(s.rgba.length)
  for (let y = 0; y < s.h; y++) s.rgba.copy(out, y * s.w * 4, (s.h - 1 - y) * s.w * 4, (s.h - y) * s.w * 4)
  return { w: s.w, h: s.h, rgba: out }
}
function hcat(a, b) {
  const h = Math.max(a.h, b.h)
  const w = a.w + b.w
  const out = Buffer.alloc(w * h * 4)
  for (let y = 0; y < a.h; y++) a.rgba.copy(out, (y + h - a.h) * w * 4, y * a.w * 4, (y + 1) * a.w * 4)
  for (let y = 0; y < b.h; y++) b.rgba.copy(out, ((y + h - b.h) * w + a.w) * 4, y * b.w * 4, (y + 1) * b.w * 4)
  return { w, h, rgba: out }
}
function vcat(a, b) {
  return { w: a.w, h: a.h + b.h, rgba: Buffer.concat([a.rgba, b.rgba]) }
}

// ---------------------------------------------------------------------------
// 工作定義
// ---------------------------------------------------------------------------

const DOGS = { shiba: '柴犬.png', corgi: '柯基.png', husky: '哈士奇.png', golden: '黃金獵犬.png', collie: '邊境牧羊犬.png', poodle: '貴賓犬.png' }
const CATS = ['orange', 'black', 'calico', 'siamese', 'bluecat', 'ragdoll']
const DOG_CORE = ['stand', 'walk_a', 'walk_b', 'sit_a', 'sit_b', 'sleep', 'eat', 'happy']
const DOG_EXTRA = ['jump', 'dig_a', 'dig_b', 'tug', 'belly_up', 'bark']
const CAT_CORE = ['stand', 'walk_a', 'walk_b', 'sit_a', 'unused_back', 'sleep', 'eat', 'groom']
const CAT_EXTRA = ['crouch', 'pounce', 'swat', 'tangled']

/**
 * 站姿目標高度（邏輯像素，±2）。依真實大小排序：
 * 黃金獵犬 > 哈士奇 > 邊牧 > 柴犬 > 貴賓 > 柯基；布偶貓 > 英短藍貓 > 暹羅 > 橘虎斑 > 三花 = 黑貓。
 * 每隻動物用自己的像素格大小 p（反推出來），它所有姿勢（core、extra）共用同一個 p。
 */
const STAND_HEIGHT = {
  dog_golden: 46, dog_husky: 43, dog_collie: 41, dog_shiba: 36, dog_poodle: 34, dog_corgi: 31,
  cat_ragdoll: 33, cat_bluecat: 32, cat_siamese: 31, cat_orange: 30, cat_calico: 29, cat_black: 29,
}
/** 反推 p 時的起點（原圖大約的像素格） */
const P_GUESS = 6.1
/** 貓 extra 原圖是縮小後再放大的：像素格 = 同一隻貓 core 的 p × 這個倍率（沿用先前與 core 的相對取樣關係） */
const CAT_EXTRA_RATIO = 0.56

const pCache = {}
let clockClosedSpr = null
/** 水池的目標寬度（邏輯像素） */
const POND_W = 110

/**
 * 處理一張格狀原圖。
 *  - pFixed：直接指定取樣格大小 p（沒指定就用頻譜估算值）
 *  - targets：{ 幀名稱: 目標高度（邏輯像素） }，用來「依目標高度反推 p」
 *  - solveFrom：以這一幀的目標高度求出 p，整張圖的所有幀共用（同一隻動物的所有姿勢大小不會跳）
 *    沒有 solveFrom 時，targets 裡的每一幀各自求自己的 p（例如裝飾物、特效圖示）
 *  - pScale：整張圖的 p 再乘上的倍率（貓 extra 原圖是縮小後再放大的，相對 core 取 0.56）
 */
async function sheet({ file, cols, rows, names, minArea = 300, pRange, pFixed, targets = {}, solveFrom, pScale = 1, solveDim = 'h' }) {
  const img = await load(file)
  const mask = fgMask(img)
  const { lab, comps: all } = label(mask, img.W, img.H)
  const comps = keepComps(all, minArea)
  const cells = groupCells(comps, cols, rows)
  const e = estimateP(img, mask, pRange)
  const base = (pFixed ?? e.p) * pScale
  pCache[file] = { p: base, amp: e.amp }

  const render = (cell, pp) => {
    const box = [Math.min(...cell.map((c) => c.x0)), Math.min(...cell.map((c) => c.y0)), Math.max(...cell.map((c) => c.x1)), Math.max(...cell.map((c) => c.y1))]
    const keep = new Set(cell.map((c) => c.id))
    // 相位：每格各自估算（避開 AI 圖的整體漂移）
    const clip = [Math.max(0, box[0] - 4), Math.max(0, box[1] - 4), Math.min(img.W - 2, box[2] + 4), Math.min(img.H - 2, box[3] + 4)]
    const phases = [estimatePhase(img, mask, clip, pp, 0), estimatePhase(img, mask, clip, pp, 1)]
    return cleanSprite(depixelate(img, mask, lab, keep, clip, pp, phases))
  }
  /** 反推 p，讓這一格輸出的高度等於 target（高度是整數，會在 ±1 內收斂） */
  const solve = (cell, target, p0) => {
    let pp = p0
    let best = { pp, err: Infinity }
    for (let k = 0; k < 8; k++) {
      const spr = render(cell, pp)
      if (!spr) break
      const got = solveDim === 'w' ? spr.w : spr.h
      const err = Math.abs(got - target)
      if (err < best.err) best = { pp, err }
      if (err === 0) break
      pp *= got / target
    }
    return best.pp
  }

  let animalP = base
  if (solveFrom) {
    const cell = cells[names.indexOf(solveFrom)]
    if (!cell?.length) throw new Error(file + ' 找不到 ' + solveFrom)
    animalP = solve(cell, targets[solveFrom], base)
  }
  info(
    file + ': ' + img.W + '×' + img.H + '，連通塊 ' + comps.length + '（原 ' + all.length + '），像素格估算 p=' + e.p.toFixed(2) + '（強度 ' + e.amp.toFixed(2) + '）' +
      (solveFrom || Object.keys(targets).length ? '，依目標高度求出 p=' + (solveFrom ? animalP.toFixed(2) : '各幀不同') : pFixed ? '，採用 p=' + base.toFixed(2) : ''),
  )
  const frames = []
  for (let i = 0; i < rows * cols; i++) {
    const name = names[i]
    if (!name) continue
    const cell = cells[i]
    // names[i] 是陣列：這一格裡有好幾個獨立的小東西（水滴、泡泡），依面積取最大的 N 個、由左到右命名
    if (Array.isArray(name)) {
      const parts = [...cell].sort((a, b) => b.area - a.area).slice(0, name.length).sort((a, b) => a.x0 - b.x0)
      if (parts.length < name.length) warn(file + ' 第 ' + (i + 1) + ' 格只找到 ' + parts.length + ' 個，需要 ' + name.length + ' 個')
      parts.forEach((part, k) => {
        const spr = render([part], animalP)
        if (spr) frames.push({ name: name[k], spr, p: animalP })
      })
      continue
    }
    if (!cell.length) {
      warn(file + ' 第 ' + (i + 1) + ' 格（' + name + '）找不到內容')
      continue
    }
    const pp = solveFrom || !targets[name] ? animalP : solve(cell, targets[name], base)
    const spr = render(cell, pp)
    if (!spr) {
      warn(file + ' ' + name + '：處理後是空的')
      continue
    }
    frames.push({ name, spr, p: pp })
  }
  return { frames, p: animalP }
}

/** v3.0.0 第一版（統一 p=6.1）的尺寸，用來在處理報告裡列出「前後尺寸對照表」（寬×高，邏輯像素） */
const BASELINE = {"dog_golden_stand":[51,47],"dog_husky_stand":[51,50],"dog_collie_stand":[49,46],"dog_shiba_stand":[52,51],"dog_poodle_stand":[45,47],"dog_corgi_stand":[48,42],"cat_ragdoll_stand":[58,49],"cat_bluecat_stand":[56,47],"cat_siamese_stand":[55,49],"cat_orange_stand":[56,46],"cat_calico_stand":[56,48],"cat_black_stand":[54,48],"house_closed":[121,117],"tree":[82,103],"lamp":[51,84],"clocktower":[89,115],"mushroom":[58,56],"stump":[78,51],"bush":[70,61],"tall_grass":[71,60],"rocks":[77,50],"flowers":[70,49],"fx_heart":[14,13],"fx_zzz":[18,17],"fx_note":[14,14],"fx_sweat":[10,15],"fx_exclaim":[8,18],"fx_sparkle":[15,17],"fx_bubble":[18,18],"fx_question":[12,17],"snowflake":[20,17]}
/** 檢視總覽圖後記下的素材瑕疵與取捨（會附在處理報告最後） */
const KNOWN_ISSUES = [
  "每隻動物依「站姿目標高度」反推自己的像素格 p（柴犬 8.64、柯基 8.26、哈士奇 7.09、黃金獵犬 6.23、邊牧 6.84、貴賓 8.43；貓 8.96～10.10）。同一隻動物的 core 與 extra 共用同一個 p（貓 extra 為 core 的 ×0.56）。原圖本身的頻譜估算值在 5.3～7.8，貓的原圖是放大平滑過的（強度 0.06～0.09，估算不可靠），所以貓、狗的 p 都是由目標高度決定，而不是估算值。",
  "貓縮得比較多（p 約 9～10，原圖一個「像素格」約 5.3）：取樣格比原圖的像素格粗，邊緣的階梯會略不規則、細節（花紋、鬍鬚）損失較多。柯基身體長，寬度（35）比高度（31）大。",
  "貓 extra（crouch／pounce／swat／tangled）原圖是縮小後再放大的，解析度低、細節偏糊；沿用先前與 core 的相對取樣關係（p × 0.56），所以這四個姿勢比站姿高（例如 swat 41、crouch 40），是姿勢本身比較「長」，不是比例錯誤。",
  "貓的 sit_b 是背面，已切出但標記 unused_back，不使用；小建築.png 的珊瑚礁（coral_unused）不使用；toys_cat.png 另外 6 個海洋道具（海灘球、泡泡、貝殼、蝦、海草、閃光）不使用；雨滴素材（raindrop）保留但不使用（雨改由程式畫細線）。",
  "草地方塊以 2×2 鏡像拼成無縫，肉眼可看出左右上下對稱的花紋；原圖草地底邊較粗糙，已裁掉最外圈與底邊約 20 像素。草地原圖像素格估算 9.4（雜訊大）。",
  "小路原圖含上下的草緣，處理時只保留泥土與石頭（以顏色判斷），草緣交給草地方塊，所以路的邊緣是不規則的泥土輪廓而不是原圖的草緣；遠景與小路左右鏡像拼接成可水平重複。",
  "特效圖示（愛心、ZZZ、音符、汗滴、驚嘆號、閃光、泡泡、問號）統一取樣到高度 15；它們的原圖像素格是 9.2，取樣格縮小後細節是由較大的色塊重新取樣而來，略有變形。雪花縮到 8×9。",
  "玩具（toys_dog 4.3）像素格較細，玩具相對於狗偏大；本版畫面上不使用，下一版放進場景時可能要調整（可用同樣的「目標高度」方式）。",
  "住家放大到 139×134（p=4.94，比原圖估算 5.66 細）、鐘樓放大到 123×160（p≈3.6，比原圖估算 4.38 細），都是「取樣格比原圖細」：細節由原圖像素內插而來，會比較柔，但大小與像素密度如要求。裝飾物縮小：p 各幀不同（蘑菇 37×37、樹樁 53×36、灌木 47×40、高草叢 44×38、石頭堆 52×34、小花叢 39×28）。",
  "鐘樓原圖的鐘面是空白圓形，管線偵測它的中心與半徑寫進 manifest；遊戲裡的鐘面（金框、刻度、指針）完全由程式畫，蓋過原圖鐘面。",
]

// ---------------------------------------------------------------------------
// 執行
// ---------------------------------------------------------------------------

async function main() {
  info(`來源：${SRC}`)

  // 1) 狗：core（4×2）+ extra（3×2）。每隻狗依站姿目標高度求自己的 p，core 與 extra 共用
  const animalP = {}
  for (const [id, file] of Object.entries(DOGS)) {
    const key = 'dog_' + id
    const core = await sheet({ file, cols: 4, rows: 2, names: DOG_CORE, pFixed: P_GUESS, targets: { stand: STAND_HEIGHT[key] }, solveFrom: 'stand' })
    animalP[key] = core.p
    for (const f of core.frames) addFrame(key, key + '_' + f.name, f.spr)
    const extra = await sheet({ file: 'dog_' + id + '_extra.png', cols: 3, rows: 2, names: DOG_EXTRA, pFixed: core.p })
    for (const f of extra.frames) addFrame(key, key + '_' + f.name, f.spr)
  }

  // 2) 貓
  for (const id of CATS) {
    const key = 'cat_' + id
    const core = await sheet({ file: key + '_core.png', cols: 4, rows: 2, names: CAT_CORE, pFixed: P_GUESS, targets: { stand: STAND_HEIGHT[key] }, solveFrom: 'stand' })
    animalP[key] = core.p
    for (const f of core.frames) addFrame(key, key + '_' + f.name, f.spr, f.name === 'unused_back' ? { unused: true } : {})
    const extra = await sheet({ file: key + '_extra.png', cols: 2, rows: 2, names: CAT_EXTRA, pFixed: core.p * CAT_EXTRA_RATIO })
    for (const f of extra.frames) addFrame(key, key + '_' + f.name, f.spr)
  }
  info('每隻動物的像素格 p（core 與 extra 共用；貓 extra 為 ×' + CAT_EXTRA_RATIO + '）：' + Object.entries(animalP).map(([k, v]) => k + '=' + v.toFixed(2)).join('、'))

  // 3) 領養預覽正面圖
  {
    const names = [...Object.keys(DOGS).map((d) => 'front_dog_' + d), ...CATS.map((c) => 'front_cat_' + c)]
    const { frames } = await sheet({ file: '大家的正面照.png', cols: 6, rows: 2, names })
    for (const f of frames) addFrame('ui', f.name, f.spr)
  }

  // 4) 場景物件
  {
    const house = await sheet({ file: '住家.png', cols: 3, rows: 1, names: ['house_closed', 'house_open', 'house_night'], targets: { house_closed: 134 }, solveFrom: 'house_closed' })
    // 三張要用同一個錨點：貼到相同大小的畫布，底邊與水平中心對齊
    const W = Math.max(...house.frames.map((f) => f.spr.w)), H = Math.max(...house.frames.map((f) => f.spr.h))
    for (const f of house.frames) {
      const out = Buffer.alloc(W * H * 4)
      const ox = Math.round((W - f.spr.w) / 2), oy = H - f.spr.h
      for (let y = 0; y < f.spr.h; y++) f.spr.rgba.copy(out, ((y + oy) * W + ox) * 4, y * f.spr.w * 4, (y + 1) * f.spr.w * 4)
      addFrame('scene', f.name, { w: W, h: H, rgba: out })
    }
    for (const [file, name] of [['scene_clocktower.png', 'clocktower'], ['scene_tree.png', 'tree']]) {
      const r = await sheet({ file, cols: 1, rows: 1, names: [name], targets: name === 'clocktower' ? { clocktower: 160 } : {} })
      for (const f of r.frames) {
        if (f.name === 'clocktower') clockClosedSpr = f.spr
        addFrame('scene', f.name, f.spr, f.name === 'clocktower' ? { meta: { clock: detectClockFace(f.spr) } } : {})
      }
    }
    // 水池：原圖有兩幀（只有水面亮紋不同），但切換時輪廓差 1px 會抖，所以只取第一幀、不輸出第二幀（水面靜止）。
    // 用寬度 110 反推 p；水面橢圓由這一幀偵測
    {
      const pond = await sheet({ file: 'scene_pond.png', cols: 2, rows: 1, names: ['pond', null], targets: { pond: POND_W }, solveFrom: 'pond', solveDim: 'w' })
      const f = pond.frames[0]
      const water = detectWater(f.spr)
      addFrame('scene', 'pond', f.spr, { meta: { water } })
      info('水池（只用第一幀）' + f.spr.w + '×' + f.spr.h + '，水面橢圓 cx=' + water.cx + ' cy=' + water.cy + ' rx=' + water.rx + ' ry=' + water.ry + '（p=' + pond.p.toFixed(2) + '）')
    }
    {
      // 開門鐘樓：和關門版用同一個高度 160，貼到 123×160 的畫布（底部中心對齊），並比對兩張的輪廓差異
      const closed = clockClosedSpr
      const r = await sheet({ file: 'scene_clocktower_open.png', cols: 1, rows: 1, names: ['clocktower_open'], targets: { clocktower_open: 160 }, solveFrom: 'clocktower_open' })
      const f = r.frames[0]
      const W = closed.w, H = closed.h
      const out = Buffer.alloc(W * H * 4)
      const ox = Math.round((W - f.spr.w) / 2), oy = H - f.spr.h
      for (let y = 0; y < f.spr.h; y++)
        for (let x = 0; x < f.spr.w; x++) {
          const tx = x + ox, ty = y + oy
          if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue
          f.spr.rgba.copy(out, (ty * W + tx) * 4, (y * f.spr.w + x) * 4, (y * f.spr.w + x + 1) * 4)
        }
      const spr = { w: W, h: H, rgba: out }
      addFrame('scene', 'clocktower_open', spr, { meta: { clock: detectClockFace(spr) } })
      let a = 0, b = 0, both = 0
      for (let i = 0; i < W * H; i++) {
        const ca = closed.rgba[i * 4 + 3] > 0, cb = out[i * 4 + 3] > 0
        if (ca) a++
        if (cb) b++
        if (ca !== cb) both++
      }
      info('開門鐘樓：處理後 ' + f.spr.w + '×' + f.spr.h + '，貼到 ' + W + '×' + H + '（偏移 ' + ox + ',' + oy + '）；關門版不透明像素 ' + a + '，開門版 ' + b + '，輪廓差異（XOR）' + both + ' 像素 = ' + ((both / a) * 100).toFixed(1) + '%')
    }
    const small = await sheet({ file: '小建築.png', cols: 3, rows: 2, names: ['doghouse', 'cat_tree', 'bowls', 'flowerbed', 'lamp', 'coral_unused'] })
    for (const f of small.frames) addFrame('scene', f.name, f.spr, f.name === 'coral_unused' ? { unused: true } : {})
    const bn = await sheet({ file: 'buildings_new.png', cols: 4, rows: 2, names: ['bathtub', 'seesaw', 'sandbox', 'campfire_a', 'campfire_b', 'picnic', 'butterfly_open', 'butterfly_closed'] })
    for (const f of bn.frames) addFrame('scene', f.name, f.spr)
    // 裝飾物各縮小到目標高度：蘑菇 36、樹樁 36、灌木 40、高草叢 38、石頭堆 34、小花叢 28
    const dc = await sheet({ file: 'decor.png', cols: 3, rows: 2, names: ['bush', 'rocks', 'flowers', 'tall_grass', 'mushroom', 'stump'], targets: { bush: 40, rocks: 34, flowers: 28, tall_grass: 38, mushroom: 36, stump: 36 } })
    for (const f of dc.frames) addFrame('scene', f.name, f.spr)
  }

  // 5) 天空物件、特效、玩具
  {
    const sky = await sheet({ file: 'scene_sky_objects.png', cols: 4, rows: 2, names: ['sun', 'moon', 'star', 'cloud_a', 'cloud_b', 'cloud_c', 'raindrop', 'snowflake'], targets: { snowflake: 9 } })
    for (const f of sky.frames) addFrame('fx', f.name, f.spr)
    const fx = await sheet({ file: 'fx_icons.png', cols: 4, rows: 2, names: ['heart', 'zzz', 'note', 'sweat', 'exclaim', 'sparkle', 'bubble', 'question'].map((n) => 'fx_' + n), minArea: 150, targets: Object.fromEntries(['heart', 'zzz', 'note', 'sweat', 'exclaim', 'sparkle', 'bubble', 'question'].map((n) => ['fx_' + n, 15])) })
    for (const f of fx.frames) addFrame('fx', f.name, f.spr)
    // 水花、漣漪、水滴、泡泡：所有格共用同一個 p（以最高的水花高 30 反推）
    const wn = ['water_ripple_1', 'water_ripple_2', 'water_ripple_3', 'water_splash_1', 'water_splash_2', 'water_splash_3', ['water_drop_1', 'water_drop_2', 'water_drop_3'], ['water_bubble_s', 'water_bubble_l']]
    const fw = await sheet({ file: 'fx_water.png', cols: 4, rows: 2, names: wn, minArea: 150, targets: { water_splash_2: 30 }, solveFrom: 'water_splash_2' })
    for (const f of fw.frames) {
      const center = !f.name.startsWith('water_splash')
      addFrame('fx', f.name, f.spr, center ? { ay: Math.round(f.spr.h / 2) } : {})
    }
    const td = await sheet({ file: 'toys_dog.png', cols: 4, rows: 2, names: ['ball', 'frisbee', 'rope', 'bone', 'shoe', 'chest_closed', 'chest_open', 'dirt_mound'].map((n) => 'toy_' + n), minArea: 120 })
    for (const f of td.frames) addFrame('toys', f.name, f.spr)
    const tc = await sheet({ file: 'toys_cat.png', cols: 3, rows: 3, names: ['toy_laser_dot', 'toy_wand', 'toy_yarn'], minArea: 120 })
    for (const f of tc.frames) addFrame('toys', f.name, f.spr)
  }

  // 6) 地形：草地方塊（2×2 鏡像無縫）、小路（只留泥土，左右鏡像）、遠景（左右鏡像）
  {
    const img = await load('scene_tiles.png')
    const mask = new Uint8Array(img.W * img.H).fill(1)
    const e = estimateP(img, mask)
    info(`scene_tiles.png: p=${e.p.toFixed(2)}`)
    const box = [0, 0, 508, 490] // 草地格；底邊 20 像素左右比較粗糙，裁掉
    const phases = [estimatePhase(img, mask, box, e.p, 0), estimatePhase(img, mask, box, e.p, 1)]
    const t = depixelate(img, mask, null, null, box, e.p, phases)
    // 裁掉不完整的最外圈
    const trim = (s) => {
      const w = s.w - 2, h = s.h - 2
      const out = Buffer.alloc(w * h * 4)
      for (let y = 0; y < h; y++) s.rgba.copy(out, y * w * 4, ((y + 1) * s.w + 1) * 4, ((y + 1) * s.w + 1 + w) * 4)
      return { w, h, rgba: out }
    }
    const grass = trim(t)
    const top = hcat(grass, flipX(grass))
    const tile = vcat(top, flipY(top))
    addFrame('terrain', 'grass_tile', tile, { ax: 0, ay: 0 })
    info(`草地方塊 ${tile.w}×${tile.h}（2×2 鏡像無縫）`)

    // 小路：泥土與石頭（非綠色）才保留，上下兩側的草交給草地方塊
    const pimg = await load('scene_path.png')
    const pm = new Uint8Array(pimg.W * pimg.H)
    for (let i = 0; i < pimg.W * pimg.H; i++) {
      const r = pimg.data[i * 3], g = pimg.data[i * 3 + 1], b = pimg.data[i * 3 + 2]
      pm[i] = r >= g - 6 && !(g > r + 10 && g > b + 30) ? 1 : 0
    }
    const pe = estimateP(pimg, new Uint8Array(pimg.W * pimg.H).fill(1))
    info(`scene_path.png: p=${pe.p.toFixed(2)}`)
    const { lab: plab, comps: pcomps } = label(pm, pimg.W, pimg.H)
    const biggest = pcomps.reduce((a, c) => (c.area > a.area ? c : a))
    const keep = new Set(pcomps.filter((c) => c.area > 400).map((c) => c.id))
    const pbox = [0, biggest.y0 - 4, pimg.W - 2, biggest.y1 + 4]
    const pph = [estimatePhase(pimg, new Uint8Array(pimg.W * pimg.H).fill(1), pbox, pe.p, 0), estimatePhase(pimg, new Uint8Array(pimg.W * pimg.H).fill(1), pbox, pe.p, 1)]
    const pr = depixelate(pimg, pm, plab, keep, pbox, pe.p, pph)
    const path = cleanSprite(pr)
    const pathLoop = hcat(path, flipX(path))
    addFrame('terrain', 'path', pathLoop, { ax: 0, ay: pathLoop.h })
    info(`小路 ${pathLoop.w}×${pathLoop.h}（左右鏡像，可水平重複）`)

    const far = await sheet({ file: 'scene_far.png', cols: 1, rows: 1, names: ['far'], minArea: 5000 })
    for (const f of far.frames) {
      const loop = hcat(f.spr, flipX(f.spr))
      addFrame('terrain', 'far', loop, { ax: 0, ay: loop.h })
      info(`遠景 ${loop.w}×${loop.h}（左右鏡像，可水平重複）`)
    }
  }

  await writeOutputs()
}

// ---------------------------------------------------------------------------
// 輸出
// ---------------------------------------------------------------------------

function shelfPack(frames, maxW = 1024) {
  const sorted = [...frames].sort((a, b) => b.h - a.h || b.w - a.w)
  let x = 0, y = 0, rowH = 0
  const placed = []
  for (const f of sorted) {
    if (x + f.w > maxW) { x = 0; y += rowH + 1; rowH = 0 }
    placed.push({ f, x, y })
    x += f.w + 1
    rowH = Math.max(rowH, f.h)
  }
  return { placed, w: maxW, h: y + rowH }
}

async function writeOutputs() {
  let totalBytes = 0
  // 先清掉舊的輸出（舊雜湊的檔案不留，避免 dist 裡堆積沒人用的舊圖集）
  for (const f of readdirSync(OUT)) if (/\.(png|json)$/.test(f)) unlinkSync(join(OUT, f))
  for (const [group, frames] of Object.entries(atlases)) {
    const { placed, w, h } = shelfPack(frames)
    const atlas = Buffer.alloc(w * h * 4)
    for (const { f, x, y } of placed) {
      for (let row = 0; row < f.h; row++) f.rgba.copy(atlas, ((y + row) * w + x) * 4, row * f.w * 4, (row + 1) * f.w * 4)
      manifest.frames[f.key] = { atlas: group, x, y, w: f.w, h: f.h, ax: f.ax, ay: f.ay, ...(f.unused ? { unused: true } : {}), ...(f.meta ? { meta: f.meta } : {}) }
    }
    // alpha 只有 0 或 255
    for (let i = 3; i < atlas.length; i += 4) if (atlas[i] !== 0 && atlas[i] !== 255) atlas[i] = atlas[i] >= 128 ? 255 : 0
    const buf = await sharp(atlas, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9, palette: false }).toBuffer()
    const hash = createHash('sha1').update(buf).digest('hex').slice(0, 8)
    writeFileSync(join(OUT, group + '.' + hash + '.png'), buf)
    manifest.atlases[group] = { file: group + '.' + hash + '.png', width: w, height: h }
    totalBytes += buf.length
    info(`圖集 ${group}.png：${w}×${h}，${frames.length} 張，${(buf.length / 1024).toFixed(1)} KB`)
  }

  // 動畫幀順序
  for (const id of Object.keys(DOGS)) {
    manifest.animations['dog_' + id] = {
      idle: ['stand'], walk: ['walk_a', 'walk_b'], sit: ['sit_a', 'sit_b'], sleep: ['sleep'], eat: ['eat'], happy: ['happy', 'stand'],
      jump: ['jump'], dig: ['dig_a', 'dig_b'], tug: ['tug'], belly_up: ['belly_up'], bark: ['bark'],
    }
  }
  for (const id of CATS) {
    manifest.animations['cat_' + id] = {
      idle: ['stand'], walk: ['walk_a', 'walk_b'], sit: ['sit_a'], sleep: ['sleep'], eat: ['eat'], groom: ['groom'],
      crouch: ['crouch'], pounce: ['pounce'], swat: ['swat'], tangled: ['tangled'],
    }
  }
  manifest.notes = {
    anchor: 'ax = 水平中心（翻轉時以此為軸），ay = 腳底基準線（外框底邊）。同一隻動物各姿勢的腳底對齊。',
    unused_back: '貓的 sit_b 是背面，標記為 unused_back，不用在動畫上。',
    keyMap: { dog: { collie: 'bordercollie' }, cat: { orange: 'tabby', bluecat: 'britishblue' } },
  }
  const manifestText = JSON.stringify(manifest)
  const manifestName = 'manifest.' + createHash('sha1').update(manifestText).digest('hex').slice(0, 8) + '.json'
  writeFileSync(join(OUT, manifestName), manifestText)
  writeFileSync(
    join(ROOT, 'src', 'farm', 'pixel', 'assetIndex.ts'),
    "/** 由 scripts/process-assets.mjs 產生，請勿手改：目前 manifest 的檔名（帶內容雜湊）。素材內容變了這個檔名就會變。 */\nexport const ASSET_MANIFEST = '" + manifestName + "'\n",
  )
  info(`${manifestName}：${Object.keys(manifest.frames).length} 張素材；圖集總大小 ${(totalBytes / 1024).toFixed(1)} KB`)

  // 檢查：每張的洋紅殘留、alpha 值
  for (const frames of Object.values(atlases))
    for (const f of frames) {
      let magenta = 0
      for (let i = 0; i < f.w * f.h; i++) if (f.rgba[i * 4 + 3] && isBg(f.rgba[i * 4], f.rgba[i * 4 + 1], f.rgba[i * 4 + 2])) magenta++
      if (magenta) warn(`${f.key} 殘留洋紅像素 ${magenta} 個`)
      if (f.w < 6 || f.h < 6) warn(`${f.key} 太小（${f.w}×${f.h}）`)
    }
  // 前後尺寸對照表
  info('')
  info('===== 尺寸對照表（寬×高，邏輯像素；前 = 第一版統一 p=6.1，後 = 本版） =====')
  const NAMES = { dog_golden: '黃金獵犬', dog_husky: '哈士奇', dog_collie: '邊牧', dog_shiba: '柴犬', dog_poodle: '貴賓', dog_corgi: '柯基', cat_ragdoll: '布偶貓', cat_bluecat: '英短藍貓', cat_siamese: '暹羅', cat_orange: '橘虎斑', cat_calico: '三花', cat_black: '黑貓' }
  for (const [k, b0] of Object.entries(BASELINE)) {
    const f = manifest.frames[k]
    if (!f) continue
    const key = k.replace('_stand', '')
    const label = NAMES[key] ? NAMES[key] + ' 站姿' : k
    const tgt = STAND_HEIGHT[key] ? '（目標高 ' + STAND_HEIGHT[key] + '）' : ''
    info('  ' + label.padEnd(10, '　') + ' ' + (b0[0] + '×' + b0[1]).padEnd(8) + ' → ' + (f.w + '×' + f.h).padEnd(8) + tgt)
  }
  // 動物尺寸摘要
  const sizeOf = (k) => manifest.frames[k]
  for (const id of Object.keys(DOGS)) { const s = sizeOf(`dog_${id}_stand`); if (s) info(`狗 ${id} stand ${s.w}×${s.h}`) }
  for (const id of CATS) { const s = sizeOf(`cat_${id}_stand`); if (s) info(`貓 ${id} stand ${s.w}×${s.h}`) }
  for (const k of ['house_closed', 'clocktower', 'tree', 'lamp']) { const s = sizeOf(k); if (s) info(`${k} ${s.w}×${s.h}`) }

  await overview('dark', { r: 34, g: 36, b: 48 })
  await overview('light', { r: 236, g: 236, b: 230 })
  copyFileSync(join(SHOTS, 'assets-overview-light.png'), join(SHOTS, 'assets-overview.png'))
  info('')
  info('===== 素材問題與取捨（人工檢視後的結論） =====')
  for (const n of KNOWN_ISSUES) info('• ' + n)
  writeFileSync(join(SHOTS, 'assets-report.txt'), report.join('\n') + '\n')
}

async function overview(tag, bg) {
  const SCALE = 3
  const groups = Object.entries(atlases)
  const rows = []
  for (const [group, frames] of groups) rows.push({ group, frames: frames.filter((f) => group !== 'terrain') })
  const MAXW = 1800
  const layout = []
  let y = 6
  for (const { group, frames } of rows) {
    if (!frames.length) continue
    layout.push({ label: group, y, h: 14 })
    y += 16
    let x = 6, rowH = 0
    for (const f of frames) {
      const w = f.w * SCALE, h = f.h * SCALE
      if (x + w > MAXW) { x = 6; y += rowH + 8; rowH = 0 }
      layout.push({ f, x, y, w, h })
      x += w + 10
      rowH = Math.max(rowH, h)
    }
    y += rowH + 14
  }
  const W = MAXW, H = y + 6
  const base = sharp({ create: { width: W, height: H, channels: 3, background: bg } })
  const comps = []
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
  const fg = bg.r > 128 ? '#222' : '#ddd'
  for (const it of layout) {
    if (it.label) svg += `<text x="6" y="${it.y + 11}" font-family="sans-serif" font-size="12" fill="${fg}">${it.label}</text>`
    else {
      const buf = await sharp(it.f.rgba, { raw: { width: it.f.w, height: it.f.h, channels: 4 } }).resize(it.w, it.h, { kernel: 'nearest' }).png().toBuffer()
      comps.push({ input: buf, left: it.x, top: it.y })
    }
  }
  svg += '</svg>'
  comps.push({ input: Buffer.from(svg), left: 0, top: 0 })
  await base.composite(comps).png().toFile(join(SHOTS, `assets-overview-${tag}.png`))
  info(`總覽圖：screenshots/assets-overview-${tag}.png（${W}×${H}）`)
}

await main()
