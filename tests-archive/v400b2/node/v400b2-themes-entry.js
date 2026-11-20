// 4.0-B2：環境主題（地板＋小路＋遠景＋路燈＋樹）與主題裝飾
//  1. 圖集：env_<主題>×6（地板、小路、遠景、路燈、樹）、env_thumbs、decor_themes 都延後載入、檔案 < 1 MB；預設素材和階段 R 完成時逐像素相同（新增的只有 B2 素材）
//  2. 尺寸：地板 216×216（原圖 4 塊 2×2 → 108 格 → 鏡像）、小路高固定 PATH_H = 67、遠景高各自量（無塵室牆填滿整張高度）、路燈高 84、樹高 ≤ 103；錨點 = 底部中心
//  3. 洋紅（魔法路燈、魔法樹、水晶球座特別看）：輸出 0 殘留（純洋紅 0、貼透明處的近洋紅 0）、0 誤吃（原圖每個非洋紅像素都在某一格的連通塊裡；魔法的紫色比例保留）、色鍵沒放寬
//  4. 連通區域偵測切件：48 件＋傳說展示台逐件找到、每格連通塊數、被丟掉的碎塊 0；表（管線 DECOR_SHEETS）和 config/themeDecor.ts 一致；尺寸級別對應外框面積
//  5. 商店：環境主題 6 款（30、裝飾品分頁「環境主題」）、主題裝飾 48 種（小 3／中 6／大 10、各主題小標題、每種 10／合計 60 不變）、舊的 6 種暫時裝飾不賣但實例仍認得
//  6. 存檔、購買、環境主題切換、舊存檔相容
//  7. 夜晚補光：GLOW 表 = 量測（measure-glow.mjs）、光源落在發光部位；預設路燈光暈（沒穿主題）和原本逐筆畫圖指令相同
//  8. 擺放：新種類的腳下佔地／輪廓；路燈與樹的輪廓、佔地沿用舊的
import '../../calendar-tweaks/node/env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseSave, cleanShop, cleanFarmLayout } from '../../../src/farm/save/migrate.ts'
import { INSTANCE_KINDS, LAYOUT_ITEMS, layoutItemDef, parseInstanceId, isLayoutKind } from '../../../src/farm/config/layoutItems.ts'
import { SHOP_ITEMS, LEGACY_TEMP_ITEMS, SHOP_LIMITS, SIZE_PRICE, ENV_SLOT, ENV_DEFAULT, ENV_GROUP, itemsOf, shopItem } from '../../../src/farm/config/shop.ts'
import { THEME_DECOR, THEME_DECOR_KINDS, DECOR_ATLAS, LEGEND_STAND_KEY, themeDecorDef } from '../../../src/farm/config/themeDecor.ts'
import { ENV_THEME_IDS, ENV_THUMB_ATLAS, ENV_WINDOW_THEMES, GLOW, LAMP_GLOW_DEFAULT, envKeys, envSkinId, envThemeOf, envAtlas, envThumb } from '../../../src/farm/config/envThemes.ts'
import { THEME_NAME, skinAtlasesFor, skinDef } from '../../../src/farm/config/skins.ts'
import { purchase, equipSkin, equippedSkin, ownedCount, itemStatus, decorTotal } from '../../../src/farm/sim/shop.ts'
import { LAZY_ATLASES } from '../../../src/farm/pixel/assets.ts'
import { ENVELOPES } from '../../../src/farm/pixel/envelopes.ts'
import { KIND_GEOM } from '../../../src/farm/pixel/placement.ts'
import * as LAY from '../../../src/farm/pixel/layout.ts'
import { drawGlow } from '../../../src/farm/pixel/scene.ts'

const ROOT = process.env.REPO_ROOT
const pa = await import(pathToFileURL(ROOT + '/scripts/process-assets.mjs').href)
const mg = await import(pathToFileURL(ROOT + '/tests-archive/v400b2/measure-glow.mjs').href)
const { frameHashes } = await import(pathToFileURL(ROOT + '/tests-archive/v400b1/frame-hashes.mjs').href)
let n = 0
const fails = []
const ok = (c, m) => { n++; if (!c) fails.push(m) }
const eq = (a, b, m) => { n++; try { assert.deepEqual(a, b) } catch { fails.push(`${m}：實際 ${JSON.stringify(a).slice(0, 300)}，預期 ${JSON.stringify(b).slice(0, 300)}`) } }
const report = []

const A = join(ROOT, 'public', 'assets')
const man = JSON.parse(readFileSync(join(A, readdirSync(A).find((f) => /^manifest\.[0-9a-f]{8}\.json$/.test(f))), 'utf8'))
const { crop } = await mg.loadFrames(ROOT)
const THEMES = ['atlantis', 'cleanroom', 'forest', 'magic', 'punk', 'plaid']
const px = (s, x, y) => { const i = (y * s.w + x) * 4; return [s.rgba[i], s.rgba[i + 1], s.rgba[i + 2], s.rgba[i + 3]] }
const open4 = (s, x, y) => x < 0 || y < 0 || x >= s.w || y >= s.h || !s.rgba[(y * s.w + x) * 4 + 3]

