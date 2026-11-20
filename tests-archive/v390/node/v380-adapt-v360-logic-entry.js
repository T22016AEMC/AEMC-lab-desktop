import { store } from './env-shim.js'
import assert from 'node:assert/strict'
const S = (process.env.REPO_ROOT + '/src/')
import { BALANCE } from '../../../src/farm/config/balance.ts'
import { ITEMS, itemsFor, isCollected, countOf, shardsHave, shardKey, isCollectionKey, itemDef } from '../../../src/farm/config/items.ts'
import { EVENTS } from '../../../src/farm/config/events.ts'
import { rollOutcome, pickItem, revealFind, revealDue, dueFinds, checkEvents, addFind, findsFull, digCoinRoom } from '../../../src/farm/sim/dig.ts'
import { newSave, todayKey } from '../../../src/farm/sim/points.ts'
import { parseSave, isNewerData, isResetSchema } from '../../../src/farm/save/migrate.ts'
import { LocalStorageAdapter, setNewerDataHandler } from '../../../src/farm/save/storage.ts'
import { buildBackup, parseBackup, BACKUP_FORMAT_VERSION } from '../../../src/lib/backup.ts'
import { useUIStore } from '../../../src/store/uiStore.ts'
import { startPlay, settlePlay, digDelta, PLAY_TOYS } from '../../../src/farm/sim/commands.ts'

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
  if (st.dataRev !== 6 || !st.pets.every((p) => typeof p.personality === 'string')) throw new Error('寫回的存檔沒有 dataRev 3 或缺個性') // v3.10.0：dataRev 5；v4.0：6
  return [out, want]
}
process.on('exit', () => console.log('（v3.8.0 adapt：另外檢查了 ' + __n380 + ' 次「舊寵物個性 = 用 id 算的」）'))


let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const near = (a, b, tol, m) => { n++; assert.ok(Math.abs(a - b) <= tol, `${m}：${a} vs ${b}（容許 ${tol}）`) }
// 可重現的亂數
let seed = 20261101
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const seq = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)] }
const NOW = new Date(2026, 10, 1, 12, 0, 0).getTime()
const DAY = 86400000
const base = () => newSave(NOW, todayKey(NOW))
const withFind = (s, by = 'dog', extra = {}) => ({ ...s, finds: [...s.finds, { id: 'f' + s.finds.length + (extra.id ?? ''), kind: by === 'dog' ? 'mound' : 'bundle', by, fx: 0.5, fy: 0.5, at: NOW, ...extra }] })

// ============ 0. 物品表 ============
{
  eq(ITEMS.length, 28, '28 個項目（含 2 個套組）')
  eq(ITEMS.filter((d) => d.rarity === 'common').length, 10, '常見 10')
  eq(ITEMS.filter((d) => d.rarity === 'uncommon').length, 9, '少見 9（含兩個套組）')
  eq(ITEMS.filter((d) => d.rarity === 'rare').length, 5, '稀有 5')
  eq(ITEMS.filter((d) => d.rarity === 'legendary').map((d) => d.id), ['L001', 'L002', 'L003', 'L004'], '傳說 4')
  eq(new Set(ITEMS.map((d) => d.id)).size, 28, '編號不重複')
  for (const d of ITEMS) ok(d.name && d.desc && d.icon, d.id + ' 名稱描述圖示都有')
  eq(itemsFor('dog', 'uncommon').map((d) => d.id), ['U001', 'U002', 'U003', 'U004', 'U005', 'U006', 'U007', 'U008'], '狗的少見池（8）')
  eq(itemsFor('cat', 'uncommon').map((d) => d.id), ['U001', 'U003', 'U004', 'U005', 'U006', 'U007', 'U008', 'U009'], '貓的少見池（8）')
  eq(itemsFor('dog', 'legendary').map((d) => d.id), ['L001', 'L002'], '狗的傳說池')
  eq(itemsFor('cat', 'legendary').map((d) => d.id), ['L003', 'L004'], '貓的傳說池')
  eq(itemsFor('dog', 'common').length, 10); eq(itemsFor('cat', 'rare').length, 5)
  eq(itemDef('U002').shards, 6); eq(itemDef('U009').shards, 6)
  eq(itemDef('C005').name, '黃金狗便便'); eq(itemDef('L002').desc, '裡面有未公開技術、神祕股票代號，以及永遠不會公開的分紅公式，但我沒鑰匙')
  eq(itemDef('U009').desc, '簽了名才發現是賣身契'); eq(itemDef('U002').desc, '該不會要發達了吧?')
  for (const k of ['C001', 'U002-1', 'U002-6', 'U009-3', 'L004']) ok(isCollectionKey(k), k)
  for (const k of ['C001-1', 'U002', 'U002-7', 'U002-0', 'X999', 'U009-9', '']) ok(!isCollectionKey(k), '不合法 ' + k)
}

