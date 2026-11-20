// 階段 R 調參工具：原圖換成整齊 4×4 格之後，替每張圖找「輸出尺寸和 before.json 完全相同」的像素格 p。
// 用 process-assets.mjs 的 sheet({ probe: true }) 拿到和管線一模一樣的切格與取樣函式，p 以 0.15% 的等比步長掃描，
// 取「完全相同的格數最多」的 p 區間的中點（區間越寬，原圖小改時越不會跳）。只印結果，不改任何檔。
// 用法：ASSET_SRC=<原圖資料夾> node tests-archive/v400r/tune-p.mjs [項目 id…]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const pa = await import('../../scripts/process-assets.mjs')
const before = JSON.parse(readFileSync(join(HERE, 'before.json'), 'utf8')).frames

const DOGS = { shiba: '柴犬.png', corgi: '柯基.png', husky: '哈士奇.png', golden: '黃金獵犬.png', collie: '邊境牧羊犬.png', poodle: '貴賓犬.png' }
const DOG_CORE = ['stand', 'walk_a', 'walk_b', 'sit_a', 'sit_b', 'sleep', 'eat', 'happy']
const DOG_EXTRA = ['jump', 'dig_a', 'dig_b', 'tug', 'belly_up', 'bark']
const CATS = ['orange', 'black', 'calico', 'siamese', 'bluecat', 'ragdoll']
const CAT_CORE = ['stand', 'walk_a', 'walk_b', 'sit_a', 'unused_back', 'sleep', 'eat', 'groom']
const CAT_EXTRA = ['crouch', 'pounce', 'swat', 'tangled']
const TOYS = ['ball', 'frisbee', 'rope', 'bone', 'shoe', 'chest_closed', 'chest_open', 'dirt_mound'].map((n) => 'toy_' + n)
const half = (k) => ({ w: before[k].w / 2, h: before[k].h }) // 左右鏡像拼接的素材：單張 = 一半寬

