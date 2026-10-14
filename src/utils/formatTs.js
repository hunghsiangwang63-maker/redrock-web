import dayjs from 'dayjs';
// Firestore Timestamp（API 回傳序列化成 {_seconds}）→ 'YYYY-MM-DD HH:mm'，無值→'—'。
// 由三個審核彈窗（PassRequestReviewModal / CompetitionActionModal / CourseAdjustmentReviewModal）各自相同的 fmtTs 抽出（2026-10-14）。
// ⚠️ MemberProfilePage（可傳 format/fallback、也吃 {seconds}/ISO 字串）與 MembersPage（'YYYY/MM/DD HH:mm'、空值回空字串）的 fmtTs 行為不同，刻意不併入。
export const fmtTs = (ts) => ts?._seconds ? dayjs(ts._seconds * 1000).format('YYYY-MM-DD HH:mm') : '—';
