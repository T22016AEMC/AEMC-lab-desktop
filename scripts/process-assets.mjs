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
/** 直接執行（node scripts/process-assets.mjs）才是 true；被 import 時命令列參數屬於別的程式，不讀 */
const IS_MAIN = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
const SRC = resolve((IS_MAIN ? process.argv[2] : undefined) ?? process.env.ASSET_SRC ?? join(ROOT, '..', '像素風圖片'))
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
/**
 * v3.8.0：嚴格的洋紅背景（只有 R、B 接近、G 明顯偏低的那一條，不含上面「玫瑰紅陰影」那條）。
 * 粉色野餐墊的深粉紅滾邊（約 236,43,129）會被 isBg 的第二條當成陰影吃掉，所以 picnic_mats.png 用這個判斷
 */
const isBgStrict = (r, g, b) => {
  const m = Math.min(r, b)
  return m >= 80 && g <= m - 45 && Math.abs(r - b) < 45
}

/**
 * v3.9.0：只認「接近純洋紅背景色」的像素（背景約 245,5,250）。小建築.png 右下格的珊瑚有粉紅枝（粉紅填色 R≈B、G 偏低，
 * 和 isBg／isBgStrict 的「R、B 接近而 G 低」條件重疊），用那兩個會把粉紅填色吃掉、只剩黑色輪廓，所以這一格改用這個很窄的判斷。
 */
const isBgNear = (r, g, b) => r >= 200 && b >= 200 && g <= 80 && Math.abs(r - b) <= 30

/**
 * isBgNear 去背後，輪廓外面會留一圈「黑色輪廓混洋紅背景」的暗紫色邊（R、B 接近、G 很低、不夠亮）。
 * 只移除「貼著透明處（上下左右任一邊）」的這種像素，最多 2 輪（邊只有 1 格寬）；黑色輪廓（R、B 都低）與粉紅填色（G 較高）不會中。
 * 回傳 { spr: 重新裁切後的素材, n: 移除的像素數 }
 */
const fringeMagenta = (r, g, b) => Math.min(r, b) >= 60 && g < Math.min(r, b) * 0.45 && Math.abs(r - b) <= 50
function trimMagentaFringe(spr, passes = 2) {
  const { w, h, rgba } = spr
  let n = 0
  for (let k = 0; k < passes; k++) {
    const hit = []
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (!rgba[i + 3] || !fringeMagenta(rgba[i], rgba[i + 1], rgba[i + 2])) continue
        const open = (xx, yy) => xx < 0 || yy < 0 || xx >= w || yy >= h || !rgba[(yy * w + xx) * 4 + 3]
        if (open(x + 1, y) || open(x - 1, y) || open(x, y + 1) || open(x, y - 1)) hit.push(i)
      }
    for (const i of hit) rgba[i + 3] = 0
    n += hit.length
    if (!hit.length) break
  }
  return { spr: cleanSprite(spr, isBgNear), n }
}

async function load(file) {
  const path = join(SRC, file)
  if (!existsSync(path)) throw new Error('找不到原圖：' + path)
  const { data, info: i } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, W: i.width, H: i.height, file }
}

function fgMask(img, bg = isBg) {
  const { data, W, H } = img
  const m = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) m[i] = bg(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) ? 0 : 1
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

/** estimateP 的預設搜尋範圍 */
const P_RANGE = [4, 12]
/**
 * 4.0-R：估出的格大小碰到搜尋範圍的下限或上限 = 估算不可靠（例如原圖已經是整齊的 4×4 像素格，估出來剛好 4.00），
 * 這時用估算值取樣會讓素材靜默變大或變小，所以沒有明確參數（pFixed／targets／fitMax…）的素材一律報錯。
 */
function guardEstimate(file, e, range = P_RANGE, what = '') {
  if (e.p <= range[0] + 1e-9 || e.p >= range[1] - 1e-9)
    throw new Error(`${file}${what}：估出的像素格 p=${e.p.toFixed(2)} 碰到搜尋範圍 [${range[0]}, ${range[1]}] 的邊界，估算不可靠；請在 process-assets.mjs 給這張圖明確的 pFixed／pFrames／targets`)
}

/** 估算整張圖的像素格大小 p（x、y 方向的頻譜相加，取最強的峰；偏好較小的 p 以免選到倍數） */
function estimateP(img, mask, range = P_RANGE) {
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

/**
 * 4.0-R：固定欄×列切格（grid: 'even'）。先照一般做法找連通塊；寬度超過 1.5 格（W / cols）的大連通塊是「相鄰幾隻黏在一起」，
 * 依寬度拆成 round(寬 / 格寬) 份：每條切線在該連通塊「等分線左右 1/4 份寬」內找這個連通塊前景最少的那一欄，切線左右的像素分成不同的連通塊。
 * 只切黏在一起的連通塊，其他連通塊整塊保留（外框互相交錯的相鄰動物不會被直線切到）。之後照一般的 groupCells 分到欄×列。
 * 回傳 { cells, lab, splits }：splits = 被切開的連通塊與切線位置（報告用）。
 */
function evenCells(mask, W, H, cols, rows, minArea) {
  const { lab, comps: all } = label(mask, W, H)
  const comps = keepComps(all, minArea)
  const cellW = W / cols
  let next = all.length + 1
  const out = []
  const splits = []
  for (const c of comps) {
    const bw = c.x1 - c.x0 + 1
    const k = Math.round(bw / cellW)
    if (bw <= cellW * 1.5 || k < 2) { out.push(c); continue }
    const colCount = (x) => { let n = 0; for (let y = c.y0; y <= c.y1; y++) if (lab[y * W + x] === c.id) n++; return n }
    const cuts = []
    for (let i = 1; i < k; i++) {
      const t = Math.round(c.x0 + (bw * i) / k), r = Math.floor(bw / k / 4)
      let best = t, bc = Infinity
      for (let x = t - r; x <= t + r; x++) { const n = colCount(x); if (n < bc || (n === bc && Math.abs(x - t) < Math.abs(best - t))) { bc = n; best = x } }
      cuts.push(best)
    }
    splits.push({ box: [c.x0, c.y0, c.x1, c.y1], cuts })
    const edges = [c.x0, ...cuts, c.x1 + 1]
    for (let j = 0; j < edges.length - 1; j++) {
      const id = next++
      let x0 = W, y0 = H, x1 = -1, y1 = -1, area = 0
      for (let y = c.y0; y <= c.y1; y++)
        for (let x = edges[j]; x < edges[j + 1]; x++)
          if (lab[y * W + x] === c.id) { lab[y * W + x] = id; area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      if (area) out.push({ id, x0, y0, x1, y1, area })
    }
  }
  return { cells: groupCells(out, cols, rows), lab, splits }
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
function cleanSprite(s, bg = isBg) {
  if (!s) return null
  const { w, h, rgba } = s
  // 殘留的洋紅色（邊緣混色）→ 透明
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] && bg(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])) rgba[i * 4 + 3] = 0
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
/**
 * v3.8.1：貓圖改用清晰版（`cat_<花色>_core_hd.png`、`cat_<花色>_extra_hd.png`，原圖保留）。
 * CAT_HD=0（環境變數）= 回到舊圖，只供「新舊逐格比對」用。CAT_HD_REVERT = 比對後發現走樣、退回舊圖的幀：{ 花色: { core: [幀名], extra: [幀名] } }。
 */
const CAT_HD = process.env.CAT_HD !== '0'
// 橘貓 swat：hd 圖的揮爪特效（黃色弧線）變細、被濾掉（舊圖還留有幾個殘點），少畫了東西 → 這一格退回舊圖
const CAT_HD_REVERT = { orange: { core: [], extra: ['swat'] } }
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
/** 4.0-R：動物改用明確的 p 之後，站姿高度只檢查（STAND_HEIGHT 註明的容許範圍 ±2，超過就警告） */
function standCheck(key, sheetResult) {
  const st = sheetResult.frames.find((f) => f.name === 'stand')
  if (!st) return warn(key + '：找不到站姿')
  const d = st.spr.h - STAND_HEIGHT[key]
  ;(Math.abs(d) > 2 ? warn : info)(`${key} 站姿 ${st.spr.w}×${st.spr.h}（目標高 ${STAND_HEIGHT[key]}，p=${sheetResult.p.toFixed(3)}）`)
}
/** 反推 p 時的起點（原圖大約的像素格） */
const P_GUESS = 6.1
/** 貓 extra 原圖是縮小後再放大的：像素格 = 同一隻貓 core 的 p × 這個倍率（沿用先前與 core 的相對取樣關係） */
const CAT_EXTRA_RATIO = 0.56

/**
 * v3.6.3：換圖的貓 core 格。cat_orange_core_fix.png 是 3 隻橫排（睡覺、吃東西〔碗畫在圖裡〕、開心舔爪），對應 core 的 sleep、eat、groom（第 6、7、8 格）。
 * 三隻共用同一個像素格 p（和同一張圖集其他格一樣是整張共用的規則）；p 由「輸出尺寸對齊舊格」求出：
 * sleep、eat 的寬度 = 舊 sleep、eat 的寬度；groom 的高度 = 舊 sit_a 的高度（頭頂高度與坐姿相近）。
 * 錨點沿用 addFrame 預設（水平中心、外框底邊），和舊格同一規則。
 */
const CAT_CORE_FIX = { orange: { file: 'cat_orange_core_fix.png', names: ['sleep', 'eat', 'groom'] } }
async function catCoreFix(id, core) {
  const cfg = CAT_CORE_FIX[id]
  const oldOf = (n) => core.frames.find((f) => f.name === n).spr
  const group = { sleep: ['w', oldOf('sleep').w], eat: ['w', oldOf('eat').w], groom: ['h', oldOf('sit_a').h] }
  // 4.0-R：三隻共用的 p 改成明確值（P_FIXED.orangeFix；原本是 solveGroup 以 group 的尺寸求解，group 現在只用在下面的報告）
  void group
  const r = await sheet({ file: cfg.file, cols: 3, rows: 1, names: cfg.names, pFixed: P_FIXED.orangeFix })
  for (const f of r.frames) {
    const o = oldOf(f.name)
    info('  橘貓換圖 ' + f.name + '：新 ' + f.spr.w + '×' + f.spr.h + '（舊 ' + o.w + '×' + o.h + '），錨點 ax=' + Math.round(f.spr.w / 2) + ' ay=' + f.spr.h)
  }
  return r
}

/**
 * v3.8.1：貓 hd 圖去背後的「洋紅調」殘留。`isBg` 去掉的是整片背景與邊緣混色；hd 圖在毛色邊緣另外有零星幾個「鮮豔洋紅」的單點
 * （R≥190、B≥140、G≤100、R 與 B 差 ≤70；耳朵、鼻子、舌頭的粉紅 G 較高、不會中），用上下左右（再不行用八方）不是洋紅調的不透明鄰居的平均色取代。
 * 回傳取代的像素數（報告會逐張列出）。
 */
const strictMagenta = (r, g, b) => r >= 190 && b >= 140 && g <= 100 && Math.abs(r - b) <= 70
function despillMagenta(spr) {
  const { w, h, rgba } = spr
  const hit = []
  for (let i = 0; i < w * h; i++) if (rgba[i * 4 + 3] && strictMagenta(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])) hit.push(i)
  for (const i of hit) {
    const x = i % w, y = (i / w) | 0
    for (const nbs of [[[1, 0], [-1, 0], [0, 1], [0, -1]], [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]]) {
      let n = 0, r = 0, g = 0, b = 0
      for (const [dx, dy] of nbs) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const j = (yy * w + xx) * 4
        if (!rgba[j + 3] || strictMagenta(rgba[j], rgba[j + 1], rgba[j + 2])) continue
        n++; r += rgba[j]; g += rgba[j + 1]; b += rgba[j + 2]
      }
      if (n) { rgba[i * 4] = Math.round(r / n); rgba[i * 4 + 1] = Math.round(g / n); rgba[i * 4 + 2] = Math.round(b / n); break }
      if (nbs.length === 8) rgba[i * 4 + 3] = 0 // 四周都沒有可參考的顏色：移除
    }
  }
  return hit.length
}

