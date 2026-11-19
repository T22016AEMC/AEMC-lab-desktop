// T2＋T3：放大規則、延伸區沒有黑邊／透明、座標來回換算、場景入口實際點得到（新版 dev server 5181）
import { chromium } from 'playwright-core'
import fs from "node:fs"
import { fileURLToPath } from "node:url"
const URL = (process.env.NEW_URL ?? 'http://localhost:5181/')
const SHOTS = new globalThis.URL('./shots/', import.meta.url)
fs.mkdirSync(SHOTS, { recursive: true })
let fail = 0
const ok = (c, m) => { console.log((c ? '通過 ' : '失敗 ') + m); if (!c) fail++ }
// 獨立重寫一次規則（不引用程式），用來比對
const expect = (bw, bh) => {
  const exact = Math.min(bw / 640, bh / 320)
  const k = Math.floor(exact + 1e-9)
  return k >= 1 && k / exact >= 0.75 - 1e-9 ? { S: k, whole: true } : { S: exact, whole: false }
}
const VIEWS = [
  [1280, 668, 1, '剛好 1280×640'],
  [1920, 1027, 1, '你的螢幕等效（畫布約 1920×999）'],
  [1536, 827, 1.25, '你的螢幕（1536 CSS、dpr 1.25）'],
  [1920, 951, 1, '1920×1080 最大化（畫布約 1920×923）'],
  [1366, 639, 1, '1366×768'],
  [1024, 768, 1, '1024×768'],
  [2560, 1311, 1, '2560×1440'],
  [3000, 900, 1, '超寬 3000×900'],
]
const b = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
for (const [w, h, dpr, name] of VIEWS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL)
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click()
  await bt.waitFor({ state: 'detached' })
  await page.locator('[data-testid="tower-window"]').waitFor({ state: 'visible' })
  // 第一次進來會跳領養視窗：領養第一隻（免費）
  await page.getByRole('button', { name: '開始養殖場' }).click()
  await page.getByRole('button', { name: '開始養殖場' }).waitFor({ state: 'detached' })
  await page.waitForTimeout(400)
  const L = await page.evaluate(() => { const L = window.__farm.layout; return { S: L.S, whole: L.whole, ox: L.ox, oy: L.offsetY, bw: L.backW, bh: L.backH, W: L.W, H: L.H, view: L.view } })
  const ex = expect(L.bw, L.bh)
  ok(L.W === 640 && L.H === 320 && Math.abs(L.S - ex.S) < 1e-9 && L.whole === ex.whole, `${name}：畫布 ${L.bw}×${L.bh} → ${L.whole ? '整數' : '非整數'} ${+L.S.toFixed(3)} 倍（位移 ${L.ox},${L.oy}；可見 x ${L.view.x0.toFixed(1)}～${L.view.x1.toFixed(1)}、y ${L.view.y0.toFixed(1)}～${L.view.y1.toFixed(1)}）`)
  // 場景在畫布裡：置中、底部貼齊
  ok(L.ox >= 0 && L.oy >= 0 && Math.abs(L.ox * 2 + 640 * L.S - L.bw) <= 1.01 && Math.abs(L.oy + 320 * L.S - L.bh) <= 1.01, `${name}：場景水平置中、底部貼齊`)
  await page.waitForTimeout(300)
  // 整張畫布沒有透明、沒有純黑
  const px = await page.evaluate(() => {
    const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let clear = 0, black = 0
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 255) clear++; if (d[i] + d[i + 1] + d[i + 2] === 0) black++ }
    return { clear, black, n: d.length / 4 }
  })
  // 已知的純黑像素：領養寵物（第一隻）的素材本來就有 7 個純黑邏輯像素（v3.8.1 也一樣，28 個 @2 倍），放大後每個邏輯像素在每個方向佔 S 格（整數倍）或最多 ceil(S)+1 格（非整數倍），所以是平方。
  // 容許上限 = 7 × 每方向格數²；超過就代表延伸區或場景多出黑邊（這個測試原本要抓的問題）。
  // 實測 7～8 個（寵物動畫幀不同，眨眼等幀多 1 個），取 12 當上限；延伸區或場景多出黑邊會是幾萬個像素以上，仍抓得到
  const KNOWN_BLACK_LOGIC = 12
  const perAxis = L.whole ? L.S : Math.ceil(L.S) + 1
  const blackMax = KNOWN_BLACK_LOGIC * perAxis ** 2
  ok(px.clear === 0 && px.black <= blackMax, `${name}：畫布 ${px.n} 像素，透明 ${px.clear}、純黑 ${px.black}（容許已知素材的 ≤ ${blackMax}）`)
  await page.screenshot({ path: fileURLToPath(new globalThis.URL(`v390-s1-${w}x${h}@${dpr}.png`, SHOTS)) })
  // 座標來回換算
  const rt = await page.evaluate(() => {
    const L = window.__farm.layout, M = window.__layout
    let worst = 0
    for (let i = 0; i < 400; i++) { const x = (i * 37.3) % 700 - 30, y = (i * 19.7) % 360 - 20; const c = M.toCss(L, x, y); const p = M.fromCss(L, c.x, c.y); worst = Math.max(worst, Math.abs(p.x - x), Math.abs(p.y - y)) }
    return worst
  })
  ok(rt < 1e-6, `${name}：toCss／fromCss 來回誤差 ${rt.toExponential(1)}`)
  // 疊在畫布上的入口：中心換回場景座標要落在對應的場景範圍內
  const geo = await page.evaluate(() => {
    const L = window.__farm.layout, M = window.__layout
    const canvas = document.querySelector('canvas').getBoundingClientRect()
    const center = (id) => { const r = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect(); return M.fromCss(L, (r.left + r.right) / 2 - canvas.left, (r.top + r.bottom) / 2 - canvas.top) }
    const inR = (p, r) => p.x >= r.x0 - 0.5 && p.x <= r.x1 + 0.5 && p.y >= r.y0 - 0.5 && p.y <= r.y1 + 0.5
    return { door: inR(center('launchpad-door'), M.doorRect(L)), tdoor: inR(center('tower-door'), M.towerDoorRect(L)), board: inR(center('bulletin-board'), M.boardRect(L)) }
  })
  ok(geo.door && geo.tdoor && geo.board, `${name}：住家門、塔門、公佈欄按鈕的位置對到場景（${JSON.stringify(geo)}）`)
  // 真滑鼠點擊：窗戶 → 計算機、鐘面 → 碼表與倒數、公佈欄、塔門 → 遊戲館、住家門 → 啟動台
  const click = async (id) => { const r = await page.locator(`[data-testid="${id}"]`).boundingBox(); await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2) }
  for (const [id, title] of [['tower-window', '計算機'], ['tower-clock', '碼表與倒數'], ['bulletin-board', '公佈欄']]) {
    await click(id)
    const opened = await page.getByRole('dialog', { name: title }).waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
    ok(opened, `${name}：點${title}的入口有開啟`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
  await click('tower-door')
  ok(await page.getByTestId('game-hall').waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false), `${name}：點塔門開遊戲館`)
  await page.keyboard.press('Escape')
  await page.evaluate(() => { for (const b of document.querySelectorAll('button[aria-label="關閉"]')) b.click() })
  await page.waitForTimeout(300)
  ok(errors.length === 0, `${name}：沒有頁面錯誤${errors.length ? '：' + errors.join('｜') : ''}`)
  await ctx.close()
}
// 17 種常見視窗的倍率表（CSS 視窗 → 畫布 = 視窗高 − 28 選單列）
const COMMON = [[1024, 768, 1], [1280, 720, 1], [1280, 800, 1], [1280, 1024, 1], [1366, 768, 1], [1440, 900, 1], [1536, 864, 1], [1600, 900, 1], [1680, 1050, 1], [1920, 1080, 1], [1920, 1200, 1], [2560, 1440, 1], [1536, 960, 1.25], [1280, 800, 1.5], [1440, 900, 2], [1920, 1080, 1.25], [3840, 2160, 1.5]]
console.log('\n17 種常見視窗（扣掉瀏覽器工具列約 130、選單列 28）：')
for (const [w, h, d] of COMMON) { const bw = Math.round(w * d), bh = Math.round((h - 130 - 28) * d); const e = expect(bw, bh); console.log(`  ${w}×${h} @${d} → 畫布 ${bw}×${bh} → ${e.whole ? '整數' : '非整數'} ${+e.S.toFixed(3)} 倍`) }
console.log(fail ? `\nT2/T3 失敗 ${fail} 項` : '\nT2/T3 全部通過')
await b.close()
process.exit(fail ? 1 : 0)
