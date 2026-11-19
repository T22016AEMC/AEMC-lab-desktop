// v3.10.1 修正 2：月曆（z-9900）開著時，自動揭曉觸發的事件彈窗先排隊，月曆關閉後才顯示。
// 觸發方式：存檔裡 U002 集齊但事件旗標沒設、有一個再 8 秒到期的寶物 → 到期自動揭曉時 checkEvents 觸發 dogLeak。
import { launch, open, ok, fails, save, pet, sleep, stored, SHOTS, T0, TODAY, todayOf } from './lib.mjs'
import { mkdirSync } from 'node:fs'
mkdirSync(SHOTS, { recursive: true })
const b = await launch()
const col = Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`U002-${i}`, 1]))
const mk = () => save({ dataRev: 5, points: 80, lastDailyClaim: todayOf(Date.now() - 86400000), checkins: [], collection: col, events: {},
  finds: [{ id: 'f1', kind: 'mound', by: 'dog', fx: 600, fy: 600, at: Date.now() - 600000 + 8000 }] })
const dlg = (p) => p.getByTestId('event-dialog').count()
const cal = (p) => p.getByTestId('calendar-dialog').count()
const pend = (p) => p.evaluate(() => window.__farmStore.getState().pendingEvents.length)

// ---- 情境 A：月曆開著時觸發 ----
{
  const { page, errors } = await open(b, mk())
  ok((await pend(page)) === 0 && (await dlg(page)) === 0, 'A 開機時沒有事件')
  await page.getByTestId('calendar-button').click()
  await page.getByTestId('calendar-dialog').waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__farmStore.getState().pendingEvents.length > 0, null, { timeout: 30000 })
  await sleep(500)
  ok((await pend(page)) === 1, 'A 月曆開著：事件進入排隊（pendingEvents = 1）')
  ok((await dlg(page)) === 0 && (await cal(page)) === 1, 'A 月曆開著：事件彈窗不顯示（不會疊在一起），月曆仍在')
  const saved = await stored(page)
  ok(!!saved.events?.dogLeak, `A 旗標已存檔（events.dogLeak = ${saved.events?.dogLeak}）`)
  await page.screenshot({ path: SHOTS + 'te2-calendar-open-event-queued.png' })
  // 月曆內的操作照常（Esc 關閉）
  await page.keyboard.press('Escape')
  await page.getByTestId('calendar-dialog').waitFor({ state: 'detached' })
  await page.getByTestId('event-dialog').waitFor({ state: 'visible', timeout: 5000 })
  ok((await dlg(page)) === 1 && (await cal(page)) === 0, 'A 月曆關閉後：事件彈窗出現，月曆已不在（沒有兩個彈窗）')
  const box = await page.getByTestId('event-dialog').boundingBox()
  const top = await page.evaluate(() => { const r = document.querySelector('[data-testid=event-dialog]').getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!el?.closest('[data-testid=event-dialog]') })
  ok(!!box && top, 'A 事件彈窗在最上層、可見（elementFromPoint 命中）')
  await page.screenshot({ path: SHOTS + 'te2-event-visible-after-calendar-closed.png' })
  await page.getByTestId('event-ok').click()
  await page.getByTestId('event-dialog').waitFor({ state: 'detached' })
  ok((await pend(page)) === 0, 'A 按確定後：事件清掉')
  // 月曆關閉後可正常操作：再開月曆、簽到、關閉
  await page.getByTestId('calendar-button').click()
  await page.getByTestId('calendar-dialog').waitFor({ state: 'visible' })
  ok((await cal(page)) === 1 && (await dlg(page)) === 0, 'A 事件處理完後：月曆可再開，沒有事件彈窗')
  await page.getByTestId('calendar-close').click()
  await page.getByTestId('calendar-dialog').waitFor({ state: 'detached' })
  await page.reload()
  await page.getByRole('button', { name: '點擊以開始' }).click().catch(() => {})
  await sleep(2500)
  ok((await dlg(page)) === 0, 'A 重新整理後事件不再出現（旗標已存）')
  ok(errors.length === 0, 'A 沒有頁面錯誤 ' + errors.join('|'))
}
// ---- 情境 B：用關閉鈕與點外面關月曆，事件同樣最後出現 ----
for (const how of ['close', 'outside']) {
  const { page } = await open(b, mk())
  await page.getByTestId('calendar-button').click()
  await page.getByTestId('calendar-dialog').waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__farmStore.getState().pendingEvents.length > 0, null, { timeout: 30000 })
  await sleep(300)
  ok((await dlg(page)) === 0, `B(${how}) 月曆開著：事件不顯示`)
  if (how === 'close') await page.getByTestId('calendar-close').click()
  else await page.getByTestId('calendar-overlay').click({ position: { x: 4, y: 4 } })
  await page.getByTestId('event-dialog').waitFor({ state: 'visible', timeout: 5000 })
  ok((await cal(page)) === 0, `B(${how}) 關閉月曆後事件彈窗出現`)
}
// ---- 情境 C：月曆關著時事件照舊立刻顯示（行為不變），Esc／點外面／確定 ----
{
  const { page } = await open(b, mk())
  await page.getByTestId('event-dialog').waitFor({ state: 'visible', timeout: 30000 })
  ok((await cal(page)) === 0, 'C 月曆關著：事件直接顯示')
  await page.getByTestId('event-ok').click()
  ok((await dlg(page)) === 0, 'C 確定關閉')
}
await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : '全部通過')
process.exit(fails() ? 1 : 0)
