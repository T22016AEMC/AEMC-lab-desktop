// 準備舊版原始碼（逐項／逐像素比對用）：從 git 取出 v3.6.2、v3.8.0、v3.8.1 的原始碼放到 .work/，不碰工作目錄與分支。
// 用法：node tests-archive/v390/setup.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const WORK = join(HERE, '.work')
const SOURCES = [
  ['v362src', 'v3.6.2'], // v370-layout、v380-adapt-v370-data 比對
  ['v380src', 'v3.8.0'], // v390-save 比對
  ['v381src', '719a575'], // v3.8.1：v390-layout／save／stage4 與瀏覽器逐像素比對（也是 5182 舊版 dev server 的目錄）
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
  // git archive → tar 解開（Windows 10+ 內建 tar；macOS／Linux 本來就有）
  const tar = execFileSync('git', ['-C', ROOT, 'archive', '--format=tar', ref], { maxBuffer: 1 << 30 })
  execFileSync('tar', ['-x'], { cwd: dest, input: tar })
  console.log(`${dir}：已取出 ${ref}`)
}
console.log('完成。')
