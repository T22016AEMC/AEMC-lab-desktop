const PREFIX = 'aemc-desktop:'

/** 讀取數字；沒有紀錄、格式錯誤或 localStorage 不可用時回傳 null */
export function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(PREFIX + key, String(value))
  } catch {
    // 無痕模式或儲存空間已滿，忽略
  }
}
