// v4.0 階段 A：farmStore 的購買與補發（真的 LocalStorageAdapter＋寫入權）
//  - 購買：立刻寫入、扣金幣與實例同一次寫入；連點（同時 5 次）建築只買到 1 次；被接手的分頁買不了
//  - 補充 a：set 之後、寫入前被別的分頁接手 → 存檔拒寫、記憶體回到購買前、儲存的資料沒變（購買與領養）
//  - 載入補發：老玩家已達成的才發、只發一次（重新載入不再發）、2 個以上合併成一個彈窗；寫進儲存
import { store as LS } from '../../calendar-tweaks/node/env-shim.js'
import assert from 'node:assert/strict'
import { useFarmStore, setSaveStorage } from '../../../src/farm/store/farmStore.ts'
import { LocalStorageAdapter, WRITER_KEY, setOtherTabHandler } from '../../../src/farm/save/storage.ts'
import { SHOP_TEXT } from '../../../src/farm/sim/shop.ts'
import { SHOP_ITEMS, LEGACY_TEMP_ITEMS } from '../../../src/farm/config/shop.ts'
// 4.0-B2：階段 A 的暫時裝飾商品（蘑菇、小花叢、石頭、灌木、花槽、珊瑚石堆）B2 起商店不賣（換成 48 種主題裝飾）；這個測試的商店流程拿它們當樣本，所以測試開頭把 LEGACY_TEMP_ITEMS 加回商品表
SHOP_ITEMS.push(...LEGACY_TEMP_ITEMS)
import { ITEMS, shardKey } from '../../../src/farm/config/items.ts'
import { newSave } from '../../../src/farm/sim/points.ts'
import { LocalStorageAdapter as OldAdapter, setNewerDataHandler as setOldNewer } from '../../calendar-tweaks/.work/v3100src/src/farm/save/storage.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const KEY = 'aemc-desktop:farm-save'
const T0 = Date.now()
const today = (() => { const d = new Date(T0); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })()
const pet = (id, species, variant) => ({ id, species, variant, name: id, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 90, personality: 'lively', lastInteract: T0 })
const RAW = (extra = {}) => ({ ...newSave(T0, today), lastDailyClaim: today, points: 100, pets: [pet('d1', 'dog', 'shiba'), pet('c1', 'cat', 'tabby')], nextPetId: 3, dataRev: 5, lastSeen: T0, ...extra })
const stored = () => JSON.parse(LS.get(KEY))
const realRandom = Math.random
const tick = () => new Promise((r) => setTimeout(r, 0))

/** 新的頁面：清掉 store、指定分頁 id 的儲存層、載入 */
async function boot(raw, tab = 'A') {
  // 上一頁還沒寫完的存檔先讓它寫完（真的重新整理時舊頁面已經不在了；同一個程序裡連續「開頁」才需要）
  for (let i = 0; i < 5; i++) await tick()
  if (raw) { LS.clear(); LS.set(KEY, JSON.stringify(raw)) }
  const ad = new LocalStorageAdapter(undefined, undefined, undefined, tab)
  setSaveStorage(ad)
  useFarmStore.setState({ status: 'loading', save: null, otherTab: false, newerData: false, resetFailed: false, pendingEvents: [], legacyRefund: 0 })
  Math.random = () => 0.999 // 離線補算與禮物不擲中
  await useFarmStore.getState().init()
  Math.random = realRandom
  return ad
}
const S = () => useFarmStore.getState()
// 第 3 段用：存檔拒寫時只標記 otherTab（不停止整個模組的存檔，後面的段落才能繼續寫）。第 2 段走 farmStore 自己的 markOtherTab
setOtherTabHandler(() => useFarmStore.setState({ otherTab: true }))

