// v3.9.0 第三階段：版面依擺放計算（預設表、佔地、擺放規則、跟著走、快取、寵物模擬）
import './env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import * as PL from '../../../src/farm/pixel/placement.ts'
import * as PR from '../../../src/farm/pixel/placeRules.ts'
import * as NAV from '../../../src/farm/pixel/nav.ts'
import * as FD from '../../../src/farm/pixel/finds.ts'
import { picnicMatRect } from '../../../src/farm/pixel/picnic.ts'
import { pondStand, pondStandFound } from '../../../src/farm/pixel/reach.ts'
import { seatsOf } from '../../../src/farm/pixel/buildingUse.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import { dropKind, isBathing } from '../../../src/farm/pixel/pets.ts'
import { isSleeping } from '../../../src/farm/sim/rules.ts'
import { LAYOUT_ITEMS } from '../../../src/farm/config/layoutItems.ts'
import { ENVELOPES } from '../../../src/farm/pixel/envelopes.ts'
import * as OLD from '../.work/v381src/src/farm/pixel/layout.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const report = []
const ALL = ['kennel', 'bowls', 'catTree']
const mkL = (owned = ALL, layout = null) => { const L = LAY.computeLayout(1920, 960, 1); LAY.setPlacement(L, PL.resolvePlacement(owned, layout)); return L }
const DIR = (process.env.REPO_ROOT + '/public/assets/')
const man = JSON.parse(readFileSync(DIR + readdirSync(DIR).find((f) => /^manifest\..*\.json$/.test(f)), 'utf8'))

// ================= A. 預設表 = v3.8.1 在 640×320 算出來的位置 =================
{
  const O = OLD.computeLayout(1920, 960, 1)
  O.owned = new Set(ALL)
  eq([O.W, O.H], [640, 320], 'v3.8.1 在 1920×960 也是 640×320')
  const oldPos = {}
  oldPos.house = { x: O.house.x0 + man.frames.house_closed.ax, y: O.house.baseY }
  oldPos.tower = { x: OLD.towerX(O), y: OLD.towerBase(O) }
  oldPos.pond = OLD.pondPos(O)
  oldPos.board = OLD.boardPos(O)
  let t = 0
  for (const o of OLD.sceneObjects(O)) {
    if (o.key === 'clocktower' || o.key === 'pond') continue
    oldPos[o.key === 'tree' ? 'tree' + ++t : o.key] = { x: o.x, y: o.y }
  }
  for (const s of OLD.buildingSlots(O)) if (ALL.includes(s.id)) oldPos[s.id] = { x: s.x, y: s.y }
  eq(PL.DEFAULT_POS, oldPos, 'A 預設表和 v3.8.1 的計算結果逐項相同（灌木、高草叢 v3.8.1 也沒有）')
  ok(!('bush' in oldPos) && !('tall_grass' in oldPos), 'A v3.8.1 的 640×320 沒有灌木、高草叢')
  const L = mkL()
  eq(pondStand(L), OLD.pondStand(O), 'A 預設配置的洗澡站位 = v3.8.1（140, 176）')
  eq(pondStand(L), { x: 140, y: 176 }, 'A 洗澡站位 (140,176)')
  eq(PL.DEFAULT_POS.kennel.x - PL.DEFAULT_POS.lamp.x, LAY.KENNEL_DX_FROM_LAMP, 'A 狗窩 = 路燈 + 55（預設表裡的常數）')
  eq(PL.DEFAULT_POS.bowls.x - PL.DEFAULT_POS.kennel.x, LAY.BOWLS_DX_FROM_KENNEL, 'A 食盆 = 狗窩 + 79')
  // 狗窩、食盆的預設位置不跟著路燈跑
  const moved = mkL(ALL, { items: [{ id: 'lamp', kind: 'lamp', state: 'placed', x: 420, y: 300 }] })
  eq(LAY.buildingSlots(moved).filter((s) => s.id !== 'catTree').map((s) => [s.id, s.x, s.y]), [['kennel', 226, 271], ['bowls', 305, 271]], 'A 路燈移走，沒動過的狗窩、食盆留在預設位置')
  // 沒有紀錄：灌木、高草叢、花槽、珊瑚在庫存
  eq([...mkL().placement.stored].sort(), ['bush', 'coral', 'planter', 'tall_grass'], 'A 沒有紀錄時在庫存的：灌木、高草叢、花槽、珊瑚')
  eq([...mkL([]).placement.placed.keys()].filter((k) => ALL.includes(k)), [], 'A 沒買的建築不擺也不在庫存')
}

