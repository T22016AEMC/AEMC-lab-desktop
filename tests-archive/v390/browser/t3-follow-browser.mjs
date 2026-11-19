// 第三階段瀏覽器測試：物件移到新位置後，入口與互動跟著走（新版 5181）
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
const URL0 = (process.env.NEW_URL ?? 'http://localhost:5181/')
const KEY = 'aemc-desktop:farm-save'
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url))
fs.mkdirSync(SHOTS, { recursive: true })
const T0 = 1795000000000
const pet = (id, species, variant, name) => ({ id, species, variant, name, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 30, personality: 'calm', lastInteract: T0 })
// 擺放（第三階段的 Node 測試用 canPlace 確認過合法；這裡直接寫進存檔）
const LAYOUTS = {
  A: { items: [
    { id: 'house', kind: 'house', state: 'placed', x: 346, y: 246 },
    { id: 'tower', kind: 'tower', state: 'placed', x: 428, y: 192 },
    { id: 'pond', kind: 'pond', state: 'placed', x: 558, y: 220 },
    { id: 'board', kind: 'board', state: 'placed', x: 506, y: 136 },
    { id: 'lamp', kind: 'lamp', state: 'placed', x: 600, y: 316 },
  ] },
  B: { items: [
    { id: 'pond', kind: 'pond', state: 'placed', x: 520, y: 300 },
    { id: 'lamp', kind: 'lamp', state: 'stored' },
    { id: 'coral', kind: 'coral', state: 'placed', x: 330, y: 230 },
  ] },
}
const save = (layout) => ({
  schemaVersion: 5, dataRev: 4, points: 50, lastSeen: T0, lastDailyClaim: '2026-11-18', gifts: { date: '2026-11-18', count: 9 }, nextPetId: 3, createdAt: T0 - 9e8,
  pets: [pet('p1', 'dog', 'shiba', '小柴'), pet('p2', 'cat', 'orange', '橘子')],
  ownedBuildings: ['kennel', 'bowls', 'catTree'], earning: { date: '2026-11-18', programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 }, bowl: { date: '2026-11-18', used: 0 },
  collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: '2026-11-18', count: 0, lastEnd: 0 }, farmLayout: layout,
})
let fail = 0
const ok = (c, m) => { console.log((c ? '通過 ' : '失敗 ') + m); if (!c) fail++ }
const b = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
for (const [tag, layout] of Object.entries(LAYOUTS))
  for (const [w, h, dpr] of [[1920, 988, 1], [1366, 639, 1]]) {
    const name = `${tag} ${w}×${h}`
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
    await ctx.addInitScript(([s, k]) => { if (sessionStorage.getItem('__s')) return; localStorage.setItem(k, s); localStorage.setItem('aemc-desktop:settings', JSON.stringify({ lastExportAt: Date.now(), remindOff: true, lastRemindDate: '' })); sessionStorage.setItem('__s', '1') }, [JSON.stringify(save(layout)), KEY])
    const page = await ctx.newPage()
    page.setDefaultTimeout(60000)
    await page.clock.install({ time: T0 + 60000 + 2 * 3600000 }) // 中午過後一點（白天）
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(URL0)
    const bt = page.getByRole('button', { name: '點擊以開始' })
    await bt.click()
    await bt.waitFor({ state: 'detached' })
    await page.locator('[data-testid="tower-window"]').waitFor({ state: 'visible' })
    await page.waitForTimeout(500)
    // DOM 入口中心換回場景座標要落在新位置的互動區
    const geo = await page.evaluate(() => {
      const L = window.__farm.layout, M = window.__layout
      const c = document.querySelector('canvas').getBoundingClientRect()
      const center = (id) => { const r = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect(); return M.fromCss(L, (r.left + r.right) / 2 - c.left, (r.top + r.bottom) / 2 - c.top) }
      const inR = (p, r) => p.x >= r.x0 - 1 && p.x <= r.x1 + 1 && p.y >= r.y0 - 1 && p.y <= r.y1 + 1
      return { rev: L.placement.rev, house: L.placement.placed.get('house'), door: inR(center('launchpad-door'), M.doorRect(L)), tdoor: inR(center('tower-door'), M.towerDoorRect(L)), board: inR(center('bulletin-board'), M.boardRect(L)), window: inR(center('tower-window'), M.towerWindowRect(L)) }
    })
    ok(geo.door && geo.tdoor && geo.board && geo.window, `${name}：住家門、塔門、窗戶、公佈欄的入口在新位置（${JSON.stringify(geo)}）`)
    const click = async (id) => { const r = await page.locator(`[data-testid="${id}"]`).boundingBox(); await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2) }
    for (const [id, title] of [['tower-window', '計算機'], ['tower-clock', '碼表與倒數'], ['bulletin-board', '公佈欄']]) {
      await click(id)
      ok(await page.getByRole('dialog', { name: title }).waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false), `${name}：點${title}入口有開`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
    }
    await click('tower-door')
    ok(await page.getByTestId('game-hall').waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false), `${name}：點塔門開遊戲館`)
    await page.evaluate(() => { for (const x of document.querySelectorAll('button[aria-label="關閉"]')) x.click() })
    await page.waitForTimeout(300)
    await click('launchpad-door')
    ok(await page.getByTestId('launchpad-earn').waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false), `${name}：點住家門開啟動台`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    // 把狗拖到新池塘的水面上 → 開始洗澡（用引擎的拖曳 API，座標是 CSS）
    const bath = await page.evaluate(() => {
      const e = window.__farm, M = window.__layout, L = e.layout
      const a = e.actors.get('p1')
      if (!a) return 'no pet'
      const s = M.toCss(L, a.x, a.y - 8)
      if (!e.beginDrag('p1', s.x, s.y)) return 'beginDrag false'
      const w = M.waterEllipse(L)
      const t = M.toCss(L, w.cx, w.cy)
      e.dragTo(t.x, t.y)
      const r = e.endDrag()
      return r?.kind ?? 'null'
    })
    ok(bath === 'bath' || bath === 'water', `${name}：把狗拖到新池塘的水面 → ${bath}`)
    await page.waitForTimeout(800)
    await page.screenshot({ path: SHOTS + `v390-s3-${tag}-${w}x${h}.png` })
    ok(errors.length === 0, `${name}：沒有頁面錯誤` + (errors.length ? '：' + errors.join('｜') : ''))
    await ctx.close()
  }
console.log(fail ? `第三階段瀏覽器測試失敗 ${fail} 項` : '第三階段瀏覽器測試全部通過')
await b.close()
process.exit(fail ? 1 : 0)
