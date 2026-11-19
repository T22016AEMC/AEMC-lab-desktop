// v3.8.0 邏輯／引擎測試：個性（固定個性、隨機分布、各效果數值）、野餐（條件、次數、冷卻、跨日、清潔與心情只算一次、雨夜、重新整理、同時一場、找新主人）、
// 存檔相容（v3.7.x 存檔 3 隻、321 金幣、三建築、3 張便利貼）、匯出再匯入、17 種視窗的野餐墊／相機／裁切、素材一致性。
import { store } from './env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
const R = (process.env.REPO_ROOT + '/')
import { BALANCE } from '../../../src/farm/config/balance.ts'
import { PERSONALITY_IDS, PERSONALITY_NAMES, PERSONALITY_ICONS, personalityFromId, rollPersonality, personalityMul, NEUTRAL_MUL } from '../../../src/farm/config/personality.ts'
import { advancePet, advanceSave, lonelyHours, HOUR_MS } from '../../../src/farm/sim/stats.ts'
import { execute, settlePlay, wakeForDrag, adopt, startPlay } from '../../../src/farm/sim/commands.ts'
import { newSave, todayKey } from '../../../src/farm/sim/points.ts'
import { rehomePet } from '../../../src/farm/sim/rehome.ts'
import * as PIC from '../../../src/farm/sim/picnic.ts'
import * as PX from '../../../src/farm/pixel/picnic.ts'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import { useFarmStore, setSaveStorage } from '../../../src/farm/store/farmStore.ts'
import { LocalStorageAdapter } from '../../../src/farm/save/storage.ts'
import { parseSave, needsPersonalityFill } from '../../../src/farm/save/migrate.ts'
import { DATA_REV } from '../../../src/farm/save/types.ts'
import { buildBackup, parseBackup, BACKUP_FORMAT_VERSION, MIN_BACKUP_FORMAT_VERSION } from '../../../src/lib/backup.ts'
import { cropSizeFor, photoFileName, FRAME_SCALE, PHOTO_SCALE, POLAROID_KEYS } from '../../../src/farm/ui/photo.ts'
import { overrides } from '../../../src/farm/overrides.ts'
import { LAZY_ATLASES } from '../../../src/farm/pixel/assets.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const near = (a, b, tol, m) => { n++; assert.ok(Math.abs(a - b) <= tol, `${m}：${a} vs ${b}`) }
const log = (...a) => console.log(...a)
const NOW = new Date(2026, 10, 17, 10, 0, 0).getTime()
const pet = (o = {}) => ({ id: 'p', species: 'dog', variant: 'shiba', name: '柴柴', adoptedAt: NOW - 5 * 86400000, heightFactor: 1, weight: 50, satiety: 80, mood: 80, cleanliness: 80, ...o })
const SP = process.env.REPO_ROOT + '/tests-archive/v390/fixtures/'
const exp370 = JSON.parse(readFileSync(SP + 'export370.json', 'utf8'))
const strip = (s) => ({ ...s, pets: s.pets.map(({ personality, lastInteract, ...r }) => r) })
let lcg = 4242
const rnd = () => { lcg = (lcg * 1664525 + 1013904223) >>> 0; return lcg / 4294967296 }

// ============ 1. 個性：種類、固定個性、隨機分布 ============
{
  eq([...PERSONALITY_IDS], ['lively', 'greedy', 'lazy', 'clingy', 'timid'], '5 種')
  eq(Object.values(PERSONALITY_NAMES), ['活潑', '貪吃', '懶散', '黏人', '膽小'], '名稱')
  eq(Object.values(PERSONALITY_ICONS), ['pers_lively', 'pers_greedy', 'pers_lazy', 'pers_clingy', 'pers_timid'], '圖示')
  // 同一個 id 永遠同一種
  for (let i = 1; i <= 200; i++) eq(personalityFromId('p' + i), personalityFromId('p' + i), '固定')
  eq(['p1', 'p2', 'p3'].map(personalityFromId), ['timid', 'greedy', 'lazy'], 'p1/p2/p3 的固定個性（雜湊結果寫死在測試裡：之後改雜湊會被抓到，舊存檔不會換個性）')
  const cnt = Object.fromEntries(PERSONALITY_IDS.map((k) => [k, 0]))
  for (let i = 1; i <= 5000; i++) cnt[personalityFromId('p' + i)]++
  for (const k of PERSONALITY_IDS) near(cnt[k] / 5000, 0.2, 0.03, 'id 算出的個性大致平均：' + k)
  log('id p1～p5000 的固定個性分布', JSON.stringify(cnt))
  const c2 = Object.fromEntries(PERSONALITY_IDS.map((k) => [k, 0]))
  for (let i = 0; i < 50000; i++) c2[rollPersonality(rnd)]++
  for (const k of PERSONALITY_IDS) near(c2[k] / 50000, 0.2, 0.01, '新領養隨機分布：' + k)
  log('新領養 50000 次的分布', JSON.stringify(c2))
  eq(rollPersonality(() => 0.999999), 'timid'); eq(rollPersonality(() => 0), 'lively')
  // 領養時存個性與上次互動時間
  const a = adopt({ ...newSave(NOW, todayKey(NOW)), points: 100 }, { nowMs: NOW, hour: 12 }, { species: 'cat', name: 'n' }, () => 0.5)
  eq([a.save.pets[0].personality, a.save.pets[0].lastInteract], ['lazy', NOW], '領養：個性（rand 0.5 → 第 3 種 懶散）、上次互動 = 領養當下')
  // 表的數值
  eq(BALANCE.personality, { lively: { digMood: 1.25 }, greedy: { satietyDecay: 1.25, eatMood: 1.25 }, lazy: { moodDecay: 0.75, wander: 0.75 }, clingy: { petMood: 1.25, lonelyMoodDecay: 1.25 }, timid: { shelterDelay: 0.4, dragMood: 1.3 }, lonelyAfterHours: 6 }, '個性表')
  eq(personalityMul({}), NEUTRAL_MUL, '沒有個性 = 全部 1')
  ok(Object.values(NEUTRAL_MUL).every((v) => v === 1), '平均 = 全部 1')
}