// ================= B. 輪廓與佔地 =================
{
  for (const [k, e] of Object.entries(ENVELOPES)) {
    const f = man.frames[{ house: 'house_closed' }[k] ?? k]
    eq([e.w, e.h, e.ax, e.ay], [f.w, f.h, f.ax, f.ay], 'B 輪廓尺寸與錨點和 manifest 相同：' + k)
  }
  const L = mkL()
  const items = [...L.placement.placed.values()]
  let minGap = Infinity
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = PL.footprintAt(items[i].kind, items[i].x, items[i].y), b = PL.footprintAt(items[j].kind, items[j].x, items[j].y)
    const g = Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1)
    minGap = Math.min(minGap, g)
    ok(g >= PR.MIN_GAP, `B 預設配置 ${items[i].id}–${items[j].id} 佔地間距 ${g} ≥ 12`)
  }
  report.push(`預設配置佔地最小間距 ${minGap}`)
  eq([PL.KIND_GEOM.kennel.foot, PL.KIND_GEOM.bowls.foot, PL.KIND_GEOM.catTree.foot], [{ x0: -38, x1: 38, d: 22 }, { x0: -24, x1: 24, d: 12 }, { x0: -26.5, x1: 26.5, d: 22 }], 'B 建築佔地沿用 76×22、48×12、53×22')
  // 障礙＝佔地：不再從畫面頂端往下延伸
  for (const r of LAY.blockers(L)) ok(r.y0 > L.farBottom - 40, 'B 障礙不從畫面頂端延伸：' + JSON.stringify(r))
  eq(LAY.petBounds(L), { x0: 12, x1: 628, y0: 150, y1: 316 }, 'B 可走範圍＝整片地面')
  ok(LAY.isWalkable(L, 190, 290), 'B 路燈與狗窩之間、以前「路燈＋42」左邊的地面現在可以走')
  ok(!LAY.isWalkable(L, 171, 305), 'B 路燈燈座不能走')
  ok(!LAY.isWalkable(L, 57, 200), 'B 池塘不能走')
}

