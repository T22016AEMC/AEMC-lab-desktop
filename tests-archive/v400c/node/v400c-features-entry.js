// 4.0 階段 C：晴天娃娃（天氣機率）、房屋與鐘樓配件、傳說展示台
//  1. 天氣：有娃娃／沒娃娃的機率（絕對值 −5%／+5%、其他不變）；沒娃娃和以前逐筆相同；worldWeather 是唯一入口（6 處呼叫都走它）
//  2. 配件資料：8 件（價格 10／3／6／3）、位置（掛點）、商店分組、購買／掛上／切換／取下、買一次、存檔來回、舊存檔相容、圖集 acc
//  3. 配件位置：逐外觀（房屋 3 狀態×7、鐘樓 7）不蓋門、窗點擊區與鐘面
//  4. 傳說展示台：事件（任一對集齊送一個、只送一次、載入補送、半對不送、不給金幣）、台面顯示（先集齊的那一對、兩對都集齊可切換）、不佔 decorTotal、可擺放
import '../../calendar-tweaks/node/env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseSave, cleanShop, cleanFarmLayout } from '../../../src/farm/save/migrate.ts'
import { INSTANCE_KINDS, parseInstanceId } from '../../../src/farm/config/layoutItems.ts'
import { SHOP_ITEMS, SHOP_LIMITS, itemsOf } from '../../../src/farm/config/shop.ts'
import { ACCESSORIES, ACC_SLOTS, ACC_SLOT_GROUP, ACC_MOUNT, ACC_ATLAS, ACC_DOLL, accDef, hasSunnyDoll } from '../../../src/farm/config/accessories.ts'
import { LEGEND_STAND_KIND, LEGEND_STAND_EVENT, LEGEND_STAND_VIEW_FLAG, PAIR_ITEMS, legendStandView, pairDone } from '../../../src/farm/config/legendStand.ts'
import { EVENTS, RETRO_EVENT_IDS, eventDef } from '../../../src/farm/config/events.ts'
import { skinAtlasesFor } from '../../../src/farm/config/skins.ts'
import { SKINS } from '../../../src/farm/config/skins.ts'
import { weatherAt, SUNNY_DOLL_SHIFT } from '../../../src/farm/sim/worldTime.ts'
import { worldWeather, overrides } from '../../../src/farm/overrides.ts'
import { BALANCE } from '../../../src/farm/config/balance.ts'
import { purchase, equipSkin, decorTotal } from '../../../src/farm/sim/shop.ts'
import { checkEvents, retroEvents } from '../../../src/farm/sim/dig.ts'
import { LAZY_ATLASES } from '../../../src/farm/pixel/assets.ts'
import { ENVELOPES } from '../../../src/farm/pixel/envelopes.ts'
import { KIND_GEOM, resolvePlacement } from '../../../src/farm/pixel/placement.ts'
import * as LAY from '../../../src/farm/pixel/layout.ts'

const ROOT = process.env.REPO_ROOT
const mg = await import(pathToFileURL(ROOT + '/tests-archive/v400b2/measure-glow.mjs').href)
let n = 0
const fails = []
const ok = (c, m) => { n++; if (!c) fails.push(m) }
const eq = (a, b, m) => { n++; try { assert.deepEqual(a, b) } catch { fails.push(`${m}：實際 ${JSON.stringify(a).slice(0, 300)}，預期 ${JSON.stringify(b).slice(0, 300)}`) } }
const report = []

const T0 = new Date(2026, 10, 19, 12, 0, 0).getTime()
const today = '2026-11-19'
const pet = (id, species, variant) => ({ id, species, variant, name: id, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 80, mood: 80, cleanliness: 80, personality: 'lively', lastInteract: T0 })
const RAW = (extra = {}) => ({
  schemaVersion: 5, dataRev: 6, points: 1000, lastSeen: T0, lastDailyClaim: today, gifts: { date: today, count: 0 }, nextPetId: 3, createdAt: T0 - 9e8,
  pets: [pet('d1', 'dog', 'shiba'), pet('c1', 'cat', 'tabby')], ownedBuildings: [], earning: { date: today, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 },
  bowl: { date: today, used: 0 }, collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: today, count: 0, lastEnd: 0 }, ...extra,
})
const S = (extra) => parseSave(RAW(extra))
const buy = (s, id) => { const r = purchase(s, id); assert.ok(r.ok, `買 ${id} 應該成功：${r.error}`); return r.save }
const DOG = { L001: 1, L002: 1 }, CAT = { L003: 1, L004: 1 }

