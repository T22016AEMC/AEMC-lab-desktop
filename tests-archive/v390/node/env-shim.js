export const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: (k) => store.delete(k),
}
globalThis.window = { innerWidth: 1920, innerHeight: 1000, addEventListener() {}, clearTimeout() {}, setTimeout: () => 1 }
globalThis.document = { addEventListener() {}, hidden: false }