// ============ 2. 個性效果的數值 ============
{
  const two = 2 * HOUR_MS
  const d = (p, ms = two, from) => advancePet(p, ms, false, from)
  const base = d(pet())
  eq([base.satiety, base.mood, base.cleanliness], [74, 76, 76], '平均：2 小時 −6／−4／−4')
  const g = d(pet({ personality: 'greedy' }))
  eq([g.satiety, g.mood, g.cleanliness], [72.5, 76, 76], '貪吃：飽食 −7.5（×1.25），心情、清潔不變')
  const lz = d(pet({ personality: 'lazy' }))
  eq([lz.satiety, lz.mood, lz.cleanliness], [74, 77, 76], '懶散：心情 −3（×0.75）')
  for (const k of ['lively', 'timid']) { const x = d(pet({ personality: k })); eq([x.satiety, x.mood, x.cleanliness], [74, 76, 76], k + '：衰減不變') }
  // 黏人：久沒互動（6 小時）之後心情掉得快 1.25 倍，只算超過的那一段
  const from = NOW
  eq(d(pet({ personality: 'clingy', lastInteract: from }), two, from).mood, 76, '黏人：剛互動過 → 正常')
  eq(d(pet({ personality: 'clingy', lastInteract: from - 5 * HOUR_MS }), two, from).mood, 80 - 2 - 2.5, '黏人：5 小時前互動 → 第 1 小時正常、第 2 小時 ×1.25')
  eq(d(pet({ personality: 'clingy', lastInteract: from - 7 * HOUR_MS }), two, from).mood, 75, '黏人：7 小時前互動 → 整段 ×1.25（−5）')
  eq(lonelyHours(pet({ lastInteract: from - 5 * HOUR_MS }), from, 2), 1, 'lonelyHours'); eq(lonelyHours(pet({}), from, 2), 0, '沒有 lastInteract = 0')
  eq(d(pet({ personality: 'lazy', lastInteract: from - 99 * HOUR_MS }), two, from).mood, 77, '非黏人不看久沒互動')
  // 餓的時候（< 30）心情額外下降也一起乘
  eq(d(pet({ personality: 'lazy', satiety: 20 })).mood, 80 - 2 * 1.5 * 0.75 * 2, '懶散＋餓：2 × 1.5 × 0.75 × 2 小時')
  // 離線補算：下限 20 照舊
  eq(advancePet(pet({ personality: 'greedy', satiety: 30 }), 20 * HOUR_MS, true).satiety, 20, '離線下限 20 照舊')
  // 餵食、撫摸、拖曳、挖寶
  const s1 = (p) => ({ ...newSave(NOW, todayKey(NOW)), pets: [p], points: 50 })
  const mood = (r) => r.save.pets[0].mood
  eq(mood(execute(s1(pet({ mood: 50 })), { nowMs: NOW, hour: 12 }, 'feed', 'p')), 53, '平均：餵食心情 +3')
  eq(mood(execute(s1(pet({ mood: 50, personality: 'greedy' })), { nowMs: NOW, hour: 12 }, 'feed', 'p')), 53.75, '貪吃：餵食心情 +3.75')
  eq(mood(execute(s1(pet({ mood: 50, personality: 'clingy' })), { nowMs: NOW, hour: 12 }, 'pet', 'p')), 60, '黏人：撫摸 +10（×1.25）')
  eq(mood(execute(s1(pet({ mood: 50, personality: 'clingy' })), { nowMs: NOW, hour: 2 }, 'pet', 'p')), 56.25, '黏人：睡夢中撫摸 +6.25')
  eq(mood(execute(s1(pet({ mood: 50, personality: 'greedy' })), { nowMs: NOW, hour: 12 }, 'pet', 'p')), 58, '貪吃：撫摸照常 +8')
  eq(execute(s1(pet({ personality: 'clingy', lastInteract: 1 })), { nowMs: NOW, hour: 12 }, 'pet', 'p').save.pets[0].lastInteract, NOW, '互動會更新 lastInteract')
  eq(startPlay(s1(pet({ lastInteract: 1 })), { nowMs: NOW, hour: 12 }, 'p', 'ball').save.pets[0].lastInteract, NOW, '開始玩耍也算互動')
  const cat = (o) => pet({ species: 'cat', variant: 'tabby', mood: 60, ...o })
  eq(mood(wakeForDrag(s1(cat({})), { nowMs: NOW, hour: 2 }, 'p')), 45, '平均貓：睡覺中被拖起來 −15')
  near(mood(wakeForDrag(s1(cat({ personality: 'timid' })), { nowMs: NOW, hour: 2 }, 'p')), 40.5, 1e-9, '膽小貓：−19.5（×1.3）')
  eq(mood(wakeForDrag(s1(pet({ mood: 60, personality: 'timid' })), { nowMs: NOW, hour: 2 }, 'p')), 60, '膽小狗：狗本來就是 0，×1.3 還是 0')
  eq(mood(settlePlay(s1(pet({ mood: 50, personality: 'lively' })), { nowMs: NOW, hour: 12 }, 'p', 4, 'dig')), 60, '活潑：挖寶 4 個 +8 → +10')
  eq(mood(settlePlay(s1(cat({ mood: 50, personality: 'lively' })), { nowMs: NOW, hour: 12 }, 'p', 2, 'hunt')), 50 + 5 * 1.25, '活潑：尋寶 2 個 +5 → +6.25')
  eq(mood(settlePlay(s1(pet({ mood: 50, personality: 'lively' })), { nowMs: NOW, hour: 12 }, 'p', 4, 'ball')), 58, '活潑：丟球不加成（只限挖寶／尋寶）')
  eq(mood(settlePlay(s1(pet({ mood: 50 })), { nowMs: NOW, hour: 12 }, 'p', 4, 'dig')), 58, '平均：挖寶 4 個 +8')
  // 引擎：膽小下雨更快去躲雨（等待 × 0.4）、懶散走動較少
  const E = new PixelEngine()
  E.setSize(1920, 902, 1)
  E.setOwned(['kennel', 'bowls', 'catTree'])
  const ps = [pet({ id: 'a', personality: 'timid' }), pet({ id: 'b' }), pet({ id: 'c', species: 'cat', variant: 'tabby', personality: 'timid' })]
  E.sync(ps)
  E.hooks = { ...E.hooks, eatAtBowl: () => 'x' }
  E.update(0.05, { nowMs: NOW, hour: 12, weather: 'rain', gifts: [] })
  const ri = (id) => E.actors.get(id).rainIn
  ok(ri('a') >= 0.2 * 0.9 && ri('a') <= 2.4, '膽小：出發等待在 0.2～2.4 秒（' + ri('a').toFixed(2) + '）')
  ok(ri('b') >= 0.4 && ri('b') <= 6, '平均：0.5～6 秒（' + ri('b').toFixed(2) + '）')
  let tWait = 0, nWait = 0, bWait = 0
  for (let k = 0; k < 400; k++) { const e2 = new PixelEngine(); e2.setSize(1920, 902, 1); e2.setOwned(['kennel']); e2.sync([pet({ id: 'a', personality: 'timid' }), pet({ id: 'b' })]); e2.hooks = { ...e2.hooks, eatAtBowl: () => 'x' }; e2.update(0.01, { nowMs: NOW, hour: 12, weather: 'rain', gifts: [] }); tWait += e2.actors.get('a').rainIn; bWait += e2.actors.get('b').rainIn; nWait++ }
  near(tWait / bWait, 0.4, 0.06, '膽小的平均等待 ≈ 平均的 0.4 倍')
  log(`躲雨出發等待平均：膽小 ${(tWait / nWait).toFixed(2)} 秒、平均 ${(bWait / nWait).toFixed(2)} 秒`)
  // 懶散：2 小時白天，數起身走動次數
  const walks = (pers) => {
    const e3 = new PixelEngine(); let s = 99; e3.rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    e3.setSize(1920, 902, 1)
    e3.sync(Array.from({ length: 6 }, (_, i) => pet({ id: 'w' + i, species: i % 2 ? 'cat' : 'dog', variant: i % 2 ? 'tabby' : 'shiba', personality: pers })))
    let c = 0; const prev = new Map()
    for (let i = 0; i < 2 * 3600 * 5; i++) { e3.update(0.2, { nowMs: NOW + i * 200, hour: 12, weather: 'sunny', gifts: [] }); for (const a of e3.actors.values()) { if (a.action === 'walk' && prev.get(a.id) !== 'walk') c++; prev.set(a.id, a.action) } }
    return c
  }
  const wl = walks('lazy'), wn = walks(undefined)
  ok(wl < wn * 0.9, `懶散走動較少：2 小時 6 隻起身走動 ${wl} 次，平均 ${wn} 次（${(wl / wn).toFixed(2)} 倍）`)
  log(`懶散走動：${wl} 次 vs 平均 ${wn} 次（${(wl / wn).toFixed(2)} 倍）`)
}

