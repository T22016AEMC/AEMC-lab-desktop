import { useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { SPECIES, SPECIES_LIST, variantOf, type SpeciesId } from '../config/species'
import { useFarmStore } from '../store/farmStore'
import { PixelSprite } from './PixelSprite'

function pickName(id: SpeciesId): string {
  const ideas = SPECIES[id].nameIdeas
  return ideas[Math.floor(Math.random() * ideas.length)]
}

/** 領養表單的狀態（第一次領養與商店的寵物分頁共用） */
export function useAdoptForm() {
  const [species, setSpecies] = useState<SpeciesId>('dog')
  const [variant, setVariant] = useState('shiba')
  const [name, setName] = useState(() => pickName('dog'))
  const choose = (id: SpeciesId) => {
    setSpecies(id)
    setVariant(SPECIES[id].variants[0].id)
    setName(pickName(id))
  }
  const def = SPECIES[species]
  /** 實際會用的名字（沒填用第一個建議名，和 adopt 的規則相同） */
  const finalName = name.trim() || def.nameIdeas[0]
  return { species, variant, name, setVariant, setName, choose, def, finalName }
}
export type AdoptForm = ReturnType<typeof useAdoptForm>

/** 選狗或貓、選品種（用「大家的正面照」的像素正面圖當預覽）、取名字 */
/** onChoose：換了狗／貓；onEdit：任何修改（換品種、改名字也算） */
export function AdoptPicker({ form, onChoose, onEdit }: { form: AdoptForm; onChoose?: () => void; onEdit?: () => void }) {
  const { species, variant, name, def } = form
  const v = variantOf(species, variant)
  return (
    <>
      <div className="mt-3 flex gap-2">
        {SPECIES_LIST.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              form.choose(s.id)
              onChoose?.()
              onEdit?.()
            }}
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
              onClick={() => {
                form.setVariant(c.id)
                onEdit?.()
              }}
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
        onChange={(e) => {
          form.setName(e.target.value)
          onEdit?.()
        }}
        placeholder={`幫${def.name}取個名字`}
        className="px-input mt-1 w-full px-3 py-1.5 text-sm"
        style={{ userSelect: 'text' }}
      />
    </>
  )
}

/**
 * 第一次領養（沒有存檔或 0 隻寵物）：第一隻免費、不能關閉。
 * v4.0 起之後的領養都在商店的寵物分頁（ShopDialog），這個對話框只剩第一次領養。
 */
export function AdoptDialog({ first = true }: { first?: true }) {
  const adoptPet = useFarmStore((s) => s.adoptPet)
  const form = useAdoptForm()
  const [error, setError] = useState<string | null>(null)
  void first

  const submit = () => {
    const err = adoptPet({ species: form.species, variant: form.variant, name: form.name })
    if (err) setError(err)
    else useUIStore.getState().showToast(`已領養「${form.finalName}」！`)
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <div role="dialog" aria-label="選擇你的第一隻寵物" className="px-panel w-full max-w-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold">選擇你的第一隻寵物</div>
        </div>
        <div className="mt-0.5 text-xs text-[#8a5a2b]">第一隻免費</div>

        <AdoptPicker form={form} onChoose={() => setError(null)} />

        {error && (
          <div role="alert" className="mt-2 text-xs font-bold text-[#c0392b]">
            {error}
          </div>
        )}

        <button type="button" onClick={submit} className="px-btn mt-3 w-full py-2 text-sm">
          開始養殖場
        </button>
      </div>
    </div>
  )
}