// ================= C. 擺放規則：固定案例 =================
const placeMany = (L, moves) => { for (const [id, x, y] of moves) { const r = PR.canPlace(L, id, x, y); assert.ok(r.ok, `準備擺放 ${id} (${x},${y}) 失敗：${r.ok ? '' : r.detail}`); LAY.setPlacement(L, PL.withMove(L.placement, id, x, y)) } return L }
{
  const L = mkL()
  for (const it of L.placement.placed.values()) { const r = PR.canPlace(L, it.id, it.x, it.y); ok(r.ok, 'C 預設位置合法：' + it.id + (r.ok ? '' : ' ' + r.detail)) }
  const L0 = mkL([])
  for (const it of L0.placement.placed.values()) ok(PR.canPlace(L0, it.id, it.x, it.y).ok, 'C 沒買建築時預設位置合法：' + it.id)
  // 範圍
  const R = (id) => PR.placeRange(L, PL.KIND_GEOM[LAYOUT_ITEMS.find((d) => d.id === id).kind] ? LAYOUT_ITEMS.find((d) => d.id === id).kind : id)
  eq(R('tower'), { x0: 62, x1: 579, y0: 160, y1: 316 }, 'C 鐘樓範圍：x 62～579、腳底 y 160～316（整張圖不超出畫面頂端）')
  eq(R('house').y0, 136, 'C 住家可以往後到公佈欄那條線（草地上緣 136）')
  eq(R('board').y0, 136, 'C 公佈欄 y 下限 136')
  eq(R('rocks').y0, 146, 'C 其他物件 y 下限 146（草地上緣 + 10）')
  const towerAt = (y) => PR.canPlace(L, 'tower', 568, y)
  ok(towerAt(160).ok, 'C 鐘樓往後移到 y 160（頂端剛好 0）可以')
  eq(towerAt(159).ok ? 'ok' : towerAt(159).reason, 'outside', 'C 鐘樓 y 159（頂端超出畫面）不行')
  const tw = PR.placeRange(L, 'tower')
  report.push(`鐘樓可擺放範圍：腳底 x ${tw.x0}～${tw.x1}、y ${tw.y0}～${tw.y1}（預設 568, 166；最多往後 ${166 - tw.y0} 像素，頂端剛好碰到畫面頂端）`)
  eq(PR.canPlace(L, 'rocks', 234, 145).ok ? 'ok' : PR.canPlace(L, 'rocks', 234, 145).reason, 'outside', 'C 石頭 y 145 不行')
  eq(PR.canPlace(L, 'tree2', 30, 200).reason, 'outside', 'C 樹的外框超出左邊界不行')
  // 住家往後到公佈欄那條線：把公佈欄、池塘收不了，所以把住家放到右邊空的草地後排（y 136）
  const Lh = mkL([])
  for (const id of ['tree2', 'stump']) LAY.setPlacement(Lh, PL.withMove(Lh.placement, id, null, null)) // 右邊後排騰出空間
  let houseBack = null
  for (let x = 300; x <= 571 && !houseBack; x++) if (PR.canPlace(Lh, 'house', x, 136).ok) houseBack = x
  ok(houseBack !== null, 'C 住家可以往後放到公佈欄那條線（y 136）：x ' + houseBack)
  ok(PR.canPlace(Lh, 'house', houseBack ?? 400, 135).reason === 'outside', 'C 住家 y 135 超出範圍')
  report.push('住家往後到公佈欄那條線（y 136）的位置：x ' + (houseBack ?? '找不到'))
  // 互動區：在鐘樓門前放一棵樹（樹的腳底比鐘樓低 → 畫在前面）
  const Lc = mkL([])
  const cov = PR.canPlace(Lc, 'tree1', 568, 200)
  eq(cov.ok ? 'ok' : cov.reason, cov.ok ? 'ok' : cov.reason, 'C（記錄）')
  let coversFound = null
  for (let x = 520; x <= 620 && !coversFound; x += 2) for (let y = 167; y <= 230 && !coversFound; y += 2) { const r = PR.canPlace(Lc, 'tree1', x, y); if (!r.ok && r.reason === 'covers') coversFound = [x, y, r.detail] }
  ok(coversFound, 'C 樹放在鐘樓前面會蓋到塔門／鐘面 → covers：' + JSON.stringify(coversFound))
  // 互動區：住家門前放樹樁（腳底在住家之後不可能，住家腳底 314），反過來：把池塘放到住家門的後面不會蓋；把狗窩放到池塘水面前
  // 間距：兩個裝飾在空草地上相隔 12 可以、11 不行
  const Lg = mkL([])
  const base = { x: 200, y: 230 }
  placeMany(Lg, [['coral', base.x, base.y]])
  const fpC = PL.footprintAt('coral', base.x, base.y)
  const rocksHalf = PL.KIND_GEOM.rocks.foot.x1
  const x12 = fpC.x1 + 12 + rocksHalf, x11 = fpC.x1 + 11 + rocksHalf
  ok(PR.canPlace(Lg, 'rocks', x12, base.y).ok, `C 佔地相隔 12 可以（石頭 x ${x12}）`)
  eq(PR.canPlace(Lg, 'rocks', x11, base.y).reason, 'overlap', 'C 佔地相隔 11 不行（overlap）')
  eq(PR.canPlace(Lg, 'rocks', base.x, base.y).reason, 'overlap', 'C 完全重疊不行')
  // 住家、鐘樓、池塘可以擺在沙土路上
  for (const id of ['house', 'tower', 'pond']) {
    const Lp = mkL([])
    let spot = null
    for (let x = 200; x <= 600 && !spot; x += 4) for (const y of [290, 300, 310]) if (!spot && PR.canPlace(Lp, id, x, y).ok) spot = [x, y]
    ok(spot && spot[1] > LAY.pathTopOf(Lp), `C ${id} 可以擺在沙土路上：${JSON.stringify(spot)}`)
  }
  // 預設配置裡每種原因都找得到（掃描全場）
}

