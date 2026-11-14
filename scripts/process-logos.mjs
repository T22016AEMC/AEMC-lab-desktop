/**
 * 官方程式 logo 處理（v3.6.3 重做）：把 7 張「純洋紅 #FF00FF 背景、只有 logo 圖形」的原圖，
 * 處理成「透明 logo 疊在各自底色圓角方塊上」的 144×144 PNG。
 *
 * 用法：  node scripts/process-logos.mjs <原圖資料夾>
 *   原圖資料夾裡要有 <程式名>.png（FilMaster、SpecReader、CheMScutter、EluSim、AutoEllipso、MoleForm、Adsorvia，各 1024×1024、洋紅底），
 *   不寫死路徑，也可以用環境變數 LOGO_SRC 指定。原圖不進 repo。不要使用同資料夾的 *_source.png 與 zip。
 * 輸出：  public/icons/official-<程式名小寫>.png（144×144，要和 src/config/apps.ts 的 OFFICIAL_APPS 的 icon 一致）
 *         screenshots/adsorvia-b-144.png（Adsorvia 只留上半分子圖的預覽版，不放進 public/）
 *
 * 處理步驟（每張）：
 *  1. 洋紅去背：把「洋紅與 logo 顏色的混色」還原成「logo 本色＋透明度」：
 *     (a) 近乎純洋紅的像素 → 透明；
 *     (b) 離洋紅背景 4 px 以內的邊緣像素：以最近的「內部像素」顏色當 logo 本色 F，把像素視為 c = α·F + (1−α)·洋紅，
 *         解出 α，再把洋紅成分從顏色中扣掉（despill／defringe）；像素顏色與這條混色線差太多（真的是別種顏色）就當作不透明，不吃掉 logo 本身的顏色；
 *     (c) 面積極小的雜點移除。白色（AutoEllipso 的 ΨΔ、Adsorvia 的字、CheMScutter 的閃光）在 G 通道上和洋紅差最多，所以能完整保留。
 *  2. 裁切到圖形範圍（alpha 外框）、置中，縮放到圖示的 72%（以較長邊為準，Lanczos3）。
 *  3. 疊在各自的底色圓角方塊上（底色、圓角半徑見 TILES，是從 v3.6.2 的 official-*.png 取樣來的），輸出 144×144 PNG。
 *  4. 檢查：尺寸、alpha 邊緣、近洋紅且不透明的像素數（必須是 0）。
 * Adsorvia 含 "Adsorvia" 文字，縮到 144 會糊：預設輸出完整版（上方分子＋文字），另存只留上半分子圖的版本到 screenshots/ 當預覽。
 * 改輸出尺寸時，要一起看 components/Launchpad.tsx 的 ICON_SIZE。
 */
import sharp from 'sharp'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SRC_ARG = process.argv[2] ?? process.env.LOGO_SRC
if (!SRC_ARG) {
  console.error('用法：node scripts/process-logos.mjs <原圖資料夾>')
  process.exit(1)
}
const SRC = resolve(SRC_ARG)
const OUT = join(ROOT, 'public', 'icons')
const SHOTS = join(ROOT, 'screenshots')
const SIZE = 144
/** logo 佔圖示的比例（較長邊） */
const LOGO_FRAC = 0.72
const MAGENTA = [255, 0, 255]
const NAMES = ['FilMaster', 'SpecReader', 'CheMScutter', 'EluSim', 'AutoEllipso', 'MoleForm', 'Adsorvia']

/**
 * 各程式的底色與圓角半徑（144×144 座標），從 v3.6.2 的 official-*.png 取樣：
 *  - 底色 = 圖塊邊緣內側（距邊 4～10 px，四邊中段）像素的各通道中位數；Adsorvia 因為邊緣有發光描邊，改取距邊 12～22 px 的深色底。
 *    AutoEllipso 與 SpecReader 的底色有漸層，取四邊合併的代表色（AutoEllipso 左側 #066ea1 → 右側 #09bbf4）。
 *  - 圓角半徑 = 由圖塊角落的對角線位移換算（r = d / (1 − √½)）；EluSim、SpecReader 的舊圖圖塊貼滿整張或邊界不明，量不到，
 *    取啟動台現在套在圖示上的 CSS 圓角 22%（144 × 0.22 ≈ 32）。
 */
