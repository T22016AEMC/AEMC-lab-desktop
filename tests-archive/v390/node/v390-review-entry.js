// v3.9.0 審查修正：（1）同一影格連續兩次擺放寫入都要保留 （2）買建築時忽略舊的擺放紀錄 （3）匯入摘要的 layoutCount 只算有效且和預設不同的物件
import './env-shim.js'
import assert from 'node:assert/strict'
import * as PL from '../../../src/farm/pixel/placement.ts'
import * as PR from '../../../src/farm/pixel/placeRules.ts'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import { useFarmStore } from '../../../src/farm/store/farmStore.ts'
import { parseSave } from '../../../src/farm/save/migrate.ts'
import { parseBackup } from '../../../src/lib/backup.ts'
import { isStored, isPlacedBuilding } from '../../../src/farm/sim/buildings.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const T0 = new Date(2026, 10, 19, 12, 0, 0).getTime()
const today = '2026-11-19'
const pet = (id, species, variant) => ({ id, species, variant, name: id, adoptedAt: T0 - 1e8, heightFactor: 1, weight: 50, satiety: 60, mood: 60, cleanliness: 60, personality: 'calm', lastInteract: T0 })
const mkSave = (extra = {}) => parseSave({
  schemaVersion: 5, dataRev: 4, points: 100, lastSeen: T0, lastDailyClaim: today, gifts: { date: today, count: 0 }, nextPetId: 3, createdAt: T0 - 9e8,
  pets: [pet('d1', 'dog', 'shiba'), pet('c1', 'cat', 'orange')], ownedBuildings: [], earning: { date: today, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 },
  bowl: { date: today, used: 0 }, collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: today, count: 0, lastEnd: 0 }, ...extra,
})
const st = () => useFarmStore.getState()
const kinds = Object.fromEntries(['kennel', 'bowls', 'catTree', 'lamp', 'tree1', 'planter', 'coral', 'bush', 'mushroom'].map((id) => [id, id.startsWith('tree') ? 'tree' : id]))
const rec = (id, state, x, y) => (state === 'stored' ? { id, kind: kinds[id], state } : { id, kind: kinds[id], state, x, y })
const find = (layout, id) => layout?.items.find((it) => it.id === id)

// ================= 1. 同一影格連續兩次寫入都要保留 =================
{
  useFarmStore.setState({ save: mkSave() })
  // 引擎還停在購買之前的擺放結果（沒買建築、沒有紀錄）
  const stale = PL.resolvePlacement([], undefined)
  // 第一次寫入：買下狗窩，預設位置被佔 → 直接放進倉庫（和 BuildLayer 的流程一樣）
  eq(st().buyBuilding('kennel', true), null, '1 買狗窩（預設位置被佔、放進倉庫）成功')
  const afterBuy = st().save
  eq(afterBuy.points, 100 - 20, '1 扣了 20 金幣')
  ok(afterBuy.ownedBuildings.includes('kennel') && isStored(afterBuy, 'kennel'), '1 已購買、在倉庫')
  // 第二次寫入：同一個影格內（引擎還沒跟上）放下路燈
  const L2 = PL.layoutAfterMove(afterBuy.ownedBuildings, afterBuy.farmLayout, 'lamp', 400, 300)
  st().setFarmLayout(L2)
  const s2 = st().save
  ok(find(s2.farmLayout, 'kennel')?.state === 'stored', '1 第二次寫入之後，狗窩仍在倉庫（第一次的變更沒被蓋掉）')
  eq([find(s2.farmLayout, 'lamp')?.x, find(s2.farmLayout, 'lamp')?.y], [400, 300], '1 路燈在新位置')
  eq(s2.points, 80, '1 金幣沒有再變動')
  ok(s2.ownedBuildings.filter((b) => b === 'kennel').length === 1, '1 狗窩只有一個')
  // 負向對照：舊寫法（用引擎上一個影格的擺放結果）會把狗窩的紀錄蓋掉 → 狗窩回到預設位置
  const old = PL.placementToLayout(PL.withMove(stale, 'lamp', 400, 300))
  ok(!find(old, 'kennel'), '1 對照：用過期的擺放結果寫入會漏掉狗窩的倉庫紀錄（修正前的行為）')
  // 再連續：放下路燈之後立刻（同影格）收起樹、再放下蘑菇，三次變更都在
  let cur = st().save
  st().setFarmLayout(PL.layoutAfterMove(cur.ownedBuildings, cur.farmLayout, 'tree1', null, null))
  cur = st().save
  st().setFarmLayout(PL.layoutAfterMove(cur.ownedBuildings, cur.farmLayout, 'mushroom', 300, 290))
  cur = st().save
  ok(find(cur.farmLayout, 'kennel')?.state === 'stored' && find(cur.farmLayout, 'tree1')?.state === 'stored' && find(cur.farmLayout, 'lamp')?.x === 400 && find(cur.farmLayout, 'mushroom')?.x === 300, '1 四筆紀錄全部保留')
  // 寫入後引擎重新解析：擺放結果與預期一致
  const P = PL.resolvePlacement(cur.ownedBuildings, cur.farmLayout)
  ok(P.stored.has('kennel') && P.stored.has('tree1') && P.placed.get('lamp').x === 400, '1 重新解析：狗窩與樹在倉庫、路燈在新位置')
  // 和存檔來回一次（JSON → parseSave）結果相同
  const rt = parseSave(JSON.parse(JSON.stringify(cur)))
  eq(rt.farmLayout, cur.farmLayout, '1 存檔來回後 farmLayout 相同')
  // 還原預設：已購買的建築不變
  st().restoreDefaultLayout()
  ok(st().save.ownedBuildings.includes('kennel') && !st().save.farmLayout, '1 還原預設：farmLayout 拿掉、建築仍已購買')
}

