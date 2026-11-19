import assert from 'node:assert/strict'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import { BALANCE } from '../../../src/farm/config/balance.ts'
import { SPECIES, variantOf } from '../../../src/farm/config/species.ts'
import { advancePet, advanceSave, heightCm, weightKg, stageOf, weightLabel, lowStatNotices, DAY_MS, HOUR_MS } from '../../../src/farm/sim/stats.ts'
import { applySleepRecovery, bowlLeft, eatAtBowl } from '../../../src/farm/sim/buildings.ts'
import { parseSave } from '../../../src/farm/save/migrate.ts'
import { buildBackup, parseBackup } from '../../../src/lib/backup.ts'
import { newSave, todayKey } from '../../../src/farm/sim/points.ts'

// ---- v3.8.0 adapt：拿掉新欄位再比（A）。S37 會先檢查舊寵物的個性 = 用 id 算出的那一種（算在項數裡），新領養的（id 不在 OLD_IDS）只拿掉不檢查 ----
import { personalityFromId as __pfi } from '../../../src/farm/config/personality.ts'
let __n380 = 0
const S37 = (x, oldIds = null) => {
  if (Array.isArray(x)) return x.map((y) => S37(y, oldIds))
  if (!x || typeof x !== 'object') return x
  const strip = (p) => {
    if (!p || typeof p !== 'object' || !('species' in p)) return p
    const { personality, lastInteract, ...rest } = p
    if (personality !== undefined && (!oldIds || oldIds.includes(p.id)) && personality !== __pfi(p.id)) throw new Error('舊寵物的個性不是用 id 算出的那一種：' + p.id)
    if (personality !== undefined) __n380++
    void lastInteract
    return rest
  }
  if ('species' in x && 'mood' in x) return strip(x)
  const o = { ...x }
  if (Array.isArray(o.pets)) o.pets = o.pets.map(strip)
  if (o.save && typeof o.save === 'object') o.save = S37(o.save, oldIds)
  if (o.backup?.data?.farm) o.backup = { ...o.backup, data: { ...o.backup.data, farm: S37(o.backup.data.farm, oldIds) } }
  return o
}
/** (C) 載入後儲存裡的存檔：原始資料有的每個欄位（skip 以外）在拿掉寵物新欄位後都要相同；dataRev 變 3、寵物有 personality */
const W37 = (stored, raw, skip = []) => {
  const st = typeof stored === 'string' ? JSON.parse(stored) : stored
  const r = typeof raw === 'string' ? JSON.parse(raw) : raw
  const out = {}
  for (const k of Object.keys(r)) if (!skip.includes(k) && k !== 'dataRev') out[k] = S37(st[k])
  const want = {}
  for (const k of Object.keys(r)) if (!skip.includes(k) && k !== 'dataRev') want[k] = r[k]
  if (st.dataRev !== 4 || !st.pets.every((p) => typeof p.personality === 'string')) throw new Error('寫回的存檔沒有 dataRev 3 或缺個性')
  return [out, want]
}
process.on('exit', () => console.log('（v3.8.0 adapt：另外檢查了 ' + __n380 + ' 次「舊寵物個性 = 用 id 算的」）'))


let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const near = (a, b, tol, m) => { n++; assert.ok(Math.abs(a - b) <= tol, `${m}：${a} vs ${b}`) }
const NOW = new Date(2026, 10, 2, 12, 0, 0).getTime()
const pet = (extra = {}) => ({ id: 'p', species: 'dog', variant: 'shiba', name: 'p', adoptedAt: NOW - 10 * DAY_MS, heightFactor: 1, weight: 50, satiety: 80, mood: 80, cleanliness: 80, ...extra })

