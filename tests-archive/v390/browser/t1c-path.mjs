// T1b：預設配置與 v3.8.1 逐像素相同，只允許「新增的那段沙土路」（x < 46、沙土路的列）不同；列出實際差異範圍
// 兩個 dev server（新版 5181、v3.8.1 5182），各自 new PixelEngine()、setSize 到 v3.8.1 也會產生 640×320 的畫布，畫同樣的場景，比對 RGBA。
import { chromium } from 'playwright-core'
const NEW = (process.env.NEW_URL ?? 'http://localhost:5181/'), OLD = (process.env.OLD_URL ?? 'http://localhost:5182/')
const SIZES = [[1280, 640], [1920, 960]]
const SCEN = [
  { name: '白天晴天、沒有建築', hour: 10, weather: 'sunny', owned: [] },
  { name: '白天、三個建築', hour: 10, weather: 'sunny', owned: ['kennel', 'bowls', 'catTree'] },
  { name: '多雲傍晚、三個建築', hour: 17.5, weather: 'cloudy', owned: ['kennel', 'bowls', 'catTree'] },
  { name: '夜晚、三個建築（路燈光暈、鐘面）', hour: 22, weather: 'sunny', owned: ['kennel', 'bowls', 'catTree'] },
  { name: '夜晚、鐘塔開門（暖光）', hour: 22, weather: 'sunny', owned: [], towerHover: true },
  { name: '金色住家＋黃金鐘樓', hour: 10, weather: 'sunny', owned: ['kennel'], skins: { house: 'house.gold', tower: 'tower.gold' } },
  { name: '下雨（固定雨絲）', hour: 13, weather: 'rain', owned: ['bowls'], drops: true },
  { name: '下雪（固定雪花）', hour: 8, weather: 'snow', owned: [], drops: true },
]
const b = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
async function boot(url) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  await page.goto(url)
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click()
  await bt.waitFor({ state: 'detached' })
  await page.waitForFunction(async () => (await import('/src/farm/pixel/assets.ts')).assets.ready)
  await page.evaluate(async () => (await import('/src/farm/pixel/assets.ts')).assets.loadGroup('skins'))
  return page
}
async function shoot(page, [w, h], sc, raw = false) {
  return page.evaluate(async ([w, h, sc, raw]) => {
    const { PixelEngine } = await import('/src/farm/pixel/engine.ts')
    const e = new PixelEngine()
    e.setSize(w, h, 1)
    e.setOwned(sc.owned)
    e.skins = sc.skins ?? {}
    e.time = 123.4
    e.towerHover = !!sc.towerHover
    e.lastFrame = { nowMs: 0, hour: sc.hour, weather: sc.weather, gifts: [] }
    if (sc.drops) {
      const d = []
      for (let i = 0; i < 200; i++) d.push({ x: (i * 37) % 640, y: (i * 53) % 320, v: 1, ph: i, len: 4 + (i % 5) })
      e.drops = d
    }
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')
    e.render(ctx)
    const data = ctx.getImageData(0, 0, w, h).data
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16)
    const L = e.layout
    const out = { hash, W: L.W, H: L.H, S: L.S }
    if (raw) {
      let s = ''
      for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000))
      out.b64 = btoa(s)
    }
    return out
  }, [w, h, sc, raw])
}
const pn = await boot(NEW), po = await boot(OLD)
let fail = 0
const DIFFS = []
const LOGI = new Set()
for (const size of SIZES)
  for (const sc of SCEN) {
    const a = await shoot(pn, size, sc), o = await shoot(po, size, sc)
    let ok = a.W === o.W && a.H === o.H
    let extra = '（逐像素相同）'
    if (a.hash !== o.hash) {
      const ra = Buffer.from((await shoot(pn, size, sc, true)).b64, 'base64'), ro = Buffer.from((await shoot(po, size, sc, true)).b64, 'base64')
      const S = a.S, W = size[0]
      let n = 0, outside = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1
      for (let i = 0; i < ra.length; i += 4) {
        if (ra[i] === ro[i] && ra[i + 1] === ro[i + 1] && ra[i + 2] === ro[i + 2] && ra[i + 3] === ro[i + 3]) continue
        n++
        const px = (i / 4) % W, py = Math.floor(i / 4 / W)
        const lx = Math.floor(px / S), ly = Math.floor(py / S)
        bx0 = Math.min(bx0, lx); by0 = Math.min(by0, ly); bx1 = Math.max(bx1, lx); by1 = Math.max(by1, ly)
        // 允許的範圍：x < 46（v3.8.1 沙土路起點）、沙土路的列 247～313
        if (!(lx < 46 && ly >= 247 && ly < 314)) outside++
        if (S === 3 && (px % 3 === 1) && (py % 3 === 1)) LOGI.add(lx + ',' + ly + ',' + sc.name)
      }
      if (outside) ok = false
      extra = `：不同 ${n} 個裝置像素（${(n / (S * S)).toFixed(0)} 個邏輯像素），範圍 x ${bx0}～${bx1}、y ${by0}～${by1}（邏輯座標），在允許範圍外 ${outside}`
      DIFFS.push({ size: size.join('×'), name: sc.name, n: n / (S * S), box: [bx0, by0, bx1, by1], outside })
    }
    if (!ok) fail++
    console.log(`${ok ? '通過' : '失敗'} ${size.join('×')} ${sc.name}${extra}`)
  }
console.log(fail ? `T1b 失敗 ${fail} 項` : `T1b 全部通過（${SIZES.length * SCEN.length} 項）`)
console.log('差異範圍彙總：' + JSON.stringify(DIFFS.map((d) => d.box)))
;(await import('node:fs')).writeFileSync('diff-pixels.json', JSON.stringify([...LOGI]))
await b.close()
process.exit(fail ? 1 : 0)
