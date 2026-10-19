import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { formatIsoDate } from '../lib/format'
import { useUIStore } from '../store/uiStore'
import { Logo } from './Logo'

export function AboutDialog() {
  const open = useUIStore((s) => s.aboutOpen)
  const setOpen = useUIStore((s) => s.setAboutOpen)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="about"
          className="fixed inset-0 z-[9900] flex items-center justify-center bg-black/20 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-label="關於這個桌面"
            className="w-[300px] max-w-full overflow-hidden rounded-xl bg-neutral-100/95 text-neutral-800 shadow-2xl shadow-black/50 ring-1 ring-black/20 backdrop-blur-xl"
            initial={{ scale: 0.9, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-8 items-center px-3">
              <button
                aria-label="關閉"
                onClick={() => setOpen(false)}
                className="group flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f57]"
              >
                <svg width="7" height="7" viewBox="0 0 8 8" className="opacity-0 group-hover:opacity-100">
                  <path d="M1 1l6 6M7 1L1 7" stroke="#4d0000" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex flex-col items-center px-6 pb-6 pt-1 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-[22%] bg-gradient-to-br from-[#5b6cff] to-[#22d3ee] text-white shadow-lg">
                <Logo size={52} />
              </div>
              <div className="mt-4 text-lg font-semibold">AEMC Lab Desktop</div>
              <div className="mt-0.5 text-xs text-neutral-500">研發小程式虛擬桌面</div>
              <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-left text-xs">
                <dt className="text-neutral-500">名稱</dt>
                <dd>AEMC Lab Desktop</dd>
                <dt className="text-neutral-500">版本</dt>
                <dd>{__APP_VERSION__}</dd>
                <dt className="text-neutral-500">更新日期</dt>
                <dd>{formatIsoDate(__APP_DATE__)}</dd>
              </dl>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
