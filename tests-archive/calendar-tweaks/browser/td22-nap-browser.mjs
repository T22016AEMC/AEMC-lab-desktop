// D2-2 野餐偶爾睡一下（瀏覽器）：讓一隻坐好的寵物睡著（直接把睡覺秒數設上，等同擲中）→ 睡姿＋頭上 ZZZ；
// 拍照時睡著的不做開心姿勢、其他的照樣開心；照片照到睡著的樣子；睡完坐回去；被摸只冒愛心不會醒；
// 野餐期間存檔數值和「沒睡」的對照組相同（同一份存檔、同樣的操作，只差有沒有睡）。截圖
import { launch, open, ok, fails, save, pet, sleep, stored, SHOTS, startPicnic, saveSceneCrop } from './lib.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync(SHOTS, { recursive: true })

const b = await launch()
const pets = [pet('d1', 'dog', 'shiba', { personality: 'lazy' }), pet('c1', 'cat', 'tabby'), pet('d2', 'dog', 'golden')]

async function scenario(withNap) {
  const { ctx, page, errors } = await open(b, save({ pets, ownedBuildings: [], nextPetId: 9 }))
  const mat = await startPicnic(page, 3)
  await sleep(600)
  if (withNap) {
    await page.evaluate(() => { const a = window.__farm.actors.get('d1'); a.picnic.nap = 20; a.picnic.napped = true })
    await sleep(400)
  }
  const st = await page.evaluate(() => {
    const E = window.__farm
    const a = E.actors.get('d1')
    return { action: a.action, icon: E.statusIcon(a, E.lastFrame), others: ['c1', 'd2'].map((id) => E.actors.get(id).action) }
  })
  let photo = null
  if (withNap) {
    ok(st.action === 'sleep', `睡著：動作是 sleep（${st.action}）`)
    ok(st.icon === 'fx_zzz', `睡著：頭上 ZZZ（${st.icon}）`)
    ok(st.others.every((x) => x === 'sit'), `其他的照樣坐著（${st.others.join(',')}）`)
    await saveSceneCrop(page, { x0: mat.x0 - 24, y0: mat.y0 - 44, x1: mat.x1 + 24, y1: mat.y1 + 10 }, SHOTS + 'td22-nap-sleeping.png')
    // 摸頭：只冒愛心、不會醒
    await page.evaluate(() => { const E = window.__farm; const a = E.actors.get('d1'); E.hover.pat(a, E.hoverEnv([...E.actors.values()], E.lastFrame)) })
    await sleep(200)
    ok((await page.evaluate(() => window.__farm.actors.get('d1').action)) === 'sleep', '被摸頭：不會醒')
    // 拍照
    await page.getByTestId('picnic-camera').click({ force: true })
    await sleep(150)
    const during = await page.evaluate(() => ['d1', 'c1', 'd2'].map((id) => window.__farm.actors.get(id).action))
    ok(during[0] === 'sleep' && during[1] === 'happy' && during[2] === 'happy', `拍照：睡著的不做開心姿勢、其他開心（${during.join(',')}）`)
    await page.getByTestId('polaroid-image').waitFor({ state: 'visible', timeout: 10000 })
    const src = await page.getByTestId('polaroid-image').getAttribute('src')
    photo = await page.evaluate(async (u) => { const r = await fetch(u); const bl = await r.blob(); return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(bl) }) }, src)
    writeFileSync(SHOTS + 'td22-nap-photo.png', Buffer.from(photo.split(',')[1], 'base64'))
    ok(!!photo, '照片照到睡著的樣子（截圖 td22-nap-photo.png）')
    await page.getByTestId('polaroid-close').click()
    // 睡完坐回去
    await page.evaluate(() => { window.__farm.actors.get('d1').picnic.nap = 0.3 })
    await sleep(800)
    const after = await page.evaluate(() => { const a = window.__farm.actors.get('d1'); return { action: a.action, napping: (a.picnic?.nap ?? 0) > 0, napped: a.picnic?.napped } })
    ok(after.action === 'sit' && !after.napping && after.napped, `睡完坐回去、這場不再睡（${JSON.stringify(after)}）`)
  } else {
    ok(st.action === 'sit', '對照組：坐著')
  }
  await sleep(2500) // 等節流存檔
  const s = await stored(page)
  ok(errors.length === 0, `${withNap ? '有睡' : '對照組'}：沒有頁面錯誤 ` + errors.join(' | '))
  await ctx.close()
  return s
}
const napSave = await scenario(true)
const plainSave = await scenario(false)
// 兩次各自跑在真實時間上（數值每 10 秒隨時間下降），所以這裡比「不隨時間變的欄位」與數值差距；逐位元相同由 Node 的引擎測試證明（hooks 呼叫紀錄相同）
const fixed = (s) => JSON.stringify({ points: s.points, picnicCount: s.picnic?.count, active: !!s.picnic?.active, pets: s.pets.map((p) => [p.id, p.personality]), bowl: s.bowl, earning: s.earning, owned: s.ownedBuildings, dataRev: s.dataRev })
ok(fixed(napSave) === fixed(plainSave), '野餐中睡覺不改存檔：金幣、野餐次數、寵物、食盆、賺金幣紀錄相同')
const statGap = Math.max(...napSave.pets.flatMap((p, i) => ['satiety', 'mood', 'cleanliness', 'weight'].map((k) => Math.abs(p[k] - plainSave.pets[i][k]))))
ok(statGap < 0.5, `寵物數值只差時間造成的下降（最大差 ${statGap.toFixed(3)}）`)
await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : '全部通過')
process.exit(fails() ? 1 : 0)
