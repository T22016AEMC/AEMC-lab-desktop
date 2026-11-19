// v3.7.0 公佈欄、存檔相容、匯出匯入、碼表與倒數（假時鐘）測試
import { store } from './env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const R = (process.env.REPO_ROOT + '/src/')
import { TOOLS } from '../../../src/config/tools.ts'
import * as N from '../../../src/tools/notes.ts'
import * as T from '../../../src/tools/timer.ts'
import { useTimerStore, setTimerClock } from '../../../src/tools/timerStore.ts'
import { useUIStore } from '../../../src/store/uiStore.ts'
import { parseSave, isNewerData } from '../../../src/farm/save/migrate.ts'
import { DATA_REV } from '../../../src/farm/save/types.ts'
import { LocalStorageAdapter, setNewerDataHandler } from '../../../src/farm/save/storage.ts'
import { buildBackup, parseBackup, BACKUP_FORMAT_VERSION, NEWER_VERSION_MESSAGE } from '../../../src/lib/backup.ts'
// v3.6.2 的儲存層（存檔格式與 v3.6.3 相同；v3.6.3 只改了圖）：模擬「舊分頁」寫入
import { LocalStorageAdapter as OldAdapter, setNewerDataHandler as setOldNewer } from '../.work/v362src/src/farm/save/storage.ts'
import { parseSave as oldParse } from '../.work/v362src/src/farm/save/migrate.ts'

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
  if (st.dataRev !== 5 || !st.pets.every((p) => typeof p.personality === 'string')) throw new Error('寫回的存檔沒有 dataRev 3 或缺個性') // v3.10.0：dataRev 5
  return [out, want]
}
process.on('exit', () => console.log('（v3.8.0 adapt：另外檢查了 ' + __n380 + ' 次「舊寵物個性 = 用 id 算的」）'))


let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const T0 = new Date(2026, 10, 14, 12, 0, 0).getTime()
const D = (title, body = '', color = 'yellow') => ({ title, body, color })

// ===== 1. 公佈欄：字數（Array.from）與邊界 =====
{
  eq(N.charCount('🐱🐶'), 2, 'emoji 算 1 個字'); eq(N.charCount('abc'), 3); eq('🐱'.length, 2, '（UTF-16 長度是 2）')
  const t20 = '一二三四五六七八九十一二三四五六七八九十', t20e = '😀'.repeat(20)
  eq(N.validateDraft(t20, ''), null, '標題 20 字可以'); eq(N.validateDraft(t20e, ''), null, '標題 20 個 emoji 可以（UTF-16 長度 40）')
  eq(N.validateDraft(t20 + '一', ''), '標題最多 20 字'); eq(N.validateDraft(t20e + '😀', ''), '標題最多 20 字', '21 個 emoji 不行')
  eq(N.validateDraft('a', 'x'.repeat(200)), null); eq(N.validateDraft('a', '🐱'.repeat(200)), null, '內容 200 個 emoji 可以')
  eq(N.validateDraft('a', 'x'.repeat(201)), '內容最多 200 字'); eq(N.validateDraft('a', '🐱'.repeat(201)), '內容最多 200 字')
  eq(N.validateDraft('', 'x'), '請輸入標題'); eq(N.validateDraft('   ', 'x'), '請輸入標題')
  // 截斷：不切壞 emoji
  const c = N.clip('😀'.repeat(25), 20); eq([c.cut, N.charCount(c.text), c.text.length], [true, 20, 40], '貼上 25 個 emoji 截成 20 個（沒有半個 emoji）')
  ok(!/[\uD800-\uDBFF]$/.test(c.text), '結尾不是孤立的代理字元')
  eq(N.clip('abc', 20), { text: 'abc', cut: false })
  const long = 'あ'.repeat(500); eq(N.charCount(N.clip(long, TOOLS.notes.bodyMax).text), 200, '貼上 500 字截成 200')
}

