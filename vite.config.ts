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
      // 'prompt'：新版 service worker 安裝後不會自動重新整理頁面（以免打斷洗澡、遊戲）；
      // 但仍用 skipWaiting + clientsClaim 讓它立刻接手，並由 main.tsx 顯示「有新版本，重新整理即可」
      registerType: 'prompt',
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
        // 頁面（index.html）不放進預快取，改成「網路優先」：只要連得上網，打開頁面拿到的一定是最新的 index.html，
        // 它指向帶雜湊的新 JS 與新素材；離線時才用上次的頁面。
        // （vite-plugin-pwa 會把 assets/ 底下所有檔案當成「檔名已帶雜湊」而不比對內容，所以素材檔名必須帶雜湊，見 scripts/process-assets.mjs）
        globPatterns: ['**/*.{js,css,svg,png,ico,webmanifest,json}'],
        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'pages', networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
})
