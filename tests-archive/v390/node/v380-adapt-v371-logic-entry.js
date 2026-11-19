// v3.7.1 邏輯與引擎測試：找新主人（純函式、store、引擎各種狀態）、食盆新規則、睡覺心情 groundMul、天氣機率、v3.7.0 存檔相容
import { store } from './env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const SRC = (process.env.REPO_ROOT + '/src/')
import { BALANCE, PET_CAPACITY } from '../../../src/farm/config/balance.ts'
import { SPECIES } from '../../../src/farm/config/species.ts'
import { rehomePet, rehomeBlock, REHOME_TEXT } from '../../../src/farm/sim/rehome.ts'
import { adopt } from '../../../src/farm/sim/commands.ts'
import { adoptCheck } from '../../../src/farm/sim/rules.ts'
import { applySleepRecovery, bowlCapacity, bowlLeft, eatAtBowl } from '../../../src/farm/sim/buildings.ts'
import { newSave, todayKey } from '../../../src/farm/sim/points.ts'
import { weatherAt } from '../../../src/farm/sim/worldTime.ts'
import { lowStatNotices, advancePet } from '../../../src/farm/sim/stats.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import { enterPond, usesPond } from '../../../src/farm/pixel/pets.ts'
import { isOverflowSeat } from '../../../src/farm/pixel/buildingUse.ts'
import { worldToFind } from '../../../src/farm/pixel/finds.ts'
import { useFarmStore, setSaveStorage } from '../../../src/farm/store/farmStore.ts'
import { LocalStorageAdapter } from '../../../src/farm/save/storage.ts'
import { parseSave, isNewerData } from '../../../src/farm/save/migrate.ts'
import { buildBackup, parseBackup, BACKUP_FORMAT_VERSION } from '../../../src/lib/backup.ts'
import { overrides } from '../../../src/farm/overrides.ts'

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
const NOW = new Date(2026, 10, 15, 12, 0, 0).getTime()
const pet = (o = {}) => ({ id: 'p', species: 'dog', variant: 'shiba', name: '柴柴', adoptedAt: NOW - 5 * 86400000, heightFactor: 1, weight: 50, satiety: 80, mood: 80, cleanliness: 80, ...o })
const SP = process.env.REPO_ROOT + '/tests-archive/v390/fixtures/'

// v3.7.0 格式存檔：v3.7.0 正式版匯出的真實檔案（3 隻寵物、321 金幣、三個建築、3 張便利貼），再加上 v3.7.0 就有的收藏、寶物、事件欄位
const exp370 = JSON.parse(readFileSync(SP + 'export370.json', 'utf8'))
const farm370 = {
  ...exp370.data.farm,
  collection: { C001: 2, C005: 1, 'U002-3': 1 },
  finds: [{ id: 'f1', kind: 'mound', by: 'dog', fx: 0.4, fy: 0.5, at: NOW - 60000 }, { id: 'f2', kind: 'bundle', by: 'cat', fx: 0.7, fy: 0.3, at: NOW - 30000 }],
  events: { 'ev-test': NOW - 86400000 },
}

