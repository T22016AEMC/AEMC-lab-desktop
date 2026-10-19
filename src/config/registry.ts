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

/** 是否顯示在桌面圖示：外部程式一律顯示，內建程式需明確設定 */
export function showsOnDesktop(app: DesktopApp): boolean {
  return app.kind === 'external' || app.showOnDesktop === true
}

/** 是否常駐 Dock：外部程式一律常駐，內建程式只有開啟時才出現（除非明確設定） */
export function pinnedInDock(app: DesktopApp): boolean {
  return app.kind === 'external' || app.showInDock === true
}

/** 尚未上線（或沒有網址）的程式：只顯示圖示與提示，不開視窗 */
export function isComingSoon(app: DesktopApp): boolean {
  return app.kind === 'external' && (app.status === 'coming-soon' || !app.url)
}

export function iconColorOf(app: DesktopApp): [string, string] | undefined {
  return app.kind === 'external' ? app.iconColor : undefined
}
