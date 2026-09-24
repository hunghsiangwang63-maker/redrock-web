import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicClient } from '../../api/client';
import { t, tt, toggleMemberLang, nextLangLabel } from '../../utils/memberI18n';

const RED = '#8B1A1A';
const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };

// 公開課程總覽（免登入，第一層：全部班別）：訪客先在這裡挑班別（如「入門班」），
// 點進去到既有的公開班別頁（/book/category?id=）挑梯次，最後到 /book/course 或 /book/workshop 報名。
// 資料來源 GET /courses/public/categories。連結格式：/book/courses
export default function PublicCoursesPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState(null);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    publicClient.get('/courses/public/categories')
      .then(r => setCategories(r.data.categories || []))
      .catch(() => setLoadErr(t('載入失敗，請稍後再試')));
  }, []);

  const wrap = { maxWidth: 600, margin: '0 auto', padding: '0 16px 60px', fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' };
  const card = { background: '#fff', borderRadius: 16, border: '1px solid #EEE2E2', padding: 14, marginTop: 14, boxShadow: '0 1px 3px rgba(80,20,20,.05)', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center' };
  const langBtn = { position: 'absolute', right: 16, top: 16, height: 26, padding: '0 10px', borderRadius: 13, border: '0.5px solid rgba(255,255,255,.5)', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' };

  if (loadErr) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#A32D2D' }}>{loadErr}</div>;
  if (!categories) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#999' }}>{t('載入中…')}</div>;

  return (
    <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
      <div style={{ background: RED, color: '#fff', padding: '22px 16px', textAlign: 'center', position: 'relative' }}>
        <div onClick={toggleMemberLang} style={langBtn}>🌐 {nextLangLabel()}</div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>{t('紅石攀岩')} · {t('課程總覽')}</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 4 }}>{t('免登入即可瀏覽，選擇梯次後登入或註冊會員即可報名')}</div>
      </div>
      <div style={wrap}>
        {categories.length === 0 && (
          <div style={{ ...card, cursor: 'default', textAlign: 'center', color: '#999', justifyContent: 'center' }}>{t('目前沒有開放中的課程')}</div>
        )}
        {categories.map(cat => (
          <div key={cat.id} style={card} onClick={() => navigate(`/book/category?id=${cat.id}`)}>
            {cat.imageUrl && (
              <img src={cat.imageUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{cat.name}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                {cat.gymIds.map(g => t(GYM_LABEL[g] || g)).join('・')}
                {' · '}{tt(`${cat.cohortCount} 梯`, `${cat.cohortCount} batches`, `${cat.cohortCount} 期`)}
              </div>
              <div style={{ marginTop: 6, fontSize: 14 }}>
                <b style={{ color: RED }}>
                  NT${cat.priceMin}{cat.priceMax !== cat.priceMin ? ` ~ NT$${cat.priceMax}` : ''}
                </b>
              </div>
            </div>
            <div style={{ fontSize: 20, color: RED, flexShrink: 0 }}>›</div>
          </div>
        ))}
        <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 20, lineHeight: 1.8 }}>紅石攀岩 RedRock<br/>新竹館 03-6686635 · 士林館 02-28837591</div>
      </div>
    </div>
  );
}
