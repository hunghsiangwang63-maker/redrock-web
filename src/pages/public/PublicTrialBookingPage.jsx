import { useState, useEffect, useRef } from 'react';
import { publicClient } from '../../api/client';
import SignaturePad from '../../components/SignaturePad';

const RED = '#8B1A1A';

const under18 = (b) => { if (!b) return false; const d = new Date(b); const age = (Date.now() - d.getTime()) / (365.25 * 864e5); return age >= 0 && age < 18; };
const under5 = (b) => { if (!b) return false; const d = new Date(b); const age = (Date.now() - d.getTime()) / (365.25 * 864e5); return age >= 0 && age < 5; };

// 公開試上預約（免登入、訪客，先轉帳）。連結格式：/book/trial?session=<courseSessionId>
export default function PublicTrialBookingPage() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session') || '';

  const [info, setInfo] = useState(null);
  const [bankAccounts, setBankAccounts] = useState({});
  const [loadErr, setLoadErr] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestBirthday, setGuestBirthday] = useState('');
  const [bankLastFive, setBankLastFive] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const sigRef = useRef(null);
  const guardianSigRef = useRef(null);

  useEffect(() => {
    if (!sessionId) { setLoadErr('連結缺少場次資訊，請聯繫櫃檯'); return; }
    publicClient.get(`/courses/public/session/${sessionId}`)
      .then(r => setInfo(r.data))
      .catch(() => setLoadErr('找不到此試上場次，可能已被移除或連結錯誤'));
    publicClient.get('/settings/bank-accounts/member').then(r => setBankAccounts(r.data.bankAccounts || {})).catch(() => {});
  }, [sessionId]);

  const isMinor = under18(guestBirthday);
  const bank = info ? bankAccounts[info.session?.gymId] : null;

  const submit = async () => {
    setErr('');
    if (!info?.allowTrial) return setErr('此課程未開放試上');
    if (!guestName.trim()) return setErr('請填寫姓名');
    if (!guestPhone.trim()) return setErr('請填寫聯絡電話');
    if (!guestBirthday) return setErr('請填寫生日');
    if (under5(guestBirthday)) return setErr('未滿 5 歲無法報名試上');
    if (!sigRef.current || sigRef.current.isEmpty()) return setErr('請完成簽名');
    if (isMinor && (!guardianSigRef.current || guardianSigRef.current.isEmpty())) return setErr('未滿 18 歲需法定代理人簽名');
    if (!bankLastFive.trim()) return setErr('請填寫匯款帳號末五碼');
    setSubmitting(true);
    try {
      const res = await publicClient.post('/experience-bookings/public', {
        trialSessionId: sessionId,
        guestName, guestPhone, guestEmail, guestBirthday,
        signatureData: sigRef.current.toDataURL(),
        guardianSignature: isMinor ? guardianSigRef.current.toDataURL() : null,
        bankLastFive, paymentDate, paidAmount: paidAmount || null,
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
  if (!info) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#999' }}>載入中…</div>;

  if (done) {
    return (
      <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
        <div style={{ ...wrap, paddingTop: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>✅</div>
          <h2 style={{ color: RED, marginTop: 12 }}>{done.isWaitlist ? '已加入候補名單！' : '試上預約已送出！'}</h2>
          <div style={{ ...card, textAlign: 'left', lineHeight: 1.8 }}>
            <div>感謝您預約紅石攀岩試上課程「{info.session.courseName}」。</div>
            <div style={{ marginTop: 8 }}>應繳金額：<b style={{ color: RED }}>NT${done.totalFee}</b></div>
            <div style={{ marginTop: 8, color: '#666', fontSize: 14 }}>
              {done.isWaitlist ? '此場次已額滿，已為您排入候補，有名額釋出將依序轉正並通知您。' : '請於期限內完成匯款，館方確認收款後即完成報名。'}
            </div>
            <div style={{ marginTop: 12, color: '#999', fontSize: 13 }}>之後若在 app.redrocktaiwan.com 註冊會員（用同一支電話），此預約會自動歸入您的帳號。</div>
          </div>
        </div>
      </div>
    );
  }

  if (!info.allowTrial) {
    return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#A32D2D' }}>此課程目前未開放試上，請聯繫櫃檯。</div>;
  }

  return (
    <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
      <div style={{ background: RED, color: '#fff', padding: '22px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>紅石攀岩 · 課程試上預約</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 4 }}>免註冊，填表預約即可</div>
      </div>
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{info.session.courseName}</div>
          <div style={{ marginTop: 8, fontSize: 14, color: '#555' }}>🗓 {info.session.date}　⏰ {info.session.startTime}–{info.session.endTime}</div>
          <div style={{ marginTop: 10, background: '#FBF5F5', borderRadius: 10, padding: 12, fontSize: 14 }}>
            試上費：<b style={{ color: RED, fontSize: 17 }}>NT${info.trialPrice}</b>
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
          {under5(guestBirthday) && <div style={{ color: '#A32D2D', fontSize: 12, marginTop: 6 }}>未滿 5 歲無法報名試上</div>}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>本人簽名（免責同意）*</div>
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
          <label style={label}>匯款日期（選填）</label>
          <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={dinput} />
          <label style={label}>實際匯款金額（選填）</label>
          <input value={paidAmount} onChange={e => setPaidAmount(e.target.value.replace(/\D/g, ''))} style={dinput} inputMode="numeric" />
        </div>

        {err && <div style={{ color: '#A32D2D', fontSize: 14, marginTop: 14, textAlign: 'center' }}>{err}</div>}

        <button onClick={submit} disabled={submitting}
          style={{ width: '100%', height: 50, borderRadius: 12, background: submitting ? '#C99' : RED, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', marginTop: 18 }}>
          {submitting ? '送出中…' : '送出試上預約'}
        </button>
        <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 14, lineHeight: 1.8 }}>紅石攀岩 RedRock<br/>新竹館 03-6686635 · 士林館 02-28837591</div>
      </div>
    </div>
  );
}