// ================= 2. 買建築時忽略舊的擺放紀錄 =================
{
  // 沒買狗窩，但存檔有一筆 placed（壞檔或手改）
  const dirty = { items: [rec('kennel', 'placed', 100, 100), rec('lamp', 'placed', 420, 300)] }
  const s0 = mkSave({ farmLayout: dirty })
  ok(find(s0.farmLayout, 'kennel'), '2 前提：parseSave 保留沒買的建築的紀錄')
  ok(!PL.resolvePlacement([], dirty).placed.has('kennel'), '2 前提：沒買時不出現在場景')
  eq(PL.withoutRecord(dirty, 'kennel'), { items: [rec('lamp', 'placed', 420, 300)] }, '2 withoutRecord 拿掉那一筆、其他不動')
  eq(PL.withoutRecord({ items: [rec('kennel', 'placed', 1, 1)] }, 'kennel'), undefined, '2 只剩那一筆時整個欄位拿掉')
  ok(PL.withoutRecord(dirty, 'bowls') === dirty, '2 沒有那一筆時原樣回傳')
  eq(PL.withoutRecord(undefined, 'kennel'), undefined, '2 沒有 farmLayout')
  // (a) 預設位置放得下：買下 → 在預設位置（不在舊紀錄的 100,100）
  useFarmStore.setState({ save: s0 })
  eq(st().buyBuilding('kennel', false), null, '2a 買下')
  let s = st().save
  ok(!find(s.farmLayout, 'kennel'), '2a 舊紀錄被拿掉')
  ok(find(s.farmLayout, 'lamp')?.x === 420, '2a 其他物件的紀錄保留')
  eq(PL.resolvePlacement(s.ownedBuildings, s.farmLayout).placed.get('kennel'), { id: 'kennel', kind: 'kennel', x: PL.DEFAULT_POS.kennel.x, y: PL.DEFAULT_POS.kennel.y }, '2a 狗窩在預設位置')
  ok(isPlacedBuilding(s, 'kennel'), '2a 擺出來的')
  // (b) 舊紀錄是 stored：買下不能直接進倉庫（沒有被佔的理由）
  useFarmStore.setState({ save: mkSave({ farmLayout: { items: [rec('kennel', 'stored')] } }) })
  eq(st().buyBuilding('kennel', false), null, '2b 買下')
  s = st().save
  ok(!isStored(s, 'kennel') && isPlacedBuilding(s, 'kennel'), '2b 舊的 stored 紀錄被忽略：擺在預設位置')
  eq(s.farmLayout, undefined, '2b 沒有其他紀錄時 farmLayout 拿掉')
  // (c) 舊紀錄是 placed、預設位置被佔 → 進倉庫（只有一筆 stored，不是兩筆）
  useFarmStore.setState({ save: mkSave({ farmLayout: { items: [rec('kennel', 'placed', 100, 100), rec('lamp', 'placed', 420, 300)] } }) })
  eq(st().buyBuilding('kennel', true), null, '2c 買下（被佔）')
  s = st().save
  eq(s.farmLayout.items.filter((it) => it.id === 'kennel').length, 1, '2c 狗窩只有一筆紀錄')
  ok(find(s.farmLayout, 'kennel').state === 'stored' && isStored(s, 'kennel'), '2c 那一筆是 stored')
  ok(find(s.farmLayout, 'lamp')?.x === 420, '2c 其他紀錄保留')
  // (d) BuildLayer 的判斷：用 withoutRecord 之後，舊紀錄不影響「預設位置放不放得下」
  const L = LAY.computeLayout(1920, 960, 1)
  const blockedWith = (layout) => {
    LAY.setPlacement(L, PL.resolvePlacement(['kennel'], layout))
    return !PR.canPlace(L, 'kennel', PL.DEFAULT_POS.kennel.x, PL.DEFAULT_POS.kennel.y).ok
  }
  // 舊紀錄把狗窩放在別處：不論舊紀錄在哪裡，判斷只看預設位置（沒有其他東西擋 → 放得下）
  const withStale = { items: [rec('kennel', 'placed', 420, 300)] }
  eq(blockedWith(PL.withoutRecord(withStale, 'kennel')), false, '2d 去掉舊紀錄後：預設位置放得下')
  // 路燈搬到狗窩預設位置旁 → 被佔
  const lampBlock = { items: [rec('lamp', 'placed', 226, 271), rec('kennel', 'placed', 420, 300)] }
  eq(blockedWith(PL.withoutRecord(lampBlock, 'kennel')), true, '2d 預設位置被路燈佔住 → 判定為被佔')
  // 重複買（已買）還是擋下，金幣不變
  const before = st().save.points
  ok(st().buyBuilding('kennel', true) !== null && st().save.points === before, '2e 重複買被擋、金幣不變')
}

