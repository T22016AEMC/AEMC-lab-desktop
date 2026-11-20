import { useEffect, useState } from 'react'
import { ITEMS, RARITIES, RARITY_LABEL, REWARD_SILHOUETTE, countOf, isCollected, shardsHave, type Collection, type ItemDef, type Rarity } from '../farm/config/items'
import { SKIN_ATLAS, skinDef } from '../farm/config/skins'
import { ALL_REWARD, RARITY_REWARD } from '../farm/config/events'
import { useFarmStore } from '../farm/store/farmStore'
import { PixelSprite } from '../farm/ui/PixelSprite'
import { assets } from '../farm/pixel/assets'
import { useUIStore } from '../store/uiStore'

/**
 * 收藏冊（v3.6.0）：Logo 選單「收藏冊」打開，同一頁顯示全部寶物，不分頁。
 *  - 還沒收集：用原圖的透明輪廓填暗色當剪影，名稱「？？？」，不顯示描述。
 *  - 套組（機密碎片、合約碎片）：完整紙張的剪影＋已收集片數（例如 3／6）；集齊後改顯示完整圖。
 *  - 傳說項目旁有「獎勵剪影」（狗：亞特蘭提斯房屋；貓：亞特蘭提斯鐘樓），解鎖後顯示名稱。
 *  - 狗狗專屬、貓咪專屬的項目有標示（只養一種寵物的玩家抽不到另一種專屬的）。
 * v4.0：各等級標題旁與頁首顯示「集齊獎勵 N 金幣」，已領的寫「已領取」。扣金幣的事件一律不顯示。
 */

/** 集齊獎勵的小標籤（等級標題旁、頁首） */
function RewardBadge({ testId, coins, got, label = '集齊獎勵' }: { testId: string; coins: number; got: boolean; label?: string }) {
  return (
    <span data-testid={testId} data-claimed={got || undefined} className={`ml-2 border px-1 text-[10px] font-bold ${got ? 'border-[#2f7a1c]/60 bg-[#e4f5d0] text-[#2f5a1c]' : 'border-[#8a5a2b]/60 bg-[#f2dca8] text-[#5a3410]'}`}>
      {label} {coins} 金幣{got ? '・已領取' : ''}
    </span>
  )
}

const POOL_LABEL = { dog: '狗狗專屬', cat: '貓咪專屬' } as const

function Card({ def, col }: { def: ItemDef; col: Collection }) {
  const got = isCollected(col, def)
  const total = countOf(col, def)
  const have = shardsHave(col, def)
  const started = def.shards ? have > 0 : got
  // 套組：集齊 = 完整紙張；沒集齊 = 完整紙張的剪影（用同一張圖）
  const paper = def.id === 'U002' ? 'paper_dog' : 'paper_cat'
  const frame = def.shards ? paper : def.icon
  return (
    <div data-testid={`item-${def.id}`} data-collected={got || undefined} className="relative flex flex-col items-center rounded-sm border-2 border-[#3b2a1c]/60 bg-[#fffdf4] px-1.5 pb-1.5 pt-1">
      {def.pool !== 'both' && <span className="absolute right-0.5 top-0.5 border border-[#8a5a2b]/60 bg-[#f2dca8] px-1 text-[9px] leading-tight text-[#5a3410]">{POOL_LABEL[def.pool]}</span>}
      <div className="flex h-[100px] items-center justify-center">
        <PixelSprite frame={frame} scale={def.shards ? 1 : 2} silhouette={!(def.shards ? got : started)} title={started ? def.name : '？？？'} />
      </div>
      <div className="mt-0.5 text-center text-xs font-bold leading-tight" data-testid={`item-name-${def.id}`}>
        {started ? def.name : '？？？'}
      </div>
      {def.shards && <div className="text-[11px] font-bold tabular-nums text-[#8a5a2b]" data-testid={`item-shards-${def.id}`}>{have}／{def.shards}</div>}
      {started && <div className="mt-0.5 text-center text-[10px] leading-snug text-[#5a3410]">{def.desc}</div>}
      {started && <div className="mt-0.5 text-[11px] font-bold tabular-nums text-[#8a5a2b]">×{total}</div>}
    </div>
  )
}

/** 外觀圖集（skins）是解鎖之後才載入的：需要彩色縮圖時才載入，載入失敗或還沒載入完就一直是剪影（不報錯） */
function useSkinsLoaded(needed: boolean, group: string): boolean {
  const [loaded, setLoaded] = useState(assets.groupLoaded(group))
  useEffect(() => {
    if (!needed || loaded) return
    let alive = true
    assets.loadGroup(group).then(() => alive && setLoaded(true), () => {})
    return () => {
      alive = false
    }
  }, [needed, loaded, group])
  return loaded
}

