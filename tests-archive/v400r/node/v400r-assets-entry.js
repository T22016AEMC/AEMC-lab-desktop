// 4.0 階段 R：素材輸出與程式常數一致（原圖哪天又被換成不同格大小時，不會靜默變形）。
//  1. 關鍵素材（樹、路燈、鐘樓四張、狗窩、貓跳台、食盆、小路、遠景、公佈欄、野餐墊、住家、水池）的尺寸、錨點與 layout.ts／picnic.ts 的常數相同
//  2. envelopes.ts 的尺寸與錨點 = manifest；逐列不透明區段 = 圖集重新量一次
//  3. CAT_TREE_ENVELOPE = 由圖集重新算一次（貓跳台＋6 種貓睡在頂層平台）
//  4. 寵物每一格：腳底（錨點 ay）在素材底邊、底邊那一列有不透明像素、錨點 x 是水平中心；和換圖前（before.json）的腳底位置差 0
//  5. 每張素材洋紅殘留 0（用管線自己的判斷）、alpha 只有 0／255
//  6. 叼球位置 MOUTH 在狗的素材外框內；鐘面 meta 有值、備用值 = 關門鐘樓的 meta；黑板綠色範圍 = manifest
//  7. 管線的明確像素格 P_FIXED 涵蓋所有會碰到「估算邊界」的原圖（用 guardEstimate 的規則跑一次：缺參數就會報錯）
import '../../calendar-tweaks/node/env-shim.js'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import * as PC from '../../../src/farm/pixel/picnic.ts'
import { ENVELOPES } from '../../../src/farm/pixel/envelopes.ts'
import { CAT_TREE_TOP_SEAT } from '../../../src/farm/pixel/buildingUse.ts'
import { MOUTH } from '../../../src/farm/pixel/play.ts'

const ROOT = process.env.REPO_ROOT
const sharp = createRequire(ROOT + '/package.json')('sharp')
const pa = await import(pathToFileURL(ROOT + '/scripts/process-assets.mjs').href)
const A = join(ROOT, 'public', 'assets')
const man = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
const before = JSON.parse(readFileSync(join(ROOT, 'tests-archive', 'v400r', 'before.json'), 'utf8')).frames

let n = 0
const fails = []
const ok = (c, m) => { n++; if (!c) fails.push(m) }
const eq = (a, b, m) => { n++; try { assert.deepEqual(a, b) } catch { fails.push(`${m}：實際 ${JSON.stringify(a)}，預期 ${JSON.stringify(b)}`) } }

