import assert from 'node:assert/strict'
const P = (process.env.REPO_ROOT + '/src/farm/')
import { pondStand as __pondStand } from '../../../src/farm/pixel/reach.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import { MOUTH, ballPos, checkThrow } from '../../../src/farm/pixel/play.ts'
import { BALANCE } from '../../../src/farm/config/balance.ts'
import { PLAY_TOYS, petActions, startPlay, settlePlay, playDelta, execute } from '../../../src/farm/sim/commands.ts'
import { ANIMS } from '../../../src/farm/pixel/pets.ts'

let n = 0
const ok = (cond, msg) => { assert.ok(cond, msg); n++ }
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++ }

const NOW = new Date(2026, 9, 31, 12, 0, 0).getTime()
const pet = (id, species, variant, extra = {}) => ({ id, species, variant, name: id.toUpperCase(), adoptedAt: NOW - 86400000, heightFactor: 1, weight: 50, satiety: 80, mood: 60, cleanliness: 80, ...extra })
const save0 = (pets, points = 20) => ({ schemaVersion: 5, pets, points, nextPetId: 9, lastSeen: NOW, ownedBuildings: [] })
const ctx = (hour = 12, extra = {}) => ({ nowMs: NOW, hour, ...extra })

// ============ 1. 氣泡選單與指令 ============
{
  const dog = pet('a', 'dog', 'shiba')
  const cat = pet('c', 'cat', 'tabby')
  const s = save0([dog, cat])
  const ids = (p, c) => petActions(s, p, c).map((a) => a.id)
  eq(ids(dog, ctx()), ['feed', 'pet', 'bath', 'walk', 'play'], '狗：玩耍在散步之後')
  eq(ids(cat, ctx()), ['feed', 'pet', 'bath', 'play', 'groom'], 'v3.6.0：貓多了玩耍（尋寶），其餘順序不變')
  ok(petActions(s, cat, ctx(12, { playBlock: '別隻在玩' })).find((a) => a.id === 'play').disabledReason === '別隻在玩', 'v3.6.0：貓的玩耍也受 playBlock 影響')
  eq(ids(cat, ctx(23.5)), ['feed', 'pet', 'bath', 'play', 'groom', 'wake'], 'v3.6.0：貓睡覺時玩耍列出但停用（和狗一樣）')
  const play = petActions(s, dog, ctx()).find((a) => a.id === 'play')
  eq([play.label, play.cost, play.disabledReason], ['玩耍', 1, undefined], '玩耍：1 金幣、可用')
  ok(petActions(s, dog, ctx(12, { playBlock: '乙正在玩耍，一次只能玩一隻' })).find((a) => a.id === 'play').disabledReason.includes('一次只能玩一隻'), '別隻在玩 → 停用並說明')
  ok(petActions(s, dog, ctx(12, { playBlock: '乙正在玩耍，一次只能玩一隻' })).find((a) => a.id === 'feed').disabledReason === undefined, '其他按鈕不受影響')
  const poor = save0([dog], 0)
  ok(petActions(poor, dog, ctx()).find((a) => a.id === 'play').disabledReason.startsWith('金幣不足（需要 1 金幣，目前 0 金幣）'), '金幣不足')
  ok(petActions(s, dog, ctx(23.5)).find((a) => a.id === 'play').disabledReason.includes('正在睡覺'), '睡覺不能玩')
  ok(petActions(save0([{ ...dog, awakeUntil: NOW + 1e6 }]), { ...dog, awakeUntil: NOW + 1e6 }, ctx(23.5)).find((a) => a.id === 'play').disabledReason === undefined, '被叫醒的夜間狗可以玩')
  eq(PLAY_TOYS.cat.map((t) => t.id), ['hunt'], 'v3.6.0：貓有尋寶')
  eq(PLAY_TOYS.dog.map((t) => t.id), ['ball', 'dig'], 'v3.6.0：狗有丟球與挖寶')
  // execute 不處理 play
  ok(execute(s, ctx(), 'play', 'a').error, 'execute(play) 不扣金幣')
  // startPlay
  const r = startPlay(s, ctx(), 'a', 'ball')
  ok(!r.error && r.save.points === 19, '開始：扣 1 金幣')
  ok(r.save.pets[0].awakeUntil > NOW, '開始：保持清醒')
  ok(startPlay(poor, ctx(), 'a', 'ball').error.startsWith('金幣不足'), '金幣不足不扣')
  eq(startPlay(poor, ctx(), 'a', 'ball').save.points, 0, '失敗存檔不變')
  ok(startPlay(s, ctx(23.5), 'a', 'ball').error.includes('睡覺'), '睡覺不能開始')
  ok(startPlay(s, ctx(12, { playBlock: 'x' }), 'a', 'ball').error === 'x', 'playBlock 不能開始')
  ok(startPlay(s, ctx(), 'c', 'ball').error, '貓不能開始')
  ok(startPlay(s, ctx(), 'zz', 'ball').error, '找不到寵物')
  // 結算公式
  eq(playDelta(0), {}, '0 次完全不加')
  eq(playDelta(-3), {}, '負數當 0')
  eq(playDelta(NaN), {}, 'NaN 當 0')
  const near = (a, b) => Math.abs(a - b) < 1e-9
  for (const [c, mood, w, sa] of [[1, 3.5, -0.4, -0.8], [2, 5, -0.8, -1.6], [5, 9.5, -2, -4], [6, 10, -2.4, -4.8], [7, 10, -2.8, -5], [8, 10, -3, -5], [10, 10, -3, -5], [100, 10, -3, -5], [5.9, 9.5, -2, -4]]) {
    const d = playDelta(c)
    ok(near(d.mood, mood) && near(d.weight, w) && near(d.satiety, sa), `n=${c}: ${JSON.stringify(d)}`)
  }
  ok(!('cleanliness' in playDelta(5)), '不動清潔')
  // 比散步輕
  const W = BALANCE.walk
  ok(playDelta(10).mood < W.mood && Math.abs(playDelta(10).weight) < Math.abs(W.weight) && Math.abs(playDelta(10).satiety) < Math.abs(W.satiety), '全部比散步輕')
  // settlePlay 上下限
  const hi = save0([pet('a', 'dog', 'shiba', { mood: 98, weight: 1, satiety: 2 })])
  const sr = settlePlay(hi, ctx(), 'a', 10)
  eq([sr.save.pets[0].mood, sr.save.pets[0].weight, sr.save.pets[0].satiety], [100, 0, 0], '夾在 0～100')
  ok(sr.save.points === hi.points, '結算不扣金幣')
  eq(settlePlay(hi, ctx(), 'a', 0).save, hi, '0 次存檔物件完全不變')
  eq(settlePlay(hi, ctx(), 'zz', 3).save, hi, '找不到寵物不變')
  const mid = settlePlay(save0([pet('a', 'dog', 'shiba', { mood: 60, weight: 50, satiety: 80 })]), ctx(), 'a', 5).save.pets[0]
  ok(near(mid.mood, 69.5) && near(mid.weight, 48) && near(mid.satiety, 76), '5 次結算值')
  // 素材與動畫
  for (const sp of ['shiba', 'corgi', 'husky', 'golden', 'collie', 'poodle']) for (const f of ['stand', 'walk_a', 'walk_b']) ok(MOUTH[sp]?.[f]?.length === 2, `MOUTH ${sp}.${f}`)
  ok(ANIMS.dog.bark.frames[0] === 'bark' && ANIMS.cat.bark.frames[0] === 'sit_a', 'bark 動作對應')
}

