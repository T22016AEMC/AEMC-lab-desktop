/**
 * 像素素材：載入 public/assets/ 底下由 scripts/process-assets.mjs 產生的圖集與 manifest。
 * 每張素材 = 圖集上的一塊矩形 + 錨點（ax = 水平中心、ay = 腳底基準線）。
 */

export interface Frame {
  atlas: string
  x: number
  y: number
  w: number
  h: number
  ax: number
  ay: number
  unused?: boolean
  /** 素材附帶的資料（例如鐘樓的鐘面中心與半徑） */
  meta?: { clock?: { cx: number; cy: number; r: number } | null }
}

interface Manifest {
  version: number
  atlases: Record<string, { file: string; width: number; height: number }>
  frames: Record<string, Frame>
  animations: Record<string, Record<string, string[]>>
}

export interface Sprite extends Frame {
  img: HTMLImageElement
  key: string
}

class Assets {
  ready = false
  private manifest: Manifest | null = null
  private images = new Map<string, HTMLImageElement>()
  private loading: Promise<void> | null = null

  /** 載入 manifest 與所有圖集（只會做一次） */
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        const base = import.meta.env.BASE_URL + 'assets/'
        const res = await fetch(base + 'manifest.json')
        const m = (await res.json()) as Manifest
        await Promise.all(
          Object.entries(m.atlases).map(
            ([name, a]) =>
              new Promise<void>((resolve, reject) => {
                const img = new Image()
                img.onload = () => resolve()
                img.onerror = () => reject(new Error('素材載入失敗：' + a.file))
                img.src = base + a.file
                this.images.set(name, img)
              }),
          ),
        )
        this.manifest = m
        this.ready = true
      })()
    }
    return this.loading
  }

  has(key: string): boolean {
    return Boolean(this.manifest?.frames[key])
  }

  get(key: string): Sprite | null {
    const f = this.manifest?.frames[key]
    if (!f) return null
    const img = this.images.get(f.atlas)
    return img ? { ...f, img, key } : null
  }

  keys(): string[] {
    return this.manifest ? Object.keys(this.manifest.frames) : []
  }

  /** 動物的動畫幀順序，例如 anim('dog_shiba', 'walk') → ['walk_a', 'walk_b'] */
  frames(prefix: string, anim: string): string[] {
    return this.manifest?.animations[prefix]?.[anim] ?? []
  }

  /** 某個物種（dog_shiba）的所有幀鍵名，圖鑑用 */
  framesOf(prefix: string): string[] {
    return this.keys().filter((k) => k.startsWith(prefix + '_'))
  }
}

export const assets = new Assets()

/** 畫一張素材：錨點對齊 (x, y)；flip 為 true 時以水平中心為軸左右翻轉 */
export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, flip = false): void {
  const dx = Math.round(x) - s.ax
  const dy = Math.round(y) - s.ay
  if (!flip) {
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, dx, dy, s.w, s.h)
    return
  }
  ctx.save()
  ctx.translate(Math.round(x), 0)
  ctx.scale(-1, 1)
  ctx.drawImage(s.img, s.x, s.y, s.w, s.h, -s.ax, dy, s.w, s.h)
  ctx.restore()
}
