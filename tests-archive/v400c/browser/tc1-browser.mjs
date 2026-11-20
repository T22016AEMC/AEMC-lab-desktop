// 4.0 階段 C 瀏覽器測試＋截圖（dev server，NEW_URL）。截圖到 shots/。
//  A. 商店「建築」分頁的配件分組（房屋配件：晴天娃娃／門牌、鐘樓配件：敲鐘人／旗幟）：價格、買了立刻掛上、門牌／旗幟互換（同時只一個）、取下、娃娃與敲鐘人只能買一次、
//     重新整理後維持；1366×282 捲得到最後一列
//  B. 配件畫在房屋與鐘樓上（含亞特蘭提斯、無塵室）：配件的不透明像素不蓋到門、窗點擊區與鐘面（逐外觀）；截圖：房屋、鐘樓各 1 張
//  C. 晴天娃娃：掛著的存檔和沒掛的存檔，畫面層用同一個 worldWeather（改存檔就換機率）
//  D. 傳說展示台：集齊一對 → 載入時補送 1 個放進倉庫（只送一次、重新整理不再送）、沒集齊不送；台面顯示最先集齊的那一對；兩對都集齊時點展示台切換（存檔）；截圖 1 張
import { launch, open, save, pet, ok, fails, sleep, saveSceneCrop } from '../../calendar-tweaks/browser/lib.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('./shots/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const T0 = Date.now()
const PETS = [['p1', 'dog', 'shiba'], ['p2', 'cat', 'tabby']]
const base = (extra = {}) => save({ pets: PETS.map(([id, sp, v]) => pet(id, sp, v, { personality: 'lively' })), nextPetId: 3, points: 200, ...extra })
const ACC_ALL = ['acc.doll', 'acc.sign_home', 'acc.sign_paw', 'acc.sign_lab', 'acc.bellman', 'acc.flag_paw', 'acc.flag_clock', 'acc.flag_aemc']
const ACC_ON = { houseDoll: 'acc.doll', houseSign: 'acc.sign_home', towerBellman: 'acc.bellman', towerFlag: 'acc.flag_paw' }
const st = (page) => page.evaluate(() => window.__farmStore.getState().save)
const shotPage = (page, f) => page.screenshot({ path: OUT + f })
async function waitGroups(page, gs) {
  await page.evaluate(async (gs) => { const { assets } = await import('/src/farm/pixel/assets.ts'); await Promise.all(gs.map((g) => assets.loadGroup(g))) }, gs)
  await sleep(500)
}
async function stage(page, hour = 10) {
  await page.evaluate((h) => { window.__overrides.weather = 'sunny'; window.__overrides.hour = h }, hour)
  await page.evaluate(() => {
    const e = window.__farm
    e.particles.length = 0
    let k = 0
    for (const a of e.actors.values()) { a.drag = null; a.fly = null; a.bath = null; a.play = null; a.picnic = null; a.override = null; a.hv = null; a.bld = null; a.x = 200 + k * 60; a.y = 295; a.action = 'idle'; k++ }
  })
  await sleep(400)
}
const b = await launch()

