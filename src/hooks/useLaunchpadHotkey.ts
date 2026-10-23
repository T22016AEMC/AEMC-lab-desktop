import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'

/** F4：開關啟動台（備用入口；主要入口是住家的門） */
export function useLaunchpadHotkey(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F4' || e.altKey || e.ctrlKey || e.metaKey) return
      e.preventDefault()
      const ui = useUIStore.getState()
      if (!ui.booted) return
      ui.setLaunchpadOpen(!ui.launchpadOpen)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
