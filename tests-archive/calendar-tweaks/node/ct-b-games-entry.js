// B 取消小遊戲達標金幣：發放路徑已刪除、earning.gameCoins 相容保留、啟動台程式金幣不變、舊存檔讀寫
import './env-shim.js'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as EARN from '../../../src/farm/sim/earning.ts'
import { BALANCE } from '../../../src/farm/config/balance.ts'
import { parseSave } from '../../../src/farm/save/migrate.ts'
import { newSave, todayKey } from '../../../src/farm/sim/points.ts'
import * as OEARN from '../.work/v391src/src/farm/sim/earning.ts'
import { parseSave as oldParse } from '../.work/v391src/src/farm/save/migrate.ts'

let n = 0
const ok = (c, m) => { n++; assert.ok(c, m) }
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m) }
const ROOT = process.env.REPO_ROOT
const T0 = new Date(2026, 10, 19, 12, 0, 0).getTime()
const today = todayKey(T0)

// 1. 發放路徑已刪除（原始碼掃描）
const walk = (d, out = []) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(f)) out.push(p) } return out }
const files = walk(join(ROOT, 'src'))
for (const word of ['useRoundReward', 'claimGame', 'earnGame', 'gameGoals', 'meetsGoal', '今日遊戲金幣', 'earn.game']) {
  const hits = files.filter((f) => readFileSync(f, 'utf8').includes(word))
  eq(hits, [], `原始碼不再出現「${word}」`)
}
const gameFiles = walk(join(ROOT, 'src/games'))
ok(gameFiles.length >= 6, '遊戲檔案有讀到')
for (const f of gameFiles) ok(!readFileSync(f, 'utf8').includes('farmStore'), '遊戲不再引用養殖場：' + f.slice(ROOT.length))
ok(!('claimGame' in EARN) && !('meetsGoal' in EARN), 'earning.ts 沒有 claimGame／meetsGoal')
ok(!('game' in BALANCE.earn) && !('gameGoals' in BALANCE), 'BALANCE 沒有 earn.game、gameGoals')

// 2. 舊版確實有（對照組，證明掃描的東西真的存在過）
ok(typeof OEARN.claimGame === 'function', '對照：v3.9.1 有 claimGame')
const oldSave = oldParse({ ...newSave(T0, today), dataRev: 4 })
ok(OEARN.claimGame(oldSave, 'game-snake', { score: 99 }, T0).coins === 1, '對照：v3.9.1 貪食蛇達標 +1')

// 3. 啟動台程式金幣：和 v3.9.1 逐項相同（隨機 2000 次操作序列）
let seed = 310
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
for (let k = 0; k < 200; k++) {
  let a = parseSave({ ...newSave(T0, today), dataRev: 4 })
  let b = oldParse({ ...newSave(T0, today), dataRev: 4 })
  let t = T0
  for (let i = 0; i < 10; i++) {
    t += Math.floor(rnd() * 3 * 3_600_000)
    const app = 'app' + Math.floor(rnd() * 4)
    const ra = EARN.claimProgram(a, app, t)
    const rb = OEARN.claimProgram(b, app, t)
    eq([ra.coins, ra.reason], [rb.coins, rb.reason], '程式金幣與 v3.9.1 相同')
    eq(ra.save.points, rb.save.points, '金幣相同')
    eq(ra.save.earning, rb.save.earning, 'earning 相同（含 gameCoins）')
    a = ra.save
    b = rb.save
  }
}
const et = EARN.earningToday(parseSave({ ...newSave(T0, today), dataRev: 4 }), T0)
eq(Object.keys(et).sort(), ['programCoins', 'programMax'], 'earningToday 只剩程式的兩項')

// 4. 舊存檔的 gameCoins：讀取保留、同一天不動、換日歸零、新存檔仍有欄位
const withGame = { ...newSave(T0, today), dataRev: 4, earning: { date: today, programCoins: 3, gameCoins: 4, lastAward: { x: T0 }, digCoins: 2 } }
const p = parseSave(withGame)
eq(p.earning.gameCoins, 4, '讀到舊存檔的 gameCoins = 4（保留）')
eq(JSON.parse(JSON.stringify(p)).earning, withGame.earning, '寫回時 earning 原樣')
const sameDay = EARN.claimProgram(p, 'y', T0 + 1000)
eq(sameDay.save.earning.gameCoins, 4, '同一天其他賺金幣不動 gameCoins')
const nextDay = EARN.claimProgram(p, 'y', T0 + 86_400_000)
eq(nextDay.save.earning.gameCoins, 0, '換日歸零')
eq(newSave(T0, today).earning.gameCoins, 0, '新存檔仍有 gameCoins: 0（舊版程式讀得到）')
eq(oldParse(JSON.parse(JSON.stringify(nextDay.save))).earning, nextDay.save.earning, 'v3.9.1 讀新版寫的 earning 一樣')

console.log(`通過 B 取消遊戲金幣：${n} 項`)