const pCache = {}
/** 建築素材的縮放係數（v3.3.1；v3.9.0 加花槽 planter、珊瑚 coral，兩個係數各自設定、預設都是 0.7，可用環境變數 PLANTER_SCALE／CORAL_SCALE 覆寫）；候選值可用環境變數 BOWL_SCALE 覆寫食盆水盆的係數（0.7／0.75 比較用） */
/** 小球（toy_ball_s）的目標高度（邏輯像素）；BALL_S_H 環境變數可覆寫來比較 */
const BALL_S_H = Number(process.env.BALL_S_H ?? 12)
const BUILDING_SCALES = { doghouse: 1.15, cat_tree: 1.15, bowls: Number(process.env.BOWL_SCALE ?? 0.7), planter: Number(process.env.PLANTER_SCALE ?? 0.7), coral: Number(process.env.CORAL_SCALE ?? 0.7) }
/** BUILDING_SCALES 的預設值（下面 P_FIXED.small 是用這組係數量出來的；環境變數改了係數時，p 依比例換算） */
const BUILDING_SCALES_DEFAULT = { doghouse: 1.15, cat_tree: 1.15, bowls: 0.7, planter: 0.7, coral: 0.7 }

/**
 * 4.0-R：明確指定的像素格 p。
 * 2026-11 原圖換成「整齊的 4×4 像素格」之後，估算的格大小每張都剛好落在 4.00（= 估算範圍的下限），用估算值或「從估算值開始求解」都會讓素材變大或差 1～2 像素。
 * 為了維持畫面上原本的大小，每張圖改用固定的 p：值由 tests-archive/v400r/tune-p.mjs、tune-terrain.mjs 掃描找出，
 * 讓輸出尺寸與換圖前（tests-archive/v400r/before.json）相同；找不到完全相同的 p 時取最接近的（差異列在階段 R 報告）。
 *  - 數字是「這張圖實際取樣用的 p」：small 的值已經除過 BUILDING_SCALES，pFrames 不再除縮放係數。
 *  - 動物：每隻一個 p（同一隻的所有姿勢共用，core 與 extra 相同；貓 extra = core × CAT_EXTRA_RATIO），站姿高度 = 換圖前的站姿高度。
 * 原圖再被換成別的格大小時：管線不會報錯（因為都是明確參數），但輸出尺寸會變；tests-archive/v400r 的尺寸測試會抓到，再用調參工具重找。
 */
const P_FIXED = {
  animal: {
    dog_shiba: 8.534, dog_corgi: 8.294, dog_husky: 7.151, dog_golden: 6.229, dog_collie: 6.898, dog_poodle: 8.432,
    cat_orange: 9.365, cat_black: 10.231, cat_calico: 10.049, cat_siamese: 9.564, cat_bluecat: 8.86, cat_ragdoll: 8.98,
  },
  orangeFix: 15.543,
  front: 5.362,
  tree: 5.517,
  tower: { clocktower: 3.6044, clocktower_open: 4.404, clocktower_gold: 4.4039, clocktower_open_gold: 4.4039 },
  small: { doghouse: 4.9714, cat_tree: 4.997, bowls: 8.146, lamp: 5.702, planter: 8.098, coral: 8.098 },
  buildingsNew: 4.003,
  decor: { bush: 8.676, rocks: 8.547, flowers: 10.339, tall_grass: 9.323, mushroom: 9.102, stump: 8.547 },
  sky: 7.707,
  snowflake: 14.249,
  fxIcons: { fx_heart: 8.013, fx_zzz: 10.37, fx_note: 8.624, fx_sweat: 9.198, fx_exclaim: 11.211, fx_sparkle: 10.354, fx_bubble: 11.244, fx_question: 10.994 },
  fxWater: 10.155,
  toysDog: 4.341,
  toysCat: 4.315,
  toyBallS: 10.527,
  moundS: 8.94,
  grass: 9.457,
  path: 6.188,
  far: 5.501,
  digB: { coin_bronze: 19.874, coin_silver: 20.296, coin_gold: 19.172, fx_reveal: 15.873 },
  board: 7.065,
  papers: 6.805,
  mats: 6.16,
  camera: 47.336,
  food: 35.766,
  polaroid: 7.73,
}
/** 小建築逐格的 p（BUILDING_SCALES 被環境變數改過時依比例換算） */
const smallP = (name) => P_FIXED.small[name] * ((BUILDING_SCALES_DEFAULT[name] ?? 1) / (BUILDING_SCALES[name] ?? 1))

let clockClosedSpr = null
/**
 * 4.0-R：四張鐘樓（關門、開門、黃金關門、黃金開門）共用同一個鐘面（中心、半徑）：關門鐘樓偵測到的值取整數。
 * 各張各自偵測會差半格到 1 格，滑鼠移上去換開門版時程式畫的鐘面會跳；偵測值和共用值差超過 1 像素就警告（素材可能真的不同）。
 */
let towerClock = null
function sharedClock(name, spr) {
  const own = detectClockFace(spr)
  if (!own) warn(name + '：偵測不到鐘面，用共用值')
  else if (Math.abs(own.cx - towerClock.cx) > 1 || Math.abs(own.cy - towerClock.cy) > 1 || Math.abs(own.r - towerClock.r) > 1)
    warn(`${name}：鐘面偵測 (${own.cx},${own.cy}) r=${own.r} 和共用值 (${towerClock.cx},${towerClock.cy}) r=${towerClock.r} 差超過 1 像素`)
  info(`${name}：鐘面偵測 ${own ? `(${own.cx},${own.cy}) r=${own.r}` : '無'} → 共用 (${towerClock.cx},${towerClock.cy}) r=${towerClock.r}`)
  return { ...towerClock }
}
let moundSpr = null
/** 水池的目標寬度（邏輯像素） */
const POND_W = 110

/**
 * 處理一張格狀原圖。
 *  - pFixed：直接指定取樣格大小 p（沒指定就用頻譜估算值）
 *  - targets：{ 幀名稱: 目標高度（邏輯像素） }，用來「依目標高度反推 p」
 *  - solveFrom：以這一幀的目標高度求出 p，整張圖的所有幀共用（同一隻動物的所有姿勢大小不會跳）
 *    沒有 solveFrom 時，targets 裡的每一幀各自求自己的 p（例如裝飾物、特效圖示）
 *  - pScale：整張圖的 p 再乘上的倍率（貓 extra 原圖是縮小後再放大的，相對 core 取 0.56）
 *  - solveGroup：{ 幀名稱: [量哪個尺寸 'w'|'h', 目標值] }，求「整張共用」的一個 p，讓這幾幀的輸出尺寸對目標值的對數誤差平方和最小（v3.6.3 橘貓換圖用）
 */
