// 4.0-B1 停點 2 瀏覽器測試＋截圖（dev server，NEW_URL）。截圖到 shots/stop2/。
//  A. 商店建築分頁：7 個部位列、原樣使用中、小建築沒本體不能買（原因）、買外觀（扣 30、立刻換上）、換回原樣、再換上、
//     傳說亞特蘭提斯：沒拿到不出現、拿到了出現並可換上／換回；1366×282 捲得到最後一列並能換
//  B. 穿整套同主題（6 主題）：1366×768 日夜、1366×282；場景互動入口（啟動台門、塔門、計算機窗、鐘面、公佈欄）位置照舊、可點
//  C. 每部位 6 款 contact sheet（場景近照）；代表近照：門洞裡的狗、兩層平台的貓、泡澡、鐘樓開門（含「遊戲」招牌）、住家門微開、夜晚亮燈、公佈欄 3 張便條
//  D. 拍立得：快照（拍照用的畫面）裡的建築是穿著的外觀
import { launch, open, save, pet, ok, fails, sleep, saveSceneCrop } from '../../calendar-tweaks/browser/lib.mjs'
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('./shots/stop2/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const THEMES = ['atlantis', 'cleanroom', 'forest', 'magic', 'punk', 'plaid']
const PARTS = ['house', 'tower', 'pond', 'board', 'kennel', 'catTree', 'bowls']
const skinOf = (part, t) => (t === 'atlantis' && (part === 'house' || part === 'tower') ? `${part}.gold` : `${part}.${t}`)
const ALL_OWNED = THEMES.flatMap((t) => PARTS.map((p) => skinOf(p, t)))
const T0 = Date.now()
const notes = ['買貓砂', '週五開會', '整理實驗數據'].map((title, i) => ({ id: 'n' + i, title, body: '', color: ['yellow', 'pink', 'blue'][i], createdAt: T0 - i * 1000, updatedAt: T0 - i * 1000 }))
const PETS = [['p1', 'dog', 'shiba'], ['p2', 'cat', 'tabby'], ['p3', 'dog', 'golden'], ['p4', 'cat', 'black'], ['p5', 'dog', 'corgi'], ['p6', 'cat', 'calico']]
const baseSave = (extra = {}) => save({ pets: PETS.map(([id, sp, v]) => pet(id, sp, v, { personality: 'lively' })), nextPetId: 7, points: 500, ownedBuildings: ['kennel', 'bowls', 'catTree'], notes, ...extra })
const themeSave = (t) => baseSave({ skins: { owned: ALL_OWNED, equipped: Object.fromEntries(PARTS.map((p) => [p, skinOf(p, t)])) } })

const st = (page) => page.evaluate(() => window.__farmStore.getState().save)
const shotPage = (page, f) => page.screenshot({ path: OUT + f })
async function waitSkins(page, groups = ['skins_house', 'skins_tower', 'skins_pond', 'skins_board', 'skins_small']) {
  await page.evaluate(async (gs) => { const { assets } = await import('/src/farm/pixel/assets.ts'); await Promise.all(gs.map((g) => assets.loadGroup(g))) }, groups)
  await sleep(300)
}
/** 寵物停住、放到固定位置；night：狗窩裡（柴犬）、窩門口（黃金）、貓跳台頂層（橘貓）與中層（黑貓）；bath：柯基泡在池塘裡 */
async function stage(page, hour, { bath = false } = {}) {
  await page.evaluate((h) => { window.__overrides.weather = 'sunny'; window.__overrides.hour = h }, hour)
  await sleep(300)
  return page.evaluate(([night, bath]) => {
    const e = window.__farm, L = window.__layout
    e.editing = true
    e.particles.length = 0
    const bs = e.buildings()
    const seat = (a, id, s) => { const slot = bs.get(id); a.bld = { id, seat: s, purpose: 'sleep', phase: 'at', t: 0, leaveIn: null, poseIn: 9, stage: 'seat', near: { x: slot.x, y: slot.y + 6 } } }
    let k = 0
    for (const a of e.actors.values()) {
      a.drag = null; a.fly = null; a.bath = null; a.play = null; a.picnic = null; a.override = null; a.hv = null; a.bld = null
      a.x = 260 + k * 46; a.y = 268 - (k % 2) * 14; a.facing = k % 2 ? -1 : 1
      a.action = night ? 'sleep' : k % 3 === 0 ? 'sit' : 'idle'
      a.t = 0; a.animT = 0; a.hop = 0; a.lift = 0
      if (night) { if (a.id === 'p1') seat(a, 'kennel', 0); if (a.id === 'p3') seat(a, 'kennel', 1); if (a.id === 'p2') seat(a, 'catTree', 0); if (a.id === 'p4') seat(a, 'catTree', 1) }
      if (bath && a.id === 'p5') { const p = L.pondPos(e.layout); a.x = p.x; a.y = p.y - 20; a.action = 'idle'; a.bath = { phase: 'soak', t: 1, fromX: a.x, fromY: a.y, bestD: 0, stall: 0 } }
      k++
    }
    const out = {}
    for (const [id, s] of bs) out[id] = { x: s.x, y: s.y }
    for (const id of ['house', 'pond', 'board', 'tower']) { const p = e.layout.placement.placed.get(id); if (p) out[id] = { x: p.x, y: p.y } }
    return out
  }, [hour >= 20 || hour < 6, bath])
}
const box = (c, w, h, pad = 6, up = 0) => ({ x0: Math.max(0, Math.round(c.x - w / 2 - pad)), x1: Math.round(c.x + w / 2 + pad), y0: Math.max(0, Math.round(c.y - h - pad - up)), y1: Math.round(c.y + 4) })
const PART_BOX = { house: [139, 134], tower: [123, 160], pond: [110, 79], board: [64, 50], kennel: [99, 83], catTree: [72, 90], bowls: [57, 31] }
const PART_POS = { house: 'house', tower: 'tower', pond: 'pond', board: 'board', kennel: 'kennel', catTree: 'catTree', bowls: 'bowls' }

const b = await launch()

// ================= A. 商店 =================
{
  const { ctx, page, errors } = await open(b, baseSave({ ownedBuildings: ['bowls', 'catTree'], skins: { owned: [], equipped: {} } }), { w: 1366, h: 768, hour: 10 })
  await page.evaluate(() => window.__ui.getState().setShopTab('building'))
  await page.getByTestId('skin-row-bowls').waitFor()
  await sleep(1200)
  for (const p of PARTS) ok((await page.getByTestId(`skin-row-${p}`).count()) === 1, `A 商店有「${p}」外觀列`)
  for (const p of PARTS) ok((await page.getByTestId(`skin-card-${p}-default`).getAttribute('data-state')) === 'using', `A ${p} 原樣是使用中`)
  ok((await page.getByTestId('skin-card-house-house.gold').count()) === 0 && (await page.getByTestId('skin-card-tower-tower.gold').count()) === 0, 'A 沒拿到的亞特蘭提斯房屋／鐘樓不出現')
  ok((await page.getByTestId('skin-card-pond-pond.atlantis').count()) === 1, 'A 亞特蘭提斯池塘在商店賣')
  ok((await page.getByTestId('skin-why-kennel-kennel.forest').innerText()).includes('狗窩') && (await page.getByTestId('shop-buy-skin.kennel.forest').isDisabled()), 'A 沒有狗窩不能買狗窩外殼（顯示原因）')
  ok(!(await page.getByTestId('shop-buy-skin.bowls.forest').isDisabled()), 'A 有食盆就能買食盆外殼')
  await shotPage(page, 'shop-building-1366x768.png')
  const p0 = (await st(page)).points
  await page.getByTestId('shop-buy-skin.house.forest').click()
  ok((await page.getByTestId('shop-confirm-price').innerText()).includes('30'), 'A 房子外裝 30 金幣')
  await page.getByTestId('shop-confirm-ok').click()
  await page.getByTestId('skin-card-house-house.forest').and(page.locator('[data-state="using"]')).waitFor()
  let s = await st(page)
  ok(s.points === p0 - 30 && s.skins.owned.includes('house.forest') && s.skins.equipped.house === 'house.forest', `A 買了扣 30（${p0}→${s.points}）、立刻換上`)
  ok((await page.getByTestId('skin-card-house-default').getAttribute('data-state')) === 'owned', 'A 原樣變成「換回原樣」')
  await page.getByTestId('skin-wear-house-default').click()
  await sleep(200)
  s = await st(page)
  ok(!('house' in s.skins.equipped) && s.skins.owned.includes('house.forest'), 'A 換回原樣：equipped 拿掉、仍擁有')
  ok((await page.getByTestId('skin-card-house-house.forest').getAttribute('data-state')) === 'owned', 'A 森林房子顯示「換上」')
  await page.getByTestId('skin-wear-house-house.forest').click()
  await sleep(200)
  ok((await st(page)).skins.equipped.house === 'house.forest', 'A 再換上')
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('aemc-desktop:farm-save')).skins.equipped.house)) === 'house.forest', 'A 換外觀立刻存檔')
  const p1 = (await st(page)).points
  await page.getByTestId('shop-buy-skin.bowls.magic').click()
  ok((await page.getByTestId('shop-confirm-price').innerText()).includes('10'), 'A 食盆外殼 = 本體價 10')
  await page.getByTestId('shop-confirm-ok').click()
  await sleep(400)
  ok((await st(page)).points === p1 - 10, 'A 食盆外殼扣 10')
  await shotPage(page, 'shop-after-buy-1366x768.png')
  ok(errors.length === 0, 'A 沒有頁面錯誤 ' + errors.join(' | '))
  await ctx.close()
}
{
  // 傳說亞特蘭提斯：拿到了出現、可換上換回；1366×282 捲到最後一列
  const { ctx, page, errors } = await open(b, baseSave({ skins: { owned: ['house.gold', 'tower.gold'], equipped: { house: 'house.gold' } } }), { w: 1366, h: 282, hour: 10 })
  await page.evaluate(() => window.__ui.getState().setShopTab('building'))
  await page.getByTestId('skin-row-bowls').waitFor()
  await sleep(1200)
  ok((await page.getByTestId('skin-card-house-house.gold').getAttribute('data-state')) === 'using', 'A 已穿的亞特蘭提斯房屋是使用中')
  ok((await page.getByTestId('skin-card-tower-tower.gold').getAttribute('data-state')) === 'owned', 'A 已擁有的亞特蘭提斯鐘樓可以換上')
  await page.getByTestId('skin-wear-tower-tower.gold').scrollIntoViewIfNeeded()
  await page.getByTestId('skin-wear-tower-tower.gold').click()
  await sleep(200)
  ok((await st(page)).skins.equipped.tower === 'tower.gold', 'A 換上亞特蘭提斯鐘樓')
  await page.getByTestId('skin-wear-house-default').scrollIntoViewIfNeeded()
  await page.getByTestId('skin-wear-house-default').click()
  await sleep(200)
  ok(!('house' in (await st(page)).skins.equipped), 'A 亞特蘭提斯房屋換回原樣')
  const last = page.getByTestId('skin-card-bowls-bowls.plaid')
  await last.scrollIntoViewIfNeeded()
  ok(await last.isVisible(), 'A 1366×282 捲得到最後一列（食盆外殼）')
  await shotPage(page, 'shop-1366x282.png')
  ok(errors.length === 0, 'A 低視窗沒有頁面錯誤 ' + errors.join(' | '))
  await ctx.close()
}

