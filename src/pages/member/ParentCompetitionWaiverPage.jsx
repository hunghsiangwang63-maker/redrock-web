import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { memberClient } from '../../api/client';
import SignaturePad from '../../components/SignaturePad';

export default function ParentCompetitionWaiverPage() {
  const { token } = useParams();
  const sigRef = useRef(null);

  const [status, setStatus] = useState('loading'); // loading | form | success | error
  const [info, setInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [lang, setLang] = useState('zh');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    memberClient.get(`/competitions/waiver/parent/${token}`)
      .then(res => {
        setInfo(res.data);
        setStatus('form');
      })
      .catch(err => {
        const code = err.response?.data?.error;
        setErrorMsg(
          code === 'TOKEN_EXPIRED' ? '此連結已過期（有效期限72小時），請聯絡館方重新發送連結。' :
          code === 'ALREADY_SIGNED' ? '此報名已經完成簽署囉，感謝您！' :
          '此連結無效，請確認您點選的是正確的Email連結。'
        );
        setStatus('error');
      });
  }, [token]);

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!agreed) { setErrorMsg('請先閱讀並勾選同意條款'); return; }
    if (!sigRef.current || sigRef.current.isEmpty()) { setErrorMsg('請先簽名'); return; }
    setSubmitting(true);
    try {
      await memberClient.post(`/competitions/waiver/parent/${token}`, {
        signatureData: sigRef.current.toDataURL(),
      });
      setStatus('success');
    } catch (err) {
      setErrorMsg(err.response?.data?.message || '簽署失敗，請再試一次');
    } finally {
      setSubmitting(false);
    }
  };

  const s = {
    page: { width: '100%', minHeight: '100vh', background: '#F7F3F3', display: 'flex', justifyContent: 'center', padding: '24px 16px', boxSizing: 'border-box' },
    container: { width: '100%', maxWidth: 480 },
    logo: { textAlign: 'center', fontWeight: 700, fontSize: 18, color: '#8B1A1A', marginBottom: 18 },
    card: { background: '#fff', borderRadius: 14, border: '0.5px solid #E8D5D5', overflow: 'hidden', marginBottom: 16 },
    cardPad: { padding: 18 },
    btnPrimary: { width: '100%', height: 46, borderRadius: 10, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  };

  if (status === 'loading') {
    return (
      <div style={s.page}><div style={s.container}>
        <div style={s.logo}>紅石攀岩館 RedRock Climbing</div>
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>載入中...</div>
      </div></div>
    );
  }

  if (status === 'error') {
    return (
      <div style={s.page}><div style={s.container}>
        <div style={s.logo}>紅石攀岩館 RedRock Climbing</div>
        <div style={s.card}>
          <div style={{ ...s.cardPad, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontSize: 14, color: '#A32D2D', lineHeight: 1.6 }}>{errorMsg}</div>
          </div>
        </div>
      </div></div>
    );
  }

  if (status === 'success') {
    return (
      <div style={s.page}><div style={s.container}>
        <div style={s.logo}>紅石攀岩館 RedRock Climbing</div>
        <div style={s.card}>
          <div style={{ ...s.cardPad, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>簽署完成，謝謝您！</div>
            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.6 }}>
              {info?.memberName ? `${info.memberName} 的「${info.competitionName}」報名已確認。` : '報名已確認。'}
            </div>
          </div>
        </div>
      </div></div>
    );
  }

  // status === 'form'
  return (
    <div style={s.page}><div style={s.container}>
      <div style={s.logo}>紅石攀岩館 RedRock Climbing</div>
      <div style={{ textAlign: 'left', fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 1.6 }}>
        家長/監護人簽署 — 為「{info?.memberName}」簽署「{info?.competitionName}」比賽風險聲明書
      </div>

      <div style={s.card}>
        <div style={{ ...s.cardPad, paddingBottom: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => setLang('zh')} style={{ flex: 1, height: 32, borderRadius: 8, border: '0.5px solid #E8D5D5', background: lang === 'zh' ? '#8B1A1A' : '#fff', color: lang === 'zh' ? '#fff' : '#444', fontSize: 12, cursor: 'pointer' }}>中文</button>
            <button onClick={() => setLang('en')} style={{ flex: 1, height: 32, borderRadius: 8, border: '0.5px solid #E8D5D5', background: lang === 'en' ? '#8B1A1A' : '#fff', color: lang === 'en' ? '#fff' : '#444', fontSize: 12, cursor: 'pointer' }}>English</button>
          </div>
        </div>
        <div style={{ padding: '0 18px 18px' }}>
          <div style={{
            maxHeight: 260, overflowY: 'auto', fontSize: 13, lineHeight: 1.7, color: '#333',
            whiteSpace: 'pre-wrap', background: '#FBF5F5', borderRadius: 10, padding: 14,
            border: '0.5px solid #F0E4E4',
          }}>
            {info?.waiverContent?.[lang] || '（尚未設定聲明書內容，請聯絡館方）'}
          </div>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.cardPad}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#555', marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }} />
            本人作為家長/監護人，已閱讀並理解上述比賽風險聲明書內容，同意子女參加此項賽事。
          </label>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>請於下方簽名：</div>
          <SignaturePad ref={sigRef} height={160} />
          <button onClick={() => sigRef.current?.clear()} style={{ marginTop: 8, fontSize: 12, color: '#8B1A1A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>清除重簽</button>
        </div>
      </div>

      {errorMsg && <div style={{ color: '#A32D2D', fontSize: 12, marginBottom: 10, textAlign: 'center' }}>{errorMsg}</div>}
      <button onClick={handleSubmit} disabled={submitting} style={s.btnPrimary}>
        {submitting ? '送出中...' : '確認簽署'}
      </button>
      <div style={{ fontSize: 11, color: '#bbb', textAlign: 'left', marginTop: 10 }}>
        ⚠ 本聲明書一經簽署即永久生效，不可修改
      </div>
    </div></div>
  );
}
