// v3.4.0 版面測試：v3.5.1：3 個建築（食盆水盆、狗窩、貓跳台），營火已移除；用素材的「不透明像素」量路燈／狗窩／食盆水盆的間隙
import { pondStand as __pondStand } from '../../../src/farm/pixel/reach.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import { findPath, isClear } from '../../../src/farm/pixel/nav.ts'
import * as PL from '../../../src/farm/pixel/placement.ts'
import { POCKET_MAX_CELLS } from '../../../src/farm/pixel/nav.ts'
import { seatsOf } from '../../../src/farm/pixel/buildingUse.ts'

const ROOT = (process.env.REPO_ROOT + '/')
const sharp = createRequire(ROOT + 'package.json')('sharp')
const assetIndex = readFileSync(ROOT + 'src/farm/pixel/assetIndex.ts', 'utf8').match(/manifest\.[0-9a-f]+\.json/)[0]
const manifest = JSON.parse(readFileSync(ROOT + 'public/assets/' + assetIndex, 'utf8'))
const F = manifest.frames
const FOUR = ['kennel', 'bowls', 'catTree']
const MENU = 28
const rects = (a, b, g = 0) => a.x0 < b.x1 + g && a.x1 > b.x0 - g && a.y0 < b.y1 + g && a.y1 > b.y0 - g

// ---- 已取消的素材與建築不得出現 ----
for (const k of Object.keys(F)) assert.ok(!/seesaw|butterfly|flowerbed/.test(k), '不該有的素材 ' + k)
assert.ok(!F.campfire_a && !F.campfire_b && !F.campfire_off, '營火素材已移除')
for (const k of Object.keys(F)) assert.ok(!/campfire/.test(k), '不該有營火素材 ' + k)
assert.deepEqual(LAY.SLOT_SPECS.map((s) => s.id), ['kennel', 'bowls', 'catTree']) // v3.9.0：野餐墊不再有空位
{
  const dist = ROOT + 'dist/assets/'
  const { readdirSync, existsSync } = await import('node:fs')
  if (existsSync(dist)) for (const f of readdirSync(dist)) if (/\.js$/.test(f)) { const t = readFileSync(dist + f, 'utf8'); assert.ok(!/butterfly|flowerbed|seesaw|chaseSeconds|playground/.test(t), 'dist 還有花圃／蹺蹺板殘留：' + f) }
}

// ---- 素材尺寸、錨點與常數一致 ----
for (const [id, w, h] of [['doghouse', LAY.KENNEL_W, LAY.KENNEL_H], ['cat_tree', LAY.CAT_TREE_W, LAY.CAT_TREE_H], ['bowls', LAY.BOWLS_W, LAY.BOWLS_H]]) { assert.equal(F[id].w, w, id + ' 寬'); assert.equal(F[id].h, h, id + ' 高') }
assert.equal(F.doghouse.ax, LAY.KENNEL_AX); assert.equal(F.lamp.ax, LAY.LAMP_AX); assert.equal(F.lamp.w, LAY.LAMP_W); assert.equal(F.lamp.h, LAY.LAMP_H)

// ---- 不透明像素的逐列左右邊界 ----
const atlasCache = {}
async function rowsOf(key) {
  const f = F[key]
  const file = manifest.atlases[f.atlas].file
  atlasCache[file] ??= await sharp(ROOT + 'public/assets/' + file).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  const { data, info } = atlasCache[file]
  const rows = []
  for (let y = 0; y < f.h; y++) {
    let l = -1, r = -1
    for (let x = 0; x < f.w; x++) if (data[((f.y + y) * info.width + f.x + x) * 4 + 3]) { if (l < 0) l = x; r = x }
    rows.push([l, r])
  }
  return rows
}
const lampRows = await rowsOf('lamp'), dogRows = await rowsOf('doghouse'), bowlRows = await rowsOf('bowls')
/** 逐列的最小縫隙（左邊素材右緣 → 右邊素材左緣的空欄數；負數 = 不透明像素重疊）；rowOfRight(rl) 把左邊素材的列對到右邊素材的列 */
function minGap(leftRows, leftRight, rightRows, rightLeft, mapRow) {
  let g = 1e9, rowAt = -1
  for (let rl = 0; rl < leftRows.length; rl++) {
    const rr = mapRow(rl)
    if (rr < 0 || rr >= rightRows.length) continue
    const [, lr] = leftRows[rl], [rlft] = rightRows[rr]
    if (lr < 0 || rlft < 0) continue
    const gap = rightLeft + rlft - (leftRight + lr + 1)
    if (gap < g) { g = gap; rowAt = rl }
  }
  return { g, rowAt }
}

