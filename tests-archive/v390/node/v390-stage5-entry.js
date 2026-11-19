// v3.9.0 第五階段：擺設模式的純邏輯（點選、門檻、放開判斷、快捷鍵、存檔動作）
import { store } from './env-shim.js'
import assert from 'node:assert/strict'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import * as PL from '../../../src/farm/pixel/placement.ts'
import * as PR from '../../../src/farm/pixel/placeRules.ts'
import * as ED from '../../../src/farm/pixel/editDrag.ts'
import { isFarmHotkey, isTyping } from '../../../src/farm/ui/farmHotkey.ts'
import { useFarmStore } from '../../../src/farm/store/farmStore.ts'
import { parseSave } from '../../../src/farm/save/migrate.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const ALL = ['kennel', 'bowls', 'catTree']
const mkL = (owned = ALL, layout = null) => { const L = LAY.computeLayout(1920, 960, 1); LAY.setPlacement(L, PL.resolvePlacement(owned, layout)); return L }

// ---- 門檻 ----
eq(ED.CLICK_SLOP_CSS, 4, '點與拖的門檻 4 CSS 像素')
ok(!ED.isDragMove(2, 2) && !ED.isDragMove(4, 0) && !ED.isDragMove(0, -4), '移動 ≤ 4 像素 = 點一下')
ok(ED.isDragMove(4.1, 0) && ED.isDragMove(3, 3) && ED.isDragMove(-5, 0), '移動 > 4 像素 = 拖曳')

// ---- 點選：不透明像素、最上層 ----
{
  const L = mkL()
  const P = L.placement
  eq(ED.pickObject(P, 171, 290), 'lamp', '點燈桿 → 路燈')
  eq(ED.pickObject(P, 76, 250), 'house', '點住家牆面 → 住家')
  eq(ED.pickObject(P, 320, 60), null, '點天空 → 沒有')
  eq(ED.pickObject(P, 600, 200), null, '點空草地 → 沒有')
  // 透明處：住家素材外框左上角是透明的（屋頂斜邊外）
  eq(ED.pickObject(P, 8, 182), 'pond', '點住家素材外框內的透明處 → 不會抓到住家，抓到後面的池塘')
  // 重疊時抓最上層：路燈（腳底 308）畫在狗窩（271）前面；兩者素材重疊處抓到路燈
  let overlap = null
  for (let x = 176; x < 200 && !overlap; x++) for (let y = 230; y < 300 && !overlap; y++) if (PL.envCovers('lamp', 171, 308, x, y) && PL.envCovers('kennel', 226, 271, x, y)) overlap = [x, y]
  if (overlap) eq(ED.pickObject(P, ...overlap), 'lamp', '路燈與狗窩重疊處 → 抓到前面的路燈 ' + overlap)
  // 住家與池塘重疊（屋頂蓋住池塘下緣）：抓到住家
  let hp = null
  for (let x = 14; x < 100 && !hp; x++) for (let y = 180; y < 217 && !hp; y++) if (PL.envCovers('house', 76, 314, x, y) && PL.envCovers('pond', 57, 217, x, y)) hp = [x, y]
  ok(hp && ED.pickObject(P, ...hp) === 'house', '住家屋頂蓋住池塘的地方 → 抓到住家 ' + hp)
}

