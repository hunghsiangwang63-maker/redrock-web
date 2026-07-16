import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMember } from '../store/memberStore.jsx';

// 會員頁右上角登出圖示（各會員 app 頁共用）。SVG 繪製避免缺字 tofu；點擊先確認再登出。
// inline=true：不固定定位、嵌進既有 header 列（如首頁）；預設 fixed 浮動於右上角。
export default function MemberLogoutButton({ inline = false }) {
  const { logout } = useMember();
  const navigate = useNavigate();
  const [ask, setAsk] = useState(false);
  const btnStyle = inline
    ? { width: 34, height: 34, borderRadius: 17, background: '#fff', border: '0.5px solid #E8D5D5', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }
    : { position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', right: 10, zIndex: 120, width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,.92)', border: '0.5px solid #E8D5D5', boxShadow: '0 1px 4px rgba(0,0,0,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 };
  return (
    <>
      <button onClick={() => setAsk(true)} title="登出" aria-label="登出" style={btnStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
      {ask && (
        <div onClick={() => setAsk(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 320 }}>
            <div style={{ fontSize: 16, fontWeight: 600, textAlign: 'center', marginBottom: 6 }}>確認登出？</div>
            <div style={{ fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 20 }}>登出後需重新輸入手機號碼與密碼</div>
            <button onClick={() => { logout(); navigate('/member/login'); }}
              style={{ width: '100%', height: 48, borderRadius: 12, background: '#A32D2D', color: '#fff', border: 'none', fontSize: 15, fontWeight: 500, cursor: 'pointer', marginBottom: 10 }}>確認登出</button>
            <button onClick={() => setAsk(false)}
              style={{ width: '100%', height: 44, borderRadius: 12, border: '0.5px solid #E8D5D5', background: '#fff', fontSize: 14, color: '#444', cursor: 'pointer' }}>取消</button>
          </div>
        </div>
      )}
    </>
  );
}
