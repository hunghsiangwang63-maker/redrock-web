// 感恩節主題（2026-11-22 ～ 2026-11-29，台灣時間）：只在期間內啟用，期間結束自動恢復原樣，不用再部署。
// 網址加 ?thanksgiving=1 可在期間外預覽（僅供檢查畫面，不寫入任何資料）。
// 做法（與萬聖節逐頁寫三元運算不同）：集中一個開關＋一份全域樣式（styles/thanksgiving.css，以 html[data-season] 套用到所有會員頁）
// ＋共用裝飾元件（components/ThanksgivingDeco.jsx）；各頁只在需要「額外裝飾」時才引用元件。
export const THANKSGIVING_START = '2026-11-22';
export const THANKSGIVING_END = '2026-11-29';

export function isThanksgiving() {
  try {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('thanksgiving') === '1') return true;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return today >= THANKSGIVING_START && today <= THANKSGIVING_END;
  } catch { return false; }
}
