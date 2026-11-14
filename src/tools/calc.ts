import { TOOLS } from '../config/tools'

/**
 * 科學計算機的運算式解析與計算（v3.7.0）：純函式、不碰 DOM、不用 eval／new Function，可在 Node 單獨測試。
 *
 * 語法（優先順序由低到高）：
 *   加減 + -  →  乘除 × ÷（以及省略乘號：2π、2(3)、(1)(2)、3!2）→  一元正負號  →  冪次 ^（右結合）→  階乘 !（後置）→  函數、括號、數字、常數
 *   - 一元負號比冪次低：-3^2 = -(3^2) = -9（數學慣例），(-3)^2 = 9；冪次的指數可以帶負號：2^-1 = 0.5。
 *   - 冪次右結合：2^3^2 = 2^(3^2) = 512。
 *   - 函數 sin cos tan asin acos atan log（以 10 為底）ln exp 後面一定要接括號；√（sqrt）可以接括號或直接接一個數字／常數：√9 = 3。
 *   - 常數 π（pi）、e；科學記號 1.5e3、2E-4、1e+5（e 緊接在數字後面、後面再接數字才算科學記號，否則是常數 e：2e = 2×e）。
 *   - 接受 × · * 當乘號、÷ / 當除號、− 當減號。
 * 錯誤一律回傳簡短中文訊息（不會丟例外、不會回傳 NaN／Infinity）：除以零、括號不成對、不合法輸入、結果不是有限數字等。
 */

export type AngleMode = 'deg' | 'rad'
export type CalcResult = { ok: true; value: number; text: string } | { ok: false; error: string }

export const CALC_ERRORS = {
  empty: '請輸入算式',
  tooLong: '算式太長',
  paren: '括號不成對',
  incomplete: '算式不完整',
  syntax: '算式有誤',
  number: '數字格式不正確',
  divZero: '不能除以零',
  overflow: '結果超出範圍',
  notReal: '無法計算（結果不是實數）',
  factorial: `階乘只接受 0～${TOOLS.calc.factorialMax} 的整數`,
  sqrtNeg: '負數不能開根號',
  logDomain: '對數只接受正數',
  inverseTrig: '反三角函數的輸入要在 -1 到 1 之間',
  tanUndefined: 'tan 在這個角度沒有定義',
  needParen: (fn: string) => `${fn} 後面要接括號`,
  unknown: (s: string) => `無法辨識的輸入「${s}」`,
  tooDeep: '括號太多層',
} as const

class CalcError extends Error {}
const fail = (msg: string): never => {
  throw new CalcError(msg)
}

type Fn = 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan' | 'log' | 'ln' | 'sqrt' | 'exp'
type Token =
  | { t: 'num'; v: number }
  | { t: 'const'; v: number }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'bang' }
  | { t: 'fn'; v: Fn }

const FUNCS: Readonly<Record<string, Fn>> = { sin: 'sin', cos: 'cos', tan: 'tan', asin: 'asin', acos: 'acos', atan: 'atan', log: 'log', ln: 'ln', sqrt: 'sqrt', exp: 'exp' }
const OPS: Readonly<Record<string, '+' | '-' | '*' | '/' | '^'>> = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '·': '*', '/': '/', '÷': '/', '^': '^' }
const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9'
const isLetter = (c: string | undefined): boolean => c !== undefined && /[a-zA-Z]/.test(c)

export function tokenize(src: string): Token[] {
  const out: Token[] = []
  const s = src
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === ' ' || c === '\t' || c === '\n') {
      i++
      continue
    }
    if (isDigit(c) || c === '.') {
      let j = i
      let dots = 0
      let digits = 0
      while (j < s.length && (isDigit(s[j]) || s[j] === '.')) {
        if (s[j] === '.') dots++
        else digits++
        j++
      }
      if (dots > 1 || digits === 0) fail(CALC_ERRORS.number)
      // 科學記號：e 後面接數字，或接正負號再接數字
      if ((s[j] === 'e' || s[j] === 'E') && (isDigit(s[j + 1]) || ((s[j + 1] === '+' || s[j + 1] === '-' || s[j + 1] === '−') && isDigit(s[j + 2])))) {
        j += s[j + 1] === '+' || s[j + 1] === '-' || s[j + 1] === '−' ? 2 : 1
        while (j < s.length && isDigit(s[j])) j++
        if (s[j] === '.') fail(CALC_ERRORS.number)
      }
      const text = s.slice(i, j).replace('−', '-')
      const v = Number(text)
      if (!Number.isFinite(v)) fail(Number.isNaN(v) ? CALC_ERRORS.number : CALC_ERRORS.overflow)
      out.push({ t: 'num', v })
      i = j
      continue
    }
    if (OPS[c]) {
      out.push({ t: 'op', v: OPS[c] })
      i++
      continue
    }
    if (c === '(') {
      out.push({ t: 'lp' })
      i++
      continue
    }
    if (c === ')') {
      out.push({ t: 'rp' })
      i++
      continue
    }
    if (c === '!') {
      out.push({ t: 'bang' })
      i++
      continue
    }
    if (c === 'π') {
      out.push({ t: 'const', v: Math.PI })
      i++
      continue
    }
    if (c === '√') {
      out.push({ t: 'fn', v: 'sqrt' })
      i++
      continue
    }
    if (isLetter(c)) {
      let j = i
      while (j < s.length && isLetter(s[j])) j++
      const word = s.slice(i, j)
      const low = word.toLowerCase()
      if (FUNCS[low]) out.push({ t: 'fn', v: FUNCS[low] })
      else if (low === 'pi') out.push({ t: 'const', v: Math.PI })
      else if (word === 'e') out.push({ t: 'const', v: Math.E })
      else fail(CALC_ERRORS.unknown(word))
      i = j
      continue
    }
    // 一個「字」（含 emoji 等兩個 UTF-16 單位的字元）
    fail(CALC_ERRORS.unknown(Array.from(s.slice(i))[0] ?? c))
  }
  return out
}