// ===== 2. 增刪改、第 9 張被擋、最新在前 =====
let list = []
{
  for (let i = 1; i <= 8; i++) {
    const r = N.addNote(list, D('第' + i + '張', '內容' + i, ['yellow', 'pink', 'blue', 'green'][i % 4]), T0 + i * 1000, 'id' + i)
    ok(r.ok, '新增第 ' + i + ' 張'); list = r.notes
  }
  eq(list.map((x) => x.id), ['id8', 'id7', 'id6', 'id5', 'id4', 'id3', 'id2', 'id1'], '新的排前面')
  eq(N.canAdd(list), false)
  const r9 = N.addNote(list, D('第9張'), T0 + 9000, 'id9'); eq(r9, { ok: false, error: TOOLS.notes.fullMessage }, '第 9 張被擋並顯示訊息'); eq(TOOLS.notes.fullMessage, '最多 8 張，請先刪除一張')
  const u = N.updateNote(list, 'id3', D('改過的標題', '新內容', 'green'), T0 + 20000); ok(u.ok)
  const x3 = u.notes.find((x) => x.id === 'id3'); eq([x3.title, x3.body, x3.color, x3.createdAt, x3.updatedAt], ['改過的標題', '新內容', 'green', T0 + 3000, T0 + 20000], '編輯後建立時間不變、修改時間更新')
  eq(u.notes.map((x) => x.id), list.map((x) => x.id), '編輯不改變順序')
  eq(N.updateNote(list, 'nope', D('a'), T0).ok, false); eq(N.updateNote(list, 'id1', D('x'.repeat(21)), T0), { ok: false, error: '標題最多 20 字' })
  list = N.deleteNote(u.notes, 'id5'); eq(list.length, 7); ok(!list.some((x) => x.id === 'id5'), '刪除'); eq(N.canAdd(list), true)
  const r = N.addNote(list, D('  前後空白  '), T0 + 30000, 'idA'); ok(r.ok); eq(r.notes[0].title, '前後空白', '標題去掉前後空白'); list = r.notes
  ok(/^n-[0-9a-z]+-[0-9a-z]+$/.test(N.makeNoteId(T0)), 'id 格式')
  eq(N.addNote([], D('a', '', 'red'), T0), { ok: false, error: '顏色不正確' })
}

// ===== 3. 驗證（存檔、匯入）：壞資料單張捨棄 =====
const goodNote = (i, extra = {}) => ({ id: 'g' + i, title: '好的' + i, body: 'b', color: 'blue', createdAt: T0 + i, updatedAt: T0 + i, ...extra })
{
  const raw = [
    goodNote(1),
    null, 'str', 42, [], // 不是物件
    goodNote(2, { title: 123 }), // 型別錯
    goodNote(3, { title: 'x'.repeat(21) }), // 標題太長
    goodNote(4, { body: 'y'.repeat(201) }), // 內容太長
    goodNote(5, { color: 'purple' }), // 顏色不在 4 色
    goodNote(6, { createdAt: 'x' }), goodNote(7, { updatedAt: NaN }), // 時間壞掉
    goodNote(8, { id: '' }), goodNote(9, { id: 'z'.repeat(41) }), goodNote(1, { title: '重複 id' }), // id 壞或重複
    goodNote(10, { title: '   ' }), // 只有空白
    goodNote(11, { title: '😀'.repeat(20), body: '🐱'.repeat(200) }), // emoji 邊界：合法
    goodNote(12, { extra: '<img src=x onerror=alert(1)>' }), // 多的欄位丟掉
  ]
  const c = N.cleanNotes(raw)
  eq(c.map((x) => x.id), ['g12', 'g11', 'g1'], '只留合法的 3 張（新的在前）')
  eq(Object.keys(c[0]).sort(), ['body', 'color', 'createdAt', 'id', 'title', 'updatedAt'], '只留規定的欄位')
  eq(N.cleanNotes(undefined), []); eq(N.cleanNotes({}), []); eq(N.cleanNotes('x'), [])
  const ten = Array.from({ length: 10 }, (_, i) => goodNote(i + 1))
  eq(N.cleanNotes(ten).map((x) => x.id), ['g10', 'g9', 'g8', 'g7', 'g6', 'g5', 'g4', 'g3'], '超過 8 張只留最新的 8 張')
  eq(N.cleanNotes([goodNote(1, { title: '<b>粗體</b>&amp;' })])[0].title, '<b>粗體</b>&amp;', '文字原樣保留（顯示時當純文字）')
}

