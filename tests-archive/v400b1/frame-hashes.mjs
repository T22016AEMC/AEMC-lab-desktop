// 4.0-B1：每張素材的指紋（尺寸、錨點、meta、RGBA 的 sha1），用來證明「預設外觀和階段 R 完成時逐像素相同」。
// 用法：node tests-archive/v400b1/frame-hashes.mjs <repo 根目錄（含 public/assets）> [輸出 json]
// 基準 r-frames.json：階段 R 完成時（bfc1390）的圖集：git show bfc1390:public/assets/... 取出到暫存資料夾後跑這支
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export async function frameHashes(root) {
  const A = join(resolve(root), 'public', 'assets')
  const m = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
  const atl = {}
  const out = {}
  for (const [k, f] of Object.entries(m.frames)) {
    if (!atl[f.atlas]) atl[f.atlas] = await sharp(join(A, m.atlases[f.atlas].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const { data, info } = atl[f.atlas]
    const h = createHash('sha1')
    for (let y = 0; y < f.h; y++) h.update(data.subarray(((f.y + y) * info.width + f.x) * 4, ((f.y + y) * info.width + f.x + f.w) * 4))
    out[k] = { w: f.w, h: f.h, ax: f.ax, ay: f.ay, meta: f.meta ?? null, sha1: h.digest('hex') }
  }
  return out
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('frame-hashes.mjs')) {
  const r = await frameHashes(process.argv[2])
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(r, null, 1) + '\n')
  console.log(`${Object.keys(r).length} 張素材的指紋`)
}