function RewardCard({ species, unlocked }: { species: 'dog' | 'cat'; unlocked: boolean }) {
  const skin = skinDef(species === 'dog' ? 'house.gold' : 'tower.gold')
  const color = useSkinsLoaded(unlocked, SKIN_ATLAS[skin?.part ?? (species === 'dog' ? 'house' : 'tower')])
  // 已解鎖而且 skins 已載入：彩色縮圖；其他情況：預先烘好的剪影（放在 items 圖集，不需要 skins）
  return (
    <div data-testid={`reward-${species}`} data-unlocked={unlocked || undefined} className="relative flex flex-col items-center rounded-sm border-2 border-dashed border-[#3b2a1c]/50 bg-[#f6efd8] px-1.5 pb-1.5 pt-1">
      <span className="absolute right-0.5 top-0.5 border border-[#8a5a2b]/60 bg-[#f2dca8] px-1 text-[9px] leading-tight text-[#5a3410]">{POOL_LABEL[species]}</span>
      <div className="flex h-[100px] items-center justify-center">
        {unlocked && color && skin ? (
          <span data-testid={`reward-color-${species}`}>
            <PixelSprite frame={skin.frames.closed} scale={2} fit={96} title={skin.name} />
          </span>
        ) : (
          <PixelSprite frame={REWARD_SILHOUETTE[species]} scale={2} silhouette={false} title="獎勵剪影" />
        )}
      </div>
      <div className="mt-0.5 text-center text-xs font-bold leading-tight">{unlocked ? skin?.name : '獎勵：？？？'}</div>
      <div className="text-[10px] text-[#5a3410]">{unlocked ? '已解鎖' : '傳說寶物的獎勵'}</div>
    </div>
  )
}

export function CollectionDialog() {
  const open = useUIStore((s) => s.collectionOpen)
  const setOpen = useUIStore((s) => s.setCollectionOpen)
  const col = useFarmStore((s) => s.save?.collection)
  const events = useFarmStore((s) => s.save?.events)
  const hasSave = useFarmStore((s) => s.save !== null)

  useEffect(() => {
    if (!open) return
    void assets.load().catch(() => {})
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null
  const c: Collection = col ?? {}
  const done = ITEMS.filter((d) => isCollected(c, d)).length
  const rarityOf = (r: Rarity): ItemDef[] => ITEMS.filter((d) => d.rarity === r)
  return (
    <div className="fixed inset-0 z-[9900] flex items-center justify-center bg-black/35 p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-label="收藏冊" data-testid="collection-dialog" className="px-panel flex max-h-[88vh] w-full max-w-[860px] flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b-2 border-[#3b2a1c]/40 px-3 py-2">
          <div className="text-base font-bold">
            收藏冊 <span className="ml-2 text-xs font-normal tabular-nums text-[#8a5a2b]" data-testid="collection-progress">已收集 {done}／{ITEMS.length}</span>
            <RewardBadge testId="reward-badge-all" coins={ALL_REWARD.coins} got={events?.[ALL_REWARD.id] !== undefined} label="全部集齊獎勵" />
          </div>
          <button type="button" aria-label="關閉" data-testid="collection-close" className="px-btn px-2 py-0.5 text-sm" onClick={() => setOpen(false)}>
            關閉
          </button>
        </div>
        <div className="overflow-y-auto px-3 pb-3">
          {!hasSave && <div className="py-6 text-center text-sm">還沒有養殖場存檔，領養寵物之後，挖寶與尋寶找到的寶物會收在這裡。</div>}
          {RARITIES.map((r) => {
            const list = rarityOf(r)
            return (
              <section key={r} className="mt-3" data-testid={`rarity-${r}`}>
                <h3 className="mb-1.5 text-sm font-bold">
                  {RARITY_LABEL[r]} <span className="text-xs font-normal tabular-nums text-[#8a5a2b]">{list.filter((d) => isCollected(c, d)).length}／{list.length}</span>
                  <RewardBadge testId={`reward-badge-${r}`} coins={RARITY_REWARD[r].coins} got={events?.[RARITY_REWARD[r].id] !== undefined} />
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2">
                  {list.map((d) => (
                    <Card key={d.id} def={d} col={c} />
                  ))}
                  {r === 'legendary' && (
                    <>
                      <RewardCard species="dog" unlocked={events?.dogVault !== undefined} />
                      <RewardCard species="cat" unlocked={events?.catAtlantis !== undefined} />
                    </>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
