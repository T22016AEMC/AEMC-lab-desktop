import { gameNow } from '../farm/overrides'
import { flushSave, getSaveStorage } from '../farm/store/farmStore'
import { defaultAppList, getAppListStorage } from '../store/appListStore'
import { useUIStore } from '../store/uiStore'
import { backupFileName, buildBackup } from './backup'
import { useSettingsStore } from './settings'

/** 匯出存檔：透過儲存層讀取（不直接碰 localStorage），下載成 JSON 檔。回傳是否成功 */
export async function exportBackup(): Promise<boolean> {
  try {
    flushSave() // 先把還沒寫入的變動寫進去，確保匯出的是最新的
    const farm = await getSaveStorage().load()
    if (!farm) {
      useUIStore.getState().showToast('還沒有存檔可以匯出（先領養一隻寵物）')
      return false
    }
    const appList = (await getAppListStorage().load()) ?? defaultAppList()
    const now = new Date()
    const json = JSON.stringify(buildBackup(farm, appList, __APP_VERSION__, now))
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = backupFileName(now)
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    useSettingsStore.getState().update({ lastExportAt: gameNow() })
    useUIStore.getState().showToast('已匯出存檔：' + a.download)
    return true
  } catch {
    useUIStore.getState().showToast('匯出失敗')
    return false
  }
}
