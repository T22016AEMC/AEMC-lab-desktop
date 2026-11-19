// D2-2 野餐偶爾睡一下（Node）：模擬頻率、時長、同時上限、懶散、指令叫醒
import './env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BALANCE } from '../../../src/farm/config/balance.ts'
import * as PC from '../../../src/farm/pixel/picnic.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const ROOT = process.env.REPO_ROOT
const manDir = join(ROOT, 'public/assets')
const man = JSON.parse(readFileSync(join(manDir, readdirSync(manDir).find((f) => f.startsWith('manifest'))), 'utf8'))
const report = []

// ---------- D2-2 野餐睡覺（純邏輯模擬：updatePicnicSeat） ----------
const nb = BALANCE.picnic.nap
eq([nb.minSitSeconds, nb.rollEverySeconds, nb.chance, nb.seconds, nb.lazyChanceMul, nb.lazyMinSitSeconds, nb.maxNappers, nb.maxNappersMany], [60, 10, 1 / 24, [15, 25], 2, 40, 1, 2], '睡覺參數')
let seed = 22
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const mat = { x0: 100, y0: 100, x1: 204, y1: 163 }
const makeActor = (i, personality) => ({ id: 'p' + i, pet: { id: 'p' + i, species: i % 2 ? 'cat' : 'dog', personality }, x: 0, y: 0, tx: 0, ty: 0, facing: 1, action: 'sit', t: 0, animT: 0, path: [], override: null, picnic: { seat: i, arrived: true, t: 0, cheer: 0 } })
const ops = { setAction: (a, act) => { a.action = act }, moveToward: () => {} }
function simulate(count, personality, seconds, dt = 0.1) {
  const actors = Array.from({ length: count }, (_, i) => makeActor(i, personality))
  const env = { rand: rnd, others: actors, emit: () => {} }
  const naps = actors.map(() => ({ starts: [], lens: [], cur: 0 }))
  let maxTogether = 0
  for (let t = 0; t < seconds; t += dt) {
    for (const a of actors) PC.updatePicnicSeat(a, dt, env, mat, ops)
    let together = 0
    actors.forEach((a, i) => {
      const napping = PC.isPicnicNapping(a)
      if (napping) together++
      if (napping && naps[i].cur === 0) naps[i].starts.push(t)
      if (napping) naps[i].cur += dt
      else if (naps[i].cur > 0) { naps[i].lens.push(naps[i].cur); naps[i].cur = 0 }
      n++
      assert.ok(napping ? a.action === 'sleep' : a.action === 'sit', '睡著用 sleep、醒著 sit')
    })
    maxTogether = Math.max(maxTogether, together)
  }
  // 模擬結束時還在睡的那一次被截斷，不算時長
  return { naps, maxTogether }
}
// 一場 5 分鐘、坐好 4.5 分鐘：統計 400 場 × 3 隻
let pets = 0, napped = 0, firstMin = Infinity, lens = [], maxT = 0
for (let k = 0; k < 400; k++) {
  const r = simulate(3, 'calm', 270)
  for (const x of r.naps) {
    pets++
    ok(x.starts.length <= 1, '每隻每場最多睡一次')
    if (x.starts.length) { napped++; firstMin = Math.min(firstMin, x.starts[0]); lens.push(...x.lens) }
  }
  maxT = Math.max(maxT, r.maxTogether)
}
const rate = napped / pets
ok(firstMin >= 60, `最早在坐好 ${firstMin.toFixed(1)} 秒後才睡（≥ 60）`)
ok(lens.every((l) => l >= 14.9 && l <= 25.2), `每次睡 ${Math.min(...lens).toFixed(1)}～${Math.max(...lens).toFixed(1)} 秒（15～25）`)
ok(maxT <= 1, `3 隻時同時最多 ${maxT} 隻在睡（上限 1）`)
// 理論值：60 秒後每 10 秒擲 1/24，坐好 270 秒擲 21 次 → 1 − (23/24)^21 ≈ 59%，再扣掉同時上限 → 約 55%
ok(rate > 0.4 && rate < 0.7, `一般個性：一場（坐好 4.5 分鐘）有睡的比例 ${(rate * 100).toFixed(1)}%（理論約 55%）`)
report.push(`野餐睡覺：一般個性 400 場 × 3 隻，有睡 ${(rate * 100).toFixed(1)}%、最早 ${firstMin.toFixed(1)} 秒、每次 ${Math.min(...lens).toFixed(1)}～${Math.max(...lens).toFixed(1)} 秒、同時最多 ${maxT} 隻`)
// 懶散
let lp = 0, ln = 0, lfirst = Infinity
for (let k = 0; k < 400; k++) {
  const r = simulate(3, 'lazy', 270)
  for (const x of r.naps) { lp++; if (x.starts.length) { ln++; lfirst = Math.min(lfirst, x.starts[0]) } }
}
const lrate = ln / lp
ok(lrate > rate && lfirst >= 40, `懶散：比例 ${(lrate * 100).toFixed(1)}%（> 一般）、最早 ${lfirst.toFixed(1)} 秒（≥ 40）`)
report.push(`野餐睡覺：懶散 400 場 × 3 隻，有睡 ${(lrate * 100).toFixed(1)}%、最早 ${lfirst.toFixed(1)} 秒`)
// 6 隻：同時最多 2 隻
let m6 = 0
for (let k = 0; k < 200; k++) m6 = Math.max(m6, simulate(6, 'lazy', 270).maxTogether)
ok(m6 <= 2, `6 隻時同時最多 ${m6} 隻在睡（上限 2）`)
// 指令動作叫醒
{
  const a = makeActor(0, 'lazy')
  a.picnic.nap = 10
  a.picnic.napped = true
  a.action = 'sleep'
  a.override = { action: 'happy', left: 1, speedMul: 0, tag: 'pet' }
  PC.updatePicnicSeat(a, 0.1, { rand: rnd, others: [a], emit: () => {} }, mat, ops)
  ok(a.picnic.nap === 0 && a.action === 'happy', '氣泡選單的動作叫醒（演動作）')
  for (let i = 0; i < 20; i++) PC.updatePicnicSeat(a, 0.1, { rand: rnd, others: [a], emit: () => {} }, mat, ops)
  ok(a.action === 'sit' && !PC.isPicnicNapping(a), '動作演完坐回去、這場不再睡')
}


