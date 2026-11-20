// 4.0-B1 停點 1 的檢查圖（輸出到 tests-archive/v400b1/browser/shots/）：
//  overlay/：住家（關門、門微開、夜晚）疊住家門點擊區 DOOR；鐘樓（關門、開門）疊窗戶 TOWER_WINDOW、塔門 TOWER_DOOR、招牌、鐘面（含程式畫的金框）。
//            亞特蘭提斯、無塵室（窗戶自動偵測不可靠）、魔法（偵測也不可靠，一併附上）與預設外觀對照；標題寫偵測信心
//  magic/：魔法主題每張：左＝一般 isBg 去背會得到的樣子、中＝實際輸出（nearBg）、右＝實際輸出上用紅色標出「isBg 會吃掉的像素」
//  sheets/：每個部位一張 contact sheet（預設＋6 主題）
// 用法：ASSET_SRC=<原圖資料夾> node tests-archive/v400b1/stop1-shots.mjs
import sharp from 'sharp'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const OUT = join(HERE, 'browser', 'shots')
for (const d of ['overlay', 'magic', 'sheets']) mkdirSync(join(OUT, d), { recursive: true })
const pa = await import(pathToFileURL(join(ROOT, 'scripts', 'process-assets.mjs')).href)
const ms = await import(pathToFileURL(join(ROOT, 'scripts', 'measure-skins.mjs')).href)
const LAY = { TOWER_SIGN: { x: 0.655, y: 0.84 }, TOWER_SIGN_HALF: { w: 12, h: 8 }, TOWER_CLOCK_FRAME: 3 }

const A = join(ROOT, 'public', 'assets')
const man = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
const atl = {}
async function crop(k) {
  const f = man.frames[k]
  if (!f) return null
  if (!atl[f.atlas]) atl[f.atlas] = await sharp(join(A, man.atlases[f.atlas].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { data, info } = atl[f.atlas]
  const rgba = Buffer.alloc(f.w * f.h * 4)
  for (let y = 0; y < f.h; y++) data.copy(rgba, y * f.w * 4, ((f.y + y) * info.width + f.x) * 4, ((f.y + y) * info.width + f.x + f.w) * 4)
  return { ...f, rgba }
}
const svgText = (t, w, h, size = 15, fill = '#fff') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="6" y="${size + 3}" font-family="sans-serif" font-size="${size}" fill="${fill}" stroke="#000" stroke-width="0.5">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`)
const big = (s, k) => sharp(s.rgba, { raw: { width: s.w, height: s.h, channels: 4 } }).resize(s.w * k, s.h * k, { kernel: 'nearest' }).png().toBuffer()

/** 一列圖（每張含標題與矩形疊圖）；rects: [{x0,y0,x1,y1,color}]，circles: [{cx,cy,r,color}]（素材座標） */
async function row(file, items, k, bg = { r: 110, g: 150, b: 95 }) {
  const cw = Math.max(...items.map((i) => i.s.w)) * k + 20, chh = Math.max(...items.map((i) => i.s.h)) * k + 48
  const comps = []
  for (let i = 0; i < items.length; i++) {
    const { s, title, rects = [], circles = [] } = items[i]
    const ox = i * cw + 10, oy = 40
    comps.push({ input: await big(s, k), left: ox, top: oy })
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w * k}" height="${s.h * k}">`
    for (const r of rects) svg += `<rect x="${r.x0 * k}" y="${r.y0 * k}" width="${(r.x1 - r.x0) * k}" height="${(r.y1 - r.y0) * k}" fill="none" stroke="${r.color}" stroke-width="3"/>`
    for (const c of circles) svg += `<circle cx="${c.cx * k}" cy="${c.cy * k}" r="${c.r * k}" fill="none" stroke="${c.color}" stroke-width="3"/>`
    svg += '</svg>'
    comps.push({ input: Buffer.from(svg), left: ox, top: oy })
    for (const [j, line] of title.split('\n').entries()) comps.push({ input: svgText(line, cw - 4, 18, 13), left: i * cw + 4, top: 2 + j * 18 })
  }
  await sharp({ create: { width: cw * items.length, height: chh, channels: 3, background: bg } }).composite(comps).png().toFile(file)
}

