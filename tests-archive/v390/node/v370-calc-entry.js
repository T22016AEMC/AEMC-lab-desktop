// v3.7.0 計算機解析器單元測試（純函式，Node 執行）
import assert from 'node:assert/strict'
import { evaluate, formatNumber, tokenize, backspace, CALC_ERRORS } from '../../../src/tools/calc.ts'
import { TOOLS } from '../../../src/config/tools.ts'

let n = 0
const D = TOOLS.calc.displayDigits
const val = (expr, want, mode = 'deg') => {
  n++
  const r = evaluate(expr, mode)
  assert.ok(r.ok, `${expr} 應該成功，得到錯誤「${r.error}」`)
  if (typeof want === 'string') assert.equal(r.text, want, `${expr} 顯示 ${r.text}，預期 ${want}`)
  else assert.ok(Math.abs(r.value - want) <= Math.abs(want) * 1e-12 + 1e-15, `${expr} = ${r.value}，預期 ${want}`)
  return r
}
const err = (expr, want, mode = 'deg') => {
  n++
  const r = evaluate(expr, mode)
  assert.ok(!r.ok, `${expr} 應該失敗，卻得到 ${r.text}`)
  if (want) assert.equal(r.error, want, `${expr} 錯誤訊息「${r.error}」，預期「${want}」`)
  assert.ok(!/NaN|Infinity/.test(r.error), '錯誤訊息不含 NaN／Infinity')
  return r
}
const log = []