/** parts：{ file, cols, rows, names, opts, keys: {幀名: before 鍵或 {w,h}}, scale?: {幀名: 係數}, post?: (spr, name) => spr } */
const SPECS = [
  // —— 原本靠估算格大小的 ——
  { id: 'front', mode: 'shared', parts: [{ file: '大家的正面照.png', cols: 6, rows: 2, names: [...Object.keys(DOGS).map((d) => 'front_dog_' + d), ...CATS.map((c) => 'front_cat_' + c)], opts: { grid: 'even' } }] },
  { id: 'tree', mode: 'shared', parts: [{ file: 'scene_tree.png', cols: 1, rows: 1, names: ['tree'] }] },
  {
    id: 'small', mode: 'shared', parts: [
      { file: '小建築.png', cols: 3, rows: 2, names: ['doghouse', 'cat_tree', 'bowls', null, 'lamp', null], scale: pa.BUILDING_SCALES },
      { file: '小建築.png', cols: 3, rows: 2, names: [null, null, null, 'planter', null, 'coral'], opts: { nearBg: true }, scale: pa.BUILDING_SCALES, post: (s) => pa.trimMagentaFringe(s).spr },
    ],
  },
  // 小建築逐格（pFrames 的值已含縮放係數，所以這裡不除 scale）
  {
    id: 'smallPer', mode: 'perFrame', parts: [
      { file: '小建築.png', cols: 3, rows: 2, names: ['doghouse', 'cat_tree', 'bowls', null, 'lamp', null] },
      { file: '小建築.png', cols: 3, rows: 2, names: [null, null, null, 'planter', null, 'coral'], opts: { nearBg: true }, post: (s) => pa.trimMagentaFringe(s).spr },
    ],
  },
  { id: 'bnPer', mode: 'perFrame', parts: [{ file: 'buildings_new.png', cols: 4, rows: 2, names: ['bathtub', null, null, null, null, 'picnic', null, null] }] },
  { id: 'bn', mode: 'shared', parts: [{ file: 'buildings_new.png', cols: 4, rows: 2, names: ['bathtub', null, null, null, null, 'picnic', null, null] }] },
  { id: 'toysDog', mode: 'shared', parts: [{ file: 'toys_dog.png', cols: 4, rows: 2, names: TOYS, opts: { minArea: 120 } }] },
  { id: 'toysCat', mode: 'shared', parts: [{ file: 'toys_cat.png', cols: 3, rows: 3, names: ['toy_laser_dot', 'toy_wand', 'toy_yarn'], opts: { minArea: 120 } }] },
  { id: 'sky', mode: 'shared', parts: [{ file: 'scene_sky_objects.png', cols: 4, rows: 2, names: ['sun', 'moon', 'star', 'cloud_a', 'cloud_b', 'cloud_c', 'raindrop', null] }] },
  { id: 'far', mode: 'shared', parts: [{ file: 'scene_far.png', cols: 1, rows: 1, names: ['far'], opts: { minArea: 5000 }, keys: { far: half('far') } }] },
  // —— 有目標尺寸、但目標求出來的尺寸和以前差 ±1～2 的：逐格或整張指定 ——
  { id: 'decor', mode: 'perFrame', parts: [{ file: 'decor.png', cols: 3, rows: 2, names: ['bush', 'rocks', 'flowers', 'tall_grass', 'mushroom', 'stump'] }] },
  { id: 'tower', mode: 'perFrame', parts: [
    { file: 'scene_clocktower.png', cols: 1, rows: 1, names: ['clocktower'] },
    { file: 'scene_clocktower_open.png', cols: 1, rows: 1, names: ['clocktower_open'] },
    { file: 'scene_clocktower_gold.png', cols: 1, rows: 1, names: ['clocktower_gold'] },
    { file: 'scene_clocktower_open_gold.png', cols: 1, rows: 1, names: ['clocktower_open_gold'] },
  ] },
  { id: 'fxIcons', mode: 'perFrame', parts: [{ file: 'fx_icons.png', cols: 4, rows: 2, names: ['heart', 'zzz', 'note', 'sweat', 'exclaim', 'sparkle', 'bubble', 'question'].map((n) => 'fx_' + n), opts: { minArea: 150 } }] },
  { id: 'fxWater', mode: 'shared', parts: [{ file: 'fx_water.png', cols: 4, rows: 2, names: ['water_ripple_1', 'water_ripple_2', 'water_ripple_3', 'water_splash_1', 'water_splash_2', 'water_splash_3', null, null], opts: { minArea: 150 } }] },
  { id: 'toySmall', mode: 'perFrame', parts: [{ file: 'toys_dog.png', cols: 4, rows: 2, names: TOYS.map((n) => (n === 'toy_ball' || n === 'toy_dirt_mound' ? n : null)), opts: { minArea: 120 }, keys: { toy_ball: 'toy_ball_s', toy_dirt_mound: 'toy_dirt_mound_s' } }] },
  { id: 'snow', mode: 'perFrame', parts: [{ file: 'scene_sky_objects.png', cols: 4, rows: 2, names: [null, null, null, null, null, null, null, 'snowflake'] }] },
  { id: 'digB', mode: 'perFrame', parts: [{ file: 'items_dig_b.png', cols: 3, rows: 2, names: ['coin_bronze', 'coin_silver', 'coin_gold', 'fx_reveal', 'board', null] }] },
  { id: 'papers', mode: 'shared', parts: [{ file: 'items_complete.png', cols: 2, rows: 1, names: ['paper_dog', 'paper_cat'] }] },
  { id: 'mats', mode: 'shared', parts: [{ file: 'picnic_mats.png', cols: 3, rows: 1, names: ['picnic_mat_red', 'picnic_mat_blue', 'picnic_mat_pink'], opts: { strictBg: true }, keys: { picnic_mat_red: { w: 104, h: 63, wMax: true }, picnic_mat_blue: { w: 104, h: 63, wMax: true }, picnic_mat_pink: { w: 104, h: 63, wMax: true } } }] },
  { id: 'camera', mode: 'shared', parts: [{ file: 'picnic_camera.png', cols: 1, rows: 1, names: ['picnic_camera'] }] },
  { id: 'food', mode: 'shared', parts: [{ file: 'picnic_food.png', cols: 2, rows: 2, names: ['picnic_food_sandwich', 'picnic_food_fruit', 'picnic_food_cake', 'picnic_food_juice'] }] },
  { id: 'polaroid', mode: 'shared', parts: [{ file: 'polaroid_frames_b.png', cols: 3, rows: 1, names: ['polaroid_hearts', 'polaroid_flowers', 'polaroid_stars'] }] },
  { id: 'orangeFix', mode: 'shared', parts: [{ file: 'cat_orange_core_fix.png', cols: 3, rows: 1, names: ['sleep', 'eat', 'groom'], keys: { sleep: 'cat_orange_sleep', eat: 'cat_orange_eat', groom: 'cat_orange_groom' } }] },
  // —— 動物：每隻一個 p（core 與 extra 共用；貓 extra 另外找，報告比例） ——
  ...Object.entries(DOGS).map(([d, f]) => ({
    id: 'dog_' + d, mode: 'shared', must: ['stand'], parts: [
      { file: f, cols: 4, rows: 2, names: DOG_CORE, keyPrefix: `dog_${d}_` },
      { file: `dog_${d}_extra.png`, cols: 3, rows: 2, names: DOG_EXTRA, keyPrefix: `dog_${d}_` },
    ],
  })),
  ...CATS.map((c) => ({ id: 'cat_' + c, mode: 'shared', must: ['stand'], parts: [{ file: `cat_${c}_core_hd.png`, cols: 4, rows: 2, names: CAT_CORE, keyPrefix: `cat_${c}_`, skip: c === 'orange' ? ['sleep', 'eat', 'groom'] : [] }] })),
  ...CATS.map((c) => ({ id: 'catx_' + c, mode: 'shared', parts: [{ file: c === 'orange' ? 'cat_orange_extra_hd.png' : `cat_${c}_extra_hd.png`, cols: 2, rows: 2, names: CAT_EXTRA, keyPrefix: `cat_${c}_`, skip: c === 'orange' ? ['swat'] : [] }] })),
  { id: 'catx_orange_swat', mode: 'shared', parts: [{ file: 'cat_orange_extra.png', cols: 2, rows: 2, names: [null, null, 'swat', null], keyPrefix: 'cat_orange_' }] },
  // —— 4.0-B1 主題外殼：逐格、輸出要「填滿畫布但不可超過」（canvas）、nearBg＋去暗紫邊（和管線第 10 段相同）——
  ...skinSpecs(),
]

