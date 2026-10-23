import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useRef, type ReactNode } from 'react'
import { allApps } from '../config/registry'
import { getMetrics } from '../lib/layout'
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

export function Dock() {
  const mouseX = useMotionValue(Infinity)
  const windows = useWindowStore((s) => s.windows)
  const openApp = useWindowStore((s) => s.openApp)
  const base = getMetrics().dockIcon
  const dotOffset = -7

  // Dock 平時隱藏；有內建視窗（小遊戲）開啟時才從底部滑出，視窗全關閉後收起。外部程式在新分頁開啟，不會出現在 Dock
  const items = allApps.filter((a) => windows[a.id])

  return (
    <nav
      aria-hidden={items.length === 0}
      className="glass fixed bottom-2 left-1/2 z-[9000] flex max-w-[98vw] items-end gap-1.5 rounded-[22px] px-2 pb-2 pt-2 transition-transform duration-300 ease-out"
      style={{
        height: base + 18,
        transform: `translate(-50%, ${items.length > 0 ? '0' : 'calc(100% + 16px)'})`,
        pointerEvents: items.length > 0 ? 'auto' : 'none',
      }}
      onPointerMove={(e) => e.pointerType === 'mouse' && mouseX.set(e.clientX)}
      onPointerLeave={() => mouseX.set(Infinity)}
    >
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
