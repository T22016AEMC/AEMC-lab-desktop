// C 簽到月曆（瀏覽器）
// 1 三種視窗（1024／1366／1920）：紅點、選單列不換行不溢出、點開 +5、今天格「簽」、toast、立刻寫入、再開不給、上個月、截圖
// 2 更新前已領（lastDailyClaim = 今天）：沒有紅點、今天「簽」、不給
// 3 沒有存檔：文字照常、沒有紅點、可看不可簽、提示文字、截圖
// 4 入口：工具選單、編輯農場中、野餐選位置中；Esc 關閉；焦點；打開時快捷鍵 E 無效
// 5 跨午夜：開著時自動簽新的一天（前景）；背景不簽、回前景才簽；關著時紅點跨日出現
// 6 兩個分頁：被擋的分頁不能簽、擁有者只給一次
// 7 舊版 v3.9.1 分頁：讀到 dataRev 5 → 提示、不覆寫
// 8 真實格式遷移：v3.9.1（= v3.9.0 格式，dataRev 4）分頁寫出的存檔與匯出檔 → 新版載入不重置、金幣與擺放不變
// 6 種視窗的選單列寬度
import { launch, open, newTab, ok, fails, save, menuPoints, stored, toasts, sleep, SHOTS, KEY, NEW, OLD, T0, TODAY, todayOf } from './lib.mjs'
import { mkdirSync, readFileSync } from 'node:fs'
mkdirSync(SHOTS, { recursive: true })

