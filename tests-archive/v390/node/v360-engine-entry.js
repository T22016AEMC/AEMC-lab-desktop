import assert from 'node:assert/strict'
const S = (process.env.REPO_ROOT + '/src/farm/')
import * as PL from '../../../src/farm/pixel/placement.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import { isClear } from '../../../src/farm/pixel/nav.ts'
import * as FD from '../../../src/farm/pixel/finds.ts'
import { BALANCE } from '../../../src/farm/config/balance.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const NOW0 = new Date(2026, 10, 1, 12, 0, 0).getTime()
const SZ17 = [[1920, 900, 1], [1920, 930, 1], [1920, 950, 1], [1900, 1000, 1.25], [1920, 1000, 1], [1920, 1120, 1], [1536, 730, 1], [1536, 864, 1], [1440, 780, 1], [1366, 650, 1], [1280, 620, 1], [1280, 720, 1], [1024, 768, 1], [2560, 1300, 1], [2560, 1440, 1], [1536, 730, 1.25], [1920, 930, 1.25]]
const OWNED = ['kennel', 'bowls', 'catTree']
const CLR = BALANCE.dig.clearance
// 兩個外框的間隙（可以是負的 = 重疊）：和 finds.ts 的 intersects 同一個判斷
const gapOf = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1)
// 一批寶物到所有障礙物與彼此的最小間隙
function minGaps(L, finds) {
  const pos = FD.findPositions(L, finds)
  const obs = FD.obstacleRects(L)
  let toObs = Infinity, toFind = Infinity, topEdge = Infinity
  const boxes = finds.map((f) => FD.findBox(f.kind, pos.get(f.id).x, pos.get(f.id).y))
  boxes.forEach((b, i) => {
    for (const r of obs) toObs = Math.min(toObs, gapOf(b, r))
    for (let j = 0; j < i; j++) toFind = Math.min(toFind, gapOf(b, boxes[j]))
    topEdge = Math.min(topEdge, b.y0 - L.farBottom)
  })
  return { toObs, toFind, topEdge }
}
const pet = (id, species, variant) => ({ id, species, variant, name: id, adoptedAt: NOW0 - 86400000, heightFactor: 1, weight: 50, satiety: 80, mood: 60, cleanliness: 80 })
const PETS = [pet('d1', 'dog', 'shiba'), pet('c1', 'cat', 'tabby')]
let seed = 7
const mkRand = (s) => { let x = s; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296 } }

function mk({ w, h, dpr = 1, owned = OWNED, pets = PETS, seedN = 1, canvasH = null }) {
  const e = new PixelEngine()
  e.rand = mkRand(seedN)
  e.setSize(Math.round(w * dpr), canvasH ?? Math.round((h - 28) * dpr), dpr)
  e.setOwned(owned)
  e.sync(pets.map((p) => ({ ...p })))
  const log = { finds: [], settled: [], notes: [], seq: 0 }
  e.hooks = {
    requestBath: () => null, wake: () => {}, notify: (m) => log.notes.push(m), eatAtBowl: () => null,
    settlePlay: (id, c, toy) => log.settled.push([id, c, toy]),
    addFind: (id, kind, fx, fy) => {
      if (log.finds.length >= BALANCE.dig.holdMax) return false
      const p = pets.find((q) => q.id === id)
      log.finds = [...log.finds, { id: 'f' + ++log.seq, kind, by: p.species, fx, fy, at: now }]
      e.setFinds(log.finds)
      return true
    },
  }
  e.bowlLeft = 8
  let now = NOW0
  const step = (sec, hour = 12, dt = 1 / 30) => {
    const k = Math.round(sec / dt)
    for (let i = 0; i < k; i++) { now += dt * 1000; e.update(dt, { nowMs: now, hour, weather: 'sunny', gifts: [] }) }
  }
  return { e, log, step, now: () => now, setFinds: (list) => { log.finds = list; e.setFinds(list) } }
}
const until = (ctx, cond, maxSec, hour = 12) => { const dt = 1 / 30; for (let t = 0; t < maxSec; t += dt) { if (cond()) return true; ctx.step(dt, hour, dt) } return cond() }