// ---- 1. 圖集 ----
eq(ENV_THEME_IDS, THEMES, '1 環境主題順序：亞特蘭提斯、無塵室、森林、魔法、龐克、野餐鄉村')
eq(pa.ENV_THEMES, THEMES, '1 管線的主題順序相同')
for (const t of THEMES) {
  const g = envAtlas(t)
  ok(LAZY_ATLASES.includes(g), `1 ${g} 延後載入`)
  const keys = Object.entries(man.frames).filter(([, f]) => f.atlas === g).map(([k]) => k).sort()
  eq(keys, [`far_${t}`, `floor_${t}`, `lamp_${t}`, `path_${t}`, `tree_${t}`].sort(), `1 ${g} 只有這個主題的 5 張素材`)
  ok(statSync(join(A, man.atlases[g].file)).size < 1024 * 1024, `1 ${g} < 1 MB（${Math.round(statSync(join(A, man.atlases[g].file)).size / 1024)} KB）`)
  eq(Object.values(envKeys(t)).sort(), keys, `1 envKeys(${t}) 和圖集一致`)
}
ok(LAZY_ATLASES.includes(ENV_THUMB_ATLAS) && LAZY_ATLASES.includes(DECOR_ATLAS), '1 env_thumbs、decor_themes 延後載入')
eq(Object.entries(man.frames).filter(([, f]) => f.atlas === ENV_THUMB_ATLAS).map(([k]) => k).sort(), [...THEMES, 'grass'].map(envThumb).sort(), '1 商店縮圖 7 張（6 主題＋草地）')
const decorKeys = Object.entries(man.frames).filter(([, f]) => f.atlas === DECOR_ATLAS).map(([k]) => k).sort()
eq(decorKeys, [...THEME_DECOR_KINDS, LEGEND_STAND_KEY].sort(), '1 decor_themes = 48 種主題裝飾＋傳說展示台')
ok(statSync(join(A, man.atlases[DECOR_ATLAS].file)).size < 1024 * 1024, '1 decor_themes < 1 MB')
for (const g of Object.keys(man.atlases)) if (/^env_|^decor_themes$/.test(g)) ok(LAZY_ATLASES.includes(g), `1 ${g} 在延後載入清單`)
// 預設素材逐像素相同（B1 結束時的基準 r-frames.json = 階段 R；B2 沒有動任何既有素材）
{
  const base = JSON.parse(readFileSync(join(ROOT, 'tests-archive', 'v400b1', 'r-frames.json'), 'utf8'))
  const cur = await frameHashes(ROOT)
  const REMOVED = ['house_gold_closed', 'house_gold_open', 'house_gold_night', 'clocktower_gold', 'clocktower_open_gold', 'sil_house_gold', 'sil_tower_gold']
  let same = 0
  for (const [k, v] of Object.entries(base)) {
    if (REMOVED.includes(k)) continue
    eq(cur[k], v, `1 ${k} 和階段 R 完成時相同`)
    same++
  }
  const added = Object.keys(cur).filter((k) => !base[k])
  const b2 = added.filter((k) => /^env_|^decor_themes$|^acc$/.test(man.frames[k].atlas)) // 4.0-C：配件圖集 acc
  report.push(`既有素材逐像素相同 ${same} 張；新增 ${added.length} 張（B2：${b2.length}）`)
  ok(added.every((k) => b2.includes(k) || /^(house|tower|pond|board|doghouse|cat_tree|bowls)_|^sil_/.test(k)), '1 新增的素材只有 B1 外殼、剪影與 B2 素材')
}

// ---- 2. 尺寸、錨點 ----
{
  const F = (k) => man.frames[k]
  for (const t of THEMES) {
    const floor = crop(`floor_${t}`), path = crop(`path_${t}`), far = crop(`far_${t}`), lamp = crop(`lamp_${t}`), tree = crop(`tree_${t}`)
    eq([floor.w, floor.h, floor.ax, floor.ay], [216, 216, 0, 0], `2 floor_${t} 216×216（108 格 2×2 鏡像）、錨點左上`)
    ok([...Array(floor.w * floor.h).keys()].every((i) => floor.rgba[i * 4 + 3] === 255), `2 floor_${t} 全不透明`)
    eq([path.h, path.ay, path.ax], [LAY.PATH_H, LAY.PATH_H, 0], `2 path_${t} 高固定 PATH_H = ${LAY.PATH_H}`)
    ok([...Array(path.w * path.h).keys()].every((i) => path.rgba[i * 4 + 3] === 255), `2 path_${t} 全不透明（路面帶）`)
    ok(path.w >= 340 && path.w <= 490, `2 path_${t} 寬 ${path.w}`)
    eq([far.w, far.ax, far.ay], [395, 0, far.h], `2 far_${t} 寬 395（原圖 2172 ÷ 5.5）、貼底`)
    // FAR_H 各自量：內容高度 = 圖高（管線已裁掉上方透明列）、最上面一列有不透明像素
    let top = 0
    for (let x = 0; x < far.w; x++) if (far.rgba[x * 4 + 3]) top++
    ok(top > 0, `2 far_${t} 最上面一列有內容（已裁掉上方透明列）`)
    if (ENV_WINDOW_THEMES.has(t)) {
      let hole = 0
      for (let i = 0; i < far.w * far.h; i++) if (!far.rgba[i * 4 + 3]) hole++
      ok(far.h >= 128 && far.h <= LAY.SCENE_H, `2 far_${t} 牆填滿整張高度（${far.h}）`)
      ok(top === far.w, `2 far_${t} 最上面一列全是牆（${top}/${far.w}）`)
      ok(hole > far.w * far.h * 0.15 && hole < far.w * far.h * 0.6, `2 far_${t} 只有窗玻璃是透明（${hole} 像素 = ${(hole / (far.w * far.h) * 100).toFixed(0)}%）`)
      // 窗玻璃的洞要在牆裡面（上下左右都有牆框）：洞的外框不碰圖的上下邊
      let y0 = far.h, y1 = -1
      for (let y = 0; y < far.h; y++) for (let x = 0; x < far.w; x++) if (!far.rgba[(y * far.w + x) * 4 + 3]) { y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
      ok(y0 > 5 && y1 < far.h - 5, `2 far_${t} 窗玻璃在牆內（透明列 ${y0}～${y1}／${far.h}）`)
    } else ok(far.h <= 60, `2 far_${t} 只有下面一條（${far.h} 列）`)
    ok(far.h <= LAY.SCENE_H && LAY.SCENE_H > 0 && far.h <= 136, `2 far_${t} 不超過遠景底邊（farBottom 136）`)
    eq([lamp.h, lamp.ay], [84, 84], `2 lamp_${t} 高 84（= 舊路燈）`)
    ok(lamp.w >= 24 && lamp.w <= 60, `2 lamp_${t} 寬 ${lamp.w}`)
    ok(tree.h <= 103 && tree.h >= 95 && tree.w <= 106, `2 tree_${t} ${tree.w}×${tree.h}（高 ≤ 103、寬 ≤ 106）`)
    for (const s of [lamp, tree]) {
      let lo = s.w, hi = -1
      for (let y = s.h - 6; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.rgba[(y * s.w + x) * 4 + 3]) { lo = Math.min(lo, x); hi = Math.max(hi, x) }
      eq(s.ax, Math.round((lo + hi + 1) / 2), `2 錨點 x = 最下面 6 列的水平中心（${s.w}×${s.h}）`)
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const a = s.rgba[(y * s.w + x) * 4 + 3]; if (a !== 0 && a !== 255) { ok(false, `2 半透明像素 ${x},${y}`); y = s.h; break } }
    }
    for (const [k, s] of [[`path_${t}`, path], [`far_${t}`, far], [`floor_${t}`, floor]]) for (let i = 0; i < s.w * s.h; i++) { const a = s.rgba[i * 4 + 3]; if (a !== 0 && a !== 255) { ok(false, `2 ${k} 有半透明像素`); break } }
  }
  report.push('遠景高（FAR_H，各自量）：' + THEMES.map((t) => `${t} ${F(`far_${t}`).h}`).join('、') + '；預設 ' + LAY.FAR_H)
  report.push('小路寬：' + THEMES.map((t) => `${t} ${F(`path_${t}`).w}`).join('、') + `；高一律 ${LAY.PATH_H}`)
  report.push('路燈：' + THEMES.map((t) => `${t} ${F(`lamp_${t}`).w}×${F(`lamp_${t}`).h}（ax ${F(`lamp_${t}`).ax}）`).join('、'))
  report.push('樹：' + THEMES.map((t) => `${t} ${F(`tree_${t}`).w}×${F(`tree_${t}`).h}`).join('、'))
  eq(pa.PATH_H_LOGICAL, LAY.PATH_H, '2 管線的 PATH_H_LOGICAL = layout.ts 的 PATH_H')
  eq(pa.FAR_P, 5.501, '2 遠景像素格 = 舊遠景')
  for (const [t, [y0, y1]] of Object.entries(pa.PATH_BANDS)) ok(y0 % 4 === 0 && y1 % 4 === 0 && y1 - y0 > 250, `2 ${t} 小路的列範圍 ${y0}～${y1} 落在 4×4 像素格的邊上`)
}

