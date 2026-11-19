// v3.8.1 滑鼠互動邏輯／引擎測試（真引擎、素材用 manifest 的尺寸）：6 項互動、既有狀態優先、冷卻、最多 2 隻靠近、游標離開恢復、不改任何數值
import './env-shim.js'
import { readFileSync, readdirSync } from 'node:fs'
const R = (process.env.REPO_ROOT + '/')
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import { assets } from '../../../src/farm/pixel/assets.ts'
import { BALANCE } from '../../../src/farm/config/balance.ts'
import { overrides } from '../../../src/farm/overrides.ts'
import { petBounds, isWalkable } from '../../../src/farm/pixel/layout.ts'
import { isHoverOverride } from '../../../src/farm/pixel/hover.ts'

const DIR = R + 'public/assets/'
const man = JSON.parse(readFileSync(DIR + readdirSync(DIR).find((f) => /^manifest\..*\.json$/.test(f)), 'utf8'))
assets.ready = true
assets.get = (k) => (man.frames[k] ? { ...man.frames[k], img: null, key: k } : null)

let pass = 0, fail = 0
const ok = (label, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', label, extra) } }
const H = BALANCE.hover
const START = new Date(2026, 10, 16, 12, 0, 0).getTime()
let now = START
let hour = 12

const mkPet = (id, species, variant, personality, extra = {}) => ({ id, species, variant, name: id, adoptedAt: START - 5 * 86400000, heightFactor: 1, weight: 50, satiety: 80, mood: 80, cleanliness: 80, lastInteract: START, ...(personality ? { personality } : {}), ...extra })

/** 建一個引擎：defs = [{id, sp, v, pers, x, y}]；寵物放在指定位置、站著不動（idle，duration 很長，不會自己亂走） */
function mk(defs, { hr = 12, W = 1920, Hh = 902 } = {}) {
  hour = hr
  now = START
  const e = new PixelEngine()
  let seed = 4242
  e.rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  e.setSize(W, Hh, 1)
  const calls = { notify: 0, wake: 0, settle: 0, bath: 0, eat: 0, find: 0 }
  e.hooks = { requestBath: () => { calls.bath++; return null }, wake: () => { calls.wake++ }, notify: () => { calls.notify++ }, settlePlay: () => { calls.settle++ }, addFind: () => { calls.find++; return false }, eatAtBowl: () => { calls.eat++; return 'x' } }
  const pets = defs.map((d) => mkPet(d.id, d.sp ?? 'dog', d.v ?? (d.sp === 'cat' ? 'tabby' : 'shiba'), d.pers))
  e.sync(pets)
  e.hover.enabled = true
  const b = petBounds(e.layout)
  defs.forEach((d) => {
    const a = e.actors.get(d.id)
    a.x = d.x ?? (b.x0 + b.x1) / 2; a.y = d.y ?? (b.y0 + b.y1) / 2
    a.tx = a.x; a.ty = a.y; a.action = 'idle'; a.t = 0; a.dur = 1e9; a.animT = 0
  })
  return { e, calls, pets, b }
}
const frame = () => ({ nowMs: now, hour, weather: 'sunny', gifts: [] })
const step = (e, n = 1, dt = 0.016) => { for (let i = 0; i < n; i++) { now += dt * 1000; e.update(dt, frame()) } }
const stepSec = (e, s, dt = 0.016) => step(e, Math.round(s / dt), dt)
const boxOf = (e, id) => { const a = e.actors.get(id); const s = assets.get(`${a.pet.species}_${a.pet.species === 'dog' ? 'shiba' : 'orange'}_stand`); return { a, s } }
const centerOf = (e, id) => { const a = e.actors.get(id); const s = e.actorSprite(a); return { x: a.x, y: a.y - s.h * 0.45, s } }
const hearts = (e) => e.particles.filter((p) => p.key === 'fx_heart').length

// ---------------------------------------------------------------------------------------------
console.log('版面', JSON.stringify({ W: mk([{ id: 'a' }]).e.layout.W, S: mk([{ id: 'a' }]).e.layout.S }), 'petBounds', JSON.stringify(petBounds(mk([{ id: 'a' }]).e.layout)))

// ===== 1 停下來看你 =====
{
  const { e, b } = mk([{ id: 'a', sp: 'dog' }])
  const a = e.actors.get('a')
  const c = centerOf(e, 'a')
  // 60 邏輯像素外：不理
  e.hover.move(a.x + 100, c.y)
  step(e, 5)
  ok('1 look：外框外 100 → 不看', a.hv === null)
  // 進到 60 內（外框右緣 + 40）
  const s = c.s
  const rightEdge = a.x - s.ax + s.w
  e.hover.move(rightEdge + 40, c.y)
  step(e, 3)
  ok('1 look：外框外 40 → 看', a.hv?.kind === 'look' && a.action === 'idle')
  ok('1 look：面向游標（右）', a.facing === 1)
  e.hover.move(a.x - s.ax - 40, c.y)
  step(e, 3)
  ok('1 look：游標換到左邊 → 翻轉面向左', a.facing === -1)
  // 外框外 59／61 的邊界
  e.hover.move(rightEdge + 59, c.y); step(e, 2)
  ok('1 look：外框外 59（在 60 內）→ 看', a.hv?.kind === 'look')
  e.hover.move(rightEdge + 61, c.y); step(e, 2)
  ok('1 look：外框外 61 → 還在（離開計時中，0.6 秒內）', a.hv?.kind === 'look')
  stepSec(e, 0.7)
  ok('1 look：離開範圍 0.7 秒 → 恢復（< 1 秒）', a.hv === null)
  // 走路中被攔住
  a.action = 'walk'; a.tx = a.x + 200; a.ty = a.y; a.t = 0; a.dur = 1e9
  const x0 = a.x
  e.hover.move(a.x + s.w, c.y)
  stepSec(e, 1)
  ok('1 look：走路中進入範圍 → 停下（位置不動、站姿）', a.hv?.kind === 'look' && a.action === 'idle' && Math.abs(a.x - x0) < 0.5, `x ${x0}→${a.x} ${a.action}`)
  // 游標離開畫布：立即恢復
  e.cursorLeave()
  step(e, 1)
  ok('1 look：游標離開畫布 → 立即解除', a.hv === null)
  // 坐著的 → 站起來看
  e.hover.move(a.x + s.w, c.y); a.action = 'sit'; a.t = 0; a.dur = 1e9
  step(e, 2)
  ok('1 look：坐著 → 站姿看', a.hv?.kind === 'look' && a.action === 'idle')
  void b
}

// ===== 既有狀態優先：不回應 =====
function setupState(name) {
  const hr = name === 'sleep' ? 2 : 12
  const defs = [{ id: 'a', sp: name === 'hunt' ? 'cat' : 'dog', pers: name === 'timid' ? 'timid' : undefined }]
  const m = mk(defs, { hr })
  const { e } = m
  const a = e.actors.get('a')
  const pick = {
    sleep: () => { step(e, 3) },
    eat: () => { a.override = { action: 'eat', left: 1e6, speedMul: 0, tag: 'eat' } },
    play: () => { e.beginPlay('a', 'ball') },
    dig: () => { e.beginPlay('a', 'dig') },
    hunt: () => { e.beginPlay('a', 'hunt') },
    bathwalk: () => { e.sendToBath('a') },
    drag: () => { const p = e.cssOf(a.x, a.y - 10); e.beginDrag('a', p.x, p.y) },
    menu: () => { e.selectedId = 'a' },
    pet: () => { a.override = { action: 'happy', left: 1e6, speedMul: 0, tag: 'pet' } },
    groom: () => { a.override = { action: 'groom', left: 1e6, speedMul: 0, tag: 'groom' } },
  }
  pick[name]?.()
  return m
}
for (const name of ['sleep', 'eat', 'play', 'dig', 'hunt', 'bathwalk', 'drag', 'menu', 'pet', 'groom']) {
  overrides.hover.swatChance = 1
  const { e, calls } = setupState(name)
  const a = e.actors.get('a')
  const before = JSON.stringify(a.pet)
  const actionBefore = a.action, ovBefore = a.override?.tag ?? null
  const c = centerOf(e, 'a')
  // 游標壓在寵物身上來回掃（摸頭）＋快速掃過（貓拍狗吠）
  let x = a.x
  for (let i = 0; i < 150; i++) {
    x += (Math.floor(i / 3) % 2 ? 1 : -1) * 6
    const p = e.actors.get('a')
    e.hover.move(p.x + Math.max(-8, Math.min(8, x - a.x)), c.y)
    step(e, 1)
  }
  for (let i = 0; i < 40; i++) { e.hover.move(a.x - 30 + i * 2, c.y); step(e, 1) }
  const h = a.hv
  ok(`狀態 ${name}：沒有看／靠近／閃開`, h === null, `hv=${h?.kind}`)
  ok(`狀態 ${name}：沒有摸頭／貓拍狗吠的短動作`, !isHoverOverride(a))
  if (!['pet', 'groom'].includes(name)) ok(`狀態 ${name}：沒有愛心粒子（摸頭沒反應）`, hearts(e) === 0, `${hearts(e)}`)
  ok(`狀態 ${name}：存檔寵物物件沒被改`, JSON.stringify(a.pet) === before)
  if (['eat', 'pet', 'groom'].includes(name)) ok(`狀態 ${name}：指令動作照常（${ovBefore}）`, a.override?.tag === ovBefore || a.override === null)
  if (name === 'sleep') ok('狀態 sleep：還在睡', a.action === 'sleep', a.action)
  if (name === 'menu') ok('狀態 menu：選單開著，名字標籤不顯示', e.hover.labelId() === null)
  if (name === 'drag') ok('狀態 drag：被拖曳，名字標籤不顯示', e.hover.labelId() === null)
  ok(`狀態 ${name}：沒有碰到任何存檔相關的 hook`, calls.notify + calls.wake + calls.settle + calls.eat === 0 || name === 'play' || name === 'dig' || name === 'hunt' || name === 'bathwalk' || name === 'drag', JSON.stringify(calls))
  void actionBefore
}
overrides.hover.swatChance = null

// 野餐中：只有愛心與標籤，沒有姿勢改變、沒有看／靠近／閃開／拍吠
{
  const { e } = mk([{ id: 'a', sp: 'dog', pers: 'clingy' }, { id: 'b', sp: 'cat', pers: 'timid' }])
  e.syncPicnic({ startedAt: 1, until: now + 3e5, pets: ['a', 'b'], mat: 0, basket: 0, foods: [0] })
  stepSec(e, 15) // 墊子落地、走到座位
  const a = e.actors.get('a')
  ok('野餐：寵物在野餐中', !!a.picnic)
  const posBefore = { x: a.x, y: a.y }
  const c = centerOf(e, 'a')
  overrides.hover.swatChance = 1
  let x = a.x, hmax = 0
  for (let i = 0; i < 120; i++) { x += (Math.floor(i / 3) % 2 ? 1 : -1) * 5; e.hover.move(a.x + Math.max(-8, Math.min(8, x - a.x)), c.y); step(e, 1); hmax = Math.max(hmax, hearts(e)) }
  ok('野餐：摸頭有愛心（1～2 個）', hmax >= 1 && hmax <= 2, `${hmax}`)
  ok('野餐：沒有 hv、沒有短動作、沒被推離座位', a.hv === null && !isHoverOverride(a) && Math.hypot(a.x - posBefore.x, a.y - posBefore.y) < 3)
  e.hover.move(a.x, c.y); stepSec(e, 0.7)
  ok('野餐：名字標籤可以顯示', e.hover.labelId() === 'a' || e.hover.labelId() === 'b')
  overrides.hover.swatChance = null
}

// ===== 3 膽小閃開 =====
{
  const { e, b } = mk([{ id: 't', sp: 'cat', pers: 'timid', x: 320, y: 200 }, { id: 'n', sp: 'dog', x: 520, y: 200 }])
  const a = e.actors.get('t')
  const c = centerOf(e, 't')
  const startX = a.x
  // 慢慢接近（60 邏輯像素/秒 < 門檻 140）：不閃
  let cx = startX + 220
  for (let i = 0; i < 160; i++) { cx -= 0.96; e.hover.move(cx, c.y); step(e, 1) }
  ok('3 retreat：慢慢接近不閃（60 px/s）', a.hv?.kind !== 'retreat')
  e.cursorLeave(); step(e, 2)
  // 快速接近（≈ 330 px/s）：進入 80 內 → 閃
  cx = startX + 260
  let hit = -1
  for (let i = 0; i < 120 && hit < 0; i++) { cx -= 5.3; e.hover.move(cx, c.y); step(e, 1); if (a.hv?.kind === 'retreat') hit = i }
  ok('3 retreat：快速接近 → 閃開', a.hv?.kind === 'retreat', `cx=${cx}`)
  const s = c.s
  const edge = a.x - s.ax + s.w
  ok('3 retreat：觸發時游標離外框 ≤ 80', cx - edge <= 80 + 6, `${cx - edge}`)
  const x0 = a.x, y0 = a.y
  stepSec(e, 3)
  const moved = Math.hypot(a.x - x0, a.y - y0)
  ok('3 retreat：往遠離游標的方向（左）退開約 60', a.x < x0 && moved > 45 && moved < 75, `moved ${moved.toFixed(1)}`)
  ok('3 retreat：退完解除、站在可走的位置、沒出範圍', a.hv === null && isWalkable(e.layout, a.x, a.y) && a.x >= b.x0 && a.x <= b.x1 && a.y >= b.y0 && a.y <= b.y1)
  // 冷卻 10 秒：馬上再來一次 → 不閃
  e.hover.move(a.x + 300, c.y); stepSec(e, 0.2)
  cx = a.x + 240
  for (let i = 0; i < 60; i++) { cx -= 5.3; e.hover.move(cx, c.y); step(e, 1) }
  ok('3 retreat：冷卻中（10 秒內）不閃', a.hv?.kind !== 'retreat')
  e.cursorLeave(); stepSec(e, 11)
  cx = a.x + 260
  e.hover.move(cx, c.y); step(e, 2)
  let again = false
  for (let i = 0; i < 80 && !again; i++) { cx -= 5.3; e.hover.move(cx, c.y); step(e, 1); again = a.hv?.kind === 'retreat' }
  ok('3 retreat：冷卻過了（> 10 秒）再閃', again)
  // 不是膽小的：同樣的快速接近不閃
  const n = e.actors.get('n'), nc = centerOf(e, 'n')
  let cx2 = n.x + 260, nHit = false
  for (let i = 0; i < 80; i++) { cx2 -= 5.3; e.hover.move(cx2, nc.y); step(e, 1); if (n.hv?.kind === 'retreat') nHit = true }
  ok('3 retreat：非膽小的狗不閃', !nHit)
  // 被牆擋住（退不開）→ 不閃也不卡
  const { e: e2, b: b2 } = mk([{ id: 't', sp: 'cat', pers: 'timid', x: petBounds(mk([{ id: 'z' }]).e.layout).x0 + 2, y: 200 }])
  const a2 = e2.actors.get('t'); const c2 = centerOf(e2, 't')
  let cx3 = a2.x - 0 + 200, ret = false
  for (let i = 0; i < 80; i++) { cx3 -= 5.3; e2.hover.move(cx3, c2.y); step(e2, 1); if (a2.hv?.kind === 'retreat') ret = true }
  stepSec(e2, 4)
  ok('3 retreat：貼著左牆被逼近 → 沿牆滑開也不出範圍，最後會解除、沒卡住', a2.hv === null && a2.x >= b2.x0 - 0.5 && a2.y >= b2.y0 - 0.5 && a2.y <= b2.y1 + 0.5 && isWalkable(e2.layout, a2.x, a2.y), `x=${a2.x} y=${a2.y} ret=${ret} hv=${a2.hv?.kind}`)
}

// ===== 2 黏人靠近 =====
{
  const { e, b } = mk([
    { id: 'c1', sp: 'dog', pers: 'clingy', x: 200, y: 190 }, { id: 'c2', sp: 'cat', pers: 'clingy', x: 280, y: 215 }, { id: 'c3', sp: 'dog', pers: 'clingy', v: 'corgi', x: 160, y: 235 },
    { id: 'o', sp: 'dog', pers: 'lively', x: 240, y: 240 },
  ])
  const cur = { x: 400, y: 205 }
  e.hover.move(cur.x, cur.y)
  stepSec(e, 1.8)
  ok('2 approach：停留 1.8 秒還沒開始', ['c1', 'c2', 'c3'].every((id) => e.actors.get(id).hv?.kind !== 'approach'))
  stepSec(e, 0.4)
  const act = ['c1', 'c2', 'c3'].filter((id) => e.actors.get(id).hv?.kind === 'approach')
  ok('2 approach：停留超過 2 秒 → 開始；同時最多 2 隻', act.length === 2, JSON.stringify(act))
  ok('2 approach：只有黏人的', !e.actors.get('o').hv || e.actors.get('o').hv.kind === 'look')
  stepSec(e, 20)
  for (const id of act) {
    const c = centerOf(e, id)
    const d = Math.hypot(cur.x - c.x, cur.y - c.y)
    ok(`2 approach：${id} 走到離游標約 40 處停下（${d.toFixed(1)}）`, d > 30 && d < 52 && e.actors.get(id).hv?.arrived === true && e.actors.get(id).action === 'idle')
  }
  ok('2 approach：第 3 隻還在原本的位置附近（名額滿了）', Math.hypot(e.actors.get('c3').x - 213, e.actors.get('c3').y - 235) < 60 || e.actors.get('c3').hv?.kind === 'approach')
  // 游標移開（草地內，離寵物 > 100）：3 秒後恢復
  const far = { x: cur.x + 130, y: cur.y }
  e.hover.move(far.x, far.y)
  stepSec(e, 2.6)
  ok('2 approach：移開 2.6 秒還沒恢復', act.every((id) => e.actors.get(id).hv?.kind === 'approach'))
  stepSec(e, 0.6)
  ok('2 approach：移開 3 秒後恢復', act.every((id) => e.actors.get(id).hv === null))
  // 冷卻 30 秒：游標再回去停留 → 剛結束的 2 隻不再靠近（輪到第 3 隻）
  e.hover.move(cur.x, cur.y)
  stepSec(e, 3)
  const again1 = act.filter((id) => e.actors.get(id).hv?.kind === 'approach')
  ok('2 approach：剛結束的 2 隻冷卻中不再來', again1.length === 0 || again1.every((id) => !act.includes(id)), JSON.stringify(again1))
  stepSec(e, 30)
  const again2 = ['c1', 'c2', 'c3'].filter((id) => e.actors.get(id).hv?.kind === 'approach')
  ok('2 approach：冷卻過了（30 秒）可以再來', again2.length >= 1, JSON.stringify(again2))
  // 游標在草地外（天上）：不靠近
  const { e: e3 } = mk([{ id: 'c1', sp: 'dog', pers: 'clingy', x: 200, y: 200 }])
  e3.hover.move(300, 5)
  stepSec(e3, 4)
  ok('2 approach：游標在草地範圍外（天空）不靠近', e3.actors.get('c1').hv?.kind !== 'approach')
  void b
}

// ===== 4 摸頭 =====
{
  const { e, calls } = mk([{ id: 'a', sp: 'dog' }, { id: 'b', sp: 'cat' }])
  const a = e.actors.get('a')
  const c = centerOf(e, 'a')
  const before = JSON.stringify(a.pet)
  const zig = (e, id, amp, every, frames, cy) => { const p = e.actors.get(id); let k = 0; for (let i = 0; i < frames; i++) { if (i % every === 0) k++; e.hover.move(p.x + (k % 2 ? amp : -amp), cy); step(e, 1) } }
  zig(e, 'a', 5, 6, 30, c.y) // 每 6 影格（≈0.1 秒）一次反轉 × 30 影格 ≈ 5 次
  ok('4 pat：1.5 秒內來回 ≥ 4 次 → 開心姿勢＋愛心', a.override?.tag === 'hpat' && a.action === 'happy' && hearts(e) >= 1 && hearts(e) <= 2, `${a.override?.tag} ${a.action} hearts=${hearts(e)}`)
  stepSec(e, 1.4)
  ok('4 pat：約 1.2 秒後恢復', !a.override && a.action !== 'happy' || a.action === 'idle', `${a.override?.tag} ${a.action}`)
  ok('4 pat：不改任何數值', JSON.stringify(a.pet) === before && calls.notify + calls.wake + calls.settle === 0)
  // 冷卻 3 秒
  e.hover.move(a.x, c.y); step(e, 2)
  const h0 = hearts(e)
  zig(e, 'a', 5, 6, 30, c.y)
  ok('4 pat：冷卻中（3 秒內）不再冒', !a.override || a.override.tag !== 'hpat' || hearts(e) === h0)
  stepSec(e, 3.3)
  zig(e, 'a', 5, 6, 30, c.y)
  ok('4 pat：冷卻過了再摸頭', a.override?.tag === 'hpat')
  // 反轉不夠：3 次
  const { e: e2 } = mk([{ id: 'a', sp: 'dog' }])
  const a2 = e2.actors.get('a'); const c2 = centerOf(e2, 'a')
  zig(e2, 'a', 5, 10, 24, c2.y) // 約 2 次反轉
  ok('4 pat：反轉太少 → 不觸發', !a2.override)
  // 抖動 < 2 邏輯像素：不算
  const { e: e3 } = mk([{ id: 'a', sp: 'dog' }])
  const a3 = e3.actors.get('a'); const c3 = centerOf(e3, 'a')
  for (let i = 0; i < 100; i++) { e3.hover.move(a3.x + (i % 2 ? 0.8 : -0.8), c3.y); step(e3, 1) }
  ok('4 pat：抖動小於 2 像素不算', !a3.override)
  // 慢慢來回：超過 1.5 秒窗口 → 不觸發
  const { e: e4 } = mk([{ id: 'a', sp: 'dog' }])
  const a4 = e4.actors.get('a'); const c4 = centerOf(e4, 'a')
  zig(e4, 'a', 5, 40, 160, c4.y) // 每 0.64 秒一次反轉 → 1.5 秒內 ≤ 3 次
  ok('4 pat：太慢（1.5 秒內不到 4 次）→ 不觸發', !a4.override)
  // 來回但不在寵物身上：不觸發
  const { e: e5 } = mk([{ id: 'a', sp: 'dog' }])
  const a5 = e5.actors.get('a'); const c5 = centerOf(e5, 'a')
  zig(e5, 'a', 5, 6, 40, c5.y - 80) // 在頭上很高的地方
  ok('4 pat：游標不在寵物身上 → 不觸發', !a5.override)
  // 愛心 1 或 2 個（隨機，兩種都出現）
  const counts = new Set()
  for (let k = 0; k < 30; k++) { const { e: e6 } = mk([{ id: 'a', sp: 'dog' }]); const a6 = e6.actors.get('a'); const c6 = centerOf(e6, 'a'); zig(e6, 'a', 5, 6, 30, c6.y); counts.add(hearts(e6)); e6.rand = (() => { let s = k * 7919 + 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } })(); void a6 }
  ok('4 pat：愛心只有 1 或 2 個', [...counts].every((n) => n === 1 || n === 2), JSON.stringify([...counts]))
}