// ============ 1. 抽獎分布 ============
{
  const N = 1_000_000
  const cnt = { empty: 0, bronze: 0, silver: 0, gold: 0, common: 0, uncommon: 0, rare: 0, legendary: 0 }
  for (let i = 0; i < N; i++) {
    const r = rollOutcome(rnd, 1)
    cnt[r.kind === 'coin' ? r.coin : r.kind === 'item' ? r.rarity : 'empty']++
  }
  const want = { empty: 0.48, bronze: 0.12, silver: 0.05, gold: 0.01, common: 0.34 * 34 / 48, uncommon: 0.1 * 34 / 48, rare: 0.035 * 34 / 48, legendary: 0.005 * 34 / 48 }
  let sum = 0
  for (const k of Object.keys(want)) { sum += cnt[k] / N; near(cnt[k] / N, want[k], 4 * Math.sqrt(want[k] * (1 - want[k]) / N) + 1e-4, '分布 ' + k) }
  near(sum, 1, 1e-9, '總和 100%')
  // 經過 revealFind 的實際流程（每次都用新存檔，所以不受每日上限影響）
  const M = 60_000
  const k2 = { empty: 0, coin: 0, item: 0 }
  const coinSum = { bronze: 0, silver: 0, gold: 0 }
  for (let i = 0; i < M; i++) {
    const s = withFind(base(), i % 2 ? 'cat' : 'dog')
    const r = revealFind(s, s.finds[0].id, NOW, rnd)
    k2[r.result.kind]++
    if (r.result.kind === 'coin') { coinSum[r.result.coin]++; eq(r.save.points, s.points + BALANCE.dig.coinValue[r.result.coin], '金幣面額') }
  }
  near(k2.empty / M, 0.48, 0.01, 'revealFind 空'); near(k2.coin / M, 0.18, 0.01, 'revealFind 金幣'); near(k2.item / M, 0.34, 0.01, 'revealFind 收藏品')
  near(coinSum.bronze / M, 0.12, 0.008, '銅'); near(coinSum.silver / M, 0.05, 0.005, '銀'); near(coinSum.gold / M, 0.01, 0.003, '金')
}

// ============ 2. 70% 防重複、各自的池、套組 ============
{
  const col = {}
  for (const id of ['C001', 'C002', 'C003', 'C004', 'C005']) col[id] = 1
  let miss = 0
  const N = 200_000
  for (let i = 0; i < N; i++) { const r = pickItem('dog', 'common', col, rnd); if (!col[r.def.id]) miss++ }
  near(miss / N, 0.85, 0.005, '10 項已收 5：從未收集挑的機率 = 0.7 + 0.3×0.5 = 85%')
  const all = Object.fromEntries(ITEMS.filter((d) => d.rarity === 'common').map((d) => [d.id, 1]))
  const hist = {}
  for (let i = 0; i < N; i++) { const r = pickItem('cat', 'common', all, rnd); hist[r.def.id] = (hist[r.def.id] ?? 0) + 1 }
  for (const d of itemsFor('cat', 'common')) near(hist[d.id] / N, 0.1, 0.005, '全收集後同稀有度平均 ' + d.id)
  const h2 = {}
  for (let i = 0; i < N; i++) { const r = pickItem('dog', 'rare', {}, rnd); h2[r.def.id] = (h2[r.def.id] ?? 0) + 1 }
  for (const d of itemsFor('dog', 'rare')) near(h2[d.id] / N, 0.2, 0.005, '稀有均勻 ' + d.id)
  // 貓狗各自的池
  const seenDog = new Set(), seenCat = new Set()
  for (let i = 0; i < 400_000; i++) {
    const o = rollOutcome(rnd)
    if (o.kind !== 'item') continue
    seenDog.add(pickItem('dog', o.rarity, {}, rnd).def.id)
    seenCat.add(pickItem('cat', o.rarity, {}, rnd).def.id)
  }
  for (const id of ['U009', 'L003', 'L004']) ok(!seenDog.has(id), '狗不會抽到貓專屬 ' + id)
  for (const id of ['U002', 'L001', 'L002']) ok(!seenCat.has(id), '貓不會抽到狗專屬 ' + id)
  for (const id of ['U002', 'L001', 'L002']) ok(seenDog.has(id), '狗抽得到 ' + id)
  for (const id of ['U009', 'L003', 'L004']) ok(seenCat.has(id), '貓抽得到 ' + id)
  for (const d of ITEMS.filter((d) => d.pool === 'both')) ok(seenDog.has(d.id) && seenCat.has(d.id), '共用 ' + d.id)
  // 套組：片數偏向缺的
  const c3 = { [shardKey('U002', 1)]: 2, [shardKey('U002', 2)]: 1, [shardKey('U002', 3)]: 1 }
  let lack = 0, tot = 0
  for (let i = 0; i < 600_000; i++) {
    const r = pickItem('dog', 'uncommon', c3, rnd)
    if (r.def.id !== 'U002') continue
    tot++
    ok(r.shard >= 1 && r.shard <= 6, '片號 1～6')
    if (!c3[shardKey('U002', r.shard)]) lack++
  }
  near(lack / tot, 0.85, 0.01, '套組已收 3 片：抽到缺的那片 = 0.7 + 0.3×0.5')
  eq(isCollected(c3, itemDef('U002')), false, '3 片不算已收集'); eq(shardsHave(c3, itemDef('U002')), 3, '3／6')
  eq(countOf(c3, itemDef('U002')), 4, '套組總數 = 各片相加')
  const full = { ...c3, [shardKey('U002', 4)]: 1, [shardKey('U002', 5)]: 1, [shardKey('U002', 6)]: 1 }
  eq(isCollected(full, itemDef('U002')), true, '6 片都有才算已收集')
  const allBut = Object.fromEntries(itemsFor('dog', 'uncommon').filter((d) => d.id !== 'U002').map((d) => [d.id, 1]))
  let u2 = 0
  for (let i = 0; i < 100_000; i++) if (pickItem('dog', 'uncommon', allBut, rnd).def.id === 'U002') u2++
  near(u2 / 100_000, 0.7 + 0.3 / 8, 0.006, '只剩套組未收集：0.7 + 0.3/8')
}

