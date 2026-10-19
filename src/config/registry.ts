import type { DesktopApp } from '../types'
import { apps } from './apps'
import { builtinApps } from './builtinApps'

/** 外部程式與內建程式合併後的完整清單 */
export const allApps: DesktopApp[] = [
  ...apps.map((a) => ({ ...a, kind: 'external' as const, openMode: a.openMode ?? ('window' as const) })),
  ...builtinApps,
]

const appMap = new Map(allApps.map((a) => [a.id, a]))

export function getApp(id: string): DesktopApp | undefined {
  return appMap.get(id)
}

export const gameApps = allApps.filter((a) => a.kind === 'builtin' && a.category === 'games')

/** 尚未上線（或沒有網址）的程式：只顯示圖示與提示，不開視窗 */
export function isComingSoon(app: DesktopApp): boolean {
  return app.kind === 'external' && (app.status === 'coming-soon' || !app.url)
}

export function iconColorOf(app: DesktopApp): [string, string] | undefined {
  return app.kind === 'external' ? app.iconColor : undefined
}
