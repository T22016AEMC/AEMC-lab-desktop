/** 自訂圖示存進瀏覽器，為了省空間縮成最大 128px */
export const ICON_SIZE = 128
const MAX_FILE_BYTES = 10 * 1024 * 1024

/** 把使用者選的圖片置中裁成正方形，縮成 128×128，輸出成 PNG data URL；失敗時丟出帶中文訊息的 Error */
export async function imageFileToIcon(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('請選擇圖片檔案')
  if (file.size > MAX_FILE_BYTES) throw new Error('圖片太大（上限 10 MB）')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('無法讀取這張圖片'))
      el.src = url
    })
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!w || !h) throw new Error('無法讀取這張圖片')
    const side = Math.min(w, h)
    const canvas = document.createElement('canvas')
    canvas.width = ICON_SIZE
    canvas.height = ICON_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('瀏覽器不支援圖片處理')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, ICON_SIZE, ICON_SIZE)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
