// 4.0-R 去邊放大圖：每個物件一列、三欄（換圖前 fa6e940｜換圖後未去邊｜去邊後），× 放大，深色底與草地底各一張。
// 用法：node tests-archive/v400r/defringe-shots.mjs <換圖前 repo 根目錄> <未去邊 repo 根目錄> [去邊後 repo 根目錄，預設本專案]
// 輸出：tests-archive/v400r/browser/shots/defringe/
import sharp from 'sharp'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'browser', 'shots', 'defringe')
mkdirSync(OUT, { recursive: true })
const ROOTS = [resolve(process.argv[2]), resolve(process.argv[3]), resolve(process.argv[4] ?? join(HERE, '..', '..'))]
const TITLES = ['換圖前', '換圖後未去邊', '去邊後']

async function set(root) {
  const A = join(root, 'public', 'assets')
  const m = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
  const atl = {}
  return async (k) => {
    const f = m.frames[k]
    if (!f) return null
    if (!atl[f.atlas]) atl[f.atlas] = await sharp(join(A, m.atlases[f.atlas].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const { data, info } = atl[f.atlas]
    const rgba = Buffer.alloc(f.w * f.h * 4)
    for (let y = 0; y < f.h; y++) data.copy(rgba, y * f.w * 4, ((f.y + y) * info.width + f.x) * 4, ((f.y + y) * info.width + f.x + f.w) * 4)
    return { ...f, rgba }
  }
}
const sets = await Promise.all(ROOTS.map(set))
const label = (t, w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="6" y="18" font-family="sans-serif" font-size="16" fill="#fff" stroke="#000" stroke-width="0.6">${t}</text></svg>`)
async function sheet(file, keys, scale, bg) {
  const items = []
  for (const k of keys) items.push({ k, s: await Promise.all(sets.map((g) => g(k))) })
  const cw = Math.max(...items.flatMap((i) => i.s.map((s) => (s ? s.w : 0)))) * scale + 20
  const rhs = items.map((i) => Math.max(...i.s.map((s) => (s ? s.h : 0))) * scale + 30)
  const W = cw * 3, H = rhs.reduce((a, b) => a + b, 0)
  const comps = []
  let y = 0
  for (let r = 0; r < items.length; r++) {
    const { k, s } = items[r]
    for (let c = 0; c < 3; c++) {
      comps.push({ input: label(`${k}｜${TITLES[c]}`, cw, 24), left: c * cw, top: y })
      if (!s[c]) continue
      const buf = await sharp(s[c].rgba, { raw: { width: s[c].w, height: s[c].h, channels: 4 } }).resize(s[c].w * scale, s[c].h * scale, { kernel: 'nearest' }).png().toBuffer()
      comps.push({ input: buf, left: c * cw + 10, top: y + 26 })
    }
    y += rhs[r]
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: bg } }).composite(comps).png().toFile(join(OUT, file))
}
const GROUPS = {
  clouds: [['cloud_a', 'cloud_b', 'cloud_c'], 10],
  tree: [['tree'], 6],
  doghouse: [['doghouse'], 6],
  lamp: [['lamp'], 7],
  cat_tree: [['cat_tree'], 6],
  planter: [['planter'], 8],
  coral: [['coral'], 8],
}
for (const [name, [keys, sc]] of Object.entries(GROUPS)) {
  await sheet(`${name}-dark.png`, keys, sc, { r: 30, g: 32, b: 40 })
  await sheet(`${name}-light.png`, keys, sc, name === 'clouds' ? { r: 120, g: 170, b: 220 } : { r: 96, g: 140, b: 84 })
}
console.log('去邊放大圖 → ' + OUT)