// ================= 1. 天氣 =================
{
  const W = BALANCE.weatherWeights
  const total = W.sunny + W.cloudy + W.rain + W.snow
  const base = { sunny: W.sunny / total, cloudy: W.cloudy / total, rain: W.rain / total, snow: W.snow / total }
  eq(SUNNY_DOLL_SHIFT, 0.05, '1 娃娃的調整是絕對值 5%')
  const freq = (doll) => {
    const c = { sunny: 0, cloudy: 0, rain: 0, snow: 0 }
    const N = 400000
    for (let b = 0; b < N; b++) c[weatherAt(b * BALANCE.weatherBlockHours * 3_600_000 + 12345, doll)]++
    return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / N]))
  }
  const f0 = freq(false), f1 = freq(true)
  report.push(`1 沒娃娃 晴 ${(f0.sunny * 100).toFixed(2)}／雲 ${(f0.cloudy * 100).toFixed(2)}／雨 ${(f0.rain * 100).toFixed(2)}／雪 ${(f0.snow * 100).toFixed(2)}；有娃娃 晴 ${(f1.sunny * 100).toFixed(2)}／雲 ${(f1.cloudy * 100).toFixed(2)}／雨 ${(f1.rain * 100).toFixed(2)}／雪 ${(f1.snow * 100).toFixed(2)}（40 萬個天氣區段）`)
  for (const k of ['sunny', 'cloudy', 'rain', 'snow']) {
    ok(Math.abs(f0[k] - base[k]) < 0.004, `1 沒娃娃 ${k} 機率 ${(f0[k] * 100).toFixed(2)}% ≈ ${(base[k] * 100).toFixed(0)}%`)
    const want = k === 'sunny' ? base.sunny + 0.05 : k === 'rain' ? base.rain - 0.05 : base[k]
    ok(Math.abs(f1[k] - want) < 0.004, `1 有娃娃 ${k} 機率 ${(f1[k] * 100).toFixed(2)}% ≈ ${(want * 100).toFixed(0)}%（絕對值，不是相對比例）`)
  }
  ok(Math.abs((f1.sunny - f0.sunny) - 0.05) < 0.006 && Math.abs((f0.rain - f1.rain) - 0.05) < 0.006, '1 晴天 +5 個百分點、下雨 −5 個百分點')
  ok(Math.abs(f1.cloudy - f0.cloudy) < 0.006 && Math.abs(f1.snow - f0.snow) < 0.004, '1 多雲、下雪的機率不變')
  // 沒娃娃 = 舊公式（逐區段相同）
  const oldAt = (ms) => {
    const hash32 = (x) => { let h = (x | 0) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0 }
    const block = Math.floor(ms / (BALANCE.weatherBlockHours * 3_600_000))
    let r = (hash32(block) / 4294967296) * total
    for (const k of ['sunny', 'cloudy', 'rain', 'snow']) { if (r < W[k]) return k; r -= W[k] }
    return 'sunny'
  }
  let same = 0
  for (let b = 0; b < 20000; b++) { const ms = b * 3_600_000 * 4 + 777; if (weatherAt(ms, false) === oldAt(ms) && weatherAt(ms) === oldAt(ms)) same++ }
  eq(same, 20000, '1 沒有娃娃時每個天氣區段和舊公式相同')
  ok(base.rain >= 0.05, '1 下雨機率 ≥ 5%（減 5 個百分點不會變負）')
  // worldWeather：存檔有掛娃娃 → 有加成；沒掛（只買沒掛）、沒存檔 → 沒有
  const withDoll = S({ skins: { owned: [ACC_DOLL], equipped: { houseDoll: ACC_DOLL } } })
  const owned = S({ skins: { owned: [ACC_DOLL], equipped: {} } })
  const none = S()
  eq([hasSunnyDoll(withDoll), hasSunnyDoll(owned), hasSunnyDoll(none), hasSunnyDoll(null), hasSunnyDoll(undefined)], [true, false, false, false, false], '1 hasSunnyDoll：掛著才算')
  let dl = 0, nd = 0
  for (let b = 0; b < 5000; b++) {
    const ms = b * 3_600_000 * 4 + 999
    eq(worldWeather(ms, withDoll), weatherAt(ms, true), '1 worldWeather(有娃娃) = weatherAt(…, true)')
    eq(worldWeather(ms, none), weatherAt(ms, false), '1 worldWeather(沒娃娃) = weatherAt(…, false)')
    if (worldWeather(ms, withDoll) === 'rain') dl++
    if (worldWeather(ms, owned) === 'rain') nd++
  }
  ok(dl < nd, `1 掛娃娃下雨較少（${dl} < ${nd}）`)
  overrides.weather = 'snow'
  eq(worldWeather(1, withDoll), 'snow', '1 測試模式的 overrides.weather 優先')
  overrides.weather = null
  // 6 處呼叫都走同一個函式：src 裡沒有人直接呼叫 weatherAt（只有 worldTime.ts 定義、overrides.ts 使用）；worldWeather 的呼叫剛好 6 處、都傳存檔
  const files = []
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p) } }
  walk(join(ROOT, 'src'))
  const calls = []
  for (const f of files) {
    const t = readFileSync(f, 'utf8')
    const rel = f.slice(ROOT.length + 1).split('\\').join('/')
    for (const m of t.matchAll(/\bweatherAt\(/g)) if (!/sim\/worldTime\.ts$|farm\/overrides\.ts$/.test(rel)) fails.push(`1 ${rel} 直接呼叫 weatherAt（天氣只能走 worldWeather）`)
    for (const m of t.matchAll(/\bworldWeather\(([^)]*)\)/g)) if (!/farm\/overrides\.ts$/.test(rel)) calls.push([rel, m[1]])
  }
  n++
  eq(calls.length, 6, '1 worldWeather 的呼叫剛好 6 處（PicnicButton、index.tsx×3、farmStore×2）')
  eq(calls.map((c) => c[0]).sort(), ['src/components/PicnicButton.tsx', 'src/farm/index.tsx', 'src/farm/index.tsx', 'src/farm/index.tsx', 'src/farm/store/farmStore.ts', 'src/farm/store/farmStore.ts'], '1 6 處的位置')
  for (const [rel, a] of calls) ok(/,/.test(a) && /(save|next|st\.save)\s*$/.test(a.trim()), `1 ${rel} 的 worldWeather(${a}) 傳了存檔`)
}

