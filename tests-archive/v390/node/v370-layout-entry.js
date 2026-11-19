// v3.7.0 版面測試：17 種視窗 × 建築（無／全買）— 四個點擊區存在、夠大、不重疊；公佈欄不擋水池、住家、鐘樓、建築；
// 洗澡通道、建築空位、障礙、場景物件與 v3.6.3 完全相同（和 v3.6.2/3 的 layout.ts 逐項比對）
import { pondStand as __pondStand } from '../../../src/farm/pixel/reach.ts'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import * as OLD from '../.work/v362src/src/farm/pixel/layout.ts'
import * as PL from '../../../src/farm/pixel/placement.ts'
import { POCKET_MAX_CELLS } from '../../../src/farm/pixel/nav.ts'
import { TOOLS } from '../../../src/config/tools.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const MENU = 28
const SZ17 = [[1920, 900, 1], [1920, 930, 1], [1920, 950, 1], [1900, 1000, 1.25], [1920, 1000, 1], [1920, 1120, 1], [1536, 730, 1], [1536, 864, 1], [1440, 780, 1], [1366, 650, 1], [1280, 620, 1], [1280, 720, 1], [1024, 768, 1], [2560, 1300, 1], [2560, 1440, 1], [1536, 730, 1.25], [1920, 930, 1.25]]
const DIR = (process.env.REPO_ROOT + '/public/assets/')
const man = JSON.parse(readFileSync(DIR + readdirSync(DIR).find((f) => /^manifest\..*\.json$/.test(f)), 'utf8'))
const CLOCKS = ['clocktower', 'clocktower_open', 'clocktower_gold', 'clocktower_open_gold'].map((k) => [k, man.frames[k].meta.clock])
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
const rows = []

// 素材尺寸與常數一致
eq([man.frames.board.w, man.frames.board.h], [LAY.BOARD_W, LAY.BOARD_H], '公佈欄尺寸和 manifest 一致')
eq(man.frames.board.meta.board, LAY.BOARD_GREEN, '黑板綠色範圍和 manifest 一致')
for (const k of ['tool_calc', 'tool_timer', 'tool_board']) eq([man.frames[k].w, man.frames[k].h], [48, 48], k + ' 48×48')
eq(man.atlases.tools !== undefined, true)
eq(LAY.TOWER_CLOCK_FALLBACK, man.frames.clocktower.meta.clock, '鐘面備用值 = clocktower 的 meta.clock')

