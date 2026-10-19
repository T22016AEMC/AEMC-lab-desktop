import { motion } from 'framer-motion'
import { Suspense, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { getApp } from '../config/registry'
import { DEFAULT_MIN_SIZE, clamp, getMetrics, visibleRect, workArea } from '../lib/layout'
import { useUIStore } from '../store/uiStore'
import { useWindowStore } from '../store/windowStore'
import type { Rect } from '../types'
import { IframeContent } from './IframeContent'

type Dir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLES: { dir: Dir; className: string }[] = [
  { dir: 'n', className: 'left-3 right-3 top-[-3px] h-[7px] cursor-ns-resize' },
  { dir: 's', className: 'bottom-[-3px] left-3 right-3 h-[7px] cursor-ns-resize' },
  { dir: 'e', className: 'bottom-3 right-[-3px] top-3 w-[7px] cursor-ew-resize' },
  { dir: 'w', className: 'bottom-3 left-[-3px] top-3 w-[7px] cursor-ew-resize' },
  { dir: 'nw', className: 'left-[-3px] top-[-3px] h-4 w-4 cursor-nwse-resize' },
  { dir: 'ne', className: 'right-[-3px] top-[-3px] h-4 w-4 cursor-nesw-resize' },
  { dir: 'sw', className: 'bottom-[-3px] left-[-3px] h-4 w-4 cursor-nesw-resize' },
  { dir: 'se', className: 'bottom-[-3px] right-[-3px] h-4 w-4 cursor-nwse-resize' },
]

type Gesture =
  | { kind: 'drag'; px: number; py: number; start: Rect }
  | { kind: 'resize'; dir: Dir; px: number; py: number; start: Rect }

const LIGHT_COLORS = {
  close: 'bg-[#ff5f57]',
  min: 'bg-[#febc2e]',
  max: 'bg-[#28c840]',
}
const IDLE_COLORS = {
  close: 'bg-[#d0d0d0] group-hover/lights:bg-[#ff5f57]',
  min: 'bg-[#d0d0d0] group-hover/lights:bg-[#febc2e]',
  max: 'bg-[#d0d0d0] group-hover/lights:bg-[#28c840]',
}

export function Window({ id }: { id: string }) {
  const app = getApp(id)
  const win = useWindowStore((s) => s.windows[id])
  const isActive = useWindowStore((s) => s.activeId === id)
  const { closeWindow, minimizeWindow, toggleMaximize, focusWindow, setRect, reloadWindow } =
    useWindowStore.getState()
  const viewport = useUIStore((s) => s.viewport)
  const compact = useUIStore((s) => s.compact)

  const gesture = useRef<Gesture | null>(null)
  const [interacting, setInteracting] = useState(false)
  const [hidden, setHidden] = useState(false)

  const minimized = win?.minimized ?? false
  useEffect(() => {
    if (!minimized) setHidden(false)
  }, [minimized])

  if (!app || !win) return null

  const metrics = getMetrics(compact)
  const maxed = win.maximized || compact
  const rect: Rect = maxed ? workArea(viewport, compact) : visibleRect(win, viewport, compact)
  const min = {
    width: Math.min(app.minSize?.width ?? DEFAULT_MIN_SIZE.width, viewport.width),
    height: Math.min(app.minSize?.height ?? DEFAULT_MIN_SIZE.height, viewport.height - metrics.menuBar),
  }

  // 縮向 Dock 圖示的位移（相對視窗中心）
  const dx = win.minimizeTo ? win.minimizeTo.x - (rect.x + rect.width / 2) : 0
  const dy = win.minimizeTo ? win.minimizeTo.y - (rect.y + rect.height / 2) : viewport.height

  const openInTab = () => {
    if (app.kind === 'external' && app.url) window.open(app.url, '_blank', 'noopener,noreferrer')
  }

  const beginGesture = (e: ReactPointerEvent<HTMLElement>, g: Gesture) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setRect(id, rect) // 以目前實際顯示的位置為起點
    gesture.current = g
    setInteracting(true)
  }

  const endGesture = () => {
    gesture.current = null
    setInteracting(false)
  }

  const onTitlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-nodrag]')) return
    focusWindow(id)
    if (maxed) return
    beginGesture(e, { kind: 'drag', px: e.clientX, py: e.clientY, start: rect })
  }

  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>, dir: Dir) => {
    if (e.button !== 0 || maxed) return
    e.stopPropagation()
    focusWindow(id)
    beginGesture(e, { kind: 'resize', dir, px: e.clientX, py: e.clientY, start: rect })
  }

  const onGestureMove = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current
    if (!g) return
    const ddx = e.clientX - g.px
    const ddy = e.clientY - g.py
    const s = g.start
    if (g.kind === 'drag') {
      useWindowStore.getState().moveWindow(
        id,
        clamp(s.x + ddx, -(s.width - 100), viewport.width - 100),
        clamp(s.y + ddy, metrics.menuBar, viewport.height - 40),
      )
      return
    }
    let { x, y, width, height } = s
    if (g.dir.includes('e')) width = clamp(s.width + ddx, min.width, viewport.width - s.x)
    if (g.dir.includes('s')) height = clamp(s.height + ddy, min.height, viewport.height - s.y)
    if (g.dir.includes('w')) {
      x = clamp(s.x + ddx, 0, s.x + s.width - min.width)
      width = s.x + s.width - x
    }
    if (g.dir.includes('n')) {
      y = clamp(s.y + ddy, metrics.menuBar, s.y + s.height - min.height)
      height = s.y + s.height - y
    }
    setRect(id, { x, y, width, height })
  }

  const colors = isActive ? LIGHT_COLORS : IDLE_COLORS
  const light = compact ? 'h-3.5 w-3.5' : 'h-3 w-3'
  const Content = app.kind === 'builtin' ? app.component : null
  // 只有拖曳或調整大小時才蓋透明遮罩（否則滑鼠事件會被 iframe 吃掉）；
  // 點背景視窗的 iframe 由 useIframeFocusSync 偵測焦點後置頂，不靠遮罩
  const shield = interacting

  return (
    <motion.div
      className={`absolute ${interacting ? '' : 'transition-[left,top,width,height] duration-200 ease-out'}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: win.z,
        visibility: hidden ? 'hidden' : 'visible',
        pointerEvents: minimized ? 'none' : 'auto',
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={
        minimized
          ? { opacity: 0, scale: 0.08, x: dx, y: dy }
          : { opacity: 1, scale: 1, x: 0, y: 0 }
      }
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      onAnimationComplete={() => minimized && setHidden(true)}
      onPointerDownCapture={() => focusWindow(id)}
      role="dialog"
      aria-label={app.name}
    >
      <div
        className={`flex h-full w-full flex-col overflow-hidden bg-white ${
          maxed ? '' : 'rounded-[10px]'
        } ${isActive ? 'shadow-[0_22px_60px_rgba(0,0,0,0.5)]' : 'shadow-[0_10px_30px_rgba(0,0,0,0.3)]'} ring-1 ring-black/25`}
      >
        {/* 標題列 */}
        <div
          className="relative flex shrink-0 touch-none items-center border-b border-black/15 bg-gradient-to-b from-[#ececec] to-[#d9d9d9] text-neutral-700"
          style={{ height: metrics.titleBar }}
          onPointerDown={onTitlePointerDown}
          onPointerMove={onGestureMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onDoubleClick={(e) => {
            if (!(e.target as HTMLElement).closest('[data-nodrag]') && !compact) toggleMaximize(id)
          }}
        >
          <div data-nodrag className="group/lights flex items-center gap-2 pl-3">
            <button
              type="button"
              aria-label="關閉"
              onClick={() => closeWindow(id)}
              className={`flex items-center justify-center rounded-full ${light} ${colors.close}`}
            >
              <svg width="7" height="7" viewBox="0 0 8 8" className="opacity-0 group-hover/lights:opacity-100">
                <path d="M1 1l6 6M7 1L1 7" stroke="#4d0000" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="最小化"
              onClick={() => minimizeWindow(id)}
              className={`flex items-center justify-center rounded-full ${light} ${colors.min}`}
            >
              <svg width="7" height="7" viewBox="0 0 8 8" className="opacity-0 group-hover/lights:opacity-100">
                <path d="M1 4h6" stroke="#5a3b00" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={win.maximized ? '還原' : '最大化'}
              onClick={() => !compact && toggleMaximize(id)}
              className={`flex items-center justify-center rounded-full ${light} ${colors.max} ${
                compact ? 'cursor-default' : ''
              }`}
            >
              <svg width="7" height="7" viewBox="0 0 8 8" className="opacity-0 group-hover/lights:opacity-100">
                <path d="M1 1h4L1 5zM7 7H3l4-4z" fill="#003d0a" />
              </svg>
            </button>
          </div>

          <div
            className={`pointer-events-none absolute inset-x-24 truncate text-center text-[13px] font-medium ${
              isActive ? '' : 'opacity-50'
            }`}
          >
            {app.name}
          </div>

          {app.kind === 'external' && (
            <div data-nodrag className="ml-auto flex items-center gap-0.5 pr-2">
              <button
                type="button"
                aria-label="重新載入"
                title="重新載入"
                onClick={() => reloadWindow(id)}
                className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-black/10 hover:text-neutral-800"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                  <path d="M20 4v7h-7" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="在新分頁開啟"
                title="在新分頁開啟"
                onClick={openInTab}
                className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-black/10 hover:text-neutral-800"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 4h6v6" />
                  <path d="M20 4l-9 9" />
                  <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* 內容 */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {app.kind === 'external' ? (
            <IframeContent
              key={win.reloadKey}
              windowId={id}
              url={app.url ?? 'about:blank'}
              title={app.name}
              onOpenInTab={openInTab}
            />
          ) : (
            Content && (
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center bg-slate-900 text-sm text-white/70">
                    載入中…
                  </div>
                }
              >
                <Content active={isActive} minimized={minimized} />
              </Suspense>
            )
          )}
          {shield && <div className="absolute inset-0 z-10" />}
        </div>
      </div>

      {/* 縮放把手（最大化或手機模式時不可用） */}
      {!maxed &&
        HANDLES.map(({ dir, className }) => (
          <div
            key={dir}
            className={`absolute z-20 touch-none ${className}`}
            onPointerDown={(e) => onResizePointerDown(e, dir)}
            onPointerMove={onGestureMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
          />
        ))}
    </motion.div>
  )
}
