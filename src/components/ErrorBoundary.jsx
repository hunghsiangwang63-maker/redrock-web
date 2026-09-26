import { Component } from 'react';

// 回報「顯示QR時內容全黑、像卡在頁面轉場的空白畫面、等待也不會恢復」——查證全站原本沒有任何
// React Error Boundary：任何未捕捉的 render 例外都會讓 React 把整棵樹直接卸載、只剩空的
// #root，而 html/body/#root 皆無明確背景色，系統深色模式下會落回接近全黑的 CSS 變數，看起來
// 就像「卡死的黑屏」——使用者留在同一個網頁、畫面全黑、怎麼等都不會恢復，正好對得上症狀。
// 這個元件包住整個 App：崩潰時不再讓使用者卡在無法辨識的黑畫面，改顯示「發生錯誤／重新整理」
// 且用 sendBeacon 盡力回報錯誤內容到後端（見 index.js /client-errors，純寫 log 不進 Firestore），
// 下次真的再發生時才有實際的錯誤訊息可查，不用再靠猜的。
// ⚠️ 刻意不依賴任何其他 app 內部模組（i18n/store/api client 等）——這是最後一道防線，要越簡單
//   越不容易「連錯誤畫面本身也一起壞掉」。
const REPORT_URL = 'https://api.redrocktaiwan.com/client-errors';

const reportError = (error, info) => {
  try {
    let memberId = '';
    try { memberId = JSON.parse(localStorage.getItem('member') || 'null')?.id || ''; } catch (e) { /* ignore */ }
    const payload = JSON.stringify({
      message: error?.message,
      stack: error?.stack,
      componentStack: info?.componentStack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      memberId,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(REPORT_URL, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
    }
  } catch (e) { /* 回報本身絕不能再拋錯，否則會蓋掉下面的錯誤畫面 */ }
};

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportError(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', width: '100%', background: '#F7F3F3',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center', boxSizing: 'border-box',
        }}>
          <div style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontWeight: 700, fontSize: 20, color: '#8B1A1A', marginBottom: 16 }}>
            RedRock
          </div>
          <div style={{ fontSize: 16, color: '#333', marginBottom: 8, fontWeight: 600 }}>發生錯誤</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 24, lineHeight: 1.6, maxWidth: 320 }}>
            頁面出了點問題，請重新整理再試一次；如持續發生請告知櫃檯或客服。
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ height: 44, padding: '0 28px', borderRadius: 22, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
          >
            重新整理
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