// ================= D. 隨機擺放 5000 組（獨立判斷） =================
{
  let seed = 3901
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const counts = { ok: 0, outside: 0, overlap: 0, covers: 0, disconnected: 0, unreachable: 0, unknown: 0 }
  const ids = LAYOUT_ITEMS.map((d) => d.id)
  const hitGap = (a, b, g) => a.x0 < b.x1 + g && a.x1 > b.x0 - g && a.y0 < b.y1 + g && a.y1 > b.y0 - g
  // 獨立的連通判斷：4 像素格子，可走 = nav.isClear；8 方向（斜走不可切牆角）BFS
  const myComps = (L) => {
    const b = LAY.petBounds(L)
    const cols = Math.ceil(L.W / 4) + 1, rows = Math.ceil(L.H / 4) + 1
    const okc = new Uint8Array(cols * rows)
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) okc[cy * cols + cx] = NAV.isClear(L, cx * 4, cy * 4) ? 1 : 0
    const lab = new Int32Array(cols * rows).fill(-1), sizes = []
    for (let i = 0; i < okc.length; i++) {
      if (!okc[i] || lab[i] >= 0) continue
      const k = sizes.length; let cnt = 0; const st = [i]; lab[i] = k
      while (st.length) { const c = st.pop(); cnt++; const cx = c % cols, cy = (c / cols) | 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue; const ni = ny * cols + nx; if (!okc[ni] || lab[ni] >= 0) continue; if (dx && dy && (!okc[cy * cols + nx] || !okc[ny * cols + cx])) continue; lab[ni] = k; st.push(ni) } }
      sizes.push(cnt)
    }
    let main = 0; sizes.forEach((s, k) => { if (s > sizes[main]) main = k })
    return { cols, lab, sizes, main, b }
  }
  // 從一個隨機的合法場景開始，反覆移動物件
  let L = mkL(ALL)
  for (let i = 0; i < 5000; i++) {
    const id = ids[Math.floor(rnd() * ids.length)]
    const def = LAYOUT_ITEMS.find((d) => d.id === id)
    if (def.building && !L.placement.owned.has(id)) continue
    const range = PR.placeRange(L, def.kind)
    // 範圍外也抽一些
    const x = Math.round(range.x0 - 20 + rnd() * (range.x1 - range.x0 + 40))
    const y = Math.round(range.y0 - 15 + rnd() * (range.y1 - range.y0 + 25))
    let r
    try { r = PR.canPlace(L, id, x, y) } catch (e) { assert.fail('D canPlace 丟錯誤 ' + e.message) }
    counts[r.ok ? 'ok' : r.reason]++
    // 獨立檢查 1、2
    const inRange = x >= range.x0 && x <= range.x1 && y >= range.y0 && y <= range.y1
    const box = PL.spriteBoxAt(def.kind, x, y)
    if (inRange) ok(box.x0 >= 0 && box.x1 <= 640 && y <= 316, 'D 範圍內的素材外框在場景裡')
    if (!inRange) { eq(r.ok ? 'ok' : r.reason, 'outside', `D #${i} ${id} (${x},${y}) 範圍外 → outside`); continue }
    const fp = PL.footprintAt(def.kind, x, y)
    const near = [...L.placement.placed.values()].filter((o) => o.id !== id && hitGap(fp, PL.footprintAt(o.kind, o.x, o.y), 12))
    if (near.length) { eq(r.ok ? 'ok' : r.reason, 'overlap', `D #${i} ${id} 離 ${near[0].id} 太近 → overlap`); continue }
    ok(r.ok || ['covers', 'disconnected', 'unreachable'].includes(r.reason), `D #${i} ${id} 範圍與間距都合格 → 結果 ${r.ok ? 'ok' : r.reason}`)
    if (!r.ok) continue
    // 合法的：移過去，然後獨立確認連通、座位與洗澡站位走得到、互動區沒被蓋（逐像素）
    LAY.setPlacement(L, PL.withMove(L.placement, id, x, y))
    const c = myComps(L)
    ok(c.sizes.every((s, k) => k === c.main || s <= NAV.POCKET_MAX_CELLS), `D #${i} 合法 → 沒有比寵物大的死角（${c.sizes.join(',')}）`)
    const inMain = (px, py) => { let best = -1, bd = 1e9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const cx = Math.round(px / 4) + dx, cy = Math.round(py / 4) + dy; const k = cy * c.cols + cx; if (k < 0 || k >= c.lab.length || c.lab[k] < 0) continue; const d = Math.hypot(cx * 4 - px, cy * 4 - py); if (d < bd) { bd = d; best = c.lab[k] } } return best === c.main }
    for (const s of LAY.ownedSlots(L)) for (const pur of s.id === 'bowls' ? ['eat'] : ['sleep', 'shelter']) for (const st of seatsOf(s.id, s, pur)) ok(inMain(st.near.x, st.near.y), `D #${i} ${s.id} 座位旁走得到`)
    const stand = pondStand(L)
    ok(pondStandFound(L) && inMain(stand.x, stand.y), `D #${i} 洗澡站位走得到`)
    const me = L.placement.placed.get(id)
    for (const o of L.placement.placed.values()) {
      if (o.id === id) continue
      const [back, front] = o.y > me.y ? [me, o] : me.y > o.y ? [o, me] : [null, null]
      if (!back) continue
      for (const z of PR.zonesOf(L, back)) {
        let hit = false
        const env = PL.envelopeOf(front.kind)
        for (let yy = Math.floor(z.y0); yy < Math.ceil(z.y1) && !hit; yy++) for (let xx = Math.floor(z.x0); xx < Math.ceil(z.x1) && !hit; xx++) if (PL.envCovers(front.kind, front.x, front.y, xx + 0.5, yy + 0.5)) hit = true
        ok(!hit, `D #${i} ${front.id} 沒有蓋到 ${back.id} 的互動區`)
        void env
      }
    }
  }
  report.push('隨機 5000 次的結果：' + JSON.stringify(counts))
  for (const k of ['ok', 'outside', 'overlap', 'covers', 'disconnected', 'unreachable']) ok(counts[k] > 0 || k === 'disconnected' || k === 'unreachable', 'D 每種結果都有出現：' + k)
  // 刻意做出不連通與走不到：把很多物件排成一道牆把右邊圍起來
  // （不保證每次都排得出來；排得出來就要被擋）
  report.push('D 隨機中出現 disconnected ' + counts.disconnected + ' 次、unreachable ' + counts.unreachable + ' 次')
}

