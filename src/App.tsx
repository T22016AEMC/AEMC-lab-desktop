import { AboutDialog } from './components/AboutDialog'
import { BootScreen } from './components/BootScreen'
import { Desktop } from './components/Desktop'
import { Dock } from './components/Dock'
import { Launchpad } from './components/Launchpad'
import { MenuBar } from './components/MenuBar'
import { RotateHint } from './components/RotateHint'
import { Toast } from './components/Toast'
import { useIframeFocusSync } from './hooks/useIframeFocusSync'
import { useViewportSync } from './hooks/useViewportSync'

export default function App() {
  useViewportSync()
  useIframeFocusSync()
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <Desktop />
      <MenuBar />
      <Dock />
      <Launchpad />
      <AboutDialog />
      <Toast />
      <BootScreen />
      <RotateHint />
    </div>
  )
}
