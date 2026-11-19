// D3 貓揮爪弧線（瀏覽器）：6 色貓在同一個影格狀態下，各畫一次「揮爪中」與「揮爪但不是 hswat（沒有弧線）」，
// 差異只有弧線的點、顏色是兩種黃、位置在爪子前方；往左時水平鏡像；0.05 秒與 0.45 秒沒有弧線；
// 真的用滑鼠快速掃過貓（swatChance = 1）會揮爪。截圖：6 色貓的弧線（放大）
import { launch, open, ok, fails, save, pet, sleep, SHOTS } from './lib.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync(SHOTS, { recursive: true })

const COLORS = ['black', 'bluecat', 'calico', 'orange', 'ragdoll', 'siamese']
const b = await launch()
const VARIANT = { black: 'black', bluecat: 'britishblue', calico: 'calico', orange: 'tabby', ragdoll: 'ragdoll', siamese: 'siamese' }
const pets = COLORS.map((c, i) => pet('c' + i, 'cat', VARIANT[c], { name: c }))
const { page, errors } = await open(b, save({ pets, ownedBuildings: [], nextPetId: 9 }), { w: 1920, h: 988 })
await page.evaluate(() => { const o = window.__overrides.hover.off; o.look = true; o.approach = true; o.retreat = true; o.pat = true; o.label = true })
await sleep(1000)

const res = await page.evaluate((COLORS) => {
  const E = window.__farm
  const L = E.layout
  const out = []
  const tiles = []
  const c = document.createElement('canvas')
  c.width = L.backW
  c.height = L.backH
  const ctx = c.getContext('2d', { willReadFrequently: true })
  const S = L.S
  // 每次都用一張新畫布畫（同一張畫布連畫時，上一次 render 留下的畫布狀態會影響下一次）
  const fresh = () => { const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; return cc.getContext('2d', { willReadFrequently: true }) }
  let last = null
  const draw = () => { last = fresh(); E.render(last) }
  const grab = () => last.getImageData(0, 0, c.width, c.height).data
  COLORS.forEach((col, i) => {
    const a = E.actors.get('c' + i)
    for (const facing of [1, -1]) {
      for (const t of [0.05, 0.2, 0.35, 0.45]) {
        // 固定姿勢：揮爪中，經過 t 秒
        a.action = 'swat'
        a.facing = facing
        a.override = { action: 'swat', left: 0.6 - t, speedMul: 0, tag: 'hswat' }
        draw()
        const A = grab()
        a.override.tag = 'x'
        draw()
        const B = grab()
        const diff = []
        for (let k = 0; k < A.length; k += 4) {
          if (A[k] === B[k] && A[k + 1] === B[k + 1] && A[k + 2] === B[k + 2] && A[k + 3] === B[k + 3]) continue
          const p = k / 4
          diff.push({ x: p % c.width, y: Math.floor(p / c.width), rgb: '#' + [A[k], A[k + 1], A[k + 2]].map((v) => v.toString(16).padStart(2, '0')).join('') })
        }
        const ax = Math.round(L.ox + a.x * S)
        const colorsUsed = [...new Set(diff.map((d) => d.rgb))]
        const xs = diff.map((d) => d.x - ax)
        out.push({ col, facing, t, n: diff.length, colorsUsed, minX: diff.length ? Math.min(...xs) : null, maxX: diff.length ? Math.max(...xs) : null })
        if (t === 0.2 && facing === 1) {
          // 截圖用：腳底附近 60×60 邏輯像素，放大
          a.override.tag = 'hswat'
          const tc = document.createElement('canvas')
          const sx = Math.round(L.ox + (a.x - 30) * S), sy = Math.round(L.offsetY + (a.y - 50) * S)
          draw()
          tc.width = 60 * S
          tc.height = 60 * S
          tc.getContext('2d').drawImage(last.canvas, sx, sy, 60 * S, 60 * S, 0, 0, 60 * S, 60 * S)
          tiles.push(tc.toDataURL('image/png'))
        }
        a.override = null
        a.action = 'idle'
      }
    }
  })
  return { out, tiles, S }
}, COLORS)

for (const r of res.out) {
  const label = `${r.col} 面向${r.facing === 1 ? '右' : '左'} ${r.t} 秒`
  if (r.t === 0.05 || r.t === 0.45) ok(r.n === 0, `${label}：沒有弧線`)
  else {
    ok(r.n > 0, `${label}：有弧線（${r.n} 個裝置像素）`)
    ok(r.colorsUsed.every((x) => x === '#fdf47a' || x === '#fefdc8'), `${label}：顏色只有兩種黃（${r.colorsUsed.join(',')}）`)
    ok(r.facing === 1 ? r.minX > 0 : r.maxX < 0, `${label}：弧線在爪子前方（相對腳底 x ${r.minX}～${r.maxX}）`)
  }
}
const full = res.out.filter((r) => r.t === 0.2)
const half = res.out.filter((r) => r.t === 0.35)
ok(full.every((r, i) => half[i].n > 0 && half[i].n < r.n), '淡出時點數減少（0.35 秒少於 0.2 秒）')
ok(full.every((r) => r.n === full[0].n), `6 色、左右的點數都一樣（${full.map((r) => r.n).join(',')}）`)
res.tiles.forEach((u, i) => writeFileSync(SHOTS + `td3-swat-${COLORS[i]}.png`, Buffer.from(u.split(',')[1], 'base64')))

// 真的用滑鼠快速掃過一隻貓：會揮爪（swatChance = 1）
await page.evaluate(() => { window.__overrides.hover.swatChance = 1 })
let swatted = false
for (let tries = 0; tries < 10 && !swatted; tries++) {
  const p = await page.evaluate(() => {
    const E = window.__farm
    const a = E.actors.get('c3')
    a.tx = a.x; a.ty = a.y; a.path = []
    const q = E.cssOf(a.x, a.y - 15)
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { x: r.left + q.x, y: r.top + q.y }
  })
  await page.mouse.move(p.x - 200, p.y)
  await page.mouse.move(p.x + 200, p.y, { steps: 6 })
  swatted = await page.evaluate(() => window.__farm.actors.get('c3').override?.tag === 'hswat')
  await sleep(700)
}
ok(swatted, '滑鼠快速掃過橘貓：揮爪（hswat）')
ok(errors.length === 0, '沒有頁面錯誤 ' + errors.join(' | '))
await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : '全部通過')
process.exit(fails() ? 1 : 0)
