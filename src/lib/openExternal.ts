/**
 * 在新分頁開啟外部網址，回傳是否成功（false = 被瀏覽器擋掉，例如彈出視窗封鎖）。
 *
 * 不能用 window.open(url, '_blank', 'noopener,noreferrer')：加了 noopener／noreferrer 之後，
 * 瀏覽器不論成功與否一律回傳 null，就分辨不出「被擋」與「成功」。所以改成不帶 features 開啟，
 * 成功後立刻把新分頁的 opener 設為 null（效果等同 noopener：對方網頁拿不到這個桌面的 window）。
 * 代價：對方網站的 Referer 會是本站網址的 origin（瀏覽器預設 strict-origin-when-cross-origin，不含路徑與參數）。
 */
export function openExternal(url: string): boolean {
  let w: Window | null = null
  try {
    w = window.open(url, '_blank')
  } catch {
    return false
  }
  if (!w) return false
  try {
    w.opener = null
  } catch {
    /* 跨來源時有些瀏覽器不讓設定，已經沒有 opener 關聯，忽略 */
  }
  return true
}
