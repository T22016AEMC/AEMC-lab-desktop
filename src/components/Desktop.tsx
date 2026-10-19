import { AnimatePresence } from 'framer-motion'
import { Farm } from '../farm'
import { useWindowStore } from '../store/windowStore'
import { Window } from './Window'

/** 桌面 = 寵物養殖場。所有程式都從啟動台開啟，視窗顯示在養殖場上方 */
export function Desktop() {
  const windowIds = useWindowStore((s) => Object.keys(s.windows).join('|'))

  return (
    <div className="absolute inset-0 bg-sky-300">
      <Farm />

      {/* 視窗層 */}
      <AnimatePresence>
        {windowIds
          .split('|')
          .filter(Boolean)
          .map((id) => (
            <Window key={id} id={id} />
          ))}
      </AnimatePresence>
    </div>
  )
}
