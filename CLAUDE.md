# virtual-desktop 專案規則

macOS 風格虛擬桌面網頁（React + TypeScript + Vite + zustand + Tailwind），部署於 GitHub Pages。

## 版本規則（每次修改程式後都必須遵守）

1. 更新 `package.json` 的 `version`，依語意化版本：
   - 修正錯誤 → 第三碼 +1（1.0.0 → 1.0.1）
   - 新增功能 → 第二碼 +1，第三碼歸零（1.0.1 → 1.1.0）
   - 重大改版或不相容變更 → 第一碼 +1，其餘歸零（1.1.0 → 2.0.0）
2. 在 `CHANGELOG.md` 最上方新增該版本紀錄：版本號、日期、變更內容（中文）。
3. 完成後建立 git commit，訊息格式「vX.Y.Z: 變更摘要」，並加上 git tag `vX.Y.Z`。

## 版本規劃

- 階段一（桌面主體）完成為 v1.0.0
- 階段二（小遊戲）完成為 v1.1.0

## 新增小程式

只修改 `src/config/apps.ts`，不要動其他檔案。

## GitHub 與部署

- 帳號：`T22016AEMC`（個人帳號，非組織）；repo：`T22016AEMC/AEMC-lab-desktop`（公開）。
- 正式網址：https://t22016aemc.github.io/AEMC-lab-desktop/
- `BASE_PATH` 由 GitHub Actions 自動帶入 `/AEMC-lab-desktop/`；本機開發為 `/`。
- 套件管理器：npm。
- git 作者只設在本專案（不加 `--global`）：`user.name` = `T22016AEMC`、`user.email` = `t22016@aemc.com.tw`。
- GitHub Pages 來源必須是「GitHub Actions」，push 到 main 時由 workflow 自動 build 並部署。

### 推送流程（之後的更新都依此執行）

1. 本機完成修改，依版本規則更新 version / CHANGELOG，`npm run build` 確認成功，commit 並打 tag。
2. 只有在使用者確認後才推送；不要自行推送。
3. 推送前先執行 `gh auth status`，確認已登入且帳號是 `T22016AEMC`。若未安裝 gh、未登入或帳號不符，停下來告訴使用者該怎麼做，不要改用其他方式。
4. 首次推送：建立公開 repo `T22016AEMC/AEMC-lab-desktop`，推送 main 與 tag，並用 `gh api` 將 Pages 來源設為 GitHub Actions。之後的版本直接 `git push origin main --follow-tags`。
5. 確認 Actions 部署成功後，告訴使用者正式網址。

### 階段流程

- 階段一（v1.0.0）完成並 build 成功後，先停下來，告知本機預覽指令與網址，等使用者確認畫面後再推送。
- 推送與部署完成後，才開始階段二（v1.1.0）。

## 其他約定

- 「關於這個桌面」顯示的版本號必須從 `package.json` 讀取，不可寫死。
- 嵌入程式的 iframe 不可加 `sandbox` 屬性（需支援檔案上傳與下載）。
- 小遊戲不使用外部圖片素材，一律以程式繪製；每個遊戲放在 `src/games/<遊戲名稱>/`。
- 最高分等 localStorage 讀寫一律包在 try/catch 中。