/** 浮點運算的每一步都檢查：Infinity → 超出範圍，NaN → 不是實數 */
const fin = (v: number): number => (Number.isFinite(v) ? v : fail(Number.isNaN(v) ? CALC_ERRORS.notReal : CALC_ERRORS.overflow))

/** 三角函數結果離 0、±0.5、±1 很近時直接當成那個值（sin(180°) → 0、sin(30°) → 0.5、tan(45°) → 1） */
function snapTrig(v: number): number {
  for (const k of [0, 0.5, -0.5, 1, -1]) if (Math.abs(v - k) < TOOLS.calc.trigSnap) return k
  return v
}

function factorial(n: number): number {
  const r = Math.round(n)
  if (Math.abs(n - r) > 1e-9 || r < 0 || r > TOOLS.calc.factorialMax) fail(CALC_ERRORS.factorial)
  let p = 1
  for (let k = 2; k <= r; k++) p *= k
  return fin(p)
}

function applyFn(fn: Fn, x: number, mode: AngleMode): number {
  const toRad = (a: number): number => (mode === 'deg' ? ((((a % 360) + 360) % 360) * Math.PI) / 180 : a)
  const fromRad = (a: number): number => (mode === 'deg' ? (a * 180) / Math.PI : a)
  switch (fn) {
    case 'sin':
      return snapTrig(Math.sin(toRad(x)))
    case 'cos':
      return snapTrig(Math.cos(toRad(x)))
    case 'tan': {
      if (mode === 'deg' && (((x % 180) + 180) % 180) === 90) fail(CALC_ERRORS.tanUndefined)
      return fin(snapTrig(Math.tan(toRad(x))))
    }
    case 'asin':
    case 'acos': {
      if (Math.abs(x) > 1 + 1e-12) fail(CALC_ERRORS.inverseTrig)
      const c = Math.max(-1, Math.min(1, x))
      return fromRad(fn === 'asin' ? Math.asin(c) : Math.acos(c))
    }
    case 'atan':
      return fromRad(Math.atan(x))
    case 'log':
      if (x <= 0) fail(CALC_ERRORS.logDomain)
      return Math.log10(x)
    case 'ln':
      if (x <= 0) fail(CALC_ERRORS.logDomain)
      return Math.log(x)
    case 'sqrt':
      if (x < 0) fail(CALC_ERRORS.sqrtNeg)
      return Math.sqrt(x)
    case 'exp':
      return fin(Math.exp(x))
  }
}

