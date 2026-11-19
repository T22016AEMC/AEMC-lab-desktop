// 新天氣權重下，連續 30 天（每 4 小時一段，共 180 段）各天氣實際出現比例；另列之後兩個 30 天與 10 萬段長期比例
import { weatherAt } from '../../../src/farm/sim/worldTime.ts'
import { BALANCE } from '../../../src/farm/config/balance.ts'
const BLOCK = BALANCE.weatherBlockHours * 3600000
const count = (t0, nBlocks) => { const c = { sunny: 0, cloudy: 0, rain: 0, snow: 0 }; for (let i = 0; i < nBlocks; i++) c[weatherAt(t0 + i * BLOCK)]++; return c }
const fmt = (c, n) => Object.entries(c).map(([k, v]) => `${k} ${v} 段（${(v / n * 100).toFixed(1)}%）`).join('、')
const t0 = Math.floor(new Date(2026, 10, 15, 0, 0).getTime() / BLOCK) * BLOCK
console.log('權重', JSON.stringify(BALANCE.weatherWeights))
for (let k = 0; k < 3; k++) {
  const s = t0 + k * 30 * 6 * BLOCK
  const d0 = new Date(s), d1 = new Date(s + 180 * BLOCK - 1)
  console.log(`30 天（${d0.toLocaleDateString('zh-TW')}～${d1.toLocaleDateString('zh-TW')}，180 段）：` + fmt(count(s, 180), 180))
}
console.log('10 萬段（約 45 年）：' + fmt(count(t0, 100000), 100000))
// 第一個 30 天裡下雪的段落
const snow = []; for (let i = 0; i < 180; i++) if (weatherAt(t0 + i * BLOCK) === 'snow') snow.push(new Date(t0 + i * BLOCK).toLocaleString('zh-TW'))
console.log('第一個 30 天下雪的段落：' + (snow.join('、') || '沒有'))
