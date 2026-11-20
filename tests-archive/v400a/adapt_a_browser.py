# adapt-a.py 的第三部分：tests-archive/v390 瀏覽器測試裡用到「編輯農場的購買分頁」的地方（v4.0 起建築在商店買）。
# 使用者決定：購買步驟改走商店；保留「預設位置被佔住就放進倉庫」類的斷言，只換操作入口；購買分頁專屬的斷言刪除。
# 另外「草地太擠」→「擺設太多」（補充 c）。由 adapt-a.py 匯入；區塊用開頭與結尾的標記找，已改過的略過。
B = 'tests-archive/v390/browser/'

T5_10_START = '// ============ 10. 預設位置被佔時購買：放進庫存並提示 ============'
T5_10_END = '// ============ 11. 野餐中進入擺設模式 ============'
T5_10_NEW = '''// ============ 10. 預設位置被佔時購買：放進庫存並提示 ============
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
  ok(notice.includes('已放進倉庫') && notice.includes('從倉庫拿出來擺'), '10 預設位置被珊瑚佔住：商店出現提示「' + notice.split('\\n')[0] + '」')
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

'''

T5_13_START = '// ============ 13. 分頁（第五階段補強） ============'
T5_13_END = '// ============ 14. 橫幅與倉庫列不出界'
T5_13_NEW = '''// ============ 13. 分頁（第五階段補強） ============
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

'''

EDITS_BROWSER = {
  B + 't5-edit-browser.mjs': [
    ("  ok(await toast(page, '草地太擠'), '11 離開時放不下墊子：提前結束野餐並提示「草地太擠」')",
     "  ok(await toast(page, '擺設太多'), '11 離開時放不下墊子：提前結束野餐並提示「草地太擠」（v4.0：「擺設太多」）')"),
    ("  for (const tab of ['edit', 'buy']) {\n    await page.getByTestId('farm-tab-' + tab).click()\n",
     "  for (const tab of ['edit']) { // v4.0：沒有購買分頁\n"),
  ],
  B + 't4-browser.mjs': [
    ("  const toast = await page.getByRole('status').filter({ hasText: '草地太擠' }).first()",
     "  const toast = await page.getByRole('status').filter({ hasText: '擺設太多' }).first()"),
    ("  ok(toast, '擁擠草地：按野餐出現「草地太擠，放不下野餐墊…」')",
     "  ok(toast, '擁擠草地：按野餐出現「草地太擠，放不下野餐墊…」（v4.0：「擺設太多…」）')"),
    ("""  await page.getByTestId('build-button').click()
  await page.getByTestId('edit-layer').waitFor({ state: 'visible' })
  await page.getByTestId('farm-tab-buy').click()
  await page.getByTestId('build-layer').waitFor({ state: 'visible' })
  ok((await page.getByTestId('slot-kennel').count()) === 0, '狗窩收進倉庫：購買分頁沒有狗窩的購買框')
  ok((await page.getByTestId('slot-catTree').count()) === 1, '對照：沒買的貓跳台有購買框')""",
     """  // v4.0：建築在商店買。收進倉庫的狗窩在商店顯示「已擁有」、不能買；沒買的貓跳台可以買
  await page.getByTestId('shop-button').click()
  await page.getByTestId('shop-tab-building').click()
  ok((await page.getByTestId('shop-has-building.kennel').count()) === 1 && (await page.getByTestId('shop-buy-building.kennel').isDisabled()), '狗窩收進倉庫：商店顯示「已擁有」、不能買')
  ok(await page.getByTestId('shop-buy-building.catTree').isEnabled(), '對照：沒買的貓跳台可以買')
  await page.keyboard.press('Escape')"""),
  ],
  B + 't7-save-browser.mjs': [
    ("raw1.dataRev === 5 && raw1.schemaVersion === 5, '自動存檔後：合法紀錄原樣保留（重疊的路燈與狗窩位置沒動）、dataRev 4（v3.10.0：5）、schema 5')",
     "raw1.dataRev === 6 && raw1.schemaVersion === 5, '自動存檔後：合法紀錄原樣保留（重疊的路燈與狗窩位置沒動）、dataRev 4（v3.10.0：5；v4.0：6）、schema 5')"),
  ],
  'tests-archive/calendar-tweaks/browser/tc-calendar-browser.mjs': [
    ("st.checkins.includes(TODAY) && st.dataRev === 5, `${w}：立刻寫入（金幣、lastDailyClaim、紀錄、dataRev 5）`)",
     "st.checkins.includes(TODAY) && st.dataRev === 6, `${w}：立刻寫入（金幣、lastDailyClaim、紀錄、dataRev 5；v4.0：6）`)"),
    ("ok(after.dataRev === 5 && after.points === oldSave.points && JSON.stringify(after.farmLayout) === JSON.stringify(oldSave.farmLayout), '新版自動存檔後：dataRev 5、金幣與擺放不變')",
     "ok(after.dataRev === 6 && after.points === oldSave.points && JSON.stringify(after.farmLayout) === JSON.stringify(oldSave.farmLayout), '新版自動存檔後：dataRev 5、金幣與擺放不變（v4.0：dataRev 6）')"),
  ],
  B + 't9-picnic-pick-browser.mjs': [
    ("  ok((await toast(page, '草地太擠')) && !(await picking(page)), '9 草地太擠：提示「草地太擠…」、不進入選位置')",
     "  ok((await toast(page, '擺設太多')) && !(await picking(page)), '9 草地太擠：提示「草地太擠…」、不進入選位置（v4.0：「擺設太多…」）')"),
  ],
}

BLOCKS = [
  (B + 't5-edit-browser.mjs', T5_10_START, T5_10_END, T5_10_NEW),
  (B + 't5-edit-browser.mjs', T5_13_START, T5_13_END, T5_13_NEW),
]