// ===== 5 名字標籤 =====
{
  const { e } = mk([{ id: 'a', sp: 'dog' }])
  const a = e.actors.get('a'); const c = centerOf(e, 'a')
  e.hover.move(a.x, c.y)
  stepSec(e, 0.4)
  ok('5 label：停 0.4 秒 → 還沒', e.hover.labelId() === null)
  stepSec(e, 0.15)
  ok('5 label：停 0.55 秒 → 浮出', e.hover.labelId() === 'a')
  e.hover.move(a.x + 200, c.y); step(e, 1)
  ok('5 label：游標移開 → 立刻消失', e.hover.labelId() === null)
  e.hover.move(a.x, c.y); stepSec(e, 0.6)
  ok('5 label：再停 → 又浮出', e.hover.labelId() === 'a')
  e.selectedId = 'a'; step(e, 1)
  ok('5 label：開選單 → 立刻消失', e.hover.labelId() === null)
  e.selectedId = null; e.hover.move(a.x, c.y); stepSec(e, 0.6)
  ok('5 label：關選單後再停才會浮出', e.hover.labelId() === 'a')
  const p = e.cssOf(a.x, a.y - 10); e.beginDrag('a', p.x, p.y); step(e, 1)
  ok('5 label：拖曳 → 立刻消失', e.hover.labelId() === null)
  e.hover.blocked = true; step(e, 1)
  ok('5 label：blocked（開視窗）→ 沒有', e.hover.labelId() === null)
}

