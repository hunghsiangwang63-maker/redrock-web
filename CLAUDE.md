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
- ✅ **入場扣點改「確認才扣」**（`checkinService`）：黑卡/單次券原本在產生 QR 時就預扣，未入場不回補→漏次數/鎖券；改為 `confirmCheckIn` 才扣（黑卡 `useBlackCard`、券標 used），扣點移到寫入場紀錄前；黑卡集合錯位根治改用 `legacyBlackCards`（與資格查詢同源）；取消還原（`checkinService` + `cancelCheckin` 路由共用 `restoreEntryCredits`）涵蓋黑卡/單次券/折扣卡/紅利。紅利原即「確認才扣＋防重複」未動。`/health` `1.2.0-deferred-deduction`
- ✅ **課程退費移出票券管理 → 待辦頁**：`PassesPage` 移除「課程退費」分頁（原僅列表無審核）；`PendingTasksPage` 新增「已完成任務」切換鈕，查詢已核准/已拒絕的課程退費/暫停（`getCourseAdjustmentRequests` 前端篩 `status!=='pending'`，唯讀）。審核入口（pending）仍在待辦頁，權限沿用 `course_adjustment`（主管/站台）
- ✅ **票券申請→票券審核移至待辦頁 + 待辦總覽改分內容分段**：`PassesPage` 移除「票券申請」分頁；`PendingTasksPage` 主列表由「按日期」改為「按內容分段」（票券/比賽/攀岩隊/體驗/課程/器材），新增「票券審核」追蹤面板（狀態篩選 待審核/已核准/已拒絕/全部，`getAllPassRequests`，與「課程已完成」互斥）。順修兩個後端 bug：`pendingTasks.js` 票券任務原讀錯集合 `passAdjustmentRequests`（空）→ 改讀 `passRequests`（真實申請所在，與建立/審核一致；原本真實票券申請從不顯示在待辦）、標題原誤用 `r.adjustmentType` → 改 `r.type`
- ✅ **親子共用電話入場誤解析修正**：子帳號繼承家長電話，一支電話對應多筆。手機入場 `CheckinPage.handlePhoneSearch`（`/members?q=`，`members.find` 取第一個＝最新＝子帳號）與後端 `getMemberByPhone`（`.limit(1)` 無排序／末四碼取最新）皆會誤解析到子會員。兩處統一改「優先回傳家長帳號（`!isChildAccount && !parentMemberId`），子會員由家長 children 清單選」。`getMemberByPhone` 目前唯一路徑(`/checkin/verify` 電話分支)實務上進不去（自助走 token），屬預防性硬化。參見 memory [[shared-phone-child-account-gotcha]]
- 🟡 **線上金流串接（進行中）**：統一付款元件 `src/components/PaymentFlow.jsx`（接 `client` prop，會員/員工通用；匯出 `ONLINE_PAYMENT_ENABLED`，正式環境 gateway 上線前為 false → 不顯示付款入口、fallback 匯款）
  - 已接會員自助：競賽 / 體驗 / 課程 / 租借（MemberCompetitions/Experience/Courses/Rental Page）
  - 後端 rail 與設計：見 `redrock-api/docs/payment-integration-plan.md`

## 待辦
- 各館金流商戶金鑰到位後：啟用 `ONLINE_PAYMENT_ENABLED` + 員工端 QR PaymentFlow（定期票/分期/入場）
- 資料移轉（Climbio 18,000+ 筆）
