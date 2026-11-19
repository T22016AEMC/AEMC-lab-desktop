// B 取消小遊戲金幣（瀏覽器）：5 個遊戲實際玩（2048 中途重新開始、玩到結束），金幣不變、沒有金幣提示、遊戲館沒有「今日遊戲金幣」、沒有錯誤
import { launch, open, ok, fails, save, menuPoints, stored, toasts, sleep, SHOTS } from './lib.mjs'
import { mkdirSync } from 'node:fs'
mkdirSync(SHOTS, { recursive: true })

const b = await launch()
const { page, errors } = await open(b, save({ points: 80 }))
const p0 = await menuPoints(page)
ok(p0 === 80, `開始時金幣 80（${p0}）`)

const openHall = async () => {
  await page.getByRole('banner').getByRole('button', { name: '遊戲館' }).click()
  await page.getByTestId('game-hall').waitFor({ state: 'visible' })
}
await openHall()
ok((await page.getByTestId('game-hall-earn').count()) === 0, '遊戲館沒有「今日遊戲金幣」那一行')
ok(!(await page.getByTestId('game-hall').evaluate((el) => el.closest('div[class*="flex"]').textContent)).includes('金幣'), '遊戲館畫面沒有「金幣」字樣')
await page.screenshot({ path: SHOTS + 'tb-game-hall.png' })

const launchGame = async (id) => {
  await openHall()
  await page.locator(`[data-app-id="${id}"]`).click()
  await page.getByRole('button', { name: '開始遊戲' }).first().waitFor({ state: 'visible' })
}
const closeTop = async () => {
  // 關掉最上層視窗（遊戲視窗的關閉鈕）
  const btn = page.locator('[aria-label="關閉"]').last()
  if (await btn.count()) await btn.click().catch(() => {})
  await sleep(300)
}

// ---- 2048：開始、亂按、中途重新開始（以前會在這裡補判定上一局）、再玩到不能動或 600 步 ----
await launchGame('game-2048')
await page.getByRole('button', { name: '開始遊戲' }).first().click()
const board = page.getByTestId('board-2048')
await board.waitFor({ state: 'visible' })
const scoreOf = async () => {
  const t = await page.evaluate(() => [...document.querySelectorAll('span,div')].map((e) => e.textContent).find((x) => /^分數 \d+$/.test(x ?? '')) ?? '')
  return Number(t.replace('分數 ', '')) || 0
}
const tilesOf = () => board.evaluate((el) => el.querySelectorAll('[data-value], .tile, div').length)
const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']
for (let i = 0; i < 80; i++) { await page.keyboard.press(keys[i % 4]); await sleep(15) }
const s1 = await scoreOf()
ok(s1 > 0, `2048 亂按 80 步後分數 > 0（${s1}）`)
await page.locator('[aria-label="重新開始"]').first().click()
await sleep(300)
const s2 = await scoreOf()
ok(s2 === 0, `2048 中途重新開始：分數歸零（${s2}）`)
ok((await tilesOf()) > 0, '2048 重新開始後棋盤有方塊')
for (let i = 0; i < 40; i++) { await page.keyboard.press(keys[i % 4]); await sleep(15) }
ok((await scoreOf()) > 0, '2048 重新開始後可以繼續玩、分數增加')
let over = false
for (let i = 0; i < 1500 && !over; i++) {
  await page.keyboard.press(keys[i % 4 === 3 ? (i % 8 === 7 ? 0 : 2) : i % 4])
  if (i % 50 === 49) over = (await page.getByText('最終分數').count()) > 0
}
over = over || (await page.getByText('最終分數').count()) > 0
ok(over, '2048 玩到結束（出現最終分數）')
await page.screenshot({ path: SHOTS + 'tb-2048-over.png' })
ok((await menuPoints(page)) === 80, '2048 玩完金幣仍是 80')
await closeTop()

// ---- 貪食蛇：開始後不操作，撞牆結束 ----
await launchGame('game-snake')
await page.getByRole('button', { name: '開始遊戲' }).first().click()
await page.getByText('遊戲結束').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
ok((await page.getByText('遊戲結束').count()) > 0, '貪食蛇撞牆結束')
ok((await menuPoints(page)) === 80, '貪食蛇結束金幣仍是 80')
await closeTop()

// ---- 踩地雷：一直點格子直到結束 ----
await launchGame('game-minesweeper')
await page.getByRole('button', { name: '開始遊戲' }).first().click()
await sleep(300)
const cells = page.locator('[data-testid="ms-board"] > div')
const n = await cells.count()
let ended = false
for (let i = 0; i < Math.min(n, 400) && !ended; i++) {
  await cells.nth((i * 37) % n).click({ timeout: 2000 }).catch(() => {})
  if (i % 5 === 4) ended = (await page.locator('[data-testid="ms-board"] .bg-red-400').count()) > 0 || (await page.getByText('最終', { exact: false }).count()) > 0
}
ok(ended, `踩地雷點到結束（${n} 格）`)
ok((await menuPoints(page)) === 80, '踩地雷結束金幣仍是 80')
await closeTop()

// ---- 彈珠台、飛機打怪：開始玩 8 秒（只確認沒有錯誤、沒有金幣變動） ----
for (const id of ['game-pinball', 'game-shooter']) {
  await launchGame(id)
  await page.getByRole('button', { name: '開始遊戲' }).first().click()
  for (let i = 0; i < 40; i++) { await page.keyboard.down(i % 2 ? 'ArrowLeft' : 'Space'); await sleep(100); await page.keyboard.up(i % 2 ? 'ArrowLeft' : 'Space'); await sleep(100) }
  ok((await menuPoints(page)) === 80, `${id} 玩 8 秒金幣仍是 80`)
  await closeTop()
}

const tt = await toasts(page)
ok(!tt.some((t) => /金幣/.test(t)), `整個過程沒有任何金幣提示（${JSON.stringify(tt)}）`)
const s = await stored(page)
ok(s.points === 80 && s.earning.gameCoins === 0, `存檔金幣 80、gameCoins 0（${s.points}、${s.earning.gameCoins}）`)
ok(errors.length === 0, '沒有頁面錯誤 ' + errors.join(' | '))
await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : '全部通過')
process.exit(fails() ? 1 : 0)
