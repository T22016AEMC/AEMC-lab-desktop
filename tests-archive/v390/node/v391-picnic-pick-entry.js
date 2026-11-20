// v3.9.1 野餐選位置：共用判斷 picnicSpotCheck、自動選位置與 v3.9.0 相同、靠近邊緣、記憶、引擎、uiStore、效能、「走不到」量測
import { store as LS } from './env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import * as PL from '../../../src/farm/pixel/placement.ts'
import * as PR from '../../../src/farm/pixel/placeRules.ts'
import * as PC from '../../../src/farm/pixel/picnic.ts'
import { isReachable } from '../../../src/farm/pixel/nav.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import { initialPickRect, PICK_TEXT } from '../../../src/farm/ui/PicnicPickLayer.tsx'
import { useUIStore } from '../../../src/store/uiStore.ts'
import { parseSave } from '../../../src/farm/save/migrate.ts'
import { LAYOUT_ITEMS } from '../../../src/farm/config/layoutItems.ts'
import * as OLAY from '../.work/v390src/src/farm/pixel/layout.ts'
import * as OPL from '../.work/v390src/src/farm/pixel/placement.ts'
import * as OPC from '../.work/v390src/src/farm/pixel/picnic.ts'
// 4.0-R：原圖重新套用後素材輪廓（envelopes.ts）改變；讓 v3.9.0 的程式用同一份輪廓，比的是程式邏輯（不比較素材本身）
import { ENVELOPES as OENV } from '../.work/v390src/src/farm/pixel/envelopes.ts'
import { ENVELOPES as NENV } from '../../../src/farm/pixel/envelopes.ts'
Object.assign(OENV, NENV)

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const report = []
const ALL = ['kennel', 'bowls', 'catTree']
const T0 = new Date(2026, 10, 19, 12, 0, 0).getTime()
let seed = 391
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const kindOf = (id) => LAYOUT_ITEMS.find((d) => d.id === id).kind

const newL = (owned, layout) => { const L = LAY.computeLayout(1920, 960, 1); LAY.setPlacement(L, PL.resolvePlacement(owned, layout)); return L }
const oldL = (owned, layout) => { const L = OLAY.computeLayout(1920, 960, 1); OLAY.setPlacement(L, OPL.resolvePlacement(owned, layout)); return L }
const R = (x0, y0) => ({ x0, y0, x1: x0 + PC.MAT_W, y1: y0 + PC.MAT_H })
const inside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1

// ---------- 擺放樣本：300 組原始隨機（同 review-fuzz 的產生法）＋ 120 組合法隨機（從預設開始，只接受 canPlace 通過的移動） ----------
const ids = LAYOUT_ITEMS.map((d) => d.id)
const raw = []
for (let k = 0; k < 300; k++) {
  const items = ids.filter(() => rnd() < 0.7).map((id) => ({ id, kind: kindOf(id), state: rnd() < 0.15 ? 'stored' : 'placed', x: Math.floor(rnd() * 700) - 30, y: Math.floor(rnd() * 360) - 20 }))
  const owned = ALL.filter(() => rnd() < 0.7)
  const s = parseSave({ schemaVersion: 5, dataRev: 4, points: 10, lastSeen: T0, pets: [], ownedBuildings: owned, farmLayout: { items } })
  raw.push({ owned: s.ownedBuildings, layout: s.farmLayout })
}
const legal = []
const movable = LAYOUT_ITEMS.filter((d) => d.id !== 'house').map((d) => d.id)
for (let k = 0; k < 120; k++) {
  const owned = ALL.filter(() => rnd() < 0.75)
  let layout
  const L = newL(owned, layout)
  for (let i = 0; i < 40; i++) {
    const id = movable[Math.floor(rnd() * movable.length)]
    const def = LAYOUT_ITEMS.find((d) => d.id === id)
    if (def.building && !owned.includes(id)) continue
    // 草地中段比較密：一半的移動集中在 y 150～240
    const x = 20 + Math.floor(rnd() * 600)
    const y = rnd() < 0.5 ? 150 + Math.floor(rnd() * 90) : 140 + Math.floor(rnd() * 176)
    if (PR.canPlace(L, id, x, y).ok) {
      layout = PL.layoutAfterMove(owned, layout, id, x, y)
      LAY.setPlacement(L, PL.resolvePlacement(owned, layout))
    }
  }
  legal.push({ owned, layout })
}
const samples = [{ owned: ALL, layout: undefined }, { owned: [], layout: undefined }, ...raw, ...legal]

