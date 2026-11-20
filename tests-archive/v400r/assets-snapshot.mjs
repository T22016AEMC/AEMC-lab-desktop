// 階段 R：把某個 repo（預設 = 本專案）public/assets 的素材輸出存成「基準」：
//   <out>/assets.json：每個圖集的檔名與寬高、每幀的 atlas／寬高／錨點／meta
//   <out>/sheet-*.png：指定物件的貼圖集（最近鄰放大，每格標名稱與尺寸）
// 用法：node tests-archive/v400r/assets-snapshot.mjs <輸出資料夾> [repo 根目錄]
import sharp from 'sharp'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(process.argv[2])
const ROOT = resolve(process.argv[3] ?? join(HERE, '..', '..'))
const A = join(ROOT, 'public', 'assets')
mkdirSync(OUT, { recursive: true })

const mfName = readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))
const mf = JSON.parse(readFileSync(join(A, mfName), 'utf8'))
const snap = { manifest: mfName, atlases: mf.atlases, frames: {} }
for (const [k, f] of Object.entries(mf.frames)) snap.frames[k] = { atlas: f.atlas, w: f.w, h: f.h, ax: f.ax, ay: f.ay, ...(f.meta ? { meta: f.meta } : {}), ...(f.unused ? { unused: true } : {}) }
writeFileSync(join(OUT, 'assets.json'), JSON.stringify(snap, null, 1))

const atlasPx = {}
async function px(group) {
  if (!atlasPx[group]) {
    const { data, info } = await sharp(join(A, mf.atlases[group].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    atlasPx[group] = { data, w: info.width }
  }
  return atlasPx[group]
}
async function crop(key) {
  const f = mf.frames[key]
  if (!f) return null
  const a = await px(f.atlas)
  const out = Buffer.alloc(f.w * f.h * 4)
  for (let y = 0; y < f.h; y++) a.data.copy(out, y * f.w * 4, ((f.y + y) * a.w + f.x) * 4, ((f.y + y) * a.w + f.x + f.w) * 4)
  return { w: f.w, h: f.h, rgba: out, f }
}

/** 一張貼圖集：keys 依序排，每格 = 素材 × scale（錨點畫一個紅點），上方標名稱、尺寸、錨點 */
async function sheet(file, keys, { scale = 4, cols = 4, bg = { r: 96, g: 140, b: 84 } } = {}) {
  const items = []
  for (const k of keys) { const c = await crop(k); items.push({ k, c }) }
  const cellW = Math.max(160, ...items.map((i) => (i.c ? i.c.w * scale : 0))) + 16
  const cellH = Math.max(40, ...items.map((i) => (i.c ? i.c.h * scale : 0))) + 34
  const rows = Math.ceil(items.length / cols)
  const W = cellW * Math.min(cols, items.length), H = cellH * rows
  const comps = []
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
  for (let i = 0; i < items.length; i++) {
    const { k, c } = items[i]
    const x = (i % cols) * cellW + 8, y = Math.floor(i / cols) * cellH + 26
    svg += `<text x="${x}" y="${y - 10}" font-family="sans-serif" font-size="13" fill="#111">${k}${c ? ` ${c.w}x${c.h} a(${c.f.ax},${c.f.ay})` : ' (無)'}</text>`
    if (!c) continue
    const buf = await sharp(c.rgba, { raw: { width: c.w, height: c.h, channels: 4 } }).resize(c.w * scale, c.h * scale, { kernel: 'nearest' }).png().toBuffer()
    comps.push({ input: buf, left: x, top: y })
    svg += `<rect x="${x + c.f.ax * scale - 2}" y="${y + c.f.ay * scale - 2}" width="4" height="4" fill="#ff2020"/>`
    svg += `<rect x="${x - 0.5}" y="${y - 0.5}" width="${c.w * scale + 1}" height="${c.h * scale + 1}" fill="none" stroke="#00000055"/>`
  }
  svg += '</svg>'
  comps.push({ input: Buffer.from(svg), left: 0, top: 0 })
  await sharp({ create: { width: W, height: H, channels: 3, background: bg } }).composite(comps).png().toFile(join(OUT, file))
}

const DOGS = ['shiba', 'corgi', 'husky', 'golden', 'collie', 'poodle']
const CATS = ['orange', 'black', 'calico', 'siamese', 'bluecat', 'ragdoll']
await sheet('sheet-buildings.png', ['tree', 'lamp', 'doghouse', 'cat_tree', 'bowls', 'pond', 'board', 'planter', 'coral', 'bathtub', 'picnic'], { cols: 4 })
await sheet('sheet-tower-house.png', ['clocktower', 'clocktower_open', 'tower_atlantis', 'tower_atlantis_open', 'house_closed', 'house_open', 'house_night', 'house_atlantis_closed'], { cols: 4, scale: 3 })
await sheet('sheet-decor.png', ['bush', 'rocks', 'flowers', 'tall_grass', 'mushroom', 'stump'], { cols: 6 })
await sheet('sheet-terrain.png', ['grass_tile', 'far', 'path'], { cols: 1, scale: 2 })
await sheet('sheet-sky-toys.png', ['sun', 'moon', 'star', 'cloud_a', 'cloud_b', 'cloud_c', 'raindrop', 'snowflake', 'toy_ball', 'toy_frisbee', 'toy_rope', 'toy_bone', 'toy_shoe', 'toy_chest_closed', 'toy_chest_open', 'toy_dirt_mound', 'toy_ball_s', 'toy_dirt_mound_s', 'toy_laser_dot', 'toy_wand', 'toy_yarn'], { cols: 7, bg: { r: 120, g: 170, b: 220 } })
await sheet('sheet-dogs.png', DOGS.flatMap((d) => ['stand', 'sleep', 'eat'].map((a) => `dog_${d}_${a}`)), { cols: 6 })
await sheet('sheet-cats.png', CATS.flatMap((c) => ['stand', 'sleep', 'eat'].map((a) => `cat_${c}_${a}`)), { cols: 6 })
await sheet('sheet-front.png', [...DOGS.map((d) => 'front_dog_' + d), ...CATS.map((c) => 'front_cat_' + c)], { cols: 6, scale: 3 })
await sheet('sheet-picnic-polaroid.png', ['picnic_mat_red', 'picnic_mat_blue', 'picnic_mat_pink', 'picnic_basket_closed', 'picnic_basket_open', 'picnic_snack_dog', 'picnic_snack_cat', 'polaroid_hearts', 'polaroid_flowers', 'polaroid_stars'], { cols: 5 })
// 花槽、珊瑚的去背邊緣：×8，深色底與草地底各一次
await sheet('sheet-planter-coral-dark.png', ['planter', 'coral'], { cols: 2, scale: 8, bg: { r: 30, g: 32, b: 40 } })
await sheet('sheet-planter-coral-grass.png', ['planter', 'coral'], { cols: 2, scale: 8, bg: { r: 96, g: 140, b: 84 } })
console.log(`${mfName}：${Object.keys(mf.frames).length} 幀、${Object.keys(mf.atlases).length} 張圖集 → ${OUT}`)
