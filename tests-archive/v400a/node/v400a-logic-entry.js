// v4.0 階段 A 邏輯測試：存檔防呆（cleanShop、實例 id、cleanFarmLayout）、DATA_REV 6 與舊分頁、匯入 2～8、
// 買後收進倉庫重新整理仍在、買多個、上限、金幣不足、建築只能買一次、前置條件、skin／環境主題（測試資料）、
// 收藏集齊事件（順序、補發只發一次、合併彈窗）、擺設最擠時寶物與野餐不會當掉且提示正確
import '../../calendar-tweaks/node/env-shim.js'
import assert from 'node:assert/strict'
import { parseSave, cleanShop, cleanFarmLayout, isNewerData, SHOP_DECOR_SAFETY_MAX } from '../../../src/farm/save/migrate.ts'
import { DATA_REV, CURRENT_SCHEMA_VERSION } from '../../../src/farm/save/types.ts'
import { INSTANCE_KINDS, LAYOUT_ITEMS, layoutItemDef, parseInstanceId } from '../../../src/farm/config/layoutItems.ts'
import { SHOP_ITEMS, LEGACY_TEMP_ITEMS, SHOP_LIMITS, SIZE_PRICE, ENV_SLOT, ENV_DEFAULT, ENV_GROUP, envTheme, itemsOf, shopItem } from '../../../src/farm/config/shop.ts'
// 4.0-B2：階段 A 的暫時裝飾商品（蘑菇、小花叢、石頭、灌木、花槽、珊瑚石堆）B2 起商店不賣（換成 48 種主題裝飾）；這個測試的商店流程拿它們當樣本，所以測試開頭把 LEGACY_TEMP_ITEMS 加回商品表
SHOP_ITEMS.push(...LEGACY_TEMP_ITEMS)
import { purchase, itemStatus, ownedCount, equipSkin, equippedSkin, SHOP_TEXT } from '../../../src/farm/sim/shop.ts'
import * as PL from '../../../src/farm/pixel/placement.ts'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import * as PR from '../../../src/farm/pixel/placeRules.ts'
import * as FD from '../../../src/farm/pixel/finds.ts'
import { picnicMatRect } from '../../../src/farm/pixel/picnic.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import { EVENTS, RETRO_EVENT_IDS } from '../../../src/farm/config/events.ts'
import { ITEMS, shardKey } from '../../../src/farm/config/items.ts'
import { checkEvents, retroEvents, findsBlock, TOO_SMALL_MESSAGE, NO_SPOT_MESSAGE, crowdedFullMessage } from '../../../src/farm/sim/dig.ts'
import { PICNIC_TEXT } from '../../../src/farm/sim/picnic.ts'
import { buildBackup, parseBackup, BACKUP_FORMAT_VERSION, SHOP_FORMAT_VERSION, NEWER_VERSION_MESSAGE } from '../../../src/lib/backup.ts'
import { APP_LIST_SCHEMA_VERSION } from '../../../src/store/appListStore.ts'
import { PET_CAPACITY } from '../../../src/farm/config/balance.ts'
import { parseSave as oldParse } from '../../calendar-tweaks/.work/v3100src/src/farm/save/migrate.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const report = []
const T0 = new Date(2026, 10, 19, 12, 0, 0).getTime()
const today = '2026-11-19'
const clone = (x) => JSON.parse(JSON.stringify(x))
let seed = 4242
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const pet = (id, species, variant) => ({ id, species, variant, name: id, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 80, mood: 80, cleanliness: 80, personality: 'lively', lastInteract: T0 })
const RAW = (extra = {}) => ({
  schemaVersion: 5, dataRev: 5, points: 100, lastSeen: T0, lastDailyClaim: today, gifts: { date: today, count: 0 }, nextPetId: 3, createdAt: T0 - 9e8,
  pets: [pet('d1', 'dog', 'shiba'), pet('c1', 'cat', 'tabby')], ownedBuildings: [], earning: { date: today, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 },
  bowl: { date: today, used: 0 }, collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: today, count: 0, lastEnd: 0 }, ...extra,
})
const S = (extra) => parseSave(RAW(extra))
const buy = (s, id, opts) => { const r = purchase(s, id, opts); assert.ok(r.ok, `買 ${id} 應該成功：${r.error}`); return r.save }

