// 沒有標籤、沒有揮爪、沒有野餐的情境：新版與 v3.9.1（80c567a）逐像素相同
// 兩個 dev server（NEW = 目前、OLD = .work/v391src），各自 new PixelEngine()、同一個亂數種子 sync 同樣的寵物，
// 把每隻寵物放到固定位置與動作（含頭上圖示：餓、髒、心情差、開心、睡覺 ZZZ；地上的愛心粒子），畫同樣的場景，比對 RGBA。
import { chromium } from 'playwright-core'
import { ok, fails } from './lib.mjs'
const NEW = process.env.NEW_URL ?? 'http://localhost:5181/', OLD = process.env.OLD_URL ?? 'http://localhost:5182/'
const SIZES = [[1280, 640], [1920, 960]]
const SCEN = [
  { name: '白天、寵物各種頭上圖示、沒有建築', hour: 10, weather: 'sunny', owned: [], stats: true },
  { name: '白天、三個建築、愛心粒子', hour: 10, weather: 'sunny', owned: ['kennel', 'bowls', 'catTree'], hearts: true },
  { name: '夜晚、睡覺 ZZZ', hour: 2, weather: 'sunny', owned: [], sleep: true },
  { name: '下雨、三個建築', hour: 13, weather: 'rain', owned: ['kennel', 'bowls', 'catTree'] },
  { name: '貓的 swat 姿勢（不是滑鼠揮爪：沒有弧線）', hour: 10, weather: 'sunny', owned: [], swatNoHover: true },
]
const PETS = [['d1', 'dog', 'shiba'], ['c1', 'cat', 'tabby'], ['d2', 'dog', 'golden'], ['c2', 'cat', 'calico'], ['c3', 'cat', 'black'], ['d3', 'dog', 'corgi']]
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
  return page
}
async function shoot(page, [w, h], sc) {
  return page.evaluate(async ([w, h, sc, PETS]) => {
    const { PixelEngine } = await import('/src/farm/pixel/engine.ts')
    const e = new PixelEngine()
    let sd = 42
    e.rand = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 }
    e.setSize(w, h, 1)
    e.setOwned(sc.owned)
    e.time = 77.7
    const NOW = new Date(2026, 10, 19, 12, 0, 0).getTime()
    const pets = PETS.map(([id, sp, v], i) => ({ id, species: sp, variant: v, name: id, adoptedAt: NOW - 5e8, heightFactor: 1, weight: 50, satiety: sc.stats && i === 0 ? 10 : 80, mood: sc.stats && i === 2 ? 10 : sc.stats && i === 3 ? 99 : 80, cleanliness: sc.stats && i === 1 ? 10 : 80, personality: 'lively', lastInteract: NOW }))
    e.sync(pets)
    e.lastFrame = { nowMs: NOW, hour: sc.hour, weather: sc.weather, gifts: [] }
    let k = 0
    for (const a of e.actors.values()) {
      a.x = 120 + k * 70
      a.y = 270 - (k % 2) * 20
      a.facing = k % 2 ? -1 : 1
      a.action = sc.sleep ? 'sleep' : sc.swatNoHover && a.pet.species === 'cat' ? 'swat' : k % 3 === 0 ? 'sit' : 'idle'
      a.override = sc.swatNoHover && a.pet.species === 'cat' ? { action: 'swat', left: 0.4, speedMul: 0, tag: 'x' } : null
      a.t = 0
      a.animT = 0
      a.hop = 0
      k++
    }
    if (sc.hearts) for (let i = 0; i < 4; i++) e.particles.push({ key: 'fx_heart', x: 150 + i * 60, y: 200, vx: 0, vy: 0, life: 0.2 * i, max: 1.4 })
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    e.render(ctx)
    const data = ctx.getImageData(0, 0, w, h).data
    let s = ''
    for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000))
    return { b64: btoa(s), icons: [...e.actors.values()].map((a) => e.statusIcon(a, e.lastFrame)) }
  }, [w, h, sc, PETS])
}
const pn = await boot(NEW), po = await boot(OLD)
for (const size of SIZES)
  for (const sc of SCEN) {
    const a = await shoot(pn, size, sc), o = await shoot(po, size, sc)
    const ra = Buffer.from(a.b64, 'base64'), ro = Buffer.from(o.b64, 'base64')
    let n = 0
    for (let i = 0; i < ra.length; i++) if (ra[i] !== ro[i]) n++
    ok(ra.length === ro.length && n === 0, `${size.join('×')} ${sc.name}：和 v3.9.1 逐像素相同（不同 ${n} 個位元組；頭上圖示 ${a.icons.join(',')}）`)
  }
await b.close()
console.log(fails() ? `失敗 ${fails()} 項` : '全部通過')
process.exit(fails() ? 1 : 0)