// ---------- 1. 購買：立刻寫入 ----------
LS.clear()
await boot(RAW())
let r = await S().purchase('decor.rocks')
eq(r, { ok: true, instanceId: 'rocks#1' }, '1 買石頭')
eq([stored().points, stored().shop, stored().dataRev], [94, { decor: [{ id: 'rocks#1', kind: 'rocks' }], nextDecorId: 2 }, 6], '1 立刻寫入：扣金幣與實例在同一份存檔')
// 同時 5 次買同一個建築：只成功 1 次、只扣一次
const five = await Promise.all([1, 2, 3, 4, 5].map(() => S().purchase('building.kennel')))
eq(five.filter((x) => x.ok).length, 1, '1 同時 5 次買狗窩：只成功 1 次')
ok(five.filter((x) => !x.ok).every((x) => x.error === SHOP_TEXT.already('狗窩')), '1 其他 4 次：已經擁有')
eq([S().save.points, stored().points, stored().ownedBuildings], [74, 74, ['kennel']], '1 只扣 20')
// 同時 3 次買裝飾：3 個不同編號、扣 3 次（每次都是合法購買）
const three = await Promise.all([1, 2, 3].map(() => S().purchase('decor.mushroom')))
eq(three.map((x) => x.instanceId).sort(), ['mushroom#2', 'mushroom#3', 'mushroom#4'], '1 同時 3 次買蘑菇：編號不重複')
eq(stored().points, 74 - 9, '1 金幣 -9')
// 金幣不足
await boot(RAW({ points: 2 }))
r = await S().purchase('decor.rocks')
ok(!r.ok && r.error === SHOP_TEXT.notEnough(6, 2) && S().save.points === 2, '1 金幣不足：不扣、不寫')

// ---------- 3. 補充 a：set 之後、寫入前被接手 → 回到購買前 ----------
async function racePurchase(action, label) {
  LS.clear()
  await boot(RAW(), 'A')
  const mem = S().save
  const disk = LS.get(KEY)
  // 存檔寫入時第一次讀存檔（寫入前的「較新版本」檢查）的那一刻，讓另一個分頁接手
  const realGet = globalThis.localStorage.getItem
  let armed = true
  globalThis.localStorage.getItem = (k) => {
    if (armed && k === KEY) { armed = false; LS.set(WRITER_KEY, JSON.stringify({ id: 'B', at: Date.now() })) }
    return realGet(k)
  }
  const res = await action()
  globalThis.localStorage.getItem = realGet
  ok(!armed, `3 ${label}：接手確實發生在寫入的時候（購買前的寫入權檢查已經通過）`)
  ok(res === SHOP_TEXT.otherTab || (res && res.ok === false && res.error === SHOP_TEXT.otherTab), `3 ${label}：回傳失敗（被接手）`)
  ok(S().otherTab, `3 ${label}：畫面鎖定（otherTab）`)
  ok(S().save === mem, `3 ${label}：記憶體回到購買前（同一個物件）`)
  eq(LS.get(KEY), disk, `3 ${label}：儲存的資料沒變（拒寫）`)
  await tick()
  eq(LS.get(KEY), disk, `3 ${label}：之後也不會補寫`)
}
await racePurchase(() => S().purchase('decor.coral'), '買裝飾')
await racePurchase(() => S().purchase('building.catTree'), '買建築')
await racePurchase(() => S().shopAdopt({ species: 'dog', variant: 'corgi', name: '小柯' }), '領養')
// 對照：沒被接手時領養成功、立刻寫入
LS.clear()
await boot(RAW(), 'A')
eq(await S().shopAdopt({ species: 'cat', variant: 'tabby', name: '咪' }), null, '3 對照：領養成功')
eq([stored().pets.length, stored().points], [3, 85], '3 對照：寫入（3 隻、-15）')
// 寵物滿 6 隻
await boot(RAW({ pets: [1, 2, 3, 4, 5, 6].map((i) => pet('p' + i, 'dog', 'shiba')) }), 'A')
ok((await S().shopAdopt({ species: 'dog', variant: 'shiba', name: 'x' })) !== null && S().save.pets.length === 6, '3 寵物滿 6 隻：不能領養')