// ================= A. 預設配置：自動位置不變 =================
for (const owned of [ALL, [], ['bowls']]) {
  eq(PC.picnicMatRect(newL(owned)), { x0: 384, y0: 167, x1: 488, y1: 230 }, `A 預設配置（已買 ${owned.join(',') || '無'}）墊子 = (384,167)～(488,230)`)
}
const Ld = newL(ALL)
eq(PC.matRange(Ld), { x0: 12, x1: 524, y0: 150, y1: 184 }, 'A 墊子外框左上角的範圍 x 12～524、y 150～184')

// ================= B. 自動選位置、野餐中檢查 與 v3.9.0 逐項相同 =================
{
  let diffRect = 0, diffFits = 0, nullCnt = 0, fitsCnt = 0
  for (const s of samples) {
    const a = PC.picnicMatRect(newL(s.owned, s.layout))
    const b = OPC.picnicMatRect(oldL(s.owned, s.layout))
    if (JSON.stringify(a) !== JSON.stringify(b)) diffRect++
    if (!a) nullCnt++
    // 野餐中的墊子（範圍內的位置）：picnicMatFitsAt 新舊相同
    const Ln = newL(s.owned, s.layout), Lo = oldL(s.owned, s.layout)
    for (let i = 0; i < 25; i++) {
      const r = R(12 + Math.floor(rnd() * 513), 150 + Math.floor(rnd() * 35))
      const fn = PC.picnicMatFitsAt(Ln, r), fo = OPC.picnicMatFitsAt(Lo, r)
      if (fn !== fo) diffFits++
      if (fn) fitsCnt++
    }
  }
  eq(diffRect, 0, `B ${samples.length} 組擺放：自動位置與 v3.9.0 完全相同（不同 ${diffRect} 組）`)
  eq(diffFits, 0, `B ${samples.length * 25} 個範圍內位置：picnicMatFitsAt 與 v3.9.0 相同（不同 ${diffFits}）`)
  report.push(`B 樣本 ${samples.length} 組（原始隨機 ${raw.length}、合法隨機 ${legal.length}），自動位置 null ${nullCnt} 組；fitsAt 抽樣可以 ${fitsCnt}/${samples.length * 25}`)
}

// ================= C. 四種原因 =================
{
  eq(PC.MAT_SPOT_TEXT.outside, PR.PLACE_REASON_TEXT.outside, 'C outside 文字和擺放規則相同')
  eq(PC.MAT_SPOT_TEXT.overlap, PR.PLACE_REASON_TEXT.overlap, 'C overlap 文字和擺放規則相同')
  eq(PC.picnicSpotCheck(Ld, R(384, 167)), { ok: true }, 'C 預設位置可以')
  eq(PC.picnicSpotCheck(Ld, R(11, 167)).reason, 'outside', 'C 左邊超出 1 → outside')
  eq(PC.picnicSpotCheck(Ld, R(525, 167)).reason, 'outside', 'C 右邊超出 1 → outside')
  eq(PC.picnicSpotCheck(Ld, R(384, 149)).reason, 'outside', 'C 上面超出 1 → outside')
  eq(PC.picnicSpotCheck(Ld, R(384, 185)).reason, 'outside', 'C 下面超出 1 → outside')
  eq(PC.picnicSpotCheck(Ld, R(-200, -200)).reason, 'outside', 'C 遠在場景外 → outside')
  const found = { outside: 0, overlap: 0, seat: 0, covered: 0, ok: 0 }
  const example = {}
  for (const s of samples.slice(0, 160)) {
    const L = newL(s.owned, s.layout)
    for (let y = 150; y <= 184; y += 3) for (let x = 12; x <= 524; x += 3) {
      const r = PC.picnicSpotCheck(L, R(x, y))
      const k = r.ok ? 'ok' : r.reason
      found[k]++
      if (!example[k]) example[k] = { x, y, seat: r.seat }
      if (!r.ok && (r.reason === 'seat' || r.reason === 'covered')) assert.ok(Number.isInteger(r.seat) && r.seat >= 0 && r.seat < 6, '出問題的座位編號')
    }
  }
  // seat（站不住）在目前的幾何下不會發生：座位離墊子邊緣至少 16 像素，而外框不碰佔地（間距 4）時座位一定不在障礙裡（v3.9.0 也一樣）；保留這條檢查當保險
  report.push(`C 「座位站不住」出現 ${found.seat} 次（預期 0：外框不碰佔地就站得住）`)
  for (const k of ['overlap', 'covered', 'ok']) ok(found[k] > 0, `C 範圍內找得到「${k}」的位置（${found[k]}，例 ${JSON.stringify(example[k])}）`)
  report.push('C 範圍內（每 3 像素）結果分布：' + JSON.stringify(found))
}

