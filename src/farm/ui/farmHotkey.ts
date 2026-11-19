/**
 * v3.9.0 農場（擺設）模式的快捷鍵 E（純函式，可在 Node 測試）：
 *  - 只認單獨的 E（大小寫都可以），按著 Ctrl／Alt／Meta 不算，按住不放的重複觸發不算
 *  - 焦點在輸入框、多行文字框、下拉選單或可編輯內容裡（輸入文字中）不觸發
 *  - blocked（有對話框、工具、啟動台、遊戲視窗開著）不觸發：計算機用 e 輸入常數、遊戲可能用到按鍵
 * 現有的全域快捷鍵只有 F4（啟動台），不衝突。
 */
export function isFarmHotkey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat' | 'target' | 'isComposing'>, blocked: boolean): boolean {
  if (blocked || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return false
  if (e.key !== 'e' && e.key !== 'E') return false
  return !isTyping(e.target)
}

export function isTyping(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean } | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}