// ---- overlay ----
const W = ms.SHARED
for (const t of ['default', 'atlantis', 'cleanroom', 'magic']) {
  const hk = t === 'default' ? ['house_closed', 'house_open', 'house_night'] : ['closed', 'open', 'night'].map((n) => `house_${t}_${n}`)
  const houses = []
  for (const k of hk) {
    const s = await crop(k)
    const d = { x0: W.DOOR.x0 * s.w, x1: W.DOOR.x1 * s.w, y0: W.DOOR.y0 * s.h, y1: W.DOOR.y1 * s.h, color: '#ff2a2a' }
    houses.push({ s, title: `${k}\n紅＝住家門點擊區 DOOR（共用）`, rects: [d] })
  }
  await row(join(OUT, 'overlay', `house-${t}.png`), houses, 4)
  const tk = t === 'default' ? ['clocktower', 'clocktower_open'] : [`tower_${t}`, `tower_${t}_open`]
  const towers = []
  for (const k of tk) {
    const s = await crop(k)
    const win = ms.towerWindow(s)
    const c = s.meta.clock
    const door = { x0: W.TOWER_DOOR.x0 * s.w, x1: W.TOWER_DOOR.x1 * s.w, y0: W.TOWER_DOOR.y0 * s.h, y1: W.TOWER_DOOR.y1 * s.h, color: '#ff2a2a' }
    const sign = { x0: LAY.TOWER_SIGN.x * s.w - LAY.TOWER_SIGN_HALF.w, x1: LAY.TOWER_SIGN.x * s.w + LAY.TOWER_SIGN_HALF.w, y0: LAY.TOWER_SIGN.y * s.h - LAY.TOWER_SIGN_HALF.h, y1: LAY.TOWER_SIGN.y * s.h + LAY.TOWER_SIGN_HALF.h, color: '#ff9f1a' }
    const rects = [{ ...W.TOWER_WINDOW, color: '#00e5ff' }, door, sign]
    if (win.box) rects.push({ ...win.box, color: '#ffffff' })
    towers.push({
      s,
      title: `${k}  窗戶偵測信心：${win.confidence}（${win.reason}）\n青＝窗戶點擊區 TOWER_WINDOW、白＝偵測到的藍色範圍、紅＝塔門、橘＝招牌、黃＝鐘面 (${c.cx},${c.cy}) r${c.r}＋金框`,
      rects,
      circles: [{ cx: c.cx, cy: c.cy, r: c.r, color: '#ffe600' }, { cx: c.cx, cy: c.cy, r: c.r + LAY.TOWER_CLOCK_FRAME, color: '#ffe600' }],
    })
  }
  await row(join(OUT, 'overlay', `tower-${t}.png`), towers, 4)
}

// ---- magic：isBg 對照 ----
const P = (n) => {
  const t = readFileSync(join(ROOT, 'scripts', 'process-assets.mjs'), 'utf8')
  const m = t.match(new RegExp(`\\b${n}: ([0-9.]+)`))
  return m ? Number(m[1]) : null
}
const magic = [
  ['house_magic.png', 3, 1, ['house_magic_closed', 'house_magic_open', 'house_magic_night']],
  ['tower_magic.png', 1, 1, ['tower_magic']],
  ['tower_magic_open.png', 1, 1, ['tower_magic_open']],
  ['pond_themes.png', 3, 2, ms.POND_ORDER.map((t) => (t === 'magic' ? 'pond_magic' : null))],
  ['board_themes.png', 3, 2, ms.THEMES.map((t) => (t === 'magic' ? 'board_magic' : null))],
  ['doghouse_themes_v2.png', 3, 2, ms.THEMES.map((t) => (t === 'magic' ? 'doghouse_magic' : null))],
  ['cattree_themes_v2.png', 3, 2, ms.THEMES.map((t) => (t === 'magic' ? 'cat_tree_magic' : null))],
  ['bowl_themes_v2.png', 3, 2, ms.THEMES.map((t) => (t === 'magic' ? 'bowls_magic' : null))],
]
for (const [file, cols, rows, names] of magic) {
  const pFrames = Object.fromEntries(names.filter(Boolean).map((n) => [n, P(n)]))
  const r = await pa.sheet({ file, cols, rows, names, pFrames, ...(cols * rows > 1 ? { grid: 'even' } : {}) })
  for (const n of names.filter(Boolean)) {
    const out = await crop(n)
    const f = r.frames.find((g) => g.name === n)
    const plain = f ? pa.cleanSprite(f.spr) : null
    // isBg 版貼到同一張畫布（底部置中），再標出「實際輸出有、isBg 版沒有」的像素
    const pad = (s) => { const o = Buffer.alloc(out.w * out.h * 4); const ox = Math.round((out.w - s.w) / 2), oy = out.h - s.h; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const tx = x + ox, ty = y + oy; if (tx >= 0 && ty >= 0 && tx < out.w && ty < out.h) s.rgba.copy(o, (ty * out.w + tx) * 4, (y * s.w + x) * 4, (y * s.w + x + 1) * 4) } return { w: out.w, h: out.h, rgba: o } }
    const pl = plain ? pad(plain) : { w: out.w, h: out.h, rgba: Buffer.alloc(out.w * out.h * 4) }
    const mark = { w: out.w, h: out.h, rgba: Buffer.from(out.rgba) }
    let eaten = 0
    for (let i = 0; i < out.w * out.h; i++) if (out.rgba[i * 4 + 3] && !pl.rgba[i * 4 + 3]) { eaten++; mark.rgba[i * 4] = 255; mark.rgba[i * 4 + 1] = 0; mark.rgba[i * 4 + 2] = 0 }
    const k = out.w > 100 ? 4 : 6
    await row(join(OUT, 'magic', `${n}.png`), [
      { s: pl, title: `${n}｜一般 isBg 去背（不採用）` },
      { s: out, title: `${n}｜實際輸出（nearBg＋去邊）` },
      { s: mark, title: `${n}｜紅＝isBg 會吃掉的 ${eaten} 像素` },
    ], k, { r: 30, g: 32, b: 40 })
  }
}