// ---- 2b. 4.0-C 小修：地板只用 A～C、小路瑕疵段不取樣、遠景的粉紫斜線（原圖就有） ----
{
  const same = (t) => {
    const f = crop(`floor_${t}`)
    let diff = 0
    for (let y = 0; y < 54; y++) for (let x = 0; x < 54; x++) { const a = px(f, x, y), b = px(f, x + 54, y + 54); if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) diff++ }
    return diff
  }
  eq(pa.FLOOR_BLOCKS, { forest: 'ABCA', cleanroom: 'ABCA', punk: 'ABCA' }, '2b 森林、無塵室、龐克的地板只用 A～C（D 的位置補 A）')
  for (const t of ['forest', 'cleanroom', 'punk']) eq(same(t), 0, `2b floor_${t} 右下塊（原 D）= 左上塊（A）`)
  for (const t of ['atlantis', 'magic', 'plaid']) ok(same(t) > 1000, `2b floor_${t} 維持 A～D（右下塊和左上塊不同：${same(t)} 格）`)
  // 小路右緣瑕疵：不取樣瑕疵段（原圖 x ≥ 約 2125），左右接縫的誤差不超過一般相鄰兩欄差的 4 倍
  eq(pa.PATH_X1, { cleanroom: 2040, punk: 2008 }, '2b 無塵室、龐克小路只取樣到瑕疵段之前（2040、2008，整數個條紋週期）')
  for (const t of THEMES) {
    const s = crop(`path_${t}`)
    const colDiff = (a, b) => { let d = 0; for (let y = 0; y < s.h; y++) { const p = px(s, a, y), q = px(s, b, y); d += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) } return d / s.h }
    let adj = 0
    for (let x = 20; x < 120; x++) adj += colDiff(x, x + 1)
    adj /= 100
    const seam = colDiff(s.w - 1, 0)
    ok(seam <= Math.max(adj * 4, 60), `2b path_${t} 左右接縫誤差 ${seam.toFixed(1)}（一般相鄰兩欄 ${adj.toFixed(1)}）`)
    report.push(`2b path_${t} 接縫 ${seam.toFixed(1)}／相鄰 ${adj.toFixed(1)}`)
  }
  // 遠景、小路、地板：任何位置都沒有近洋紅（R、B ≥ 200、G ≤ 80）；無塵室每扇窗角落的粉紫斜線是原圖本來就有的（opaque 的 (255,~120,255)），保留
  const cast = (r, g, b) => r > 180 && b > 180 && g < r - 40 && g < b - 40
  for (const t of THEMES) for (const k of [`far_${t}`, `path_${t}`, `floor_${t}`]) {
    const s = crop(k)
    let nearAll = 0, pink = 0
    for (let i = 0; i < s.w * s.h; i++) { if (!s.rgba[i * 4 + 3]) continue; const r = s.rgba[i * 4], g = s.rgba[i * 4 + 1], b = s.rgba[i * 4 + 2]; if (pa.isBgNear(r, g, b)) nearAll++; if (cast(r, g, b)) pink++ }
    ok(nearAll === 0, `2b ${k} 近洋紅（任何位置）${nearAll}（應為 0）`)
    if (k.startsWith('far_')) report.push(`2b ${k} 偏粉紫像素 ${pink}`)
    if (k === 'far_cleanroom') ok(pink > 200, `2b far_cleanroom 窗角的粉紫斜線保留（原圖就有，${pink} 像素）`)
  }
  {
    const { data, info } = await (await import('node:module')).createRequire(ROOT + '/package.json')('sharp')(join(process.env.ASSET_SRC ?? join(ROOT, '..', '像素風圖片'), 'far_cleanroom.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let src = 0
    for (let i = 0; i < info.width * info.height; i++) if (data[i * 4 + 3] === 255 && cast(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])) src++
    ok(src > 5000, `2b 原圖 far_cleanroom 就有偏粉紫的不透明像素 ${src}（窗角斜線不是我們去背弄出來的）`)
  }
}

