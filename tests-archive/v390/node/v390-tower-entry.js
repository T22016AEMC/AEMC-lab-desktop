// v3.9.0 鐘樓放寬與塔門保護調整：
//  A. TOWER_TOP_MIN -24：腳底 y=136 可以、135 不行；互動區／引擎 CSS／寵物模擬跟著新位置
//  B. 塔門、招牌、鐘面各自可被蓋住 ≤ 25%（TOWER_ZONE_COVER_MAX）；窗戶仍完全不能蓋；邊界（恰好 25% 可以、多 1 格不行）
//  C. 面積量測：用正式程式的函式重現報告的 E 欄（舊規則）與 B 25% 欄，並鎖定新規則的實際面積
//  D. 放寬後新增的位置：全部通過連通與座位檢查，被擋下的要有正確的原因與文字
import './env-shim.js'
import assert from 'node:assert/strict'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import * as PL from '../../../src/farm/pixel/placement.ts'
import * as PR from '../../../src/farm/pixel/placeRules.ts'
import * as NAV from '../../../src/farm/pixel/nav.ts'
import { pondStand, pondStandFound } from '../../../src/farm/pixel/reach.ts'
import { seatsOf } from '../../../src/farm/pixel/buildingUse.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import { LAYOUT_ITEMS } from '../../../src/farm/config/layoutItems.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const report = []
const ALL = ['kennel', 'bowls', 'catTree']
const mkL = (layout = null, owned = ALL) => { const L = LAY.computeLayout(1920, 960, 1); LAY.setPlacement(L, PL.resolvePlacement(owned, layout)); return L }
const kindOfId = (id) => LAYOUT_ITEMS.find((d) => d.id === id).kind
const hitGap = (a, b, g) => a.x0 < b.x1 + g && a.x1 > b.x0 - g && a.y0 < b.y1 + g && a.y1 > b.y0 - g
const near = (a, b, m) => ok(Math.abs(a - b) < 1e-9, m + `（${a} vs ${b}）`)