// ---- contact sheets ----
const groups = {
  house: ['house_closed', 'house_open', 'house_night', ...ms.THEMES.flatMap((t) => ['closed', 'open', 'night'].map((n) => `house_${t}_${n}`))],
  tower: ['clocktower', 'clocktower_open', ...ms.THEMES.flatMap((t) => [`tower_${t}`, `tower_${t}_open`])],
  pond: ['pond', ...ms.THEMES.map((t) => `pond_${t}`)],
  board: ['board', ...ms.THEMES.map((t) => `board_${t}`)],
  doghouse: ['doghouse', ...ms.THEMES.map((t) => `doghouse_${t}`)],
  cat_tree: ['cat_tree', ...ms.THEMES.map((t) => `cat_tree_${t}`)],
  bowls: ['bowls', ...ms.THEMES.map((t) => `bowls_${t}`)],
}
for (const [g, keys] of Object.entries(groups)) {
  const per = g === 'house' ? 3 : g === 'tower' ? 2 : 1
  const k = g === 'house' || g === 'tower' ? 3 : 4
  for (let i = 0; i < keys.length; i += per * (g === 'house' ? 1 : g === 'tower' ? 2 : 7)) {
    // 每張 sheet：住家一主題一列（3 張）、鐘樓兩主題一列、其他 7 張一列
  }
  const items = []
  for (const key of keys) { const s = await crop(key); if (s) items.push({ s, title: `${key} ${s.w}×${s.h}` }) }
  const cols = g === 'house' ? 3 : g === 'tower' ? 4 : 7
  const rowsN = Math.ceil(items.length / cols)
  const cw = Math.max(...items.map((i) => i.s.w)) * k + 20, chh = Math.max(...items.map((i) => i.s.h)) * k + 30
  const comps = []
  for (let i = 0; i < items.length; i++) {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * chh
    comps.push({ input: svgText(items[i].title, cw, 20, 13, '#111'), left: x + 4, top: y + 2 })
    comps.push({ input: await big(items[i].s, k), left: x + 10, top: y + 24 })
  }
  await sharp({ create: { width: cw * cols, height: chh * rowsN, channels: 3, background: { r: 120, g: 165, b: 105 } } }).composite(comps).png().toFile(join(OUT, 'sheets', `${g}.png`))
}
console.log('停點 1 檢查圖 → ' + OUT)

// ---- 前後比對：全黃金（階段 R 完成時，bfc1390）→ 亞特蘭提斯。第 1 個參數 = 換圖前 repo 根目錄（含 public/assets） ----
if (process.argv[2]) {
  mkdirSync(join(OUT, 'compare'), { recursive: true })
  const OA = join(resolve(process.argv[2]), 'public', 'assets')
  const om = JSON.parse(readFileSync(join(OA, readdirSync(OA).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
  const oatl = {}
  const ocrop = async (k) => {
    const f = om.frames[k]
    if (!oatl[f.atlas]) oatl[f.atlas] = await sharp(join(OA, om.atlases[f.atlas].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const { data, info } = oatl[f.atlas]
    const rgba = Buffer.alloc(f.w * f.h * 4)
    for (let y = 0; y < f.h; y++) data.copy(rgba, y * f.w * 4, ((f.y + y) * info.width + f.x) * 4, ((f.y + y) * info.width + f.x + f.w) * 4)
    return { ...f, rgba }
  }
  const pairs = [['house_gold_closed', 'house_atlantis_closed'], ['house_gold_open', 'house_atlantis_open'], ['house_gold_night', 'house_atlantis_night'], ['clocktower_gold', 'tower_atlantis'], ['clocktower_open_gold', 'tower_atlantis_open'], ['sil_house_gold', 'sil_house_atlantis'], ['sil_tower_gold', 'sil_tower_atlantis']]
  for (const [o, nk] of pairs) {
    const a = await ocrop(o), b = await crop(nk)
    await row(join(OUT, 'compare', `${nk}.png`), [{ s: a, title: `換圖前 ${o} ${a.w}×${a.h}` }, { s: b, title: `換圖後 ${nk} ${b.w}×${b.h}` }], a.w > 60 ? 3 : 4)
  }
}