const FN_LABEL: Record<Fn, string> = { sin: 'sin', cos: 'cos', tan: 'tan', asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹', log: 'log', ln: 'ln', sqrt: '√', exp: 'exp' }

/** 遞迴下降解析，邊解析邊計算 */
function parseTokens(tokens: Token[], mode: AngleMode): number {
  let pos = 0
  let depth = 0
  const peek = (): Token | undefined => tokens[pos]
  const startsPrimary = (k: Token | undefined): boolean => !!k && (k.t === 'num' || k.t === 'const' || k.t === 'lp' || k.t === 'fn')
  const enter = (): void => {
    if (++depth > TOOLS.calc.maxDepth) fail(CALC_ERRORS.tooDeep)
  }

  const expr = (): number => {
    enter()
    let v = term()
    for (let k = peek(); k?.t === 'op' && (k.v === '+' || k.v === '-'); k = peek()) {
      pos++
      const r = term()
      v = fin(k.v === '+' ? v + r : v - r)
    }
    depth--
    return v
  }
  const term = (): number => {
    let v = unary()
    for (;;) {
      const k = peek()
      if (k?.t === 'op' && (k.v === '*' || k.v === '/')) {
        pos++
        const r = unary()
        if (k.v === '/' && r === 0) fail(CALC_ERRORS.divZero)
        v = fin(k.v === '*' ? v * r : v / r)
      } else if (startsPrimary(k)) {
        // 省略乘號：2π、2(3)、(1)(2)、2sin(30)
        v = fin(v * unary())
      } else return v
    }
  }
  const unary = (): number => {
    const k = peek()
    if (k?.t === 'op' && (k.v === '-' || k.v === '+')) {
      pos++
      enter()
      const v = unary()
      depth--
      return k.v === '-' ? -v : v
    }
    return power()
  }
  const power = (): number => {
    const base = postfix()
    const k = peek()
    if (k?.t === 'op' && k.v === '^') {
      pos++
      enter()
      const ex = unary() // 右結合，指數可以帶負號
      depth--
      if (base === 0 && ex < 0) fail(CALC_ERRORS.divZero)
      return fin(Math.pow(base, ex))
    }
    return base
  }
  const postfix = (): number => {
    let v = primary()
    while (peek()?.t === 'bang') {
      pos++
      v = factorial(v)
    }
    return v
  }
  const primary = (): number => {
    const k = peek()
    if (!k) return fail(CALC_ERRORS.incomplete)
    if (k.t === 'num' || k.t === 'const') {
      pos++
      return k.v
    }
    if (k.t === 'lp') {
      pos++
      if (peek()?.t === 'rp') fail(CALC_ERRORS.incomplete) // 空括號 ()
      const v = expr()
      if (peek()?.t !== 'rp') fail(peek() ? CALC_ERRORS.syntax : CALC_ERRORS.paren)
      pos++
      return v
    }
    if (k.t === 'fn') {
      pos++
      const next = peek()
      if (!next) return fail(CALC_ERRORS.incomplete)
      // √ 可以直接接數字或常數；其他函數一定要接括號
      if (next.t !== 'lp' && !(k.v === 'sqrt' && (next.t === 'num' || next.t === 'const' || next.t === 'fn'))) fail(CALC_ERRORS.needParen(FN_LABEL[k.v]))
      enter()
      const arg = primary()
      depth--
      return fin(applyFn(k.v, arg, mode))
    }
    if (k.t === 'rp') return fail(CALC_ERRORS.syntax)
    return fail(pos === tokens.length - 1 && k.t === 'op' ? CALC_ERRORS.incomplete : CALC_ERRORS.syntax)
  }

  const v = expr()
  if (pos < tokens.length) fail(tokens[pos].t === 'rp' ? CALC_ERRORS.paren : CALC_ERRORS.syntax)
  return v
}

/** 括號是否成對（任何前綴的右括號都不比左括號多，最後數量相等） */
function parensBalanced(tokens: Token[]): boolean {
  let d = 0
  for (const k of tokens) {
    if (k.t === 'lp') d++
    else if (k.t === 'rp' && --d < 0) return false
  }
  return d === 0
}

/**
 * 結果的顯示文字：保留 12 位有效數字（處理浮點誤差，0.1+0.2 → 0.3），去掉多餘的 0；
 * 很大或很小的數用科學記號（1.5e21、3e-8）。-0 顯示 0。輸入必須是有限數字。
 */
export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return ''
  const r = Number(v.toPrecision(TOOLS.calc.displayDigits))
  if (r === 0) return '0'
  const a = Math.abs(r)
  if (a >= TOOLS.calc.sciAbove || a < TOOLS.calc.sciBelow) return r.toExponential().replace('e+', 'e')
  return String(r)
}

/** 計算一個算式（純函式）：成功回傳數值與顯示文字，失敗回傳中文錯誤訊息 */
export function evaluate(src: string, mode: AngleMode = 'deg'): CalcResult {
  if (src.trim() === '') return { ok: false, error: CALC_ERRORS.empty }
  if (src.length > TOOLS.calc.exprMaxLength) return { ok: false, error: CALC_ERRORS.tooLong }
  try {
    const tokens = tokenize(src)
    if (tokens.length === 0) return { ok: false, error: CALC_ERRORS.empty }
    if (!parensBalanced(tokens)) return { ok: false, error: CALC_ERRORS.paren }
    const v = fin(parseTokens(tokens, mode))
    const out = Object.is(v, -0) ? 0 : v
    return { ok: true, value: out, text: formatNumber(out) }
  } catch (e) {
    if (e instanceof CalcError) return { ok: false, error: e.message }
    return { ok: false, error: CALC_ERRORS.syntax }
  }
}

// ---------------------------------------------------------------------------
// 輸入編輯（按鈕與鍵盤共用；純函式）
// ---------------------------------------------------------------------------

/** 退格：結尾是函數名稱加左括號（sin(、asin(、√ 等）就整個刪掉，否則刪最後一個字 */
export function backspace(expr: string): string {
  const m = expr.match(/(asin|acos|atan|sin|cos|tan|log|ln|sqrt|exp)\($/)
  if (m) return expr.slice(0, expr.length - m[0].length)
  const chars = Array.from(expr)
  chars.pop()
  return chars.join('')
}

/** 算式結尾可以直接接數字嗎（結尾是數字、常數、右括號、階乘時要補乘號） */
export function endsWithValue(expr: string): boolean {
  return /[0-9.)!πe]$/.test(expr)
}