// ============ 3. 存檔相容：v3.7.x 存檔（3 隻、321 金幣、三建築、3 張便利貼） ============
const farm371 = { ...exp370.data.farm, lastSeen: NOW - 3600000 }
{
  eq([farm371.pets.length, farm371.points, farm371.ownedBuildings, farm371.notes.length, farm371.dataRev], [3, 321, ['kennel', 'bowls', 'catTree'], 3, 2], 'v3.7.x 存檔樣本（v3.7.0 正式版匯出，與 v3.7.1 同格式 dataRev 2）')
  ok(needsPersonalityFill(farm371), '舊存檔缺個性欄位')
  store.clear()
  store.set('aemc-desktop:farm-save', JSON.stringify(farm371))
  const A = new LocalStorageAdapter()
  const lr = await A.loadOrReset(() => { throw new Error('不應該重置') })
  eq([lr.reset, lr.newer, lr.refund], ['none', undefined, undefined], '不重置、沒有退款')
  const s = lr.save
  for (const k of Object.keys(farm371)) if (k !== 'pets' && k !== 'dataRev') eq(s[k], farm371[k], '逐欄相同：' + k)
  eq(strip(s).pets, farm371.pets, '寵物：拿掉新欄位後每個欄位都相同（名字、品種、數值、領養時間…）')
  eq(s.pets.map((p) => p.personality), farm371.pets.map((p) => personalityFromId(p.id)), '舊寵物補上「用 id 算的」固定個性')
  eq(s.pets.map((p) => p.lastInteract), [farm371.lastSeen, farm371.lastSeen, farm371.lastSeen], 'lastInteract 補成存檔的 lastSeen')
  eq([s.dataRev, DATA_REV, 'picnic' in s], [4, 4, false], 'dataRev 3、沒有野餐紀錄')
  const written = JSON.parse(store.get('aemc-desktop:farm-save'))
  eq(written.pets.map((p) => p.personality), s.pets.map((p) => p.personality), '載入後立刻寫回存檔（補上的個性）')
  ok(!needsPersonalityFill(written), '寫回後不再缺個性')
  const lr2 = await new LocalStorageAdapter().loadOrReset(() => { throw new Error('x') })
  eq(lr2.save, s, '再載入一次：完全相同（個性不會變）')
  // 匯出再匯入
  const b = buildBackup(s, { schemaVersion: 1, apps: [] }, '3.8.0', new Date(NOW))
  eq([b.formatVersion, BACKUP_FORMAT_VERSION, MIN_BACKUP_FORMAT_VERSION], [6, 6, 2], '匯出格式 6、匯入接受 2～6（v3.9.0）')
  const p = parseBackup(JSON.stringify(b), 100)
  ok(p.ok, '匯入成功'); eq(p.backup.data.farm, s, '匯出再匯入完全相同（含個性）')
  // v3.7.x 的匯出檔（格式 4）匯入：個性同樣用 id 補上
  const p4 = parseBackup(JSON.stringify(exp370), 100)
  ok(p4.ok, '格式 4（v3.7.x 匯出檔）可匯入')
  eq(p4.backup.data.farm.pets.map((q) => q.personality), exp370.data.farm.pets.map((q) => personalityFromId(q.id)), '格式 4 匯入：個性 = 用 id 算的（和直接載入舊存檔一樣）')
  eq(strip(p4.backup.data.farm).pets, exp370.data.farm.pets, '格式 4 匯入：寵物其他欄位相同')
  for (const fv of [2, 3]) { const pv = parseBackup(JSON.stringify({ ...exp370, formatVersion: fv }), 100); ok(pv.ok, `格式 ${fv} 可匯入`); eq(pv.backup.data.farm.pets.map((q) => q.personality), ['timid', 'greedy', 'lazy']) }
  eq(parseBackup(JSON.stringify({ ...b, formatVersion: 7 }), 100).error, '這個存檔來自較新版本，請重新整理網頁更新後再試', '格式 7 → 較新版本（v3.9.0）')
  // v3.7.x 舊程式讀到 v3.8.0 的存檔：dataRev 3 > 2 → 舊程式的保護機制會停止存檔（這裡用 isNewerData 的規則模擬：schemaVersion 相同、dataRev 較大）
  ok(written.dataRev > 2, 'v3.7.x 的舊分頁看到 dataRev 3 會停止自動存檔，不會洗掉個性')
  // 壞掉的個性欄位 → 用 id 補
  eq(parseSave({ ...farm371, pets: [{ ...farm371.pets[0], personality: 'angry' }] }).pets[0].personality, personalityFromId('p1'), '認不得的個性 → 用 id 算')
  eq(parseSave({ ...farm371, pets: [{ ...farm371.pets[0], personality: 'lively' }] }).pets[0].personality, 'lively', '合法個性保留')
}

