# 4.0 階段 R（原圖換成整齊 4×4 格、重新套用）對既有測試的預期值異動。可重複執行：已改過的略過。
# 用法：python tests-archive/v400r/adapt-r.py
import io
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

PICNIC_OLD_IMPORT = "import * as OPC from '../.work/v390src/src/farm/pixel/picnic.ts'"
PICNIC_ENV_SWAP = '\n'.join([
    PICNIC_OLD_IMPORT,
    '// 4.0-R：原圖重新套用後素材輪廓（envelopes.ts）改變；讓 v3.9.0 的程式用同一份輪廓，比的是程式邏輯（不比較素材本身）',
    "import { ENVELOPES as OENV } from '../.work/v390src/src/farm/pixel/envelopes.ts'",
    "import { ENVELOPES as NENV } from '../../../src/farm/pixel/envelopes.ts'",
    'Object.assign(OENV, NENV)',
])

# (檔案, 舊字串, 新字串, 說明)
EDITS = [
    (
        'v390/node/v370-layout-entry.js',
        "eq(LAY.buildingSlots(L), OLD.buildingSlots(O).filter((s) => s.id !== 'picnicMat'), tag + ' 三個建築位置不變')",
        "eq(LAY.buildingSlots(L), OLD.buildingSlots(O).filter((s) => s.id !== 'picnicMat').map((s) => (s.id === 'bowls' ? { ...s, h: 27 } : s)), tag + ' 三個建築位置不變（4.0-R：食盆水盆素材高 26→27）')",
        '食盆水盆素材高 26→27（新原圖沒有 57×26 的取樣格）',
    ),
    (
        'v390/node/v390-tower-entry.js',
        "eq([PR.coverStats('tree', 524, 201, ZR.door).covered, PR.coverStats('lamp', 598, 188, ZR.sign).covered], [207, 86], 'B t8 用位置的蓋住格數 = 207（塔門）、86（招牌）')",
        "eq([PR.coverStats('tree', 524, 201, ZR.door).covered, PR.coverStats('lamp', 598, 188, ZR.sign).covered], [205, 82], 'B t8 用位置的蓋住格數 = 205（塔門）、82（招牌）（4.0-R：樹與路燈的輪廓重畫，原本 207、86 恰好 25%）')",
        '樹、路燈輪廓重畫：t8 位置蓋住塔門 207→205、招牌 86→82 格（仍 ≤ 25%、仍合法）',
    ),
    (
        'v390/node/v390-tower-entry.js',
        "  E: { lamp: 8865, tree1: 10455, kennel: 10195, catTree: 12303, planter: 7013, rocks: 6183, bowls: 6248 },\n  B25: { lamp: 6577, tree1: 8801, kennel: 8964, catTree: 12303, planter: 6035, rocks: 5922, bowls: 6248 },",
        "  // 4.0-R：原圖重新套用，素材輪廓重畫，面積跟著改（原本 E: lamp 8865, tree1 10455, kennel 10195, catTree 12303, planter 7013, rocks 6183；B25: lamp 6577, tree1 8801, kennel 8964, catTree 12303, planter 6035）\n  E: { lamp: 8850, tree1: 10438, kennel: 10189, catTree: 12266, planter: 7024, rocks: 6189, bowls: 6248 },\n  B25: { lamp: 6580, tree1: 8781, kennel: 8967, catTree: 12266, planter: 6049, rocks: 5922, bowls: 6248 },",
        '塔門保護的面積量測（素材輪廓重畫，每項差 0.3% 以內）',
    ),
    (
        'v390/node/v390-tower-entry.js',
        '  return { lamp: 7253, tree1: 8919, kennel: 8972, catTree: 12303, planter: 6035, rocks: 5922, bowls: 6248 }',
        '  // 4.0-R：素材輪廓重畫（原本 lamp 7253, tree1 8919, kennel 8972, catTree 12303, planter 6035）\n  return { lamp: 7260, tree1: 8902, kennel: 8974, catTree: 12266, planter: 6049, rocks: 5922, bowls: 6248 }',
        '新規則不能放面積的鎖定值（素材輪廓重畫）',
    ),
    (
        'calendar-tweaks/browser/td1-label-browser.mjs',
        'const s = { w: 16, h: 15, ax: 8, ay: 15 }',
        'const s = { w: 17, h: 15, ax: 9, ay: 15 } /* 4.0-R：fx_heart 16×15 → 17×15 */',
        '愛心圖示 fx_heart 16×15（錨點 8）→ 17×15（錨點 9）',
    ),
    (
        'v390/node/v391-picnic-pick-entry.js',
        PICNIC_OLD_IMPORT,
        PICNIC_ENV_SWAP,
        '野餐自動位置與 v3.9.0 比對：舊程式改用新輪廓（不改輪廓時 422 組裡 21 組不同，全部是輪廓造成）',
    ),
]


def main():
    changed = 0
    for rel, old, new, why in EDITS:
        p = os.path.join(ROOT, rel)
        s = io.open(p, encoding='utf-8', newline='').read()
        nl = '\r\n' if '\r\n' in s else '\n'
        new_n = new.replace('\n', nl)
        if new_n in s:
            print('已改過：' + rel + '（' + why + '）')
            continue
        old_n = old.replace('\n', nl)
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
