// 4.0-B1 停點 1：主題外殼進管線、亞特蘭提斯取代全黃金
//  1. scripts/measure-skins.mjs 重跑的結果 = skins-measure.json（數字可重現）
//  2. 外殼：60 張都有、在自己部位的圖集、畫布 = 部位大小、內容不超過畫布、洋紅殘留 0；鐘樓同主題關門／開門鐘面相同
//  3. 窗戶自動偵測：森林、龐克、野餐 = high（測試保證）；亞特蘭提斯、無塵室、魔法 = 不可靠（人工看疊圖），只記錄
//  4. measure-skins 的共用點擊區 = layout.ts 的常數
//  5. 預設外觀：除了移除的全黃金 7 張，其餘素材和階段 R 完成時（r-frames.json）逐像素相同
//  6. 亞特蘭提斯：外觀 id 不變、名稱、鍵名、圖集、剪影、事件文案；src 裡沒有「金色屋頂」「黃金鐘樓」；沒有舊的 skins 圖集
import '../../calendar-tweaks/node/env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import { LAZY_ATLASES } from '../../../src/farm/pixel/assets.ts'
import { SKINS, SKIN_ATLAS, skinDef, skinAtlasesFor } from '../../../src/farm/config/skins.ts'
import { REWARD_SILHOUETTE } from '../../../src/farm/config/items.ts'
import { eventDef } from '../../../src/farm/config/events.ts'

const ROOT = process.env.REPO_ROOT
const ms = await import(pathToFileURL(ROOT + '/scripts/measure-skins.mjs').href)
const { frameHashes } = await import(pathToFileURL(ROOT + '/tests-archive/v400b1/frame-hashes.mjs').href)
let n = 0
const fails = []
const ok = (c, m) => { n++; if (!c) fails.push(m) }
const eq = (a, b, m) => { n++; try { assert.deepEqual(a, b) } catch { fails.push(`${m}：實際 ${JSON.stringify(a).slice(0, 300)}，預期 ${JSON.stringify(b).slice(0, 300)}`) } }

// ---- 1. 量測可重現 ----
const now = await ms.measure()
const saved = JSON.parse(readFileSync(join(ROOT, 'tests-archive', 'v400b1', 'skins-measure.json'), 'utf8'))
eq(now, saved, 'measure-skins 重跑 = skins-measure.json')

// ---- 2. 外殼 ----
const CANVAS = { house: [139, 134], tower: [123, 160], pond: [110, 79], board: [64, 50], doghouse: [99, 83], cat_tree: [72, 90], bowls: [57, 31] }
const ATLAS = { house: 'skins_house', tower: 'skins_tower', pond: 'skins_pond', board: 'skins_board', doghouse: 'skins_small', cat_tree: 'skins_small', bowls: 'skins_small' }
const keys = ms.skinKeys()
eq(keys.length, 60, '外殼 60 張（住家 18、鐘樓 12、池塘 6、公佈欄 6、狗窩 6、貓跳台 6、食盆 6）')
for (const k of keys) {
  const f = now.frames[k]
  ok(f, `${k} 有輸出`)
  if (!f) continue
  const part = k.startsWith('cat_tree_') ? 'cat_tree' : k.split('_')[0]
  eq(f.atlas, ATLAS[part], `${k} 在圖集 ${ATLAS[part]}`)
  eq([f.w, f.h, f.ax, f.ay], [...CANVAS[part], Math.round(CANVAS[part][0] / 2), CANVAS[part][1]], `${k} 畫布與錨點 = 部位預設`)
  ok(f.content && f.content.x0 >= 0 && f.content.x1 <= f.w && f.content.y1 === f.h, `${k} 內容貼底、不超過畫布`)
  ok(f.content.x1 - f.content.x0 >= f.w - 2 && f.content.y1 - f.content.y0 >= f.h - 2, `${k} 內容填滿畫布（最多少 2 像素）：${JSON.stringify(f.content)}`)
  // keepEnclosed（保留內部洋紅畫作）的外殼：魔法住家的洋紅屋瓦用的就是底色 #FF00FF，碰到外緣的 2～6 個分不出是殘留還是畫作，允許 ≤ 6；其他一律 0
  if (f.keepEnclosed) ok(f.magentaNear <= 6, `${k} 外緣純洋紅 ${f.magentaNear} ≤ 6（內部保留 ${f.magentaInterior}）`)
  else eq(f.magentaNear, 0, `${k} 洋紅殘留 0`)
}
for (const t of ms.THEMES) eq(now.frames[`tower_${t}_open`].meta.clock, now.frames[`tower_${t}`].meta.clock, `tower_${t} 關門與開門鐘面相同（換開門版時鐘面不跳）`)
for (const t of ms.THEMES) for (const k of [`tower_${t}`, `tower_${t}_open`]) { const c = now.frames[k].meta.clock; ok(Number.isInteger(c.cx) && Number.isInteger(c.cy) && Number.isInteger(c.r) && Math.abs(c.cx - 62) <= 1 && Math.abs(c.cy - 82) <= 1, `${k} 鐘面 ${JSON.stringify(c)} 是整數、離預設 (62,82) 1 像素內`) }
// 圖集只放自己部位的素材
const A = join(ROOT, 'public', 'assets')
const man = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
for (const [k, f] of Object.entries(man.frames)) if (f.atlas.startsWith('skins_')) ok(keys.includes(k), `${f.atlas} 裡的 ${k} 是外殼`)
ok(!man.atlases.skins, '沒有舊的 skins 圖集')
for (const g of new Set(Object.values(ATLAS))) ok(LAZY_ATLASES.includes(g), `${g} 延後載入`)
for (const g of new Set(Object.values(ATLAS))) ok(statSync(join(A, man.atlases[g].file)).size < 1024 * 1024, `${g} 檔案小於 1 MB（實際 ${Math.round(statSync(join(A, man.atlases[g].file)).size / 1024)} KB）`)

