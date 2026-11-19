// 第六階段瀏覽器實測（新版 5181，真滑鼠）：花槽、珊瑚
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
const URL0 = (process.env.NEW_URL ?? 'http://localhost:5181/')
const KEY = 'aemc-desktop:farm-save'
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url))
fs.mkdirSync(SHOTS, { recursive: true })
const T0 = new Date(2026, 10, 19, 10, 0, 0).getTime()
const today = '2026-11-19'
const pet = (id, species, variant) => ({ id, species, variant, name: id === 'p1' ? '小柴' : id === 'p2' ? '橘子' : '黃金', adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 90, personality: 'calm', lastInteract: T0 })
const save = (extra = {}) => ({
  schemaVersion: 5, dataRev: 4, points: 80, lastSeen: T0, lastDailyClaim: today, gifts: { date: today, count: 9 }, nextPetId: 4, createdAt: T0 - 9e8,
  pets: [pet('p1', 'dog', 'shiba'), pet('p2', 'cat', 'orange'), pet('p3', 'dog', 'golden')], ownedBuildings: ['kennel', 'bowls', 'catTree'],
  earning: { date: today, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 }, bowl: { date: today, used: 1 },
  collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: today, count: 0, lastEnd: 0 }, ...extra,
})
let fail = 0
const ok = (c, m) => { console.log((c ? '通過 ' : '失敗 ') + m); if (!c) fail++ }
const b = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
async function open(s, { w = 1920, h = 988 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } })
  await ctx.addInitScript(([s, k]) => { if (sessionStorage.getItem('__s')) return; localStorage.setItem(k, s); localStorage.setItem('aemc-desktop:settings', JSON.stringify({ lastExportAt: Date.now(), remindOff: true, lastRemindDate: '' })); sessionStorage.setItem('__s', '1') }, [JSON.stringify(s), KEY])
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL0)
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click(); await bt.waitFor({ state: 'detached' })
  await page.locator('[data-testid="tower-window"]').waitFor({ state: 'visible' })
  await page.evaluate(() => { window.__overrides.weather = 'sunny'; window.__overrides.hour = 10 })
  await page.waitForTimeout(300)
  return { ctx, page, errors }
}
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)
const posOf = (page, id) => page.evaluate((id) => { const it = window.__farm.layout.placement.placed.get(id); return it ? { x: it.x, y: it.y } : null }, id)
/** 物件上一個「點得到」的點（不透明像素、最上層）與合法目標位置；回傳 CSS 座標（相對視窗） */
async function plan(page, id, want) {
  return page.evaluate(async ([id, want]) => {
    const e = window.__farm, M = window.__layout, L = e.layout
    const { pickObject } = await import('/src/farm/pixel/editDrag.ts')
    const { canPlace } = await import('/src/farm/pixel/placeRules.ts')
    const it = L.placement.placed.get(id)
    let grab = null
    for (let dy = 2; dy < 120 && !grab; dy += 2) for (let dx = -20; dx <= 20 && !grab; dx += 2) if (pickObject(L.placement, it.x + dx, it.y - dy) === id) grab = { x: it.x + dx, y: it.y - dy }
    const c = document.querySelector('canvas').getBoundingClientRect()
    const css = (p) => { const q = M.toCss(L, p.x, p.y); return { x: q.x + c.left, y: q.y + c.top } }
    let target = null
    if (want) {
      if (want.any) target = want
      else for (let r = 0; r < 200 && !target; r += 2) for (let dx = -r; dx <= r && !target; dx += 2) for (const dy of r ? [-r, r, 0] : [0]) if (!target && canPlace(L, id, want.x + dx, want.y + dy).ok) target = { x: want.x + dx, y: want.y + dy }
    }
    // 指標要移到的位置 = 目標腳底 − (腳底 − 抓的點)
    const to = target ? { x: target.x - (it.x - grab.x), y: target.y - (it.y - grab.y) } : null
    return { from: css(grab), to: to ? css(to) : null, target, start: { x: it.x, y: it.y } }
  }, [id, want])
}
async function dragMouse(page, from, to, { escapeMid = false, steps = 16 } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 2, from.y + 1) // 還沒超過 4 像素
  await page.mouse.move(to.x, to.y, { steps })
  if (escapeMid) await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(250)
}
const toast = (page, text) => page.getByRole('status').filter({ hasText: text }).first().waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
const inEdit = (page) => page.getByTestId('edit-layer').isVisible().catch(() => false)

