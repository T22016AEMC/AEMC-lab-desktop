// v4.0 階段 A 瀏覽器測試（dev server、Playwright＋本機 Chrome；沿用 calendar-tweaks/browser/lib.mjs）
//  1 截圖：1024／1366／1920 寬 × 商店四分類＋已擁有＋金幣不足＋農場即將開放；低視窗高度 282
//  2 商店基本：農場分頁不可點、確認步驟（品名＋金額）、取消不買、雙擊確認只買一次、金幣不足停用並說明、建築已擁有
//  3 裝飾：買 2 個 → 倉庫合併格 ×2 → 擺一個上場景 → 重新整理仍在（一個擺著、一個在倉庫）
//  4 寵物：領養走商店（確認、-15）、滿 6 隻有說明；零寵物時第一次領養流程不變（免費、不經過商店）
//  5 兩個分頁：被接手的分頁買不了；寫入前一刻被接手 → 畫面鎖定、記憶體回到購買前、儲存沒變（補充 a）
//  6 補發：2 個以上合併成一個彈窗、1 個用原彈窗、重新整理不再發；收藏冊的集齊獎勵標示
//  7 商店開著時事件先排隊，關掉商店才出現
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { launch, open, bootPage, ok, fails, save, pet, stored, sleep, KEY, WRITER } from '../../calendar-tweaks/browser/lib.mjs'
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url))
mkdirSync(SHOTS, { recursive: true })
const b = await launch()
const mem = (page) => page.evaluate(() => window.__farmStore.getState().save)
const S = (extra = {}) => save({ dataRev: 5, ownedBuildings: [], pets: [pet('p1', 'dog', 'shiba', { personality: 'lively' }), pet('p2', 'cat', 'tabby', { personality: 'lively' })], ...extra })
const openShop = async (page, tab) => {
  await page.getByTestId('shop-button').click()
  await page.getByTestId('shop-dialog').waitFor({ state: 'visible' })
  if (tab) await page.getByTestId('shop-tab-' + tab).click()
}
const boxIn = (page, id) => page.evaluate((id) => { const e = document.querySelector(`[data-testid="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight } }, id)
const inside = (q) => q && q.l >= 0 && q.t >= 0 && q.r <= q.vw + 0.5 && q.b <= q.vh + 0.5

// ---------- 1. 截圖 ----------
for (const [w, h] of [[1024, 768], [1366, 768], [1920, 988], [1366, 282], [1024, 282]]) {
  const tag = `${w}x${h}`
  // 一般（金幣 80，狗窩已擁有、買了 3 個石頭）
  const { ctx, page, errors } = await open(b, S({ points: 80, ownedBuildings: ['kennel'], shop: { decor: [1, 2, 3].map((i) => ({ id: 'rocks#' + i, kind: 'rocks' })), nextDecorId: 4 } }), { w, h })
  await openShop(page)
  for (const tab of ['pet', 'decor', 'building']) {
    await page.getByTestId('shop-tab-' + tab).click()
    await sleep(150)
    await page.screenshot({ path: SHOTS + `ta-${tag}-${tab}.png` })
    ok(inside(await boxIn(page, 'shop-dialog')), `1 ${tag} ${tab}：商店整個在視窗內`)
    ok(inside(await boxIn(page, 'shop-tab-farm')) && inside(await boxIn(page, 'shop-points')), `1 ${tag} ${tab}：分類列與金幣看得到`)
  }
  ok((await page.getByTestId('shop-has-building.kennel').count()) === 1, `1 ${tag}：狗窩顯示「已擁有」`)
  ok((await page.getByTestId('shop-tab-farm').isDisabled()) && (await page.getByTestId('shop-tab-farm').innerText()).includes('即將開放'), `1 ${tag}：農場「即將開放」、不可點`)
  await page.getByTestId('shop-tab-farm').hover({ force: true })
  await page.screenshot({ path: SHOTS + `ta-${tag}-farm.png` })
  // 低視窗：商品區在面板裡捲動，最後一個商品捲得到
  if (h < 400) {
    await page.getByTestId('shop-tab-decor').click()
    await page.getByTestId('shop-item-decor.coral').scrollIntoViewIfNeeded()
    ok(inside(await boxIn(page, 'shop-item-decor.coral')), `1 ${tag}：低視窗也捲得到最後一個商品`)
    await page.getByTestId('shop-buy-decor.coral').click()
    ok(inside(await boxIn(page, 'shop-confirm')), `1 ${tag}：確認列在視窗內`)
    await page.screenshot({ path: SHOTS + `ta-${tag}-confirm.png` })
  }
  ok(errors.length === 0, `1 ${tag}：沒有頁面錯誤 ${errors.join('｜')}`)
  await ctx.close()
  // 金幣不足（2 金幣）
  if (h >= 700) {
    const p2 = await open(b, S({ points: 2 }), { w, h })
    await openShop(p2.page, 'decor')
    ok(await p2.page.getByTestId('shop-buy-decor.rocks').isDisabled(), `1 ${tag} 金幣不足：按鈕停用`)
    ok((await p2.page.getByTestId('shop-why-decor.rocks').innerText()).includes('金幣不足（需要 6 金幣，目前 2 金幣）'), `1 ${tag} 金幣不足：說明`)
    await p2.page.screenshot({ path: SHOTS + `ta-${tag}-poor-decor.png` })
    await p2.page.getByTestId('shop-tab-building').click()
    await p2.page.screenshot({ path: SHOTS + `ta-${tag}-poor-building.png` })
    await p2.page.getByTestId('shop-tab-pet').click()
    ok(await p2.page.getByTestId('shop-adopt').isDisabled(), `1 ${tag} 金幣不足：領養停用`)
    await p2.ctx.close()
  }
}

// ---------- 2. 商店基本 ----------
{
  const { ctx, page, errors } = await open(b, S({ points: 40 }))
  await openShop(page, 'decor')
  await page.getByTestId('shop-tab-farm').click({ force: true }).catch(() => {})
  ok((await page.getByTestId('shop-tab-decor').getAttribute('aria-selected')) === 'true', '2 點農場分頁：沒有反應')
  await page.getByTestId('shop-buy-decor.planter').click()
  ok((await page.getByTestId('shop-confirm-name').innerText()) === '購買「花槽」？' && (await page.getByTestId('shop-confirm-price').innerText()).includes('10'), '2 確認列：品名與金額')
  await page.getByTestId('shop-confirm-cancel').click()
  ok((await mem(page)).points === 40 && !(await mem(page)).shop, '2 取消：沒有買')
  await page.getByTestId('shop-buy-decor.planter').click()
  await page.getByTestId('shop-confirm-ok').dblclick()
  await sleep(400)
  const s = await stored(page)
  ok(s.points === 30 && s.shop.decor.length === 1 && s.dataRev === 6, '2 雙擊確認：只買一次、立刻寫入（' + JSON.stringify([s.points, s.shop]) + '）')
  ok((await page.getByTestId('shop-notice').innerText()).includes('已放進倉庫，到編輯農場擺放'), '2 購買成功提示')
  ok((await page.getByTestId('shop-owned-decor.planter').innerText()).includes('擁有 1／10'), '2 擁有數更新')
  await page.getByTestId('shop-tab-building').click()
  await page.getByTestId('shop-buy-building.kennel').click()
  await page.getByTestId('shop-confirm-ok').click()
  await sleep(300)
  ok((await page.getByTestId('shop-has-building.kennel').count()) === 1 && (await page.getByTestId('shop-buy-building.kennel').isDisabled()), '2 建築買過：已擁有、不能再買')
  ok((await mem(page)).points === 10 && (await mem(page)).ownedBuildings.includes('kennel'), '2 建築 -20')
  await page.screenshot({ path: SHOTS + 'ta-owned-building.png' })
  await page.keyboard.press('Escape')
  ok((await page.getByTestId('shop-dialog').count()) === 0, '2 Esc 關閉商店')
  ok(errors.length === 0, '2 沒有頁面錯誤 ' + errors.join('｜'))
  await ctx.close()
}

// ---------- 3. 裝飾：倉庫合併格、擺上場景、重新整理 ----------
{
  const { ctx, page, errors } = await open(b, S({ points: 50 }), { w: 1920, h: 988 })
  await openShop(page, 'decor')
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('shop-buy-decor.rocks').click()
    await page.getByTestId('shop-confirm-ok').click()
    await sleep(250)
  }
  await page.getByTestId('shop-notice-go').click()
  await page.getByTestId('edit-layer').waitFor({ state: 'visible' })
  ok((await page.getByTestId('inv-buy-rocks').getAttribute('data-count')) === '2' && (await page.getByTestId('inv-count-buy-rocks').innerText()).includes('×2'), '3 倉庫：買的兩個石頭合併成一格 ×2')
  await page.screenshot({ path: SHOTS + 'ta-inventory.png' })
  // 拖一個到場景：依序試幾個草地上的位置，直到放得下（不合法會退回倉庫）
  const dragTo = async (x, y) => {
    const inv = await page.getByTestId('inv-buy-rocks').boundingBox()
    const to = await page.evaluate(([x, y]) => { const e = window.__farm, M = window.__layout, c = document.querySelector('canvas').getBoundingClientRect(), q = M.toCss(e.layout, x, y - 5); return { x: q.x + c.left, y: q.y + c.top } }, [x, y])
    await page.mouse.move(inv.x + inv.width / 2, inv.y + inv.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 15 })
    await page.mouse.up()
    await sleep(350)
  }
  for (const [x, y] of [[330, 215], [420, 205], [250, 230], [480, 235], [520, 190], [200, 200]]) {
    await dragTo(x, y)
    if ((await stored(page)).farmLayout?.items.some((it) => it.id.startsWith('rocks#'))) break
  }
  const st = await stored(page)
  const placedRec = st.farmLayout?.items.find((it) => it.id === 'rocks#1') // 倉庫拿編號最小的那個
  ok(!!placedRec && placedRec.state === 'placed', '3 拖一個石頭到場景：寫入擺放紀錄 ' + JSON.stringify(placedRec))
  ok((await page.getByTestId('inv-buy-rocks').count()) === 1 && (await page.getByTestId('inv-count-buy-rocks').count()) === 0, '3 倉庫剩 1 個')
  await page.reload()
  await bootPage(page)
  const P = await page.evaluate(() => { const p = window.__farm.layout.placement; return { placed: p.placed.has('rocks#1'), stored: p.stored.has('rocks#2') } })
  ok(P.placed && P.stored, '3 重新整理：一個擺著、一個在倉庫')
  await page.getByTestId('build-button').click()
  ok((await page.getByTestId('inv-buy-rocks').count()) === 1, '3 重新整理後倉庫裡還有')
  await page.screenshot({ path: SHOTS + 'ta-placed-reload.png' })
  ok(errors.length === 0, '3 沒有頁面錯誤 ' + errors.join('｜'))
  await ctx.close()
}

// ---------- 4. 寵物 ----------
{
  const { ctx, page, errors } = await open(b, S({ points: 40 }))
  await openShop(page, 'pet')
  await page.locator('#adopt-name').fill('小柯')
  await page.getByTestId('shop-adopt').click()
  ok((await page.getByTestId('shop-confirm-name').innerText()).includes('領養「小柯」'), '4 領養確認：名字')
  await page.getByTestId('shop-confirm-ok').click()
  await sleep(300)
  const s = await stored(page)
  ok(s.pets.length === 3 && s.points === 25, '4 領養走商店：3 隻、-15')
  await ctx.close()
  const six = await open(b, S({ points: 99, pets: [1, 2, 3, 4, 5, 6].map((i) => pet('p' + i, 'dog', 'shiba', { personality: 'lively' })) }))
  await openShop(six.page, 'pet')
  ok((await six.page.getByTestId('shop-pets-full').innerText()).includes('最多 6 隻'), '4 滿 6 隻：說明')
  await six.page.screenshot({ path: SHOTS + 'ta-pets-full.png' })
  await six.ctx.close()
  // 零寵物：第一次領養流程（免費、不經過商店）
  const z = await open(b, null)
  await z.page.getByRole('dialog', { name: '選擇你的第一隻寵物' }).waitFor({ state: 'visible' })
  ok((await z.page.getByText('第一隻免費').count()) >= 1, '4 沒有存檔：第一次領養對話框')
  await z.page.getByRole('button', { name: '開始養殖場' }).click()
  await sleep(400)
  const zs = await mem(z.page)
  ok(zs.pets.length === 1 && zs.points === 50, '4 第一隻免費（50 金幣不變）')
  ok((await z.page.getByTestId('shop-dialog').count()) === 0, '4 第一次領養不開商店')
  ok(errors.length === 0 && z.errors.length === 0, '4 沒有頁面錯誤')
  await z.ctx.close()
}

// ---------- 5. 兩個分頁 ----------
{
  const { ctx, page } = await open(b, S({ points: 50 }))
  await openShop(page, 'decor')
  const pageB = await ctx.newPage()
  await pageB.goto(process.env.NEW_URL ?? 'http://localhost:5181/')
  await bootPage(pageB)
  await sleep(500)
  ok((await page.getByTestId('other-tab-notice').count()) === 1, '5 另一個分頁接手：原分頁畫面鎖定')
  const before = await stored(page)
  await page.evaluate(async () => window.__farmStore.getState().purchase('decor.rocks'))
  ok(JSON.stringify(await stored(page)) === JSON.stringify(before), '5 被接手的分頁：買不了、儲存不變')
  await ctx.close()
}
{
  // 補充 a：確認之後、寫入前一刻被別的分頁接手
  const { ctx, page } = await open(b, S({ points: 50 }))
  await openShop(page, 'decor')
  await page.getByTestId('shop-buy-decor.coral').click()
  const disk = await page.evaluate((k) => localStorage.getItem(k), KEY)
  const memBefore = await mem(page)
  await page.evaluate(([k, w]) => {
    const real = Storage.prototype.getItem
    window.__armed = false
    document.addEventListener('click', (e) => { if (e.target?.closest?.('[data-testid="shop-confirm-ok"]')) window.__armed = true }, true)
    Storage.prototype.getItem = function (key) {
      // 確認之後第一次讀存檔（寫入前的檢查）：讓另一個分頁接手
      if (window.__armed && key === k) { window.__armed = false; window.__raced = true; this.setItem(w, JSON.stringify({ id: 'other-tab', at: Date.now() })) }
      return real.call(this, key)
    }
  }, [KEY, WRITER])
  await page.getByTestId('shop-confirm-ok').click()
  await sleep(500)
  ok(await page.evaluate(() => window.__raced === true), '5a 接手發生在寫入的那一刻')
  ok((await page.getByTestId('other-tab-notice').count()) === 1, '5a 畫面鎖定（被接手）')
  const after = await mem(page)
  ok(after.points === memBefore.points && !after.shop, '5a 記憶體回到購買前（' + after.points + '）')
  ok((await page.evaluate((k) => localStorage.getItem(k), KEY)) === disk, '5a 儲存的資料沒變')
  await page.screenshot({ path: SHOTS + 'ta-race-locked.png' })
  await ctx.close()
}

// ---------- 6. 補發與收藏冊 ----------
const ALL = {}
for (const id of ['C001', 'C002', 'C003', 'C004', 'C005', 'C006', 'C007', 'C008', 'C009', 'C010', 'R001', 'R002', 'R003', 'R004', 'R005']) ALL[id] = 1
{
  const { ctx, page, errors } = await open(b, S({ points: 10, collection: ALL }))
  await page.getByTestId('event-dialog').waitFor({ state: 'visible' })
  ok((await page.getByTestId('event-dialog').getAttribute('data-event')) === 'retroBatch', '6 補發 2 個：合併彈窗')
  const body = await page.getByTestId('event-dialog').innerText()
  ok(body.includes('更新補發：收藏冊的集齊獎勵') && !body.includes('（更新補發）') && body.includes('+15') && body.includes('+50') && body.includes('合計 +65'), '6 合併彈窗：開頭、各項、合計')
  await page.screenshot({ path: SHOTS + 'ta-retro-batch.png' })
  await page.getByTestId('event-ok').click()
  ok((await page.getByTestId('event-dialog').count()) === 0 && (await stored(page)).points === 75, '6 一個彈窗就結束、金幣寫入')
  await page.reload()
  await bootPage(page)
  await sleep(500)
  ok((await page.getByTestId('event-dialog').count()) === 0 && (await mem(page)).points === 75, '6 重新整理：不再發')
  await page.getByTestId('collection-button').click()
  ok((await page.getByTestId('reward-badge-common').getAttribute('data-claimed')) === 'true' && (await page.getByTestId('reward-badge-uncommon').getAttribute('data-claimed')) === null, '6 收藏冊：常見已領取、少見未領')
  ok(!(await page.getByTestId('collection-dialog').innerText()).match(/罰款|違約/), '6 收藏冊沒有罰款字樣')
  await page.screenshot({ path: SHOTS + 'ta-collection-badges.png' })
  ok(errors.length === 0, '6 沒有頁面錯誤 ' + errors.join('｜'))
  await ctx.close()
  const one = await open(b, S({ points: 10, collection: Object.fromEntries(Object.entries(ALL).filter(([k]) => k.startsWith('C'))) }))
  await one.page.getByTestId('event-dialog').waitFor({ state: 'visible' })
  ok((await one.page.getByTestId('event-dialog').getAttribute('data-event')) === 'colCommon' && (await one.page.getByTestId('event-body').innerText()).startsWith('更新補發：'), '6 只補發 1 個：原彈窗加「更新補發：」')
  await one.page.screenshot({ path: SHOTS + 'ta-retro-one.png' })
  await one.ctx.close()
}

// ---------- 7. 商店開著時事件先排隊 ----------
{
  const { ctx, page } = await open(b, S({ points: 10 }))
  await openShop(page, 'decor')
  await page.evaluate(() => window.__farmStore.setState({ pendingEvents: [{ id: 'colRare', coins: 50 }] }))
  await sleep(300)
  ok((await page.getByTestId('event-dialog').count()) === 0, '7 商店開著：事件彈窗先不出現')
  await page.keyboard.press('Escape')
  await page.getByTestId('event-dialog').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  ok((await page.getByTestId('event-dialog').count()) === 1, '7 關掉商店：事件彈窗出現')
  await ctx.close()
}

console.log(fails() ? `v4.0 階段 A 瀏覽器測試失敗 ${fails()} 項` : 'v4.0 階段 A 瀏覽器測試全部通過')
await b.close()
process.exit(fails() ? 1 : 0)
