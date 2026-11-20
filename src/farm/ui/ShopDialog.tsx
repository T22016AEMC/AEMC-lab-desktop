import { useEffect, useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { ToolDialog } from '../../components/tools/ToolDialog'
import { PET_CAPACITY } from '../config/balance'
import type { BuildingId } from '../config/buildings'
import { ENV_GROUP, ENV_SLOT, SHOP_CATEGORIES, SHOP_CATEGORY_LABEL, SHOP_COMING_SOON, SIZE_LABEL, itemsOf, type ShopCategory, type ShopItem } from '../config/shop'
import { PART_DEFAULT_FRAME, SKINS, SKIN_ATLAS, SKIN_PARTS, SKIN_PART_GROUP, skinDef } from '../config/skins'
import { assets } from '../pixel/assets'
import { SkinRow, skinCardsFor } from './SkinCards'
import type { PixelEngine } from '../pixel/engine'
import { DEFAULT_POS, resolvePlacement, withoutRecord } from '../pixel/placement'
import { canPlace, layoutWith } from '../pixel/placeRules'
import { adoptCheck } from '../sim/rules'
import { BOUGHT_TO_INVENTORY, SHOP_TEXT, itemStatus } from '../sim/shop'
import { useFarmStore } from '../store/farmStore'
import { AdoptPicker, useAdoptForm } from './AdoptDialog'
import { PixelSprite } from './PixelSprite'

/** 商店的文字（集中在這裡） */
export const SHOP_UI_TEXT = {
  title: '商店',
  comingSoon: SHOP_TEXT.comingSoon,
  comingSoonBody: '農場即將開放，敬請期待',
  owned: SHOP_TEXT.owned,
  buy: '購買',
  notEnough: '金幣不足',
  confirmBuy: '確定購買',
  confirmAdopt: '確定領養',
  cancel: '取消',
  toEdit: '到編輯農場擺放',
  after: (left: number): string => `（購買後剩 ${left} 金幣）`,
} as const

type Confirm = { kind: 'item'; item: ShopItem } | { kind: 'pet' }

/**
 * 商店（v4.0 階段 A）：選單列「商店」打開（取代「＋領養」）。外框沿用工具視窗（Esc、右上角「關閉」、點遮罩關閉）。
 * 分類分頁：寵物、裝飾品、建築、農場（農場只顯示「即將開放」、不可點）。商品與價格全部來自 config/shop.ts。
 * 購買前一定有確認步驟（品名＋金額）；確認按下後停用到結果回來，連點不會重複買。金幣不足時按鈕停用並說明原因。
 * 不做賣回或退款。
 */
export function ShopDialog({ engine }: { engine: PixelEngine }) {
  const tab = useUIStore((s) => s.shopTab) ?? 'pet'
  const save = useFarmStore((s) => s.save)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const form = useAdoptForm()
  const ui = useUIStore.getState
  // 4.0-B1：建築分頁的外觀卡片縮圖在延後載入的外殼圖集裡：打開建築分頁才載入，載完重畫一次
  const [skinsReady, setSkinsReady] = useState(false)
  useEffect(() => {
    if (tab !== 'building' || skinsReady) return
    let alive = true
    void Promise.all([...new Set(Object.values(SKIN_ATLAS))].map((g) => assets.loadGroup(g))).then(() => alive && setSkinsReady(true), () => {})
    return () => {
      alive = false
    }
  }, [tab, skinsReady])

  if (!save) return null
  const points = save.points

  const close = (): void => {
    // Esc、點遮罩：確認中先取消確認，再按一次才關閉商店
    if (confirm && !busy) {
      setConfirm(null)
      return
    }
    ui().setShopTab(null)
  }
  const switchTab = (t: ShopCategory): void => {
    if (SHOP_COMING_SOON.includes(t) || busy) return
    setConfirm(null)
    setNotice(null)
    setError(null)
    ui().setShopTab(t)
  }

  /** 建築的預設位置現在放得下嗎（假設已經買了、擺在預設位置；存檔裡這棟建築以前殘留的紀錄一律忽略） */
  const defaultBlocked = (id: BuildingId): boolean => {
    const cur = useFarmStore.getState().save
    const d = DEFAULT_POS[id]
    if (!cur || !d) return true
    const T = layoutWith(engine.layout, resolvePlacement([...cur.ownedBuildings, id], withoutRecord(cur.farmLayout, id), cur.shop?.decor))
    return !canPlace(T, id, d.x, d.y).ok
  }

  const doConfirm = async (): Promise<void> => {
    if (!confirm || busy) return
    setBusy(true)
    setError(null)
    try {
      if (confirm.kind === 'pet') {
        const name = form.finalName
        const err = await useFarmStore.getState().shopAdopt({ species: form.species, variant: form.variant, name: form.name })
        if (err) setError(err)
        else {
          ui().showToast(`已領養「${name}」！`)
          setNotice(`已領養「${name}」！`)
        }
      } else {
        const item = confirm.item
        const g = item.grant
        const storeIt = g.type === 'building' ? defaultBlocked(g.building) : false
        const r = await useFarmStore.getState().purchase(item.id, { storeIt })
        if (!r.ok) setError(r.error)
        else if (g.type === 'decor') {
          ui().showToast(SHOP_TEXT.boughtDecor(item.name), 3200)
          setNotice(SHOP_TEXT.boughtDecor(item.name))
        } else if (g.type === 'building') {
          ui().showToast(SHOP_TEXT.boughtBuilding(item.name, item.price))
          setNotice(storeIt ? BOUGHT_TO_INVENTORY(item.name) : SHOP_TEXT.boughtBuilding(item.name, item.price))
        } else {
          ui().showToast(SHOP_TEXT.boughtSkin(item.name))
          setNotice(SHOP_TEXT.boughtSkin(item.name))
        }
      }
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const toEdit = (): void => {
    ui().setShopTab(null)
    ui().setBuildMode(true)
  }

  const renderCard = (item: ShopItem) => {
    const st = itemStatus(save, item)
    const isDecor = item.grant.type === 'decor'
    const ownedOnce = !item.repeatable && st.owned >= 1
    const label = ownedOnce ? SHOP_UI_TEXT.owned : !st.canBuy && st.reason?.startsWith(SHOP_UI_TEXT.notEnough) ? SHOP_UI_TEXT.notEnough : SHOP_UI_TEXT.buy
    return (
      <div
        key={item.id}
        data-testid={`shop-item-${item.id}`}
        data-owned={st.owned}
        className={`flex flex-col items-center border-2 border-[#3b2a1c]/60 px-2 pb-2 pt-1.5 ${ownedOnce ? 'bg-[#e6e0d2] opacity-70' : 'bg-[#fffdf4]'}`}
      >
        <div className="flex h-[60px] items-end justify-center">{item.sprite && <PixelSprite frame={item.sprite} scale={1} fit={56} title={item.name} />}</div>
        <div className="mt-1 text-center text-sm font-bold leading-tight">{item.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs font-bold tabular-nums text-[#8a5a2b]">
          <span>🪙 {item.price}</span>
          {item.size && <span className="border border-[#8a5a2b]/60 bg-[#f2dca8] px-1 text-[10px] leading-tight">{SIZE_LABEL[item.size]}</span>}
        </div>
        {isDecor && (
          <div className="text-[11px] tabular-nums text-[#5a3410]" data-testid={`shop-owned-${item.id}`}>
            擁有 {st.owned}／{item.maxOwned}
          </div>
        )}
        {ownedOnce && (
          <div className="text-[11px] font-bold text-[#5a3410]" data-testid={`shop-has-${item.id}`}>
            {SHOP_UI_TEXT.owned}
          </div>
        )}
        {item.blurb && !ownedOnce && <div className="mt-0.5 text-center text-[10px] leading-snug text-[#5a3410]">{item.blurb}</div>}
        {!ownedOnce && st.reason && (
          <div className="mt-0.5 text-center text-[10px] font-bold leading-snug text-[#c0392b]" data-testid={`shop-why-${item.id}`}>
            {st.reason}
          </div>
        )}
        <button
          type="button"
          data-testid={`shop-buy-${item.id}`}
          disabled={!st.canBuy || busy}
          onClick={() => {
            setNotice(null)
            setError(null)
            setConfirm({ kind: 'item', item })
          }}
          className="px-btn mt-1.5 w-full py-0.5 text-sm"
        >
          {label}
        </button>
      </div>
    )
  }

  const buy = (item: ShopItem): void => {
    setNotice(null)
    setError(null)
    setConfirm({ kind: 'item', item })
  }
  /** 4.0-B1：外觀列（建築分頁的各部位、裝飾品分頁的環境主題）：原樣／使用中／換上／購買 */
  const renderSkinRows = (cat: ShopCategory) => {
    const skinItems = itemsOf(cat).filter((it) => it.grant.type === 'skin')
    if (cat === 'building')
      return SKIN_PARTS.map((part) => (
        <SkinRow
          key={part}
          slot={part}
          title={SKIN_PART_GROUP[part]}
          save={save}
          busy={busy}
          onBuy={buy}
          cards={skinCardsFor(PART_DEFAULT_FRAME[part], skinItems.filter((it) => it.grant.type === 'skin' && it.grant.slot === part), SKINS.filter((d) => d.legend && d.part === part), save.skins.owned, skinDef)}
        />
      ))
    const env = skinItems.filter((it) => it.grant.type === 'skin' && it.grant.slot === ENV_SLOT)
    if (!env.length) return null
    return <SkinRow slot={ENV_SLOT} title={ENV_GROUP} save={save} busy={busy} onBuy={buy} cards={skinCardsFor('grass_tile', env, [], save.skins.owned, skinDef, '草地')} />
  }

  const renderGrid = (cat: ShopCategory) => {
    void skinsReady
    const items = itemsOf(cat).filter((it) => it.grant.type !== 'skin')
    const groups: { name: string | undefined; list: ShopItem[] }[] = []
    for (const it of items) {
      const g = groups.find((x) => x.name === it.group)
      if (g) g.list.push(it)
      else groups.push({ name: it.group, list: [it] })
    }
    return (
      <>
        {cat === 'decor' && renderSkinRows(cat)}
        {groups.map((g) => (
          <section key={g.name ?? '-'} className="mt-2">
            {g.name && (groups.length > 1 || cat === 'building') && <h3 className="mb-1 text-sm font-bold">{g.name}</h3>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">{g.list.map(renderCard)}</div>
          </section>
        ))}
        {cat === 'building' && renderSkinRows(cat)}
      </>
    )
  }

  const renderPets = () => {
    if (save.pets.length >= PET_CAPACITY)
      return (
        <div data-testid="shop-pets-full" className="py-6 text-center text-sm font-bold text-[#7a2b1c]">
          {SHOP_TEXT.petsFull}
        </div>
      )
    const check = adoptCheck(save, form.species)
    return (
      <div data-testid="shop-pet-form">
        <div className="mt-1 text-xs text-[#8a5a2b]">
          每隻 {form.def.cost} 金幣（目前 {points} 金幣，已養 {save.pets.length}/{PET_CAPACITY} 隻）
        </div>
        <AdoptPicker form={form} onEdit={() => setError(null)} />
        {!check.ok && (
          <div role="alert" className="mt-2 text-xs font-bold text-[#c0392b]" data-testid="shop-pet-why">
            {check.reason}
          </div>
        )}
        <button
          type="button"
          data-testid="shop-adopt"
          disabled={!check.ok || busy}
          onClick={() => {
            setNotice(null)
            setError(null)
            setConfirm({ kind: 'pet' })
          }}
          className="px-btn mt-3 w-full py-2 text-sm"
        >
          領養（{form.def.cost} 金幣）
        </button>
      </div>
    )
  }

  const confirmName = confirm?.kind === 'pet' ? `領養「${form.finalName}」（${form.def.name}）？` : confirm ? `購買「${confirm.item.name}」？` : ''
  const confirmPrice = confirm?.kind === 'pet' ? form.def.cost : confirm ? confirm.item.price : 0

  return (
    <ToolDialog id="shop" title={SHOP_UI_TEXT.title} iconNode={<span aria-hidden>🛒</span>} width={720} onClose={close}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b-2 border-[#3b2a1c]/30 bg-[#fff3d0] px-3 py-1.5" role="tablist" aria-label="商店分類">
        {SHOP_CATEGORIES.map((c) => {
          const soon = SHOP_COMING_SOON.includes(c)
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={tab === c}
              aria-disabled={soon || undefined}
              disabled={soon}
              data-testid={`shop-tab-${c}`}
              title={soon ? SHOP_UI_TEXT.comingSoon : undefined}
              onClick={() => switchTab(c)}
              className={`border-2 px-2.5 py-px text-sm font-bold ${
                soon ? 'cursor-not-allowed border-[#9a8f7a] bg-[#d9d3c4] text-[#8a8270]' : tab === c ? 'border-[#3b2a1c] bg-[#3b2a1c] text-[#ffe28a]' : 'border-[#3b2a1c] bg-white hover:bg-[#ffe9b0]'
              }`}
            >
              {SHOP_CATEGORY_LABEL[c]}
              {soon && <span className="ml-1 text-[10px] font-normal">（{SHOP_UI_TEXT.comingSoon}）</span>}
            </button>
          )
        })}
        <span className="ml-auto text-sm font-bold tabular-nums" data-testid="shop-points">
          🪙 {points}
        </span>
      </div>

      <div className="px-3 pb-3" data-testid={`shop-panel-${tab}`}>
        {notice && (
          <div data-testid="shop-notice" className="mt-2 flex items-center gap-2 border-2 border-[#7a4b1c] bg-[#fff0c8] px-2 py-1 text-xs font-bold text-[#5a3410]">
            <span className="flex-1">{notice}</span>
            {(tab === 'decor' || tab === 'building') && (
              <button type="button" data-testid="shop-notice-go" onClick={toEdit} className="shrink-0 border-2 border-[#3b2a1c] bg-[#e8892b] px-2 py-px text-white hover:brightness-110">
                {SHOP_UI_TEXT.toEdit}
              </button>
            )}
          </div>
        )}
        {error && (
          <div role="alert" data-testid="shop-error" className="mt-2 text-xs font-bold text-[#c0392b]">
            {error}
          </div>
        )}
        {tab === 'pet' ? renderPets() : SHOP_COMING_SOON.includes(tab) ? <div className="py-6 text-center text-sm">{SHOP_UI_TEXT.comingSoonBody}</div> : renderGrid(tab)}
      </div>

      {confirm && (
        <div data-testid="shop-confirm" role="group" aria-label="購買確認" className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t-2 border-[#3b2a1c] bg-[#ffe9b0] px-3 py-2 text-sm">
          <span className="font-bold" data-testid="shop-confirm-name">
            {confirmName}
          </span>
          <span className="font-bold tabular-nums" data-testid="shop-confirm-price">
            🪙 {confirmPrice}
          </span>
          <span className="text-xs tabular-nums text-[#5a3410]">{SHOP_UI_TEXT.after(points - confirmPrice)}</span>
          <span className="ml-auto flex gap-2">
            <button type="button" data-testid="shop-confirm-cancel" autoFocus disabled={busy} onClick={() => setConfirm(null)} className="border-2 border-[#3b2a1c] bg-white px-3 py-0.5 text-xs font-bold">
              {SHOP_UI_TEXT.cancel}
            </button>
            <button
              type="button"
              data-testid="shop-confirm-ok"
              disabled={busy}
              onClick={() => void doConfirm()}
              className="border-2 border-[#3b2a1c] bg-[#e8892b] px-3 py-0.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {confirm.kind === 'pet' ? SHOP_UI_TEXT.confirmAdopt : SHOP_UI_TEXT.confirmBuy}
            </button>
          </span>
        </div>
      )}
    </ToolDialog>
  )
}
