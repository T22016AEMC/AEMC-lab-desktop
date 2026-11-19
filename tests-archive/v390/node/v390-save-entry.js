// v3.9.0 第二階段：存檔 farmLayout 的防呆、載入不改寫、舊分頁保護、匯出匯入（S1～S6）
import { store } from './env-shim.js'
import assert from 'node:assert/strict'
const P = (process.env.REPO_ROOT + '/src/')
import { parseSave, cleanFarmLayout, isNewerData } from '../../../src/farm/save/migrate.ts'
import { DATA_REV, CURRENT_SCHEMA_VERSION } from '../../../src/farm/save/types.ts'
import { LocalStorageAdapter } from '../../../src/farm/save/storage.ts'
import { buildBackup, parseBackup, BACKUP_FORMAT_VERSION, NEWER_VERSION_MESSAGE, LAYOUT_FORMAT_VERSION } from '../../../src/lib/backup.ts'
import { LAYOUT_ITEMS, LAYOUT_MAX_ITEMS } from '../../../src/farm/config/layoutItems.ts'
import { APP_LIST_SCHEMA_VERSION } from '../../../src/store/appListStore.ts'
// v3.8.1（git archive 719a575）與 v3.8.0 的舊程式
import { parseSave as parse381 } from '../.work/v381src/src/farm/save/migrate.ts'
import { LocalStorageAdapter as Adapter381, setNewerDataHandler as setNewer381 } from '../.work/v381src/src/farm/save/storage.ts'
import { parseBackup as parseBackup381, NEWER_VERSION_MESSAGE as NEWER381 } from '../.work/v381src/src/lib/backup.ts'
import { LocalStorageAdapter as Adapter380, setNewerDataHandler as setNewer380 } from '../.work/v380src/src/farm/save/storage.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const KEY = 'aemc-desktop:farm-save'
const clone = (o) => JSON.parse(JSON.stringify(o))
const DEF = new Map(LAYOUT_ITEMS.map((d) => [d.id, d]))

// ---- 一份 v3.8.1 格式的完整存檔（所有欄位都有，parseSave 不需要用到 Date.now）----
const T0 = 1795000000000
const BASE = {
  schemaVersion: 5, dataRev: 3, points: 123, lastSeen: T0, lastDailyClaim: '2026-11-18', gifts: { date: '2026-11-18', count: 1 }, nextPetId: 4, createdAt: T0 - 9e8,
  pets: [
    { id: 'p1', species: 'dog', variant: 'shiba', name: '小柴', adoptedAt: T0 - 5e8, heightFactor: 1.02, weight: 55, satiety: 60, mood: 70, cleanliness: 80, personality: 'greedy', lastInteract: T0 - 1000 },
    { id: 'p2', species: 'cat', variant: 'orange', name: '橘子', adoptedAt: T0 - 4e8, heightFactor: 0.95, weight: 40, satiety: 50, mood: 65, cleanliness: 90, personality: 'lazy', lastInteract: T0 - 2000 },
  ],
  ownedBuildings: ['kennel', 'bowls'],
  earning: { date: '2026-11-18', programCoins: 3, gameCoins: 1, lastAward: { 'official-filmaster': T0 - 5000 }, digCoins: 2 },
  bowl: { date: '2026-11-18', used: 1 },
  collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} },
  notes: [],
  picnic: { date: '2026-11-18', count: 1, lastEnd: T0 - 3600000 },
}

