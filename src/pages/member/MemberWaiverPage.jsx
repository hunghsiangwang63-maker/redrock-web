import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { memberClient } from '../../api/client';
import { getMyWaiver, signEntryDocs } from '../../api/memberAuth';
import { getFallTestSettings, getFallTestSignature } from '../../api/fallTests';
import SignaturePad from '../../components/SignaturePad';
import CheckTick from '../../components/CheckTick';
import { detectInAppBrowser } from '../../utils/inAppBrowser';
import { isMinor as isMinorAge } from '../../utils/age';
import { t, tt } from '../../utils/memberI18n';

// ── 2026-09-26 合併簽署 ─────────────────────────────────────────────
// 「風險安全聲明書」與「墜落測驗同意書」原本要分兩頁、簽兩次名；比照家長遠端簽署早就採用
// 的模式（一次簽名同時完成兩份文件），把會員本人（或代簽子帳號的家長）這端也合併成一頁、
// 一個簽名。底層資料完全不動（waivers／fallTestSignatures 仍是兩個獨立集合，各自的員工端
// 「退回重簽」「檢視副本」機制也不動）——這裡只是判斷「這位對象目前還缺哪一份」，只顯示、
// 只送出缺的那部分，讓「兩份都缺」「只缺一份（員工退回其中一份時）」都能正確運作。
//
// 判斷「waiver 是否只是等家長簽」用 memberSignedAt（本人是否真的簽過），而不是 isComplete——
// isComplete 對「等家長」與「員工退回重簽、本人尚未重簽」兩種狀態都是 false，只有
// memberSignedAt 能分辨這兩者（同一顆修正也做在後端 memberService.getBlockReasons）。

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