const atl = {}
for (const [g, a] of Object.entries(man.atlases)) {
  const { data, info } = await sharp(join(A, a.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  atl[g] = { data, w: info.width }
}
const F = (k) => {
  const f = man.frames[k]
  assert.ok(f, '沒有素材 ' + k)
  const a = atl[f.atlas]
  const at = (x, y) => ((f.y + y) * a.w + f.x + x) * 4
  return { ...f, on: (x, y) => a.data[at(x, y) + 3] > 0, rgba: (x, y) => [...a.data.subarray(at(x, y), at(x, y) + 4)] }
}

// ---- 1. 關鍵素材尺寸 = 常數 ----
const size = (k, w, h, msg) => { const f = F(k); eq([f.w, f.h], [w, h], `${msg}（${k}）尺寸`) }
size('tree', LAY.TREE_W, LAY.TREE_H, '樹 TREE_W/H')
size('lamp', LAY.LAMP_W, LAY.LAMP_H, '路燈 LAMP_W/H')
eq(F('lamp').ax, LAY.LAMP_AX, '路燈錨點 LAMP_AX')
for (const k of ['clocktower', 'clocktower_open', 'tower_atlantis', 'tower_atlantis_open']) size(k, LAY.TOWER_W, LAY.TOWER_H, '鐘樓 TOWER_W/H')
size('doghouse', LAY.KENNEL_W, LAY.KENNEL_H, '狗窩 KENNEL_W/H')
eq(F('doghouse').ax, LAY.KENNEL_AX, '狗窩錨點 KENNEL_AX')
size('cat_tree', LAY.CAT_TREE_W, LAY.CAT_TREE_H, '貓跳台 CAT_TREE_W/H')
size('bowls', LAY.BOWLS_W, LAY.BOWLS_H, '食盆水盆 BOWLS_W/H')
eq(F('path').h, LAY.PATH_H, '小路高 PATH_H')
eq(F('far').h, LAY.FAR_H, '遠景高 FAR_H')
size('board', LAY.BOARD_W, LAY.BOARD_H, '公佈欄 BOARD_W/H')
eq(F('board').meta.board, LAY.BOARD_GREEN, '黑板綠色範圍 BOARD_GREEN = manifest')
for (const k of PC.MAT_KEYS) size(k, PC.MAT_W, PC.MAT_H, '野餐墊 MAT_W/H')
for (const k of ['house_closed', 'house_open', 'house_night', 'house_atlantis_closed', 'house_atlantis_open', 'house_atlantis_night']) size(k, LAY.HOUSE_W, LAY.HOUSE_H, '住家 HOUSE_W/H')
size('pond', LAY.POND_W, LAY.POND_H, '水池 POND_W/H')
eq(F('pond').ax, LAY.POND_AX, '水池錨點 POND_AX')
eq(F('pond').meta.water, LAY.WATER, '水面 WATER = manifest')
// 鐘面：四張都有偵測值；備用值 = 關門鐘樓
for (const k of ['clocktower', 'clocktower_open', 'tower_atlantis', 'tower_atlantis_open']) ok(F(k).meta?.clock && F(k).meta.clock.r > 10, `${k} 偵測得到鐘面`)
eq(LAY.TOWER_CLOCK_FALLBACK, F('clocktower').meta.clock, '鐘面備用值 = 關門鐘樓的 meta.clock')
// 4.0-R：四張鐘樓共用同一個鐘面（換開門版時鐘面不跳），而且是整數像素
for (const k of ['clocktower_open', 'tower_atlantis', 'tower_atlantis_open']) eq(F(k).meta.clock, F('clocktower').meta.clock, `${k} 的鐘面 = 關門鐘樓的鐘面`)
{ const c = F('clocktower').meta.clock; ok(Number.isInteger(c.cx) && Number.isInteger(c.cy) && Number.isInteger(c.r), `鐘面是整數像素 ${JSON.stringify(c)}`) }
// 窗戶點擊區包住四張鐘樓的藍色窗玻璃（時鐘上方）
// 4.0-B1：亞特蘭提斯鐘樓的窗戶自動偵測不可靠（整座偏藍），改由 tests-archive/v400b1 的疊圖人工確認；這裡只驗預設鐘樓
for (const k of ['clocktower', 'clocktower_open']) {
  const f = F(k)
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
  for (let y = 0; y < 70; y++) for (let x = 40; x < 85; x++) { const [r, g, b, a] = f.rgba(x, y); if (a && b > r + 8 && b > 90 && g > 70) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) } }
  const W = LAY.TOWER_WINDOW
  ok(x1 >= 0 && x0 >= W.x0 && x1 < W.x1 && y0 >= W.y0 && y1 < W.y1, `${k} 的窗玻璃 (${x0}～${x1}, ${y0}～${y1}) 在 TOWER_WINDOW ${JSON.stringify(W)} 裡`)
}

// ---- 2. envelopes.ts ----
// 4.0-B1：每個群組含所有主題外殼的聯集（寬度、錨點 ax 相同、腳底對齊；高度取最高的），和 scripts/gen-envelopes.mjs 同一規則
const THEMES = ['atlantis', 'cleanroom', 'forest', 'magic', 'punk', 'plaid']
const GROUPS = {
  house: ['house_closed', 'house_open', 'house_night', ...THEMES.flatMap((t) => [`house_${t}_closed`, `house_${t}_open`, `house_${t}_night`])],
  clocktower: ['clocktower', 'clocktower_open', ...THEMES.flatMap((t) => [`tower_${t}`, `tower_${t}_open`])],
  pond: ['pond', ...THEMES.map((t) => 'pond_' + t)], board: ['board', ...THEMES.map((t) => 'board_' + t)], lamp: ['lamp'], tree: ['tree'], bush: ['bush'], mushroom: ['mushroom'], rocks: ['rocks'], flowers: ['flowers'],
  stump: ['stump'], tall_grass: ['tall_grass'], doghouse: ['doghouse', ...THEMES.map((t) => 'doghouse_' + t)], cat_tree: ['cat_tree', ...THEMES.map((t) => 'cat_tree_' + t)], bowls: ['bowls', ...THEMES.map((t) => 'bowls_' + t)], planter: ['planter'], coral: ['coral'],
}
for (const [g, keys] of Object.entries(GROUPS)) {
  const e = ENVELOPES[g], f0 = F(keys[0])
  const H = Math.max(...keys.map((k) => F(k).ay))
  eq([e.w, e.h, e.ax, e.ay], [f0.w, H, f0.ax, H], `envelopes.ts ${g} 尺寸與錨點 = 預設圖（高度取外殼裡最高的）`)
  const rows = []
  for (let y = 0; y < H; y++) {
    const on = new Array(f0.w).fill(false)
    for (const k of keys) { const f = F(k); const yy = y - (H - f.ay); if (yy < 0 || yy >= f.h) continue; for (let x = 0; x < f.w; x++) if (f.on(x, yy)) on[x] = true }
    const segs = []
    for (let x = 0; x < f0.w; x++) if (on[x] && (x === 0 || !on[x - 1])) { let e2 = x; while (e2 < f0.w && on[e2]) e2++; segs.push([x - f0.ax, e2 - f0.ax]) }
    rows.push(segs)
  }
  eq(e.rows.map((r) => r.map((s) => [...s])), rows, `envelopes.ts ${g} 逐列不透明區段 = 圖集（含外殼聯集）`)
}