// ================= 3. 匯入摘要的 layoutCount =================
{
  const farm = (extra) => ({
    schemaVersion: 5, dataRev: 4, points: 10, lastSeen: T0, pets: [pet('d1', 'dog', 'shiba')], ownedBuildings: ['bowls'], ...extra,
  })
  const bk = (fv, f) => { const t = JSON.stringify({ format: 'aemc-desktop-backup', formatVersion: fv, exportedAt: new Date(T0).toISOString(), data: { farm: f, appList: { schemaVersion: 1, apps: [] } } }); return parseBackup(t, t.length) }
  const D = PL.DEFAULT_POS
  const layout = { items: [
    rec('kennel', 'placed', 100, 100), // 沒買的建築 → 不算
    rec('lamp', 'placed', D.lamp.x, D.lamp.y), // 和預設相同 → 不算
    rec('tree1', 'placed', 300, 290), // 移動過 → 算
    rec('bowls', 'stored'), // 已買、收進倉庫 → 算
    rec('planter', 'stored'), // 沒有預設位置的物件本來就在倉庫 → 不算
    rec('coral', 'placed', 200, 280), // 擺出來 → 算
    rec('bush', 'stored'), // 同 planter → 不算
    rec('mushroom', 'stored'), // 有預設位置、收進倉庫 → 算
    { id: 'nope', kind: 'tree', state: 'placed', x: 1, y: 1 }, // 認不得 → 清理時丟掉，不算
  ] }
  const r6 = bk(6, farm({ farmLayout: layout }))
  ok(r6.ok, '3 格式 6 讀得進去')
  eq(r6.summary.layoutCount, 4, '3 layoutCount = 4（tree1、bowls、coral、mushroom）')
  eq(bk(5, farm({ farmLayout: layout })).summary.layoutCount, 0, '3 格式 5 不讀農場擺放 → 0')
  eq(bk(6, farm({})).summary.layoutCount, 0, '3 沒有 farmLayout → 0')
  eq(bk(6, farm({ farmLayout: { items: [rec('kennel', 'placed', 100, 100), rec('lamp', 'placed', D.lamp.x, D.lamp.y)] } })).summary.layoutCount, 0, '3 只有無效或和預設相同的紀錄 → 0（畫面不顯示「農場擺放」那一行）')
  eq(bk(6, farm({ ownedBuildings: ['kennel'], farmLayout: { items: [rec('kennel', 'placed', 100, 100)] } })).summary.layoutCount, 1, '3 買了的建築移動過 → 1')
}

console.log(`v3.9.0 審查修正測試 ${n} 項全過`)
