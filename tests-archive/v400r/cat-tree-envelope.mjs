// 階段 R／4.0-B1：由圖集算出 layout.ts 的 CAT_TREE_ENVELOPE（貓跳台＋6 種貓睡在頂層平台的睡姿圖〔面向左〕的逐列不透明聯集，
// 相對貓跳台水平中心〔錨點 ax〕；第 0 列 = 素材頂端往上 ROW0 列）。翻轉的算法和 assets.ts 的 drawSprite 相同。
// 4.0-B1：再聯集 6 款貓跳台外殼（各自的頂層座位 = 預設座位 + meta.seats.dyTop）：貓跳台穿任何外殼，擺放判斷都安全。
// 用法：node tests-archive/v400r/cat-tree-envelope.mjs [repo 根目錄]   → 印出 CAT_TREE_ENVELOPE 的程式碼
// 測試用：import { catTreeEnvelope } from './cat-tree-envelope.mjs'
import sharp from 'sharp'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROW0 = -12
export const TOP_SEAT = { x: 46, y: 9 }
const CATS = ['orange', 'black', 'calico', 'siamese', 'bluecat', 'ragdoll']
const THEMES = ['atlantis', 'cleanroom', 'forest', 'magic', 'punk', 'plaid']

/** 回傳 [[lo, hi], …]（第 i 個 = 第 ROW0 + i 列；空列 [0, 0]） */
export async function catTreeEnvelope(root) {
  const A = join(resolve(root), 'public', 'assets')
  const m = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
  const cache = {}
  async function frame(k) {
    const f = m.frames[k]
    if (!f) return null
    if (!cache[f.atlas]) { const { data, info } = await sharp(join(A, m.atlases[f.atlas].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); cache[f.atlas] = { data, w: info.width } }
    const a = cache[f.atlas]
    return { ...f, on: (x, y) => a.data[((f.y + y) * a.w + f.x + x) * 4 + 3] > 0 }
  }
  const rows = new Map()
  const add = (rel, x0, x1) => { const r = rows.get(rel) ?? [Infinity, -Infinity]; rows.set(rel, [Math.min(r[0], x0), Math.max(r[1], x1)]) }
  const trees = [await frame('cat_tree'), ...(await Promise.all(THEMES.map((t) => frame('cat_tree_' + t)))).filter(Boolean)]
  const base = trees[0]
  const sleeps = await Promise.all(CATS.map((c) => frame(`cat_${c}_sleep`)))
  for (const tree of trees) {
    // 外殼和預設圖同高、腳底對齊，第 0 列相同
    for (let y = 0; y < tree.h; y++) for (let x = 0; x < tree.w; x++) if (tree.on(x, y)) add(y, x - tree.ax, x - tree.ax + 1)
    const seatY = TOP_SEAT.y + (tree.meta?.seats?.dyTop ?? 0)
    for (const s of sleeps) {
      const seatX = TOP_SEAT.x - tree.ax // 座位相對貓跳台水平中心
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.on(x, y)) {
        const col = seatX + s.ax - x - 1 // 面向左（水平翻轉）
        add(seatY - s.ay + y, col, col + 1)
      }
    }
  }
  const out = []
  for (let rel = ROW0; rel < base.h; rel++) { const r = rows.get(rel); out.push(r ? [r[0], r[1]] : [0, 0]) }
  return { rows: out, scene: m.atlases.scene.file, first: Math.min(...rows.keys()) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await catTreeEnvelope(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'))
  const lines = []
  for (let i = 0; i < r.rows.length; i += 6) lines.push('  ' + r.rows.slice(i, i + 6).map((v) => `[${v[0]}, ${v[1]}]`).join(', ') + ',')
  console.log(`// ${r.scene}：${r.rows.length} 列（第一個有內容的列 = ${r.first}）`)
  console.log(lines.join('\n'))
}
