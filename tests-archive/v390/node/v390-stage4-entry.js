// v3.9.0 第四階段：收進庫存後的行為、座位上的寵物、野餐墊、寶物提示、食盆份量不能刷
import './env-shim.js'
import assert from 'node:assert/strict'
const SRC = (process.env.REPO_ROOT + '/src/')
import * as LAY from '../../../src/farm/pixel/layout.ts'
import * as PL from '../../../src/farm/pixel/placement.ts'
import * as PR from '../../../src/farm/pixel/placeRules.ts'
import * as FD from '../../../src/farm/pixel/finds.ts'
import { picnicMatRect, MAT_SEATS, PICNIC_PREF_X } from '../../../src/farm/pixel/picnic.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import { bowlLeft, eatAtBowl, buyBuilding, isStored, isPlacedBuilding, BOWLS_STORED_MESSAGE, applySleepRecovery } from '../../../src/farm/sim/buildings.ts'
import { execute } from '../../../src/farm/sim/commands.ts'
import { findsBlock, TOO_SMALL_MESSAGE, FULL_MESSAGE, NO_SPOT_MESSAGE, crowdedFullMessage } from '../../../src/farm/sim/dig.ts'
import { PICNIC_TEXT } from '../../../src/farm/sim/picnic.ts'
import { parseSave } from '../../../src/farm/save/migrate.ts'
import { isSleeping } from '../../../src/farm/sim/rules.ts'
import { BALANCE } from '../../../src/farm/config/balance.ts'
import { LAYOUT_ITEMS } from '../../../src/farm/config/layoutItems.ts'
import * as OLD from '../.work/v381src/src/farm/pixel/layout.ts'
import { picnicMatRect as oldMat } from '../.work/v381src/src/farm/pixel/picnic.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const report = []
const ALL = ['kennel', 'bowls', 'catTree']
const T0 = new Date(2026, 10, 19, 12, 0, 0).getTime()
const today = '2026-11-19'
const kindOf = (id) => LAYOUT_ITEMS.find((d) => d.id === id).kind
const stored = (...ids) => ({ items: ids.map((id) => ({ id, kind: kindOf(id), state: 'stored' })) })
const pet = (id, species, variant, extra = {}) => ({ id, species, variant, name: id, adoptedAt: T0 - 86400000 * 5, heightFactor: 1, weight: 50, satiety: 30, mood: 50, cleanliness: 80, personality: 'calm', lastInteract: T0, ...extra })
const baseSave = (extra = {}) => parseSave({
  schemaVersion: 5, dataRev: 4, points: 100, lastSeen: T0, lastDailyClaim: today, gifts: { date: today, count: 0 }, nextPetId: 9, createdAt: T0 - 9e8,
  pets: [pet('d1', 'dog', 'shiba'), pet('c1', 'cat', 'orange')], ownedBuildings: ALL, earning: { date: today, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 },
  bowl: { date: today, used: 2 }, collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: today, count: 0, lastEnd: 0 }, ...extra,
})

