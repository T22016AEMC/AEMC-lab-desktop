// 4.0-B1：主題外殼量測（可重現；測試 tests-archive/v400b1 會重跑並和 tests-archive/v400b1/skins-measure.json 比對）。
// 讀 public/assets 目前的圖集（輸出）與原圖資料夾（去背分析），不改任何檔；--write 才寫 JSON。
//   node scripts/measure-skins.mjs [--write]    （原圖資料夾：ASSET_SRC，預設 repo 上一層的「像素風圖片」）
// 量的東西：
//  - 每張外殼：畫布尺寸、錨點、不透明內容外框（內容寬高）、meta（鐘面）
//  - 鐘樓：時鐘上方的藍色窗玻璃（和管線 windowCenters 同一判斷）是否在 TOWER_WINDOW 裡，附偵測信心
//  - 洋紅：接近純洋紅的殘留（isBgNear；保留內部洋紅畫作的 keepEnclosed 外殼只算貼著透明處的）、保留的內部洋紅像素數、邊緣洋紅偏色（edgeMagentaCount）
//  - 去背：原圖每格「被物件圍住、一般 isBg 會當背景、但不是純洋紅」的像素數 = 改用 nearBg 才保住的內部像素（原圖像素）
import sharp from 'sharp'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pa = await import(pathToFileURL(join(ROOT, 'scripts', 'process-assets.mjs')).href)
export const THEMES = ['atlantis', 'cleanroom', 'forest', 'magic', 'punk', 'plaid']
export const POND_ORDER = ['plaid', 'atlantis', 'forest', 'magic', 'punk', 'cleanroom']
/** layout.ts 的共用點擊區（相對素材左上角；門與招牌是比例）。這裡複製一份，測試會和 layout.ts 比對是否相同 */
export const SHARED = { TOWER_WINDOW: { x0: 56, y0: 38, x1: 69, y1: 54 }, TOWER_DOOR: { x0: 0.4, x1: 0.6, y0: 0.74, y1: 0.97 }, DOOR: { x0: 0.26, x1: 0.45, y0: 0.6, y1: 0.93 } }

export function skinKeys() {
  const k = []
  for (const t of THEMES) for (const n of ['closed', 'open', 'night']) k.push(`house_${t}_${n}`)
  for (const t of THEMES) k.push(`tower_${t}`, `tower_${t}_open`)
  for (const t of THEMES) k.push(`pond_${t}`, `board_${t}`, `doghouse_${t}`, `cat_tree_${t}`, `bowls_${t}`)
  return k
}

async function loadAtlases(root) {
  const A = join(root, 'public', 'assets')
  const m = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
  const atl = {}
  for (const [g, a] of Object.entries(m.atlases)) {
    const { data, info } = await sharp(join(A, a.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    atl[g] = { data, w: info.width }
  }
  const crop = (k) => {
    const f = m.frames[k]
    if (!f) return null
    const a = atl[f.atlas]
    const rgba = Buffer.alloc(f.w * f.h * 4)
    for (let y = 0; y < f.h; y++) a.data.copy(rgba, y * f.w * 4, ((f.y + y) * a.w + f.x) * 4, ((f.y + y) * a.w + f.x + f.w) * 4)
    return { ...f, rgba }
  }
  return { m, crop }
}

/** 不透明內容外框（x1、y1 不含） */
function contentBox(s) {
  let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.rgba[(y * s.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 }
}

/**
 * 時鐘上方的窗玻璃：藍灰色（b > r + 8、b > 90、g > 70）、在素材上方 70 列與 x 40～85 之間的連通塊（面積 ≥ 6）。
 * 信心：high = 找到 1～3 塊、合計外框完全在 TOWER_WINDOW 裡、外框不超過 14×18（一扇窗的大小）；
 *       low = 找不到，或有連通塊伸到 TOWER_WINDOW 外 3 像素以上（整座塔偏藍、或旁邊有別的藍色裝飾）；其餘 medium
 */
export function towerWindow(s) {
  const W = SHARED.TOWER_WINDOW
  const mask = new Uint8Array(s.w * s.h)
  for (let y = 0; y < Math.min(70, s.h); y++)
    for (let x = 40; x < Math.min(86, s.w); x++) {
      const i = (y * s.w + x) * 4
      const r = s.rgba[i], g = s.rgba[i + 1], b = s.rgba[i + 2]
      if (s.rgba[i + 3] && b > r + 8 && b > 90 && g > 70) mask[y * s.w + x] = 1
    }
  const comps = pa.label(mask, s.w, s.h).comps.filter((c) => c.area >= 6)
  if (!comps.length) return { confidence: 'low', box: null, comps: 0, reason: '找不到藍色窗玻璃' }
  const box = { x0: Math.min(...comps.map((c) => c.x0)), y0: Math.min(...comps.map((c) => c.y0)), x1: Math.max(...comps.map((c) => c.x1)) + 1, y1: Math.max(...comps.map((c) => c.y1)) + 1 }
  const inside = box.x0 >= W.x0 && box.x1 <= W.x1 && box.y0 >= W.y0 && box.y1 <= W.y1
  const far = box.x0 < W.x0 - 3 || box.x1 > W.x1 + 3 || box.y0 < W.y0 - 3 || box.y1 > W.y1 + 3
  const compact = box.x1 - box.x0 <= 14 && box.y1 - box.y0 <= 18
  const confidence = inside && compact && comps.length <= 3 ? 'high' : far ? 'low' : 'medium'
  const reason = confidence === 'high' ? '窗玻璃完全在點擊區裡' : far ? '藍色範圍伸出點擊區 3 像素以上（整座塔偏藍或有別的藍色裝飾），要人工看' : '窗玻璃大致在點擊區，邊緣差 1～3 像素'
  return { confidence, box, comps: comps.length, reason }
}

/** 原圖每格：被物件圍住、isBg 當背景但不是純洋紅（isBgNear）的像素數 */
async function eatenCells(file, cols, rows) {
  const img = await pa.load(file)
  const { W, H, data } = img
  const bg = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) bg[i] = pa.isBg(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) ? 1 : 0
  const out = new Uint8Array(W * H)
  const st = []
  const seed = (i) => { if (bg[i] && !out[i]) { out[i] = 1; st.push(i) } }
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x) }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1) }
  while (st.length) {
    const p = st.pop(), x = p % W, y = (p / W) | 0
    if (x > 0) seed(p - 1)
    if (x < W - 1) seed(p + 1)
    if (y > 0) seed(p - W)
    if (y < H - 1) seed(p + W)
  }
  const cnt = new Array(cols * rows).fill(0)
  for (let i = 0; i < W * H; i++)
    if (bg[i] && !out[i] && !pa.isBgNear(data[i * 3], data[i * 3 + 1], data[i * 3 + 2])) {
      const x = i % W, y = (i / W) | 0
      cnt[Math.min(rows - 1, Math.floor(y / (H / rows))) * cols + Math.min(cols - 1, Math.floor(x / (W / cols)))]++
    }
  return cnt
}

