import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { creatureBox, drawCreature, hasArt } from '../farm/art'
import { makeLook, type Look } from '../farm/art/look'
import { SPECIES, SPECIES_LIST, type SpeciesId } from '../farm/config/species'
import { fatness, stageScale } from '../farm/sim/stats'

/** BESTIARY_MARKER：生物圖鑑（測試模式的一部分，只在開發環境載入，正式 build 不包含） */

// ---- 共用的動畫時鐘：所有小畫布共用一個 rAF ----
interface Clock {
  subscribe: (fn: (t: number) => void) => () => void
}
const ClockCtx = createContext<Clock | null>(null)

function useClockProvider(animate: boolean): Clock {
  const subs = useRef(new Set<(t: number) => void>())
  const t = useRef(0.8)
  const animRef = useRef(animate)
  animRef.current = animate
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (!animRef.current) {
        last = now
        return
      }
      t.current += (now - last) / 1000
      last = now
      subs.current.forEach((f) => f(t.current))
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  // 停止動畫時固定在好看的姿勢（t=0.8），再通知大家重畫一次
  useEffect(() => {
    if (!animate) {
      t.current = 0.8
      subs.current.forEach((f) => f(0.8))
    }
  }, [animate])
  return useRef<Clock>({
    subscribe: (fn) => {
      subs.current.add(fn)
      fn(t.current)
      return () => subs.current.delete(fn)
    },
  }).current
}

interface CellProps {
  species: SpeciesId
  variant?: string
  look: Partial<Look>
  facing: 1 | -1
  w: number
  h: number
  /** 固定尺寸模式：生物外框的最長邊縮放成這麼多像素（48px 總覽用） */
  fixedPx?: number
  label?: string
}

function Cell({ species, variant, look, facing, w, h, fixedPx, label }: CellProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const clock = useContext(ClockCtx)!
  const lookRef = useRef(look)
  lookRef.current = look

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const sea = SPECIES[species].domain === 'sea'
    const draw = (t: number) => {
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const box = creatureBox(species, variant)
      const bw = box.x1 - box.x0
      const bh = box.y1 - box.y0
      const fit = fixedPx ? fixedPx / Math.max(bw, bh) : Math.min((w - 24) / bw, (h - 30) / bh)
      const L = makeLook(species, variant, { ...lookRef.current, facing, t })
      const stageK = L.stage === 'young' ? stageScale('young') : 1
      const k = fit * stageK
      // 面向左時整體鏡射，外框中心也要跟著反向
      const cx = ((box.x0 + box.x1) / 2) * L.facing
      ctx.save()
      if (sea) {
        ctx.translate(w / 2, h / 2)
        ctx.scale(k, k)
        ctx.translate(-cx, -(box.y0 + box.y1) / 2)
      } else {
        // 陸地：腳底對齊同一條地面線
        const ground = fixedPx ? h * 0.9 : h - 16
        ctx.fillStyle = 'rgba(0,0,0,0.08)'
        ctx.beginPath()
        ctx.ellipse(w / 2, ground + 2, bw * fit * 0.4, Math.max(2, 5 * fit), 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.translate(w / 2, ground)
        ctx.scale(k, k)
        ctx.translate(-cx, -box.y1)
        ctx.translate(0, 0)
      }
      drawCreature(ctx, L)
      ctx.restore()
    }
    return clock.subscribe(draw)
  }, [species, variant, facing, w, h, fixedPx, clock, look])

  return (
    <div className="flex flex-col items-center">
      <canvas ref={ref} style={{ width: w, height: h }} className="rounded-lg bg-gradient-to-b from-sky-100 to-sky-200" />
      {label && <div className="mt-0.5 text-[11px] text-slate-600">{label}</div>}
    </div>
  )
}

const SEA_CELLS: { label: string; look: Partial<Look> }[] = [
  { label: '成年', look: {} },
  { label: '幼年', look: { stage: 'young' } },
  { label: '瘦', look: { fat: fatness(0) } },
  { label: '胖', look: { fat: fatness(100) } },
  { label: '睡覺（休息）', look: { sleeping: true } },
]
const DOG_CELLS: { label: string; look: Partial<Look> }[] = [
  { label: '成年', look: {} },
  { label: '幼年', look: { stage: 'young' } },
  { label: '瘦', look: { fat: fatness(0) } },
  { label: '胖', look: { fat: fatness(100) } },
  { label: '坐姿', look: { pose: 'sit' } },
  { label: '睡覺', look: { pose: 'lie', sleeping: true } },
]
const CAT_CELLS = [...DOG_CELLS, { label: '伸懶腰', look: { pose: 'stretch' } as Partial<Look> }]