// ========== 1. 常數 ==========
eq([CURRENT_SCHEMA_VERSION, DATA_REV, BACKUP_FORMAT_VERSION, SHOP_FORMAT_VERSION], [5, 6, 8, 8], '1 schema 5、DATA_REV 6、匯出格式 8')
ok(!isNewerData({ schemaVersion: 5, dataRev: 6 }) && isNewerData({ schemaVersion: 5, dataRev: 7 }), '1 dataRev 6 是目前、7 算較新')
eq(LAYOUT_ITEMS.length, 18, '1 內建固定物件仍是 18 個')
eq(SIZE_PRICE, { S: 3, M: 6, L: 10 }, '1 尺寸價格')
eq([SHOP_LIMITS.decorPerKind, SHOP_LIMITS.decorTotal, SHOP_LIMITS.envThemePrice], [10, 60, 30], '1 上限 10／60、環境主題 30')
eq(itemsOf('farm'), [], '1 農場分類沒有商品')
eq(itemsOf('decor').filter((d) => d.temp).map((d) => [d.grant.kind, d.price, !!d.temp]), [['mushroom', 3, true], ['flowers', 3, true], ['rocks', 6, true], ['bush', 6, true], ['planter', 10, true], ['coral', 10, true]], '1 6 種 TEMP 裝飾與價格')
eq(itemsOf('building').filter((d) => d.grant.type === 'building').map((d) => [d.grant.building, d.price, d.repeatable, d.maxOwned]), /* 4.0-B1：建築分類另有外觀商品 */ [['bowls', 10, false, 1], ['kennel', 20, false, 1], ['catTree', 20, false, 1]], '1 建築 3 種、各買一次')
eq(shopItem('pet.adopt').price, 15, '1 領養 15')
ok(SHOP_ITEMS.every((it) => it.grant.type !== 'skin' || (it.category === 'building' && it.grant.slot !== 'env') || (it.category === 'decor' && it.grant.slot === 'env')), '1 商品表的外觀只有 B1 的建築外殼與 B2 的環境主題')
for (const it of itemsOf('decor').filter((d) => d.grant.type === 'decor')) ok(INSTANCE_KINDS.includes(it.grant.kind), `1 商品種類 ${it.grant.kind} 在可複製種類表裡`)
ok(!INSTANCE_KINDS.includes('lamp') && !INSTANCE_KINDS.includes('tree'), '1 路燈、樹不可複製')

// ========== 2. 實例 id 與 cleanShop ==========
eq(parseInstanceId('rocks#3'), { kind: 'rocks', n: 3 }, '2 解析 rocks#3')
for (const bad of ['rocks', 'rocks#0', 'rocks#01', 'rocks#-1', 'lamp#1', 'tree#2', 'house#1', 'rocks#1x', '#1', 'Rocks#1', 'rocks#1234567', 3, null]) eq(parseInstanceId(bad), null, '2 不合法 id：' + JSON.stringify(bad))
const d1 = layoutItemDef('coral#7')
eq([d1.kind, d1.name, d1.storable, d1.hasDefault, !!d1.building], ['coral', '珊瑚石堆', true, false, false], '2 實例的物件定義')
eq(cleanShop(undefined), undefined, '2 沒有 shop = 沒有欄位')
eq(cleanShop([1, 2]), undefined, '2 陣列 = 沒有欄位')
eq(cleanShop({}), { decor: [], nextDecorId: 1 }, '2 空物件')
eq(cleanShop({ decor: [{ id: 'rocks#3', kind: 'rocks' }, { id: 'rocks#3', kind: 'rocks' }, { id: 'rocks#4', kind: 'bush' }, { id: 'lamp#5', kind: 'lamp' }, 'x', null, { id: 'bush#9', kind: 'bush' }], nextDecorId: 2 }),
  { decor: [{ id: 'rocks#3', kind: 'rocks' }, { id: 'bush#9', kind: 'bush' }], nextDecorId: 10 }, '2 重複、種類對不上、不可複製、壞資料都丟掉；nextDecorId ≥ 最大編號 + 1')
