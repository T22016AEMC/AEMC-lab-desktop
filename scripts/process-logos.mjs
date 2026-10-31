/**
 * 官方程式 logo 處理：把 7 張尺寸不一、非正方形的原圖處理成同尺寸的正方形 PNG。
 *
 * 用法：  node scripts/process-logos.mjs <原圖資料夾>
 *   原圖資料夾裡要有 <程式名>.png（FilMaster、SpecReader、CheMScutter、EluSim、AutoEllipso、MoleForm、Adsorvia），
 *   不寫死路徑，也可以用環境變數 LOGO_SRC 指定。原圖不進 repo。
 * 輸出：  public/icons/official-<程式名小寫>.png（144×144，要和 src/config/apps.ts 的 OFFICIAL_APPS 的 icon 一致）
 *
 * 處理：保持原比例縮到放得進正方形（不拉伸、不裁切）、置中，不足的部分補透明；
 * 縮小用 Lanczos3 高品質重取樣（不是像素風，不用最近鄰）；不放大（來源都比輸出大）。
 * 輸出 144 = 啟動台圖示顯示尺寸 72 CSS px 的 2 倍（高解析螢幕也清楚），且小於最小來源 EluSim 的 175 px，所以每張都是縮小不是放大。
 * 改輸出尺寸時，要一起看 components/Launchpad.tsx 的 ICON_SIZE。
 */
import sharp from 'sharp'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SRC_ARG = process.argv[2] ?? process.env.LOGO_SRC
if (!SRC_ARG) {
  console.error('用法：node scripts/process-logos.mjs <原圖資料夾>')
  process.exit(1)
}
const SRC = resolve(SRC_ARG)
const OUT = join(ROOT, 'public', 'icons')
const SIZE = 144
const NAMES = ['FilMaster', 'SpecReader', 'CheMScutter', 'EluSim', 'AutoEllipso', 'MoleForm', 'Adsorvia']

mkdirSync(OUT, { recursive: true })
for (const name of NAMES) {
  const file = join(SRC, name + '.png')
  if (!existsSync(file)) {
    console.error('找不到原圖：' + file)
    process.exit(1)
  }
  const meta = await sharp(file).metadata()
  const stats = await sharp(file).ensureAlpha().stats()
  const alphaMin = stats.channels[3].min
  const out = join(OUT, `official-${name.toLowerCase()}.png`)
  await sharp(file)
    .ensureAlpha()
    .resize(SIZE, SIZE, { fit: 'contain', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3', withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toFile(out)
  const o = await sharp(out).metadata()
  const note = alphaMin === 255 ? '（原圖完全不透明，底色是畫在圖裡的）' : ''
  console.log(`${name}: ${meta.width}×${meta.height} → ${o.width}×${o.height} ${note}`)
}
