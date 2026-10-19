import { appearanceOf } from '../config/appearance'
import { SPECIES } from '../config/species'
import { heightCm, stageOf, weightLabel } from '../sim/stats'
import { useFarmStore } from '../store/farmStore'

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const v = Math.round(value)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 shrink-0 text-white/75">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${v}%`, background: v < 30 ? '#f87171' : color }} />
      </div>
      <span className="w-7 text-right tabular-nums">{v}</span>
    </div>
  )
}

/** 點擊寵物後的資訊卡：名字、種類、成長階段、三項數值、身高與體重 */
export function PetCard({ petId, x, y, onClose }: { petId: string; x: number; y: number; onClose: () => void }) {
  const pet = useFarmStore((s) => s.save?.pets.find((p) => p.id === petId))
  if (!pet) return null
  const def = SPECIES[pet.species]
  const stage = stageOf(pet, Date.now())
  const look = appearanceOf(pet.species, pet.variant)
  const cm = heightCm(pet, look.baseCm, Date.now())
  const width = 240
  const left = Math.max(8, Math.min(x + 18, window.innerWidth - width - 8))
  const top = Math.max(8, y - 40)

  return (
    <div
      className="absolute z-30 rounded-2xl border border-white/25 bg-slate-900/85 p-3 text-white shadow-2xl backdrop-blur-xl"
      style={{ left, top, width }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2">
        <span className="text-3xl leading-none">{def.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold">{pet.name}</div>
          <div className="text-xs text-white/70">
            {look.variant ? look.name : def.name}・{stage === 'young' ? '幼年' : '成年'}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="關閉" className="rounded px-1.5 text-white/60 hover:bg-white/15 hover:text-white">
          ✕
        </button>
      </div>
      <div className="mt-3 space-y-1.5">
        <Bar label="飽食度" value={pet.satiety} color="#fbbf24" />
        <Bar label="心情" value={pet.mood} color="#f472b6" />
        <Bar label="清潔度" value={pet.cleanliness} color="#38bdf8" />
      </div>
      <div className="mt-3 flex justify-between border-t border-white/15 pt-2 text-xs text-white/85">
        <span>身高 {cm} 公分</span>
        <span>
          體重 {Math.round(pet.weight)}（{weightLabel(pet.weight)}）
        </span>
      </div>
    </div>
  )
}