eq(cleanShop({ decor: [], nextDecorId: 'x' }).nextDecorId, 1, '2 nextDecorId 壞掉 → 1')
eq(cleanShop({ decor: [], nextDecorId: 57.8 }).nextDecorId, 57, '2 nextDecorId 取整數（編號不會變小，空清單也保留已用過的編號）')
const many = Array.from({ length: 500 }, (_, i) => ({ id: `rocks#${i + 1}`, kind: 'rocks' }))
eq(cleanShop({ decor: many }).decor.length, SHOP_DECOR_SAFETY_MAX, '2 安全上限 200 筆')
// 隨機防呆：清理兩次和一次一樣、輸出都合法
const kinds = [...INSTANCE_KINDS, 'lamp', 'tree', 'house', 'x', '', 5]
for (let i = 0; i < 5000; i++) {
  const list = Array.from({ length: Math.floor(rnd() * 12) }, () => (rnd() < 0.1 ? rnd() : { id: `${kinds[Math.floor(rnd() * kinds.length)]}#${Math.floor(rnd() * 30) - 2}`, kind: kinds[Math.floor(rnd() * kinds.length)] }))
  const raw = rnd() < 0.1 ? list : { decor: list, nextDecorId: rnd() < 0.5 ? Math.floor(rnd() * 40) - 5 : 'z' }
  const a = cleanShop(raw)
  if (!a) continue
  eq(cleanShop(clone(a)), a, '2 隨機：清理兩次相同')
  for (const d of a.decor) ok(parseInstanceId(d.id)?.kind === d.kind && a.nextDecorId > parseInstanceId(d.id).n, '2 隨機：輸出合法')
}

// ========== 3. 舊存檔：沒有 shop 的存檔讀進來，除了 dataRev 之外和 v3.10.0 逐欄相同 ==========
{
  const raw = RAW({ farmLayout: { items: [{ id: 'rocks', kind: 'rocks', state: 'placed', x: 300, y: 200 }] }, checkins: [today] })
  const a = parseSave(clone(raw))
  const b = oldParse(clone(raw))
  ok(!('shop' in a), '3 舊存檔沒有 shop 欄位')
  eq({ ...a, dataRev: 0, lastSeen: 0 }, { ...b, dataRev: 0, lastSeen: 0 }, '3 其他欄位和 v3.10.0 逐欄相同')
  eq(a.dataRev, 6, '3 讀進來 dataRev 6')
  // 18 個固定 id 的紀錄照舊認得
  eq(cleanFarmLayout({ items: LAYOUT_ITEMS.map((d) => ({ id: d.id, kind: d.kind, state: 'stored' })) }).items.length, 18, '3 18 個固定 id 的紀錄全部認得')
}

// ========== 4. cleanFarmLayout 與擺放：實例 ==========
{
  const lay = cleanFarmLayout({ items: [{ id: 'rocks#1', kind: 'rocks', state: 'placed', x: 300.4, y: 200 }, { id: 'rocks#2', kind: 'bush', state: 'placed', x: 1, y: 1 }, { id: 'bush#3', kind: 'bush', state: 'placed' }, { id: 'lamp#4', kind: 'lamp', state: 'placed', x: 1, y: 1 }] })
  eq(lay.items, [{ id: 'rocks#1', kind: 'rocks', state: 'placed', x: 300, y: 200 }, { id: 'bush#3', kind: 'bush', state: 'stored' }], '4 實例紀錄：合法的留下、種類對不上丟掉、沒座標 → 倉庫、不可複製丟掉')
  const P = PL.resolvePlacement([], lay, [{ id: 'rocks#1', kind: 'rocks' }, { id: 'flowers#5', kind: 'flowers' }])
  ok(P.placed.get('rocks#1')?.x === 300 && P.stored.has('flowers#5') && !P.placed.has('bush#3') && !P.stored.has('bush#3'), '4 擁有的實例：有紀錄擺著、沒紀錄在倉庫；沒擁有的實例（bush#3）紀錄被忽略')
  eq(P.order.slice(P.order.indexOf('coral') + 1, P.order.indexOf('kennel')), ['rocks#1', 'flowers#5'], '4 順序：實例依編號插在珊瑚之後、建築之前')
  eq(PL.placementToLayout(P).items, [{ id: 'rocks#1', kind: 'rocks', state: 'placed', x: 300, y: 200 }], '4 寫回：只記擺著的實例；在倉庫的不寫（擁有記在 shop）；沒擁有的紀錄消失')
  eq(PL.resolvePlacement([], undefined).order, PL.PLACE_ORDER, '4 沒有實例 = PLACE_ORDER 本身')
}

