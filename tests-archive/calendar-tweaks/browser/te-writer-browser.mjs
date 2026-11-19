// E 兩分頁寫入權（瀏覽器，同一個 context 開兩個分頁、共用 localStorage）
// 1 單一分頁：連續操作＋重新整理 20 次，提示 0 次、每次都存到
// 2 兩分頁：後開的接手、先開的立刻被擋住並提示、被擋的寫不進去、擋住時選單列點不到、快捷鍵無效
// 3 同時觸發存檔：存檔只來自擁有者
// 4 模擬錯過事件（bfcache）：寫入前檢查擋下、離開頁面的 flush 也寫不進去
// 5 匯入：被擋的分頁匯入 → 先接手，另一分頁寫不進去
// 6 匯出：兩個分頁都能匯出（內容 = 儲存層目前的資料）
// 7 寫入權鍵讀寫失敗：退回 v3.9.x 行為（不提示、照樣寫）
import { launch, open, newTab, ok, fails, save, stored, sleep, SHOTS, KEY, WRITER } from './lib.mjs'
import { mkdirSync, readFileSync } from 'node:fs'
mkdirSync(SHOTS, { recursive: true })

const b = await launch()
const notice = (page) => page.getByTestId('other-tab-notice').count()
const addPoint = (page, k = 1) => page.evaluate((k) => { const s = window.__farmStore.getState(); window.__farmStore.setState({ save: { ...s.save, points: s.save.points + k } }) }, k)
const memPoints = (page) => page.evaluate(() => window.__farmStore.getState().save.points)
const waitStored = (page, v) => page.waitForFunction(([k, v]) => { const r = localStorage.getItem(k); return r && JSON.parse(r).points === v }, [KEY, v], { timeout: 5000 }).then(() => true).catch(() => false)

// ---------- 1. 單一分頁 20 次重新整理 ----------
{
  const { ctx, page, errors } = await open(b, save({ points: 100 }))
  let shown = 0
  let saved = 0
  for (let r = 0; r < 20; r++) {
    const before = await memPoints(page)
    for (let i = 0; i < 3; i++) { await addPoint(page); await sleep(250) }
    if (await waitStored(page, before + 3)) saved++
    await addPoint(page) // 節流還沒到就重新整理：靠離開頁面的 flush 寫入
    await page.reload()
    const bt = page.getByRole('button', { name: '點擊以開始' })
    await bt.click(); await bt.waitFor({ state: 'detached' })
    await page.waitForFunction(() => window.__farmStore?.getState().status === 'ready')
    await sleep(200)
    if ((await memPoints(page)) === before + 4) saved++
    shown += await notice(page)
  }
  await sleep(1500)
  shown += await notice(page)
  ok(shown === 0, `單一分頁 20 次重新整理：寫入權提示 ${shown} 次（要 0）`)
  ok(saved === 40, `單一分頁：40 次檢查都有存到（節流寫入 20、離開頁面寫入 20）：${saved}`)
  ok(errors.length === 0, '單一分頁沒有頁面錯誤 ' + errors.join(' | '))
  await ctx.close()
}

