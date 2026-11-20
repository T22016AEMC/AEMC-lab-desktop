// 4.0 階段 R：讓「和舊版逐像素比對」的瀏覽器測試比的是程式，不是素材。
// 把目前 repo 的素材輸出（public/assets/*、src/farm/pixel/assetIndex.ts）蓋到舊版原始碼的對照組：
//   tests-archive/v390/.work/v381src（t1c-path 的 v3.8.1）、tests-archive/calendar-tweaks/.work/v391src（tp-pixel-v391 的 v3.9.1）
// 這些資料夾在 .gitignore 裡，由各自的 setup.mjs 從 git 取出；要回到原本的舊素材，刪掉資料夾重跑 setup.mjs。
// 用法：node tests-archive/v400r/overlay-old-assets.mjs（改素材後要再跑一次）
import { copyFileSync, existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'public', 'assets')
const TARGETS = [join(ROOT, 'tests-archive', 'v390', '.work', 'v381src'), join(ROOT, 'tests-archive', 'calendar-tweaks', '.work', 'v391src')]
for (const t of TARGETS) {
  if (!existsSync(join(t, 'src'))) { console.log('沒有 ' + t + '（先跑那一組的 setup.mjs）'); continue }
  const out = join(t, 'public', 'assets')
  let removed = 0
  for (const f of readdirSync(out)) if (/\.(png|json)$/.test(f)) { unlinkSync(join(out, f)); removed++ }
  for (const f of readdirSync(SRC)) copyFileSync(join(SRC, f), join(out, f))
  copyFileSync(join(ROOT, 'src', 'farm', 'pixel', 'assetIndex.ts'), join(t, 'src', 'farm', 'pixel', 'assetIndex.ts'))
  // 素材量出來的尺寸常數也要跟著素材：食盆水盆高 26→27（建築空位外框用到，影響有三個建築時的畫面）
  const lay = join(t, 'src', 'farm', 'pixel', 'layout.ts')
  const s = readFileSync(lay, 'utf8')
  const s2 = s.replace(/^export const BOWLS_H = 26\b/m, 'export const BOWLS_H = 27')
  if (s2 !== s) writeFileSync(lay, s2)
  console.log(`${t}：移除舊素材 ${removed} 個、放入目前素材 ${readdirSync(SRC).length} 個與 assetIndex.ts；BOWLS_H ${s2 !== s ? '26→27' : '已是 27'}`)
}
