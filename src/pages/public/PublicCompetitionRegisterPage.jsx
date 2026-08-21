import { useState, useEffect, useRef } from 'react';
import { publicClient } from '../../api/client';
import SignaturePad from '../../components/SignaturePad';

const RED = '#8B1A1A';

// 與 competitionService.computeCompetitionAgeInfo 邏輯一致：以「比賽當天」為基準算年齡
const ageAt = (birthday, refDate) => {
  if (!birthday) return null;
  const d = new Date(birthday);
  const ref = refDate ? new Date(refDate) : new Date();
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
  return age;
};
const under5 = (b) => { if (!b) return false; const d = new Date(b); const age = (Date.now() - d.getTime()) / (365.25 * 864e5); return age >= 0 && age < 5; };

// 公開比賽報名（免登入、訪客，先轉帳，本人+法定代理人皆線上簽名）。連結格式：/book/competition?id=<competitionId>
export default function PublicCompetitionRegisterPage() {
  const params = new URLSearchParams(window.location.search);
  const compId = params.get('id') || '';

  const [comp, setComp] = useState(null);
  const [partnerGyms, setPartnerGyms] = useState([]);
  const [bankAccounts, setBankAccounts] = useState({});
  const [loadErr, setLoadErr] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [gender, setGender] = useState('');
  const [birthday, setBirthday] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [height, setHeight] = useState('');
  const [armSpan, setArmSpan] = useState('');
  const [memberNote, setMemberNote] = useState('');
  const [partnerGymId, setPartnerGymId] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState({});
  const [bankLastFive, setBankLastFive] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const sigRef = useRef(null);
  const guardianSigRef = useRef(null);

  useEffect(() => {
    if (!compId) { setLoadErr('連結缺少賽事資訊，請聯繫櫃檯'); return; }
    publicClient.get(`/competitions/public/${compId}`)
      .then(r => {
        setComp(r.data.competition);
        setPartnerGyms(r.data.partnerGyms || []);
        if (r.data.competition.divisions?.length) setDivisionId(r.data.competition.divisions[0].id);
      })
      .catch(() => setLoadErr('找不到此賽事，或此賽事目前未開放報名'));
    publicClient.get('/settings/bank-accounts/member').then(r => setBankAccounts(r.data.bankAccounts || {})).catch(() => {});
  }, [compId]);

  const age = comp ? ageAt(birthday, comp.eventDate) : null;
  const isMinor = age !== null && age < 18;
  const isChild = age !== null && comp && age < ((comp.fees?.childAgeLimit) || 15);
  const isEarlyBird = !!(comp?.earlyBirdDeadline && new Date() <= new Date(comp.earlyBirdDeadline + 'T23:59:59'));
  const baseFee = comp ? (isChild ? (isEarlyBird ? comp.fees?.childEarlyBird : comp.fees?.childRegular) : (isEarlyBird ? comp.fees?.adultEarlyBird : comp.fees?.adultRegular)) || 0 : 0;
  const bank = comp ? bankAccounts[comp.gymId] : null;

  const setCF = (key, v) => setCustomFieldValues(p => ({ ...p, [key]: v }));

  const submit = async () => {
    setErr('');
    if (!divisionId) return setErr('請選擇報名組別');
    if (!guestName.trim()) return setErr('請填寫姓名');
    if (gender !== 'male' && gender !== 'female') return setErr('請選擇性別');
    if (!birthday) return setErr('請填寫生日');
    if (under5(birthday)) return setErr('未滿 5 歲無法報名');
    if (!phone.trim()) return setErr('請填寫手機號碼');
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr('請填寫有效的 Email');
    for (const f of (comp.customFields || [])) {
      if (f.required && !customFieldValues[f.key]) return setErr(`請填寫「${f.label}」`);
    }
    if (!sigRef.current || sigRef.current.isEmpty()) return setErr('請完成簽名');
    if (isMinor && (!guardianSigRef.current || guardianSigRef.current.isEmpty())) return setErr('未滿 18 歲需法定代理人簽名');
    if (!bankLastFive.trim()) return setErr('請填寫匯款帳號末五碼');
    if (!paymentDate) return setErr('請填寫轉帳日期');
    setSubmitting(true);
    try {
      const res = await publicClient.post(`/competitions/public/${compId}/register`, {
        divisionId, guestName, gender, birthday, phone, email,
        customFieldValues,
        signatureData: sigRef.current.toDataURL(),
        guardianSignature: isMinor ? guardianSigRef.current.toDataURL() : null,
        idNumber, emergencyContact, emergencyRelation, emergencyPhone,
        height: height || null, armSpan: armSpan || null, memberNote,
        partnerGymId: partnerGymId || null,
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
  if (!comp) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#999' }}>載入中…</div>;

  if (done) {
    return (
      <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
        <div style={{ ...wrap, paddingTop: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>✅</div>
          <h2 style={{ color: RED, marginTop: 12 }}>報名成功！</h2>
          <div style={{ ...card, textAlign: 'left', lineHeight: 1.8 }}>
            <div>感謝您報名「{comp.name}」。</div>
            <div style={{ marginTop: 8 }}>應繳金額：<b style={{ color: RED }}>NT${done.registration?.registrationFee}</b>（含保費 NT${done.registration?.insuranceFee}）</div>
            {done.registration?.status === 'waitlist' && <div style={{ marginTop: 8, color: '#854F0B' }}>此組別目前已滿，已為您加入候補名單。</div>}
            <div style={{ marginTop: 8, color: '#666', fontSize: 14 }}>請於期限內完成匯款，館方確認收款後即完成報名。</div>
            <div style={{ marginTop: 12, color: '#999', fontSize: 13 }}>之後若在 app.redrocktaiwan.com 註冊會員（用同一支電話），此報名會自動歸入您的帳號。</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
      <div style={{ background: RED, color: '#fff', padding: '22px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>紅石攀岩 · 比賽報名</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 4 }}>免註冊，填表報名即可</div>
      </div>
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{comp.name}</div>
          {comp.description && <div style={{ marginTop: 6, fontSize: 13, color: '#666', whiteSpace: 'pre-wrap' }}>{comp.description}</div>}
          <div style={{ marginTop: 8, fontSize: 14, color: '#555' }}>🗓 比賽日：{comp.eventDate}</div>
          {comp.earlyBirdDeadline && <div style={{ fontSize: 13, color: '#854F0B' }}>🐦 早鳥截止：{comp.earlyBirdDeadline}</div>}
          <div style={{ marginTop: 10, background: '#FBF5F5', borderRadius: 10, padding: 12, fontSize: 14 }}>
            報名費：<b style={{ color: RED, fontSize: 17 }}>NT${baseFee || '—'}</b>
            {age !== null && <span style={{ color: '#999', fontSize: 12, marginLeft: 6 }}>（{isChild ? '兒童' : '成人'}{isEarlyBird ? '·早鳥' : ''}價，實際金額以送出後為準）</span>}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>報名組別</div>
          <select value={divisionId} onChange={e => setDivisionId(e.target.value)} style={{ ...input, marginTop: 10 }}>
            {(comp.divisions || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>選手資料</div>
          <label style={{ ...label, marginTop: 10 }}>姓名 *</label>
          <input value={guestName} onChange={e => setGuestName(e.target.value)} style={input} />
          <label style={label}>性別 *</label>
          <select value={gender} onChange={e => setGender(e.target.value)} style={dinput}>
            <option value="">請選擇</option>
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
          <label style={label}>生日 *</label>
          <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} style={dinput} />
          {under5(birthday) && <div style={{ color: '#A32D2D', fontSize: 12, marginTop: 6 }}>未滿 5 歲無法報名</div>}
          <label style={label}>手機號碼 *</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} style={input} placeholder="0912345678" inputMode="tel" />
          <label style={label}>Email *</label>
          <input value={email} onChange={e => setEmail(e.target.value)} style={input} inputMode="email" />
          <label style={label}>身分證字號／護照號碼（選填）</label>
          <input value={idNumber} onChange={e => setIdNumber(e.target.value.toUpperCase())} style={input} />
          <label style={label}>身高 cm（選填）</label>
          <input value={height} onChange={e => setHeight(e.target.value.replace(/\D/g, ''))} style={dinput} inputMode="numeric" />
          <label style={label}>臂展 cm（選填）</label>
          <input value={armSpan} onChange={e => setArmSpan(e.target.value.replace(/\D/g, ''))} style={dinput} inputMode="numeric" />
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>緊急聯絡人（選填）</div>
          <label style={{ ...label, marginTop: 10 }}>姓名</label>
          <input value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} style={input} />
          <label style={label}>關係</label>
          <input value={emergencyRelation} onChange={e => setEmergencyRelation(e.target.value)} style={dinput} />
          <label style={label}>電話</label>
          <input value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} style={input} inputMode="tel" />
        </div>

        {(comp.customFields || []).length > 0 && (
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>其他報名資訊</div>
            {comp.customFields.map(f => (
              <div key={f.key}>
                <label style={label}>{f.label}{f.required ? ' *' : ''}</label>
                <input value={customFieldValues[f.key] || ''} onChange={e => setCF(f.key, e.target.value)} style={input} />
              </div>
            ))}
          </div>
        )}

        {partnerGyms.length > 0 && (
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>友館會員優惠（選填）</div>
            <select value={partnerGymId} onChange={e => setPartnerGymId(e.target.value)} style={{ ...input, marginTop: 10 }}>
              <option value="">無</option>
              {partnerGyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>將由館方依友館名單核對，不在名單則以原價計算。</div>
          </div>
        )}

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>本人簽名（風險聲明書）*</div>
          <SignaturePad ref={sigRef} height={180} />
        </div>

        {isMinor && (
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>法定代理人簽名 *</div>
            <div style={{ fontSize: 12, color: '#854F0B', marginBottom: 10 }}>選手未滿 18 歲，需法定代理人一併簽名</div>
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
          <label style={label}>轉帳日期 *</label>
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