// ============ 4. 野餐：純函式 ============
{
  const B = BALANCE.picnic
  eq([B.dailyMax, B.seconds, B.cooldownMs, B.cleanliness, B.mood, B.minMood, B.minCleanliness], [3, 300, 1800000, -8, 5, 30, 20], '野餐數值')
  const ctx = (o = {}) => ({ nowMs: NOW, hour: 10, weather: 'sunny', ...o })
  const base = { ...newSave(NOW, todayKey(NOW)), pets: [pet({ id: 'a' }), pet({ id: 'b', species: 'cat', variant: 'tabby' }), pet({ id: 'c' })], points: 10 }
  eq(PIC.picnicBlock(null, ctx()), PIC.PICNIC_TEXT.noSave, '沒有存檔')
  eq(PIC.picnicBlock(base, ctx()), null, '晴天 10:00 可以')
  eq(PIC.picnicBlock(base, ctx({ weather: 'cloudy' })), null, '多雲可以')
  eq(PIC.picnicBlock(base, ctx({ weather: 'snow' })), null, '下雪可以（只有下雨不行）')
  eq(PIC.picnicBlock(base, ctx({ weather: 'rain' })), PIC.PICNIC_TEXT.rain, '下雨不行')
  for (const [h, okH] of [[5.99, false], [6, true], [12, true], [19.49, true], [19.5, false], [22, false], [2, false]]) eq(PIC.picnicBlock(base, ctx({ hour: h })) === null, okH, `${h} 點：${okH ? '可以' : '不行（天黑或睡覺時間）'}`)
  // 參加條件
  const elig = (o, c = ctx()) => PIC.picnicEligible(pet(o), c)
  eq([elig({}), elig({ mood: 29.9 }), elig({ mood: 30 }), elig({ cleanliness: 19.9 }), elig({ cleanliness: 20 })], [true, false, true, false, true], '心情 ≥ 30、清潔 ≥ 20 才參加')
  eq(elig({}, ctx({ hour: 2 })), false, '睡著的不參加'); eq(elig({ awakeUntil: NOW + 60000 }, ctx({ hour: 23.5 })), true, '睡覺時間被叫醒的寵物數值上算醒著（但睡覺時間本來就不能開始野餐）')
  const nobody = { ...base, pets: base.pets.map((p) => ({ ...p, cleanliness: 10 })) }
  eq(PIC.picnicBlock(nobody, ctx()), PIC.PICNIC_TEXT.nobody, '都不符合 → 不能開始')
  // 開始：只有符合的參加；清潔 −8、心情 +5 只算一次
  const mixed = { ...base, pets: [pet({ id: 'a' }), pet({ id: 'b', cleanliness: 19 }), pet({ id: 'c', mood: 20 })] }
  const decor = { mat: 1, basket: 0, foods: [2] }
  const r = PIC.startPicnic(mixed, ctx(), ['a', 'b', 'c'], decor)
  eq(r.error, undefined)
  eq(r.save.picnic.active.pets, ['a'], '清潔 < 20、心情 < 30 的不參加（引擎選錯了也會在存檔層再擋一次）')
  eq(r.save.pets.map((p) => [p.cleanliness, p.mood]), [[72, 85], [19, 80], [80, 20]], '參加的 清潔 −8、心情 +5；其他不變')
  eq([r.save.points, r.save.picnic.count, r.save.picnic.date], [10, 1, todayKey(NOW)], '不收金幣、今天第 1 次')
  eq(r.save.pets[0].lastInteract, NOW, '參加野餐算互動')
  eq(PIC.startPicnic(r.save, ctx(), ['a'], decor).error, PIC.PICNIC_TEXT.active, '同時只能一場')
  eq(PIC.picnicEndDue(r.save, ctx({ nowMs: NOW + 299000 })), null, '4:59 還沒結束')
  eq(PIC.picnicEndDue(r.save, ctx({ nowMs: NOW + 300000 })), 'time', '5 分鐘到')
  eq(PIC.picnicEndDue(r.save, ctx({ weather: 'rain' })), 'rain', '轉成下雨 → 提前結束')
  eq(PIC.picnicEndDue(r.save, ctx({ hour: 19.6 })), 'night', '天黑 → 提前結束')
  const ended = PIC.endPicnic(r.save, NOW + 300000)
  eq(ended.pets, r.save.pets, '結束時不再加減數值（+5、−8 只在開始時算一次）')
  eq([ended.picnic.active, ended.picnic.lastEnd, ended.picnic.count], [undefined, NOW + 300000, 1], '結束：冷卻從結束起算')
  eq(PIC.endPicnic(ended, NOW + 999), ended, '沒在野餐：結束不動')
  // 冷卻 30 分鐘、每天 3 次
  const at = (ms) => ctx({ nowMs: NOW + ms })
  ok(PIC.picnicBlock(ended, at(300000 + 29 * 60000)).startsWith('野餐完要休息一下'), '冷卻 29 分鐘：不行')
  eq(PIC.picnicToday(ended, NOW + 300000 + 29 * 60000).cooldownMs, 60000, '還剩 1 分鐘')
  eq(PIC.picnicBlock(ended, at(300000 + 30 * 60000)), null, '30 分鐘：可以')
  let s = ended, t = 300000 + 30 * 60000
  for (const k of [2, 3]) { s = PIC.startPicnic(s, at(t), ['a'], decor).save; eq(s.picnic.count, k, `第 ${k} 次`); t += 300000; s = PIC.endPicnic(s, NOW + t); t += 30 * 60000 }
  eq(PIC.picnicBlock(s, at(t)), PIC.PICNIC_TEXT.dailyMax, '第 4 次：今天次數用完')
  eq(s.pets[0].cleanliness, 80 - 24, '3 次野餐清潔共 −24')
  // 跨日（本機日期 00:00）：隔天 6:00 次數歸零
  const tomorrow6 = new Date(2026, 10, 18, 6, 0, 0).getTime()
  eq(PIC.picnicToday(s, tomorrow6), { count: 0, left: 3, cooldownMs: 0, active: false }, '隔天次數歸零')
  eq(PIC.picnicBlock(s, { nowMs: tomorrow6, hour: 6, weather: 'sunny' }), null, '隔天可以')
  eq(PIC.picnicToday(s, new Date(2026, 10, 17, 23, 59, 59).getTime()).count, 3, '23:59:59 還是今天')
  eq(PIC.picnicToday(s, new Date(2026, 10, 18, 0, 0, 0).getTime()).count, 0, '00:00 換日')
  // 重新整理／離線回來：進行中的野餐直接結束（冷卻從離開時算，不早於開始、不晚於預定結束）
  const act = r.save
  const reload1 = PIC.settlePicnicOnLoad({ ...act, lastSeen: NOW + 120000 })
  eq([reload1.picnic.active, reload1.picnic.lastEnd, reload1.picnic.count], [undefined, NOW + 120000, 1], '2 分鐘時重新整理：結束時間 = 離開時、次數不退')
  eq(reload1.pets, act.pets, '不補償、不扣數值')
  eq(PIC.settlePicnicOnLoad({ ...act, lastSeen: NOW + 9e6 }).picnic.lastEnd, NOW + 300000, '離線很久：結束時間 = 預定結束')
  eq(PIC.settlePicnicOnLoad({ ...act, lastSeen: NOW - 5000 }).picnic.lastEnd, NOW, '時鐘倒退：不早於開始')
  eq(PIC.settlePicnicOnLoad(base), base, '沒有進行中的：不動')
  // 存檔讀寫野餐紀錄
  const rt = parseSave(JSON.parse(JSON.stringify(act)))
  eq(rt.picnic, act.picnic, '野餐紀錄存檔後讀回相同')
  eq(parseSave({ ...act, picnic: { date: 5, count: 'x', active: { startedAt: 'bad' } } }).picnic, { date: '', count: 0, lastEnd: 0 }, '壞掉的野餐紀錄補預設、丟掉壞的進行中')
  // 找新主人：寵物正在野餐 → 存檔照常移除（參加名單裡留著也沒關係），其他野餐紀錄不動
  const rh = rehomePet({ ...act, pets: [...act.pets, pet({ id: 'd' })] }, 'a')
  eq([rh.error, rh.save.picnic], [undefined, act.picnic], '野餐中的寵物可以找新主人；野餐紀錄不動')
  // 裝飾隨機
  const seen = { mat: new Set(), basket: new Set(), n: new Set(), food: new Set() }
  for (let i = 0; i < 2000; i++) { const d = PIC.rollDecor(rnd); seen.mat.add(d.mat); seen.basket.add(d.basket); seen.n.add(d.foods.length); d.foods.forEach((f) => seen.food.add(f)); ok(new Set(d.foods).size === d.foods.length, '食物不重複') }
  eq([[...seen.mat].sort(), [...seen.basket].sort(), [...seen.n].sort(), [...seen.food].sort()], [[0, 1, 2], [0, 1], [1, 2], [0, 1, 2, 3]], '墊子 3 色、籃子 2 種、食物 1～2 樣（4 種）都會出現')
}