// ============ 1. 找新主人：純函式 ============
{
  eq(BALANCE.rehome, { refund: 10, minPets: 1 }, '返還 10 金幣、至少留 1 隻')
  const s = parseSave(farm370)
  ok(s, 'v3.7.0 存檔可讀')
  const r = rehomePet(s, 'p2')
  eq([r.error, r.refund, r.save.points, r.save.pets.map((p) => p.id)], [undefined, 10, 331, ['p1', 'p3']], '移除 p2、金幣 +10')
  const { pets: _a, points: _b, ...restBefore } = s
  const { pets: _c, points: _d, ...restAfter } = r.save
  eq(restAfter, restBefore, '其他欄位（寶物、收藏、事件、便利貼、建築、食盆、賺金幣、nextPetId…）完全不動')
  eq(r.save.finds, farm370.finds, '還沒揭曉的土堆與布包保留（寶物只記物種，沒有綁寵物 id）')
  ok(farm370.finds.every((f) => !('petId' in f) && (f.by === 'dog' || f.by === 'cat')), '寶物資料沒有寵物 id 欄位')
  eq(r.save.nextPetId, s.nextPetId, 'nextPetId 不變（id 不重複使用）')
  eq(r.save.notes, s.notes, '便利貼原樣'); eq(r.save.collection, s.collection, '收藏冊原樣'); eq(r.save.events, s.events, '事件旗標原樣')
  eq(rehomePet(s, 'nope'), { save: s, refund: 0, error: REHOME_TEXT.notFound }, '找不到：存檔不變')
  // 最後一隻
  const one = { ...s, pets: [s.pets[0]] }
  eq(rehomeBlock(one, one.pets[0].id), '至少要留一隻', '最後一隻：停用原因')
  eq(rehomePet(one, one.pets[0].id), { save: one, refund: 0, error: '至少要留一隻' }, '最後一隻：不能找新主人、存檔不變')
  eq(rehomeBlock(s, 'p1'), null, '3 隻：可以')
  // 連續找到剩一隻
  let t = s
  t = rehomePet(t, 'p1').save
  t = rehomePet(t, 'p3').save
  eq([t.pets.map((p) => p.id), t.points], [['p2'], 341], '3 → 1 隻，+20')
  eq(rehomePet(t, 'p2').error, '至少要留一隻', '剩一隻時停用')
}

// ============ 2. 領養價格、第一隻免費、淨成本 ============
{
  eq([SPECIES.dog.cost, SPECIES.cat.cost], [15, 15], '目前領養價格：狗、貓都是 15（15／25／35 是 v3.0.0 前含海洋生物時的價格，已不存在）')
  const ctx = { nowMs: NOW, hour: 12 }
  let s = { ...newSave(NOW, todayKey(NOW)), pets: [pet({ id: 'p1' })], nextPetId: 2, points: 1000 }
  const start = s.points
  for (let i = 0; i < 30; i++) {
    const sp = i % 2 ? 'cat' : 'dog'
    const a = adopt(s, ctx, { species: sp, name: 'x', free: s.pets.length === 0 }, () => 0.5)
    ok(!a.error, '領養成功')
    eq(a.save.points, s.points - 15, `第 ${i + 1} 次領養花 15（不免費，因為已有寵物）`)
    const r = rehomePet(a.save, a.petId)
    eq(r.save.points, s.points - 5, '領養再找新主人：淨花 5 金幣')
    s = r.save
  }
  eq(start - s.points, 150, '30 輪共淨花 150 金幣（沒有淨賺的循環）')
  ok(s.pets.length === 1, '最後仍有 1 隻')
  // 找新主人永遠不會讓寵物數變 0，所以「第一隻免費」（存檔不存在或 0 隻）不會被重新觸發
  let u = { ...s, pets: [pet({ id: 'a' }), pet({ id: 'b' })] }
  u = rehomePet(u, 'a').save
  eq(rehomePet(u, 'b').error, '至少要留一隻')
  ok(u.pets.length >= 1, '寵物數不會變 0')
  // 6 隻滿了：不能領養；找新主人一隻後可以
  const full = { ...s, points: 100, pets: Array.from({ length: PET_CAPACITY }, (_, i) => pet({ id: 'f' + i })) }
  eq(adoptCheck(full, 'dog').ok, false, '6/6：不能領養')
  const five = rehomePet(full, 'f0').save
  eq([five.pets.length, adoptCheck(five, 'dog').ok], [5, true], '找新主人一隻 → 5/6、可以領養')
}