// ---- 3. 洋紅：0 殘留、0 誤吃 ----
{
  const near = (r, g, b) => pa.isBgNear(r, g, b)
  const SRC = process.env.ASSET_SRC ?? join(ROOT, '..', '像素風圖片')
  const sharpR = (await import('node:module')).createRequire(ROOT + '/package.json')('sharp')
  const loadSrc = async (f) => {
    const { data, info } = await sharpR(join(SRC, f)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data, W: info.width, H: info.height }
  }
  // 色鍵沒放寬：只認 (255,0,255)；管線的 exactBg 判斷和這個一致
  ok(pa.isBgExact(255, 0, 255) && !pa.isBgExact(254, 0, 255) && !pa.isBgExact(255, 1, 255) && !pa.isBgExact(200, 30, 220) && !pa.isBgExact(180, 60, 230), '3 色鍵只認 (255,0,255)')
  const b2keys = Object.entries(man.frames).filter(([, f]) => /^env_|^decor_themes$/.test(f.atlas)).map(([k]) => k)
  let edgeNear = 0
  const rows = []
  for (const k of b2keys) {
    const s = crop(k)
    let exact = 0, nearEdge = 0, nearAll = 0
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const [r, g, b, a] = px(s, x, y)
      if (!a) continue
      if (pa.isBgExact(r, g, b)) exact++
      if (near(r, g, b)) { nearAll++; if (open4(s, x, y)) nearEdge++ }
    }
    ok(exact === 0, `3 ${k} 純洋紅殘留 ${exact}（應為 0）`)
    edgeNear += nearEdge
    rows.push([k, nearAll, nearEdge])
  }
  // 貼著透明處的「近洋紅」（R、B 高、G 低）：原圖裡真的有這種顏色的畫作（魔法的粉紅、紫）時不算殘留，所以和原圖的同類像素比（見下面的魔法比例）；其他一律 0
  const MAGIC_ART = new Set(['lamp_magic', 'tree_magic', 'crystal_ball', 'magic_broom', 'spell_books', 'red_pots', 'stone_stack', 'mushroom_ring', 'rune_circle', 'crystal_cluster', 'float_candles', 'magic_cauldron', 'star_telescope', 'info_terminal', 'twin_jar', 'gas_cylinders'])
  for (const [k, , ne] of rows) if (!MAGIC_ART.has(k)) ok(ne === 0, `3 ${k} 貼著透明處的近洋紅 ${ne}（應為 0）`)
  report.push(`3 B2 素材 ${b2keys.length} 張：純洋紅殘留 0；貼透明處的近洋紅合計 ${edgeNear}（${rows.filter((r) => r[2]).map((r) => r[0] + '=' + r[2]).join('、') || '無'}）`)
  // 0 誤吃：原圖每個非 (255,0,255) 的像素都屬於某一格的連通塊（沒被去背、沒被碎屑／細線規則丟掉）
  const keepRule = (c) => !(c.area < 12 || (Math.min(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) <= 6 && Math.max(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) >= 40) || (Math.max(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) > 150 && c.area / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)) < 0.04))
  const SHEETS = [['lamp_themes.png', 3, 2], ['tree_themes.png', 3, 2], ...pa.DECOR_SHEETS.map(([f, c, r]) => [f, c, r])]
  let eaten = 0, art = 0
  for (const [f] of SHEETS) {
    const img = await loadSrc(f)
    const mask = new Uint8Array(img.W * img.H)
    for (let i = 0; i < img.W * img.H; i++) mask[i] = pa.isBgExact(img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2]) ? 0 : 1
    const { comps } = pa.label(mask, img.W, img.H)
    const total = comps.reduce((t, c) => t + c.area, 0)
    const lost = comps.filter((c) => !keepRule(c)).reduce((t, c) => t + c.area, 0)
    art += total
    eaten += lost
    ok(lost === 0, `3 ${f} 被碎屑／細線規則丟掉的原圖像素 ${lost}（應為 0）`)
  }
  report.push(`3 原圖 ${SHEETS.length} 張共 ${art} 個非洋紅像素，被丟掉 ${eaten}（誤吃 0）`)
  // 魔法路燈、魔法樹、水晶球座：原圖裡「一般去背（isBg）會誤吃」的像素在成品裡仍然在（比例和原圖相近）
  const MAGIC = [['lamp_themes.png', 3, 2, 3, 'lamp_magic'], ['tree_themes.png', 3, 2, 3, 'tree_magic'], ['extra_decor_b.png', 3, 2, 0, 'crystal_ball']]
  for (const [f, cols, rows2, cell, key] of MAGIC) {
    const img = await loadSrc(f)
    const cw = img.W / cols, ch = img.H / rows2
    const cx = cell % cols, cy = Math.floor(cell / cols)
    let broad = 0, tot = 0, rawNear = 0
    for (let y = Math.floor(cy * ch); y < Math.floor((cy + 1) * ch); y++) for (let x = Math.floor(cx * cw); x < Math.floor((cx + 1) * cw); x++) {
      const i = y * img.W + x
      const [r, g, b] = [img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2]]
      if (pa.isBgExact(r, g, b)) continue
      tot++
      if (pa.isBg(r, g, b)) broad++
      if (near(r, g, b)) rawNear++
    }
    const s = crop(key)
    let obroad = 0, otot = 0
    for (let i = 0; i < s.w * s.h; i++) { if (!s.rgba[i * 4 + 3]) continue; otot++; if (pa.isBg(s.rgba[i * 4], s.rgba[i * 4 + 1], s.rgba[i * 4 + 2])) obroad++ }
    const a = broad / tot, o = obroad / otot
    ok(broad > 50, `3 ${key} 原圖有一般去背會誤吃的畫作像素（${broad}，近洋紅 ${rawNear}）`)
    ok(o > a * 0.5 && o < a * 1.8, `3 ${key} 一般去背會誤吃的像素比例：原圖 ${(a * 100).toFixed(1)}% → 成品 ${(o * 100).toFixed(1)}%（保留）`)
    report.push(`3 ${key}：原圖一般去背會誤吃 ${broad}／${tot}（${(a * 100).toFixed(1)}%）→ 成品 ${obroad}／${otot}（${(o * 100).toFixed(1)}%）；近洋紅 ${rawNear}`)
  }
}

