// D2-1 相框日期（瀏覽器）：三款相框都拍到（隨機相框，拍到三款為止），檢查
// - 預覽圖片高度 = (相框高 + 8) × 6、下載 PNG 是預覽的 2 倍
// - 新白邊上有日期（深灰色點陣，位置在白邊正中、對應「2026/11/19」這種格式的點）
// - 日期來自遊戲時間來源（測試把 gameNow 平移到指定的日子）
// - 相框上半部（含照片窗口與裝飾）和沒有日期時逐像素相同（只多了白邊）
// 截圖：三款預覽、三款下載 PNG
import { launch, open, ok, fails, save, pet, sleep, SHOTS, startPicnic } from './lib.mjs'
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const ASSETS = fileURLToPath(new URL('../../../public/assets/', import.meta.url))
const MAN = JSON.parse(readFileSync(ASSETS + readdirSync(ASSETS).find((f) => f.startsWith('manifest')), 'utf8'))
const ATLAS_B64 = readFileSync(ASSETS + MAN.atlases.polaroid.file).toString('base64')
mkdirSync(SHOTS, { recursive: true })

const b = await launch()
const { page, errors } = await open(b, save({ pets: [pet('d1', 'dog', 'shiba'), pet('c1', 'cat', 'tabby')], ownedBuildings: [], nextPetId: 9 }))
// 遊戲時間平移到 2026/12/31（本機時間正午），日期應該寫 2026/12/31
const target = new Date(2026, 11, 31, 12, 0, 0).getTime()
await page.evaluate((t) => { window.__overrides.nowOffsetMs = t - Date.now() }, target)
await startPicnic(page, 2)
await sleep(800)
const DIGITS = { '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'], '6': ['111', '100', '111', '101', '111'], '/': ['001', '001', '010', '100', '100'] }
const seen = new Map()
for (let tries = 0; tries < 30 && seen.size < 3; tries++) {
  await page.getByTestId('picnic-camera').click({ force: true })
  await page.getByTestId('polaroid-image').waitFor({ state: 'visible', timeout: 10000 })
  const frame = await page.getByTestId('polaroid-image').getAttribute('data-frame')
  if (!seen.has(frame)) {
    const dl = page.waitForEvent('download')
    await page.getByTestId('polaroid-download').click()
    const d = await dl
    const fileName = d.suggestedFilename()
    const dlPath = SHOTS + `td21-download-${frame}.png`
    writeFileSync(dlPath, readFileSync(await d.path()))
    const src = await page.getByTestId('polaroid-image').getAttribute('src')
    const info = await page.evaluate(async ([src, dlB64, fr0, atlasB64, DIGITS]) => {
      const load = (u) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = u })
      const im = await load(src)
      const dli = await load('data:image/png;base64,' + dlB64)
      const c = document.createElement('canvas')
      c.width = im.width; c.height = im.height
      const g = c.getContext('2d')
      g.drawImage(im, 0, 0)
      const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('') }
      const F = 6
      const atlas = await load('data:image/png;base64,' + atlasB64)
      const fr = { ...fr0, img: atlas }
      const fw = fr.w, fh = fr.h
      // 日期點陣：12/31 → 「2026/12/31」，取每個點的中心
      const text = '2026/12/31'
      const W = text.length * 4 - 1
      const x0 = Math.floor((fw - W) / 2)
      const top = fh - 2
      const y0 = top + Math.floor((8 + 1 - 5) / 2)
      let hit = 0, miss = 0
      ;[...text].forEach((ch, i) => (DIGITS[ch] ?? null)?.forEach((row, y) => [...row].forEach((bit, x) => {
        const col = px((x0 + i * 4 + x) * F + 3, (y0 + y) * F + 3)
        const dark = col === '#4a4642'
        if ((bit === '1') === dark) hit++
        else miss++
      })))
      // 相框上半部和「沒有日期」的組法逐像素相同：用相框圖直接畫上半部比對（照片窗口以外的相框像素）
      const ref = document.createElement('canvas')
      ref.width = fw * F; ref.height = fh * F
      const rg = ref.getContext('2d')
      rg.imageSmoothingEnabled = false
      rg.drawImage(fr.img, fr.x, fr.y, fw, top, 0, 0, fw * F, top * F)
      const A = g.getImageData(0, 0, fw * F, top * F).data
      const B = rg.getImageData(0, 0, fw * F, top * F).data
      let frameDiff = 0
      for (let k = 0; k < A.length; k += 4) if (B[k + 3] === 255 && (A[k] !== B[k] || A[k + 1] !== B[k + 1] || A[k + 2] !== B[k + 2])) frameDiff++
      // 新白邊的左右邊框：每一列和倒數第 3 列相同
      return { w: im.width, h: im.height, fw, fh, dlw: dli.width, dlh: dli.height, hit, miss, frameDiff, whiteAt: px(Math.floor(fw / 2) * F, (top + 7) * F + 3) }
    }, [src, readFileSync(dlPath).toString('base64'), MAN.frames[frame], ATLAS_B64, DIGITS])
    seen.set(frame, info)
    writeFileSync(SHOTS + `td21-preview-${frame}.png`, Buffer.from((await page.evaluate(async (u) => { const r = await fetch(u); const bl = await r.blob(); return await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(bl) }) }, src)).split(',')[1], 'base64'))
    ok(info.w === info.fw * 6 && info.h === (info.fh + 8) * 6, `${frame}：預覽 ${info.w}×${info.h} = 相框 ${info.fw}×(${info.fh}+8) × 6`)
    ok(info.dlw === info.w * 2 && info.dlh === info.h * 2, `${frame}：下載 PNG ${info.dlw}×${info.dlh} = 預覽 × 2`)
    ok(info.miss === 0 && info.hit === 150, `${frame}：日期「2026/12/31」的點陣都對（對 ${info.hit}、錯 ${info.miss}）`)
    ok(info.frameDiff === 0, `${frame}：相框上半部（照片窗口以外）和原圖逐像素相同（不同 ${info.frameDiff}）`)
    ok(/^#f[a-f0-9]{5}$/.test(info.whiteAt), `${frame}：新白邊是白色（${info.whiteAt}）`)
    ok(fileName === 'picnic-20261231-' + fileName.slice(16, 22) + '.png', `${frame}：下載檔名用同一個時間（${fileName}）`)
  }
  await page.getByTestId('polaroid-close').click()
  await sleep(300)
}
ok(seen.size === 3, `三款相框都拍到（${[...seen.keys()].join(', ')}）`)
ok(errors.length === 0, '沒有頁面錯誤 ' + errors.join(' | '))
await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : '全部通過')
process.exit(fails() ? 1 : 0)
