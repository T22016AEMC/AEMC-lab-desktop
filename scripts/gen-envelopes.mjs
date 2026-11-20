// v3.9.0：從圖集量出可擺放物件素材的「逐列不透明輪廓」，產生 src/farm/pixel/envelopes.ts（不要手改）。
// 用法：node scripts/gen-envelopes.mjs（讀 public/assets 目前的 manifest 與圖集）。改了這些素材後要重跑；邏輯測試會用圖集重新量一次比對。
// 每個物件：w、h、ax、ay（錨點＝腳底中心）與 rows[i] = 第 i 列（由素材頂端算起）的不透明區段 [[lo, hi), …]，相對錨點 x；整列透明 = []。
// 同一個物件有好幾張圖（住家的關門／開門／夜晚／亞特蘭提斯、鐘樓的關門／開門／亞特蘭提斯）時取聯集（4.0-B1 階段 3 再加入全部主題外殼）。
import sharp from 'sharp'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const dir = join(root, 'public/assets')
const manifest = JSON.parse(readFileSync(join(dir, readdirSync(dir).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))

/** 物件 → 素材鍵（第一個是主要的，尺寸與錨點以它為準） */
const GROUPS = {
  house: ['house_closed', 'house_open', 'house_night', 'house_atlantis_closed', 'house_atlantis_open', 'house_atlantis_night'],
  clocktower: ['clocktower', 'clocktower_open', 'tower_atlantis', 'tower_atlantis_open'],
  pond: ['pond'],
  board: ['board'],
  lamp: ['lamp'],
  tree: ['tree'],
  bush: ['bush'],
  mushroom: ['mushroom'],
  rocks: ['rocks'],
  flowers: ['flowers'],
  stump: ['stump'],
  tall_grass: ['tall_grass'],
  doghouse: ['doghouse'],
  cat_tree: ['cat_tree'],
  bowls: ['bowls'],
  planter: ['planter'],
  coral: ['coral'],
}

const atlases = {}
async function atlas(name) {
  if (!atlases[name]) {
    const { data, info } = await sharp(join(dir, manifest.atlases[name].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    atlases[name] = { data, w: info.width }
  }
  return atlases[name]
}

// 4.0-B1：每個群組再加上所有主題外殼（擺放規則對任何外觀都安全）。外殼和預設圖寬度、錨點 ax 相同、腳底對齊（錨點 ay = 底邊），
// 高度可以不同（食盆外殼 31、預設 27）：聯集的高度取最高的，第 0 列 = 最高那張的頂端
const THEMES = ['atlantis', 'cleanroom', 'forest', 'magic', 'punk', 'plaid']
const SKIN_PREFIX = { house: null, clocktower: null, pond: 'pond_', board: 'board_', doghouse: 'doghouse_', cat_tree: 'cat_tree_', bowls: 'bowls_' }
for (const t of THEMES) {
  GROUPS.house.push(`house_${t}_closed`, `house_${t}_open`, `house_${t}_night`)
  GROUPS.clocktower.push(`tower_${t}`, `tower_${t}_open`)
  for (const [g, pre] of Object.entries(SKIN_PREFIX)) if (pre) GROUPS[g].push(pre + t)
}
for (const g of Object.keys(GROUPS)) GROUPS[g] = [...new Set(GROUPS[g])]

// 4.0-B2：主題裝飾（圖集 decor_themes；傳說展示台不是擺設種類，不產生輪廓）
for (const [k, f] of Object.entries(manifest.frames)) if (f.atlas === 'decor_themes' && k !== 'legend_stand') GROUPS[k] = [k]

const out = {}
for (const [id, keys] of Object.entries(GROUPS)) {
  const main = manifest.frames[keys[0]]
  if (!main) throw new Error('manifest 沒有 ' + keys[0])
  const frames = keys.map((k) => manifest.frames[k]).filter(Boolean)
  const H = Math.max(...frames.map((f) => f.ay))
  for (const f of frames) if (f.w !== main.w || f.ax !== main.ax || f.ay !== f.h) throw new Error(keys[frames.indexOf(f)] + ' 寬度或錨點和 ' + keys[0] + ' 不同')
  const mask = Array.from({ length: H }, () => new Uint8Array(main.w))
  for (const k of keys) {
    const f = manifest.frames[k]
    if (!f) continue
    const a = await atlas(f.atlas)
    const oy = H - f.ay
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        if (a.data[((f.y + y) * a.w + f.x + x) * 4 + 3] !== 0) mask[y + oy][x] = 1
      }
  }
  // 每列切成連續的不透明區段
  const rows = mask.map((m) => {
    const runs = []
    for (let x = 0; x < main.w; x++) {
      if (!m[x]) continue
      let e = x
      while (e < main.w && m[e]) e++
      runs.push([x - main.ax, e - main.ax])
      x = e
    }
    return runs
  })
  out[id] = { w: main.w, h: H, ax: main.ax, ay: H, rows }
}

let ts = `/**
 * 由 scripts/gen-envelopes.mjs 從圖集產生，請勿手改（manifest：${manifest.__file ?? readdirSync(dir).find((f) => /^manifest\./.test(f))}）。
 * 可擺放物件素材的逐列不透明區段：rows[i] = 第 i 列（素材頂端 = 0）的不透明區段 [[lo, hi), …]，相對錨點 x（腳底中心）；整列透明 = []。
 * 同一物件的多張圖（開門、夜晚、金色…）取聯集。用途：擺放時「互動區不能被前面的物件蓋住」、寵物「被前面物件蓋住多少」。
 */
export interface Envelope {
  w: number
  h: number
  ax: number
  ay: number
  rows: readonly (readonly (readonly [number, number])[])[]
}

export const ENVELOPES: Readonly<Record<string, Envelope>> = {
`
for (const [id, e] of Object.entries(out)) ts += `  ${id}: { w: ${e.w}, h: ${e.h}, ax: ${e.ax}, ay: ${e.ay}, rows: ${JSON.stringify(e.rows)} },\n`
ts += '}\n'
// ENVELOPES_OUT：輸出到別的路徑（測試用：和 repo 裡的 envelopes.ts 比對是否一致）
writeFileSync(process.env.ENVELOPES_OUT || join(root, 'src/farm/pixel/envelopes.ts'), ts)
console.log('寫入 src/farm/pixel/envelopes.ts：' + Object.entries(out).map(([k, e]) => `${k} ${e.w}×${e.h}`).join('、'))
