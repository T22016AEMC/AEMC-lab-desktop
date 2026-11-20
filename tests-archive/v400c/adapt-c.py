# 4.0 階段 C 對既有測試的預期值異動。可重複執行：已改過的略過。
# 用法：python tests-archive/v400c/adapt-c.py
import io
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

# (檔案, 舊字串, 新字串, 說明)
EDITS = [
    (
        'v400b1/node/v400b1-skins-entry.js',
        "/^env_|^decor_themes$/.test(man.frames[k]?.atlas ?? '')",
        "/^env_|^decor_themes$|^acc$/.test(man.frames[k]?.atlas ?? '')",
        '新增素材白名單加上 C 的配件圖集 acc',
    ),
    (
        'v390/node/v380-logic-entry.js',
        "Object.keys(man.atlases).sort(), ['cat_black', 'cat_bluecat',",
        "Object.keys(man.atlases).sort(), ['acc', 'cat_black', 'cat_bluecat',",
        '圖集清單：多了 C 的 acc（延後載入）',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "'colRare', 'dogVault', 'catAtlantis', 'colLegend', 'colAll'], '9 固定順序",
        "'colRare', 'dogVault', 'catAtlantis', 'legendStand', 'colLegend', 'colAll'], '9 固定順序（4.0-C：傳說展示台在傳說配對之後）",
        '事件固定順序：傳說配對之後多了 legendStand（傳說展示台）',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "eq(RETRO_EVENT_IDS, ['colCommon', 'colUncommon', 'colRare', 'colLegend', 'colAll'], '9 補發只查 5 個新事件')",
        "eq(RETRO_EVENT_IDS, ['colCommon', 'colUncommon', 'colRare', 'legendStand', 'colLegend', 'colAll'], '9 補發只查 6 個新事件（4.0-C 多了傳說展示台）')",
        '載入補發的事件：多了 legendStand',
    ),
    (
        'v400a/node/v400a-store-entry.js',
        "['colCommon', 'colUncommon', 'colRare', 'colLegend', 'colAll'], '4 合併彈窗的各項（依事件順序）')",
        "['colCommon', 'colUncommon', 'colRare', 'legendStand', 'colLegend', 'colAll'], '4 合併彈窗的各項（依事件順序；4.0-C 多了傳說展示台）')",
        '合併彈窗的各項：多了 legendStand',
    ),
    (
        'v400b1/node/v400b1-skins-entry.js',
        "it.grant.slot !== 'env') // 4.0-B2",
        "it.grant.slot !== 'env' && !it.grant.skin.startsWith('acc.')) // 4.0-C 配件也是 skin 商品；4.0-B2",
        '建築外殼商品不含 C 的配件',
    ),
    (
        'v400r/node/v400r-assets-entry.js',
        "f.atlas.startsWith('env_') || f.atlas === 'decor_themes' ? pa.isBgExact",
        "f.atlas.startsWith('env_') || f.atlas === 'decor_themes' || f.atlas === 'acc' ? pa.isBgExact",
        '配件圖集 acc 也是恰好 #FF00FF 去背',
    ),
    (
        'v400a/node/v400a-store-entry.js',
        "ok(Object.keys(stored().events).length === 9, '4 旗標寫進儲存')",
        "ok(Object.keys(stored().events).length === 10, '4 旗標寫進儲存（4 個舊旗標＋6 個補發：4.0-C 多了 legendStand）')",
        '補發後的旗標數：9 → 10',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "{ id: 'catAtlantis', coins: 100 }, { id: 'colLegend', coins: 100 }, { id: 'colAll', coins: 100 }], '9 同時觸發",
        "{ id: 'catAtlantis', coins: 100 }, { id: 'legendStand', coins: 0 }, { id: 'colLegend', coins: 100 }, { id: 'colAll', coins: 100 }], '9 同時觸發（4.0-C：傳說配對之後多了展示台 0 金幣）",
        '一次全部達成的通知：多了 legendStand（0 金幣）',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "notices.map((x) => x.id), ['dogVault'], '9 只有狗的兩件傳說：只觸發舊配對')",
        "notices.map((x) => x.id), ['dogVault', 'legendStand'], '9 只有狗的兩件傳說：觸發舊配對＋（4.0-C）送 1 個傳說展示台')",
        '只有狗的一對：配對事件＋傳說展示台',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "{ id: 'colRare', coins: 50 }, { id: 'colLegend', coins: 100 }, { id: 'colAll', coins: 100 }] }, '9 合併彈窗",
        "{ id: 'colRare', coins: 50 }, { id: 'legendStand', coins: 0 }, { id: 'colLegend', coins: 100 }, { id: 'colAll', coins: 100 }] }, '9 合併彈窗（4.0-C：多了展示台 0 金幣）",
        '合併彈窗各項：多了 legendStand',
    ),
    (
        'v390/node/v380-adapt-v360-logic-entry.js',
        "eq(r.notices, [{ id: 'dogVault', coins: 100 }], '狗：L001＋L002 → 100 金幣')",
        "eq(r.notices, [{ id: 'dogVault', coins: 100 }, { id: 'legendStand', coins: 0 }], '狗：L001＋L002 → 100 金幣＋（4.0-C）送傳說展示台')",
        '狗的一對集齊：多送一個傳說展示台（0 金幣）',
    ),
    (
        'v390/node/v380-adapt-v360-logic-entry.js',
        "eq(r.notices, [{ id: 'catAtlantis', coins: 100 }], '貓：L003＋L004')",
        "eq(r.notices, [{ id: 'catAtlantis', coins: 100 }, { id: 'legendStand', coins: 0 }], '貓：L003＋L004（4.0-C：多送傳說展示台）')",
        '貓的一對集齊：多送一個傳說展示台',
    ),
    (
        'v400a/node/v400a-store-entry.js',
        "eq([S().pendingEvents, S().save.points], [[], 50], '4 舊的罰款與配對不在載入時觸發')",
        "eq([S().pendingEvents, S().save.points, S().save.events.dogVault], [[{ id: 'legendStand', coins: 0, retro: true }], 50, undefined], '4 舊的罰款與配對不在載入時觸發（4.0-C：只補送傳說展示台，0 金幣、不設配對旗標）')",
        '舊的配對事件仍不在載入時觸發；C 的傳說展示台在載入時補送（一對已集齊）',
    ),
    (
        'v390/node/v380-adapt-v360-logic-entry.js',
        "['dogVault', 'catAtlantis', 'colLegend']); /* v4.0：",
        "['dogVault', 'catAtlantis', 'legendStand', 'colLegend']); /* 4.0-C：配對之後送傳說展示台（0 金幣）。v4.0：",
        '四件傳說全有：事件順序多了 legendStand',
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