// ================= A. 商店配件 =================
{
  const { ctx, page, errors } = await open(b, base({ points: 100 }), { w: 1366, h: 768, hour: 10 })
  await page.evaluate(() => window.__ui.getState().setShopTab('building'))
  await page.getByTestId('skin-row-houseDoll').waitFor()
  await sleep(1500)
  for (const slot of ['houseDoll', 'houseSign', 'towerBellman', 'towerFlag']) ok((await page.getByTestId(`skin-row-${slot}`).count()) === 1, `A 有配件列 ${slot}`)
  const heads = await page.getByTestId('shop-panel-building').locator('h3').allInnerTexts()
  ok(['房屋配件：晴天娃娃', '房屋配件：門牌', '鐘樓配件：敲鐘人', '鐘樓配件：旗幟'].every((h) => heads.includes(h)), 'A 小標題 ' + heads.join('、'))
  for (const slot of ['houseDoll', 'houseSign', 'towerBellman', 'towerFlag']) ok((await page.getByTestId(`skin-card-${slot}-default`).getAttribute('data-state')) === 'using', `A ${slot} 預設「不掛」是使用中`)
  const PRICE = { 'acc.doll': 10, 'acc.sign_home': 3, 'acc.sign_paw': 3, 'acc.sign_lab': 3, 'acc.bellman': 6, 'acc.flag_paw': 3, 'acc.flag_clock': 3, 'acc.flag_aemc': 3 }
  const SLOT = { 'acc.doll': 'houseDoll', 'acc.sign_home': 'houseSign', 'acc.sign_paw': 'houseSign', 'acc.sign_lab': 'houseSign', 'acc.bellman': 'towerBellman', 'acc.flag_paw': 'towerFlag', 'acc.flag_clock': 'towerFlag', 'acc.flag_aemc': 'towerFlag' }
  await shotPage(page, 'shop-acc-1366x768.png')
  await page.getByTestId('shop-buy-skin.acc.doll').scrollIntoViewIfNeeded()
  await shotPage(page, 'shop-acc-groups-1366x768.png')
  let p = (await st(page)).points
  for (const id of ['acc.doll', 'acc.sign_home', 'acc.sign_paw', 'acc.bellman', 'acc.flag_paw', 'acc.flag_clock']) {
    await page.getByTestId('shop-buy-skin.' + id).click()
    ok((await page.getByTestId('shop-confirm-price').innerText()).includes(String(PRICE[id])), `A ${id} 價格 ${PRICE[id]}`)
    await page.getByTestId('shop-confirm-ok').click()
    await page.getByTestId(`skin-card-${SLOT[id]}-${id}`).and(page.locator('[data-state="using"]')).waitFor()
    const s = await st(page)
    ok(s.points === p - PRICE[id] && s.skins.owned.includes(id) && s.skins.equipped[SLOT[id]] === id, `A 買 ${id}：扣 ${PRICE[id]}、立刻掛上`)
    p = s.points
  }
  let s = await st(page)
  ok((await page.getByTestId('skin-card-houseSign-acc.sign_home').getAttribute('data-state')) === 'owned' && s.skins.equipped.houseSign === 'acc.sign_paw', 'A 門牌同時只能掛一個：買了 B，A 變成「換上」')
  ok((await page.getByTestId('skin-card-towerFlag-acc.flag_paw').getAttribute('data-state')) === 'owned' && s.skins.equipped.towerFlag === 'acc.flag_clock', 'A 旗幟同時只能掛一個')
  await page.getByTestId('skin-wear-houseSign-acc.sign_home').click()
  await sleep(300)
  ok((await st(page)).skins.equipped.houseSign === 'acc.sign_home' && (await st(page)).points === p, 'A 切換門牌不扣金幣')
  await page.getByTestId('skin-wear-houseSign-default').click()
  await sleep(300)
  s = await st(page)
  ok(!('houseSign' in s.skins.equipped) && s.skins.owned.includes('acc.sign_home'), 'A 取下門牌：equipped 拿掉、仍擁有')
  ok(await page.getByTestId('shop-buy-skin.acc.doll').isDisabled().catch(() => true), 'A 晴天娃娃買過了：不能再買（按鈕停用或已不顯示）')
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('aemc-desktop:farm-save')).skins.equipped.towerFlag)) === 'acc.flag_clock', 'A 立刻存檔')
  await page.reload()
  await page.getByRole('button', { name: '點擊以開始' }).click()
  await sleep(1500)
  ok((await st(page)).skins.equipped.houseDoll === 'acc.doll', 'A 重新整理後維持')
  ok(errors.length === 0, 'A 沒有頁面錯誤 ' + errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, page, errors } = await open(b, base(), { w: 1366, h: 282, hour: 10 })
  await page.evaluate(() => window.__ui.getState().setShopTab('building'))
  await page.getByTestId('skin-row-towerFlag').waitFor()
  await sleep(1500)
  const last = page.getByTestId('skin-card-towerFlag-acc.flag_aemc')
  await last.scrollIntoViewIfNeeded()
  ok(await last.isVisible(), 'A 1366×282 捲得到最後一列（旗幟）')
  ok(errors.length === 0, 'A 低視窗沒有頁面錯誤')
  await ctx.close()
}

