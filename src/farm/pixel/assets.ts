import { ASSET_MANIFEST } from './assetIndex'

/**
 * 像素素材：載入 public/assets/ 底下由 scripts/process-assets.mjs 產生的圖集與 manifest。
 * 檔名都帶內容雜湊（manifest 的檔名寫在 assetIndex.ts，圖集的檔名寫在 manifest 裡），
 * 所以新版程式一定載到對應的新素材，不會被舊快取配錯。
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
  meta?: {
    clock?: { cx: number; cy: number; r: number } | null
    board?: { x0: number; y0: number; x1: number; y1: number } | null
    /** v3.8.0 拍立得相框的窗口（管線偵測的透明區塊外框，x1、y1 不含） */
    window?: { x0: number; y0: number; x1: number; y1: number }
    /** v3.8.0 野餐墊的墊面（每 4 列一筆 [y, 左緣, 右緣)） */
    mat?: { top: number; bottom: number; rows: [number, number, number][] }
  }
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

/** 載入進度（manifest 1 份 + 每個圖集 1 份） */
export interface LoadProgress {
  loaded: number
  total: number
}

const RETRIES = 2

/**
 * 不在啟動時載入的圖集（解鎖才用到）：外殼（4.0-B1 依部位拆開：住家、鐘樓、池塘、公佈欄、小建築）。用 assets.loadGroup(名稱) 載入，
 * 載入前 assets.get 回傳 null，畫面用預設圖。v3.8.0：拍立得相框在野餐開始時才載入
 */
export const LAZY_ATLASES: readonly string[] = ['skins_house', 'skins_tower', 'skins_pond', 'skins_board', 'skins_small', 'polaroid']

async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  let last: unknown
  for (let i = 0; i <= RETRIES; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw new Error(what + '載入失敗（已重試 ' + RETRIES + ' 次）：' + (last instanceof Error ? last.message : String(last)))
}

class Assets {
  ready = false
  progress: LoadProgress = { loaded: 0, total: 0 }
  private listeners = new Set<(p: LoadProgress) => void>()

  /** 訂閱載入進度（回傳取消訂閱） */
  onProgress(fn: (p: LoadProgress) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private bump(loaded: number, total: number): void {
    this.progress = { loaded, total }
    for (const fn of this.listeners) fn(this.progress)
  }

  private manifest: Manifest | null = null
  private images = new Map<string, HTMLImageElement>()
  private loading: Promise<void> | null = null

  /** 載入 manifest 與所有圖集（只會做一次）；任何一份失敗會重試 ${RETRIES} 次，還是失敗才丟出錯誤 */
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        const base = import.meta.env.BASE_URL + 'assets/'
        this.bump(0, 1)
        const m = await withRetry('素材清單', async () => {
          const res = await fetch(base + ASSET_MANIFEST)
          if (!res.ok) throw new Error('HTTP ' + res.status)
          return (await res.json()) as Manifest
        })
        const entries = Object.entries(m.atlases).filter(([name]) => !LAZY_ATLASES.includes(name))
        const total = entries.length + 1
        let loaded = 1
        this.bump(loaded, total)
        await Promise.all(entries.map(([name]) => this.loadAtlas(base, m, name).then(() => this.bump(++loaded, total))))
        this.manifest = m
        this.ready = true
      })().catch((e) => {
        // 失敗後允許下次再呼叫 load() 重新來過
        this.loading = null
        throw e
      })
    }
    return this.loading
  }

  private loadAtlas(base: string, m: Manifest, name: string): Promise<void> {
    const a = m.atlases[name]
    return withRetry('素材 ' + a.file, () =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('無法載入 ' + a.file))
        img.src = base + a.file
      }),
    ).then((img) => {
      this.images.set(name, img)
    })
  }

  private groupLoads = new Map<string, Promise<void>>()

  /** 載入一個延後載入的圖集（例如 skins）；載入完成前 get 回傳 null。重複呼叫只載入一次，失敗後可以再呼叫 */
  loadGroup(name: string): Promise<void> {
    let p = this.groupLoads.get(name)
    if (!p) {
      p = (async () => {
        await this.load()
        if (!this.manifest || !this.manifest.atlases[name] || this.images.has(name)) return
        await this.loadAtlas(import.meta.env.BASE_URL + 'assets/', this.manifest, name)
      })().catch((e) => {
        this.groupLoads.delete(name)
        throw e
      })
      this.groupLoads.set(name, p)
    }
    return p
  }

  /** 這個圖集的圖片已經載入了嗎 */
  groupLoaded(name: string): boolean {
    return this.images.has(name)
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