// ---- 放開的判斷 ----
{
  const L = mkL()
  const d = ED.beginSceneDrag(L.placement, 'lamp', 171, 290)
  eq(ED.footAt(d, 171, 290), { x: 171, y: 308 }, '抓住的點不動 → 腳底不變')
  eq(ED.footAt(d, 471.4, 282.6), { x: 471, y: 301 }, '腳底 = 指標 + 抓點差，取整數')
  eq(ED.dropDecision(L, d, { x: 171, y: 308 }, false), { kind: 'cancel' }, '放回原位 → 取消')
  eq(ED.dropDecision(L, d, { x: 470, y: 300 }, false), { kind: 'place', x: 470, y: 300 }, '合法 → 擺上去')
  const bad = ED.dropDecision(L, d, { x: 226, y: 271 }, false)
  eq(bad.kind, 'revert', '和狗窩重疊 → 退回')
  eq(bad.reason, PR.PLACE_REASON_TEXT.overlap, '退回原因用擺放規則的文字')
  eq(ED.dropDecision(L, d, null, true), { kind: 'store' }, '路燈拖到庫存列 → 收進庫存')
  const dh = ED.beginSceneDrag(L.placement, 'house', 76, 250)
  eq(ED.dropDecision(L, dh, null, true), { kind: 'revert', reason: '住家不能收進倉庫' }, '住家拖到倉庫列 → 退回並說明')
  for (const id of ['tower', 'pond', 'board']) eq(ED.dropDecision(L, ED.beginSceneDrag(L.placement, id, 0, 0), null, true).kind, 'revert', id + ' 拖到庫存列 → 退回')
  // 從庫存拖出
  const di = ED.beginInventoryDrag(L.placement, 'coral')
  ok(di && di.source === 'inventory' && di.grabY > 0, '從庫存拖出：指標在素材中央')
  eq(ED.beginInventoryDrag(L.placement, 'lamp'), null, '不在庫存的不能從庫存拖')
  eq(ED.dropDecision(L, di, null, true), { kind: 'cancel' }, '從庫存拖出又放回庫存列 → 取消')
  eq(ED.dropDecision(L, di, { x: 330, y: 230 }, false), { kind: 'place', x: 330, y: 230 }, '從庫存拖到合法位置 → 擺上去')
  eq(ED.dropDecision(L, di, { x: 76, y: 314 }, false).kind, 'revert', '從庫存拖到住家上 → 留在庫存（退回）')
  eq(ED.dropDecision(L, di, null, false), { kind: 'cancel' }, '拖出場景外放開 → 取消')
}

// ---- 快捷鍵 E ----
{
  const k = (key, extra = {}) => ({ key, ctrlKey: false, altKey: false, metaKey: false, repeat: false, isComposing: false, target: { tagName: 'BODY' }, ...extra })
  ok(isFarmHotkey(k('e'), false) && isFarmHotkey(k('E'), false), 'e／E 觸發')
  ok(!isFarmHotkey(k('e'), true), '有對話框或視窗開著 → 不觸發')
  for (const m of ['ctrlKey', 'altKey', 'metaKey', 'repeat', 'isComposing']) ok(!isFarmHotkey(k('e', { [m]: true }), false), m + ' → 不觸發')
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) ok(!isFarmHotkey(k('e', { target: { tagName: tag } }), false), '焦點在 ' + tag + ' → 不觸發')
  ok(!isFarmHotkey(k('e', { target: { tagName: 'DIV', isContentEditable: true } }), false), '可編輯內容 → 不觸發')
  ok(!isFarmHotkey(k('F4'), false) && !isFarmHotkey(k('r'), false), '其他鍵（含 F4）不觸發')
  ok(!isTyping(null) && isTyping({ tagName: 'textarea' }), 'isTyping')
}

