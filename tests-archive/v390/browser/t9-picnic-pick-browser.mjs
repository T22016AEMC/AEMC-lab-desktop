// v3.9.1 瀏覽器實測（新版 dev server，真滑鼠）：野餐選位置
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
const URL0 = process.env.NEW_URL ?? 'http://localhost:5181/'
const KEY = 'aemc-desktop:farm-save'
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url))
fs.mkdirSync(SHOTS, { recursive: true })
const T0 = new Date(2026, 10, 19, 10, 0, 0).getTime()
const today = '2026-11-19'
const pet = (id, species, variant) => ({ id, species, variant, name: id, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 90, personality: 'calm', lastInteract: T0 })
const save = (extra = {}) => ({
  schemaVersion: 5, dataRev: 4, points: 80, lastSeen: T0, lastDailyClaim: today, gifts: { date: today, count: 9 }, nextPetId: 4, createdAt: T0 - 9e8,
  pets: [pet('p1', 'dog', 'shiba'), pet('p2', 'cat', 'orange'), pet('p3', 'dog', 'golden')], ownedBuildings: ['kennel', 'bowls', 'catTree'],
  earning: { date: today, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 }, bowl: { date: today, used: 1 },
  collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: today, count: 0, lastEnd: 0 }, ...extra,
})
let fail = 0
const ok = (c, m) => { console.log((c ? '通過 ' : '失敗 ') + m); if (!c) fail++ }
const report = []
const b = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
async function open(s, { w = 1920, h = 988, dpr = 1 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
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
const toast = (page, text, timeout = 4000) => page.getByRole('status').filter({ hasText: text }).first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
const picking = (page) => page.getByTestId('picnic-pick-layer').isVisible().catch(() => false)
const ghost = (page) => page.evaluate(() => window.__farm.picnicGhost && { ...window.__farm.picnicGhost })
/** 場景座標 → 視窗 CSS 座標 */
const css = (page, x, y) => page.evaluate(([x, y]) => { const L = window.__farm.layout; const q = window.__layout.toCss(L, x, y); const c = document.querySelector('canvas').getBoundingClientRect(); return { x: q.x + c.left, y: q.y + c.top } }, [x, y])
/** 讓墊子左上角在 (x0, y0) 的游標位置（墊子中心） */
const cursorFor = (page, x0, y0) => css(page, x0 + 52, y0 + 31.5)
const R = (x0, y0) => ({ x0, y0, x1: x0 + 104, y1: y0 + 63 })
/** 在目前的擺放下，找一個指定結果的墊子位置（掃描範圍內） */
const findSpot = (page, want, near = { x: 200, y: 165 }) => page.evaluate(async ([want, near]) => {
  const { picnicSpotCheck } = await import('/src/farm/pixel/picnic.ts')
  const L = window.__farm.layout
  let best = null
  for (let y = 150; y <= 184; y++) for (let x = 12; x <= 524; x++) {
    const r = picnicSpotCheck(L, { x0: x, y0: y, x1: x + 104, y1: y + 63 })
    const k = r.ok ? 'ok' : r.reason
    if (k !== want) continue
    const d = Math.abs(x - near.x) + Math.abs(y - near.y)
    if (!best || d < best.d) best = { x0: x, y0: y, d }
  }
  return best
}, [want, near])
const autoRect = (page) => page.evaluate(async () => (await import('/src/farm/pixel/picnic.ts')).picnicMatRect(window.__farm.layout))
const startPick = async (page) => { await page.getByTestId('picnic-button').click(); await page.getByTestId('picnic-pick-layer').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {}) }
const clearCooldown = (page) => page.evaluate(() => { const st = window.__farmStore.getState(); window.__farmStore.setState({ save: { ...st.save, picnic: { date: st.save.picnic.date, count: 0, lastEnd: 0 } } }) })
/** 墊子附近放大截圖（座位範圍） */
const zoomShot = async (page, x0, y0, name) => { const tl = await css(page, x0 - 30, y0 - 50), br = await css(page, x0 + 134, y0 + 75); await page.screenshot({ path: SHOTS + name, clip: { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y } }) }
const visibility = (page, id) => page.getByTestId(id).evaluate((el) => getComputedStyle(el).visibility).catch(() => 'missing')

// ============ 1～5 主流程：進入、預覽跟著游標、綠紅、Esc、點一下開始 ============
let chosen = null
{
  const { ctx, page, errors } = await open(save())
  const before = await saved(page)
  await startPick(page)
  ok(await picking(page), '1 按「野餐」進入選位置（不是直接開始）')
  ok(!(await saved(page)).picnic.active, '1 還沒開始野餐')
  ok((await page.getByTestId('picnic-button').innerText()).includes('選位置中'), '1 選單列按鈕顯示「選位置中」')
  ok(await page.evaluate(() => window.__farm.editing && window.__farm.hover.blocked), '1 寵物暫停、滑鼠互動關閉（和編輯農場一致）')
  for (const id of ['launchpad-door', 'tower-window', 'tower-door']) ok((await visibility(page, id)) === 'hidden', `1 畫布上的透明入口 ${id} 隱藏`)
  const p0 = await page.evaluate(() => [...window.__farm.actors.values()].map((a) => [a.x, a.y]))
  await page.waitForTimeout(1500)
  const p1 = await page.evaluate(() => [...window.__farm.actors.values()].map((a) => [a.x, a.y]))
  ok(JSON.stringify(p0) === JSON.stringify(p1), '1 選位置 1.5 秒內寵物完全不動')
  const g0 = await ghost(page)
  ok(g0 && JSON.stringify({ x0: g0.rect.x0, y0: g0.rect.y0 }) === JSON.stringify({ x0: 384, y0: 167 }) && g0.ok, '1 沒有記憶：初始預覽在自動位置 (384,167) ' + JSON.stringify(g0))
  // 2. 跟著游標
  const A = await findSpot(page, 'ok', { x: 150, y: 160 })
  const B = await findSpot(page, 'ok', { x: 300, y: 175 })
  for (const S of [A, B]) {
    const c = await cursorFor(page, S.x0, S.y0)
    await page.mouse.move(c.x, c.y, { steps: 8 })
    const g = await ghost(page)
    ok(g && g.rect.x0 === S.x0 && g.rect.y0 === S.y0 && g.ok, `2 游標移到 → 預覽在 (${S.x0},${S.y0}) 綠色 ` + JSON.stringify(g?.rect))
    ok((await page.getByTestId('picnic-pick-surface').getAttribute('data-ok')) === '1' && (await visibility(page, 'picnic-pick-reason')) === 'hidden', '2 綠色時沒有原因標籤')
  }
  await page.screenshot({ path: SHOTS + 'v391-pick-green.png' })
  await zoomShot(page, B.x0, B.y0, 'v391-pick-green-zoom.png')
  // 3. 紅色：碰到物件、座位被擋、超出範圍（四個邊）
  const O = await findSpot(page, 'overlap', { x: 380, y: 170 })
  const C = await findSpot(page, 'covered', { x: 300, y: 170 })
  const cases = [
    ['overlap', O, '離其他東西太近'],
    ['covered', C, '座位會被前面的東西擋住'],
    ['左邊', { x0: 2, y0: 165 }, '超出可以擺放的範圍'],
    ['右邊', { x0: 534, y0: 165 }, '超出可以擺放的範圍'],
    ['上面', { x0: 300, y0: 140 }, '超出可以擺放的範圍'],
    ['下面', { x0: 300, y0: 200 }, '超出可以擺放的範圍'],
  ]
  for (const [name, S, text] of cases) {
    if (!S) { ok(false, `3 找不到 ${name} 的位置`); continue }
    const c = await cursorFor(page, S.x0, S.y0)
    await page.mouse.move(c.x, c.y, { steps: 6 })
    const g = await ghost(page)
    const tag = (await page.getByTestId('picnic-pick-reason').innerText()).trim()
    ok(g && !g.ok && g.rect.x0 === S.x0 && g.rect.y0 === S.y0, `3 ${name} (${S.x0},${S.y0})：預覽紅色`)
    ok(tag === text && (await visibility(page, 'picnic-pick-reason')) === 'visible', `3 ${name}：游標旁顯示「${tag}」`)
    if (name === 'covered') {
      ok(Number.isInteger(g.seat), '3 被擋的座位編號 ' + g.seat)
      await page.screenshot({ path: SHOTS + 'v391-pick-red-covered.png' })
      await zoomShot(page, S.x0, S.y0, 'v391-pick-red-covered-zoom.png')
    }
    if (name === 'overlap') await page.screenshot({ path: SHOTS + 'v391-pick-red.png' })
  }
  // 綠 → 紅 → 綠 切換
  for (const [S, want] of [[A, true], [O, false], [A, true]]) {
    const c = await cursorFor(page, S.x0, S.y0)
    await page.mouse.move(c.x, c.y, { steps: 4 })
    ok((await ghost(page)).ok === want, `3 切換：${want ? '綠' : '紅'}`)
  }
  // 點紅色：不開始、提示原因、留在選位置
  { const c = await cursorFor(page, O.x0, O.y0); await page.mouse.click(c.x, c.y) }
  ok(await toast(page, '離其他東西太近'), '3 點紅色位置：提示原因')
  ok((await picking(page)) && !(await saved(page)).picnic.active, '3 點紅色位置：沒有開始、還在選位置')
  // 4. Esc 取消
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  ok(!(await picking(page)), '4 Esc：離開選位置')
  ok(await page.evaluate(() => !window.__farm.editing && window.__farm.picnicGhost === null && !window.__ui.getState().picnicPick), '4 Esc：寵物恢復、預覽清掉')
  const after = await saved(page)
  ok(JSON.stringify(after.picnic) === JSON.stringify(before.picnic) && after.points === before.points, '4 Esc：存檔的野餐次數與金幣不變')
  ok((await visibility(page, 'launchpad-door')) === 'visible', '4 Esc：入口恢復')
  // 取消按鈕、再按一次野餐、右鍵 也都能取消
  await startPick(page); await page.getByTestId('picnic-pick-cancel').click(); await page.waitForTimeout(150)
  ok(!(await picking(page)), '4 「取消」按鈕離開')
  await startPick(page); await page.getByTestId('picnic-button').click(); await page.waitForTimeout(150)
  ok(!(await picking(page)), '4 選位置中再按一次「野餐」= 取消')
  await startPick(page); { const c = await cursorFor(page, A.x0, A.y0); await page.mouse.click(c.x, c.y, { button: 'right' }) } await page.waitForTimeout(150)
  ok(!(await picking(page)) && !(await saved(page)).picnic.active, '4 右鍵取消、沒有開始')
  // E 不作用
  await startPick(page); await page.keyboard.press('e'); await page.waitForTimeout(150)
  ok((await picking(page)) && !(await page.getByTestId('edit-layer').isVisible().catch(() => false)), '4 選位置中按 E 不會進入編輯農場')
  // 5. 點綠色 → 開始
  chosen = B
  { const c = await cursorFor(page, B.x0, B.y0); await page.mouse.move(c.x, c.y, { steps: 5 }); await page.mouse.click(c.x, c.y) }
  ok(await toast(page, '野餐開始'), '5 點綠色位置：野餐開始')
  ok(!(await picking(page)) && (await saved(page)).picnic.active, '5 存檔有進行中的野餐、離開選位置')
  await page.waitForFunction(() => window.__farm.picnicMat() !== null, null, { timeout: 15000 }).catch(() => {})
  const mat = await page.evaluate(() => window.__farm.picnicMat())
  ok(JSON.stringify(mat) === JSON.stringify(R(B.x0, B.y0)), '5 墊子落在點的位置 ' + JSON.stringify(mat))
  ok(JSON.stringify(await page.evaluate(() => window.__ui.getState().picnicSpot)) === JSON.stringify({ x0: B.x0, y0: B.y0 }), '5 記住這個位置（uiStore）')
  ok(!JSON.stringify(await saved(page)).includes('picnicSpot'), '5 記憶不寫進存檔')
  await page.waitForFunction(() => window.__farm.picnicSeated() > 0, null, { timeout: 20000 }).catch(() => {})
  ok((await page.evaluate(() => window.__farm.picnicSeated())) > 0, '5 寵物坐到墊子上')
  await page.waitForTimeout(1500)
  // 座位範圍截圖（墊子附近放大）
  const tl = await css(page, B.x0 - 40, B.y0 - 60), br = await css(page, B.x0 + 144, B.y0 + 80)
  await page.screenshot({ path: SHOTS + 'v391-seats.png', clip: { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y } })
  // 6. 野餐中不能移動墊子：按野餐只提示「正在野餐中」；編輯農場拖墊子不會動
  await page.getByTestId('picnic-button').click({ force: true }) // 看起來停用（aria-disabled）但可以點、點了提示原因（v3.8.0 起）
  ok((await toast(page, '正在野餐中')) && !(await picking(page)), '6 野餐中按「野餐」：提示正在野餐中、不進入選位置')
  await page.getByTestId('build-button').click()
  { const c = await css(page, B.x0 + 52, B.y0 + 40); const d = await css(page, B.x0 + 152, B.y0 + 40); await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(d.x, d.y, { steps: 10 }); await page.mouse.up() }
  ok(JSON.stringify(await page.evaluate(() => window.__farm.picnicMat())) === JSON.stringify(R(B.x0, B.y0)), '6 編輯農場拖墊子：墊子不動（墊子不是擺設）')
  await page.getByTestId('edit-done').click()
  await page.waitForTimeout(300)
  ok(errors.length === 0, '1～6 沒有頁面錯誤' + (errors.length ? '：' + errors.join('｜') : ''))

  // 7. 記憶：結束 → 冷卻清掉 → 再按野餐，預覽從上次的位置開始
  await page.evaluate(() => window.__farmStore.getState().endPicnic('time'))
  await page.waitForTimeout(300)
  await clearCooldown(page)
  await page.mouse.move(5, 500) // 游標移出場景外的選單列區，避免第一個 pointermove 蓋掉初始預覽
  await startPick(page)
  const gm = await ghost(page)
  ok(gm && gm.rect.x0 === B.x0 && gm.rect.y0 === B.y0 && gm.ok, '7 再按野餐：預覽從上次選的位置開始 ' + JSON.stringify(gm?.rect))
  await page.keyboard.press('Escape')
  // 擺設改變讓那個位置不能放 → 改回自動
  await page.evaluate(async ([x, y]) => {
    const { layoutAfterMove } = await import('/src/farm/pixel/placement.ts')
    const st = window.__farmStore.getState()
    st.setFarmLayout(layoutAfterMove(st.save.ownedBuildings, st.save.farmLayout, 'stump', x, y))
  }, [B.x0 + 52, B.y0 + 50])
  await page.waitForTimeout(300)
  await startPick(page)
  const ga = await ghost(page)
  const auto = await autoRect(page)
  ok(ga && JSON.stringify(ga.rect) === JSON.stringify(auto) && JSON.stringify(auto) !== JSON.stringify(R(B.x0, B.y0)), '7 上次的位置被擺設佔住：改回自動位置 ' + JSON.stringify(ga?.rect))
  await page.keyboard.press('Escape')
  await ctx.close()
}

// ============ 8. 自動選位置 = v3.9.0；不記位置；重新整理後回到預設 ============
{
  const { ctx, page, errors } = await open(save())
  await startPick(page)
  await page.getByTestId('picnic-pick-auto').click()
  ok(await toast(page, '野餐開始'), '8 「自動選位置」一鍵開始')
  await page.waitForFunction(() => window.__farm.picnicMat() !== null, null, { timeout: 15000 }).catch(() => {})
  ok(JSON.stringify(await page.evaluate(() => window.__farm.picnicMat())) === JSON.stringify(R(384, 167)), '8 預設配置自動位置 (384,167)～(488,230)（同 v3.9.0）')
  ok((await page.evaluate(() => window.__ui.getState().picnicSpot)) === null, '8 自動選位置不記位置')
  await ctx.close()
}
{
  const { ctx, page } = await open(save())
  // 先手動選一次，重新整理後記憶消失
  await startPick(page)
  const S = await findSpot(page, 'ok', { x: 150, y: 160 })
  { const c = await cursorFor(page, S.x0, S.y0); await page.mouse.move(c.x, c.y, { steps: 4 }); await page.mouse.click(c.x, c.y) }
  ok(await toast(page, '野餐開始'), '8 手動選位置開始')
  await page.reload()
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click(); await bt.waitFor({ state: 'detached' })
  await page.locator('[data-testid="tower-window"]').waitFor({ state: 'visible' })
  await page.evaluate(() => { window.__overrides.weather = 'sunny'; window.__overrides.hour = 10 })
  ok((await page.evaluate(() => window.__ui.getState().picnicSpot)) === null, '8 重新整理後沒有記憶')
  await clearCooldown(page)
  await page.mouse.move(5, 500)
  await startPick(page)
  const g = await ghost(page)
  ok(g && g.rect.x0 === 384 && g.rect.y0 === 167, '8 重新整理後預覽回到自動位置')
  await ctx.close()
}

// ============ 9. 從編輯農場按野餐；擁擠時不進入 ============
{
  const { ctx, page, errors } = await open(save())
  await page.getByTestId('build-button').click()
  await page.getByTestId('edit-layer').waitFor({ state: 'visible' })
  await startPick(page)
  ok((await picking(page)) && !(await page.getByTestId('edit-layer').isVisible().catch(() => false)), '9 編輯農場中按野餐：離開編輯、進入選位置')
  ok(await page.evaluate(() => window.__farm.editing), '9 寵物仍暫停')
  await page.getByTestId('build-button').click()
  ok((await page.getByTestId('edit-layer').isVisible()) && !(await picking(page)), '9 選位置中按「編輯農場」：取消選位置、進入編輯')
  await page.getByTestId('edit-done').click()
  ok(errors.length === 0, '9 沒有頁面錯誤')
  await ctx.close()
}
{
  const CROWD = { items: [['coral', 165], ['planter', 260], ['stump', 355], ['rocks', 450], ['bush', 545], ['tall_grass', 608]].map(([id, x]) => ({ id, kind: id, state: 'placed', x, y: 200 })) }
  const { ctx, page } = await open(save({ farmLayout: CROWD }))
  await page.getByTestId('picnic-button').click()
  ok((await toast(page, '草地太擠')) && !(await picking(page)), '9 草地太擠：提示「草地太擠…」、不進入選位置')
  await ctx.close()
}

// ============ 10. 對話框、啟動台、工具、條件失效、寵物特殊狀態 ============
{
  const { ctx, page, errors } = await open(save())
  // 對話框開著：不進入
  await page.evaluate(() => window.__ui.getState().setAboutOpen(true))
  await page.waitForTimeout(200)
  await page.evaluate(() => window.__ui.getState().requestPicnic())
  ok((await toast(page, '請先關閉')) && !(await picking(page)), '10 「關於」對話框開著：提示先關閉、不進入')
  await page.evaluate(() => window.__ui.getState().setAboutOpen(false))
  // 啟動台開著：自動關掉再進入
  await page.evaluate(() => window.__ui.getState().setLaunchpadOpen(true))
  await page.waitForTimeout(300)
  await page.evaluate(() => window.__ui.getState().requestPicnic())
  await page.waitForTimeout(300)
  ok((await picking(page)) && !(await page.evaluate(() => window.__ui.getState().launchpadOpen)), '10 啟動台開著：關掉啟動台、進入選位置')
  await page.keyboard.press('Escape')
  // 工具開著：自動關掉再進入
  await page.evaluate(() => window.__ui.getState().setToolOpen('calc'))
  await page.waitForTimeout(300)
  await page.evaluate(() => window.__ui.getState().requestPicnic())
  await page.waitForTimeout(300)
  ok((await picking(page)) && (await page.evaluate(() => window.__ui.getState().toolOpen)) === null, '10 工具視窗開著：關掉工具、進入選位置')
  // 選位置中開工具／對話框 → 取消選位置
  await page.evaluate(() => window.__ui.getState().setToolOpen('calc'))
  await page.waitForTimeout(200)
  ok(!(await picking(page)), '10 選位置中開工具：離開選位置')
  await page.evaluate(() => window.__ui.getState().setToolOpen(null))
  await startPick(page)
  await page.evaluate(() => window.__ui.getState().setCollectionOpen(true))
  await page.waitForTimeout(200)
  ok(!(await picking(page)) && !(await page.evaluate(() => window.__farm.editing)), '10 選位置中開收藏冊：離開選位置、寵物恢復')
  await page.evaluate(() => window.__ui.getState().setCollectionOpen(false))
  // 條件失效：下雨
  await startPick(page)
  await page.evaluate(() => { window.__overrides.weather = 'rain' })
  ok((await toast(page, '下雨了')) , '10 選位置中下雨：提示原因')
  await page.waitForTimeout(300)
  ok(!(await picking(page)), '10 選位置中下雨：自動離開')
  await page.evaluate(() => { window.__overrides.weather = 'sunny' })
  // 洗澡中進入：洗澡凍結，取消後繼續；不參加這場
  const bathErr = await page.evaluate(() => window.__farm.sendToBath('p1'))
  ok(bathErr === null, '10 小柴走去洗澡')
  await page.waitForFunction(() => window.__farm.actors.get('p1').bath?.phase === 'soak', null, { timeout: 30000 }).catch(() => {})
  const ph0 = await page.evaluate(() => window.__farm.actors.get('p1').bath?.phase)
  await startPick(page)
  await page.waitForTimeout(800)
  ok((await picking(page)) && (await page.evaluate(() => window.__farm.actors.get('p1').bath?.phase)) === ph0, `10 洗澡中（${ph0}）進入選位置：洗澡凍結`)
  await page.getByTestId('picnic-pick-auto').click()
  ok(await toast(page, '野餐開始'), '10 洗澡中仍可自動開始野餐')
  const act = (await saved(page)).picnic.active
  ok(act && !act.pets.includes('p1'), '10 洗澡中的寵物不參加（v3.9.0 規則）：' + JSON.stringify(act?.pets))
  await page.waitForFunction(() => !window.__farm.actors.get('p1').bath, null, { timeout: 40000 }).catch(() => {})
  ok(await page.evaluate(() => !window.__farm.actors.get('p1').bath), '10 洗澡照常完成')
  ok(errors.length === 0, '10 沒有頁面錯誤' + (errors.length ? '：' + errors.join('｜') : ''))
  await ctx.close()
}
{
  // 拖曳中進入：先把寵物放下，不卡住
  const { ctx, page, errors } = await open(save())
  const head = await page.evaluate(() => { const a = window.__farm.actors.get('p3'); return { x: a.x, y: a.y - 15 } })
  const c = await css(page, head.x, head.y)
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 30, c.y + 10, { steps: 8 })
  await page.waitForTimeout(200)
  const dragging = await page.evaluate(() => window.__farm.isDragging())
  await page.evaluate(() => window.__ui.getState().requestPicnic())
  await page.waitForTimeout(300)
  ok(dragging && (await picking(page)) && !(await page.evaluate(() => window.__farm.isDragging())), `10 拖曳中（${dragging}）按野餐：寵物放下、進入選位置`)
  await page.mouse.up()
  await page.waitForTimeout(200)
  ok(await picking(page), '10 放開滑鼠後仍在選位置（不卡住）')
  await page.getByTestId('picnic-pick-auto').click()
  ok(await toast(page, '野餐開始'), '10 之後可以正常開始')
  ok(errors.length === 0, '10 拖曳情境沒有頁面錯誤' + (errors.length ? '：' + errors.join('｜') : ''))
  await ctx.close()
}

