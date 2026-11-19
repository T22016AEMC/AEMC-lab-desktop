import './env-shim.js'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import * as PL from '../../../src/farm/pixel/placement.ts'
import * as PR from '../../../src/farm/pixel/placeRules.ts'
import * as FD from '../../../src/farm/pixel/finds.ts'
import { picnicMatRect } from '../../../src/farm/pixel/picnic.ts'
import { pondStand } from '../../../src/farm/pixel/reach.ts'
import { PixelEngine } from '../../../src/farm/pixel/engine.ts'
import { parseSave, cleanFarmLayout } from '../../../src/farm/save/migrate.ts'
import { LAYOUT_ITEMS } from '../../../src/farm/config/layoutItems.ts'
import { parseBackup } from '../../../src/lib/backup.ts'
const ALL = ['kennel','bowls','catTree']
const T0 = new Date(2026,10,19,12,0,0).getTime()
let seed = 77; const rnd = () => { seed = (seed*1664525+1013904223)>>>0; return seed/4294967296 }
const pet = (id, species, variant) => ({ id, species, variant, name:id, adoptedAt:T0-1e8, heightFactor:1, weight:50, satiety:30, mood:50, cleanliness:20, personality:'calm', lastInteract:T0 })
const out = { errors: [], slow: [] }
// 1. cleanFarmLayout odd inputs
const odd = [
  JSON.parse('{"items":[{"id":"__proto__","kind":"house","state":"placed"},{"__proto__":{"x":5},"id":"lamp","kind":"lamp","state":"placed","x":1,"y":2}]}'),
  { items: [{ id: 'house', kind: 'house', state: 'stored' }] },
  { items: [{ id: 'tree1', kind: 'tree', x: 1e308, y: -1e308 }] },
  { items: [{ id: 'tree1', kind: 'tree', x: '5', y: 5 }] },
  { items: [{ id: 'planter', kind: 'planter', state: 'placed', x: NaN, y: 5 }] },
  { items: [{ id: 'tree1', kind: 'bush', state: 'placed', x: 5, y: 5 }] },
  { items: [{ id: 'constructor', kind: 'tree' }, { id: 'toString', kind: 'tree' }, { id: 'tree1', kind: 'constructor' }] },
  { items: new Array(1e6).fill({ id: 'tree1', kind: 'tree', x: 1, y: 1 }) },
  { items: { length: 5, 0: {} } },
]
for (const o of odd) { try { const t=performance.now(); const r = cleanFarmLayout(o); out['odd'+odd.indexOf(o)] = r === undefined ? undefined : JSON.stringify(r).slice(0,200); const dt=performance.now()-t; if(dt>50) out.slow.push(['odd',dt]); if (JSON.stringify(cleanFarmLayout(r))!==JSON.stringify(r)) out.errors.push('not idempotent '+odd.indexOf(o)) } catch (e) { out.errors.push('clean '+e) } }
// 2. random cleaned layouts through layout/nav/rules/engine
const ids = LAYOUT_ITEMS.map(d=>d.id)
const pick = () => { const r = rnd(); return r<0.15?0:r<0.3?640:Math.floor(rnd()*700)-30 }
const pickY = () => { const r = rnd(); return r<0.15?0:r<0.3?320:Math.floor(rnd()*360)-20 }
for (let k=0;k<300;k++) {
  const items = ids.filter(()=>rnd()<0.7).map(id => ({ id, kind: LAYOUT_ITEMS.find(d=>d.id===id).kind, state: rnd()<0.15?'stored':'placed', x: pick(), y: pickY() }))
  const save = parseSave({ schemaVersion:5, dataRev:4, points:10, lastSeen:T0, pets:[pet('d1','dog','shiba'),pet('c1','cat','orange'),pet('d2','dog','shiba')], ownedBuildings: ALL, farmLayout: { items } })
  try {
    const t = performance.now()
    const L = LAY.computeLayout(1920, 960, 1)
    LAY.setPlacement(L, PL.resolvePlacement(save.ownedBuildings, save.farmLayout))
    FD.grassArea(L); picnicMatRect(L); pondStand(L); LAY.buildingSlots(L)
    PR.canPlace(L, 'lamp', 300, 300)
    const e = new PixelEngine(); e.rand = rnd
    e.setSize(1920, 960, 1); e.setLayoutData(ALL, save.farmLayout); e.sync(save.pets)
    e.hooks = { requestBath: () => null, wake: () => {}, notify: () => {}, eatAtBowl: () => null, settlePlay: () => {}, addFind: () => false }
    let now = T0
    for (let i=0;i<400;i++){ now+=50; e.update(0.05, { nowMs: now, hour: 12 + i/72000, weather: 'sunny', gifts: [] }) }
    for (const a of (e.actors ? [...e.actors.values?.() ?? e.actors] : [])) if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) out.errors.push('NaN actor k='+k)
    const dt = performance.now()-t; if (dt>3000) out.slow.push([k, Math.round(dt), JSON.stringify(items)])
  } catch (err) { out.errors.push('k='+k+' '+(err.stack||err).toString().slice(0,400)+' items='+JSON.stringify(items)) }
}
// 3. backups
const farm = (extra={}) => ({ schemaVersion:5, dataRev:4, points:10, lastSeen:T0, pets:[pet('d1','dog','shiba')], ownedBuildings: [], farmLayout:{items:[{id:'lamp',kind:'lamp',state:'stored'}]}, ...extra })
const bk = (fv, f) => JSON.stringify({ format:'aemc-desktop-backup', formatVersion: fv, exportedAt: new Date(T0).toISOString(), data: { farm: f, appList: { schemaVersion: 1, apps: [] } } })
for (const fv of [2,3,4,5,6,7]) for (const dr of [3,4,5,undefined]) { const t = bk(fv, farm({dataRev:dr})); const r = parseBackup(t, t.length); out['bk'+fv+'_'+dr] = r.ok ? 'ok layout='+JSON.stringify(r.backup.data.farm.farmLayout)+' dataRev='+r.backup.data.farm.dataRev : r.error }
import assert from 'node:assert/strict'
// 判定：沒有例外、沒有逾時、損壞資料清理結果正確、匯入格式矩陣符合預期
const NEWER = '這個存檔來自較新版本，請重新整理網頁更新後再試'
assert.deepEqual(out.errors, [], '隨機擺放／清理有例外：' + out.errors.join(' | '))
assert.deepEqual(out.slow, [], '有擺放讓版面計算超過 3 秒')
assert.equal(out.odd0, '{"items":[{"id":"lamp","kind":"lamp","state":"placed","x":1,"y":2}]}', '__proto__ 當 id 要丟掉')
assert.equal(out.odd1, '{"items":[{"id":"house","kind":"house","state":"placed"}]}', '不能收的物件寫成 stored 要改成擺放')
assert.equal(out.odd2, '{"items":[{"id":"tree1","kind":"tree","state":"placed","x":640,"y":0}]}', '極端座標夾回範圍')
assert.equal(out.odd3, '{"items":[{"id":"tree1","kind":"tree","state":"placed"}]}', '座標型別錯誤 → 回預設位置')
assert.equal(out.odd4, '{"items":[{"id":"planter","kind":"planter","state":"stored"}]}', '沒有預設位置的壞座標 → 倉庫')
assert.equal(out.odd5, '{"items":[]}', 'kind 與 id 對不上要丟掉')
assert.equal(out.odd6, '{"items":[]}', 'constructor／toString 當 id 要丟掉')
assert.equal(out.odd7, '{"items":[{"id":"tree1","kind":"tree","state":"placed","x":1,"y":1}]}', '100 萬筆只留第一筆（重複 id）')
assert.equal(out.odd8, undefined, 'items 不是真的陣列 → 整個忽略')
for (const fv of [2, 3, 4, 5]) for (const dr of [3, 4, undefined]) assert.match(out['bk' + fv + '_' + dr], /^ok layout=undefined dataRev=4$/, `格式 ${fv} dataRev ${dr}：不讀 farmLayout`)
for (const dr of [3, 4, undefined]) assert.match(out['bk6_' + dr], /^ok layout=\{"items":\[\{"id":"lamp"/, `格式 6 dataRev ${dr}：讀 farmLayout`)
for (const fv of [2, 3, 4, 5, 6, 7]) assert.equal(out['bk' + fv + '_5'], NEWER, `dataRev 5 一律拒絕（格式 ${fv}）`)
for (const dr of [3, 4, 5, undefined]) assert.equal(out['bk7_' + dr], NEWER, '格式 7 拒絕')
console.log('review-fuzz：300 組隨機擺放 + 損壞資料 + 匯入格式矩陣全部通過')