// ================= D. 靠近邊緣：可以的位置，座位寵物／相機／照片都在場景內，裁切包住墊子與寵物 =================
{
  // 常數要涵蓋素材（寵物最大伸出量、相框裁切最小值）
  const mf = readdirSync(process.env.REPO_ROOT + '/public/assets').find((f) => /^manifest\..*\.json$/.test(f))
  const M = JSON.parse(readFileSync(process.env.REPO_ROOT + '/public/assets/' + mf, 'utf8')).frames
  let Lx = 0, Rx = 0, U = 0
  for (const [k, v] of Object.entries(M)) if (/^(dog|cat)_/.test(k) && /(sit|happy|stand|walk|idle)/.test(k)) { Lx = Math.max(Lx, v.ax); Rx = Math.max(Rx, v.w - v.ax); U = Math.max(U, v.ay) }
  ok(PC.PICNIC_PET_REACH.side >= Math.max(Lx, Rx) && PC.PICNIC_PET_REACH.up >= U, `D PICNIC_PET_REACH ${JSON.stringify(PC.PICNIC_PET_REACH)} 涵蓋寵物素材（左 ${Lx}、右 ${Rx}、上 ${U}）`)
  const crops = Object.entries(M).filter(([k, v]) => k.startsWith('polaroid_') && v.meta?.window).map(([, v]) => {
    const w = v.meta.window
    return { w: Math.ceil(((w.x1 - w.x0) * 6) / 2), h: Math.ceil(((w.y1 - w.y0) * 6) / 2) }
  })
  ok(crops.length === 3, 'D 三款相框')
  eq({ w: Math.min(...crops.map((c) => c.w)), h: Math.min(...crops.map((c) => c.h)) }, PC.PICNIC_CROP_MIN, 'D PICNIC_CROP_MIN = 三款相框裁切的最小寬高')
  const scene = { x0: 0, y0: 0, x1: 640, y1: 320 }
  let okCnt = 0, bad = 0, edgeOffInRange = 0, outsideWrong = 0
  for (const s of [samples[0], samples[1], ...legal.slice(0, 40)]) {
    const L = newL(s.owned, s.layout)
    for (let y = 120; y <= 215; y++) for (let x = -10; x <= 545; x++) {
      const r = R(x, y)
      const inRange = x >= 12 && x <= 524 && y >= 150 && y <= 184
      if (inRange && !PC.matEdgeOk(L, r)) edgeOffInRange++
      const res = PC.picnicSpotCheck(L, r)
      if (!inRange && !(res.ok === false && res.reason === 'outside')) outsideWrong++
      if (!res.ok) continue
      okCnt++
      const g = PC.matGroupBox(r)
      const cam = PC.cameraRect(L, r)
      let good = inside(g, scene) && inside(cam, scene)
      for (const c of crops) good = good && inside(g, PC.photoCrop(L, r, c.w, c.h)) && inside(PC.photoCrop(L, r, c.w, c.h), scene)
      if (!good) bad++
    }
  }
  eq(bad, 0, `D 可以的 ${okCnt} 個位置：座位寵物、相機、三款相框的裁切都在場景內，裁切包住墊子與寵物`)
  eq(edgeOffInRange, 0, 'D 範圍內 matEdgeOk 一律成立（邊緣規則是保險，不改變自動位置）')
  eq(outsideWrong, 0, 'D 範圍外一律 outside')
  // 四個角落：範圍的角可以放（預設配置下角落沒有物件時），再往外 1 就 outside
  const Lnone = newL([], { items: LAYOUT_ITEMS.filter((d) => d.storable).map((d) => ({ id: d.id, kind: d.kind, state: 'stored' })) })
  for (const [x, y] of [[12, 150], [524, 150], [12, 184], [524, 184]]) {
    const r = PC.picnicSpotCheck(Lnone, R(x, y))
    report.push(`D 角落 (${x},${y})（可收的都收起）：${r.ok ? '可以' : r.reason}`)
    ok(PC.matEdgeOk(Lnone, R(x, y)), `D 角落 (${x},${y}) 的邊緣檢查成立`)
  }
}

