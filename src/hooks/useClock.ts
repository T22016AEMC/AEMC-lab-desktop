import { useEffect, useState } from 'react'

/** 每分鐘更新一次（對齊到下一個整分鐘） */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: number
    const tick = () => {
      const d = new Date()
      setNow(d)
      timer = window.setTimeout(tick, (60 - d.getSeconds()) * 1000 - d.getMilliseconds() + 50)
    }
    tick()
    return () => window.clearTimeout(timer)
  }, [])
  return now
}
