import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicClient } from '../../api/client';

const RED = '#8B1A1A';

// 公開單堂工作坊資訊頁（免登入可瀏覽場次資訊；實際報名需先登入或註冊會員）。
// 連結格式：/book/workshop?course=<courseId>&session=<sessionId>
export default function PublicWorkshopEnrollPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('course') || '';
  const sessionId = params.get('session') || '';

  const [course, setCourse] = useState(null);
  const [session, setSession] = useState(null);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    if (!courseId || !sessionId) { setLoadErr('連結缺少課程/場次資訊，請聯繫櫃檯'); return; }
    publicClient.get(`/courses/public/${courseId}`)
      .then(r => {
        setCourse(r.data.course);
        const s = (r.data.sessions || []).find(x => x.id === sessionId);
        if (!s || s.status === 'cancelled') { setLoadErr('找不到此場次，可能已額滿、已結束或已取消'); return; }
        setSession(s);
      })
      .catch(() => setLoadErr('找不到此課程，可能已下架或連結錯誤'));
  }, [courseId, sessionId]);

  const goEnroll = () => navigate(`/member/courses?course=${courseId}`);

  const wrap = { maxWidth: 600, margin: '0 auto', padding: '0 16px 60px', fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' };
  const card = { background: '#fff', borderRadius: 16, border: '1px solid #EEE2E2', padding: 18, marginTop: 16, boxShadow: '0 1px 3px rgba(80,20,20,.05)' };

  if (loadErr) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#A32D2D' }}>{loadErr}</div>;
  if (!course || !session) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#999' }}>載入中…</div>;

  return (
    <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
      <div style={{ background: RED, color: '#fff', padding: '22px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>紅石攀岩 · 工作坊報名</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 4 }}>免登入瀏覽場次資訊，登入或註冊會員後即可完成報名</div>
      </div>
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{course.name}</div>
          {course.description && <div style={{ marginTop: 6, fontSize: 13, color: '#666', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{course.description}</div>}
          <div style={{ marginTop: 8, fontSize: 14, color: '#555' }}>🗓 {session.date}　⏰ {session.startTime}–{session.endTime}</div>
          <div style={{ marginTop: 10, background: '#FBF5F5', borderRadius: 10, padding: 12, fontSize: 14 }}>
            費用：<b style={{ color: RED, fontSize: 17 }}>NT${course.price}</b>
          </div>
        </div>

        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>登入或註冊會員即可完成報名</div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 6, lineHeight: 1.7 }}>報名需簽署課程同意書並確認繳費方式，請先登入紅石會員帳號（尚未有帳號可直接註冊）</div>
          <button onClick={goEnroll}
            style={{ width: '100%', height: 50, borderRadius: 12, background: RED, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 16 }}>
            登入 / 註冊並報名 →
          </button>
        </div>

        <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 14, lineHeight: 1.8 }}>紅石攀岩 RedRock<br/>新竹館 03-6686635 · 士林館 02-28837591</div>
      </div>
    </div>
  );
}
