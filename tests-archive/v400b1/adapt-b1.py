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
    # ---- 停點 2 ----
    (
        'v390/node/v380-logic-entry.js',
        "ok(LAZY_ATLASES.includes('polaroid') && LAZY_ATLASES.includes('skins'), '相框圖集延後載入')",
        "ok(LAZY_ATLASES.includes('polaroid') && ['skins_house', 'skins_tower', 'skins_pond', 'skins_board', 'skins_small'].every((g) => LAZY_ATLASES.includes(g)), '相框圖集延後載入（4.0-B1：外殼圖集依部位拆開）')",
        '延後載入的外殼圖集：skins → skins_house／tower／pond／board／small',
    ),
    (
        'v390/node/v380-logic-entry.js',
        "'picnic', 'polaroid', 'scene', 'skins', 'terrain', 'tools', 'toys', 'ui'], '圖集清單')",
        "'picnic', 'polaroid', 'scene', 'skins_board', 'skins_house', 'skins_pond', 'skins_small', 'skins_tower', 'terrain', 'tools', 'toys', 'ui'], '圖集清單（4.0-B1：skins 拆成五個）')",
        '圖集清單：skins → skins_board／house／pond／small／tower',
    ),
    (
        'v390/node/v390-layout-entry.js',
        "    eq([e.w, e.h, e.ax, e.ay], [f.w, f.h, f.ax, f.ay], 'B 輪廓尺寸與錨點和 manifest 相同：' + k)",
        "    // 4.0-B1：輪廓含外殼聯集（腳底對齊），高度可以比預設圖高（食盆外殼 31、預設 27）\n    eq([e.w, e.ax, e.ay], [f.w, f.ax, e.h], 'B 輪廓寬度與錨點和 manifest 相同、腳底在底邊：' + k)\n    ok(e.h >= f.h, 'B 輪廓高度至少是預設圖的高度：' + k)",
        '輪廓含外殼聯集：食盆輪廓高 31（預設圖 27）',
    ),
    (
        'v390/node/v390-tower-entry.js',
        "  E: { lamp: 8850, tree1: 10438, kennel: 10189, catTree: 12266, planter: 7024, rocks: 6189, bowls: 6248 },\n  B25: { lamp: 6580, tree1: 8781, kennel: 8967, catTree: 12266, planter: 6049, rocks: 5922, bowls: 6248 },",
        "  // 4.0-B1：狗窩、貓跳台、食盆的輪廓含外殼聯集，不能放的面積變大一點（原本 E kennel 10189、catTree 12266、bowls 6248；B25 kennel 8967、catTree 12266）\n  E: { lamp: 8850, tree1: 10438, kennel: 10444, catTree: 12415, planter: 7024, rocks: 6189, bowls: 6303 },\n  B25: { lamp: 6580, tree1: 8781, kennel: 9239, catTree: 12415, planter: 6049, rocks: 5922, bowls: 6248 },",
        '塔門保護面積表：狗窩、貓跳台、食盆的輪廓含外殼聯集',
    ),
    (
        'v390/node/v390-tower-entry.js',
        '  return { lamp: 7260, tree1: 8902, kennel: 8974, catTree: 12266, planter: 6049, rocks: 5922, bowls: 6248 }',
        '  // 4.0-B1：輪廓含外殼聯集（原本 kennel 8974、catTree 12266）\n  return { lamp: 7260, tree1: 8902, kennel: 9240, catTree: 12415, planter: 6049, rocks: 5922, bowls: 6248 }',
        '新規則不能放面積的鎖定值：輪廓含外殼聯集',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "eq(itemsOf('building').map((d) => [d.grant.building, d.price, d.repeatable, d.maxOwned]),",
        "eq(itemsOf('building').filter((d) => d.grant.type === 'building').map((d) => [d.grant.building, d.price, d.repeatable, d.maxOwned]), /* 4.0-B1：建築分類另有外觀商品 */",
        '建築分類多了外觀商品：只比建築本體',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "ok(SHOP_ITEMS.every((it) => it.grant.type !== 'skin'), '1 階段 A 的商品表沒有任何外觀（B1 商品、環境主題都不在畫面上）')",
        "ok(SHOP_ITEMS.every((it) => it.grant.type !== 'skin' || (it.category === 'building' && it.grant.slot !== 'env')), '1 商品表的外觀只有 B1 的建築外殼（環境主題還沒有商品）')",
        '商品表有 B1 外殼（環境主題仍沒有）',
    ),
    # t9（野餐選位置）的存檔日期：B1 先改成今天、B2 改成假時鐘＋相對日期，見 tests-archive/v400b2/adapt-b2.py
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
