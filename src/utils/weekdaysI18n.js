// 星期幾多語顯示（隨會員語言：週四 / Thu / 木）。由 MemberCoursesPage、PublicCourseCategoryPage 兩份相同實作抽出（2026-10-14）。
// 員工端不要 import 這份（會把 memberI18n 帶進 staff bundle）——員工端只用 utils/weekdays 的 WEEKDAYS。
import { tt, isEn } from './memberI18n';
import { WEEKDAYS } from './weekdays';

export const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WD_JA = ['日', '月', '火', '水', '木', '金', '土'];
// 單一星期幾（傳入 0-6 的 index）
export const wdShort = (idx) => tt(WEEKDAYS[idx], WD_EN[idx], WD_JA[idx]);
// 多個星期幾的清單，供「每週一、三、五」這類重複班表使用
export const wdList = (days) => (days || []).map(wdShort).join(isEn() ? ', ' : '、');