// ---- 3. CAT_TREE_ENVELOPE ----
{
  const { catTreeEnvelope } = await import(pathToFileURL(ROOT + '/tests-archive/v400r/cat-tree-envelope.mjs').href)
  const want = (await catTreeEnvelope(ROOT)).rows
  eq(LAY.CAT_TREE_ENVELOPE.map((r) => [...r]), want, 'CAT_TREE_ENVELOPE = 圖集重新算一次（含貓跳台外殼）')
}

// ---- 4. 寵物：腳底 ----
let petFrames = 0
for (const k of Object.keys(man.frames).filter((k) => /^(dog|cat)_[a-z]+_/.test(k) && !man.frames[k].atlas.startsWith('skins_'))) { // 4.0-B1：cat_tree_<主題> 是外殼，不是寵物
  const f = F(k)
  petFrames++
  eq(f.ay, f.h, `${k} 錨點 ay = 素材底邊`)
  eq(f.ax, Math.round(f.w / 2), `${k} 錨點 ax = 水平中心`)
  let bottom = false
  for (let x = 0; x < f.w; x++) if (f.on(x, f.h - 1)) bottom = true
  ok(bottom, `${k} 底邊那一列有不透明像素（腳底貼在錨點上）`)
  if (before[k]) eq(f.ay - f.h, before[k].ay - before[k].h, `${k} 腳底位置和換圖前相同（差 0）`)
}
ok(petFrames === 156, `寵物素材 156 格（6 狗 × 14、6 貓 × 12），實際 ${petFrames}`)

// ---- 5. 洋紅殘留、alpha ----
for (const k of Object.keys(man.frames)) {
  const f = F(k)
  // 4.0-B1：外殼（skins_* 圖集）一律用 nearBg 去背，殘留也用同一個判斷
  const bg = k === 'planter' || k === 'coral' || f.atlas.startsWith('skins_') ? pa.isBgNear : /^picnic_mat_/.test(k) ? pa.isBgStrict : pa.isBg
  let mag = 0, half = 0
  // 4.0-B1：保留內部洋紅畫作的外殼（SKIN_KEEP_ENCLOSED）只算貼著透明處的殘留
  const edgeOnly = pa.SKIN_KEEP_ENCLOSED.has(k)
  const open = (x, y) => x < 0 || y < 0 || x >= f.w || y >= f.h || !f.rgba(x, y)[3]
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const [r, g, b, a] = f.rgba(x, y); if (a && a !== 255) half++; if (a && bg(r, g, b) && (!edgeOnly || open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1))) mag++ }
  ok(edgeOnly ? mag <= 6 : mag === 0, `${k} 洋紅殘留 ${mag}（應為 0；保留內部洋紅畫作的外殼外緣 ≤ 6，見 v400b1）`)
  ok(half === 0, `${k} 半透明像素 ${half}（應為 0）`)
}