// ============ 11. 各種視窗大小：橫幅不出界、游標換算正確、邊緣擋下 ============
for (const [w, h, dpr] of [[1024, 768, 1], [1280, 720, 1], [1366, 768, 1], [1600, 900, 1.25], [1920, 988, 1], [2560, 1300, 1]]) {
  const { ctx, page, errors } = await open(save(), { w, h, dpr })
  await startPick(page)
  const bb = await page.getByTestId('picnic-pick-banner').boundingBox()
  ok(bb && bb.x >= 0 && bb.x + bb.width <= w && bb.y >= 28 && bb.y + bb.height <= h, `11 ${w}×${h}@${dpr} 橫幅 ${Math.round(bb.x)}～${Math.round(bb.x + bb.width)} 在視窗內`)
  const cA = await cursorFor(page, 384, 167)
  await page.mouse.move(cA.x, cA.y, { steps: 5 })
  const g = await ghost(page)
  ok(g && g.rect.x0 === 384 && g.rect.y0 === 167 && g.ok, `11 ${w}×${h}@${dpr} 游標在 (436,198.5) → 墊子 (384,167) 綠色 ` + JSON.stringify(g?.rect))
  const cE = await cursorFor(page, 8, 167)
  await page.mouse.move(cE.x, cE.y, { steps: 5 })
  const ge = await ghost(page)
  ok(ge && !ge.ok && (await page.getByTestId('picnic-pick-reason').innerText()).includes('超出'), `11 ${w}×${h}@${dpr} 靠左邊緣 → 紅色「超出」`)
  const cR = await cursorFor(page, 530, 167)
  await page.mouse.move(cR.x, cR.y, { steps: 5 })
  ok(!(await ghost(page)).ok, `11 ${w}×${h}@${dpr} 靠右邊緣 → 紅色`)
  if (w === 1024 || dpr !== 1) await page.screenshot({ path: SHOTS + `v391-pick-${w}x${h}@${dpr}.png` })
  await page.keyboard.press('Escape')
  ok(errors.length === 0, `11 ${w}×${h}@${dpr} 沒有頁面錯誤`)
  await ctx.close()
}

