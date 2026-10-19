import { useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { LAND_SPECIES, SEA_SPECIES, SPECIES, type SpeciesId } from '../config/species'
import { useFarmStore } from '../store/farmStore'
import { CreaturePreview } from './CreaturePreview'

function pickName(id: SpeciesId): string {
  const ideas = SPECIES[id].nameIdeas
  return ideas[Math.floor(Math.random() * ideas.length)]
}

/** 第一次進入（沒有存檔）：選第一隻寵物，免費 */
export function FirstPetPicker() {
  const [species, setSpecies] = useState<SpeciesId>('dog')
  const [variant, setVariant] = useState<string>(SPECIES.dog.variants![0].id)
  const [name, setName] = useState(() => pickName('dog'))
  const adoptPet = useFarmStore((s) => s.adoptPet)
  const def = SPECIES[species]

  const choose = (id: SpeciesId) => {
    setSpecies(id)
    setVariant(SPECIES[id].variants?.[0].id ?? '')
    setName(pickName(id))
  }

  const start = () => {
    const err = adoptPet({ species, variant: def.variants ? variant : undefined, name })
    if (err) useUIStore.getState().showToast(err)
  }

  const card = (id: SpeciesId) => {
    const s = SPECIES[id]
    return (
      <button
        key={id}
        type="button"
        onClick={() => choose(id)}
        className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-xs transition ${
          id === species ? 'border-amber-300 bg-amber-200/30 shadow-md' : 'border-white/20 bg-white/10 hover:bg-white/20'
        }`}
      >
        <CreaturePreview species={id} variant={s.variants?.[0].id} w={72} h={46} />
        <span className="font-medium">{s.name}</span>
        {s.groupSize > 1 && <span className="text-[10px] text-white/70">一次 {s.groupSize} 隻</span>}
      </button>
    )
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/30 p-4 backdrop-blur-[3px]">
      <div className="w-full max-w-md rounded-3xl border border-white/25 bg-slate-900/80 p-5 text-white shadow-2xl backdrop-blur-xl">
        <div className="text-center text-xl font-bold">選擇你的第一隻寵物</div>
        <div className="mt-1 text-center text-xs text-amber-200">第一隻免費</div>

        <div className="mt-4 text-xs text-white/60">陸地</div>
        <div className="mt-1 grid grid-cols-4 gap-2">{LAND_SPECIES.map((s) => card(s.id))}</div>
        <div className="mt-3 text-xs text-white/60">海洋</div>
        <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">{SEA_SPECIES.map((s) => card(s.id))}</div>

        <div className="mt-4 flex justify-center rounded-2xl bg-gradient-to-b from-sky-200/25 to-sky-300/10 py-2" data-testid="adopt-preview">
          <CreaturePreview species={species} variant={def.variants ? variant : undefined} w={220} h={130} />
        </div>

        {def.variants && (
          <div className="mt-4">
            <div className="text-xs text-white/60">{def.variantLabel}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {def.variants.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setVariant(c.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                    c.id === variant ? 'border-amber-300 bg-amber-200/25' : 'border-white/20 bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <CreaturePreview species={species} variant={c.id} w={44} h={30} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="text-xs text-white/60" htmlFor="first-pet-name">
            名字
          </label>
          <input
            id="first-pet-name"
            value={name}
            maxLength={12}
            onChange={(e) => setName(e.target.value)}
            placeholder={`幫${def.name}取個名字`}
            className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none focus:bg-white/20"
            style={{ userSelect: 'text' }}
          />
        </div>

        <button
          type="button"
          onClick={start}
          className="mt-5 w-full rounded-full bg-gradient-to-b from-amber-300 to-orange-500 py-2.5 text-sm font-bold text-slate-900 shadow-lg hover:brightness-110 active:scale-[0.98]"
        >
          開始養殖場
        </button>
      </div>
    </div>
  )
}
