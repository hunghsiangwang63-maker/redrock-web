# RedRock 紅石攀岩館 — 系統說明

> 本檔已可安全提交（無機密）。測試帳號 / 金鑰等敏感資料見 `CLAUDE.local.md`（git-ignored）。

## 專案概述
RedRock 紅石攀岩館管理系統，服務兩個場館：新竹館（`gym-hsinchu`）和士林館（`gym-shilin`）。

## 架構
- **前端**（本 repo）：`~/Downloads/redrock-web`（React 18 + Vite）
  - 會員端：`redrock-member.web.app` → `app.redrocktaiwan.com`
  - 員工端：`redrock-staff.web.app` → `staff.redrocktaiwan.com`
  - **部署（本機 build，非自動）**：`BUILD_TARGET=staff npx vite build && BUILD_TARGET=member npx vite build && firebase deploy --only hosting --project redrock-dev-a35c1`
- **後端**：`~/Downloads/redrock-api`（Node.js + Express）→ git push 觸發 Railway 自動部署
- **資料庫**：Firebase Firestore（`redrock-dev-a35c1`）｜**認證**：JWT（secret 走環境變數）

## 機密管理
- 本檔不放機密；測試帳號見 `CLAUDE.local.md`（git-ignored）。
- 金鑰一律走環境變數 / Firestore，不進前端 bundle、不進版控。
- GitHub push 走 macOS Keychain（已設定）。

## 重要注意事項
1. **前端 build 在本機執行**（GitHub Actions Linux rolldown bug）；build 後 `firebase deploy`
2. 路由順序：`/my/children` 必須在 `/:id` 之前
3. 子會員代簽 waiver / 墜落測驗同意書直接 `isComplete: true`
4. 金額 / 場館一律後端權威，前端不送這些值

## 目前進度（2026-06）
- ✅ 竹北館 → 士林館全面改名（前後端 + Firestore migration）
- ✅ 全面 bug 健檢：修復約 43 項邏輯 bug
- ✅ **改週課課表→孤兒場次轉移**（員工端 `CoursesPage`，後端 `courseService.createWeeklySessions`）
  - 觸發：編輯週課若「上課星期 / 起訖日」有變動，存檔後自動重排場次（`handleUpdateCourse` → `handleGenerateSessions`）
  - 後端 `createWeeklySessions({ confirm })` 兩段式：`confirm:false` 預覽（不寫入，回傳孤兒清單）→ `confirm:true` 執行（刪空場次→建新場次→轉移孤兒報名）
  - 孤兒＝有學員但日期已不在新課表的場次；轉移到「最接近的新場次」（同週優先，其次最近日，平手取較早），confirmed 超過 `maxStudents` 則**保留原場次不超賣**
  - 轉移同步 `sessionId/date/時間/gymAccessStart/End`，**不動費用/付款**；前端確認 Modal 列出受影響會員與轉入日期
  - 純函式 `planRegenerate`/`pickNearestDate` 供預覽與執行共用（一致）；`/health` version 標記 `1.1.0-orphan-transfer`
- 🟡 **線上金流串接（進行中）**：統一付款元件 `src/components/PaymentFlow.jsx`（接 `client` prop，會員/員工通用；匯出 `ONLINE_PAYMENT_ENABLED`，正式環境 gateway 上線前為 false → 不顯示付款入口、fallback 匯款）
  - 已接會員自助：競賽 / 體驗 / 課程 / 租借（MemberCompetitions/Experience/Courses/Rental Page）
  - 後端 rail 與設計：見 `redrock-api/docs/payment-integration-plan.md`

## 待辦
- 各館金流商戶金鑰到位後：啟用 `ONLINE_PAYMENT_ENABLED` + 員工端 QR PaymentFlow（定期票/分期/入場）
- 資料移轉（Climbio 18,000+ 筆）