// ================= A. 食盆：收起＝0 份、不能去吃、份量不能靠收起刷 =================
{
  const s = baseSave()
  const cap = 2 * BALANCE.buildings.bowls.portionsPerPet
  eq(bowlLeft(s, T0), cap - 2, `A 擺出來：剩 ${cap - 2} 份（用掉 2）`)
  const st = { ...s, farmLayout: stored('bowls') }
  ok(isStored(st, 'bowls') && !isPlacedBuilding(st, 'bowls') && st.ownedBuildings.includes('bowls'), 'A 收起來：仍是已購買、但沒擺出來')
  eq(bowlLeft(st, T0), 0, 'A 收起來：今天剩 0 份')
  eq(eatAtBowl(st, { nowMs: T0, hour: 12 }, 'd1').error, BOWLS_STORED_MESSAGE, 'A 收起來：去食盆吃被拒絕')
  eq(eatAtBowl(st, { nowMs: T0, hour: 12 }, 'd1').save, st, 'A 被拒絕時存檔不變')
  // 收起 → 擺出來（回到預設位置或換位置）× 多次：bowl.used 不變、剩的份量和收起前一樣
  let cur = s
  for (let i = 0; i < 5; i++) {
    cur = { ...cur, farmLayout: stored('bowls') }
    eq(cur.bowl, s.bowl, `A 第 ${i + 1} 次收起：bowl 資料不變`)
    cur = { ...cur, farmLayout: i % 2 ? undefined : { items: [{ id: 'bowls', kind: 'bowls', state: 'placed', x: 420, y: 290 }] } }
    eq(bowlLeft(cur, T0), cap - 2, `A 第 ${i + 1} 次再擺出來：剩的份量和收起前一樣（${cap - 2}）`)
  }
  // 吃完再收起、再擺：還是空的
  let full = s
  for (let i = 0; i < cap - 2; i++) full = eatAtBowl(full, { nowMs: T0, hour: 12 }, 'd1').save
  eq(bowlLeft(full, T0), 0, 'A 吃完：0 份')
  const again = { ...{ ...full, farmLayout: stored('bowls') }, farmLayout: undefined }
  eq(bowlLeft(again, T0), 0, 'A 吃完後收起再擺出來：仍是 0 份（不會補滿）')
  // 存檔來回（parseSave）也不會動到份量
  eq(parseSave(JSON.parse(JSON.stringify({ ...full, farmLayout: stored('bowls') }))).bowl, full.bowl, 'A 收起狀態存檔再讀入：bowl 不變')
  // 手動餵食照舊 1 金幣
  const fed = execute(st, { nowMs: T0, hour: 12 }, 'feed', 'd1')
  ok(!fed.error && fed.save.points === st.points - 1, 'A 食盆收起時手動餵食照舊扣 1 金幣：' + (fed.error ?? ''))
}

// ================= B. 不能收、不能重複買 =================
{
  const L = LAY.computeLayout(1920, 960, 1)
  LAY.setPlacement(L, PL.defaultPlacement(ALL))
  for (const id of ['house', 'tower', 'pond', 'board']) {
    eq(PR.canStore(L, id), false, `B ${id} 不能收`)
    const P2 = PL.withMove(L.placement, id, null, null)
    ok(P2.placed.has(id) && !P2.stored.has(id), `B 硬收 ${id}：還在原位、不在庫存`)
  }
  for (const id of ['lamp', 'kennel', 'bowls', 'catTree', 'tree1', 'tree2', 'mushroom', 'rocks', 'flowers', 'stump']) eq(PR.canStore(L, id), true, `B ${id} 可以收`)
  const L0 = LAY.computeLayout(1920, 960, 1)
  LAY.setPlacement(L0, PL.defaultPlacement([]))
  eq(PR.canStore(L0, 'kennel'), false, 'B 沒買的狗窩不能收')
  for (const id of ALL) {
    const s = { ...baseSave(), farmLayout: stored(id) }
    const r = buyBuilding(s, id)
    ok(r.error && r.error.includes('已經買過') && r.save === s, `B ${id} 收進庫存後再買一次：擋下（${r.error}）、金幣不變`)
  }
}

// ================= 引擎模擬工具 =================
function mkEngine(layout, pets, { hour = 12, weather = 'sunny' } = {}) {
  const e = new PixelEngine()
  let seed = 3131
  e.rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  e.setSize(1920, 960, 1)
  e.setLayoutData(ALL, layout)
  e.sync(pets)
  const log = { eat: 0, notify: [] }
  e.hooks = { requestBath: () => null, wake: () => {}, notify: (m) => log.notify.push(m), eatAtBowl: () => { log.eat++; return null }, settlePlay: () => {}, addFind: () => false }
  let now = T0
  const step = (sec, h = hour, w = weather) => { for (let i = 0; i < sec / 0.05; i++) { now += 50; e.update(0.05, { nowMs: now, hour: (h + (now - T0) / 3600000) % 24, weather: w, gifts: [] }) } }
  return { e, log, step }
}
const insideBlocker = (L, a) => LAY.blockers(L).some((r) => a.x > r.x0 + 0.5 && a.x < r.x1 - 0.5 && a.y > r.y0 + 0.5 && a.y < r.y1 - 0.5)
const SIX = [pet('d1', 'dog', 'shiba', { satiety: 20 }), pet('d2', 'dog', 'golden', { satiety: 20 }), pet('d3', 'dog', 'corgi', { satiety: 20 }), pet('c1', 'cat', 'orange', { satiety: 20 }), pet('c2', 'cat', 'siamese', { satiety: 20 }), pet('c3', 'cat', 'ragdoll', { satiety: 20 })]

