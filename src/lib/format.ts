const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 例：10月19日 週一 下午 12:06 */
export function formatMenuBarTime(d: Date): string {
  const h = d.getHours()
  const period = h < 12 ? '上午' : '下午'
  const h12 = h % 12 === 0 ? 12 : h % 12
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 週${WEEKDAYS[d.getDay()]} ${period} ${h12}:${mm}`
}

/** 2026-10-19 → 2026年10月19日 */
export function formatIsoDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`
}