// ---- 6. MOUTH 在狗的素材外框內 ----
for (const [d, fr] of Object.entries(MOUTH))
  for (const [name, [mx, my]] of Object.entries(fr)) {
    const key = d === 'collie' ? 'dog_collie_' + name : `dog_${d}_${name}`
    const f = F(key)
    ok(mx > -f.ax && mx < f.w - f.ax && my < 0 && my > -f.h, `${key} 叼球位置 (${mx},${my}) 在素材外框內（${f.w}×${f.h}，錨點 ${f.ax},${f.ay}）`)
  }

// ---- 7. 管線：每張會用到估算值的原圖都有明確參數（缺參數時 guardEstimate 會讓管線報錯，這裡確認目前的原圖會觸發這條規則） ----
{
  let threw = false
  try { await pa.sheet({ file: 'scene_tree.png', cols: 1, rows: 1, names: ['tree'] }) } catch (e) { threw = /估算不可靠/.test(String(e.message)) }
  ok(threw, '沒有明確參數的原圖（估出 p 碰到範圍下限）會讓管線報錯')
}

// ---- 8. 邊緣洋紅偏色（去邊）：不得比換圖前（edge-before.json，fa6e940 的圖集）多 ----
{
  const base = JSON.parse(readFileSync(join(ROOT, 'tests-archive', 'v400r', 'edge-before.json'), 'utf8')).frames
  // 使用者指出有淡紫邊點的物件：逐張不得多於換圖前
  const KEY = ['cloud_a', 'cloud_b', 'cloud_c', 'tree', 'doghouse', 'lamp', 'cat_tree', 'planter', 'coral']
  let total = 0, baseTotal = 0
  // 4.0-B1：只比換圖前就有的素材（外殼是新素材，邊緣偏色在 tests-archive/v400b1 檢查）
  for (const k of Object.keys(man.frames).filter((k) => k in base)) {
    const f = F(k)
    const rgba = Buffer.alloc(f.w * f.h * 4)
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) rgba.set(f.rgba(x, y), (y * f.w + x) * 4)
    const c = pa.edgeMagentaCount({ w: f.w, h: f.h, rgba })
    const b = base[k] ?? 0
    total += c
    baseTotal += b
    // 計數也會算到真正的紅、粉紅、紫色輪廓（嘴、蘑菇、星星…），單張允許比換圖前多 2；指定物件不允許
    if (KEY.includes(k)) ok(c <= b, `${k} 邊緣洋紅偏色 ${c} ≤ 換圖前 ${b}`)
    else ok(c <= b + 2, `${k} 邊緣洋紅偏色 ${c} ≤ 換圖前 ${b} + 2`)
  }
  ok(total <= baseTotal, `全部素材邊緣洋紅偏色合計 ${total} ≤ 換圖前 ${baseTotal}`)
  // 去邊只改顏色：同一個像素不會變透明（尺寸與輪廓已在第 1、2 項檢查）
  const t = { w: 3, h: 1, rgba: Buffer.from([0, 0, 0, 255, 120, 30, 120, 255, 0, 0, 0, 0]) }
  pa.defringeEdges(t)
  eq([t.rgba[3], t.rgba[7], t.rgba[11]], [255, 255, 0], '去邊不改透明度')
  // 真正的紫色、粉紅不被改：內部不動、邊緣的薰衣草紫與粉紅（和鄰色不在洋紅連線上）不動
  const keep = (P, N) => { const s = { w: 2, h: 1, rgba: Buffer.from([...N, 255, ...P, 255]) }; pa.defringeEdges(s); return [...s.rgba.subarray(4, 7)] }
  eq(keep([110, 70, 190], [80, 50, 160]), [110, 70, 190], '邊緣的薰衣草紫不被改')
  eq(keep([230, 90, 170], [200, 60, 140]), [230, 90, 170], '邊緣的粉紅不被改')
  eq(keep([169, 40, 232], [56, 111, 223]), [56, 111, 223], '藍色輪廓混洋紅的藍紫點改成輪廓色')
  eq(keep([45, 0, 48], [20, 12, 10]), [20, 12, 10], '黑色輪廓混洋紅的暗紫點改成暗輪廓色')
}

if (fails.length) {
  console.log(fails.slice(0, 60).join('\n'))
  console.log(`v4.0-R 素材一致性測試：${n} 項中失敗 ${fails.length} 項`)
  process.exit(1)
}
console.log(`v4.0-R 素材一致性測試：${n} 項全部通過（寵物 ${petFrames} 格、素材 ${Object.keys(man.frames).length} 張）`)
