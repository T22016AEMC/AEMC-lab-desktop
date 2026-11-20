// 階段 R：前後並排總覽（左 = 換圖前、右 = 換圖後），輸出到 browser/shots/compare/
//  - pair-<檔名>.png：shots/before 與 shots/after 同名截圖左右並排
//  - obj-<組>.png：每個物件一列（名稱與前後尺寸、換圖前 × 放大、換圖後 × 放大），直接從兩個版本的圖集切
// 用法：node tests-archive/v400r/compare-shots.mjs <換圖前的 repo 根目錄（含 public/assets）> [換圖後的 repo 根目錄，預設本專案]
import sharp from 'sharp'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'browser', 'shots')
const OUT = join(SHOTS, 'compare')
mkdirSync(OUT, { recursive: true })
const OLD = resolve(process.argv[2])
const NEW = resolve(process.argv[3] ?? join(HERE, '..', '..'))

const label = (text, w, h = 26, bg = '#222', fg = '#fff') =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/><text x="8" y="${h - 8}" font-family="sans-serif" font-size="15" fill="${fg}">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`)

// ---- 截圖並排 ----
const files = readdirSync(join(SHOTS, 'before')).filter((f) => f.endsWith('.png') && existsSync(join(SHOTS, 'after', f)))
for (const f of files) {
  const a = await sharp(join(SHOTS, 'before', f)).metadata(), b = await sharp(join(SHOTS, 'after', f)).metadata()
  const gap = 16, W = a.width + b.width + gap, H = Math.max(a.height, b.height) + 26
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 0, b: 255 } } })
    .composite([
      { input: label(`換圖前 ${f}`, a.width), left: 0, top: 0 },
      { input: label(`換圖後 ${f}`, b.width, 26, '#0a4'), left: a.width + gap, top: 0 },
      { input: join(SHOTS, 'before', f), left: 0, top: 26 },
      { input: join(SHOTS, 'after', f), left: a.width + gap, top: 26 },
    ])
    .png().toFile(join(OUT, 'pair-' + f))
}

// ---- 物件逐列 ----
async function set(root) {
  const A = join(root, 'public', 'assets')
  const m = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
  const atl = {}
  return {
    m,
    async crop(k) {
      const f = m.frames[k]
      if (!f) return null
      if (!atl[f.atlas]) atl[f.atlas] = await sharp(join(A, m.atlases[f.atlas].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const { data, info } = atl[f.atlas]
      const out = Buffer.alloc(f.w * f.h * 4)
      for (let y = 0; y < f.h; y++) data.copy(out, y * f.w * 4, ((f.y + y) * info.width + f.x) * 4, ((f.y + y) * info.width + f.x + f.w) * 4)
      return { ...f, rgba: out }
    },
  }
}
const so = await set(OLD), sn = await set(NEW)
async function rows(file, keys, scale, bg = { r: 96, g: 140, b: 84 }) {
  const items = []
  for (const k of keys) items.push({ k, a: await so.crop(k), b: await sn.crop(k) })
  const cw = Math.max(...items.flatMap((i) => [i.a?.w ?? 0, i.b?.w ?? 0])) * scale + 16
  const rh = Math.max(...items.flatMap((i) => [i.a?.h ?? 0, i.b?.h ?? 0])) * scale + 16
  const lw = 300
  const W = lw + cw * 2, H = items.length * (rh + 2)
  const comps = []
  for (let i = 0; i < items.length; i++) {
    const { k, a, b } = items[i]
    const y = i * (rh + 2)
    const same = a && b && a.w === b.w && a.h === b.h && a.ax === b.ax && a.ay === b.ay
    const t = `${k}  ${a ? a.w + '×' + a.h : '無'} → ${b ? b.w + '×' + b.h : '無'}${same ? '' : '（不同）'}`
    comps.push({ input: label(t, lw, rh, same ? '#333' : '#a40'), left: 0, top: y })
    for (const [s, x] of [[a, lw], [b, lw + cw]]) {
      if (!s) continue
      const buf = await sharp(s.rgba, { raw: { width: s.w, height: s.h, channels: 4 } }).resize(s.w * scale, s.h * scale, { kernel: 'nearest' }).png().toBuffer()
      // 底部對齊（錨點 ay 是素材底邊），水平以錨點 ax 對齊到格子中央
      comps.push({ input: buf, left: Math.round(x + cw / 2 - s.ax * scale), top: y + rh - 8 - s.h * scale })
    }
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: bg } }).composite(comps).png().toFile(join(OUT, file))
}
const DOGS = ['shiba', 'corgi', 'husky', 'golden', 'collie', 'poodle']
const CATS = ['orange', 'black', 'calico', 'siamese', 'bluecat', 'ragdoll']
await rows('obj-1-buildings.png', ['tree', 'lamp', 'doghouse', 'cat_tree', 'bowls', 'pond', 'board', 'planter', 'coral'], 4)
await rows('obj-2-tower-house.png', ['clocktower', 'clocktower_open', 'clocktower_gold', 'clocktower_open_gold', 'house_closed', 'house_open', 'house_night'], 3)
await rows('obj-3-decor.png', ['bush', 'rocks', 'flowers', 'tall_grass', 'mushroom', 'stump', 'bathtub', 'picnic'], 4)
await rows('obj-4-terrain.png', ['grass_tile', 'far', 'path'], 2)
await rows('obj-5-dogs.png', DOGS.flatMap((d) => ['stand', 'sleep', 'eat'].map((x) => `dog_${d}_${x}`)), 4)
await rows('obj-6-cats.png', CATS.flatMap((c) => ['stand', 'sleep', 'eat'].map((x) => `cat_${c}_${x}`)), 4)
await rows('obj-7-front.png', [...DOGS.map((d) => 'front_dog_' + d), ...CATS.map((c) => 'front_cat_' + c)], 3)
await rows('obj-8-picnic-polaroid.png', ['picnic_mat_red', 'picnic_mat_blue', 'picnic_mat_pink', 'polaroid_hearts', 'polaroid_flowers', 'polaroid_stars'], 3)
await rows('obj-9-sky-toys.png', ['sun', 'moon', 'star', 'cloud_a', 'cloud_b', 'cloud_c', 'raindrop', 'snowflake', 'toy_ball_s', 'toy_dirt_mound_s', 'cat_orange_swat', 'cat_black_swat'], 6, { r: 120, g: 170, b: 220 })
await rows('obj-10-planter-coral-x8-dark.png', ['planter', 'coral'], 8, { r: 30, g: 32, b: 40 })
console.log(`並排 ${files.length} 張、物件 10 張 → ${OUT}`)