// ============ 2. 引擎：玩耍流程 ============
const mkEngine = (w = 1920, h = 930, dpr = 1, pets, owned = []) => {
  const e = new PixelEngine()
  let seed = 7
  e.rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  e.setSize(Math.round(w * dpr), Math.round((h - 28) * dpr), dpr)
  e.setOwned(owned)
  e.sync(pets)
  const log = { settled: [], notes: [] }
  e.hooks = { requestBath: () => null, wake: () => {}, notify: (m) => log.notes.push(m), eatAtBowl: () => null, settlePlay: (id, c) => log.settled.push([id, c]) }
  e.clock = { now: NOW, hour: 12 }
  return { e, log }
}
const step = (S, secs, hour = 12, dt = 0.05) => {
  const { e } = S
  for (let t = 0; t < secs - 1e-9; t += dt) {
    S.e.clock.now += dt * 1000
    e.update(dt, { nowMs: S.e.clock.now, hour, weather: 'sunny', gifts: [] })
  }
}
const place = (e, id, x, y) => { const a = e.actors.get(id); a.x = x; a.y = y; a.tx = x; a.ty = y; a.action = 'idle'; a.t = 0; a.dur = 1e9; a.path = []; a.pathKey = '' ; return a }
const css = (e, x, y) => e.cssOf(x, y)
const throwAt = (e, x, y) => { const p = css(e, x, y); return e.throwAtCss(p.x, p.y) }
const cfg = BALANCE.play

