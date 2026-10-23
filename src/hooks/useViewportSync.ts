import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'

/** 把視窗尺寸同步進 uiStore（視窗縮放時觸發） */
export function useViewportSync(): void {
  useEffect(() => {
    const sync = () => useUIStore.getState().setViewport(window.innerWidth, window.innerHeight)
    sync()
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('resize', sync)
    }
  }, [])
}