// ---- 4. 連通區域偵測切件、表一致 ----
{
  const sheetKinds = pa.DECOR_SHEETS.flatMap(([, , , e]) => e.filter(Boolean))
  eq(sheetKinds.map(([k]) => k).filter((k) => k !== LEGEND_STAND_KEY), THEME_DECOR.map((d) => d.kind), '4 管線 DECOR_SHEETS 的順序 = config/themeDecor.ts（48 種）')
  eq(sheetKinds.filter(([k]) => k !== LEGEND_STAND_KEY).map(([, s]) => s), THEME_DECOR.map((d) => d.size), '4 尺寸級別一致')
  eq(sheetKinds.find(([k]) => k === LEGEND_STAND_KEY), [LEGEND_STAND_KEY, 'M'], '4 傳說展示台（第 7 格）只切好放進圖集')
  eq(pa.DECOR_SHEETS.map(([f]) => f), ['atlantis_decor.png', 'cleanroom_decor.png', 'forest_decor.png', 'magic_decor.png', 'punk_decor.png', 'plaid_decor.png', 'extra_decor_a.png', 'extra_decor_b.png'], '4 八張原圖')
  eq(pa.DECOR_SHEETS.map(([, c, r]) => [c, r]), [[4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [4, 2], [3, 2], [3, 2]], '4 欄×列（4×2 六張、3×2 兩張）')
  eq(THEME_DECOR.length, 48, '4 48 件')
  eq(THEME_DECOR.filter((d) => d.theme === 'extra').length, 12, '4 其他擺設 12 件（extra_decor_a、b 各 6）')
  const SIZES = { atlantis: 'SSMMLL', cleanroom: 'SSMMML', forest: 'SSMMML', magic: 'SSMMML', punk: 'SSMMML', plaid: 'SSMMLL' }
  for (const t of THEMES) eq(THEME_DECOR.filter((d) => d.theme === t).map((d) => d.size).join(''), SIZES[t], `4 ${t} 6 件的尺寸級別（指令：小小中中…）`)
  for (const d of THEME_DECOR) {
    const f = man.frames[d.kind]
    ok(f && f.atlas === DECOR_ATLAS, `4 ${d.name}（${d.kind}）在 decor_themes`)
    if (!f) continue
    const area = f.w * f.h
    ok(d.size === 'S' ? area < 1500 : d.size === 'M' ? area >= 1500 && area <= 2500 : area > 2500, `4 ${d.kind} 外框面積 ${area}（${f.w}×${f.h}）對應級別 ${d.size}（小 < 1500、中 1500～2500、大 > 2500）`)
    ok(f.ay === f.h && f.ax > 0 && f.ax < f.w, `4 ${d.kind} 錨點 = 底部中心`)
    const e = ENVELOPES[d.kind]
    ok(e && e.w === f.w && e.h === f.h && e.ax === f.ax && e.ay === f.h, `4 ${d.kind} 有輪廓、尺寸與錨點和圖集相同`)
    const s = crop(d.kind)
    // 輪廓和圖集逐列一致
    let bad = 0
    for (let y = 0; y < s.h; y++) {
      const runs = []
      for (let x = 0; x < s.w; x++) { if (!s.rgba[(y * s.w + x) * 4 + 3]) continue; let q = x; while (q < s.w && s.rgba[(y * s.w + q) * 4 + 3]) q++; runs.push([x - s.ax, q - s.ax]); x = q }
      if (JSON.stringify(runs) !== JSON.stringify(e.rows[y])) bad++
    }
    eq(bad, 0, `4 ${d.kind} 輪廓逐列等於圖集`)
    ok(d.size === 'S' ? f.w <= 46 && f.h <= 46 : d.size === 'M' ? f.w <= 72 && f.h <= 62 : f.w <= 100 && f.h <= 90, `4 ${d.kind} 不超過級別的寬高上限`)
    // 腳下佔地
    const g = KIND_GEOM[d.kind]
    eq([g.env, g.sprite, g.foot.d], [d.kind, d.kind, 10], `4 ${d.kind} 幾何：素材鍵、輪廓鍵、深度 10`)
    ok(Math.abs(g.foot.x1 - g.foot.x0 - f.w * 0.8) < 0.01 && g.foot.x0 === -g.foot.x1, `4 ${d.kind} 腳下佔地 0.8 倍素材寬、置中`)
    ok(INSTANCE_KINDS.includes(d.kind) && isLayoutKind(d.kind), `4 ${d.kind} 在可複製種類表、認得是物件種類`)
    ok(layoutItemDef(`${d.kind}#7`)?.name === d.name && layoutItemDef(`${d.kind}#7`)?.storable === true && layoutItemDef(`${d.kind}#7`)?.hasDefault === false, `4 ${d.kind}#7 的物件定義：名稱「${d.name}」、可收進倉庫、沒有預設位置`)
  }
  // 逐件偵測結果（連通塊數）寫進報告
  report.push('4 偵測失敗 0 件；多連通塊的件（水母觸手、蠟燭光點…）：' + ['jelly_lamp', 'trident_statue', 'crystal_cluster', 'float_candles', 'magic_cauldron', 'rune_circle', 'speaker', 'fire_barrel'].join('、') + ' 都合成一件')
  // 4.0-C 起傳說展示台是擺設種類（集齊傳說送的，不賣）：有輪廓、可擺放，但不在 THEME_DECOR（商店）裡
  ok(man.frames[LEGEND_STAND_KEY] && ENVELOPES[LEGEND_STAND_KEY] && isLayoutKind(LEGEND_STAND_KEY) && INSTANCE_KINDS.includes(LEGEND_STAND_KEY) && !THEME_DECOR_KINDS.includes(LEGEND_STAND_KEY), '4 傳說展示台（C）：有輪廓、是擺設種類、不在商店的主題裝飾表')
  ok(!SHOP_ITEMS.some((it) => it.id === 'decor.' + LEGEND_STAND_KEY), '4 傳說展示台不在商店')
}

// ---- 5. 商店 ----
const T0 = new Date(2026, 10, 19, 12, 0, 0).getTime()
const today = '2026-11-19'
const pet = (id, species, variant) => ({ id, species, variant, name: id, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 80, mood: 80, cleanliness: 80, personality: 'lively', lastInteract: T0 })
const RAW = (extra = {}) => ({
  schemaVersion: 5, dataRev: 6, points: 1000, lastSeen: T0, lastDailyClaim: today, gifts: { date: today, count: 0 }, nextPetId: 3, createdAt: T0 - 9e8,
  pets: [pet('d1', 'dog', 'shiba'), pet('c1', 'cat', 'tabby')], ownedBuildings: [], earning: { date: today, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 },
  bowl: { date: today, used: 0 }, collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: today, count: 0, lastEnd: 0 }, ...extra,
})
const S = (extra) => parseSave(RAW(extra))
const buy = (s, id, opts) => { const r = purchase(s, id, opts); assert.ok(r.ok, `買 ${id} 應該成功：${r.error}`); return r.save }
{
  const envItems = SHOP_ITEMS.filter((it) => it.grant.type === 'skin' && it.grant.slot === ENV_SLOT)
  eq(envItems.map((it) => it.grant.skin), THEMES.map(envSkinId), '5 環境主題商品 6 款（順序同主題順序）')
  for (const it of envItems) {
    eq([it.category, it.group, it.price, it.repeatable, it.maxOwned], ['decor', ENV_GROUP, SHOP_LIMITS.envThemePrice, false, 1], `5 ${it.id} 裝飾品分頁「環境主題」、30、買一次`)
    ok(man.frames[it.sprite]?.atlas === ENV_THUMB_ATLAS, `5 ${it.id} 的縮圖 ${it.sprite} 在 env_thumbs`)
    ok(it.name.endsWith('環境') && THEMES.some((t) => it.name === THEME_NAME[t] + '環境'), `5 ${it.id} 名稱「${it.name}」`)
  }
  eq(SHOP_LIMITS.envThemePrice, 30, '5 環境主題 30（地板＋小路＋遠景＋路燈＋樹一起）')
  const dec = SHOP_ITEMS.filter((it) => it.grant.type === 'decor')
  eq(dec.length, 48, '5 商店賣 48 種主題裝飾（舊的 6 種暫時裝飾不賣）')
  eq(dec.map((it) => it.grant.kind), THEME_DECOR.map((d) => d.kind), '5 商品順序 = 主題順序（亞特蘭提斯、無塵室、森林、魔法、龐克、野餐鄉村、其他）')
  for (const it of dec) {
    const d = themeDecorDef(it.grant.kind)
    eq([it.price, it.size, it.name, it.repeatable, it.maxOwned, it.category, it.sprite, !!it.temp], [SIZE_PRICE[d.size], d.size, d.name, true, 10, 'decor', d.kind, false], `5 ${it.id} 價格依級別（小 3／中 6／大 10）、每種最多 10`)
    eq(it.group, d.theme === 'extra' ? '其他擺設' : THEME_NAME[d.theme] + '裝飾', `5 ${it.id} 小標題`)
  }
  eq(SIZE_PRICE, { S: 3, M: 6, L: 10 }, '5 尺寸價格不變')
  eq([SHOP_LIMITS.decorPerKind, SHOP_LIMITS.decorTotal], [10, 60], '5 decorPerKind 10、decorTotal 60 不變')
  eq([...new Set(dec.map((it) => it.group))], ['亞特蘭提斯裝飾', '無塵室裝飾', '森林裝飾', '魔法裝飾', '龐克夜城裝飾', '野餐鄉村裝飾', '其他擺設'], '5 七個小標題')
  eq(dec.reduce((a, it) => ({ ...a, [it.size]: (a[it.size] ?? 0) + 1 }), {}), { S: 24, M: 16, L: 8 }, '5 小 24／中 16／大 8')
  ok(LEGACY_TEMP_ITEMS.length === 6 && LEGACY_TEMP_ITEMS.every((it) => it.temp && !SHOP_ITEMS.includes(it)), '5 舊的 6 種暫時裝飾不在商品表（只留在 LEGACY_TEMP_ITEMS 供測試）')
  eq(itemsOf('decor').filter((x) => x.grant.type !== 'skin' && x.grant.type !== 'decor'), [], '5 裝飾品分頁只有環境主題與裝飾')
  // 購買主題裝飾
  let s = S({ points: 100 })
  s = buy(s, 'decor.jelly_lamp')
  s = buy(s, 'decor.old_pillar')
  s = buy(s, 'decor.temple_arch')
  eq(s.shop.decor, [{ id: 'jelly_lamp#1', kind: 'jelly_lamp' }, { id: 'old_pillar#2', kind: 'old_pillar' }, { id: 'temple_arch#3', kind: 'temple_arch' }], '5 買 3 件：實例 id「種類#編號」、編號共用遞增')
  eq(s.points, 100 - 3 - 6 - 10, '5 小 3、中 6、大 10')
  eq(parseSave(JSON.parse(JSON.stringify(s))).shop, s.shop, '5 存檔來回：實例還在')
  // 每種 10、合計 60
  let t = S({ points: 100000 })
  for (let i = 0; i < 10; i++) t = buy(t, 'decor.carousel')
  ok(!purchase(t, 'decor.carousel').ok && purchase(t, 'decor.carousel').error.includes('10'), '5 每種最多 10 個（旋轉木馬第 11 個被擋）')
  for (const k of ['windmill', 'neon_stage', 'tree_house', 'rune_circle', 'vine_gazebo']) for (let i = 0; i < 10; i++) t = buy(t, 'decor.' + k)
  eq(decorTotal(t), 60, '5 6 種各 10 個 = 60')
  const over = purchase(t, 'decor.jelly_lamp')
  ok(!over.ok && over.error.includes('60'), '5 合計滿 60 不能再買')
  // 環境主題：買、換、換回、再換
  let e = S({ points: 100 })
  eq(equippedSkin(e, ENV_SLOT), ENV_DEFAULT, '5 預設是草地（不寫進存檔）')
  e = buy(e, 'env.magic')
  eq([e.points, e.skins.owned, e.skins.equipped.env], [70, ['env.magic'], 'env.magic'], '5 買魔法環境：扣 30、買了立刻換上')
  eq(skinAtlasesFor(e.skins.equipped), ['env_magic'], '5 穿上才載入 env_magic')
  e = buy(e, 'env.plaid')
  eq(equippedSkin(e, ENV_SLOT), 'env.plaid', '5 同一時間只有一個生效')
  e = equipSkin(e, ENV_SLOT, 'env.magic')
  eq([e.points, equippedSkin(e, ENV_SLOT)], [40, 'env.magic'], '5 切換不扣金幣')
  e = equipSkin(e, ENV_SLOT, null)
  ok(!(ENV_SLOT in e.skins.equipped) && equippedSkin(e, ENV_SLOT) === ENV_DEFAULT && e.skins.owned.length === 2, '5 換回草地：從 equipped 拿掉、仍擁有 2 款')
  ok(equipSkin(e, ENV_SLOT, 'env.forest') === e, '5 沒擁有的不能穿')
  ok(!purchase(e, 'env.magic').ok && purchase(e, 'env.magic').error.includes('已經擁有'), '5 同一款不能買兩次')
  eq(ownedCount(e, shopItem('env.atlantis')), 0, '5 還沒買的擁有 0')
  const poor = S({ points: 29 })
  ok(!purchase(poor, 'env.forest').ok && purchase(poor, 'env.forest').save === poor, '5 金幣不足：存檔不變')
  // 環境主題和建築外殼互不影響（slot 不同）
  let m = S({ points: 200, ownedBuildings: ['kennel'] })
  m = buy(m, 'skin.kennel.forest')
  m = buy(m, 'env.forest')
  eq([m.skins.equipped.kennel, m.skins.equipped.env], ['kennel.forest', 'env.forest'], '5 狗窩外殼與環境主題各自生效')
  m = equipSkin(m, ENV_SLOT, null)
  eq(m.skins.equipped.kennel, 'kennel.forest', '5 換回草地不影響狗窩外殼')
  eq(skinAtlasesFor({ env: 'env.nope', house: 'house.forest', kennel: 'kennel.plaid' }).sort(), ['skins_house', 'skins_small'], '5 不認得的環境主題 id 不載入任何圖集')
  eq([envThemeOf('env.punk'), envThemeOf('env.grass'), envThemeOf('env.nope'), envThemeOf(undefined), envThemeOf('house.gold')], ['punk', null, null, null, null], '5 envThemeOf')
  ok(skinDef('env.forest') === undefined, '5 環境主題不是建築部位外觀（SKINS 裡沒有）')
}

