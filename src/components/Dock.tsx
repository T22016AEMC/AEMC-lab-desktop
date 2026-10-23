import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useRef, type ReactNode } from 'react'
import { allApps } from '../config/registry'
import { getMetrics } from '../lib/layout'
import { useUIStore } from '../store/uiStore'
import { useWindowStore } from '../store/windowStore'
import { AppIcon } from './AppIcon'

const MAGNIFY = 1.65

interface ItemProps {
  label: string
  dockId: string
  mouseX: MotionValue<number>
  base: number
  magnify: boolean
  running: boolean
  dotOffset: number
  onClick: () => void
  children: ReactNode
}

function DockItem({ label, dockId, mouseX, base, magnify, running, dotOffset, onClick, children }: ItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const distance = useTransform(mouseX, (v) => {
    const r = ref.current?.getBoundingClientRect()
    return v - (r ? r.x + r.width / 2 : 0)
  })
  const target = useTransform(distance, [-140, 0, 140], [base, magnify ? base * MAGNIFY : base, base])
  const size = useSpring(target, { mass: 0.1, stiffness: 170, damping: 14 })

  return (
    <motion.div
      ref={ref}
      data-dock-id={dockId}
      className="group relative flex shrink-0 items-end justify-center"
      style={{ width: size, height: size }}
    >
      <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-800/90 px-2 py-0.5 text-xs text-white shadow [@media(hover:hover)]:group-hover:block">
        {label}
      </span>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="h-full w-full outline-none active:brightness-90"
      >
        {children}
      </button>
      {running && (
        <span
          className="absolute h-1 w-1 rounded-full bg-white/90"
          style={{ bottom: dotOffset }}
        />
      )}
    </motion.div>
  )
}

/** 啟動台按鈕的圖示：3x3 圓點方塊 */
function LaunchpadGlyph() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-[22%] bg-gradient-to-b from-neutral-200 to-neutral-400 shadow-md shadow-black/30">
      <div className="grid w-[58%] grid-cols-3 gap-[9%]">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="aspect-square rounded-[30%] bg-neutral-700/80" />
        ))}
      </div>
    </div>
  )
}

export function Dock() {
  const mouseX = useMotionValue(Infinity)
  const launchpadOpen = useUIStore((s) => s.launchpadOpen)
  const setLaunchpadOpen = useUIStore((s) => s.setLaunchpadOpen)
  const windows = useWindowStore((s) => s.windows)
  const openApp = useWindowStore((s) => s.openApp)
  const base = getMetrics().dockIcon
  const dotOffset = -7

  // 平時只有「啟動台」；內建視窗（小遊戲）開啟後才出現圖示，關閉後移除。外部程式在新分頁開啟，不會出現在 Dock
  const items = allApps.filter((a) => windows[a.id])

  return (
    <nav
      className="glass fixed bottom-2 left-1/2 z-[9000] flex max-w-[98vw] -translate-x-1/2 items-end gap-1.5 rounded-[22px] px-2 pb-2 pt-2"
      style={{ height: base + 18 }}
      onPointerMove={(e) => e.pointerType === 'mouse' && mouseX.set(e.clientX)}
      onPointerLeave={() => mouseX.set(Infinity)}
    >
      <DockItem
        label="啟動台"
        dockId="__launchpad"
        mouseX={mouseX}
        base={base}
        magnify
        running={false}
        dotOffset={dotOffset}
        onClick={() => setLaunchpadOpen(!launchpadOpen)}
      >
        <LaunchpadGlyph />
      </DockItem>
      {items.length > 0 && <div className="mx-0.5 h-[70%] w-px self-center bg-white/30" />}
      {items.map((app) => (
        <DockItem
          key={app.id}
          label={app.name}
          dockId={app.id}
          mouseX={mouseX}
          base={base}
          magnify
          running={Boolean(windows[app.id])}
          dotOffset={dotOffset}
          onClick={() => openApp(app)}
        >
          <AppIcon app={app} size="fill" />
        </DockItem>
      ))}
    </nav>
  )
}
