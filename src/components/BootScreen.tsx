import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { enterFullscreen, lockLandscape } from '../lib/fullscreen'
import { useUIStore } from '../store/uiStore'
import { Logo } from './Logo'

export function BootScreen() {
  const booted = useUIStore((s) => s.booted)
  const setBooted = useUIStore((s) => s.setBooted)

  // 必須在使用者手勢內同步呼叫 requestFullscreen，所以先呼叫再 await
  const start = () => {
    if (useUIStore.getState().booted) return
    const pending = enterFullscreen()
    setBooted(true)
    void pending.then((ok) => {
      if (ok) void lockLandscape()
    })
  }

  useEffect(() => {
    if (booted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        start()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted])

  return (
    <AnimatePresence>
      {!booted && (
        <motion.div
          key="boot"
          className="fixed inset-0 z-[10000] flex cursor-pointer flex-col items-center justify-center bg-black"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          onClick={start}
          role="button"
          aria-label="點擊以開始"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="flex flex-col items-center"
          >
            <Logo size={96} className="text-white" />
            <div className="mt-6 text-xl font-light tracking-[0.35em] text-white/90">AEMC LAB DESKTOP</div>
          </motion.div>
          <div className="absolute bottom-[12%] animate-blink text-sm tracking-widest text-white/70">
            點擊以開始
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