// ---- 參照實作（直接照規格寫，和程式各自獨立），用來和 cleanFarmLayout 比對 ----
function ref(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const list = raw.items
  if (!Array.isArray(list)) return undefined
  const out = []
  const seen = new Set()
  for (let i = 0; i < Math.min(list.length, 300); i++) {
    const e = list[i]
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue
    const def = typeof e.id === 'string' ? DEF.get(e.id) : undefined
    if (!def || typeof e.kind !== 'string' || e.kind !== def.kind || seen.has(def.id)) continue
    seen.add(def.id)
    const fin = (v) => typeof v === 'number' && Number.isFinite(v)
    let state = e.state === 'stored' && def.storable ? 'stored' : 'placed'
    const good = fin(e.x) && fin(e.y)
    if (state === 'placed' && !good && !def.hasDefault) state = 'stored'
    const it = { id: def.id, kind: def.kind, state }
    if (state === 'placed' && good) { it.x = Math.round(Math.min(640, Math.max(0, e.x))); it.y = Math.round(Math.min(320, Math.max(0, e.y))) }
    out.push(it)
  }
  return { items: out }
}
/** 規則的不變量（獨立於參照實作再檢查一次） */
function invariants(out, tag) {
  if (out === undefined) return
  ok(Array.isArray(out.items) && out.items.length <= LAYOUT_ITEMS.length, tag + ' 筆數不超過物件表')
  const ids = new Set()
  for (const it of out.items) {
    const def = DEF.get(it.id)
    ok(def && def.kind === it.kind, tag + ' id／kind 合法')
    ok(!ids.has(it.id), tag + ' id 不重複')
    ids.add(it.id)
    ok(it.state === 'placed' || it.state === 'stored', tag + ' state 合法')
    if (!def.storable) ok(it.state === 'placed', tag + ' 不能收的一定擺放')
    if (it.state === 'stored') ok(!('x' in it) && !('y' in it), tag + ' 庫存不帶座標')
    else {
      const has = 'x' in it
      ok(has === ('y' in it), tag + ' x、y 同時有或同時沒有')
      if (has) ok(Number.isInteger(it.x) && Number.isInteger(it.y) && it.x >= 0 && it.x <= 640 && it.y >= 0 && it.y <= 320 && !Object.is(it.x, -0) && !Object.is(it.y, -0), tag + ' 座標是 0～640、0～320 的整數')
      else ok(def.hasDefault, tag + ' 沒有座標的擺放一定有預設位置（花槽、珊瑚改庫存）')
    }
  }
}
const withoutLayout = (s) => { const c = { ...s }; delete c.farmLayout; return c }

// ================= S1：沒有 farmLayout（v3.8.1 存檔）=================
{
  const a = parseSave(clone(BASE)), b = parse381(clone(BASE))
  ok(a && !('farmLayout' in a), 'S1 沒有欄位 → 結果沒有 farmLayout')
  eq(a.dataRev, 6, 'S1 dataRev 4（v3.10.0：5；v4.0：6）')
  eq(DATA_REV, 6, 'DATA_REV = 4（v3.10.0：5；v4.0：6）')
  eq(CURRENT_SCHEMA_VERSION, 5, 'schemaVersion 仍是 5')
  eq({ ...a, dataRev: 3 }, b, 'S1 其他欄位和 v3.8.1 的 parseSave 逐欄相同')
  eq(parseSave({ ...clone(BASE), farmLayout: undefined }), a, 'S1 farmLayout: undefined 一樣')
  ok(!isNewerData({ ...BASE, dataRev: 4 }), '新版自己寫的 dataRev 4 不算較新')
  ok(!isNewerData({ ...BASE, dataRev: 5 }), 'dataRev 5 不算較新（v3.10.0：5 是目前版本）')
  ok(!isNewerData({ ...BASE, dataRev: 6 }), 'dataRev 6 不算較新（v4.0：6 是目前版本）')
  ok(isNewerData({ ...BASE, dataRev: 7 }), 'dataRev 7 算較新（v4.0）')
}