// ---- 6. 存檔相容 ----
{
  // 舊存檔（沒有 env）：照舊；有建築外殼、舊的 6 種裝飾實例、擺放紀錄都照舊
  const old = S({ skins: { owned: ['house.forest', 'house.gold'], equipped: { house: 'house.forest' } }, shop: { decor: [{ id: 'rocks#1', kind: 'rocks' }, { id: 'mushroom#2', kind: 'mushroom' }, { id: 'planter#3', kind: 'planter' }, { id: 'coral#4', kind: 'coral' }, { id: 'bush#5', kind: 'bush' }, { id: 'flowers#6', kind: 'flowers' }], nextDecorId: 7 }, farmLayout: { items: [{ id: 'rocks#1', kind: 'rocks', state: 'placed', x: 200, y: 220 }] } })
  eq(old.skins, { owned: ['house.forest', 'house.gold'], equipped: { house: 'house.forest' } }, '6 舊存檔的外觀照舊（沒有 env）')
  eq(old.shop.decor.map((d) => d.kind), ['rocks', 'mushroom', 'planter', 'coral', 'bush', 'flowers'], '6 舊的 6 種暫時裝飾實例仍認得（商店不賣了）')
  eq(old.farmLayout.items.length, 1, '6 擺放紀錄照舊')
  eq(skinAtlasesFor(old.skins.equipped), ['skins_house'], '6 舊存檔不會載入 env 圖集')
  ok(equippedSkin(old, ENV_SLOT) === ENV_DEFAULT, '6 舊存檔是草地')
  // 新種類的實例與擺放
  const nu = S({ shop: { decor: [{ id: 'jelly_lamp#1', kind: 'jelly_lamp' }, { id: 'carousel#2', kind: 'carousel' }, { id: 'windmill#3', kind: 'windmill' }, { id: 'legend_stand#4', kind: 'legend_stand' }, { id: 'jelly_lamp#1', kind: 'jelly_lamp' }, { id: 'carousel#5', kind: 'rocks' }], nextDecorId: 2 }, farmLayout: { items: [{ id: 'carousel#2', kind: 'carousel', state: 'placed', x: 300.4, y: 250 }, { id: 'windmill#3', kind: 'windmill', state: 'stored' }, { id: 'legend_stand#4', kind: 'legend_stand', state: 'placed', x: 1, y: 1 }] } })
  eq(nu.shop.decor.map((d) => d.id), ['jelly_lamp#1', 'carousel#2', 'windmill#3', 'legend_stand#4'], '6 新種類實例認得（C：含傳說展示台）；重複 id、種類對不上的丟掉')
  eq(nu.shop.nextDecorId, 5, '6 nextDecorId 至少是最大編號 + 1')
  eq(nu.farmLayout.items.map((i) => [i.id, i.state, i.x, i.y]), [['carousel#2', 'placed', 300, 250], ['windmill#3', 'stored', undefined, undefined], ['legend_stand#4', 'placed', 1, 1]], '6 擺放紀錄：新種類認得、座標取整')
  eq(cleanShop(cleanShop(nu.shop)), cleanShop(nu.shop), '6 清理兩次和一次相同')
  eq(cleanFarmLayout(cleanFarmLayout(nu.farmLayout)), cleanFarmLayout(nu.farmLayout), '6 擺放清理兩次和一次相同')
  // 環境主題的存檔：owned／equipped 來回保留；穿著的不在 owned（壞檔）會被拿掉
  const e1 = S({ skins: { owned: ['env.forest', 'env.punk'], equipped: { env: 'env.forest', house: 'house.nope' } } })
  eq(e1.skins.equipped, { env: 'env.forest' }, '6 穿著的環境主題保留、沒擁有的外觀拿掉')
  const e2 = S({ skins: { owned: ['env.forest'], equipped: { env: 'env.punk' } } })
  eq(e2.skins.equipped, {}, '6 穿著沒擁有的環境主題 → 拿掉（回到草地）')
  const e3 = S({ skins: { owned: ['env.future'], equipped: { env: 'env.future' } } })
  eq(e3.skins.equipped, { env: 'env.future' }, '6 以後新增的主題 id 先保留（不認得時引擎用草地）')
  eq(envThemeOf(e3.skins.equipped.env), null, '6 不認得的主題引擎用草地')
  eq(parseSave(JSON.parse(JSON.stringify(e1))).skins, e1.skins, '6 存檔來回')
}