// ============ E1/E2：每個視窗跑挖寶、尋寶 ============
const report = []
const stat = { trips: 0, far: 0 }
for (const [w, h, dpr] of SZ17) {
  for (const [id, toy] of [['d1', 'dig'], ['c1', 'hunt']]) {
    const counts = []
    for (let s = 0; s < 6; s++) {
      const c = mk({ w, h, dpr, seedN: 100 + s * 7 + (toy === 'dig' ? 0 : 3) })
      const { e, log } = c
      c.step(2)
      assert.equal(e.beginPlay(id, toy), null)
      const a = e.actors.get(id)
      ok(a.play.toy === toy && a.play.phase === 'search', '開始 = search')
      const home = { x: a.play.home.x, y: a.play.home.y }
      let maxStep = 0
      let lastX = a.x, lastY = a.y
      let moved = 0, movedT = 0
      let t = 0
      const L = e.layout
      const dt = 1 / 30
      while (a.play && t < 60) {
        c.step(dt, 12, dt)
        t += dt
        const d = Math.hypot(a.x - lastX, a.y - lastY)
        if (a.play && (a.play.phase === 'go' || a.play.phase === 'back') && d < 5) { moved += d; movedT += dt; maxStep = Math.max(maxStep, d / dt) }
        lastX = a.x; lastY = a.y
        if (a.play?.spot && a.play.phase === 'go') {
          const reach = toy === 'hunt' ? BALANCE.dig.cat.maxRange * 3 + 4 : BALANCE.dig.dog.maxReach * 3 + 4
          const from = toy === 'hunt' ? home : { x: a.x, y: a.y }
          ok(Number.isFinite(a.play.spot.x) && Number.isFinite(a.play.spot.y), '位置有限')
          if (toy === 'hunt') { const d = Math.hypot(a.play.spot.x - home.x, a.play.spot.y - home.y); ok(d <= reach, `${w}x${h} 貓離原位太遠 ${d.toFixed(0)}`); if (a.play.t < 0.1) { stat.trips++; if (d > BALANCE.dig.cat.maxRange + 1) stat.far++ } }
          void from
        }
      }
      ok(!a.play, `${w}x${h} ${toy} 在 60 秒內結束`)
      ok(t <= 30 + BALANCE.dig.graceSeconds + 1.3 + 1, `${w}x${h} ${toy} 時間 ${t.toFixed(1)}s`)
      eq(log.settled.length, 1, '結算一次'); eq(log.settled[0], [id, log.finds.length, toy], '結算次數 = 留下的寶物數')
      counts.push(log.finds.length)
      ok(log.finds.length >= 1 && log.finds.length <= BALANCE.dig.maxFinds, `${w}x${h} ${toy} 一局 ${log.finds.length} 個`)
      // 位置：換算回場景座標是可站位置，彼此有間隔
      const pts = log.finds.map((f) => FD.findPositions(L, log.finds).get(f.id))
      { const g = minGaps(L, log.finds); ok(g.toObs >= CLR - 1e-6, `${w}x${h} ${toy} 寶物離障礙物外框 ${g.toObs.toFixed(1)} < ${CLR}`); ok(g.toFind >= CLR - 1e-6, `${w}x${h} ${toy} 寶物彼此間隙 ${g.toFind.toFixed(1)}`); ok(g.topEdge >= 4 - 1e-6, '寶物上緣不碰草地上緣') }
      for (let i = 0; i < pts.length; i++) {
        ok(LAY.isWalkable(L, pts[i].x, pts[i].y), `${w}x${h} 寶物 ${i} 可站`)
        const g = FD.grassRect(L)
        ok(pts[i].x >= g.x0 - 1 && pts[i].x <= g.x1 + 1 && pts[i].y >= g.y0 - 1 && pts[i].y <= g.y1 + 1, '在草地範圍內')
      }
      for (const f of log.finds) eq(f.kind, toy === 'dig' ? 'mound' : 'bundle', '種類')
      if (toy === 'hunt') ok(maxStep < 90, `${w}x${h} 貓每秒最多 ${maxStep.toFixed(0)}px`)
      // 玩耍結束後回到一般行為
      c.step(3)
      ok(!a.play && a.action !== 'dig' && a.action !== 'crouch' && a.action !== 'pounce', '回到一般行為')
    }
    report.push(`${w}x${h}@${dpr} ${toy}：6 局各留下 ${counts.join(',')} 個（平均 ${(counts.reduce((x, y) => x + y, 0) / counts.length).toFixed(1)}）`)
  }
}

