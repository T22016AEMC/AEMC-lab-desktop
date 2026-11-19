// D3 貓揮爪弧線（Node）：像素表、時間、6 色爪尖、水平鏡像
import './env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BALANCE } from '../../../src/farm/config/balance.ts'
import * as SA from '../../../src/farm/pixel/swatArc.ts'
let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const ROOT = process.env.REPO_ROOT
const manDir = join(ROOT, 'public/assets')
const man = JSON.parse(readFileSync(join(manDir, readdirSync(manDir).find((f) => f.startsWith('manifest'))), 'utf8'))
const report = []

// ---------- D3 揮爪弧線 ----------
const px = SA.SWAT_ARC_PIXELS
ok(px.length > 10, `弧線 ${px.length} 點`)
ok(px.every((p) => Number.isInteger(p.dx) && Number.isInteger(p.dy)), '全部整數像素')
eq(new Set(px.map((p) => p.dx + ',' + p.dy)).size, px.length, '沒有重複的點')
ok(px.every((p) => p.dx >= 0), '弧線全部在爪子前方（面向右時 dx ≥ 0）')
ok(px.filter((p) => p.layer === 'outer').every((p) => Math.abs(Math.hypot(p.dx, p.dy) - 7) <= 0.75) && px.filter((p) => p.layer === 'inner').every((p) => Math.abs(Math.hypot(p.dx, p.dy) - 6) <= 0.75), '兩層：半徑 7 與 6')
eq(SA.swatArcPixels(0.05), [], '0.05 秒：還沒出現')
eq(SA.swatArcPixels(0.1).length, px.length, '0.1 秒：完整')
eq(SA.swatArcPixels(0.29).length, px.length, '0.29 秒：完整')
const half = SA.swatArcPixels(0.35)
ok(half.length > 0 && half.length < px.length && half.every((p) => ((p.dx + p.dy) & 1) === 0), `0.3～0.4 秒：減半（${half.length}/${px.length}）`)
eq(SA.swatArcPixels(0.4), [], '0.4 秒：消失')
eq(SA.swatArcPixels(0.6), [], '0.6 秒（揮爪結束）：沒有')
eq(BALANCE.hover.swatSeconds, 0.6, '揮爪 0.6 秒')
// 6 色：鏡像對稱、弧線在畫面內（腳底在畫面中間時）、不碰到爪子以外很遠
for (const c of ['black', 'bluecat', 'calico', 'orange', 'ragdoll', 'siamese']) {
  const f = man.frames[`cat_${c}_swat`]
  const R = SA.swatArcScreen(100, 200, 1, f.w, f.h, f.ax, 0.2)
  const L = SA.swatArcScreen(100, 200, -1, f.w, f.h, f.ax, 0.2)
  eq(R.length, px.length, `${c}：點數`)
  ok(R.every((q, i) => L[i].x === 2 * 100 - q.x - 1 && L[i].y === q.y), `${c}：往左 = 水平鏡像（與 drawSprite 翻轉同規則）`)
  const tip = SA.pawTip(f.w, f.h, f.ax)
  ok(tip.x >= f.w - f.ax - 4 && tip.x <= f.w - f.ax && -tip.y >= f.h * 0.6 && -tip.y <= f.h * 0.8, `${c}：爪尖在素材右上（${tip.x},${tip.y}）`)
  const xs = R.map((q) => q.x - 100)
  const ys = R.map((q) => q.y - 200)
  report.push(`${c} swat ${f.w}×${f.h}：弧線 x ${Math.min(...xs)}～${Math.max(...xs)}、y ${Math.min(...ys)}～${Math.max(...ys)}（相對腳底）`)
}
ok(/^#[0-9a-f]{6}$/.test(SA.SWAT_ARC_COLORS.outer) && /^#[0-9a-f]{6}$/.test(SA.SWAT_ARC_COLORS.inner), '配色')


for (const l of report) console.log('  ' + l)
console.log(`通過 D3 揮爪弧線：${n} 項`)
