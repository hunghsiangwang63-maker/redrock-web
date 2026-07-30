import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BASE = 'https://api.redrocktaiwan.com';
const RED = '#8B1A1A';
const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };

// 公開班別瀏覽頁（免登入）：一個班別（如「入門班」）底下可能有多個梯次（不同星期/館別），
// 訪客在這裡先看班別介紹，再挑要報名的梯次（週課→進報名頁；工作坊→再挑一個場次）。
// 連結格式：/book/category?id=<categoryId>
export default function PublicCourseCategoryPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const categoryId = params.get('id') || '';

  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [expandedWorkshop, setExpandedWorkshop] = useState(null);

  useEffect(() => {
    if (!categoryId) { setLoadErr('連結缺少班別資訊，請聯繫櫃檯'); return; }
    axios.get(`${BASE}/courses/public/category/${categoryId}`)
      .then(r => setData(r.data))
      .catch(() => setLoadErr('找不到此班別，可能已下架或連結錯誤'));
  }, [categoryId]);

  const wrap = { maxWidth: 480, margin: '0 auto', padding: '0 16px 60px', fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' };
  const card = { background: '#fff', borderRadius: 16, border: '1px solid #EEE2E2', padding: 18, marginTop: 16, boxShadow: '0 1px 3px rgba(80,20,20,.05)' };

  if (loadErr) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#A32D2D' }}>{loadErr}</div>;
  if (!data) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#999' }}>載入中…</div>;

  const { category, cohorts } = data;

  return (
    <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
      <div style={{ background: RED, color: '#fff', padding: '22px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>紅石攀岩 · {category.name}</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 4 }}>免註冊，選擇梯次後填表報名即可</div>
      </div>
      <div style={wrap}>
        {(category.imageUrl || category.description) && (
          <div style={card}>
            {category.imageUrl && <img src={category.imageUrl} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: 10, display: 'block' }} />}
            {category.description && <div style={{ fontSize: 13, color: '#666', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{category.description}</div>}
          </div>
        )}

        <div style={{ marginTop: 20, marginBottom: 10, fontWeight: 700, fontSize: 15 }}>選擇梯次（共 {cohorts.length} 個）</div>

        {cohorts.length === 0 && (
          <div style={{ ...card, textAlign: 'center', color: '#999' }}>目前沒有開放中的梯次，請聯繫櫃檯</div>
        )}

        {cohorts.map(c => (
          <div key={c.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {GYM_LABEL[c.gymId] || c.gymId}
                  {c.startDate && c.endDate && ` · ${c.startDate} ~ ${c.endDate}`}
                </div>
                <div style={{ marginTop: 6, fontSize: 14 }}>費用 <b style={{ color: RED }}>NT${c.price}</b></div>
              </div>
              {c.type !== 'workshop' && (
                <button onClick={() => navigate(`/book/course?course=${c.id}`)}
                  style={{ height: 38, padding: '0 16px', borderRadius: 10, background: RED, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                  報名 →
                </button>
              )}
              {c.type === 'workshop' && (
                <button onClick={() => setExpandedWorkshop(expandedWorkshop === c.id ? null : c.id)}
                  style={{ height: 38, padding: '0 16px', borderRadius: 10, background: '#fff', color: RED, border: `1px solid ${RED}`, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                  {expandedWorkshop === c.id ? '收合' : '選場次 ▾'}
                </button>
              )}
            </div>

            {c.type === 'workshop' && expandedWorkshop === c.id && (
              <div style={{ marginTop: 12, borderTop: '1px dashed #EEE', paddingTop: 12 }}>
                {(!c.sessions || c.sessions.length === 0) && <div style={{ fontSize: 13, color: '#999' }}>目前沒有開放中的場次</div>}
                {(c.sessions || []).map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F5EFEF' }}>
                    <div style={{ fontSize: 13 }}>🗓 {s.date}　⏰ {s.startTime}–{s.endTime}</div>
                    <button onClick={() => navigate(`/book/workshop?course=${c.id}&session=${s.id}`)}
                      style={{ height: 32, padding: '0 12px', borderRadius: 8, background: RED, color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' }}>
                      報名 →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 20, lineHeight: 1.8 }}>紅石攀岩 RedRock<br/>新竹館 03-6686635 · 士林館 02-28837591</div>
      </div>
    </div>
  );
}
