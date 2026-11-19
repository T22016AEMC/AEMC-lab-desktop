// 集滿天數估算（用真正的抽選程式 rollOutcome／pickItem）：輕度每天 1 局、重度每天 6 局；狗、貓各自，以及狗＋貓。
import { BALANCE } from '../../../src/farm/config/balance.ts'
import { ITEMS, itemsFor, isCollected, itemDef, shardKey } from '../../../src/farm/config/items.ts'
import { rollOutcome, pickItem } from '../../../src/farm/sim/dig.ts'

let seed = 361
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const q = (a, p) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null }
const dogItems = itemsFor('dog'), catItems = itemsFor('cat')

// plan: [{ sp, perDay }]；回傳各里程碑的天數
function run(plan, maxDays = 5000) {
  const col = {}
  const done = {}
  const stamp = (k, day) => { if (done[k] === undefined) done[k] = day }
  for (let day = 1; day <= maxDays; day++) {
    for (const p of plan) for (let i = 0; i < p.perDay; i++) {
      const o = rollOutcome(rnd)
      if (o.kind !== 'item') continue
      const { def, shard } = pickItem(p.sp, o.rarity, col, rnd)
      const key = shard ? shardKey(def.id, shard) : def.id
      col[key] = (col[key] ?? 0) + 1
    }
    const has = (id) => isCollected(col, itemDef(id))
    if (has('U002')) stamp('狗：6 片機密碎片集齊', day)
    if (has('U009')) stamp('貓：6 片合約碎片集齊', day)
    if (has('L001') && has('L002')) stamp('狗：L001＋L002', day)
    if (has('L003') && has('L004')) stamp('貓：L003＋L004', day)
    if (dogItems.every((d) => isCollected(col, d))) stamp('狗：狗能抽到的全部收齊', day)
    if (catItems.every((d) => isCollected(col, d))) stamp('貓：貓能抽到的全部收齊', day)
    if (ITEMS.every((d) => isCollected(col, d))) stamp('整本 28 項', day)
    const need = plan.map((p) => (p.sp === 'dog' ? '狗：狗能抽到的全部收齊' : '貓：貓能抽到的全部收齊'))
    if (need.every((k) => done[k] !== undefined) && (plan.length < 2 || done['整本 28 項'] !== undefined)) break
  }
  return done
}
const N = 1500
function table(name, plan) {
  const res = []
  for (let i = 0; i < N; i++) res.push(run(plan))
  const keys = [...new Set(res.flatMap((r) => Object.keys(r)))]
  console.log(`\n【${name}】（${N} 次模擬；中位數／第 90 百分位，單位：天）`)
  for (const k of keys) {
    const a = res.map((r) => r[k])
    console.log(`  ${k}：${q(a, 0.5)}／${q(a, 0.9)}`)
  }
}
const p = BALANCE.dig
console.log(`機率：空 ${(1 - p.coin.bronze - p.coin.silver - p.coin.gold - p.rarity.common - p.rarity.uncommon - p.rarity.rare - p.rarity.legendary).toFixed(4)}、銅 ${p.coin.bronze}、銀 ${p.coin.silver}、金 ${p.coin.gold}、常見 ${p.rarity.common.toFixed(5)}、少見 ${p.rarity.uncommon.toFixed(5)}、稀有 ${p.rarity.rare.toFixed(5)}、傳說 ${p.rarity.legendary.toFixed(5)}`)
console.log(`每次挖／尋的金幣期望：${(p.coin.bronze * 1 + p.coin.silver * 2 + p.coin.gold * 5).toFixed(3)}；一局（5 次）${((p.coin.bronze * 1 + p.coin.silver * 2 + p.coin.gold * 5) * 5).toFixed(2)}（成本 1）`)
for (const [label, per] of [['輕度：每天 1 局（約 5 次）', 5], ['重度：每天 6 局（約 30 次）', 30]]) {
  table(`${label}｜只養狗`, [{ sp: 'dog', perDay: per }])
  table(`${label}｜只養貓`, [{ sp: 'cat', perDay: per }])
  table(`${label}｜狗＋貓各一隻（各玩一樣多）`, [{ sp: 'dog', perDay: per }, { sp: 'cat', perDay: per }])
}
