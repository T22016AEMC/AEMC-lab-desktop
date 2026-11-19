// D1 名字標籤與頭上圖示、摸頭愛心（瀏覽器）
// 同一個影格狀態各畫一次「有標籤」與「沒有標籤」（引擎的 render），比對差異：
// - 標籤（差異區）不蓋到頭上圖示（餓＝驚嘆號、髒＝泡泡、心情差＝汗滴、睡覺＝ZZZ、開心＝愛心）
// - 摸頭的愛心在標籤之上再畫一次（關掉「再畫一次」時差異只在愛心上）
// - 沒有標籤時畫面不受影響（t1c 與 v3.9.1 逐像素比對另外跑）
// 截圖：真的用滑鼠停在寵物上，標籤與各種圖示並存
import { launch, open, ok, fails, save, pet, sleep, SHOTS, T0 } from './lib.mjs'
import { mkdirSync } from 'node:fs'
mkdirSync(SHOTS, { recursive: true })

const b = await launch()
const pets = [
  pet('h1', 'dog', 'shiba', { satiety: 10, name: '餓餓' }),
  pet('h2', 'cat', 'tabby', { cleanliness: 10, name: '髒髒' }),
  pet('h3', 'dog', 'golden', { mood: 10, name: '憂鬱' }),
  pet('h4', 'cat', 'calico', { mood: 99, name: '開心' }),
]
const ID = { 餓餓: 'h1', 髒髒: 'h2', 憂鬱: 'h3', 開心: 'h4' }
const { page, errors } = await open(b, save({ pets, ownedBuildings: [], nextPetId: 9 }), { w: 1920, h: 988 })
// 關掉會讓寵物走動的滑鼠互動（看、靠近、退開），只留標籤與摸頭
await page.evaluate(() => { const o = window.__overrides.hover.off; o.look = true; o.approach = true; o.retreat = true; o.swat = true })

// 在頁面裡：把寵物固定在指定位置，畫兩次（有／沒有標籤），回傳差異與圖示外框（都換成畫布像素）
const compare = (id, opts = {}) => page.evaluate(([id, opts]) => {
  const E = window.__farm
  const a = E.actors.get(id)
  const L = E.layout
  const c = document.createElement('canvas')
  c.width = L.backW
  c.height = L.backH
  const ctx = c.getContext('2d', { willReadFrequently: true })
  const H = E.hover
  const saved = { labelId: H.labelId, enabled: H.enabled, blocked: H.blocked, own: E.drawOwnedParticles }
  H.enabled = true
  H.blocked = false
  // 每次都用一張新畫布（同一張畫布連畫時，上一次 render 留下的畫布狀態會影響下一次）
  const shot = (label, owned = true) => {
    H.labelId = () => (label ? id : null)
    if (!owned) E.drawOwnedParticles = () => {}
    const cc = document.createElement('canvas')
    cc.width = c.width
    cc.height = c.height
    const g = cc.getContext('2d', { willReadFrequently: true })
    E.render(g)
    E.drawOwnedParticles = saved.own
    return g.getImageData(0, 0, c.width, c.height).data
  }
  const A = shot(false)
  let B = shot(true)
  let C = null
  let planted = null
  if (opts.hearts) {
    // 在標籤正中放一顆屬於這隻的愛心（真的摸頭產生的愛心不一定剛好在標籤底下）
    const lb = (() => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let i = 0; i < A.length; i += 4) { if (A[i] === B[i] && A[i + 1] === B[i + 1] && A[i + 2] === B[i + 2]) continue; const q = i / 4, x = q % c.width, y = Math.floor(q / c.width); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) } return { x0, y0, x1, y1 } })()
    planted = { key: 'fx_heart', x: Math.round(((lb.x0 + lb.x1) / 2 - L.ox) / L.S), y: Math.round(((lb.y0 + lb.y1) / 2 - L.offsetY) / L.S) + 7, vx: 0, vy: 0, life: 0, max: 5, owner: id }
    E.particles.push(planted)
    B = shot(true)
    C = shot(true, false)
    E.particles.splice(E.particles.indexOf(planted), 1)
  }
  Object.assign(H, { labelId: saved.labelId, enabled: saved.enabled, blocked: saved.blocked })
  const toPx = (r) => ({ x0: Math.floor(L.ox + r.x0 * L.S), y0: Math.floor(L.offsetY + r.y0 * L.S), x1: Math.ceil(L.ox + r.x1 * L.S), y1: Math.ceil(L.offsetY + r.y1 * L.S) })
  const diffBox = (P, Q) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0
    for (let i = 0; i < P.length; i += 4) {
      if (P[i] === Q[i] && P[i + 1] === Q[i + 1] && P[i + 2] === Q[i + 2] && P[i + 3] === Q[i + 3]) continue
      const p = i / 4, x = p % c.width, y = Math.floor(p / c.width)
      n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1)
    }
    return n ? { x0, y0, x1, y1, n } : null
  }
  const icon = E.statusIconRect(a)
  const key = E.statusIcon(a, E.lastFrame)
  return {
    key,
    icon: icon ? toPx(icon) : null,
    label: diffBox(A, B),
    hearts: C ? diffBox(C, B) : null,
    heartsOutside: C ? (() => {
      // 每個差異像素都要在某一顆（屬於這隻的）愛心的素材範圍內
      const boxes = [...E.particles.filter((p) => p.owner === id), planted].map((p) => { const s = { w: 16, h: 15, ax: 8, ay: 15 }; return toPx({ x0: Math.round(p.x) - s.ax, y0: Math.round(p.y) - s.ay, x1: Math.round(p.x) - s.ax + s.w, y1: Math.round(p.y) - s.ay + s.h }) })
      let out = 0
      for (let i = 0; i < B.length; i += 4) {
        if (B[i] === C[i] && B[i + 1] === C[i + 1] && B[i + 2] === C[i + 2] && B[i + 3] === C[i + 3]) continue
        const q = i / 4, x = q % c.width, y = Math.floor(q / c.width)
        if (!boxes.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)) out++
      }
      return out
    })() : null,
    heartBoxes: E.particles.filter((p) => p.owner === id).map((p) => { const s = 14; return toPx({ x0: p.x - s, y0: p.y - s - 2, x1: p.x + s, y1: p.y + s }) }),
    ownedCount: E.particles.filter((p) => p.owner === id).length,
  }
}, [id, opts])
const overlap = (a, b) => a && b && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