// ================= C. 收起後的行為 =================
{
  // 食盆收起：飽食度低、份量有，30 分鐘沒有寵物去吃
  const m = mkEngine(stored('bowls'), SIX.map((p) => ({ ...p })))
  m.e.bowlLeft = 0 // 主迴圈用 bowlLeft(save) 算，收起＝0
  let toBowls = 0
  for (let i = 0; i < 360; i++) { m.step(5); for (const a of m.e.actors.values()) if (a.bld?.id === 'bowls') toBowls++ }
  eq([toBowls, m.log.eat], [0, 0], 'C 食盆收起：30 分鐘沒有寵物去食盆、沒有自動吃')
  ok(!m.e.buildings().has('bowls'), 'C 食盆收起：引擎的建築沒有食盆（不畫、不畫「空」圖示）')
  // 對照：食盆擺出來、有份量 → 會去吃
  const c = mkEngine(undefined, SIX.map((p) => ({ ...p })))
  c.e.bowlLeft = 12
  for (let i = 0; i < 120 && c.log.eat === 0; i++) c.step(5)
  ok(c.log.eat > 0, 'C 對照：食盆擺出來時會自動去吃')
  // 狗窩、貓跳台收起：夜晚睡地上、沒有座位；下雨不躲雨
  for (const [id, sp] of [['kennel', 'dog'], ['catTree', 'cat']]) {
    const k = mkEngine(stored(id), SIX.map((p) => ({ ...p, satiety: 90 })), { hour: 23.2 })
    let seated = 0, sleeping = 0
    for (let i = 0; i < 120; i++) { k.step(5); for (const a of k.e.actors.values()) { if (a.bld?.id === id) seated++; if (a.pet.species === sp && a.action === 'sleep') sleeping++ } }
    eq(seated, 0, `C ${id} 收起：夜晚沒有寵物用它`)
    ok(sleeping > 0, `C ${id} 收起：${sp === 'dog' ? '狗' : '貓'}睡在地上（取樣 ${sleeping}）`)
    eq([...k.e.sleepersAtBuilding()].filter((pid) => pid.startsWith(sp[0])), [], `C ${id} 收起：沒有睡在真座位上的（心情回復用地上 ×${BALANCE.sleepMood.groundMul}）`)
    const r = mkEngine(stored(id), SIX.map((p) => ({ ...p, satiety: 90 })), { hour: 13, weather: 'rain' })
    let shelter = 0
    for (let i = 0; i < 60; i++) { r.step(5); for (const a of r.e.actors.values()) if (a.bld?.purpose === 'shelter' && a.bld.id === id) shelter++ }
    eq(shelter, 0, `C ${id} 收起：下雨不躲雨`)
  }
  // 睡眠回復：沒在座位上 = groundMul
  const s = baseSave({ pets: [pet('d1', 'dog', 'shiba', { mood: 50 })] })
  const rec = applySleepRecovery(s, { nowMs: T0, hour: 23 }, 3600, new Set())
  eq(+(rec.pets[0].mood - 50).toFixed(6), +(BALANCE.sleepMood.base * BALANCE.sleepMood.groundMul).toFixed(6), 'C 睡在地上一小時的心情回復 = base × groundMul')
  // 其他物件收起：不畫、不擋路
  for (const id of ['lamp', 'tree1', 'tree2', 'mushroom', 'rocks', 'flowers', 'stump']) {
    const L = LAY.computeLayout(1920, 960, 1)
    LAY.setPlacement(L, PL.resolvePlacement(ALL, stored(id)))
    ok(!LAY.sceneObjects(L).some((o) => o.id === id), `C ${id} 收起：不畫`)
    const d = PL.DEFAULT_POS[id]
    const fp = PL.footprintAt(kindOf(id), d.x, d.y)
    ok(!LAY.blockers(L).some((r) => r.x0 <= fp.x0 && r.x1 >= fp.x1 && r.y0 <= fp.y0 && r.y1 >= fp.y1), `C ${id} 收起：原本的佔地不再是障礙`)
  }
  for (const id of ['bush', 'tall_grass', 'planter', 'coral']) {
    const L = LAY.computeLayout(1920, 960, 1)
    LAY.setPlacement(L, PL.resolvePlacement(ALL, { items: [{ id, kind: kindOf(id), state: 'placed', x: 330, y: 220 }] }))
    ok(LAY.sceneObjects(L).some((o) => o.id === id) && !LAY.isWalkable(L, 330, 216), `C ${id} 擺出來：畫、佔地擋路`)
    LAY.setPlacement(L, PL.resolvePlacement(ALL, stored(id)))
    ok(!LAY.sceneObjects(L).some((o) => o.id === id) && LAY.isWalkable(L, 330, 216), `C ${id} 收起：不畫、不擋路`)
  }
}