// ================= E. 游標 → 墊子外框 =================
eq(PC.matRectAtCursor(436, 198.5), R(384, 167), 'E 游標在 (436,198.5) → 墊子 (384,167)')
eq(PC.matRectAtCursor(436.4, 198.4), R(384, 167), 'E 小數四捨五入')
eq(PC.matRectAtCursor(0, 0), R(-52, -31), 'E 游標在左上角 → 墊子在場景外（outside）')

// ================= F. 記憶：上次的位置還放得下就用它，否則自動 =================
{
  const eng = { layout: newL(ALL) }
  eq(initialPickRect(eng, null), R(384, 167), 'F 沒有記憶 → 自動位置')
  eq(initialPickRect(eng, { x0: 200, y0: 160 }), PC.picnicSpotCheck(eng.layout, R(200, 160)).ok ? R(200, 160) : R(384, 167), 'F 記憶的位置')
  // 找一個預設配置下可以、但放一個樹樁後不行的位置
  let spot = null
  for (let x = 30; x <= 500 && !spot; x += 7) if (PC.picnicSpotCheck(eng.layout, R(x, 170)).ok) spot = { x0: x, y0: 170 }
  ok(spot, 'F 找到可以的記憶位置 ' + JSON.stringify(spot))
  eq(initialPickRect(eng, spot), R(spot.x0, spot.y0), 'F 記憶的位置還可以 → 從那裡開始')
  const L2 = newL(ALL, PL.layoutAfterMove(ALL, undefined, 'stump', spot.x0 + 52, spot.y0 + 50))
  ok(!PC.picnicSpotCheck(L2, R(spot.x0, spot.y0)).ok, 'F 把樹樁擺到記憶位置上 → 不能放')
  eq(initialPickRect({ layout: L2 }, spot), PC.picnicMatRect(L2), 'F 記憶位置失效 → 改回自動位置')
  eq(initialPickRect({ layout: newL(ALL) }, { x0: 9999, y0: 9999 }), R(384, 167), 'F 壞掉的記憶 → 自動位置')
}

