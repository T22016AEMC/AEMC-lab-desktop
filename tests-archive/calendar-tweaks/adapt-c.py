# v3.10.0 C（簽到月曆）對 tests-archive/v390 舊測試的預期值異動：DATA_REV 4 → 5、匯出格式 6 → 7。
# 只改「寫死的版本號」與它們的說明文字，判斷邏輯不動；每一處都註明 v3.10.0。重複執行無害（已改過的會略過）。
# 用法：在 virtual-desktop 根目錄執行 python tests-archive/calendar-tweaks/adapt-c.py
import sys
BASE = 'tests-archive/v390/node/'
PERSONALITY_OLD = "  if (st.dataRev !== 4 || !st.pets.every((p) => typeof p.personality === 'string')) throw new Error('寫回的存檔沒有 dataRev 3 或缺個性')"
PERSONALITY_NEW = "  if (st.dataRev !== 5 || !st.pets.every((p) => typeof p.personality === 'string')) throw new Error('寫回的存檔沒有 dataRev 3 或缺個性') // v3.10.0：dataRev 5"
EDITS = {
  'v380-adapt-v360-logic-entry.js': [
    ("[{}, [], {}, { owned: [], equipped: {} }, 4, 5], '新欄位補預設；schemaVersion 維持 5（v3.8.0：dataRev 3）')",
     "[{}, [], {}, { owned: [], equipped: {} }, 5, 5], '新欄位補預設；schemaVersion 維持 5（v3.8.0：dataRev 3；v3.10.0：dataRev 5）')"),
    ("eq(JSON.parse(store.get('t-key')).dataRev, 4, '同版本正常寫入（v3.8.0：dataRev 3）')",
     "eq(JSON.parse(store.get('t-key')).dataRev, 5, '同版本正常寫入（v3.8.0：dataRev 3；v3.10.0：dataRev 5）')"),
    ("eq(isNewerData({ schemaVersion: 5, dataRev: 4 }), false); eq(isNewerData({ schemaVersion: 5, dataRev: 5 }), true)",
     "eq(isNewerData({ schemaVersion: 5, dataRev: 4 }), false); eq(isNewerData({ schemaVersion: 5, dataRev: 5 }), false); eq(isNewerData({ schemaVersion: 5, dataRev: 6 }), true) // v3.10.0：5 是目前版本"),
    ("eq(BACKUP_FORMAT_VERSION, 6, '匯出檔格式版本 5（v3.8.0）')", "eq(BACKUP_FORMAT_VERSION, 7, '匯出檔格式版本 5（v3.8.0；v3.10.0：7）')"),
    ("eq(b3.formatVersion, 6) // v3.8.0", "eq(b3.formatVersion, 7) // v3.8.0；v3.10.0：7"),
    (PERSONALITY_OLD, PERSONALITY_NEW),
    ("  const newer = { ...raw, dataRev: 5, points: 999 }", "  const newer = { ...raw, dataRev: 6, points: 999 } // v3.10.0：較新的是 dataRev 6"),
    ("{ farm: { ...col, dataRev: 5 }, appList: list } }), 100).error", "{ farm: { ...col, dataRev: 6 }, appList: list } }), 100).error"),
    ("eq(parseBackup(JSON.stringify({ ...b2, formatVersion: 7 }), 100).error, '這個存檔來自較新版本，請重新整理網頁更新後再試', 'v7 → 較新版本（v3.9.0：6 是目前版本）')", "eq(parseBackup(JSON.stringify({ ...b2, formatVersion: 8 }), 100).error, '這個存檔來自較新版本，請重新整理網頁更新後再試', 'v7 → 較新版本（v3.9.0：6 是目前版本；v3.10.0：v8，7 是目前版本）')"),
  ],
  'v380-adapt-v361-logic-entry.js': [
    ("eq(S37(parsed), { ...v360, dataRev: 4, notes: [] }, 'v3.6.0 存檔 → v3.8.0：", "eq(S37(parsed), { ...v360, dataRev: 5, notes: [] }, 'v3.6.0 存檔 → v3.8.0（v3.10.0：dataRev 5）："),
    ("eq(S37(p3.backup.data.farm), { ...v360, dataRev: 4, notes: [] }, '匯出再匯入完全相同", "eq(S37(p3.backup.data.farm), { ...v360, dataRev: 5, notes: [] }, '匯出再匯入完全相同（v3.10.0：dataRev 5）"),
    ("eq(b3.formatVersion, 6) // v3.8.0：匯出格式 5", "eq(b3.formatVersion, 7) // v3.8.0：匯出格式 5；v3.10.0：7"),
    (PERSONALITY_OLD, PERSONALITY_NEW),
  ],
  'v380-adapt-v370-data-entry.js': [
    ("  eq(b.formatVersion, 6) // v3.8.0\n", "  eq(b.formatVersion, 7) // v3.8.0；v3.10.0：7\n"),
    ("[4, 2, 3, 321, ['kennel', 'bowls', 'catTree']]) // v3.9.0：dataRev 4", "[5, 2, 3, 321, ['kennel', 'bowls', 'catTree']]) // v3.9.0：dataRev 4；v3.10.0：5"),
    ("eq([warned, JSON.parse(store.get('aemc-desktop:farm-save')).dataRev], [1, 5], 'dataRev 5 → 不覆寫（v3.8.0）')", "eq([warned, JSON.parse(store.get('aemc-desktop:farm-save')).dataRev], [1, 6], 'dataRev 5 → 不覆寫（v3.8.0；v3.10.0：6）')"),
    ("eq(parseBackup(JSON.stringify({ ...b, formatVersion: 7 }), 100).error, NEWER_VERSION_MESSAGE, 'v7 → 較新版本（v3.9.0：6 是目前版本）')", "eq(parseBackup(JSON.stringify({ ...b, formatVersion: 8 }), 100).error, NEWER_VERSION_MESSAGE, 'v7 → 較新版本（v3.9.0：6 是目前版本；v3.10.0：v8）')"),
    ("  store.set('aemc-desktop:farm-save', JSON.stringify({ ...back, dataRev: 5 }))", "  store.set('aemc-desktop:farm-save', JSON.stringify({ ...back, dataRev: 6 })) // v3.10.0：較新的是 dataRev 6"),
    ("eq([notes, dataRev, DATA_REV], [[], 4, 4], 'notes 補成空、dataRev 3（v3.8.0）')", "eq([notes, dataRev, DATA_REV], [[], 5, 5], 'notes 補成空、dataRev 3（v3.8.0；v3.10.0：5）')"),
    ("eq(BACKUP_FORMAT_VERSION, 6, '匯出檔格式版本 5（v3.8.0）')", "eq(BACKUP_FORMAT_VERSION, 7, '匯出檔格式版本 5（v3.8.0；v3.10.0：7）')"),
    (PERSONALITY_OLD, PERSONALITY_NEW),
  ],
  'v380-adapt-v371-logic-entry.js': [
    (PERSONALITY_OLD, PERSONALITY_NEW),
    ("eq(b.formatVersion, 6, '匯出格式 6（v3.9.0）'); eq(BACKUP_FORMAT_VERSION, 6)", "eq(b.formatVersion, 7, '匯出格式 6（v3.9.0；v3.10.0：7）'); eq(BACKUP_FORMAT_VERSION, 7)"),
  ],
  'v380-logic-entry.js': [
    ("eq(parseBackup(JSON.stringify({ ...b, formatVersion: 7 }), 100).error, '這個存檔來自較新版本，請重新整理網頁更新後再試', '格式 7 → 較新版本（v3.9.0）')", "eq(parseBackup(JSON.stringify({ ...b, formatVersion: 8 }), 100).error, '這個存檔來自較新版本，請重新整理網頁更新後再試', '格式 7 → 較新版本（v3.9.0；v3.10.0：格式 8）')"),
    ("eq([s.dataRev, DATA_REV, 'picnic' in s], [4, 4, false], 'dataRev 3、沒有野餐紀錄')", "eq([s.dataRev, DATA_REV, 'picnic' in s], [5, 5, false], 'dataRev 3、沒有野餐紀錄（v3.10.0：dataRev 5）')"),
    ("eq([b.formatVersion, BACKUP_FORMAT_VERSION, MIN_BACKUP_FORMAT_VERSION], [6, 6, 2], '匯出格式 6、匯入接受 2～6（v3.9.0）')", "eq([b.formatVersion, BACKUP_FORMAT_VERSION, MIN_BACKUP_FORMAT_VERSION], [7, 7, 2], '匯出格式 6、匯入接受 2～6（v3.9.0；v3.10.0：7、2～7）')"),
  ],
  'v390-save-entry.js': [
    ("eq(newSave.dataRev, 4, 'S5 新版存檔 dataRev 4')", "eq(newSave.dataRev, 5, 'S5 新版存檔 dataRev 4（v3.10.0：5）')"),
    ("eq(a.dataRev, 4, 'S1 dataRev 4')", "eq(a.dataRev, 5, 'S1 dataRev 4（v3.10.0：5）')"),
    ("eq(DATA_REV, 4, 'DATA_REV = 4')", "eq(DATA_REV, 5, 'DATA_REV = 4（v3.10.0：5）')"),
    ("eq({ ...a, dataRev: 3 }, b, 'S1 其他欄位和 v3.8.1 的 parseSave 逐欄相同')", "eq({ ...a, dataRev: 3 }, b, 'S1 其他欄位和 v3.8.1 的 parseSave 逐欄相同')"),
    ("  ok(isNewerData({ ...BASE, dataRev: 5 }), 'dataRev 5 算較新')", "  ok(!isNewerData({ ...BASE, dataRev: 5 }), 'dataRev 5 不算較新（v3.10.0：5 是目前版本）')\n  ok(isNewerData({ ...BASE, dataRev: 6 }), 'dataRev 6 算較新（v3.10.0）')"),
    ("eq(BACKUP_FORMAT_VERSION, 6, '匯出格式 6')", "eq(BACKUP_FORMAT_VERSION, 7, '匯出格式 6（v3.10.0：7）')"),
    ("for (const [m, fv, rev] of [['格式 7', 7, 4], ['格式 6 但 dataRev 5', 6, 5]]) {", "for (const [m, fv, rev] of [['格式 8', 8, 4], ['格式 6 但 dataRev 6', 6, 6]]) { // v3.10.0：較新的是格式 8、dataRev 6"),
    ("eq(exp.formatVersion, 6, 'S6 匯出 formatVersion 6')", "eq(exp.formatVersion, 7, 'S6 匯出 formatVersion 6（v3.10.0：7）')"),
  ],
  'review-fuzz-entry.js': [
    ("for (const fv of [2,3,4,5,6,7]) for (const dr of [3,4,5,undefined])", "for (const fv of [2,3,4,5,6,7,8]) for (const dr of [3,4,5,6,undefined])"),
    ("for (const fv of [2, 3, 4, 5]) for (const dr of [3, 4, undefined]) assert.match(out['bk' + fv + '_' + dr], /^ok layout=undefined dataRev=4$/, `格式 ${fv} dataRev ${dr}：不讀 farmLayout`)",
     "for (const fv of [2, 3, 4, 5]) for (const dr of [3, 4, 5, undefined]) assert.match(out['bk' + fv + '_' + dr], /^ok layout=undefined dataRev=5$/, `格式 ${fv} dataRev ${dr}：不讀 farmLayout（v3.10.0：dataRev 5）`)"),
    ("for (const dr of [3, 4, undefined]) assert.match(out['bk6_' + dr], /^ok layout=\\{\"items\":\\[\\{\"id\":\"lamp\"/, `格式 6 dataRev ${dr}：讀 farmLayout`)",
     "for (const fv of [6, 7]) for (const dr of [3, 4, 5, undefined]) assert.match(out['bk' + fv + '_' + dr], /^ok layout=\\{\"items\":\\[\\{\"id\":\"lamp\"/, `格式 ${fv} dataRev ${dr}：讀 farmLayout（v3.10.0：格式 7 也讀）`)"),
    ("for (const fv of [2, 3, 4, 5, 6, 7]) assert.equal(out['bk' + fv + '_5'], NEWER, `dataRev 5 一律拒絕（格式 ${fv}）`)",
     "for (const fv of [2, 3, 4, 5, 6, 7, 8]) assert.equal(out['bk' + fv + '_6'], NEWER, `dataRev 6 一律拒絕（格式 ${fv}；v3.10.0：原本 5）`)"),
    ("for (const dr of [3, 4, 5, undefined]) assert.equal(out['bk7_' + dr], NEWER, '格式 7 拒絕')",
     "for (const dr of [3, 4, 5, 6, undefined]) assert.equal(out['bk8_' + dr], NEWER, '格式 8 拒絕（v3.10.0：原本 7）')"),
  ],
}
# 瀏覽器測試（路徑相對 tests-archive/v390/）
EDITS['../browser/t7-save-browser.mjs'] = [
    ("ok(same(changed.sort(), ['farmLayout', 'lastSeen', 'pets']), '新版載入：改變的欄位只有離線結算的 pets、lastSeen 與清理後的 farmLayout（' + changed.join(', ') + '）')",
     "ok(same(changed.sort(), ['dataRev', 'farmLayout', 'lastSeen', 'pets']), '新版載入：改變的欄位只有離線結算的 pets、lastSeen 與清理後的 farmLayout（v3.10.0：加上 dataRev 4 → 5）（' + changed.join(', ') + '）')"),
    ("raw1.dataRev === 4 && raw1.schemaVersion === 5, '自動存檔後：合法紀錄原樣保留（重疊的路燈與狗窩位置沒動）、dataRev 4、schema 5')",
     "raw1.dataRev === 5 && raw1.schemaVersion === 5, '自動存檔後：合法紀錄原樣保留（重疊的路燈與狗窩位置沒動）、dataRev 4（v3.10.0：5）、schema 5')"),
]
total = 0
for f, edits in EDITS.items():
    p = BASE + f
    s = open(p, encoding='utf-8').read()
    for old, new in edits:
        if old == new:
            continue
        if new in s and old not in s:
            continue  # 已改過
        if old not in s:
            sys.exit(f'找不到（{f}）：{old[:90]}')
        s = s.replace(old, new)
        total += 1
    open(p, 'w', encoding='utf-8', newline='').write(s)
print(f'adapt-c：改了 {total} 處')
