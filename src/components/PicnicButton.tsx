import { useEffect, useState } from 'react'
import { BALANCE } from '../farm/config/balance'
import { gameNow, worldHour, worldWeather } from '../farm/overrides'
import { formatMmSs, picnicBlock, picnicToday } from '../farm/sim/picnic'
import { useFarmStore } from '../farm/store/farmStore'
import { useUIStore } from '../store/uiStore'

/**
 * 選單列「野餐」（v3.8.0，排在「建築」旁）。按下去由養殖場畫面接手：v3.9.1 起先進入選位置（點一下開始、Esc 取消、「自動選位置」一鍵開始）。
 * 顯示：可以開始 →「野餐 剩 N」；進行中 →「野餐中 m:ss」；冷卻 →「野餐 m:ss」；其他不能開始的原因（下雨、天黑、次數用完、沒有寵物可以參加）→ 停用樣式，
 * 滑鼠移上去看原因、點了用提示說明（和氣泡選單的「玩耍」一樣：看起來停用但可以點）。每秒更新一次。
 */
export function PicnicButton() {
  const save = useFarmStore((s) => s.save)
  const picking = useUIStore((s) => s.picnicPick)
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [])
  const now = gameNow()
  const ctx = { nowMs: now, hour: worldHour(now), weather: worldWeather(now, save) }
  const why = picnicBlock(save, ctx)
  const t = save ? picnicToday(save, now) : null
  const active = save?.picnic?.active
  // v3.9.1 選位置中：顯示「選位置中」，再按一次 = 取消
  const label = picking ? '野餐 選位置中' : active ? `野餐中 ${formatMmSs(active.until - now)}` : t && t.cooldownMs > 0 && t.left > 0 ? `野餐 ${formatMmSs(t.cooldownMs)}` : `野餐 剩${t?.left ?? BALANCE.picnic.dailyMax}`
  const disabled = why !== null && !picking
  return (
    <button
      type="button"
      data-testid="picnic-button"
      aria-disabled={disabled || undefined}
      data-reason={picking ? '' : why ?? ''}
      data-picking={picking || undefined}
      title={picking ? '取消選位置' : why ?? `野餐（今天還可以 ${t?.left ?? 0} 次，每次 ${BALANCE.picnic.seconds / 60} 分鐘）`}
      onClick={() => (why && !picking ? useUIStore.getState().showToast(why) : useUIStore.getState().requestPicnic())}
      className={`rounded px-2 py-px font-semibold tabular-nums hover:bg-white/20 ${disabled && !active ? 'text-white/45' : ''} ${active || picking ? 'bg-white/25 text-[#ffd98a]' : ''}`}
    >
      {label}
    </button>
  )
}
