# 4.0 階段 B2 對既有測試的預期值異動。可重複執行：已改過的略過。
# 用法：python tests-archive/v400b2/adapt-b2.py
import io
import os
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

LEGACY_NOTE = '4.0-B2：階段 A 的暫時裝飾商品（蘑菇、小花叢、石頭、灌木、花槽、珊瑚石堆）B2 起商店不賣（換成 48 種主題裝飾）；這個測試的商店流程拿它們當樣本，所以測試開頭把 LEGACY_TEMP_ITEMS 加回商品表'

# (檔案, 舊字串, 新字串, 說明)
EDITS = [
    # ---- v400a：商店流程測試仍用階段 A 的 6 種暫時裝飾當樣本 ----
    (
        'v400a/node/v400a-logic-entry.js',
        "import { SHOP_ITEMS, SHOP_LIMITS, SIZE_PRICE, ENV_SLOT, ENV_DEFAULT, ENV_GROUP, envTheme, itemsOf, shopItem } from '../../../src/farm/config/shop.ts'",
        "import { SHOP_ITEMS, LEGACY_TEMP_ITEMS, SHOP_LIMITS, SIZE_PRICE, ENV_SLOT, ENV_DEFAULT, ENV_GROUP, envTheme, itemsOf, shopItem } from '../../../src/farm/config/shop.ts'\n// " + LEGACY_NOTE + "\nSHOP_ITEMS.push(...LEGACY_TEMP_ITEMS)",
        '商店流程測試把階段 A 的 6 種暫時裝飾加回商品表（B2 起商店不賣）',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "eq(itemsOf('decor').map((d) => [d.grant.kind, d.price, !!d.temp]),",
        "eq(itemsOf('decor').filter((d) => d.temp).map((d) => [d.grant.kind, d.price, !!d.temp]),",
        '6 種 TEMP 裝飾只比 temp 的（商品表另有環境主題與 48 種主題裝飾）',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "ok(SHOP_ITEMS.every((it) => it.grant.type !== 'skin' || (it.category === 'building' && it.grant.slot !== 'env')), '1 商品表的外觀只有 B1 的建築外殼（環境主題還沒有商品）')",
        "ok(SHOP_ITEMS.every((it) => it.grant.type !== 'skin' || (it.category === 'building' && it.grant.slot !== 'env') || (it.category === 'decor' && it.grant.slot === 'env')), '1 商品表的外觀只有 B1 的建築外殼與 B2 的環境主題')",
        '商品表的外觀：B1 建築外殼＋B2 環境主題',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "for (const it of itemsOf('decor')) ok(INSTANCE_KINDS.includes(it.grant.kind),",
        "for (const it of itemsOf('decor').filter((d) => d.grant.type === 'decor')) ok(INSTANCE_KINDS.includes(it.grant.kind),",
        '裝飾商品的種類在可複製種類表裡（只看 decor 商品，環境主題是 skin）',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "  const ids = itemsOf('decor').map((d) => d.id)\n",
        "  const ids = itemsOf('decor').filter((d) => d.temp).map((d) => d.id) // 4.0-B2：商品表有 54 種裝飾、這段只用 6 種暫時商品各買 10 個湊 60\n",
        '買滿 60 個：用 6 種暫時裝飾各 10 個',
    ),
    (
        'v400a/node/v400a-logic-entry.js',
        "  for (const it of itemsOf('decor')) for (let i = 0; i < 10; i++) s = buy(s, it.id)\n  for (const it of itemsOf('building')) s = buy(s, it.id)",
        "  for (const it of itemsOf('decor').filter((d) => d.temp)) for (let i = 0; i < 10; i++) s = buy(s, it.id) // 4.0-B2：6 種暫時裝飾各 10 個 = 60\n  for (const it of itemsOf('building')) s = buy(s, it.id)",
        '最擠的情況：6 種暫時裝飾各 10 個',
    ),
    (
        'v400a/node/v400a-store-entry.js',
        "import { SHOP_TEXT } from '../../../src/farm/sim/shop.ts'",
        "import { SHOP_TEXT } from '../../../src/farm/sim/shop.ts'\nimport { SHOP_ITEMS, LEGACY_TEMP_ITEMS } from '../../../src/farm/config/shop.ts'\n// " + LEGACY_NOTE + "\nSHOP_ITEMS.push(...LEGACY_TEMP_ITEMS)",
        'farmStore 購買測試把階段 A 的 6 種暫時裝飾加回商品表',
    ),
    (
        'v400a/browser/ta-shop-browser.mjs',
        "import { launch, open, bootPage, ok, fails, save, pet, stored, sleep, KEY, WRITER } from '../../calendar-tweaks/browser/lib.mjs'",
        "import { launch, open as openRaw, bootPage, ok, fails, save, pet, stored, sleep, KEY, WRITER } from '../../calendar-tweaks/browser/lib.mjs'\n// " + LEGACY_NOTE + "\nconst open = async (...a) => {\n  const r = await openRaw(...a)\n  await r.page.evaluate(async () => { const m = await import('/src/farm/config/shop.ts'); if (!m.SHOP_ITEMS.some((i) => i.id === 'decor.rocks')) m.SHOP_ITEMS.push(...m.LEGACY_TEMP_ITEMS) })\n  return r\n}",
        '商店瀏覽器測試把階段 A 的 6 種暫時裝飾加回商品表',
    ),
    # ---- v400b1 ----
    (
        'v400b1/node/v400b1-skins-entry.js',
        "  const items = SHOP.SHOP_ITEMS.filter((it) => it.grant.type === 'skin')\n  eq(items.length, 40, '商品表有 40 個外觀商品')",
        "  const items = SHOP.SHOP_ITEMS.filter((it) => it.grant.type === 'skin' && it.grant.slot !== 'env') // 4.0-B2：環境主題也是 skin 商品，另測\n  eq(items.length, 40, '商品表有 40 個外觀商品')",
        '建築外殼商品不含 B2 的環境主題',
    ),
    (
        'v400b1/node/v400b1-skins-entry.js',
        "ok(keys.includes(k) || k === 'sil_house_atlantis' || k === 'sil_tower_atlantis', `新增的 ${k} 是外殼或亞特蘭提斯剪影`)",
        "ok(keys.includes(k) || k === 'sil_house_atlantis' || k === 'sil_tower_atlantis' || /^env_|^decor_themes$/.test(man.frames[k]?.atlas ?? ''), `新增的 ${k} 是外殼、亞特蘭提斯剪影或 B2 的環境主題／主題裝飾`)",
        '新增素材的白名單加上 B2 的環境主題與主題裝飾圖集',
    ),
    (
        'v390/node/v380-logic-entry.js',
        "'cat_siamese', 'dog_collie', 'dog_corgi', 'dog_golden', 'dog_husky', 'dog_poodle', 'dog_shiba', 'fx', 'items', 'picnic', 'polaroid', 'scene', 'skins_board',",
        "'cat_siamese', 'decor_themes', 'dog_collie', 'dog_corgi', 'dog_golden', 'dog_husky', 'dog_poodle', 'dog_shiba', 'env_atlantis', 'env_cleanroom', 'env_forest', 'env_magic', 'env_plaid', 'env_punk', 'env_thumbs', 'fx', 'items', 'picnic', 'polaroid', 'scene', 'skins_board',",
        '圖集清單：多了 B2 的 env_<主題>×6、env_thumbs、decor_themes（延後載入）',
    ),
    # ---- v400r：新原圖（路燈、樹、主題裝飾）底色恰好是 #FF00FF，去背只認這個顏色 ----
    (
        'v400r/node/v400r-assets-entry.js',
        "  const bg = k === 'planter' || k === 'coral' || f.atlas.startsWith('skins_') ? pa.isBgNear : /^picnic_mat_/.test(k) ? pa.isBgStrict : pa.isBg",
        "  // 4.0-B2：env_*／decor_themes 的素材用「恰好 #FF00FF」去背（exactBg），殘留也用同一個判斷（畫作裡的紫、粉紅、霓虹不是這個值；逐格的 0 殘留、0 誤吃見 tests-archive/v400b2）\n  const bg = f.atlas.startsWith('env_') || f.atlas === 'decor_themes' ? pa.isBgExact : k === 'planter' || k === 'coral' || f.atlas.startsWith('skins_') ? pa.isBgNear : /^picnic_mat_/.test(k) ? pa.isBgStrict : pa.isBg",
        '新素材的洋紅殘留改用恰好 #FF00FF 的判斷',
    ),
    # ---- t9：不寫死日期、不依賴執行當下的時間：假時鐘固定在 2026-11-19 10:00 ----
    (
        'v390/browser/t9-picnic-pick-browser.mjs',
        "// 4.0-B1：原本寫死 2026-11-19 10:00 而且沒有假時鐘，隔天跑會離線衰減到心情 29（< 野餐 minMood 30）→ 沒有候選寵物。改成今天（仍要在白天 6:00～19:30 跑）\nconst T0 = Date.now()\nconst today = ((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date(T0))",
        "// 4.0-B2：存檔日期與瀏覽器時間都由假時鐘決定：頁面時鐘固定在 CLOCK（2026-11-19 10:00，白天），存檔日期用同一個時間算相對日期（不寫死日期、不依賴執行當下的時間與離線衰減；以前寫死 11/19 又沒有假時鐘，隔天跑會離線衰減到心情 29 < 野餐 minMood 30）\nconst CLOCK = new Date(2026, 10, 19, 10, 0, 0)\nconst T0 = CLOCK.getTime()\nconst today = ((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date(T0))",
        'v3.9.1 野餐選位置：存檔日期由假時鐘算（相對日期），不再寫死、也不依賴執行當天',
    ),
    (
        'v390/browser/t9-picnic-pick-browser.mjs',
        "  page.on('pageerror', (e) => errors.push(e.message))\n  await page.goto(URL0)",
        "  page.on('pageerror', (e) => errors.push(e.message))\n  await page.clock.install({ time: CLOCK }) // 4.0-B2：假時鐘（時間照常流動，起點固定）\n  await page.goto(URL0)",
        'v3.9.1 野餐選位置：頁面安裝假時鐘',
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