// ========== 5. 購買：買多個、上限、金幣不足、存檔不變、建築一次、前置條件 ==========
{
  let s = S({ points: 1000 })
  s = buy(s, 'decor.rocks')
  s = buy(s, 'decor.rocks')
  s = buy(s, 'decor.mushroom')
  eq(s.shop, { decor: [{ id: 'rocks#1', kind: 'rocks' }, { id: 'rocks#2', kind: 'rocks' }, { id: 'mushroom#3', kind: 'mushroom' }], nextDecorId: 4 }, '5 買 3 個：編號 1、2、3')
  eq(s.points, 1000 - 6 - 6 - 3, '5 金幣扣對')
  eq(ownedCount(s, shopItem('decor.rocks')), 2, '5 石頭擁有 2（內建的石頭不算）')
  for (let i = 0; i < 8; i++) s = buy(s, 'decor.rocks')
  const r = purchase(s, 'decor.rocks')
  ok(!r.ok && r.error === SHOP_TEXT.perKind(10) && r.save === s, '5 每種最多 10 個：第 11 個被擋、存檔不變（同一個物件）')
  // 全體 60
  let t = S({ points: 100000 })
  const ids = itemsOf('decor').filter((d) => d.temp).map((d) => d.id) // 4.0-B2：商品表有 54 種裝飾、這段只用 6 種暫時商品各買 10 個湊 60
  for (const id of ids) for (let i = 0; i < 10; i++) t = buy(t, id)
  eq(t.shop.decor.length, 60, '5 6 種各 10 個 = 60')
  ok(!purchase(t, 'decor.rocks').ok, '5 滿 60 不能再買')
  const t2 = { ...t, shop: { ...t.shop, decor: t.shop.decor.filter((d) => d.kind !== 'coral') } }
  eq(t2.shop.decor.length, 50, '5 對照：只有 50 個')
  ok(purchase(t2, 'decor.coral').ok, '5 50 個時可以買')
  const t3 = { ...t2, shop: { ...t2.shop, decor: [...t2.shop.decor, ...Array.from({ length: 10 }, (_, i) => ({ id: `stump#${900 + i}`, kind: 'stump' }))] } }
  eq(purchase(t3, 'decor.coral').error, SHOP_TEXT.total(60), '5 全體 60（含非商品種類的實例）→ 擋下並說明')
  // 金幣不足
  const poor = S({ points: 5 })
  const pr = purchase(poor, 'decor.rocks')
  ok(!pr.ok && pr.save === poor && pr.error === SHOP_TEXT.notEnough(6, 5), '5 金幣不足：存檔不變、原因含金額')
  ok(purchase(S({ points: 6 }), 'decor.rocks').save.points === 0, '5 剛好夠：買完 0、不會變負')
  // 隨機購買序列：金幣永不為負、扣的錢 = 價格總和、編號不重複
  for (let k = 0; k < 300; k++) {
    let u = S({ points: Math.floor(rnd() * 120), ownedBuildings: [] })
    const start = u.points
    let spent = 0
    for (let j = 0; j < 40; j++) {
      const pool = [...SHOP_ITEMS.map((x) => x.id), 'nope']
      const id = pool[Math.floor(rnd() * pool.length)]
      const before = u
      const rr = purchase(u, id, { storeIt: rnd() < 0.3 })
      if (rr.ok) { spent += rr.item.price; u = rr.save } else eq(rr.save, before, '5 隨機：失敗時存檔不變')
      ok(u.points >= 0, '5 隨機：金幣不為負')
    }
    eq(u.points, start - spent, '5 隨機：扣的錢 = 價格總和')
    const all = u.shop?.decor.map((d) => d.id) ?? []
    eq(new Set(all).size, all.length, '5 隨機：實例編號不重複')
    eq(new Set(u.ownedBuildings).size, u.ownedBuildings.length, '5 隨機：建築不重複')
  }
  // 建築只能買一次
  let b = S({ points: 100 })
  b = buy(b, 'building.kennel')
  eq(b.ownedBuildings, ['kennel'], '5 買狗窩')
  const again = purchase(b, 'building.kennel')
  ok(!again.ok && again.error === SHOP_TEXT.already('狗窩') && again.save === b, '5 狗窩不能再買')
  eq(itemStatus(b, shopItem('building.kennel')).owned, 1, '5 已擁有 1')
  // 建築：殘留紀錄忽略、storeIt 寫 stored
  const left = S({ points: 100, farmLayout: { items: [{ id: 'kennel', kind: 'kennel', state: 'placed', x: 400, y: 280 }] } })
  eq(buy(left, 'building.kennel').farmLayout, undefined, '5 買建築：以前殘留的擺放紀錄拿掉')
  eq(buy(left, 'building.kennel', { storeIt: true }).farmLayout, { items: [{ id: 'kennel', kind: 'kennel', state: 'stored' }] }, '5 預設位置被佔住：放進倉庫')
  ok(PL.placementOf(buy(left, 'building.kennel', { storeIt: true })).stored.has('kennel'), '5 放進倉庫的建築在倉庫')
  // 寵物不經過 purchase
  eq(purchase(S(), 'pet.adopt').error, SHOP_TEXT.petViaAdopt, '5 寵物走領養流程')
  const six = S({ pets: Array.from({ length: PET_CAPACITY }, (_, i) => pet('p' + i, 'dog', 'shiba')) })
  eq(itemStatus(six, shopItem('pet.adopt')).reason, SHOP_TEXT.petsFull, '5 寵物滿 6 隻：說明')
  eq(purchase(S(), 'nope').error, SHOP_TEXT.notOpen, '5 不存在的商品')
}

