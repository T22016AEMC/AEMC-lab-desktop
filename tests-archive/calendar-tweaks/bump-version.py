# 改版本號腳本（比照 adapt-c.py）：把「寫死的版本字串」從 OLD 改成 NEW，其他一律不動。重複執行無害（已改過的會略過）。
# 用法：在 virtual-desktop 根目錄執行 python tests-archive/calendar-tweaks/bump-version.py [OLD NEW]（預設 3.10.0 3.10.1）
# 版本字串的來源只有 package.json：vite.config.ts 把它注入成 __APP_VERSION__，「關於」視窗、匯出檔的 appVersion 都讀它；
# PWA／service worker 快取是 vite-plugin-pwa 依建置內容產生的 precache 版本（沒有寫死版本號），所以不用改。
import re, sys
OLD, NEW = (sys.argv[1], sys.argv[2]) if len(sys.argv) == 3 else ('3.10.0', '3.10.1')
EDITS = {
  'package.json': [(f'"version": "{OLD}"', f'"version": "{NEW}"')],
  # 測試：建立匯出檔時傳入的 appVersion（讀回比對用，不是判斷條件）
  'tests-archive/calendar-tweaks/node/ct-c-calendar-entry.js': [(f"BK.buildBackup(withC, appList, '{OLD}'", f"BK.buildBackup(withC, appList, '{NEW}'")],
}
total = 0
for p, edits in EDITS.items():
    s = open(p, encoding='utf-8').read()
    for old, new in edits:
        if new in s and old not in s:
            continue
        if old not in s:
            sys.exit(f'找不到（{p}）：{old}')
        s = s.replace(old, new, 1)
        total += 1
    open(p, 'w', encoding='utf-8', newline='').write(s)
# package-lock.json 的 version 是舊的 1.0.1（早就和 package.json 脫鉤、沒有任何程式讀它），不改。
print(f'bump-version：{OLD} → {NEW}，改了 {total} 處')
