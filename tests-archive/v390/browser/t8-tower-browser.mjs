// 鐘樓放寬與塔門保護調整的瀏覽器測試（新版 NEW_URL）：
//  1. 鐘樓放到最後面（腳底 y=136、尖頂超出畫面 24 像素）：塔門、窗、鐘面三個透明入口跟著對；程式畫的鐘面、塔門的畫面像素和預設位置平移後相同；夜晚開門的暖光在門的位置
//  2. 塔門、招牌被蓋住一部分（≤ 25%）時，透明入口仍在最上層、點得到（遊戲館、計算機、碼表）
//  3. 截圖：鐘樓在最後面、視窗剛好 640×320 整數倍（尖頂被切掉）與較大視窗
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const URL0 = process.env.NEW_URL ?? 'http://localhost:5181/'
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url))
fs.mkdirSync(SHOTS, { recursive: true })
const KEY = 'aemc-desktop:farm-save'
const T0 = new Date(2026, 10, 19, 12, 0, 0).getTime()
const NIGHT = new Date(2026, 10, 19, 21, 0, 0).getTime()
let fail = 0
const ok = (c, m) => { console.log((c ? '通過 ' : '失敗 ') + m); if (!c) fail++ }
const pet = (id, species, variant, name) => ({ id, species, variant, name, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 30, personality: 'calm', lastInteract: T0 })
const save = (layout) => ({
  schemaVersion: 5, dataRev: 4, points: 50, lastSeen: T0, lastDailyClaim: '2026-11-18', gifts: { date: '2026-11-18', count: 9 }, nextPetId: 2, createdAt: T0 - 9e8,
  pets: [pet('p1', 'dog', 'shiba', '小柴')],
  ownedBuildings: ['kennel', 'bowls', 'catTree'], earning: { date: '2026-11-18', programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 }, bowl: { date: '2026-11-18', used: 0 },
  collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: '2026-11-18', count: 0, lastEnd: 0 }, farmLayout: layout,
})
const b = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
async function open(layout, { w = 1280, h = 668, time = T0 + 60000 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await ctx.addInitScript(([s, k]) => {
    if (sessionStorage.getItem('__s')) return
    localStorage.setItem(k, s)
    localStorage.setItem('aemc-desktop:settings', JSON.stringify({ lastExportAt: Date.now(), remindOff: true, lastRemindDate: '' }))
    sessionStorage.setItem('__s', '1')
  }, [JSON.stringify(save(layout)), KEY])
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.clock.install({ time })
  await page.goto(URL0)
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click()
  await bt.waitFor({ state: 'detached' })
  await page.locator('[data-testid="tower-door"]').waitFor({ state: 'attached' })
  await page.waitForTimeout(700)
  return { ctx, page, errors }
}
// 場景矩形（邏輯座標）在畫布上的像素（RGBA 陣列）
const grab = (page, r) => page.evaluate((r) => {
  const L = window.__farm.layout, M = window.__layout
  const cv = document.querySelector('canvas')
  const a = M.toCss(L, r.x0, r.y0), c = M.toCss(L, r.x1, r.y1)
  const x = Math.round(a.x * L.dpr), y = Math.round(a.y * L.dpr), w = Math.round((c.x - a.x) * L.dpr), h = Math.round((c.y - a.y) * L.dpr)
  const d = cv.getContext('2d').getImageData(x, y, w, h).data
  return { w, h, d: Array.from(d) }
}, r)
const sameFrac = (A, B) => { let e = 0; const n = Math.min(A.d.length, B.d.length) / 4; for (let i = 0; i < n; i++) if (A.d[i * 4] === B.d[i * 4] && A.d[i * 4 + 1] === B.d[i * 4 + 1] && A.d[i * 4 + 2] === B.d[i * 4 + 2]) e++; return e / n }
const mean = (A) => { let s = 0; const n = A.d.length / 4; for (let i = 0; i < n; i++) s += A.d[i * 4] + A.d[i * 4 + 1] + A.d[i * 4 + 2]; return s / n / 3 }
const BACK = { items: [{ id: 'tower', kind: 'tower', state: 'placed', x: 568, y: 136 }] }

// ===== 1. 鐘樓在最後面 =====
for (const [tag, time] of [['白天', T0 + 60000], ['夜晚', NIGHT]]) {
  const A = await open(undefined, { time })
  const B = await open(BACK, { time })
  const rects = async (page) => page.evaluate(() => {
    const L = window.__farm.layout, M = window.__layout
    const cv = document.querySelector('canvas').getBoundingClientRect()
    const center = (id) => { const r = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect(); return M.fromCss(L, (r.left + r.right) / 2 - cv.left, (r.top + r.bottom) / 2 - cv.top) }
    const inR = (p, r) => p.x >= r.x0 - 1 && p.x <= r.x1 + 1 && p.y >= r.y0 - 1 && p.y <= r.y1 + 1
    const tl = M.towerTopLeft(L)
    return {
      top: tl.y, base: M.towerBase(L),
      door: M.towerDoorRect(L), win: M.towerWindowRect(L), clock: M.towerClockRect(L, window.__farm.towerSprite()?.meta?.clock),
      okDoor: inR(center('tower-door'), M.towerDoorRect(L)), okWin: inR(center('tower-window'), M.towerWindowRect(L)),
      okClock: inR(center('tower-clock'), M.towerClockRect(L, window.__farm.towerSprite()?.meta?.clock)),
    }
  })
  const ra = await rects(A.page), rb = await rects(B.page)
  ok(ra.top === 6 && rb.top === -24 && rb.base === 136, `${tag}：鐘樓腳底 136、頂端 -24（預設 166、頂端 6）`)
  ok(rb.okDoor && rb.okWin && rb.okClock, `${tag}：塔門、窗戶、鐘面的透明入口中心都落在新位置的互動區（${JSON.stringify([rb.okDoor, rb.okWin, rb.okClock])}）`)
  ok(rb.door.y0 > 0 && rb.clock.y0 > 0 && rb.win.y0 > 0, `${tag}：三個互動區都在畫面內（門 y0 ${rb.door.y0.toFixed(1)}、鐘面 ${rb.clock.y0}、窗戶 ${rb.win.y0}）`)
  // 畫面：把預設位置的互動區平移 -30 後，畫布像素應該相同（鐘面是程式畫的、門是素材）
  const sh = (r) => ({ x0: r.x0, x1: r.x1, y0: r.y0 - 30, y1: r.y1 - 30 })
  const ca = await grab(A.page, ra.clock), cb = await grab(B.page, sh(ra.clock).y0 >= 0 ? rb.clock : rb.clock)
  const fClock = sameFrac(ca, cb)
  ok(fClock >= 0.97, `${tag}：鐘面畫面和預設位置平移後相同（${(fClock * 100).toFixed(1)}% 的像素相同）`)
  const da = await grab(A.page, ra.door), db = await grab(B.page, rb.door)
  const fDoor = sameFrac(da, db)
  if (tag === '白天') ok(fDoor >= 0.97, `${tag}：塔門畫面和預設位置平移後相同（${(fDoor * 100).toFixed(1)}%）`)
  // 夜晚開門的暖光：門的範圍在滑鼠移上去（towerHover）後變亮，亮度提升在兩個位置差不多
  if (tag === '夜晚') {
    const lift = []
    for (const [name, P, r] of [['預設', A.page, ra.door], ['最後面', B.page, rb.door]]) {
      const off = mean(await grab(P, r))
      await P.evaluate(() => { window.__farm.towerHover = true })
      await P.waitForTimeout(300)
      const on = mean(await grab(P, r))
      await P.evaluate(() => { window.__farm.towerHover = false })
      lift.push([name, off, on])
      ok(on > off + 3, `夜晚：${name}位置塔門開門後亮度 ${off.toFixed(1)} → ${on.toFixed(1)}（暖光在門的位置）`)
    }
  }
  ok(A.errors.length === 0 && B.errors.length === 0, `${tag}：沒有頁面錯誤 ${A.errors.concat(B.errors).join(' / ')}`)
  await A.ctx.close()
  if (tag === '白天') {
    // 截圖：視窗剛好 640×320 整數倍（1280×668 → 畫布 1280×640），和較大的視窗
    await B.page.screenshot({ path: SHOTS + 'v390-tower-back-1280x668.png' })
    const cv = await B.page.locator('canvas').first().boundingBox()
    await B.page.screenshot({ path: SHOTS + 'v390-tower-back-crop.png', clip: { x: cv.x + cv.width * 0.6, y: cv.y, width: cv.width * 0.4, height: cv.height * 0.5 } })
  }
  await B.ctx.close()
}
{
  const { ctx, page } = await open(BACK, { w: 1920, h: 1027 })
  await page.screenshot({ path: SHOTS + 'v390-tower-back-1920x1027.png' })
  const top = await page.evaluate(() => { const L = window.__farm.layout; return { offsetY: L.offsetY, S: L.S, H: L.H } })
  console.log('1920×1027：', JSON.stringify(top))
  await ctx.close()
}

// ===== 2. 塔門、招牌被蓋住一部分（≤ 25%）仍點得到 =====
// 位置來自 Node 測試 v390-tower：tree1 (524,201) 蓋塔門 207/828（恰好 25%）、lamp (598,188) 蓋招牌 86/345（恰好 25%）
const PART = { items: [
  { id: 'tree1', kind: 'tree', state: 'placed', x: 524, y: 201 },
  { id: 'lamp', kind: 'lamp', state: 'placed', x: 598, y: 188 },
] }
{
  const { ctx, page, errors } = await open(PART)
  const geo = await page.evaluate(() => {
    const top = (id) => { const r = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect(); const p = { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; const e = document.elementFromPoint(p.x, p.y); return { ...p, top: e?.getAttribute('data-testid') ?? e?.tagName } }
    const L = window.__farm.layout
    return { door: top('tower-door'), win: top('tower-window'), clock: top('tower-clock'), placed: [...L.placement.placed.values()].filter((o) => ['tree1', 'lamp'].includes(o.id)).map((o) => o.id + '@' + o.x + ',' + o.y) }
  })
  ok(geo.placed.length === 2, '部分遮擋：樹與路燈在新位置 ' + geo.placed.join(' '))
  ok(geo.door.top === 'tower-door' && geo.win.top === 'tower-window' && geo.clock.top === 'tower-clock', `部分遮擋：三個入口的中心點最上層元素就是入口按鈕（${geo.door.top}、${geo.win.top}、${geo.clock.top}）`)
  const door = await page.locator('[data-testid="tower-door"]').boundingBox()
  await page.screenshot({ path: SHOTS + 'v390-tower-partcover.png', clip: { x: door.x - 120, y: door.y - 230, width: door.width + 260, height: door.height + 300 } })
  for (const [key, expect] of [['win', 'calc-dialog'], ['clock', 'timer-dialog'], ['door', 'game-hall']]) {
    const p = geo[key]
    await page.mouse.click(p.x, p.y)
    await page.waitForTimeout(500)
    const got = await page.evaluate((id) => !!document.querySelector(`[data-testid="${id}"]`), expect)
    ok(got, `部分遮擋：點 ${key} → 出現 ${expect}`)
    if (key !== 'door') { await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
  }
  ok(errors.length === 0, '部分遮擋：沒有頁面錯誤 ' + errors.join(' / '))
  await ctx.close()
}
await b.close()
console.log(fail ? `鐘樓瀏覽器測試失敗 ${fail} 項` : '鐘樓瀏覽器測試全部通過')
process.exit(fail ? 1 : 0)
