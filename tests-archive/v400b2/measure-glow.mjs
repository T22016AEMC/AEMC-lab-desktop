// 4.0-B2：夜晚補光的光源位置（路燈 6 款、水晶球座、資訊終端螢幕）：從圖集成品的顏色量出「發光部位」的重心，
// 輸出相對錨點的 { dx, dy }（dx = 光源 x − 錨點 x，dy = 錨點腳底 y − 光源 y，往上為正）。src/farm/config/envThemes.ts 的 GLOW 表要和這個結果一致（測試比對）。
import sharp from 'sharp'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export async function loadFrames(root = ROOT) {
  const A = join(root, 'public', 'assets')
  const m = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
  const atl = {}
  for (const [g, a] of Object.entries(m.atlases)) {
    const { data, info } = await sharp(join(A, a.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    atl[g] = { data, w: info.width }
  }
  const crop = (k) => {
    const f = m.frames[k]
    if (!f) return null
    const a = atl[f.atlas]
    const rgba = Buffer.alloc(f.w * f.h * 4)
    for (let y = 0; y < f.h; y++) a.data.copy(rgba, y * f.w * 4, ((f.y + y) * a.w + f.x) * 4, ((f.y + y) * a.w + f.x + f.w) * 4)
    return { ...f, rgba }
  }
  return { m, crop }
}
/** 每個光源：素材鍵、「發光部位」的像素判斷、搜尋範圍（相對素材的比例） */
export const GLOW_PROBES = {
  lamp_atlantis: { test: (r, g, b) => b > 200 && r < 120 && b > g + 40, region: { y1: 0.3 } },
  lamp_cleanroom: { test: (r, g, b) => r > 190 && g > 215 && b > 235, region: { y1: 0.3 } },
  lamp_forest: { test: (r, g, b) => r > 200 && g > 130 && b < 110, region: { x0: 0.45 } },
  lamp_magic: { test: (r, g, b) => g > 140 && b > 200 && r < 170, region: { y1: 0.3 } },
  lamp_punk: { test: (r, g, b) => r > 200 && g < 90 && b < 90, region: { y1: 0.4 } },
  lamp_plaid: { test: (r, g, b) => r > 200 && g < 90 && b < 90, region: { x0: 0.45 } },
  crystal_ball: { test: (r, g, b) => b > 150 && r > 100 && g < b - 40, region: { y1: 0.65 } },
  info_terminal: { test: (r, g, b) => g > 170 && b > 190 && r < 140, region: { y1: 0.6 } },
}
export function measureGlow(s, probe) {
  const R = probe.region
  const x0 = Math.floor((R.x0 ?? 0) * s.w), x1 = Math.ceil((R.x1 ?? 1) * s.w), y0 = Math.floor((R.y0 ?? 0) * s.h), y1 = Math.ceil((R.y1 ?? 1) * s.h)
  let n = 0, sx = 0, sy = 0
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * s.w + x) * 4
      if (s.rgba[i + 3] && probe.test(s.rgba[i], s.rgba[i + 1], s.rgba[i + 2])) { n++; sx += x + 0.5; sy += y + 0.5 }
    }
  if (!n) return null
  return { n, dx: Math.round(sx / n - s.ax) || 0, dy: Math.round(s.ay - sy / n) || 0 }
}
export async function measureAll(root = ROOT) {
  const { crop } = await loadFrames(root)
  const out = {}
  for (const [k, p] of Object.entries(GLOW_PROBES)) {
    const s = crop(k)
    out[k] = s ? measureGlow(s, p) : null
  }
  return out
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await measureAll(), null, 1))
