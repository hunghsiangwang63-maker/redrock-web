import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { publicClient } from '../../api/client';

const RED = '#8B1A1A';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 公開週課整期報名資訊頁（免登入可瀏覽課程資訊；實際報名需先登入或註冊會員）。
// 連結格式：/book/course?course=<courseId>
export default function PublicCourseEnrollPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('course') || '';

  const [course, setCourse] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [futureActiveCount, setFutureActiveCount] = useState(0);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    if (!courseId) { setLoadErr('連結缺少課程資訊，請聯繫櫃檯'); return; }
    publicClient.get(`/courses/public/${courseId}`)
      .then(r => {
        setCourse(r.data.course);
        setSessions(r.data.sessions || []);
        setFutureActiveCount(r.data.futureActiveCount ?? 0);
      })
      .catch(() => setLoadErr('找不到此課程，可能已下架或連結錯誤'));
  }, [courseId]);

  const estimatedFee = course?.pricePerSession ? course.pricePerSession * futureActiveCount : (course?.price || 0);
  const isLateJoinEstimate = course?.pricePerSession && course?.price && estimatedFee < course.price;
  const todayStr = dayjs().format('YYYY-MM-DD');
  const activeCount = sessions.filter(s => s.status !== 'cancelled').length;

  const goEnroll = () => navigate(`/member/courses?course=${courseId}`);

  const wrap = { maxWidth: 600, margin: '0 auto', padding: '0 16px 60px', fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' };
  const card = { background: '#fff', borderRadius: 16, border: '1px solid #EEE2E2', padding: 18, marginTop: 16, boxShadow: '0 1px 3px rgba(80,20,20,.05)' };

  if (loadErr) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#A32D2D' }}>{loadErr}</div>;
  if (!course) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#999' }}>載入中…</div>;

  return (
    <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
      <div style={{ background: RED, color: '#fff', padding: '22px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>紅石攀岩 · 課程報名</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 4 }}>免登入瀏覽課程資訊，登入或註冊會員後即可完成報名</div>
      </div>
      <div style={wrap}>
        <div style={card}>
          {course.categoryImageUrl && <img src={course.categoryImageUrl} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: 10, display: 'block' }} />}
          <div style={{ fontWeight: 700, fontSize: 16 }}>{course.name}</div>
          {(course.categoryDescription || course.description) && (
            <div style={{ marginTop: 6, fontSize: 13, color: '#666', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{course.categoryDescription || course.description}</div>
          )}
          <div style={{ marginTop: 10, background: '#FBF5F5', borderRadius: 10, padding: 12, fontSize: 14 }}>
            費用：<b style={{ color: RED, fontSize: 17 }}>NT${estimatedFee.toLocaleString()}</b>
            <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>（剩餘 {futureActiveCount} 堂）</span>
            {isLateJoinEstimate && (
              <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>此課程已開課，插班費用依剩餘場次計算（原整期 NT${course.price.toLocaleString()}），實際金額以登入後系統核算為準</div>
            )}
          </div>
        </div>

        {sessions.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#666', marginBottom: 10, textAlign: 'left' }}>
              📅 此梯次上課場次（共 {activeCount} 堂）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sessions.map(s => {
                const isCancelled = s.status === 'cancelled';
                const isPast = s.date < todayStr;
                return (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: isCancelled ? '#FBFBFB' : (isPast ? '#F5F5F5' : '#FBF5F5'), opacity: (isPast && !isCancelled) ? 0.6 : 1 }}>
                    <div style={{ fontSize: 13, color: isCancelled ? '#999' : '#1a1a1a', textAlign: 'left' }}>
                      {dayjs(s.date).format('MM/DD')}（{WEEKDAYS[dayjs(s.date).day()]}） {s.startTime}–{s.endTime}
                      {!isCancelled && s.instructor && <span style={{ color: '#999', marginLeft: 6 }}>· {s.instructor}</span>}
                    </div>
                    {isCancelled
                      ? <span style={{ fontSize: 10, fontWeight: 600, color: '#A32D2D', background: '#FCEBEB', padding: '2px 7px', borderRadius: 8, flexShrink: 0 }}>停課</span>
                      : (isPast && <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>已上課</span>)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
