import { useState, useEffect } from 'react';
import client from '../api/client';
import UniformPanel from './UniformPanel';

// 員工端會員詳情：小蜘蛛人（目前等級＋制服領取）。沒有任何等級或制服資料時只顯示一行小連結，不佔版面。
export default function MemberSpiderSection({ memberId, isAdmin }) {
  const [lv, setLv] = useState(null);
  const [open, setOpen] = useState(false);
  const [cnt, setCnt] = useState(null);

  useEffect(() => {
    let alive = true;
    client.get(`/climb-levels/member/${memberId}`).then(r => { if (alive) setLv(r.data); }).catch(() => { if (alive) setLv({ records: [] }); });
    client.get(`/uniforms/member/${memberId}`).then(r => { if (alive) setCnt((r.data.issues || []).length); }).catch(() => { if (alive) setCnt(0); });
    return () => { alive = false; };
  }, [memberId]);

  if (lv === null || cnt === null) return null;
  const hasLevels = (lv.records || []).some(r => !r.voided);
  const hasAny = hasLevels || cnt > 0;
  if (!hasAny && !open) {
    return (
      <div style={{ padding: '8px 0', borderBottom: '1px solid #F5EFEF', fontSize: 12 }}>
        <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: 0 }}>🕷 小蜘蛛人：＋記錄制服領取</button>
      </div>
    );
  }
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #F5EFEF' }}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 6, fontWeight: 600, letterSpacing: .5 }}>🕷 小蜘蛛人</div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        <span style={{ color: '#6b6b6b' }}>目前等級　</span>
        <b style={{ color: lv.currentLevel ? '#8B1A1A' : '#999' }}>{lv.currentLevel ? `已通過 ${lv.currentLevel} 級` : '尚未通過任何級'}</b>
        {hasLevels && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 8 }}>（共 {(lv.records || []).filter(r => r.passed && !r.voided).length} 級通過紀錄；詳見「等級考核」）</span>}
      </div>
      <div style={{ fontSize: 12, color: '#6b6b6b', fontWeight: 600, marginBottom: 2 }}>👕 制服領取</div>
      <UniformPanel memberId={memberId} isAdmin={isAdmin} onChange={() => setCnt(c => (c || 0) + 1)} />
    </div>
  );
}