// ============ 主流程 ============
const PIECES = ['planter', 'coral']
const NAME = { planter: '花槽', coral: '珊瑚石堆' }
const start = async (page) => {
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click(); await bt.waitFor({ state: 'detached' })
  await page.locator('[data-testid="tower-window"]').waitFor({ state: 'visible' })
  await page.evaluate(() => { window.__overrides.weather = 'sunny'; window.__overrides.hour = 10 })
  await page.waitForTimeout(300)
}
/** 在場景可放的位置找一個 canPlace 合法的腳底點，回傳 { foot, css, box } */
const findSpot = (page, id, xs, ys) => page.evaluate(async ([id, xs, ys]) => {
  const { canPlace } = await import('/src/farm/pixel/placeRules.ts')
  const { spriteBoxAt } = await import('/src/farm/pixel/placement.ts')
  const L = window.__farm.layout, M = window.__layout, c = document.querySelector('canvas').getBoundingClientRect()
  for (const y of ys) for (const x of xs) if (canPlace(L, id, x, y).ok) {
    const bx = spriteBoxAt(id, x, y)
    const q = M.toCss(L, x, (bx.y0 + bx.y1) / 2)
    return { foot: { x, y }, css: { x: q.x + c.left, y: q.y + c.top }, box: bx }
  }
  return null
}, [id, xs, ys])
const sceneClip = (page, box) => page.evaluate(([bx]) => {
  const L = window.__farm.layout, M = window.__layout, c = document.querySelector('canvas').getBoundingClientRect()
  const a = M.toCss(L, bx.x0, bx.y0), b = M.toCss(L, bx.x1, bx.y1)
  return { x: Math.max(0, Math.floor(a.x + c.left)), y: Math.max(0, Math.floor(a.y + c.top)), width: Math.ceil(b.x - a.x), height: Math.ceil(b.y - a.y) }
}, [box])
const diffRatio = (page, a, b) => page.evaluate(async ([a, b]) => {
  const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u })
  const [ia, ib] = await Promise.all([load('data:image/png;base64,' + a), load('data:image/png;base64,' + b)])
  const px = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data }
  const da = px(ia), db = px(ib); let n = 0
  for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 40) n++
  return n / (da.length / 4)
}, [a, b])

// ---- A. 沒有存檔記錄：兩者在倉庫、有縮圖 ----
{
  const { ctx, page, errors } = await open(save())
  const st = await page.evaluate(() => [...window.__farm.layout.placement.stored].sort())
  ok(st.includes('planter') && st.includes('coral'), 'A1 沒有存檔記錄：花槽、珊瑚都在倉庫（' + st.join(',') + '）')
  ok((await posOf(page, 'planter')) === null && (await posOf(page, 'coral')) === null, 'A1 場上沒有花槽、珊瑚')
  ok(!('farmLayout' in (await saved(page))), 'A1 存檔沒有 farmLayout')
  await page.getByTestId('build-button').click()
  ok(await inEdit(page), 'A2 進入編輯農場')
  for (const id of PIECES) {
    const card = page.getByTestId('inv-' + id)
    ok((await card.count()) === 1, `A3 倉庫列有「${NAME[id]}」卡片`)
    const info = await card.evaluate((el) => {
      const cv = el.querySelector('canvas'), img = el.querySelector('img'), txt = el.textContent
      let opaque = 0, w = 0, h = 0
      if (cv) { w = cv.width; h = cv.height; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) opaque++ }
      return { hasCanvas: !!cv, hasImg: !!img, opaque, w, h, txt }
    })
    ok(info.hasCanvas && info.opaque > 200 && !info.txt.includes('？'), `A3 「${NAME[id]}」縮圖有畫出內容（canvas ${info.w}×${info.h}，不透明 ${info.opaque} 像素，文字「${info.txt}」）`)
    await card.screenshot({ path: SHOTS + `v390-s6-thumb-${id}.png` })
  }
  await page.screenshot({ path: SHOTS + 'v390-s6-inventory-default.png' })
  ok(errors.length === 0, 'A 沒有頁面錯誤' + (errors.length ? '：' + errors.join('｜') : ''))
  await ctx.close()
}