// ================= A. 鐘樓往後放寬 =================
{
  eq(PR.TOWER_TOP_MIN, -24, 'A TOWER_TOP_MIN = -24')
  eq(PR.TOWER_ZONE_COVER_MAX, 0.25, 'A TOWER_ZONE_COVER_MAX = 0.25')
  const L = mkL()
  eq(L.farBottom, 136, 'A 草地上緣（公佈欄那條線）= 136')
  eq(PR.minFootY(L, 'tower'), 136, 'A 鐘樓腳底下限 = max(草地上緣 136, 160 - 24) = 136')
  eq(PR.placeRange(L, 'tower').y0, 136, 'A 鐘樓範圍 y0 = 136')
  const at = (y) => PR.canPlace(L, 'tower', 568, y)
  ok(at(136).ok, 'A 腳底 y=136 可以放：' + (at(136).ok ? '' : at(136).detail))
  eq(at(135).ok ? 'ok' : at(135).reason, 'outside', 'A 腳底 y=135 不行（outside）')
  ok(at(160).ok && at(159).ok && at(166).ok, 'A 160、159、預設 166 也都可以')
  for (const y of [136, 150, 200, 316]) ok(PR.canPlace(L, 'tower', 62, y).ok || PR.canPlace(L, 'tower', 62, y).reason !== 'outside', `A x=62、y=${y} 在範圍內`)
  // 互動區、頂端：全部平移 -30（預設 166 → 136），尖頂超出畫面 24
  const T0 = L
  const T1 = PR.layoutWith(L, PL.withMove(L.placement, 'tower', 568, 136))
  eq(LAY.towerTopLeft(T1).y, -24, 'A 鐘樓素材頂端 y = -24（尖頂超出畫面 24 像素）')
  eq(LAY.towerTopLeft(T1).x, LAY.towerTopLeft(T0).x, 'A x 不變')
  for (const [name, f] of [['門', LAY.towerDoorRect], ['招牌', LAY.towerSignRect], ['窗戶', LAY.towerWindowRect], ['鐘面', (l) => LAY.towerClockRect(l, null)]]) {
    const a = f(T0), b = f(T1)
    for (const k of ['x0', 'x1', 'y0', 'y1']) near(b[k], a[k] + (k[0] === 'y' ? -30 : 0), `A ${name}互動區 ${k} 平移 -30`)
    ok(b.y0 >= 0, `A ${name}互動區整個在畫面內（y0 ${b.y0.toFixed(1)}）`)
  }
  report.push('鐘樓放到最後面（568, 136）：頂端 -24；窗戶 y ' + LAY.towerWindowRect(T1).y0 + '～' + LAY.towerWindowRect(T1).y1 + '，鐘面 y ' + LAY.towerClockRect(T1, null).y0 + '～' + LAY.towerClockRect(T1, null).y1 + '，塔門 y ' + LAY.towerDoorRect(T1).y0.toFixed(1) + '～' + LAY.towerDoorRect(T1).y1.toFixed(1))
  // 引擎：CSS 座標的入口 = 互動區換算（含暖光／招牌用的中心）
  const e = new PixelEngine()
  let seed = 4242; e.rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  e.setSize(1280, 640, 1)
  const lay = { items: [{ id: 'tower', kind: 'tower', state: 'placed', x: 568, y: 136 }] }
  e.setLayoutData(ALL, lay)
  const IL = e.layout
  eq(LAY.towerTopLeft(IL).y, -24, 'A 引擎版面：鐘樓頂端 -24')
  const css = e.towerDoorCss(), want = LAY.rectCss(IL, LAY.towerDoorRect(IL))
  for (const k of ['x0', 'x1', 'y0', 'y1']) near(css[k], want[k], 'A 引擎 towerDoorCss ' + k)
  const sc = e.towerSignCss(), sw = LAY.toCss(IL, LAY.towerSignCenter(IL).x, LAY.towerSignCenter(IL).y)
  near(sc.x, sw.x, 'A 招牌中心 x'); near(sc.y, sw.y, 'A 招牌中心 y')
  const hits = e.toolHits(24)
  const wantWin = LAY.growHit(LAY.rectCss(IL, LAY.towerWindowRect(IL)), 24)
  for (const k of ['x0', 'x1', 'y0', 'y1']) near(hits.window[k], wantWin[k], 'A 窗戶點擊區 ' + k)
  ok(hits.clock.y0 >= 0 && hits.door.y0 >= 0, 'A 鐘面與塔門的點擊區都在畫布內')
  // 寵物模擬：鐘樓在最後面，20 秒不丟錯、座標有限、不站進障礙
  const pets = ['d1', 'c1'].map((id, i) => ({ id, species: i ? 'cat' : 'dog', variant: i ? 'orange' : 'shiba', name: id, adoptedAt: 0, heightFactor: 1, weight: 50, satiety: 60, mood: 60, cleanliness: 60, personality: 'calm', lastInteract: 0 }))
  e.sync(pets)
  e.hooks = { requestBath: () => null, wake: () => {}, notify: () => {}, eatAtBowl: () => null, settlePlay: () => {}, addFind: () => false }
  let now = new Date(2026, 10, 19, 12, 0, 0).getTime()
  for (let i = 0; i < 400; i++) { now += 50; e.update(0.05, { nowMs: now, hour: 12, weather: 'sunny', gifts: [] }) }
  for (const a of e.actors.values()) ok(Number.isFinite(a.x) && Number.isFinite(a.y) && !LAY.blockers(IL).some((r) => a.x > r.x0 + 0.5 && a.x < r.x1 - 0.5 && a.y > r.y0 + 0.5 && a.y < r.y1 - 0.5), 'A 寵物座標有限且不在障礙裡 ' + a.id)
}