// ================= D. 座位上的寵物：建築收起或移動 =================
{
  const m = mkEngine(undefined, SIX.map((p) => ({ ...p, satiety: 90, mood: 50 })), { hour: 23.2 })
  for (let i = 0; i < 200 && m.e.sleepersAtBuilding().size < 4; i++) m.step(3)
  const at = [...m.e.actors.values()].filter((a) => a.bld?.phase === 'at')
  ok(at.length >= 3, `D 夜晚有 ${at.length} 隻坐在狗窩、貓跳台的座位上`)
  report.push('D 收起前在座位上：' + at.map((a) => `${a.id}@${a.bld.id}#${a.bld.seat}`).join(' '))
  // 收起狗窩與貓跳台
  m.e.setLayoutData(ALL, stored('kennel', 'catTree'))
  const L = m.e.layout
  for (const a of m.e.actors.values()) {
    eq(a.bld, null, `D 收起後 ${a.id} 不在任何座位`)
    ok(LAY.isWalkable(L, a.x, a.y) && !insideBlocker(L, a), `D 收起後 ${a.id} 在地面上站得住 (${a.x.toFixed(0)},${a.y.toFixed(0)})`)
  }
  m.step(10)
  const sleepers = [...m.e.actors.values()].filter((a) => isSleeping(a.pet, 23.4, T0) && a.action === 'sleep')
  ok(sleepers.length >= 3, `D 收起後原本睡著的繼續睡在地上（${sleepers.length} 隻）`)
  eq(m.e.sleepersAtBuilding().size, 0, 'D 收起後沒有人在真座位上')
  // 再擺出來（換個位置）：之後又會走去座位
  const T = LAY.computeLayout(1920, 960, 1)
  LAY.setPlacement(T, PL.resolvePlacement(ALL, null))
  let spot = null
  for (let x = 380; x <= 520 && !spot; x += 4) for (const y of [290, 300, 230, 210]) if (!spot && PR.canPlace(T, 'kennel', x, y).ok) spot = [x, y]
  ok(spot, 'D 找得到狗窩的新位置：' + JSON.stringify(spot))
  m.e.setLayoutData(ALL, { items: [{ id: 'kennel', kind: 'kennel', state: 'placed', x: spot[0], y: spot[1] }] })
  for (let i = 0; i < 200 && ![...m.e.actors.values()].some((a) => a.bld?.id === 'kennel' && a.bld.phase === 'at'); i++) m.step(3)
  const k = m.e.buildings().get('kennel')
  ok([...m.e.actors.values()].some((a) => a.bld?.id === 'kennel' && a.bld.phase === 'at') && k.x === spot[0], 'D 狗窩擺到新位置後，狗會走去新座位')
  // 移動有寵物坐著的狗窩 → 座位清掉
  const before = [...m.e.actors.values()].filter((a) => a.bld?.id === 'kennel').map((a) => a.id)
  m.e.setLayoutData(ALL, { items: [{ id: 'kennel', kind: 'kennel', state: 'placed', x: spot[0] + 4, y: spot[1] }] })
  ok(before.length > 0 && before.every((id) => m.e.actors.get(id).bld === null), 'D 移動有寵物的狗窩：那些寵物的座位清掉（' + before.join(',') + '）')
  for (const id of before) { const a = m.e.actors.get(id); ok(LAY.isWalkable(m.e.layout, a.x, a.y), `D ${id} 回到地面站得住`) }
  // 食盆：正在吃的收起
  const b = mkEngine(undefined, SIX.map((p) => ({ ...p })), { hour: 12 })
  b.e.bowlLeft = 12
  b.e.hooks.eatAtBowl = () => null
  for (let i = 0; i < 300 && ![...b.e.actors.values()].some((a) => a.bld?.id === 'bowls'); i++) b.step(1)
  const eaters = [...b.e.actors.values()].filter((a) => a.bld?.id === 'bowls').map((a) => a.id)
  ok(eaters.length > 0, 'D 有寵物正在走去或在食盆吃：' + eaters.join(','))
  b.e.setLayoutData(ALL, stored('bowls'))
  b.e.bowlLeft = 0
  ok(eaters.every((id) => b.e.actors.get(id).bld === null && LAY.isWalkable(b.e.layout, b.e.actors.get(id).x, b.e.actors.get(id).y)), 'D 食盆收起：吃的寵物離開、站在地面')
}

