// 第四階段瀏覽器測試：擁擠草地按野餐 → 「草地太擠」；建築收進庫存 → 建築模式不出現購買框、買不了
import { chromium } from 'playwright-core'
const URL0 = (process.env.NEW_URL ?? 'http://localhost:5181/')
const KEY = 'aemc-desktop:farm-save'
const T0 = new Date(2026, 10, 19, 10, 0, 0).getTime()
const today = '2026-11-19'
const pet = (id, species, variant) => ({ id, species, variant, name: id, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 90, personality: 'calm', lastInteract: T0 })
const save = (owned, layout) => ({
  schemaVersion: 5, dataRev: 4, points: 80, lastSeen: T0, lastDailyClaim: today, gifts: { date: today, count: 9 }, nextPetId: 3, createdAt: T0 - 9e8,
  pets: [pet('p1', 'dog', 'shiba'), pet('p2', 'cat', 'orange')], ownedBuildings: owned, earning: { date: today, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 }, bowl: { date: today, used: 1 },
  collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: today, count: 0, lastEnd: 0 }, farmLayout: layout,
})
const CROWD = { items: [['coral', 165], ['planter', 260], ['stump', 355], ['rocks', 450], ['bush', 545], ['tall_grass', 608]].map(([id, x]) => ({ id, kind: id, state: 'placed', x, y: 200 })) }
let fail = 0
const ok = (c, m) => { console.log((c ? '通過 ' : '失敗 ') + m); if (!c) fail++ }
const b = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
async function open(s) {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 988 } })
  await ctx.addInitScript(([s, k]) => { if (sessionStorage.getItem('__s')) return; localStorage.setItem(k, s); localStorage.setItem('aemc-desktop:settings', JSON.stringify({ lastExportAt: Date.now(), remindOff: true, lastRemindDate: '' })); sessionStorage.setItem('__s', '1') }, [JSON.stringify(s), KEY])
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  await page.clock.install({ time: T0 })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL0)
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click(); await bt.waitFor({ state: 'detached' })
  await page.locator('[data-testid="tower-window"]').waitFor({ state: 'visible' })
  await page.evaluate(() => { window.__overrides.weather = 'sunny'; window.__overrides.hour = 10 })
  await page.waitForTimeout(400)
  return { ctx, page, errors }
}
// 1. 擁擠草地：按野餐 → 「草地太擠」
{
  const { ctx, page, errors } = await open(save(['kennel', 'bowls', 'catTree'], CROWD))
  ok(await page.evaluate(() => window.__farm.picnicMatFits()) === false, '擁擠草地：引擎判斷放不下野餐墊')
  await page.getByTestId('picnic-button').click()
  const toast = await page.getByRole('status').filter({ hasText: '草地太擠' }).first().waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
  ok(toast, '擁擠草地：按野餐出現「草地太擠，放不下野餐墊…」')
  ok(await page.evaluate((k) => !JSON.parse(localStorage.getItem(k)).picnic?.active, 'aemc-desktop:farm-save'), '擁擠草地：沒有開始野餐')
  ok(errors.length === 0, '沒有頁面錯誤' + (errors.length ? '：' + errors.join('｜') : ''))
  await ctx.close()
}
// 2. 狗窩收進庫存：建築模式沒有狗窩的購買框；直接呼叫購買也被擋
{
  const layout = { items: [{ id: 'kennel', kind: 'kennel', state: 'stored' }] }
  const { ctx, page, errors } = await open(save(['kennel', 'bowls'], layout))
  await page.getByTestId('build-button').click()
  await page.getByTestId('edit-layer').waitFor({ state: 'visible' })
  await page.getByTestId('farm-tab-buy').click()
  await page.getByTestId('build-layer').waitFor({ state: 'visible' })
  ok((await page.getByTestId('slot-kennel').count()) === 0, '狗窩收進倉庫：購買分頁沒有狗窩的購買框')
  ok((await page.getByTestId('slot-catTree').count()) === 1, '對照：沒買的貓跳台有購買框')
  const err = await page.evaluate(() => window.__farmStore.getState().buyBuilding('kennel'))
  ok(typeof err === 'string' && err.includes('已經買過'), '狗窩收進庫存：再買一次被擋（' + err + '）')
  ok(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).points, 'aemc-desktop:farm-save') === 80, '金幣沒被扣')
  ok(await page.evaluate(() => !window.__farm.buildings().has('kennel') && window.__farm.buildings().has('bowls')), '畫面上沒有狗窩、有食盆')
  ok(errors.length === 0, '沒有頁面錯誤' + (errors.length ? '：' + errors.join('｜') : ''))
  await ctx.close()
}
console.log(fail ? `第四階段瀏覽器測試失敗 ${fail} 項` : '第四階段瀏覽器測試全部通過')
await b.close()
process.exit(fail ? 1 : 0)