const b = await launch()
const YDAY = todayOf(T0 - 86_400_000)
const ymOf = (d) => d.slice(0, 7)
const prevMonth = (() => { const d = new Date(T0); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
const hist = [`${prevMonth}-03`, `${prevMonth}-15`, `${prevMonth}-28`]
const thisMonthDay = ymOf(TODAY) + '-01' < TODAY ? ymOf(TODAY) + '-01' : null
if (thisMonthDay) hist.push(thisMonthDay)
const base = (extra = {}) => save({ points: 80, lastDailyClaim: YDAY, checkins: hist, dataRev: 5, ...extra })
const dot = (page) => page.getByTestId('calendar-dot').count()
const openCal = async (page) => { await page.getByTestId('calendar-button').click(); await page.getByTestId('calendar-dialog').waitFor({ state: 'visible' }); await sleep(400) }
const closeCal = async (page) => { await page.keyboard.press('Escape'); await page.getByTestId('calendar-dialog').waitFor({ state: 'detached' }) }
const cell = (page, day) => page.locator(`[data-day="${day}"]`)
const signedDays = (page) => page.evaluate(() => [...document.querySelectorAll('[data-signed="1"]')].map((e) => e.getAttribute('data-day')))
const menuFits = (page) => page.evaluate(() => {
  const hd = document.querySelector('header')
  const btn = document.querySelector('[data-testid="calendar-button"]').getBoundingClientRect()
  const right = hd.children[1].getBoundingClientRect()
  return { noOverflow: hd.scrollWidth <= hd.clientWidth + 1, oneLine: right.height <= hd.getBoundingClientRect().height, inView: btn.right <= window.innerWidth && btn.left >= 0, btnW: Math.round(btn.width), free: Math.round(right.left - hd.children[0].getBoundingClientRect().right) }
})

// ---------- 1. 三種視窗 ----------
for (const [w, h] of [[1024, 768], [1366, 768], [1920, 988]]) {
  const { ctx, page, errors } = await open(b, base(), { w, h })
  ok((await dot(page)) === 1, `${w}：今天還沒簽到 → 紅點`)
  const fit = await menuFits(page)
  ok(fit.noOverflow && fit.oneLine && fit.inView, `${w}：選單列不換行、不溢出、按鈕在畫面內（按鈕 ${fit.btnW}px，左右之間剩 ${fit.free}px）`)
  await page.screenshot({ path: SHOTS + `tc-menubar-dot-${w}.png`, clip: { x: 0, y: 0, width: w, height: 40 } })
  const before = await menuPoints(page)
  await openCal(page)
  ok((await page.getByTestId('calendar-dialog').count()) === 1, `${w}：點按鈕打開月曆`)
  ok((await menuPoints(page)) === before + 5, `${w}：+5 金幣（${before} → ${await menuPoints(page)}）`)
  const st = await stored(page)
  ok(st.points === before + 5 && st.lastDailyClaim === TODAY && st.checkins.includes(TODAY) && st.dataRev === 6, `${w}：立刻寫入（金幣、lastDailyClaim、紀錄、dataRev 5；v4.0：6）`)
  ok((await cell(page, TODAY).getAttribute('data-signed')) === '1' && (await cell(page, TODAY).getAttribute('data-today')) === '1', `${w}：今天那格「簽」且高亮`)
  ok((await toasts(page)).some((t) => t.includes('簽到 +5 金幣')), `${w}：toast「簽到 +5 金幣」`)
  ok((await page.getByTestId('calendar-note').textContent()).includes('簽到成功'), `${w}：月曆內提示簽到成功`)
  ok((await dot(page)) === 0, `${w}：紅點消失`)
  const tomorrow = todayOf(T0 + 86_400_000)
  if (ymOf(tomorrow) === ymOf(TODAY)) ok((await cell(page, tomorrow).textContent()).trim() === '', `${w}：未來日期空白`)
  await page.screenshot({ path: SHOTS + `tc-calendar-signed-${w}.png` })
  await closeCal(page)
  await openCal(page)
  ok((await menuPoints(page)) === before + 5, `${w}：再打開不再給`)
  ok((await page.getByTestId('calendar-note').textContent()).includes('今天已經簽到過了'), `${w}：提示今天已經簽到過了`)
  ok(await page.getByTestId('calendar-next').isDisabled(), `${w}：當月時「下個月」停用`)
  await page.getByTestId('calendar-prev').click()
  ok((await page.getByTestId('calendar-month').textContent()).includes(`${Number(prevMonth.slice(5))}月`), `${w}：切到上個月`)
  const ps = await signedDays(page)
  ok(hist.filter((d) => d.startsWith(prevMonth)).every((d) => ps.includes(d)), `${w}：上個月的簽到格（${ps.join(',')}）`)
  ok(await page.getByTestId('calendar-prev').isDisabled(), `${w}：上個月時不能再往前`)
  if (w === 1366) await page.screenshot({ path: SHOTS + `tc-calendar-prev-month-${w}.png` })
  await page.getByTestId('calendar-next').click()
  ok((await page.getByTestId('calendar-month').textContent()).includes(`${Number(TODAY.slice(5, 7))}月`), `${w}：回到這個月`)
  await closeCal(page)
  ok(errors.length === 0, `${w}：沒有頁面錯誤 ` + errors.join(' | '))
  await ctx.close()
}

// 6 種視窗的選單列（有紅點、金幣 5 位數）
for (const [w, h, dpr] of [[1024, 768, 1], [1280, 720, 1], [1366, 768, 1], [1600, 900, 1.25], [1920, 988, 1], [2560, 1300, 1]]) {
  const { ctx, page } = await open(b, base({ points: 12345 }), { w, h, dpr })
  const fit = await menuFits(page)
  ok(fit.noOverflow && fit.oneLine && fit.inView && (await dot(page)) === 1, `選單列 ${w}×${h}@${dpr}：不換行、不溢出、有紅點（剩 ${fit.free}px）`)
  await ctx.close()
}

// ---------- 2. 更新前已領 ----------
{
  const { ctx, page } = await open(b, save({ points: 80, lastDailyClaim: TODAY }))
  ok((await dot(page)) === 0, '更新前已領：沒有紅點')
  await openCal(page)
  ok((await cell(page, TODAY).getAttribute('data-signed')) === '1', '更新前已領：今天顯示「簽」')
  ok((await menuPoints(page)) === 80 && (await stored(page)).points === 80, '更新前已領：不給金幣')
  ok(!(await toasts(page)).some((t) => t.includes('簽到')), '更新前已領：沒有簽到 toast')
  await ctx.close()
}

// ---------- 3. 沒有存檔 ----------
for (const w of [1024, 1366, 1920]) {
  const { ctx, page, errors } = await open(b, null, { w, h: w === 1920 ? 988 : 768 })
  // 沒有存檔時會先出現第一次領養視窗：關掉它
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(300)
  ok((await page.getByTestId('calendar-button').textContent()).includes('簽到月曆'), `沒有存檔 ${w}：「簽到月曆」文字照常`)
  ok((await dot(page)) === 0, `沒有存檔 ${w}：沒有紅點`)
  await page.getByTestId('calendar-button').click({ force: true })
  await page.getByTestId('calendar-dialog').waitFor({ state: 'visible' })
  await sleep(300)
  ok((await page.getByTestId('calendar-note').textContent()).includes('領養第一隻寵物後就能簽到'), `沒有存檔 ${w}：提示「領養第一隻寵物後就能簽到」`)
  ok((await signedDays(page)).length === 0 && (await stored(page)) === null, `沒有存檔 ${w}：沒有簽、沒有建立存檔`)
  await page.screenshot({ path: SHOTS + `tc-calendar-nosave-${w}.png` })
  ok(errors.length === 0, `沒有存檔 ${w}：沒有頁面錯誤`)
  await ctx.close()
}

// ---------- 4. 入口、互斥、鍵盤 ----------
{
  const { ctx, page } = await open(b, base())
  await page.getByTestId('tools-button').click()
  ok((await page.getByTestId('tools-item-calendar').textContent()).includes('簽到月曆'), '工具選單有「簽到月曆」')
  await page.screenshot({ path: SHOTS + 'tc-tools-menu.png', clip: { x: 1300, y: 0, width: 620, height: 220 } })
  await page.getByTestId('tools-item-calendar').click()
  await page.getByTestId('calendar-dialog').waitFor({ state: 'visible' })
  await sleep(300)
  ok((await menuPoints(page)) === 85, '從工具選單打開也簽到 +5')
  ok(await page.evaluate(() => document.activeElement?.closest('[data-testid="calendar-dialog"]') !== null), '打開時焦點在月曆')
  await page.keyboard.press('e')
  ok(!(await page.evaluate(() => window.__ui.getState().buildMode)), '月曆開著時 E 不進入編輯農場')
  await closeCal(page)
  ok((await page.getByTestId('calendar-dialog').count()) === 0, 'Esc 關閉')
  // 編輯農場中打開
  await page.evaluate(() => window.__ui.getState().setBuildMode(true))
  await sleep(200)
  await page.getByTestId('calendar-button').click()
  await page.getByTestId('calendar-dialog').waitFor({ state: 'visible' })
  ok(!(await page.evaluate(() => window.__ui.getState().buildMode)), '編輯農場中打開月曆：自動離開編輯農場')
  await closeCal(page)
  await sleep(300)
  ok((await page.evaluate(() => window.__farm.editing)) === false, '關掉後寵物沒有停在暫停狀態（engine.editing = false）')
  // 野餐選位置中打開
  await page.getByTestId('picnic-button').click()
  await page.getByTestId('picnic-pick-layer').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {})
  const picking = await page.evaluate(() => window.__ui.getState().picnicPick)
  await page.getByTestId('calendar-button').click()
  await page.getByTestId('calendar-dialog').waitFor({ state: 'visible' })
  ok(picking && !(await page.evaluate(() => window.__ui.getState().picnicPick)), `野餐選位置中打開月曆：自動取消選位置（原本 ${picking}）`)
  await closeCal(page)
  await ctx.close()
}

// ---------- 5. 跨午夜 ----------
{
  const { ctx, page } = await open(b, base())
  await openCal(page)
  const p1 = await menuPoints(page)
  // 開著時跨日（前景）：15 秒內自動簽
  await page.evaluate(() => { window.__overrides.nowOffsetMs = 86_400_000 })
  const t0 = Date.now()
  await page.waitForFunction((p) => Number(document.querySelector('header [aria-label^="金幣 "]').getAttribute('aria-label').slice(3)) === p + 5, p1, { timeout: 20000 }).catch(() => {})
  const tomorrow = todayOf(Date.now() + 86_400_000)
  ok((await menuPoints(page)) === p1 + 5, `開著跨日（前景）：自動簽新的一天 +5（${Math.round((Date.now() - t0) / 1000)} 秒）`)
  ok((await stored(page)).lastDailyClaim === tomorrow, '開著跨日：存檔是新的一天')
  ok((await cell(page, tomorrow).getAttribute('data-today')) === '1' || ymOf(tomorrow) !== ymOf(TODAY), '開著跨日：今天高亮移到新的一天')
  // 背景時跨日：不簽；回到前景才簽
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); window.__overrides.nowOffsetMs = 2 * 86_400_000 })
  await sleep(17000)
  ok((await menuPoints(page)) === p1 + 5, '背景時跨日：不簽')
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')) })
  await sleep(500)
  ok((await menuPoints(page)) === p1 + 10, '回到前景：簽新的一天 +5')
  await closeCal(page)
  // 關著時跨日：紅點出現（每 10 秒的結算會讓選單列重畫）、不自動給
  await page.evaluate(() => { window.__overrides.nowOffsetMs = 3 * 86_400_000 })
  await page.getByTestId('calendar-dot').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  ok((await dot(page)) === 1, '關著時跨日：紅點出現')
  ok((await menuPoints(page)) === p1 + 10, '關著時跨日：不自動給金幣')
  await ctx.close()
}