// ================= S3：逐條規則的固定案例 =================
{
  const C = (items) => cleanFarmLayout({ items })
  const cases = [
    ['不是物件', null, undefined], ['數字', 5, undefined], ['字串', 'x', undefined], ['陣列本身', [{ id: 'lamp', kind: 'lamp', state: 'stored' }], undefined],
    ['沒有 items', {}, undefined], ['items 不是陣列', { items: { 0: 1 } }, undefined], ['items 字串', { items: 'abc' }, undefined],
  ]
  for (const [m, raw, want] of cases) eq(cleanFarmLayout(raw), want, 'S3 ' + m + ' → 整個忽略')
  eq(C([]), { items: [] }, 'S3 空陣列')
  eq(C([1, null, 'a', [], true]), { items: [] }, 'S3 單筆不是物件 → 丟掉')
  eq(C([{ id: 'lamp', kind: 'lantern', state: 'stored' }]), { items: [] }, 'S3 未知 kind 丟掉')
  eq(C([{ id: 'lamp2', kind: 'lamp', state: 'stored' }]), { items: [] }, 'S3 未知 id 丟掉')
  eq(C([{ id: 'tree1', kind: 'bush', state: 'stored' }]), { items: [] }, 'S3 id 和 kind 對不上丟掉')
  eq(C([{ kind: 'lamp', state: 'stored' }]), { items: [] }, 'S3 沒有 id 丟掉')
  eq(C([{ id: 'lamp', kind: 'lamp', state: 'stored' }, { id: 'lamp', kind: 'lamp', state: 'placed', x: 1, y: 2 }]), { items: [{ id: 'lamp', kind: 'lamp', state: 'stored' }] }, 'S3 重複 id 留第一筆')
  eq(C([{ id: 'tree1', kind: 'tree', state: 'xx', x: 10, y: 20 }]), { items: [{ id: 'tree1', kind: 'tree', state: 'placed', x: 10, y: 20 }] }, 'S3 state 不合法 → 擺放')
  eq(C([{ id: 'tree2', kind: 'tree', x: 10, y: 20 }]), { items: [{ id: 'tree2', kind: 'tree', state: 'placed', x: 10, y: 20 }] }, 'S3 沒有 state → 擺放')
  for (const id of ['house', 'tower', 'pond', 'board']) eq(C([{ id, kind: id, state: 'stored' }]), { items: [{ id, kind: id, state: 'placed' }] }, `S3 ${id} 寫成 stored → 擺放（不能收）`)
  eq(C([{ id: 'house', kind: 'house', state: 'stored', x: 50, y: 300 }]), { items: [{ id: 'house', kind: 'house', state: 'placed', x: 50, y: 300 }] }, 'S3 住家 stored 帶座標 → 擺放在該座標')
  eq(C([{ id: 'rocks', kind: 'rocks', state: 'placed', x: 'a', y: 20 }]), { items: [{ id: 'rocks', kind: 'rocks', state: 'placed' }] }, 'S3 x 壞 → x、y 都回預設')
  eq(C([{ id: 'rocks', kind: 'rocks', state: 'placed', x: 20, y: NaN }]), { items: [{ id: 'rocks', kind: 'rocks', state: 'placed' }] }, 'S3 y NaN → 都回預設')
  eq(C([{ id: 'rocks', kind: 'rocks', state: 'placed', x: Infinity, y: 5 }]), { items: [{ id: 'rocks', kind: 'rocks', state: 'placed' }] }, 'S3 x Infinity → 都回預設')
  eq(C([{ id: 'rocks', kind: 'rocks', state: 'placed', x: '20', y: '30' }]), { items: [{ id: 'rocks', kind: 'rocks', state: 'placed' }] }, 'S3 字串數字不算數字')
  eq(C([{ id: 'rocks', kind: 'rocks', state: 'placed', y: 30 }]), { items: [{ id: 'rocks', kind: 'rocks', state: 'placed' }] }, 'S3 缺 x → 都回預設')
  for (const id of ['bush', 'tall_grass', 'planter', 'coral']) {
    eq(C([{ id, kind: id, state: 'placed' }]), { items: [{ id, kind: id, state: 'stored' }] }, `S3 ${id} 擺放但缺座標 → 庫存`)
    eq(C([{ id, kind: id, state: 'placed', x: 'q', y: 40 }]), { items: [{ id, kind: id, state: 'stored' }] }, `S3 ${id} 擺放但座標壞 → 庫存`)
    eq(C([{ id, kind: id, state: 'bogus', y: 40 }]), { items: [{ id, kind: id, state: 'stored' }] }, `S3 ${id} state 不合法（視為擺放）又缺座標 → 庫存`)
    eq(C([{ id, kind: id, state: 'placed', x: 300.4, y: 200.6 }]), { items: [{ id, kind: id, state: 'placed', x: 300, y: 201 }] }, `S3 ${id} 擺放座標合法 → 擺放（取整數）`)
    eq(C([{ id, kind: id, state: 'stored', x: 3, y: 4 }]), { items: [{ id, kind: id, state: 'stored' }] }, `S3 ${id} 庫存帶座標 → 拿掉座標`)
  }
  eq(C([{ id: 'lamp', kind: 'lamp', state: 'placed', x: -50, y: 999 }]), { items: [{ id: 'lamp', kind: 'lamp', state: 'placed', x: 0, y: 320 }] }, 'S3 超範圍夾回')
  eq(C([{ id: 'lamp', kind: 'lamp', state: 'placed', x: 1e308, y: -1e308 }]), { items: [{ id: 'lamp', kind: 'lamp', state: 'placed', x: 640, y: 0 }] }, 'S3 極大極小夾回')
  eq(C([{ id: 'lamp', kind: 'lamp', state: 'placed', x: -0.2, y: -0 }]), { items: [{ id: 'lamp', kind: 'lamp', state: 'placed', x: 0, y: 0 }] }, 'S3 負零變 0')
  eq(C([{ id: 'kennel', kind: 'kennel', state: 'stored', x: 1, y: 1 }]), { items: [{ id: 'kennel', kind: 'kennel', state: 'stored' }] }, 'S3 庫存不帶座標')
  // 300 筆上限：第 301 筆以後就算合法也不看
  const filler = Array.from({ length: 300 }, () => ({ id: 'nope', kind: 'lamp' }))
  eq(C([...filler, { id: 'lamp', kind: 'lamp', state: 'stored' }]), { items: [] }, 'S3 第 301 筆以後略過')
  eq(C([...filler.slice(1), { id: 'lamp', kind: 'lamp', state: 'stored' }]), { items: [{ id: 'lamp', kind: 'lamp', state: 'stored' }] }, 'S3 第 300 筆還會看')
  eq(LAYOUT_MAX_ITEMS, 300, '上限 300')
  // __proto__ 等鍵名
  const proto = JSON.parse('{"items":[{"__proto__":{"id":"lamp","kind":"lamp"},"state":"stored"},{"id":"__proto__","kind":"lamp"},{"id":"constructor","kind":"tree"},{"id":"lamp","kind":"lamp","state":"stored","__proto__":{"x":5}}]}')
  eq(cleanFarmLayout(proto), { items: [{ id: 'lamp', kind: 'lamp', state: 'stored' }] }, 'S3 __proto__／constructor 不污染')
  ok(({}).x === undefined && ({}).id === undefined, 'S3 Object.prototype 沒被改')
  // 全部 18 個物件都認得
  eq(C(LAYOUT_ITEMS.map((d) => ({ id: d.id, kind: d.kind, state: 'placed', x: 100, y: 200 }))).items.length, 18, 'S3 18 個物件都認得')
  eq(LAYOUT_ITEMS.map((d) => d.id), ['house', 'tower', 'pond', 'board', 'lamp', 'kennel', 'bowls', 'catTree', 'tree1', 'tree2', 'bush', 'mushroom', 'rocks', 'flowers', 'stump', 'tall_grass', 'planter', 'coral'], '物件表 id')
  eq(LAYOUT_ITEMS.filter((d) => !d.storable).map((d) => d.id), ['house', 'tower', 'pond', 'board'], '不能收的只有住家、鐘樓、池塘、公佈欄')
  eq(LAYOUT_ITEMS.filter((d) => !d.hasDefault).map((d) => d.id), ['bush', 'tall_grass', 'planter', 'coral'], '沒有預設位置的：灌木、高草叢（640×320 預設版面放不下）、花槽、珊瑚石堆')
  // parseSave 整合：其他欄位不受影響
  const s = parseSave({ ...clone(BASE), farmLayout: { items: [{ id: 'coral', kind: 'coral', state: 'placed', x: 400, y: 250 }] } })
  eq(s.farmLayout, { items: [{ id: 'coral', kind: 'coral', state: 'placed', x: 400, y: 250 }] }, 'S3 parseSave 帶出 farmLayout')
  eq(withoutLayout(s), parseSave(clone(BASE)), 'S3 其他欄位和沒有 farmLayout 時相同')
}

