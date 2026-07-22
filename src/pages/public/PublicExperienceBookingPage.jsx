import { useState, useEffect } from 'react';
import axios from 'axios';

const BASE = 'https://api.redrocktaiwan.com';
const RED = '#8B1A1A';

// 公開體驗預約（免登入、訪客、先轉帳）。非會員也能預約；不建帳號，之後註冊用電話認領。
export default function PublicExperienceBookingPage() {
  const [settings, setSettings] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [gymId, setGymId] = useState('');
  const [courseType, setCourseType] = useState('general');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [participants, setParticipants] = useState([{ name: '', birthday: '', idNumber: '', nationality: '台灣' }]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [facebookName, setFacebookName] = useState('');
  const [bankLastFive, setBankLastFive] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null); // { totalFee }

  useEffect(() => {
    axios.get(`${BASE}/experience-bookings/public-settings`)
      .then(r => {
        setSettings(r.data);
        if (r.data.gyms?.length) setGymId(r.data.gyms[0].id);
        if (r.data.courseTypes?.length) setCourseType(r.data.courseTypes[0].id);
      })
      .catch(() => setLoadErr('無法載入預約資訊，請稍後再試或聯繫櫃檯'));
  }, []);

  const n = participants.length;
  const ct = (settings?.courseTypes || []).find(c => c.id === courseType);
  const unitPrice = ct
    ? (ct.pricingType === 'tiered' && Array.isArray(ct.tiers)
        ? (ct.tiers.find(t => n >= t.min && n <= t.max)?.price ?? ct.tiers[ct.tiers.length - 1]?.price ?? 0)
        : (ct.price || 0))
    : 0;
  const totalFee = unitPrice * n;

  const under5 = (b) => { if (!b) return false; const d = new Date(b); const age = (Date.now() - d.getTime()) / (365.25 * 864e5); return age >= 0 && age < 5; };
  const anyUnder5 = participants.some(p => under5(p.birthday));

  const addP = () => participants.length < 8 && setParticipants(p => [...p, { name: '', birthday: '', idNumber: '', nationality: '台灣' }]);
  const rmP = (i) => participants.length > 1 && setParticipants(p => p.filter((_, j) => j !== i));
  const setP = (i, k, v) => setParticipants(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));

  const submit = async () => {
    setErr('');
    if (!contactName.trim()) return setErr('請填寫聯絡人姓名');
    if (!contactPhone.trim()) return setErr('請填寫聯絡電話');
    if (!gymId) return setErr('請選擇場館');
    if (!bookingDate) return setErr('請選擇體驗日期');
    if (participants.some(p => !p.name.trim())) return setErr('請填寫每位參加者姓名');
    if (participants.some(p => !p.idNumber?.trim())) return setErr('請填寫每位參加者身分證字號／護照號碼（投保用）');
    if (participants.some(p => !p.birthday)) return setErr('請填寫每位參加者生日');
    if (anyUnder5) return setErr('未滿 5 歲無法報名體驗');
    if (!bankLastFive.trim()) return setErr('請填寫匯款帳號末五碼');
    if (!agreedTerms) return setErr('請閱讀並勾選同意注意事項');
    setSubmitting(true);
    try {
      const res = await axios.post(`${BASE}/experience-bookings/public`, {
        gymId, courseType, bookingDate, bookingTime,
        contactName, contactPhone, contactEmail, facebookName,
        participants, bankLastFive, paymentDate,
        paidAmount: paidAmount || null, notes, agreedTerms: true,
      });
      setDone({ totalFee: res.data.totalFee });
    } catch (e) {
      setErr(e.response?.data?.message || '送出失敗，請稍後再試');
    } finally { setSubmitting(false); }
  };

  const wrap = { maxWidth: 480, margin: '0 auto', padding: '0 16px 60px', fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' };
  const label = { fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6, marginTop: 16 };
  const input = { width: '100%', height: 44, borderRadius: 10, border: '1px solid #E0D4D4', padding: '0 14px', fontSize: 15, boxSizing: 'border-box', outline: 'none', background: '#fff' };
  const card = { background: '#fff', borderRadius: 16, border: '1px solid #EEE2E2', padding: 18, marginTop: 16, boxShadow: '0 1px 3px rgba(80,20,20,.05)' };

  if (loadErr) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#A32D2D' }}>{loadErr}</div>;
  if (!settings) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#999' }}>載入中…</div>;

  if (done) {
    return (
      <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
        <div style={{ ...wrap, paddingTop: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>✅</div>
          <h2 style={{ color: RED, marginTop: 12 }}>預約已送出！</h2>
          <div style={{ ...card, textAlign: 'left', lineHeight: 1.8 }}>
            <div>感謝您預約紅石攀岩體驗課程。</div>
            <div style={{ marginTop: 8 }}>應繳金額：<b style={{ color: RED }}>NT${done.totalFee}</b></div>
            <div style={{ marginTop: 8, color: '#666', fontSize: 14 }}>請於 <b>3 日內完成匯款</b>，我們確認收款後會與您聯繫確認場次。當天報到請提早 10 分鐘，並於現場簽署風險安全聲明書。</div>
            <div style={{ marginTop: 12, color: '#999', fontSize: 13 }}>之後若在 app.redrocktaiwan.com 註冊會員（用同一支電話），此預約會自動歸入您的帳號。</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
      <div style={{ background: RED, color: '#fff', padding: '22px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>紅石攀岩 · 體驗課程預約</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 4 }}>免註冊，填表預約即可</div>
      </div>
      <div style={wrap}>
        <div style={card}>
          <label style={{ ...label, marginTop: 0 }}>場館</label>
          <select value={gymId} onChange={e => setGymId(e.target.value)} style={input}>
            {settings.gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={label}>體驗日期</label>
              <input type="date" value={bookingDate} min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} onChange={e => setBookingDate(e.target.value)} style={input} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>希望時段（選填）</label>
              <input placeholder="如 14:00" value={bookingTime} onChange={e => setBookingTime(e.target.value)} style={input} />
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>參加人員</div>
          {participants.map((p, i) => (
            <div key={i} style={{ marginTop: 12, paddingTop: i ? 12 : 0, borderTop: i ? '1px dashed #EEE' : 'none' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...label, marginTop: 0 }}>姓名</label>
                  <input value={p.name} onChange={e => setP(i, 'name', e.target.value)} style={input} placeholder="參加者姓名" />
                </div>
                {participants.length > 1 && <button onClick={() => rmP(i)} style={{ height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid #E5B5B5', background: '#fff', color: '#A32D2D', fontSize: 13, cursor: 'pointer' }}>移除</button>}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={label}>生日</label>
                  <input type="date" value={p.birthday} onChange={e => setP(i, 'birthday', e.target.value)} style={input} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={label}>國籍</label>
                  <input value={p.nationality} onChange={e => setP(i, 'nationality', e.target.value)} style={input} placeholder="台灣" />
                </div>
              </div>
              <label style={label}>身分證字號／護照號碼</label>
              <input value={p.idNumber} onChange={e => setP(i, 'idNumber', e.target.value.toUpperCase())} style={input} placeholder="投保用" />
              {under5(p.birthday) && <div style={{ color: '#A32D2D', fontSize: 12, marginTop: 6 }}>未滿 5 歲無法報名體驗</div>}
            </div>
          ))}
          <button onClick={addP} style={{ marginTop: 14, width: '100%', height: 40, borderRadius: 10, border: `1px dashed ${RED}`, background: '#fff', color: RED, fontSize: 14, cursor: 'pointer' }}>＋ 新增參加者</button>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>聯絡資訊</div>
          <label style={label}>聯絡人姓名 *</label>
          <input value={contactName} onChange={e => setContactName(e.target.value)} style={input} />
          <label style={label}>聯絡電話 *</label>
          <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} style={input} placeholder="0912345678" inputMode="tel" />
          <label style={label}>Email（選填）</label>
          <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} style={input} inputMode="email" />
          <label style={label}>Facebook 名稱（選填）</label>
          <input value={facebookName} onChange={e => setFacebookName(e.target.value)} style={input} />
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>付款（匯款）</div>
          <div style={{ background: '#FBF5F5', borderRadius: 10, padding: 12, marginTop: 10, fontSize: 14 }}>
            應繳金額：<b style={{ color: RED, fontSize: 17 }}>NT${totalFee}</b>
            <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>（{n} 人 × NT${unitPrice}）</span>
          </div>
          {(() => {
            const bank = settings.bankInfo?.[String(gymId || '').replace('gym-', '')];
            return bank ? (
              <div style={{ fontSize: 13, color: '#555', marginTop: 10, background: '#F7F1F1', borderRadius: 8, padding: '10px 12px', lineHeight: 1.8 }}>
                <div style={{ fontWeight: 700, color: RED, marginBottom: 2 }}>匯款帳號（{settings.gyms.find(g => g.id === gymId)?.name || ''}）</div>
                <div>{bank.bankName} {bank.branch || ''}</div>
                <div>帳號：<b style={{ letterSpacing: .5 }}>{bank.account}</b></div>
                <div>戶名：{bank.accountName}</div>
              </div>
            ) : null;
          })()}
          <label style={label}>匯款帳號末五碼 *</label>
          <input value={bankLastFive} onChange={e => setBankLastFive(e.target.value.replace(/\D/g, '').slice(0, 5))} style={input} inputMode="numeric" placeholder="12345" />
          <label style={label}>匯款日期（選填）</label>
          <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={input} />
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 18, cursor: 'pointer', fontSize: 13, color: '#444', lineHeight: 1.6 }}>
          <input type="checkbox" checked={agreedTerms} onChange={e => setAgreedTerms(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: RED }} />
          <span>我已了解：體驗課程需先完成匯款、館方確認後始生效；報到當天須現場簽署<b>風險安全聲明書</b>；體驗費不含保險（保險費另計）。</span>
        </label>

        {err && <div style={{ color: '#A32D2D', fontSize: 14, marginTop: 14, textAlign: 'center' }}>{err}</div>}

        <button onClick={submit} disabled={submitting}
          style={{ width: '100%', height: 50, borderRadius: 12, background: submitting ? '#C99' : RED, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', marginTop: 18 }}>
          {submitting ? '送出中…' : '送出預約'}
        </button>
        <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 14 }}>紅石攀岩 RedRock · 新竹館 03-6686635 · 士林館 02-28837591</div>
      </div>
    </div>
  );
}
