// D2-1 相框日期（Node）：日期文字、3×5 點陣、白邊寬度
import './env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BALANCE } from '../../../src/farm/config/balance.ts'
import * as PH from '../../../src/farm/ui/photo.ts'
let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const ROOT = process.env.REPO_ROOT
const manDir = join(ROOT, 'public/assets')
const man = JSON.parse(readFileSync(join(manDir, readdirSync(manDir).find((f) => f.startsWith('manifest'))), 'utf8'))
const report = []

// ---------- D2-1 相框日期 ----------
eq(PH.photoDateText(new Date(2026, 10, 19, 23, 59)), '2026/11/19', '日期文字格式')
eq(PH.photoDateText(new Date(2027, 0, 5)), '2027/01/05', '補零')
eq(PH.dateTextWidth('2026/11/19'), 39, '寬 39 點')
const dots = PH.dateDots('2026/11/19')
ok(dots.every((d) => d.x >= 0 && d.x < 39 && d.y >= 0 && d.y < 5), '點陣在 39×5 內')
for (const ch of '0123456789/') ok(PH.DATE_FONT[ch].length === 5 && PH.DATE_FONT[ch].every((r) => /^[01]{3}$/.test(r)), `字型 ${ch} 是 3×5`)
eq(new Set(Object.values(PH.DATE_FONT).map((g) => g.join('|'))).size, 11, '11 個字形彼此不同')
eq(PH.DATE_STRIP, 8, '加高 8 個相框像素')
for (const key of ['polaroid_stars', 'polaroid_flowers', 'polaroid_hearts']) {
  const f = man.frames[key]
  ok(PH.dateTextWidth('2026/11/19') + 4 <= f.w - 8, `${key}：日期（39）放得進白邊（相框寬 ${f.w}）`)
}


for (const l of report) console.log('  ' + l)
console.log(`通過 D2-1 相框日期：${n} 項`)
