import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'

/** 把視窗尺寸同步進 uiStore（resize、旋轉、進出全螢幕都會觸發） */
export function useViewportSync(): void {
  useEffect(() => {
    const sync = () => useUIStore.getState().setViewport(window.innerWidth, window.innerHeight)
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [])
}
