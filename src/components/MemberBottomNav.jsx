import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { t } from '../utils/memberI18n';
import { memberClient } from '../api/client';

// 會員端底部固定導航（2026-09-02 從 11 個頁面各自重複定義的 BottomNav 抽出共用元件，
// 原因：新增「問題諮詢」項目＋未讀角標需要一致的資料來源，改 11 處各自維護風險太高）。
// 每次頁面掛載都會重新檢查未讀狀態（本 app 各頁為獨立元件、切頁即整個重新掛載，故不需
// 額外依賴切頁事件；提問頁讀取回覆後回上一頁時角標會在下個頁面掛載時自動消失）。
export default function MemberBottomNav({ navigate }) {
  const location = useLocation();
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    memberClient.get('/member-inquiries/unread-count')
      .then(r => setHasUnread((r.data?.count || 0) > 0))
      .catch(() => {});
  }, []);

  const items = [
    { icon:'🏠', label:'首頁',     path:'/member/home' },
    { icon:'📚', label:'課程總覽', path:'/member/courses' },
    { icon:'🎫', label:'我的票券', path:'/member/passes' },
    { icon:'❓', label:'問題諮詢', path:'/member/inquiries', badge: hasUnread },
    { icon:'👤', label:'我的',     path:'/member/profile' },
  ];

  return (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, width:'100%', background:'#fff', borderTop:'0.5px solid #E8D5D5', display:'flex', height:60, paddingBottom:'env(safe-area-inset-bottom)', zIndex:50 }}>
      {items.map(n => {
        const active = location.pathname === n.path;
        return (
          <div key={n.path} onClick={() => navigate(n.path)}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, cursor:'pointer', color: active ? '#8B1A1A' : '#999' }}>
            <div style={{ position:'relative', fontSize:20 }}>
              {n.icon}
              {n.badge && <div style={{ position:'absolute', top:-2, right:-6, width:8, height:8, borderRadius:'50%', background:'#C0392B', border:'1.5px solid #fff' }} />}
            </div>
            <div style={{ fontSize:10, fontWeight: active ? 600 : 400 }}>{t(n.label)}</div>
          </div>
        );
      })}
    </div>
  );
}