// ================= B. 25% 規則 =================
const L = mkL()
const tw = L.placement.placed.get('tower')
const ZN = { door: '塔門', sign: '招牌', clock: '鐘面' }
const ZR = { door: LAY.towerDoorRect(L), sign: LAY.towerSignRect(L), clock: LAY.towerClockRect(L, null) }
const WIN = LAY.towerWindowRect(L)
const IDS = { tree: 'tree1', rocks: 'rocks', lamp: 'lamp', kennel: 'kennel', bowls: 'bowls', planter: 'planter', stump: 'stump', mushroom: 'mushroom', catTree: 'catTree' }
const SPRITE_KINDS = Object.keys(IDS)
{
  // 純邏輯的邊界
  for (const [z, r] of Object.entries(ZR)) {
    const { area } = PR.coverStats('lamp', 0, 0, r)
    const limit = Math.floor(area * 0.25)
    ok(!PR.coverExceeds(limit, area), `B ${ZN[z]}：面積 ${area}，蓋 ${limit} 格（${(limit / area * 100).toFixed(2)}%）不算擋住`)
    ok(PR.coverExceeds(limit + 1, area), `B ${ZN[z]}：蓋 ${limit + 1} 格（${((limit + 1) / area * 100).toFixed(2)}%）算擋住`)
    ok(!PR.coverExceeds(0, area), `B ${ZN[z]}：沒蓋住不算`)
    report.push(`${ZN[z]}互動區 ${area} 像素格、上限 ${limit} 格（${(limit / area * 100).toFixed(2)}%）`)
  }
  ok(!PR.coverExceeds(207, 828) && PR.coverExceeds(208, 828), 'B 門洞 828 格：恰好 25% = 207 格可以、208 不行')
  // 在真正的素材上找剛好在邊界的位置
  const found = {}
  for (const z of Object.keys(ZR)) {
    const { area } = PR.coverStats('lamp', 0, 0, ZR[z])
    const limit = Math.floor(area * 0.25)
    for (const kind of SPRITE_KINDS) {
      const id = IDS[kind]
      const rg = PR.placeRange(L, kind)
      for (let y = tw.y; y <= rg.y1; y++) for (let x = rg.x0; x <= rg.x1; x++) {
        const c = PR.coverStats(kind, x, y, ZR[z]).covered
        if (c !== limit && c !== limit + 1) continue
        const slot = c === limit ? 'allow' : 'block'
        if (found[z + slot]) continue
        // 其他互動區也要在限制內（窗戶不能蓋），這樣結果才只取決於這個區
        const P = PL.withMove(L.placement, id, x, y)
        const T = PR.layoutWith(L, P)
        const blk = PR.towerCoverBlock(T, P.placed.get('tower'), P.placed.get(id))
        if (slot === 'allow' && blk) continue
        if (slot === 'block' && !(blk && blk.includes(ZN[z]))) continue
        const r = PR.canPlace(L, id, x, y)
        if (slot === 'allow' && !r.ok) continue
        if (slot === 'block' && r.reason !== 'covers') continue
        found[z + slot] = { kind, id, x, y, c, r }
      }
    }
  }
  // 掃描：其他兩個區都在限制內時，擋不擋只取決於這一區（蓋住格數 > 上限 ⇔ 被擋）；記錄離界線最近的實際格數
  const dominated = {}
  for (const z of Object.keys(ZR)) {
    const { area } = PR.coverStats('lamp', 0, 0, ZR[z])
    const limit = Math.floor(area * 0.25)
    let maxAllowed = -1, minBlocked = Infinity, swept = 0
    for (const kind of SPRITE_KINDS) {
      const id = IDS[kind], rg = PR.placeRange(L, kind)
      for (let y = tw.y; y <= rg.y1; y++) for (let x = rg.x0; x <= rg.x1; x++) {
        const others = Object.keys(ZR).filter((o) => o !== z).every((o) => { const v = PR.coverStats(kind, x, y, ZR[o]); return !PR.coverExceeds(v.covered, v.area) })
        if (!others || PR.coverStats(kind, x, y, WIN).covered > 0) continue
        const c = PR.coverStats(kind, x, y, ZR[z]).covered
        const P = PL.withMove(L.placement, id, x, y)
        const blk = PR.towerCoverBlock(PR.layoutWith(L, P), P.placed.get('tower'), P.placed.get(id))
        swept++
        eq(!!blk, c > limit, `B ${ZN[z]}：${kind} (${x},${y}) 蓋 ${c} 格（上限 ${limit}）→ ${blk ? '擋' : '可'}`)
        if (blk) minBlocked = Math.min(minBlocked, c)
        else maxAllowed = Math.max(maxAllowed, c)
      }
    }
    dominated[z] = { limit, maxAllowed, minBlocked, swept }
    report.push(`${ZN[z]}：上限 ${limit} 格；掃描 ${swept} 個位置，可放的最大蓋住格數 ${maxAllowed}、被擋的最小蓋住格數 ${minBlocked}`)
    ok(maxAllowed <= limit && minBlocked > limit, `B ${ZN[z]}：界線兩側正確（${maxAllowed} ≤ ${limit} < ${minBlocked}）`)
    ok(maxAllowed > 0 && Number.isFinite(minBlocked), `B ${ZN[z]}：兩側都有實際擺放樣本`)
  }
  for (const z of Object.keys(ZR)) {
    const a = found[z + 'allow'], b = found[z + 'block']
    if (!a || !b) { report.push(`${ZN[z]}：沒有蓋住格數剛好等於 ${dominated[z].limit}／${dominated[z].limit + 1} 的實際擺放（素材輪廓每移 1 像素蓋住的格數會跳過界線），改用上面的掃描驗證界線`); continue }
    ok(a, `B ${ZN[z]}：找得到「恰好 25%」且整體合法的實際擺放`)
    ok(b, `B ${ZN[z]}：找得到「多 1 格」被擋下（covers）的實際擺放`)
    ok(a.r.ok, `B ${ZN[z]} 恰好 25%：${a.id} (${a.x},${a.y}) 蓋 ${a.c} 格 → ok`)
    eq(b.r.reason, 'covers', `B ${ZN[z]} 多 1 格：${b.id} (${b.x},${b.y}) 蓋 ${b.c} 格 → covers`)
    ok(b.r.detail.includes(ZN[z]) && b.r.detail.includes('超過 25%'), `B 原因文字說明哪個區、超過 25%：${b.r.detail}`)
    report.push(`${ZN[z]}：${a.id}(${a.x},${a.y}) 蓋 ${a.c} 格可放；${b.id}(${b.x},${b.y}) 蓋 ${b.c} 格被擋（${b.r.detail}）`)
  }
  // 各區各自算、不是總和：一個物件同時蓋住兩個區，各自都 ≤ 25% 就可以（找得到這種位置）
  let multi = null
  for (const kind of SPRITE_KINDS) {
    const id = IDS[kind], rg = PR.placeRange(L, kind)
    for (let y = tw.y; y <= rg.y1 && !multi; y++) for (let x = rg.x0; x <= rg.x1 && !multi; x++) {
      const s = Object.keys(ZR).map((z) => PR.coverStats(kind, x, y, ZR[z]))
      const within = s.every((v) => !PR.coverExceeds(v.covered, v.area))
      const two = s.filter((v) => v.covered > 0).length >= 2
      if (within && two && s.reduce((a, v) => a + v.covered, 0) > 0 && s.reduce((a, v) => a + v.covered / v.area, 0) > 0.25) {
        const r = PR.canPlace(L, id, x, y)
        if (r.ok) multi = { kind, id, x, y, s: s.map((v) => (v.covered / v.area).toFixed(3)) }
      }
    }
  }
  ok(multi, 'B 找得到同時蓋住兩個區、各自 ≤ 25% 但比例相加 > 25% 的合法擺放（證明是各自計算、不是總和）')
  report.push('各區各自算：' + JSON.stringify(multi))
  // 窗戶維持完全不能蓋：目前所有物件的素材都構不到窗戶（掃全部位置 = 0），所以只能驗證沒有誤擋
  let winHits = 0
  for (const kind of SPRITE_KINDS) { const rg = PR.placeRange(L, kind); for (let y = tw.y; y <= rg.y1; y++) for (let x = rg.x0; x <= rg.x1; x++) if (PR.coverStats(kind, x, y, WIN).covered > 0) winHits++ }
  eq(winHits, 0, 'B 目前沒有任何物件、任何位置構得到窗戶（窗戶的嚴格規則在程式裡但現有素材觸發不到）')
  // 嚴格規則的程式路徑：把鐘樓往後放到 y=136，窗戶的相對位置不變，仍然沒有物件構得到
  // 瀏覽器測試 t8 用的兩個部分遮擋位置，同時擺上去仍然合法（塔門 207/828、招牌 86/345，各恰好 25%）
  {
    const L2 = mkL()
    const r1 = PR.canPlace(L2, 'tree1', 524, 201)
    ok(r1.ok, 'B t8 用位置 tree1 (524,201) 合法：' + (r1.ok ? '' : r1.detail))
    LAY.setPlacement(L2, PL.withMove(L2.placement, 'tree1', 524, 201))
    const r2 = PR.canPlace(L2, 'lamp', 598, 188)
    ok(r2.ok, 'B t8 用位置 lamp (598,188) 合法：' + (r2.ok ? '' : r2.detail))
    eq([PR.coverStats('tree', 524, 201, ZR.door).covered, PR.coverStats('lamp', 598, 188, ZR.sign).covered], [205, 82], 'B t8 用位置的蓋住格數 = 205（塔門）、82（招牌）（4.0-R：樹與路燈的輪廓重畫，原本 207、86 恰好 25%）')
  }
  // 貓跳台專用規則沒動：預設貓跳台合法；頂層貓碰到塔門仍然擋下
  ok(PR.canPlace(L, 'catTree', 574, 271).ok, 'B 貓跳台預設位置合法')
  const ctBlocked = []
  for (let y = 180; y <= 260; y += 4) for (let x = 480; x <= 600; x += 4) { const r = PR.canPlace(L, 'catTree', x, y); if (!r.ok && r.reason === 'covers' && r.detail.includes('貓跳台')) ctBlocked.push([x, y]) }
  ok(ctBlocked.length > 0, 'B 貓跳台專用規則仍然會擋（頂層的貓碰到塔門與招牌）：' + ctBlocked.length + ' 個取樣位置')
}

