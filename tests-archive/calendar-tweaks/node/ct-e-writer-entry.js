// E 兩分頁寫入權（儲存層）：單一分頁永不誤判、後開的分頁接手、被接手的不寫、storage 事件、匯入先接手、
// 寫入權鍵讀寫失敗退回 v3.9.x 行為、較新版本不接手、舊測試的多個儲存層物件（同一頁）互不影響、隨機交錯寫入只留擁有者的
import { store as LS, faults, fire, listeners } from './env-shim.js'
import assert from 'node:assert/strict'
import { LocalStorageAdapter, WRITER_KEY, setOtherTabHandler, setNewerDataHandler } from '../../../src/farm/save/storage.ts'
import { applyBackup } from '../../../src/lib/backup.ts'
import { LocalStorageDocument } from '../../../src/lib/documentStorage.ts'
import { newSave, todayKey } from '../../../src/farm/sim/points.ts'
import { DATA_REV } from '../../../src/farm/save/types.ts'
import { LocalStorageAdapter as OldAdapter } from '../.work/v391src/src/farm/save/storage.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const T0 = new Date(2026, 10, 19, 12, 0, 0).getTime()
const today = todayKey(T0)
const S = (points) => ({ ...newSave(T0, today), points })
const KEY = 'aemc-desktop:farm-save'
let lost = 0
setOtherTabHandler(() => { lost++ })
setNewerDataHandler(() => {})
const reset = () => { LS.clear(); faults.get.clear(); faults.set.clear(); lost = 0; listeners.length = 0 }
const pts = () => JSON.parse(LS.get(KEY)).points
const tab = (id) => new LocalStorageAdapter(undefined, undefined, undefined, id)

// 1. 單一分頁：載入、1000 次存檔、重新整理（新的頁面 id）20 次，每次都存，提示 0 次
reset()
LS.set(KEY, JSON.stringify(S(1)))
let page = tab('p0')
await page.loadOrReset(() => S(0))
for (let i = 0; i < 1000; i++) await page.save(S(100 + i))
eq(pts(), 1099, '單一分頁 1000 次存檔都寫入')
for (let r = 1; r <= 20; r++) {
  await page.save(S(5000 + r)) // 離開前最後一次（beforeunload）：新頁面還沒接手，照樣寫入
  eq(pts(), 5000 + r, `重新整理 ${r}：離開前最後一次寫入成功`)
  page = tab('p' + r)
  const lr = await page.loadOrReset(() => S(0))
  eq(lr.save.points, 5000 + r, `重新整理 ${r}：新頁面讀到最後一次寫入`)
  for (let i = 0; i < 20; i++) await page.save(S(6000 + r * 100 + i))
  ok(await page.isOwner(), `重新整理 ${r}：仍是擁有者`)
}
eq(lost, 0, '單一分頁：寫入權提示 0 次')
eq(JSON.parse(LS.get(WRITER_KEY)).id, 'p20', '寫入權鍵是最後一個頁面')

// 2. 兩個分頁：B 後開 → A 被接手；A 寫不進去、B 寫得進去；提示只一次
reset()
LS.set(KEY, JSON.stringify(S(10)))
const A = tab('A')
const B = tab('B')
await A.loadOrReset(() => S(0))
await A.save(S(11))
eq(pts(), 11, 'A 擁有時寫入')
await B.loadOrReset(() => S(0))
ok(!(await A.isOwner()) && (await B.isOwner()), 'B 開啟後 B 是擁有者、A 不是')
await A.save(S(999))
eq(pts(), 11, 'A 被接手後寫不進去')
eq(lost, 1, 'A 的提示 1 次')
await A.save(S(998))
eq(lost, 1, '再寫一次也只提示一次')
await B.save(S(12))
eq(pts(), 12, 'B 寫得進去')
// A 重新整理（新 id）→ 接手；B 變成被接手
const A2 = tab('A2')
const lrA2 = await A2.loadOrReset(() => S(0))
eq(lrA2.save.points, 12, 'A 重新整理後讀到 B 的最後一次寫入（不是自己記憶體裡的 999）')
await B.save(S(13))
eq(pts(), 12, 'A 重新整理後 B 寫不進去')
eq(lost, 2, 'B 的提示（共 2 次）')

// 3. storage 事件：別的分頁接手時立刻通知（不用等存檔）；自己的 id、別的鍵、壞內容、清空都不通知
reset()
const C = tab('C')
await C.loadOrReset(() => S(0))
fire('storage', { key: KEY, newValue: JSON.stringify(S(1)) })
fire('storage', { key: WRITER_KEY, newValue: JSON.stringify({ id: 'C', at: 1 }) })
fire('storage', { key: WRITER_KEY, newValue: 'not json' })
fire('storage', { key: WRITER_KEY, newValue: null })
fire('storage', { key: null, newValue: null })
eq(lost, 0, '存檔鍵、自己的 id、壞內容、刪除、clear 的事件都不通知')
fire('storage', { key: WRITER_KEY, newValue: JSON.stringify({ id: 'D', at: 2 }) })
ok(lost >= 1, '別的 id 接手 → 立刻通知')

