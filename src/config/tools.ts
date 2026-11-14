/**
 * 工具包（v3.7.0：科學計算機、碼表與倒數、公佈欄）的數值、上限與提示文字，集中在這裡。
 * 程式其他地方不要再寫死這些數字或訊息（測試也從這裡讀）。
 */
const NOTES_MAX = 8

export const TOOLS = {
  calc: {
    /** 歷史紀錄：本次開啟期間最多幾筆（關閉計算機就清空），新的在最上面 */
    historyMax: 50,
    /**
     * 顯示結果時保留的有效位數（處理浮點誤差：0.1+0.2 = 0.30000000000000004 → 0.3）。
     * 15 位：雙精度浮點數一次運算的誤差約在第 16～17 位，15 位可以藏住；14 位數的整數也能完整顯示。
     */
    displayDigits: 15,
    /** 三角函數的結果離 0、±0.5、±1 小於這個值就直接當成那個值（sin(180°) → 0） */
    trigSnap: 1e-12,
    /** 絕對值大於等於這個值改用科學記號顯示 */
    sciAbove: 1e15,
    /** 絕對值小於這個值（且不是 0）改用科學記號顯示 */
    sciBelow: 1e-7,
    /** 階乘的上限（171! 已超出浮點數範圍） */
    factorialMax: 170,
    /** 算式最長幾個字元（防止貼上或按住鍵盤產生超長字串） */
    exprMaxLength: 200,
    /** 括號最多幾層（避免遞迴太深） */
    maxDepth: 64,
  },
  timer: {
    /** 碼表計次最多幾筆（到上限後「計次」停用） */
    lapMax: 50,
    /** 倒數的時分秒上限 */
    maxHours: 99,
    /** 倒數完成的提示（視窗關著也會顯示）與顯示秒數 */
    doneMessage: '倒數完成',
    doneToastMs: 6000,
  },
  notes: {
    /** 便利貼最多幾張；標題、內容最多幾個字（字數用 Array.from 計，emoji 算 1 個字） */
    max: NOTES_MAX,
    titleMax: 20,
    bodyMax: 200,
    /** 公佈欄圖上最多顯示幾張標題縮圖（實際張數還會依畫面大小減少，多的用張數表示） */
    thumbMax: 3,
    /** id 最長幾個字元（匯入驗證用） */
    idMaxLength: 40,
    fullMessage: `最多 ${NOTES_MAX} 張，請先刪除一張`,
    noSaveMessage: '還沒有養殖場存檔，領養第一隻寵物之後就能使用公佈欄',
  },
  /** 疊在場景上的點擊區至少要有的大小（CSS 像素）：不足就放大點擊區，不縮小視覺 */
  minHitCss: 24,
} as const

/** 便利貼顏色（4 色，對應 sticky_notes.png 的 2×2：黃、粉紅 / 藍、綠） */
export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green'] as const
export type NoteColor = (typeof NOTE_COLORS)[number]

/**
 * 便利貼在介面上的顏色（CSS 色塊，從 sticky_notes.png 每張的紙面取樣）：文字放在色塊上比放在像素圖上清楚，
 * 卡片大小也不受整數倍縮放限制。像素圖（tools 圖集的 note_*）只用在顏色選擇鈕與卡片角落。
 */
export const NOTE_CSS: Record<NoteColor, { label: string; bg: string; edge: string }> = {
  // bg 是 process-assets.mjs 從每張便條紙中央取樣的顏色（處理報告有列出）；edge 是同色系的深色邊框
  yellow: { label: '黃色', bg: '#fdeb5c', edge: '#b8901c' },
  pink: { label: '粉紅', bg: '#fb93ce', edge: '#b9508a' },
  blue: { label: '藍色', bg: '#8cd8fc', edge: '#2f86bd' },
  green: { label: '綠色', bg: '#bdfabb', edge: '#4f9e4f' },
}

/** 三個工具的 id、名稱與 tools 圖集的圖示鍵名（選單列「工具」下拉清單的順序） */
export const TOOL_LIST = [
  { id: 'calc', name: '計算機', icon: 'tool_calc' },
  { id: 'timer', name: '碼表與倒數', icon: 'tool_timer' },
  { id: 'notes', name: '公佈欄', icon: 'tool_board' },
] as const
export type ToolId = (typeof TOOL_LIST)[number]['id']