async function sheet(opts) {
  const { file, cols, rows, names, minArea = 300, pRange, pFixed, targets = {}, scales = {}, solveFrom, pScale = 1, solveDim = 'h', fitMax, solveGroup, strictBg = false, nearBg = false, grid, pFrames = {}, probe } = opts
  const img = await load(file)
  const bgFn = nearBg ? isBgNear : strictBg ? isBgStrict : isBg
  const mask = fgMask(img, bgFn)
  let lab, all, comps, cells
  if (grid === 'even') {
    // 4.0-R：固定欄×列切格（相鄰的格子像素連在一起也會切開），見 evenCells
    const ev = evenCells(mask, img.W, img.H, cols, rows, minArea)
    lab = ev.lab
    cells = ev.cells
    comps = all = cells.flat()
    info(`${file}：固定 ${cols}×${rows} 切格；黏在一起而切開的連通塊 ${ev.splits.map((s) => `[${s.box.join(',')}] 切在 x=${s.cuts.join('、')}`).join('；') || '無'}`)
  } else {
    ;({ lab, comps: all } = label(mask, img.W, img.H))
    comps = keepComps(all, minArea)
    cells = groupCells(comps, cols, rows)
  }
  const e = estimateP(img, mask, pRange)
  const base = (pFixed ?? e.p) * pScale
  pCache[file] = { p: base, amp: e.amp }

  const render = (cell, pp) => {
    const box = [Math.min(...cell.map((c) => c.x0)), Math.min(...cell.map((c) => c.y0)), Math.max(...cell.map((c) => c.x1)), Math.max(...cell.map((c) => c.y1))]
    const keep = new Set(cell.map((c) => c.id))
    // 相位：每格各自估算（避開 AI 圖的整體漂移）
    const clip = [Math.max(0, box[0] - 4), Math.max(0, box[1] - 4), Math.min(img.W - 2, box[2] + 4), Math.min(img.H - 2, box[3] + 4)]
    const phases = [estimatePhase(img, mask, clip, pp, 0), estimatePhase(img, mask, clip, pp, 1)]
    return cleanSprite(depixelate(img, mask, lab, keep, clip, pp, phases), bgFn)
  }
  // 只給調參工具用（tests-archive/v400r/tune-p.mjs）：回傳切好的格子與取樣函式，不輸出任何東西
  if (probe) return { render, cells, names, e }
  // 4.0-R：有任何一格會直接用「估算值」取樣（沒有 pFixed、fitMax、solveGroup、solveFrom，這一格也沒有 targets／pFrames），而估算值碰到範圍邊界 → 報錯
  const usesEstimate = pFixed == null && !fitMax && !solveGroup && !solveFrom && names.some((n) => n && (Array.isArray(n) || (!targets[n] && pFrames[n] == null)))
  if (usesEstimate) guardEstimate(file, e, pRange)
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
  // solveGroup（v3.6.3）：多幀共用同一個 p，使各幀的輸出尺寸同時盡量接近各自的目標（取對數誤差平方和最小者）
  let groupLog = null
  if (solveGroup) {
    const items = Object.entries(solveGroup).map(([name, [dim, target]]) => ({ name, dim, target, cell: cells[names.indexOf(name)] }))
    for (const it of items) if (!it.cell?.length) throw new Error(file + ' 找不到 ' + it.name)
    let pp = base
    let best = { pp, cost: Infinity, got: [] }
    for (let k = 0; k < 14; k++) {
      const got = items.map((it) => { const s = render(it.cell, pp); return s ? (it.dim === 'w' ? s.w : s.h) : 0 })
      const logs = got.map((g, i) => Math.log(g / items[i].target))
      const cost = logs.reduce((t, v) => t + v * v, 0)
      if (cost < best.cost) best = { pp, cost, got }
      pp *= Math.exp(logs.reduce((t, v) => t + v, 0) / logs.length)
    }
    animalP = best.pp
    groupLog = items.map((it, i) => it.name + ' ' + it.dim + '=' + best.got[i] + '（目標 ' + it.target + '）').join('、')
  }
  // fitMax（v3.6.0 收藏品圖示）：整張圖共用同一個 p（保留圖示之間的相對大小），p 取到「最大的那張長邊 = fitMax」
  if (fitMax) {
    const live = cells.filter((c) => c.length)
    const bboxMax = (cell) =>
      Math.max(Math.max(...cell.map((c) => c.x1)) - Math.min(...cell.map((c) => c.x0)) + 1, Math.max(...cell.map((c) => c.y1)) - Math.min(...cell.map((c) => c.y0)) + 1)
    const maxGot = (pp) => Math.max(...live.map((cell) => { const s = render(cell, pp); return s ? Math.max(s.w, s.h) : 0 }))
    let pp = Math.max(...live.map(bboxMax)) / fitMax
    for (let k = 0; k < 10; k++) {
      const got = maxGot(pp)
      if (got <= fitMax && got >= fitMax - 1) break
      pp *= got / fitMax
    }
    while (maxGot(pp) > fitMax) pp *= 1.01
    animalP = pp
  }
  info(
    file + ': ' + img.W + '×' + img.H + '，連通塊 ' + comps.length + '（原 ' + all.length + '），像素格估算 p=' + e.p.toFixed(2) + '（強度 ' + e.amp.toFixed(2) + '）' +
      (groupLog ? '，共用 p=' + animalP.toFixed(2) + '：' + groupLog : '') +
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
    // scales[名稱] = 縮放係數（> 1 放大）：像素格 p 除以係數重新取樣（最近鄰、仍是整數像素，不是事後縮放）
    // pFrames[名稱]（4.0-R）= 這一格明確指定的像素格，優先於 targets 與整張的 p（已含縮放，不再除 scales）
    const pp = pFrames[name] != null ? pFrames[name] : solveFrom || !targets[name] ? animalP / (scales[name] ?? 1) : solve(cell, targets[name], base)
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
  "貓的 sit_b 是背面，已切出但標記 unused_back，不使用；toys_cat.png 另外 6 個海洋道具（海灘球、泡泡、貝殼、蝦、海草、閃光）不使用；雨滴素材（raindrop）保留但不使用（雨改由程式畫細線）。",
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

// ---------------------------------------------------------------------------
// v3.6.0：收藏品圖示、錢幣、完整紙張、金色外觀
// ---------------------------------------------------------------------------

/** 收藏品圖示的統一畫布邊長（邏輯像素）。預覽會同時輸出 32 與 48 兩種；正式用哪個由環境變數 ITEM_BOX 決定（預設 48，v3.6.0 定案） */
const ITEM_BOX = Number(process.env.ITEM_BOX ?? 48)
/** items_dig_a 的 6×5 格（第 23 格是空格）→ 物品編號。U002 是 6 片套組：_1～_6 */
const DIG_A_NAMES = [
  'C001', 'C002', 'C003', 'C004', 'C005', 'C006',
  'C007', 'C008', 'C009', 'C010', 'U001', 'U002_1',
  'U002_2', 'U002_3', 'U002_4', 'U002_5', 'U003', 'U004',
  'U005', 'U006', 'U007', 'U008', null, 'R001',
  'R002', 'R003', 'R004', 'R005', 'L001', 'L002',
]
const CAT_A_NAMES = ['U009_1', 'U009_2', 'U009_3', 'U009_4', 'U009_5', 'U009_6', 'L003', 'L004']
const SILHOUETTE_RGB = [46, 34, 24]
/** 場景裡土堆（toy_dirt_mound_s）的目標寬度；錢幣、「可揭曉」提示的目標高度；完整紙張的長邊 */
const MOUND_S_W = 26
const COIN_H = 16
const REVEAL_H = 22
const PAPER_MAX = 96

/**
 * 去掉「偏粉紅色、而且貼著透明邊」的像素（洋紅背景混進光暈或半透明膠帶留下的粉紅殘邊），最多重複 3 輪；回傳移除的像素數。
 * loose（完整紙張）：再加上「淡粉色」（R 高、B 比 G 高 8 以上；紙是奶油色，B 一定比 G 低）。
 * glow（只用在 L001 鑰匙）：再加上「鮭紅／粉紅光暈」（R > 235、G < 170、B 不比 G 低太多）；金色的 B 遠低於 G，不會被刪。
 * 條件：不透明、R 高、B 偏高、G 明顯低於 R 與 B（紅色印章的 B 很低、金色光暈的 B 也低，不會被誤刪）
 */
function defringePink(spr, loose = false, glow = false) {
  const { w, h, rgba } = spr
  const pinkish = (i) => rgba[i + 3] && ((rgba[i] > 200 && rgba[i + 2] > 130 && rgba[i + 1] < Math.min(rgba[i], rgba[i + 2]) - 25) || (loose && rgba[i] > 200 && rgba[i + 2] > rgba[i + 1] + 8) || (glow && rgba[i] > 235 && rgba[i + 1] < 170 && rgba[i + 2] > rgba[i + 1] - 30 && rgba[i + 2] > 70 && rgba[i] - rgba[i + 1] > 80))
  const open = (x, y) => x < 0 || y < 0 || x >= w || y >= h || rgba[(y * w + x) * 4 + 3] === 0
  let total = 0
  for (let round = 0; round < 3; round++) {
    const kill = []
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (pinkish(i) && (open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1))) kill.push(i) }
    if (!kill.length) break
    for (const i of kill) rgba[i + 3] = 0
    total += kill.length
  }
  return total
}

/** 把素材置中貼到 N×N 透明畫布（錨點：水平中心、底邊） */
function padCenter(spr, N) {
  const out = Buffer.alloc(N * N * 4)
  const ox = Math.floor((N - spr.w) / 2), oy = Math.floor((N - spr.h) / 2)
  for (let y = 0; y < spr.h; y++) {
    const ty = y + oy
    if (ty < 0 || ty >= N) continue
    for (let x = 0; x < spr.w; x++) {
      const tx = x + ox
      if (tx < 0 || tx >= N) continue
      spr.rgba.copy(out, (ty * N + tx) * 4, (y * spr.w + x) * 4, (y * spr.w + x + 1) * 4)
    }
  }
  return { w: N, h: N, rgba: out }
}

/** 貼到指定大小的畫布（底邊、水平中心對齊；和開門鐘樓、住家三幀的做法一樣） */
function padBottomCenter(spr, W, H) {
  const out = Buffer.alloc(W * H * 4)
  const ox = Math.round((W - spr.w) / 2), oy = H - spr.h
  for (let y = 0; y < spr.h; y++)
    for (let x = 0; x < spr.w; x++) {
      const tx = x + ox, ty = y + oy
      if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue
      spr.rgba.copy(out, (ty * W + tx) * 4, (y * spr.w + x) * 4, (y * spr.w + x + 1) * 4)
    }
  return { w: W, h: H, rgba: out }
}

/** 把輪廓縮到長邊 maxDim 以內（區塊內不透明比例 >= 0.5 才算有），整塊填暗色：收藏冊的「獎勵剪影」預先烘好 */
function shrinkSilhouette(spr, maxDim) {
  const k = Math.max(spr.w, spr.h) / maxDim
  const w = Math.max(1, Math.round(spr.w / k)), h = Math.max(1, Math.round(spr.h / k))
  const out = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * k), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * k))
      const sy0 = Math.floor(y * k), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * k))
      let on = 0, n = 0
      for (let sy = sy0; sy < sy1 && sy < spr.h; sy++) for (let sx = sx0; sx < sx1 && sx < spr.w; sx++) { n++; if (spr.rgba[(sy * spr.w + sx) * 4 + 3]) on++ }
      if (n && on / n >= 0.5) { const o = (y * w + x) * 4; out[o] = SILHOUETTE_RGB[0]; out[o + 1] = SILHOUETTE_RGB[1]; out[o + 2] = SILHOUETTE_RGB[2]; out[o + 3] = 255 }
    }
  return { w, h, rgba: out }
}

/** 收藏品圖示（dog_a 29 張＋碎片 F＋cat_a 8 張），每張置中貼到 box×box。回傳 { icons: {名稱: spr}, p 資訊 } */
async function buildItemIcons(box) {
  const icons = {}
  const fringe = {}
  const dog = await sheet({ file: 'items_dig_a.png', cols: 6, rows: 5, names: DIG_A_NAMES.map((n) => n && 'item_' + n), fitMax: box })
  const shardDims = []
  for (const f of dog.frames) {
    fringe[f.name] = defringePink(f.spr, false, f.name === 'item_L001')
    icons[f.name] = padCenter(f.spr, box)
    if (/^item_U002_[1-5]$/.test(f.name)) shardDims.push(Math.max(f.spr.w, f.spr.h))
  }
  // 碎片 F：大小以 A～E 的平均長邊為準
  const avg = shardDims.reduce((a, b) => a + b, 0) / shardDims.length
  const f6 = await sheet({ file: 'items_dig_frag6.png', cols: 1, rows: 1, names: ['item_U002_6'], fitMax: Math.round(avg) })
  fringe.item_U002_6 = defringePink(f6.frames[0].spr)
  icons.item_U002_6 = padCenter(f6.frames[0].spr, box)
  const cat = await sheet({ file: 'items_cat_a.png', cols: 4, rows: 2, names: CAT_A_NAMES.map((n) => 'item_' + n), fitMax: box })
  for (const f of cat.frames) {
    fringe[f.name] = defringePink(f.spr)
    icons[f.name] = padCenter(f.spr, box)
  }
  return { fringe, icons, dogP: dog.p, catP: cat.p, f6P: f6.p, shardAvg: avg }
}

