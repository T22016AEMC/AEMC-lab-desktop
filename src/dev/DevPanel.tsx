import { useState } from 'react'
import { gameNow, overrides } from '../farm/overrides'
import { SPECIES } from '../farm/config/species'
import { advanceSave, DAY_MS, HOUR_MS } from '../farm/sim/stats'
import { todayKey } from '../farm/sim/points'
import { PHASE_HOURS, PHASE_NAMES, WEATHER_NAMES, type Phase, type Weather } from '../farm/sim/worldTime'
import { useFarmStore } from '../farm/store/farmStore'
import type { Pet, SaveData } from '../farm/save/types'
import Bestiary from './Bestiary'
import Proportions from './Proportions'

/** DEV_PANEL_MARKER：測試模式面板。只在開發環境（import.meta.env.DEV）載入，正式 build 不包含 */

function shiftTime(save: SaveData, ms: number): SaveData {
  // 把「過去」往前推：寵物的領養時間與最後結算時間都提早 ms，再結算一次，
  // 就等於時間往後走了 ms（數值下降、成長天數增加）
  const shifted: SaveData = {
    ...save,
    lastSeen: save.lastSeen - ms,
    pets: save.pets.map((p) => ({
      ...p,
      adoptedAt: p.adoptedAt - ms,
      awakeUntil: p.awakeUntil !== undefined ? p.awakeUntil - ms : undefined,
    })),
  }
  if (ms >= DAY_MS && save.lastDailyClaim) {
    const d = Date.parse(`${save.lastDailyClaim}T12:00:00`)
    shifted.lastDailyClaim = todayKey(d - Math.floor(ms / DAY_MS) * DAY_MS)
  }
  // 賺金幣的冷卻與今日進度、食盆今日份量也要跟著往前推，才會「時間往後走」
  const days = Math.floor(ms / DAY_MS)
  const shiftDate = (d: string): string => (d && days > 0 ? todayKey(Date.parse(`${d}T12:00:00`) - days * DAY_MS) : d)
  shifted.earning = {
    ...save.earning,
    date: shiftDate(save.earning.date),
    lastAward: Object.fromEntries(Object.entries(save.earning.lastAward).map(([k, v]) => [k, v - ms])),
  }
  shifted.bowl = { ...save.bowl, date: shiftDate(save.bowl.date) }
  return advanceSave(shifted, gameNow(), false)
}

const btn = 'rounded bg-white/15 px-2 py-1 text-[11px] hover:bg-white/25 active:scale-95'

