// v4.0 階段 A 瀏覽器測試：自己啟動 dev server（NEW_PORT，預設 5181 = 目前的專案），依序跑 browser/ 的測試，最後關掉。
// 用法：node tests-archive/v400a/run-browser.mjs [測試名…]。playwright-core 用 tests-archive/calendar-tweaks 的（先在那裡 npm install）。
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const ALL = ['ta-shop-browser']
const names = process.argv.length > 2 ? process.argv.slice(2) : ALL
const PORT = Number(process.env.NEW_PORT ?? 5181)
process.env.NEW_URL = `http://localhost:${PORT}/`
const p = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), ROOT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, no) => {
  let out = ''
  const t = setTimeout(() => no(new Error('dev server 逾時')), 90000)
  p.stdout.on('data', (d) => { out += d; if (out.replace(/\u001b\[[0-9;]*m/g, '').includes('localhost:' + PORT)) { clearTimeout(t); ok() } })
  p.on('exit', (c) => c && no(new Error('dev server 結束 ' + c + out)))
})
const failed = []
try {
  for (const n of names) {
    console.log(`=== ${n}`)
    const r = spawnSync(process.execPath, [join(HERE, 'browser', n + '.mjs')], { cwd: join(HERE, 'browser'), encoding: 'utf8', timeout: 900000, env: process.env })
    const lines = (r.stdout + r.stderr).trim().split('\n')
    const bad = lines.filter((l) => /^失敗/.test(l))
    console.log(lines.slice(-3).join('\n'))
    for (const l of bad.slice(0, 20)) console.log('  ' + l.slice(0, 300))
    console.log(`exit=${r.status}  失敗行 ${bad.length}  通過行 ${lines.filter((l) => /^通過/.test(l)).length}`)
    if (r.status !== 0 || bad.length) failed.push(n)
  }
} finally {
  p.kill()
}
console.log(failed.length ? '失敗：' + failed.join(' ') : `瀏覽器測試全部通過（${names.length} 個）`)
process.exit(failed.length ? 1 : 0)
