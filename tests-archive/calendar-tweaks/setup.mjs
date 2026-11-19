// 準備舊版原始碼（逐項／逐像素比對用）：從 git 取出 v3.9.1（80c567a）與 v3.9.0 的原始碼放到 .work/，不碰工作目錄與分支。
// 用法：node tests-archive/calendar-tweaks/setup.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const WORK = join(HERE, '.work')
const SOURCES = [
  ['v391src', '80c567a'], // v3.9.1：逐像素比對（也是 OLD_PORT 舊版 dev server 的目錄）、存檔與引擎逐項比對
  ['v3100src', 'v3.10.0'], // v3.10.1：3.10.0 存下的存檔與匯出檔相容測試（ct-v3101-compat）
  ['v390src', 'v3.9.0'], // v3.9.0：舊版讀到 dataRev 5／format 7 的行為
]
mkdirSync(WORK, { recursive: true })
for (const [dir, ref] of SOURCES) {
  const dest = join(WORK, dir)
  if (existsSync(join(dest, 'src'))) {
    console.log(`${dir}（${ref}）已存在，略過`)
    continue
  }
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  const tar = execFileSync('git', ['-C', ROOT, 'archive', '--format=tar', ref], { maxBuffer: 1 << 30 })
  execFileSync('tar', ['-x'], { cwd: dest, input: tar })
  console.log(`${dir}：已取出 ${ref}`)
}
console.log('完成。')