// ===== 4. 存檔相容：v3.6.3 格式存檔（3 隻寵物、321 金幣、三個建築） =====
const dump = JSON.parse(readFileSync((process.env.REPO_ROOT + '/tests-archive/v390/fixtures/save363.json'), 'utf8'))
const raw363 = dump['aemc-desktop:farm-save']
const obj363 = JSON.parse(raw363)
{
  eq([obj363.pets.length, obj363.points, obj363.ownedBuildings, obj363.dataRev, 'notes' in obj363], [3, 321, ['kennel', 'bowls', 'catTree'], 1, false], '測試存檔：v3.6.x 格式')
  const s = parseSave(obj363)
  ok(s, 'v3.6.3 存檔可以讀')
  const { notes, dataRev, ...rest } = s
  const { dataRev: _o, ...orest } = obj363
  eq(S37(rest), orest, '除了 dataRev、notes（v3.8.0：與寵物的 personality/lastInteract）以外每個欄位都和原本一樣')
  eq([notes, dataRev, DATA_REV], [[], 5, 5], 'notes 補成空、dataRev 3（v3.8.0；v3.10.0：5）')
  eq(isNewerData(obj363), false, 'v3.6.3 存檔不是「較新版本」')
  // 儲存層：載入不重置、沒有退款、沒有「較新版本」
  store.clear()
  store.set('aemc-desktop:farm-save', raw363)
  const A = new LocalStorageAdapter()
  const lr = await A.loadOrReset(() => { throw new Error('不應該重置') })
  eq([lr.reset, lr.newer ?? false, lr.refund ?? 0], ['none', false, 0], '不重置、不報錯、沒有退款')
  ok(!store.has('aemc-desktop:farm-pre-v5-backup'), '沒有寫重置備份')
  eq(...W37(store.get('aemc-desktop:farm-save'), raw363), 'v3.8.0：載入時把補上的固定個性寫回儲存（原有欄位不變、dataRev 3）')
  // 存檔後再讀：notes 正確
  const withNotes = { ...lr.save, notes: N.cleanNotes([goodNote(1), goodNote(2, { title: '第二張🐱', body: '多行\n內容', color: 'pink' })]) }
  await A.save(withNotes)
  const back = JSON.parse(store.get('aemc-desktop:farm-save'))
  eq([back.dataRev, back.notes.length, back.pets.length, back.points, back.ownedBuildings], [5, 2, 3, 321, ['kennel', 'bowls', 'catTree']]) // v3.9.0：dataRev 4；v3.10.0：5
  const lr2 = await new LocalStorageAdapter().loadOrReset(() => { throw new Error('x') })
  eq(lr2.save.notes, withNotes.notes, '存檔後再讀，notes 完全相同')
  eq(lr2.save.pets, lr.save.pets, '寵物相同')
  // 舊分頁（v3.6.2/3 的程式）想覆寫 dataRev 2 的存檔：不寫入（舊程式的「更新版本保護」），notes 保留
  let oldWarned = 0
  setOldNewer(() => oldWarned++)
  const oldSave = oldParse(obj363)
  await new OldAdapter().save({ ...oldSave, points: 1 })
  eq([oldWarned, JSON.parse(store.get('aemc-desktop:farm-save')).notes.length, JSON.parse(store.get('aemc-desktop:farm-save')).points], [1, 2, 321], 'v3.6.x 舊分頁不覆寫 dataRev 2 的存檔（notes 沒被洗掉）')
  const oldLoad = await new OldAdapter().loadOrReset(() => { throw new Error('x') })
  eq(oldLoad.newer, true, '舊版程式載入 dataRev 2 的存檔：視為較新版本、不讀不重置')
  // 更新版本保護（本版）：dataRev 3 的存檔不讀、不覆寫
  let warned = 0
  setNewerDataHandler(() => warned++)
  store.set('aemc-desktop:farm-save', JSON.stringify({ ...back, dataRev: 6 })) // v3.10.0：較新的是 dataRev 6
  eq((await new LocalStorageAdapter().loadOrReset(() => { throw new Error('x') })).newer, true, 'dataRev 4 → 不讀（v3.8.0：3 是目前版本）')
  await new LocalStorageAdapter().save(withNotes)
  eq([warned, JSON.parse(store.get('aemc-desktop:farm-save')).dataRev], [1, 6], 'dataRev 5 → 不覆寫（v3.8.0；v3.10.0：6）')
  // 存檔裡有壞掉的便利貼：載入時單張捨棄
  store.set('aemc-desktop:farm-save', JSON.stringify({ ...back, notes: [goodNote(1), goodNote(2, { color: 'x' }), 'bad'] }))
  eq((await new LocalStorageAdapter().loadOrReset(() => { throw new Error('x') })).save.notes.map((x) => x.id), ['g1'], '存檔裡壞的單張捨棄，其他照讀')
  // notes 欄位壞成非陣列：視為空，不影響其他資料
  store.set('aemc-desktop:farm-save', JSON.stringify({ ...back, notes: 'oops' }))
  const lr3 = await new LocalStorageAdapter().loadOrReset(() => { throw new Error('x') })
  eq([lr3.save.notes, lr3.save.points, lr3.save.pets.length], [[], 321, 3])
}