// ============ 12. 效能：真滑鼠掃過整個場景，影格時間與平常比較 ============
{
  const { ctx, page } = await open(save())
  const frames = (ms) => page.evaluate((ms) => new Promise((res) => { const ts = []; let last = performance.now(); const end = last + ms; const f = (t) => { ts.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(ts) }; requestAnimationFrame(f) }), ms)
  const stat = (ts) => { const s = [...ts].sort((a, b) => a - b); return { n: s.length, avg: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(2) } }
  // 對照：選位置中、游標不動
  await startPick(page)
  const idle = stat(await frames(3000))
  // 掃描：300 步來回掃過場景
  const a = await css(page, 20, 150), z = await css(page, 620, 300)
  const rec = frames(4000)
  for (let i = 0; i < 300; i++) {
    const t = i / 299
    const y = a.y + (z.y - a.y) * ((i % 30) / 29)
    await page.mouse.move(a.x + (z.x - a.x) * t, y)
  }
  const sweep = stat(await rec)
  // 判斷函式在頁面裡的耗時（把 picnicSpotCheck 包一層計時：直接量 300 個位置）
  const inPage = await page.evaluate(async () => {
    const { picnicSpotCheck } = await import('/src/farm/pixel/picnic.ts')
    const L = window.__farm.layout
    const ts = []
    for (let i = 0; i < 2000; i++) { const x = 12 + (i * 7) % 513, y = 150 + (i * 3) % 35; const t = performance.now(); picnicSpotCheck(L, { x0: x, y0: y, x1: x + 104, y1: y + 63 }); ts.push(performance.now() - t) }
    ts.sort((a, b) => a - b)
    return { avg: ts.reduce((a, b) => a + b, 0) / ts.length, p99: ts[Math.floor(ts.length * 0.99)], max: ts[ts.length - 1] }
  })
  report.push(`12 影格（ms）：選位置游標不動 ${JSON.stringify(idle)}；真滑鼠掃 300 步 ${JSON.stringify(sweep)}`)
  report.push(`12 頁面內單次判斷（ms，計時器解析度約 0.1）：平均 ${inPage.avg.toFixed(4)}、p99 ${inPage.p99.toFixed(3)}、最慢 ${inPage.max.toFixed(3)}`)
  ok(sweep.p95 <= idle.p95 + 2, `12 掃描時影格 p95 ${sweep.p95} ms ≤ 不動時 ${idle.p95} + 2`)
  ok(inPage.p99 < 0.5, `12 頁面內單次判斷 p99 ${inPage.p99.toFixed(3)} ms < 0.5`)
  await ctx.close()
}

console.log(report.join('\n'))
console.log(fail ? `v3.9.1 野餐選位置瀏覽器測試失敗 ${fail} 項` : 'v3.9.1 野餐選位置瀏覽器測試全部通過')
await b.close()
process.exit(fail ? 1 : 0)