// ---------- 2～6. 兩個分頁 ----------
{
  const { ctx, page: p1, errors: e1 } = await open(b, save({ points: 200 }))
  await addPoint(p1, 1)
  ok(await waitStored(p1, 201), '分頁 1（單獨）存檔 201')
  const { page: p2, errors: e2 } = await newTab(ctx)
  const t0 = Date.now()
  await p1.getByTestId('other-tab-notice').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok((await notice(p1)) === 1, `分頁 2 開啟後，分頁 1 出現提示（${Date.now() - t0} ms）`)
  ok((await notice(p2)) === 0, '分頁 2 沒有提示')
  const text = await p1.getByTestId('other-tab-notice').textContent()
  ok(text.includes('養殖場已在另一個分頁開啟，這個分頁已停止存檔，以免互相覆蓋。請重新整理（或關掉這個分頁）。'), '提示文字：' + text)
  await p1.screenshot({ path: SHOTS + 'te-other-tab-notice.png' })
  ok((await memPoints(p2)) === 201, '分頁 2 讀到分頁 1 的最後一次寫入 201')
  // 擋住：選單列點不到、E 鍵無效
  const hit = await p1.evaluate(() => { const el = document.elementFromPoint(window.innerWidth - 300, 10); return el?.closest('[data-testid="other-tab-overlay"]') !== null })
  ok(hit, '分頁 1：選單列位置被擋住')
  await p1.keyboard.press('e')
  ok(!(await p1.evaluate(() => window.__ui?.getState?.().buildMode ?? false)), '分頁 1：E 鍵沒有進入編輯農場')
  // 被擋的寫不進去，擁有者寫得進去
  await addPoint(p1, 50)
  await sleep(1200)
  ok((await stored(p1)).points === 201, '分頁 1 改金幣 → 存檔不變（201）')
  await addPoint(p2, 2)
  ok(await waitStored(p2, 203), '分頁 2 改金幣 → 存檔 203')

  // 3. 同時觸發：兩個分頁同一時間改、等節流
  for (let k = 0; k < 5; k++) {
    const before = (await stored(p2)).points
    await Promise.all([addPoint(p1, 1000), addPoint(p2, 1)])
    await sleep(1000)
    ok((await stored(p2)).points === before + 1, `同時觸發 ${k + 1}：存檔只來自擁有者（${before + 1}）`)
  }

  // 4. 模擬錯過事件：分頁 2 自己把寫入權鍵改成別人（自己寫的不會收到 storage 事件，等於 bfcache 回來時錯過了）
  await p2.evaluate((k) => localStorage.setItem(k, JSON.stringify({ id: 'ghost', at: Date.now() })), WRITER)
  ok((await notice(p2)) === 0, '錯過事件：分頁 2 一開始還不知道')
  const before4 = (await stored(p2)).points
  await addPoint(p2, 7)
  await p2.getByTestId('other-tab-notice').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok((await notice(p2)) === 1, '錯過事件：寫入前檢查擋下並提示')
  ok((await stored(p2)).points === before4, '錯過事件：存檔沒有被寫')
  await addPoint(p2, 3)
  await p2.evaluate(() => window.dispatchEvent(new Event('beforeunload')))
  await sleep(300)
  ok((await stored(p2)).points === before4, '被擋的分頁：離開頁面的 flush 也寫不進去')

  // 5. 匯入：分頁 1（被擋）匯入 → 先接手，再重新整理
  const backupText = JSON.stringify({ format: 'aemc-desktop-backup', formatVersion: 6, exportedAt: '2026-11-18T08:00:00.000Z', appVersion: '3.9.1', data: { farm: { ...save({ points: 4242 }) }, appList: { schemaVersion: 1, apps: [] } } })
  await p1.getByTestId('import-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backupText) })
  await p1.waitForFunction(() => [...document.querySelectorAll('button')].some((x) => x.textContent?.trim() === '匯入'), null, { timeout: 5000 }).catch(() => {})
  const navDone = p1.waitForEvent('load', { timeout: 15000 }).catch(() => null)
  await p1.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === '匯入')?.click())
  await navDone
  const bt = p1.getByRole('button', { name: '點擊以開始' })
  await bt.click(); await bt.waitFor({ state: 'detached' })
  await p1.waitForFunction(() => window.__farmStore?.getState().status === 'ready')
  ok((await memPoints(p1)) === 4242, '匯入後分頁 1 讀到匯入的 4242')
  ok((await notice(p1)) === 0, '匯入後分頁 1 沒有提示（已接手）')
  await addPoint(p2, 9)
  await sleep(1200)
  ok((await stored(p1)).points >= 4242 && (await stored(p1)).points < 4242 + 9, '分頁 2 寫不進去，匯入沒被蓋掉')

  // 6. 匯出：擁有者與被擋的分頁都能匯出（被擋的分頁畫面被擋，用 DOM 直接呼叫選單項目）
  const exportFrom = async (page, viaDom) => {
    const dl = page.waitForEvent('download', { timeout: 10000 })
    if (viaDom) {
      await page.evaluate(() => document.querySelector('[data-testid="logo-menu-button"]')?.click())
      await sleep(200)
      await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"], button')].find((x) => x.textContent?.includes('匯出存檔'))?.click())
    } else {
      await page.getByTestId('logo-menu-button').click()
      await page.getByText('匯出存檔').first().click()
    }
    const d = await dl
    return JSON.parse(readFileSync(await d.path(), 'utf8'))
  }
  const ex1 = await exportFrom(p1, false)
  ok(ex1.data.farm.points === (await stored(p1)).points, `擁有者匯出：金幣 = 儲存層（${ex1.data.farm.points}）`)
  const ex2 = await exportFrom(p2, true)
  ok(ex2.data.farm.points === (await stored(p1)).points, `被擋的分頁匯出：內容 = 儲存層目前的資料（${ex2.data.farm.points}），不是自己記憶體裡的`)
  ok(e1.length === 0 && e2.length === 0, '兩分頁沒有頁面錯誤 ' + [...e1, ...e2].join(' | '))
  await ctx.close()
}

// ---------- 7. 寫入權鍵寫入失敗：退回 v3.9.x ----------
{
  const failWriter = () => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = function (k, v) { if (k === 'aemc-desktop:farm-writer') throw new Error('quota'); return orig.call(this, k, v) }
  }
  const { ctx, page: q1, errors } = await open(b, save({ points: 300 }), { extraInit: failWriter })
  const { page: q2 } = await newTab(ctx)
  await sleep(800)
  ok((await notice(q1)) === 0 && (await notice(q2)) === 0, '寫入權鍵寫不進去：兩個分頁都沒有提示（不鎖死）')
  await addPoint(q1, 5)
  ok(await waitStored(q1, 305), '寫入權鍵寫不進去：分頁 1 照樣存檔')
  await addPoint(q2, 1)
  ok(await waitStored(q2, 301), '寫入權鍵寫不進去：分頁 2 照樣存檔（後存的蓋前面的 = v3.9.x 行為）')
  ok(errors.length === 0, '沒有頁面錯誤')
  await ctx.close()
}

await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : '全部通過')
process.exit(fails() ? 1 : 0)