// ---- 比對鐘樓、住家（停點 A 的檢查用）----
const woodPx = (r, g, b) => r > g && g > b && r >= 70 && r <= 170 && g >= 40 && g <= 110 && b >= 15 && b <= 80 && r - b >= 40
function doorBox(s) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
  for (let y = Math.floor(s.h * 0.65); y < s.h; y++)
    for (let x = Math.floor(s.w * 0.3); x < Math.ceil(s.w * 0.7); x++) {
      const i = (y * s.w + x) * 4
      if (s.rgba[i + 3] && woodPx(s.rgba[i], s.rgba[i + 1], s.rgba[i + 2])) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}
function windowCenters(s) {
  const m = new Uint8Array(s.w * s.h)
  for (let i = 0; i < s.w * s.h; i++) { const r = s.rgba[i * 4], g = s.rgba[i * 4 + 1], b = s.rgba[i * 4 + 2]; m[i] = s.rgba[i * 4 + 3] && b > r + 8 && b > 90 && g > 70 ? 1 : 0 }
  return label(m, s.w, s.h).comps.filter((c) => c.area >= 8).map((c) => ({ x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2, a: c.area })).sort((p, q) => p.y - q.y || p.x - q.x)
}
function alphaXor(a, b) {
  let n = 0, tot = 0
  for (let i = 0; i < a.w * a.h; i++) { const pa = a.rgba[i * 4 + 3] > 0, pb = b.rgba[i * 4 + 3] > 0; if (pa) tot++; if (pa !== pb) n++ }
  return { xor: n, tot }
}