const SIZES = [[1024, 768, 1], [1280, 720, 1], [1366, 768, 1], [1536, 864, 1.25], [1536, 864, 1.5], [1920, 1080, 1], [1920, 1080, 1.25], [2560, 1440, 1]]
const report = []
for (const [vw, vh, d] of SIZES) {
  const L = LAY.computeLayout(Math.round(vw * d), Math.round((vh - MENU) * d), d)
  LAY.setPlacement(L, PL.defaultPlacement(FOUR)) // v3.9.0
  const tag = `${vw}x${vh}@${d}（邏輯 ${L.W}x${L.H}）`
  const slots = Object.fromEntries(LAY.buildingSlots(L).map((s) => [s.id, s]))
  const hidden = [] // v3.9.0：場景固定，三個建築一定擺得下（不再有「放不下」）
  const owned = LAY.ownedSlots(L)
  assert.deepEqual(owned.map((s) => s.id).sort(), FOUR.filter((id) => !hidden.includes(id)).sort(), tag + ' 放得下的都出現')
  const bl = LAY.blockers(L)
  const box = Object.fromEntries(owned.map((s) => [s.id, LAY.slotBox(s)]))
  // 1) 路燈 ↔ 狗窩：不透明像素逐列量，縫隙 0～2（不重疊）；路燈、住家位置沒動
  const k = slots.kennel, bw = slots.bowls
  assert.equal(PL.DEFAULT_POS.lamp.x, 171); assert.equal(LAY.HOUSE_X0, 6) // v3.9.0：路燈預設位置
  const lampLeft = 171 - LAY.LAMP_AX
  const lampFoot = L.H - 12, kFoot = k.y
  const g1 = minGap(lampRows, lampLeft, dogRows, k.x - LAY.KENNEL_AX, (rl) => lampFoot - LAY.LAMP_H + rl - (kFoot - LAY.KENNEL_H))
  assert.ok(g1.g >= 0 && g1.g <= 2, `${tag} 路燈與狗窩的不透明像素最窄縫隙 ${g1.g}（列 ${g1.rowAt}）`)
  // 2) 狗窩 ↔ 食盆水盆
  const g2 = minGap(dogRows, k.x - LAY.KENNEL_AX, bowlRows, bw.x - F.bowls.ax, (rk) => kFoot - LAY.KENNEL_H + rk - (bw.y - LAY.BOWLS_H))
  assert.ok(g2.g >= 0 && g2.g <= 2, `${tag} 狗窩與食盆水盆的不透明像素最窄縫隙 ${g2.g}`)
  // 狗窩門口的座位（睡覺的狗最寬 56）不被食盆水盆擋住：座位上的狗右緣在食盆水盆的外框左緣之左
  const front = seatsOf('kennel', k, 'sleep')[1]
  assert.ok(front.x + 28 < LAY.slotBox(bw).x0 + 2, `${tag} 狗窩門口座位右緣 ${front.x + 28} 食盆水盆外框左緣 ${LAY.slotBox(bw).x0}`)
  // 3) 貓跳台：比 v3.3.1（鐘樓中心 −6）往右 12、右緣離畫面右緣約 30、不蓋塔門
  const door = LAY.towerDoorRect(L)
  if (box.catTree) {
    const ct = slots.catTree
    assert.equal(ct.x, LAY.towerX(L) + 6, tag + ' 貓跳台中心')
    assert.equal(ct.x - (LAY.towerX(L) - 6), 12, '往右移 12')
    const margin = L.W - box.catTree.x1
    assert.ok(margin >= 28 && margin <= 32, `${tag} 貓跳台右緣離畫面右緣 ${margin}`)
    assert.ok(!rects(box.catTree, door) && box.catTree.y0 >= door.y1 + 4, tag + ' 貓跳台不蓋塔門')
    assert.ok(box.catTree.y0 - LAY.CAT_TREE_HEADROOM >= door.y1, tag + ' 頂層的貓也不蓋塔門')
  }
  // 5) 建築外框彼此不重疊、佔地在障礙裡
  const ids = Object.keys(box)
  for (const a of ids) for (const b of ids) if (a < b) assert.ok(!rects(box[a], box[b]), `${tag} ${a} 與 ${b} 外框重疊`)
  for (const s of owned) { const f = LAY.slotFootprint(s); assert.ok(bl.some((r) => r.x0 <= f.x0 && r.x1 >= f.x1 && r.y0 <= f.y0 && r.y1 >= f.y1), s.id + ' 佔地在障礙裡') }
  // 6) 洗澡通道沒被占；路燈與狗窩之間、路燈本身寵物走不進
  // v3.9.0：洗澡通道取消；路燈只有燈座（腳下佔地）不能走，燈與狗窩之間是地面
  const b = LAY.petBounds(L)
  let leaked = 0
  for (let x = 171 - 10; x <= 171 + 10; x += 1) for (let y = 300; y <= 307; y += 1) if (LAY.isWalkable(L, x, y)) leaked++
  assert.equal(leaked, 0, tag + ' 路燈燈座有可走點')
  // 7) 走道全部可走、沒有死角：把整個活動範圍切成 4 像素格，所有「清楚」的格子必須是同一個連通區塊
  const zones = LAY.walkZones(L)
  const CELL = 4
  const cells = new Map()
  const key = (x, y) => x + ',' + y
  for (const z of zones) for (let y = Math.ceil(z.y0 / CELL) * CELL; y <= z.y1; y += CELL) for (let x = Math.ceil(z.x0 / CELL) * CELL; x <= z.x1; x += CELL) if (isClear(L, x, y)) cells.set(key(x, y), 0)
  const seen = new Set(); const comps = []
  for (const k0 of cells.keys()) {
    if (seen.has(k0)) continue
    const stack = [k0]; seen.add(k0); let n = 0
    while (stack.length) {
      const cur = stack.pop(); n++
      const [cx, cy] = cur.split(',').map(Number)
      for (const [dx, dy] of [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]]) { const nk = key(cx + dx, cy + dy); if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk) } }
    }
    comps.push(n)
  }
  comps.sort((p, q) => q - p)
  // v3.9.0：比一隻寵物身體小的死角不算不連通
  assert.ok(comps.slice(1).every((n) => n <= POCKET_MAX_CELLS), `${tag} 可走區域有比寵物大的不連通區塊（${comps.slice(0, 5).join(',')}）`)
  // 走道下緣：每個建築腳底到活動範圍下緣的距離 >= PATH_FREE_MIN
  for (const s of owned) if (['kennel', 'bowls', 'catTree'].includes(s.id)) assert.ok(b.y1 - s.y >= LAY.PATH_FREE_MIN, `${tag} ${s.id} 走道下半部太窄`)
  // 8) 從每個可走點走得到所有使用位置：食盆、狗窩座位旁、貓跳台座位旁、營火座位、洗澡站位
  const targets = [__pondStand(L)]
  for (const s of owned) for (const purpose of s.id === 'bowls' ? ['eat'] : ['sleep', 'shelter']) for (const st of seatsOf(s.id, s, purpose)) targets.push(st.near)
  for (const t of targets) assert.ok(LAY.isWalkable(L, t.x, t.y) && isClear(L, t.x, t.y), `${tag} 使用位置 (${t.x},${t.y}) 不可站`)
  const starts = []
  for (const z of zones) for (let i = 0; i < 12; i++) { const x = z.x0 + ((i * 37) % 100) / 100 * (z.x1 - z.x0), y = z.y0 + ((i * 61) % 100) / 100 * (z.y1 - z.y0); if (isClear(L, x, y)) starts.push({ x, y }) }
  starts.push({ x: b.x0 + 202, y: b.y1 - 5 }, { x: b.x1 - 2, y: b.y1 - 5 }, { x: b.x1 - 2, y: b.y0 + 2 }, { x: b.x0 + 202, y: b.y0 + 2 }) // v3.9.0：左緣改 12，起點仍在 v3.8.1 的左緣附近
  let paths = 0
  for (const s0 of starts) { if (!isClear(L, s0.x, s0.y)) continue; for (const t of targets) { assert.ok(findPath(L, s0.x, s0.y, t.x, t.y), `${tag} 從 (${s0.x.toFixed(0)},${s0.y.toFixed(0)}) 走不到 (${t.x},${t.y})`); paths++ } }
  report.push(`   縫隙：路燈─狗窩 ${g1.g}px、狗窩─食盆水盆 ${g2.g}px｜貓跳台右緣 ${box.catTree ? L.W - box.catTree.x1 : '隱藏'}｜連通區塊 ${comps.length}、${cells.size} 格｜${targets.length} 個使用位置 × ${starts.length} 個起點 = ${paths} 條路徑全通`)
}