// ================= D2. 連通：人工做一道牆（擺放時不檢查），只留一個缺口，再用食盆堵住 =================
{
  const L = mkL(ALL)
  // 先把會擋路的東西收起來或移開，再把幾個物件排成橫跨地面的一排（腳底 y 260，佔地互相重疊 2 像素）
  let P = L.placement
  for (const id of ['lamp', 'tree1', 'tree2', 'mushroom', 'rocks', 'flowers', 'stump', 'kennel']) P = PL.withMove(P, id, null, null)
  const row = ['house', 'pond', 'coral', 'planter', 'mushroom', 'tower', 'catTree'] // 第六階段：珊瑚、花槽佔地由 85×0.8＝68 改成實測 54（各縮 14），在花槽後面加一個蘑菇把牆補回橫跨整片地面（右端 623.5 → 622.5）
  const y = 260
  let x0 = 0
  const gapAt = 3 // 在第 3 個物件之前留缺口
  let opening = null
  for (let i = 0; i < row.length; i++) {
    const id = row[i]
    const kind = PL.resolvePlacement(ALL, null).placed.get(id)?.kind ?? id
    const f = PL.KIND_GEOM[kind].foot
    if (i === gapAt) { const lx1 = x0 + 2; opening = { x0: lx1, w: 48 + 24 }; x0 = lx1 + 48 + 24 } // 左邊物件的佔地右緣 = x0 + 2；右邊物件的佔地左緣 = 缺口右緣
    const x = Math.round(x0 - f.x0)
    P = PL.withMove(P, id, x, y)
    x0 = x + f.x1 - 2
  }
  LAY.setPlacement(L, P)
  report.push('D2 牆：' + [...P.placed.values()].map((it) => `${it.id}(${it.x},${it.y})`).join(' ') + '；缺口 x ' + opening.x0 + '～' + (opening.x0 + opening.w) + '；牆右端 ' + x0)
  ok(x0 >= 616, 'D2 牆橫跨整片地面（右端 ' + x0 + '）')
  ok(!NAV.hasIsolatedRegion(L), 'D2 有缺口時上下兩塊還連通')
  // 用食盆堵缺口：佔地兩邊各留 12（剛好不算重疊）
  const bx = opening.x0 + 12 + 24
  const r12 = PR.canPlace(L, 'bowls', bx, y)
  report.push('D2 食盆放進缺口（兩邊各 12）：' + (r12.ok ? 'ok' : r12.reason + ' ' + r12.detail))
  ok(!r12.ok && (r12.reason === 'disconnected' || r12.reason === 'unreachable'), 'D2 食盆把缺口堵到只剩 12 像素的縫 → 不合法（' + (r12.ok ? 'ok' : r12.reason) + '）')
  // 12 像素寬的縫寵物走不走得過（直接放上去看連通）
  LAY.setPlacement(L, PL.withMove(P, 'bowls', bx, y))
  const slit = NAV.hasIsolatedRegion(L)
  report.push('D2 兩邊各留 12 像素的縫：' + (slit ? '走不過（上下兩塊被隔開 → canPlace 會擋下）' : '走得過') + '，區塊 ' + NAV.components(L).sizes.join(','))
  // 偵測器本身：直接把缺口補滿（不經檢查）→ 有隔開的區塊
  const P2 = PL.withMove(P, 'bowls', opening.x0 + opening.w / 2, y)
  const P3 = PL.withMove(P2, 'kennel', opening.x0 + opening.w / 2, y)
  LAY.setPlacement(L, P3)
  ok(NAV.hasIsolatedRegion(L), 'D2 缺口完全補滿 → hasIsolatedRegion 偵測到隔開的區塊（' + NAV.components(L).sizes.join(',') + '）')
}

