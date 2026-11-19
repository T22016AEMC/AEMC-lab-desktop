# v4.0 階段 A 對既有測試（tests-archive/v390、tests-archive/calendar-tweaks）的預期值異動。可重複執行（已改過的會略過）。
# 只改三類（都是使用者在 4.0 階段 A 指令裡列出可以改的）：
#   1. 存檔版本常數：DATA_REV 5 → 6、匯出格式 7 → 8（「較新版本」的 dataRev 6 → 7、格式 8 → 9；匯入矩陣多一格）
#   2. 事件：L001～L004 全部收集時，多了獨立的新事件「傳說全集齊」（colLegend）
#   3. 提示文字：「草地太擠」→「擺設太多」（補充 c）
# 舊的購買介面（t4、t5 的購買分頁）另外改寫操作入口，見 README。判斷邏輯不動；每一處都註明 v4.0。
# 用法：在 virtual-desktop 根目錄執行 python tests-archive/v400a/adapt-a.py
import sys

EDITS = {
  'tests-archive/calendar-tweaks/node/ct-c-calendar-entry.js': [
    ("eq([CURRENT_SCHEMA_VERSION, DATA_REV, BK.BACKUP_FORMAT_VERSION, BK.CHECKINS_FORMAT_VERSION, M.CHECKIN_MAX], [5, 5, 7, 7, 62], 'schema 5、DATA_REV 5、匯出格式 7、checkins 從 7 起讀、上限 62')",
     "eq([CURRENT_SCHEMA_VERSION, DATA_REV, BK.BACKUP_FORMAT_VERSION, BK.CHECKINS_FORMAT_VERSION, M.CHECKIN_MAX], [5, 6, 8, 7, 62], 'schema 5、DATA_REV 5、匯出格式 7、checkins 從 7 起讀、上限 62（v4.0：DATA_REV 6、匯出格式 8）')"),
    ("ok(M.isNewerData({ ...v4, dataRev: 6 }) && !M.isNewerData({ ...v4, dataRev: 5 }), 'dataRev 6 是較新、5 不是')",
     "ok(M.isNewerData({ ...v4, dataRev: 7 }) && !M.isNewerData({ ...v4, dataRev: 6 }) && !M.isNewerData({ ...v4, dataRev: 5 }), 'dataRev 6 是較新、5 不是（v4.0：7 是較新、6 不是）')"),
    ("for (const fv of [2, 3, 4, 5, 6, 7, 8]) {\n  for (const dr of [3, 4, 5, 6]) {",
     "for (const fv of [2, 3, 4, 5, 6, 7, 8, 9]) { // v4.0：多一格（格式 8、dataRev 6 是目前版本）\n  for (const dr of [3, 4, 5, 6, 7]) {"),
    ("    const want = fv <= 7 && dr <= 5\n", "    const want = fv <= 8 && dr <= 6 // v4.0：原本 fv <= 7 && dr <= 5\n"),
    ("    if (!res.ok && (fv > 7 || dr > 5))", "    if (!res.ok && (fv > 8 || dr > 6))"),
    ("eq([built.formatVersion, built.data.farm.checkins], [7, ['2026-11-17', '2026-11-18']], '匯出：格式 7、帶 checkins')",
     "eq([built.formatVersion, built.data.farm.checkins], [8, ['2026-11-17', '2026-11-18']], '匯出：格式 7、帶 checkins（v4.0：格式 8）')"),
    ("eq([np.dataRev, 'checkins' in np], [5, false], '新版：dataRev 5、沒有 checkins 欄位')",
     "eq([np.dataRev, 'checkins' in np], [6, false], '新版：dataRev 5、沒有 checkins 欄位（v4.0：dataRev 6）')"),
    ("eq(JSON.parse(LS.get(KEY)).dataRev, 5, '寫入的 dataRev 5')", "eq(JSON.parse(LS.get(KEY)).dataRev, 6, '寫入的 dataRev 5（v4.0：6）')"),
  ],
  'tests-archive/calendar-tweaks/node/ct-v3101-compat-entry.js': [
    ("  const exp = JSON.stringify(OBK.buildBackup(newOut, appList, '3.10.0', new Date(T0)))",
     "  const exp = JSON.stringify(OBK.buildBackup(oldOut, appList, '3.10.0', new Date(T0))) // v4.0：3.10.0 的匯出檔用 3.10.0 讀出的存檔（dataRev 5）來做（新版讀出的是 dataRev 6）"),
    ("eq([T.CURRENT_SCHEMA_VERSION, T.DATA_REV, BK.BACKUP_FORMAT_VERSION, BK.MIN_BACKUP_FORMAT_VERSION, BK.CHECKINS_FORMAT_VERSION, BK.LAYOUT_FORMAT_VERSION, BK.NOTES_FORMAT_VERSION],\n  [OT.CURRENT_SCHEMA_VERSION, OT.DATA_REV, OBK.BACKUP_FORMAT_VERSION, OBK.MIN_BACKUP_FORMAT_VERSION, OBK.CHECKINS_FORMAT_VERSION, OBK.LAYOUT_FORMAT_VERSION, OBK.NOTES_FORMAT_VERSION], '常數與 3.10.0 相同')",
     "eq([T.CURRENT_SCHEMA_VERSION, T.DATA_REV - 1, BK.BACKUP_FORMAT_VERSION - 1, BK.MIN_BACKUP_FORMAT_VERSION, BK.CHECKINS_FORMAT_VERSION, BK.LAYOUT_FORMAT_VERSION, BK.NOTES_FORMAT_VERSION],\n  [OT.CURRENT_SCHEMA_VERSION, OT.DATA_REV, OBK.BACKUP_FORMAT_VERSION, OBK.MIN_BACKUP_FORMAT_VERSION, OBK.CHECKINS_FORMAT_VERSION, OBK.LAYOUT_FORMAT_VERSION, OBK.NOTES_FORMAT_VERSION], '常數與 3.10.0 相同（v4.0：DATA_REV、匯出格式各 +1，其餘相同）')"),
    ("eq([T.CURRENT_SCHEMA_VERSION, T.DATA_REV, BK.BACKUP_FORMAT_VERSION], [5, 5, 7], 'schema 5、DATA_REV 5、匯出格式 7')",
     "eq([T.CURRENT_SCHEMA_VERSION, T.DATA_REV, BK.BACKUP_FORMAT_VERSION], [5, 6, 8], 'schema 5、DATA_REV 5、匯出格式 7（v4.0：6、8）')"),
    ("  eq(newOut, oldOut, `${name}：parseSave 結果與 3.10.0 逐欄相同`)\n  eq([newOut.dataRev, newOut.schemaVersion], [5, 5], `${name}：dataRev／schema 不變`)",
     "  eq({ ...newOut, dataRev: 5 }, oldOut, `${name}：parseSave 結果與 3.10.0 逐欄相同（v4.0：除了 dataRev）`)\n  eq([newOut.dataRev, newOut.schemaVersion], [6, 5], `${name}：dataRev／schema 不變（v4.0：dataRev 6）`)"),
    ("  eq(imp.backup.data.farm, OBK.parseBackup(exp, exp.length).backup.data.farm, `${name}：匯入內容與 3.10.0 匯入逐欄相同`)",
     "  eq({ ...imp.backup.data.farm, dataRev: 5 }, OBK.parseBackup(exp, exp.length).backup.data.farm, `${name}：匯入內容與 3.10.0 匯入逐欄相同（v4.0：除了 dataRev）`)"),
    ("  eq({ ...exp2, appVersion: 'x' }, { ...exp1, appVersion: 'x' }, `${name}：3.10.1 匯出與 3.10.0 匯出只差 appVersion`)\n  eq([exp2.formatVersion, exp2.data.farm.dataRev], [7, 5], `${name}：匯出格式 7、dataRev 5`)\n  ok(OBK.parseBackup(JSON.stringify(exp2), 1e5).ok, `${name}：3.10.1 匯出檔 3.10.0 也能匯入`)",
     "  eq({ ...exp2, appVersion: 'x', formatVersion: 7, data: { ...exp2.data, farm: { ...exp2.data.farm, dataRev: 5 } } }, { ...exp1, appVersion: 'x' }, `${name}：3.10.1 匯出與 3.10.0 匯出只差 appVersion（v4.0：還差格式版本與 dataRev）`)\n  eq([exp2.formatVersion, exp2.data.farm.dataRev], [8, 6], `${name}：匯出格式 7、dataRev 5（v4.0：8、6）`)\n  ok(!OBK.parseBackup(JSON.stringify(exp2), 1e5).ok, `${name}：v4.0 的匯出檔 3.10.0 不能匯入（較新版本，不會把 shop 默默丟掉）`)"),
    ("eq([st.save.points, st.save.pets.length, st.save.events.dogLeak, st.save.checkins, st.save.dataRev], [321, 2, T0 - 1000, ['2026-11-01', '2026-11-18', '2026-11-19'], 5], '金幣、寵物、事件旗標、簽到紀錄、dataRev 都沒變')",
     "eq([st.save.points, st.save.pets.length, st.save.events.dogLeak, st.save.checkins, st.save.dataRev], [321, 2, T0 - 1000, ['2026-11-01', '2026-11-18', '2026-11-19'], 6], '金幣、寵物、事件旗標、簽到紀錄、dataRev 都沒變（v4.0：dataRev 6）')"),
  ],
}

