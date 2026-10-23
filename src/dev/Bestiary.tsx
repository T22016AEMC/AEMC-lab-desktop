import { useEffect, useState } from 'react'
import { SPECIES } from '../farm/config/species'
import { assets } from '../farm/pixel/assets'
import { PixelSprite } from '../farm/ui/PixelSprite'

/** BESTIARY_MARKER：生物圖鑑（測試模式的一部分，只在開發環境載入，正式 build 不包含） */

type Tab = 'dog' | 'cat'

export default function Bestiary({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('dog')
  const [dark, setDark] = useState(false)
  const [scale, setScale] = useState(3)
  const [, setReady] = useState(assets.ready)
  useEffect(() => {
    if (!assets.ready) void assets.load().then(() => setReady(true))
  }, [])
  const btn = (on: boolean) => `rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-fuchsia-600 text-white' : 'bg-white/70 text-slate-700 hover:bg-white'}`

  return (
    <div className="fixed inset-0 z-[9700] flex flex-col bg-gradient-to-b from-slate-200 to-slate-300 text-slate-900" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2 border-b border-black/10 bg-white/60 px-4 py-2">
        <b className="mr-2 text-fuchsia-700">🐾 生物圖鑑（測試模式）</b>
        {(['dog', 'cat'] as const).map((k) => (
          <button key={k} className={btn(tab === k)} onClick={() => setTab(k)}>
            {k === 'dog' ? '狗 6 品種' : '貓 6 種花色／品種'}
          </button>
        ))}
        <span className="mx-2 text-slate-400">|</span>
        <button className={btn(!dark)} onClick={() => setDark(false)}>
          淺色背景
        </button>
        <button className={btn(dark)} onClick={() => setDark(true)}>
          深色背景
        </button>
        <label className="ml-2 flex items-center gap-1 text-xs">
          放大
          <select value={scale} onChange={(e) => setScale(Number(e.target.value))} className="rounded bg-white px-1">
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}×
              </option>
            ))}
          </select>
        </label>
        <button className="ml-auto rounded-full bg-slate-700 px-3 py-1 text-xs text-white" onClick={onClose}>
          關閉 ✕
        </button>
      </div>
      <div id="bestiary-body" className="flex-1 overflow-y-auto p-4">
        {assets.ready &&
          SPECIES[tab].variants.map((v) => {
            const prefix = `${tab}_${v.assetKey}`
            const keys = assets.keys().filter((k) => k.startsWith(prefix + '_'))
            return (
              <div key={v.id} className="mb-3 rounded-xl bg-white/80 p-2 shadow" data-variant={v.id}>
                <div className="mb-1 text-sm font-bold text-slate-800">
                  {SPECIES[tab].emoji} {v.name}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {keys.length} 張（含正面照 front_{prefix}）
                  </span>
                </div>
                <div className="flex flex-wrap items-end gap-3 p-2" style={{ background: dark ? '#222430' : '#eeeee8' }}>
                  <div className="flex flex-col items-center">
                    <PixelSprite frame={`front_${tab}_${v.assetKey}`} scale={scale} />
                    <span className="mt-0.5 text-[10px] text-slate-500">front</span>
                  </div>
                  {keys.map((k) => (
                    <div key={k} className="flex flex-col items-center">
                      <PixelSprite frame={k} scale={scale} />
                      <span className={`mt-0.5 text-[10px] ${assets.get(k)?.unused ? 'text-rose-500' : 'text-slate-500'}`}>
                        {k.slice(prefix.length + 1)}
                        {assets.get(k)?.unused ? '（不使用）' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
