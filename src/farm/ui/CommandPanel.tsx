import { useEffect, useMemo, useState } from 'react'
import { useClock } from '../../hooks/useClock'
import { SPECIES, SPECIES_LIST, type SpeciesId } from '../config/species'
import { worldHour } from '../overrides'
import { adoptCheck } from '../sim/rules'
import { listActions, listTargets, type ActionId } from '../sim/commands'
import { useFarmStore } from '../store/farmStore'

const sel =
  'w-full rounded-lg border border-white/20 bg-slate-800/80 px-2 py-1.5 text-sm text-white outline-none focus:border-amber-300 disabled:opacity-50'

/** 左上角的浮動指令面板：先選動作，再選對象，顯示消耗點數，按「執行」 */
export function CommandPanel() {
  const save = useFarmStore((s) => s.save)
  const runAction = useFarmStore((s) => s.runAction)
  const adoptPet = useFarmStore((s) => s.adoptPet)
  const now = useClock() // 每分鐘更新一次，讓睡覺狀態等條件跟著時間變化

  const [open, setOpen] = useState(true)
  const [action, setAction] = useState<ActionId>('feed')
  const [target, setTarget] = useState('')
  const [species, setSpecies] = useState<SpeciesId>('dog')
  const [coat, setCoat] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  // 睡覺等條件依時間而定：存檔變動或每分鐘重新計算
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => ({ nowMs: Date.now(), hour: worldHour(Date.now()) }), [now, save])
  const actions = useMemo(() => (save ? listActions(save, ctx) : []), [save, ctx])
  const targets = useMemo(() => (save && action !== 'adopt' ? listTargets(save, action, ctx) : []), [save, action, ctx])

  // 選到不能用的動作時，改成第一個可用的（沒有就停在領養）
  useEffect(() => {
    const cur = actions.find((a) => a.id === action)
    if (cur && !cur.disabledReason) return
    const first = actions.find((a) => !a.disabledReason)
    if (first) setAction(first.id)
  }, [actions, action])

  // 對象：保持目前選擇，不可用時換成第一個可用的
  useEffect(() => {
    if (action === 'adopt') return
    const cur = targets.find((t) => t.id === target)
    if (cur && !cur.disabledReason) return
    setTarget(targets.find((t) => !t.disabledReason)?.id ?? '')
  }, [targets, target, action])

  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(null), 3500)
    return () => window.clearTimeout(t)
  }, [message])

  if (!save) return null

  const def = SPECIES[species]
  const current = actions.find((a) => a.id === action)
  const cost = action === 'adopt' ? def.cost : (current?.cost ?? 0)
  const adoptState = adoptCheck(save, species)
  const canRun = action === 'adopt' ? adoptState.ok : Boolean(current && !current.disabledReason && target)

  const changeSpecies = (id: SpeciesId) => {
    setSpecies(id)
    setCoat(SPECIES[id].coats?.[0].id ?? '')
  }

  const run = () => {
    if (action === 'adopt') {
      const finalName = name.trim() || def.nameIdeas[0]
      const err = adoptPet({ species, coat: def.coats ? coat || def.coats[0].id : undefined, name: finalName })
      setMessage(err ? { text: err, ok: false } : { text: `已領養「${finalName}」！`, ok: true })
      if (!err) setName('')
      return
    }
    const err = runAction(action, target)
    setMessage(err ? { text: err, ok: false } : null)
  }

  return (
    <div
      className="absolute left-3 top-3 z-20 w-[264px] rounded-2xl border border-white/25 bg-slate-900/75 text-white shadow-xl backdrop-blur-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm font-semibold"
        aria-expanded={open}
      >
        <span>🐾 指令面板</span>
        <span className="text-xs text-white/60">{open ? '▾ 收合' : '▸ 展開'}</span>
      </button>

      {open && (
        <div className="space-y-2.5 px-3 pb-3">
          <label className="block text-xs text-white/65">
            動作
            <select className={`${sel} mt-1`} value={action} onChange={(e) => setAction(e.target.value as ActionId)}>
              {actions.map((a) => (
                <option key={a.id} value={a.id} disabled={Boolean(a.disabledReason)}>
                  {a.label}
                  {a.disabledReason ? `（${a.disabledReason}）` : ''}
                </option>
              ))}
            </select>
          </label>

          {action !== 'adopt' && (
            <label className="block text-xs text-white/65">
              對象
              <select className={`${sel} mt-1`} value={target} onChange={(e) => setTarget(e.target.value)} disabled={targets.length === 0}>
                {targets.length === 0 && <option value="">（沒有可選的對象）</option>}
                {targets.map((t) => (
                  <option key={t.id} value={t.id} disabled={Boolean(t.disabledReason)}>
                    {t.label}
                    {t.disabledReason ? `（${t.disabledReason}）` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {action === 'adopt' && (
            <>
              <label className="block text-xs text-white/65">
                種類
                <select className={`${sel} mt-1`} value={species} onChange={(e) => changeSpecies(e.target.value as SpeciesId)}>
                  {SPECIES_LIST.map((s) => {
                    const c = adoptCheck(save, s.id)
                    return (
                      <option key={s.id} value={s.id} disabled={!c.ok}>
                        {s.emoji} {s.name}（{s.cost} 點{s.slots > 1 ? `・${s.slots} 格` : ''}
                        {s.groupSize > 1 ? `・${s.groupSize} 隻` : ''}）{c.ok ? '' : ` — ${c.reason}`}
                      </option>
                    )
                  })}
                </select>
              </label>
              {def.coats && (
                <label className="block text-xs text-white/65">
                  毛色
                  <select className={`${sel} mt-1`} value={coat || def.coats[0].id} onChange={(e) => setCoat(e.target.value)}>
                    {def.coats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block text-xs text-white/65">
                名字
                <input
                  className={`${sel} mt-1`}
                  value={name}
                  maxLength={12}
                  placeholder={def.nameIdeas[0]}
                  onChange={(e) => setName(e.target.value)}
                  style={{ userSelect: 'text' }}
                />
              </label>
              {!adoptState.ok && <div className="text-xs text-rose-300">{adoptState.reason}</div>}
            </>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="text-white/65">
              消耗 <b className="text-amber-300">{cost}</b> 點（目前 {save.points} 點）
            </span>
          </div>
          <button
            type="button"
            disabled={!canRun}
            onClick={run}
            className="w-full rounded-full bg-gradient-to-b from-amber-300 to-orange-500 py-1.5 text-sm font-bold text-slate-900 shadow hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-500 disabled:to-slate-600 disabled:text-white/50"
          >
            執行
          </button>
          {message && <div className={`text-xs ${message.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{message.text}</div>}
        </div>
      )}
    </div>
  )
}
