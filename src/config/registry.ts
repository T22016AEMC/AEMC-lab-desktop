import type { BuiltinApp } from '../types'
import { builtinApps } from './builtinApps'

/** 內建程式（小遊戲）。外部程式由使用者在啟動台管理，見 store/appListStore.ts */
export const allApps: BuiltinApp[] = builtinApps

const appMap = new Map(allApps.map((a) => [a.id, a]))

export function getApp(id: string): BuiltinApp | undefined {
  return appMap.get(id)
}

export const gameApps = allApps.filter((a) => a.category === 'games')