const TILES = {
  FilMaster: { color: '#fefefe', radius: 24 },
  SpecReader: { color: '#f1fafd', radius: 32 },
  CheMScutter: { color: '#f9fdfe', radius: 31 },
  EluSim: { color: '#102a35', radius: 32 },
  AutoEllipso: { color: '#069bde', radius: 27 },
  MoleForm: { color: '#fefefe', radius: 31 },
  Adsorvia: { color: '#04224a', radius: 24 },
}

// ---------------------------------------------------------------------------
// 洋紅去背
// ---------------------------------------------------------------------------

/** 幾乎純洋紅（容許壓縮雜訊） */
const isPureMagenta = (r, g, b) => r >= 238 && b >= 238 && g <= 36 && Math.abs(r - b) <= 14

/**
 * 回傳 { w, h, rgba }：RGB 是 logo 本色（已扣掉洋紅）、A 是透明度（0～255）
 */
function keyOutMagenta(data, w, h) {
  const n = w * h
  const isBg = new Uint8Array(n)
  for (let i = 0; i < n; i++) isBg[i] = isPureMagenta(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) ? 1 : 0

  // 到最近背景像素的距離（4 鄰接 BFS，只算到 BAND）
  const BAND = 4
  const dist = new Int16Array(n).fill(-1)
  let queue = []
  for (let i = 0; i < n; i++) if (isBg[i]) { dist[i] = 0; queue.push(i) }
  for (let d = 1; d <= BAND; d++) {
    const next = []
    for (const p of queue) {
      const x = p % w, y = (p / w) | 0
      if (x > 0 && dist[p - 1] < 0) { dist[p - 1] = d; next.push(p - 1) }
      if (x < w - 1 && dist[p + 1] < 0) { dist[p + 1] = d; next.push(p + 1) }
      if (y > 0 && dist[p - w] < 0) { dist[p - w] = d; next.push(p - w) }
      if (y < h - 1 && dist[p + w] < 0) { dist[p + w] = d; next.push(p + w) }
    }
    queue = next
  }
  // 內部像素 = 離背景 > BAND 的前景像素：以它們為種子，把顏色往外傳給邊緣帶（最近的內部像素顏色 = 該處 logo 本色的估計）
  const seed = new Int32Array(n).fill(-1)
  let frontier = []
  for (let i = 0; i < n; i++) if (!isBg[i] && dist[i] < 0) { seed[i] = i; frontier.push(i) }
  while (frontier.length) {
    const next = []
    for (const p of frontier) {
      const x = p % w, y = (p / w) | 0
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && !isBg[q] && seed[q] < 0) { seed[q] = seed[p]; next.push(q) }
      }
    }
    frontier = next
  }

  const rgba = Buffer.alloc(n * 4)
  const M = MAGENTA
  for (let i = 0; i < n; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2]
    const o = i * 4
    if (isBg[i]) continue // 透明
    let a = 1, fr = r, fg = g, fb = b
    if (dist[i] >= 0) {
      // c = α·F + (1−α)·M，所以 F = M + (c−M)/α：F 一定落在「從洋紅出發、穿過 c」的射線上（參數 s = 1/α ≥ 1）。
      // 限制 (1)：F 要在 0～255 的色域內 → s 的上限是 1/α_min，α_min = max(G/255, 1−R/255, 1−B/255)；
      // 方案 A：在射線上取離「最近的內部像素顏色」S 最近的點（S 投影到射線上、夾進 [1, 1/α_min]）→ 適合邊緣本色是灰、漸層的情形；
      // 方案 B：α = α_min（把洋紅扣到最少，F 會有一個通道飽和）→ 適合白、黑、飽和色的細邊，也用在方案 A 還剩粉紫色的時候；
      // 方案 B 還是粉紫色（只可能是純粹的洋紅雜訊）→ 透明。本來就不可能是洋紅混色的像素（α_min ≈ 1）維持不變。
      const ux = r - M[0], uy = g - M[1], uz = b - M[2]
      const uu = ux * ux + uy * uy + uz * uz
      const aMin = Math.max(g / 255, 1 - r / 255, 1 - b / 255)
      if (uu > 0 && aMin < 0.985) {
        const purple = (x, y, z) => Math.min(x, z) > 120 && Math.min(x, z) - y > 60
        const clamp = (v) => Math.max(0, Math.min(255, v))
        // 沒有內部像素可參考（被洋紅包圍的小碎塊）→ 直接用方案 B
        const s = seed[i]
        const sStar = s < 0 ? Infinity : ((data[s * 3] - M[0]) * ux + (data[s * 3 + 1] - M[1]) * uy + (data[s * 3 + 2] - M[2]) * uz) / uu
        const sc = Math.max(1, Math.min(1 / Math.max(aMin, 1e-3), sStar))
        let F = [clamp(M[0] + ux * sc), clamp(M[1] + uy * sc), clamp(M[2] + uz * sc)]
        let aa = 1 / sc
        if (purple(F[0], F[1], F[2])) {
          const sb = 1 / Math.max(aMin, 1e-3)
          F = [clamp(M[0] + ux * sb), clamp(M[1] + uy * sb), clamp(M[2] + uz * sb)]
          aa = 1 / sb
          if (purple(F[0], F[1], F[2])) aa = 0
        }
        a = aa < 0.03 ? 0 : aa
        if (a > 0 && a < 1) { fr = F[0]; fg = F[1]; fb = F[2] }
      }
    }
    if (a <= 0) continue
    rgba[o] = Math.round(fr); rgba[o + 1] = Math.round(fg); rgba[o + 2] = Math.round(fb); rgba[o + 3] = Math.round(a * 255)
  }

  // 面積極小的雜點（< 6 px）移除
  const lab = new Int32Array(n)
  const stack = []
  for (let s = 0; s < n; s++) {
    if (!rgba[s * 4 + 3] || lab[s]) continue
    const comp = [s]
    lab[s] = 1
    stack.push(s)
    while (stack.length) {
      const p = stack.pop()
      const x = p % w, y = (p / w) | 0
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && rgba[q * 4 + 3] && !lab[q]) { lab[q] = 1; stack.push(q); comp.push(q) }
      }
    }
    if (comp.length < 6) for (const p of comp) rgba[p * 4 + 3] = 0
  }
  return { w, h, rgba }
}

