// 正式 build（dist/）不可包含的字串：測試模式、圖鑑、測試用入口、已取消或不處理的素材。
// 用法：npm run build 之後 node tests-archive/v390/dist-check.mjs（全部 0 才通過）
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist')
const FORBIDDEN = ['測試模式', '生物圖鑑', '__farm', 'shiftTime', 'flowerbed', 'seesaw', 'butterfly_', 'polaroid_frames_a', 'polaroid_frames_c', 'picnic_decor', 'stickers_']
const hits = new Map(FORBIDDEN.map((s) => [s, []]))
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) {
      walk(p)
      continue
    }
    const rel = p.slice(DIST.length + 1)
    for (const s of FORBIDDEN) if (f.includes(s)) hits.get(s).push(rel + '（檔名）')
    if (/\.(js|css|html|json|webmanifest)$/.test(f)) {
      const t = readFileSync(p, 'utf8')
      for (const s of FORBIDDEN) if (t.includes(s)) hits.get(s).push(rel)
    }
  }
}
walk(DIST)
let bad = 0
for (const [s, files] of hits) {
  console.log(`${files.length === 0 ? '通過' : '失敗'}  dist 搜尋「${s}」：${files.length}`)
  if (files.length) {
    bad++
    console.log('   ', files.slice(0, 5).join(', '))
  }
}
process.exit(bad ? 1 : 0)