// ============ 5. 野餐：store（開始、結束、重新整理、跨日） ============
{
  store.clear()
  overrides.nowOffsetMs = NOW - Date.now()
  overrides.hour = 10
  overrides.weather = 'sunny'
  const today = todayKey(NOW)
  const sv = { ...farm371, lastSeen: NOW, lastDailyClaim: today, gifts: { date: today, count: 4 }, earning: { ...farm371.earning, date: today }, bowl: { date: today, used: 0 } }
  store.set('aemc-desktop:farm-save', JSON.stringify(sv))
  setSaveStorage(new LocalStorageAdapter())
  await useFarmStore.getState().init()
  const S = () => useFarmStore.getState()
  const before = S().save.pets.map((p) => [p.mood, p.cleanliness])
  eq(S().startPicnic(['p1', 'p2', 'p3'], { mat: 0, basket: 1, foods: [0, 3] }), null, 'store 開始')
  const afterStart = S().save.pets.map((p) => [p.mood, p.cleanliness])
  afterStart.forEach(([m, c], i) => { near(m, Math.min(100, before[i][0] + 5), 1e-9, '心情 +5'); near(c, before[i][1] - 8, 1e-9, '清潔 −8') })
  await new Promise((r) => setImmediate(r))
  eq(JSON.parse(store.get('aemc-desktop:farm-save')).picnic.active.pets, ['p1', 'p2', 'p3'], '開始時立刻寫入存檔')
  eq(S().startPicnic(['p1'], { mat: 0, basket: 1, foods: [0] }), PIC.PICNIC_TEXT.active, 'store：同時只能一場')
  // 重新整理（重新載入同一份存檔）：直接結束
  overrides.nowOffsetMs += 60000
  useFarmStore.setState({ status: 'loading', save: null })
  await S().init()
  eq([S().save.picnic.active, S().save.picnic.count], [undefined, 1], '重新整理：進行中的野餐結束、次數不退')
  near(S().save.picnic.lastEnd, NOW, 2000, '冷卻從離開網頁（上次存檔的 lastSeen）起算')
  S().save.pets.forEach((p, i) => near(p.cleanliness, afterStart[i][1] - 2 / 60, 0.005, '重新整理不補償清潔（只有離開這 1 分鐘的正常下降 −0.033）'))
  await new Promise((r) => setImmediate(r))
  eq(JSON.parse(store.get('aemc-desktop:farm-save')).picnic.active, undefined, '結束後立刻寫回')
  // tick：時間到 → 結束
  overrides.nowOffsetMs += 31 * 60000
  eq(S().startPicnic(['p1'], { mat: 2, basket: 0, foods: [1] }), null, '冷卻過後第 2 次')
  overrides.nowOffsetMs += 301000
  S().tick()
  eq([S().save.picnic.active, S().save.picnic.count], [undefined, 2], 'tick：時間到自動結束')
  // tick：轉雨 → 結束
  overrides.nowOffsetMs += 31 * 60000
  eq(S().startPicnic(['p1'], { mat: 2, basket: 0, foods: [1] }), null, '第 3 次')
  overrides.weather = 'rain'
  S().tick()
  eq(S().save.picnic.active, undefined, '轉成下雨：提前結束')
  overrides.weather = 'sunny'
  overrides.nowOffsetMs += 31 * 60000
  eq(S().startPicnic(['p1'], { mat: 2, basket: 0, foods: [1] }), PIC.PICNIC_TEXT.dailyMax, '第 4 次不行')
  overrides.nowOffsetMs = 0; overrides.hour = null; overrides.weather = null
}