// ---- v3.4.1：洗澡站位（走去洗澡的終點、洗完爬出來的落點，三種入口共用 pondStand）----
for (const [vw, vh, d] of SIZES) for (const state of ['全買齊', '沒買']) {
  const L = LAY.computeLayout(Math.round(vw * d), Math.round((vh - MENU) * d), d)
  LAY.setPlacement(L, PL.defaultPlacement(state === '全買齊' ? FOUR : [])) // v3.9.0
  const tag = `${vw}x${vh}@${d} ${state}`
  const st = __pondStand(L)
  const pd = LAY.pondPos(L)
  const pondBox = { x0: pd.x - LAY.POND_AX, x1: pd.x - LAY.POND_AX + LAY.POND_W, y0: pd.y - LAY.POND_H, y1: pd.y }
  const w = LAY.waterEllipse(L)
  assert.ok(st.x - pondBox.x1 >= 0 && st.x - pondBox.x1 <= LAY.POND_W / 2, `${tag} 站位離水池右緣 ${st.x - pondBox.x1}`)
  assert.ok(Math.abs(st.y - w.cy) <= 40, `${tag} 站位離水面中心垂直距離 ${st.y - w.cy}`)
  // v3.9.0：洗澡通道取消（站位由 reach.ts 計算）
  assert.ok(LAY.isWalkable(L, st.x, st.y) && isClear(L, st.x, st.y), tag + ' 站位站得住、在障礙外')
  const body = { x0: st.x - 28, x1: st.x + 28, y0: st.y - 50, y1: st.y }
  const boxes = [['水池', pondBox], ['住家', { x0: L.house.x0, x1: L.house.x1, y0: L.house.baseY - LAY.HOUSE_H, y1: L.house.baseY }], ['路燈', { x0: 171 - LAY.LAMP_AX, x1: 171 - LAY.LAMP_AX + LAY.LAMP_W, y0: L.H - 12 - LAY.LAMP_H, y1: L.H - 12 }], ...LAY.ownedSlots(L).map((s) => [s.id, LAY.slotBox(s)])]
  for (const [name, r] of boxes) assert.ok(!rects(body, r), `${tag} 站位的寵物被${name}蓋住`)
  for (const sl of LAY.ownedSlots(L)) for (const purpose of sl.id === 'bowls' ? ['eat'] : ['sleep', 'shelter']) for (const seat of seatsOf(sl.id, sl, purpose)) assert.ok(Math.hypot((seat.near.x - st.x) / 40, (seat.near.y - st.y) / 12) > 1, `${tag} 站位與 ${sl.id} 座位重疊`)
  const b = LAY.petBounds(L)
  assert.ok(findPath(L, b.x0 + 280, b.y1 - 20, st.x, st.y) && findPath(L, b.x1 - 20, b.y0 + 5, st.x, st.y), tag + ' 走得到站位')
  report.push(`   洗澡站位 ${tag}：(${st.x},${st.y})，離水池右緣 ${st.x - pondBox.x1}、離水面中心垂直 ${Math.round(st.y - w.cy)}`)
}
console.log(report.join('\n'))
console.log('v3.5.1 layout tests OK')