// ============ E3：提前結算（已完成的保留、進行到一半的作廢）============
{
  const reasons = [
    ['drag', (c, a) => { const p = c.e.cssOf(a.x, a.y - 8); ok(c.e.beginDrag(a.id, p.x, p.y)); c.e.endDrag() }],
    ['window', (c) => c.e.endPlay('window')],
    ['user', (c) => c.e.endPlay('user')],
    ['sleep', null],
  ]
  for (const [id, toy] of [['d1', 'dig'], ['c1', 'hunt']]) {
    for (const [reason, fn] of reasons) {
      for (const phase of ['go', 'work', toy === 'hunt' ? 'back' : 'mark']) {
        const c = mk({ w: 1920, h: 930, seedN: 55 })
        c.step(1)
        c.e.beginPlay(id, toy)
        const a = c.e.actors.get(id)
        // 先完成 1 次，再在第 2 次的指定階段打斷
        ok(until(c, () => c.log.finds.length >= 1, 25), '完成第一次')
        ok(until(c, () => a.play.phase === 'search', 6), '第一次之後回到 search')
        const before = c.log.finds.length
        ok(until(c, () => a.play?.phase === phase, 20), `進入 ${phase}`)
        const phaseBefore = a.play.phase
        if (phase === 'mark') eq(c.log.finds.length, before + 1, 'mark 階段代表這一次已留下')
        else eq(c.log.finds.length, before, `${phase} 階段：這一次還沒留下`)
        const kept = c.log.finds.length
        if (reason === 'sleep') c.step(0.1, 23.5)
        else fn(c, a)
        ok(!a.play || a.play.phase === 'cheer', `${reason}@${phase}：結束或 cheer`)
        c.step(2, 12)
        eq(c.log.settled.length, 1, `${reason}@${phase}：結算一次`)
        eq(c.log.settled[0], [id, kept, toy], `${reason}@${phase}：結算 = 已留下的寶物數（進行到一半的作廢）`)
        eq(c.log.finds.length, kept, `${reason}@${phase}：寶物數不再增加`)
        ok(!a.play, '結束後沒有玩耍狀態')
        void phaseBefore
        if (reason === 'user') ok(true)
      }
    }
  }
  // v3.9.0：改變視窗大小不再提前結算（場景座標固定）
  { const c = mk({ w: 1920, h: 930 }); c.step(1); c.e.beginPlay('d1', 'dig'); c.step(3); c.e.setSize(c.e.layout.backW - 40, c.e.layout.backH, c.e.layout.dpr); ok(!!c.e.actors.get('d1').play && c.e.actors.get('d1').play.phase !== 'cheer', 'v3.9.0 resize：玩耍繼續'); c.e.endPlay('window'); c.step(2) }
  // user／time 演 cheer、其他不演
  { const c = mk({ w: 1920, h: 930 }); c.step(1); c.e.beginPlay('d1', 'dig'); c.step(5); c.e.endPlay('user'); eq(c.e.actors.get('d1').play.phase, 'cheer', 'Esc／右鍵（user）演開心'); c.step(2); ok(!c.e.actors.get('d1').play) }
  { const c = mk({ w: 1920, h: 930 }); c.step(1); c.e.beginPlay('c1', 'hunt'); c.step(5); c.e.endPlay('window'); ok(!c.e.actors.get('c1').play, '開視窗直接結束') }
  // 23:00：夜間才被叫醒開始玩的不受影響
  { const c = mk({ w: 1920, h: 930 }); c.step(1, 23.5); const a = c.e.actors.get('d1'); a.pet = { ...a.pet, awakeUntil: c.now() + 1e7 }; c.e.beginPlay('d1', 'dig'); ok(a.play.nightStart, 'nightStart'); c.step(8, 23.5); ok(a.play, '夜間叫醒的狗不會被 23:00 中斷') }
}