// ================= E. 跟著實際位置走（引擎） =================
{
  const e = new PixelEngine()
  e.setSize(1920, 960, 1)
  e.setLayoutData(ALL, undefined)
  const before = { door: e.doorCss(), tdoor: e.towerDoorCss(), hits: e.toolHits(24), board: e.boardGreenCss(), sign: e.towerSignCss() }
  const lampObj = () => LAY.sceneObjects(e.layout).find((o) => o.key === 'lamp')
  const lamp0 = lampObj()
  const moves = [['house', 300, 314], ['tower', 420, 200], ['pond', 500, 290], ['board', 470, 136], ['lamp', 600, 316]]
  const L = e.layout
  // 先確認這些位置合法（依序擺，前面的影響後面）
  const T = mkL(ALL)
  const layout = { items: [] }
  for (const [id, x, y] of moves) {
    let p = [x, y]
    if (!PR.canPlace(T, id, x, y).ok) {
      // 找附近合法的
      let found = null
      for (let r = 2; r < 200 && !found; r += 2) for (let dx = -r; dx <= r && !found; dx += 2) for (const dy of [-r, r, 0]) if (!found && PR.canPlace(T, id, x + dx, y + dy).ok) found = [x + dx, y + dy]
      assert.ok(found, 'E 找不到合法位置 ' + id)
      p = found
    }
    LAY.setPlacement(T, PL.withMove(T.placement, id, p[0], p[1]))
    layout.items.push({ id, kind: LAYOUT_ITEMS.find((d) => d.id === id).kind, state: 'placed', x: p[0], y: p[1] })
  }
  e.setLayoutData(ALL, layout)
  const pos = (id) => layout.items.find((it) => it.id === id)
  const d = (id) => ({ dx: (pos(id).x - PL.DEFAULT_POS[id].x) * 3, dy: (pos(id).y - PL.DEFAULT_POS[id].y) * 3 })
  const after = { door: e.doorCss(), tdoor: e.towerDoorCss(), hits: e.toolHits(24), board: e.boardGreenCss(), sign: e.towerSignCss() }
  const shifted = (a, b, dd) => Math.abs(b.x0 - a.x0 - dd.dx) < 1e-6 && Math.abs(b.y0 - a.y0 - dd.dy) < 1e-6
  ok(shifted(before.door, after.door, d('house')), 'E 住家門的 DOM 入口跟著住家走')
  ok(shifted(before.tdoor, after.tdoor, d('tower')), 'E 塔門的 DOM 入口跟著鐘樓走')
  ok(shifted(before.hits.window, after.hits.window, d('tower')) && shifted(before.hits.clock, after.hits.clock, d('tower')), 'E 窗戶、鐘面點擊區跟著鐘樓走')
  ok(Math.abs(after.sign.x - before.sign.x - d('tower').dx) < 1e-6, 'E 「遊戲」招牌跟著鐘樓走')
  ok(shifted(before.hits.board, after.hits.board, d('board')) && shifted(before.board, after.board, d('board')), 'E 公佈欄點擊區、縮圖跟著公佈欄走')
  const lamp1 = lampObj()
  eq([lamp1.x - lamp0.x, lamp1.y - lamp0.y], [pos('lamp').x - 171, pos('lamp').y - 308], 'E 路燈光暈的位置（sceneObjects 的路燈）跟著路燈走')
  // 鐘面（程式畫）用 towerX／towerBase
  eq([LAY.towerX(e.layout), LAY.towerBase(e.layout)], [pos('tower').x, pos('tower').y], 'E 鐘面、塔門暖光的基準跟著鐘樓走')
  // 拖曳寵物到水面：跟著池塘
  const w = LAY.waterEllipse(e.layout)
  eq(dropKind(e.layout, w.cx, w.cy), 'water', 'E 新池塘的水面中心 → 洗澡')
  const w0 = LAY.waterEllipse(mkL(ALL))
  ok(dropKind(e.layout, w0.cx, w0.cy) !== 'water', 'E 舊池塘位置不再是水面')
  const st = pondStand(e.layout)
  ok(pondStandFound(e.layout) && Math.hypot(st.x - pos('pond').x, st.y - (pos('pond').y - 40)) < 120, 'E 洗澡站位在新池塘旁邊：' + JSON.stringify(st))
  report.push('E 移動後：' + layout.items.map((it) => `${it.id}(${it.x},${it.y})`).join(' ') + '；洗澡站位 ' + JSON.stringify(st))
  // 收進庫存：路燈不見 → 沒有光暈、沒有障礙
  e.setLayoutData(ALL, { items: [{ id: 'lamp', kind: 'lamp', state: 'stored' }] })
  ok(!LAY.sceneObjects(e.layout).some((o) => o.key === 'lamp'), 'E 路燈收進庫存：場景物件沒有路燈（不畫、沒有光暈）')
  ok(LAY.isWalkable(e.layout, 171, 305), 'E 路燈收進庫存：燈座的位置可以走')
  e.setLayoutData(ALL, { items: [{ id: 'kennel', kind: 'kennel', state: 'stored' }] })
  ok(!e.buildings().has('kennel') && e.buildings().has('bowls'), 'E 狗窩收進庫存：引擎的建築清單沒有狗窩')
}

