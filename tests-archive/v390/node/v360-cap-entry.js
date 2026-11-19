import * as LAY from '../../../src/farm/pixel/layout.ts'
import * as FD from '../../../src/farm/pixel/finds.ts'
const SZ17 = [[1920, 900, 1], [1920, 930, 1], [1920, 950, 1], [1900, 1000, 1.25], [1920, 1000, 1], [1920, 1120, 1], [1536, 730, 1], [1536, 864, 1], [1440, 780, 1], [1366, 650, 1], [1280, 620, 1], [1280, 720, 1], [1024, 768, 1], [2560, 1300, 1], [2560, 1440, 1], [1536, 730, 1.25], [1920, 930, 1.25], [1280, 480, 1]]
const mkRand = (s) => { let x = s; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296 } }
const OWNED = ['kennel', 'bowls', 'catTree']
for (const [w, h, dpr] of SZ17) {
  const L0 = LAY.computeLayout(Math.round(w * dpr), Math.round((h - 28) * dpr), dpr)
  for (const owned of [[], OWNED]) {
    const L = { ...L0, owned: new Set(owned) }
    const g = FD.grassRect(L)
    // 最多放得下幾個：隨機貪婪填 30 次，取最大
    let best = 0, worst = 99, sum = 0
    const T = 150
    for (let t = 0; t < T; t++) {
      const rand = mkRand(t * 7 + 1)
      const placed = []
      for (let i = 0; i < 16; i++) {
        const kind = rand() < 0.5 ? 'bundle' : 'mound'
        const sp = FD.pickFindSpot({ L, rand, kind, anchor: { x: L.W * rand(), y: g.y1 }, reach: 1e9, finds: placed, pets: [], minDist: 0 })
        if (!sp) break
        placed.push({ id: 'k' + i, kind, ...FD.worldToFind(L, sp.x, sp.y) })
      }
      best = Math.max(best, placed.length); worst = Math.min(worst, placed.length); sum += placed.length
    }
    const area = FD.grassArea(L)
    console.log(`${w}×${h}@${dpr} ${L.W}×${L.H} S=${L.S} 建築${owned.length ? '三個' : '無'}：草地範圍 ${Math.round(g.x1 - g.x0)}×${Math.round(g.y1 - g.y0)}，可放面積 ${area}，上限 ${FD.findCap(L)}，隨機亂放塞得下 最少 ${worst} 平均 ${(sum / T).toFixed(1)} 最多 ${best}（16 為上限）`)
  }
}
