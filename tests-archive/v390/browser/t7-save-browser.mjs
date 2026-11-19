// S7：瀏覽器（新版 5181、v3.8.1 5182）——帶擺放的存檔載入、自動存檔後合法紀錄原樣保留、匯入確認視窗、舊版拒絕、舊分頁提示
import { chromium } from 'playwright-core'
const NEW = (process.env.NEW_URL ?? 'http://localhost:5181/'), OLD = (process.env.OLD_URL ?? 'http://localhost:5182/')
const KEY = 'aemc-desktop:farm-save'
const T0 = 1795000000000
const BASE = {
  schemaVersion: 5, dataRev: 4, points: 123, lastSeen: T0, lastDailyClaim: '2026-11-18', gifts: { date: '2026-11-18', count: 9 }, nextPetId: 3, createdAt: T0 - 9e8,
  pets: [
    { id: 'p1', species: 'dog', variant: 'shiba', name: '小柴', adoptedAt: T0 - 5e8, heightFactor: 1.02, weight: 55, satiety: 90, mood: 90, cleanliness: 90, personality: 'greedy', lastInteract: T0 - 1000 },
  ],
  ownedBuildings: ['kennel'], earning: { date: '2026-11-18', programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 }, bowl: { date: '2026-11-18', used: 0 },
  collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: '2026-11-18', count: 0, lastEnd: 0 },
  farmLayout: { items: [
    { id: 'lamp', kind: 'lamp', state: 'placed', x: 300, y: 300 },
    { id: 'kennel', kind: 'kennel', state: 'placed', x: 300, y: 300 },
    { id: 'coral', kind: 'coral', state: 'placed' },
    { id: 'house', kind: 'house', state: 'stored' },
    { id: 'zzz', kind: 'zzz' }, null,
    { id: 'planter', kind: 'planter', state: 'placed', x: 420, y: 250 },
  ] },
}
const CLEAN = [
  { id: 'lamp', kind: 'lamp', state: 'placed', x: 300, y: 300 },
  { id: 'kennel', kind: 'kennel', state: 'placed', x: 300, y: 300 },
  { id: 'coral', kind: 'coral', state: 'stored' },
  { id: 'house', kind: 'house', state: 'placed' },
  { id: 'planter', kind: 'planter', state: 'placed', x: 420, y: 250 },
]
let fail = 0
const ok = (c, m) => { console.log((c ? '通過 ' : '失敗 ') + m); if (!c) fail++ }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const b = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
async function open(url, save) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript(([s, k]) => {
    if (sessionStorage.getItem('__seeded')) return
    if (s) localStorage.setItem(k, s)
    localStorage.setItem('aemc-desktop:settings', JSON.stringify({ lastExportAt: Date.now(), remindOff: true, lastRemindDate: '' }))
    sessionStorage.setItem('__seeded', '1')
  }, [save ? JSON.stringify(save) : null, KEY])
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  await page.clock.install({ time: T0 + 60000 })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url)
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click()
  await bt.waitFor({ state: 'detached' })
  return { ctx, page, errors }
}
const backupText = JSON.stringify({ format: 'aemc-desktop-backup', formatVersion: 6, exportedAt: '2026-11-18T08:00:00.000Z', appVersion: '3.9.0', data: { farm: { ...BASE, farmLayout: { items: CLEAN } }, appList: { schemaVersion: 1, apps: [] } } })
async function importFile(page) {
  await page.getByTestId('import-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backupText) })
}

// 1. 新版：載入帶擺放（含損壞、重疊）的存檔
{
  const { ctx, page, errors } = await open(NEW, BASE)
  await page.locator('[data-testid="tower-window"]').waitFor({ state: 'visible' })
  const mem = await page.evaluate(() => window.__farmStore.getState().save?.farmLayout)
  ok(same(mem?.items, CLEAN), '新版載入：記憶體裡的擺放 = 清理後的結果')
  // 載入時既有的離線結算（lastSeen、寵物數值）本來就會自動存檔一次（v3.8.1 也一樣）。擺放本身不觸發寫入：
  // 寫入的欄位只有 pets、lastSeen、farmLayout（清理後），合法紀錄的位置不動
  const raw0 = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)
  const changed = Object.keys({ ...raw0, ...BASE }).filter((k) => JSON.stringify(raw0[k]) !== JSON.stringify(BASE[k]))
  ok(same(changed.sort(), ['dataRev', 'farmLayout', 'lastSeen', 'pets']), '新版載入：改變的欄位只有離線結算的 pets、lastSeen 與清理後的 farmLayout（v3.10.0：加上 dataRev 4 → 5）（' + changed.join(', ') + '）')
  ok(same(raw0.farmLayout.items, CLEAN), '新版載入：寫入的擺放 = 清理結果（重疊的路燈與狗窩位置沒動）')
  // 觸發一次自動存檔（加 1 金幣），等節流寫入
  await page.evaluate(() => { const s = window.__farmStore.getState(); window.__farmStore.setState({ save: { ...s.save, points: s.save.points + 1 } }) })
  await page.clock.runFor(5000)
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).points === 124, KEY)
  const raw1 = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)
  ok(same(raw1.farmLayout.items, CLEAN) && raw1.dataRev === 5 && raw1.schemaVersion === 5, '自動存檔後：合法紀錄原樣保留（重疊的路燈與狗窩位置沒動）、dataRev 4（v3.10.0：5）、schema 5')
  // 匯入格式 6：確認視窗有「農場擺放」那一行
  await importFile(page)
  await page.getByTestId('import-confirm').waitFor({ state: 'visible' })
  const line = await page.getByTestId('import-layout').innerText().catch(() => '')
  // 審查修正後只算「清理後有效、和預設不同」的物件：路燈、狗窩、花槽 = 3（珊瑚在倉庫、住家無座標＝都和預設相同，不算）
  ok(line.includes('調整過 3 個物件'), '匯入格式 6：確認視窗顯示「農場擺放：' + line + '」')
  await page.getByRole('button', { name: '取消' }).click()
  ok(errors.length === 0, '新版沒有頁面錯誤' + (errors.length ? '：' + errors.join('｜') : ''))
  await ctx.close()
}
// 2. 新版：沒有擺放的舊存檔（dataRev 3）→ 匯入確認視窗沒有擺放那一行（格式 5）
{
  const { ctx, page, errors } = await open(NEW, { ...BASE, dataRev: 3, farmLayout: undefined })
  await page.locator('[data-testid="tower-window"]').waitFor({ state: 'visible' })
  ok((await page.evaluate(() => window.__farmStore.getState().save?.farmLayout)) === undefined, '舊存檔：沒有 farmLayout')
  const t5 = JSON.stringify({ ...JSON.parse(backupText), formatVersion: 5 })
  await page.getByTestId('import-file').setInputFiles({ name: 'b5.json', mimeType: 'application/json', buffer: Buffer.from(t5) })
  await page.getByTestId('import-confirm').waitFor({ state: 'visible' })
  ok((await page.getByTestId('import-layout').count()) === 0, '匯入格式 5：沒有擺放那一行（夾帶的 farmLayout 不讀）')
  await page.getByRole('button', { name: '取消' }).click()
  ok(errors.length === 0, '沒有頁面錯誤')
  await ctx.close()
}
// 3. v3.8.1：匯入格式 6 → 「較新版本」
{
  const { ctx, page, errors } = await open(OLD, { ...BASE, dataRev: 3, farmLayout: undefined })
  await page.locator('[data-testid="tower-window"]').waitFor({ state: 'visible' })
  await importFile(page)
  await page.getByTestId('import-error').waitFor({ state: 'visible' })
  const msg = await page.getByTestId('import-error-message').innerText()
  ok(msg.includes('較新版本'), 'v3.8.1 匯入格式 6：' + msg)
  ok(errors.length === 0, 'v3.8.1 沒有頁面錯誤')
  await ctx.close()
}
// 4. v3.8.1 讀到 dataRev 4 的存檔：顯示「存檔來自更新的版本」、存檔不被改動
{
  const { ctx, page, errors } = await open(OLD, BASE)
  const notice = await page.getByTestId('newer-data-notice').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
  ok(notice, 'v3.8.1 讀到 dataRev 4：顯示「存檔來自更新的版本」提示')
  await page.clock.runFor(10000)
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY)
  ok(raw === JSON.stringify(BASE), 'v3.8.1：存檔原封不動（farmLayout 還在）')
  ok(errors.length === 0, 'v3.8.1 沒有頁面錯誤')
  await ctx.close()
}
console.log(fail ? `S7 失敗 ${fail} 項` : 'S7 全部通過')
await b.close()
process.exit(fail ? 1 : 0)
