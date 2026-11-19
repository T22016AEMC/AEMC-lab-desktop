// 第五階段瀏覽器實測（新版 5181，真滑鼠）：農場（擺設）模式
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
{
  const { ctx, page, errors } = await open(save())
  // 1. 進入：按鈕叫「農場」
  ok((await page.getByTestId('build-button').innerText()).trim() === '編輯農場', '1 選單列按鈕改名「編輯農場」')
  const before = await page.evaluate(() => [...window.__farm.actors.values()].map((a) => [a.id, a.x, a.y]))
  await page.getByTestId('build-button').click()
  ok(await inEdit(page), '1 按「農場」進入擺設模式')
  // 2. 寵物暫停
  await page.waitForTimeout(2500)
  const after = await page.evaluate(() => [...window.__farm.actors.values()].map((a) => [a.id, a.x, a.y]))
  const moved = after.filter((a, i) => Math.hypot(a[1] - before[i][1], a[2] - before[i][2]) > 0.01)
  ok(await page.evaluate(() => window.__farm.editing) && moved.length <= after.length, '2 擺設模式：引擎暫停（editing）')
  const p0 = await page.evaluate(() => [...window.__farm.actors.values()].map((a) => [a.x, a.y]))
  await page.waitForTimeout(2500)
  const p1 = await page.evaluate(() => [...window.__farm.actors.values()].map((a) => [a.x, a.y]))
  ok(p0.every((p, i) => p[0] === p1[i][0] && p[1] === p1[i][1]), '2 擺設模式 2.5 秒內寵物位置完全不動')
  // 3. 入口隱藏、點不到
  ok(await page.getByTestId('launchpad-door').evaluate((el) => getComputedStyle(el).visibility === 'hidden'), '3 住家門的入口隱藏')
  ok(await page.getByTestId('tower-window').evaluate((el) => getComputedStyle(el).visibility === 'hidden'), '3 窗戶（計算機）入口隱藏')
  const door = await page.evaluate(() => { const e = window.__farm, M = window.__layout, L = e.layout, d = M.doorRect(L), c = document.querySelector('canvas').getBoundingClientRect(), q = M.toCss(L, (d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2); return { x: q.x + c.left, y: q.y + c.top } })
  await page.mouse.click(door.x, door.y)
  await page.waitForTimeout(300)
  ok((await page.getByTestId('launchpad-earn').count()) === 0, '3 點住家門不會開啟動台')
  ok(await page.evaluate(() => window.__farm.hover.blocked === true), '3 滑鼠互動關閉')
  // 4. 拖路燈到合法位置
  let pl = await plan(page, 'lamp', { x: 470, y: 300 })
  await dragMouse(page, pl.from, pl.to)
  let s = await saved(page)
  const lampRec = s.farmLayout?.items.find((it) => it.id === 'lamp')
  ok(lampRec && lampRec.x === pl.target.x && lampRec.y === pl.target.y, `4 拖路燈到 (${pl.target.x},${pl.target.y})：存檔記下新位置 ${JSON.stringify(lampRec)}`)
  ok(JSON.stringify(await posOf(page, 'lamp')) === JSON.stringify(pl.target), '4 畫面上路燈在新位置')
  // 5. 把狗窩拖到鐘樓門前（不合法）：拖曳中顯示紅色原因、放開退回
  pl = await plan(page, 'kennel', { any: true, x: 560, y: 196 })
  await page.mouse.move(pl.from.x, pl.from.y)
  await page.mouse.down()
  await page.mouse.move(pl.to.x, pl.to.y, { steps: 16 })
  await page.waitForTimeout(150)
  const reason = await page.getByTestId('edit-reason').innerText().catch(() => '')
  const ghost = await page.evaluate(() => window.__farm.editGhost)
  ok(reason.length > 0 && ghost && ghost.ok === false, `5 拖到不能放的地方：紅色、原因「${reason}」`)
  await page.screenshot({ path: SHOTS + 'v390-s5-drag-invalid.png' })
  await page.mouse.up()
  await page.waitForTimeout(250)
  ok(JSON.stringify(await posOf(page, 'kennel')) === JSON.stringify(pl.start), '5 放開：狗窩退回原位')
  ok(await toast(page, reason), '5 放開：提示同一句原因')
  s = await saved(page)
  ok(!s.farmLayout.items.some((it) => it.id === 'kennel'), '5 存檔沒有記錄狗窩')
  // 合法拖曳中的截圖（綠框）
  pl = await plan(page, 'rocks', { x: 330, y: 220 })
  await page.mouse.move(pl.from.x, pl.from.y); await page.mouse.down(); await page.mouse.move(pl.to.x, pl.to.y, { steps: 12 }); await page.waitForTimeout(150)
  ok(await page.evaluate(() => window.__farm.editGhost?.ok === true), '4b 拖到合法位置時是綠色（ghost ok）')
  await page.screenshot({ path: SHOTS + 'v390-s5-drag-valid.png' })
  // 6. 拖曳中按 Esc：取消
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(250)
  ok(JSON.stringify(await posOf(page, 'rocks')) === JSON.stringify(pl.start), '6 拖曳中按 Esc：石頭退回原位')
  ok(!(await saved(page)).farmLayout.items.some((it) => it.id === 'rocks'), '6 Esc：存檔不變')
  ok(await inEdit(page), '6 拖曳中按 Esc 不會離開擺設模式')
  // 7. 拖石頭到庫存列 → 收進庫存；再從庫存拖回場景
  pl = await plan(page, 'rocks', null)
  const inv = await page.getByTestId('edit-inventory').boundingBox()
  await dragMouse(page, pl.from, { x: inv.x + inv.width / 2, y: inv.y + inv.height / 2 })
  ok((await page.getByTestId('inv-rocks').count()) === 1 && (await posOf(page, 'rocks')) === null, '7 拖到倉庫列：石頭收進倉庫')
  ok(await toast(page, '石頭已收進倉庫'), '7 提示「石頭已收進倉庫」')
  ok((await saved(page)).farmLayout.items.some((it) => it.id === 'rocks' && it.state === 'stored'), '7 存檔記下石頭在庫存')
  await page.screenshot({ path: SHOTS + 'v390-s5-inventory.png' })
  const tgt = await page.evaluate(async () => {
    const { canPlace } = await import('/src/farm/pixel/placeRules.ts')
    const L = window.__farm.layout, M = window.__layout, c = document.querySelector('canvas').getBoundingClientRect()
    for (let x = 300; x < 560; x += 4) for (const y of [215, 225, 205]) if (canPlace(L, 'rocks', x, y).ok) { const q = M.toCss(L, x, y - 17); return { foot: { x, y }, css: { x: q.x + c.left, y: q.y + c.top } } }
    return null
  })
  const ib = await page.getByTestId('inv-rocks').boundingBox()
  await dragMouse(page, { x: ib.x + ib.width / 2, y: ib.y + ib.height / 2 }, tgt.css, { steps: 20 })
  const rp = await posOf(page, 'rocks')
  ok(rp && Math.abs(rp.x - tgt.foot.x) <= 1 && Math.abs(rp.y - tgt.foot.y) <= 1, `7 從庫存拖回場景：石頭擺在 ${JSON.stringify(rp)}`)
  ok((await page.getByTestId('inv-rocks').count()) === 0, '7 庫存列裡不再有石頭')
  // 住家拖到庫存列：不能收
  pl = await plan(page, 'house', null)
  const inv2 = await page.getByTestId('edit-inventory').boundingBox()
  await dragMouse(page, pl.from, { x: inv2.x + inv2.width / 2, y: inv2.y + inv2.height / 2 })
  ok(await toast(page, '住家不能收進倉庫'), '7 住家拖到倉庫列：提示「住家不能收進倉庫」')
  ok(JSON.stringify(await posOf(page, 'house')) === JSON.stringify(pl.start), '7 住家還在原位')
  // 8. 點一下樹樁（沒拖）→ 小卡片 → 收進庫存
  pl = await plan(page, 'stump', null)
  await page.mouse.move(pl.from.x, pl.from.y); await page.mouse.down(); await page.mouse.move(pl.from.x + 2, pl.from.y + 2); await page.mouse.up()
  ok(await page.getByTestId('edit-card').isVisible(), '8 點一下（移動 2.8 像素 < 4）：選取並顯示小卡片')
  await page.getByTestId('edit-store').click()
  ok((await page.getByTestId('inv-stump').count()) === 1, '8 按「收進庫存」：樹樁進庫存')
  pl = await plan(page, 'pond', null)
  await page.mouse.click(pl.from.x, pl.from.y)
  ok(await page.getByTestId('edit-cant-store').isVisible(), '8 點池塘：卡片顯示不能收進庫存')
  await page.keyboard.press('Escape')
  ok(await inEdit(page) && !(await page.getByTestId('edit-card').isVisible().catch(() => false)), '8 Esc：先取消選取（不離開模式）')
  // 9. 還原預設
  await page.getByTestId('edit-restore').click()
  ok(await page.getByTestId('edit-confirm').isVisible(), '9 還原預設：先跳確認視窗')
  await page.screenshot({ path: SHOTS + 'v390-s5-confirm.png' })
  await page.getByTestId('restore-cancel').click()
  ok((await saved(page)).farmLayout?.items.length > 0, '9 取消：擺設不變')
  // 先把珊瑚擺到場上，確認還原會收回
  const ci = await page.getByTestId('inv-coral').boundingBox()
  const ct = await page.evaluate(async () => { const { canPlace } = await import('/src/farm/pixel/placeRules.ts'); const L = window.__farm.layout, M = window.__layout, c = document.querySelector('canvas').getBoundingClientRect(); for (let x = 300; x < 560; x += 4) for (const y of [215, 230]) if (canPlace(L, 'coral', x, y).ok) { const q = M.toCss(L, x, y - 35); return { x: q.x + c.left, y: q.y + c.top } } return null })
  await dragMouse(page, { x: ci.x + ci.width / 2, y: ci.y + ci.height / 2 }, ct, { steps: 20 })
  ok((await posOf(page, 'coral')) !== null, '9 準備：珊瑚擺到場上')
  await page.getByTestId('edit-restore').click()
  await page.getByTestId('restore-ok').click()
  await page.waitForTimeout(250)
  s = await saved(page)
  ok(!('farmLayout' in s), '9 確定：存檔的擺放紀錄拿掉（全部預設）')
  const inventory = await page.evaluate(() => [...window.__farm.layout.placement.stored].sort())
  ok(JSON.stringify(inventory) === JSON.stringify(['bush', 'coral', 'planter', 'tall_grass']), '9 還原後庫存：花槽、珊瑚、灌木、高草叢（' + inventory.join(',') + '）')
  ok(JSON.stringify(await posOf(page, 'lamp')) === JSON.stringify({ x: 171, y: 308 }) && JSON.stringify(await posOf(page, 'stump')) === JSON.stringify({ x: 451, y: 146 }), '9 路燈、樹樁回到預設位置')
  // 離開：Esc
  await page.keyboard.press('Escape')
  ok(!(await inEdit(page)), '1 Esc 離開擺設模式')
  ok(await page.getByTestId('launchpad-door').evaluate((el) => getComputedStyle(el).visibility === 'visible'), '3 離開後住家門的入口恢復')
  // E 快捷鍵：進出
  await page.mouse.click(5, 300) // 焦點在頁面上
  await page.keyboard.press('e')
  ok(await inEdit(page), 'D 按 E 進入擺設模式')
  await page.keyboard.press('E')
  ok(!(await inEdit(page)), 'D 再按 E（大寫）離開')
  await page.keyboard.press('Control+e')
  ok(!(await inEdit(page)), 'D Ctrl+E 不觸發')
  // 計算機裡按 e：不觸發
  await page.getByTestId('tower-window').click()
  await page.getByRole('dialog', { name: '計算機' }).waitFor({ state: 'visible' })
  await page.keyboard.press('e')
  ok(!(await inEdit(page)), 'D 計算機開著時按 e 不觸發（輸入的是常數 e）')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  // 公佈欄輸入框裡打 e：不觸發
  await page.getByTestId('bulletin-board').click()
  const board = page.getByRole('dialog', { name: '公佈欄' })
  await board.waitFor({ state: 'visible' })
  const input = board.locator('input, textarea').first()
  if (await input.count()) { await input.click(); await page.keyboard.type('eee') }
  ok(!(await inEdit(page)), 'D 在輸入框打 e 不觸發')
  await page.keyboard.press('Escape')
  ok(errors.length === 0, '主流程沒有頁面錯誤' + (errors.length ? '：' + errors.join('｜') : ''))
  await ctx.close()
}

// ============ 10. 預設位置被佔時購買：放進庫存並提示 ============
// v4.0：建築改在商店購買（商店 → 建築 → 購買 → 確定購買）；斷言不變，只換操作入口。購買分頁專屬的斷言（虛線框）刪除
const buyInShop = async (page, item) => {
  await page.getByTestId('shop-button').click()
  await page.getByTestId('shop-tab-building').click()
  await page.getByTestId('shop-buy-' + item).click()
  await page.getByTestId('shop-confirm-ok').click()
  await page.getByTestId('shop-notice').waitFor({ state: 'visible' })
}
{
  const s0 = save({ ownedBuildings: ['bowls', 'catTree'], farmLayout: { items: [{ id: 'coral', kind: 'coral', state: 'placed', x: 226, y: 266 }] } })
  const { ctx, page, errors } = await open(s0)
  await buyInShop(page, 'building.kennel')
  const notice = await page.getByTestId('shop-notice').innerText().catch(() => '')
  ok(notice.includes('已放進倉庫') && notice.includes('從倉庫拿出來擺'), '10 預設位置被珊瑚佔住：商店出現提示「' + notice.split('\n')[0] + '」')
  await page.waitForTimeout(3600)
  ok(await page.getByTestId('shop-notice').isVisible(), '10 提示不會自動消失（3.6 秒後還在）')
  await page.screenshot({ path: SHOTS + 'v390-s5b-buy-notice.png' })
  await page.getByTestId('shop-notice-go').click()
  ok(await page.getByTestId('edit-layer').isVisible(), '10 按「到編輯農場擺放」：進入編輯農場')
  const s = await saved(page)
  ok(s.ownedBuildings.includes('kennel') && s.points === 60 && s.farmLayout.items.some((it) => it.id === 'kennel' && it.state === 'stored'), '10 已購買、扣 20 金幣、擺放紀錄是庫存')
  ok((await page.getByTestId('inv-kennel').count()) === 1, '10 倉庫列有狗窩')
  ok(errors.length === 0, '10 沒有頁面錯誤')
  await ctx.close()
}
{
  // 對照：預設位置空著 → 直接擺上去
  const { ctx, page } = await open(save({ ownedBuildings: ['bowls', 'catTree'] }))
  await buyInShop(page, 'building.kennel')
  await page.waitForTimeout(300)
  ok(!(await page.getByTestId('shop-notice').innerText()).includes('已放進倉庫'), '10 對照：預設位置空著不出現「放進倉庫」提示')
  ok(JSON.stringify(await posOf(page, 'kennel')) === JSON.stringify({ x: 226, y: 271 }), '10 對照：預設位置空著 → 直接擺在預設位置')
  ok(!(await saved(page)).farmLayout, '10 對照：不需要擺放紀錄')
  await ctx.close()
}

// ============ 11. 野餐中進入擺設模式 ============
{
  // 進行中的野餐在載入時一律直接結束（v3.8.0 的規則），所以用選單列的「野餐」實際開始一場
  const { ctx, page, errors } = await open(save())
  await page.getByTestId('picnic-button').click()
  // v3.9.1：按「野餐」先進入選位置，「自動選位置」= v3.9.0 的行為
  await page.getByTestId('picnic-pick-auto').click()
  ok(await toast(page, '野餐開始'), '11 開始野餐')
  await page.waitForFunction(() => window.__farm.picnicMat() !== null, null, { timeout: 15000 }).catch(() => {})
  const mat = await page.evaluate(() => window.__farm.picnicMat())
  ok(mat, '11 野餐墊已經鋪好：' + JSON.stringify(mat))
  await page.getByTestId('build-button').click()
  ok(await toast(page, '野餐進行中'), '11 野餐中進入擺設模式：提示離開時可能提前結束')
  // 把石頭拖到墊子中間（擺放規則不看墊子，所以可以放）
  const pl = await plan(page, 'rocks', { x: Math.round((mat.x0 + mat.x1) / 2), y: Math.round(mat.y0 + 40) })
  await dragMouse(page, pl.from, pl.to)
  ok(JSON.stringify(await page.evaluate(() => window.__farm.picnicMat())) === JSON.stringify(mat), '11 擺設模式中墊子位置固定不跳')
  ok((await saved(page)).picnic.active, '11 擺設模式中野餐還在進行')
  await page.getByTestId('edit-done').click()
  ok(await toast(page, '擺設太多'), '11 離開時放不下墊子：提前結束野餐並提示「草地太擠」（v4.0：「擺設太多」）')
  await page.waitForTimeout(300)
  ok(!(await saved(page)).picnic.active, '11 存檔的野餐已結束')
  ok(errors.length === 0, '11 沒有頁面錯誤')
  await ctx.close()
}

// ============ 12. 1024 寬的選單列不換行 ============
for (const [w, h] of [[1024, 768], [1280, 720]]) {
  const { ctx, page } = await open(save(), { w, h })
  const hdr = await page.locator('header').boundingBox()
  ok(hdr.height <= 30, `12 ${w}×${h} 選單列高 ${hdr.height}（一行）`)
  await page.getByTestId('build-button').click()
  await page.screenshot({ path: SHOTS + `v390-s5b-menubar-${w}.png` })
  ok((await page.locator('header').boundingBox()).height <= 30, `12 ${w}×${h} 擺設模式中選單列仍一行`)
  await ctx.close()
}

// ============ 13. 分頁（第五階段補強） ============
// v4.0：編輯農場拿掉購買分頁，只留擺放。分頁切換、購買分頁的說明／遮罩／記住上次分頁等專屬斷言刪除；其餘保留
{
  const { ctx, page, errors } = await open(save())
  await page.getByTestId('build-button').click()
  ok((await page.getByTestId('farm-tab-buy').count()) === 0 && (await page.getByTestId('farm-tab-edit').count()) === 0, '13 v4.0：編輯農場沒有分頁')
  ok((await page.getByTestId('edit-hint').innerText()) === '拖曳移動，拖到倉庫收起', '13 編輯分頁說明一句')
  ok((await page.getByTestId('edit-done').getAttribute('title')) === '完成（E 或 Esc）', '13 「完成」的滑鼠提示「完成（E 或 Esc）」')
  ok((await page.getByTestId('build-button').getAttribute('title')) === '編輯農場：移動擺設（E 進出）；建築在商店購買', '13 選單列按鈕的滑鼠提示（v4.0：建築在商店購買）')
  ok((await page.locator('[data-testid^="slot-"]').count()) === 0, '13 沒有購買虛線框')
  ok((await page.getByTestId('edit-inventory').isVisible()) && (await page.getByTestId('edit-restore').isVisible()), '13 有倉庫列、還原預設')
  ok(errors.length === 0, '13 沒有頁面錯誤' + (errors.length ? '：' + errors.join('｜') : ''))
  await ctx.close()
}

// ============ 14. 橫幅與倉庫列不出界（6 種視窗 × 兩個分頁） ============
for (const [w, h, d] of [[1880, 860, 1], [1880, 740, 1], [1880, 700, 1], [1504, 590, 1.25], [1024, 768, 1], [1280, 720, 1]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: d })
  await ctx.addInitScript(([s, k]) => { if (sessionStorage.getItem('__s')) return; localStorage.setItem(k, s); localStorage.setItem('aemc-desktop:settings', JSON.stringify({ lastExportAt: Date.now(), remindOff: true, lastRemindDate: '' })); sessionStorage.setItem('__s', '1') }, [JSON.stringify(save({ ownedBuildings: ['bowls'] })), KEY])
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  await page.goto(URL0)
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click()
  await bt.waitFor({ state: 'detached' })
  await page.locator('[data-testid="tower-window"]').waitFor({ state: 'visible' })
  await page.getByTestId('build-button').click()
  for (const tab of ['edit']) { // v4.0：沒有購買分頁
    await page.waitForTimeout(200)
    const r = await page.evaluate(() => {
      const box = (id) => { const e = document.querySelector(`[data-testid="${id}"]`); if (!e) return null; const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, sw: e.scrollWidth, cw: e.clientWidth } }
      return { vw: innerWidth, vh: innerHeight, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, banner: box('edit-banner'), inv: box('edit-inventory') }
    })
    const inside = (q) => q && q.l >= 0 && q.t >= 0 && q.r <= r.vw && q.b <= r.vh && q.sw <= q.cw + 1
    const invTxt = r.inv ? `、倉庫列 ${Math.round(r.inv.l)}～${Math.round(r.inv.r)}×${Math.round(r.inv.t)}～${Math.round(r.inv.b)}` : ''
    ok(inside(r.banner) && (tab === 'buy' ? r.inv === null : inside(r.inv)) && r.docW <= r.vw && r.docH <= r.vh, `14 ${w}×${h}@${d} ${tab === 'buy' ? '購買' : '編輯'}分頁：橫幅 ${Math.round(r.banner.l)}～${Math.round(r.banner.r)}×${Math.round(r.banner.t)}～${Math.round(r.banner.b)}${invTxt}，都在 ${r.vw}×${r.vh} 內`)
    await page.screenshot({ path: SHOTS + `v390-s5b-bounds-${w}x${h}@${d}-${tab}.png` })
  }
  await ctx.close()
}

console.log(fail ? `第五階段瀏覽器實測失敗 ${fail} 項` : '第五階段瀏覽器實測全部通過')
await b.close()
process.exit(fail ? 1 : 0)
