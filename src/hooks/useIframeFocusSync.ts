import { useEffect } from 'react'
import { useWindowStore } from '../store/windowStore'

/** 輪詢間隔：焦點從一個 iframe 直接移到另一個 iframe 時，父頁面不會觸發 blur，只能靠輪詢發現 */
const POLL_MS = 200

/**
 * 偵測使用者點進某個視窗的 iframe，並把該視窗置頂、設為作用中。
 *
 * iframe 內的點擊事件不會傳到父頁面，但焦點會移進該 iframe，所以：
 * - 父頁面 window 的 blur（從父頁面點進 iframe）：setTimeout 0 之後檢查 document.activeElement
 * - 輕量輪詢（從一個 iframe 直接點另一個 iframe）
 * 只讀取 document.activeElement，不會把焦點搶回父頁面。
 */
export function useIframeFocusSync(): void {
  useEffect(() => {
    let last: Element | null = document.activeElement

    const check = () => {
      const el = document.activeElement
      if (el === last) return
      last = el
      if (el instanceof HTMLIFrameElement && el.dataset.windowId) {
        useWindowStore.getState().focusWindow(el.dataset.windowId)
      }
    }

    const onBlur = () => window.setTimeout(check, 0)
    window.addEventListener('blur', onBlur)
    const timer = window.setInterval(check, POLL_MS)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.clearInterval(timer)
    }
  }, [])
}