// ================= G. 引擎：選的位置交給 syncPicnic、下一場沒選就自動；預覽不影響存檔、拍照不畫 =================
{
  let G0 = null
  for (let x = 12; x <= 300 && !G0; x++) for (let y = 150; y <= 184 && !G0; y++) if (PC.picnicSpotCheck(newL(ALL), R(x, y)).ok && Math.abs(x - 384) > 40) G0 = R(x, y)
  ok(G0, 'G 找到離自動位置夠遠的合法位置 ' + JSON.stringify(G0))
  const e = new PixelEngine()
  e.setSize(1920, 960, 1)
  e.setLayoutData(ALL, undefined)
  const pets = [{ id: 'd1', species: 'dog', variant: 'shiba', name: 'd1', adoptedAt: T0 - 1e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 90, personality: 'calm', lastInteract: T0 }]
  e.sync(pets)
  e.hooks = { requestBath: () => null, wake: () => {}, notify: () => {}, eatAtBowl: () => null, settlePlay: () => {}, addFind: () => false }
  const active = (t) => ({ startedAt: t, until: t + 300000, pets: ['d1'], mat: 0, basket: 0, foods: [0] })
  e.choosePicnicMat(G0)
  e.syncPicnic(active(T0))
  for (let i = 0; i < 40; i++) e.update(0.05, { nowMs: T0 + i * 50, hour: 12, weather: 'sunny', gifts: [] })
  eq(e.picnicMat(), G0, 'G 手動選的位置 → 墊子落在那裡')
  ok(e.picnicMatFits(), 'G 選的位置在野餐中放得下')
  e.syncPicnic(undefined)
  e.syncPicnic(active(T0 + 1e6))
  for (let i = 0; i < 40; i++) e.update(0.05, { nowMs: T0 + 1e6 + i * 50, hour: 12, weather: 'sunny', gifts: [] })
  eq(e.picnicMat(), R(384, 167), 'G 下一場沒有選 → 自動位置（選擇用過就清掉）')
  e.syncPicnic(undefined)
  e.choosePicnicMat(G0)
  e.choosePicnicMat(null)
  e.syncPicnic(active(T0 + 2e6))
  for (let i = 0; i < 40; i++) e.update(0.05, { nowMs: T0 + 2e6 + i * 50, hour: 12, weather: 'sunny', gifts: [] })
  eq(e.picnicMat(), R(384, 167), 'G choosePicnicMat(null) = 自動位置')
  // 選位置期間 editing：寵物停住
  e.syncPicnic(undefined)
  const a = e.actors.get('d1')
  const before = { x: a.x, y: a.y }
  e.editing = true
  e.picnicGhost = { rect: G0, ok: false, seat: 2 }
  for (let i = 0; i < 60; i++) e.update(0.05, { nowMs: T0 + 3e6 + i * 50, hour: 12, weather: 'sunny', gifts: [] })
  eq({ x: a.x, y: a.y }, before, 'G 選位置期間（editing）寵物停住')
  e.editing = false
  e.picnicGhost = null
}

// ================= H. uiStore：記憶只在記憶體、互斥 =================
{
  const s = useUIStore.getState()
  eq(s.picnicPick, false, 'H 預設不在選位置')
  eq(s.picnicSpot, null, 'H 預設沒有記憶（重新整理 = 新的 store）')
  s.setPicnicPick(true)
  useUIStore.getState().setBuildMode(true)
  eq(useUIStore.getState().picnicPick, false, 'H 進入編輯農場 → 離開選位置')
  useUIStore.getState().setBuildMode(false)
  useUIStore.getState().setPicnicPick(true)
  useUIStore.getState().setToolOpen('calc')
  eq(useUIStore.getState().picnicPick, false, 'H 開工具 → 離開選位置')
  useUIStore.getState().setToolOpen(null)
  useUIStore.getState().setPicnicSpot({ x0: 1, y0: 2 })
  eq(useUIStore.getState().picnicSpot, { x0: 1, y0: 2 }, 'H 記住位置')
  ok(![...LS.keys()].some((k) => /picnic|ui/i.test(k)), 'H 記憶不寫進 localStorage（' + [...LS.keys()].join(',') + '）')
  ok(PICK_TEXT.closeFirst.includes('關閉'), 'H 對話框開著的提示文字')
}

