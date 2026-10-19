import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'

const TOAST_MS = 2800

/** 畫面中央偏下的提示訊息，幾秒後自動消失 */
export function Toast() {
  const toast = useUIStore((s) => s.toast)
  const hideToast = useUIStore((s) => s.hideToast)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(hideToast, TOAST_MS)
    return () => window.clearTimeout(t)
  }, [toast, hideToast])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[9950] flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            className="rounded-xl border border-white/20 bg-neutral-900/85 px-4 py-2.5 text-sm text-white shadow-xl backdrop-blur-xl"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