// 1. 運算優先順序
val('1+2*3', '7'); val('2*3+1', '7'); val('10-4-3', '3'); val('100/10/5', '2'); val('2+3×4÷2', '8'); val('7−2', '5')
val('1+2*3^2', '19'); val('2*3!', '12')
// 2. 括號
val('(1+2)*3', '9'); val('((2))', '2'); val('2*(3+(4-1))', '12'); val('(1+2)(3+4)', '21'); val('2(3)', '6'); val('2π', String(Number((2 * Math.PI).toPrecision(D))))
// 3. 一元負號（選擇：一元負號比冪次低 → -3^2 = -9；(-3)^2 = 9）
val('-3^2', '-9'); val('(-3)^2', '9'); val('-3+5', '2'); val('2*-3', '-6'); val('--3', '3'); val('2^-1', '0.5'); val('-2^-2', '-0.25'); val('+4', '4')
log.push('-3^2 = ' + evaluate('-3^2').text + '，(-3)^2 = ' + evaluate('(-3)^2').text)
// 4. 冪次右結合
val('2^3^2', '512'); val('(2^3)^2', '64'); val('2^0.5', String(Number(Math.SQRT2.toPrecision(D))))
// 5. 階乘
val('5!', '120'); val('0!', '1'); val('1!', '1'); val('3!!', '720'); val('-3!', '-6'); val('170!', formatNumber(Array.from({ length: 170 }, (_, i) => i + 1).reduce((a, b) => a * b, 1)))
err('(-3)!', CALC_ERRORS.factorial); err('2.5!', CALC_ERRORS.factorial); err('171!', CALC_ERRORS.factorial); err('1000!', CALC_ERRORS.factorial)
val('(0.1+0.2)*10!', String(Number((0.30000000000000004 * 3628800).toPrecision(D)))) // 3628800*0.3 → 1088640
val('(1/3*3)!', '1') // 0.9999999999999999 視為 1
log.push('170! = ' + evaluate('170!').text + '；171! → ' + evaluate('171!').error)
// 6. 開根號
val('sqrt(16)', '4'); val('√9', '3'); val('√(2)^2', '2'); val('√16+1', '5'); val('2√9', '6'); val('√9!', '6')
err('sqrt(-1)', CALC_ERRORS.sqrtNeg); err('√-4', CALC_ERRORS.needParen('√'))
// 7. 對數、指數
val('log(1000)', '3'); val('log(0.01)', '-2'); val('ln(e)', '1'); val('ln(1)', '0'); val('exp(1)', String(Number(Math.E.toPrecision(D)))); val('e^(2)', String(Number((Math.E ** 2).toPrecision(D))))
err('log(0)', CALC_ERRORS.logDomain); err('ln(-1)', CALC_ERRORS.logDomain)
// 8. 三角函數（角度）
val('sin(30)', '0.5'); val('cos(60)', '0.5'); val('tan(45)', '1'); val('sin(180)', '0'); val('cos(90)', '0'); val('sin(90)', '1'); val('cos(180)', '-1'); val('sin(-30)', '-0.5')
val('sin(360)', '0'); val('sin(720)', '0'); val('tan(135)', '-1'); val('tan(0)', '0'); val('cos(270)', '0'); val('sin(150)', '0.5')
err('tan(90)', CALC_ERRORS.tanUndefined); err('tan(270)', CALC_ERRORS.tanUndefined); err('tan(-90)', CALC_ERRORS.tanUndefined)
val('asin(0.5)', '30'); val('acos(0.5)', '60'); val('atan(1)', '45'); val('asin(1)', '90')
err('asin(2)', CALC_ERRORS.inverseTrig); err('acos(-1.5)', CALC_ERRORS.inverseTrig)
// 9. 弧度模式
val('sin(π/2)', '1', 'rad'); val('cos(π)', '-1', 'rad'); val('sin(π)', '0', 'rad'); val('tan(π/4)', '1', 'rad'); val('sin(pi/6)', '0.5', 'rad'); val('asin(1)', String(Number((Math.PI / 2).toPrecision(D))), 'rad')
val('sin(30)', String(Number(Math.sin(30).toPrecision(D))), 'rad')
// 10. 科學記號
val('1.5e3', '1500'); val('2E-4', '0.0002'); val('1e+5', '100000'); val('1.5e3+1', '1501'); val('3e2*2', '600')
val('2e', String(Number((2 * Math.E).toPrecision(D)))) // e 後面沒有數字 → 常數
err('1.2.3', CALC_ERRORS.number); err('.', CALC_ERRORS.number)
// 11. 浮點誤差
val('0.1+0.2', '0.3'); val('0.3-0.1', '0.2'); val('1.1*1.1', '1.21'); val('1/3', '0.333333333333333'); val('2/3', '0.666666666666667'); val('0.1*3', '0.3'); val('1-0.9', '0.1')
// 12. 除以零
err('1/0', CALC_ERRORS.divZero); err('0/0', CALC_ERRORS.divZero); err('5÷(2-2)', CALC_ERRORS.divZero); err('0^-1', CALC_ERRORS.divZero)
// 13. 括號不成對
err('(1+2', CALC_ERRORS.paren); err('1+2)', CALC_ERRORS.paren); err(')(', CALC_ERRORS.paren); err('((1)', CALC_ERRORS.paren); err('sin(30', CALC_ERRORS.paren)
// 14. 空字串與不完整
err('', CALC_ERRORS.empty); err('   ', CALC_ERRORS.empty); err('1+', CALC_ERRORS.incomplete); err('()', CALC_ERRORS.incomplete); err('2*', CALC_ERRORS.incomplete); err('-', CALC_ERRORS.incomplete)
err('*3', CALC_ERRORS.syntax); err('3**4', CALC_ERRORS.syntax); err('sin', CALC_ERRORS.incomplete); err('sin30', CALC_ERRORS.needParen('sin'))
// 15. 不合法輸入
err('abc', CALC_ERRORS.unknown('abc')); err('2#3', CALC_ERRORS.unknown('#')); err('1+😀', CALC_ERRORS.unknown('😀')); err('alert(1)', CALC_ERRORS.unknown('alert'))
err('x'.repeat(TOOLS.calc.exprMaxLength + 1), CALC_ERRORS.tooLong)
err('('.repeat(70) + '1' + ')'.repeat(70), CALC_ERRORS.tooDeep)
// 16. 極大極小
val('1e300*1e8', '1e308'); err('1e308*10', CALC_ERRORS.overflow); err('10^400', CALC_ERRORS.overflow); err('1e400', CALC_ERRORS.overflow); err('exp(1000)', CALC_ERRORS.overflow)
val('1e-300/1e10', '1e-310'); val('1e-400', '0'); val('123456789*1000000000', '123456789000000000'.length > 15 ? '1.23456789e17' : ''); val('0.00000001', '1e-8'); val('0.000001', '0.000001')
val('99999999999999', '99999999999999'); val('1e15', '1e15'); val('-1e-8', '-1e-8')
err('(-8)^(1/3)', CALC_ERRORS.notReal)
log.push('1e308*10 → ' + evaluate('1e308*10').error + '；10^400 → ' + evaluate('10^400').error + '；1e-400 → ' + evaluate('1e-400').text)
// 17. -0 顯示 0、formatNumber
assert.equal(evaluate('-0').text, '0'); assert.equal(formatNumber(-0), '0'); assert.equal(formatNumber(1.5e21), '1.5e21'); n += 3
// 18. 退格（函數名稱整個刪掉）
assert.equal(backspace('2+sin('), '2+'); assert.equal(backspace('asin('), ''); assert.equal(backspace('12'), '1'); assert.equal(backspace('1😀'), '1'); assert.equal(backspace('√('), '√'); n += 5
// 19. 不使用 eval：原始碼裡沒有 eval、new Function、Function(
{
  const { readFileSync } = await import('node:fs')
  const src = readFileSync((process.env.REPO_ROOT + '/src/tools/calc.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  assert.ok(!/\beval\s*\(|new\s+Function|\bFunction\s*\(/.test(src), 'calc.ts 不含 eval／new Function'); n++
}
// tokenize 基本
assert.equal(tokenize('2×3÷4').length, 5); n++

for (const l of log) console.log('  ' + l)
console.log(`v3.7.0 計算機解析器測試 ${n} 項全過`)
