import assert from 'node:assert/strict'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import { isSleeping } from '../../../src/farm/sim/rules.ts'
import * as FD from '../../../src/farm/pixel/finds.ts'
import { BALANCE } from '../../../src/farm/config/balance.ts'

// 混合模擬：丟球、挖寶、尋寶、洗澡、睡覺、拖曳、揭曉、換視窗大小、提前結束全部混在一起跑 30 分鐘（8 種視窗）
const NOW0 = new Date(2026, 10, 1, 12, 0, 0).getTime()
const VIEWS = [[1920, 930, 1], [1920, 930, 1.25], [1280, 720, 1], [1024, 768, 1], [1920, 1120, 1], [1366, 650, 1], [1280, 620, 1], [2560, 1440, 1]]
const START_HOURS = [22.6, 12, 19.6, 21, 22.7, 14, 20, 22.8]
const WEATHER = ['sunny', 'rain', 'sunny', 'cloudy', 'rain', 'snow', 'sunny', 'rain']
const pet = (id, species, variant) => ({ id, species, variant, name: id, adoptedAt: NOW0 - 86400000, heightFactor: 1, weight: 50, satiety: 55, mood: 60, cleanliness: 80 })
const PETS = [pet('d1', 'dog', 'shiba'), pet('d2', 'dog', 'golden'), pet('d3', 'dog', 'corgi'), pet('c1', 'cat', 'tabby'), pet('c2', 'cat', 'siamese'), pet('c3', 'cat', 'ragdoll')]
const PHASE_CAP = { ready: 40, flight: 1.5, chase: 11, grab: 1, return: 13, drop: 1, cheer: 2, search: 1, go: 10, work: 4, pounce: 1, back: 10, put: 1, mark: 1.5 }
let totals = { sessions: { ball: 0, dig: 0, hunt: 0 }, finds: 0, reveals: 0, baths: 0, resizes: 0 }
const report = []
for (let vi = 0; vi < VIEWS.length; vi++) {
  const [w, h, dpr] = VIEWS[vi]
  const e = new PixelEngine()
  let seed = 4000 + vi * 91
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  e.rand = rand
  e.setSize(Math.round(w * dpr), Math.round((h - 28) * dpr), dpr)
  e.setOwned(['kennel', 'bowls', 'catTree'])
  e.sync(PETS.map((p) => ({ ...p })))
  let now = NOW0
  const log = { finds: [], settled: [], seq: 0 }
  e.hooks = {
    requestBath: () => { totals.baths++; return null }, wake: () => {}, notify: () => {}, eatAtBowl: () => null,
    settlePlay: (id, c, toy) => log.settled.push([id, c, toy]),
    addFind: (id, kind, fx, fy) => {
      if (log.finds.length >= BALANCE.dig.holdMax) return false
      log.finds = [...log.finds, { id: 'f' + ++log.seq, kind, by: id.startsWith('d') ? 'dog' : 'cat', fx, fy, at: now }]
      e.setFinds(log.finds)
      totals.finds++
      return true
    },
  }
  e.bowlLeft = 8
  const dt = 0.05
  const steps = Math.round((30 * 60) / dt)
  let nextPlay = 5 + rand() * 20
  let phaseSince = 0, lastPhase = '', startedAt = -1, sessions = 0, dragId = null, draggingUntil = 0
  let L = e.layout
  let lastResize = -1
  const hist = {}
  for (let i = 0; i < steps; i++) {
    const tsec = i * dt
    now += dt * 1000
    const hour = (START_HOURS[vi] + tsec / 3600) % 24
    e.update(dt, { nowMs: now, hour, weather: WEATHER[vi], gifts: [] })
    const playing = e.playingActor()
    if (!playing && tsec >= nextPlay && !dragId) {
      const list = [...e.actors.values()].filter((a) => !isSleeping(a.pet, hour, now) && !a.bath && !a.drag && !a.fly)
      if (list.length) {
        const a = list[Math.floor(rand() * list.length)]
        const toy = a.pet.species === 'cat' ? 'hunt' : rand() < 0.5 ? 'ball' : 'dig'
        if (toy !== 'ball' && log.finds.length >= BALANCE.dig.holdMax) {
          // 寶物滿了：和遊戲一樣不能開始（不扣金幣）→ 點開一個再說
          const f = log.finds[0]; log.finds = log.finds.slice(1); e.setFinds(log.finds); totals.reveals++; void f
        }
        assert.equal(e.beginPlay(a.id, toy), null)
        totals.sessions[toy]++
        sessions++
        startedAt = tsec
        nextPlay = tsec + 33 + rand() * 60
        lastPhase = ''
      } else nextPlay = tsec + 5
    }
    const p = playing?.play
    if (p) {
      if (p.phase !== lastPhase) { lastPhase = p.phase; phaseSince = tsec }
      const cap = PHASE_CAP[p.phase]
      assert.ok(cap !== undefined, '未知階段 ' + p.phase)
      assert.ok(tsec - phaseSince <= cap + (p.phase === 'ready' ? 40 : 0), `${w}x${h} ${playing.id}(${p.toy}) 階段 ${p.phase} 卡了 ${(tsec - phaseSince).toFixed(1)}s`)
      assert.ok(tsec - startedAt <= 30 + 5 + 4 + 6 + 8, `${w}x${h} ${p.toy} 玩耍超過 53 秒還沒結束`)
      if (p.toy === 'ball' && p.phase === 'ready' && rand() < 0.04) {
        const B = LAY.petBounds(e.layout)
        const c = e.cssOf(B.x0 + rand() * (B.x1 - B.x0), B.y0 + rand() * (B.y1 - B.y0))
        e.throwAtCss(c.x, c.y)
      }
      if (p.toy !== 'ball') {
        const c = e.cssOf(playing.x + 30, playing.y)
        assert.ok(!e.throwAtCss(c.x, c.y).ok, '挖寶／尋寶時點畫面不會丟球')
        assert.ok(!e.isPlayingBall(), 'isPlayingBall 只在丟球時為真')
      }
      if (rand() < 0.0008) e.endPlay(['window', 'user', 'resize', 'sleep'][Math.floor(rand() * 4)])
      else if (rand() < 0.0005) {
        const cs = e.cssOf(playing.x, playing.y - 8)
        if (e.beginDrag(playing.id, cs.x, cs.y)) { dragId = playing.id; draggingUntil = tsec + 0.6 }
      }
    }
    // 隨機揭曉一個（模擬玩家點開）
    if (log.finds.length && rand() < 0.002) { const k = Math.floor(rand() * log.finds.length); log.finds = log.finds.filter((_, j) => j !== k); e.setFinds(log.finds); totals.reveals++ }
    // 隨機換視窗大小
    if (rand() < 0.0004) {
      const [w2, h2, d2] = VIEWS[Math.floor(rand() * VIEWS.length)]
      e.setSize(Math.round(w2 * d2), Math.round((h2 - 28) * d2), d2)
      L = e.layout
      totals.resizes++
      lastResize = tsec.toFixed(1)
      assert.equal(e.findPoints().size, log.finds.length, '換視窗後每個寶物都有位置')
      for (const f of log.finds) { const pt = e.findPointOf(f.id); assert.ok(LAY.isWalkable(L, pt.x, pt.y), '換視窗後寶物可站') }
    }
    // 隨機洗澡、拖曳
    if (!dragId && rand() < 0.0003) {
      const list = [...e.actors.values()].filter((a) => !a.bath && !a.drag && !a.fly && !a.play)
      const a = list[Math.floor(rand() * list.length)]
      if (a) { const cs = e.cssOf(a.x, a.y - 8); if (e.beginDrag(a.id, cs.x, cs.y)) { dragId = a.id; draggingUntil = tsec + 0.5 } }
    }
    if (!dragId && rand() < 0.0004) {
      const list = [...e.actors.values()].filter((a) => !a.bath && !a.drag && !a.fly && !a.play && !isSleeping(a.pet, hour, now))
      const a = list[Math.floor(rand() * list.length)]
      if (a && !e.sendToBath(a.id)) { /* 開始走去洗澡 */ }
    }
    if (dragId) {
      const B = LAY.petBounds(e.layout)
      const c = e.cssOf(B.x0 + rand() * (B.x1 - B.x0), B.y0 + rand() * (B.y1 - B.y0))
      e.dragTo(c.x, c.y)
      if (tsec >= draggingUntil) { e.endDrag(); dragId = null }
    }
    // 不變量
    if (i % 4 === 0) for (const a of e.actors.values()) { const hs = (hist[a.id] ??= []); hs.push(`${tsec.toFixed(1)}:(${a.x.toFixed(0)},${a.y.toFixed(0)}) ${a.action} p=${a.play?.phase ?? '-'} b=${a.bld?.phase ?? '-'}${a.bath ? ' bath' : ''}${a.drag ? ' drag' : ''}${a.fly ? ' fly' : ''}`); if (hs.length > 60) hs.shift() }
    if (i % 4 === 0) {
      const bl = LAY.blockers(e.layout)
      for (const a of e.actors.values()) {
        assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y), '座標有限')
        if (a.drag || a.fly || a.bath || a.bld?.phase === 'at') continue
        if (a.pet.species === 'cat' && a.bld) continue
        const inside = bl.find((r) => a.x > r.x0 + 1.5 && a.x < r.x1 - 1.5 && a.y > r.y0 + 1.5 && a.y < r.y1 - 1.5)
        assert.ok(!inside, `${w}x${h} t=${tsec.toFixed(0)} ${a.id} 穿進障礙 (${a.x.toFixed(0)},${a.y.toFixed(0)}) action=${a.action} play=${a.play?.phase} rect=${JSON.stringify(inside)} L=${e.layout.W}x${e.layout.H} spot=${JSON.stringify(a.play?.spot)} put=${JSON.stringify(a.play?.put)} resizedAt=${lastResize}\n${hist[a.id].join('\n')}`)
      }
      assert.ok(log.finds.length <= BALANCE.dig.holdMax, '寶物不超過 8 個')
      // 寶物的擺放（寶物數沒超過這個視窗的上限時）：外框離障礙物與彼此至少 clearance
      if (i % 200 === 0 && log.finds.length <= e.findCapNow()) {
        const pos = e.findPoints(), obs = FD.obstacleRects(e.layout)
        const boxes = log.finds.map((f) => FD.findBox(f.kind, pos.get(f.id).x, pos.get(f.id).y))
        const gap = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1)
        boxes.forEach((bx, bi) => { for (const r of obs) assert.ok(gap(bx, r) >= BALANCE.dig.clearance - 1e-6, `${w}x${h} t=${tsec.toFixed(0)} 寶物壓到障礙物 gap=${gap(bx, r).toFixed(1)}`); for (let j = 0; j < bi; j++) assert.ok(gap(bx, boxes[j]) >= BALANCE.dig.clearance - 1e-6, '寶物彼此太近') })
      }
    }
    assert.ok([...e.actors.values()].filter((a) => a.play).length <= 1, '一次只有一隻在玩')
  }
  e.endPlay('window')
  if (dragId) e.endDrag()
  for (let i = 0; i < 400; i++) { now += 50; e.update(0.05, { nowMs: now, hour: 12, weather: 'sunny', gifts: [] }) }
  assert.ok(![...e.actors.values()].some((a) => a.play), `${w}x${h} 結束後沒有玩耍狀態`)
  for (const a of e.actors.values()) assert.ok(!['bark', 'dig', 'crouch', 'pounce'].includes(a.action) && !a.play, `${a.id} 回到一般行為（${a.action}）`)
  assert.ok(log.settled.length >= sessions && log.settled.length <= sessions + 1, `${w}x${h} 結算 ${log.settled.length} 次，場次 ${sessions}`)
  report.push(`${w}x${h}@${dpr}：玩耍 ${sessions} 場、結算 ${log.settled.length} 次、現存寶物 ${log.finds.length}`)
}
console.log(report.join('\n'))
console.log(`混合模擬通過：8 視窗各 30 分鐘；丟球 ${totals.sessions.ball} 場、挖寶 ${totals.sessions.dig} 場、尋寶 ${totals.sessions.hunt} 場、留下 ${totals.finds} 個寶物、揭曉 ${totals.reveals} 個、洗澡 ${totals.baths} 次、換視窗 ${totals.resizes} 次`)