// ============ 6. 野餐：引擎（墊子落地、座位、中途離開、找新主人、拍照姿勢、不用吃的姿勢） ============
{
  const E = new PixelEngine()
  let sd = 5
  E.rand = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 }
  E.setSize(1920, 902, 1)
  E.setOwned(['kennel', 'bowls', 'catTree'])
  const V = [['dog', 'shiba'], ['cat', 'tabby'], ['dog', 'golden'], ['cat', 'ragdoll'], ['dog', 'corgi'], ['cat', 'siamese']]
  const pets = V.map(([sp, v], i) => pet({ id: 'q' + i, species: sp, variant: v, satiety: 40 }))
  E.sync(pets)
  E.hooks = { ...E.hooks, eatAtBowl: () => null }
  const fr = (t) => ({ nowMs: NOW + t * 1000, hour: 12, weather: 'sunny', gifts: [] })
  ok(E.picnicMatFits(), '1920×930 放得下')
  eq(E.picnicCandidates(pets, { nowMs: NOW, hour: 12 }), ['q0', 'q1', 'q2', 'q3', 'q4', 'q5'], '6 隻都可以參加')
  // 拖著一隻：不能參加
  E.beginDrag('q5', 10, 10)
  eq(E.picnicCandidates(pets, { nowMs: NOW, hour: 12 }).includes('q5'), false, '被拖著的不參加')
  E.endDrag()
  E.update(0.6, fr(0))
  ok(E.sendToBath('q4') === null, 'q4 走去洗澡')
  eq(E.picnicCandidates(pets, { nowMs: NOW, hour: 12 }).includes('q4'), false, '走去洗澡的不參加')
  E.cancelBathWalk('q4')
  const active = { startedAt: NOW, until: NOW + 300000, pets: pets.map((p) => p.id), mat: 0, basket: 1, foods: [0, 1] }
  E.syncPicnic(active)
  eq(E.picnicParticipants(), null, '墊子還在飛：還沒分座位')
  let t = 0
  for (; t < 0.8; t += 0.1) E.update(0.1, fr(t))
  eq(E.picnicParticipants(), null, '0.8 秒還在飛')
  E.update(0.15, fr(t))
  eq(E.picnicParticipants(), 6, '落地：6 隻都分到座位')
  let sawEat = false, maxT = 0
  for (let i = 0; i < 15 * 10; i++) { t += 0.1; E.update(0.1, fr(t)); for (const a of E.actors.values()) if (a.picnic && (a.action === 'eat' || a.bld)) sawEat = true; if (E.picnicSeated() === 6 && !maxT) maxT = t }
  eq(E.picnicSeated(), 6, '15 秒內 6 隻都坐到墊子上')
  ok(!sawEat, '野餐中不用吃的姿勢、不去食盆（飽食 40 < 門檻 60 也一樣）')
  log(`6 隻全部坐好用了約 ${maxT.toFixed(1)} 秒`)
  const mat = E.picnicMat()
  const seatsSeen = [...E.actors.values()].map((a) => [Math.round(a.x - mat.x0), Math.round(a.y - mat.y0)])
  eq(seatsSeen.sort((a, b) => a[0] - b[0] || a[1] - b[1]), [...PX.MAT_SEATS].map((s) => [...s]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), '每隻在自己的座位上')
  const acts = new Set([...E.actors.values()].map((a) => a.action))
  eq([...acts], ['sit'], '坐著等（狗 sit_a／sit_b 輪換、貓 sit）')
  // 停 30 秒：位置不動、互相不推開
  const pos0 = [...E.actors.values()].map((a) => [a.x, a.y])
  for (let i = 0; i < 300; i++) { t += 0.1; E.update(0.1, fr(t)) }
  eq([...E.actors.values()].map((a) => [a.x, a.y]), pos0, '坐好之後位置固定（避讓不會把墊上的寵物推開）')
  // 拍照：開心姿勢 1.6 秒後回到坐著
  eq(E.picnicCheer(), 6, '拍照：6 隻開心')
  eq(new Set([...E.actors.values()].map((a) => a.action)).has('happy'), true)
  for (let i = 0; i < 17; i++) { t += 0.1; E.update(0.1, fr(t)) }
  eq([...new Set([...E.actors.values()].map((a) => a.action))], ['sit'], '1.6 秒後坐回去')
  // 中途離開：拖曳、洗澡、玩耍、找新主人
  E.beginDrag('q0', 10, 10); E.endDrag()
  eq(E.actors.get('q0').picnic, null, '被拖走 → 離開野餐')
  E.sendToBath('q1')
  eq(E.actors.get('q1').picnic, null, '去洗澡 → 離開野餐')
  E.beginPlay('q2', 'ball')
  eq(E.actors.get('q2').picnic, null, '開始玩耍 → 離開野餐')
  E.removePet('q3')
  eq(E.picnicParticipants(), 2, '找新主人 → 移除；剩 2 隻還在野餐')
  E.removePet('q4'); E.removePet('q5')
  eq(E.picnicParticipants(), 0, '全部離開 → 0（畫面層會結束野餐：「寵物都離開了」）')
  E.syncPicnic(undefined)
  eq(E.picnicMat(), null, '存檔沒有進行中 → 墊子收掉')
  ok([...E.actors.values()].every((a) => !a.picnic), '座位全部放掉')
}

