// 4.0-B2 瀏覽器測試＋截圖（dev server，NEW_URL）。截圖到 shots/。
//  A. 商店「裝飾品」分頁：環境主題列（原樣＝草地使用中＋6 款，30 金幣，買了立刻換上、可切換、換回原樣、重新整理後維持）；主題裝飾 48 種各主題小標題與價格；買裝飾進倉庫；1366×282 捲得到最後
//  B. 6 主題場景 1366×768 日夜（12 張）、無塵室下雨與下雪各 1 張、1366×282 低視窗 1 張（共 15 張）：
//     主題圖有載入、場景有擺主題裝飾與路燈／樹的主題圖；夜晚路燈光暈在各自錨點；無塵室雨雪只在窗玻璃範圍
//  C. 舊存檔相容：沒有環境主題的存檔照舊顯示草地
import { launch, open, save, pet, ok, fails, sleep } from '../../calendar-tweaks/browser/lib.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('./shots/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const THEMES = ['atlantis', 'cleanroom', 'forest', 'magic', 'punk', 'plaid']
const THEME_NAME = { atlantis: '亞特蘭提斯', cleanroom: '無塵室', forest: '森林', magic: '魔法', punk: '龐克夜城', plaid: '野餐鄉村' }
const T0 = Date.now()
const PETS = [['p1', 'dog', 'shiba'], ['p2', 'cat', 'tabby'], ['p3', 'dog', 'golden'], ['p4', 'cat', 'black']]
// 每個主題擺的裝飾：[種類, x, y]（腳底中心；都在草地範圍內、彼此不重疊）
const DECOR = {
  atlantis: [['jelly_lamp', 250, 206], ['temple_arch', 330, 240], ['seahorse_statue', 470, 226], ['coral_pot', 400, 200]],
  cleanroom: [['warn_light', 250, 206], ['air_shower', 330, 240], ['lab_bench', 470, 226], ['info_terminal', 400, 200]],
  forest: [['firefly_jar', 250, 206], ['tree_house', 330, 240], ['moss_log', 470, 226], ['mushroom_ring', 400, 200]],
  magic: [['crystal_cluster', 250, 206], ['rune_circle', 330, 240], ['star_telescope', 470, 226], ['crystal_ball', 400, 200]],
  punk: [['neon_star', 250, 206], ['neon_stage', 330, 240], ['speaker', 470, 226], ['guitar_stand', 400, 200]],
  plaid: [['cake_stand', 250, 206], ['carousel', 330, 240], ['rocking_chair', 470, 226], ['windmill', 400, 200]],
}
const decorSave = (t) => {
  const list = DECOR[t]
  return {
    shop: { decor: list.map(([k], i) => ({ id: `${k}#${i + 1}`, kind: k })), nextDecorId: list.length + 1 },
    farmLayout: { items: list.map(([k, x, y], i) => ({ id: `${k}#${i + 1}`, kind: k, state: 'placed', x, y })) },
  }
}
const envSave = (t, extra = {}) =>
  save({ pets: PETS.map(([id, sp, v]) => pet(id, sp, v, { personality: 'lively' })), nextPetId: 5, points: 500, ...(t ? { skins: { owned: THEMES.map((x) => 'env.' + x), equipped: { env: 'env.' + t } }, ...decorSave(t) } : {}), ...extra })

const st = (page) => page.evaluate(() => window.__farmStore.getState().save)
const shotPage = (page, f) => page.screenshot({ path: OUT + f })
async function waitGroups(page, gs) {
  await page.evaluate(async (gs) => { const { assets } = await import('/src/farm/pixel/assets.ts'); await Promise.all(gs.map((g) => assets.loadGroup(g))) }, gs)
  await sleep(500)
}
/** 寵物停在固定位置（不擋畫面）、天氣與時間固定 */
async function stage(page, hour, weather = 'sunny') {
  await page.evaluate(([h, w]) => { window.__overrides.weather = w; window.__overrides.hour = h }, [hour, weather])
  await sleep(300)
  await page.evaluate(() => {
    const e = window.__farm
    e.particles.length = 0
    let k = 0
    for (const a of e.actors.values()) {
      a.drag = null; a.fly = null; a.bath = null; a.play = null; a.picnic = null; a.override = null; a.hv = null; a.bld = null
      a.x = 120 + k * 60; a.y = 290 - (k % 2) * 14; a.facing = k % 2 ? -1 : 1; a.action = 'idle'; a.t = 0; a.animT = 0
      k++
    }
  })
  await sleep(300)
}