// ============ 3. 每日金幣上限 ============
{
  const gold = () => 0.175 // 金幣（面額 5）
  const bronze = () => 0.05
  const silver = () => 0.15
  let s = withFind(withFind(withFind(base(), 'dog', { id: 'a' }), 'cat', { id: 'b' }), 'dog', { id: 'c' })
  const [a, b, c] = s.finds.map((f) => f.id)
  let r = revealFind(s, a, NOW, gold); eq([r.result.kind, r.result.value], ['coin', 5], '第一個金幣 5'); s = r.save
  r = revealFind(s, b, NOW, gold); eq([r.result.kind, r.result.value], ['coin', 5], '貓也算同一個上限：10'); s = r.save
  eq(s.earning.digCoins, 10, '今日 10')
  eq(digCoinRoom(s, NOW), 0, '沒有空間了')
  const pts = s.points
  r = revealFind(s, c, NOW, bronze); eq(r.result, { kind: 'empty', capped: true }, '超過後掉空'); eq(r.save.points, pts, '不給金幣'); eq(r.save.finds.length, 0, '寶物仍被揭曉掉')
  s = withFind(base(), 'dog'); s = { ...s, earning: { ...s.earning, digCoins: 9 } }
  r = revealFind(s, s.finds[0].id, NOW, silver); eq([r.result.kind, r.result.value], ['coin', 1], '剩 1 枚只給 1'); eq(r.save.earning.digCoins, 10)
  s = withFind(base(), 'dog'); s = { ...s, earning: { ...s.earning, digCoins: 10 } }
  r = revealFind(s, s.finds[0].id, NOW, seq(0.3, 0.5, 0.1))
  eq(r.result.kind, 'item', '上限後仍掉收藏品'); ok(r.save.collection[r.result.id] === 1)
  s = withFind(base(), 'dog'); s = { ...s, earning: { ...s.earning, digCoins: 10 } }
  r = revealFind(s, s.finds[0].id, NOW + DAY, gold); eq([r.result.kind, r.result.value], ['coin', 5], '隔天歸零'); eq(r.save.earning.digCoins, 5); eq(r.save.earning.date, todayKey(NOW + DAY))
  s = withFind(base(), 'dog', { at: NOW - DAY + 1000 }); s = { ...s, earning: { ...s.earning, date: todayKey(NOW - DAY), digCoins: 10 } }
  r = revealFind(s, s.finds[0].id, NOW + 1000, gold); eq(r.result.kind, 'coin', '以揭曉當下的日期算（昨天挖、今天揭曉算今天）')
  eq(r.save.earning.programCoins, 0)
}