// ---------- 6. 兩個分頁 ----------
{
  const { ctx, page: a } = await open(b, base())
  const { page: c } = await newTab(ctx)
  await a.getByTestId('other-tab-notice').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok((await a.getByTestId('calendar-dot').count()) === 0, '被擋的分頁：沒有紅點')
  const ra = await a.evaluate(() => window.__farmStore.getState().checkIn())
  ok(!ra.claimed && ra.message.includes('停止存檔'), '被擋的分頁：不能簽到（' + ra.message + '）')
  await openCal(c)
  await closeCal(c)
  await openCal(c)
  ok((await stored(c)).points === 85, '擁有者：只給一次（85）')
  await ctx.close()
}

// ---------- 7. 舊版 v3.9.1 分頁 ----------
{
  // 舊版開著（dataRev 4 存檔），新版在同一個網站寫入 dataRev 5（這裡直接寫進 localStorage 模擬）
  const { ctx, page } = await open(b, save({ points: 70 }), { url: OLD })
  const newer = { ...base({ points: 99 }), checkins: [TODAY] }
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(newer)])
  await page.evaluate(() => { const s = window.__farmStore.getState(); window.__farmStore.setState({ save: { ...s.save, points: s.save.points + 1 } }) })
  await page.getByTestId('newer-data-notice').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok((await page.getByTestId('newer-data-notice').count()) === 1, 'v3.9.1 分頁讀到 dataRev 5：顯示「存檔來自更新的版本」')
  const st = await stored(page)
  ok(st.dataRev === 5 && st.points === 99 && st.checkins?.[0] === TODAY, 'v3.9.1 分頁沒有覆寫（簽到紀錄還在）')
  await page.screenshot({ path: SHOTS + 'tc-old-tab-newer.png' })
  await ctx.close()
  const { ctx: c2, page: p2 } = await open(b, newer, { url: OLD })
  ok((await p2.getByTestId('newer-data-notice').count()) === 1, 'v3.9.1 載入 dataRev 5：不讀、提示')
  ok((await stored(p2)).checkins?.[0] === TODAY, 'v3.9.1 載入 dataRev 5：不覆寫')
  await c2.close()
}