// ========== 6. 測試資料：skin 類型、前置條件、環境主題 ==========
{
  const CAT = [
    ...SHOP_ITEMS,
    { id: 'skin.kennel.red', name: '紅狗窩', category: 'building', price: 12, repeatable: false, maxOwned: 1, requires: [{ building: 'kennel' }], grant: { type: 'skin', skin: 'kennel.red', slot: 'kennel' } },
    { id: 'acc.flag', name: '小旗', category: 'decor', price: 4, repeatable: false, maxOwned: 1, requires: [{ item: 'skin.kennel.red' }], grant: { type: 'skin', skin: 'acc.flag', slot: 'flag' } },
    envTheme('env.snow', '雪地'),
    envTheme('env.desert', '沙漠'),
  ]
  let s = S({ points: 200 })
  eq(purchase(s, 'skin.kennel.red', { catalog: CAT }).error, SHOP_TEXT.needs('狗窩'), '6 前置條件：沒有狗窩不能買外殼')
  s = buy(s, 'building.kennel', { catalog: CAT })
  eq(purchase(s, 'acc.flag', { catalog: CAT }).error, SHOP_TEXT.needs('紅狗窩'), '6 前置條件：要先有另一個商品')
  s = buy(s, 'skin.kennel.red', { catalog: CAT })
  eq([s.skins.owned, s.skins.equipped.kennel], [['kennel.red'], 'kennel.red'], '6 skin：加進 owned 並穿上')
  ok(!purchase(s, 'skin.kennel.red', { catalog: CAT }).ok, '6 skin 只能買一次')
  s = buy(s, 'acc.flag', { catalog: CAT })
  // 環境主題
  const env = CAT.find((x) => x.id === 'env.snow')
  eq([env.category, env.group, env.price, env.repeatable, env.maxOwned, env.grant.slot], ['decor', ENV_GROUP, 30, false, 1, ENV_SLOT], '6 環境主題：裝飾品分頁「環境主題」、30、買一次')
  eq(equippedSkin(s, ENV_SLOT), ENV_DEFAULT, '6 預設是草地（不寫進存檔）')
  eq(ownedCount(s, envTheme(ENV_DEFAULT, '草地')), 1, '6 草地永遠擁有')
  s = buy(s, 'env.snow', { catalog: CAT })
  s = buy(s, 'env.desert', { catalog: CAT })
  eq(equippedSkin(s, ENV_SLOT), 'env.desert', '6 買了就生效（同一時間只有一個）')
  s = equipSkin(s, ENV_SLOT, 'env.snow')
  eq(equippedSkin(s, ENV_SLOT), 'env.snow', '6 切換到雪地')
  s = equipSkin(s, ENV_SLOT, ENV_DEFAULT)
  ok(!(ENV_SLOT in s.skins.equipped) && equippedSkin(s, ENV_SLOT) === ENV_DEFAULT, '6 切回草地：從 equipped 拿掉')
  const same = equipSkin(s, ENV_SLOT, 'env.nope')
  ok(same === s, '6 沒擁有的不能穿')
  // 存檔來回：owned、equipped 都保留（cleanSkins 保留不認得的 id）
  const back = parseSave(JSON.parse(JSON.stringify(equipSkin(s, ENV_SLOT, 'env.snow'))))
  eq([back.skins.owned.includes('env.snow'), back.skins.equipped.env], [true, 'env.snow'], '6 環境主題存檔來回保留')
  // 分類容納：裝飾品分頁依 group 分成兩組（環境主題在前）
  const groups = [...new Set(itemsOf('decor', [...CAT.filter((x) => x.group === ENV_GROUP), ...SHOP_ITEMS]).map((x) => x.group))]
  eq(groups.includes(ENV_GROUP) && groups.includes('擺設'), true, '6 裝飾品分頁同時容納「環境主題」與「擺設」')
}

