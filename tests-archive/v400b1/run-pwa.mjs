// 4.0-B1 條件 d 的準備與執行：建兩份正式 build，再跑 browser/tb2-pwa-browser.mjs。
//  .work/old-src  = git archive bfc1390（階段 R 完成時），node_modules 用 junction 指到專案的
//  .work/dist-old = 舊版 build、.work/dist-new = 目前的 build（都用 vite build，不碰專案的 dist）
// 用法：node tests-archive/v400b1/run-pwa.mjs
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const W = join(HERE, '.work')
mkdirSync(W, { recursive: true })
const OLD_SRC = join(W, 'old-src')
if (!existsSync(join(OLD_SRC, 'src'))) {
  mkdirSync(OLD_SRC, { recursive: true })
  // Windows 路徑給 bash 的 tar：反斜線換斜線，--force-local 讓「C:」不被當成遠端主機
  execSync(`git archive --format=tar bfc1390 | tar --force-local -x -C "${OLD_SRC.replace(/\\/g, '/')}"`, { cwd: ROOT, shell: 'bash' })
  execSync(`cmd /c mklink /J "${join(OLD_SRC, 'node_modules')}" "${join(ROOT, 'node_modules')}"`)
}
const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
for (const [src, out] of [[OLD_SRC, join(W, 'dist-old')], [ROOT, join(W, 'dist-new')]]) {
  const r = spawnSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir'], { cwd: src, encoding: 'utf8' })
  if (r.status !== 0) { console.log(r.stdout + r.stderr); process.exit(1) }
  console.log('build → ' + out)
}
const t = spawnSync(process.execPath, [join(HERE, 'browser', 'tb2-pwa-browser.mjs')], { cwd: join(HERE, 'browser'), encoding: 'utf8', timeout: 600000 })
console.log((t.stdout + t.stderr).trim())
process.exit(t.status ?? 1)
