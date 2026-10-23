/** 判斷 icon 設定是圖片路徑還是 emoji */
export function isImageIcon(icon: string): boolean {
  return /^(https?:|data:|\.{0,2}\/)/i.test(icon) || /\.(png|jpe?g|svg|webp|gif|ico)$/i.test(icon)
}

/** 相對路徑會接上部署的 base 路徑（GitHub Pages 子路徑） */
export function resolveIconSrc(icon: string): string {
  if (/^(https?:|data:)/i.test(icon)) return icon
  return import.meta.env.BASE_URL + icon.replace(/^\.?\//, '')
}

const GRADIENTS: [string, string][] = [
  ['#60a5fa', '#2563eb'],
  ['#a78bfa', '#6d28d9'],
  ['#f472b6', '#db2777'],
  ['#fb923c', '#ea580c'],
  ['#34d399', '#059669'],
  ['#22d3ee', '#0891b2'],
  ['#facc15', '#ca8a04'],
  ['#f87171', '#dc2626'],
  ['#818cf8', '#4338ca'],
  ['#94a3b8', '#475569'],
]

/** 依字串（名稱或 id）雜湊決定圖示底色，同一個名稱永遠同一組顏色 */
export function gradientFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  const [a, b] = GRADIENTS[h % GRADIENTS.length]
  return `linear-gradient(145deg, ${a}, ${b})`
}

/** 文字圖示顯示的字母：名稱前兩個字（英文字母取首字大寫、次字小寫） */
export function iconInitials(name: string): string {
  const t = name.trim()
  const letters = Array.from(t).slice(0, 2).join('')
  return /^[a-z]/i.test(letters) ? letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase() : letters
}
