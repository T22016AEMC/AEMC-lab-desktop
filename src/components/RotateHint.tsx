import { useMediaQuery } from '../hooks/useMediaQuery'

/** 手機直拿時蓋住整個桌面，提示轉為橫向 */
export function RotateHint() {
  const portraitPhone = useMediaQuery('(orientation: portrait) and (pointer: coarse) and (max-width: 600px)')
  if (!portraitPhone) return null
  return (
    <div className="fixed inset-0 z-[10001] flex flex-col items-center justify-center gap-8 bg-black text-white">
      <svg
        width="96"
        height="96"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-rotate-phone"
        aria-hidden
      >
        <rect x="7" y="2.5" width="10" height="19" rx="2" />
        <path d="M11 18.5h2" />
      </svg>
      <div className="text-center">
        <div className="text-xl font-medium">請將手機轉為橫向</div>
        <div className="mt-2 text-sm text-white/60">橫向使用才能完整顯示桌面</div>
      </div>
    </div>
  )
}
