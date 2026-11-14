import { useEffect, useState } from 'react'
import { TOOLS } from '../../config/tools'
import { useUIStore } from '../../store/uiStore'
import { cdLeft, formatCountdown, formatStopwatch, hmsToMs, swCanLap, swElapsed } from '../../tools/timer'
import { useTimerStore } from '../../tools/timerStore'
import { ToolDialog } from './ToolDialog'

/**
 * 碼表與倒數（v3.7.0）：一個視窗、兩個分頁。計時狀態在 tools/timerStore.ts（只在記憶體）：
 * 關掉視窗後繼續跑，重新開視窗看到的是正確的時間；重新整理網頁就清掉。倒數到 0 用 toast 提示（視窗關著也會）。
 * 畫面每一幀用「現在 − 開始時間」重新算顯示的時間（requestAnimationFrame 只負責重畫，不累加時間）。
 */

type Tab = 'stopwatch' | 'countdown'
let lastTab: Tab = 'stopwatch'

/** 視窗開著時每一幀重畫（只用來更新顯示，時間永遠是用時間戳記算的） */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = (): void => {
      setNow(Date.now())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active])
  return active ? Date.now() : now
}

export function TimerDialog() {
  const setToolOpen = useUIStore((s) => s.setToolOpen)
  const [tab, setTab] = useState<Tab>(lastTab)
  useEffect(() => {
    lastTab = tab
  }, [tab])
  const sw = useTimerStore((s) => s.sw)
  const cd = useTimerStore((s) => s.cd)
  const now = useNow(sw.running || cd.status === 'running')

  return (
    <ToolDialog id="timer" title="碼表與倒數" icon="tool_timer" width={440} onClose={() => setToolOpen(null)}>
      <div className="px-3 pb-3 pt-2">
        <div className="flex gap-1 border-b-2 border-[#3b2a1c]/40" role="tablist">
          {(
            [
              ['stopwatch', '碼表'],
              ['countdown', '倒數'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-testid={`timer-tab-${id}`}
              onClick={() => setTab(id)}
              className={`-mb-0.5 border-2 border-b-0 border-[#3b2a1c] px-4 py-1 text-sm font-bold ${tab === id ? 'bg-[#f4c95d]' : 'bg-[#fffdf4] text-[#8a7d66]'}`}
            >
              {label}
              {id === 'stopwatch' && sw.running && tab !== id ? ' ●' : ''}
              {id === 'countdown' && cd.status === 'running' && tab !== id ? ' ●' : ''}
            </button>
          ))}
        </div>
        {tab === 'stopwatch' ? <StopwatchPane now={now} /> : <CountdownPane now={now} />}
        <p className="mt-3 text-[11px] leading-snug text-[#8a5a2b]">關掉這個視窗後計時會繼續；重新整理網頁會清掉。</p>
      </div>
    </ToolDialog>
  )
}

function StopwatchPane({ now }: { now: number }) {
  const sw = useTimerStore((s) => s.sw)
  const t = useTimerStore.getState()
  const elapsed = swElapsed(sw, now)
  const lapFull = sw.laps.length >= TOOLS.timer.lapMax
  return (
    <div className="pt-3" role="tabpanel" data-testid="timer-stopwatch">
      <div className="border-2 border-[#3b2a1c] bg-[#22252f] py-3 text-center font-mono text-4xl font-bold tabular-nums text-[#ffe28a]" data-testid="sw-display">
        {formatStopwatch(elapsed)}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {sw.running ? (
          <button type="button" data-testid="sw-pause" className="px-btn py-1.5 text-sm" onClick={t.swPause}>
            暫停
          </button>
        ) : (
          <button type="button" data-testid="sw-start" className="px-btn py-1.5 text-sm" onClick={t.swStart}>
            {elapsed > 0 ? '繼續' : '開始'}
          </button>
        )}
        <button type="button" data-testid="sw-lap" className="px-btn py-1.5 text-sm" disabled={!swCanLap(sw)} onClick={t.swLap} title={lapFull ? `計次最多 ${TOOLS.timer.lapMax} 筆` : undefined}>
          計次
        </button>
        <button type="button" data-testid="sw-reset" className="px-btn py-1.5 text-sm" disabled={sw.running || (elapsed === 0 && sw.laps.length === 0)} onClick={t.swReset}>
          歸零
        </button>
      </div>
      <div className="mt-2 flex justify-between text-xs font-bold">
        <span>
          計次 <span className="font-normal tabular-nums text-[#8a5a2b]">{sw.laps.length}／{TOOLS.timer.lapMax}</span>
        </span>
        {lapFull && <span className="font-normal text-[#c0392b]">計次已達 {TOOLS.timer.lapMax} 筆</span>}
      </div>
      <ol className="mt-1 max-h-[180px] overflow-y-auto border-2 border-[#3b2a1c]/50 bg-[#fffdf4] font-mono text-xs" data-testid="sw-laps">
        {sw.laps.length === 0 && <li className="px-2 py-2 font-sans text-[#8a7d66]">計時中按「計次」記下每一圈</li>}
        {sw.laps.map((l) => (
          <li key={l.n} className="flex justify-between border-b border-[#3b2a1c]/15 px-2 py-0.5 tabular-nums" data-testid="sw-lap-item">
            <span>第 {l.n} 次</span>
            <span>+{formatStopwatch(l.split)}</span>
            <span className="font-bold">{formatStopwatch(l.total)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function CountdownPane({ now }: { now: number }) {
  const cd = useTimerStore((s) => s.cd)
  const t = useTimerStore.getState()
  const initial = cd.durationMs
  const [h, setH] = useState(String(Math.floor(initial / 3600000)))
  const [m, setM] = useState(String(Math.floor(initial / 60000) % 60))
  const [s, setS] = useState(String(Math.floor(initial / 1000) % 60))
  const left = cdLeft(cd, now)
  const editing = cd.status === 'idle'
  const ms = hmsToMs(Number(h), Number(m), Number(s))
  const field = (label: string, value: string, set: (v: string) => void, max: number, testid: string) => (
    <label className="flex flex-col items-center text-xs font-bold">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        data-testid={testid}
        disabled={!editing}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
          set(v === '' ? '' : String(Math.min(max, Number(v))))
        }}
        className="px-input w-16 py-1 text-center font-mono text-xl tabular-nums disabled:opacity-60"
      />
      <span className="mt-0.5">{label}</span>
    </label>
  )
  return (
    <div className="pt-3" role="tabpanel" data-testid="timer-countdown">
      {editing ? (
        <div className="flex items-start justify-center gap-2">
          {field('時', h, setH, TOOLS.timer.maxHours, 'cd-h')}
          <span className="pt-1 font-mono text-xl">:</span>
          {field('分', m, setM, 59, 'cd-m')}
          <span className="pt-1 font-mono text-xl">:</span>
          {field('秒', s, setS, 59, 'cd-s')}
        </div>
      ) : (
        <div className={`border-2 border-[#3b2a1c] py-3 text-center font-mono text-4xl font-bold tabular-nums ${cd.status === 'done' ? 'bg-[#f0a33a] text-[#3b2a1c]' : 'bg-[#22252f] text-[#ffe28a]'}`} data-testid="cd-display">
          {formatCountdown(left)}
        </div>
      )}
      {cd.status === 'done' && (
        <div className="mt-1 text-center text-sm font-bold text-[#c0392b]" data-testid="cd-done">
          {TOOLS.timer.doneMessage}
        </div>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {cd.status === 'running' ? (
          <button type="button" data-testid="cd-pause" className="px-btn py-1.5 text-sm" onClick={t.cdPause}>
            暫停
          </button>
        ) : (
          <button type="button" data-testid="cd-start" className="px-btn py-1.5 text-sm" disabled={cd.status === 'done' || (editing && ms <= 0)} onClick={() => t.cdStart(editing ? ms : undefined)}>
            {cd.status === 'paused' ? '繼續' : '開始'}
          </button>
        )}
        <span />
        <button type="button" data-testid="cd-reset" className="px-btn py-1.5 text-sm" disabled={editing} onClick={t.cdReset}>
          歸零
        </button>
      </div>
      {editing && ms <= 0 && <p className="mt-2 text-center text-xs text-[#8a5a2b]">輸入時、分、秒（最多 {TOOLS.timer.maxHours} 小時）</p>}
    </div>
  )
}