// ============ 7. 17 種視窗：野餐墊位置、相機提示、照片裁切 ============
const SZ17 = [[1920, 900, 1], [1920, 930, 1], [1920, 950, 1], [1900, 1000, 1.25], [1920, 1000, 1], [1920, 1120, 1], [1536, 730, 1], [1536, 864, 1], [1440, 780, 1], [1366, 650, 1], [1280, 620, 1], [1280, 720, 1], [1024, 768, 1], [2560, 1300, 1], [2560, 1440, 1], [1536, 730, 1.25], [1920, 930, 1.25]]
const DIR = R + 'public/assets/'
const man = JSON.parse(readFileSync(DIR + readdirSync(DIR).find((f) => /^manifest\..*\.json$/.test(f)), 'utf8'))
const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
const rows = []
for (const [vw, vh, d] of SZ17) {
  for (const owned of [[], ['kennel', 'bowls', 'catTree']]) {
    const L = LAY.computeLayout(Math.round(vw * d), Math.round((vh - 28) * d), d)
    L.owned = new Set(owned)
    const tag = `${vw}×${vh}@${d}${owned.length ? ' 全買' : ''}`
    const m = PX.picnicMatRect(L)
    ok(m, tag + ' 放得下野餐墊')
    eq([m.x1 - m.x0, m.y1 - m.y0], [PX.MAT_W, PX.MAT_H], tag + ' 尺寸')
    ok(m.y0 >= L.farBottom + LAY.BACK_BASE && m.y1 <= LAY.pathTopOf(L), tag + ' 在草地中段（後排景物腳底之下、走道上緣之上）')
    for (const s of LAY.buildingSlots(L)) if (['kennel', 'bowls', 'catTree'].includes(s.id)) ok(!hit(m, LAY.slotBox(s)), tag + ' 不被 ' + s.id + ' 擋住（不管有沒有買）')
    const tx = LAY.towerX(L)
    ok(!hit(m, { x0: tx - LAY.TOWER_W / 2, x1: tx + LAY.TOWER_W / 2, y0: LAY.towerBase(L) - LAY.TOWER_H, y1: LAY.towerBase(L) }), tag + ' 不壓鐘樓')
    ok(!hit(m, { x0: L.house.x0, x1: L.house.x1, y0: L.house.baseY - LAY.HOUSE_H, y1: L.house.baseY }), tag + ' 不壓住家')
    const bowls = LAY.buildingSlots(L).find((s) => s.id === 'bowls'), tree = LAY.buildingSlots(L).find((s) => s.id === 'catTree')
    ok(m.x0 >= bowls.x - bowls.w / 2 - 60 && m.x1 <= tree.x + tree.w / 2 + 60, tag + ' 大致在食盆水盆與貓跳台之間')
    for (let i = 0; i < 6; i++) { const sp = PX.seatPos(m, i); ok(LAY.isWalkable(L, sp.x, sp.y), tag + ' 座位站得住 ' + i) }
    const cam = PX.cameraRect(L, m)
    ok(cam.x0 >= 0 && cam.x1 <= L.W && cam.y0 >= 0 && cam.y1 <= L.H, tag + ' 相機在畫面內')
    const cc = LAY.rectCss(L, cam)
    ok(cc.y0 >= 0 && cc.x0 >= 0 && cc.x1 <= vw && cc.y1 <= vh - 28, tag + ' 相機（CSS）在畫布內')
    const camCssW = cc.x1 - cc.x0
    const crops = POLAROID_KEYS.map((k) => { const sz = cropSizeFor(man.frames[k].meta.window); return PX.photoCrop(L, m, sz.w, sz.h) })
    for (const c of crops) {
      ok(c.x0 >= 0 && c.y0 >= 0 && c.x1 <= L.W && c.y1 <= L.H, tag + ' 裁切在畫面內')
      ok(c.x0 <= m.x0 && c.x1 >= m.x1 && c.y0 <= m.y0 - 30 && c.y1 >= m.y1, tag + ' 裁切包含整個墊子與後排寵物的頭（墊子頂端往上 30）')
    }
    if (!owned.length) rows.push(`${tag.padEnd(16)} S=${L.S} ${L.W}×${L.H} 墊子 (${m.x0},${m.y0})-(${m.x1},${m.y1}) CSS (${Math.round((m.x0 * L.S) / d)},${Math.round((m.y0 * L.S + L.offsetY) / d) + 28}) 相機 CSS ${Math.round(camCssW)}px 寬 裁切 ${crops.map((c) => `${c.x1 - c.x0}×${c.y1 - c.y0}`).join('/')}`)
  }
}
log(rows.join('\n'))

