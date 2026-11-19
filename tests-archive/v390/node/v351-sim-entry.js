import assert from 'node:assert/strict'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import { isSleeping } from '../../../src/farm/sim/rules.ts'

const NOW0 = new Date(2026, 9, 31, 12, 0, 0).getTime()
const VIEWS = [[1920, 930, 1], [1920, 930, 1.25], [1280, 720, 1], [1024, 768, 1], [1920, 1120, 1], [1366, 650, 1], [1280, 620, 1], [2560, 1440, 1]]
const START_HOURS = [22.6, 12, 19.6, 21, 22.7, 14, 20, 22.8]
const WEATHER = ['sunny', 'rain', 'sunny', 'cloudy', 'rain', 'snow', 'sunny', 'rain']
const pet = (id, species, variant) => ({ id, species, variant, name: id, adoptedAt: NOW0 - 86400000, heightFactor: 1, weight: 50, satiety: 55, mood: 60, cleanliness: 80 })
const PETS = [pet('d1', 'dog', 'shiba'), pet('d2', 'dog', 'golden'), pet('d3', 'dog', 'corgi'), pet('c1', 'cat', 'tabby'), pet('c2', 'cat', 'siamese'), pet('c3', 'cat', 'ragdoll')]

const BALANCE_STUCK = 10
let totalSessions = 0
let totalThrows = 0
let totalCatches = 0
const report = []
for (let vi = 0; vi < VIEWS.length; vi++) {
  const [w, h, dpr] = VIEWS[vi]
  const e = new PixelEngine()
  let seed = 1000 + vi * 77
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  e.rand = rand
  e.setSize(Math.round(w * dpr), Math.round((h - 28) * dpr), dpr)
  e.setOwned(['kennel', 'bowls', 'catTree'])
  e.sync(PETS.map((p) => ({ ...p })))
  const settled = []
  const notes = []
  e.hooks = { requestBath: () => null, wake: () => {}, notify: (m) => notes.push(m), eatAtBowl: () => null, settlePlay: (id, c) => settled.push([id, c]) }
  e.bowlLeft = 8
  const L = e.layout
  const B = LAY.petBounds(L)
  const bl = LAY.blockers(L)
  let now = NOW0
  let hour = START_HOURS[vi]
  const weather = WEATHER[vi]
  const dt = 0.05
  const steps = Math.round((30 * 60) / dt)
  let nextPlay = 5 + rand() * 40
  let playStartedAt = -1
  let phaseSince = 0
  let lastPhase = ''
  let sessions = 0
  let throws = 0
  let draggingUntil = 0
  let dragId = null
  let sessionsEnded = 0
  for (let i = 0; i < steps; i++) {
    const tsec = i * dt
    now += dt * 1000
    hour = (START_HOURS[vi] + tsec / 3600) % 24
    e.update(dt, { nowMs: now, hour, weather, gifts: [] })
    const playing = e.playingActor()

    // 隨機開始玩耍：挑一隻醒著的、沒在洗澡／被拖曳的狗
    if (!playing && tsec >= nextPlay && !dragId) {
      const dogs = [...e.actors.values()].filter((a) => a.pet.species === 'dog' && !isSleeping(a.pet, hour, now) && !a.bath && !a.drag && !a.fly)
      if (dogs.length) {
        const a = dogs[Math.floor(rand() * dogs.length)]
        assert.equal(e.beginPlay(a.id), null)
        sessions++
        playStartedAt = tsec
        nextPlay = tsec + 35 + rand() * 90
        phaseSince = 0
        lastPhase = ''
      } else nextPlay = tsec + 10
    }
    const p = playing?.play
    if (p) {
      // 卡住偵測：任一階段不可超過上限
      if (p.phase !== lastPhase) { lastPhase = p.phase; phaseSince = tsec }
      const cap = { ready: 40, flight: 1.5, chase: BALANCE_STUCK + 1, grab: 1, return: BALANCE_STUCK + 3, drop: 1, cheer: 2 }[p.phase]
      assert.ok(tsec - phaseSince <= cap + 40 * (p.phase === 'ready'), `${w}x${h} ${playing.id} 階段 ${p.phase} 卡了 ${(tsec - phaseSince).toFixed(1)}s`)
      assert.ok(tsec - playStartedAt <= 30 + 5 + 3 + 6 + 20 * 0, `${w}x${h} 玩耍超過 44 秒還沒結束`)
      // 隨機丟球（含不合法位置）
      if (p.phase === 'ready' && rand() < 0.04) {
        const x = rand() < 0.8 ? B.x0 + rand() * (B.x1 - B.x0) : rand() * L.W
        const y = rand() < 0.8 ? B.y0 + rand() * (B.y1 - B.y0) : rand() * L.H
        const c = e.cssOf(x, y)
        const r = e.throwAtCss(c.x, c.y)
        if (r.ok) throws++
      } else if (p.phase !== 'ready' && rand() < 0.02) {
        const c = e.cssOf(B.x0 + rand() * (B.x1 - B.x0), B.y0 + rand() * (B.y1 - B.y0))
        assert.ok(!e.throwAtCss(c.x, c.y).ok, '非 ready 不接受丟球')
      }
      // 隨機提前結束
      if (rand() < 0.0006) { e.endPlay(['window', 'user', 'resize'][Math.floor(rand() * 3)]); sessionsEnded++ }
      else if (rand() < 0.0004) {
        const cs = e.cssOf(playing.x, playing.y - 8)
        if (e.beginDrag(playing.id, cs.x, cs.y)) { dragId = playing.id; draggingUntil = tsec + 0.6 }
      }
    }
    // 隨機拖曳任一寵物（含沒在玩的）
    if (!dragId && rand() < 0.0003) {
      const list = [...e.actors.values()].filter((a) => !a.bath && !a.drag && !a.fly && !a.play)
      const a = list[Math.floor(rand() * list.length)]
      if (a) {
        const cs = e.cssOf(a.x, a.y - 8)
        if (e.beginDrag(a.id, cs.x, cs.y)) { dragId = a.id; draggingUntil = tsec + 0.5 }
      }
    }
    if (dragId) {
      const a = e.actors.get(dragId)
      const c = e.cssOf(B.x0 + rand() * (B.x1 - B.x0), B.y0 + rand() * (B.y1 - B.y0))
      e.dragTo(c.x, c.y)
      if (tsec >= draggingUntil) { e.endDrag(); dragId = null }
    }
    // 不變量：沒有寵物站進障礙（座位上、洗澡、被拖、飛回去除外）
    if (i % 4 === 0)
      for (const a of e.actors.values()) {
        if (a.drag || a.fly || a.bath || a.bld?.phase === 'at') continue
        if (a.pet.species === 'cat' && a.bld) continue
        const inside = bl.find((r) => a.x > r.x0 + 1.5 && a.x < r.x1 - 1.5 && a.y > r.y0 + 1.5 && a.y < r.y1 - 1.5)
        assert.ok(!inside, `${w}x${h} t=${tsec.toFixed(0)} ${a.id} 穿進障礙 (${a.x.toFixed(0)},${a.y.toFixed(0)}) action=${a.action} play=${a.play?.phase}`)
        assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y), '座標有限')
      }
    // 一次只有一隻
    assert.ok([...e.actors.values()].filter((a) => a.play).length <= 1, '一次只有一隻在玩')
  }
  // 收尾：結束玩耍，再跑 10 秒，所有狀態回到正常
  e.endPlay('window')
  if (dragId) e.endDrag()
  for (let i = 0; i < 400; i++) { now += 50; e.update(0.05, { nowMs: now, hour, weather, gifts: [] }) }
  assert.ok(![...e.actors.values()].some((a) => a.play), `${w}x${h} 結束後沒有玩耍狀態`)
  for (const a of e.actors.values()) assert.ok(a.action !== 'bark' && !a.play, `${a.id} 一般行為 ${a.action}`)
  const tot = settled.reduce((s, [, c]) => s + c, 0)
  totalSessions += sessions
  totalThrows += throws
  totalCatches += tot
  report.push(`${w}x${h}@${dpr} 起 ${String(Math.floor(START_HOURS[vi])).padStart(2, '0')}:${String(Math.round((START_HOURS[vi] % 1) * 60)).padStart(2, '0')} ${weather}：玩耍 ${sessions} 場、丟球 ${throws} 次、撿回 ${tot} 次、結算 ${settled.length} 次、提前結束 ${sessionsEnded}`)
  // 每場開始都有對應的結算
  assert.ok(settled.length >= sessions - 0 && settled.length <= sessions + 1, `${w}x${h} 結算次數 ${settled.length} 與場次 ${sessions} 不符`)
}
console.log(report.join('\n'))
console.log(`引擎混合模擬：8 視窗各 30 分鐘通過；共 ${totalSessions} 場玩耍、${totalThrows} 次合法丟球、${totalCatches} 次撿回`)