// ===== 5. 匯出再匯入：完整還原；v2／v3 不報錯；確認視窗的張數 =====
{
  const list0 = { schemaVersion: 1, apps: [] }
  const farm = { ...parseSave(obj363), notes: N.cleanNotes([goodNote(1), goodNote(2, { title: '標題🐶', body: '第一行\n第二行', color: 'green' }), goodNote(3, { color: 'pink' })]) }
  eq(BACKUP_FORMAT_VERSION, 7, '匯出檔格式版本 5（v3.8.0；v3.10.0：7）')
  const b = buildBackup(farm, list0, '3.7.0', new Date(T0))
  eq(b.formatVersion, 7) // v3.8.0；v3.10.0：7
  const text = JSON.stringify(b)
  const p = parseBackup(text, text.length)
  ok(p.ok, '匯入 v4')
  eq(p.backup.data.farm, farm, '匯出再匯入：養殖場存檔（含 notes）完全還原')
  eq([p.summary.noteCount, p.summary.hasNotes], [3, true], '確認視窗：公佈欄 3 張')
  // v3（v3.6.x 匯出）：沒有 notes → 視為空；檔案裡就算有 notes 也不讀
  const b3 = { format: 'aemc-desktop-backup', formatVersion: 3, exportedAt: 'x', appVersion: '3.6.3', data: { farm: obj363, appList: list0 } }
  const p3 = parseBackup(JSON.stringify(b3), 100)
  ok(p3.ok, '匯入 v3 不報錯'); eq([p3.backup.data.farm.notes, p3.summary.noteCount, p3.summary.hasNotes], [[], 0, false])
  const p3n = parseBackup(JSON.stringify({ ...b3, data: { farm: { ...obj363, notes: [goodNote(1)] }, appList: list0 } }), 100)
  eq(p3n.backup.data.farm.notes, [], 'v3 檔案裡的 notes 不讀（視為空）')
  // v2（v3.4.x～v3.5.x 匯出）
  const { collection, finds, events, skins, dataRev, ...farm2 } = obj363
  const p2 = parseBackup(JSON.stringify({ ...b3, formatVersion: 2, data: { farm: farm2, appList: list0 } }), 100)
  ok(p2.ok, '匯入 v2 不報錯'); eq([p2.backup.data.farm.notes, p2.backup.data.farm.points, p2.backup.data.farm.pets.length], [[], 321, 3])
  // v5 → 較新版本
  eq(parseBackup(JSON.stringify({ ...b, formatVersion: 8 }), 100).error, NEWER_VERSION_MESSAGE, 'v7 → 較新版本（v3.9.0：6 是目前版本；v3.10.0：v8）')
  // 匯入資料裡壞的便利貼：單張捨棄，不是整份失敗
  const bad = { ...b, data: { ...b.data, farm: { ...b.data.farm, notes: [goodNote(1), goodNote(2, { title: 'x'.repeat(30) }), goodNote(3, { color: 1 }), ...Array.from({ length: 12 }, (_, i) => goodNote(100 + i))] } } }
  const pb = parseBackup(JSON.stringify(bad), 100)
  ok(pb.ok, '壞資料不讓整份匯入失敗'); eq(pb.summary.noteCount, 8, '超過 8 張只留 8 張'); ok(!pb.backup.data.farm.notes.some((x) => x.id === 'g2' || x.id === 'g3'), '壞的兩張被捨棄')
  // notes 欄位不是陣列
  const pw = parseBackup(JSON.stringify({ ...b, data: { ...b.data, farm: { ...b.data.farm, notes: { a: 1 } } } }), 100)
  ok(pw.ok); eq(pw.summary.noteCount, 0)
}

