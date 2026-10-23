import { forwardRef, useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { SPECIES, variantOf } from '../config/species'
import { worldHour } from '../overrides'
import { petActions } from '../sim/commands'
import { isSleeping } from '../sim/rules'
import { stageOf, weightLabel, heightCm } from '../sim/stats'
import { useFarmStore } from '../store/farmStore'

/** 像素風的數值條：10 格 */
function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const filled = Math.round(Math.max(0, Math.min(100, value)) / 10)
  return (
    <div className="flex items-center gap-1.5" aria-label={`${label} ${Math.round(value)}`}>
      <span className="w-9 shrink-0 text-[11px]">{label}</span>
      <div className="flex gap-px border-2 border-[#3b2a1c] bg-[#3b2a1c] p-px" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="block h-2.5 w-2" style={{ background: i < filled ? color : '#e8dcc0' }} />
        ))}
      </div>
      <span className="w-6 text-right text-[11px] tabular-nums">{Math.round(value)}</span>
    </div>
  )
}

/**
 * 點寵物彈出的氣泡選單：名字、三條像素風小條（飽食、心情、清潔）、所有寵物操作。
 * 位置由 Farm 每個影格直接改 style（跟著寵物走），這裡只負責內容。
 */
export const PetMenu = forwardRef<HTMLDivElement, { petId: string; onBath?: (petId: string) => void }>(function PetMenu({ petId, onBath }, ref) {
  const save = useFarmStore((s) => s.save)
  const runAction = useFarmStore((s) => s.runAction)
  const [tick, setTick] = useState(0)
  // 睡覺狀態依時間而定：每 5 秒重算一次可用的操作
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 5000)
    return () => window.clearInterval(t)
  }, [])
  const pet = save?.pets.find((p) => p.id === petId)
  const nowMs = Date.now()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const actions = useMemo(() => (save && pet ? petActions(save, pet, { nowMs, hour: worldHour(nowMs) }) : []), [save, pet, tick])
  if (!save || !pet) return null
  const sp = SPECIES[pet.species]
  const v = variantOf(pet.species, pet.variant)
  const sleeping = isSleeping(pet, worldHour(nowMs), nowMs)
  const stage = stageOf(pet, nowMs) === 'young' ? '幼年' : '成年'

  const run = (id: (typeof actions)[number]['id']) => {
    // 洗澡：寵物自己走到水池前再跳進去（扣金幣在跳進水池時才扣）
    if (id === 'bath' && onBath) {
      onBath(pet.id)
      return
    }
    const err = runAction(id, pet.id)
    if (err) useUIStore.getState().showToast(err)
    else useUIStore.getState().hideToast()
  }

  return (
    <div
      ref={ref}
      className="px-panel pointer-events-auto absolute z-30 w-[216px] p-2.5"
      style={{ left: 0, top: 0, transform: 'translate(-50%, -100%)', visibility: 'hidden' }}
      role="dialog"
      aria-label={`${pet.name}的選單`}
      data-testid="pet-menu"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="truncate text-sm font-bold">
          {sp.emoji} {pet.name}
        </div>
        <div className="shrink-0 text-[10px] text-[#8a5a2b]">
          {v.name}・{stage}
          {sleeping ? '・睡覺中' : ''}
        </div>
      </div>
      <div className="mt-1.5 space-y-1">
        <Bar label="飽食" value={pet.satiety} color="#e8892b" />
        <Bar label="心情" value={pet.mood} color="#e8588b" />
        <Bar label="清潔" value={pet.cleanliness} color="#3b9be8" />
      </div>
      <div className="mt-1 text-[10px] text-[#8a5a2b]">
        身高 {heightCm(pet, v.baseCm, nowMs)} 公分・體重 {Math.round(pet.weight)}（{weightLabel(pet.weight)}）
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={Boolean(a.disabledReason)}
            title={a.disabledReason ?? `${a.label}（${a.cost} 金幣）`}
            onClick={() => run(a.id)}
            className="px-btn px-1 py-1 text-xs"
          >
            {a.label}
            <span className="block text-[9px] font-normal opacity-70">{a.cost} 金幣</span>
          </button>
        ))}
      </div>
      {/* 氣泡的小尾巴 */}
      <span className="absolute left-1/2 top-full -ml-2 block h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-[#3b2a1c]" />
      <span className="absolute left-1/2 top-full -ml-[5px] -mt-[3px] block h-0 w-0 border-x-[5px] border-t-[5px] border-x-transparent border-t-[#fff6df]" />
    </div>
  )
})