// ========== 7. 買後收進倉庫、重新整理仍在；擺上場景、收回 ==========
{
  let s = S({ points: 100 })
  s = buy(s, 'decor.planter')
  s = buy(s, 'decor.planter')
  const r1 = parseSave(JSON.parse(JSON.stringify(s)))
  ok(PL.placementOf(r1).stored.has('planter#1') && PL.placementOf(r1).stored.has('planter#2'), '7 買完重新整理：兩個都在倉庫')
  const L = LAY.computeLayout(1920, 960, 1)
  LAY.setPlacement(L, PL.placementOf(r1))
  let spot = null
  for (let y = 170; y < 240 && !spot; y += 3) for (let x = 120; x < 560 && !spot; x += 5) if (PR.canPlace(L, 'planter#2', x, y).ok) spot = { x, y }
  ok(!!spot, '7 找得到放花槽的位置')
  let lay = PL.layoutAfterMove(r1.ownedBuildings, r1.farmLayout, 'planter#2', spot.x, spot.y, r1.shop.decor)
  const r2 = parseSave(JSON.parse(JSON.stringify({ ...r1, farmLayout: lay })))
  ok(PL.placementOf(r2).placed.get('planter#2')?.x === spot.x && PL.placementOf(r2).stored.has('planter#1'), '7 擺上去重新整理：在原位；另一個仍在倉庫')
  lay = PL.layoutAfterMove(r2.ownedBuildings, r2.farmLayout, 'planter#2', null, null, r2.shop.decor)
  const r3 = parseSave(JSON.parse(JSON.stringify({ ...r2, farmLayout: lay })))
  ok(PL.placementOf(r3).stored.has('planter#2') && (r3.farmLayout?.items.length ?? 0) === 0, '7 收回倉庫（不寫紀錄）、重新整理仍在倉庫')
  ok(!PR.canPlace(L, 'planter#9', spot.x, spot.y).ok, '7 沒擁有的實例不能放')
  // 還原預設：實例全部回倉庫，擁有不變
  const r4 = { ...r2, farmLayout: undefined }
  ok(PL.placementOf(r4).stored.has('planter#2') && r4.shop.decor.length === 2, '7 還原預設：實例回倉庫、擁有不變')
}

// ========== 8. 匯入 2～8、匯出入來回（含實例） ==========
{
  const appList = { schemaVersion: APP_LIST_SCHEMA_VERSION, apps: [] }
  let s = S({ points: 300 })
  for (const id of ['decor.rocks', 'decor.coral', 'decor.coral', 'building.kennel']) s = buy(s, id)
  s = { ...s, farmLayout: PL.layoutAfterMove(s.ownedBuildings, s.farmLayout, 'coral#2', 300, 220, s.shop.decor) }
  const exp = buildBackup(s, appList, '3.10.1', new Date('2026-11-19T04:00:00Z'))
  eq(exp.formatVersion, 8, '8 匯出格式 8')
  const text = JSON.stringify(exp)
  const p = parseBackup(text, text.length)
  ok(p.ok, '8 匯入格式 8')
  eq(p.backup.data.farm, parseSave(JSON.parse(JSON.stringify(s))), '8 匯出再匯入：存檔逐欄相同（含 shop、實例擺放）')
  eq([p.summary.decorCount, p.summary.layoutCount], [3, 1], '8 摘要：商店擺設 3、調整過 1')
  for (let fv = 2; fv <= 9; fv++) {
    const raw = { ...clone(exp), formatVersion: fv, data: { farm: { ...clone(s), dataRev: fv >= 8 ? 6 : 5 }, appList } }
    const t = JSON.stringify(raw)
    const r = parseBackup(t, t.length)
    if (fv > 8) { ok(!r.ok && r.error === NEWER_VERSION_MESSAGE, '8 格式 9 → 較新版本'); continue }
    ok(r.ok, `8 匯入格式 ${fv}`)
    if (fv < 8) {
      ok(!('shop' in r.backup.data.farm) && r.summary.decorCount === 0, `8 格式 ${fv}：shop 一律當空`)
      ok(!PL.placementOf(r.backup.data.farm).placed.has('coral#2'), `8 格式 ${fv}：實例的擺放紀錄沒有擁有，不出現`)
    } else eq(r.backup.data.farm.shop, s.shop, '8 格式 8：shop 原樣')
  }
  const t9 = JSON.stringify({ ...clone(exp), data: { farm: { ...clone(s), dataRev: 7 }, appList } })
  eq(parseBackup(t9, t9.length).error, NEWER_VERSION_MESSAGE, '8 dataRev 7 的備份 → 較新版本')
}