// ================= 2. 配件資料、商店、存檔 =================
{
  eq(ACCESSORIES.map((d) => [d.id, d.slot, d.part, d.price]), [
    ['acc.doll', 'houseDoll', 'house', 10], ['acc.sign_home', 'houseSign', 'house', 3], ['acc.sign_paw', 'houseSign', 'house', 3], ['acc.sign_lab', 'houseSign', 'house', 3],
    ['acc.bellman', 'towerBellman', 'tower', 6], ['acc.flag_paw', 'towerFlag', 'tower', 3], ['acc.flag_clock', 'towerFlag', 'tower', 3], ['acc.flag_aemc', 'towerFlag', 'tower', 3],
  ], '2 8 件配件：晴天娃娃 10、門牌 A／B／C 各 3、敲鐘人 6、旗幟 A／B／C 各 3')
  eq(ACCESSORIES.map((d) => d.name), ['晴天娃娃', 'HOME 門牌', '貓爪狗骨頭門牌', 'AEMC LAB 門牌', '敲鐘人', '腳印旗幟', '時鐘旗幟', 'AEMC 旗幟'], '2 名稱（門牌 A HOME、B 貓爪狗骨頭、C AEMC LAB；旗幟 A 腳印、B 時鐘、C AEMC）')
  eq(ACC_SLOTS, ['houseDoll', 'houseSign', 'towerBellman', 'towerFlag'], '2 四個掛點')
  ok(ACCESSORIES.every((d) => d.id.length <= 40 && d.id.startsWith('acc.')), '2 id 短於 40 字（存檔 skins.owned 的限制）')
  ok(!SKINS.some((d) => d.id.startsWith('acc.')) && ACCESSORIES.every((d) => !accDef(d.id) === false), '2 配件不是建築外殼（SKINS 沒有）')
  // 商店
  const items = SHOP_ITEMS.filter((it) => it.grant.type === 'skin' && it.grant.skin.startsWith('acc.'))
  eq(items.length, 8, '2 商店有 8 件配件')
  for (const it of items) {
    const d = accDef(it.grant.skin)
    eq([it.category, it.group, it.price, it.repeatable, it.maxOwned, it.grant.slot, it.sprite, it.requires], ['building', ACC_SLOT_GROUP[d.slot], d.price, false, 1, d.slot, d.frame, undefined], `2 ${it.id} 建築分類內分組、買一次、掛點 ${d.slot}`)
  }
  eq([...new Set(items.map((it) => it.group))], ['房屋配件：晴天娃娃', '房屋配件：門牌', '鐘樓配件：敲鐘人', '鐘樓配件：旗幟'], '2 四個分組')
  ok(itemsOf('building').every((it) => it.grant.type === 'building' || it.grant.type === 'skin'), '2 建築分類只有建築與外觀')
  // 購買、掛上、切換、取下
  let s = S({ points: 100 })
  s = buy(s, 'skin.acc.doll')
  eq([s.points, s.skins.owned, s.skins.equipped], [90, ['acc.doll'], { houseDoll: 'acc.doll' }], '2 買晴天娃娃：扣 10、立刻掛上')
  ok(!purchase(s, 'skin.acc.doll').ok && purchase(s, 'skin.acc.doll').error.includes('已經擁有'), '2 晴天娃娃限買 1 個')
  s = buy(s, 'skin.acc.sign_home')
  s = buy(s, 'skin.acc.sign_paw')
  eq([s.points, s.skins.equipped.houseSign, s.skins.owned.length], [84, 'acc.sign_paw', 3], '2 買兩個門牌各 3；後買的掛上（同時只能掛一個）')
  s = equipSkin(s, 'houseSign', 'acc.sign_home')
  eq([s.points, s.skins.equipped.houseSign], [84, 'acc.sign_home'], '2 切換門牌不扣金幣')
  ok(equipSkin(s, 'houseSign', 'acc.sign_lab') === s, '2 沒擁有的門牌不能掛')
  s = equipSkin(s, 'houseSign', null)
  ok(!('houseSign' in s.skins.equipped) && s.skins.owned.includes('acc.sign_home'), '2 取下門牌：仍擁有')
  s = buy(s, 'skin.acc.bellman')
  s = buy(s, 'skin.acc.flag_clock')
  s = buy(s, 'skin.acc.flag_aemc')
  eq([s.points, s.skins.equipped.towerBellman, s.skins.equipped.towerFlag], [84 - 6 - 3 - 3, 'acc.bellman', 'acc.flag_aemc'], '2 敲鐘人 6、旗幟各 3；旗幟同時只能掛一個')
  eq(skinAtlasesFor(s.skins.equipped), ['acc'], '2 掛著配件才載入圖集 acc')
  ok(LAZY_ATLASES.includes(ACC_ATLAS), '2 acc 延後載入')
  const poor = S({ points: 9 })
  ok(!purchase(poor, 'skin.acc.doll').ok && purchase(poor, 'skin.acc.doll').save === poor, '2 金幣不足：存檔不變')
  eq(parseSave(JSON.parse(JSON.stringify(s))).skins, s.skins, '2 存檔來回：配件擁有與掛上都保留')
  // 配件和建築外殼、環境主題互不影響
  let m = S({ points: 500, ownedBuildings: ['kennel'] })
  m = buy(m, 'skin.house.forest')
  m = buy(m, 'skin.acc.sign_lab')
  m = buy(m, 'env.forest')
  eq([m.skins.equipped.house, m.skins.equipped.houseSign, m.skins.equipped.env], ['house.forest', 'acc.sign_lab', 'env.forest'], '2 房屋外殼、門牌、環境主題各自生效')
  ok(!('houseSign' in equipSkin(m, 'houseSign', null).skins.equipped) && equipSkin(m, 'houseSign', null).skins.equipped.house === 'house.forest', '2 取下門牌不影響房屋外殼')
  // 舊存檔相容：沒有配件欄位照舊
  const old = S({ skins: { owned: ['house.gold', 'house.forest'], equipped: { house: 'house.gold' } } })
  eq(old.skins, { owned: ['house.gold', 'house.forest'], equipped: { house: 'house.gold' } }, '2 舊存檔（沒有配件）照舊讀進來')
  eq(skinAtlasesFor(old.skins.equipped), ['skins_house'], '2 舊存檔不載入 acc')
  const weird = S({ skins: { owned: ['acc.future', 'acc.doll'], equipped: { houseSign: 'acc.future', houseDoll: 'acc.doll', houseX: 'acc.gone' } } })
  eq(weird.skins, { owned: ['acc.future', 'acc.doll'], equipped: { houseSign: 'acc.future', houseDoll: 'acc.doll' } }, '2 以後新增的配件 id 先保留、沒擁有的拿掉')
  eq([accDef('acc.future'), accDef(undefined)], [undefined, undefined], '2 不認得的配件引擎略過')
  // 圖集
  const A = join(ROOT, 'public', 'assets')
  const man = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
  eq(Object.entries(man.frames).filter(([, f]) => f.atlas === ACC_ATLAS).map(([k]) => k).sort(), ACCESSORIES.map((d) => d.frame).sort(), '2 圖集 acc 只有這 8 張')
  ok(statSync(join(A, man.atlases[ACC_ATLAS].file)).size < 64 * 1024, '2 acc 圖集小於 64 KB')
  for (const d of ACCESSORIES) {
    const f = man.frames[d.frame]
    const top = d.slot === 'houseDoll' || d.slot === 'houseSign'
    ok(f && (top ? f.ay === 0 && f.ax === Math.round(f.w / 2) : f.ay === f.h && f.ax > 0 && f.ax < f.w), `2 ${d.frame} 錨點：${top ? '上方中心（掛點）' : '底部（旗桿底、腳底）'}`)
  }
  report.push('2 配件大小：' + ACCESSORIES.map((d) => `${d.name} ${man.frames[d.frame].w}×${man.frames[d.frame].h}`).join('、'))
  report.push('2 掛點（相對素材左上角）：' + ACC_SLOTS.map((k) => `${k} (${ACC_MOUNT[k].x}, ${ACC_MOUNT[k].y})`).join('、'))
}