// ============ 3. store：rehomePet（禮物、效果、立刻寫入）、領養→找新主人、存檔存取後再讀 ============
{
  store.clear()
  setSaveStorage(new LocalStorageAdapter())
  overrides.nowOffsetMs = 0
  const s = parseSave(farm370)
  useFarmStore.setState({ status: 'ready', save: s, gifts: ['p2', 'p1'], effects: [{ kind: 'float', petId: 'p2', text: 'x', tone: 'good' }, { kind: 'float', petId: 'p1', text: 'y', tone: 'good' }] })
  eq(useFarmStore.getState().rehomePet('p2'), null, 'store：找新主人成功')
  const st = useFarmStore.getState()
  eq([st.save.pets.length, st.save.points, st.gifts, st.effects.map((e) => e.petId)], [2, 331, ['p1'], ['p1']], '寵物 2 隻、331 金幣、頭上的禮物與浮字一起拿掉')
  await new Promise((r) => setTimeout(r, 10))
  const saved = JSON.parse(store.get('aemc-desktop:farm-save'))
  eq([saved.pets.map((p) => p.id), saved.points, saved.notes.length, saved.finds.length, saved.ownedBuildings], [['p1', 'p3'], 331, 3, 2, ['kennel', 'bowls', 'catTree']], '立刻寫入儲存層（不等節流）')
  const lr = await new LocalStorageAdapter().loadOrReset(() => { throw new Error('不應重置') })
  eq([lr.reset, lr.save.pets.map((p) => p.id), lr.save.points, lr.save.notes, lr.save.collection, lr.save.finds, lr.save.events], ['none', ['p1', 'p3'], 331, s.notes, s.collection, s.finds, s.events], '存檔存取後再讀：正確')
  // 剩一隻：store 也擋
  useFarmStore.getState().rehomePet('p1')
  eq(useFarmStore.getState().rehomePet('p3'), '至少要留一隻', 'store：最後一隻擋下')
  eq(useFarmStore.getState().save.points, 341)
  // 領養 → 找新主人（store 流程）：每輪 −5，不會被當成第一隻
  let before = useFarmStore.getState().save.points
  for (let i = 0; i < 5; i++) {
    eq(useFarmStore.getState().adoptPet({ species: 'dog', name: '測' + i }), null)
    const p = useFarmStore.getState().save.pets.at(-1)
    eq(useFarmStore.getState().save.points, before - 15, 'store 領養花 15')
    eq(useFarmStore.getState().rehomePet(p.id), null)
    eq(useFarmStore.getState().save.points, before - 5, 'store 領養→找新主人淨 −5')
    before -= 5
  }
  eq(useFarmStore.getState().save.nextPetId, s.nextPetId + 5, '新寵物 id 一直往上，不重複')
}