// ================= B／C／D. 穿整套主題 =================
const crops = {} // part → [{ t, file }]
for (const t of THEMES) {
  for (const [w, h, hour, tag] of [[1366, 768, 10, 'day'], [1366, 768, 22, 'night'], [1366, 282, 10, 'low']]) {
    const { ctx, page, errors } = await open(b, themeSave(t), { w, h, hour })
    await waitSkins(page)
    const pos = await stage(page, hour)
    await sleep(300)
    await shotPage(page, `scene-${t}-${w}x${h}-${tag}.png`)
    if (tag === 'day') {
      // 互動入口照舊：啟動台門、塔門、計算機窗、鐘面、公佈欄的 DOM 點擊區都在畫面上
      for (const id of ['launchpad-door', 'tower-door']) ok(await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().width > 8), `B ${t} ${id} 點擊區存在`)
      ok((await page.getByTestId('board-thumb').count()) === 3, `B ${t} 公佈欄 3 張便條標題縮圖`)
      // 代表近照與 contact sheet 用的場景近照（邏輯像素 ×3）
      for (const part of PARTS) {
        const c = pos[PART_POS[part]]
        if (!c) continue
        const [bw, bh] = PART_BOX[part]
        const f = `crop-${part}-${t}.png`
        await saveSceneCrop(page, box(c, bw, bh, 6, part === 'catTree' ? 14 : 0), OUT + f, 3)
        ;(crops[part] ??= []).push({ t, file: OUT + f })
      }
      // D. 拍照用的快照：建築是穿著的外觀（快照的住家區和「沒穿外觀」的不同）
      const diff = await page.evaluate(async () => {
        const e = window.__farm
        const L = window.__layout
        const p = e.layout.placement.placed.get('house')
        const r = { x: p.x - 70, y: p.y - 134, w: 139, h: 134 }
        const grab = () => e.snapshot().getContext('2d').getImageData(r.x, r.y, r.w, r.h).data
        const a = grab()
        const keep = e.skins
        e.skins = {}
        const b2 = grab()
        e.skins = keep
        let n = 0
        for (let i = 0; i < a.length; i += 4) if (a[i] !== b2[i] || a[i + 1] !== b2[i + 1] || a[i + 2] !== b2[i + 2]) n++
        void L
        return n
      })
      ok(diff > 1000, `D ${t} 拍照快照裡的住家是穿著的外觀（和原樣不同 ${diff} 像素）`)
    }
    if (tag === 'night') {
      await saveSceneCrop(page, box(pos.kennel, 99, 83, 10), OUT + `close-kennel-dog-${t}.png`, 4)
      await saveSceneCrop(page, box(pos.catTree, 72, 90, 10, 16), OUT + `close-cattree-cats-${t}.png`, 4)
      await saveSceneCrop(page, box(pos.house, 139, 134, 4), OUT + `close-house-night-${t}.png`, 3)
    }
    ok(errors.length === 0, `B ${t} ${tag} 沒有頁面錯誤 ` + errors.join(' | '))
    await ctx.close()
  }
}
// 代表近照：泡澡（每主題都拍，方形無塵室要看）、鐘樓開門＋「遊戲」招牌、住家門微開（亞特蘭提斯、無塵室、魔法）
for (const t of THEMES) {
  const { ctx, page } = await open(b, themeSave(t), { w: 1366, h: 768, hour: 10 })
  await waitSkins(page)
  const pos = await stage(page, 10, { bath: true })
  await sleep(300)
  await saveSceneCrop(page, box(pos.pond, 110, 79, 10, 10), OUT + `close-bath-${t}.png`, 4)
  if (['atlantis', 'cleanroom', 'magic'].includes(t)) {
    // 鐘樓開門：滑鼠移到塔門（DOM 點擊區），拍整個畫面的鐘樓區（「遊戲」招牌是 DOM）
    const door = await page.getByTestId('tower-door').boundingBox()
    await page.mouse.move(door.x + door.width / 2, door.y + door.height / 2)
    await sleep(400)
    const tw = await page.evaluate(() => { const L = window.__layout, e = window.__farm; return L.rectCss(e.layout, { x0: L.towerX(e.layout) - 66, x1: L.towerX(e.layout) + 66, y0: L.towerBase(e.layout) - 166, y1: L.towerBase(e.layout) + 4 }) })
    await page.screenshot({ path: OUT + `close-tower-open-${t}.png`, clip: { x: tw.x0, y: tw.y0, width: tw.x1 - tw.x0, height: tw.y1 - tw.y0 } })
    const ld = await page.getByTestId('launchpad-door').boundingBox()
    await page.mouse.move(ld.x + ld.width / 2, ld.y + ld.height / 2)
    await sleep(400)
    await saveSceneCrop(page, box(pos.house, 139, 134, 4), OUT + `close-house-ajar-${t}.png`, 3)
    await page.mouse.move(5, 300)
  }
  await ctx.close()
}
// contact sheets：每部位一張（6 主題並排）
for (const [part, list] of Object.entries(crops)) {
  const metas = await Promise.all(list.map((c) => sharp(c.file).metadata()))
  const W = metas.reduce((a, m) => a + m.width + 8, 0), H = Math.max(...metas.map((m) => m.height)) + 24
  let x = 0
  const comps = []
  for (let i = 0; i < list.length; i++) {
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${metas[i].width}" height="22"><text x="4" y="16" font-size="15" font-family="sans-serif" fill="#fff">${part} ${list[i].t}</text></svg>`), left: x, top: 0 })
    comps.push({ input: list[i].file, left: x, top: 24 })
    x += metas[i].width + 8
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 30, g: 32, b: 40 } } }).composite(comps).png().toFile(OUT + `sheet-${part}.png`)
}
writeFileSync(OUT + 'done.txt', new Date().toISOString())
await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : 'B1 外殼瀏覽器測試全部通過')
process.exit(fails() ? 1 : 0)
