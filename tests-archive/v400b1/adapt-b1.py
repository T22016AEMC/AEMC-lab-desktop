# 4.0 階段 B1 對既有測試的預期值異動。可重複執行：已改過的略過。
# 用法：python tests-archive/v400b1/adapt-b1.py
import io
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

# (檔案, 舊字串, 新字串, 說明)
EDITS = [
    (
        'v390/node/v370-layout-entry.js',
        "const CLOCKS = ['clocktower', 'clocktower_open', 'clocktower_gold', 'clocktower_open_gold'].map((k) => [k, man.frames[k].meta.clock])",
        "const CLOCKS = ['clocktower', 'clocktower_open', 'tower_atlantis', 'tower_atlantis_open'].map((k) => [k, man.frames[k].meta.clock]) // 4.0-B1：全黃金鐘樓換成亞特蘭提斯鐘樓",
        '鐘樓四張圖的鍵名：全黃金 → 亞特蘭提斯',
    ),
    (
        'v390/node/v380-adapt-v360-logic-entry.js',
        "eq(EVENTS.find((e) => e.id === 'dogVault').body(100), '裡面有 100 金幣，還有一張金色屋頂的設計圖。屋頂換成金色了。')",
        "eq(EVENTS.find((e) => e.id === 'dogVault').body(100), '裡面有 100 金幣，還有一張亞特蘭提斯房屋的設計圖。住家換成亞特蘭提斯房屋了。') // 4.0-B1 文案",
        '傳說事件文案（房屋）：金色屋頂 → 亞特蘭提斯房屋',
    ),
    (
        'v390/node/v380-adapt-v360-logic-entry.js',
        "eq(EVENTS.find((e) => e.id === 'catAtlantis').body(100), '雷射與山銅合而為一，鐘樓變成黃金鐘樓了。獲得 100 金幣。')",
        "eq(EVENTS.find((e) => e.id === 'catAtlantis').body(100), '雷射與山銅合而為一，鐘樓變成亞特蘭提斯鐘樓了。獲得 100 金幣。') // 4.0-B1 文案",
        '傳說事件文案（鐘樓）：黃金鐘樓 → 亞特蘭提斯鐘樓',
    ),
    (
        'v390/browser/t1c-path.mjs',
        "  { name: '金色住家＋黃金鐘樓', hour: 10, weather: 'sunny', owned: ['kennel'], skins: { house: 'house.gold', tower: 'tower.gold' } },\n",
        "  // 4.0-B1：全黃金住家／鐘樓換成亞特蘭提斯（新圖、新鍵名、圖集拆成 skins_house／skins_tower），和 v3.8.1 比沒有意義，移除這個情境（外殼由 tests-archive/v400b1 測）\n",
        '移除「金色住家＋黃金鐘樓」情境（外觀圖換了）',
    ),
    (
        'v390/browser/t1c-path.mjs',
        "  await page.evaluate(async () => (await import('/src/farm/pixel/assets.ts')).assets.loadGroup('skins'))",
        "  await page.evaluate(async () => (await import('/src/farm/pixel/assets.ts')).assets.loadGroup('skins').catch(() => {})) // 4.0-B1：skins 圖集已拆開（新版沒有）",
        '載入 skins 圖集失敗不中斷（新版已拆成 skins_*）',
    ),
]


def main():
    changed = 0
    for rel, old, new, why in EDITS:
        p = os.path.join(ROOT, rel)
        s = io.open(p, encoding='utf-8', newline='').read()
        nl = '\r\n' if '\r\n' in s else '\n'
        old_n, new_n = old.replace('\n', nl), new.replace('\n', nl)
        if new_n in s:
            print('已改過：' + rel + '（' + why + '）')
            continue
        n = s.count(old_n)
        if n != 1:
            print('找不到（或不只一處，' + str(n) + '）：' + rel + '：' + old[:80])
            sys.exit(1)
        s = s.replace(old_n, new_n)
        io.open(p, 'w', encoding='utf-8', newline='').write(s)
        changed += 1
        print('修改：' + rel + '（' + why + '）')
    print('完成，修改 ' + str(changed) + ' 處')


main()
