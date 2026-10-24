import { useEffect } from 'react'
import { AboutDialog } from './components/AboutDialog'
import { BackupReminder } from './components/BackupReminder'
import { IMPORTED_FLAG, ImportDialog } from './components/BackupDialogs'
import { BootScreen } from './components/BootScreen'
import { Desktop } from './components/Desktop'
import { DesktopOnlyNotice } from './components/DesktopOnlyNotice'
import { Dock } from './components/Dock'
import { Launchpad } from './components/Launchpad'
import { MenuBar } from './components/MenuBar'
import { Toast } from './components/Toast'
import { useViewportSync } from './hooks/useViewportSync'
import { useLaunchpadHotkey } from './hooks/useLaunchpadHotkey'
import { MIN_DESKTOP_WIDTH } from './lib/layout'
import { setStorageErrorHandler } from './lib/documentStorage'
import { useSettingsStore } from './lib/settings'
import { useAppListStore } from './store/appListStore'
import { useUIStore } from './store/uiStore'

function DesktopApp() {
  useLaunchpadHotkey()
  useEffect(() => {
    void useAppListStore.getState().init()
    void useSettingsStore.getState().init()
    // 匯入存檔後重新整理：提示一次
    try {
      if (sessionStorage.getItem(IMPORTED_FLAG)) {
        sessionStorage.removeItem(IMPORTED_FLAG)
        useUIStore.getState().showToast('存檔已匯入')
      }
    } catch {
      /* 忽略 */
    }
    // 要求瀏覽器持久儲存（不會被清理空間時自動刪掉）；不支援或失敗都不顯示錯誤
    const st = navigator.storage
    if (st?.persisted) {
      st.persisted().then((p) => useUIStore.getState().setPersisted(p), () => {})
      st.persist?.().then((p) => useUIStore.getState().setPersisted(p), () => {})
    }
    // 寫入 localStorage 失敗（空間已滿等）時提示使用者
    setStorageErrorHandler((msg) => useUIStore.getState().showToast(msg))
    return () => setStorageErrorHandler(null)
  }, [])
  return (
    <>
      <Desktop />
      <MenuBar />
      <Dock />
      <Launchpad />
      <AboutDialog />
      <ImportDialog />
      <BackupReminder />
      <Toast />
      <BootScreen />
    </>
  )
}

export default function App() {
  useViewportSync()
  const tooNarrow = useUIStore((s) => s.viewport.width < MIN_DESKTOP_WIDTH)
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* 寬度不足時完全不載入桌面與養殖場，只顯示提示 */}
      {tooNarrow ? <DesktopOnlyNotice /> : <DesktopApp />}
    </div>
  )
}