// ================= 3. 配件位置：不蓋門、窗點擊區與鐘面（逐外觀） =================
{
  const A = join(ROOT, 'public', 'assets')
  const man = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
  const { crop } = await mg.loadFrames(ROOT)
  const THEMES = ['atlantis', 'cleanroom', 'forest', 'magic', 'punk', 'plaid']
  const houseKeys = ['house_closed', 'house_open', 'house_night', ...THEMES.flatMap((t) => ['closed', 'open', 'night'].map((x) => `house_${t}_${x}`))]
  const towerKeys = ['clocktower', 'clocktower_open', ...THEMES.flatMap((t) => [`tower_${t}`, `tower_${t}_open`])]
  eq([houseKeys.length, towerKeys.length], [21, 14], '3 房屋 21 張（7 外觀×3 狀態）、鐘樓 14 張（7 外觀×關門開門）')
  // 配件不透明像素的外框（相對素材左上角）
  const bbox = (slot) => {
    const d = ACCESSORIES.find((a) => a.slot === slot)
    const s = crop(d.frame)
    let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.rgba[(y * s.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    const m = ACC_MOUNT[slot]
    return { x0: m.x - s.ax + x0, x1: m.x - s.ax + x1 + 1, y0: m.y - s.ay + y0, y1: m.y - s.ay + y1 + 1 }
  }
  // 逐「掛出來的每個配件」× 每個外觀：和禁區（矩形）不相交；配件在素材畫布內
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
  for (const k of houseKeys) {
    const f = man.frames[k]
    const door = { x0: LAY.DOOR.x0 * f.w, x1: LAY.DOOR.x1 * f.w, y0: LAY.DOOR.y0 * f.h, y1: LAY.DOOR.y1 * f.h }
    for (const slot of ['houseDoll', 'houseSign']) {
      const b = bbox(slot)
      ok(b.x0 >= 0 && b.x1 <= f.w && b.y0 >= 0 && b.y1 <= f.h, `3 ${slot} 在 ${k} 畫布內（${JSON.stringify(b)}）`)
      ok(!hit(b, door), `3 ${slot} 不蓋 ${k} 的門點擊區`)
    }
  }
  for (const k of towerKeys) {
    const f = man.frames[k]
    const clock = f.meta.clock
    const clockBox = { x0: clock.cx - clock.r - LAY.TOWER_CLOCK_FRAME, x1: clock.cx + clock.r + LAY.TOWER_CLOCK_FRAME, y0: clock.cy - clock.r - LAY.TOWER_CLOCK_FRAME, y1: clock.cy + clock.r + LAY.TOWER_CLOCK_FRAME }
    const door = { x0: LAY.TOWER_DOOR.x0 * f.w, x1: LAY.TOWER_DOOR.x1 * f.w, y0: LAY.TOWER_DOOR.y0 * f.h, y1: LAY.TOWER_DOOR.y1 * f.h }
    const sign = { x0: LAY.TOWER_SIGN.x * f.w - LAY.TOWER_SIGN_HALF.w, x1: LAY.TOWER_SIGN.x * f.w + LAY.TOWER_SIGN_HALF.w, y0: LAY.TOWER_SIGN.y * f.h - LAY.TOWER_SIGN_HALF.h, y1: LAY.TOWER_SIGN.y * f.h + LAY.TOWER_SIGN_HALF.h }
    for (const slot of ['towerBellman', 'towerFlag']) {
      const b = bbox(slot)
      ok(b.x0 >= 0 && b.x1 <= f.w && b.y0 >= 0 && b.y1 <= f.h, `3 ${slot} 在 ${k} 畫布內（${JSON.stringify(b)}）`)
      for (const [name, r] of [['窗戶點擊區', LAY.TOWER_WINDOW], ['鐘面（含金框）', clockBox], ['塔門點擊區', door], ['招牌「遊戲」', sign]]) ok(!hit(b, r), `3 ${slot} 不蓋 ${k} 的${name}`)
    }
  }
  report.push('3 配件外框：' + ACC_SLOTS.map((k) => `${k} ${JSON.stringify(bbox(k))}`).join('；'))
}

// ================= 4. 傳說展示台 =================
{
  // 事件
  const ids = EVENTS.map((e) => e.id)
  const i = (id) => ids.indexOf(id)
  ok(i('catAtlantis') < i(LEGEND_STAND_EVENT) && i(LEGEND_STAND_EVENT) < i('colLegend'), '4 事件順序：傳說配對（狗、貓）→ 傳說展示台 → 傳說全集齊')
  const ev = eventDef(LEGEND_STAND_EVENT)
  eq([ev.kind, ev.coins, ev.retro, ev.decor, ev.skin, ev.images], ['reward', 0, true, LEGEND_STAND_KIND, undefined, []], '4 展示台事件：獎勵、0 金幣、載入時補送、送 legend_stand')
  ok(RETRO_EVENT_IDS.includes(LEGEND_STAND_EVENT), '4 載入補送清單有展示台')
  eq(RETRO_EVENT_IDS, ['colCommon', 'colUncommon', 'colRare', LEGEND_STAND_EVENT, 'colLegend', 'colAll'], '4 載入補送的事件（C：多了展示台）')
  const standsOf = (sv) => (sv.shop?.decor ?? []).filter((d) => d.kind === LEGEND_STAND_KIND)
  // 沒集齊、半對 → 不送
  for (const [name, col] of [['空', {}], ['只有鑰匙', { L001: 1 }], ['只有保險箱', { L002: 1 }], ['鑰匙＋雷射（半對＋半對）', { L001: 1, L003: 1 }], ['保險箱＋山銅', { L002: 1, L004: 1 }], ['三件', { L001: 1, L002: 0, L003: 1, L004: 1 }]]) {
    const r = checkEvents(S({ collection: col }), T0)
    const only = name === '三件' // 貓那對 L003＋L004 是一整對
    if (only) continue
    eq([standsOf(r.save).length, r.save.events[LEGEND_STAND_EVENT]], [0, undefined], `4 ${name}：不送、沒有旗標`)
    const rr = retroEvents(S({ collection: col }), T0)
    eq([standsOf(rr.save).length, rr.notices.length], [0, 0], `4 ${name}：載入補送也不送`)
  }
  // 狗的一對、貓的一對：各送 1 個，放進倉庫（沒有擺放紀錄）、不給金幣
  for (const [name, col, evId] of [['狗', DOG, 'dogVault'], ['貓', CAT, 'catAtlantis']]) {
    const s0 = S({ collection: col, points: 50 })
    const r = checkEvents(s0, T0)
    eq(standsOf(r.save), [{ id: 'legend_stand#1', kind: 'legend_stand' }], `4 ${name}的一對集齊：送 1 個展示台（實例 legend_stand#1）`)
    eq([r.save.events[LEGEND_STAND_EVENT], r.save.events[evId], r.save.shop.nextDecorId, r.save.points], [T0, T0, 2, 50 + BALANCE.dig.events.legendReward], `4 ${name}：旗標、配對事件、nextDecorId、金幣只有配對事件的獎勵`)
    ok(!r.save.farmLayout || !r.save.farmLayout.items.some((x) => x.id === 'legend_stand#1'), `4 ${name}：放進倉庫（沒有擺放紀錄）`)
    eq(r.notices.map((x) => [x.id, x.coins]), [[evId, BALANCE.dig.events.legendReward], [LEGEND_STAND_EVENT, 0]], `4 ${name}：通知順序（配對獎勵、展示台）`)
    // 只送一次：再檢查、另一對也集齊都不再送
    const again = checkEvents({ ...r.save, collection: { ...DOG, ...CAT } }, T0 + 1000)
    eq(standsOf(again.save).length, 1, `4 ${name}：另一對也集齊不再送（只送一次）`)
    eq(checkEvents(again.save, T0 + 2000).notices, [], '4 再檢查沒有新事件')
  }
  // 兩對一起（同一次揭曉不可能，載入時補送可能）：只送 1 個
  {
    const r = retroEvents(S({ collection: { ...DOG, ...CAT }, events: { dogVault: T0 - 5, catAtlantis: T0 - 4 } }), T0)
    eq(standsOf(r.save).length, 1, '4 載入補送：兩對都集齊的舊存檔只送 1 個')
    eq(r.save.points, 1000 + BALANCE.dig.collectionRewards.legendary, '4 補送金幣只有「傳說全集齊」的獎勵（展示台 0 金幣；舊的配對事件已領過不再發）')
    eq(r.notices.length, 1, '4 兩個補送項目合併成一個彈窗')
    eq(r.notices[0].id, 'retroBatch', '4 合併彈窗')
    eq(r.notices[0].parts.map((p) => [p.id, p.coins]), [[LEGEND_STAND_EVENT, 0], ['colLegend', BALANCE.dig.collectionRewards.legendary]], '4 彈窗各項：展示台 0（顯示「已放進倉庫」）、傳說全集齊')
  }
  // 舊存檔：已有配對事件旗標、沒有展示台旗標 → 載入補送 1 個；補完旗標在，再載入不再送
  {
    const old = S({ collection: DOG, events: { dogVault: T0 - 86400000 }, shop: { decor: [{ id: 'rocks#1', kind: 'rocks' }], nextDecorId: 2 }, farmLayout: { items: [{ id: 'rocks#1', kind: 'rocks', state: 'placed', x: 200, y: 220 }] } })
    const r = retroEvents(old, T0)
    eq(standsOf(r.save), [{ id: 'legend_stand#2', kind: 'legend_stand' }], '4 載入補送：舊存檔補 1 個（接在原有實例編號後面）')
    eq(r.save.shop.decor.length, 2, '4 原有的實例還在')
    eq(r.save.farmLayout, old.farmLayout, '4 擺放紀錄不動')
    eq(r.save.points, old.points, '4 補送不給金幣')
    eq(r.notices, [{ id: LEGEND_STAND_EVENT, coins: 0, retro: true }], '4 一個補送項目沿用原本的彈窗（更新補發）')
    const r2 = retroEvents(r.save, T0 + 5000)
    eq([standsOf(r2.save).length, r2.notices.length], [1, 0], '4 再載入：旗標在，不再送')
    eq(retroEvents(parseSave(JSON.parse(JSON.stringify(r.save))), T0 + 9000).notices, [], '4 存檔來回後再載入：不再送')
    // 玩家把展示台擺出去、後來又收進倉庫、甚至不在 shop.decor 了，也不會重送（旗標決定，不看現有實例）
    const sold = { ...r.save, shop: { ...r.save.shop, decor: r.save.shop.decor.filter((d) => d.kind !== LEGEND_STAND_KIND) } }
    eq(standsOf(retroEvents(sold, T0 + 10000).save).length, 0, '4 旗標在：展示台不見了也不重送（靠事件旗標只給一次）')
  }
  // 不佔購買上限
  {
    let t = S({ points: 100000, collection: DOG })
    t = checkEvents(t, T0).save
    ok(standsOf(t).length === 1, '4 先有 1 個展示台')
    eq(decorTotal(t), 0, '4 展示台不算 decorTotal')
    for (const k of ['jelly_lamp', 'conch_lamp', 'old_pillar', 'seahorse_statue', 'trident_statue', 'temple_arch']) for (let q = 0; q < 10; q++) t = buy(t, 'decor.' + k)
    eq([decorTotal(t), t.shop.decor.length], [60, 61], '4 買滿 60 個（展示台另外算，共 61 個實例）')
    ok(!purchase(t, 'decor.carousel').ok && purchase(t, 'decor.carousel').error.includes('60'), '4 滿 60 不能再買（展示台不佔也不放寬）')
    ok(SHOP_LIMITS.decorTotal === 60, '4 decorTotal 仍是 60')
  }
  // 擺設種類、輪廓、存檔
  ok(INSTANCE_KINDS.includes(LEGEND_STAND_KIND), '4 legend_stand 是可複製（實例）種類')
  ok(!SHOP_ITEMS.some((it) => it.grant.type === 'decor' && it.grant.kind === LEGEND_STAND_KIND), '4 展示台不賣')
  eq([ENVELOPES.legend_stand.w, ENVELOPES.legend_stand.h, KIND_GEOM.legend_stand.sprite, KIND_GEOM.legend_stand.foot.d], [71, 30, 'legend_stand', 10], '4 展示台輪廓 71×30、腳下佔地深 10（和其他裝飾一樣佔場景擺放空間）')
  ok(Math.abs(KIND_GEOM.legend_stand.foot.x1 - KIND_GEOM.legend_stand.foot.x0 - 71 * 0.8) < 0.01, '4 腳下佔地寬 = 0.8 倍素材寬')
  eq(cleanShop({ decor: [{ id: 'legend_stand#3', kind: 'legend_stand' }], nextDecorId: 1 }), { decor: [{ id: 'legend_stand#3', kind: 'legend_stand' }], nextDecorId: 4 }, '4 cleanShop 認得展示台實例、編號往後算')
  const lay = cleanFarmLayout({ items: [{ id: 'legend_stand#3', kind: 'legend_stand', state: 'placed', x: 300, y: 240 }] })
  const pl = resolvePlacement([], lay, [{ id: 'legend_stand#3', kind: 'legend_stand' }])
  eq([pl.placed.get('legend_stand#3')?.x, pl.placed.get('legend_stand#3')?.y], [300, 240], '4 擺出來的展示台在存檔的位置')
  eq(resolvePlacement([], undefined, [{ id: 'legend_stand#3', kind: 'legend_stand' }]).stored.has('legend_stand#3'), true, '4 沒有擺放紀錄 = 在倉庫')
  eq(parseInstanceId('legend_stand#3'), { kind: 'legend_stand', n: 3 }, '4 實例 id')
  // 台面顯示
  const view = (col, events) => legendStandView({ collection: col, events })
  eq(view({}, {}), { pair: null, canToggle: false }, '4 一對都沒集齊：台面空、不能切換')
  eq(view({ L001: 1 }, {}), { pair: null, canToggle: false }, '4 半對：台面空')
  eq(view(DOG, { dogVault: 5 }), { pair: 'dog', canToggle: false }, '4 只集齊狗：顯示狗那一對、不能切換')
  eq(view(CAT, { catAtlantis: 5 }), { pair: 'cat', canToggle: false }, '4 只集齊貓：顯示貓那一對')
  eq(view({ ...DOG, ...CAT }, { dogVault: 5, catAtlantis: 9 }), { pair: 'dog', canToggle: true }, '4 兩對都集齊、狗先：顯示狗')
  eq(view({ ...DOG, ...CAT }, { dogVault: 9, catAtlantis: 5 }), { pair: 'cat', canToggle: true }, '4 貓先：顯示貓（最先集齊的那一對）')
  eq(view({ ...DOG, ...CAT }, { dogVault: 9, catAtlantis: 5, [LEGEND_STAND_VIEW_FLAG]: 1 }), { pair: 'dog', canToggle: true }, '4 切換旗標 1：顯示後集齊的那一對')
  eq(view({ ...DOG, ...CAT }, { dogVault: 9, catAtlantis: 5, [LEGEND_STAND_VIEW_FLAG]: 0 }), { pair: 'cat', canToggle: true }, '4 切換旗標 0 = 預設')
  eq(view({ ...DOG, ...CAT }, {}), { pair: 'dog', canToggle: true }, '4 兩個時間都沒有：狗先')
  eq(view({ ...DOG, ...CAT }, { dogVault: 5, catAtlantis: 5 }), { pair: 'dog', canToggle: true }, '4 同時：狗先')
  eq(view({ ...DOG, ...CAT }, { catAtlantis: 5 }), { pair: 'cat', canToggle: true }, '4 只有貓的時間：貓先')
  eq(view(DOG, { dogVault: 5, [LEGEND_STAND_VIEW_FLAG]: 1 }), { pair: 'dog', canToggle: false }, '4 只有一對時旗標不影響顯示')
  eq([pairDone({ collection: DOG }, 'dog'), pairDone({ collection: DOG }, 'cat')], [true, false], '4 pairDone')
  eq(PAIR_ITEMS, { dog: ['item_L001', 'item_L002'], cat: ['item_L003', 'item_L004'] }, '4 台面的兩件傳說道具：狗＝保險箱鑰匙＋保險箱、貓＝亞特蘭提斯雷射＋山銅')
  // 存檔清理：切換旗標與展示台旗標是 events 的一般數字旗標，來回保留
  eq(parseSave(JSON.parse(JSON.stringify(S({ events: { legendStand: 5, legendStandView: 1 } })))).events, { legendStand: 5, legendStandView: 1 }, '4 events 旗標存檔來回')
}

if (fails.length) {
  console.log(fails.slice(0, 80).join('\n'))
  console.log(`v4.0-C 功能測試：${n} 項中失敗 ${fails.length} 項`)
  process.exit(1)
}
for (const r of report) console.log(r)
console.log(`v4.0-C 功能測試：${n} 項全部通過`)