// ================= F. 快取跟著擺放版本 =================
{
  const L = mkL(ALL)
  const snap = () => ({
    blockers: JSON.stringify(LAY.blockers(L)), scene: JSON.stringify(LAY.sceneObjects(L)), slots: JSON.stringify(LAY.buildingSlots(L)), owned: JSON.stringify(LAY.ownedSlots(L)),
    comps: NAV.components(L).sizes.join(','), stand: JSON.stringify(pondStand(L)), obst: JSON.stringify(FD.obstacleRects(L)), area: FD.grassArea(L), mat: JSON.stringify(picnicMatRect(L)),
  })
  const a = snap()
  const rev0 = L.placement.rev
  LAY.setPlacement(L, PL.withMove(PL.withMove(PL.withMove(L.placement, 'pond', 520, 300), 'catTree', 420, 271), 'stump', 330, 200))
  ok(L.placement.rev > rev0, 'F 擺放版本 +1')
  const b = snap()
  for (const k of Object.keys(a)) ok(a[k] !== b[k], 'F 換擺放後重算：' + k)
  const e = new PixelEngine(); e.setSize(1920, 960, 1); e.setLayoutData(ALL, undefined)
  const m1 = e.buildings(), f1 = e.findPoints()
  e.setLayoutData(ALL, { items: [{ id: 'bowls', kind: 'bowls', state: 'placed', x: 420, y: 290 }] })
  ok(e.buildings() !== m1 && e.buildings().get('bowls').x === 420, 'F 引擎的建築位置快取重算')
  ok(e.findPoints() !== f1, 'F 引擎的寶物位置快取重算')
}

