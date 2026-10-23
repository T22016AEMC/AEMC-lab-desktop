import { useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { PET_CAPACITY } from '../config/balance'
import { SPECIES, SPECIES_LIST, variantOf, type SpeciesId } from '../config/species'
import { adoptCheck } from '../sim/rules'
import { useFarmStore } from '../store/farmStore'
import { PixelSprite } from './PixelSprite'

function pickName(id: SpeciesId): string {
  const ideas = SPECIES[id].nameIdeas
  return ideas[Math.floor(Math.random() * ideas.length)]
}

/**
 * 領養：選狗或貓、選品種（用「大家的正面照」的像素正面圖當預覽）、取名字。
 * first = 第一次進入（沒有存檔），第一隻免費、不能關閉。
 */
export function AdoptDialog({ first = false }: { first?: boolean }) {
  const save = useFarmStore((s) => s.save)
  const adoptPet = useFarmStore((s) => s.adoptPet)
  const [species, setSpecies] = useState<SpeciesId>('dog')
  const [variant, setVariant] = useState('shiba')
  const [name, setName] = useState(() => pickName('dog'))
  const [error, setError] = useState<string | null>(null)
  const def = SPECIES[species]
  const v = variantOf(species, variant)
  const check = save ? adoptCheck(save, species) : { ok: true as boolean, reason: undefined as string | undefined }
  const close = () => useUIStore.getState().setAdoptOpen(false)

  const choose = (id: SpeciesId) => {
    setSpecies(id)
    setVariant(SPECIES[id].variants[0].id)
    setName(pickName(id))
    setError(null)
  }

  const submit = () => {
    const err = adoptPet({ species, variant, name })
    if (err) setError(err)
    else {
      useUIStore.getState().showToast(`已領養「${name.trim() || def.nameIdeas[0]}」！`)
      close()
    }
  }

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 p-3"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => !first && close()}
    >
      <div
        role="dialog"
        aria-label={first ? '選擇你的第一隻寵物' : '領養寵物'}
        className="px-panel w-full max-w-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold">{first ? '選擇你的第一隻寵物' : '領養寵物'}</div>
          {!first && (
            <button type="button" aria-label="關閉" onClick={close} className="px-btn h-7 w-7 text-sm leading-none">
              ✕
            </button>
          )}
        </div>
        <div className="mt-0.5 text-xs text-[#8a5a2b]">
          {first ? '第一隻免費' : `每隻 ${def.cost} 金幣（目前 ${save?.points ?? 0} 金幣，已養 ${save?.pets.length ?? 0}/${PET_CAPACITY} 隻）`}
        </div>

        <div className="mt-3 flex gap-2">
          {SPECIES_LIST.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => choose(s.id)}
              className={`px-btn flex-1 py-1.5 text-sm ${s.id === species ? '' : 'opacity-60'}`}
              aria-pressed={s.id === species}
            >
              {s.emoji} {s.name}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-3">
          <div
            className="flex shrink-0 items-end justify-center border-2 border-[#3b2a1c] bg-[#bfe3a0] p-2"
            style={{ width: 150, minHeight: 190 }}
            data-testid="adopt-preview"
            data-preview-species={species}
            data-preview-variant={variant}
          >
            <PixelSprite frame={`front_${species}_${v.assetKey}`} scale={3} title={v.name} />
          </div>
          <div className="grid flex-1 grid-cols-3 content-start gap-2" role="group" aria-label={def.variantLabel}>
            {def.variants.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setVariant(c.id)}
                aria-pressed={c.id === variant}
                aria-label={c.name}
                className={`flex flex-col items-center gap-0.5 border-2 px-1 pb-1 pt-1.5 text-[11px] ${
                  c.id === variant ? 'border-[#3b2a1c] bg-[#f4c95d]' : 'border-[#c9b27a] bg-[#fffdf4] hover:bg-[#fff2c2]'
                }`}
              >
                <PixelSprite frame={`front_${species}_${c.assetKey}`} scale={1} title={c.name} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="mt-3 block text-xs text-[#8a5a2b]" htmlFor="adopt-name">
          名字
        </label>
        <input
          id="adopt-name"
          value={name}
          maxLength={12}
          onChange={(e) => setName(e.target.value)}
          placeholder={`幫${def.name}取個名字`}
          className="px-input mt-1 w-full px-3 py-1.5 text-sm"
          style={{ userSelect: 'text' }}
        />

        {(error || (!first && !check.ok)) && (
          <div role="alert" className="mt-2 text-xs font-bold text-[#c0392b]">
            {error ?? check.reason}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!first && !check.ok}
          className="px-btn mt-3 w-full py-2 text-sm"
        >
          {first ? '開始養殖場' : `領養（${def.cost} 金幣）`}
        </button>
      </div>
    </div>
  )
}