// ============ 8. 素材一致性 ============
{
  for (const k of PX.MAT_KEYS) {
    const f = man.frames[k]
    eq([f.w, f.h, f.atlas], [PX.MAT_W, PX.MAT_H, 'picnic'], k + ' 尺寸和 picnic.ts 一致')
    // 座位、籃子、食物都在墊面上（meta.mat 每 4 列一筆，找最近的一列）
    const rowAt = (y) => f.meta.mat.rows.reduce((b, r) => (Math.abs(r[0] - y) < Math.abs(b[0] - y) ? r : b))
    for (const [x, y] of [...PX.MAT_SEATS, PX.MAT_BASKET, ...PX.MAT_FOODS]) { const r = rowAt(y); ok(x >= r[1] && x < r[2], `${k} (${x},${y}) 在墊面上（第 ${r[0]} 列 ${r[1]}～${r[2]}）`) }
  }
  eq([man.frames.picnic_camera.w, man.frames.picnic_camera.h], [PX.CAMERA_W, PX.CAMERA_H], '相機尺寸')
  for (const k of [...PX.FOOD_KEYS, ...PX.BASKET_KEYS, 'picnic_snack_dog', 'picnic_snack_cat']) ok(man.frames[k]?.atlas === 'picnic', k + ' 在 picnic 圖集')
  for (const k of ['pers_lively', 'pers_greedy', 'pers_lazy', 'pers_clingy', 'pers_timid']) eq([man.frames[k].w, man.frames[k].h, man.frames[k].atlas], [20, 20, 'ui'], k)
  for (const k of POLAROID_KEYS) {
    const f = man.frames[k], w = f.meta.window
    eq(f.atlas, 'polaroid', k + ' 在 polaroid 圖集（延後載入）')
    ok(w.x0 > 0 && w.y0 > 0 && w.x1 < f.w && w.y1 < f.h && w.x1 - w.x0 > 40 && w.y1 - w.y0 > 40, k + ' 窗口在相框內 ' + JSON.stringify(w))
    const sz = cropSizeFor(w)
    ok(sz.w * PHOTO_SCALE >= (w.x1 - w.x0) * FRAME_SCALE && sz.w * PHOTO_SCALE < (w.x1 - w.x0) * FRAME_SCALE + PHOTO_SCALE, k + ' 照片剛好填滿窗口（多出 < 1 個照片像素）')
    log(`${k}：相框 ${f.w}×${f.h}、窗口 ${w.x1 - w.x0}×${w.y1 - w.y0}（${JSON.stringify(w)}）→ 裁切 ${sz.w}×${sz.h} 邏輯像素、輸出 ${f.w * FRAME_SCALE}×${f.h * FRAME_SCALE}（下載 ×2）`)
  }
  ok(LAZY_ATLASES.includes('polaroid') && LAZY_ATLASES.includes('skins'), '相框圖集延後載入')
  const keys = Object.keys(man.frames).join(' ')
  ok(!/sticker|decor_|polaroid_a|polaroid_c|parasol|vase/.test(keys), '沒有打包貼紙、陽傘、花瓶、相框 a/c')
  eq(Object.keys(man.atlases).sort(), ['cat_black', 'cat_bluecat', 'cat_calico', 'cat_orange', 'cat_ragdoll', 'cat_siamese', 'dog_collie', 'dog_corgi', 'dog_golden', 'dog_husky', 'dog_poodle', 'dog_shiba', 'fx', 'items', 'picnic', 'polaroid', 'scene', 'skins', 'terrain', 'tools', 'toys', 'ui'], '圖集清單')
  eq(photoFileName(new Date(2026, 10, 17, 9, 5, 7)), 'picnic-20261117-090507.png', '下載檔名')
}

console.log(`v3.8.0 邏輯／引擎測試 ${n} 項全過`)