export default function DevPanel() {
  const [open, setOpen] = useState(false)
  // 生物圖鑑：按鈕開啟，或網址加上 ?bestiary 直接開啟（方便截圖）
  const [bestiary, setBestiary] = useState(() => new URLSearchParams(window.location.search).has('bestiary'))
  const [proportions, setProportions] = useState(() => new URLSearchParams(window.location.search).has('proportions'))
  const [petId, setPetId] = useState('')
  const [, force] = useState(0)
  const save = useFarmStore((s) => s.save)
  const mutate = useFarmStore((s) => s.mutate)

  const pets = save?.pets ?? []
  const pet: Pet | undefined = pets.find((p) => p.id === petId) ?? pets[0]

  const setStat = (key: 'satiety' | 'mood' | 'cleanliness' | 'weight', v: number) => {
    if (!pet) return
    mutate((s) => ({ ...s, pets: s.pets.map((p) => (p.id === pet.id ? { ...p, [key]: v } : p)) }))
  }

  const forward = (ms: number) => {
    mutate((s) => shiftTime(s, ms))
    useFarmStore.getState().tick() // 跨日時順便領每日獎勵
  }

  return (
    <>
    {bestiary && <Bestiary onClose={() => setBestiary(false)} />}
    {proportions && <Proportions onClose={() => setProportions(false)} />}
    <div className="absolute bottom-24 right-3 z-[9600] text-white" onPointerDown={(e) => e.stopPropagation()}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-fuchsia-600/90 px-3 py-1.5 text-xs font-bold shadow-lg">
          🧪 測試模式
        </button>
      ) : (
        <div className="w-[270px] rounded-xl border border-fuchsia-300/40 bg-slate-900/90 p-3 text-xs shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <b className="text-fuchsia-300">🧪 測試模式（只在開發環境）</b>
            <button type="button" onClick={() => setOpen(false)} className="px-1 text-white/60 hover:text-white">
              ▾
            </button>
          </div>

          <div className="mb-2">
            <div className="mb-1 text-white/60">金幣 {save?.points ?? '—'}</div>
            <div className="flex gap-1.5">
              <button className={btn} data-testid="dev-add-coins" onClick={() => mutate((s) => ({ ...s, points: s.points + 10 }))}>
                加金幣 +10
              </button>
              <button className={btn} onClick={() => mutate((s) => ({ ...s, points: s.points + 100 }))}>
                +100
              </button>
              <button className={btn} onClick={() => mutate((s) => ({ ...s, points: s.points + 1000 }))}>
                +1000
              </button>
            </div>
          </div>

          <div className="mb-2">
            <div className="mb-1 text-white/60">時間快轉</div>
            <div className="flex gap-1.5">
              <button className={btn} onClick={() => forward(HOUR_MS)}>
                +1 小時
              </button>
              <button className={btn} onClick={() => forward(DAY_MS)}>
                +1 天
              </button>
            </div>
          </div>

          <div className="mb-2">
            <div className="mb-1 text-white/60">天氣</div>
            <div className="flex flex-wrap gap-1.5">
              <button className={btn} onClick={() => { overrides.weather = null; force((n) => n + 1) }}>
                自動{overrides.weather === null ? ' ✓' : ''}
              </button>
              {(Object.keys(WEATHER_NAMES) as Weather[]).map((w) => (
                <button key={w} className={btn} onClick={() => { overrides.weather = w; force((n) => n + 1) }}>
                  {WEATHER_NAMES[w]}
                  {overrides.weather === w ? ' ✓' : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-2">
            <div className="mb-1 text-white/60">時段</div>
            <div className="flex flex-wrap gap-1.5">
              <button className={btn} onClick={() => { overrides.hour = null; force((n) => n + 1) }}>
                自動{overrides.hour === null ? ' ✓' : ''}
              </button>
              {(Object.keys(PHASE_NAMES) as Phase[]).map((p) => (
                <button key={p} className={btn} onClick={() => { overrides.hour = PHASE_HOURS[p]; force((n) => n + 1) }}>
                  {PHASE_NAMES[p]}
                  {overrides.hour === PHASE_HOURS[p] ? ' ✓' : ''}
                </button>
              ))}
            </div>
          </div>

          {pet && (
            <div className="mb-2">
              <div className="mb-1 text-white/60">調整寵物</div>
              <select
                className="mb-1.5 w-full rounded bg-slate-800 px-1.5 py-1"
                value={pet.id}
                onChange={(e) => setPetId(e.target.value)}
              >
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {SPECIES[p.species].emoji} {p.name}
                  </option>
                ))}
              </select>
              {(
                [
                  ['satiety', '飽食度'],
                  ['mood', '心情'],
                  ['cleanliness', '清潔度'],
                  ['weight', '體重'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2">
                  <span className="w-12 text-white/70">{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(pet[k])}
                    onChange={(e) => setStat(k, Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-7 text-right tabular-nums">{Math.round(pet[k])}</span>
                </label>
              ))}
              <button
                className={`${btn} mt-1.5`}
                onClick={() => useFarmStore.setState((s) => ({ gifts: s.gifts.includes(pet.id) ? s.gifts : [...s.gifts, pet.id] }))}
              >
                🎁 讓牠叼禮物
              </button>
            </div>
          )}

          <button className={`${btn} mb-1 w-full py-1.5`} onClick={() => setBestiary(true)}>
            🐾 生物圖鑑
          </button>
          <button className={`${btn} mb-2 w-full py-1.5`} onClick={() => setProportions(true)}>
            📏 比例對照圖
          </button>

          <button
            className="w-full rounded bg-rose-600/80 px-2 py-1.5 text-[11px] font-bold hover:bg-rose-600"
            onClick={() => {
              if (window.confirm('確定要重置養殖場？存檔會被清空。')) void useFarmStore.getState().resetAll()
            }}
          >
            重置養殖場
          </button>
        </div>
      )}
    </div>
    </>
  )
}