// ---------- 8. 真實格式遷移：v3.9.1 分頁寫出的存檔（v3.9.0 格式）→ 新版 ----------
{
  const { ctx, page } = await open(b, save({ points: 150, lastDailyClaim: YDAY }), { url: OLD })
  // 舊版：移動路燈、收起灌木（走正式的擺放寫入），等自動存檔
  await page.evaluate(() => window.__farmStore.getState().setFarmLayout({ items: [{ id: 'lamp', kind: 'lamp', state: 'placed', x: 210, y: 262 }, { id: 'stump', kind: 'stump', state: 'stored' }] }))
  await sleep(1500)
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY)
  const oldSave = JSON.parse(raw)
  ok(oldSave.dataRev === 4 && oldSave.farmLayout.items.length === 2, `v3.9.1 寫出的存檔：dataRev 4、擺放 ${oldSave.farmLayout.items.length} 筆、金幣 ${oldSave.points}（v3.9.1 載入時自動 +5）`)
  // 舊版匯出（格式 6）
  await page.getByTestId('logo-menu-button').click()
  const dl = page.waitForEvent('download')
  await page.getByText('匯出存檔').first().click()
  const exported = JSON.parse(readFileSync(await (await dl).path(), 'utf8'))
  ok(exported.formatVersion === 6, 'v3.9.1 匯出格式 6')
  await ctx.close()
  // 新版載入舊存檔
  const { ctx: c3, page: q, errors } = await open(b, oldSave)
  ok((await q.getByTestId('reset-notice').count()) === 0 && (await q.locator('text=養殖場已重新開始').count()) === 0, '新版載入 v3.9.0 格式存檔：沒有重置')
  const loaded = await q.evaluate(() => window.__farmStore.getState().save)
  ok(loaded.points === oldSave.points, `新版載入：金幣不變（${loaded.points}）`)
  ok(JSON.stringify(loaded.farmLayout) === JSON.stringify(oldSave.farmLayout), '新版載入：擺放不變')
  ok(JSON.stringify(loaded.pets.map((p) => [p.id, p.name, p.personality])) === JSON.stringify(oldSave.pets.map((p) => [p.id, p.name, p.personality])), '新版載入：寵物不變')
  ok((await dot(q)) === (oldSave.lastDailyClaim === TODAY ? 0 : 1), `新版載入：紅點 ${oldSave.lastDailyClaim === TODAY ? '沒有（v3.9.1 今天已自動領過）' : '有'}`)
  await q.evaluate(() => { const s = window.__farmStore.getState(); window.__farmStore.setState({ save: { ...s.save, lastSeen: s.save.lastSeen + 1 } }) })
  await sleep(1200)
  const after = await stored(q)
  ok(after.dataRev === 6 && after.points === oldSave.points && JSON.stringify(after.farmLayout) === JSON.stringify(oldSave.farmLayout), '新版自動存檔後：dataRev 5、金幣與擺放不變（v4.0：dataRev 6）')
  // 新版匯入 v3.9.1 的匯出檔（格式 6）
  await q.getByTestId('import-file').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) })
  await q.getByRole('button', { name: '匯入', exact: true }).waitFor({ state: 'visible' })
  await q.screenshot({ path: SHOTS + 'tc-import-format6.png' })
  const nav = q.waitForEvent('load')
  await q.getByRole('button', { name: '匯入', exact: true }).click()
  await nav
  const bt = q.getByRole('button', { name: '點擊以開始' })
  await bt.click(); await bt.waitFor({ state: 'detached' })
  await q.waitForFunction(() => window.__farmStore?.getState().status === 'ready')
  const imp = await q.evaluate(() => window.__farmStore.getState().save)
  ok(imp.points === exported.data.farm.points && JSON.stringify(imp.farmLayout) === JSON.stringify(exported.data.farm.farmLayout), '新版匯入格式 6：金幣與擺放 = 匯出檔')
  ok(errors.length === 0, '遷移：沒有頁面錯誤 ' + errors.join(' | '))
  await c3.close()
}

await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : '全部通過')
process.exit(fails() ? 1 : 0)
