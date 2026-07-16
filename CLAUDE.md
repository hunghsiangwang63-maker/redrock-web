# RedRock 紅石攀岩館 — 前端（redrock-web）

> 本檔＝**前端專屬重點**（架構 / 部署 / 慣例）。**完整「目前進度 / 待辦 / 歷史」統一寫在後端那份：`../redrock-api/CLAUDE.md`**（避免兩份長檔重複維護、消除多 session 併行碰撞）。
> 本檔已可安全提交（無機密）。測試帳號見 `CLAUDE.local.md`（git-ignored，僅本機）。

## 為什麼進度集中在 api 那份
前後端**各自 repo、各自 commit**，但進度日誌（每輪功能、bug 修復、E2E）**一律記在 `redrock-api/CLAUDE.md`**（前後端變更都寫那一份、含前端 commit hash）。本檔只放不常變的前端重點。
- ⚠️ **落地守則（2026-07-16 踩雷）**：改完任何 `CLAUDE.md` 後**必先 `git status` 確認該檔真的 modified、再 `git add && git commit`**，commit 完 `git show HEAD:CLAUDE.md | wc -l` 核對；別假設「Edit 成功＝落地」。**一次只讓一個 session 動 CLAUDE.md**。詳見 `../redrock-api/docs/maintaining-context.md`。

## 架構
- **React 18 + Vite**，單一 codebase 用 `BUILD_TARGET` 分兩站：
  - 會員端：`redrock-member.web.app` → `app.redrocktaiwan.com`
  - 員工端：`redrock-staff.web.app` → `staff.redrocktaiwan.com`
- 後端 API：`https://api.redrocktaiwan.com`（`src/api/client.js` `BASE`＋少數頁面 fallback 皆指此；經 Porkbun CNAME → Railway，故障轉移改一筆 CNAME 即可、前端免重發）。
- Firebase 專案：`redrock-dev-a35c1`（Hosting 兩站 + Firestore + Storage）。

## 部署（本機 build，非自動）
```
BUILD_TARGET=staff npx vite build && BUILD_TARGET=member npx vite build && \
firebase deploy --only hosting --project redrock-dev-a35c1
```
- **本機 build**（不用 GitHub Actions：Linux rolldown bug）；改完前端要自己 build + deploy（後端才是 push 觸發 Railway 自動部署）。
- 快取：`firebase.json` 兩站 `index.html`＝`no-cache, must-revalidate`（部署後自動載新版）、`/assets/**`＝`immutable`（永久快取、改版檔名變）。部署前就已快取的舊頁仍需最後一次硬重載/`?v=`；**PWA 主畫面圖示**快取最頑固、改版要刪圖示重加。

## 前端慣例（踩過雷、務必遵守）
- **token key**：`src/api/client.js` 工作端優先 `operatorToken`（值班）→ `token`（個人登入）→ `stationToken`（館別電腦）；會員端 `member_token`。**沒有 `staffToken`**——下載/檔案類請求一律走 axios `client`（自動帶對的 token），別自己 `fetch` + 手讀 localStorage。
- **段落內文置左、標題置中**（`[[ui-text-alignment]]`）：新畫面段落/描述/提醒類一律 `textAlign:left`，只有標題/空狀態/按鈕/數字置中。
- **小圖示用 CSS/SVG 繪製、別用字元**（`[[ui-icon-css-not-glyph]]`）：✓✗ 等單色符號在缺字裝置變黑方塊（tofu）；彩色 emoji 安全。
- **按鈕必設 `color`**（`[[ui-button-explicit-color]]`）：root 有 `color-scheme: light dark`，深色模式下未設色的按鈕文字會變白隱形。
- **金額 / 場館 / 資格一律信後端**（後端權威計算），前端只顯示。
- **命名衝突**：元件內 `const` 勿與模組層同名（會 shadow→runtime 崩潰）；vite build 抓不到這類 ReferenceError/shadow → **改完前端要實機開該頁**（build 通過 ≠ 沒崩）。
- **會員端輕量雙語** `src/utils/memberI18n.js`（`t(中文)` 以中文原文為 key，中文模式/查無對照原樣返回→中文版零影響）。

## 機密
- 後端機密（`JWT_SECRET`、金流 `paymentSettings`、Firebase 憑證）走環境變數 / Firestore，**不進前端 bundle**。
- GitHub push 走 macOS Keychain；勿在任何檔案明文放 PAT。