def main():
  import os
  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  EDITS.update(__import__('adapt_a_v390').EDITS_V390)
  br = __import__('adapt_a_browser')
  EDITS.update(br.EDITS_BROWSER)
  # 區塊替換（t5 第 10、13 段）：開頭標記到結尾標記之間整段換掉；已經換過（內容含 v4.0 標記）就略過
  for path, start, end, new in br.BLOCKS:
    with open(path, encoding='utf-8', newline='') as f:
      t = f.read()
    crlf = '\r\n' in t
    t = t.replace('\r\n', '\n')
    if new in t:
      continue
    i = t.index(start)
    j = t.index(end, i)
    t = t[:i] + new + t[j:]
    if crlf:
      t = t.replace('\n', '\r\n')
    with open(path, 'w', encoding='utf-8', newline='') as f:
      f.write(t)
  changed = 0
  for path, edits in EDITS.items():
    with open(path, encoding='utf-8', newline='') as f:
      s = f.read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for old, new in edits:
      if new in s:
        continue
      if old not in s:
        print('找不到（也沒改過）：', path, old[:90])
        sys.exit(1)
      s = s.replace(old, new, 1)
      changed += 1
    if crlf:
      s = s.replace('\n', '\r\n')
    with open(path, 'w', encoding='utf-8', newline='') as f:
      f.write(s)
  print(f'改了 {changed} 處')

main()