const b = await launch()

// ================= A. 商店 =================
{
  const { ctx, page, errors } = await open(b, envSave(null, { skins: { owned: [], equipped: {} } }), { w: 1366, h: 768, hour: 10 })
  await page.evaluate(() => window.__ui.getState().setShopTab('decor'))
  await page.getByTestId('skin-row-env').waitFor()
  await sleep(1500)
  ok((await page.getByTestId('skin-card-env-default').getAttribute('data-state')) === 'using', 'A 環境主題「草地」是使用中')
  for (const t of THEMES) ok((await page.getByTestId(`skin-card-env-env.${t}`).count()) === 1, `A 有「${THEME_NAME[t]}」環境卡`)
  const frames = await page.getByTestId('skin-row-env').locator('canvas').evaluateAll((els) => els.map((e) => e.getAttribute('data-frame')))
  ok(['envthumb_grass', ...THEMES.map((t) => 'envthumb_' + t)].every((f) => frames.includes(f)), 'A 環境卡的縮圖都是 envthumb_*')
  const wOk = await page.getByTestId('skin-row-env').locator('canvas').evaluateAll((els) => els.every((e) => e.width > 40 && e.height > 20))
  ok(wOk, 'A 縮圖有畫出來')
  ok((await page.getByTestId('shop-item-decor.jelly_lamp').count()) === 1, 'A 主題裝飾「發光水母燈」在商店')
  const heads = await page.getByTestId('shop-panel-decor').locator('h3').allInnerTexts()
  ok(['環境主題', '亞特蘭提斯裝飾', '無塵室裝飾', '森林裝飾', '魔法裝飾', '龐克夜城裝飾', '野餐鄉村裝飾', '其他擺設'].every((h) => heads.includes(h)), 'A 小標題：環境主題＋六個主題裝飾＋其他擺設 ' + heads.join('、'))
  await shotPage(page, 'shop-decor-1366x768.png')
  const p0 = (await st(page)).points
  await page.getByTestId('shop-buy-env.forest').click()
  ok((await page.getByTestId('shop-confirm-price').innerText()).includes('30'), 'A 環境主題 30 金幣')
  await page.getByTestId('shop-confirm-ok').click()
  await page.getByTestId('skin-card-env-env.forest').and(page.locator('[data-state="using"]')).waitFor()
  let s = await st(page)
  ok(s.points === p0 - 30 && s.skins.owned.includes('env.forest') && s.skins.equipped.env === 'env.forest', `A 買了扣 30（${p0}→${s.points}）、立刻換上`)
  await page.waitForFunction(() => window.__farm.envNow() === 'forest')
  ok(true, 'A 引擎載入森林主題圖後換圖（envNow = forest）')
  ok((await page.getByTestId('skin-card-env-default').getAttribute('data-state')) === 'owned', 'A 草地變成「換回原樣」')
  await page.getByTestId('skin-wear-env-default').click()
  await sleep(300)
  s = await st(page)
  ok(!('env' in s.skins.equipped) && s.skins.owned.includes('env.forest'), 'A 換回草地：equipped.env 拿掉、仍擁有')
  ok((await page.evaluate(() => window.__farm.envNow())) === null, 'A 換回草地後引擎用預設圖')
  await page.getByTestId('skin-wear-env-env.forest').click()
  await sleep(300)
  ok((await st(page)).points === s.points, 'A 再換上不扣金幣')
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('aemc-desktop:farm-save')).skins.equipped.env)) === 'env.forest', 'A 切換立刻存檔')
  // 買主題裝飾：小 3／中 6／大 10
  for (const [kind, price] of [['jelly_lamp', 3], ['old_pillar', 6], ['temple_arch', 10]]) {
    const before = (await st(page)).points
    await page.getByTestId('shop-buy-decor.' + kind).click()
    ok((await page.getByTestId('shop-confirm-price').innerText()).includes(String(price)), `A ${kind} 價格 ${price}`)
    await page.getByTestId('shop-confirm-ok').click()
    await sleep(400)
    const a = await st(page)
    ok(a.points === before - price && a.shop.decor.some((d) => d.kind === kind), `A 買 ${kind} 扣 ${price}、進倉庫（shop.decor）`)
  }
  await shotPage(page, 'shop-decor-after-buy.png')
  ok(errors.length === 0, 'A 沒有頁面錯誤 ' + errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, page, errors } = await open(b, envSave(null, { skins: { owned: [], equipped: {} } }), { w: 1366, h: 282, hour: 10 })
  await page.evaluate(() => window.__ui.getState().setShopTab('decor'))
  await page.getByTestId('skin-row-env').waitFor()
  await sleep(1500)
  const last = page.getByTestId('shop-item-decor.windmill')
  await last.scrollIntoViewIfNeeded()
  ok(await last.isVisible(), 'A 1366×282 捲得到最後一個商品（彩旗風車）')
  await shotPage(page, 'shop-decor-1366x282.png')
  ok(errors.length === 0, 'A 低視窗沒有頁面錯誤')
  await ctx.close()
}