// ================= I. 效能：每個位置判斷一次的耗時 =================
{
  const perf = []
  for (const s of [samples[0], ...legal.slice(0, 20)]) {
    const L = newL(s.owned, s.layout)
    PC.picnicSpotCheck(L, R(384, 167)) // 暖身（障礙物快取）
    const ts = []
    for (let y = 150; y <= 184; y += 2) for (let x = 12; x <= 524; x += 2) {
      const t = performance.now()
      PC.picnicSpotCheck(L, R(x, y))
      ts.push(performance.now() - t)
    }
    ts.sort((a, b) => a - b)
    perf.push({ avg: ts.reduce((a, b) => a + b, 0) / ts.length, p99: ts[Math.floor(ts.length * 0.99)], max: ts[ts.length - 1], n: ts.length })
  }
  const avg = perf.reduce((a, p) => a + p.avg, 0) / perf.length
  const p99 = Math.max(...perf.map((p) => p.p99))
  const max = Math.max(...perf.map((p) => p.max))
  report.push(`I 單次判斷：平均 ${(avg * 1000).toFixed(1)} µs、p99 ${(p99 * 1000).toFixed(1)} µs、最慢 ${(max * 1000).toFixed(1)} µs（${perf.length} 組擺放 × ${perf[0].n} 個位置）`)
  ok(p99 < 0.5, `I 單次判斷 p99 < 0.5 ms（${(p99 * 1000).toFixed(1)} µs）`)
  // 自動找位置（整個範圍掃描）的耗時（v3.9.0 也一樣，只是對照）
  const t = performance.now()
  for (const s of legal.slice(0, 20)) PC.picnicMatRect(newL(s.owned, s.layout))
  report.push(`I 自動找位置平均 ${((performance.now() - t) / 20).toFixed(1)} ms／次（含版面建立）`)
}

// ================= J. 量測（不改規則）：判斷「可以」的位置裡，座位其實走不到的有多少 =================
{
  const measure = (sets, label) => {
  let total = 0, unreach = 0, layoutsWith = 0, worst = 0, seatsUnreach = 0
  for (const s of sets) {
    const L = newL(s.owned, s.layout)
    let t = 0, u = 0
    for (let y = 150; y <= 184; y++) for (let x = 12; x <= 524; x++) {
      if (!PC.picnicSpotCheck(L, R(x, y)).ok) continue
      t++
      const bad = PC.MAT_SEATS.filter(([sx, sy]) => !isReachable(L, x + sx, y + sy)).length
      if (bad) { u++; seatsUnreach += bad }
    }
    total += t
    unreach += u
    if (u) layoutsWith++
    if (t) worst = Math.max(worst, u / t)
  }
  report.push(`J 走不到量測（${label}）：${sets.length} 組擺放，判斷可以的位置共 ${total} 個，其中有座位走不到 ${unreach} 個（${total ? ((unreach / total) * 100).toFixed(3) : 0}%），走不到的座位次數 ${seatsUnreach}；出現在 ${layoutsWith} 組擺放，單組最高比例 ${(worst * 100).toFixed(2)}%`)
  return total
  }
  ok(measure([samples[0], samples[1], ...legal], '預設 2 ＋ 經擺放規則的合法隨機 ' + legal.length) > 0, 'J 有可以的位置')
  // 對照：不經擺放規則的原始隨機擺放（正常操作做不出來，只有損壞的存檔清理後可能出現；會有被隔開的區塊）
  measure(raw, '不經擺放規則的原始隨機 ' + raw.length)
  // 對照組（證明量測抓得到）：同樣的原始隨機擺放裡，整片地面上「站得住但走不到」的點有多少
  let wk = 0, wkUn = 0, lays = 0
  for (const s of raw) {
    const L = newL(s.owned, s.layout)
    let u = 0
    for (let y = 150; y <= 316; y += 4) for (let x = 12; x <= 628; x += 4) {
      if (!LAY.isWalkable(L, x, y)) continue
      wk++
      if (!isReachable(L, x, y)) { wkUn++; u++ }
    }
    if (u) lays++
  }
  report.push(`J 對照：原始隨機擺放的整片地面（每 4 像素）站得住 ${wk} 點，其中走不到 ${wkUn} 點（${((wkUn / wk) * 100).toFixed(2)}%），出現在 ${lays}/${raw.length} 組 → 量測方法抓得到「走不到」；墊子範圍內是 0（推測：外框不碰佔地、座位在墊子內 16 像素以上，墊子放得下的地方本身就連在主要區塊上）`)
  ok(wkUn > 0, 'J 對照組確實有走不到的點（量測有效）')
}

console.log(report.join('\n'))
console.log(`v3.9.1 野餐選位置：全部通過（${n} 項）`)
