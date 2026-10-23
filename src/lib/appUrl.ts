/**
 * 把使用者輸入的網址整理成可開啟的 http/https 網址。
 * 沒寫通訊協定就補 https://；其他協定（javascript:、data:、file:…）一律拒絕。
 * 回傳 null 代表不是有效的網址。
 */
export function normalizeUrl(input: string): string | null {
  const t = input.trim()
  if (!t || /\s/.test(t)) return null
  let candidate: string
  if (/^https?:\/\//i.test(t)) candidate = t
  else if (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ||
    /^(javascript|data|file|vbscript|blob|mailto|tel|about|chrome|view-source):/i.test(t)
  )
    return null
  else candidate = 'https://' + t.replace(/^\/+/, '')
  try {
    const u = new URL(candidate)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname) return null
    return u.href
  } catch {
    return null
  }
}