// ================= S2：隨機損壞（固定種子）=================
{
  let seed = 20261118
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const IDS = [...LAYOUT_ITEMS.map((d) => d.id), 'tree3', 'lamp2', '', 'Lamp', '__proto__', 'constructor', 'toString']
  const KINDS = [...new Set(LAYOUT_ITEMS.map((d) => d.kind)), 'lantern', '', 'Tree', 'decor', '__proto__']
  const NUMS = [0, -0, 1, 5.5, 320, 320.5, 640, 640.4, 641, -1, -1e9, 1e9, 1e308, -1e308, NaN, Infinity, -Infinity, 123.456, 0.49, 0.5]
  const junk = (d = 0) => {
    const r = rnd()
    if (r < 0.12) return null
    if (r < 0.2) return undefined
    if (r < 0.3) return pick([true, false])
    if (r < 0.5) return pick(NUMS)
    if (r < 0.65) return pick(['', 'placed', 'stored', 'house', 'tree1', '12', '__proto__', 'x'])
    if (d > 2) return {}
    if (r < 0.8) return Array.from({ length: Math.floor(rnd() * 4) }, () => junk(d + 1))
    const o = {}
    for (let i = Math.floor(rnd() * 4); i > 0; i--) o[pick(['id', 'kind', 'state', 'x', 'y', 'z', 'items'])] = junk(d + 1)
    return o
  }
  const item = () => {
    if (rnd() < 0.1) return junk()
    const o = {}
    const id = rnd() < 0.85 ? pick(IDS) : junk()
    if (rnd() < 0.95) o.id = id
    // 大多數 kind 和 id 對得上（才會走到後面的規則）
    o.kind = rnd() < 0.7 && DEF.get(id) ? DEF.get(id).kind : rnd() < 0.8 ? pick(KINDS) : junk()
    if (rnd() < 0.9) o.state = rnd() < 0.8 ? pick(['placed', 'stored']) : junk()
    if (rnd() < 0.8) o.x = rnd() < 0.7 ? pick(NUMS) : rnd() < 0.5 ? rnd() * 800 - 80 : junk()
    if (rnd() < 0.8) o.y = rnd() < 0.7 ? pick(NUMS) : rnd() < 0.5 ? rnd() * 400 - 40 : junk()
    return o
  }
  const layout = () => {
    const r = rnd()
    if (r < 0.1) return junk()
    if (r < 0.15) return { items: junk() }
    const len = rnd() < 0.01 ? 5000 : Math.floor(rnd() * 40)
    return { items: Array.from({ length: len }, item) }
  }
  const base = parseSave(clone(BASE))
  let defined = 0, nonEmpty = 0, stored = 0, flowerStored = 0
  const N = 20000
  for (let i = 0; i < N; i++) {
    let raw = layout()
    if (rnd() < 0.5) { try { raw = JSON.parse(JSON.stringify(raw ?? null)) } catch { /* 循環不會發生 */ } }
    let out
    try { out = cleanFarmLayout(raw) } catch (e) { assert.fail('S2 #' + i + ' 丟錯誤：' + e.message) }
    eq(out, ref(raw), 'S2 #' + i + ' 和參照實作相同')
    invariants(out, 'S2 #' + i)
    eq(cleanFarmLayout(out), out, 'S2 #' + i + ' 清理兩次 = 一次')
    if (out) { defined++; if (out.items.length) nonEmpty++; for (const it of out.items) { if (it.state === 'stored') stored++; if (!DEF.get(it.id).hasDefault && it.state === 'stored') flowerStored++ } }
    // 每 20 次放進整份存檔：不丟錯誤、其他欄位不受影響、parseSave 兩次相同
    if (i % 20 === 0) {
      let s
      try { s = parseSave({ ...clone(BASE), farmLayout: raw }) } catch (e) { assert.fail('S2 parseSave 丟錯誤：' + e.message) }
      eq(withoutLayout(s), base, 'S2 其他欄位不受影響')
      eq(parseSave(clone(s)), s, 'S2 parseSave 冪等')
    }
  }
  ok(defined > N * 0.6 && nonEmpty > N * 0.4 && stored > 1000 && flowerStored > 200, `S2 覆蓋面足夠（有效 ${defined}、非空 ${nonEmpty}、庫存 ${stored}、花槽珊瑚庫存 ${flowerStored}）`)
  console.log(`S2 隨機 ${N} 次：有效 ${defined}、非空 ${nonEmpty}、庫存筆數 ${stored}、花槽／珊瑚在庫存 ${flowerStored}`)
}

