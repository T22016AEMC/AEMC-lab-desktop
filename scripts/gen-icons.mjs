// 由 public/icon.svg 產生 PWA 用的 PNG 圖示：npm run icons
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const pub = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url))
const svg = readFileSync(pub('icon.svg'))

// maskable 需要滿版背景與安全區，圖案縮到 70%
const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#5b6cff"/><stop offset="1" stop-color="#22d3ee"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(76.8 76.8) scale(0.7)">
    <g fill="none" stroke="#fff" stroke-width="22">
      <ellipse cx="256" cy="256" rx="150" ry="62"/>
      <ellipse cx="256" cy="256" rx="150" ry="62" transform="rotate(60 256 256)"/>
      <ellipse cx="256" cy="256" rx="150" ry="62" transform="rotate(120 256 256)"/>
    </g>
    <circle cx="256" cy="256" r="30" fill="#fff"/>
  </g>
</svg>`)

await sharp(svg).resize(192, 192).png().toFile(pub('pwa-192x192.png'))
await sharp(svg).resize(512, 512).png().toFile(pub('pwa-512x512.png'))
await sharp(maskable).resize(512, 512).png().toFile(pub('pwa-maskable-512x512.png'))
await sharp(svg).resize(180, 180).png().toFile(pub('apple-touch-icon.png'))
console.log('icons generated')