// ============ 1. 每小時下降 ============
{
  eq(BALANCE.decayPerHour, { satiety: 3, mood: 2, cleanliness: 2 }, '每小時下降 3／2／2')
  eq(BALANCE.offlineFloor, 20, '離線補算下限仍是 20'); eq(BALANCE.lowThreshold, 30, '「餓了」驚嘆號的門檻仍是 30'); eq(BALANCE.moodExtraDecayWhenHungry, 0.5)
  const a = advancePet(pet(), HOUR_MS, false)
  eq([a.satiety, a.mood, a.cleanliness], [77, 78, 78], '1 小時：80 → 77／78／78')
  const b = advancePet(pet(), 10 * HOUR_MS, false)
  eq([b.satiety, b.mood, b.cleanliness], [50, 60, 60], '10 小時')
  // 餓了（飽食 < 30）：心情下降 ×1.5
  const h = advancePet(pet({ satiety: 25, mood: 60 }), HOUR_MS, false)
  near(h.mood, 60 - 2 * 1.5, 1e-9, '餓了：心情每小時 −3'); near(h.satiety, 22, 1e-9, '餓了：飽食 −3')
  const ok1 = advancePet(pet({ satiety: 30, mood: 60 }), HOUR_MS, false)
  near(ok1.mood, 58, 1e-9, '飽食剛好 30 不算餓')
  // 離線補算：不低於 20（已經低於 20 的維持原值）；線上最低 0
  const off = advancePet(pet({ satiety: 50, mood: 50, cleanliness: 50 }), 100 * HOUR_MS, true)
  eq([off.satiety, off.mood, off.cleanliness], [20, 20, 20], '離線 100 小時：最低 20')
  const off2 = advancePet(pet({ satiety: 15, mood: 10, cleanliness: 5 }), 100 * HOUR_MS, true)
  eq([off2.satiety, off2.mood, off2.cleanliness], [15, 10, 5], '原本低於 20 的離線補算不再往下掉')
  const off3 = advancePet(pet({ satiety: 25 }), 2 * HOUR_MS, true)
  eq(off3.satiety, 20, '離線：25 − 6 = 19 → 夾在 20')
  const on = advancePet(pet({ satiety: 10, mood: 5, cleanliness: 3 }), 100 * HOUR_MS, false)
  eq([on.satiety, on.mood, on.cleanliness], [0, 0, 0], '線上：最低 0')
  eq(advancePet(pet(), 0, false).satiety, 80, '時間 0 不動'); eq(advancePet(pet(), -5, false).satiety, 80, '時鐘倒退不動')
  const sv = { ...newSave(NOW, todayKey(NOW)), pets: [pet({ id: 'a' }), pet({ id: 'b', satiety: 40 })], lastSeen: NOW - 2 * HOUR_MS }
  const adv = advanceSave(sv, NOW, false)
  eq(adv.pets.map((p) => p.satiety), [74, 34], 'advanceSave'); eq(adv.lastSeen, NOW)
}

// ============ 2. 食盆門檻與睡覺心情 ============
{
  eq(BALANCE.buildings.bowls.threshold, 60, '去食盆的門檻 60（v3.7.1）'); eq(BALANCE.buildings.bowls.satiety, 20, '每盆 +20（v3.7.1）'); eq(BALANCE.buildings.bowls.portionsPerPet, 3, '每隻每天 3 盆（v3.7.1）')
  ok(BALANCE.buildings.bowls.threshold > BALANCE.lowThreshold, '餓了的驚嘆號（30）比走去食盆（60）晚出現')
  eq(lowStatNotices(pet({ satiety: 35 })).filter((x) => x.icon === 'exclaim').length, 0, '飽食 35：沒有驚嘆號')
  eq(lowStatNotices(pet({ satiety: 29.9 })).filter((x) => x.icon === 'exclaim').length, 1, '飽食 29.9：驚嘆號')
  eq(BALANCE.sleepMood, { base: 2.7, buildingMul: 2.5, groundMul: 1.9 }, '睡覺心情 base 2.7、buildingMul 2.5、groundMul 1.9（v3.7.1）')
  const sv = { ...newSave(NOW, todayKey(NOW)), pets: [pet({ id: 'a', mood: 50 }), pet({ id: 'b', mood: 50 })] }
  const night = { nowMs: new Date(2026, 10, 2, 23, 30).getTime(), hour: 23.5 }
  const r = applySleepRecovery(sv, night, 3600, new Set(['a']))
  near(r.pets[0].mood, 50 + 2.7 * 2.5, 1e-9, '睡在座位上：每小時 +6.75'); near(r.pets[1].mood, 50 + 2.7 * 1.9, 1e-9, '睡在地上：每小時 +5.13（v3.7.1）')
  // 睡 7 小時（23:00～6:00）座位上 +47.25 ≈ 一天衰減 48
  near(7 * 2.7 * 2.5, 47.25, 1e-9, '座位睡 7 小時 +47.25'); near(24 * BALANCE.decayPerHour.mood, 48, 1e-9, '一天衰減 48')
  // 引擎：飽食 65 的寵物不會去食盆，59 的會（v3.7.1 門檻 60）
  for (const [sat, should] of [[65, false], [61, false], [59, true]]) {
    const e = new PixelEngine()
    let seed = 5
    e.rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    e.setSize(1920, 900, 1)
    e.setOwned(['bowls'])
    e.sync([pet({ id: 'p', satiety: sat })])
    let eaten = 0
    let save = { ...newSave(NOW, todayKey(NOW)), pets: [pet({ id: 'p', satiety: sat })], ownedBuildings: ['bowls'], lastSeen: NOW }
    let now = NOW
    e.hooks = { requestBath: () => null, wake: () => {}, notify: () => {}, settlePlay: () => {}, addFind: () => false, eatAtBowl: (id) => { const x = eatAtBowl(save, { nowMs: now, hour: 12 }, id); if (x.error) return x.error; save = x.save; e.sync(save.pets); eaten++; return null } }
    e.bowlLeft = bowlLeft(save, now)
    for (let i = 0; i < 600; i++) { now += 200; e.update(0.2, { nowMs: now, hour: 12, weather: 'sunny', gifts: [] }); e.bowlLeft = bowlLeft(save, now) } // 120 秒（不做衰減，飽食度維持原值）
    if (should) ok(eaten >= 1, `飽食 ${sat}：會去食盆（吃了 ${eaten} 次）`)
    else eq(eaten, 0, `飽食 ${sat}：不會去食盆`)
  }
}