// ================= S4：載入不改寫存檔、不丟錯誤 =================
{
  const bad = { ...clone(BASE), dataRev: 4, farmLayout: { items: [
    { id: 'lamp', kind: 'lamp', state: 'placed', x: 300, y: 300 },
    { id: 'kennel', kind: 'kennel', state: 'placed', x: 300, y: 300 }, // 和路燈完全重疊
    { id: 'coral', kind: 'coral', state: 'placed' }, // 壞：沒有座標
    { id: 'house', kind: 'house', state: 'stored' }, // 壞：不能收
    { id: 'zzz', kind: 'zzz' }, 'junk', null,
    { id: 'tree1', kind: 'tree', state: 'placed', x: 9999, y: -5 }, // 超範圍
  ] } }
  for (const [tag, data] of [['損壞＋重疊', bad], ['v3.8.1 舊存檔', clone(BASE)], ['擺放全部合法', { ...clone(BASE), dataRev: 4, farmLayout: { items: [{ id: 'lamp', kind: 'lamp', state: 'stored' }] } }]]) {
    store.clear()
    const text = JSON.stringify(data)
    store.set(KEY, text)
    const ad = new LocalStorageAdapter()
    let res
    try { res = await ad.loadOrReset(() => { throw new Error('不該重置') }) } catch (e) { assert.fail('S4 ' + tag + ' 丟錯誤：' + e.message) }
    ok(res.save && res.reset === 'none' && !res.newer, 'S4 ' + tag + ' 讀得進來')
    ok(store.get(KEY) === text, 'S4 ' + tag + ' 載入後儲存的字串一個位元都沒變')
    if (tag === '損壞＋重疊') {
      eq(res.save.farmLayout.items.find((x) => x.id === 'kennel'), { id: 'kennel', kind: 'kennel', state: 'placed', x: 300, y: 300 }, 'S4 重疊的位置原樣保留（不自動挪位）')
      eq(res.save.farmLayout.items.find((x) => x.id === 'coral').state, 'stored', 'S4 壞掉的珊瑚在記憶體裡當庫存')
    }
  }
}

