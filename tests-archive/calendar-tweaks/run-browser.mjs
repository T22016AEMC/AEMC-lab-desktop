// 瀏覽器測試：自己啟動兩個 dev server（NEW_PORT（預設 5181）= 目前的專案、OLD_PORT（預設 5182）= v3.9.1（80c567a）舊版），依序跑 browser/ 的測試，最後關掉。
// 用法：node tests-archive/calendar-tweaks/run-browser.mjs [測試名…]（不給 = 全部）。環境變數 CHROME = 本機 Chrome 路徑。
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const ALL = ['tb-games-browser', 'te-writer-browser', 'tc-calendar-browser', 'tp-pixel-v391-browser', 'td1-label-browser', 'td3-swat-browser', 'td23-snack-browser', 'td22-nap-browser', 'td21-date-browser']
const names = process.argv.length > 2 ? process.argv.slice(2) : ALL
if (!existsSync(join(HERE, 'node_modules/playwright-core'))) {
  console.log('先在 tests-archive/calendar-tweaks 資料夾執行 npm install')
  process.exit(2)
}
if (!existsSync(join(HERE, '.work/v391src/src'))) {
  console.log('先執行 node tests-archive/calendar-tweaks/setup.mjs')
  process.exit(2)
}
// 埠號可用 NEW_PORT／OLD_PORT 改（預設 5181／5182）；測試用 NEW_URL／OLD_URL 取得網址
const NEW_PORT = Number(process.env.NEW_PORT ?? 5181)
const OLD_PORT = Number(process.env.OLD_PORT ?? 5182)
process.env.NEW_URL = `http://localhost:${NEW_PORT}/`
process.env.OLD_URL = `http://localhost:${OLD_PORT}/`
const viteBin = join(ROOT, 'node_modules/vite/bin/vite.js')
const servers = []
const start = (dir, port) =>
  new Promise((ok, no) => {
    const p = spawn(process.execPath, [viteBin, dir, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    servers.push(p)
    let out = ''
    const t = setTimeout(() => no(new Error('dev server 逾時 ' + port + '\n' + out)), 90000)
    p.stdout.on('data', (d) => {
      out += d
      // vite 的輸出有色碼（「localhost:」與埠號之間會夾著控制碼），先去掉再比對
      if (out.replace(/\u001b\[[0-9;]*m/g, '').includes('localhost:' + port)) {
        clearTimeout(t)
        ok()
      }
    })
    p.stderr.on('data', (d) => {
      out += d
    })
    p.on('exit', (c) => {
      if (c) no(new Error('dev server 結束 ' + c + '\n' + out))
    })
  })
const failed = []
try {
  await start(ROOT, NEW_PORT)
  await start(join(HERE, '.work/v391src'), OLD_PORT)
  for (const n of names) {
    console.log(`=== ${n}`)
    const r = spawnSync(process.execPath, [join(HERE, 'browser', n + '.mjs')], { cwd: join(HERE, 'browser'), encoding: 'utf8', timeout: 900000, env: process.env })
    const lines = (r.stdout + r.stderr).trim().split('\n')
    console.log(lines.slice(-4).join('\n'))
    const fails = lines.filter((l) => /^失敗|^FAIL/.test(l)).length
    for (const l of lines.filter((l) => /^失敗|^FAIL/.test(l)).slice(0, 15)) console.log('  ' + l.slice(0, 300))
    console.log(`exit=${r.status}  失敗行 ${fails}`)
    if (r.status !== 0 || fails) failed.push(n)
  }
} finally {
  for (const p of servers) {
    spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'])
    p.kill()
  }
}
if (failed.length) {
  console.log('失敗：' + failed.join(' '))
  process.exit(1)
}
console.log('瀏覽器測試全部通過（' + names.length + ' 個）')