// ============ 4. 事件 ============
{
  const shards6 = (id) => Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [shardKey(id, i), 1]))
  let s = { ...base(), points: 30, collection: shards6('U002') }
  let r = checkEvents(s, NOW)
  eq(r.notices, [{ id: 'dogLeak', coins: 10 }], '狗：集齊洩密碎片 → 罰款 10'); eq(r.save.points, 20); ok(r.save.events.dogLeak === NOW)
  r = checkEvents(r.save, NOW + 1); eq(r.notices, [], '一次性'); eq(r.save.points, 20)
  s = { ...base(), points: 4, collection: shards6('U009') }
  r = checkEvents(s, NOW); eq(r.notices, [{ id: 'catContract', coins: 4 }], '貓：違約金只扣到 0'); eq(r.save.points, 0)
  s = { ...base(), points: 0, collection: shards6('U002') }
  r = checkEvents(s, NOW); eq([r.notices[0].coins, r.save.points], [0, 0], '0 金幣也不會變負'); ok(r.save.events.dogLeak !== undefined, '旗標仍寫入（不會再觸發）')
  const c5 = shards6('U002'); delete c5[shardKey('U002', 6)]
  eq(checkEvents({ ...base(), collection: c5 }, NOW).notices, [], '5 片不觸發')
  s = { ...base(), points: 7, collection: { L001: 1, L002: 3 } }
  r = checkEvents(s, NOW)
  eq(r.notices, [{ id: 'dogVault', coins: 100 }], '狗：L001＋L002 → 100 金幣'); eq(r.save.points, 107)
  eq(r.save.skins, { owned: ['house.gold'], equipped: { house: 'house.gold' } }, '金色屋頂解鎖並穿上')
  eq(checkEvents(r.save, NOW + 5).notices, [], '獎勵一次性')
  s = { ...base(), collection: { L003: 1, L004: 1 } }
  r = checkEvents(s, NOW)
  eq(r.notices, [{ id: 'catAtlantis', coins: 100 }], '貓：L003＋L004'); eq(r.save.skins, { owned: ['tower.gold'], equipped: { tower: 'tower.gold' } }, '黃金鐘樓')
  s = { ...base(), collection: { L001: 1, L002: 1, L003: 1, L004: 1 } }
  r = checkEvents(s, NOW)
  eq(r.notices.map((x) => x.id), ['dogVault', 'catAtlantis', 'colLegend']); /* v4.0：L001～L004 全有時多了獨立的新事件「傳說全集齊」（+100），排在配對之後 */ eq([...r.save.skins.owned].sort(), ['house.gold', 'tower.gold']); eq(r.save.skins.equipped, { house: 'house.gold', tower: 'tower.gold' })
  eq(checkEvents({ ...base(), collection: { L001: 5 } }, NOW).notices, [], '只有 L001 不觸發')
  // 透過 revealFind 的最後一片觸發（rand 序列：結果→挑缺的項目→缺的片）
  const others = Object.fromEntries(itemsFor('dog', 'uncommon').filter((d) => d.id !== 'U002').map((d) => [d.id, 1]))
  const five = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [shardKey('U002', i), 1]))
  s = withFind({ ...base(), points: 50, collection: { ...others, ...five } }, 'dog')
  const rr2 = revealFind(s, s.finds[0].id, NOW, seq(0.45, 0.1, 0.0, 0.1, 0.0)) // 0.45 → 少見
  eq([rr2.result.kind, rr2.result.id, rr2.result.shard, rr2.result.have, rr2.result.total], ['item', 'U002', 6, 6, 6], '第 6 片')
  eq(rr2.notices, [{ id: 'dogLeak', coins: 10 }], '集齊那一刻觸發'); eq(rr2.save.points, 40)
  // 收藏冊與提示文字不含事件字樣
  const fs = await import('node:fs')
  const src = fs.readFileSync(S + 'components/CollectionDialog.tsx', 'utf8') + fs.readFileSync(S + 'farm/config/items.ts', 'utf8')
  for (const w of ['罰款', '違約', '訴訟', '提告']) ok(!src.includes(w), '收藏冊與物品表不含「' + w + '」')
  const dig = fs.readFileSync(S + 'farm/sim/dig.ts', 'utf8')
  const resultTexts = dig.slice(dig.indexOf('export function resultText'))
  for (const w of ['罰款', '違約', '訴訟']) ok(!resultTexts.includes(w), '揭曉提示不含「' + w + '」')
  eq(EVENTS.find((e) => e.id === 'dogLeak').body(10), '你把機密文件拼回去了……某公司發現後提告，罰款 10 金幣。')
  eq(EVENTS.find((e) => e.id === 'catContract').body(10), '你把合約拼好，才發現簽名的是你……違約金 10 金幣。')
  eq(EVENTS.find((e) => e.id === 'dogVault').body(100), '裡面有 100 金幣，還有一張亞特蘭提斯房屋的設計圖。住家換成亞特蘭提斯房屋了。') // 4.0-B1 文案
  eq(EVENTS.find((e) => e.id === 'catAtlantis').body(100), '雷射與山銅合而為一，鐘樓變成亞特蘭提斯鐘樓了。獲得 100 金幣。') // 4.0-B1 文案
  ok(EVENTS.find((e) => e.id === 'dogLeak').body(3).includes('3 金幣') && EVENTS.find((e) => e.id === 'dogLeak').body(3).includes('不會扣到負數'), '金幣不夠時說明')
}