// ========== 9. 事件：順序、補發只發一次、合併、只發已達成的 ==========
const ALLCOL = {}
for (const d of ITEMS) { if (d.shards) for (let i = 1; i <= d.shards; i++) ALLCOL[shardKey(d.id, i)] = 1; else ALLCOL[d.id] = 1 }
const colOf = (filter) => { const c = {}; for (const [k, v] of Object.entries(ALLCOL)) if (filter(k)) c[k] = v; return c }
{
  eq(EVENTS.map((e) => e.id), ['dogLeak', 'catContract', 'colCommon', 'colUncommon', 'colRare', 'dogVault', 'catAtlantis', 'legendStand', 'colLegend', 'colAll'], '9 固定順序（4.0-C：傳說展示台在傳說配對之後）：罰款 → 常見 → 少見 → 稀有 → 傳說配對 → 傳說全集齊 → 全圖鑑')
  eq(RETRO_EVENT_IDS, ['colCommon', 'colUncommon', 'colRare', 'legendStand', 'colLegend', 'colAll'], '9 補發只查 6 個新事件（4.0-C 多了傳說展示台）')
  // 一次全部達成（揭曉時的 checkEvents）
  const r = checkEvents(S({ points: 3, collection: ALLCOL }), T0)
  eq(r.notices, [{ id: 'dogLeak', coins: 3 }, { id: 'catContract', coins: 0 }, { id: 'colCommon', coins: 15 }, { id: 'colUncommon', coins: 30 }, { id: 'colRare', coins: 50 }, { id: 'dogVault', coins: 100 }, { id: 'catAtlantis', coins: 100 }, { id: 'legendStand', coins: 0 }, { id: 'colLegend', coins: 100 }, { id: 'colAll', coins: 100 }], '9 同時觸發（4.0-C：傳說配對之後多了展示台 0 金幣）：依固定順序；罰款先扣（只剩 3 → 扣 3，再扣 0）')
  eq(r.save.points, 0 + 15 + 30 + 50 + 100 + 100 + 100 + 100, '9 金幣')
  eq(checkEvents(r.save, T0 + 1).notices, [], '9 一次性')
  // 套組 5 片不算集齊少見
  const five = colOf((k) => k !== 'U002-6')
  ok(!checkEvents(S({ collection: five }), T0).notices.some((x) => x.id === 'colUncommon'), '9 套組 5 片：少見不算集齊')
  ok(!checkEvents(S({ collection: five }), T0).notices.some((x) => x.id === 'colAll'), '9 套組 5 片：全圖鑑不算')
  // 只有狗的傳說：配對 +100 但不算傳說全集齊
  const dogL = colOf((k) => k === 'L001' || k === 'L002')
  eq(checkEvents(S({ collection: dogL }), T0).notices.map((x) => x.id), ['dogVault', 'legendStand'], '9 只有狗的兩件傳說：觸發舊配對＋（4.0-C）送 1 個傳說展示台')
  // 補發：只發已達成、旗標未設的；舊事件不在載入時觸發
  const old = S({ points: 10, collection: ALLCOL, events: { dogLeak: 1, catContract: 1, dogVault: 1, catAtlantis: 1 } })
  const rt = retroEvents(old, T0)
  eq(rt.notices.length, 1, '9 補發 5 個：合併成 1 個彈窗')
  eq(rt.notices[0], { id: 'retroBatch', coins: 295, retro: true, parts: [{ id: 'colCommon', coins: 15 }, { id: 'colUncommon', coins: 30 }, { id: 'colRare', coins: 50 }, { id: 'legendStand', coins: 0 }, { id: 'colLegend', coins: 100 }, { id: 'colAll', coins: 100 }] }, '9 合併彈窗（4.0-C：多了展示台 0 金幣）：各項與合計 295')
  eq(rt.save.points, 305, '9 補發金幣')
  eq(retroEvents(rt.save, T0 + 5).notices, [], '9 補發只發一次（旗標）')
  const fresh = S({ collection: ALLCOL })
  const rf = retroEvents(fresh, T0)
  ok(rf.save.events.dogLeak === undefined && rf.save.events.dogVault === undefined, '9 補發不會觸發舊的罰款、配對事件')
  const one = retroEvents(S({ collection: colOf((k) => k.startsWith('C')) }), T0)
  eq(one.notices, [{ id: 'colCommon', coins: 15, retro: true }], '9 只補發 1 個：沿用原彈窗（retro）')
  eq(retroEvents(S({ collection: colOf((k) => k.startsWith('C') && k !== 'C010') }), T0).notices, [], '9 未達成不發')
  // 隨機：補發的金幣 = 已達成且未領的獎勵和；再跑一次 0
  for (let i = 0; i < 400; i++) {
    const col = colOf(() => rnd() < 0.85)
    const ev = {}
    for (const id of RETRO_EVENT_IDS) if (rnd() < 0.3) ev[id] = 1
    const s0 = S({ collection: col, events: ev, points: 0 })
    const a = retroEvents(s0, T0)
    const expect = EVENTS.filter((e) => e.retro && ev[e.id] === undefined && e.met(col)).reduce((x, e) => x + e.coins, 0)
    eq(a.save.points, expect, '9 隨機：補發金幣正確')
    eq(retroEvents(a.save, T0).save.points, expect, '9 隨機：再載入不再發')
  }
}