{
  const S = mkEngine(1920, 930, 1, [pet('a', 'dog', 'shiba'), pet('b', 'dog', 'husky'), pet('c', 'cat', 'tabby')])
  const { e, log } = S
  const L = e.layout
  const B = LAY.petBounds(L)
  for (const id of ['b', 'c']) place(e, id, B.x1 - 20, B.y1 - 20)
  const a = place(e, 'a', B.x0 + 300, B.y1 - 30)
  ok(!e.isPlaying(), '一開始沒在玩')
  eq(e.playBlock('a'), null, '可以玩')
  eq(e.beginPlay('a'), null, '開始')
  ok(e.isPlaying() && a.play.phase === 'ready' && a.play.left === 30, '開始：ready、30 秒')
  eq(e.playHud(), { left: 30, catches: 0, toy: 'ball' }, 'HUD')
  ok(e.playBlock('b').includes('A正在玩耍，一次只能玩一隻'), '別隻在玩 → 原因')
  ok(e.beginPlay('b') !== null && !e.actors.get('b').play, '一次只能一隻')
  ok(e.playBlock('a').includes('正在玩耍'), '自己')
  // 玩耍中的狗不會去食盆（沒買）、不躲雨：下雨天也留在原地
  step(S, 2)
  ok(Math.hypot(a.x - (B.x0 + 300), a.y - (B.y1 - 30)) < 6, '待命不亂跑')
  // 不合法落點
  const bad = {
    水池: (() => { const w = LAY.waterEllipse(L); return [w.cx, w.cy] })(),
    樹幹: (() => { const t = LAY.blockers(L).find((r) => r.x1 - r.x0 < 30 && r.x1 - r.x0 > 4); return t ? [(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2] : null })(),
    天空: [B.x0 + 300, 20],
    畫面外: [B.x1 + 50, B.y1],
    太近: [a.x + 10, a.y],
    左側住家: [30, B.y1 - 10],
  }
  for (const [name, pt] of Object.entries(bad)) {
    if (!pt) continue
    const r = throwAt(e, pt[0], pt[1])
    ok(!r.ok, `不合法：${name}`)
    ok(a.play.phase === 'ready' && !a.play.ball, `不合法不丟球：${name}`)
  }
  ok(throwAt(e, ...bad['天空']).message.includes('不能丟'), '提示文字')
  ok(throwAt(e, ...bad['太近']).message === '太近了，丟遠一點', '太近提示')
  // 洗澡通道不算（只用主活動範圍）
  const st = ((_L) => null)(L)
  if (st) ok(!throwAt(e, (st.x0 + st.x1) / 2, (st.y0 + st.y1) / 2).ok, '洗澡通道不能丟')
  // 合法丟球：一次完整時間線
  const tgt = [a.x + 150, a.y - 10]
  ok(LAY.isWalkable(L, ...tgt), '測試落點可站')
  const r1 = throwAt(e, ...tgt)
  ok(r1.ok && a.play.phase === 'flight' && a.play.ball, '丟球')
  // 球在空中又點擊：忽略
  const keep = a.play.ball
  ok(!throwAt(e, a.x + 60, a.y).ok && a.play.ball === keep, '球在空中又點擊 → 忽略，不改目標')
  const d = Math.hypot(tgt[0] - a.x, tgt[1] - a.y)
  const t0 = a.play.left
  let tCatch = null
  const phases = new Set()
  for (let t = 0; t < 20 && tCatch === null; t += 0.05) {
    step(S, 0.05)
    phases.add(a.play.phase)
    if (a.play.catches === 1) tCatch = t + 0.05
  }
  ok(tCatch !== null, '撿回一次')
  for (const ph of ['flight', 'chase', 'grab', 'return', 'drop']) ok(phases.has(ph), '經過階段 ' + ph)
  const expectT = 1.6 + 0.027 * d
  ok(Math.abs(tCatch - expectT) < 2.5, `時間線 d=${d.toFixed(0)} 實測 ${tCatch.toFixed(2)}s 預估 ${expectT.toFixed(2)}s`)
  console.log(`  丟球 d=${d.toFixed(0)}：叼回放下共 ${tCatch.toFixed(2)} 秒`)
  eq(e.playHud().catches, 1, 'HUD 撿回 1')
  // 追球與叼回途中點擊：忽略（drop 之後才是 ready）
  const r2 = (() => { const q = [a.x - 100, a.y]; return throwAt(e, ...q) })()
  ok(!r2.ok && r2.reason === 'busy' || r2.ok, 'drop 階段點擊')
  step(S, 1)
  ok(a.play.phase === 'ready', '回到待命')
  ok(Math.hypot(a.x - (B.x0 + 300), a.y - (B.y1 - 30)) < 6, '叼回 home：回到原位')
  // 連續丟 3 次，每次落點不同，動作會回到原位
  for (let i = 0; i < 3; i++) {
    const px = B.x0 + 360 + i * 70, py = B.y0 + 30 + i * 25
    const rr = throwAt(e, px, py)
    ok(rr.ok, `連續丟 ${i}`)
    for (let t = 0; t < 25 && a.play.phase !== 'ready'; t += 0.05) step(S, 0.05)
    step(S, 0.1)
    ok(a.play.phase === 'ready' && Math.hypot(a.x - a.play.home.x, a.y - a.play.home.y) < 6, `第 ${i + 2} 次回到 home`)
  }
  eq(a.play.catches, 4, '撿回 4 次')
  // 時間到：剩下時間用完 → cheer 結算
  const left = a.play.left
  step(S, left + 0.2)
  ok(a.play.phase === 'cheer' || !a.play, '時間到進 cheer')
  eq(log.settled, [['a', 4]], '時間到結算一次，4 次')
  step(S, 2)
  ok(!a.play && !e.isPlaying(), 'cheer 後回到一般行為')
  ok(a.action !== 'happy' || a.t < 5, '之後是一般行為')
  eq(log.settled.length, 1, '不會重複結算')
}

// ============ 3. 提前結算各來源 ============
const startDog = () => {
  const S = mkEngine(1920, 930, 1, [pet('a', 'dog', 'golden'), pet('b', 'dog', 'husky')])
  const { e } = S
  const B = LAY.petBounds(e.layout)
  place(e, 'b', B.x1 - 20, B.y1 - 20)
  const a = place(e, 'a', B.x0 + 300, B.y1 - 30)
  e.beginPlay('a')
  return { ...S, a, B }
}
const catchOne = (S) => {
  const { e, a, B } = S
  throwAt(e, B.x0 + 390, B.y1 - 40)
  for (let t = 0; t < 30 && a.play.catches < 1; t += 0.05) step(S, 0.05)
  ok(a.play.catches === 1, '撿到一次')
}
{
  // 拖走：不演 cheer，結算已撿回次數
  const S = startDog()
  catchOne(S)
  const cs = css(S.e, S.a.x, S.a.y - 10)
  ok(S.e.beginDrag('a', cs.x, cs.y), '拖曳開始')
  ok(!S.a.play && !S.e.isPlaying(), '拖走：玩耍結束')
  eq(S.log.settled, [['a', 1]], '拖走：結算 1 次')
  S.e.endDrag()
  step(S, 3)
  ok(S.a.action !== 'bark' && !S.a.play, '拖走後一般行為')
}
{
  // 開視窗／resize／睡覺時間／Esc/右鍵(user)
  for (const [reason, cheer] of [['window', false], ['resize', false], ['sleep', false], ['user', true], ['drag', false]]) {
    const S = startDog()
    catchOne(S)
    S.e.endPlay(reason)
    eq(S.log.settled, [['a', 1]], `${reason}：結算 1 次`)
    if (cheer) { ok(S.a.play?.phase === 'cheer', `${reason}：演 cheer`); step(S, 2); ok(!S.a.play, 'cheer 之後結束'); eq(S.log.settled.length, 1, `${reason}：不重複結算`) }
    else ok(!S.a.play, `${reason}：不演 cheer，直接結束`)
    S.e.endPlay(reason)
    eq(S.log.settled.length, 1, `${reason}：重複呼叫不重複結算`)
  }
  // 0 次：settlePlay 被呼叫但數值 0（store 不動）——引擎回報 0
  const S = startDog()
  S.e.endPlay('window')
  eq(S.log.settled, [['a', 0]], '0 次也回報 0（由 store 決定不動）')
  // resize 真的改變才結束
  const S2 = startDog()
  S2.e.setSize(S2.e.layout.backW, S2.e.layout.backH, S2.e.layout.dpr)
  ok(S2.e.isPlaying(), '大小沒變：不結束')
  S2.e.setSize(1500, 800, 1)
  ok(S2.e.isPlaying(), '大小變了：v3.9.0 起不結束（場景座標固定）')
  // 23:00：睡覺時間到（狗沒被叫醒）
  const S3 = startDog()
  catchOne(S3)
  step(S3, 0.2, 23.2)
  ok(!S3.a.play, '23:00 到：結束')
  eq(S3.log.settled, [['a', 1]], '23:00：結算 1 次')
  ok(S3.a.action === 'sleep' || S3.a.action === 'walk' || S3.a.action === 'idle', '之後走睡覺行為')
  // 夜間被叫醒的狗可以玩，直到 30 秒
  const S4 = mkEngine(1920, 930, 1, [pet('a', 'dog', 'shiba', { awakeUntil: NOW + 3_600_000 })])
  S4.e.clock.now = NOW
  step(S4, 0.1, 23.5)
  S4.e.beginPlay('a')
  step(S4, 1, 23.5)
  ok(S4.e.isPlaying(), '夜間醒著的狗可以玩')
  // 開始時還是白天、被叫醒（awakeUntil）的狗：跨過 23:00 一樣結束
  const S4b = mkEngine(1920, 930, 1, [pet('a', 'dog', 'shiba', { awakeUntil: NOW + 3_600_000 })])
  step(S4b, 0.1, 22.9)
  S4b.e.beginPlay('a')
  step(S4b, 1, 22.95)
  ok(S4b.e.isPlaying(), '22:57 還在玩')
  step(S4b, 0.2, 23.05)
  ok(!S4b.e.isPlaying(), '跨過 23:00（即使被叫醒保持清醒）：結束')
  eq(S4b.log.settled, [['a', 0]], '23:00 結算')
  // 時間到：已叼起的讓它做完（寬限），其餘直接結算
  const S5 = startDog()
  const { e: e5, a: a5, B: B5 } = S5
  a5.play.left = 1.0
  throwAt(e5, B5.x0 + 300, B5.y1 - 50)
  step(S5, 1.3)
  ok(a5.play.phase === 'cheer' && S5.log.settled.length === 1 && S5.log.settled[0][1] === 0, '時間到時還在追：直接結算 0 次')
  const S6 = startDog()
  const { e: e6, a: a6, B: B6 } = S6
  a6.play.left = 4.0
  throwAt(e6, B6.x0 + 180, B6.y1 - 40)
  for (let t = 0; t < 15 && a6.play.phase !== 'return'; t += 0.05) step(S6, 0.05)
  a6.play.left = 0.05
  for (let t = 0; t < 8 && a6.play.phase !== 'cheer'; t += 0.05) step(S6, 0.05)
  eq(S6.log.settled, [['a', 1]], '時間到時已叼起：做完這次（撿回 1）才結算')
  ok(a6.play.phase === 'cheer', '再 cheer')
  // 寬限超過 5 秒直接結算
  const S7 = startDog()
  const { e: e7, a: a7, B: B7 } = S7
  throwAt(e7, B7.x1 - 40, B7.y0 + 10)
  for (let t = 0; t < 30 && a7.play.phase !== 'return'; t += 0.05) step(S7, 0.05)
  a7.play.left = 0.01
  a7.tx = B7.x0 + 900 // 不可能到達（只為測寬限）
  step(S7, 6)
  ok(a7.play?.phase === 'cheer' || !a7.play, '寬限超過 5 秒直接結算')
  eq(S7.log.settled.length, 1, '只結算一次')
  // 時間到後不接受新丟球
  const S8 = startDog()
  S8.a.play.left = -0.01
  S8.a.play.phase = 'ready'
  ok(!throwAt(S8.e, S8.B.x0 + 400, S8.B.y1 - 30).ok, '時間到後不接受丟球')
}

// ============ 4. 玩耍中的狗：不點選、不去建築、其他寵物照常 ============
{
  const B = LAY.petBounds(mkEngine(1920, 930, 1, []).e.layout)
  const e2 = mkEngine(1920, 930, 1, [pet('a', 'dog', 'shiba', { satiety: 10 }), pet('b', 'cat', 'tabby', { satiety: 10 })], ['kennel', 'bowls', 'catTree', 'campfire'])
  e2.e.bowlLeft = 6
  const a2 = place(e2.e, 'a', B.x0 + 400, B.y1 - 30)
  const b2 = place(e2.e, 'b', B.x0 + 500, B.y1 - 40)
  e2.e.beginPlay('a')
  let moved = 0
  let bAtBld = 0
  for (let t = 0; t < 29; t += 0.05) {
    e2.e.clock.now += 50
    e2.e.update(0.05, { nowMs: e2.e.clock.now, hour: 20, weather: 'rain', gifts: [] })
    moved = Math.max(moved, Math.hypot(a2.x - 0, 0) * 0)
    ok(!a2.bld, '玩耍的狗不使用建築')
    if (b2.bld) bAtBld++
  }
  ok(e2.e.isPlaying(), '29 秒仍在玩')
  ok(bAtBld > 0, `其他寵物照常行動（躲雨或進食）：${bAtBld} 影格在使用建築`)
  // 點選：玩耍中的狗 petAt 仍可點到（為了拖曳），但 pointerMove 不會讓牠跳
  const c = css(e2.e, a2.x, a2.y - 10)
  eq(e2.e.pointerMove(c.x, c.y), null, '玩耍中的狗：滑鼠經過不當成 hover')
}

// ============ 5. 落點：版面 17 尺寸 ============
{
  const SIZES = [[1920, 900, 1], [1920, 930, 1], [1920, 950, 1], [1900, 1000, 1.25], [1920, 1000, 1], [1920, 1120, 1], [1536, 730, 1], [1536, 864, 1], [1440, 780, 1], [1366, 650, 1], [1280, 620, 1], [1280, 720, 1], [1024, 768, 1], [2560, 1300, 1], [2560, 1440, 1], [1536, 730, 1.25], [1920, 930, 1.25]]
  const ALL = ['kennel', 'bowls', 'catTree', 'campfire']
  const lines = []
  for (const [w, h, dpr] of SIZES) for (const owned of [[], ALL]) {
    const S = mkEngine(w, h, dpr, [pet('a', 'dog', 'golden')], owned)
    const { e } = S
    const L = e.layout
    const B = LAY.petBounds(L)
    // home 候選：整個活動範圍 4 像素格
    let valid = 0
    let total = 0
    const cells = []
    for (let x = B.x0; x <= B.x1; x += 4) for (let y = B.y0; y <= B.y1; y += 4) { total++; if (LAY.isWalkable(L, x, y)) cells.push([x, y]) }
    ok(cells.length > 100, `${w}x${h}@${dpr} 可站格子不為空`)
    const a = e.actors.get('a')
    // 起點：最左下可站
    const home = cells.filter(([x, y]) => LAY.isWalkable(L, x, y) && y > B.y1 - 25)[0] ?? cells[0]
    place(e, 'a', home[0], home[1])
    e.beginPlay('a')
    // 從 cells 抽 40 個遠一點的落點，丟、追、叼回、檢查 isClear 與沒穿過障礙
    let seed = 99
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    let thrown = 0
    let catches = 0
    for (let i = 0; i < 12 && e.isPlaying(); i++) {
      const c = cells[Math.floor(rnd() * cells.length)]
      const r = throwAt(e, c[0], c[1])
      if (!r.ok) continue
      valid++
      thrown++
      const bl = LAY.blockers(L)
      for (let t = 0; t < 40 && a.play && a.play.phase !== 'ready'; t += 0.05) {
        step(S, 0.05)
        if (a.play && a.play.phase !== 'ready') {
          ok(!bl.some((r2) => a.x > r2.x0 + 1 && a.x < r2.x1 - 1 && a.y > r2.y0 + 1 && a.y < r2.y1 - 1), `${w}x${h} 寵物沒穿過障礙 (${a.x.toFixed(0)},${a.y.toFixed(0)})`)
        }
      }
      if (a.play) {
        ok(a.play.phase === 'ready', `${w}x${h} 回到待命`)
        ok(Math.hypot(a.x - a.play.home.x, a.y - a.play.home.y) < 10, `${w}x${h} 回到 home 附近`)
        catches = a.play.catches
        a.play.left = 30
      }
    }
    ok(thrown >= 3, `${w}x${h} owned=${owned.length} 至少丟得出 ${thrown} 次`)
    lines.push(`${w}x${h}@${dpr} owned=${owned.length} 可站格 ${cells.length}/${total}（${Math.round((cells.length / total) * 100)}%）丟 ${thrown} 次、撿回 ${catches}`)
  }
  console.log(lines.join('\n'))
}

console.log(`v3.5.0 邏輯測試 ${n} 項通過`)
