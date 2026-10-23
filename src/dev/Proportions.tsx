import { useEffect, useRef, useState } from 'react'
import { SPECIES } from '../farm/config/species'
import { assets, drawSprite } from '../farm/pixel/assets'

/** PROPORTIONS_MARKER：比例對照圖（測試模式的一部分，只在開發環境載入，正式 build 不包含）。
 *  12 隻動物的站姿由大到小並排，旁邊是住家、樹、鐘樓、路燈，全部同一條地平線、同一個像素比例 */

interface Item {
  key: string
  label: string
  group: 'dog' | 'cat' | 'obj'
}

function buildItems(): Item[] {
  const animals: Item[] = []
  for (const sp of ['dog', 'cat'] as const)
    for (const v of SPECIES[sp].variants) animals.push({ key: `${sp}_${v.assetKey}_stand`, label: v.name, group: sp })
  const h = (i: Item): number => assets.get(i.key)?.h ?? 0
  const dogs = animals.filter((a) => a.group === 'dog').sort((a, b) => h(b) - h(a))
  const cats = animals.filter((a) => a.group === 'cat').sort((a, b) => h(b) - h(a))
  const objs: Item[] = [
    { key: 'lamp', label: '路燈', group: 'obj' },
    { key: 'tree', label: '樹', group: 'obj' },
    { key: 'house_closed', label: '住家', group: 'obj' },
    { key: 'clocktower', label: '鐘樓', group: 'obj' },
  ]
  return [...dogs, ...cats, ...objs]
}

export default function Proportions({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const [ready, setReady] = useState(assets.ready)
  useEffect(() => {
    if (!assets.ready) void assets.load().then(() => setReady(true))
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || !ready) return
    const all = buildItems()
    // 兩列、同一個像素比例：上面是 12 隻動物的站姿（狗、貓各由大到小），下面是路燈、樹、住家、鐘樓
    const rows = [all.filter((i) => i.group !== 'obj'), all.filter((i) => i.group === 'obj')]
    const GAP = 10
    const rowW = (r: Item[]): number => r.reduce((t, i) => t + (assets.get(i.key)?.w ?? 0) + GAP, GAP) + 16
    const rowH = (r: Item[]): number => Math.max(...r.map((i) => assets.get(i.key)?.h ?? 0)) + 26
    const W = Math.max(...rows.map(rowW))
    const H = rows.reduce((t, r) => t + rowH(r), 0)
    // 整數倍放大，盡量撐滿視窗
    const S = Math.max(1, Math.floor(Math.min(window.innerWidth / W, (window.innerHeight - 60) / H)))
    c.width = W * S
    c.height = H * S
    c.style.width = `${W * S}px`
    c.style.height = `${H * S}px`
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(S, 0, 0, S, 0, 0)
    let top = 0
    for (const items of rows) {
      const rh = rowH(items)
      const ground = top + rh - 24
      ctx.fillStyle = '#9fd0f0'
      ctx.fillRect(0, top, W, rh)
      ctx.fillStyle = '#6fb34a'
      ctx.fillRect(0, ground, W, rh - (ground - top))
      // 高度參考線：每 10 像素一條
      ctx.fillStyle = 'rgba(0,0,0,0.13)'
      for (let y = ground - 10; y > top; y -= 10) ctx.fillRect(0, y, W, 1)
      let x = GAP + 8
      ctx.font = '7px sans-serif'
      ctx.textAlign = 'center'
      for (const it of items) {
        const sp = assets.get(it.key)
        if (!sp) continue
        drawSprite(ctx, sp, x + sp.w / 2, ground + 1)
        ctx.fillStyle = '#10202e'
        ctx.fillText(it.label, x + sp.w / 2, ground + 9)
        ctx.fillStyle = '#244018'
        ctx.fillText(`${sp.w}×${sp.h}`, x + sp.w / 2, ground + 18)
        x += sp.w + GAP
      }
      top += rh
    }
  }, [ready])

  return (
    <div className="fixed inset-0 z-[9700] flex flex-col bg-slate-800 text-white" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2 text-sm">
        <b className="text-fuchsia-300">📏 比例對照圖（測試模式）</b>
        <span className="text-white/60">12 隻動物的站姿（狗、貓各由大到小）與路燈、樹、住家、鐘樓，同一個像素比例，格線每 10 像素</span>
        <button className="ml-auto rounded-full bg-slate-600 px-3 py-1 text-xs" onClick={onClose}>
          關閉 ✕
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-2">
        <canvas ref={ref} data-testid="proportions" style={{ imageRendering: 'pixelated' }} />
      </div>
    </div>
  )
}
