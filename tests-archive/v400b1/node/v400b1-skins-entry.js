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
  for (const k of Object.keys(cur)) if (!base[k]) ok(keys.includes(k) || k === 'sil_house_atlantis' || k === 'sil_tower_atlantis' || /^env_|^decor_themes$/.test(man.frames[k]?.atlas ?? ''), `新增的 ${k} 是外殼、亞特蘭提斯剪影或 B2 的環境主題／主題裝飾`)
  console.log(`預設素材和階段 R 完成時相同 ${same} 張`)
}

// ---- 6. 亞特蘭提斯 ----
eq(SKINS.filter((s) => s.legend).map((s) => s.id), ['house.gold', 'tower.gold'], '傳說外觀 id 不變（house.gold、tower.gold）')
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

// ---- 7. 停點 2：外觀資料、商品、購買與切換、逐主題幾何 ----
{
  const { SKIN_PARTS, SKIN_PART_GROUP, equippedSkinDef } = await import('../../../src/farm/config/skins.ts')
  const SHOP = await import('../../../src/farm/config/shop.ts')
  const SIM = await import('../../../src/farm/sim/shop.ts')
  const BU = await import('../../../src/farm/pixel/buildingUse.ts')
  const { ENVELOPES } = await import('../../../src/farm/pixel/envelopes.ts')
  const { BALANCE } = await import('../../../src/farm/config/balance.ts')
  const shopSkins = SKINS.filter((d) => !d.legend)
  eq(shopSkins.length, 40, '商店外觀 40 款（房子 5、鐘樓 5、池塘 6、公佈欄 6、狗窩 6、貓跳台 6、食盆 6）')
  eq(SKINS.filter((d) => d.legend).map((d) => d.id), ['house.gold', 'tower.gold'], '傳說外觀只有亞特蘭提斯房屋、鐘樓')
  for (const d of SKINS) for (const f of Object.values(d.frames)) eq(man.frames[f]?.atlas, SKIN_ATLAS[d.part], `${d.id} 的 ${f} 在 ${SKIN_ATLAS[d.part]}`)
  const items = SHOP.SHOP_ITEMS.filter((it) => it.grant.type === 'skin' && it.grant.slot !== 'env') // 4.0-B2：環境主題也是 skin 商品，另測
  eq(items.length, 40, '商品表有 40 個外觀商品')
  ok(!items.some((it) => it.grant.skin === 'house.gold' || it.grant.skin === 'tower.gold'), '亞特蘭提斯房屋、鐘樓不在商店賣')
  const PRICE = { house: 30, tower: 30, pond: 30, board: 30, kennel: BALANCE.buildings.price.kennel, catTree: BALANCE.buildings.price.catTree, bowls: BALANCE.buildings.price.bowls }
  for (const it of items) {
    const d = skinDef(it.grant.skin)
    eq([it.category, it.group, it.price, it.grant.slot, it.maxOwned, it.repeatable], ['building', SKIN_PART_GROUP[d.part], PRICE[d.part], d.part, 1, false], `${it.id} 分類、小標題、價格、部位`)
    eq(it.requires ?? [], ['kennel', 'catTree', 'bowls'].includes(d.part) ? [{ building: d.part }] : [], `${it.id} 前置條件`)
  }
  eq([PRICE.kennel, PRICE.catTree, PRICE.bowls], [20, 20, 10], '小建築外殼 = 本體價（狗窩 20、貓跳台 20、食盆 10）')
  // 購買與切換（純函式）
  const T = Date.now()
  const base = { schemaVersion: 5, dataRev: 6, points: 100, lastSeen: T, pets: [], ownedBuildings: [], skins: { owned: [], equipped: {} }, shop: { decor: [], nextDecorId: 1 } }
  const r1 = SIM.purchase(base, 'skin.kennel.forest')
  ok(!r1.ok && r1.error.includes('狗窩'), '沒有狗窩不能買狗窩外殼：' + r1.error)
  const r2 = SIM.purchase(base, 'skin.house.forest')
  ok(r2.ok && r2.save.points === 70 && r2.save.skins.equipped.house === 'house.forest', '買房子外裝：扣 30、立刻換上')
  const r3 = SIM.purchase(r2.save, 'skin.house.forest')
  ok(!r3.ok, '同一款不能買兩次')
  const off = SIM.equipSkin(r2.save, 'house', null)
  ok(!('house' in off.skins.equipped) && off.skins.owned.includes('house.forest'), '換回原樣：仍擁有')
  eq(SIM.equipSkin(off, 'house', 'house.magic'), off, '沒擁有的不能穿')
  const b2 = SIM.purchase({ ...base, ownedBuildings: ['bowls'] }, 'skin.bowls.magic')
  ok(b2.ok && b2.save.points === 90, '有食盆可以買食盆外殼（10）')
  eq(equippedSkinDef({ house: 'tower.gold' }, 'house'), undefined, '穿在錯的部位的外觀不算')
  // 逐主題幾何：門洞裁切在狗窩的不透明像素上、窩內位置在門洞裡；座位在平台上；水面在池塘裡
  const opaqueAll = (k, rects) => { const f = man.frames[k]; let bad = 0; for (const r of rects) for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) if (x < 0 || y < 0 || x >= f.w || y >= f.h) bad++; return bad }
  const atlasPx = {}
  const sharpR = (await import('node:module')).createRequire(ROOT + '/package.json')('sharp')
  const pix = async (k) => { const f = man.frames[k]; if (!atlasPx[f.atlas]) { const { data, info } = await sharpR(join(ROOT, 'public', 'assets', man.atlases[f.atlas].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); atlasPx[f.atlas] = { data, w: info.width } } const a = atlasPx[f.atlas]; return (x, y) => a.data[((f.y + y) * a.w + f.x + x) * 4 + 3] > 0 }
  eq(BU.kennelGeomFrom(null), { clip: BU.KENNEL_DOOR_CLIP, insideRight: BU.KENNEL_INSIDE_RIGHT, insideBottom: BU.KENNEL_INSIDE_BOTTOM, doorCx: BU.KENNEL_DOOR_CX }, '沒穿外殼 = 預設門洞')
  for (const t of ms.THEMES) {
    const k = `doghouse_${t}`
    const g = BU.kennelGeomFrom(man.frames[k].meta.door)
    const on = await pix(k)
    let solid = 0, tot = 0
    for (const r of g.clip) for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) { tot++; if (on(x, y)) solid++ }
    eq(opaqueAll(k, g.clip), 0, `${k} 門洞裁切在素材範圍內`)
    ok(solid === tot, `${k} 門洞裁切範圍全部是不透明像素（門洞裡面，${solid}/${tot}）`)
    ok(Math.abs(man.frames[k].meta.door.dx) <= 3 && Math.abs(man.frames[k].meta.door.dyTop) <= 3 && Math.abs(man.frames[k].meta.door.dyFront) <= 4, `${k} 門洞和預設差不大 ${JSON.stringify(man.frames[k].meta.door)}`)
    const c = `cat_tree_${t}`
    const cg = BU.catTreeGeomFrom(man.frames[c].meta.seats)
    const onc = await pix(c)
    for (const [n, s] of [['頂層', cg.top], ['中層', cg.mid]]) ok(onc(s.x, s.y - 1) || onc(s.x, s.y), `${c} ${n}座位 (${s.x},${s.y}) 腳底在平台上`)
    const p = `pond_${t}`
    const w = man.frames[p].meta.water
    const onp = await pix(p)
    ok(w.cx - w.rx >= 0 && w.cx + w.rx <= 110 && w.cy - w.ry >= 0 && w.cy + w.ry <= 79 && onp(w.cx, w.cy), `${p} 水面 ${JSON.stringify(w)} 在池塘裡`)
  }
  // seatsOf 跟著外殼幾何；設回 null 就是預設
  const slot = { id: 'kennel', x: 200, y: 280, w: 99, h: 83 }
  const d0 = BU.seatsOf('kennel', slot, 'sleep')[0]
  BU.setSkinGeometry(man.frames.doghouse_punk.meta.door, man.frames.cat_tree_magic.meta.seats)
  const d1 = BU.seatsOf('kennel', slot, 'sleep')[0]
  const c1 = BU.seatsOf('catTree', { ...slot, id: 'catTree', w: 72, h: 90 }, 'sleep')[0]
  BU.setSkinGeometry(null, null)
  ok(d1.y === d0.y + man.frames.doghouse_punk.meta.door.dyFront && d1.x === d0.x + man.frames.doghouse_punk.meta.door.dx, '狗窩外殼的窩內座位跟著門洞')
  eq(c1.y - (280 - 90), BU.CAT_TREE_TOP_SEAT.y + man.frames.cat_tree_magic.meta.seats.dyTop, '貓跳台外殼的頂層座位跟著平台')
  eq(BU.seatsOf('kennel', slot, 'sleep')[0], d0, '設回預設後座位和原本相同')
  eq([ENVELOPES.bowls.w, ENVELOPES.bowls.h, ENVELOPES.bowls.ay], [57, 31, 31], '食盆輪廓聯集高 31（外殼比預設高）')
  for (const part of SKIN_PARTS) ok(SKIN_PART_GROUP[part].length > 0, `${part} 有商店小標題`)
}

if (fails.length) {
  console.log(fails.slice(0, 60).join('\n'))
  console.log(`v4.0-B1 外殼測試：${n} 項中失敗 ${fails.length} 項`)
  process.exit(1)
}
console.log(`窗戶偵測不可靠、要人工看疊圖的：${manual.join('、')}`)
console.log(`v4.0-B1 外殼測試：${n} 項全部通過`)