// ============ 3. 身高體重顯示 ============
{
  const TABLE = [
    ['dog', 'shiba', 38, 10], ['dog', 'corgi', 28, 12], ['dog', 'husky', 55, 21], ['dog', 'golden', 57, 30], ['dog', 'bordercollie', 52, 17], ['dog', 'poodle', 33, 6],
    ['cat', 'tabby', 25, 4.5], ['cat', 'black', 25, 4.2], ['cat', 'calico', 24, 4.0], ['cat', 'siamese', 25, 4.0], ['cat', 'britishblue', 26, 5.5], ['cat', 'ragdoll', 28, 7.0],
  ]
  eq(TABLE.length, 12)
  for (const [sp, id, cm, kg] of TABLE) {
    const v = variantOf(sp, id)
    eq([v.id, v.baseCm, v.baseKg], [id, cm, kg], `${id} 的基準值`)
    // 成年
    eq(heightCm(v.baseCm, 'adult'), cm, `${id} 成年身高`)
    eq(weightKg(v.baseKg, 50, 'adult'), kg, `${id} 成年、體重值 50 = 標準`)
    eq(weightKg(v.baseKg, 0, 'adult'), Math.round(kg * 0.7 * 10 + 1e-6) / 10, `${id} 體重值 0 = 70%`)
    eq(weightKg(v.baseKg, 100, 'adult'), Math.round(kg * 1.3 * 10 + 1e-6) / 10, `${id} 體重值 100 = 130%`)
    // 幼年：身高 ×0.6、體重 ×0.3
    eq(heightCm(v.baseCm, 'young'), Math.round(cm * 0.6), `${id} 幼年身高`)
    eq(weightKg(v.baseKg, 50, 'young'), Math.round(kg * 0.3 * 10 + 1e-6) / 10, `${id} 幼年體重（體重值 50）`)
    eq(weightKg(v.baseKg, 0, 'young'), Math.round(kg * 0.7 * 0.3 * 10 + 1e-6) / 10, `${id} 幼年體重（體重值 0）`)
    eq(weightKg(v.baseKg, 100, 'young'), Math.round(kg * 1.3 * 0.3 * 10 + 1e-6) / 10, `${id} 幼年體重（體重值 100）`)
  }
  // 抽查（獨立算過的數字）
  eq([weightKg(10, 0, 'adult'), weightKg(10, 50, 'adult'), weightKg(10, 100, 'adult')], [7, 10, 13], '柴犬 7／10／13')
  eq([weightKg(30, 0, 'adult'), weightKg(30, 50, 'adult'), weightKg(30, 100, 'adult')], [21, 30, 39], '黃金獵犬 21／30／39')
  eq([weightKg(4.5, 0, 'adult'), weightKg(4.5, 100, 'adult')], [3.2, 5.9], '橘虎斑 3.2／5.9（3.15、5.85 四捨五入）')
  eq([heightCm(55, 'young'), heightCm(57, 'young'), heightCm(33, 'young'), heightCm(28, 'young'), heightCm(25, 'young')], [33, 34, 20, 17, 15], '幼年身高四捨五入')
  eq(weightKg(10, 50, 'young'), 3, '柴犬幼年 3.0 公斤'); eq(weightKg(21, 100, 'young'), 8.2, '哈士奇幼年體重值 100：21×1.3×0.3 = 8.19 → 8.2')
  // 體重值超出範圍或壞掉也不會爆
  eq(weightKg(10, -20, 'adult'), 7, '低於 0 當 0'); eq(weightKg(10, 150, 'adult'), 13, '高於 100 當 100'); eq(weightKg(10, NaN, 'adult'), 10, 'NaN 當 50')
  // 幼年 → 成年：滿 3 天
  eq(BALANCE.adultDays, 3)
  eq(stageOf(pet({ adoptedAt: NOW - 2.99 * DAY_MS }), NOW), 'young', '2.99 天幼年'); eq(stageOf(pet({ adoptedAt: NOW - 3 * DAY_MS }), NOW), 'adult', '滿 3 天成年')
  // 不看個體的身高係數、不存檔：同品種不同 heightFactor 顯示一樣
  const a = pet({ heightFactor: 0.85 }), b = pet({ heightFactor: 1.15 })
  eq(heightCm(variantOf(a.species, a.variant).baseCm, stageOf(a, NOW)), heightCm(variantOf(b.species, b.variant).baseCm, stageOf(b, NOW)), '身高只看品種')
  // 遊戲體重值的範圍與標籤不動
  eq([weightLabel(0), weightLabel(29), weightLabel(30), weightLabel(64), weightLabel(65), weightLabel(84), weightLabel(85), weightLabel(100)], ['偏瘦', '偏瘦', '標準', '標準', '微胖', '微胖', '偏胖', '偏胖'], '標準／偏瘦／偏胖判斷不動')
  // 每個品種都有基準值（沒有漏的）
  for (const sp of ['dog', 'cat']) for (const v of SPECIES[sp].variants) ok(v.baseCm > 0 && v.baseKg > 0, v.id)
}

