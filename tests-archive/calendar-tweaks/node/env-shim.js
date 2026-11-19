export const store = new Map()
/** 模擬儲存失敗：fail(key) 回傳 'get' | 'set' | null */
export const faults = { get: new Set(), set: new Set() }
globalThis.localStorage = {
  getItem: (k) => { if (faults.get.has(k)) throw new Error('get fail'); return store.has(k) ? store.get(k) : null },
  setItem: (k, v) => { if (faults.set.has(k)) throw new Error('set fail'); store.set(k, String(v)) },
  removeItem: (k) => store.delete(k),
}
/** window 的事件監聽器會記下來，測試可以送 storage 事件 */
export const listeners = []
globalThis.window = { innerWidth: 1920, innerHeight: 1000, addEventListener(type, fn) { listeners.push({ type, fn }) }, removeEventListener() {}, clearTimeout() {}, setTimeout: () => 1 }
globalThis.document = { addEventListener() {}, hidden: false }
export const fire = (type, ev) => { for (const l of listeners) if (l.type === type) l.fn(ev) }