// 讓寵物站好（停在原地，方便截圖）
const hold = (id) => page.evaluate((id) => { const a = window.__farm.actors.get(id); a.tx = a.x; a.ty = a.y; a.path = []; a.seek = null }, id)
const cursorOn = async (id) => {
  const p = await page.evaluate((id) => {
    const E = window.__farm
    const a = E.actors.get(id)
    const s = E.actorSprite(a)
    const q = E.cssOf(a.x, a.y - Math.round(s.h / 2))
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { x: r.left + q.x, y: r.top + q.y }
  }, id)
  await page.mouse.move(p.x, p.y)
  return p
}

// ---- 1. 白天：餓、髒、心情差、開心（愛心有時候才出現：心情 ≥ 92 每 9 秒 3 秒） ----
await sleep(1500)
for (const id of ['h1', 'h2', 'h3', 'h4']) {
  const nm = Object.keys(ID).find((k) => ID[k] === id)
  let r = null
  for (let k = 0; k < 40; k++) {
    await hold(id)
    r = await compare(id)
    if (r.key) break
    await sleep(250)
  }
  ok(!!r.key && !!r.label, `${nm}：有頭上圖示（${r.key}）也有標籤`)
  ok(!overlap(r.label, r.icon), `${nm}：標籤（${JSON.stringify(r.label)}）不蓋到圖示（${JSON.stringify(r.icon)}）`)
  ok(r.label && r.icon && r.label.y1 <= r.icon.y0 + 1, `${nm}：標籤在圖示上方`)
}
// 截圖：真的用滑鼠停在「餓餓」上
await hold('h1')
const c1 = await cursorOn('h1')
await sleep(900)
await page.screenshot({ path: SHOTS + 'td1-label-hungry.png', clip: { x: c1.x - 120, y: c1.y - 200, width: 240, height: 250 } })
await cursorOn('h2'); await sleep(900)
const c2 = await cursorOn('h2')
await page.screenshot({ path: SHOTS + 'td1-label-dirty.png', clip: { x: c2.x - 120, y: c2.y - 200, width: 240, height: 250 } })

// ---- 2. 摸頭愛心：滑鼠在寵物上左右來回 → 愛心有記下寵物、在標籤之上再畫一次 ----
let hearts = null
for (let tries = 0; tries < 12 && !(hearts && hearts.ownedCount > 0); tries++) {
  await hold('h4')
  await page.evaluate(() => { const a = window.__farm.actors.get('h4'); a.override = null; a.action = 'idle' })
  const c = await cursorOn('h4')
  for (let i = 0; i < 12; i++) { await page.mouse.move(c.x + (i % 2 ? 9 : -9), c.y); await sleep(50) }
  hearts = await compare('h4', { hearts: true })
  if (!hearts.ownedCount) await sleep(3200) // 摸頭冷卻 3 秒
}
ok(hearts.ownedCount > 0, `摸頭：愛心記下是哪隻寵物（${hearts.ownedCount} 個）`)
ok(!!hearts.hearts, `標籤正中的愛心畫在標籤之上：有差異（${JSON.stringify(hearts.hearts)}）`)
ok(hearts.heartsOutside === 0, `再畫一次的差異都在愛心的範圍內（範圍外 ${hearts.heartsOutside} 像素；愛心 ${JSON.stringify(hearts.heartBoxes)}）`)
await page.screenshot({ path: SHOTS + 'td1-label-hearts.png', clip: { x: Math.max(0, (await cursorOn('h4')).x - 120), y: Math.max(0, (await cursorOn("h4")).y - 200), width: 240, height: 250 } })

// ---- 3. 夜晚睡覺：ZZZ ----
await page.mouse.move(5, 500)
await page.evaluate(() => { window.__overrides.hour = 2 })
let z = null
for (let k = 0; k < 60; k++) {
  await sleep(500)
  z = await compare('h1')
  if (z.key === 'fx_zzz') break
}
ok(z.key === 'fx_zzz', `夜晚：頭上是 ZZZ（${z.key}）`)
ok(!!z.label && !overlap(z.label, z.icon), `ZZZ：標籤不蓋到圖示（標籤 ${JSON.stringify(z.label)}、圖示 ${JSON.stringify(z.icon)}）`)
const c3 = await cursorOn('h1')
await sleep(900)
await page.screenshot({ path: SHOTS + 'td1-label-zzz.png', clip: { x: c3.x - 120, y: c3.y - 200, width: 240, height: 250 } })

ok(errors.length === 0, '沒有頁面錯誤 ' + errors.join(' | '))
await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : '全部通過')
process.exit(fails() ? 1 : 0)