// ===== 6 貓拍、狗吠 =====
{
  overrides.hover.swatChance = 1
  for (const sp of ['cat', 'dog']) {
    const { e } = mk([{ id: 'a', sp }])
    const a = e.actors.get('a'); const c = centerOf(e, 'a'); const s = c.s
    const sweep = (px) => { for (let i = 0; i < 20; i++) { e.hover.move(a.x - s.w + i * px, c.y); step(e, 1) } }
    sweep(2) // 125 px/s：太慢
    ok(`6 swat(${sp})：慢速掃過不觸發`, !a.override)
    e.cursorLeave(); step(e, 1); e.hover.move(a.x - 80, c.y); stepSec(e, 0.3)
    sweep(7) // ≈ 440 px/s
    const want = sp === 'cat' ? 'swat' : 'bark'
    ok(`6 swat(${sp})：快速掃過 → ${want}`, a.override?.tag === 'hswat' && a.action === want, `${a.override?.tag} ${a.action}`)
    stepSec(e, 0.7)
    ok(`6 swat(${sp})：約 0.6 秒後恢復`, !a.override && a.action !== want, `${a.override?.tag} ${a.action}`)
    // 冷卻 20 秒
    e.cursorLeave(); step(e, 1); e.hover.move(a.x - 80, c.y); stepSec(e, 0.3)
    sweep(7)
    ok(`6 swat(${sp})：冷卻中（20 秒）不再演`, !a.override)
    stepSec(e, 20)
    e.cursorLeave(); step(e, 1); e.hover.move(a.x - 80, c.y); stepSec(e, 0.3)
    sweep(7)
    ok(`6 swat(${sp})：冷卻過了再演`, a.override?.tag === 'hswat')
    ok(`6 swat(${sp})：frame 存在（${sp === 'cat' ? 'cat_orange_swat' : 'dog_shiba_bark'}）`, !!assets.get(sp === 'cat' ? 'cat_tabby_swat' : 'dog_shiba_bark') || !!assets.get(sp === 'cat' ? 'cat_orange_swat' : 'dog_shiba_bark'))
  }
  // 機率 30%：跑很多次（每次重設冷卻）
  overrides.hover.swatChance = null
  const { e } = mk([{ id: 'a', sp: 'cat' }])
  const a = e.actors.get('a'); const c = centerOf(e, 'a'); const s = c.s
  let hits = 0, N = 1000
  for (let k = 0; k < N; k++) {
    e.hover.cd.clear(); a.override = null; a.action = 'idle'; a.hv = null
    e.cursorLeave(); step(e, 1)
    e.hover.move(a.x - s.w, c.y); stepSec(e, 0.3)
    for (let i = 0; i < 12; i++) { e.hover.move(a.x - s.w + i * 7, c.y); step(e, 1) }
    if (a.override?.tag === 'hswat') hits++
  }
  ok(`6 swat：預設機率約 30%（${hits}/${N}）`, hits > 0.25 * N && hits < 0.35 * N)
  // 游標速度忽快忽慢（快 6 影格、慢 4 影格、再快 6 影格）：一次掃過仍然只抽一次 → 命中率仍約 30%（不是 1−0.7²≈51%）
  let hitsJ = 0
  for (let k = 0; k < N; k++) {
    e.hover.cd.clear(); e.hover.fastOn.clear(); a.override = null; a.action = 'idle'; a.hv = null
    e.cursorLeave(); step(e, 1)
    let px = a.x - s.w
    e.hover.move(px, c.y); stepSec(e, 0.3)
    for (let i = 0; i < 6; i++) { px += 7; e.hover.move(px, c.y); step(e, 1) }
    for (let i = 0; i < 4; i++) { px += 1; e.hover.move(px, c.y); step(e, 1) }
    for (let i = 0; i < 6; i++) { px += 7; e.hover.move(px, c.y); step(e, 1) }
    if (a.override?.tag === 'hswat') hitsJ++
  }
  ok(`6 swat：速度忽快忽慢的一次掃過仍只抽一次（${hitsJ}/${N}，應約 30%）`, hitsJ > 0.25 * N && hitsJ < 0.36 * N)
  // 離開範圍的游標 → 0 機率
  overrides.hover.swatChance = 0
  a.override = null; e.hover.cd.clear(); e.cursorLeave(); step(e, 1); e.hover.move(a.x - s.w, c.y); stepSec(e, 0.3)
  for (let i = 0; i < 12; i++) { e.hover.move(a.x - s.w + i * 7, c.y); step(e, 1) }
  ok('6 swat：機率覆寫 0 → 不演', !a.override)
  overrides.hover.swatChance = null
}