// ================= B. 配件畫在房屋與鐘樓上 =================
{
  const { ctx, page, errors } = await open(b, base({ skins: { owned: ACC_ALL, equipped: ACC_ON } }), { w: 1366, h: 768, hour: 10 })
  await waitGroups(page, ['acc'])
  await stage(page)
  const pos = await page.evaluate(() => { const L = window.__farm.layout; const h = L.placement.placed.get('house'), t = L.placement.placed.get('tower'); return { house: { x: h.x, y: h.y }, tower: { x: t.x, y: t.y } } })
  // 配件有畫：快照裡房屋、鐘樓區和「沒掛配件」的不同
  const diff = await page.evaluate(() => {
    const e = window.__farm
    const grab = (id, w, h) => { const p = e.layout.placement.placed.get(id); return e.snapshot().getContext('2d').getImageData(Math.round(p.x - w / 2), p.y - h, w, h).data }
    const out = {}
    for (const [id, w, h] of [['house', 139, 134], ['tower', 123, 160]]) {
      const a = grab(id, w, h)
      const keep = e.skins
      e.skins = {}
      const b2 = grab(id, w, h)
      e.skins = keep
      let n = 0
      for (let i = 0; i < a.length; i += 4) if (a[i] !== b2[i] || a[i + 1] !== b2[i + 1] || a[i + 2] !== b2[i + 2]) n++
      out[id] = n
    }
    return out
  })
  ok(diff.house > 200 && diff.tower > 200, `B 配件有畫在房屋（${diff.house} 像素不同）與鐘樓（${diff.tower}）上`)
  const crop = (c, w, h, pad = 8) => ({ x0: Math.round(c.x - w / 2 - pad), x1: Math.round(c.x + w / 2 + pad), y0: Math.round(c.y - h - pad), y1: Math.round(c.y + 6) })
  await saveSceneCrop(page, crop(pos.house, 139, 134), OUT + 'acc-house.png', 4)
  await saveSceneCrop(page, crop(pos.tower, 123, 160), OUT + 'acc-tower.png', 4)
  ok(errors.length === 0, 'B 沒有頁面錯誤 ' + errors.join(' | '))
  await ctx.close()
}
// 亞特蘭提斯房屋／鐘樓＋無塵室外殼也掛得上（截圖給人看，位置不蓋門窗由 Node 測試逐外觀驗證）
{
  const { ctx, page } = await open(b, base({ skins: { owned: [...ACC_ALL, 'house.gold', 'tower.gold'], equipped: { ...ACC_ON, house: 'house.gold', tower: 'tower.gold' } } }), { w: 1366, h: 768, hour: 10 })
  await waitGroups(page, ['acc', 'skins_house', 'skins_tower'])
  await stage(page)
  const pos = await page.evaluate(() => { const L = window.__farm.layout; const h = L.placement.placed.get('house'), t = L.placement.placed.get('tower'); return { house: { x: h.x, y: h.y }, tower: { x: t.x, y: t.y } } })
  const crop = (c, w, h, pad = 8) => ({ x0: Math.round(c.x - w / 2 - pad), x1: Math.round(c.x + w / 2 + pad), y0: Math.round(c.y - h - pad), y1: Math.round(c.y + 6) })
  await saveSceneCrop(page, crop(pos.house, 139, 134), OUT + 'acc-house-atlantis.png', 4)
  await saveSceneCrop(page, crop(pos.tower, 123, 160), OUT + 'acc-tower-atlantis.png', 4)
  await ctx.close()
}