// ================= E. 野餐墊 =================
{
  const L = LAY.computeLayout(1920, 960, 1)
  for (const owned of [[], ALL]) {
    LAY.setPlacement(L, PL.defaultPlacement(owned))
    const O = OLD.computeLayout(1920, 960, 1)
    O.owned = new Set(owned)
    const nm = picnicMatRect(L), om = oldMat(O)
    report.push(`E 預設配置（${owned.length ? '三個建築都買' : '沒買建築'}）野餐墊：v3.8.1 ${JSON.stringify(om)} → v3.9.0 ${JSON.stringify(nm)}${JSON.stringify(om) === JSON.stringify(nm) ? '（相同）' : '（不同）'}`)
    ok(nm, 'E 預設配置放得下野餐墊')
  }
  eq(PICNIC_PREF_X, 436, 'E 偏好位置 x 436（v3.8.1 預設配置下的值）')
  // 擺放後：墊子不壓到任何擺出來的物件、座位站得住
  const near = (T, id, x, y) => { for (let r = 0; r < 200; r += 2) for (let dx = -r; dx <= r; dx += 2) for (const dy of r ? [-r, r, 0] : [0]) if (PR.canPlace(T, id, x + dx, y + dy).ok) return [x + dx, y + dy]; return null }
  const sets = [
    [['coral', 430, 220]], [['planter', 300, 200], ['coral', 450, 210]], [['bush', 400, 190], ['tall_grass', 480, 200], ['rocks', 360, 230]], [['tree1', 436, 210]], [['pond', 430, 230]], [['house', 400, 240]],
  ]
  for (const moves of sets) {
    const T = LAY.computeLayout(1920, 960, 1)
    LAY.setPlacement(T, PL.defaultPlacement(ALL))
    const placed = []
    for (const [id, x, y] of moves) { const p = near(T, id, x, y); if (!p) continue; LAY.setPlacement(T, PL.withMove(T.placement, id, p[0], p[1])); placed.push(`${id}(${p})`) }
    const m = picnicMatRect(T)
    if (!m) { report.push(`E ${placed.join(' ')}：放不下墊子`); continue }
    for (const it of T.placement.placed.values()) {
      const b = PL.footprintAt(it.kind, it.x, it.y)
      ok(!(m.x0 < b.x1 + 4 && m.x1 > b.x0 - 4 && m.y0 < b.y1 + 4 && m.y1 > b.y0 - 4), `E ${placed.join(' ')}：墊子不壓到 ${it.id} 的腳下佔地`)
    }
    for (const [sx, sy] of MAT_SEATS) ok(LAY.isWalkable(T, m.x0 + sx, m.y0 + sy) && PL.coverFraction(T.placement, m.x0 + sx, m.y0 + sy) <= 0.5, 'E 墊子座位站得住、沒被蓋住超過一半')
    report.push(`E ${placed.join(' ')}：墊子 ${JSON.stringify(m)}`)
  }
  // 擁擠：把可以擺在草地的東西用網格密密地擺到草地中段 → 放不下墊子
  const T = LAY.computeLayout(1920, 960, 1)
  LAY.setPlacement(T, PL.defaultPlacement(ALL))
  // 墊子（高 63）在草地中段（y 150～247）任何位置都會經過 y 184～213，所以在 y 約 200 處每隔約 95 像素擺一個物件就能擋住
  const crowd = ['coral', 'planter', 'stump', 'rocks', 'bush', 'tall_grass']
  const xs = [165, 260, 355, 450, 545, 608]
  crowd.forEach((id, i) => { for (const dy of [0, 5, -5, 10, -10, 14]) for (const dx of [0, 4, -4, 8, -8]) { if (T.placement.placed.get(id)?.x === xs[i] + dx) return; if (PR.canPlace(T, id, xs[i] + dx, 200 + dy).ok) { LAY.setPlacement(T, PL.withMove(T.placement, id, xs[i] + dx, 200 + dy)); return } } })
  const crowdedMat = picnicMatRect(T)
  report.push('E 擁擠草地：' + [...T.placement.placed.values()].filter((it) => crowd.includes(it.id)).map((it) => `${it.id}(${it.x},${it.y})`).join(' ') + ' → 墊子 ' + JSON.stringify(crowdedMat))
  eq(crowdedMat, null, 'E 擁擠草地：放不下野餐墊')
  const ce = mkEngine(PL.placementToLayout(T.placement), [pet('d1', 'dog', 'shiba')])
  eq(ce.e.picnicMatFits(), false, 'E 擁擠草地：引擎判斷放不下（按野餐按鈕會提示 PICNIC_TEXT.noRoom）')
  ok(PICNIC_TEXT.noRoom.includes('擺設太多') && PICNIC_TEXT.endResize.includes('擺設太多'), 'E 野餐的「放不下」提示改成「草地太擠」（v4.0：「擺設太多」）')
  globalThis.__crowdedLayout = PL.placementToLayout(T.placement)
  globalThis.__crowdedMat = crowdedMat
}