// 4. 寫入權鍵讀寫失敗：退回 v3.9.x 行為（照樣寫），絕不鎖死
reset()
LS.set(KEY, JSON.stringify(S(1)))
faults.set.add(WRITER_KEY)
const E1 = tab('E1')
const E2 = tab('E2')
await E1.loadOrReset(() => S(0))
await E2.loadOrReset(() => S(0))
await E1.save(S(21))
eq(pts(), 21, '寫入權鍵寫不進去：E1 照樣寫')
await E2.save(S(22))
eq(pts(), 22, '寫入權鍵寫不進去：E2 照樣寫（兩分頁互相覆蓋 = v3.9.x 行為）')
eq(lost, 0, '寫入權鍵寫不進去：不提示')
reset()
LS.set(KEY, JSON.stringify(S(1)))
const F1 = tab('F1')
await F1.loadOrReset(() => S(0))
LS.set(WRITER_KEY, JSON.stringify({ id: 'someone-else', at: 1 }))
faults.get.add(WRITER_KEY)
await F1.save(S(31))
eq(pts(), 31, '寫入權鍵讀不到（例外）：照樣寫')
faults.get.clear()
LS.set(WRITER_KEY, '{壞掉')
await F1.save(S(32))
eq(pts(), 32, '寫入權鍵內容壞掉：照樣寫')
LS.set(WRITER_KEY, JSON.stringify({ id: '', at: 1 }))
await F1.save(S(33))
eq(pts(), 33, '寫入權鍵 id 空字串：照樣寫')
LS.delete(WRITER_KEY)
await F1.save(S(34))
eq(pts(), 34, '寫入權鍵被刪掉（例如清除網站資料）：照樣寫')
eq(lost, 0, '以上都不提示')

// 5. 較新版本的存檔：不接手（新版分頁繼續運作）
reset()
LS.set(KEY, JSON.stringify({ ...S(1), dataRev: DATA_REV + 1 }))
LS.set(WRITER_KEY, JSON.stringify({ id: 'future', at: 1 }))
const G = tab('G')
const lrG = await G.loadOrReset(() => S(0))
ok(lrG.newer === true, '較新版本 → newer')
eq(JSON.parse(LS.get(WRITER_KEY)).id, 'future', '較新版本：寫入權沒有被搶走')

// 6. 匯入：先接手（另一個分頁在「匯入後、重新整理前」寫不進去）；沒有 claim 的舊替身照常匯入
reset()
LS.set(KEY, JSON.stringify(S(1)))
const H1 = tab('H1')
const H2 = tab('H2')
await H1.loadOrReset(() => S(0))
await H2.loadOrReset(() => S(0)) // H2 是擁有者
const appList = new LocalStorageDocument('t-app-list', (r) => r)
const backup = { format: 'aemc-desktop-backup', formatVersion: 6, exportedAt: '', appVersion: '', data: { farm: S(777), appList: { schemaVersion: 1, apps: [] } } }
eq(await applyBackup(backup, H1, appList), null, 'H1（不是擁有者）匯入成功')
eq(pts(), 777, '匯入的存檔寫進去了')
await H2.save(S(2))
eq(pts(), 777, 'H2 在 H1 重新整理前寫不進去（匯入沒被蓋掉）')
const plain = { snapshot: async () => LS.get(KEY) ?? null, saveStrict: async (d) => { LS.set(KEY, JSON.stringify(d)) }, restore: async () => {} }
eq(await applyBackup({ ...backup, data: { ...backup.data, farm: S(778) } }, plain, appList), null, '沒有 claim 的儲存層替身照常匯入')
eq(pts(), 778, '替身匯入寫入')

// 7. 同一頁的多個儲存層物件（舊測試的寫法、預設 id）互不影響
reset()
const d1 = new LocalStorageAdapter()
await d1.loadOrReset(() => S(0))
const d2 = new LocalStorageAdapter()
await d2.loadOrReset(() => S(0))
await d1.save(S(41))
eq(pts(), 41, '同一頁的兩個物件：前一個仍寫得進去')
eq(lost, 0, '同一頁：不提示')

// 8. 舊版 v3.9.1 的儲存層不認得寫入權；新版寫的存檔 dataRev 比它新（C 起 DATA_REV 5），所以舊版不覆寫
reset()
LS.set(KEY, JSON.stringify(S(1)))
const N1 = tab('N1')
await N1.loadOrReset(() => S(0))
await new OldAdapter().save(S(51))
eq(pts(), DATA_REV > 4 ? 1 : 51, DATA_REV > 4 ? '舊版 v3.9.1 儲存層：讀到 dataRev 5 不覆寫（由 DATA_REV 保護）' : '舊版儲存層不看寫入權（C 之前：照樣寫）')

// 9. 隨機交錯（500 回合）：任何時刻只有最後接手的分頁寫得進去，存檔一定等於擁有者最後一次寫入
let seed = 9
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
for (let round = 0; round < 500; round++) {
  reset()
  LS.set(KEY, JSON.stringify(S(0)))
  const tabs = [tab('x0'), tab('x1'), tab('x2')]
  let owner = -1
  let ownerLast = 0
  for (let step = 0; step < 30; step++) {
    const i = Math.floor(rnd() * 3)
    if (rnd() < 0.2) {
      await tabs[i].loadOrReset(() => S(0))
      owner = i
      ownerLast = pts()
    } else {
      const v = round * 1000 + step + 1
      await tabs[i].save(S(v))
      if (i === owner || owner === -1) ownerLast = v
    }
    eq(pts(), ownerLast, `交錯 ${round}/${step}：存檔 = 擁有者最後一次寫入`)
  }
}

console.log(`通過 E 兩分頁寫入權：${n} 項`)