// ================= D. 傳說展示台 =================
const DOG = { L001: 1, L002: 1 }, CAT = { L003: 1, L004: 1 }
const stand = (extra) => base({ ...extra })
{
  // 舊存檔：狗的一對早就集齊（事件旗標在，沒有展示台旗標）→ 載入時補送 1 個、放進倉庫、有彈窗
  const T = T0 - 86400000
  const { ctx, page, errors } = await open(b, stand({ collection: DOG, events: { dogVault: T }, skins: { owned: ['house.gold'], equipped: { house: 'house.gold' } } }), { w: 1366, h: 768, hour: 10 })
  await sleep(1200)
  let s = await st(page)
  ok(s.shop?.decor.filter((d) => d.kind === 'legend_stand').length === 1 && s.events.legendStand !== undefined, 'D 舊存檔補送 1 個傳說展示台（旗標 legendStand）')
  ok(!s.farmLayout || !s.farmLayout.items.some((i) => i.kind === 'legend_stand'), 'D 放進倉庫（沒有擺放紀錄）')
  ok((await page.getByTestId('event-dialog').count()) === 1 && (await page.getByTestId('event-body').innerText()).includes('傳說展示台'), 'D 彈窗：獲得傳說展示台（更新補發）')
  await page.getByTestId('event-ok').click()
  await page.reload()
  await page.getByRole('button', { name: '點擊以開始' }).click()
  await sleep(1500)
  s = await st(page)
  ok(s.shop.decor.filter((d) => d.kind === 'legend_stand').length === 1 && (await page.getByTestId('event-dialog').count()) === 0, 'D 重新整理不再送（只送一次）')
  ok(s.shop.nextDecorId === 2 && s.points === 200, 'D 不給金幣、編號只用 1 個')
  ok(errors.length === 0, 'D 沒有頁面錯誤 ' + errors.join(' | '))
  await ctx.close()
}
{
  // 沒集齊任何一對：不送；只有半對也不送
  const { ctx, page } = await open(b, stand({ collection: { L001: 1, L003: 1 } }), { w: 1366, h: 768, hour: 10 })
  await sleep(1000)
  const s = await st(page)
  ok(!(s.shop?.decor ?? []).some((d) => d.kind === 'legend_stand') && s.events.legendStand === undefined && (await page.getByTestId('event-dialog').count()) === 0, 'D 兩對都只有半對：不送、沒有旗標、沒有彈窗')
  await ctx.close()
}
{
  // 兩對都集齊、貓先集齊：台面顯示貓那一對；點展示台切換成狗那一對並存檔；再點切回
  const { ctx, page, errors } = await open(b, stand({ collection: { ...DOG, ...CAT }, events: { catAtlantis: T0 - 200000, dogVault: T0 - 100000, legendStand: T0 - 100000, colLegend: T0 - 100000 }, shop: { decor: [{ id: 'legend_stand#1', kind: 'legend_stand' }], nextDecorId: 2 }, farmLayout: { items: [{ id: 'legend_stand#1', kind: 'legend_stand', state: 'placed', x: 330, y: 240 }] } }), { w: 1366, h: 768, hour: 10 })
  await waitGroups(page, ['decor_themes'])
  await stage(page)
  ok((await page.evaluate(() => [window.__farm.standPair, window.__farm.standToggle])).join() === 'cat,true', 'D 兩對都集齊：先集齊的是貓 → 台面顯示貓那一對、可以切換')
  const crop = { x0: 330 - 50, x1: 330 + 50, y0: 240 - 70, y1: 246 }
  await saveSceneCrop(page, crop, OUT + 'stand-cat.png', 5)
  const click = async () => {
    const q = await page.evaluate(() => { const L = window.__layout, e = window.__farm; const c = document.querySelector('canvas').getBoundingClientRect(); const p = L.toCss(e.layout, 330, 240 - 12); return { x: p.x + c.left, y: p.y + c.top } })
    await page.mouse.click(q.x, q.y)
    await sleep(300)
  }
  await click()
  ok((await page.evaluate(() => window.__farm.standPair)) === 'dog' && (await st(page)).events.legendStandView === 1, 'D 點展示台：切成狗那一對、存進 events.legendStandView')
  await saveSceneCrop(page, crop, OUT + 'stand-dog.png', 5)
  await click()
  ok((await page.evaluate(() => window.__farm.standPair)) === 'cat' && (await st(page)).events.legendStandView === 0, 'D 再點一次切回貓那一對')
  await click()
  await page.reload()
  await page.getByRole('button', { name: '點擊以開始' }).click()
  await sleep(1500)
  ok((await page.evaluate(() => window.__farm.standPair)) === 'dog', 'D 重新整理後維持切換結果')
  ok(errors.length === 0, 'D 沒有頁面錯誤 ' + errors.join(' | '))
  await ctx.close()
}
{
  // 只集齊一對：台面顯示那一對、點了沒有切換
  const { ctx, page } = await open(b, stand({ collection: CAT, events: { catAtlantis: T0 - 1000, legendStand: T0 - 1000 }, shop: { decor: [{ id: 'legend_stand#1', kind: 'legend_stand' }], nextDecorId: 2 }, farmLayout: { items: [{ id: 'legend_stand#1', kind: 'legend_stand', state: 'placed', x: 330, y: 240 }] } }), { w: 1366, h: 768, hour: 10 })
  await waitGroups(page, ['decor_themes'])
  await stage(page)
  ok((await page.evaluate(() => [window.__farm.standPair, window.__farm.standToggle])).join() === 'cat,false', 'D 只集齊貓：台面顯示貓那一對、不能切換')
  const hit = await page.evaluate(() => window.__farm.hitTest(...(() => { const L = window.__layout, e = window.__farm; const p = L.toCss(e.layout, 330, 228); return [p.x, p.y] })()))
  ok(hit === null, 'D 不能切換時點展示台沒有作用')
  await ctx.close()
}
{
  // 展示台在倉庫、可以拿出來擺（編輯農場）；不佔購買上限
  const { ctx, page } = await open(b, stand({ collection: DOG, events: { dogVault: T0 - 1000, legendStand: T0 - 1000 }, shop: { decor: [{ id: 'legend_stand#1', kind: 'legend_stand' }], nextDecorId: 2 } }), { w: 1366, h: 768, hour: 10 })
  await waitGroups(page, ['decor_themes'])
  await page.evaluate(() => window.__ui.getState().setBuildMode(true))
  await sleep(600)
  ok((await page.locator('[data-testid^="inv-"][title*="傳說展示台"]').count()) === 1, 'D 倉庫裡有傳說展示台')
  await ctx.close()
}
writeFileSync(OUT + 'done.txt', new Date().toISOString())
await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : 'C 瀏覽器測試全部通過')
process.exit(fails() ? 1 : 0)
