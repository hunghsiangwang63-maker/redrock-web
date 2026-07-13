import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { memberClient } from '../../api/client';
import SignaturePad from '../../components/SignaturePad';

export default function MemberWaiverPage() {
  const [searchParams] = useSearchParams();
  const forChildId = searchParams.get('forChild');
  const forChildName = searchParams.get('childName');
  const onboarding = searchParams.get('onboarding') === '1';  // 新會員入場前置流程：簽完回 gate
  const { member, updateMember } = useMember();
  const navigate = useNavigate();
  const sigRef = useRef(null);

  const [waiverText, setWaiverText] = useState({ zh: '', en: '' });
  const [lang, setLang] = useState('zh');
  const [agreedParagraphs, setAgreedParagraphs] = useState(new Set());
  const [parentEmail, setParentEmail] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentRelation, setParentRelation] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [textLoaded, setTextLoaded] = useState(false);

  const isMinor = !!member?.isMinor;
  const pendingParent = member?.blockReasons?.includes('parent_waiver_pending');

  // 以空白行分段，過濾掉純空白段落
  const paragraphs = (waiverText[lang] || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const allAgreed = paragraphs.length > 0 && paragraphs.every((_, i) => agreedParagraphs.has(i));

  const toggleParagraph = (idx) => {
    setAgreedParagraphs(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const handleLangSwitch = (newLang) => {
    setLang(newLang);
    setAgreedParagraphs(new Set()); // 切換語言需要重新逐段確認，避免跳過實際閱讀
  };

  useEffect(() => {
    memberClient.get('/settings/waiver')
      .then(res => setWaiverText(res.data || { zh: '', en: '' }))
      .catch(() => {})
      .finally(() => setTextLoaded(true));
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!allAgreed) { setError('請閱讀並勾選所有段落後再簽署'); return; }
    if (!sigRef.current || sigRef.current.isEmpty()) { setError('請先簽名'); return; }
    if (isMinor && !parentEmail.trim()) { setError('請填寫法定代理人 Email'); return; }

    setLoading(true);
    try {
      const res = await memberClient.post(`/members/${forChildId || member.id}/waiver/sign`, {
        signatureData: sigRef.current.toDataURL(),
        ...(isMinor ? { parentEmail: parentEmail.trim(), parentName: parentName.trim(), parentPhone: parentPhone.trim(), parentRelation: parentRelation.trim() } : {}),
      });
      const blockReasons = res.data.blockReasons || [];
      updateMember({ blockReasons, isBlocked: blockReasons.length > 0 });
      navigate(onboarding ? '/member/home' : '/member/profile');
    } catch (err) {
      setError(err.response?.data?.message || '簽署失敗，請再試一次');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      await memberClient.post(`/members/${member.id}/waiver/resend-parent`);
      alert('已重新發送Email通知法定代理人');
    } catch (err) {
      setError(err.response?.data?.message || '發送失敗，請稍後再試');
    } finally {
      setResending(false);
    }
  };

  const s = {
    page: { width: '100%', minHeight: '100vh', background: '#F7F3F3', paddingBottom: 40 },
    header: { background: '#fff', padding: '16px 20px', borderBottom: '0.5px solid #E8D5D5', display: 'flex', alignItems: 'center', gap: 10 },
    back: { fontSize: 20, cursor: 'pointer', color: '#8B1A1A' },
    title: { fontWeight: 600, fontSize: 15 },
    card: { background: '#fff', borderRadius: 14, border: '0.5px solid #E8D5D5', margin: '16px 20px', overflow: 'hidden' },
    cardPad: { padding: 16 },
    btnPrimary: { width: '100%', height: 46, borderRadius: 10, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
    btnSecondary: { width: '100%', height: 42, borderRadius: 10, background: '#fff', color: '#8B1A1A', border: '0.5px solid #8B1A1A', fontSize: 13, cursor: 'pointer' },
    input: { width: '100%', height: 40, borderRadius: 8, border: '0.5px solid #E8D5D5', padding: '0 12px', fontSize: 13, background: '#FBF5F5', outline: 'none', color: '#1a1a1a', boxSizing: 'border-box' },
    label: { fontSize: 12, color: '#888', display: 'block', marginBottom: 5 },
  };

  // ── 已簽署本人部分，等待家長/監護人簽署 ──
  if (pendingParent) {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.back} onClick={() => navigate('/member/profile')}>←</div>
          <div style={s.title}>Waiver 風險安全聲明書</div>
        </div>
        <div style={s.card}>
          <div style={{ ...s.cardPad, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📧</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>已完成您本人的簽署</div>
            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.6, textAlign: 'left' }}>
              因您未滿18歲，依規定還需要法定代理人（家長／監護人）共同簽署，才能正式入場。<br />
              請提醒法定代理人查看Email中的簽署連結（連結有效期限72小時）。
            </div>
            {error && <div style={{ color: '#A32D2D', fontSize: 12, marginTop: 12 }}>{error}</div>}
            <button onClick={handleResend} disabled={resending} style={{ ...s.btnSecondary, marginTop: 18 }}>
              {resending ? '發送中...' : '重新發送Email連結'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.back} onClick={() => navigate('/member/profile')}>←</div>
        <div style={s.title}>簽署風險安全聲明書</div>
      </div>

      <div style={s.card}>
        <div style={{ ...s.cardPad, paddingBottom: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => handleLangSwitch('zh')} style={{ flex: 1, height: 32, borderRadius: 8, border: '0.5px solid #E8D5D5', background: lang === 'zh' ? '#8B1A1A' : '#fff', color: lang === 'zh' ? '#fff' : '#444', fontSize: 12, cursor: 'pointer' }}>中文</button>
            <button onClick={() => handleLangSwitch('en')} style={{ flex: 1, height: 32, borderRadius: 8, border: '0.5px solid #E8D5D5', background: lang === 'en' ? '#8B1A1A' : '#fff', color: lang === 'en' ? '#fff' : '#444', fontSize: 12, cursor: 'pointer' }}>English</button>
          </div>
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          {!textLoaded ? (
            <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 20 }}>載入中...</div>
          ) : paragraphs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 20 }}>（尚未設定聲明書內容，請聯絡館方）</div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 10, textAlign: 'right' }}>
                已確認 {agreedParagraphs.size} / {paragraphs.length} 段
              </div>
              {paragraphs.map((para, idx) => (
                <div key={idx} onClick={() => toggleParagraph(idx)}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                    background: agreedParagraphs.has(idx) ? '#F0F8F2' : '#FBF5F5',
                    border: `0.5px solid ${agreedParagraphs.has(idx) ? '#B3DEC0' : '#F0E4E4'}`,
                    borderRadius: 10, padding: 14, marginBottom: 10, transition: 'background .15s',
                  }}>
                  <div
                    style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, border: `2px solid ${agreedParagraphs.has(idx) ? '#2D7D46' : '#CCC'}`, borderRadius: 3, background: agreedParagraphs.has(idx) ? '#2D7D46' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    {agreedParagraphs.has(idx) && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: '#333', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{para}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {isMinor && (
        <div style={s.card}>
          <div style={s.cardPad}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>法定代理人資訊（未成年必填）</div>
            <div style={{ marginBottom: 10 }}>
              <label style={s.label}>法定代理人 Email（簽署連結將發送至此）*</label>
              <input style={s.input} type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="parent@example.com" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={s.label}>法定代理人姓名</label>
                <input style={s.input} value={parentName} onChange={e => setParentName(e.target.value)} placeholder="選填" />
              </div>
              <div>
                <label style={s.label}>關係</label>
                <input style={s.input} value={parentRelation} onChange={e => setParentRelation(e.target.value)} placeholder="例：父親" />
              </div>
            </div>
            <div>
              <label style={s.label}>法定代理人聯絡電話</label>
              <input style={s.input} value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="選填" />
            </div>
          </div>
        </div>
      )}

      <div style={s.card}>
        <div style={s.cardPad}>
          {!allAgreed ? (
            <div style={{ textAlign: 'left', padding: '10px 0', color: '#999', fontSize: 13 }}>
              請閱讀並勾選上方所有段落後，即可進行簽名
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#2D7D46', marginBottom: 14, fontWeight: 500 }}>
                ✓ 已確認閱讀並同意全部條款，請於下方簽名：
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 8, textAlign: 'left' }}>
                {forChildId ? '✍️ 法定代理人簽名' : '✍️ 本人簽名'}
              </div>
              <SignaturePad ref={sigRef} height={160} />
              <button onClick={() => sigRef.current?.clear()} style={{ marginTop: 8, fontSize: 12, color: '#8B1A1A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>清除重簽</button>
            </>
          )}
        </div>
      </div>

      <div style={{ margin: '0 20px' }}>
        {error && <div style={{ color: '#A32D2D', fontSize: 12, marginBottom: 10, textAlign: 'left' }}>{error}</div>}
        <button onClick={handleSubmit} disabled={loading || !allAgreed} style={{ ...s.btnPrimary, opacity: allAgreed ? 1 : 0.5, cursor: allAgreed ? 'pointer' : 'not-allowed' }}>
          {loading ? '送出中...' : '確認簽署'}
        </button>
        {isMinor && (
          <div style={{ fontSize: 11, color: '#999', textAlign: 'left', marginTop: 10 }}>
            送出後將發送Email通知法定代理人完成第二階段簽署
          </div>
        )}
        <div style={{ fontSize: 11, color: '#bbb', textAlign: 'left', marginTop: 10 }}>
          ⚠ 本聲明書一經簽署即永久生效，不可修改
        </div>
      </div>
    </div>
  );
}