// ============ E4：寶物滿了 ============
{
  const c = mk({ w: 1920, h: 930, seedN: 9 })
  c.step(1)
  const seven = Array.from({ length: 7 }, (_, i) => ({ id: 'z' + i, kind: 'mound', by: 'dog', fx: 0.05 + 0.13 * i, fy: 0.15 + 0.1 * (i % 2), at: NOW0 }))
  c.setFinds(seven)
  c.e.beginPlay('d1', 'dig')
  ok(until(c, () => !c.e.actors.get('d1').play, 60), '結束')
  ok(c.log.finds.length >= 7 && c.log.finds.length <= 8, '7 個＋最多 1 個，滿了就結束（附近放不下就少一個）'); eq(c.log.settled[0], ['d1', c.log.finds.length - 7, 'dig'])
  const c2 = mk({ w: 1920, h: 930, seedN: 9 }); c2.step(1)
  c2.setFinds(Array.from({ length: 8 }, (_, i) => ({ id: 'y' + i, kind: 'mound', by: 'dog', fx: 0.1 * i + 0.05, fy: 0.3, at: NOW0 })))
  c2.e.beginPlay('d1', 'dig'); ok(until(c2, () => !c2.e.actors.get('d1').play, 10), '已滿：很快結束'); eq(c2.log.finds.length, 8, '不會超過 8 個'); eq(c2.log.settled[0], ['d1', 0, 'dig'])
  eq(c2.e.findCapNow(), 8)
}

// ============ E5：寶物離障礙物的距離（17 視窗＋極端視窗，多局）============
{
  let minObs = Infinity, minFind = Infinity, sessions = 0, placedTotal = 0
  const kinds = []
  for (const [w, h, dpr] of [...SZ17, [1280, 480, 1]]) {
    for (let s0 = 0; s0 < 4; s0++) for (const [id, toy] of [['d1', 'dig'], ['c1', 'hunt']]) {
      const c = mk({ w, h, dpr, seedN: 900 + s0 * 13 + (toy === 'dig' ? 0 : 5) })
      c.step(1)
      // 先放幾個既有的寶物（含後續局數累積的情況），再玩一局
      if (s0 % 2) c.setFinds(Array.from({ length: 3 }, (_, i) => ({ id: 'p' + i, kind: i % 2 ? 'bundle' : 'mound', by: i % 2 ? 'cat' : 'dog', fx: 0.2 + 0.25 * i, fy: 0.3 + 0.2 * i, at: NOW0 })))
      c.e.beginPlay(id, toy); until(c, () => !c.e.actors.get(id).play, 60)
      const g = minGaps(c.e.layout, c.log.finds)
      minObs = Math.min(minObs, g.toObs); minFind = Math.min(minFind, g.toFind)
      sessions++; placedTotal += c.log.finds.length
      ok(g.toObs >= CLR - 1e-6, `${w}x${h} ${toy} 局 ${s0}：離障礙物 ${g.toObs.toFixed(1)} >= ${CLR}`)
      ok(g.toFind >= CLR - 1e-6, `${w}x${h} ${toy} 局 ${s0}：寶物彼此 ${g.toFind.toFixed(1)} >= ${CLR}`)
      ok(c.log.finds.length <= c.e.findCapNow() || s0 % 2 === 1, '不超過上限')
      kinds.push(...c.log.finds.map((f) => f.kind))
    }
  }
  report.push(`寶物擺放：${sessions} 局、${placedTotal} 個寶物，離障礙物外框最小間隙 ${minObs === Infinity ? '-' : minObs.toFixed(1)}、寶物彼此最小間隙 ${minFind === Infinity ? '-' : minFind.toFixed(1)}（要求 >= ${CLR}）`)
}

