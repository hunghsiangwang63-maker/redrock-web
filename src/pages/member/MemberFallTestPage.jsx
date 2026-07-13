import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { getFallTestSettings, signFallTestAgreement, getFallTestSignature, getMyFallTestStatus } from '../../api/fallTests';
import SignaturePad from '../../components/SignaturePad';
import dayjs from 'dayjs';
import { isMinor } from '../../utils/age';

const extractYoutubeId = (url) => {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
};

export default function MemberFallTestPage() {
  const [searchParams] = useSearchParams();
  const forChildId = searchParams.get('forChild');
  const forChildName = searchParams.get('childName');
  const onboarding = searchParams.get('onboarding') === '1';  // 新會員入場前置流程：簽完回 gate
  const { member } = useMember();
  const targetId = forChildId || member?.id; // 代簽子帳號時為子帳號 id，否則為本人
  const navigate = useNavigate();
  const sigRef = useRef(null);
  const guardianSigRef = useRef(null);
  const playerRef = useRef(null);
  const watchedSecondsRef = useRef(new Set());
  const progressIntervalRef = useRef(null);

  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [signature, setSignature] = useState(null);
  const [signatureLoading, setSignatureLoading] = useState(true); // 已簽署副本
  const [view, setView] = useState('main'); // 'main' | 'sign' | 'copy'
  const [lang, setLang] = useState('zh');
  const [playerReady, setPlayerReady] = useState(false);
  const [watchPercent, setWatchPercent] = useState(0);
  const [agreedParagraphs, setAgreedParagraphs] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 未滿 18 歲（未成年）需家長/監護人一同簽署（與聲明書/課程/比賽/註冊一致）
  const needGuardian = isMinor(member?.birthday);

  useEffect(() => {
    if (!member) return;
    const load = async () => {
      try { const s = await getFallTestSettings(); setSettings(s.data); } catch {}
      try { const st = await getMyFallTestStatus(targetId); setStatus(st.data); } catch {}
      try { const sig = await getFallTestSignature(targetId); setSignature(sig.data.signature); } catch {}
      setSignatureLoading(false);
    };
    load();
  }, [member]);

  const videoId = extractYoutubeId(settings?.youtubeUrl);
  const requiredPercent = settings?.watchPercentRequired || 90;
  // 若未設定影片，自動視為已觀看（影片為選配）
  const canSign = !videoId || watchPercent >= requiredPercent;
  const content = settings?.[lang === 'zh' ? 'contentZh' : 'contentEn'] || '';
  const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const allAgreed = paragraphs.length > 0 && paragraphs.every((_, i) => agreedParagraphs.has(i));

  const toggleParagraph = (idx) => {
    setAgreedParagraphs(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  // YouTube Player
  useEffect(() => {
    if (!videoId || view !== 'sign') return;
    if (window.YT && window.YT.Player) { initPlayer(); return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = initPlayer;
    return () => { window.onYouTubeIframeAPIReady = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, view]);

  const initPlayer = () => {
    if (!document.getElementById('falltest-player')) return;
    playerRef.current = new window.YT.Player('falltest-player', {
      videoId,
      playerVars: { rel: 0, modestbranding: 1 },
      events: {
        onReady: (e) => { setPlayerReady(true); },
        onStateChange: (e) => {
          if (e.data === window.YT.PlayerState.PLAYING) startProgressTracking();
          else stopProgressTracking();
        },
      },
    });
  };

  const startProgressTracking = () => {
    stopProgressTracking();
    progressIntervalRef.current = setInterval(() => {
      if (!playerRef.current?.getCurrentTime) return;
      const current = Math.floor(playerRef.current.getCurrentTime());
      const total = playerRef.current.getDuration();
      if (total > 0) {
        watchedSecondsRef.current.add(current);
        setWatchPercent(Math.min(100, Math.round((watchedSecondsRef.current.size / total) * 100)));
      }
    }, 1000);
  };

  const stopProgressTracking = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  };

  useEffect(() => () => stopProgressTracking(), []);

  const handleSubmit = async () => {
    setError('');
    if (!canSign) { setError(`請先觀看至少 ${requiredPercent}% 的影片內容`); return; }
    if (!allAgreed) { setError('請閱讀並勾選所有條款後再簽署'); return; }
    if (!sigRef.current || sigRef.current.isEmpty()) { setError(forChildId ? '請先完成法定代理人簽名' : '請先完成本人簽名'); return; }
    // 未滿 18 歲：家長簽名改為遠端——本人簽完後系統寄 email 給家長，於同一連結一次簽署兩份文件

    setLoading(true);
    try {
      await signFallTestAgreement({
        memberId: member.id,
        targetMemberId: forChildId || undefined, // 代簽子帳號時帶子帳號 id，後端據此寫到子帳號
        signatureData: sigRef.current.toDataURL(),
        watchPercent,
        agreedParagraphs: Array.from(agreedParagraphs),
      });
      if (onboarding) { navigate('/member/home'); return; }  // 回 gate → 自動走到下一步（安排墜落測驗）
      const [st, sig] = await Promise.all([
        getMyFallTestStatus(targetId),
        getFallTestSignature(targetId),
      ]);
      setStatus(st.data);
      setSignature(sig.data.signature);
      setView('main');
    } catch (err) {
      setError(err.response?.data?.message || '簽署失敗，請再試一次');
    } finally { setLoading(false); }
  };

  const s = {
    page: { width: '100%', minHeight: '100vh', background: '#F7F3F3', paddingBottom: 40 },
    header: { background: '#8B1A1A', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 },
    backBtn: { background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: 0 },
    card: { background: '#fff', borderRadius: 14, margin: '16px 16px 0', padding: 20, border: '0.5px solid #E8D5D5' },
    btnPrimary: { width: '100%', height: 48, borderRadius: 12, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 12 },
    btnSecondary: { width: '100%', height: 44, borderRadius: 12, background: '#fff', color: '#8B1A1A', border: '1px solid #8B1A1A', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginTop: 8 },
    label: { fontSize: 11, color: '#6b6b6b', marginBottom: 4 },
    sectionTitle: { fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 8, textAlign: 'left' },
  };

  if (!member) return (
    <div style={s.page}>
      <div style={s.header}><button style={s.backBtn} onClick={() => navigate(-1)}>‹</button><span style={{ fontWeight: 700, fontSize: 17 }}>墜落測驗</span></div>
      <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>載入中...</div>
    </div>
  );

  // ── 副本檢視 ───────────────────────────────────────────────────────
  if (view === 'copy' && signature) {
    const signedAt = signature.signedAt?.toDate ? signature.signedAt.toDate() : new Date(signature.signedAt?._seconds * 1000 || 0);
    // 優先使用簽署當下的文字快照，若無（舊簽署紀錄）退而使用現行設定內容並標註
    const copyContent = signature.contentSnapshot?.zh || settings.contentZh || '';
    const isFallback = !signature.contentSnapshot?.zh;
    const copyParagraphs = copyContent.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button style={s.backBtn} onClick={() => setView('main')}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 17 }}>墜落測驗同意書副本</span>
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>簽署時間：{dayjs(signedAt).format('YYYY/MM/DD HH:mm')}</div>
          {isFallback && (
            <div style={{ fontSize: 11, color: '#854F0B', background: '#FFFBF0', border: '0.5px solid #F0D9A8', borderRadius: 6, padding: '6px 10px', marginBottom: 12 }}>
              ⚠ 此份副本未儲存簽署當下的條款文字，以下顯示現行版本（非簽署當時逐字快照）
            </div>
          )}
          <div style={s.sectionTitle}>同意條款</div>
          {(signature.agreedParagraphs || []).map((idx) => (
            copyParagraphs[idx] ? (
              <div key={idx} style={{ background: '#F0F8F2', borderRadius: 8, padding: '10px 12px', marginBottom: 8, fontSize: 13, color: '#1a1a1a', lineHeight: 1.7, border: '0.5px solid #B3DEC0', textAlign: 'left' }}>
                ✓ {copyParagraphs[idx]}
              </div>
            ) : null
          ))}
          {signature.signatureData && (
            <div style={{ marginTop: 20 }}>
              <div style={s.sectionTitle}>{forChildId ? '法定代理人簽名' : '本人簽名'}</div>
              <img src={signature.signatureData} alt="簽名" style={{ width: '100%', maxWidth: 340, border: '0.5px solid #E8D5D5', borderRadius: 8 }} />
            </div>
          )}
          {signature.guardianSignatureData && (
            <div style={{ marginTop: 20 }}>
              <div style={s.sectionTitle}>家長/監護人簽名</div>
              <img src={signature.guardianSignatureData} alt="家長簽名" style={{ width: '100%', maxWidth: 340, border: '0.5px solid #E8D5D5', borderRadius: 8 }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 簽署流程 ───────────────────────────────────────────────────────
  if (view === 'sign') {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button style={s.backBtn} onClick={() => setView('main')}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 17 }}>墜落測驗同意書</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => setLang('zh')} style={{ background: lang === 'zh' ? 'rgba(255,255,255,0.3)' : 'none', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>中文</button>
            <button onClick={() => setLang('en')} style={{ background: lang === 'en' ? 'rgba(255,255,255,0.3)' : 'none', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>English</button>
          </div>
        </div>

        {/* 影片區 */}
        {videoId && (
          <div style={s.card}>
            <div style={{ ...s.sectionTitle, marginBottom: 12 }}>📹 請先觀看說明影片</div>
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 8 }}>
              <div id="falltest-player" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 6, background: '#F0E4E4', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${watchPercent}%`, height: '100%', background: canSign ? '#2D7D46' : '#8B1A1A', borderRadius: 3, transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: 12, color: canSign ? '#2D7D46' : '#8B1A1A', fontWeight: 600 }}>
                {watchPercent}% {canSign ? '✓' : `（需 ${requiredPercent}%）`}
              </span>
            </div>
          </div>
        )}

        {/* 條款區 */}
        <div style={s.card}>
          <div style={{ ...s.sectionTitle, marginBottom: 4 }}>📋 閱讀並逐項確認</div>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 12 }}>已確認 {agreedParagraphs.size} / {paragraphs.length} 段</div>
          {paragraphs.map((para, idx) => (
            <div key={idx} onClick={() => toggleParagraph(idx)}
              style={{ background: agreedParagraphs.has(idx) ? '#F0F8F2' : '#FBF5F5', borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', border: `0.5px solid ${agreedParagraphs.has(idx) ? '#B3DEC0' : '#F0E4E4'}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, border: `2px solid ${agreedParagraphs.has(idx) ? '#8B1A1A' : '#CCC'}`, borderRadius: 3, background: agreedParagraphs.has(idx) ? '#8B1A1A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                {agreedParagraphs.has(idx) && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
              </div>
              <span style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.7, textAlign: 'left', display: 'block' }}>{para}</span>
            </div>
          ))}
        </div>

        {/* 本人簽名 */}
        <div style={s.card}>
          <div style={s.sectionTitle}>{forChildId ? '✍️ 法定代理人簽名' : '✍️ 本人簽名'}</div>
          <SignaturePad ref={sigRef} />
          <button onClick={() => sigRef.current?.clear()} style={{ fontSize: 12, color: '#999', background: 'none', border: 'none', cursor: 'pointer', marginTop: 6 }}>清除重簽</button>
        </div>

        {/* 家長簽名（未滿18歲）：改為遠端 email 簽署，不在現場簽 */}
        {needGuardian && (
          <div style={{ ...s.card, border: '1px solid #F0D9A8', background: '#FFFBF0' }}>
            <div style={{ ...s.sectionTitle, color: '#854F0B' }}>👨‍👩‍👧 家長/監護人簽名（未滿18歲）</div>
            <div style={{ fontSize: 12, color: '#854F0B', lineHeight: 1.7 }}>
              本會員未滿 18 歲，需家長／法定代理人同意。<strong>完成本人簽署後</strong>，系統會寄一封 email 給家長，家長點連結即可於<strong>同一頁面一次簽署</strong>「風險安全聲明書」與「墜落測驗同意書」兩份文件。<br/>
              （若風險安全聲明書尚未簽署，家長 email 會等兩份本人簽署都完成後才寄出。）
            </div>
          </div>
        )}

        {error && (
          <div style={{ margin: '12px 16px 0', background: '#FCEBEB', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#A32D2D' }}>{error}</div>
        )}

        <div style={{ padding: '0 16px' }}>
          <button onClick={handleSubmit} disabled={loading || !canSign || !allAgreed}
            style={{ ...s.btnPrimary, opacity: (loading || !canSign || !allAgreed) ? 0.5 : 1, cursor: (loading || !canSign || !allAgreed) ? 'not-allowed' : 'pointer' }}>
            {loading ? '簽署中...' : '確認簽署'}
          </button>
        </div>
      </div>
    );
  }

  // ── 主頁面 ─────────────────────────────────────────────────────────
  const hasSigned = !!signature;
  // API 回傳 status.status = 'passed' | 'expired' | 'failed' | 'not_tested'
  const testValid   = status?.status === 'passed';
  const testExpired = status?.status === 'expired';
  const testPassed  = testValid || testExpired; // 曾通過但可能已過期

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(-1)}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 17 }}>墜落測驗</span>
      </div>

      {/* 測驗狀態 */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: testValid ? '#E6F4EB' : testExpired ? '#FAEEDA' : '#FCEBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            {testValid ? '✓' : testExpired ? '⚠' : '✗'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: testValid ? '#2D7D46' : testExpired ? '#854F0B' : '#A32D2D' }}>
              {testValid ? '測驗有效' : testExpired ? '測驗已過期' : '尚未通過測驗'}
            </div>
            {status?.passedAt && (
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                測驗日期：{dayjs(status.passedAt).format('YYYY/MM/DD')}
              </div>
            )}
            {testValid && status?.expiresAt && (
              <div style={{ fontSize: 12, color: '#999' }}>
                有效期限：{dayjs(status.expiresAt).format('YYYY/MM/DD')}
              </div>
            )}
            {testExpired && status?.expiredAt && (
              <div style={{ fontSize: 12, color: '#854F0B' }}>
                已於 {dayjs(status.expiredAt).format('YYYY/MM/DD')} 到期，請重新測驗
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 同意書狀態 */}
      <div style={s.card}>
        <div style={s.sectionTitle}>墜落測驗同意書</div>
        {signatureLoading ? (
          <div style={{ fontSize: 13, color: '#999' }}>載入中...</div>
        ) : hasSigned ? (
          <>
            <div style={{ fontSize: 13, color: '#2D7D46', marginBottom: 12 }}>
              ✓ 已完成簽署
              {signature?.signedAt && ` — ${dayjs(signature.signedAt?.toDate?.() || new Date(signature.signedAt?._seconds * 1000)).format('YYYY/MM/DD')}`}
            </div>
            <button onClick={() => setView('copy')} style={s.btnSecondary}>檢視副本</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#A32D2D', marginBottom: 12 }}>尚未簽署同意書，無法進行墜落測驗</div>
            <button onClick={() => setView('sign')} style={s.btnPrimary}>前往簽署</button>
          </>
        )}
      </div>
    </div>
  );
}
