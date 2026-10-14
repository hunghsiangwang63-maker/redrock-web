import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// 員工端「資料載入失敗」全域提示（觸發來源：api/client.js 的 staff-load-error 事件）。
// 目的：各頁 catch (e) {} 吞掉錯誤後畫面會變空清單，使用者誤以為「沒有資料」。
// 切換頁面自動清除；已在頁面內自己顯示錯誤的端點（課程頁）不重複提示。
const LOCALLY_REPORTED = ['/courses', '/course-categories']; // CoursesPage 自己有提示＋重新載入
const LABELS = [
  ['/members', '會員'], ['/checkin', '入場'], ['/passes', '票券'], ['/pass-', '票券'], ['/products', '商品'],
  ['/invoices', '發票'], ['/daily-settlements', '結帳'], ['/revenue', '營收'], ['/rentals', '租借'],
  ['/competitions', '比賽'], ['/experience', '體驗課程'], ['/schedule', '排班'], ['/settings', '設定'],
  ['/gyms', '場館'], ['/staff', '員工'], ['/vip', 'VIP'], ['/installments', '分期'], ['/transfers', '待收款'],
  ['/notifications', '通知'], ['/fall-test', '墜落測驗'], ['/climb-levels', '等級考核'], ['/stations', '館別電腦'],
];
const labelOf = (url) => {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const hit = LABELS.find(([prefix]) => path.startsWith(prefix));
  return hit ? hit[1] : '部分';
};
const isLocal = (url) => {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  return LOCALLY_REPORTED.some(p => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'));
};

export default function LoadErrorBanner() {
  const [err, setErr] = useState(null); // { labels:Set, detail }
  const location = useLocation();
  useEffect(() => { setErr(null); }, [location.pathname]);
  useEffect(() => {
    const onErr = (ev) => {
      const { url = '', detail = '' } = ev.detail || {};
      if (isLocal(url)) return;
      setErr(cur => {
        const labels = new Set(cur?.labels || []);
        labels.add(labelOf(url));
        return { labels, detail: cur?.detail || detail };
      });
    };
    window.addEventListener('staff-load-error', onErr);
    return () => window.removeEventListener('staff-load-error', onErr);
  }, []);
  if (!err) return null;
  const names = [...err.labels].join('、');
  return (
    <div role="alert" style={{ background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:8, padding:'10px 14px', margin:'12px 20px 0', fontSize:13, color:'#A32D2D', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
      <span>⚠️ {names}資料載入失敗（{err.detail}），畫面上的空白或缺漏不代表沒有資料。</span>
      <span style={{ display:'flex', gap:12, alignItems:'center' }}>
        <button onClick={() => window.location.reload()}
          style={{ border:'0.5px solid #A32D2D', background:'#fff', color:'#A32D2D', borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer' }}>重新整理</button>
        <span style={{ cursor:'pointer' }} onClick={() => setErr(null)}>✕</span>
      </span>
    </div>
  );
}