// ---- 7. 夜晚補光 ----
{
  const m = await mg.measureAll(ROOT)
  for (const k of Object.keys(mg.GLOW_PROBES)) {
    ok(m[k], `7 ${k} 量得到發光部位`)
    eq(GLOW[k] && { dx: GLOW[k].dx, dy: GLOW[k].dy }, m[k] && { dx: m[k].dx, dy: m[k].dy }, `7 GLOW.${k} = 量測（依成品的發光部位重心）`)
    const s = crop(k)
    const gx = Math.round(s.ax + GLOW[k].dx), gy = Math.round(s.ay - GLOW[k].dy)
    ok(gx >= 0 && gx < s.w && gy >= 0 && gy < s.h, `7 ${k} 光源 (${gx},${gy}) 在素材範圍內`)
    // 光源附近 5×5 內要有發光部位的像素
    let near2 = 0
    for (let y = gy - 4; y <= gy + 4; y++) for (let x = gx - 4; x <= gx + 4; x++) if (x >= 0 && y >= 0 && x < s.w && y < s.h) { const [r, g, b, a] = px(s, x, y); if (a && mg.GLOW_PROBES[k].test(r, g, b)) near2++ }
    ok(near2 > 0, `7 ${k} 光源 9×9 範圍內有發光部位的像素（${near2}）`)
    ok(GLOW[k].scale > 0 && GLOW[k].scale <= 1 && GLOW[k].rgb.every((c) => c >= 0 && c <= 255), `7 ${k} 光色與大小在範圍內`)
  }
  eq(Object.keys(GLOW).sort(), [...THEMES.map((t) => 'lamp_' + t), 'crystal_ball', 'info_terminal'].sort(), '7 光源：路燈 6 款＋水晶球座＋資訊終端螢幕')
  eq(LAMP_GLOW_DEFAULT, { dx: 0, dy: 62, rgb: [255, 200, 100], scale: 1 }, '7 預設路燈光暈錨點 = 原本寫死的「腳下往上 62」、暖黃色')
  eq(THEMES.map((t) => GLOW['lamp_' + t].dy), [76, 74, 61, 66, 72, 55], '7 六款路燈各自的光暈高度（寶珠在頂、LED 板偏右上、燈籠掛右側、火焰在頂、霓虹圈在頂、燈籠掛右側）')
  ok(GLOW.lamp_cleanroom.dx > 10 && GLOW.lamp_forest.dx > 10 && GLOW.lamp_plaid.dx > 10, '7 LED 板、兩款燈籠的光暈偏右')
  ok(Math.abs(GLOW.lamp_atlantis.dx) <= 2 && Math.abs(GLOW.lamp_magic.dx) <= 2 && Math.abs(GLOW.lamp_punk.dx) <= 2, '7 寶珠、火焰、霓虹圈在頂：光暈在燈柱中心上方')
  // drawGlow 沒給 opts = 原本的畫圖指令（逐筆相同）
  const rec = (opts) => {
    const calls = []
    const ctx = { save() { calls.push('save') }, restore() { calls.push('restore') }, set globalCompositeOperation(v) { calls.push('op:' + v) }, set fillStyle(v) { calls.push('fs:' + v) }, fillRect(...a) { calls.push('r:' + a.join(',')) } }
    drawGlow(ctx, 171, 246, 0.8, opts)
    return calls
  }
  const orig = []
  {
    orig.push('save', 'op:lighter')
    for (let ring = 4; ring >= 1; ring--) {
      const rx = ring * 9, ry = ring * 7
      orig.push(`fs:rgba(255,200,100,${(0.055 * 0.8).toFixed(3)})`)
      for (let dy = -ry; dy <= ry; dy++) { const hw = Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.01))); orig.push(`r:${171 - hw},${246 + dy},${hw * 2 + 1},1`) }
    }
    orig.push('restore')
  }
  eq(rec(undefined), orig, '7 沒穿主題的路燈光暈：drawGlow 的畫圖指令和原本逐筆相同')
  ok(rec({ rgb: [90, 170, 255], scale: 0.5 }).length < orig.length, '7 縮小倍率的光暈比較小')
  ok(rec({ rgb: [90, 170, 255], scale: 1 }).some((c) => c === 'fs:rgba(90,170,255,0.044)'), '7 光色可指定')
}