/** 把一組素材排成預覽圖（ASCII 標籤；縮放用最近鄰） */
async function composePreview(file, tiles, { cols, cellW, cellH, scale, bg }) {
  const rowsN = Math.ceil(tiles.length / cols)
  const W = cols * cellW, H = rowsN * cellH
  const comps = []
  // 每格可有自己的底色（bgColor）：先鋪底色，再放素材，最後放文字
  const rects = tiles.map((t, i) => (t.bgColor ? `<rect x="${(i % cols) * cellW}" y="${Math.floor(i / cols) * cellH}" width="${cellW}" height="${cellH}" fill="${t.bgColor}"/>` : '')).join('')
  if (rects) comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects}</svg>`), left: 0, top: 0 })
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * cellH
    if (t.spr) {
      const sc = t.scale ?? scale
      const buf = await sharp(t.spr.rgba, { raw: { width: t.spr.w, height: t.spr.h, channels: 4 } }).resize(t.spr.w * sc, t.spr.h * sc, { kernel: 'nearest' }).png().toBuffer()
      comps.push({ input: buf, left: cx + Math.max(2, Math.floor((cellW - t.spr.w * sc) / 2)), top: cy + 14 })
    }
    svg += `<text x="${cx + 3}" y="${cy + 11}" font-family="sans-serif" font-size="10" fill="${bg.r > 128 ? '#222' : '#ddd'}">${t.label ?? ''}</text>`
  }
  svg += '</svg>'
  comps.push({ input: Buffer.from(svg), left: 0, top: 0 })
  await sharp({ create: { width: W, height: H, channels: 3, background: bg } }).composite(comps).png().toFile(join(SHOTS, file))
  info(`預覽圖：screenshots/${file}（${W}×${H}）`)
}

async function main() {
  info(`來源：${SRC}`)

  // 1) 狗：core（4×2）+ extra（3×2）。每隻狗依站姿目標高度求自己的 p，core 與 extra 共用
  const animalP = {}
  for (const [id, file] of Object.entries(DOGS)) {
    const key = 'dog_' + id
    // 4.0-R：每隻狗用明確的 p（P_FIXED.animal；原本是「站姿目標高度」從 P_GUESS 求解），core 與 extra 共用
    const core = await sheet({ file, cols: 4, rows: 2, names: DOG_CORE, pFixed: P_FIXED.animal[key] })
    standCheck(key, core)
    animalP[key] = core.p
    for (const f of core.frames) addFrame(key, key + '_' + f.name, f.spr)
    const extra = await sheet({ file: 'dog_' + id + '_extra.png', cols: 3, rows: 2, names: DOG_EXTRA, pFixed: core.p })
    for (const f of extra.frames) addFrame(key, key + '_' + f.name, f.spr)
  }

  // 2) 貓
  const despills = {}
  for (const id of CATS) {
    const key = 'cat_' + id
    // 4.0-R：每隻貓用明確的 p（P_FIXED.animal；原本是「站姿目標高度」求解）；extra = core × CAT_EXTRA_RATIO（不變）
    const coreSheet = (file) => sheet({ file, cols: 4, rows: 2, names: CAT_CORE, pFixed: P_FIXED.animal[key] })
    // v3.8.1：core、extra 改用 _hd 圖（CAT_HD=0 回到舊圖，只供新舊比對用）；CAT_HD_REVERT 列出的幀退回舊圖
    const revert = CAT_HD_REVERT[id] ?? { core: [], extra: [] }
    const core = await coreSheet(key + (CAT_HD ? '_core_hd.png' : '_core.png'))
    standCheck(key, core)
    animalP[key] = core.p
    // 舊圖的 core：橘貓換圖（fix）要對齊的「舊」尺寸、以及退回舊圖的幀，都以舊圖為準（不因新圖的細微差異而改變）
    const coreOld = CAT_HD && (CAT_CORE_FIX[id] || revert.core.length) ? await coreSheet(key + '_core.png') : core
    // v3.6.3：橘貓的 sleep／eat／groom 三格換成新圖（cat_orange_core_fix.png，3 隻橫排）；其他格、core.p（extra 的取樣基準）不動
    const fix = CAT_CORE_FIX[id] ? await catCoreFix(id, coreOld) : null
    for (const f of core.frames) {
      const swap = fix?.frames.find((g) => g.name === f.name)
      const old = revert.core.includes(f.name) ? coreOld.frames.find((g) => g.name === f.name) : null
      // 橘貓 sleep／eat／groom（fix）與退回舊圖的幀不動；其餘 hd 幀去洋紅調單點
      if (CAT_HD && !swap && !old) despills[key + '_' + f.name] = despillMagenta(f.spr)
      addFrame(key, key + '_' + f.name, swap ? swap.spr : old ? old.spr : f.spr, f.name === 'unused_back' ? { unused: true } : {})
    }
    const extraSheet = (file) => sheet({ file, cols: 2, rows: 2, names: CAT_EXTRA, pFixed: core.p * CAT_EXTRA_RATIO })
    const extra = await extraSheet(key + (CAT_HD ? '_extra_hd.png' : '_extra.png'))
    const extraOld = CAT_HD && revert.extra.length ? await extraSheet(key + '_extra.png') : extra
    for (const f of extra.frames) {
      const back = revert.extra.includes(f.name)
      if (CAT_HD && !back) despills[key + '_' + f.name] = despillMagenta(f.spr)
      addFrame(key, key + '_' + f.name, back ? extraOld.frames.find((g) => g.name === f.name).spr : f.spr)
    }
  }
  if (CAT_HD) {
    const n = Object.entries(despills).filter(([, v]) => v)
    info('貓 hd 圖：去洋紅調單點 ' + n.reduce((t, [, v]) => t + v, 0) + ' 個（' + (n.map(([k, v]) => k + '×' + v).join('、') || '無') + '）；退回舊圖的幀：' + (Object.entries(CAT_HD_REVERT).map(([c, v]) => 'cat_' + c + ' core[' + v.core + '] extra[' + v.extra + ']').join('；') || '無'))
  }
  info('每隻動物的像素格 p（core 與 extra 共用；貓 extra 為 ×' + CAT_EXTRA_RATIO + '）：' + Object.entries(animalP).map(([k, v]) => k + '=' + v.toFixed(2)).join('、'))

  // 3) 領養預覽正面圖
  {
    const names = [...Object.keys(DOGS).map((d) => 'front_dog_' + d), ...CATS.map((c) => 'front_cat_' + c)]
    // 4.0-R：固定 6×2 切格（新原圖裡黃金獵犬＋邊牧、暹羅＋藍貓的像素連在一起，原本的分群只切得出 10 格）；明確的 p
    const { frames } = await sheet({ file: '大家的正面照.png', cols: 6, rows: 2, names, grid: 'even', pFixed: P_FIXED.front })
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
    // 4.0-R：樹用明確的像素格（原本用估算值）；鐘樓（關門）在下面跟開門版一起處理
    {
      const r = await sheet({ file: 'scene_tree.png', cols: 1, rows: 1, names: ['tree'], pFixed: P_FIXED.tree })
      for (const f of r.frames) addFrame('scene', f.name, f.spr)
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
      // 鐘樓關門版與開門版（4.0-R）：各自用明確的像素格（P_FIXED.tower，原本是「目標高度 160」求解）；
      // 兩張貼到同一張畫布，畫布取兩張裡最大的寬高（和住家三幀同一個做法；以前開門版貼進關門版大小的畫布，比較寬時右邊會被裁掉），底部中心對齊
      const rc = await sheet({ file: 'scene_clocktower.png', cols: 1, rows: 1, names: ['clocktower'], pFrames: { clocktower: P_FIXED.tower.clocktower } })
      const r = await sheet({ file: 'scene_clocktower_open.png', cols: 1, rows: 1, names: ['clocktower_open'], pFrames: { clocktower_open: P_FIXED.tower.clocktower_open } })
      const c0 = rc.frames[0].spr, f = r.frames[0]
      const W = Math.max(c0.w, f.spr.w), H = Math.max(c0.h, f.spr.h)
      const closed = padBottomCenter(c0, W, H)
      const spr = padBottomCenter(f.spr, W, H)
      clockClosedSpr = closed
      const face = detectClockFace(closed)
      if (!face) throw new Error('關門鐘樓偵測不到鐘面')
      towerClock = { cx: Math.round(face.cx), cy: Math.round(face.cy), r: Math.round(face.r) }
      addFrame('scene', 'clocktower', closed, { meta: { clock: sharedClock('clocktower', closed) } })
      addFrame('scene', 'clocktower_open', spr, { meta: { clock: sharedClock('clocktower_open', spr) } })
      const out = spr.rgba
      let a = 0, b = 0, both = 0
      for (let i = 0; i < W * H; i++) {
        const ca = closed.rgba[i * 4 + 3] > 0, cb = out[i * 4 + 3] > 0
        if (ca) a++
        if (cb) b++
        if (ca !== cb) both++
      }
      info('鐘樓：關門 ' + c0.w + '×' + c0.h + '、開門 ' + f.spr.w + '×' + f.spr.h + '，都貼到 ' + W + '×' + H + '；關門版不透明像素 ' + a + '，開門版 ' + b + '，輪廓差異（XOR）' + both + ' 像素 = ' + ((both / a) * 100).toFixed(1) + '%')
    }
    // v3.3.1：狗窩、貓跳台放大 1.15 倍，食盆水盆縮小到 0.7 倍（其餘不動）
    // 4.0-R：逐格明確的 p（已含 BUILDING_SCALES 係數，見 smallP；原本是整張估算值 ÷ 係數）
    const small = await sheet({ file: '小建築.png', cols: 3, rows: 2, names: ['doghouse', 'cat_tree', 'bowls', null, 'lamp', null], pFrames: Object.fromEntries(['doghouse', 'cat_tree', 'bowls', 'lamp'].map((n) => [n, smallP(n)])) })
    // 花圃（flowerbed）取消（v3.4.0 不使用）：原圖左下格不在這裡輸出（v3.9.0 的花槽在下面另外處理，id 是 planter）
    for (const f of small.frames) addFrame('scene', f.name, f.spr)
    // v3.9.0：左下格 = 花槽（planter）、右下格 = 珊瑚石堆（coral）。兩者都有粉紅色（珊瑚的粉紅枝、花槽的粉紅花），
    // 一般的洋紅判斷（isBg 第二條「玫瑰紅陰影」）與嚴格判斷（isBgStrict）都會把粉紅填色吃掉一部分，所以這兩格用 isBgNear（只認接近背景色的洋紅）去背；
    // 取樣格大小 p 沿用上面同一張圖算出的值（整張共用同一個比例），其他物件的圖完全不受影響。
    const small2 = await sheet({ file: '小建築.png', cols: 3, rows: 2, names: [null, null, null, 'planter', null, 'coral'], pFrames: { planter: smallP('planter'), coral: smallP('coral') }, nearBg: true })
    for (const f of small2.frames) {
      const t = trimMagentaFringe(f.spr)
      info('  ' + f.name + '：移除暗紫色洋紅邊 ' + t.n + ' 像素 → ' + t.spr.w + '×' + t.spr.h)
      addFrame('scene', f.name, t.spr, { nearBg: true })
    }
    // 營火（v3.4.0）於 v3.5.1 移除：不輸出 campfire_a、campfire_b、campfire_off；蹺蹺板、蝴蝶也不使用；沙坑（v3.6.0 開發期間做過又取消）沒有任何程式使用，不輸出
    const bn = await sheet({ file: 'buildings_new.png', cols: 4, rows: 2, names: ['bathtub', 'seesaw', 'sandbox', 'campfire_a', 'campfire_b', 'picnic', 'butterfly_open', 'butterfly_closed'], pFixed: P_FIXED.buildingsNew })
    for (const f of bn.frames) if (f.name !== 'seesaw' && f.name !== 'sandbox' && !f.name.startsWith('butterfly') && !f.name.startsWith('campfire')) addFrame('scene', f.name, f.spr)
    // 裝飾物各縮小到目標高度：蘑菇 36、樹樁 36、灌木 40、高草叢 38、石頭堆 34、小花叢 28
    // 4.0-R：逐格明確的 p（P_FIXED.decor；原本是上面的目標高度從估算值求解）
    const dc = await sheet({ file: 'decor.png', cols: 3, rows: 2, names: ['bush', 'rocks', 'flowers', 'tall_grass', 'mushroom', 'stump'], pFrames: P_FIXED.decor })
    for (const f of dc.frames) addFrame('scene', f.name, f.spr)
  }

  // 5) 天空物件、特效、玩具
  {
    const sky = await sheet({ file: 'scene_sky_objects.png', cols: 4, rows: 2, names: ['sun', 'moon', 'star', 'cloud_a', 'cloud_b', 'cloud_c', 'raindrop', 'snowflake'], pFixed: P_FIXED.sky, pFrames: { snowflake: P_FIXED.snowflake } })
    for (const f of sky.frames) addFrame('fx', f.name, f.spr)
    const fx = await sheet({ file: 'fx_icons.png', cols: 4, rows: 2, names: ['heart', 'zzz', 'note', 'sweat', 'exclaim', 'sparkle', 'bubble', 'question'].map((n) => 'fx_' + n), minArea: 150, pFrames: P_FIXED.fxIcons })
    for (const f of fx.frames) addFrame('fx', f.name, f.spr)
    // 水花、漣漪、水滴、泡泡：所有格共用同一個 p（以最高的水花高 30 反推）
    const wn = ['water_ripple_1', 'water_ripple_2', 'water_ripple_3', 'water_splash_1', 'water_splash_2', 'water_splash_3', ['water_drop_1', 'water_drop_2', 'water_drop_3'], ['water_bubble_s', 'water_bubble_l']]
    const fw = await sheet({ file: 'fx_water.png', cols: 4, rows: 2, names: wn, minArea: 150, pFixed: P_FIXED.fxWater })
    for (const f of fw.frames) {
      const center = !f.name.startsWith('water_splash')
      addFrame('fx', f.name, f.spr, center ? { ay: Math.round(f.spr.h / 2) } : {})
    }
    const td = await sheet({ file: 'toys_dog.png', cols: 4, rows: 2, names: ['ball', 'frisbee', 'rope', 'bone', 'shoe', 'chest_closed', 'chest_open', 'dirt_mound'].map((n) => 'toy_' + n), minArea: 120, pFixed: P_FIXED.toysDog })
    for (const f of td.frames) addFrame('toys', f.name, f.spr)
    // v3.5.0：場景裡的球（飛行、落地、叼著）用同一張原圖的球依目標高度重新取樣的小尺寸版（toy_ball_s），不改其他玩具；
    // 目標高度 BALL_S_H（預設見下方）。不是縮放：像素格 p 反推，一樣是整數像素。
    // 4.0-R：沒有用 BALL_S_H 環境變數比較時，用明確的 p（P_FIXED.toyBallS）
    const bs = await sheet({ file: 'toys_dog.png', cols: 4, rows: 2, names: ['ball', 'frisbee', 'rope', 'bone', 'shoe', 'chest_closed', 'chest_open', 'dirt_mound'].map((n) => 'toy_' + n), minArea: 120, pFixed: P_FIXED.toysDog, ...(process.env.BALL_S_H ? { targets: { toy_ball: BALL_S_H } } : { pFrames: { toy_ball: P_FIXED.toyBallS } }) })
    const ballS = bs.frames.find((f) => f.name === 'toy_ball')
    if (!ballS) throw new Error('找不到小球')
    addFrame('toys', 'toy_ball_s', ballS.spr)
    info('小球 toy_ball_s：' + ballS.spr.w + '×' + ballS.spr.h + '（目標高度 ' + BALL_S_H + '）')
    // v3.6.0：場景裡的土堆用同一張原圖的土堆依目標寬度重新取樣的小尺寸版（toy_dirt_mound_s，寬約 26）
    const ms = await sheet({ file: 'toys_dog.png', cols: 4, rows: 2, names: ['ball', 'frisbee', 'rope', 'bone', 'shoe', 'chest_closed', 'chest_open', 'dirt_mound'].map((n) => 'toy_' + n), minArea: 120, pFixed: P_FIXED.toysDog, pFrames: { toy_dirt_mound: P_FIXED.moundS } })
    const moundS = ms.frames.find((f) => f.name === 'toy_dirt_mound')
    if (!moundS) throw new Error('找不到土堆')
    addFrame('toys', 'toy_dirt_mound_s', moundS.spr)
    moundSpr = moundS.spr
    info('土堆 toy_dirt_mound_s：' + moundS.spr.w + '×' + moundS.spr.h + '（目標寬度 ' + MOUND_S_W + '）')
    const tc = await sheet({ file: 'toys_cat.png', cols: 3, rows: 3, names: ['toy_laser_dot', 'toy_wand', 'toy_yarn'], minArea: 120, pFixed: P_FIXED.toysCat })
    for (const f of tc.frames) addFrame('toys', f.name, f.spr)
  }

  // 6) 地形：草地方塊（2×2 鏡像無縫）、小路（只留泥土，左右鏡像）、遠景（左右鏡像）
  {
    const img = await load('scene_tiles.png')
    const mask = new Uint8Array(img.W * img.H).fill(1)
    const e = estimateP(img, mask)
    info(`scene_tiles.png: p=${e.p.toFixed(2)}`)
    const box = [0, 0, 508, 490] // 草地格；底邊 20 像素左右比較粗糙，裁掉
    // 4.0-R：草地用明確的 p（P_FIXED.grass；估算值只印在報告裡）
    const gp = P_FIXED.grass
    const phases = [estimatePhase(img, mask, box, gp, 0), estimatePhase(img, mask, box, gp, 1)]
    const t = depixelate(img, mask, null, null, box, gp, phases)
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
    info(`scene_path.png: 估算 p=${pe.p.toFixed(2)}，採用 p=${P_FIXED.path}`)
    const { lab: plab, comps: pcomps } = label(pm, pimg.W, pimg.H)
    const biggest = pcomps.reduce((a, c) => (c.area > a.area ? c : a))
    const keep = new Set(pcomps.filter((c) => c.area > 400).map((c) => c.id))
    const pbox = [0, biggest.y0 - 4, pimg.W - 2, biggest.y1 + 4]
    const pph = [estimatePhase(pimg, new Uint8Array(pimg.W * pimg.H).fill(1), pbox, P_FIXED.path, 0), estimatePhase(pimg, new Uint8Array(pimg.W * pimg.H).fill(1), pbox, P_FIXED.path, 1)]
    const pr = depixelate(pimg, pm, plab, keep, pbox, P_FIXED.path, pph)
    const path = cleanSprite(pr)
    const pathLoop = hcat(path, flipX(path))
    addFrame('terrain', 'path', pathLoop, { ax: 0, ay: pathLoop.h })
    info(`小路 ${pathLoop.w}×${pathLoop.h}（左右鏡像，可水平重複）`)

    const far = await sheet({ file: 'scene_far.png', cols: 1, rows: 1, names: ['far'], minArea: 5000, pFixed: P_FIXED.far })
    for (const f of far.frames) {
      const loop = hcat(f.spr, flipX(f.spr))
      addFrame('terrain', 'far', loop, { ax: 0, ay: loop.h })
      info(`遠景 ${loop.w}×${loop.h}（左右鏡像，可水平重複）`)
    }
  }

  // 7) v3.6.0：收藏品圖示、錢幣、完整紙張（圖集 items，必載）；金色住家與黃金鐘樓（圖集 skins，解鎖才載）
  {
    const built = await buildItemIcons(ITEM_BOX)
    for (const [k, s] of Object.entries(built.icons)) addFrame('items', k, s, { ax: ITEM_BOX / 2, ay: ITEM_BOX })
    info('收藏品圖示去粉紅殘邊（有移除才列出）：' + (Object.entries(built.fringe).filter(([, n]) => n > 0).map(([k, n]) => k + '=' + n).join('、') || '無'))
    info(`收藏品圖示：畫布 ${ITEM_BOX}×${ITEM_BOX}，共 ${Object.keys(built.icons).length} 張；狗圖 p=${built.dogP.toFixed(2)}、貓圖 p=${built.catP.toFixed(2)}、碎片 F p=${built.f6P.toFixed(2)}；碎片 A～E 平均長邊 ${built.shardAvg.toFixed(1)}`)

    const db = await sheet({
      file: 'items_dig_b.png', cols: 3, rows: 2, names: ['coin_bronze', 'coin_silver', 'coin_gold', 'fx_reveal', null, null],
      // 4.0-R：逐格明確的 p（P_FIXED.digB；原本是 COIN_H／REVEAL_H 目標高度從估算值求解）
      pFrames: P_FIXED.digB,
    })
    for (const f of db.frames) addFrame('items', f.name, f.spr)
    // 4.0-R：明確的 p（原本是 fitMax PAPER_MAX 求解，新原圖求出來會差 1 像素）
    const papers = await sheet({ file: 'items_complete.png', cols: 2, rows: 1, names: ['paper_dog', 'paper_cat'], pFixed: P_FIXED.papers })
    for (const f of papers.frames) { const n = defringePink(f.spr, true); info(f.name + '：移除偏粉紅殘邊 ' + n + ' 個像素'); addFrame('items', f.name, f.spr) }

    // 金色住家：和原住家用同一個 p 規則、貼到同樣大小的畫布
    const hc = atlases.scene.find((f) => f.key === 'house_closed')
    const hg = await sheet({ file: 'house_gold.png', cols: 3, rows: 1, names: ['house_gold_closed', 'house_gold_open', 'house_gold_night'], targets: { house_gold_closed: 134 }, solveFrom: 'house_gold_closed' })
    const goldHouse = {}
    for (const f of hg.frames) {
      goldHouse[f.name] = padBottomCenter(f.spr, hc.w, hc.h)
      addFrame('skins', f.name, goldHouse[f.name])
    }
    // 黃金鐘樓：關門、開門都用高度 160，貼到 123×160（和現有開門鐘樓同一做法）
    const tcl = atlases.scene.find((f) => f.key === 'clocktower')
    const top = atlases.scene.find((f) => f.key === 'clocktower_open')
    // 4.0-R：明確的像素格（原本是「目標高度 160」求解）；畫布 = 原版鐘樓的大小，金色版比較大時不裁切（畫布放大並警告，原版與金色版會不同大小）
    const tg1 = await sheet({ file: 'scene_clocktower_gold.png', cols: 1, rows: 1, names: ['clocktower_gold'], pFrames: { clocktower_gold: P_FIXED.tower.clocktower_gold } })
    const tg2 = await sheet({ file: 'scene_clocktower_open_gold.png', cols: 1, rows: 1, names: ['clocktower_open_gold'], pFrames: { clocktower_open_gold: P_FIXED.tower.clocktower_open_gold } })
    const gW = Math.max(tcl.w, tg1.frames[0].spr.w, tg2.frames[0].spr.w), gH = Math.max(tcl.h, tg1.frames[0].spr.h, tg2.frames[0].spr.h)
    if (gW !== tcl.w || gH !== tcl.h) warn(`黃金鐘樓比原版鐘樓大（${tg1.frames[0].spr.w}×${tg1.frames[0].spr.h}、${tg2.frames[0].spr.w}×${tg2.frames[0].spr.h}，原版 ${tcl.w}×${tcl.h}）：畫布放大到 ${gW}×${gH}`)
    const gClosed = padBottomCenter(tg1.frames[0].spr, gW, gH)
    const gOpen = padBottomCenter(tg2.frames[0].spr, gW, gH)
    const clockOf = (s) => detectClockFace(s)
    addFrame('skins', 'clocktower_gold', gClosed, { meta: { clock: sharedClock('clocktower_gold', gClosed) } })
    addFrame('skins', 'clocktower_open_gold', gOpen, { meta: { clock: sharedClock('clocktower_open_gold', gOpen) } })
    // 收藏冊的「獎勵剪影」預先烘好放進 items（skins 沒載入時收藏冊也能顯示）
    addFrame('items', 'sil_house_gold', padCenter(shrinkSilhouette(goldHouse.house_gold_closed, ITEM_BOX), ITEM_BOX), { ax: ITEM_BOX / 2, ay: ITEM_BOX })
    addFrame('items', 'sil_tower_gold', padCenter(shrinkSilhouette(gClosed, ITEM_BOX), ITEM_BOX), { ax: ITEM_BOX / 2, ay: ITEM_BOX })

    // ---- 檢查：金色版與原版的鐘面、門、窗、輪廓 ----
    info('')
    info('===== v3.6.0 金色外觀對位檢查 =====')
    for (const [name, orig, gold] of [['關門鐘樓', tcl, gClosed], ['開門鐘樓', top, gOpen]]) {
      const co = clockOf(orig), cg = clockOf(gold)
      const dx = cg.cx - co.cx, dy = cg.cy - co.cy, dr = cg.r - co.r
      const line = `${name}：鐘面 原 (${co.cx},${co.cy}) r=${co.r} → 金 (${cg.cx},${cg.cy}) r=${cg.r}；差 dx=${dx} dy=${dy} dr=${dr}`
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2 || Math.abs(dr) > 2) warn(line + '（超過 2px）')
      else info(line)
      const db1 = doorBox(orig), db2 = doorBox(gold)
      info(`${name}：門（木色像素外框，相對素材）原 ${JSON.stringify(db1)} → 金 ${JSON.stringify(db2)}`)
      const w1 = windowCenters(orig), w2 = windowCenters(gold)
      info(`${name}：窗（藍灰玻璃塊）原 ${w1.length} 個、金 ${w2.length} 個`)
      let worst = 0
      for (const a of w1) { const d = Math.min(...w2.map((b) => Math.hypot(a.x - b.x, a.y - b.y))); if (d > worst) worst = d }
      info(`${name}：每個原版窗到金版最近窗的距離，最大 ${worst.toFixed(1)} px`)
      const x = alphaXor(orig, gold)
      info(`${name}：輪廓差異（XOR）${x.xor} 像素 = ${((x.xor / x.tot) * 100).toFixed(1)}%（原版不透明 ${x.tot}）`)
    }
    for (const [n, o, g] of [['住家 關門', 'house_closed', 'house_gold_closed'], ['住家 開門', 'house_open', 'house_gold_open'], ['住家 夜晚', 'house_night', 'house_gold_night']]) {
      const x = alphaXor(atlases.scene.find((f) => f.key === o), goldHouse[g])
      info(`${n}：金色版 ${goldHouse[g].w}×${goldHouse[g].h}，與原版輪廓差異 ${x.xor} 像素 = ${((x.xor / x.tot) * 100).toFixed(1)}%`)
    }

    // ---- 預覽圖 ----
    const bgPrev = { r: 100, g: 118, b: 104 }
    const small = built.icons
    const alt = ITEM_BOX === 32 ? await buildItemIcons(48) : await buildItemIcons(32)
    const i32 = ITEM_BOX === 32 ? small : alt.icons
    const i48 = ITEM_BOX === 48 ? small : alt.icons
    const tiles = []
    for (const k of Object.keys(i32)) {
      tiles.push({ spr: i32[k], label: k.replace('item_', '') + ' 32', scale: 3 })
      tiles.push({ spr: i48[k], label: k.replace('item_', '') + ' 48', scale: 3 })
    }
    await composePreview('v360-items-32-vs-48.png', tiles, { cols: 6, cellW: 152, cellH: 48 * 3 + 20, scale: 3, bg: bgPrev })
    const other = [...db.frames, ...papers.frames].map((f) => ({ spr: f.spr, label: f.name + ` ${f.spr.w}x${f.spr.h}`, scale: f.name.startsWith('paper') ? 2 : 4 }))
    other.push({ spr: moundSpr, label: `mound_s ${moundSpr.w}x${moundSpr.h}`, scale: 4 })
    other.push({ spr: atlases.toys.find((f) => f.key === 'toy_dirt_mound'), label: 'toy_dirt_mound (old)', scale: 2 })
    other.push({ spr: atlases.items.find((f) => f.key === 'sil_house_gold'), label: 'sil_house_gold', scale: 4 })
    other.push({ spr: atlases.items.find((f) => f.key === 'sil_tower_gold'), label: 'sil_tower_gold', scale: 4 })
    await composePreview('v360-coins-reveal-mound-silhouettes.png', other, { cols: 5, cellW: 210, cellH: 210, scale: 3, bg: bgPrev })

    // 去粉紅殘邊處理後的檢查圖：容易有粉紅光暈的 6 個圖示，放在草地綠底上（48 版，×4）
    {
      const keys = ['item_L001', 'item_R004', 'item_U001', 'item_C010', 'item_C008', 'item_R003']
      const src = ITEM_BOX === 48 ? small : alt.icons
      await composePreview('v360-defringe-check.png', keys.map((k) => ({ spr: src[k], label: k.replace('item_', '') + ' 48', scale: 4, bgColor: '#5a8f3c' })), { cols: 6, cellW: 48 * 4 + 8, cellH: 48 * 4 + 20, scale: 4, bg: { r: 90, g: 143, b: 60 } })
    }
    // 完整紙張：深色、淺色、洋紅三種底；右邊把「偏粉色」的像素標成綠色，看膠帶有沒有被吃掉或留下殘邊
    const pinkMark = (s) => {
      const out = Buffer.from(s.rgba)
      let n = 0
      for (let i = 0; i < s.w * s.h; i++) {
        const r = s.rgba[i * 4], g = s.rgba[i * 4 + 1], b = s.rgba[i * 4 + 2]
        if (s.rgba[i * 4 + 3] && r > 180 && b > 150 && g < Math.min(r, b) - 12) { out[i * 4] = 0; out[i * 4 + 1] = 255; out[i * 4 + 2] = 0; n++ }
      }
      return { spr: { w: s.w, h: s.h, rgba: out }, n }
    }
    const ptiles = []
    for (const f of papers.frames) {
      const pm = pinkMark(f.spr)
      info(`${f.name}：${f.spr.w}×${f.spr.h}，偏粉色像素 ${pm.n} 個（膠帶或殘邊，標成綠色看位置）`)
      ptiles.push({ spr: f.spr, label: f.name + ' dark', scale: 4, bgColor: '#22242f' }, { spr: f.spr, label: f.name + ' light', scale: 4, bgColor: '#ececE6' }, { spr: f.spr, label: f.name + ' magenta', scale: 4, bgColor: '#ff00ff' }, { spr: pm.spr, label: f.name + ' pink=green', scale: 4, bgColor: '#22242f' })
    }
    await composePreview('v360-items-complete.png', ptiles, { cols: 4, cellW: PAPER_MAX * 4 + 8, cellH: PAPER_MAX * 4 + 20, scale: 4, bg: bgPrev })

    // 碎片 F 與 A～E 並排
    const shards = [1, 2, 3, 4, 5, 6].map((n) => {
      const s = small['item_U002_' + n]
      return { spr: s, label: `U002_${n}`, scale: 6 }
    })
    await composePreview('v360-shard-F-vs-A-E.png', shards, { cols: 6, cellW: ITEM_BOX * 6 + 8, cellH: ITEM_BOX * 6 + 20, scale: 6, bg: bgPrev })

    // 黃金鐘樓與現有鐘樓：原版、金色版、疊圖（紅 = 只有原版有；藍 = 只有金色版有；灰 = 兩者都有）
    const overlay = (a, b) => {
      const out = Buffer.alloc(a.w * a.h * 4)
      for (let i = 0; i < a.w * a.h; i++) {
        const pa = a.rgba[i * 4 + 3] > 0, pb = b.rgba[i * 4 + 3] > 0
        const c = pa && pb ? [150, 150, 150] : pa ? [230, 40, 40] : pb ? [40, 80, 240] : null
        if (c) { out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255 }
      }
      return { w: a.w, h: a.h, rgba: out }
    }
    const ring = (s, c) => {
      // 在偵測到的鐘面中心畫十字，確認兩張的鐘面位置
      const out = Buffer.from(s.rgba)
      const m = c ? [Math.round(c.cx), Math.round(c.cy)] : null
      if (m) for (let d = -3; d <= 3; d++) for (const [x, y] of [[m[0] + d, m[1]], [m[0], m[1] + d]]) { const o = (y * s.w + x) * 4; out[o] = 255; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 255 }
      return { w: s.w, h: s.h, rgba: out }
    }
    await composePreview('v360-tower-gold-vs-orig.png', [
      { spr: ring(tcl, clockOf(tcl)), label: 'clocktower (orig)', scale: 4 },
      { spr: ring(gClosed, clockOf(gClosed)), label: 'clocktower_gold', scale: 4 },
      { spr: overlay(tcl, gClosed), label: 'overlay red=orig only blue=gold only', scale: 4 },
      { spr: ring(top, clockOf(top)), label: 'clocktower_open (orig)', scale: 4 },
      { spr: ring(gOpen, clockOf(gOpen)), label: 'clocktower_open_gold', scale: 4 },
      { spr: overlay(top, gOpen), label: 'overlay', scale: 4 },
    ], { cols: 3, cellW: 123 * 4 + 8, cellH: 160 * 4 + 20, scale: 4, bg: bgPrev })
    await composePreview('v360-house-gold-vs-orig.png', [
      { spr: atlases.scene.find((f) => f.key === 'house_closed'), label: 'house_closed (orig)', scale: 3 },
      { spr: goldHouse.house_gold_closed, label: 'house_gold_closed', scale: 3 },
      { spr: atlases.scene.find((f) => f.key === 'house_open'), label: 'house_open (orig)', scale: 3 },
      { spr: goldHouse.house_gold_open, label: 'house_gold_open', scale: 3 },
      { spr: atlases.scene.find((f) => f.key === 'house_night'), label: 'house_night (orig)', scale: 3 },
      { spr: goldHouse.house_gold_night, label: 'house_gold_night', scale: 3 },
    ], { cols: 2, cellW: 139 * 3 + 8, cellH: 134 * 3 + 20, scale: 3, bg: bgPrev })
  }

  // 8) v3.7.0：工具包（圖集 tools，必載）。另外處理，不動上面任何一張素材（items_dig_b 的錢幣、提示星星照舊）
  {
    // 工具圖示 3 個（左→右：計算機、碼表、公佈欄）：整張共用 p、最大那張長邊 = TOOL_ICON，再置中貼到 TOOL_ICON×TOOL_ICON
    const ti = await sheet({ file: 'tools_icons.png', cols: 3, rows: 1, names: ['tool_calc', 'tool_timer', 'tool_board'], fitMax: TOOL_ICON })
    for (const f of ti.frames) {
      const n = defringePink(f.spr)
      addFrame('tools', f.name, padCenter(f.spr, TOOL_ICON), { ax: TOOL_ICON / 2, ay: TOOL_ICON })
      info(`${f.name}：內容 ${f.spr.w}×${f.spr.h}，畫布 ${TOOL_ICON}×${TOOL_ICON}（p=${ti.p.toFixed(2)}，去粉紅殘邊 ${n}）`)
    }
    // 便條紙 4 色（2×2：黃、粉紅 / 藍、綠）：顏色選擇鈕用的小圖，整張共用 p、置中貼到 NOTE_ICON×NOTE_ICON；同時取樣紙面顏色（介面的 CSS 色塊用）
    const sn = await sheet({ file: 'sticky_notes.png', cols: 2, rows: 2, names: ['note_yellow', 'note_pink', 'note_blue', 'note_green'], fitMax: NOTE_ICON })
    for (const f of sn.frames) {
      addFrame('tools', f.name, padCenter(f.spr, NOTE_ICON), { ax: NOTE_ICON / 2, ay: NOTE_ICON })
      info(`${f.name}：內容 ${f.spr.w}×${f.spr.h}，紙面中央顏色 ${paperColor(f.spr)}`)
    }
    // 公佈欄（items_dig_b 第 5 格：深綠黑板、木框、粉筆槽、三張空白便條）：依目標寬度 BOARD_W 反推 p（整數像素，不是事後縮放）。
    // 第 6 格（農場告示牌）這版不用。黑板的綠色範圍寫進 meta.board（場景上疊標題縮圖用）
    const bd = await sheet({ file: 'items_dig_b.png', cols: 3, rows: 2, names: [null, null, null, null, 'board', null], pFrames: { board: P_FIXED.board } })
    const board = bd.frames.find((f) => f.name === 'board')
    if (!board) throw new Error('找不到公佈欄')
    const green = boardGreen(board.spr)
    addFrame('tools', 'board', board.spr, { meta: { board: green } })
    info(`公佈欄 board：${board.spr.w}×${board.spr.h}（目標寬度 ${BOARD_W}，p=${board.p.toFixed(2)}），黑板綠色範圍 ${JSON.stringify(green)}`)
    const bgPrev = { r: 100, g: 118, b: 104 }
    await composePreview('v370-tools.png', [
      ...ti.frames.map((f) => ({ spr: padCenter(f.spr, TOOL_ICON), label: f.name, scale: 4 })),
      ...sn.frames.map((f) => ({ spr: padCenter(f.spr, NOTE_ICON), label: f.name, scale: 4 })),
      { spr: board.spr, label: `board ${board.spr.w}x${board.spr.h}`, scale: 4 },
    ], { cols: 4, cellW: 300, cellH: 260, scale: 4, bg: bgPrev })
  }

  // 9) v3.8.0：個性圖示（圖集 ui）、野餐（圖集 picnic，必載）、拍立得相框（圖集 polaroid，拍照時才載入）。
  //    只讀下面列的英文檔名；polaroid_frames_a/c、picnic_decor、stickers_* 不處理、不輸出。
  //    各張原圖的像素顆粒大小不同：每張「整張共用一個 p」（同一張裡的格子大小關係不變），p 由該張的目標尺寸反推（不是事後縮放，仍是 1 格 = 1 像素）
  {
    const bgPrev = { r: 110, g: 160, b: 90 }
    const tiles = []
    const pi = await sheet({ file: 'personality_icons.png', cols: 3, rows: 2, names: PERSONALITY_ICON_NAMES, fitMax: PERSONALITY_ICON })
    for (const f of pi.frames) {
      const n = defringePink(f.spr)
      addFrame('ui', f.name, padCenter(f.spr, PERSONALITY_ICON), { ax: PERSONALITY_ICON / 2, ay: PERSONALITY_ICON })
      info(`${f.name}：內容 ${f.spr.w}×${f.spr.h}，畫布 ${PERSONALITY_ICON}×${PERSONALITY_ICON}（p=${pi.p.toFixed(2)}，去粉紅殘邊 ${n}）`)
      tiles.push({ spr: padCenter(f.spr, PERSONALITY_ICON), label: f.name, scale: 4 })
    }
    // 野餐墊 3 款（紅格、藍格、粉色）：整張共用 p，紅格的寬度 = PICNIC_MAT_W
    const mats = await sheet({ file: 'picnic_mats.png', cols: 3, rows: 1, names: ['picnic_mat_red', 'picnic_mat_blue', 'picnic_mat_pink'], ...(process.env.PICNIC_MAT_W ? { targets: { picnic_mat_red: PICNIC_MAT_W }, solveFrom: 'picnic_mat_red', solveDim: 'w' } : { pFixed: P_FIXED.mats }), strictBg: true })
    for (const f of mats.frames) {
      const spr = padBottomCenter(f.spr, PICNIC_MAT_W, Math.max(...mats.frames.map((g) => g.spr.h)))
      addFrame('picnic', f.name, spr, { meta: { mat: matShape(spr) }, strictBg: true })
      info(`${f.name}：內容 ${f.spr.w}×${f.spr.h} → 畫布 ${spr.w}×${spr.h}（p=${mats.p.toFixed(2)}），墊面 ${JSON.stringify(matShape(spr))}`)
      tiles.push({ spr, label: f.name, scale: 3 })
    }
    // 野餐籃 2 格（闔上、打開）：共用 p，闔上的高度 = PICNIC_BASKET_H
    const bk = await sheet({ file: 'picnic_basket.png', cols: 2, rows: 1, names: ['picnic_basket_closed', 'picnic_basket_open'], targets: { picnic_basket_closed: PICNIC_BASKET_H }, solveFrom: 'picnic_basket_closed' })
    for (const f of bk.frames) {
      addFrame('picnic', f.name, f.spr)
      info(`${f.name}：${f.spr.w}×${f.spr.h}（p=${bk.p.toFixed(2)}）`)
      tiles.push({ spr: f.spr, label: f.name, scale: 4 })
    }
    // 食物 4 種（2×2：三明治、水果盤 / 草莓蛋糕、柳橙汁）：共用 p，最大那張長邊 = PICNIC_FOOD
    const fd = await sheet({ file: 'picnic_food.png', cols: 2, rows: 2, names: ['picnic_food_sandwich', 'picnic_food_fruit', 'picnic_food_cake', 'picnic_food_juice'], ...(process.env.PICNIC_FOOD ? { fitMax: PICNIC_FOOD } : { pFixed: P_FIXED.food }) })
    for (const f of fd.frames) {
      addFrame('picnic', f.name, f.spr)
      info(`${f.name}：${f.spr.w}×${f.spr.h}（p=${fd.p.toFixed(2)}）`)
      tiles.push({ spr: f.spr, label: f.name, scale: 4 })
    }
    // 寵物點心 2 格（狗餅乾、貓小魚乾）：本版只打包，場景沒有使用
    const sk = await sheet({ file: 'picnic_pet_snacks.png', cols: 2, rows: 1, names: ['picnic_snack_dog', 'picnic_snack_cat'], fitMax: PICNIC_SNACK })
    for (const f of sk.frames) {
      addFrame('picnic', f.name, f.spr)
      info(`${f.name}：${f.spr.w}×${f.spr.h}（p=${sk.p.toFixed(2)}）`)
      tiles.push({ spr: f.spr, label: f.name, scale: 4 })
    }
    // 相機圖示（相機提示按鈕）
    const cam = await sheet({ file: 'picnic_camera.png', cols: 1, rows: 1, names: ['picnic_camera'], pFixed: P_FIXED.camera })
    for (const f of cam.frames) {
      addFrame('picnic', f.name, f.spr)
      info(`${f.name}：${f.spr.w}×${f.spr.h}（p=${cam.p.toFixed(2)}）`)
      tiles.push({ spr: f.spr, label: f.name, scale: 4 })
    }
    // 拍立得相框 3 款（polaroid_frames_b：愛心＋腳印、花朵＋野餐籃、星星＋貓咪）：共用 p，最大那張長邊 = POLAROID_MAX。
    // 中間的洋紅窗口去背後是透明的：用程式找「被相框圍住、碰不到外框的透明區塊」，外框寫進 meta.window（照片放在這個矩形裡，相框疊在上面）
    const pf = await sheet({ file: 'polaroid_frames_b.png', cols: 3, rows: 1, names: ['polaroid_hearts', 'polaroid_flowers', 'polaroid_stars'], ...(process.env.POLAROID_MAX ? { fitMax: POLAROID_MAX } : { pFixed: P_FIXED.polaroid }) })
    for (const f of pf.frames) {
      // 不做 defringePink：愛心款的愛心本身是粉紅色、又貼著外緣，會被當成殘邊削掉（實測 149 格）
      const n = 0
      const win = detectWindow(f.spr)
      if (!win) throw new Error(f.name + ' 找不到相框窗口')
      addFrame('polaroid', f.name, f.spr, { meta: { window: win } })
      info(`${f.name}：${f.spr.w}×${f.spr.h}（p=${pf.p.toFixed(2)}），窗口 ${JSON.stringify(win)}（${win.x1 - win.x0}×${win.y1 - win.y0}）`)
      tiles.push({ spr: f.spr, label: f.name, scale: 2 })
    }
    await composePreview('v380-assets.png', tiles, { cols: 5, cellW: 300, cellH: 300, scale: 3, bg: bgPrev })
  }

  await writeOutputs()
}

/** v3.8.0：個性圖示（順序 = 原圖左到右、上到下：活潑、貪吃、懶散 / 黏人、膽小；第 6 格是空的） */
const PERSONALITY_ICON_NAMES = ['pers_lively', 'pers_greedy', 'pers_lazy', 'pers_clingy', 'pers_timid', null]
const PERSONALITY_ICON = Number(process.env.PERSONALITY_ICON ?? 20)
/** 野餐墊寬度、籃子高度、食物長邊、點心長邊、相機長邊、相框長邊（邏輯像素；layout／picnic.ts 的常數要一致，測試會比對） */
const PICNIC_MAT_W = Number(process.env.PICNIC_MAT_W ?? 104)
const PICNIC_BASKET_H = Number(process.env.PICNIC_BASKET_H ?? 22)
const PICNIC_FOOD = Number(process.env.PICNIC_FOOD ?? 16)
const PICNIC_SNACK = 16
const PICNIC_CAMERA = 20
const POLAROID_MAX = Number(process.env.POLAROID_MAX ?? 80)

/**
 * 野餐墊的墊面形狀（平行四邊形，素材座標）：每一列不透明像素的左右緣。回傳 { top, bottom, rows: [[y, x0, x1], …] } 中只取幾個代表值：
 * top / bottom = 不透明的第一列與最後一列；left / right = 每列左緣與右緣的最小、最大值；寫進 meta.mat（站位用，避免手寫座標）
 */
function matShape(s) {
  const rows = []
  for (let y = 0; y < s.h; y++) {
    let x0 = -1, x1 = -1
    for (let x = 0; x < s.w; x++) if (s.rgba[(y * s.w + x) * 4 + 3]) { if (x0 < 0) x0 = x; x1 = x + 1 }
    if (x0 >= 0) rows.push([y, x0, x1])
  }
  // 每 4 列取一筆，夠用來判斷一個點在不在墊面上
  return { top: rows[0][0], bottom: rows[rows.length - 1][0] + 1, rows: rows.filter((r, i) => i % 4 === 0 || i === rows.length - 1) }
}

/** 相框窗口：碰不到素材外緣的透明連通塊中最大的那一個，回傳它的外框 { x0, y0, x1, y1 }（x1、y1 不含） */
function detectWindow(s) {
  const { w, h, rgba } = s
  const seen = new Uint8Array(w * h)
  let best = null
  for (let i0 = 0; i0 < w * h; i0++) {
    if (seen[i0] || rgba[i0 * 4 + 3]) continue
    const stack = [i0]
    seen[i0] = 1
    let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0, edge = false
    while (stack.length) {
      const p = stack.pop()
      const x = p % w, y = (p / w) | 0
      area++
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1])
        if (q >= 0 && !seen[q] && !rgba[q * 4 + 3]) { seen[q] = 1; stack.push(q) }
    }
    if (!edge && (!best || area > best.area)) best = { x0, y0, x1: x1 + 1, y1: y1 + 1, area }
  }
  if (!best) return null
  // 窗口內必須全部透明（是矩形）：外框裡有不透明像素就回報
  let solid = 0
  for (let y = best.y0; y < best.y1; y++) for (let x = best.x0; x < best.x1; x++) if (rgba[(y * w + x) * 4 + 3]) solid++
  // 窗口邊緣是手繪的、有幾格不齊：外框裡的不透明像素是相框本身（照片畫在下面、相框疊在上面，所以不影響）
  if (solid) info(`相框窗口外框內有 ${solid} 個相框像素（窗口邊緣不齊；照片在下、相框在上，不影響）`)
  return { x0: best.x0, y0: best.y0, x1: best.x1, y1: best.y1 }
}

/** v3.7.0 工具圖示的畫布邊長、便條紙小圖邊長、場景公佈欄的寬度（邏輯像素；layout.ts 的 BOARD_W/H 要一致，測試會比對） */
const TOOL_ICON = 48
const NOTE_ICON = 32
const BOARD_W = 64

/** 便條紙中央 5×5 的平均顏色（#rrggbb） */
function paperColor(s) {
  let r = 0, g = 0, b = 0, n = 0
  const cx = Math.floor(s.w / 2), cy = Math.floor(s.h / 2)
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) { const i = (y * s.w + x) * 4; if (!s.rgba[i + 3]) continue; r += s.rgba[i]; g += s.rgba[i + 1]; b += s.rgba[i + 2]; n++ }
  const h = (v) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}

/** 公佈欄黑板的綠色範圍（深綠：G 明顯高於 R、B，且偏暗）：取「每列綠色像素至少 40%」的列與欄的外框 */
function boardGreen(s) {
  const isG = (i) => s.rgba[i + 3] && s.rgba[i + 1] > s.rgba[i] + 12 && s.rgba[i + 1] > s.rgba[i + 2] + 4 && s.rgba[i + 1] < 120
  const rows = [], cols = []
  for (let y = 0; y < s.h; y++) { let c = 0; for (let x = 0; x < s.w; x++) if (isG((y * s.w + x) * 4)) c++; rows.push(c) }
  for (let x = 0; x < s.w; x++) { let c = 0; for (let y = 0; y < s.h; y++) if (isG((y * s.w + x) * 4)) c++; cols.push(c) }
  const ys = rows.map((c, y) => (c >= s.w * 0.4 ? y : -1)).filter((y) => y >= 0)
  const xs = cols.map((c, x) => (c >= s.h * 0.3 ? x : -1)).filter((x) => x >= 0)
  if (!ys.length || !xs.length) return null
  return { x0: xs[0], y0: ys[0], x1: xs[xs.length - 1] + 1, y1: ys[ys.length - 1] + 1 }
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
      const bgFn = f.nearBg ? isBgNear : f.strictBg ? isBgStrict : isBg
      for (let i = 0; i < f.w * f.h; i++) if (f.rgba[i * 4 + 3] && bgFn(f.rgba[i * 4], f.rgba[i * 4 + 1], f.rgba[i * 4 + 2])) magenta++
      if (magenta) warn(`${f.key} 殘留洋紅像素 ${magenta} 個`)
      // v3.8.0 新素材：逐張列出洋紅殘留（嚴格判斷＝純洋紅；一般判斷＝含玫瑰紅陰影，粉色墊的滾邊本來就是粉紅色，所以墊子只看嚴格判斷）
      if (/^(pers_|picnic_|polaroid_)/.test(f.key)) {
        let strict = 0
        for (let i = 0; i < f.w * f.h; i++) if (f.rgba[i * 4 + 3] && isBgStrict(f.rgba[i * 4], f.rgba[i * 4 + 1], f.rgba[i * 4 + 2])) strict++
        info(`洋紅殘留檢查 ${f.key}（${f.w}×${f.h}）：嚴格 ${strict}、${f.strictBg ? '（此圖用嚴格判斷去背）' : '一般 ' + magenta}`)
      }
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

// 4.0-R：直接執行才跑管線；被 import（tests-archive/v400r/tune-p.mjs 調參工具）時只提供下面這些函式，不寫任何輸出
export { sheet, load, isBg, isBgNear, isBgStrict, trimMagentaFringe, estimateP, estimatePhase, fgMask, label, depixelate, cleanSprite, BUILDING_SCALES }
if (IS_MAIN) await main()
