import type { ShopItem } from '../config/shop'
import type { SkinDef } from '../config/skins'
import type { SaveData } from '../save/types'
import { itemStatus } from '../sim/shop'
import { useFarmStore } from '../store/farmStore'
import { useUIStore } from '../../store/uiStore'
import { PixelSprite } from './PixelSprite'

/** 外觀切換卡片的文字 */
export const SKIN_TEXT = {
  inUse: '使用中',
  wear: '換上',
  buy: '購買',
  original: '原樣',
  backToOriginal: '換回原樣',
  legend: '傳說獎勵',
  worn: (name: string): string => `已換上${name}`,
  wornOriginal: (part: string): string => `${part}已換回原樣`,
} as const

/** 一張外觀卡（原樣、傳說獎勵、商店外觀共用）：使用中／換上／購買 */
export interface SkinCardModel {
  /** data-testid 用的 id：原樣 = default、外觀 = 外觀 id */
  id: string
  name: string
  frame: string
  /** null = 原樣 */
  skinId: string | null
  tag?: string
  /** 商店商品（沒擁有時才需要；有 = 可以買） */
  item?: ShopItem
}

/**
 * 4.0-B1：一個部位的外觀列（商店「建築」分頁的房子外裝、鐘樓外裝…；之後「裝飾品 › 環境主題」也用這個元件）。
 * 第一張是「原樣」（免費、永遠擁有；沒穿任何外觀時是使用中），接著是已擁有的傳說獎勵外觀（只有拿到了才出現），再來是商店外觀。
 * 換上、換回原樣立刻生效、立刻存檔（farmStore.equipSkin）；沒擁有的走商店的購買確認（onBuy），買了立刻換上。
 */
export function SkinRow({ slot, title, cards, save, busy, onBuy, wide = false }: { slot: string; title: string; cards: SkinCardModel[]; save: SaveData; busy: boolean; onBuy: (item: ShopItem) => void; wide?: boolean }) {
  const worn = save.skins.equipped[slot] ?? null
  return (
    <section className="mt-3" data-testid={`skin-row-${slot}`}>
      <h3 className="mb-1 text-sm font-bold">{title}</h3>
      <div className={`grid ${wide ? 'grid-cols-[repeat(auto-fill,minmax(124px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(112px,1fr))]'} gap-2`}>
        {cards.map((c) => {
          const owned = c.skinId === null || save.skins.owned.includes(c.skinId)
          const using = c.skinId === worn
          const st = !owned && c.item ? itemStatus(save, c.item) : null
          const state = using ? 'using' : owned ? 'owned' : 'locked'
          return (
            <div
              key={c.id}
              data-testid={`skin-card-${slot}-${c.id}`}
              data-state={state}
              className={`flex flex-col items-center border-2 px-1.5 pb-1.5 pt-1 ${using ? 'border-[#3f8f3a] bg-[#eef8e6]' : 'border-[#3b2a1c]/60 bg-[#fffdf4]'}`}
            >
              <div className={`flex ${wide ? 'h-[64px]' : 'h-[52px]'} items-end justify-center`}>
                <PixelSprite frame={c.frame} scale={1} fit={wide ? 100 : 48} title={c.name} />
              </div>
              <div className="mt-0.5 text-center text-xs font-bold leading-tight">{c.name}</div>
              {c.tag && <div className="text-[10px] text-[#8a5a2b]">{c.tag}</div>}
              {!owned && c.item && <div className="text-xs font-bold tabular-nums text-[#8a5a2b]">🪙 {c.item.price}</div>}
              {!owned && st?.reason && (
                <div className="text-center text-[10px] font-bold leading-snug text-[#c0392b]" data-testid={`skin-why-${slot}-${c.id}`}>
                  {st.reason}
                </div>
              )}
              {using ? (
                <div className="mt-1 w-full border-2 border-[#3f8f3a] bg-[#3f8f3a] py-px text-center text-xs font-bold text-white">{SKIN_TEXT.inUse}</div>
              ) : owned ? (
                <button
                  type="button"
                  data-testid={`skin-wear-${slot}-${c.id}`}
                  disabled={busy}
                  className="px-btn mt-1 w-full py-px text-xs"
                  onClick={() => {
                    useFarmStore.getState().equipSkin(slot, c.skinId)
                    useUIStore.getState().showToast(c.skinId === null ? SKIN_TEXT.wornOriginal(title.replace(/外(裝|殼)$/, '')) : SKIN_TEXT.worn(c.name))
                  }}
                >
                  {c.skinId === null ? SKIN_TEXT.backToOriginal : SKIN_TEXT.wear}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid={`shop-buy-${c.item?.id}`}
                  disabled={!st?.canBuy || busy}
                  className="px-btn mt-1 w-full py-px text-xs"
                  onClick={() => c.item && onBuy(c.item)}
                >
                  {SKIN_TEXT.buy}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** 一個部位的卡片：原樣、已擁有的傳說獎勵外觀、商店外觀（依商品表順序） */
export function skinCardsFor(defaultFrame: string, items: readonly ShopItem[], legends: readonly SkinDef[], owned: readonly string[], skinName: (id: string) => SkinDef | undefined, originalName: string = SKIN_TEXT.original): SkinCardModel[] {
  const cards: SkinCardModel[] = [{ id: 'default', name: originalName, frame: defaultFrame, skinId: null }]
  for (const d of legends) if (owned.includes(d.id)) cards.push({ id: d.id, name: d.name, frame: d.frames.closed, skinId: d.id, tag: SKIN_TEXT.legend })
  for (const it of items) {
    if (it.grant.type !== 'skin') continue
    const d = skinName(it.grant.skin)
    cards.push({ id: it.grant.skin, name: it.name, frame: d?.frames.closed ?? it.sprite ?? '', skinId: it.grant.skin, item: it })
  }
  return cards
}
