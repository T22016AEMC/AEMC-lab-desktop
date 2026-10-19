type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

/** 進入全螢幕；不支援（如 iPhone）或被拒絕時回傳 false，不會丟出錯誤。必須在使用者手勢內呼叫。 */
export async function enterFullscreen(): Promise<boolean> {
  try {
    const el = document.documentElement as FullscreenElement
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' })
      return true
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen()
      return true
    }
  } catch {
    // 使用者拒絕或瀏覽器不允許，直接進入桌面
  }
  return false
}

/** Android 在全螢幕後嘗試鎖定橫向；失敗就忽略 */
export async function lockLandscape(): Promise<void> {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>
    }
    await orientation?.lock?.('landscape')
  } catch {
    // 不支援或不允許，忽略
  }
}
