// 用專案內的 vite 把測試入口連同它引用的 TS 一起打包成單一 ESM，再執行。
// 用法：node tests-archive/calendar-tweaks/run-bundled.mjs <入口.js> [輸出資料夾]；環境變數 REPO_ROOT 預設是這個 repo 的根目錄。
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, resolve, basename } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const project = process.env.REPO_ROOT ? resolve(process.env.REPO_ROOT) : resolve(HERE, '../..')
process.env.REPO_ROOT = project.split('\\').join('/')
const { build } = await import(pathToFileURL(project + '/node_modules/vite/dist/node/index.js').href)
const entry = resolve(process.argv[2])
const out = resolve(process.argv[3] ?? resolve(HERE, '.work/out', basename(entry, '.js')))
await build({
  root: project,
  logLevel: 'error',
  configFile: false,
  build: { ssr: entry, outDir: out, emptyOutDir: true, minify: false, rollupOptions: { output: { entryFileNames: 'bundle.mjs', format: 'es' } } },
  ssr: { noExternal: true },
})
await import(pathToFileURL(out + '/bundle.mjs').href)
