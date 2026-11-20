// 4.0-R：每張素材「緊鄰透明處、色相偏洋紅」的邊緣像素數（判斷式和管線 process-assets.mjs 的 edgeMagentaCount 相同）。
// 用法：node tests-archive/v400r/edge-magenta.mjs <repo 根目錄（含 public/assets）> [輸出 json]
// 換圖前的基準：git show fa6e940:public/assets/... 取出到暫存資料夾後跑這支，結果存成 tests-archive/v400r/edge-before.json
import sharp from 'sharp'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const ROOT = resolve(process.argv[2])
const pa = await import(pathToFileURL(resolve(import.meta.dirname, '..', '..', 'scripts', 'process-assets.mjs')).href)
const A = join(ROOT, 'public', 'assets')
const m = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
const atl = {}
const out = {}
for (const [k, f] of Object.entries(m.frames)) {
  if (!atl[f.atlas]) { const { data, info } = await sharp(join(A, m.atlases[f.atlas].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); atl[f.atlas] = { data, w: info.width } }
  const a = atl[f.atlas]
  const rgba = Buffer.alloc(f.w * f.h * 4)
  for (let y = 0; y < f.h; y++) a.data.copy(rgba, y * f.w * 4, ((f.y + y) * a.w + f.x) * 4, ((f.y + y) * a.w + f.x + f.w) * 4)
  out[k] = pa.edgeMagentaCount({ w: f.w, h: f.h, rgba })
}
const total = Object.values(out).reduce((t, v) => t + v, 0)
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify({ manifest: readdirSync(A).find((f) => f.startsWith('manifest')), total, frames: out }, null, 1))
console.log(`${ROOT}：${Object.keys(out).length} 張，邊緣洋紅偏色合計 ${total}`)
