// D2-3 野餐點心（Node）：在墊面內、比座位低、不壓籃子與食物、依參加者
import './env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BALANCE } from '../../../src/farm/config/balance.ts'
import * as PC from '../../../src/farm/pixel/picnic.ts'
let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const ROOT = process.env.REPO_ROOT
const manDir = join(ROOT, 'public/assets')
const man = JSON.parse(readFileSync(join(manDir, readdirSync(manDir).find((f) => f.startsWith('manifest'))), 'utf8'))
const report = []

// ---------- D2-3 點心 ----------
const matRows = man.frames.picnic_mat_red.meta.mat.rows
// 墊面在某一列的範圍（用最近的取樣列做線性內插，保守取兩列的交集）
const rowSpan = (y) => {
  let lo = matRows[0], hi = matRows[matRows.length - 1]
  for (const r of matRows) { if (r[0] <= y) lo = r; if (r[0] >= y) { hi = r; break } }
  return [Math.max(lo[1], hi[1]), Math.min(lo[2], hi[2])]
}
const boxOf = (key, [x, y]) => { const f = man.frames[key]; return { x0: x - f.ax, y0: y - f.ay, x1: x - f.ax + f.w, y1: y - f.ay + f.h } }
const over = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
const snackBoxes = {}
for (const k of ['dog', 'cat']) {
  const key = PC.SNACK_KEYS[k]
  const f = man.frames[key]
  ok(!!f, `${key} 在圖集裡（${f.w}×${f.h}）`)
  const b = boxOf(key, PC.MAT_SNACKS[k])
  snackBoxes[k] = b
  for (let y = b.y0; y < b.y1; y++) {
    const [x0, x1] = rowSpan(y)
    n++
    assert.ok(b.x0 >= x0 && b.x1 <= x1, `${k} 點心第 ${y} 列在墊面內（${b.x0}～${b.x1} ⊂ ${x0}～${x1}）`)
  }
  ok(PC.MAT_SNACKS[k][1] > Math.max(...PC.MAT_SEATS.map((s) => s[1])), `${k} 點心腳底比所有座位低（永遠畫在坐著的寵物前面）`)
  const basket = boxOf('picnic_basket_open', PC.MAT_BASKET)
  ok(!over(b, basket), `${k} 點心不壓籃子`)
  PC.MAT_FOODS.forEach((sp, i) => PC.FOOD_KEYS.forEach((fk) => ok(!over(b, boxOf(fk, sp)), `${k} 點心不壓食物 ${i}／${fk}`)))
}
ok(!over(snackBoxes.dog, snackBoxes.cat), '兩個點心不重疊')
eq(PC.picnicSnacks(['a', 'b'], (id) => ({ a: 'dog', b: 'dog' })[id]), ['dog'], '只有狗：只放餅乾')
eq(PC.picnicSnacks(['a'], () => 'cat'), ['cat'], '只有貓：只放小魚乾')
eq(PC.picnicSnacks(['a', 'b'], (id) => ({ a: 'cat', b: 'dog' })[id]), ['dog', 'cat'], '貓狗都有：兩樣')
eq(PC.picnicSnacks(['x'], () => undefined), [], '查不到寵物：不放')
eq(PC.picnicSnacks([], () => 'dog'), [], '沒人參加：不放')


for (const l of report) console.log('  ' + l)
console.log(`通過 D2-3 野餐點心：${n} 項`)