// ===== 6. 不用 innerHTML（公佈欄與工具相關原始碼） =====
{
  for (const f of ['components/tools/NotesDialog.tsx', 'components/tools/CalculatorDialog.tsx', 'components/tools/TimerDialog.tsx', 'components/tools/ToolDialog.tsx', 'components/tools/ToolsMenu.tsx', 'farm/ui/BoardThumbs.tsx', 'farm/index.tsx', 'tools/notes.ts']) {
    // 註解不算（說明文字會寫到「不用 innerHTML」）
    const src = readFileSync(R + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!/innerHTML|dangerouslySetInnerHTML|outerHTML|insertAdjacentHTML/.test(src), f + ' 不用 innerHTML')
  }
}

// ===== 7. 碼表與倒數（假時鐘） =====
{
  // 碼表：只看時間戳記差，不管中間「更新」了幾次
  let s = T.newStopwatch()
  s = T.swStart(s, 1000)
  eq(T.swElapsed(s, 1000), 0); eq(T.swElapsed(s, 13345), 12345)
  // 背景節流：中間完全沒有呼叫（例如分頁在背景 10 分鐘），回來時時間仍正確
  eq(T.swElapsed(s, 1000 + 600000), 600000, '10 分鐘沒更新也準')
  s = T.swLap(s, 3000); s = T.swLap(s, 7500)
  eq(s.laps.map((l) => [l.n, l.split, l.total]), [[2, 4500, 6500], [1, 2000, 2000]], '計次：每圈與累計，新的在前')
  s = T.swPause(s, 11000); eq(T.swElapsed(s, 999999), 10000, '暫停後時間不動')
  eq(T.swCanLap(s), false, '暫停中不能計次')
  s = T.swStart(s, 20000); eq(T.swElapsed(s, 25000), 15000, '繼續：從 10 秒接著算')
  for (let i = 0; i < 60; i++) s = T.swLap(s, 25000 + i)
  eq(s.laps.length, TOOLS.timer.lapMax, '計次最多 50 筆'); eq(T.swCanLap(s), false)
  eq(T.swReset().accMs, 0)
  eq(T.formatStopwatch(0), '00:00.00'); eq(T.formatStopwatch(61234), '01:01.23'); eq(T.formatStopwatch(3723456), '1:02:03.45')

  // 倒數
  eq(T.hmsToMs(1, 2, 3), 3723000); eq(T.hmsToMs(0, 0, 0), 0); eq(T.hmsToMs(150, 99, 99), (99 * 3600 + 59 * 60 + 59) * 1000, '各欄夾在上限'); eq(T.hmsToMs(NaN, -1, 5), 5000)
  let c = T.newCountdown()
  eq(T.cdStart(c, 0, 0), c, '長度 0 不能開始')
  c = T.cdStart(c, 1000, 90000)
  eq([c.status, T.cdLeft(c, 1000), T.cdLeft(c, 31000), T.cdLeft(c, 91000), T.cdLeft(c, 999999)], ['running', 90000, 60000, 0, 0])
  eq(T.cdCheck(c, 90999).finished, false, '還差 1 ms')
  c = T.cdPause(c, 31000); eq([c.status, T.cdLeft(c, 50000)], ['paused', 60000], '暫停：剩 60 秒不動')
  c = T.cdStart(c, 100000); eq(T.cdLeft(c, 130000), 30000, '繼續：從 60 秒接著倒')
  const done = T.cdCheck(c, 160000); eq([done.finished, done.next.status, T.cdLeft(done.next, 160000)], [true, 'done', 0], '到 0 → 完成')
  eq(T.cdCheck(done.next, 170000).finished, false, '完成只算一次')
  eq(T.cdReset(done.next), T.newCountdown(90000), '歸零回到設定值')
  eq(T.formatCountdown(90000), '01:30'); eq(T.formatCountdown(200), '00:01', '剩 0.2 秒顯示 00:01'); eq(T.formatCountdown(0), '00:00'); eq(T.formatCountdown(3723000), '1:02:03')
}

