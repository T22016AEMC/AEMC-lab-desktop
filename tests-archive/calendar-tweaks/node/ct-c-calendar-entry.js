// C 簽到月曆（Node）：checkins 防呆（隨機）、簽到規則（冪等、只能簽今天、更新前已領、跨月跨年閏年、修剪、上限）、
// farmStore.checkIn（沒有寵物、被接手、較新版本、寫入權失效、立刻寫入）、載入與跨日不再自動 +5、
// DATA_REV 5／匯出格式 7（匯入 2～8 矩陣、6 不讀 checkins）、和 v3.9.1 逐欄相同、舊版讀到 dataRev 5 不覆寫
import { store as LS } from './env-shim.js'
import assert from 'node:assert/strict'
import * as M from '../../../src/farm/save/migrate.ts'
import * as P from '../../../src/farm/sim/points.ts'
import { DATA_REV, CURRENT_SCHEMA_VERSION } from '../../../src/farm/save/types.ts'
import * as BK from '../../../src/lib/backup.ts'
import { BALANCE } from '../../../src/farm/config/balance.ts'
import { overrides } from '../../../src/farm/overrides.ts'
import { useFarmStore, setSaveStorage } from '../../../src/farm/store/farmStore.ts'
import { LocalStorageAdapter, WRITER_KEY } from '../../../src/farm/save/storage.ts'
import { parseSave as oldParse } from '../.work/v391src/src/farm/save/migrate.ts'
import { LocalStorageAdapter as OldAdapter390, setNewerDataHandler as setOldNewer } from '../.work/v390src/src/farm/save/storage.ts'
import * as OBK from '../.work/v390src/src/lib/backup.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const KEY = 'aemc-desktop:farm-save'
let seed = 3100
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const p2 = (x) => String(x).padStart(2, '0')

// ---------- 1. 版本號 ----------
eq([CURRENT_SCHEMA_VERSION, DATA_REV, BK.BACKUP_FORMAT_VERSION, BK.CHECKINS_FORMAT_VERSION, M.CHECKIN_MAX], [5, 6, 8, 7, 62], 'schema 5、DATA_REV 5、匯出格式 7、checkins 從 7 起讀、上限 62（v4.0：DATA_REV 6、匯出格式 8）')