// ============ 4. 引擎：各種狀態下移除 ============
const mkEngine = (pets, owned = [], seed0 = 11) => {
  const e = new PixelEngine()
  let seed = seed0
  e.rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  e.setSize(1920, 902, 1)
  e.setOwned(owned)
  const log = { settled: [], finds: [], eats: [] }
  let finds = []
  e.hooks = {
    requestBath: () => null, wake: () => {}, notify: () => {},
    eatAtBowl: (id) => { log.eats.push(id); return null },
    settlePlay: (id, c, toy) => log.settled.push([id, c, toy]),
    addFind: (id, kind, fx, fy) => { if (finds.length >= 8) return false; finds = [...finds, { id: 'f' + finds.length, kind, by: kind === 'mound' ? 'dog' : 'cat', fx, fy, at: NOW }]; log.finds.push(id); e.setFinds(finds); return true },
  }
  e.sync(pets)
  e.bowlLeft = 30
  return { e, log, getFinds: () => finds }
}
const run = (e, secs, hour = 12, weather = 'sunny', until) => {
  for (let i = 0; i < secs / 0.1; i++) {
    e.update(0.1, { nowMs: NOW + i * 100, hour, weather, gifts: [] })
    if (until && until()) return true
  }
  return false
}
{
  // 4a. 玩耍中（丟球）：先結算再移除；不是玩耍中的狗不被結算
  {
    const { e, log } = mkEngine([pet({ id: 'd1' }), pet({ id: 'd2', variant: 'golden' })])
    eq(e.beginPlay('d1', 'ball'), null)
    run(e, 1)
    e.actors.get('d1').play.catches = 3 // 已經撿回 3 次
    eq(e.removePet('d1'), true)
    eq(log.settled, [['d1', 3, 'ball']], '丟球中：提前結算一次（撿回 3 次）')
    ok(!e.actors.has('d1') && !e.isPlaying() && e.playHud() === null, '移除後場景沒有牠、沒有玩耍中、HUD 消失')
    eq(e.playBlock('d2'), null, '別隻可以馬上開始玩')
    run(e, 2)
    eq(log.settled.length, 1, '之後不會再結算')
  }
  // 4b. 挖寶中：已留下的土堆保留，結算次數 = 已留下的個數
  {
    const { e, log, getFinds } = mkEngine([pet({ id: 'd1' }), pet({ id: 'c1', species: 'cat', variant: 'tabby' })])
    eq(e.beginPlay('d1', 'dig'), null)
    const got = run(e, 30, 12, 'sunny', () => getFinds().length >= 2)
    ok(got, '挖到 2 個土堆')
    const nFinds = getFinds().length
    const catches = e.actors.get('d1').play.catches
    e.removePet('d1')
    eq(log.settled, [['d1', catches, 'dig']], `挖寶中：提前結算（${catches} 個）`)
    eq(getFinds().length, nFinds, '已經留下的土堆保留')
    run(e, 5)
    eq(getFinds().length, nFinds, '移除後不會再多出土堆')
  }
  // 4c. 尋寶中（貓）
  {
    const { e, log, getFinds } = mkEngine([pet({ id: 'c1', species: 'cat', variant: 'tabby' }), pet({ id: 'd1' })])
    eq(e.beginPlay('c1', 'hunt'), null)
    run(e, 30, 12, 'sunny', () => getFinds().length >= 1)
    run(e, 0.5)
    const nf = getFinds().length
    e.removePet('c1')
    eq([log.settled.length, log.settled[0][0], log.settled[0][2]], [1, 'c1', 'hunt'], '尋寶中：提前結算一次')
    eq(getFinds().length, nf, '已帶回的布包保留')
  }
  // 4d. 走去水池的路上、在水池裡
  {
    const { e } = mkEngine([pet({ id: 'd1' }), pet({ id: 'd2', variant: 'corgi' })])
    eq(e.sendToBath('d1'), null)
    run(e, 0.5)
    ok(e.actors.get('d1').bath?.phase === 'walk', '走去水池中')
    e.removePet('d1')
    ok(!e.actors.has('d1'), '走去水池的路上：移除')
    eq(e.sendToBath('d2'), null, '別隻可以去洗澡')
    // 在水池裡（泡澡）：水池空出來
    const { e: e2 } = mkEngine([pet({ id: 'd1' }), pet({ id: 'd2', variant: 'corgi' })])
    enterPond(e2.actors.get('d1'))
    run(e2, 1)
    ok(usesPond(e2.actors.get('d1')) && e2.pondBusy(), '泡澡中：水池使用中')
    e2.removePet('d1')
    eq(e2.pondBusy(), false, '移除後水池空出來')
  }
  // 4e. 被拖曳中
  {
    const { e } = mkEngine([pet({ id: 'd1' }), pet({ id: 'd2', variant: 'corgi' })])
    run(e, 0.2)
    const a = e.actors.get('d1')
    const c = e.cssOf(a.x, a.y - 5)
    eq(e.beginDrag('d1', c.x, c.y), true)
    ok(e.isDragging(), '拖曳中')
    e.removePet('d1')
    eq([e.isDragging(), e.endDrag()], [false, null], '移除後不再拖曳；放開不會當機')
    e.dragTo(c.x + 10, c.y)
    run(e, 0.5)
  }
  // 4f. 睡在狗窩座位上：釋放座位，坐在前方的狗換到真座位
  {
    const dogs = [pet({ id: 'd1' }), pet({ id: 'd2', variant: 'corgi' }), pet({ id: 'd3', variant: 'poodle' })]
    const { e } = mkEngine(dogs, ['kennel'])
    const all = run(e, 120, 23.5, 'sunny', () => dogs.every((d) => e.actors.get(d.id).bld?.phase === 'at'))
    ok(all, '3 隻狗都到了狗窩（2 個座位＋前方）')
    const seatOf = (id) => e.actors.get(id).bld?.seat
    const inSeat0 = dogs.find((d) => seatOf(d.id) === 0).id
    const over = dogs.find((d) => isOverflowSeat('kennel', seatOf(d.id))).id
    ok(e.sleepersAtBuilding().has(inSeat0), '座位 0 的狗算睡在建築上')
    e.removePet(inSeat0)
    ok(!e.sleepersAtBuilding().has(inSeat0), '移除後不再算')
    const moved = run(e, 60, 23.5, 'sunny', () => seatOf(over) === 0 && e.actors.get(over).bld?.phase === 'at')
    ok(moved, '原本睡在前方的狗換到空出來的窩裡（座位 0）')
  }
  // 4g. 睡在貓跳台平台上
  {
    const cats = [pet({ id: 'c1', species: 'cat', variant: 'tabby' }), pet({ id: 'c2', species: 'cat', variant: 'black' }), pet({ id: 'c3', species: 'cat', variant: 'calico' })]
    const { e } = mkEngine(cats, ['catTree'])
    ok(run(e, 160, 23.5, 'sunny', () => cats.every((c) => e.actors.get(c.id).bld?.phase === 'at')), '3 隻貓都到了貓跳台')
    const top = cats.find((c) => e.actors.get(c.id).bld.seat === 0).id
    const over = cats.find((c) => isOverflowSeat('catTree', e.actors.get(c.id).bld.seat)).id
    e.removePet(top)
    ok(run(e, 60, 23.5, 'sunny', () => e.actors.get(over).bld?.seat === 0 && e.actors.get(over).bld?.phase === 'at'), '頂層平台空出來，別的貓換上去')
  }
  // 4h. 在食盆吃東西：釋放位置，在等的寵物補上
  {
    const ps = [pet({ id: 'a', satiety: 30 }), pet({ id: 'b', satiety: 30, variant: 'corgi' }), pet({ id: 'c', satiety: 30, species: 'cat', variant: 'tabby' })]
    const { e, log } = mkEngine(ps, ['bowls'])
    ok(run(e, 60, 12, 'sunny', () => ps.filter((p) => e.actors.get(p.id).bld?.purpose === 'eat').length === 2 && ps.some((p) => e.actors.get(p.id).bld?.phase === 'at')), '兩隻在食盆（容量 2）')
    const eater = ps.find((p) => e.actors.get(p.id).bld?.purpose === 'eat' && e.actors.get(p.id).bld.phase === 'at').id
    const waiting = ps.find((p) => !e.actors.get(p.id).bld).id
    e.removePet(eater)
    ok(run(e, 40, 12, 'sunny', () => e.actors.get(waiting).bld?.purpose === 'eat'), '空出來的食盆位置被在等的寵物補上')
    ok(!log.eats.slice(log.eats.indexOf(eater) + 1).includes(eater), '被移除的寵物不會再吃')
  }
  // 4i. 頭上有狀態圖示、被氣泡選單選中
  {
    const { e } = mkEngine([pet({ id: 'd1', satiety: 10, mood: 10 }), pet({ id: 'd2', variant: 'corgi' })])
    const f = { nowMs: NOW, hour: 12, weather: 'sunny', gifts: ['d1'] }
    ok(e.statusIcon(e.actors.get('d1'), f) !== null, '移除前頭上有狀態圖示')
    e.selectedId = 'd1'
    e.removePet('d1')
    eq([e.selectedId, e.headOf('d1'), e.actors.size], [null, null, 1], '選取取消、選單錨點不存在')
    // 禮物清單還有舊 id（store 拿掉之前的那一個影格）：點擊判定與更新不當機
    eq(e.hitTest(10, 10)?.kind === 'gift', false)
    e.update(0.1, f)
    // sync 與存檔一致：之後存檔沒有 d1，不會被重新建立
    e.sync([pet({ id: 'd2', variant: 'corgi' })])
    eq([...e.actors.keys()], ['d2'])
  }
  // 4j. 一般閒晃中（沒有特別狀態）
  {
    const { e, log } = mkEngine([pet({ id: 'd1' }), pet({ id: 'd2', variant: 'corgi' })])
    run(e, 3)
    eq(e.removePet('d1'), true); eq(e.removePet('d1'), false, '重複移除回傳 false、不當機')
    eq(log.settled, [], '沒在玩：不結算')
  }
}

