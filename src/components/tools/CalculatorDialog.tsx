import { useRef, useState } from 'react'
import { TOOLS } from '../../config/tools'
import { useUIStore } from '../../store/uiStore'
import { CALC_ERRORS, backspace, endsWithValue, evaluate, formatNumber, type AngleMode } from '../../tools/calc'
import { copyText } from './copyText'
import { ToolDialog } from './ToolDialog'

/**
 * 科學計算機（v3.7.0）。計算由 tools/calc.ts 的純函式負責（自己寫的解析器，不用 eval）。
 * 狀態只在這個視窗開著的期間：關閉就清空（算式、結果、記憶 M、歷史紀錄）。
 * 鍵盤：數字、+ - * / ^ ( ) ! . e、Enter 或 = 計算、Backspace 退格、Delete 清除、Esc 關閉；視窗開著時按鍵不會傳到其他地方（見 ToolDialog）。
 */

type Out = { kind: 'result'; value: number; text: string } | { kind: 'error'; message: string } | null
interface HistoryItem {
  id: number
  expr: string
  text: string
}

/** 插入的種類：決定「剛算完」之後要接著算（運算符接在結果後面）還是開始新的算式 */
type Kind = 'digit' | 'op' | 'postfix' | 'open' | 'close' | 'const'

let historySeq = 0

const TONE_BG = { num: '#fffdf4', fn: '#e8f1d8', mem: '#e3e8f4', warn: '#f6c9a8', eq: '#f0a33a', op: undefined } as const

/** 一個按鍵（放在元件外面：每次重畫不會重新建立按鈕） */
function K({ label, onClick, tone = 'num', wide = false, testid, title }: { label: string; onClick: () => void; tone?: keyof typeof TONE_BG; wide?: boolean; testid?: string; title?: string }) {
  const bg = TONE_BG[tone]
  return (
    <button type="button" data-testid={testid} title={title} onClick={onClick} className={`px-btn h-9 select-none text-sm ${wide ? 'col-span-2' : ''}`} style={bg ? { background: bg } : undefined}>
      {label}
    </button>
  )
}

