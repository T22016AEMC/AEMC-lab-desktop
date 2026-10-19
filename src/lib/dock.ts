/** 取得某個 app 在 Dock 中圖示的中心點，供最小化動畫使用 */
export function getDockTarget(appId: string): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(`[data-dock-id="${CSS.escape(appId)}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
