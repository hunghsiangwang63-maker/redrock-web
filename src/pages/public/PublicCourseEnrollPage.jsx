import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import SignaturePad from '../../components/SignaturePad';

const BASE = 'https://api.redrocktaiwan.com';
const RED = '#8B1A1A';

const under18 = (b) => { if (!b) return false; const d = new Date(b); const age = (Date.now() - d.getTime()) / (365.25 * 864e5); return age >= 0 && age < 18; };
const under5 = (b) => { if (!b) return false; const d = new Date(b); const age = (Date.now() - d.getTime()) / (365.25 * 864e5); return age >= 0 && age < 5; };

// 公開週課整期報名（免登入、訪客，先轉帳）。連結格式：/book/course?course=<courseId>
export default function PublicCourseEnrollPage() {
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('course') || '';

  const [course, setCourse] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [bankAccounts, setBankAccounts] = useState({});
  const [loadErr, setLoadErr] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestBirthday, setGuestBirthday] = useState('');
  const [healthNote, setHealthNote] = useState('');
  const [agreedPolicy, setAgreedPolicy] = useState(false);
  const [bankLastFive, setBankLastFive] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const sigRef = useRef(null);
  const guardianSigRef = useRef(null);

  useEffect(() => {
    if (!courseId) { setLoadErr('連結缺少課程資訊，請聯繫櫃檯'); return; }
    axios.get(`${BASE}/courses/public/${courseId}`)
      .then(r => { setCourse(r.data.course); setSessions(r.data.sessions || []); })
      .catch(() => setLoadErr('找不到此課程，可能已下架或連結錯誤'));
    axios.get(`${BASE}/settings/bank-accounts/member`).then(r => setBankAccounts(r.data.bankAccounts || {})).catch(() => {});
  }, [courseId]);

  const isMinor = under18(guestBirthday);
  const bank = course ? bankAccounts[course.gymId] : null;
  // 週課插班：實收＝單堂價×剩餘場次（sessions 已是後端過濾過的「未來場次」，全期報名時剛好等於課程總價，無需另外分支）
  const estimatedFee = course?.pricePerSession ? course.pricePerSession * sessions.length : (course?.price || 0);
  const isLateJoinEstimate = course?.pricePerSession && course?.price && estimatedFee < course.price;

  const submit = async () => {
    setErr('');
    if (!guestName.trim()) return setErr('請填寫姓名');
    if (!guestPhone.trim()) return setErr('請填寫聯絡電話');
    if (!guestBirthday) return setErr('請填寫生日');
    if (under5(guestBirthday)) return setErr('未滿 5 歲無法報名課程');
    if (!agreedPolicy) return setErr('請閱讀並同意課程請假/補課/退費規則');
    if (!sigRef.current || sigRef.current.isEmpty()) return setErr('請完成簽名');
    if (isMinor && (!guardianSigRef.current || guardianSigRef.current.isEmpty())) return setErr('未滿 18 歲需法定代理人簽名');
    if (!bankLastFive.trim()) return setErr('請填寫匯款帳號末五碼');
    if (!paymentDate) return setErr('請填寫匯款日期');
    setSubmitting(true);
    try {
      const res = await axios.post(`${BASE}/courses/public/${courseId}/enroll-all`, {
        guestName, guestPhone, guestEmail, guestBirthday,
        portraitSignature: sigRef.current.toDataURL(),
        guardianSignature: isMinor ? guardianSigRef.current.toDataURL() : null,
        healthNote,
        confirmedLeavePolicy: true, confirmedRefundPolicy: true,
        bankLastFive, paymentDate,
      });
      setDone(res.data);
    } catch (e) {
      setErr(e.response?.data?.message || '送出失敗，請稍後再試');
    } finally { setSubmitting(false); }
  };

  const wrap = { maxWidth: 480, margin: '0 auto', padding: '0 16px 60px', fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' };
  const label = { fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6, marginTop: 16 };
  const input = { width: '100%', minWidth: 0, height: 44, borderRadius: 10, border: '1px solid #E0D4D4', padding: '0 12px', fontSize: 15, boxSizing: 'border-box', outline: 'none', background: '#fff' };
  const dinput = { ...input, width: '100%', maxWidth: 220 };
  const card = { background: '#fff', borderRadius: 16, border: '1px solid #EEE2E2', padding: 18, marginTop: 16, boxShadow: '0 1px 3px rgba(80,20,20,.05)' };

  if (loadErr) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#A32D2D' }}>{loadErr}</div>;
  if (!course) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#999' }}>載入中…</div>;

  if (done) {
    return (
      <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
        <div style={{ ...wrap, paddingTop: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>✅</div>
          <h2 style={{ color: RED, marginTop: 12 }}>{done.isWaitlist ? '已加入候補名單！' : '報名成功！'}</h2>
          <div style={{ ...card, textAlign: 'left', lineHeight: 1.8 }}>
            <div>感謝您報名「{course.name}」，共 {done.count} 個場次。</div>
            <div style={{ marginTop: 8 }}>{done.message}</div>
            <div style={{ marginTop: 12, color: '#999', fontSize: 13 }}>之後若在 app.redrocktaiwan.com 註冊會員（用同一支電話），此報名會自動歸入您的帳號。</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
      <div style={{ background: RED, color: '#fff', padding: '22px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>紅石攀岩 · 課程報名</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 4 }}>免註冊，填表報名即可</div>
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
            <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>（剩餘 {sessions.length} 堂）</span>
            {isLateJoinEstimate && (
              <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>此課程已開課，插班費用依剩餘場次計算（原整期 NT${course.price.toLocaleString()}）</div>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: '#999' }}>
            {sessions.slice(0, 3).map(s => `${s.date} ${s.startTime}–${s.endTime}`).join('、')}{sessions.length > 3 ? ' …' : ''}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>報名資訊</div>
          <label style={{ ...label, marginTop: 10 }}>姓名 *</label>
          <input value={guestName} onChange={e => setGuestName(e.target.value)} style={input} />
          <label style={label}>生日 *</label>
          <input type="date" value={guestBirthday} onChange={e => setGuestBirthday(e.target.value)} style={dinput} />
          <label style={label}>聯絡電話 *</label>
          <input value={guestPhone} onChange={e => setGuestPhone(e.target.value)} style={input} placeholder="0912345678" inputMode="tel" />
          <label style={label}>Email（選填）</label>
          <input value={guestEmail} onChange={e => setGuestEmail(e.target.value)} style={input} inputMode="email" />
          <label style={label}>健康備註（選填）</label>
          <input value={healthNote} onChange={e => setHealthNote(e.target.value)} style={input} placeholder="如過敏、慢性病、身體狀況" />
          {under5(guestBirthday) && <div style={{ color: '#A32D2D', fontSize: 12, marginTop: 6 }}>未滿 5 歲無法報名課程</div>}
        </div>

        <label style={{ ...card, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13, lineHeight: 1.6 }}>
          <input type="checkbox" checked={agreedPolicy} onChange={e => setAgreedPolicy(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: RED }} />
          <span>我已了解並同意本課程之請假次數限制、補課安排方式，以及依規定計算之退費規則；如需詳細規則請於報到時向櫃檯洽詢。</span>
        </label>

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>本人簽名（肖像權授權同意）*</div>
          <SignaturePad ref={sigRef} height={180} />
        </div>

        {isMinor && (
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>法定代理人簽名 *</div>
            <div style={{ fontSize: 12, color: '#854F0B', marginBottom: 10 }}>報名對象未滿 18 歲，需法定代理人一併簽名</div>
            <SignaturePad ref={guardianSigRef} height={180} />
          </div>
        )}

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>付款（匯款）</div>
          {bank ? (
            <div style={{ fontSize: 13, color: '#555', marginTop: 10, background: '#F7F1F1', borderRadius: 8, padding: '10px 12px', lineHeight: 1.8 }}>
              <div>{bank.bankName}</div>
              <div>帳號：<b style={{ letterSpacing: .5 }}>{bank.accountNumber}</b></div>
              <div>戶名：{bank.accountName}</div>
              {bank.notes && <div style={{ color: '#999' }}>{bank.notes}</div>}
            </div>
          ) : null}
          <label style={label}>匯款帳號末五碼 *</label>
          <input value={bankLastFive} onChange={e => setBankLastFive(e.target.value.replace(/\D/g, '').slice(0, 5))} style={dinput} inputMode="numeric" placeholder="12345" />
          <label style={label}>匯款日期 *</label>
          <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={dinput} />
        </div>

        {err && <div style={{ color: '#A32D2D', fontSize: 14, marginTop: 14, textAlign: 'center' }}>{err}</div>}

        <button onClick={submit} disabled={submitting}
          style={{ width: '100%', height: 50, borderRadius: 12, background: submitting ? '#C99' : RED, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', marginTop: 18 }}>
          {submitting ? '送出中…' : '送出報名'}
        </button>
        <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 14, lineHeight: 1.8 }}>紅石攀岩 RedRock<br/>新竹館 03-6686635 · 士林館 02-28837591</div>
      </div>
    </div>
  );
}