// ===== 啟用條件、擋住、單項關閉 =====
{
  const { e } = mk([{ id: 'a', sp: 'dog', pers: 'clingy' }])
  const a = e.actors.get('a'); const c = centerOf(e, 'a')
  e.hover.enabled = false
  e.hover.move(a.x, c.y); stepSec(e, 3)
  ok('hover 不啟用（手機、平板）：完全沒有反應', a.hv === null && !a.override && e.hover.labelId() === null)
  e.hover.enabled = true; e.hover.move(a.x, c.y); stepSec(e, 0.3)
  ok('啟用後立刻有反應', a.hv?.kind === 'look')
  e.hover.blocked = true; step(e, 1)
  ok('blocked（開視窗、對話框）→ 立即解除', a.hv === null)
  e.hover.blocked = false; e.hover.move(a.x, c.y); stepSec(e, 0.3)
  ok('解除 blocked 後恢復反應', a.hv?.kind === 'look')
  for (const [k, probe] of Object.entries({
    look: () => a.hv?.kind === 'look',
    label: () => e.hover.labelId() === 'a',
  })) {
    e.cursorLeave(); step(e, 1)
    overrides.hover.off[k] = true
    e.hover.move(a.x, c.y); stepSec(e, 0.8)
    ok(`覆寫：關掉 ${k} 就沒有 ${k}`, !probe())
    overrides.hover.off[k] = false
  }
  e.cursorLeave(); step(e, 1)
  e.hover.move(a.x, c.y); stepSec(e, 0.8)
  ok('覆寫還原後恢復', a.hv?.kind === 'look' && e.hover.labelId() === 'a')
}

// ===== 既有行為：沒有游標時，引擎與 v3.8.0 一樣（寵物自己走、睡覺、不被 hover 影響） =====
{
  const { e } = mk([{ id: 'a', sp: 'dog' }, { id: 'b', sp: 'cat' }])
  for (const a of e.actors.values()) a.dur = 1
  stepSec(e, 60)
  ok('沒有游標：寵物照常走動（位置有變）', [...e.actors.values()].some((a) => Math.hypot(a.x - (petBounds(e.layout).x0 + petBounds(e.layout).x1) / 2, a.y - (petBounds(e.layout).y0 + petBounds(e.layout).y1) / 2) > 5))
  ok('沒有游標：沒有 hv、沒有短動作', [...e.actors.values()].every((a) => !a.hv && !isHoverOverride(a)))
}

console.log(`v3.8.1 滑鼠互動邏輯／引擎測試 ${pass} 項通過，${fail} 項失敗`)
if (fail) process.exit(1)
