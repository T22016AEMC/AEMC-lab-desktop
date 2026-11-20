// 階段 R：啟動 dev server（NEW_PORT，預設 5191）→ 跑 browser/scene-shots.mjs <名稱> → 關掉；再跑 assets-snapshot.mjs 產生貼圖集。
// 用法：node tests-archive/v400r/run-shots.mjs before|after
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const NAME = process.argv[2] ?? 'before'
const PORT = Number(process.env.NEW_PORT ?? 5191)
process.env.NEW_URL = `http://localhost:${PORT}/`
const p = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), ROOT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
let code = 1
try {
  await new Promise((ok, no) => {
    let out = ''
    const t = setTimeout(() => no(new Error('dev server 逾時')), 90000)
    p.stdout.on('data', (d) => { out += d; if (out.replace(/\u001b\[[0-9;]*m/g, '').includes('localhost:' + PORT)) { clearTimeout(t); ok() } })
    p.on('exit', (c) => c && no(new Error('dev server 結束 ' + c + out)))
  })
  const r = spawnSync(process.execPath, [join(HERE, 'browser', 'scene-shots.mjs'), NAME], { cwd: join(HERE, 'browser'), encoding: 'utf8', timeout: 540000, env: process.env })
  console.log((r.stdout + r.stderr).trim())
  code = r.status ?? 1
} finally {
  p.kill()
}
const s = spawnSync(process.execPath, [join(HERE, 'assets-snapshot.mjs'), join(HERE, 'browser', 'shots', NAME)], { cwd: ROOT, encoding: 'utf8' })
console.log((s.stdout + s.stderr).trim())
process.exit(code || s.status || 0)
