import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import { useUIStore } from './store/uiStore'

registerSW({
  immediate: true,
  // 長時間開著的分頁：回到分頁時、以及每 30 分鐘檢查一次有沒有新版本
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => void reg.update().catch(() => {})
    window.setInterval(check, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => !document.hidden && check())
  },
})

// 新版 service worker 接手了（頁面本身還是舊版）：只提醒，不自動重新整理，避免打斷使用者正在做的事
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) useUIStore.getState().showToast('有新版本，重新整理即可', 10000)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