// ---- 8. 路燈與樹沿用舊的碰撞與遮蔽 ----
{
  eq([ENVELOPES.lamp.w, ENVELOPES.lamp.h, ENVELOPES.lamp.ax, ENVELOPES.tree.w, ENVELOPES.tree.h, ENVELOPES.tree.ax], [51, 84, 26, 82, 103, 41], '8 路燈與樹的遮蔽輪廓仍是舊的（51×84、82×103）')
  eq([KIND_GEOM.lamp.foot, KIND_GEOM.tree.foot, KIND_GEOM.lamp.sprite, KIND_GEOM.tree.sprite], [{ x0: -12.75, x1: 12.75, d: 10 }, { x0: -9, x1: 9, d: 12 }, 'lamp', 'tree'], '8 路燈與樹的腳下佔地沿用舊的')
  eq([LAY.LAMP_W, LAY.LAMP_H, LAY.LAMP_AX, LAY.TREE_W, LAY.TREE_H, LAY.TRUNK_HALF_W, LAY.TRUNK_H], [51, 84, 26, 82, 103, 9, 12], '8 layout 常數不變')
  eq(man.frames.lamp.w + 'x' + man.frames.lamp.h, '51x84', '8 預設路燈素材不變')
  eq(LAYOUT_ITEMS.length, 18, '8 內建固定物件仍是 18 個')
  ok(THEME_DECOR_KINDS.every((k) => !LAYOUT_ITEMS.some((d) => d.kind === k)), '8 主題裝飾沒有內建（固定 id）的物件，只能從商店買實例')
  eq(parseInstanceId('windmill#12'), { kind: 'windmill', n: 12 }, '8 解析 windmill#12')
  eq(parseInstanceId('legend_stand#1'), { kind: 'legend_stand', n: 1 }, '8 傳說展示台（C）可以是實例')
}

if (fails.length) {
  console.log(fails.slice(0, 80).join('\n'))
  console.log(`v4.0-B2 主題測試：${n} 項中失敗 ${fails.length} 項`)
  process.exit(1)
}
for (const r of report) console.log(r)
console.log(`v4.0-B2 主題測試：${n} 項全部通過`)
