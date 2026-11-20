// 階段 R：草地方塊、小路（不走 sheet，管線第 6 段自己取樣）的像素格 p 掃描，目標 = before.json 的單張尺寸（鏡像拼接前）。
// 取樣步驟和 process-assets.mjs 第 6 段相同。用法：ASSET_SRC=<原圖資料夾> node tests-archive/v400r/tune-terrain.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const pa = await import('../../scripts/process-assets.mjs')
const before = JSON.parse(readFileSync(join(HERE, 'before.json'), 'utf8')).frames

const img = await pa.load('scene_tiles.png')
const all1 = new Uint8Array(img.W * img.H).fill(1)
const box = [0, 0, 508, 490]
const grass = (p) => { const ph = [pa.estimatePhase(img, all1, box, p, 0), pa.estimatePhase(img, all1, box, p, 1)]; const t = pa.depixelate(img, all1, null, null, box, p, ph); return { w: t.w - 2, h: t.h - 2 } }

const pimg = await pa.load('scene_path.png')
const pm = new Uint8Array(pimg.W * pimg.H)
for (let i = 0; i < pimg.W * pimg.H; i++) { const r = pimg.data[i * 3], g = pimg.data[i * 3 + 1], b = pimg.data[i * 3 + 2]; pm[i] = r >= g - 6 && !(g > r + 10 && g > b + 30) ? 1 : 0 }
const { lab, comps } = pa.label(pm, pimg.W, pimg.H)
const biggest = comps.reduce((a, c) => (c.area > a.area ? c : a))
const keep = new Set(comps.filter((c) => c.area > 400).map((c) => c.id))
const pbox = [0, biggest.y0 - 4, pimg.W - 2, biggest.y1 + 4]
const pall = new Uint8Array(pimg.W * pimg.H).fill(1)
const path = (p) => { const ph = [pa.estimatePhase(pimg, pall, pbox, p, 0), pa.estimatePhase(pimg, pall, pbox, p, 1)]; const s = pa.cleanSprite(pa.depixelate(pimg, pm, lab, keep, pbox, p, ph)); return s ? { w: s.w, h: s.h } : { w: 0, h: 0 } }

for (const [name, fn, want] of [['grass', grass, { w: before.grass_tile.w / 2, h: before.grass_tile.h / 2 }], ['path', path, { w: before.path.w / 2, h: before.path.h }]]) {
  let run = null, cur = null
  const grid = []
  for (let p = 3; p <= 14; p *= 1.0015) grid.push(p)
  let bestErr = Infinity
  const errs = grid.map((p) => { const s = fn(p); const e = Math.abs(s.w - want.w) + Math.abs(s.h - want.h); if (e < bestErr) bestErr = e; return e })
  for (let i = 0; i < grid.length; i++) {
    if (errs[i] === bestErr) { cur = cur ? { ...cur, hi: i } : { lo: i, hi: i }; if (!run || cur.hi - cur.lo > run.hi - run.lo) run = { ...cur } } else cur = null
  }
  const p = grid[(run.lo + run.hi) >> 1]
  const s = fn(p)
  console.log(name, JSON.stringify({ p: +p.toFixed(3), range: [+grid[run.lo].toFixed(3), +grid[run.hi].toFixed(3)], got: `${s.w}×${s.h}`, want: `${want.w}×${want.h}`, err: bestErr }))
}