// ============ E6/E7：17 視窗與極端低視窗 ============
{
  const table = []
  const capRows = []
  for (const [w, h, dpr] of [...SZ17, [1280, 480, 1], [1024, 454, 1]]) {
    const cssH = h - 28
    const L0 = LAY.computeLayout(Math.round(w * dpr), Math.round(cssH * dpr), dpr)
    const L = { ...L0 }
    LAY.setPlacement(L, PL.defaultPlacement(OWNED)) // v3.9.0：已購買要經過擺放結果才會擺出來
    const cap = FD.findCap(L)
    const area = FD.grassArea(L)
    ok(cap === (area > 0 ? Math.max(1, Math.min(8, Math.floor(area / BALANCE.dig.areaPerFind))) : 0), '上限公式')
    ok(OWNED.filter((id) => ['kennel', 'bowls', 'catTree'].includes(id)).every((id) => LAY.ownedSlots(L).some((s) => s.id === id)), `${w}x${h} 三個建築都擺出來（v3.9.0）`)
    // 連通區塊
    const cell = 4, cols = Math.ceil(L.W / cell) + 1, rows = Math.ceil(L.H / cell) + 1
    const okc = new Uint8Array(cols * rows)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) okc[r * cols + c] = isClear(L, c * cell, r * cell) ? 1 : 0
    const lab = new Int32Array(cols * rows); let comps = 0
    for (let s0 = 0; s0 < cols * rows; s0++) { if (!okc[s0] || lab[s0]) continue; comps++; const st = [s0]; lab[s0] = comps; while (st.length) { const p = st.pop(); const x = p % cols, y = (p / cols) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue; const q = ny * cols + nx; if (okc[q] && !lab[q]) { lab[q] = comps; st.push(q) } } } }
    ok(comps === 1, `${w}x${h} 三建築後仍是 1 個連通區塊（${comps}）`)
    // 依序挑滿 cap 個位置（狗、貓各一次）
    for (const anchor of [{ x: L.W * 0.3, y: LAY.petBounds(L).y1 - 10 }, { x: L.W * 0.7, y: LAY.petBounds(L).y0 + 8 }]) {
      const placed = []
      const rand = mkRand(w + h)
      for (let i = 0; i < cap; i++) {
        const kind = i % 2 ? 'bundle' : 'mound'
        const q = { L, rand, kind, anchor, reach: 150, finds: placed, pets: [] }
        const sp = FD.pickFindSpot(q) ?? FD.pickFindSpot({ ...q, reach: 450 })
        ok(sp, `${w}x${h} 第 ${i + 1}/${cap} 個挑得到`)
        ok(LAY.isWalkable(L, sp.x, sp.y) && isClear(L, sp.x, sp.y), '可站')
        placed.push({ id: 'k' + i, kind, ...FD.worldToFind(L, sp.x, sp.y) })
      }
    }
    // 上限保證：隨機亂放（含多種寶物、隨機位置）塞到上限一定放得下，不會玩到一半找不到位置
    { let worst = 99
      for (let t = 0; t < 60; t++) {
        const rr = mkRand(t * 31 + w)
        const placed = []
        for (let i = 0; i < 16; i++) {
          const kind = rr() < 0.5 ? 'bundle' : 'mound'
          const sp = FD.pickFindSpot({ L, rand: rr, kind, anchor: { x: L.W * rr(), y: LAY.petBounds(L).y1 }, reach: 1e9, finds: placed, pets: [], minDist: 0 })
          if (!sp) break
          placed.push({ id: 'k' + i, kind, ...FD.worldToFind(L, sp.x, sp.y) })
        }
        worst = Math.min(worst, placed.length)
      }
      ok(worst >= cap, `${w}x${h} 隨機亂放最少塞得下 ${worst} < 上限 ${cap}`)
      capRows.push(`${w}×${h}@${dpr}（${L.W}×${L.H}，S=${L.S}）可放面積 ${area}、上限 ${cap}、亂放最少塞得下 ${worst}`)
    }
    table.push(`${w}×${h}@${dpr}（${L.W}×${L.H}，S=${L.S}）草地 ${area}，上限 ${cap}，連通 ${comps}`)
  }
  report.push('--- 版面 ---', ...table, '--- 寶物上限（3 個建築都買）---', ...capRows)
  // 極端低視窗：實際玩一局
  const c = mk({ w: 1280, h: 480, canvasH: 452, seedN: 3 })
  eq([c.e.layout.W, c.e.layout.H, c.e.layout.whole], [640, 320, false], 'v3.9.0：低視窗也是固定 640×320（非整數倍縮小）')
  const cap = c.e.findCapNow()
  report.push(`極端視窗 H=${c.e.layout.H}：草地面積 ${FD.grassArea(c.e.layout)}，寶物上限 ${cap}`)
  c.step(1); c.e.beginPlay('d1', 'dig'); ok(until(c, () => !c.e.actors.get('d1').play, 60), '極端視窗挖寶結束')
  ok(c.log.finds.length >= 1 && c.log.finds.length <= cap + 0, `H=226 一局留下 ${c.log.finds.length} 個（上限 ${cap}）`)
  const c3 = mk({ w: 1280, h: 480, canvasH: 452, seedN: 4 }); c3.step(1); c3.e.beginPlay('c1', 'hunt'); ok(until(c3, () => !c3.e.actors.get('c1').play, 60)); ok(c3.log.finds.length >= 1, '極端視窗尋寶')
}