// ---------- 4. 載入補發 ----------
const ALL = {}
for (const d of ITEMS) { if (d.shards) for (let i = 1; i <= d.shards; i++) ALL[shardKey(d.id, i)] = 1; else ALL[d.id] = 1 }
const oldFlags = { dogLeak: 1, catContract: 1, dogVault: 1, catAtlantis: 1 }
LS.clear()
await boot(RAW({ points: 10, collection: ALL, events: oldFlags }))
eq(S().pendingEvents.map((e) => e.id), ['retroBatch'], '4 補發 5 個：合併成 1 個彈窗')
eq(S().pendingEvents[0].parts.map((p) => p.id), ['colCommon', 'colUncommon', 'colRare', 'legendStand', 'colLegend', 'colAll'], '4 合併彈窗的各項（依事件順序；4.0-C 多了傳說展示台）')
eq([S().pendingEvents[0].coins, S().save.points, stored().points], [295, 305, 305], '4 合計 295、立刻寫入')
ok(Object.keys(stored().events).length === 10, '4 旗標寫進儲存（4 個舊旗標＋6 個補發：4.0-C 多了 legendStand）')
await boot(null)
eq([S().pendingEvents, S().save.points], [[], 305], '4 重新載入：不再發')
// 只達成 1 項：原彈窗
const common = {}
for (let i = 1; i <= 10; i++) common['C' + String(i).padStart(3, '0')] = 1
LS.clear()
await boot(RAW({ points: 0, collection: common }))
eq(S().pendingEvents, [{ id: 'colCommon', coins: 15, retro: true }], '4 只補發 1 個：原彈窗（retro）')
// 沒達成：不發、不寫入
LS.clear()
const raw0 = RAW({ points: 7, collection: { C001: 1 } })
await boot(raw0)
eq([S().pendingEvents, S().save.points, stored().dataRev], [[], 7, 5], '4 沒達成：不發、也不寫回（儲存的 dataRev 還是 5）')
// 舊事件不在載入時觸發（就算原始資料的旗標不見了）
LS.clear()
await boot(RAW({ points: 50, collection: { L001: 1, L002: 1, U002: 0, ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => ['U002-' + i, 1])) } }))
eq([S().pendingEvents, S().save.points, S().save.events.dogVault], [[{ id: 'legendStand', coins: 0, retro: true }], 50, undefined], '4 舊的罰款與配對不在載入時觸發（4.0-C：只補送傳說展示台，0 金幣、不設配對旗標）')

// ---------- 5. 3.10.x 的舊分頁讀到 dataRev 6：不讀、不覆寫（shop 不會被洗掉） ----------
LS.clear()
await boot(RAW({ points: 100 }), 'A')
await S().purchase('decor.planter')
for (let i = 0; i < 5; i++) await tick()
const v4save = LS.get(KEY)
eq([JSON.parse(v4save).dataRev, JSON.parse(v4save).shop.decor.length], [6, 1], '5 新版寫入 dataRev 6、有 shop')
let oldNewer = 0
setOldNewer(() => { oldNewer++ })
const oa = new OldAdapter(undefined, undefined, undefined, 'OLD')
const olr = await oa.loadOrReset(() => { throw new Error('不應重置') })
ok(olr.newer === true && olr.save === null, '5 3.10.0 載入 dataRev 6 → newer（不讀）')
await oa.save({ ...JSON.parse(v4save), dataRev: 5, shop: undefined, points: 1 })
eq(LS.get(KEY), v4save, '5 3.10.0 的自動存檔不覆寫（shop 還在）')
ok(oldNewer >= 1, '5 3.10.0 顯示「存檔來自更新的版本」')

// ---------- 2. 被接手的分頁（放最後：真正的 markOtherTab 會停止這個模組之後所有的存檔，等於重新整理前的狀態） ----------
LS.clear()
await boot(RAW(), 'A')
const before = JSON.stringify(S().save)
LS.set(WRITER_KEY, JSON.stringify({ id: 'B', at: Date.now() })) // 另一個分頁接手了
r = await S().purchase('decor.rocks')
ok(!r.ok && r.error === SHOP_TEXT.otherTab && S().otherTab, '2 被接手：買不了、畫面鎖定')
eq(JSON.stringify(S().save), before, '2 記憶體沒變')

console.log(`通過 v4.0 階段 A farmStore：${n} 項`)