// ---- 存檔動作 ----
{
  const T0 = new Date(2026, 10, 19, 10).getTime()
  const base = parseSave({ schemaVersion: 5, dataRev: 4, points: 100, lastSeen: T0, lastDailyClaim: '2026-11-19', gifts: { date: '2026-11-19', count: 0 }, nextPetId: 2, createdAt: T0, pets: [{ id: 'p1', species: 'dog', variant: 'shiba', name: 'a', adoptedAt: T0, heightFactor: 1, weight: 50, satiety: 50, mood: 50, cleanliness: 50, personality: 'calm', lastInteract: T0 }], ownedBuildings: ['bowls'], earning: {}, bowl: { date: '2026-11-19', used: 1 }, collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} } })
  useFarmStore.setState({ save: base })
  const st = () => useFarmStore.getState()
  st().setFarmLayout({ items: [{ id: 'lamp', kind: 'lamp', state: 'placed', x: 470, y: 300 }] })
  eq(st().save.farmLayout, { items: [{ id: 'lamp', kind: 'lamp', state: 'placed', x: 470, y: 300 }] }, 'setFarmLayout 寫入')
  eq([st().save.ownedBuildings, st().save.bowl, st().save.points], [['bowls'], base.bowl, 100], 'setFarmLayout 不動已購買、食盆份量、金幣')
  st().setFarmLayout({ items: [] })
  ok(!('farmLayout' in st().save), '全部預設 → 拿掉欄位')
  st().setFarmLayout({ items: [{ id: 'coral', kind: 'coral', state: 'placed', x: 330, y: 230 }, { id: 'lamp', kind: 'lamp', state: 'stored' }] })
  st().restoreDefaultLayout()
  ok(!('farmLayout' in st().save), '還原預設 → 拿掉擺放紀錄')
  eq([...PL.resolvePlacement(st().save.ownedBuildings, st().save.farmLayout).stored].sort(), ['bush', 'coral', 'planter', 'tall_grass'], '還原後：花槽、珊瑚、灌木、高草叢在庫存（場上的珊瑚也收回）')
  ok(PL.resolvePlacement(st().save.ownedBuildings, st().save.farmLayout).placed.get('lamp').x === 171, '還原後：路燈在預設位置')
  // 購買：storeIt
  eq(st().buyBuilding('kennel', true), null, '買狗窩（預設位置被佔 → 放進庫存）')
  ok(st().save.ownedBuildings.includes('kennel') && st().save.points === 80 && st().save.farmLayout.items.some((it) => it.id === 'kennel' && it.state === 'stored'), '已購買、扣 20、擺放紀錄 = 庫存')
  ok(st().buyBuilding('kennel', false).includes('已經買過'), '收進庫存的狗窩不能再買')
  eq(st().buyBuilding('catTree', false), null, '買貓跳台（預設位置空著）')
  ok(!st().save.farmLayout.items.some((it) => it.id === 'catTree'), '預設位置空著 → 不寫擺放紀錄（擺在預設位置）')
  // 「預設位置被佔」的判斷（BuildLayer 用的算法）：珊瑚擺在狗窩的預設位置
  const L = mkL(['bowls'], { items: [{ id: 'coral', kind: 'coral', state: 'placed', x: 226, y: 266 }] })
  const T = PR.layoutWith(L, PL.resolvePlacement(['bowls', 'kennel'], { items: [{ id: 'coral', kind: 'coral', state: 'placed', x: 226, y: 266 }] }))
  eq(PR.canPlace(T, 'kennel', 226, 271).ok, false, '珊瑚佔住狗窩的預設位置 → 判斷為被佔')
  const T2 = PR.layoutWith(L, PL.resolvePlacement(['bowls', 'kennel'], null))
  eq(PR.canPlace(T2, 'kennel', 226, 271).ok, true, '沒被佔 → 可以直接擺')
}

// ---- 引擎：擺設模式暫停、拖曳預覽不改真的擺放、拖起建築時座位上的寵物下來 ----
{
  const e = new PixelEngine()
  e.setSize(1920, 960, 1)
  e.setLayoutData(ALL, undefined)
  const T0 = new Date(2026, 10, 19, 23, 30).getTime()
  e.sync(['d1', 'd2'].map((id) => ({ id, species: 'dog', variant: 'shiba', name: id, adoptedAt: T0 - 9e8, heightFactor: 1, weight: 50, satiety: 90, mood: 50, cleanliness: 90, personality: 'calm', lastInteract: T0 })))
  e.hooks = { requestBath: () => null, wake: () => {}, notify: () => {}, eatAtBowl: () => null, settlePlay: () => {}, addFind: () => false }
  let now = T0
  const step = (sec) => { for (let i = 0; i < sec / 0.05; i++) { now += 50; e.update(0.05, { nowMs: now, hour: 23.5, weather: 'sunny', gifts: [] }) } }
  step(1)
  e.editing = true
  const pos = [...e.actors.values()].map((a) => [a.x, a.y, a.action, a.t])
  step(5)
  eq([...e.actors.values()].map((a) => [a.x, a.y, a.action, a.t]), pos, '擺設模式：寵物位置、動作、動畫時間完全不動')
  e.editing = false
  for (let i = 0; i < 200 && ![...e.actors.values()].some((a) => a.bld?.id === 'kennel' && a.bld.phase === 'at'); i++) step(3)
  const seated = [...e.actors.values()].filter((a) => a.bld?.id === 'kennel')
  ok(seated.length > 0, '夜晚狗走到狗窩')
  e.editing = true
  const rev = e.layout.placement.rev
  e.editGhost = { id: 'kennel', kind: 'kennel', x: 420, y: 290, ok: true }
  eq(e.layout.placement.rev, rev, '拖曳預覽不改真的擺放結果')
  e.releaseUsersOf('kennel')
  ok(seated.every((a) => a.bld === null && LAY.isWalkable(e.layout, a.x, a.y)), '拖起狗窩：座位上的狗回到地面')
  e.editGhost = null
}

console.log(`v3.9.0 第五階段邏輯測試 ${n} 項全過`)