// ============ E8：換視窗大小後寶物仍可站、點得到 ============
{
  const c = mk({ w: 1920, h: 930, seedN: 12 })
  c.step(1); c.e.beginPlay('d1', 'dig'); until(c, () => !c.e.actors.get('d1').play, 60)
  const f0 = c.log.finds
  ok(f0.length >= 3, '先有幾個寶物')
  for (const [w, h, dpr] of SZ17) {
    c.e.setSize(Math.round(w * dpr), Math.round((h - 28) * dpr), dpr)
    const pts = c.e.findPoints()
    eq(pts.size, f0.length, '每個寶物都有位置')
    for (const f of f0) { const p = pts.get(f.id); ok(LAY.isWalkable(c.e.layout, p.x, p.y), `${w}x${h} 換視窗後可站`)
      // 點擊判定
      const css = c.e.cssOf(p.x, p.y - 6)
      const hit = c.e.hitTest(css.x, css.y)
      ok(hit && (hit.kind === 'find' || hit.kind === 'pet'), `${w}x${h} 點得到寶物或在寵物身上`)
      const far = c.e.cssOf(p.x + 90, p.y)
      const h2 = c.e.hitTest(far.x, far.y)
      ok(!h2 || h2.kind !== 'find' || h2.id !== f.id, '遠處點不到')
    }
  }
  // 點擊區：至少 24 個 CSS 像素
  const c2 = mk({ w: 1920, h: 930, seedN: 12 }); c2.setFinds([{ id: 'one', kind: 'mound', by: 'dog', fx: 0.5, fy: 0.5, at: NOW0 }])
  c2.e.actors.get('d1').x = -500; c2.e.actors.get('c1').x = -500
  const p = c2.e.findPointOf('one'); const css = c2.e.cssOf(p.x, p.y)
  for (const [dx, dy] of [[0, 0], [20, 0], [-20, 0], [0, -30], [0, -45], [0, 10]]) { const hit = c2.e.hitTest(css.x + dx, css.y + dy); ok(hit && hit.kind === 'find' && hit.id === 'one', `點擊區涵蓋 (${dx},${dy}) CSS 像素`) }
  for (const [dx, dy] of [[60, 0], [-60, 0], [0, -120], [0, 40]]) { const hit = c2.e.hitTest(css.x + dx, css.y + dy); ok(!hit || hit.kind !== 'find', `點擊區不涵蓋 (${dx},${dy})`) }
}

report.push('貓尋寶：' + stat.trips + ' 趟中 ' + stat.far + ' 趟（' + ((stat.far / Math.max(1, stat.trips)) * 100).toFixed(1) + '%）因為 120 像素內放不下，放寬到 3 倍距離')
console.log(report.join('\n'))
console.log(`v3.6.0 引擎測試 ${n} 項通過`)
