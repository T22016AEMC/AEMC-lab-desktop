// 4.0-B1 條件 d：外殼圖集的離線與 PWA 升級（舊版 → 新版）。正式 build（沒有 __farm），只用介面與瀏覽器 API。
// 準備（tests-archive/v400b1/run-pwa.mjs 會做）：.work/dist-old = 階段 R 完成時（bfc1390）的 build、.work/dist-new = 目前的 build。
// 一個可切換內容的靜態伺服器（Cache-Control: max-age=600）：先給舊版、再切新版。
//  1. 舊版：穿亞特蘭提斯房屋（舊版叫全黃金、圖集 skins）→ service worker 接手
//  2. 切新版、重新整理兩次：載入的是新 manifest、skins_house 新檔名；快取裡沒有舊的 skins 圖集；存檔還在
//  3. 離線：穿池塘外裝重新整理 → 開機、skins_pond 由快取載入、沒有失敗的請求
import http from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, ok, fails, sleep, KEY } from '../../calendar-tweaks/browser/lib.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const OLD = join(HERE, '..', '.work', 'dist-old'), NEW = join(HERE, '..', '.work', 'dist-new')
const OUT = join(HERE, 'shots', 'stop2')
const PORT = Number(process.env.PWA_PORT ?? 5195)
let root = OLD
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p.endsWith('/')) p += 'index.html'
  const f = join(root, p)
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream', 'Cache-Control': p.endsWith('sw.js') || p.endsWith('index.html') ? 'no-cache' : 'max-age=600' })
  res.end(readFileSync(f))
})
await new Promise((r) => server.listen(PORT, r))
const URL0 = `http://localhost:${PORT}/`
const today = new Date().toISOString().slice(0, 10)
const T0 = Date.now()
const pet = (id, sp, v) => ({ id, species: sp, variant: v, name: id, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 90, personality: 'lively', lastInteract: T0 })
const SAVE = { schemaVersion: 5, dataRev: 6, points: 80, lastSeen: T0, lastDailyClaim: today, gifts: { date: today, count: 9 }, nextPetId: 3, createdAt: T0 - 9e8, pets: [pet('p1', 'dog', 'shiba'), pet('p2', 'cat', 'tabby')], ownedBuildings: [], earning: { date: today, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 }, bowl: { date: today, used: 0 }, collection: {}, finds: [], events: {}, skins: { owned: ['house.gold', 'pond.forest'], equipped: { house: 'house.gold' } }, notes: [], picnic: { date: today, count: 0, lastEnd: 0 } }

const b = await launch()
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } })
await ctx.addInitScript(([s, k]) => {
  try {
    if (!localStorage.getItem('__injected')) {
      localStorage.setItem(k, s)
      localStorage.setItem('aemc-desktop:settings', JSON.stringify({ lastExportAt: Date.now(), remindOff: true, lastRemindDate: '' }))
      localStorage.setItem('__injected', '1')
    }
  } catch { /* 忽略 */ }
}, [JSON.stringify(SAVE), KEY])
const page = await ctx.newPage()
page.setDefaultTimeout(60000)
const failed = []
page.on('requestfailed', (r) => failed.push(r.url()))
const boot = async () => {
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click()
  await bt.waitFor({ state: 'detached' })
  await sleep(1500)
}
const resources = () => page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name.split('/').pop()))
const cached = () => page.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) out.push(r.url.split('/').pop()) } return out })

// 1. 舊版
await page.goto(URL0)
await boot()
await page.evaluate(() => navigator.serviceWorker.ready)
await sleep(1500)
const oldRes = await resources()
ok(oldRes.some((n) => /^skins\.[0-9a-f]{8}\.png$/.test(n)), '舊版：穿全黃金房屋時載入舊的 skins 圖集')
// 2. 切新版
root = NEW
await page.reload()
await sleep(2500)
await page.reload()
await boot()
await sleep(1500)
const res = await resources()
const newManifest = readFileSync(join(NEW, 'assets', '..', 'assets', (await import('node:fs')).readdirSync(join(NEW, 'assets')).find((f) => /^manifest\./.test(f))))
void newManifest
const newFiles = (await import('node:fs')).readdirSync(join(NEW, 'assets'))
const houseFile = newFiles.find((f) => /^skins_house\./.test(f)), pondFile = newFiles.find((f) => /^skins_pond\./.test(f))
const mf = newFiles.find((f) => /^manifest\./.test(f))
ok(res.includes(mf), `升級後載入新的 manifest（${mf}）`)
ok(res.includes(houseFile), `升級後穿亞特蘭提斯房屋載入 ${houseFile}`)
const c1 = await cached()
ok(c1.includes(houseFile) && c1.includes(pondFile), '新版的外殼圖集在快取裡（預先快取）')
ok(!c1.some((n) => /^skins\.[0-9a-f]{8}\.png$/.test(n)), '快取裡沒有舊的 skins 圖集')
const sv = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)
ok(sv && sv.pets.length === 2 && sv.skins.equipped.house === 'house.gold', '升級後存檔還在、外觀不變')
await page.screenshot({ path: join(OUT, 'pwa-upgraded.png') })
// 3. 離線：穿池塘外裝
await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.skins.equipped.pond = 'pond.forest'; localStorage.setItem(k, JSON.stringify(s)) }, KEY)
await ctx.setOffline(true)
failed.length = 0
await page.reload()
await boot()
await sleep(1500)
const offRes = await resources()
ok(offRes.includes(pondFile), `離線：穿池塘外裝載入 ${pondFile}（由快取）`)
ok(failed.filter((u) => /assets\//.test(u)).length === 0, '離線：素材請求沒有失敗 ' + failed.join(' '))
await page.screenshot({ path: join(OUT, 'pwa-offline-pond.png') })
await ctx.setOffline(false)
await b.close()
server.close()
console.log(fails() ? `失敗 ${fails()} 項` : 'PWA 升級與離線測試全部通過')
process.exit(fails() ? 1 : 0)