// ================= F. 寶物 =================
{
  const s = baseSave()
  const mk = (k) => Array.from({ length: k }, (_, i) => ({ id: 'f' + i, kind: 'mound', by: 'dog', fx: (i + 0.5) / k, fy: 0.5, at: T0 }))
  eq(findsBlock({ ...s, finds: [] }, 0), TOO_SMALL_MESSAGE, 'F 上限 0 → 「草地太擠，放不下寶物」')
  ok(TOO_SMALL_MESSAGE.includes('擺設太多') && !TOO_SMALL_MESSAGE.includes('視窗'), 'F 提示不再說「視窗」（v4.0：「擺設太多」）')
  eq(findsBlock({ ...s, finds: mk(3) }, 3), crowdedFullMessage(3), 'F 擠到上限 3、已有 3 個 → 「草地太擠，寶物最多放 3 個，先點開土堆」')
  eq(findsBlock({ ...s, finds: mk(8) }, 3), crowdedFullMessage(3), 'F 已有 8 個、上限變 3 → 不能再挖（提示上限）')
  eq(findsBlock({ ...s, finds: mk(8) }, 8), FULL_MESSAGE, 'F 不擠時滿了 → 原本的「先點開土堆」')
  eq(findsBlock({ ...s, finds: mk(2) }, 3), null, 'F 沒滿 → 可以挖')
  // 擁擠的擺放：上限變小、已有的 8 個寶物全部保留且都有位置、不丟錯誤
  const L = LAY.computeLayout(1920, 960, 1)
  LAY.setPlacement(L, PL.resolvePlacement(ALL, globalThis.__crowdedLayout))
  const cap = FD.findCap(L)
  const L0 = LAY.computeLayout(1920, 960, 1)
  LAY.setPlacement(L0, PL.defaultPlacement(ALL))
  report.push(`F 寶物上限：預設配置 ${FD.findCap(L0)}、擁擠配置 ${cap}（可放面積 ${FD.grassArea(L0)} → ${FD.grassArea(L)}）`)
  ok(cap < FD.findCap(L0), 'F 擁擠時上限變小')
  const finds = mk(8)
  let pts
  try { pts = FD.findPositions(L, finds) } catch (e) { assert.fail('F findPositions 丟錯誤 ' + e.message) }
  eq(pts.size, 8, 'F 已有的 8 個寶物全部保留、都有位置')
  let valid = 0
  for (const f of finds) { const p = pts.get(f.id); if (FD.spotValid(L, 'mound', p.x, p.y)) valid++ }
  report.push(`F 擁擠配置下 8 個寶物裡 ${valid} 個在合格位置（其餘推到最近的可站位置）`)
  for (const f of finds) { const p = pts.get(f.id); ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'F 寶物位置是數字') }
  // 玩耍中擺放變擠 → 有提示（不無聲結束）
  const m = mkEngine(undefined, [pet('d1', 'dog', 'shiba', { satiety: 90, mood: 90 })], { hour: 12 })
  const e = m.e
  e.hooks.addFind = () => true // 存檔層只在滿 8 個時才拒絕；這裡讓它成功，看引擎在草地變擠時有沒有提示
  eq(e.beginPlay('d1', 'dig'), null, 'F 開始挖寶')
  m.step(1)
  e.setLayoutData(ALL, globalThis.__crowdedLayout)
  e.setFinds(mk(8))
  for (let i = 0; i < 80 && e.actors.get('d1').play; i++) m.step(0.5)
  const msg = m.log.notify.join('｜')
  ok(m.log.notify.some((t) => t.includes('擺設太多')), 'F 玩耍中草地變擠：有提示「' + msg + '」（v4.0：「擺設太多」）')
  // 直接造一個找不到位置的情況：上限還有、但草地沒有合格位置 → NO_SPOT_MESSAGE
  const m2 = mkEngine(globalThis.__crowdedLayout, [pet('d1', 'dog', 'shiba', { satiety: 90, mood: 90 })], { hour: 12 })
  m2.e.setFinds([])
  const realCap = FD.findCap(m2.e.layout)
  m2.e.beginPlay('d1', 'dig')
  // 讓寶物上限看起來還有，但每個位置都被「別的寶物」占掉：把 realCap-1 個寶物塞進去
  m2.e.setFinds(mk(Math.max(0, realCap - 1)))
  for (let i = 0; i < 120 && m2.e.actors.get('d1').play; i++) m2.step(0.5)
  report.push(`F 擁擠配置（上限 ${realCap}）挖寶提示：${m2.log.notify.join('｜') || '（沒有）'}`)
  ok(NO_SPOT_MESSAGE.includes('擺設太多'), 'F 找不到地方埋的提示文字（v4.0：「擺設太多」）')
}

console.log(report.join('\n'))
console.log(`v3.9.0 第四階段測試 ${n} 項全過`)