// ================= S5：舊分頁保護（v3.8.1、v3.8.0 讀到 dataRev 4）=================
{
  const newSave = parseSave({ ...clone(BASE), farmLayout: { items: [{ id: 'lamp', kind: 'lamp', state: 'placed', x: 500, y: 290 }, { id: 'coral', kind: 'coral', state: 'placed', x: 200, y: 250 }] } })
  eq(newSave.dataRev, 6, 'S5 新版存檔 dataRev 4（v3.10.0：5；v4.0：6）')
  for (const [tag, Adapter, setH] of [['v3.8.1', Adapter381, setNewer381], ['v3.8.0', Adapter380, setNewer380]]) {
    store.clear()
    const text = JSON.stringify(newSave)
    store.set(KEY, text)
    let called = 0
    setH(() => { called++ })
    const ad = new Adapter()
    const res = await ad.loadOrReset(() => { throw new Error('不該重置') })
    ok(res.newer === true && res.save === null, `S5 ${tag} 載入時判定為較新的資料、不讀`)
    // 舊分頁早就開著、記憶體裡是舊資料：自動存檔
    const stale = parse381(clone(BASE))
    await ad.save(stale)
    ok(called === 1, `S5 ${tag} 自動存檔時通知畫面層（停止存檔、提示重新整理）`)
    ok(store.get(KEY) === text, `S5 ${tag} 不覆寫：存檔原封不動`)
    ok(JSON.parse(store.get(KEY)).farmLayout.items.length === 2, `S5 ${tag} farmLayout 還在`)
    setH(null)
  }
}