// ================= B. 場景 =================
const glowAnchors = {}
for (const t of THEMES) {
  for (const [hour, tag] of [[10, 'day'], [22, 'night']]) {
    const { ctx, page, errors } = await open(b, envSave(t), { w: 1366, h: 768, hour })
    await waitGroups(page, ['env_' + t, 'decor_themes'])
    await stage(page, hour)
    ok((await page.evaluate(() => window.__farm.envNow())) === t, `B ${t} ${tag} 引擎用主題 ${t}`)
    const info = await page.evaluate(() => ({ objs: [...window.__farm.layout.placement.placed.values()].map((p) => p.kind) }))
    ok(DECOR[t].every(([k]) => info.objs.includes(k)), `B ${t} ${tag} 擺出來的主題裝飾都在場景物件裡`)
    await sleep(300)
    // 夜晚補光：把這一影格 'lighter' 疊色的 fillRect 記下來，光暈（同心橢圓橫條）的最寬那一列要在各自的錨點上；白天沒有
    const glow = await page.evaluate(async () => {
      const E = await import('/src/farm/config/envThemes.ts')
      const e = window.__farm
      const proto = CanvasRenderingContext2D.prototype
      const orig = proto.fillRect
      const rects = []
      proto.fillRect = function (x, y, w, h) { if (this.globalCompositeOperation === 'lighter') rects.push([x, y, w, h]); return orig.call(this, x, y, w, h) }
      try { e.snapshot() } finally { proto.fillRect = orig }
      const exp = []
      const env = e.envNow()
      const lamp = [...e.layout.placement.placed.values()].find((p) => p.kind === 'lamp')
      const g0 = (env && E.GLOW['lamp_' + env]) || E.LAMP_GLOW_DEFAULT
      if (lamp) exp.push({ name: 'lamp', x: Math.round(lamp.x + g0.dx), y: Math.round(lamp.y - g0.dy), R: Math.round(36 * g0.scale) })
      for (const p of e.layout.placement.placed.values()) if (E.GLOW[p.kind]) exp.push({ name: p.kind, x: Math.round(p.x + E.GLOW[p.kind].dx), y: Math.round(p.y - E.GLOW[p.kind].dy), R: Math.round(36 * E.GLOW[p.kind].scale) })
      return { n: rects.length, exp, found: exp.map((a) => rects.some(([x, y, w]) => x === a.x - a.R && y === a.y && w === 2 * a.R + 1)) }
    })
    if (tag === 'night') ok(glow.exp.length >= 1 && glow.found.every(Boolean), `B ${t} 夜晚光暈在錨點上（${glow.exp.map((a, i) => a.name + '@' + a.x + ',' + a.y + (glow.found[i] ? '' : ' 沒找到')).join('、')}）`)
    else ok(glow.n === 0, `B ${t} 白天沒有光暈`)
    await shotPage(page, `scene-${t}-1366x768-${tag}.png`)
    ok(errors.length === 0, `B ${t} ${tag} 沒有頁面錯誤 ` + errors.join(' | '))
    await ctx.close()
  }
}
// 無塵室：雨、雪（只在窗玻璃）；其他主題下雨：地面也有雨（順序不變）
for (const w of ['rain', 'snow']) {
  const { ctx, page, errors } = await open(b, envSave('cleanroom'), { w: 1366, h: 768, hour: 10 })
  await waitGroups(page, ['env_cleanroom', 'decor_themes'])
  await stage(page, 10, w)
  await sleep(800)
  await shotPage(page, `scene-cleanroom-1366x768-${w}.png`)
  // 同一影格有粒子／沒有粒子的快照比較：地面區（y ≥ farBottom）完全相同、窗玻璃區不同
  const d = await page.evaluate(() => {
    const e = window.__farm
    const fb = e.layout.farBottom
    const grab = () => e.snapshot().getContext('2d').getImageData(0, 0, e.layout.W, e.layout.H).data
    const keep = e.drops
    const a = grab()
    e.drops = []
    const b2 = grab()
    e.drops = keep
    const W = e.layout.W
    let top = 0, ground = 0
    for (let y = 0; y < e.layout.H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (a[i] !== b2[i] || a[i + 1] !== b2[i + 1] || a[i + 2] !== b2[i + 2]) { if (y < fb) top++; else ground++ } }
    return { top, ground, n: keep.length }
  })
  ok(d.n > 20 && d.top > 30, `B 無塵室 ${w}：窗玻璃範圍有粒子（${d.top} 像素不同、粒子 ${d.n}）`)
  ok(d.ground === 0, `B 無塵室 ${w}：牆與地面沒有粒子（地面 ${d.ground} 像素不同）`)
  ok(errors.length === 0, `B 無塵室 ${w} 沒有頁面錯誤`)
  await ctx.close()
}
{
  const { ctx, page } = await open(b, envSave('forest'), { w: 1366, h: 768, hour: 10 })
  await waitGroups(page, ['env_forest', 'decor_themes'])
  await stage(page, 10, 'rain')
  await sleep(800)
  const d = await page.evaluate(() => {
    const e = window.__farm
    const fb = e.layout.farBottom
    const grab = () => e.snapshot().getContext('2d').getImageData(0, 0, e.layout.W, e.layout.H).data
    const keep = e.drops
    const a = grab()
    e.drops = []
    const b2 = grab()
    e.drops = keep
    let ground = 0
    for (let y = fb; y < e.layout.H; y++) for (let x = 0; x < e.layout.W; x++) { const i = (y * e.layout.W + x) * 4; if (a[i] !== b2[i] || a[i + 1] !== b2[i + 1] || a[i + 2] !== b2[i + 2]) ground++ }
    return ground
  })
  ok(d > 30, `B 森林下雨：地面也有雨（順序不變，${d} 像素）`)
  await ctx.close()
}
// 低視窗 1366×282（無塵室：遠景最高）
{
  const { ctx, page, errors } = await open(b, envSave('cleanroom'), { w: 1366, h: 282, hour: 10 })
  await waitGroups(page, ['env_cleanroom', 'decor_themes'])
  await stage(page, 10)
  await sleep(400)
  await shotPage(page, 'scene-cleanroom-1366x282.png')
  ok(errors.length === 0, 'B 無塵室 1366×282 沒有頁面錯誤')
  await ctx.close()
}

// ================= C. 沒有環境主題的存檔 =================
{
  const { ctx, page, errors } = await open(b, envSave(null), { w: 1366, h: 768, hour: 10 })
  await sleep(800)
  ok((await page.evaluate(() => window.__farm.envNow())) === null, 'C 沒有環境主題 = 預設草地')
  ok((await page.evaluate(() => Object.keys(window.__farmStore.getState().save.skins.equipped).length)) === 0, 'C 存檔 equipped 沒有 env')
  ok(errors.length === 0, 'C 沒有頁面錯誤')
  await ctx.close()
}
writeFileSync(OUT + 'done.txt', new Date().toISOString())
void glowAnchors
await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : 'B2 環境主題瀏覽器測試全部通過')
process.exit(fails() ? 1 : 0)
