// 瀏覽器測試共用：啟動 Chrome、注入存檔、等開機畫面消失、讀選單列金幣、記錄所有 toast。
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
export const NEW = process.env.NEW_URL ?? 'http://localhost:5181/'
export const OLD = process.env.OLD_URL ?? 'http://localhost:5182/'
export const KEY = 'aemc-desktop:farm-save'
export const WRITER = 'aemc-desktop:farm-writer'
export const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url))

export const todayOf = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
export const T0 = Date.now()
export const TODAY = todayOf(T0)
export const pet = (id, species, variant, extra = {}) => ({ id, species, variant, name: id, adoptedAt: T0 - 5e8, heightFactor: 1, weight: 50, satiety: 90, mood: 90, cleanliness: 90, personality: 'calm', lastInteract: T0, ...extra })
/** v3.9.x（dataRev 4）的存檔：預設今天已領每日獎勵 */
export const save = (extra = {}) => ({
  schemaVersion: 5, dataRev: 4, points: 80, lastSeen: T0, lastDailyClaim: TODAY, gifts: { date: TODAY, count: 9 }, nextPetId: 4, createdAt: T0 - 9e8,
  pets: [pet('p1', 'dog', 'shiba'), pet('p2', 'cat', 'orange'), pet('p3', 'dog', 'golden')], ownedBuildings: ['kennel', 'bowls', 'catTree'],
  earning: { date: TODAY, programCoins: 0, gameCoins: 0, lastAward: {}, digCoins: 0 }, bowl: { date: TODAY, used: 1 },
  collection: {}, finds: [], events: {}, skins: { owned: [], equipped: {} }, notes: [], picnic: { date: TODAY, count: 0, lastEnd: 0 }, ...extra,
})

let failCount = 0
export const ok = (c, m) => { console.log((c ? '通過 ' : '失敗 ') + m); if (!c) failCount++; return c }
export const fails = () => failCount

export async function launch() {
  return chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
}

/**
 * 開一個新的 context 與分頁。s = 要注入的存檔（null = 不注入、沒有存檔）。只在這個 context 第一次載入時注入
 * （旗標放在 localStorage，所以同一個 context 開第二個分頁、或重新整理都不會再注入）。
 */
export async function open(b, s, { w = 1920, h = 988, dpr = 1, url = NEW, boot = true, hour = 10, extraInit } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
  await ctx.addInitScript(([s, k]) => {
    try {
      if (!localStorage.getItem('__injected')) {
        if (s) localStorage.setItem(k, s)
        localStorage.setItem('aemc-desktop:settings', JSON.stringify({ lastExportAt: Date.now(), remindOff: true, lastRemindDate: '' }))
        localStorage.setItem('__injected', '1')
      }
    } catch { /* 忽略 */ }
    // 記錄所有出現過的 toast 文字
    window.__toasts = []
    const seen = new WeakSet()
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('[role="status"]')) {
        const t = el.textContent ?? ''
        if (t && !seen.has(el)) { seen.add(el); window.__toasts.push(t) }
        else if (t && window.__toasts[window.__toasts.length - 1] !== t && !window.__toasts.includes(t)) window.__toasts.push(t)
      }
    }).observe(document, { subtree: true, childList: true, characterData: true })
  }, [s ? JSON.stringify(s) : null, KEY])
  if (extraInit) await ctx.addInitScript(extraInit)
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url)
  if (boot) await bootPage(page, hour)
  return { ctx, page, errors }
}

export async function bootPage(page, hour = 10) {
  const bt = page.getByRole('button', { name: '點擊以開始' })
  await bt.click()
  await bt.waitFor({ state: 'detached' })
  await page.waitForFunction(() => !!window.__farmStore && window.__farmStore.getState().status === 'ready', null, { timeout: 30000 }).catch(() => {})
  if (hour !== null) await page.evaluate((h) => { if (window.__overrides) { window.__overrides.weather = 'sunny'; window.__overrides.hour = h } }, hour)
  await page.waitForTimeout(300)
}

export async function newTab(ctx, url = NEW, hour = 10) {
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url)
  await bootPage(page, hour)
  return { page, errors }
}

/** 選單列顯示的金幣（沒有存檔 = null） */
export const menuPoints = (page) => page.evaluate(() => {
  const el = document.querySelector('header [aria-label^="金幣 "]')
  return el ? Number(el.getAttribute('aria-label').slice(3)) : null
})
export const stored = (page) => page.evaluate((k) => { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null }, KEY)
export const storedRaw = (page) => page.evaluate((k) => localStorage.getItem(k), KEY)
export const toasts = (page) => page.evaluate(() => window.__toasts ?? [])
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