// 引擎：整場野餐（6 隻、5 分鐘）睡覺開著與關掉，呼叫存檔層的 hooks（唯一會改存檔的路徑）完全相同；拍照時睡著的不做開心姿勢
{
  const NOW = new Date(2026, 10, 19, 12, 0, 0).getTime()
  const V = [['dog', 'shiba'], ['cat', 'orange'], ['dog', 'golden'], ['cat', 'ragdoll'], ['dog', 'corgi'], ['cat', 'siamese']]
  const petsOf = () => V.map(([sp, v], i) => ({ id: 'q' + i, species: sp, variant: v, name: 'q' + i, adoptedAt: NOW - 5 * 86400000, heightFactor: 1, weight: 50, satiety: 80, mood: 80, cleanliness: 80, personality: i % 2 ? 'lazy' : 'calm', lastInteract: NOW }))
  const run = (chance) => {
    const keep = BALANCE.picnic.nap.chance
    BALANCE.picnic.nap.chance = chance
    const E = new PixelEngine()
    let sd = 7
    E.rand = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 }
    E.setSize(1920, 902, 1)
    E.setOwned([])
    E.sync(petsOf())
    const calls = []
    E.hooks = Object.fromEntries(Object.entries(E.hooks).map(([k, f]) => [k, (...args) => { calls.push(k + JSON.stringify(args)); return f(...args) }]))
    E.syncPicnic({ startedAt: NOW, until: NOW + 300000, pets: V.map((_, i) => 'q' + i), mat: 0, basket: 1, foods: [0, 1] })
    const fr = (t) => ({ nowMs: NOW + t * 1000, hour: 12, weather: 'sunny', gifts: [] })
    let napSeen = 0, cheerWhileNap = 0, photos = 0
    for (let t = 0; t < 300; t += 0.1) {
      E.update(0.1, fr(t))
      for (const a of E.actors.values()) if (PC.isPicnicNapping(a)) napSeen++
      if (Math.abs(t % 30 - 29.95) < 0.06) {
        const napping = [...E.actors.values()].filter((a) => PC.isPicnicNapping(a)).map((a) => a.id)
        const seated = E.picnicSeated()
        const n2 = E.picnicCheer()
        photos++
        eq(n2, seated, '拍照：回傳坐好的隻數（含睡著的）')
        for (const id of napping) { const a = E.actors.get(id); if (a.action !== 'sleep' || a.picnic.cheer > 0) cheerWhileNap++ }
      }
    }
    BALANCE.picnic.nap.chance = keep
    return { calls, napSeen, cheerWhileNap, photos, statusZ: [...E.actors.values()].every((a) => !PC.isPicnicNapping(a) || E.statusIcon(a, fr(0)) === 'fx_zzz') }
  }
  const withNap = run(1 / 3)
  const noNap = run(0)
  ok(withNap.napSeen > 0, `睡覺開著：有睡（${withNap.napSeen} 個影格）`)
  eq(noNap.napSeen, 0, '睡覺關掉：沒有睡')
  eq(withNap.calls, noNap.calls, `呼叫存檔層 hooks 的紀錄完全相同（${withNap.calls.length} 次）`)
  eq(withNap.cheerWhileNap, 0, `拍照 ${withNap.photos} 次：睡著的不做開心姿勢`)
  ok(withNap.statusZ, '睡著的頭上是 ZZZ')
}

for (const l of report) console.log('  ' + l)
console.log(`通過 D2-2 野餐睡覺：${n} 項`)