// ---------- 2. isDayKey／cleanCheckins ----------
for (const [v, want] of [['2026-11-19', true], ['2024-02-29', true], ['2026-02-29', false], ['2026-02-30', false], ['2026-13-01', false], ['2026-00-10', false], ['2026-11-31', false], ['2026-12-31', true], ['2026-1-01', false], [' 2026-11-19', false], ['2026-11-19T00', false], [20261119, false], [null, false], ['', false], ['１２３４-11-19', false]]) eq(M.isDayKey(v), want, `isDayKey(${JSON.stringify(v)}) = ${want}`)
eq(M.cleanCheckins(undefined), undefined, '沒有欄位 → undefined')
eq(M.cleanCheckins('2026-11-19'), undefined, '不是陣列 → undefined')
eq(M.cleanCheckins({ 0: '2026-11-19', length: 1 }), undefined, '類陣列物件 → undefined')
eq(M.cleanCheckins([]), undefined, '空陣列 → undefined')
eq(M.cleanCheckins(['x', 3, null]), undefined, '全壞 → undefined')
eq(M.cleanCheckins(['2026-11-19', '2026-11-01', '2026-11-19', '2026-10-31']), ['2026-10-31', '2026-11-01', '2026-11-19'], '去重、排序')
const many = []
for (let i = 0; i < 100; i++) { const d = new Date(2026, 0, 1 + i); many.push(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`) }
const cm = M.cleanCheckins([...many].reverse())
eq(cm.length, 62, '超過 62 筆 → 留 62')
eq(cm[61], many[99], '留最新的')
eq(cm[0], many[38], '丟掉最舊的')
const pool = ['2026-11-19', '2026-02-30', 'abc', 5, null, {}, [], '2025-12-31', '2024-02-29', '2026-11-01', '__proto__', '2026-11-19', '9999-12-31', '0000-01-01', true]
for (let k = 0; k < 20000; k++) {
  const len = Math.floor(rnd() * 90)
  const arr = []
  for (let i = 0; i < len; i++) arr.push(rnd() < 0.5 ? pool[Math.floor(rnd() * pool.length)] : many[Math.floor(rnd() * many.length)])
  const out = M.cleanCheckins(rnd() < 0.05 ? { arr } : arr)
  if (out === undefined) continue
  const sorted = [...out].sort()
  n++
  assert.ok(out.length >= 1 && out.length <= 62 && out.every(M.isDayKey) && new Set(out).size === out.length && out.every((d, i) => d === sorted[i]) && out.every((d) => arr.includes(d)), '隨機 ' + k)
}

// ---------- 3. 簽到規則 ----------
const T0 = new Date(2026, 10, 19, 12, 0, 0).getTime()
const base = (extra = {}) => ({ ...P.newSave(T0, '2026-11-18'), pets: [{ id: 'p1' }], points: 100, ...extra })
eq(P.prevMonthStart('2026-11-19'), '2026-10-01', '上個月 1 號')
eq(P.prevMonthStart('2026-01-05'), '2025-12-01', '一月的上個月是去年十二月')
eq(P.prevMonthStart('2024-03-31'), '2024-02-01', '三月的上個月')
let r = P.checkIn(base(), '2026-11-19')
ok(r.claimed && r.save.points === 105 && r.save.lastDailyClaim === '2026-11-19', '簽到：+5、lastDailyClaim = 今天')
eq(r.save.checkins, ['2026-11-19'], '紀錄加上今天')
const r2 = P.checkIn(r.save, '2026-11-19')
ok(!r2.claimed && r2.save === r.save, '同一天再簽：不給、存檔不變（同一個物件）')
const pre = base({ lastDailyClaim: '2026-11-19' })
const r3 = P.checkIn(pre, '2026-11-19')
ok(!r3.claimed && r3.save === pre && r3.save.checkins === undefined, '更新前已領（lastDailyClaim = 今天、沒有紀錄）：不給、不寫紀錄')
ok(P.checkinDays(pre).has('2026-11-19'), '更新前已領：月曆顯示「簽」')
const rb = P.checkIn(base({ checkins: ['2026-11-19'], lastDailyClaim: '2026-11-10' }), '2026-11-19')
ok(!rb.claimed, '紀錄裡有今天（時鐘調回來）：不給')
const old = ['2026-08-31', '2026-09-30', '2026-10-01', '2026-10-31', '2026-11-18', '2026-12-25']
const rt = P.checkIn(base({ checkins: old }), '2026-11-19')
eq(rt.save.checkins, ['2026-10-01', '2026-10-31', '2026-11-18', '2026-11-19', '2026-12-25'], '修剪：只留上個月 1 號以後，未來日期留著')
const ry = P.checkIn(base({ checkins: ['2025-11-30', '2025-12-01', '2025-12-31'] }), '2026-01-01')
eq(ry.save.checkins, ['2025-12-01', '2025-12-31', '2026-01-01'], '跨年：留去年十二月')
eq(P.checkIn(base({ checkins: ['2024-01-31'] }), '2024-02-29').save.checkins, ['2024-01-31', '2024-02-29'], '閏年 2/29')
// 連續 400 天每天簽（含換月）：紀錄永遠 ≤ 62、都在上個月 1 號以後、金幣每天 +5
let s = base()
for (let i = 0; i < 400; i++) {
  const d = new Date(2026, 0, 1 + i)
  const day = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
  const before = s.points
  s = P.checkIn(s, day).save
  s = P.checkIn(s, day).save
  n++
  assert.ok(s.points === before + 5 && s.checkins.length <= 62 && s.checkins.every((x) => x >= P.prevMonthStart(day)) && s.checkins.at(-1) === day, '連續簽到 ' + day)
}
eq(BALANCE.dailyBonus, 5, '每日 +5')

// ---------- 4. 存檔：和 v3.9.1 逐欄相同（只差 dataRev 與 checkins） ----------
const v4 = { schemaVersion: 5, dataRev: 4, points: 321, lastSeen: T0, lastDailyClaim: '2026-11-18', gifts: { date: '2026-11-18', count: 2 }, nextPetId: 3, createdAt: T0 - 9e8,
  pets: [{ id: 'p1', species: 'dog', variant: 'shiba', name: '小柴', adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 70, mood: 60, cleanliness: 80, personality: 'lazy', lastInteract: T0 }],
  ownedBuildings: ['kennel', 'bowls'], earning: { date: '2026-11-18', programCoins: 3, gameCoins: 2, lastAward: { a: T0 }, digCoins: 1 }, bowl: { date: '2026-11-18', used: 1 },
  collection: { C001: 2 }, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: '2026-11-18', count: 1, lastEnd: T0 - 1e6 },
  farmLayout: { items: [{ id: 'lamp', kind: 'lamp', state: 'placed', x: 200, y: 260 }, { id: 'bush', kind: 'bush', state: 'placed', x: 300, y: 250 }] } }
const np = M.parseSave(v4)
const op = oldParse(v4)
eq({ ...np, dataRev: 0 }, { ...op, dataRev: 0 }, 'v3.9.0 格式（dataRev 4）：新版讀出來和 v3.9.1 逐欄相同（除了 dataRev）')
eq([np.dataRev, 'checkins' in np], [6, false], '新版：dataRev 5、沒有 checkins 欄位（v4.0：dataRev 6）')
eq(np.farmLayout, op.farmLayout, '擺放不變')
eq(np.points, 321, '金幣不變')
const withC = M.parseSave({ ...v4, dataRev: 5, checkins: ['2026-11-18', 'bad', '2026-11-17'] })
eq(withC.checkins, ['2026-11-17', '2026-11-18'], 'dataRev 5 存檔的 checkins 清理後讀入')
eq(M.parseSave(JSON.parse(JSON.stringify(withC))), withC, '寫出再讀回相同')
ok(M.isNewerData({ ...v4, dataRev: 7 }) && !M.isNewerData({ ...v4, dataRev: 6 }) && !M.isNewerData({ ...v4, dataRev: 5 }), 'dataRev 6 是較新、5 不是（v4.0：7 是較新、6 不是）')

// ---------- 5. 舊版 v3.9.0 讀到 dataRev 5：不讀、不覆寫 ----------
LS.clear()
LS.set(KEY, JSON.stringify(withC))
let oldNewer = 0
setOldNewer(() => { oldNewer++ })
const oa = new OldAdapter390()
const olr = await oa.loadOrReset(() => { throw new Error('不應重置') })
ok(olr.newer === true && olr.save === null, 'v3.9.0 載入 dataRev 5 → newer（不讀）')
await oa.save(op)
eq(JSON.parse(LS.get(KEY)).checkins, ['2026-11-17', '2026-11-18'], 'v3.9.0 的自動存檔不覆寫（簽到紀錄還在）')
ok(oldNewer >= 1, 'v3.9.0 顯示「存檔來自更新的版本」')

// ---------- 6. 匯出入：格式 2～8 矩陣 ----------
const appList = { schemaVersion: 1, apps: [] }
const file = (fv, farm) => JSON.stringify({ format: 'aemc-desktop-backup', formatVersion: fv, exportedAt: '', appVersion: '', data: { farm, appList } })
const farm5 = { ...v4, dataRev: 5, checkins: ['2026-11-01', '2026-11-18'] }
for (const fv of [2, 3, 4, 5, 6, 7, 8, 9]) { // v4.0：多一格（格式 8、dataRev 6 是目前版本）
  for (const dr of [3, 4, 5, 6, 7]) {
    const res = BK.parseBackup(file(fv, { ...farm5, dataRev: dr }))
    const want = fv <= 8 && dr <= 6 // v4.0：原本 fv <= 7 && dr <= 5
    eq(res.ok, want, `匯入 格式 ${fv} × dataRev ${dr}：${want ? '接受' : '拒絕'}`)
    if (res.ok) eq(res.backup.data.farm.checkins, fv >= 7 ? ['2026-11-01', '2026-11-18'] : undefined, `格式 ${fv}：checkins ${fv >= 7 ? '讀入' : '不讀'}`)
    if (!res.ok && (fv > 8 || dr > 6)) eq(res.error, BK.NEWER_VERSION_MESSAGE, `格式 ${fv} × dataRev ${dr}：較新版本訊息`)
  }
}
const b6 = BK.parseBackup(file(6, { ...v4, checkins: ['2026-11-18'] }))
ok(b6.ok && b6.backup.data.farm.lastDailyClaim === '2026-11-18' && b6.backup.data.farm.checkins === undefined, '格式 6：夾帶的 checkins 不讀、lastDailyClaim 照備份')
const built = BK.buildBackup(withC, appList, '3.10.1', new Date(T0))
eq([built.formatVersion, built.data.farm.checkins], [8, ['2026-11-17', '2026-11-18']], '匯出：格式 7、帶 checkins（v4.0：格式 8）')
const ores = OBK.parseBackup(JSON.stringify(built))
ok(!ores.ok && ores.error === OBK.NEWER_VERSION_MESSAGE, 'v3.9.0 匯入格式 7 → 較新版本')

// ---------- 7. farmStore：載入與跨日不再自動 +5、checkIn 的各種情況 ----------
const realNow = Date.now()
const todayReal = P.todayKey(realNow)
const yday = P.todayKey(realNow - 86_400_000)
const petOf = (id) => ({ id, species: 'dog', variant: 'shiba', name: id, adoptedAt: realNow - 5e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 90, personality: 'calm', lastInteract: realNow })
const liveSave = (extra = {}) => ({ ...P.newSave(realNow, yday), lastDailyClaim: yday, points: 40, pets: [petOf('p1')], dataRev: 4, ...extra })
const initWith = async (raw) => {
  LS.clear()
  if (raw) LS.set(KEY, JSON.stringify(raw))
  const st = new LocalStorageAdapter()
  setSaveStorage(st)
  useFarmStore.setState({ status: 'loading', save: null, otherTab: false, newerData: false, resetFailed: false })
  await useFarmStore.getState().init()
  return st
}
overrides.nowOffsetMs = 0
await initWith(liveSave())
eq(useFarmStore.getState().save.points, 40, '載入（昨天領過）：不再自動 +5')
eq(useFarmStore.getState().save.lastDailyClaim, yday, '載入：lastDailyClaim 不動')
useFarmStore.getState().tick()
eq(useFarmStore.getState().save.points, 40, 'tick：不再自動 +5')
overrides.nowOffsetMs = 86_400_000
useFarmStore.getState().tick()
eq(useFarmStore.getState().save.points, 40, '跨日的 tick：不再自動 +5')
overrides.nowOffsetMs = 0
let cr = await useFarmStore.getState().checkIn()
ok(cr.claimed && cr.message === P.CHECKIN_TEXT.claimed(5), 'checkIn：簽到成功 ' + cr.message)
eq(useFarmStore.getState().save.points, 45, 'checkIn：+5')
eq(JSON.parse(LS.get(KEY)).points, 45, 'checkIn：立刻寫入（不等節流）')
eq(JSON.parse(LS.get(KEY)).checkins, [todayReal], 'checkIn：紀錄寫入')
eq(JSON.parse(LS.get(KEY)).dataRev, 6, '寫入的 dataRev 5（v4.0：6）')
cr = await useFarmStore.getState().checkIn()
ok(!cr.claimed && cr.message === P.CHECKIN_TEXT.already, '再呼叫：' + cr.message)
const results = await Promise.all([1, 2, 3, 4, 5].map(() => useFarmStore.getState().checkIn()))
eq(results.filter((x) => x.claimed).length, 0, '同時呼叫 5 次：都不給')
eq(useFarmStore.getState().save.points, 45, '金幣仍 45')
// 同時呼叫（今天還沒簽）：只給一次
await initWith(liveSave())
const par = await Promise.all([1, 2, 3, 4, 5].map(() => useFarmStore.getState().checkIn()))
eq(par.filter((x) => x.claimed).length, 1, '還沒簽時同時呼叫 5 次：只給 1 次')
eq(useFarmStore.getState().save.points, 45, '同時呼叫：只 +5')
// 更新前已領
await initWith(liveSave({ lastDailyClaim: todayReal }))
cr = await useFarmStore.getState().checkIn()
ok(!cr.claimed && useFarmStore.getState().save.points === 40, '更新前已領：不給')
// 沒有寵物／沒有存檔
await initWith(liveSave({ pets: [] }))
cr = await useFarmStore.getState().checkIn()
ok(!cr.claimed && cr.message === P.CHECKIN_TEXT.noSave, '沒有寵物：' + cr.message)
await initWith(null)
cr = await useFarmStore.getState().checkIn()
ok(!cr.claimed && cr.message === P.CHECKIN_TEXT.noSave && useFarmStore.getState().save === null, '沒有存檔：' + cr.message)
// 被別的分頁接手（寫入權不是自己）→ 不給、標記停止存檔
await initWith(liveSave())
LS.set(WRITER_KEY, JSON.stringify({ id: 'other-tab', at: 1 }))
cr = await useFarmStore.getState().checkIn()
ok(!cr.claimed && cr.message === P.CHECKIN_TEXT.otherTab, '寫入權被接手：' + cr.message)
ok(useFarmStore.getState().otherTab && useFarmStore.getState().save.points === 40, '寫入權被接手：記憶體金幣不變、標記停止存檔')
eq(JSON.parse(LS.get(KEY)).points, 40, '寫入權被接手：存檔不變')
// 已經是 otherTab／newerData
useFarmStore.setState({ otherTab: true })
ok((await useFarmStore.getState().checkIn()).message === P.CHECKIN_TEXT.otherTab, 'otherTab：不能簽')
useFarmStore.setState({ otherTab: false, newerData: true })
ok((await useFarmStore.getState().checkIn()).message === P.CHECKIN_TEXT.newer, 'newerData：不能簽')
// 寫入權鍵讀不到（例外）：照常簽到
await initWith(liveSave())
const realGet = globalThis.localStorage.getItem
globalThis.localStorage.getItem = (k) => { if (k === WRITER_KEY) throw new Error('x'); return realGet(k) }
cr = await useFarmStore.getState().checkIn()
globalThis.localStorage.getItem = realGet
ok(cr.claimed, '寫入權鍵讀不到：照常簽到（不鎖死）')

console.log(`通過 C 簽到月曆：${n} 項`)
process.exit(0)
