import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { memberClient } from '../../api/client';
import SignaturePad from '../../components/SignaturePad';

const PORTRAIT_TEXT = '本課程進行期間，紅石攀岩館將不定期進行拍攝或攝影。學員報名本課程，即視為同意授權紅石攀岩館得將含有學員肖像之照片、影像及聲音，基於課程招生或活動宣傳目的，進行編輯、重製，並公開發表於官方網站、社群平台等宣傳管道。若有不便入鏡之需求，請於課程開始時主動告知。';
const PM = { transfer: '轉帳', cash: '現金', linepay: 'LINE Pay', jkopay: '街口支付', taiwanpay: '台灣Pay' };

export default function CourseContractResignPage() {
  const { token } = useParams();
  const portraitRef = useRef(null);
  const guardianRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | form | success | error
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    memberClient.get(`/course-contract-sign/${token}`)
      .then(r => { setInfo(r.data); setStatus('form'); })
      .catch(e => {
        const c = e.response?.data?.error;
        setErr(c === 'TOKEN_EXPIRED' ? '此連結已過期，請聯絡館方重新發送。'
          : c === 'ALREADY_SIGNED' ? '此合約已經完成簽署，感謝您！'
          : c === 'CANCELLED' ? '此連結已失效，請聯絡館方。'
          : '此連結無效，請確認您點選的是館方提供的正確連結。');
        setStatus('error');
      });
  }, [token]);

  const submit = async () => {
    setErr('');
    if (!agreed) return setErr('請先閱讀並勾選同意');
    const p = portraitRef.current, g = guardianRef.current;
    if (!p || p.isEmpty()) return setErr('請先簽名');
    if (p.isTooSimple()) return setErr('簽名過於簡單，請以正楷書寫完整姓名');
    if (info.isMinor) {
      if (!g || g.isEmpty()) return setErr('請法定代理人簽名');
      if (g.isTooSimple()) return setErr('法定代理人簽名過於簡單，請以正楷書寫完整姓名');
    }
    setBusy(true);
    try {
      await memberClient.post(`/course-contract-sign/${token}`, {
        agreed: true,
        portraitSignature: p.toDataURL(),
        guardianSignature: info.isMinor ? g.toDataURL() : null,
      });
      setStatus('success');
    } catch (e) {
      setErr(e.response?.data?.message || '簽署失敗，請再試一次');
    } finally { setBusy(false); }
  };

  const s = {
    page: { width: '100%', minHeight: '100vh', background: '#F7F3F3', display: 'flex', justifyContent: 'center', padding: '24px 16px', boxSizing: 'border-box' },
    box: { width: '100%', maxWidth: 480 },
    logo: { textAlign: 'center', fontWeight: 700, fontSize: 18, color: '#8B1A1A', marginBottom: 18 },
    card: { background: '#fff', borderRadius: 14, border: '0.5px solid #E8D5D5', padding: 18, marginBottom: 16 },
    scroll: { maxHeight: 220, overflowY: 'auto', fontSize: 13, lineHeight: 1.7, color: '#333', whiteSpace: 'pre-wrap', background: '#FBF5F5', borderRadius: 10, padding: 14, border: '0.5px solid #F0E4E4' },
    h: { fontSize: 12, fontWeight: 600, color: '#8B1A1A', margin: '14px 0 6px' },
    btn: { width: '100%', height: 46, borderRadius: 10, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
    row: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '0.5px solid #f3e9e9', gap: 12 },
  };
  const Shell = ({ children }) => <div style={s.page}><div style={s.box}><div style={s.logo}>紅石攀岩館 RedRock Climbing</div>{children}</div></div>;

  if (status === 'loading') return <Shell><div style={{ textAlign: 'center', padding: 60, color: '#999' }}>載入中...</div></Shell>;
  if (status === 'error') return <Shell><div style={{ ...s.card, textAlign: 'center' }}><div style={{ fontSize: 36 }}>⚠️</div><div style={{ fontSize: 14, color: '#A32D2D', lineHeight: 1.6, textAlign: 'left' }}>{err}</div></div></Shell>;
  if (status === 'success') return <Shell><div style={{ ...s.card, textAlign: 'center' }}><div style={{ fontSize: 40 }}>✅</div><div style={{ fontWeight: 600, fontSize: 16, margin: '8px 0' }}>簽署完成，謝謝您！</div><div style={{ fontSize: 13, color: '#888', lineHeight: 1.6, textAlign: 'left' }}>新的課程服務同意書已寄到您的 Email（請留意垃圾信件匣）。</div></div></Shell>;

  return (
    <Shell>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 1.6 }}>請確認以下課程資料，閱讀合約條款後於下方簽名，即完成<strong>課程服務同意書</strong>簽署。</div>
      <div style={s.card}>
        <div style={s.row}><span style={{ color: '#888' }}>學員</span><b>{info.studentName}</b></div>
        {info.isMinor && info.guardianName && <div style={s.row}><span style={{ color: '#888' }}>法定代理人</span><b>{info.guardianName}</b></div>}
        <div style={s.row}><span style={{ color: '#888' }}>課程</span><b style={{ textAlign: 'right' }}>{info.courseName}</b></div>
        <div style={s.row}><span style={{ color: '#888' }}>期間</span><span>{info.startDate} ～ {info.endDate}</span></div>
        <div style={s.row}><span style={{ color: '#888' }}>上課時間</span><span>{info.weekdays ? `每週${info.weekdays} ` : ''}{info.startTime}～{info.endTime}（共 {info.totalSessions} 堂）</span></div>
        <div style={{ ...s.row, borderBottom: 'none' }}><span style={{ color: '#888' }}>課程費用</span><span>NT$ {Number(info.fee || 0).toLocaleString()}（{PM[info.paymentMethod] || info.paymentMethod || '—'}）</span></div>
      </div>

      <div style={s.card}>
        <div style={{ ...s.h, marginTop: 0 }}>一、課程服務同意書條款</div>
        <div style={s.scroll}>{info.termsText}</div>
        {!info.skipSignature && <>
          <div style={s.h}>二、肖像權授權同意聲明</div>
          <div style={{ ...s.scroll, maxHeight: 150 }}>{PORTRAIT_TEXT}</div>
        </>}
      </div>

      <div style={s.card}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#555', marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }} />
          本人已閱讀並同意上述課程服務同意書條款{info.skipSignature ? '' : '與肖像權授權聲明'}。
        </label>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>學員{info.isMinor ? '（未成年，可由法定代理人代為簽署）' : ''}簽名：</div>
        <SignaturePad ref={portraitRef} height={150} />
        <button onClick={() => portraitRef.current?.clear()} style={{ marginTop: 6, fontSize: 12, color: '#8B1A1A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>清除重簽</button>
        {info.isMinor && <>
          <div style={{ fontSize: 12, color: '#888', margin: '14px 0 6px' }}>法定代理人簽名：</div>
          <SignaturePad ref={guardianRef} height={150} />
          <button onClick={() => guardianRef.current?.clear()} style={{ marginTop: 6, fontSize: 12, color: '#8B1A1A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>清除重簽</button>
        </>}
      </div>
      {err && <div style={{ color: '#A32D2D', fontSize: 12, marginBottom: 10 }}>{err}</div>}
      <button onClick={submit} disabled={busy} style={s.btn}>{busy ? '送出中...' : '確認簽署'}</button>
      <div style={{ fontSize: 11, color: '#bbb', marginTop: 10 }}>⚠ 簽署後，館方將重新產生合約並寄至您的 Email；先前的合約將作廢。</div>
    </Shell>
  );
}
