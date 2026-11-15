// 季節主題登錄＋判斷（會員端）。每一季＝一份設定檔（見 seasons/thanksgiving.jsx）。
// 期間：台灣日期 start～end（含首尾）自動啟用，結束自動恢復原樣，不用再部署。
// 預覽：網址加 ?season=<key>（如 ?season=christmas）可在期間外檢查畫面；舊的 ?thanksgiving=1 仍有效（＝感恩節）。預覽只是畫面，不寫入任何資料。
import thanksgiving from './thanksgiving.jsx';
import { pickActive, pickInbox } from './pick.js';

// 新增一季：在這裡 import 並加入 SEASONS，另在 styles/seasons.css 加 html[data-season="<key>"] 的變數區塊。
export const SEASONS = { thanksgiving };

const taipeiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function previewKey() {
  try {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.search);
    const k = q.get('season');
    if (k && SEASONS[k]) return k;
    if (q.get('thanksgiving') === '1') return 'thanksgiving';   // 舊預覽參數
  } catch { /* 無法取得網址就視為沒有預覽 */ }
  return null;
}

// 目前套用外觀的季節（沒有＝null）
export function getActiveSeason() {
  try {
    const pk = previewKey();
    if (pk) return SEASONS[pk];
    const today = taipeiToday();
    return pickActive(Object.values(SEASONS), today);
  } catch { return null; }
}

// 目前顯示收件匣的季節（寄送期間＋之後到 inboxEnd；多季重疊時取開始日最晚者）
export function getInboxSeason() {
  try {
    const pk = previewKey();
    if (pk) return SEASONS[pk];
    const today = taipeiToday();
    return pickInbox(Object.values(SEASONS), today);
  } catch { return null; }
}
