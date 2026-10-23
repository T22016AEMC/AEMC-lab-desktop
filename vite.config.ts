import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

// 更新日期取自 CHANGELOG.md 最上方的版本紀錄（格式：## [1.0.0] - 2026-10-19）
function readLatestChangelogDate(): string {
  try {
    const text = readFileSync('./CHANGELOG.md', 'utf-8')
    const m = text.match(/^##\s*\[?v?\d+\.\d+\.\d+\]?\s*[-–—]\s*(\d{4}-\d{2}-\d{2})/m)
    if (m) return m[1]
  } catch {
    // 讀不到就退回建置日期
  }
  return new Date().toISOString().slice(0, 10)
}

// GitHub Actions 會帶入 /<repo 名稱>/；本機開發為 /
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DATE__: JSON.stringify(readLatestChangelogDate()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'AEMC Lab Desktop',
        short_name: 'AEMC Desktop',
        description: 'AEMC 研發小程式虛擬桌面',
        lang: 'zh-TW',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json}'],
      },
    }),
  ],
})