for (const [vw, vh, d] of SZ17) {
  for (const owned of [[], ['kennel', 'bowls', 'catTree']]) {
    const tag = `${vw}×${vh}@${d} ${owned.length ? '全買' : '沒買'}`
    const L = LAY.computeLayout(Math.round(vw * d), Math.round((vh - MENU) * d), d)
    LAY.setPlacement(L, PL.defaultPlacement(owned)) // v3.9.0
    // v3.9.0：場景固定 640×320，舊版對照改用 v3.6.2 在 1920×960 的版面（剛好也是 640×320）
    const O = OLD.computeLayout(1920, 960, 1)
    O.owned = new Set(owned)
    // ---- 1. 和 v3.6.3 完全相同的部分 ----
    // v3.9.0：洗澡通道、障礙（改成腳下佔地）、寵物活動範圍（整片地面）、野餐墊空位是刻意改的，不再比對
    eq(__pondStand(L), OLD.pondStand(O), tag + ' 洗澡站位不變')
    eq(LAY.buildingSlots(L), OLD.buildingSlots(O).filter((s) => s.id !== 'picnicMat'), tag + ' 三個建築位置不變')
    eq(LAY.sceneObjects(L).map((o) => ({ key: o.key, x: o.x, y: o.y })), OLD.sceneObjects(O), tag + ' 場景物件位置不變')
    // v3.9.0：buildingAvailability 已拿掉（場景固定，三個建築一定擺得下）
    // ---- 2. 公佈欄的位置 ----
    const b = LAY.boardRect(L)
    eq(b, { x0: 48, x1: 112, y0: L.farBottom - LAY.BOARD_H, y1: L.farBottom }, tag + ' 公佈欄 x 48～112、腳底在草地上緣')
    ok(b.y0 >= 0 && b.x0 >= 0 && b.x1 <= L.W, tag + ' 公佈欄整個在畫面內')
    const pd = LAY.pondPos(L)
    const pondBox = { x0: pd.x - LAY.POND_AX, x1: pd.x - LAY.POND_AX + LAY.POND_W, y0: pd.y - LAY.POND_H, y1: pd.y }
    ok(!overlap(b, pondBox) && pondBox.y0 - b.y1 >= 1, tag + ' 不擋水池（在水池上面，間隔 ' + (pondBox.y0 - b.y1) + '）')
    ok(!overlap(b, { x0: L.house.x0, x1: L.house.x1, y0: L.house.baseY - LAY.HOUSE_H, y1: L.house.baseY }), tag + ' 不擋住家')
    const tt = LAY.towerTopLeft(L)
    ok(!overlap(b, { x0: tt.x, x1: tt.x + LAY.TOWER_W, y0: tt.y, y1: tt.y + LAY.TOWER_H }), tag + ' 不擋鐘樓')
    const strip = null // v3.9.0：洗澡通道取消
    if (strip) ok(!overlap(b, strip) && b.x1 < strip.x0, tag + ' 不碰洗澡通道')
    for (const s of LAY.buildingSlots(L)) ok(!overlap(b, LAY.slotBox(s)), tag + ' 不碰建築空位 ' + s.id)
    for (const o of LAY.sceneObjects(L)) {
      if (o.key === 'pond') continue
      const sz = o.key === 'tree' ? [LAY.TREE_W, LAY.TREE_H] : o.key === 'clocktower' ? [LAY.TOWER_W, LAY.TOWER_H] : o.key === 'lamp' ? [LAY.LAMP_W, LAY.LAMP_H] : LAY.DECOR_SIZE[o.key]
      ok(!overlap(b, { x0: o.x - sz[0] / 2, x1: o.x + sz[0] / 2, y0: o.y - sz[1], y1: o.y }), tag + ' 不碰 ' + o.key)
    }
    const pb = LAY.petBounds(L)
    ok(b.y1 <= pb.y0 - LAY.BACK_MARGIN, tag + ' 在寵物活動範圍之上（寵物走不到）')
    // 和有沒有買建築無關
    const L2 = LAY.computeLayout(Math.round(vw * d), Math.round((vh - MENU) * d), d)
    eq(LAY.boardRect(L2), b, tag + ' 位置和建築購買無關')
    // ---- 3. 四個點擊區：存在、至少 24 CSS 像素、彼此不重疊、在畫布內；四種鐘樓圖都檢查 ----
    const cssW = L.backW / d, cssH = L.backH / d
    for (const [ck, clock] of CLOCKS) {
      const h = LAY.toolHitRects(L, clock, TOOLS.minHitCss)
      const names = ['window', 'clock', 'door', 'board']
      for (const k of names) {
        const r = h[k]
        ok(r.x1 - r.x0 >= (k === 'door' ? 20 : TOOLS.minHitCss) - 1e-9 && r.y1 - r.y0 >= (k === 'door' ? 20 : TOOLS.minHitCss) - 1e-9, `${tag} ${ck} ${k} 夠大 ${(r.x1 - r.x0).toFixed(1)}×${(r.y1 - r.y0).toFixed(1)}`)
        ok(r.x0 >= 0 && r.y0 >= 0 && r.x1 <= cssW + 0.5 && r.y1 <= cssH + 0.5, `${tag} ${ck} ${k} 在畫布內`)
      }
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) ok(!overlap(h[names[i]], h[names[j]]), `${tag} ${ck} ${names[i]} 與 ${names[j]} 不重疊`)
      // 窗戶點擊區包住窗戶的畫面、鐘面點擊區包住鐘面（含金框）
      const wv = LAY.rectCss(L, LAY.towerWindowRect(L)), cv = LAY.rectCss(L, LAY.towerClockRect(L, clock))
      ok(h.window.x0 <= wv.x0 + 1e-9 && h.window.x1 >= wv.x1 - 1e-9 && h.window.y0 <= wv.y0 + 1e-9 && h.window.y1 >= wv.y1 - 1e-9, tag + ' 窗戶點擊區包住窗戶')
      ok(h.clock.x0 <= cv.x0 + 1e-9 && h.clock.x1 >= cv.x1 - 1e-9 && h.clock.y0 <= cv.y0 + 1e-9 && h.clock.y1 >= cv.y1 - 1e-9, tag + ' 鐘面點擊區包住鐘面')
      eq(h.door, LAY.rectCss(L, LAY.towerDoorRect(L)), tag + ' 塔門範圍沿用原本的')
      if (ck === 'clocktower' && owned.length) rows.push(`${tag.padEnd(22)} S=${L.S} ${L.W}×${L.H} 窗戶 ${fmt(h.window)} 鐘面 ${fmt(h.clock)} 塔門 ${fmt(h.door)} 公佈欄 ${fmt(h.board)}`)
    }
    // ---- 4. 貓跳台（含睡在頂層的貓）不碰窗戶、鐘面的點擊區（點擊區疊在畫布上，會擋住點貓）----
    const ct = LAY.buildingSlots(L).find((s) => s.id === 'catTree')
    if (ct && owned.length) {
      const h = LAY.toolHitRects(L, CLOCKS[0][1], TOOLS.minHitCss)
      const top = ct.y - ct.h
      for (let i = 0; i < LAY.CAT_TREE_ENVELOPE.length; i++) {
        const [lo, hi] = LAY.CAT_TREE_ENVELOPE[i]
        if (hi <= lo) continue
        const y = top + LAY.CAT_TREE_ENVELOPE_ROW0 + i
        const r = LAY.rectCss(L, { x0: ct.x + lo, x1: ct.x + hi, y0: y, y1: y + 1 })
        ok(!overlap(r, h.window) && !overlap(r, h.clock), tag + ' 貓跳台與頂層貓不碰窗戶、鐘面點擊區')
      }
    }
  }
}
function fmt(r) { return `(${Math.round(r.x0)},${Math.round(r.y0)}) ${Math.round(r.x1 - r.x0)}×${Math.round(r.y1 - r.y0)}` }
console.log(rows.join('\n'))
console.log(`v3.7.0 版面測試 ${n} 項全過`)