// ============ 4. v3.6.0 存檔 → v3.6.1：不重置、逐欄相同；匯入匯出 ============
{
  // 一份真實的 v3.6.0 存檔（有收藏、寶物、事件、外觀、每日挖寶金幣）
  const v360 = {
    schemaVersion: 5, dataRev: 1,
    pets: [pet({ id: 'p1', name: '小柴' }), pet({ id: 'p2', species: 'cat', variant: 'ragdoll', name: '小布', awakeUntil: NOW + 9 })],
    points: 88, lastSeen: NOW - 5000, lastDailyClaim: todayKey(NOW), gifts: { date: todayKey(NOW), count: 1 }, nextPetId: 3, createdAt: NOW - 9 * DAY_MS,
    ownedBuildings: ['kennel', 'bowls', 'catTree'],
    earning: { date: todayKey(NOW), programCoins: 3, gameCoins: 1, lastAward: { 'official-filmaster': NOW - 1000 }, digCoins: 4 },
    bowl: { date: todayKey(NOW), used: 2 },
    collection: { C001: 3, 'U002-1': 2, 'U002-4': 1, L001: 1 },
    finds: [{ id: 'fa', kind: 'mound', by: 'dog', fx: 0.3, fy: 0.4, at: NOW - 1000 }, { id: 'fb', kind: 'bundle', by: 'cat', fx: 0.7, fy: 0.5, at: NOW - 2000 }],
    events: { dogLeak: NOW - 86400000 }, skins: { owned: ['house.gold'], equipped: { house: 'house.gold' } },
  }
  const parsed = parseSave(JSON.parse(JSON.stringify(v360)))
  eq(S37(parsed), { ...v360, dataRev: 4, notes: [] }, 'v3.6.0 存檔 → v3.8.0：除了 dataRev 3、notes: []、寵物的 personality/lastInteract 之外每個欄位都逐欄相同')
  eq(parsed.schemaVersion, 5)
  // 匯出 v3 → 匯入
  const list = { schemaVersion: 1, apps: [] }
  const b3 = buildBackup(parsed, list, '3.6.1', new Date(NOW))
  eq(b3.formatVersion, 6) // v3.8.0：匯出格式 5
  const p3 = parseBackup(JSON.stringify(b3), 100)
  ok(p3.ok, 'v3 匯入'); eq(S37(p3.backup.data.farm), { ...v360, dataRev: 4, notes: [] }, '匯出再匯入完全相同（v3.8.0：dataRev 3、notes: []、寵物新欄位另外檢查）')
  // v2（v3.5.1 的匯出）：補預設值，其餘欄位相同
  const old = { schemaVersion: 5, pets: v360.pets, points: 10, lastSeen: NOW, lastDailyClaim: null, gifts: { date: '', count: 0 }, nextPetId: 3, createdAt: NOW, ownedBuildings: ['kennel'], earning: { date: '', programCoins: 0, gameCoins: 0, lastAward: {} }, bowl: { date: '', used: 0 } }
  const p2 = parseBackup(JSON.stringify({ format: 'aemc-desktop-backup', formatVersion: 2, exportedAt: 'x', appVersion: '3.5.1', data: { farm: old, appList: list } }), 100)
  ok(p2.ok, 'v2 匯入'); eq([p2.backup.data.farm.points, p2.backup.data.farm.collection, p2.backup.data.farm.finds, p2.backup.data.farm.earning.digCoins], [10, {}, [], 0], 'v2：補預設值')
}

console.log(`v3.6.1 邏輯測試 ${n} 項通過`)
