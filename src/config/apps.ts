import type { ExternalApp } from '../types'

/**
 * 啟動台的「官方程式」（v3.4.3 起共 7 個，順序就是啟動台的順序）。
 *
 * 官方程式的 id、名稱、網址、圖示一律由這個檔案決定，不由使用者的存檔決定：
 * 每次載入啟動台清單時都會用這裡的內容覆蓋存檔（見 lib/officialApps.ts 的 mergeOfficialApps），
 * 所以使用者不能刪除或改名官方程式（介面也不提供），要改官方程式只改這個檔案。
 * 使用者自己新增的程式存在瀏覽器（見 store/appListStore.ts），排在官方程式後面。
 *
 * id 是穩定的（賺金幣的冷卻也用 id 當鍵），不要改；網址一字不改（Adsorvia 的 /login 是刻意的）。
 * 所有外部程式都用瀏覽器新分頁開啟。圖示是 public/icons/ 底下的 144×144 正方形 PNG，
 * 由 scripts/process-logos.mjs 從原圖產生，不要手動改。
 */
export const OFFICIAL_APPS: readonly ExternalApp[] = [
  { id: 'official-filmaster', name: 'FilMaster', url: 'https://filmaster-pym.pages.dev/', icon: 'icons/official-filmaster.png' },
  { id: 'official-specreader', name: 'SpecReader', url: 'https://specreader-v1.onrender.com/', icon: 'icons/official-specreader.png' },
  { id: 'official-chemscutter', name: 'CheMScutter', url: 'https://chemscutter.pages.dev/chemscutter/', icon: 'icons/official-chemscutter.png' },
  { id: 'official-elusim', name: 'EluSim', url: 'https://elusim-v1.onrender.com/', icon: 'icons/official-elusim.png' },
  { id: 'official-autoellipso', name: 'AutoEllipso', url: 'https://autoellipso.t22016.workers.dev/', icon: 'icons/official-autoellipso.png' },
  { id: 'official-moleform', name: 'MoleForm', url: 'https://t22016aemc.github.io/moleform/', icon: 'icons/official-moleform.png' },
  { id: 'official-adsorvia', name: 'Adsorvia', url: 'https://tin-al2o3-sio2-hmds-p1-s5.onrender.com/login', icon: 'icons/official-adsorvia.png' },
]

/**
 * v3.4.2（含）以前的預設程式的確切 id。這些不是使用者新增的，合併時會移除（換成上面的官方程式）。
 * 判斷一律只看 id：其他任何不是官方 id、也不是這 5 個 id 的項目，都視為使用者新增的，一律保留。
 * （v1.0.0 的 app-1～app-5 範例程式發生在啟動台存檔機制出現之前，從來不會出現在使用者存檔裡，所以不在這裡。）
 */
export const LEGACY_DEFAULT_APP_IDS: readonly string[] = ['filmaster', 'specreader', 'chemscutter', 'elusim', 'autoellipso']

const OFFICIAL_IDS = new Set(OFFICIAL_APPS.map((a) => a.id))

export function isOfficialAppId(id: string): boolean {
  return OFFICIAL_IDS.has(id)
}