// ============ 5. 食盆新規則 ============
{
  eq([BALANCE.buildings.bowls.threshold, BALANCE.buildings.bowls.satiety, BALANCE.buildings.bowls.portionsPerPet], [60, 20, 3], '門檻 60、每盆 +20、每隻每天 3 盆')
  eq([BALANCE.buildings.bowls.capacity, BALANCE.buildings.bowls.eatSeconds, BALANCE.buildings.bowls.revisitSeconds], [2, 2.6, 45], '同時 2 隻、吃的時間、間隔都沒動')
  eq(BALANCE.lowThreshold, 30, '「餓了」驚嘆號門檻維持 30'); eq(BALANCE.moodExtraDecayWhenHungry, 0.5, '飽食 <30 心情多掉 50% 不變')
  eq(lowStatNotices(pet({ satiety: 59 })).length, 0, '飽食 59：會去食盆但沒有驚嘆號')
  // 心情多掉 50%：飽食 29 一小時心情 −3、飽食 31 −2
  near(80 - advancePet(pet({ satiety: 29 }), 3600000, false).mood, 3, 1e-9, '飽食 <30：心情每小時 −3'); near(80 - advancePet(pet({ satiety: 31 }), 3600000, false).mood, 2, 1e-9, '飽食 ≥30：心情每小時 −2')
  const base = { ...newSave(NOW, todayKey(NOW)), pets: [pet({ id: 'a', satiety: 50 }), pet({ id: 'b' }), pet({ id: 'c' })], ownedBuildings: ['bowls'] }
  eq([bowlCapacity(base), bowlLeft(base, NOW)], [9, 9], '3 隻 → 每天 9 盆')
  const r = eatAtBowl(base, { nowMs: NOW, hour: 12 }, 'a')
  eq([r.save.pets[0].satiety, r.save.bowl.used, bowlLeft(r.save, NOW)], [70, 1, 8], '吃一盆 +20')
  eq(bowlLeft({ ...base, ownedBuildings: [] }, NOW), 0, '沒買食盆：0 盆（行為不變）')
  // 找新主人後上限跟著少、已用的不變
  const used = { ...base, bowl: { date: todayKey(NOW), used: 8 } }
  const after = rehomePet(used, 'c').save
  eq([bowlCapacity(after), bowlLeft(after, NOW), after.bowl.used], [6, 0, 8], '找新主人：上限 9 → 6，已用 8 不變，剩 0（不會變負數）')
  // 用完了：不能再吃
  const empty = { ...base, bowl: { date: todayKey(NOW), used: 9 } }
  eq(eatAtBowl(empty, { nowMs: NOW, hour: 12 }, 'a').error, '食盆今天空了', '用完不能再吃')
  // 引擎：飽食 65、61 不去，59 去
  for (const [sat, should] of [[65, false], [61, false], [60, false], [59, true]]) {
    const { e, log } = mkEngine([pet({ id: 'p', satiety: sat })], ['bowls'], 5)
    run(e, 120)
    if (should) ok(log.eats.length >= 1, `飽食 ${sat}：會去食盆`)
    else eq(log.eats.length, 0, `飽食 ${sat}：不會去食盆`)
  }
  // 沒有食盆：飽食 10 也不會去
  { const { e, log } = mkEngine([pet({ id: 'p', satiety: 10 })], [], 5); run(e, 60); eq(log.eats.length, 0, '沒買食盆：不會去') }
}