// ---- B. 放到場上 → 看得到 → 拖曳 → 重新整理 → 收回 → 重新整理 ----
for (const id of PIECES) {
  const { ctx, page, errors } = await open(save())
  await page.getByTestId('build-button').click()
  const spot = await findSpot(page, id, [300, 340, 380, 420, 460, 500], [245, 255, 235, 265])
  ok(spot !== null, `B1 ${NAME[id]}：場上找得到合法位置 ${JSON.stringify(spot?.foot)}`)
  const clip = await sceneClip(page, spot.box)
  await page.mouse.move(5, 5)
  const before = await page.screenshot({ clip })
  const card = await page.getByTestId('inv-' + id).boundingBox()
  await dragMouse(page, { x: card.x + card.width / 2, y: card.y + card.height / 2 }, spot.css, { steps: 20 })
  const p1 = await posOf(page, id)
  ok(p1 && Math.abs(p1.x - spot.foot.x) <= 1 && Math.abs(p1.y - spot.foot.y) <= 1, `B2 ${NAME[id]}從倉庫拖到場景：擺在 ${JSON.stringify(p1)}（目標 ${JSON.stringify(spot.foot)}）`)
  ok((await page.getByTestId('inv-' + id).count()) === 0, `B2 倉庫列裡不再有${NAME[id]}`)
  await page.mouse.move(5, 5)
  await page.waitForTimeout(300)
  const after = await page.screenshot({ clip })
  const ratio = await diffRatio(page, before.toString('base64'), after.toString('base64'))
  ok(ratio > 0.3, `B3 ${NAME[id]}外框內約 ${(ratio * 100).toFixed(0)}% 的像素和擺放前不同（> 30%）→ 畫面上看得到`)
  await page.screenshot({ path: SHOTS + `v390-s6-placed-${id}.png` })
  const s1 = await saved(page)
  ok(s1.farmLayout.items.some((it) => it.id === id && it.state === 'placed' && it.x === p1.x && it.y === p1.y), `B4 存檔記下${NAME[id]}擺在 (${p1.x},${p1.y})`)
  // 拖曳：抓不透明點，移到另一個合法位置
  const spot2 = await findSpot(page, id, [520, 480, 440, 400], [270, 280, 250])
  const pl = await plan(page, id, { x: spot2.foot.x, y: spot2.foot.y })
  ok(pl.from && pl.to, `B5 ${NAME[id]}有可抓的不透明點、有合法目標`)
  await dragMouse(page, pl.from, pl.to, { steps: 20 })
  const p2 = await posOf(page, id)
  ok(p2 && (p2.x !== p1.x || p2.y !== p1.y), `B5 ${NAME[id]}拖曳後位置改變：${JSON.stringify(p1)} → ${JSON.stringify(p2)}`)
  // 重新整理：位置還在
  await page.reload()
  await start(page)
  const p3 = await posOf(page, id)
  ok(p3 && p3.x === p2.x && p3.y === p2.y, `B6 重新整理後${NAME[id]}還在 ${JSON.stringify(p3)}`)
  // 收回：拖到倉庫列
  await page.getByTestId('build-button').click()
  const pl2 = await plan(page, id, null)
  const inv = await page.getByTestId('edit-inventory').boundingBox()
  await dragMouse(page, pl2.from, { x: inv.x + inv.width / 2, y: inv.y + inv.height / 2 })
  ok((await page.getByTestId('inv-' + id).count()) === 1 && (await posOf(page, id)) === null, `B7 ${NAME[id]}拖到倉庫列：收回倉庫`)
  ok(await toast(page, NAME[id] + '已收進倉庫'), `B7 提示「${NAME[id]}已收進倉庫」`)
  { const fl = (await saved(page)).farmLayout; ok(!fl || !fl.items.some((it) => it.id === id && it.state === 'placed'), `B7 存檔沒有${NAME[id]}擺放記錄（${fl ? '有 farmLayout 但沒有擺放這件' : '擺放跟預設一樣，farmLayout 已拿掉'}）`) }
  await page.reload()
  await start(page)
  ok((await posOf(page, id)) === null && (await page.evaluate((id) => window.__farm.layout.placement.stored.has(id), id)), `B8 重新整理後${NAME[id]}仍在倉庫`)
  ok(errors.length === 0, `B ${NAME[id]} 沒有頁面錯誤` + (errors.length ? '：' + errors.join('｜') : ''))
  await ctx.close()
}

console.log(fail ? `第六階段瀏覽器實測失敗 ${fail} 項` : '第六階段瀏覽器實測全部通過')
await b.close()
process.exit(fail ? 1 : 0)