export async function measure(root = ROOT) {
  const { m, crop } = await loadAtlases(root)
  const frames = {}
  for (const k of skinKeys()) {
    const s = crop(k)
    if (!s) { frames[k] = null; continue }
    let near = 0, interior = 0
    const keep = pa.SKIN_KEEP_ENCLOSED.has(k)
    for (let i = 0; i < s.w * s.h; i++)
      if (s.rgba[i * 4 + 3] && pa.isBgNear(s.rgba[i * 4], s.rgba[i * 4 + 1], s.rgba[i * 4 + 2])) {
        if (!keep || pa.isEdge(s.rgba, s.w, s.h, i % s.w, (i / s.w) | 0)) near++
        else interior++
      }
    frames[k] = { atlas: s.atlas, w: s.w, h: s.h, ax: s.ax, ay: s.ay, content: contentBox(s), keepEnclosed: keep, magentaNear: near, magentaInterior: interior, edgeMagenta: pa.edgeMagentaCount(s), ...(s.meta ? { meta: s.meta } : {}) }
    if (k.startsWith('tower_')) frames[k].window = towerWindow(s)
  }
  const atlases = Object.fromEntries(Object.entries(m.atlases).filter(([g]) => g.startsWith('skins_')).map(([g, a]) => [g, { width: a.width, height: a.height }]))
  const eaten = {}
  for (const t of THEMES) eaten[`house_${t}`] = await eatenCells(`house_${t}.png`, 3, 1)
  for (const t of THEMES) for (const o of ['', '_open']) eaten[`tower_${t}${o}`] = await eatenCells(`tower_${t}${o}.png`, 1, 1)
  eaten.pond_themes = await eatenCells('pond_themes.png', 3, 2)
  for (const f of ['board_themes', 'doghouse_themes_v2', 'cattree_themes_v2', 'bowl_themes_v2']) eaten[f] = await eatenCells(f + '.png', 3, 2)
  return { frames, atlases, eaten, cellOrder: { pond_themes: POND_ORDER, others: THEMES } }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await measure()
  for (const [k, f] of Object.entries(r.frames)) {
    if (!f) { console.log(`${k}：沒有輸出`); continue }
    const c = f.content
    console.log(`${k.padEnd(22)} ${f.atlas.padEnd(12)} 畫布 ${f.w}×${f.h} 內容 ${c.x1 - c.x0}×${c.y1 - c.y0} 洋紅殘留 ${f.magentaNear}${f.keepEnclosed ? ` 保留內部洋紅 ${f.magentaInterior}` : ''} 邊緣偏色 ${f.edgeMagenta}${f.meta?.clock ? ` 鐘面 (${f.meta.clock.cx},${f.meta.clock.cy}) r${f.meta.clock.r}` : ''}${f.window ? ` 窗 ${f.window.confidence}${f.window.box ? ` x${f.window.box.x0}～${f.window.box.x1} y${f.window.box.y0}～${f.window.box.y1}` : ''}` : ''}`)
  }
  console.log('圖集：' + Object.entries(r.atlases).map(([g, a]) => `${g} ${a.width}×${a.height}`).join('、'))
  console.log('nearBg 保住的內部像素（原圖像素，每格）：' + Object.entries(r.eaten).map(([k, v]) => `${k} [${v.join(',')}]`).join('、'))
  if (process.argv.includes('--write')) {
    writeFileSync(join(ROOT, 'tests-archive', 'v400b1', 'skins-measure.json'), JSON.stringify(r, null, 1) + '\n')
    console.log('寫入 tests-archive/v400b1/skins-measure.json')
  }
}