// ============ 6. 睡覺心情 groundMul ============
{
  eq(BALANCE.sleepMood, { base: 2.7, buildingMul: 2.5, groundMul: 1.9 }, 'base、buildingMul 不動，新增 groundMul 1.9')
  eq(BALANCE.decayPerHour, { satiety: 3, mood: 2, cleanliness: 2 }, '白天衰減不動')
  const sv = { ...newSave(NOW, todayKey(NOW)), pets: [pet({ id: 'a', mood: 50 }), pet({ id: 'b', mood: 50 }), pet({ id: 'c', mood: 99.9 })] }
  const night = { nowMs: new Date(2026, 10, 15, 23, 30).getTime(), hour: 23.5 }
  const r = applySleepRecovery(sv, night, 3600, new Set(['a']))
  near(r.pets[0].mood, 50 + 6.75, 1e-9, '座位：每小時 +6.75（和 v3.6.1 一樣）')
  near(r.pets[1].mood, 50 + 2.7 * 1.9, 1e-9, '地上：每小時 +5.13（原本 +2.7）')
  eq(r.pets[2].mood, 100, '上限 100')
  eq(applySleepRecovery(sv, { nowMs: NOW, hour: 12 }, 3600, new Set()), sv, '白天不回復')
  near(7 * 2.7 * 1.9 - 48, -12.09, 0.01, '理論值：地上睡 7 小時 +35.9，一天淨 −12.1')
}