/** B1 外殼的調參項目：id = skin_<組>；畫布 = 該部位預設圖的大小（食盆 57×31）；range = 掃描的 p 範圍 */
function skinSpecs() {
  const TH = ['atlantis', 'cleanroom', 'forest', 'magic', 'punk', 'plaid']
  const POND = ['plaid', 'atlantis', 'forest', 'magic', 'punk', 'cleanroom']
  const trim = (sp) => pa.trimMagentaFringe(sp).spr
  const cv = (w, h) => ({ w, h, canvas: true })
  const one = (file, name, c, grid) => ({ file, cols: 1, rows: 1, names: [name], opts: { nearBg: true }, post: trim, keys: { [name]: c } })
  const out = []
  out.push({ id: 'skin_house', mode: 'perFrame', range: [3.2, 3.8], parts: TH.map((t) => ({ file: `house_${t}.png`, cols: 3, rows: 1, names: ['closed', 'open', 'night'].map((n) => `house_${t}_${n}`), opts: { nearBg: true, grid: 'even' }, post: trim, keys: Object.fromEntries(['closed', 'open', 'night'].map((n) => [`house_${t}_${n}`, cv(139, 134)])) })) })
  out.push({ id: 'skin_tower', mode: 'perFrame', range: [3.4, 3.8], parts: TH.flatMap((t) => [one(`tower_${t}.png`, `tower_${t}`, cv(123, 160)), one(`tower_${t}_open.png`, `tower_${t}_open`, cv(123, 160))]) })
  const sheet6 = (id, file, order, prefix, c, range) => ({ id, mode: 'perFrame', range, parts: [{ file, cols: 3, rows: 2, names: order.map((t) => prefix + t), opts: { nearBg: true, grid: 'even' }, post: trim, keys: Object.fromEntries(order.map((t) => [prefix + t, c])) }] })
  out.push(sheet6('skin_pond', 'pond_themes.png', POND, 'pond_', cv(110, 79), [3.6, 4.4]))
  out.push(sheet6('skin_board', 'board_themes.png', TH, 'board_', cv(64, 50), [6.5, 7.6]))
  out.push(sheet6('skin_doghouse', 'doghouse_themes_v2.png', TH, 'doghouse_', cv(99, 83), [4.6, 5.3]))
  out.push(sheet6('skin_cattree', 'cattree_themes_v2.png', TH, 'cat_tree_', cv(72, 90), [4.6, 5.4]))
  out.push(sheet6('skin_bowls', 'bowl_themes_v2.png', TH, 'bowls_', cv(57, 31), [7.6, 9.0]))
  return out
}