// ================= C. 面積量測（和報告對照） =================
const rep = {
  // 報告 E 欄（舊規則：四個區任何一格被蓋住都擋）、B 25% 欄（只護門洞、25%）
  // 4.0-R：原圖重新套用，素材輪廓重畫，面積跟著改（原本 E: lamp 8865, tree1 10455, kennel 10195, catTree 12303, planter 7013, rocks 6183；B25: lamp 6577, tree1 8801, kennel 8964, catTree 12303, planter 6035）
  // 4.0-B1：狗窩、貓跳台、食盆的輪廓含外殼聯集，不能放的面積變大一點（原本 E kennel 10189、catTree 12266、bowls 6248；B25 kennel 8967、catTree 12266）
  E: { lamp: 8850, tree1: 10438, kennel: 10444, catTree: 12415, planter: 7024, rocks: 6189, bowls: 6303 },
  B25: { lamp: 6580, tree1: 8781, kennel: 9239, catTree: 12415, planter: 6049, rocks: 5922, bowls: 6248 },
}
const CAT = { lamp: 'lamp', tree1: 'tree', kennel: 'kennel', catTree: 'catTree', planter: 'planter', rocks: 'rocks', bowls: 'bowls' }
const towerFoot = PL.footprintAt('tower', tw.x, tw.y)
const area = {}
for (const [id, kind] of Object.entries(CAT)) {
  const rg = PR.placeRange(L, kind)
  const a = { E: 0, EACT: 0, B25: 0, NEW: 0, gap: 0, coverNew: 0, coverOld: 0 }
  const newly = []
  for (let y = rg.y0; y <= rg.y1; y++) for (let x = rg.x0; x <= rg.x1; x++) {
    const gap = hitGap(PL.footprintAt(kind, x, y), towerFoot, PR.MIN_GAP)
    const front = y >= tw.y
    let old = false, oldRep = false, b25 = false, nw = false
    if (front) {
      const zs = [ZR.door, ZR.sign, WIN, ZR.clock]
      old = zs.some((z) => PL.runsHit(kind, x, y, z)) // 舊規則的實際判斷（runsHit：矩形邊界往外取整）
      oldRep = zs.some((z) => PR.coverStats(kind, x, y, z).covered > 0) // 報告量測用的定義（邊界往內取整）
      const d = PR.coverStats(kind, x, y, ZR.door)
      b25 = PR.coverExceeds(d.covered, d.area)
      const P = PL.withMove(L.placement, id, x, y)
      if (old || true) nw = !!PR.towerCoverBlock(PR.layoutWith(L, P), P.placed.get('tower'), P.placed.get(id))
    }
    let cat = false
    if (kind === 'catTree') cat = LAY.catTreeHitsTower(PR.layoutWith(L, PL.withMove(L.placement, 'catTree', x, y)), x, y - LAY.CAT_TREE_H)
    if (gap || oldRep || cat) a.E++
    if (gap || old || cat) a.EACT++
    if (gap || b25 || cat) a.B25++
    if (gap || nw || cat) a.NEW++
    if (gap) a.gap++
    if (nw) a.coverNew++
    if (old) a.coverOld++
    if (old && !nw && !gap && !cat) newly.push([x, y])
  }
  area[id] = { ...a, newly }
  eq(a.E, rep.E[id], `C ${id}：舊規則（報告 E 欄的定義）不能放面積 ${a.E} = 報告 ${rep.E[id]}`)
  eq(a.B25, rep.B25[id], `C ${id}：門洞可蓋 25%（報告 B 25% 欄的定義）不能放面積 ${a.B25} = 報告 ${rep.B25[id]}`)
}
{
  // 新規則（塔門、招牌、鐘面各自 ≤ 25%，窗戶嚴格）的實際面積：鎖定，之後改規則會知道
  const NEW = Object.fromEntries(Object.entries(area).map(([k, v]) => [k, v.NEW]))
  report.push('舊規則的實際判斷（runsHit，邊界往外取整）' + JSON.stringify(Object.fromEntries(Object.entries(area).map(([k, v]) => [k, v.EACT]))))
  report.push('不能放面積：舊規則 ' + JSON.stringify(rep.E) + '；報告 B 25% 欄 ' + JSON.stringify(rep.B25) + '；新規則（實際）' + JSON.stringify(NEW))
  for (const id of Object.keys(area)) {
    ok(area[id].NEW <= area[id].EACT, `C ${id}：新規則（${area[id].NEW}）不比舊規則的實際判斷（${area[id].EACT}）大`)
  }
  globalThis.__NEWAREA = NEW
  eq(NEW, EXPECT_NEW(), 'C 新規則的實際不能放面積（鎖定值）')
}
function EXPECT_NEW() {
  // 實際值（和報告 B 25% 欄不同的原因：報告的 B 25% 欄只保護門洞、不保護招牌與鐘面；這次的規則還保護招牌與鐘面各 25%、窗戶完全不能蓋）
  // 4.0-R：素材輪廓重畫（原本 lamp 7253, tree1 8919, kennel 8972, catTree 12303, planter 6035）
  // 4.0-B1：輪廓含外殼聯集（原本 kennel 8974、catTree 12266）
  return { lamp: 7260, tree1: 8902, kennel: 9240, catTree: 12415, planter: 6049, rocks: 5922, bowls: 6248 }
}