// ============ 5. 舊存檔升級、存檔保護、匯入匯出 ============
{
  const raw = {
    schemaVersion: 5,
    pets: [{ id: 'p1', species: 'dog', variant: 'shiba', name: '小柴', adoptedAt: NOW - 5 * DAY, heightFactor: 1.05, weight: 52, satiety: 70, mood: 80, cleanliness: 60, awakeUntil: NOW + 9 }, { id: 'p2', species: 'cat', variant: 'tabby', name: '橘子', adoptedAt: NOW - 2 * DAY, heightFactor: 0.9, weight: 40, satiety: 50, mood: 65, cleanliness: 90 }],
    points: 123, lastSeen: NOW - 1000, lastDailyClaim: '2026-11-01', gifts: { date: '2026-11-01', count: 2 }, nextPetId: 3, createdAt: NOW - 9 * DAY,
    ownedBuildings: ['kennel', 'bowls', 'catTree'],
    earning: { date: '2026-11-01', programCoins: 4, gameCoins: 2, lastAward: { 'official-filmaster': NOW - 5000 } },
    bowl: { date: '2026-11-01', used: 1 },
  }
  const s = parseSave(JSON.parse(JSON.stringify(raw)))
  ok(s, '舊存檔可讀（不重置）')
  for (const k of Object.keys(raw)) if (k !== 'earning') eq(S37(s[k]), raw[k], '逐欄相同：' + k)
  eq(s.earning, { ...raw.earning, digCoins: 0 }, 'earning 原欄位相同，多 digCoins: 0')
  eq([s.collection, s.finds, s.events, s.skins, s.dataRev, s.schemaVersion], [{}, [], {}, { owned: [], equipped: {} }, 6, 5], '新欄位補預設；schemaVersion 維持 5（v3.8.0：dataRev 3；v3.10.0：dataRev 5；v4.0：6）')
  eq(isResetSchema(raw), false, '不是重置用的舊格式')
  eq(parseSave(JSON.parse(JSON.stringify(s))), s, '冪等')
  // 存檔含已移除／從沒發布過的建築 id（sandbox、campfire）：安全過濾、不重置、不報錯、其餘欄位逐欄相同（營火照舊退款 20）
  {
    const withSb = parseSave({ ...JSON.parse(JSON.stringify(raw)), ownedBuildings: ['kennel', 'sandbox', 'bowls', 'catTree'] })
    ok(withSb, '含 sandbox 的存檔可讀（不重置）')
    eq(withSb.ownedBuildings, ['kennel', 'bowls', 'catTree'], 'sandbox 被過濾掉')
    for (const k of Object.keys(raw)) if (!['earning', 'ownedBuildings'].includes(k)) eq(S37(withSb[k]), raw[k], '含 sandbox：逐欄相同 ' + k)
    eq(withSb.points, raw.points, 'sandbox 不退款')
    const both = parseSave({ ...JSON.parse(JSON.stringify(raw)), ownedBuildings: ['kennel', 'campfire', 'sandbox'] })
    eq(both.ownedBuildings, ['kennel'], '營火與沙坑都被過濾'); eq(both.points, raw.points + 20, '只有營火退款 20')
    eq(isResetSchema({ ...raw, ownedBuildings: ['sandbox'] }), false, '不會被當成要重置的舊格式')
    const Asb = new LocalStorageAdapter('t-key-sb', 't-bak-sb')
    store.set('t-key-sb', JSON.stringify({ ...raw, ownedBuildings: ['kennel', 'sandbox'] }))
    const lr0 = await Asb.loadOrReset(() => base())
    eq([lr0.reset, lr0.newer, lr0.save.ownedBuildings, lr0.refund], ['none', undefined, ['kennel'], undefined], '載入含 sandbox 的存檔：不重置、沒有退款、沒有錯誤')
    eq(JSON.parse(store.get('t-key-sb')).ownedBuildings, ['kennel'], 'v3.8.0：載入時寫回補上個性的存檔，順帶把認不得的 sandbox 從儲存拿掉（parseSave 本來就會過濾）')
  }
  const bad = parseSave({ ...raw, collection: { C001: 3, 'C001-1': 1, X: 9, 'U002-9': 1, 'U002-2': 2.7, L001: 'a', C002: -3 }, finds: [{ id: 'a', kind: 'mound', by: 'dog', fx: 5, fy: -1, at: 7 }, { id: 'a', kind: 'mound', by: 'dog', fx: 0, fy: 0, at: 7 }, { id: 'b', kind: 'x', by: 'dog', fx: 0, fy: 0, at: 1 }, null, { id: 'c', kind: 'bundle', by: 'cat', fx: 0.2, fy: 0.3, at: NOW, near: true }, null], events: { dogLeak: 5, x: 'y' }, skins: { owned: ['house.gold', 3], equipped: { house: 'house.gold', tower: 'tower.gold' } }, earning: { ...raw.earning, digCoins: 99 } })
  eq(bad.collection, { C001: 3, 'U002-2': 2 }, '收藏只留合法鍵與正整數')
  eq(bad.finds, [{ id: 'a', kind: 'mound', by: 'dog', fx: 1, fy: 0, at: 7 }, { id: 'c', kind: 'bundle', by: 'cat', fx: 0.2, fy: 0.3, at: NOW }], '寶物：重複 id（多餘的 near 欄位被丟掉）、壞資料被清掉，座標夾在 0～1')
  eq(bad.events, { dogLeak: 5 }); eq(bad.skins, { owned: ['house.gold'], equipped: { house: 'house.gold' } }, '外觀：只留已擁有的'); eq(bad.earning.digCoins, 10, 'digCoins 夾在上限')
  const many = parseSave({ ...raw, finds: Array.from({ length: 20 }, (_, i) => ({ id: 'f' + i, kind: 'mound', by: 'dog', fx: 0.5, fy: 0.5, at: NOW })) })
  eq(many.finds.length, 8, '最多 8 個')
  // 儲存層：舊存檔載入不重置
  const A = new LocalStorageAdapter('t-key', 't-bak')
  store.set('t-key', JSON.stringify(raw))
  const lr = await A.loadOrReset(() => base())
  eq([lr.reset, lr.newer], ['none', undefined], '載入不重置'); eq(lr.save.points, 123); eq(...W37(store.get('t-key'), raw, ['earning']), 'v3.8.0：載入時把補上的固定個性寫回儲存（原有欄位不變；earning 只多 digCoins）')
  // 存檔保護
  let warned = 0
  setNewerDataHandler(() => warned++)
  const newer = { ...raw, dataRev: 7, points: 999 } // v3.10.0：較新的是 dataRev 6；v4.0：7
  store.set('t-key', JSON.stringify(newer))
  const lr2 = await A.loadOrReset(() => base())
  eq([lr2.save, lr2.reset, lr2.newer], [null, 'none', true], '更新版本的資料：不讀、不重置'); eq(JSON.parse(store.get('t-key')), newer, '沒被動到')
  await A.save(s)
  eq(JSON.parse(store.get('t-key')), newer, '自動存檔不覆寫更新版本的資料'); eq(warned, 1, '通知畫面層')
  store.set('t-key', JSON.stringify({ ...raw, schemaVersion: 6 }))
  eq((await A.loadOrReset(() => base())).newer, true, 'schemaVersion 更大也一樣')
  store.set('t-key', JSON.stringify(raw))
  await A.save(s)
  eq(JSON.parse(store.get('t-key')).dataRev, 6, '同版本正常寫入（v3.8.0：dataRev 3；v3.10.0：dataRev 5；v4.0：6）'); eq(warned, 1)
  eq(isNewerData({ schemaVersion: 5, dataRev: 1 }), false); eq(isNewerData({ schemaVersion: 5 }), false); eq(isNewerData({ schemaVersion: 5, dataRev: 2 }), false); eq(isNewerData({ schemaVersion: 5, dataRev: 3 }), false); eq(isNewerData({ schemaVersion: 5, dataRev: 4 }), false); eq(isNewerData({ schemaVersion: 5, dataRev: 5 }), false); eq(isNewerData({ schemaVersion: 5, dataRev: 6 }), false); eq(isNewerData({ schemaVersion: 5, dataRev: 7 }), true) // v3.10.0：5 是目前版本；v4.0：6 是目前版本
  setNewerDataHandler(null)
  // 匯出入
  const list = { schemaVersion: 1, apps: [] }
  const col = { ...s, collection: { C001: 2, 'U002-1': 1 }, finds: [{ id: 'x', kind: 'mound', by: 'dog', fx: 0.4, fy: 0.6, at: NOW }], events: { dogLeak: NOW }, skins: { owned: ['house.gold'], equipped: { house: 'house.gold' } } }
  eq(BACKUP_FORMAT_VERSION, 8, '匯出檔格式版本 5（v3.8.0；v3.10.0：7；v4.0：8）')
  const b3 = buildBackup(col, list, '3.6.0', new Date(NOW))
  eq(b3.formatVersion, 8) // v3.8.0；v3.10.0：7；v4.0：8
  const p3 = parseBackup(JSON.stringify(b3), 100)
  ok(p3.ok, 'v3 匯入'); eq(p3.backup.data.farm, col, 'v3 來回完全相同')
  const b2 = { format: 'aemc-desktop-backup', formatVersion: 2, exportedAt: 'x', appVersion: '3.5.1', data: { farm: raw, appList: list } }
  const p2 = parseBackup(JSON.stringify(b2), 100)
  ok(p2.ok, 'v2 匯入'); eq(p2.backup.data.farm, s, 'v2 補預設值，其餘欄位相同')
  eq(parseBackup(JSON.stringify({ ...b2, formatVersion: 9 }), 100).error, '這個存檔來自較新版本，請重新整理網頁更新後再試', 'v7 → 較新版本（v3.9.0：6 是目前版本；v3.10.0：v8，7 是目前版本；v4.0：v9，8 是目前版本）')
  eq(parseBackup(JSON.stringify({ ...b2, formatVersion: 1 }), 100).error, '這個備份來自重置前的版本，無法匯入', 'v1 拒絕')
  eq(parseBackup(JSON.stringify({ ...b3, data: { farm: { ...col, dataRev: 7 }, appList: list } }), 100).error, '這個存檔來自較新版本，請重新整理網頁更新後再試', 'dataRev 較新 → 較新版本（v4.0：dataRev 7）')
}