const want = new Set(process.argv.slice(2))
const results = {}
for (const spec of SPECS) {
  if (want.size && !want.has(spec.id)) continue
  // 每一格：render、目標尺寸
  const items = []
  for (const part of spec.parts) {
    const pr = await pa.sheet({ file: part.file, cols: part.cols, rows: part.rows, names: part.names, ...(part.opts ?? {}), probe: true })
    part.names.forEach((n, i) => {
      if (!n || (part.skip ?? []).includes(n) || (part.only && !part.only.includes(n))) return
      const kRaw = part.keys?.[n] ?? (part.keyPrefix ?? '') + n
      const tgt = typeof kRaw === 'string' ? before[kRaw] : kRaw
      if (!tgt) { console.log('沒有基準：' + spec.id + ' ' + n); return }
      const cell = pr.cells[i]
      if (!cell?.length) { console.log('找不到格子：' + spec.id + ' ' + n); return }
      items.push({ name: n, key: typeof kRaw === 'string' ? kRaw : n, w: tgt.w, h: tgt.h, wMax: !!tgt.wMax, canvas: !!tgt.canvas, render: (p) => { let s = pr.render(cell, p / (part.scale?.[n] ?? 1)); if (s && part.post) s = part.post(s, n); return s } })
    })
  }
  const grid = []
  // spec.range：只在這個範圍內細掃（步長 0.05%）；沒有就全範圍 0.15%
  if (spec.range) for (let p = spec.range[0]; p <= spec.range[1]; p *= 1.0005) grid.push(p)
  else for (let p = 2; p <= 48; p *= 1.0015) grid.push(p)
  // canvas：要貼進這個大小的畫布：比畫布大就是不行（+1000），小於畫布算差距（越接近越好）
  const score = (s, it) => (s ? (it.canvas ? Math.abs(s.w - it.w) + Math.abs(s.h - it.h) + 1000 * ((s.w > it.w) + (s.h > it.h)) : it.wMax ? Math.abs(Math.max(0, s.w - it.w)) + Math.abs(s.h - it.h) : Math.abs(s.w - it.w) + Math.abs(s.h - it.h)) : 999)
  const pick = (vals) => {
    // vals[i] = { ok: 完全相同的個數, err: 總誤差 }：先比 ok（多者勝）再比 err；取最佳值的最長連續區間的中點
    let best = null
    for (const v of vals) if (!best || v.ok > best.ok || (v.ok === best.ok && v.err < best.err)) best = v
    let run = null, cur = null
    for (let i = 0; i < vals.length; i++) {
      const same = vals[i].ok === best.ok && vals[i].err === best.err
      if (same) { cur = cur ? { ...cur, hi: i } : { lo: i, hi: i } ; if (!run || cur.hi - cur.lo > run.hi - run.lo) run = { ...cur } } else cur = null
    }
    const mid = (run.lo + run.hi) >> 1
    return { p: grid[mid], lo: grid[run.lo], hi: grid[run.hi], ok: best.ok, err: best.err }
  }
  if (spec.mode === 'shared') {
    // 粗掃（每 4 步）找大致位置，再在附近細掃
    // must：這幾格的「高度」一定要相同（動物的站姿高 = STAND_HEIGHT 的基準；寬度不限），不同就當成最差
    const evalAt = (p) => { let ok = 0, err = 0, bad = false; for (const it of items) { const s = it.render(p); const e = score(s, it); err += e; if (e === 0) ok++; if ((spec.must ?? []).includes(it.name) && (!s || s.h !== it.h)) bad = true } return bad ? { ok: -1, err: 1e9 } : { ok, err } }
    const coarse = grid.filter((_, i) => i % 4 === 0).map((p) => ({ p, ...evalAt(p) }))
    let cb = coarse[0]
    for (const v of coarse) if (v.ok > cb.ok || (v.ok === cb.ok && v.err < cb.err)) cb = v
    const lo = cb.p / 1.25, hi = cb.p * 1.25
    const sub = grid.filter((p) => p >= lo && p <= hi)
    const vals = sub.map((p) => evalAt(p))
    const savedGrid = grid.splice(0, grid.length, ...sub)
    const r = pick(vals)
    grid.splice(0, grid.length, ...savedGrid)
    const detail = items.map((it) => { const s = it.render(r.p); return `${it.key} ${s.w}×${s.h}${s.w === it.w && s.h === it.h ? '' : `（舊 ${it.w}×${it.h}）`}` })
    results[spec.id] = { p: +r.p.toFixed(3), range: [+r.lo.toFixed(3), +r.hi.toFixed(3)], ok: r.ok, of: items.length, detail }
  } else {
    results[spec.id] = {}
    for (const it of items) {
      const vals = grid.map((p) => { const e = score(it.render(p), it); return { ok: e === 0 ? 1 : 0, err: e } })
      const r = pick(vals)
      const s = it.render(r.p)
      results[spec.id][it.name] = { p: +r.p.toFixed(3), range: [+r.lo.toFixed(3), +r.hi.toFixed(3)], got: `${s.w}×${s.h}`, want: `${it.w}×${it.h}` }
    }
  }
  console.log(spec.id, JSON.stringify(results[spec.id]))
}
mkdirSync(join(HERE, '.work'), { recursive: true })
writeFileSync(join(HERE, '.work', 'tune-result.json'), JSON.stringify(results, null, 1))
