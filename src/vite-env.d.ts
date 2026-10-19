/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** 由 vite.config.ts 在建置時從 package.json 注入 */
declare const __APP_VERSION__: string
/** 由 vite.config.ts 在建置時從 CHANGELOG.md 最上方的版本紀錄注入（YYYY-MM-DD） */
declare const __APP_DATE__: string