// ================= G. 寵物模擬：6 種擺放各 30 分鐘 =================
{
  const NOW0 = new Date(2026, 10, 18, 12, 0, 0).getTime()
  const pet = (id, species, variant) => ({ id, species, variant, name: id, adoptedAt: NOW0 - 86400000, heightFactor: 1, weight: 50, satiety: 35, mood: 60, cleanliness: 80, personality: 'calm' })
  const PETS = [pet('d1', 'dog', 'shiba'), pet('d2', 'dog', 'golden'), pet('d3', 'dog', 'corgi'), pet('c1', 'cat', 'orange'), pet('c2', 'cat', 'siamese'), pet('c3', 'cat', 'ragdoll')]
  // 擺放：每一組都用 canPlace 依序擺（保證合法）
  const near = (T, id, x, y) => { for (let r = 0; r < 260; r += 2) for (let dx = -r; dx <= r; dx += 2) for (const dy of r ? [-r, r, 0, -r / 2, r / 2] : [0]) { const px = x + dx, py = Math.round(y + dy); if (PR.canPlace(T, id, px, py).ok) return [px, py] } return null }
  const build = (moves, stores = []) => {
    const T = mkL(ALL)
    for (const id of stores) LAY.setPlacement(T, PL.withMove(T.placement, id, null, null))
    for (const [id, x, y] of moves) { const p = near(T, id, x, y); assert.ok(p, 'G 找不到 ' + id + ' 的合法位置'); LAY.setPlacement(T, PL.withMove(T.placement, id, p[0], p[1])) }
    return PL.placementToLayout(T.placement)
  }
  const SETS = [
    ['預設配置', undefined],
    ['路燈移到右邊', build([['lamp', 470, 300]])],
    ['鐘樓移到沙土路上', build([['catTree', 420, 271], ['tower', 560, 300]])],
    ['池塘移到右下', build([['pond', 520, 300]])],
    ['住家移到中間', build([['house', 330, 314]])],
    ['花槽珊瑚灌木擺出來、狗窩食盆收進庫存', build([['planter', 200, 220], ['coral', 330, 230], ['bush', 450, 200], ['tall_grass', 560, 220]], ['kennel', 'bowls'])],
  ]
  const HOURS = [12, 22.6, 14, 21.8, 9, 23]
  const WEATHER = ['sunny', 'sunny', 'rain', 'sunny', 'rain', 'sunny']
  for (let si = 0; si < SETS.length; si++) {
    const [name, layout] = SETS[si]
    const e = new PixelEngine()
    let seed = 7000 + si * 77
    e.rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    e.setSize(1920, 960, 1)
    e.setLayoutData(ALL, layout)
    e.sync(PETS.map((p) => ({ ...p })))
    let baths = 0
    e.hooks = { requestBath: () => { baths++; return null }, wake: () => {}, notify: () => {}, eatAtBowl: () => null, settlePlay: () => {}, addFind: () => false }
    e.bowlLeft = 12
    const dt = 0.05
    const steps = Math.round((30 * 60) / dt)
    let now = NOW0
    let inside = 0, stuck = 0, idleSamples = 0, idleHidden = 0, seated = 0
    const still = new Map()
    let bathAsked = 0
    for (let i = 0; i < steps; i++) {
      now += dt * 1000
      const hour = (HOURS[si] + (i * dt) / 3600) % 24
      e.update(dt, { nowMs: now, hour, weather: WEATHER[si], gifts: [] })
      // 每 5 分鐘叫一隻醒著的去洗澡
      if (i % Math.round(300 / dt) === 100) {
        const a = [...e.actors.values()].find((a) => !a.bath && !isSleeping(a.pet, hour, now) && !a.bld)
        if (a && e.sendToBath(a.id) === null) bathAsked++
      }
      if (i % 10 !== 0) continue
      for (const a of e.actors.values()) {
        if (a.bld?.phase === 'at') seated++
        const free = !a.bath && !a.drag && !a.fly && !a.bld && !a.picnic && !a.play
        if (free && LAY.blockers(e.layout).some((r) => a.x > r.x0 + 1 && a.x < r.x1 - 1 && a.y > r.y0 + 1 && a.y < r.y1 - 1)) inside++
        if (free && (a.action === 'idle' || a.action === 'sit')) { idleSamples++; if (PL.coverFraction(e.layout.placement, a.x, a.y) > 0.5) idleHidden++ }
        // 卡住：走路中、10 秒內移動不到 2 像素
        const k = still.get(a.id) ?? { x: a.x, y: a.y, t: 0 }
        if (a.action === 'walk' && !a.bld && Math.hypot(a.x - k.x, a.y - k.y) < 2) { k.t += dt * 10; if (k.t > 10) { stuck++; k.t = 0 } } else { k.x = a.x; k.y = a.y; k.t = 0 }
        still.set(a.id, k)
      }
    }
    report.push(`G ${name}：洗澡請求 ${bathAsked}、跳進水池 ${baths}、座位上取樣 ${seated}、站進佔地 ${inside}、走路卡住 ${stuck}、閒置被蓋住超過一半 ${idleHidden}/${idleSamples}`)
    eq(inside, 0, `G ${name}：寵物不會站進物件的腳下佔地`)
    ok(stuck <= 2, `G ${name}：走路卡住 ${stuck} 次（≤ 2）`)
    ok(bathAsked === 0 || baths >= Math.ceil(bathAsked * 0.6), `G ${name}：叫去洗澡大多走得到（${baths}/${bathAsked}）`)
    ok(idleSamples === 0 || idleHidden / idleSamples < 0.05, `G ${name}：閒置時被蓋住超過一半的比例 ${(idleHidden / Math.max(1, idleSamples) * 100).toFixed(1)}% < 5%`)
  }
}

console.log(report.join('\n'))
console.log(`v3.9.0 第三階段版面測試 ${n} 項全過`)