// ============ 6. 離線與時鐘 ============
{
  let s = base()
  const ages = [11 * 60_000, 10 * 60_000, 10 * 60_000 - 1, 5 * 60_000, 0, 30 * 60_000, 9 * 60_000 + 59_000, 2 * DAY]
  for (let i = 0; i < 8; i++) s = addFind(s, { id: 'q' + i, kind: i % 2 ? 'bundle' : 'mound', by: i % 2 ? 'cat' : 'dog', fx: 0.1 * i, fy: 0.5, at: NOW - ages[i] })
  eq(s.finds.length, 8, '8 個')
  eq(addFind(s, { id: 'q9', kind: 'mound', by: 'dog', fx: 0, fy: 0, at: NOW }), null, '第 9 個放不進去（上限 8）')
  ok(findsFull(s), '已滿'); ok(!findsFull({ ...s, finds: s.finds.slice(0, 7) }), '7 個沒滿'); ok(findsFull({ ...s, finds: s.finds.slice(0, 3) }, 3), '低視窗上限 3')
  eq(dueFinds(s, NOW).map((f) => f.id), ['q0', 'q1', 'q5', 'q7'], '剛好 10 分鐘算到期、差 1 毫秒不算')
  const rd = revealDue(s, NOW, () => 0.99)
  eq(rd.revealed.length, 4, '到期的一次揭曉'); eq(rd.save.finds.map((f) => f.id), ['q2', 'q3', 'q4', 'q6'], '沒到期的保留')
  const rd2 = revealDue(rd.save, NOW, () => 0.99)
  eq(rd2.revealed.length, 0, '同一時間再載入一次不重複結算'); eq(rd2.save, rd.save, '存檔物件不變')
  eq(revealDue(rd.save, NOW + 60_000, () => 0.99).revealed.length, 2, '再過 1 分鐘又有到期的（q2、q6）')
  eq(dueFinds(s, NOW - 3 * DAY).length, 0, '時鐘往前調：不到期')
  const allDue = revealDue(s, NOW + 3 * DAY, () => 0.175)
  eq(allDue.revealed.length, 8, '往後調：全部揭曉')
  eq(allDue.save.points - s.points, 10, '金幣仍然受上限 10 限制'); eq(allDue.save.finds.length, 0)
  eq(allDue.revealed.map((r) => r.result.kind), ['coin', 'coin', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'], '前兩個 5＋5，之後掉空')
  eq(revealDue(s, NOW + 365 * DAY, () => 0.99).revealed.length, 8, '離線很久也不超過 8 個')
}

// ============ 7. 玩耍開始與結算（commands）============
{
  const pet = (id, species, extra = {}) => ({ id, species, variant: species === 'dog' ? 'shiba' : 'tabby', name: id, adoptedAt: NOW - DAY * 5, heightFactor: 1, weight: 50, satiety: 80, mood: 60, cleanliness: 80, ...extra })
  const sv = (pets, points = 10, extra = {}) => ({ ...base(), pets, points, ...extra })
  const ctx = (extra = {}) => ({ nowMs: NOW, hour: 12, ...extra })
  const dog = pet('d', 'dog'), cat = pet('c', 'cat')
  eq(PLAY_TOYS.dog.map((t) => [t.id, t.cost, t.seconds]), [['ball', 1, 30], ['dig', 1, 30]]); eq(PLAY_TOYS.cat.map((t) => [t.id, t.cost, t.seconds]), [['hunt', 1, 30]])
  let r = startPlay(sv([dog, cat]), ctx(), 'd', 'dig'); ok(!r.error); eq(r.save.points, 9, '挖寶 1 金幣')
  r = startPlay(sv([dog, cat]), ctx(), 'c', 'hunt'); ok(!r.error); eq(r.save.points, 9, '尋寶 1 金幣')
  ok(startPlay(sv([dog, cat]), ctx(), 'c', 'dig').error, '貓不能挖寶'); ok(startPlay(sv([dog, cat]), ctx(), 'd', 'hunt').error, '狗不能尋寶')
  const full = sv([dog, cat], 10, { finds: Array.from({ length: 8 }, (_, i) => ({ id: 'f' + i, kind: 'mound', by: 'dog', fx: 0.5, fy: 0.5, at: NOW })) })
  for (const [id, toy] of [['d', 'dig'], ['c', 'hunt']]) { r = startPlay(full, ctx(), id, toy); eq(r.error, '先點開土堆', '滿了：提示'); eq(r.save, full, '滿了：存檔完全不變（不扣金幣）') }
  r = startPlay(full, ctx(), 'd', 'ball'); ok(!r.error, '寶物滿了不影響丟球'); eq(r.save.points, 9)
  const three = sv([dog], 10, { finds: full.finds.slice(0, 3) })
  eq(startPlay(three, ctx({ findCap: 3 }), 'd', 'dig').error, '擺設太多，寶物最多放 3 個，先點開土堆', '草地擠、上限 3（v3.9.0 明確提示；v4.0：文字改成「擺設太多」）'); ok(!startPlay(three, ctx({ findCap: 4 }), 'd', 'dig').error)
  ok(startPlay(sv([dog], 0), ctx(), 'd', 'dig').error.startsWith('金幣不足'), '金幣不足'); ok(startPlay(sv([dog]), ctx({ hour: 23.5 }), 'd', 'dig').error.includes('睡覺'), '睡覺不能開始')
  eq(digDelta(0), {}); eq(settlePlay(sv([dog]), ctx(), 'd', 0, 'dig').save.pets[0], sv([dog]).pets[0], '0 個不動')
  eq(digDelta(1).mood, 3.5); eq(digDelta(5).mood, 8, '上限 8'); eq(digDelta(8).mood, 8); ok(digDelta(5).weight >= -2 && digDelta(5).satiety >= -4)
  const st = settlePlay(sv([dog]), ctx(), 'd', 3, 'dig').save.pets[0]
  near(st.mood, 60 + 6.5, 1e-9, '3 個 → 心情 +6.5'); ok(st.weight < 50 && st.satiety < 80)
  const sc = settlePlay(sv([cat]), ctx(), 'c', 2, 'hunt').save.pets[0]; near(sc.mood, 60 + 5, 1e-9, '貓 2 個 → +5')
}

// ============ 8. Toast 佇列 ============
{
  const U = useUIStore
  const reset = () => U.setState({ toast: null, toastQueue: [] })
  const show = (m, level, ms) => U.getState().showToast(m, ms, level)
  const cur = () => U.getState().toast?.message ?? null
  const hide = () => U.getState().hideToast()
  const realNow = Date.now
  let clock = 1_000_000
  Date.now = () => clock
  reset(); show('A'); show('B'); eq([cur(), U.getState().toastQueue.length], ['B', 0], '一般取代一般')
  reset(); show('每日', 'daily'); show('一般'); eq(cur(), '每日', '低優先序不蓋過目前'); hide(); eq(cur(), '一般', '一般提示排在後面接著顯示（沒過期）')
  reset(); show('一般'); show('每日', 'daily'); eq(cur(), '每日', '每日獎勵蓋過一般提示'); hide(); eq(cur(), null, '被蓋過的一般提示不保留')
  reset(); show('每日', 'daily'); show('揭曉', 'reveal'); eq(cur(), '揭曉', '揭曉蓋過每日'); hide(); eq(cur(), '每日', '每日沒有遺失'); hide(); eq(cur(), null)
  reset(); show('揭曉', 'reveal'); show('每日', 'daily'); show('新版本', 'update', 10000); eq(cur(), '新版本', '有新版本最優先'); hide(); eq(cur(), '揭曉', '被蓋過的揭曉回來（優先序高於每日）'); hide(); eq(cur(), '每日'); hide(); eq(cur(), null)
  reset(); show('一般'); show('揭曉', 'reveal'); hide(); eq(cur(), null, '一般提示被蓋過就丟掉')
  reset(); show('一般'); show('每日', 'daily'); show('揭曉', 'reveal'); show('事件', 'event'); show('版本', 'update')
  const order = []; while (cur()) { order.push(cur()); hide() }
  eq(order, ['版本', '事件', '揭曉', '每日'], '依序：有新版本 > 事件 > 揭曉 > 每日（一般提示被蓋過丟掉）')
  reset(); show('揭曉', 'reveal'); show('過期的一般'); clock += 4000; hide(); eq(cur(), null, '排隊超過 3 秒的一般提示不再顯示')
  reset(); show('揭曉', 'reveal'); show('新鮮的一般'); clock += 1000; hide(); eq(cur(), '新鮮的一般', '3 秒內仍顯示')
  reset(); show('X'); const id1 = U.getState().toast.id; show('X'); ok(U.getState().toast.id > id1, 'id 遞增')
  reset(); show('頭', 'reveal'); for (let i = 0; i < 20; i++) show('每日' + i, 'daily'); ok(U.getState().toastQueue.length <= 8, '佇列上限 8')
  Date.now = realNow
  reset()
}

console.log(`v3.6.0 邏輯測試 ${n} 項通過`)