// ================= D. 放寬後新增的位置：連通、座位、原因文字 =================
{
  const tally = {}
  let checked = 0
  for (const [id, kind] of Object.entries(CAT)) {
    const rid = IDS[kind] ?? id
    void rid
    for (const [x, y] of area[id].newly) {
      const r = PR.canPlace(L, id, x, y)
      checked++
      const key = r.ok ? 'ok' : r.reason
      tally[id] = tally[id] ?? {}
      if (key !== 'overlap' && key !== 'covers') tally[id][key] = (tally[id][key] ?? 0) + 1
      const T = PR.layoutWith(L, PL.withMove(L.placement, id, x, y))
      const comps = NAV.hasIsolatedRegion(T)
      // 獨立重算：連通、全部座位、洗澡站位
      const bad = []
      for (const s of LAY.ownedSlots(T)) for (const pur of ['eat', 'sleep', 'shelter']) for (const st of seatsOf(s.id, s, pur)) {
        if (s.id === 'bowls' && pur !== 'eat') continue
        if (s.id !== 'bowls' && pur === 'eat') continue
        if (!NAV.isReachable(T, st.near.x, st.near.y)) bad.push(`${s.id} 的座位旁 (${Math.round(st.near.x)}, ${Math.round(st.near.y)})`)
      }
      const stand = pondStand(T)
      const standBad = !pondStandFound(T) || !NAV.isReachable(T, stand.x, stand.y)
      if (r.ok) {
        ok(!comps && bad.length === 0 && !standBad, `D ${id} (${x},${y}) 新增位置合法 → 獨立重算：連通、座位、洗澡站位都通過`)
      } else if (['overlap', 'covers'].includes(r.reason)) {
        // 和鐘樓無關的其他規則（和別的物件太近、蓋住別的物件的互動區）：原因不能牽涉鐘樓，也不納入「新增位置通過連通與座位」的統計
        ok(!/tower|鐘樓|塔/.test(r.detail), `D ${id} (${x},${y}) 被其他規則擋下（${r.reason}）：${r.detail} — 與鐘樓無關`)
        tally[id].unrelated = (tally[id].unrelated ?? 0) + 1
        continue
      } else {
        ok(['unreachable', 'disconnected'].includes(r.reason), `D ${id} (${x},${y}) 新增位置被擋下的原因只能是連通／座位，實際 ${r.reason}：${r.detail}`)
        if (r.reason === 'unreachable') {
          ok(bad.length > 0 || standBad, `D ${id} (${x},${y}) 回報 unreachable → 獨立重算確實有走不到的座位／站位（${bad.join('、')}${standBad ? ' 洗澡站位' : ''}）`)
          ok(/座位旁 \(-?\d+, -?\d+\) 走不到|洗澡站位走不到/.test(r.detail), `D 原因文字：${r.detail}`)
        } else ok(comps, `D ${id} (${x},${y}) 回報 disconnected → 獨立重算確實有走不到的大區塊`)
        eq(PR.PLACE_REASON_TEXT[r.reason], r.reason === 'unreachable' ? '寵物會走不到座位或洗澡的地方' : '會把草地隔成走不到的區塊', `D 介面文字（${r.reason}）`)
      }
    }
  }
  report.push('放寬後新增位置（舊規則擋、新規則不擋）的完整規則結果：' + JSON.stringify(tally) + `（共 ${checked} 個）`)
  ok(checked > 3000, 'D 檢查的新增位置數量 ' + checked)
}

for (const r of report) console.log(r)
console.log(`v3.9.0 鐘樓放寬與塔門保護測試 ${n} 項全過`)