export function CalculatorDialog() {
  const setToolOpen = useUIStore((s) => s.setToolOpen)
  const [expr, setExpr] = useState('')
  const [out, setOut] = useState<Out>(null)
  /** 剛按完 =：下一個輸入是數字就開新算式、是運算符就接在結果後面 */
  const [fresh, setFresh] = useState(false)
  const [mode, setMode] = useState<AngleMode>('deg')
  const [memory, setMemory] = useState(0)
  const [history, setHistory] = useState<HistoryItem[]>([])
  // 鍵盤處理函式在 ToolDialog 的 effect 裡只註冊一次，所以讀最新狀態要經過 ref
  const st = useRef({ expr, out, fresh, mode, memory })
  st.current = { expr, out, fresh, mode, memory }

  const setExprSafe = (next: string): void => {
    if (next.length <= TOOLS.calc.exprMaxLength) setExpr(next)
  }

  const insert = (token: string, kind: Kind): void => {
    const s = st.current
    if (s.fresh) {
      setFresh(false)
      setOut(null)
      if (s.out?.kind === 'result' && (kind === 'op' || kind === 'postfix')) setExprSafe(s.out.text + token)
      else setExprSafe(token)
      return
    }
    if (s.out?.kind === 'error') setOut(null)
    setExprSafe(s.expr + token)
  }

  /** 常數 e 接在數字後面要補乘號（否則 2e3 會變成科學記號） */
  const insertE = (): void => insert(!st.current.fresh && /[0-9.]$/.test(st.current.expr) ? '×e' : 'e', 'const')
  /** 科學記號的 e（EE 鍵）：只接在數字後面 */
  const insertExp = (): void => {
    if (!st.current.fresh && /[0-9]$/.test(st.current.expr)) insert('e', 'digit')
  }
  /** 把一個數值放進算式：接在數字或右括號後面要補乘號 */
  const insertValue = (v: number): void => {
    const text = formatNumber(v)
    const s = st.current
    if (s.fresh || s.expr === '') {
      setFresh(false)
      setOut(null)
      setExprSafe(text)
    } else setExprSafe(s.expr + (endsWithValue(s.expr) ? '×' : '') + text)
  }

  const run = (): void => {
    const s = st.current
    if (s.fresh || s.expr.trim() === '') return
    const r = evaluate(s.expr, s.mode)
    if (r.ok) {
      setOut({ kind: 'result', value: r.value, text: r.text })
      setFresh(true)
      setHistory((h) => [{ id: ++historySeq, expr: s.expr, text: r.text }, ...h].slice(0, TOOLS.calc.historyMax))
    } else setOut({ kind: 'error', message: r.error })
  }

  const back = (): void => {
    const s = st.current
    setFresh(false)
    setOut(null)
    setExpr(backspace(s.expr))
  }

  const clear = (): void => {
    setExpr('')
    setOut(null)
    setFresh(false)
  }

  /** M+／M−：用目前的結果（剛算完）或把算式算一次 */
  const currentValue = (): number | null => {
    const s = st.current
    if (s.fresh && s.out?.kind === 'result') return s.out.value
    if (s.expr.trim() === '') return null
    const r = evaluate(s.expr, s.mode)
    if (!r.ok) {
      setOut({ kind: 'error', message: r.error })
      return null
    }
    return r.value
  }
  const memAdd = (sign: 1 | -1): void => {
    const v = currentValue()
    if (v === null) return
    const next = st.current.memory + sign * v
    if (!Number.isFinite(next)) {
      setOut({ kind: 'error', message: CALC_ERRORS.overflow })
      return
    }
    setMemory(Number(next.toPrecision(15)))
  }

  const copy = async (): Promise<void> => {
    const o = st.current.out
    if (o?.kind !== 'result') return
    const ok = await copyText(o.text)
    useUIStore.getState().showToast(ok ? `已複製 ${o.text}` : '無法複製（瀏覽器不允許）')
  }

  const onKey = (e: KeyboardEvent): boolean => {
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    const k = e.key
    if (/^[0-9]$/.test(k) || k === '.') insert(k, 'digit')
    else if (k === '+' || k === '-') insert(k, 'op')
    else if (k === '*' || k === 'x' || k === 'X') insert('×', 'op')
    else if (k === '/') insert('÷', 'op')
    else if (k === '^') insert('^', 'op')
    else if (k === '(') insert('(', 'open')
    else if (k === ')') insert(')', 'close')
    else if (k === '!') insert('!', 'postfix')
    else if (k === 'e' || k === 'E') insert('e', /[0-9]$/.test(st.current.expr) && !st.current.fresh ? 'digit' : 'const')
    else if (k === 'Enter' || k === '=') run()
    else if (k === 'Backspace') back()
    else if (k === 'Delete') clear()
    else return false
    return true
  }

  const fn = (name: string) => () => insert(name + '(', 'open')

  return (
    <ToolDialog id="calc" title="計算機" icon="tool_calc" width={600} onClose={() => setToolOpen(null)} onKey={onKey}>
      <div className="px-3 pb-3 pt-2">
        {/* 顯示區：算式、結果或錯誤訊息、角度／弧度、記憶 */}
        <div className="border-2 border-[#3b2a1c] bg-[#e9f6dc] px-2 py-1.5 font-mono" data-testid="calc-display">
          <div className="flex items-center justify-between text-[11px] font-bold text-[#5a6b4a]">
            <span data-testid="calc-mode-label">{mode === 'deg' ? 'DEG 角度' : 'RAD 弧度'}</span>
            <span data-testid="calc-memory">{memory !== 0 ? `M = ${formatNumber(memory)}` : ''}</span>
          </div>
          <div className="min-h-[24px] break-all text-right text-base text-[#3b2a1c]" data-testid="calc-expr">
            {expr || '0'}
          </div>
          <div className={`min-h-[30px] break-all text-right text-xl font-bold ${out?.kind === 'error' ? 'text-[#c0392b]' : 'text-[#1f2a14]'}`} data-testid="calc-result" role="status">
            {out?.kind === 'result' ? `= ${out.text}` : out?.kind === 'error' ? out.message : ''}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <div className="flex" role="group" aria-label="角度單位">
            <button type="button" data-testid="calc-deg" aria-pressed={mode === 'deg'} onClick={() => setMode('deg')} className={`px-btn px-2 py-0.5 ${mode === 'deg' ? '' : 'opacity-60'}`} style={mode === 'deg' ? undefined : { background: '#fffdf4' }}>
              角度
            </button>
            <button type="button" data-testid="calc-rad" aria-pressed={mode === 'rad'} onClick={() => setMode('rad')} className={`px-btn ml-1 px-2 py-0.5 ${mode === 'rad' ? '' : 'opacity-60'}`} style={mode === 'rad' ? undefined : { background: '#fffdf4' }}>
              弧度
            </button>
          </div>
          <button type="button" data-testid="calc-copy" disabled={out?.kind !== 'result'} onClick={() => void copy()} className="px-btn ml-auto px-2 py-0.5">
            複製結果
          </button>
        </div>

        {/* 按鍵：左邊科學函數與記憶，右邊數字與四則運算 */}
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="grid grid-cols-4 gap-1.5">
            <K label="sin" tone="fn" onClick={fn('sin')} testid="calc-sin" />
            <K label="cos" tone="fn" onClick={fn('cos')} testid="calc-cos" />
            <K label="tan" tone="fn" onClick={fn('tan')} testid="calc-tan" />
            <K label="π" tone="fn" onClick={() => insert('π', 'const')} testid="calc-pi" />
            <K label="sin⁻¹" tone="fn" onClick={fn('asin')} testid="calc-asin" />
            <K label="cos⁻¹" tone="fn" onClick={fn('acos')} testid="calc-acos" />
            <K label="tan⁻¹" tone="fn" onClick={fn('atan')} testid="calc-atan" />
            <K label="e" tone="fn" onClick={insertE} testid="calc-e" />
            <K label="log" tone="fn" onClick={fn('log')} testid="calc-log" title="以 10 為底的對數" />
            <K label="ln" tone="fn" onClick={fn('ln')} testid="calc-ln" title="自然對數" />
            <K label="eˣ" tone="fn" onClick={() => insert(st.current.fresh || !endsWithValue(st.current.expr) ? 'e^(' : '×e^(', 'open')} testid="calc-exp" />
            <K label="√" tone="fn" onClick={() => insert('√(', 'open')} testid="calc-sqrt" />
            <K label="xʸ" tone="fn" onClick={() => insert('^', 'op')} testid="calc-pow" />
            <K label="n!" tone="fn" onClick={() => insert('!', 'postfix')} testid="calc-fact" />
            <K label="(" tone="fn" onClick={() => insert('(', 'open')} testid="calc-lp" />
            <K label=")" tone="fn" onClick={() => insert(')', 'close')} testid="calc-rp" />
            <K label="MC" tone="mem" onClick={() => setMemory(0)} testid="calc-mc" title="清除記憶" />
            <K label="MR" tone="mem" onClick={() => insertValue(st.current.memory)} testid="calc-mr" title="叫出記憶" />
            <K label="M+" tone="mem" onClick={() => memAdd(1)} testid="calc-mplus" title="記憶加上目前結果" />
            <K label="M−" tone="mem" onClick={() => memAdd(-1)} testid="calc-mminus" title="記憶減去目前結果" />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <K label="C" tone="warn" onClick={clear} testid="calc-clear" title="清除（Delete）" />
            <K label="⌫" tone="warn" onClick={back} testid="calc-back" title="退格（Backspace）" />
            <K label="EE" tone="op" onClick={insertExp} testid="calc-ee" title="科學記號（例如 1.5 EE 3 = 1.5e3）" />
            <K label="÷" tone="op" onClick={() => insert('÷', 'op')} testid="calc-div" />
            {['7', '8', '9'].map((d) => <K key={d} label={d} onClick={() => insert(d, 'digit')} testid={`calc-${d}`} />)}
            <K label="×" tone="op" onClick={() => insert('×', 'op')} testid="calc-mul" />
            {['4', '5', '6'].map((d) => <K key={d} label={d} onClick={() => insert(d, 'digit')} testid={`calc-${d}`} />)}
            <K label="−" tone="op" onClick={() => insert('-', 'op')} testid="calc-sub" />
            {['1', '2', '3'].map((d) => <K key={d} label={d} onClick={() => insert(d, 'digit')} testid={`calc-${d}`} />)}
            <K label="+" tone="op" onClick={() => insert('+', 'op')} testid="calc-add" />
            <K label="0" onClick={() => insert('0', 'digit')} testid="calc-0" />
            <K label="." onClick={() => insert('.', 'digit')} testid="calc-dot" />
            <K label="=" tone="eq" wide onClick={run} testid="calc-eq" title="計算（Enter）" />
          </div>
        </div>

        {/* 歷史紀錄：本次開啟期間，最多 50 筆，點一下把算式帶回來 */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs font-bold">
            <span>
              歷史紀錄 <span className="font-normal tabular-nums text-[#8a5a2b]">{history.length}／{TOOLS.calc.historyMax}</span>
            </span>
            <span className="font-normal text-[#8a5a2b]">點一下把算式帶回來・關閉計算機就清空</span>
          </div>
          <ul className="max-h-[132px] overflow-y-auto border-2 border-[#3b2a1c]/50 bg-[#fffdf4]" data-testid="calc-history">
            {history.length === 0 && <li className="px-2 py-2 text-xs text-[#8a7d66]">還沒有紀錄</li>}
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  data-testid="calc-history-item"
                  onClick={() => {
                    setExpr(h.expr)
                    setOut(null)
                    setFresh(false)
                  }}
                  className="flex w-full items-baseline justify-between gap-3 border-b border-[#3b2a1c]/15 px-2 py-1 text-left font-mono text-xs hover:bg-[#fff1c9]"
                >
                  <span className="min-w-0 break-all">{h.expr}</span>
                  <span className="shrink-0 font-bold">= {h.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ToolDialog>
  )
}
