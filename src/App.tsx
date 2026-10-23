import { useEffect } from 'react'
import { AboutDialog } from './components/AboutDialog'
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
import { useAppListStore } from './store/appListStore'
import { useUIStore } from './store/uiStore'

function DesktopApp() {
  useLaunchpadHotkey()
  useEffect(() => {
    void useAppListStore.getState().init()
  }, [])
  return (
    <>
      <Desktop />
      <MenuBar />
      <Dock />
      <Launchpad />
      <AboutDialog />
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
