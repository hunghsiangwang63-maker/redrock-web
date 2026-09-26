// 共用的前端錯誤回報工具（見 redrock-api index.js 的 POST /client-errors，純寫 log 不進
// Firestore）。原本只有 ErrorBoundary.jsx 用來回報「整棵樹被拆掉」的崩潰；這次擴充成任何
// try/catch 到的例外都能用同一支函式回報——React Error Boundary 只攔得到 render 階段的例外，
// 攔不到 event handler／async callback 裡丟出來的（例如 QRCode.toDataURL 這類第三方函式庫在
// 特定裝置環境失敗），這類例外原本只會被局部 catch 吞掉、設個錯誤訊息完事，完全沒有留下任何
// 可查的紀錄——2026-09-26 兩位會員（Grace ko／Sabrina Raso）產生入場 QR 卡住就是這種情況，
// 事後只能靠翻資料庫猜測，沒有實際錯誤內容可查。
const REPORT_URL = 'https://api.redrocktaiwan.com/client-errors';

export function reportClientError(error, label, extra = {}) {
  try {
    let memberId = '';
    try { memberId = JSON.parse(localStorage.getItem('member') || 'null')?.id || ''; } catch (e) { /* ignore */ }
    const payload = JSON.stringify({
      message: `[${label}] ${error?.message || String(error)}`,
      stack: error?.stack,
      componentStack: extra.componentStack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      memberId,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(REPORT_URL, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
    }
  } catch (e) { /* 回報本身絕不能再拋錯 */ }
}