// ===== 8. 倒數完成的提示（timerStore＋假時鐘＋假計時器）：視窗關著也提示、只提示一次、背景延遲觸發也正確 =====
{
  let now = T0
  setTimerClock(() => now)
  const timers = []
  globalThis.setTimeout = (fn, ms) => { timers.push({ fn, at: now + ms, id: timers.length + 1 }); return timers.length }
  globalThis.clearTimeout = (id) => { const t = timers.find((x) => x.id === id); if (t) t.cancelled = true }
  const runDue = () => { for (const t of [...timers]) if (!t.cancelled && !t.ran && t.at <= now) { t.ran = true; t.fn() } }
  const toasts = () => useUIStore.getState().toast?.message
  useUIStore.setState({ toast: null, toastQueue: [] })
  const st = useTimerStore.getState()
  st.cdStart(5000)
  eq(useTimerStore.getState().cd.status, 'running')
  const pending = timers.filter((t) => !t.cancelled && !t.ran)
  eq(pending.length, 1, '排了一個計時器'); eq(pending[0].at, T0 + 5020, '時間到（多 20 ms）才檢查')
  // 計時器被提早觸發（瀏覽器不保證準時）：不提示、重新排
  pending[0].at = now = T0 + 3000; runDue()
  eq([useTimerStore.getState().cd.status, toasts()], ['running', undefined], '提早觸發：還沒完成、不提示')
  // 背景分頁：計時器被節流到 60 秒後才觸發 → 仍然完成並提示一次（完成時間不受延遲影響）
  now = T0 + 65000; runDue()
  eq([useTimerStore.getState().cd.status, toasts()], ['done', TOOLS.timer.doneMessage], '延遲觸發也完成並提示「倒數完成」')
  eq(useUIStore.getState().toast.ms, TOOLS.timer.doneToastMs)
  useUIStore.setState({ toast: null, toastQueue: [] })
  useTimerStore.getState().cdCheck(); now += 10000; runDue(); useTimerStore.getState().cdCheck()
  eq(toasts(), undefined, '只提示一次')
  // 暫停中不會完成
  useTimerStore.getState().cdReset(); useTimerStore.getState().cdStart(2000); now += 1000; useTimerStore.getState().cdPause(); now += 60000; runDue(); useTimerStore.getState().cdCheck()
  eq([useTimerStore.getState().cd.status, toasts()], ['paused', undefined], '暫停中不完成')
  // 碼表經過 store：用時間戳記
  useTimerStore.getState().swStart(); now += 4321; eq(T.swElapsed(useTimerStore.getState().sw, now), 4321)
}

console.log(`v3.7.0 公佈欄／存檔／匯出匯入／計時測試 ${n} 項全過`)