function Row({ title, species, variant, cells, facing }: { title: string; species: SpeciesId; variant?: string; cells: typeof SEA_CELLS; facing: 1 | -1 }) {
  return (
    <div className="mb-3 rounded-xl bg-white/80 p-2 shadow">
      <div className="mb-1 flex items-baseline gap-2 text-sm font-bold text-slate-800">
        {title}
        {!hasArt(species) && <span className="text-xs font-normal text-rose-600">（尚未繪製）</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {cells.map((c) => (
          <Cell key={c.label} species={species} variant={variant} look={c.look} facing={facing} w={176} h={150} label={c.label} />
        ))}
      </div>
    </div>
  )
}

type Tab = 'sea' | 'dog' | 'cat' | 'overview'

export default function Bestiary({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('sea')
  const [facing, setFacing] = useState<1 | -1>(1)
  const [animate, setAnimate] = useState(false)
  const clock = useClockProvider(animate)

  const seaList = SPECIES_LIST.filter((s) => s.domain === 'sea')
  const btn = (on: boolean) => `rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-fuchsia-600 text-white' : 'bg-white/70 text-slate-700 hover:bg-white'}`

  let body: ReactNode
  if (tab === 'sea') {
    body = seaList.map((s) => <Row key={s.id} title={`${s.emoji} ${s.name}`} species={s.id} cells={SEA_CELLS} facing={facing} />)
  } else if (tab === 'dog') {
    body = SPECIES.dog.variants!.map((v) => <Row key={v.id} title={`🐶 ${v.name}（體型 ${v.sizeClass}）`} species="dog" variant={v.id} cells={DOG_CELLS} facing={facing} />)
  } else if (tab === 'cat') {
    body = SPECIES.cat.variants!.map((v) => <Row key={v.id} title={`🐱 ${v.name}`} species="cat" variant={v.id} cells={CAT_CELLS} facing={facing} />)
  } else {
    // 48px 小尺寸總覽：所有生物（海洋 6、狗 6、貓 6）並排，每個的最長邊 48px
    const all: { name: string; species: SpeciesId; variant?: string }[] = [
      ...seaList.map((s) => ({ name: s.name, species: s.id })),
      ...SPECIES.dog.variants!.map((v) => ({ name: v.name, species: 'dog' as SpeciesId, variant: v.id })),
      ...SPECIES.cat.variants!.map((v) => ({ name: v.name, species: 'cat' as SpeciesId, variant: v.id })),
    ]
    body = (
      <div id="bestiary-overview" className="inline-flex flex-wrap gap-1 rounded-xl bg-white/80 p-3" style={{ maxWidth: 760 }}>
        {all.map((c) => (
          <Cell key={c.species + (c.variant ?? '')} species={c.species} variant={c.variant} look={{}} facing={facing} w={60} h={64} fixedPx={48} label={c.name} />
        ))}
      </div>
    )
  }

  return (
    <ClockCtx.Provider value={clock}>
      <div className="fixed inset-0 z-[9700] flex flex-col bg-gradient-to-b from-slate-200 to-slate-300 text-slate-900" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-2 border-b border-black/10 bg-white/60 px-4 py-2">
          <b className="mr-2 text-fuchsia-700">🐾 生物圖鑑（測試模式）</b>
          {([['sea', '海洋 6 種'], ['dog', '狗 6 品種'], ['cat', '貓 6 種花色／品種'], ['overview', '48px 總覽']] as const).map(([k, label]) => (
            <button key={k} className={btn(tab === k)} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
          <span className="mx-2 text-slate-400">|</span>
          <button className={btn(facing === 1)} onClick={() => setFacing(1)}>
            面向右
          </button>
          <button className={btn(facing === -1)} onClick={() => setFacing(-1)}>
            面向左
          </button>
          <label className="ml-2 flex items-center gap-1 text-xs">
            <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
            播放動畫
          </label>
          <button className="ml-auto rounded-full bg-slate-700 px-3 py-1 text-xs text-white" onClick={onClose}>
            關閉 ✕
          </button>
        </div>
        <div id="bestiary-body" className="flex-1 overflow-y-auto p-4">
          {body}
        </div>
      </div>
    </ClockCtx.Provider>
  )
}