// ========== 10. 最擠的情況：買到 60、盡量擺滿 → 寶物與野餐不會當掉、提示正確 ==========
{
  let s = S({ points: 100000, ownedBuildings: [] })
  for (const it of itemsOf('decor').filter((d) => d.temp)) for (let i = 0; i < 10; i++) s = buy(s, it.id) // 4.0-B2：6 種暫時裝飾各 10 個 = 60
  for (const it of itemsOf('building')) s = buy(s, it.id)
  const L = LAY.computeLayout(1920, 960, 1)
  LAY.setPlacement(L, PL.placementOf(s))
  let placed = 0
  const t0 = Date.now()
  for (const d of s.shop.decor) {
    let done = false
    for (let y = 150; y <= 300 && !done; y += 6) for (let x = 20; x <= 620 && !done; x += 7) {
      if (PR.canPlace(L, d.id, x, y).ok) { LAY.setPlacement(L, PL.withMove(L.placement, d.id, x, y)); placed++; done = true }
    }
  }
  const lay = PL.placementToLayout(L.placement)
  s = { ...s, farmLayout: lay }
  report.push(`10 最擠：60 個裝飾擺上 ${placed} 個（${Date.now() - t0} ms），寶物上限 ${FD.findCap(L)}，可放面積 ${FD.grassArea(L)}，野餐墊 ${JSON.stringify(picnicMatRect(L))}`)
  ok(placed >= 20, '10 擺上了很多（' + placed + '）')
  const cap = FD.findCap(L)
  const msg = findsBlock({ ...s, finds: [] }, cap)
  if (cap === 0) eq(msg, TOO_SMALL_MESSAGE, '10 寶物上限 0 → 擺設太多')
  else eq(findsBlock({ ...s, finds: Array.from({ length: cap }, (_, i) => ({ id: 'f' + i, kind: 'mound', by: 'dog', fx: 0.5, fy: 0.5, at: T0 })) }, cap), cap < 8 ? crowdedFullMessage(cap) : '先點開土堆', '10 寶物滿了 → 提示上限')
  for (const t of [TOO_SMALL_MESSAGE, crowdedFullMessage(2), NO_SPOT_MESSAGE, PICNIC_TEXT.noRoom, PICNIC_TEXT.endResize]) ok(t.startsWith('擺設太多') && !t.includes('視窗'), '10 提示是「擺設太多」、不提視窗：' + t)
  // 引擎：最擠的擺放下挖寶、尋寶、野餐判斷都不丟錯誤
  const e = new PixelEngine()
  let sd = 77
  e.rand = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 }
  e.setSize(1920, 960, 1)
  e.setLayoutData(s.ownedBuildings, s.farmLayout, s.shop.decor)
  eq(e.layout.placement.placed.size, PL.placementOf(s).placed.size, '10 引擎吃到含實例的擺放')
  e.sync([pet('d1', 'dog', 'shiba'), pet('c1', 'cat', 'tabby')])
  const notes = []
  e.hooks = { requestBath: () => null, wake: () => {}, notify: (m) => notes.push(m), eatAtBowl: () => null, settlePlay: () => {}, addFind: () => true }
  let now = T0
  const step = (sec) => { for (let i = 0; i < sec / 0.05; i++) { now += 50; e.update(0.05, { nowMs: now, hour: 12, weather: 'sunny', gifts: [] }) } }
  let threw = null
  try {
    e.beginPlay('d1', 'dig')
    step(40)
    e.beginPlay('c1', 'hunt')
    step(40)
    e.picnicMatFits()
  } catch (err) { threw = err }
  ok(threw === null, '10 最擠：挖寶、尋寶、野餐判斷沒有丟錯誤 ' + (threw?.stack ?? ''))
  ok(notes.every((t) => !t.includes('視窗')), '10 引擎提示沒有「視窗」：' + notes.join('｜'))
  report.push('10 引擎提示：' + (notes.join('｜') || '（沒有）'))
  if (!picnicMatRect(L)) ok(PICNIC_TEXT.noRoom.startsWith('擺設太多'), '10 放不下野餐墊 → 擺設太多')
}

console.log(report.join('\n'))
console.log(`通過 v4.0 階段 A 邏輯：${n} 項`)
