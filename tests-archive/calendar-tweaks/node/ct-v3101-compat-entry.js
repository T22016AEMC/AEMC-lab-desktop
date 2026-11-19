// v3.10.1：存檔格式沒變、3.10.0 存下的資料與匯出檔在目前版本都能正常載入（Node）。
// 對照組 = .work/v3100src（git tag v3.10.0 的原始碼）。
import { store as LS } from './env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as M from '../../../src/farm/save/migrate.ts'
import * as P from '../../../src/farm/sim/points.ts'
import * as T from '../../../src/farm/save/types.ts'
import * as BK from '../../../src/lib/backup.ts'
import { useFarmStore, setSaveStorage } from '../../../src/farm/store/farmStore.ts'
import { LocalStorageAdapter } from '../../../src/farm/save/storage.ts'
import * as OM from '../.work/v3100src/src/farm/save/migrate.ts'
import * as OP from '../.work/v3100src/src/farm/sim/points.ts'
import * as OT from '../.work/v3100src/src/farm/save/types.ts'
import * as OBK from '../.work/v3100src/src/lib/backup.ts'
let n = 0
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const ok = (c, m) => { n++; assert.ok(c, m) }
const KEY = 'aemc-desktop:farm-save'
const ROOT = process.env.REPO_ROOT

// 1 版本常數與 3.10.0 完全相同（不能動存檔格式）
eq([T.CURRENT_SCHEMA_VERSION, T.DATA_REV, BK.BACKUP_FORMAT_VERSION, BK.MIN_BACKUP_FORMAT_VERSION, BK.CHECKINS_FORMAT_VERSION, BK.LAYOUT_FORMAT_VERSION, BK.NOTES_FORMAT_VERSION],
  [OT.CURRENT_SCHEMA_VERSION, OT.DATA_REV, OBK.BACKUP_FORMAT_VERSION, OBK.MIN_BACKUP_FORMAT_VERSION, OBK.CHECKINS_FORMAT_VERSION, OBK.LAYOUT_FORMAT_VERSION, OBK.NOTES_FORMAT_VERSION], '常數與 3.10.0 相同')
eq([T.CURRENT_SCHEMA_VERSION, T.DATA_REV, BK.BACKUP_FORMAT_VERSION], [5, 5, 7], 'schema 5、DATA_REV 5、匯出格式 7')
eq(JSON.parse(readFileSync(ROOT + '/package.json', 'utf8')).version, '3.10.1', 'package.json 版本 3.10.1')

// 2 用 3.10.0 的程式造出各種存檔，目前版本讀出的結果逐欄相同
const T0 = new Date(2026, 10, 19, 12, 0, 0).getTime()
const pet = (id, sp, v, extra = {}) => ({ id, species: sp, variant: v, name: id, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 90, personality: 'calm', lastInteract: T0, ...extra })
const col = Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`U002-${i}`, i]))
const saves = {
  空: { ...OP.newSave(T0, '2026-11-19'), dataRev: 5 },
  完整: { ...OP.newSave(T0, '2026-11-19'), dataRev: 5, points: 321, pets: [pet('p1', 'dog', 'shiba'), pet('p2', 'cat', 'tabby', { personality: 'lazy' })], nextPetId: 3,
    ownedBuildings: ['kennel', 'bowls', 'catTree'], collection: col, events: { dogLeak: T0 - 1000 }, skins: { owned: ['house.gold'], equipped: { house: 'house.gold' } },
    checkins: ['2026-11-01', '2026-11-18', '2026-11-19'], notes: [], finds: [{ id: 'f1', kind: 'mound', by: 'dog', fx: 10, fy: 20, at: T0 }],
    farmLayout: { items: [{ id: 'lamp', x: 300, y: 600 }] }, lastDailyClaim: '2026-11-19' },
}
const appList = { schemaVersion: 1, apps: [] }
for (const [name, s] of Object.entries(saves)) {
  const oldOut = OM.parseSave(JSON.parse(JSON.stringify(s)))
  const newOut = M.parseSave(JSON.parse(JSON.stringify(s)))
  ok(oldOut && newOut, `${name}：兩版都讀得進`)
  eq(newOut, oldOut, `${name}：parseSave 結果與 3.10.0 逐欄相同`)
  eq([newOut.dataRev, newOut.schemaVersion], [5, 5], `${name}：dataRev／schema 不變`)
  eq(M.isNewerData(s), false, `${name}：不算較新版本`)
  // 3.10.0 匯出檔 → 目前版本匯入
  const exp = JSON.stringify(OBK.buildBackup(newOut, appList, '3.10.0', new Date(T0)))
  const imp = BK.parseBackup(exp, exp.length)
  ok(imp.ok, `${name}：3.10.0 匯出檔可匯入`)
  eq(imp.backup.data.farm, OBK.parseBackup(exp, exp.length).backup.data.farm, `${name}：匯入內容與 3.10.0 匯入逐欄相同`)
  // 目前版本匯出 → 與 3.10.0 匯出只差 appVersion；3.10.0 也能匯入
  const exp2 = BK.buildBackup(imp.backup.data.farm, appList, '3.10.1', new Date(T0))
  const exp1 = JSON.parse(exp)
  eq({ ...exp2, appVersion: 'x' }, { ...exp1, appVersion: 'x' }, `${name}：3.10.1 匯出與 3.10.0 匯出只差 appVersion`)
  eq([exp2.formatVersion, exp2.data.farm.dataRev], [7, 5], `${name}：匯出格式 7、dataRev 5`)
  ok(OBK.parseBackup(JSON.stringify(exp2), 1e5).ok, `${name}：3.10.1 匯出檔 3.10.0 也能匯入`)
}

// 3 實際載入（LocalStorageAdapter + farmStore.init）：不重置、金幣與寵物不變、事件旗標不變
LS.clear()
LS.set(KEY, JSON.stringify({ ...saves.完整, lastSeen: Date.now() }))
setSaveStorage(new LocalStorageAdapter())
useFarmStore.setState({ status: 'loading', save: null, otherTab: false, newerData: false, resetFailed: false })
await useFarmStore.getState().init()
const st = useFarmStore.getState()
ok(st.status === 'ready' && !st.newerData && !st.resetFailed && st.save?.resetNotice !== true, '載入 3.10.0 存檔：就緒、沒有重置／較新版本提示')
eq([st.save.points, st.save.pets.length, st.save.events.dogLeak, st.save.checkins, st.save.dataRev], [321, 2, T0 - 1000, ['2026-11-01', '2026-11-18', '2026-11-19'], 5], '金幣、寵物、事件旗標、簽到紀錄、dataRev 都沒變')
eq(st.pendingEvents.length, 0, '已觸發過的事件不會再出現')
console.log(`通過 3.10.1 相容性：${n} 項`)