// ============ 7. 天氣機率 ============
{
  eq(BALANCE.weatherWeights, { sunny: 54, cloudy: 30, rain: 15, snow: 1 }); eq(BALANCE.weatherBlockHours, 4)
  const cnt = { sunny: 0, cloudy: 0, rain: 0, snow: 0 }
  const N = 200000
  for (let b = 0; b < N; b++) cnt[weatherAt(b * 4 * 3600000)]++
  for (const [k, w] of Object.entries(BALANCE.weatherWeights)) near(cnt[k] / N, w / 100, 0.006, `20 萬段：${k} 比例接近 ${w}%`)
  // 同一段內不變（重新整理不跳變）
  const t = new Date(2026, 10, 15, 9, 0).getTime()
  eq(weatherAt(t), weatherAt(t + 3599000))
}

// ============ 8. v3.7.0 存檔相容、匯出再匯入 ============
{
  eq([farm370.schemaVersion, farm370.dataRev, farm370.pets.length, farm370.points, farm370.ownedBuildings, farm370.notes.length], [5, 2, 3, 321, ['kennel', 'bowls', 'catTree'], 3], 'v3.7.0 存檔樣本')
  eq(isNewerData(farm370), false, '不是較新版本')
  eq(S37({ ...parseSave(farm370), dataRev: 2 }), farm370, 'parseSave：每個欄位逐欄相同（寵物、金幣、收藏、寶物、事件、便利貼、建築）；v3.8.0：寵物多 personality/lastInteract、dataRev 3')
  store.clear()
  store.set('aemc-desktop:farm-save', JSON.stringify(farm370))
  const lr = await new LocalStorageAdapter().loadOrReset(() => { throw new Error('不應重置') })
  eq([lr.reset, lr.newer ?? false, lr.refund ?? 0], ['none', false, 0], '載入：不重置、不報錯、沒有退款')
  eq(S37({ ...lr.save, dataRev: 2 }), farm370, '載入結果與原始存檔完全相同（v3.8.0：除了新欄位與 dataRev 3）')
  const b = buildBackup(lr.save, exp370.data.appList, '3.7.1', new Date(NOW))
  eq(b.formatVersion, 6, '匯出格式 6（v3.9.0）'); eq(BACKUP_FORMAT_VERSION, 6)
  const text = JSON.stringify(b)
  const p = parseBackup(text, text.length)
  ok(!p.error, '匯入成功 ' + p.error)
  eq(S37({ ...p.backup.data.farm, dataRev: 2 }), farm370, '匯出再匯入：完全相同（v3.8.0：除了新欄位與 dataRev 3）')
  eq([p.summary.noteCount, p.summary.petCount ?? p.backup.data.farm.pets.length], [3, 3], '確認視窗：3 張便利貼、3 隻寵物')
  // v3.7.0 正式版匯出的檔案原封不動匯入
  const t2 = JSON.stringify(exp370)
  const p2 = parseBackup(t2, t2.length)
  ok(!p2.error && p2.backup.data.farm.pets.length === 3 && p2.backup.data.farm.points === 321, 'v3.7.0 正式版的匯出檔可以匯入')
}

// ============ 9. 原始碼：dist 無關，但確認找新主人的文字與數值不寫死在別處 ============
{
  const menu = readFileSync(SRC + 'farm/ui/PetMenu.tsx', 'utf8'), dlg = readFileSync(SRC + 'farm/ui/RehomeDialog.tsx', 'utf8')
  ok(!/返還 10|\+10|refund: 10/.test(menu + dlg), '介面沒有寫死 10')
  ok(dlg.includes('REHOME_TEXT.warning') && dlg.includes('BALANCE.rehome.refund'), '對話框文字與金額來自 rehome.ts／balance.ts')
  eq(REHOME_TEXT.warning, '找新主人後，牠就不會回來了，無法找回。')
  ok(!/innerHTML/.test(menu + dlg), '沒有 innerHTML')
}

console.log(`v3.7.1 邏輯／引擎測試 ${n} 項全過`)
