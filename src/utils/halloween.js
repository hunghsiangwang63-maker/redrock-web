// 萬聖節主題（2026-10-26 ～ 2026-11-08，台灣時間）：只在期間內顯示裝飾與祝福語，期間結束自動恢復原樣。
// 網址加 ?halloween=1 可在期間外預覽（僅供檢查畫面，不寫入任何資料）。
export const HALLOWEEN_START = '2026-10-26';
export const HALLOWEEN_END = '2026-11-08';

export function isHalloween() {
  try {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('halloween') === '1') return true;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return today >= HALLOWEEN_START && today <= HALLOWEEN_END;
  } catch { return false; }
}

// 吉祥物依日期輪流（台灣時間；自 HALLOWEEN_START 起算，偶數天＝小紅石巫師、奇數天＝小魔女）。
// 網址加 ?hwmascot=witch 或 ?hwmascot=red 可強制預覽另一位（僅供檢查畫面）。
export function halloweenMascot() {
  try {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('hwmascot') : null;
    if (q === 'witch') return 'witch';
    if (q === 'red') return 'mascot2';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const days = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(HALLOWEEN_START + 'T00:00:00Z')) / 86400000);
    return (((days % 2) + 2) % 2) === 0 ? 'mascot2' : 'witch';
  } catch { return 'mascot2'; }
}