export default function MemberWaiverPage() {
  const [searchParams] = useSearchParams();
  const forChildId = searchParams.get('forChild');
  const onboarding = searchParams.get('onboarding') === '1';
  const { member, updateMember } = useMember();
  const navigate = useNavigate();
  const sigRef = useRef(null);
  const playerRef = useRef(null);
  const watchedSecondsRef = useRef(new Set());
  const progressIntervalRef = useRef(null);

  const targetId = forChildId || member?.id;
  const inAppBrowser = detectInAppBrowser();

  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('zh');
  const [waiverText, setWaiverText] = useState({ zh: '', en: '' });
  const [ftSettings, setFtSettings] = useState(null);
  const [waiverDoc, setWaiverDoc] = useState(null);       // 目標對象的 waivers 文件（null=尚未簽過）
  const [ftSigned, setFtSigned] = useState(false);        // 目標對象是否已有墜測同意書簽署紀錄
  const [linkCopied, setLinkCopied] = useState(false);

  const [agreedWaiverParagraphs, setAgreedWaiverParagraphs] = useState(new Set());
  const [agreedFtParagraphs, setAgreedFtParagraphs] = useState(new Set());
  const [watchPercent, setWatchPercent] = useState(0);
  const [parentEmail, setParentEmail] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentRelation, setParentRelation] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');

  // ── 目標對象目前狀態 ──────────────────────────────────────────────
  const memberSigned = !!waiverDoc?.memberSignedAt;
  const waiverComplete = !!waiverDoc?.isComplete;
  const parentPendingOnly = !!(waiverDoc && memberSigned && waiverDoc.parentRequired && !waiverDoc.parentSignedAt);
  const needsFallTestSection = !ftSigned;
  const needsWaiverSection = !waiverComplete && !parentPendingOnly;
  const showAwaitingParentPanel = parentPendingOnly && !needsFallTestSection;
  const showNothingToSign = waiverComplete && !needsFallTestSection;

  // 家長聯絡資訊只在「即將簽署 waiver 本人部分」且對象未滿 18 歲時需要（沿用既有：以登入者本人
  // 年齡判斷，因代簽子帳號時 isChildAccount 會直接完成、不會走到需要家長 Email 這條路）
  const needGuardianInfo = needsWaiverSection && isMinorAge(member?.birthday);

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [waiverRes, ftSettingsRes, ftSigRes] = await Promise.all([
        getMyWaiver(targetId).then(r => r.data.waiver).catch(() => null),
        getFallTestSettings().then(r => r.data).catch(() => null),
        getFallTestSignature(targetId).then(r => !!r.data?.signature).catch(() => false),
      ]);
      let waiverContent = { zh: '', en: '' };
      try { const wr = await memberClient.get('/settings/waiver'); waiverContent = wr.data || waiverContent; } catch (_) {}
      if (cancelled) return;
      setWaiverDoc(waiverRes);
      setFtSettings(ftSettingsRes);
      setFtSigned(ftSigRes);
      setWaiverText(waiverContent);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const handleLangSwitch = (newLang) => {
    setLang(newLang);
    setAgreedWaiverParagraphs(new Set());
    setAgreedFtParagraphs(new Set());
  };

  // 以空白行分段
  const waiverParagraphs = (waiverText[lang] || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const allWaiverAgreed = waiverParagraphs.length > 0 && waiverParagraphs.every((_, i) => agreedWaiverParagraphs.has(i));
  const toggleWaiverParagraph = (idx) => {
    setAgreedWaiverParagraphs(prev => { const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next; });
  };

  const videoId = extractYoutubeId(ftSettings?.youtubeUrl);
  const requiredPercent = ftSettings?.watchPercentRequired || 90;
  const canWatchOk = !videoId || watchPercent >= requiredPercent;
  const ftContent = ftSettings?.[lang === 'zh' ? 'contentZh' : 'contentEn'] || '';
  const ftParagraphs = ftContent.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const allFtAgreed = ftParagraphs.length > 0 && ftParagraphs.every((_, i) => agreedFtParagraphs.has(i));
  const toggleFtParagraph = (idx) => {
    setAgreedFtParagraphs(prev => { const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next; });
  };

  // ── YouTube Player（僅需要顯示墜測同意書段落時才載入）────────────────
  useEffect(() => {
    if (!videoId || loading || !needsFallTestSection) return;
    if (window.YT && window.YT.Player) { initPlayer(); return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = initPlayer;
    return () => { window.onYouTubeIframeAPIReady = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, loading, needsFallTestSection]);

  const initPlayer = () => {
    if (!document.getElementById('waiver-falltest-player')) return;
    playerRef.current = new window.YT.Player('waiver-falltest-player', {
      videoId,
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
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
  const stopProgressTracking = () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); };
  useEffect(() => () => stopProgressTracking(), []);

  const canSubmit =
    (needsWaiverSection || needsFallTestSection) &&
    (!needsWaiverSection || (allWaiverAgreed && (!needGuardianInfo || parentEmail.trim()))) &&
    (!needsFallTestSection || (canWatchOk && allFtAgreed));

  const handleSubmit = async () => {
    setError('');
    if (!needsWaiverSection && !needsFallTestSection) return;
    if (needsWaiverSection && !allWaiverAgreed) { setError(t('請閱讀並勾選所有段落後再簽署')); return; }
    if (needsWaiverSection && needGuardianInfo && !parentEmail.trim()) { setError(t('請填寫法定代理人 Email')); return; }
    if (needsFallTestSection && !canWatchOk) { setError(tt(`請先觀看至少 ${requiredPercent}% 的影片內容`, `Please watch at least ${requiredPercent}% of the video first`, `まず動画を${requiredPercent}%以上ご視聴ください`)); return; }
    if (needsFallTestSection && !allFtAgreed) { setError(t('請閱讀並勾選所有條款後再簽署')); return; }
    if (!sigRef.current || sigRef.current.isEmpty()) { setError(forChildId ? t('請先完成法定代理人簽名') : t('請先完成本人簽名')); return; }

    setSubmitting(true);
    try {
      const signatureData = sigRef.current.toDataURL();
      const payload = { signatureData };
      if (needsWaiverSection) {
        Object.assign(payload, {
          parentEmail: parentEmail.trim(), parentName: parentName.trim(),
          parentPhone: parentPhone.trim(), parentRelation: parentRelation.trim(),
        });
      }
      if (needsFallTestSection) {
        Object.assign(payload, { watchPercent, agreedParagraphs: Array.from(agreedFtParagraphs) });
      }
      const res = await signEntryDocs(targetId, payload);
      const blockReasons = res.data.blockReasons || [];
      if (!forChildId) updateMember({ blockReasons, isBlocked: blockReasons.length > 0 });
      navigate(onboarding ? '/member/home' : '/member/profile');
    } catch (err) {
      setError(err.response?.data?.message || t('簽署失敗，請再試一次'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResending(true); setError('');
    try {
      await memberClient.post(`/members/${member.id}/waiver/resend-parent`);
      alert(t('已重新發送Email通知法定代理人'));
    } catch (err) {
      setError(err.response?.data?.message || t('發送失敗，請稍後再試'));
    } finally { setResending(false); }
  };

  const s = {
    page: { width: '100%', minHeight: '100vh', background: '#F7F3F3', paddingBottom: 40 },
    header: { background: '#fff', padding: '16px 20px', borderBottom: '0.5px solid #E8D5D5', display: 'flex', alignItems: 'center', gap: 10 },
    back: { fontSize: 20, cursor: 'pointer', color: '#8B1A1A' },
    title: { fontWeight: 600, fontSize: 15 },
    card: { background: '#fff', borderRadius: 14, border: '0.5px solid #E8D5D5', margin: '16px 20px', overflow: 'hidden' },
    cardPad: { padding: 16 },
    sectionTitle: { fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 8, textAlign: 'left' },
    btnPrimary: { width: '100%', height: 46, borderRadius: 10, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
    btnSecondary: { width: '100%', height: 42, borderRadius: 10, background: '#fff', color: '#8B1A1A', border: '0.5px solid #8B1A1A', fontSize: 13, cursor: 'pointer' },
    input: { width: '100%', height: 40, borderRadius: 8, border: '0.5px solid #E8D5D5', padding: '0 12px', fontSize: 13, background: '#FBF5F5', outline: 'none', color: '#1a1a1a', boxSizing: 'border-box' },
    label: { fontSize: 12, color: '#888', display: 'block', marginBottom: 5 },
  };

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.header}><div style={s.back} onClick={() => navigate(-1)}>←</div><div style={s.title}>{t('簽署入場文件')}</div></div>
        <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 60 }}>{t('載入中...')}</div>
      </div>
    );
  }

  // ── 已完成本人部分，等待家長/監護人簽署（兩份都已由本人簽完）──
  if (showAwaitingParentPanel) {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.back} onClick={() => navigate('/member/profile')}>←</div>
          <div style={s.title}>{t('入場文件簽署')}</div>
        </div>
        <div style={s.card}>
          <div style={{ ...s.cardPad, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📧</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{t('已完成您本人的簽署')}</div>
            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.6, textAlign: 'left' }}>
              {t('因您未滿18歲，依規定還需要法定代理人（家長／監護人）共同簽署，才能正式入場。')}<br />
              {t('請提醒法定代理人查看Email中的簽署連結（連結有效期限72小時）。')}
            </div>
            {error && <div style={{ color: '#A32D2D', fontSize: 12, marginTop: 12 }}>{error}</div>}
            <button onClick={handleResend} disabled={resending} style={{ ...s.btnSecondary, marginTop: 18 }}>
              {resending ? t('發送中...') : t('重新發送Email連結')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 兩份皆已完成（防禦性，正常不會被導來此頁）──
  if (showNothingToSign) {
    return (
      <div style={s.page}>
        <div style={s.header}><div style={s.back} onClick={() => navigate('/member/profile')}>←</div><div style={s.title}>{t('入場文件簽署')}</div></div>
        <div style={s.card}>
          <div style={{ ...s.cardPad, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{t('已完成簽署')}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.back} onClick={() => navigate(forChildId ? '/member/profile' : '/member/profile')}>←</div>
        <div style={s.title}>{t('簽署入場文件')}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => handleLangSwitch('zh')} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '0.5px solid #E8D5D5', background: lang === 'zh' ? '#8B1A1A' : '#fff', color: lang === 'zh' ? '#fff' : '#444', fontSize: 12, cursor: 'pointer' }}>中文</button>
          <button onClick={() => handleLangSwitch('en')} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '0.5px solid #E8D5D5', background: lang === 'en' ? '#8B1A1A' : '#fff', color: lang === 'en' ? '#fff' : '#444', fontSize: 12, cursor: 'pointer' }}>English</button>
        </div>
      </div>

      <div style={{ padding: '14px 20px 0', fontSize: 13, color: '#888', lineHeight: 1.7 }}>
        {needsWaiverSection && needsFallTestSection
          ? t('入場前請詳閱以下「風險安全聲明書」與「墜落測驗同意書」，全部確認後於下方簽名一次即完成兩份文件。')
          : needsWaiverSection
            ? t('請詳閱以下「風險安全聲明書」，確認後於下方簽名。')
            : t('請觀看安全影片並詳閱以下「墜落測驗同意書」，確認後於下方簽名。')}
      </div>

      {/* 風險安全聲明書 */}
      {needsWaiverSection && (
        <div style={s.card}>
          <div style={{ padding: '16px 16px 0' }}>
            <div style={s.sectionTitle}>{t('風險安全聲明書')}</div>
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {waiverParagraphs.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 20 }}>{t('（尚未設定聲明書內容，請聯絡館方）')}</div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 10, textAlign: 'right' }}>
                  {t('已確認 ')}{agreedWaiverParagraphs.size}{t(' / ')}{waiverParagraphs.length}{t(' 段')}
                </div>
                {waiverParagraphs.map((para, idx) => (
                  <div key={idx} onClick={() => toggleWaiverParagraph(idx)}
                    style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', background: agreedWaiverParagraphs.has(idx) ? '#F0F8F2' : '#FBF5F5', border: `0.5px solid ${agreedWaiverParagraphs.has(idx) ? '#B3DEC0' : '#F0E4E4'}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                    <div style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, border: `2px solid ${agreedWaiverParagraphs.has(idx) ? '#2D7D46' : '#CCC'}`, borderRadius: 3, background: agreedWaiverParagraphs.has(idx) ? '#2D7D46' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {agreedWaiverParagraphs.has(idx) && <CheckTick color="#fff" size={9} />}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: '#333', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{para}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {needsWaiverSection && needGuardianInfo && (
        <div style={s.card}>
          <div style={s.cardPad}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{t('法定代理人資訊（未成年必填）')}</div>
            <div style={{ marginBottom: 10 }}>
              <label style={s.label}>{t('法定代理人 Email（簽署連結將發送至此）*')}</label>
              <input style={s.input} type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="parent@example.com" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={s.label}>{t('法定代理人姓名')}</label><input style={s.input} value={parentName} onChange={e => setParentName(e.target.value)} placeholder={t('選填')} /></div>
              <div><label style={s.label}>{t('關係')}</label><input style={s.input} value={parentRelation} onChange={e => setParentRelation(e.target.value)} placeholder={t('例：父親')} /></div>
            </div>
            <div><label style={s.label}>{t('法定代理人聯絡電話')}</label><input style={s.input} value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder={t('選填')} /></div>
          </div>
        </div>
      )}

      {/* 墜落測驗同意書 */}
      {needsFallTestSection && (
        <div style={s.card}>
          <div style={s.cardPad}>
            <div style={s.sectionTitle}>{t('墜落測驗同意書')}</div>
            {videoId && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '10px 0' }}>{t('📹 請先觀看說明影片')}</div>
                {inAppBrowser.inApp && (
                  <div style={{ background: '#FEF3E2', border: '1px solid #F0C889', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: '#8A5A00', lineHeight: 1.6, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('⚠ 請改用 Safari／Chrome 開啟')}</div>
                    <div>{t('您目前是從 ')}<b>{inAppBrowser.name}</b>{t(' 內建瀏覽器開啟，影片的觀看進度可能')}<b>{t('無法正常記錄')}</b>{t('（進度條不會前進，導致無法簽署）。請複製網址、改用手機的 ')}<b>{t('Safari 或 Chrome')}</b>{t(' 開啟本頁。')}</div>
                    <button type="button"
                      onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); } catch { setLinkCopied(false); } }}
                      style={{ marginTop: 10, height: 34, padding: '0 16px', borderRadius: 8, background: '#8A5A00', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      {linkCopied ? t('✓ 已複製，請貼到瀏覽器') : t('📋 複製本頁網址')}
                    </button>
                  </div>
                )}
                <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 8 }}>
                  <div id="waiver-falltest-player" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 6, background: '#F0E4E4', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${watchPercent}%`, height: '100%', background: canWatchOk ? '#2D7D46' : '#8B1A1A', borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                  <span style={{ fontSize: 12, color: canWatchOk ? '#2D7D46' : '#8B1A1A', fontWeight: 600 }}>
                    {watchPercent}% {canWatchOk ? '✓' : tt(`（需 ${requiredPercent}%）`, `(needs ${requiredPercent}%)`, `（${requiredPercent}%必要）`)}
                  </span>
                </div>
              </>
            )}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 10, textAlign: 'right' }}>{tt(`已確認 ${agreedFtParagraphs.size} / ${ftParagraphs.length} 段`, `Checked ${agreedFtParagraphs.size} / ${ftParagraphs.length}`, `確認済み ${agreedFtParagraphs.size} / ${ftParagraphs.length}`)}</div>
              {ftParagraphs.map((para, idx) => (
                <div key={idx} onClick={() => toggleFtParagraph(idx)}
                  style={{ background: agreedFtParagraphs.has(idx) ? '#F0F8F2' : '#FBF5F5', borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', border: `0.5px solid ${agreedFtParagraphs.has(idx) ? '#B3DEC0' : '#F0E4E4'}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, border: `2px solid ${agreedFtParagraphs.has(idx) ? '#8B1A1A' : '#CCC'}`, borderRadius: 3, background: agreedFtParagraphs.has(idx) ? '#8B1A1A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {agreedFtParagraphs.has(idx) && <CheckTick color="#fff" size={9} />}
                  </div>
                  <span style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.7, textAlign: 'left', display: 'block' }}>{para}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 未成年家長遠端簽署提醒（自 fall-test 頁沿用，只在需要簽 waiver 本人部分時才提示此流程） */}
      {needsWaiverSection && needGuardianInfo && (
        <div style={{ ...s.card, border: '1px solid #F0D9A8', background: '#FFFBF0' }}>
          <div style={s.cardPad}>
            <div style={{ ...s.sectionTitle, color: '#854F0B' }}>{t('👨‍👩‍👧 法定代理人簽名（未滿18歲）')}</div>
            <div style={{ fontSize: 12, color: '#854F0B', lineHeight: 1.7 }}>
              {t('本會員未滿 18 歲，需家長／法定代理人同意。')}<strong>{t('完成本人簽署後')}</strong>{t('，系統會寄一封 email 給法定代理人（家長／監護人），點連結即可於')}<strong>{t('同一頁面一次簽署')}</strong>{t('「風險安全聲明書」與「墜落測驗同意書」兩份文件。')}
            </div>
          </div>
        </div>
      )}

      {/* 簽名（一次適用以上顯示的全部區塊） */}
      <div style={s.card}>
        <div style={s.cardPad}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 8, textAlign: 'left' }}>
            {forChildId ? t('✍️ 法定代理人簽名') : t('✍️ 本人簽名')}
          </div>
          <SignaturePad ref={sigRef} height={160} />
          <button onClick={() => sigRef.current?.clear()} style={{ marginTop: 8, fontSize: 12, color: '#8B1A1A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{t('清除重簽')}</button>
        </div>
      </div>

      <div style={{ margin: '0 20px' }}>
        {error && <div style={{ color: '#A32D2D', fontSize: 12, marginBottom: 10, textAlign: 'left' }}>{error}</div>}
        <button onClick={handleSubmit} disabled={submitting || !canSubmit} style={{ ...s.btnPrimary, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
          {submitting ? t('送出中...') : t('確認簽署')}
        </button>
        {needsWaiverSection && needGuardianInfo && (
          <div style={{ fontSize: 11, color: '#999', textAlign: 'left', marginTop: 10 }}>{t('送出後將發送Email通知法定代理人完成第二階段簽署')}</div>
        )}
        {needsWaiverSection && (
          <div style={{ fontSize: 11, color: '#bbb', textAlign: 'left', marginTop: 10 }}>{t('⚠ 本聲明書一經簽署即永久生效，不可修改')}</div>
        )}
      </div>
    </div>
  );
}
