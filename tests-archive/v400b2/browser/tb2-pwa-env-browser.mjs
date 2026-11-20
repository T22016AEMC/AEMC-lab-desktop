// 4.0-B2：環境主題與主題裝飾圖集的離線與 PWA 升級（B1 完成時 9049eca → 目前）。正式 build（沒有 __farm），只用介面與瀏覽器 API。
// 準備（tests-archive/v400b2/run-pwa.mjs 會做）：.work/dist-old = 9049eca 的 build、.work/dist-new = 目前的 build。
// 一個可切換內容的靜態伺服器（Cache-Control: max-age=600）：先給舊版、再切新版。
//  1. 舊版（沒有環境主題）：service worker 接手
//  2. 切新版、重新整理兩次：載入新 manifest、存檔還在；新版的 env_<主題>、decor_themes、env_thumbs 圖集都在快取裡（預先快取）
//  3. 穿森林環境＋有主題裝飾：載入 env_forest、decor_themes（新檔名）、沒穿的環境不載入
//  4. 離線：換成魔法環境、重新整理 → 開機、env_magic 由快取載入、沒有失敗的請求
import http from 'node:http'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, ok, fails, sleep, KEY } from '../../calendar-tweaks/browser/lib.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const OLD = join(HERE, '..', '.work', 'dist-old'), NEW = join(HERE, '..', '.work', 'dist-new')
const OUT = join(HERE, 'shots')
const PORT = Number(process.env.PWA_PORT ?? 5196)
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
const T0 = Date.now()
const today = ((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date(T0))
const pet = (id, sp, v) => ({ id, species: sp, variant: v, name: id, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 90, personality: 'lively', lastInteract: T0 })
const SAVE = { schemaVersion: 5, dataRev: 6, points: 80, lastSeen: T0, lastDailyClaim: today, gifts: { date: today, count: 9 }, nextPetId: 3, createdAt: T0 - 9e8, pets: [pet('p1', 'dog', 'shiba'), pet('p2', 'cat', 'tabby')], ownedBuildings: ['kennel', 'bowls', 'catTree'], earning: { date: today, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 }, bowl: { date: today, used: 1 }, collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: today, count: 0, lastEnd: 0 } }

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
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const boot = async () => {
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click()
  await bt.waitFor({ state: 'detached' })
  await sleep(1800)
}
const resources = () => page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name.split('/').pop()))
const cached = () => page.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) out.push(r.url.split('/').pop()) } return out })
const setSave = (src) => page.evaluate(([k, src]) => { const s = JSON.parse(localStorage.getItem(k)); new Function('s', src)(s); localStorage.setItem(k, JSON.stringify(s)) }, [KEY, src])

// 1. 舊版
await page.goto(URL0)
await boot()
await page.evaluate(() => navigator.serviceWorker.ready)
await sleep(1500)
const oldRes = await resources()
ok(!oldRes.some((n) => /^(env_|decor_themes)/.test(n)), '舊版：沒有環境主題圖集')
// 2. 切新版
root = NEW
await page.reload()
await sleep(2500)
await page.reload()
await boot()
await sleep(1500)
const files = readdirSync(join(NEW, 'assets'))
const pick = (re) => files.find((f) => re.test(f))
const forestFile = pick(/^env_forest\./), magicFile = pick(/^env_magic\./), decorFile = pick(/^decor_themes\./), thumbFile = pick(/^env_thumbs\./), mf = pick(/^manifest\./)
ok(forestFile && magicFile && decorFile && thumbFile, '新版 build 有 env_forest、env_magic、decor_themes、env_thumbs')
const res = await resources()
ok(res.includes(mf), `升級後載入新的 manifest（${mf}）`)
const c1 = await cached()
ok([forestFile, magicFile, decorFile, thumbFile].every((f) => c1.includes(f)), '新版的環境主題、主題裝飾、縮圖圖集都在快取裡（預先快取）')
const sv = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)
ok(sv && sv.pets.length === 2 && sv.points === 80, '升級後存檔還在')
// 3. 穿森林環境、有主題裝飾（改存檔後重新整理）
await setSave(`s.skins = { owned: ['env.forest', 'env.magic'], equipped: { env: 'env.forest' } }; s.shop = { decor: [{ id: 'tree_house#1', kind: 'tree_house' }, { id: 'crystal_ball#2', kind: 'crystal_ball' }], nextDecorId: 3 }; s.farmLayout = { items: [{ id: 'tree_house#1', kind: 'tree_house', state: 'placed', x: 330, y: 240 }, { id: 'crystal_ball#2', kind: 'crystal_ball', state: 'placed', x: 400, y: 200 }] }`)
await page.reload()
await boot()
await sleep(1500)
const res3 = await resources()
ok(res3.includes(forestFile), `穿森林環境載入 ${forestFile}`)
ok(res3.includes(decorFile), `有主題裝飾載入 ${decorFile}`)
ok(!res3.includes(magicFile), '沒穿的魔法環境不載入')
await page.screenshot({ path: join(OUT, 'pwa-upgraded-forest.png') })
// 4. 離線：換成魔法環境
await setSave(`s.skins.equipped.env = 'env.magic'`)
await ctx.setOffline(true)
failed.length = 0
await page.reload()
await boot()
await sleep(1500)
const offRes = await resources()
ok(offRes.includes(magicFile), `離線：穿魔法環境載入 ${magicFile}（由快取）`)
ok(offRes.includes(decorFile), `離線：主題裝飾載入 ${decorFile}（由快取）`)
ok(failed.filter((u) => /assets\//.test(u)).length === 0, '離線：素材請求沒有失敗 ' + failed.join(' '))
ok(errors.length === 0, '沒有頁面錯誤 ' + errors.join(' | '))
await page.screenshot({ path: join(OUT, 'pwa-offline-magic.png') })
await ctx.setOffline(false)
await b.close()
server.close()
console.log(fails() ? `失敗 ${fails()} 項` : 'PWA 升級與離線測試全部通過')
process.exit(fails() ? 1 : 0)