// ---- 3. 窗戶偵測 ----
for (const t of ['forest', 'punk', 'plaid']) for (const k of [`tower_${t}`, `tower_${t}_open`]) eq(now.frames[k].window.confidence, 'high', `${k} 窗玻璃在 TOWER_WINDOW 裡（自動偵測 high）`)
const manual = ['atlantis', 'cleanroom', 'magic'].flatMap((t) => [`tower_${t}`, `tower_${t}_open`]).map((k) => `${k}=${now.frames[k].window.confidence}`)

// ---- 4. 共用點擊區 ----
eq(ms.SHARED.TOWER_WINDOW, LAY.TOWER_WINDOW, 'measure-skins 的 TOWER_WINDOW = layout.ts')
eq(ms.SHARED.TOWER_DOOR, LAY.TOWER_DOOR, 'measure-skins 的 TOWER_DOOR = layout.ts')
eq(ms.SHARED.DOOR, LAY.DOOR, 'measure-skins 的 DOOR = layout.ts')

// ---- 5. 預設外觀逐像素相同 ----
{
  const base = JSON.parse(readFileSync(join(ROOT, 'tests-archive', 'v400b1', 'r-frames.json'), 'utf8'))
  const cur = await frameHashes(ROOT)
  const REMOVED = ['house_gold_closed', 'house_gold_open', 'house_gold_night', 'clocktower_gold', 'clocktower_open_gold', 'sil_house_gold', 'sil_tower_gold']
  let same = 0
  for (const [k, v] of Object.entries(base)) {
    if (REMOVED.includes(k)) { ok(!cur[k], `${k} 已移除`); continue }
    eq(cur[k], v, `${k} 和階段 R 完成時相同`)
    if (JSON.stringify(cur[k]) === JSON.stringify(v)) same++
  }
  for (const k of Object.keys(cur)) if (!base[k]) ok(keys.includes(k) || k === 'sil_house_atlantis' || k === 'sil_tower_atlantis', `新增的 ${k} 是外殼或亞特蘭提斯剪影`)
  console.log(`預設素材和階段 R 完成時相同 ${same} 張`)
}

// ---- 6. 亞特蘭提斯 ----
eq(SKINS.map((s) => s.id), ['house.gold', 'tower.gold'], '外觀 id 不變')
eq(skinDef('house.gold').name, '亞特蘭提斯房屋', '房屋名稱')
eq(skinDef('tower.gold').name, '亞特蘭提斯鐘樓', '鐘樓名稱')
eq(skinDef('house.gold').frames, { closed: 'house_atlantis_closed', open: 'house_atlantis_open', night: 'house_atlantis_night' }, '房屋鍵名')
eq(skinDef('tower.gold').frames, { closed: 'tower_atlantis', open: 'tower_atlantis_open' }, '鐘樓鍵名')
for (const s of SKINS) for (const f of Object.values(s.frames)) eq(man.frames[f]?.atlas, SKIN_ATLAS[s.part], `${s.id} 的 ${f} 在 ${SKIN_ATLAS[s.part]}`)
eq(skinAtlasesFor({ house: 'house.gold', tower: 'tower.gold', env: 'env.x' }).sort(), ['skins_house', 'skins_tower'], '穿著的外觀要載入的圖集')
eq(skinAtlasesFor({}), [], '沒穿外觀不載入')
eq(REWARD_SILHOUETTE, { dog: 'sil_house_atlantis', cat: 'sil_tower_atlantis' }, '剪影鍵名')
for (const k of Object.values(REWARD_SILHOUETTE)) eq(man.frames[k]?.atlas, 'items', `${k} 在必載的 items 圖集`)
eq(eventDef('dogVault').body(100), '裡面有 100 金幣，還有一張亞特蘭提斯房屋的設計圖。住家換成亞特蘭提斯房屋了。', '房屋事件文案')
eq(eventDef('catAtlantis').body(100), '雷射與山銅合而為一，鐘樓變成亞特蘭提斯鐘樓了。獲得 100 金幣。', '鐘樓事件文案')
{
  const bad = []
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f.name) && /金色屋頂|黃金鐘樓|house_gold|clocktower_gold/.test(readFileSync(p, 'utf8'))) bad.push(p) } }
  walk(join(ROOT, 'src'))
  eq(bad, [], 'src 裡沒有「金色屋頂」「黃金鐘樓」與 gold 鍵名')
}

if (fails.length) {
  console.log(fails.slice(0, 60).join('\n'))
  console.log(`v4.0-B1 外殼測試：${n} 項中失敗 ${fails.length} 項`)
  process.exit(1)
}
console.log(`窗戶偵測不可靠、要人工看疊圖的：${manual.join('、')}`)
console.log(`v4.0-B1 外殼測試：${n} 項全部通過`)