// ================= S6：匯出與匯入 =================
{
  const appList = { schemaVersion: APP_LIST_SCHEMA_VERSION, apps: [] }
  const LAY = { items: [{ id: 'lamp', kind: 'lamp', state: 'stored' }, { id: 'planter', kind: 'planter', state: 'placed', x: 333, y: 222 }, { id: 'house', kind: 'house', state: 'placed', x: 80, y: 314 }] }
  const REV = { 2: 1, 3: 1, 4: 2, 5: 3, 6: 4 }
  eq(BACKUP_FORMAT_VERSION, 8, '匯出格式 6（v3.10.0：7；v4.0：8）')
  eq(LAYOUT_FORMAT_VERSION, 6, '擺放從格式 6 起讀取')
  for (const fv of [2, 3, 4, 5, 6]) {
    const file = { format: 'aemc-desktop-backup', formatVersion: fv, exportedAt: '2026-11-18T00:00:00.000Z', appVersion: 'x', data: { farm: { ...clone(BASE), dataRev: REV[fv], farmLayout: clone(LAY) }, appList } }
    const text = JSON.stringify(file)
    const r = parseBackup(text, text.length)
    ok(r.ok, `S6 格式 ${fv} 匯入成功${r.ok ? '' : '：' + r.error}`)
    if (fv < 6) {
      ok(!('farmLayout' in r.backup.data.farm), `S6 格式 ${fv} 夾帶的 farmLayout 被忽略`)
      eq(r.summary.layoutCount, 0, `S6 格式 ${fv} 確認視窗沒有擺放那一行（0）`)
    } else {
      eq(r.backup.data.farm.farmLayout, LAY, 'S6 格式 6 的 farmLayout 保留')
      eq(r.summary.layoutCount, 3, 'S6 格式 6 確認視窗顯示調整過 3 個物件')
    }
  }
  // 格式 7、dataRev 5 → 較新
  for (const [m, fv, rev] of [['格式 9', 9, 4], ['格式 6 但 dataRev 7', 6, 7]]) { // v3.10.0：較新的是格式 8、dataRev 6；v4.0：格式 9、dataRev 7
    const t = JSON.stringify({ format: 'aemc-desktop-backup', formatVersion: fv, exportedAt: '', appVersion: '', data: { farm: { ...clone(BASE), dataRev: rev }, appList } })
    const r = parseBackup(t, t.length)
    ok(!r.ok && r.error === NEWER_VERSION_MESSAGE, `S6 ${m} 拒絕（較新版本）`)
  }
  // 匯出 → 匯入 往返
  const farm = parseSave({ ...clone(BASE), farmLayout: clone(LAY) })
  const exp = buildBackup(farm, appList, '3.9.0', new Date('2026-11-18T08:00:00Z'))
  eq(exp.formatVersion, 8, 'S6 匯出 formatVersion 6（v3.10.0：7；v4.0：8）')
  const text = JSON.stringify(exp)
  const back = parseBackup(text, text.length)
  ok(back.ok, 'S6 自己匯出的檔案匯入成功')
  eq(back.backup.data.farm, farm, 'S6 往返後存檔相同（含 farmLayout）')
  // v3.8.1 讀格式 6 → 「較新版本」
  const old = parseBackup381(text, text.length)
  ok(!old.ok && old.error === NEWER381 && NEWER381 === NEWER_VERSION_MESSAGE, 'S6 v3.8.1 讀到格式 6 拒絕：' + (old.ok ? '（竟然成功）' : old.error))
  // v3.8.1 讀格式 5（v3.8.1 自己的格式）仍可以（確認測試本身有效）
  const t5 = JSON.stringify({ ...exp, formatVersion: 5, data: { farm: { ...clone(BASE) }, appList } })
  ok(parseBackup381(t5, t5.length).ok, 'S6 對照：v3.8.1 讀格式 5 成功')
}

console.log(`v3.9.0 第二階段存檔測試 ${n} 項全過`)