/** alpha > 0 的外框 */
function bbox({ w, h, rgba }, rowRange) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  const [ya, yb] = rowRange ?? [0, h - 1]
  for (let y = ya; y <= yb; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** 外框內由下往上找「整列都透明」的間隙（至少 3 列），回傳最下面那一段的起點列（Adsorvia：分子圖與文字之間） */
function lowestGapRow({ w, rgba }, bb) {
  let run = 0
  for (let y = bb.y1; y >= bb.y0; y--) {
    let empty = true
    for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3]) { empty = false; break }
    if (empty) {
      run++
    } else if (run >= 3) {
      return y + 1 // 間隙從 y+1 開始
    } else run = 0
  }
  return -1
}

// ---------------------------------------------------------------------------
// 疊圖
// ---------------------------------------------------------------------------

async function makeIcon(img, bb, tile) {
  const crop = await sharp(img.rgba, { raw: { width: img.w, height: img.h, channels: 4 } })
    .extract({ left: bb.x0, top: bb.y0, width: bb.w, height: bb.h })
    .png()
    .toBuffer()
  const target = Math.round(SIZE * LOGO_FRAC)
  const k = target / Math.max(bb.w, bb.h)
  const lw = Math.max(1, Math.round(bb.w * k)), lh = Math.max(1, Math.round(bb.h * k))
  const logo = await sharp(crop).resize(lw, lh, { kernel: 'lanczos3' }).png().toBuffer()
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${tile.radius}" ry="${tile.radius}" fill="${tile.color}"/></svg>`)
  const buf = await sharp(bg)
    .composite([{ input: logo, left: Math.round((SIZE - lw) / 2), top: Math.round((SIZE - lh) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer()
  return { buf, lw, lh }
}

/** 檢查輸出：尺寸、alpha 邊緣、近洋紅且不透明（alpha > 0）的像素數 */
async function checkIcon(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let partial = 0, transparent = 0, magenta = 0
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3]
    if (a === 0) transparent++
    else if (a < 255) partial++
    // 近洋紅：R、B 都高、G 明顯低於兩者（淺粉紅、白色、藍色都不會中）
    if (a > 0 && Math.min(r, b) > 140 && g < Math.min(r, b) - 60) magenta++
  }
  return { w: info.width, h: info.height, partial, transparent, magenta }
}

mkdirSync(OUT, { recursive: true })
mkdirSync(SHOTS, { recursive: true })
let bad = 0
for (const name of NAMES) {
  const file = join(SRC, name + '.png')
  if (!existsSync(file)) {
    console.error('找不到原圖：' + file)
    process.exit(1)
  }
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const keyed = keyOutMagenta(data, info.width, info.height)
  const bb = bbox(keyed)
  // 去背後（還沒疊底色）的 logo 本身：邊緣（2 px 內碰到透明或半透明）的近洋紅像素只列出來看（剩下的是兩種 logo 顏色交界的幾個粉紫色漸變像素，縮小 8 倍後不見）——疊上不透明底色後看不出來的殘色也要查。
  // 內部的近洋紅像素（兩種 logo 顏色交界、原圖本身的粉紫色漸變，與背景無關）只列出來，不算失敗。
  let keyedMagenta = 0, keyedInner = 0, keyedPartial = 0
  const nearEdge = (x, y) => {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= keyed.w || yy >= keyed.h || keyed.rgba[(yy * keyed.w + xx) * 4 + 3] < 255) return true
      }
    return false
  }
  for (let y = 0; y < keyed.h; y++)
    for (let x = 0; x < keyed.w; x++) {
      const i = y * keyed.w + x
      const al = keyed.rgba[i * 4 + 3]
      if (!al) continue
      if (al < 255) keyedPartial++
      const r = keyed.rgba[i * 4], g = keyed.rgba[i * 4 + 1], b = keyed.rgba[i * 4 + 2]
      if (Math.min(r, b) > 140 && g < Math.min(r, b) - 60) { if (nearEdge(x, y)) keyedMagenta++; else keyedInner++ }
    }
  const tile = TILES[name]
  const out = join(OUT, `official-${name.toLowerCase()}.png`)
  const full = await makeIcon(keyed, bb, tile)
  await sharp(full.buf).toFile(out)
  const c = await checkIcon(out)
  if (c.w !== SIZE || c.h !== SIZE || c.partial === 0 || c.magenta !== 0) bad++
  console.log(
    `${name}: ${info.width}×${info.height} → 圖形外框 ${bb.w}×${bb.h} → logo ${full.lw}×${full.lh}，底色 ${tile.color}、圓角 ${tile.radius} → ${c.w}×${c.h}；去背後 logo：半透明邊緣像素 ${keyedPartial}、邊緣近洋紅 ${keyedMagenta}、內部近洋紅（logo 色彩交界，非背景）${keyedInner}；成品：半透明邊緣像素 ${c.partial}、全透明 ${c.transparent}、近洋紅不透明 ${c.magenta}`,
  )
  if (name === 'Adsorvia') {
    // 只留上半分子圖（切在分子圖與文字之間的空白列）
    const cut = lowestGapRow(keyed, bb)
    if (cut < 0) throw new Error('Adsorvia：找不到分子圖與文字之間的空白列')
    const bbTop = bbox(keyed, [bb.y0, cut - 1])
    const b = await makeIcon(keyed, bbTop, tile)
    const outB = join(SHOTS, 'adsorvia-b-144.png')
    await sharp(b.buf).toFile(outB)
    const cb = await checkIcon(outB)
    if (cb.magenta !== 0) bad++
    console.log(`  Adsorvia 只留分子圖（預覽，不放進 public/）：切在第 ${cut} 列，圖形外框 ${bbTop.w}×${bbTop.h} → logo ${b.lw}×${b.lh} → screenshots/adsorvia-b-144.png；近洋紅不透明 ${cb.magenta}`)
  }
}
if (bad) {
  console.error(`有 ${bad} 張檢查未通過`)
  process.exit(2)
}
