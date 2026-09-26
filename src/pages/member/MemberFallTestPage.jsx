import { useState, useEffect } from 'react';
import MemberLogoutButton from '../../components/MemberLogoutButton';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { getFallTestSettings, getFallTestSignature, getMyFallTestStatus } from '../../api/fallTests';
import { getMyFallTestBookings, createFallTestBooking, cancelFallTestBooking } from '../../api/fallTestBookings';
import dayjs from 'dayjs';
import { t, tt } from '../../utils/memberI18n';

// 2026-09-26：「簽署」子畫面已合併進 /member/waiver（風險安全聲明書＋墜落測驗同意書一次
// 簽名，見該檔頭註解）。此頁只保留跟「怎麼簽的」無關的三件事：測驗通過/過期狀態、檢視
// 已簽副本、安排墜落測驗（選場館）。「尚未簽署」的 CTA 一律導去合併簽署頁。
export default function MemberFallTestPage() {
  const [searchParams] = useSearchParams();
  const forChildId = searchParams.get('forChild');
  const { member } = useMember();
  const targetId = forChildId || member?.id;
  const navigate = useNavigate();

  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [signature, setSignature] = useState(null);
  const [signatureLoading, setSignatureLoading] = useState(true);
  const [view, setView] = useState('main'); // 'main' | 'copy'
  // 安排墜落測驗（選場館）
  const FT_GYMS = [{ id: 'gym-hsinchu', name: '新竹館' }, { id: 'gym-shilin', name: '士林館' }];
  const ftGymName = (id) => t(FT_GYMS.find(g => g.id === id)?.name || id);
  const [booking, setBooking] = useState(null);      // 此人的 pending 排測
  const [ftBusy, setFtBusy] = useState(false);
  const [ftMsg, setFtMsg] = useState('');
  const [ftMsgOk, setFtMsgOk] = useState(false); // 訊息顏色改用旗標判斷，避免翻譯後字串比對失準
  const loadBooking = async () => {
    try {
      const r = await getMyFallTestBookings();
      setBooking((r.data.bookings || []).find(b => b.memberId === targetId && b.status === 'pending') || null);
    } catch (e) { /* 排測載入失敗不影響其餘 */ }
  };
  const scheduleFallTest = async (gymId) => {
    setFtBusy(true); setFtMsg('');
    try {
      await createFallTestBooking({ gymId, targetMemberId: forChildId || undefined });
      setFtMsg(t('已安排墜落測驗，請至該館現場測驗')); setFtMsgOk(true);
      await loadBooking();
    } catch (e) { setFtMsg(e.response?.data?.message || t('安排失敗')); setFtMsgOk(false); }
    finally { setFtBusy(false); }
  };
  const cancelBooking = async () => {
    if (!booking) return;
    setFtBusy(true); setFtMsg('');
    try { await cancelFallTestBooking(booking.id); setBooking(null); }
    catch (e) { setFtMsg(e.response?.data?.message || t('取消失敗')); setFtMsgOk(false); }
    finally { setFtBusy(false); }
  };

  useEffect(() => {
    if (!member) return;
    const load = async () => {
      try { const s = await getFallTestSettings(); setSettings(s.data); } catch {}
      try { const st = await getMyFallTestStatus(targetId); setStatus(st.data); } catch {}
      try { const sig = await getFallTestSignature(targetId); setSignature(sig.data.signature); } catch {}
      await loadBooking();
      setSignatureLoading(false);
    };
    load();
  }, [member]);

  const signUrl = `/member/waiver${forChildId ? `?forChild=${forChildId}` : ''}`;

  const s = {
    page: { width: '100%', minHeight: '100vh', background: '#F7F3F3', paddingBottom: 40 },
    header: { background: '#8B1A1A', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 },
    backBtn: { background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: 0 },
    card: { background: '#fff', borderRadius: 14, margin: '16px 16px 0', padding: 20, border: '0.5px solid #E8D5D5' },
    btnPrimary: { width: '100%', height: 48, borderRadius: 12, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 12 },
    btnSecondary: { width: '100%', height: 44, borderRadius: 12, background: '#fff', color: '#8B1A1A', border: '1px solid #8B1A1A', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginTop: 8 },
    sectionTitle: { fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 8, textAlign: 'left' },
  };

  if (!member) return (
    <div style={s.page}>
      <MemberLogoutButton />
      <div style={s.header}><button style={s.backBtn} onClick={() => navigate(-1)}>‹</button><span style={{ fontWeight: 700, fontSize: 17 }}>{t('墜落測驗')}</span></div>
      <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>{t('載入中...')}</div>
    </div>
  );

  // ── 副本檢視 ───────────────────────────────────────────────────────
  if (view === 'copy' && signature) {
    const signedAt = signature.signedAt?.toDate ? signature.signedAt.toDate() : new Date(signature.signedAt?._seconds * 1000 || 0);
    const copyContent = signature.contentSnapshot?.zh || settings.contentZh || '';
    const isFallback = !signature.contentSnapshot?.zh;
    const copyParagraphs = copyContent.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button style={s.backBtn} onClick={() => setView('main')}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 17 }}>{t('墜落測驗同意書副本')}</span>
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>{t('簽署時間：')}{dayjs(signedAt).format('YYYY/MM/DD HH:mm')}</div>
          {isFallback && (
            <div style={{ fontSize: 11, color: '#854F0B', background: '#FFFBF0', border: '0.5px solid #F0D9A8', borderRadius: 6, padding: '6px 10px', marginBottom: 12 }}>
              {t('⚠ 此份副本未儲存簽署當下的條款文字，以下顯示現行版本（非簽署當時逐字快照）')}
            </div>
          )}
          <div style={s.sectionTitle}>{t('同意條款')}</div>
          {(signature.agreedParagraphs || []).map((idx) => (
            copyParagraphs[idx] ? (
              <div key={idx} style={{ background: '#F0F8F2', borderRadius: 8, padding: '10px 12px', marginBottom: 8, fontSize: 13, color: '#1a1a1a', lineHeight: 1.7, border: '0.5px solid #B3DEC0', textAlign: 'left' }}>
                ✓ {copyParagraphs[idx]}
              </div>
            ) : null
          ))}
          {signature.signatureData && (
            <div style={{ marginTop: 20 }}>
              <div style={s.sectionTitle}>{forChildId ? t('法定代理人簽名') : t('本人簽名')}</div>
              <img src={signature.signatureData} alt={t('簽名')} style={{ width: '100%', maxWidth: 340, border: '0.5px solid #E8D5D5', borderRadius: 8 }} />
            </div>
          )}
          {signature.guardianSignatureData && (
            <div style={{ marginTop: 20 }}>
              <div style={s.sectionTitle}>{t('法定代理人簽名')}</div>
              <img src={signature.guardianSignatureData} alt={t('法定代理人簽名')} style={{ width: '100%', maxWidth: 340, border: '0.5px solid #E8D5D5', borderRadius: 8 }} />
            </div>
          )}
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
        <span style={{ fontWeight: 700, fontSize: 17 }}>{t('墜落測驗')}</span>
      </div>

      {/* 測驗狀態 */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: testValid ? '#E6F4EB' : testExpired ? '#FAEEDA' : '#FCEBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            {testValid ? '✓' : testExpired ? '⚠' : '✗'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: testValid ? '#2D7D46' : testExpired ? '#854F0B' : '#A32D2D' }}>
              {testValid ? t('測驗有效') : testExpired ? t('測驗已過期') : t('尚未通過測驗')}
            </div>
            {status?.passedAt && (
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                {t('測驗日期：')}{dayjs(status.passedAt).format('YYYY/MM/DD')}
              </div>
            )}
            {testValid && status?.expiresAt && (
              <div style={{ fontSize: 12, color: '#999' }}>
                {t('有效期限：')}{dayjs(status.expiresAt).format('YYYY/MM/DD')}
              </div>
            )}
            {testExpired && status?.expiredAt && (
              <div style={{ fontSize: 12, color: '#854F0B' }}>
                {tt(`已於 ${dayjs(status.expiredAt).format('YYYY/MM/DD')} 到期，請重新測驗`, `Expired on ${dayjs(status.expiredAt).format('YYYY/MM/DD')} — please retake the test`, `${dayjs(status.expiredAt).format('YYYY/MM/DD')}に期限切れになりました。再検定してください`)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 同意書狀態 */}
      <div style={s.card}>
        <div style={s.sectionTitle}>{t('墜落測驗同意書')}</div>
        {signatureLoading ? (
          <div style={{ fontSize: 13, color: '#999' }}>{t('載入中...')}</div>
        ) : hasSigned ? (
          <>
            <div style={{ fontSize: 13, color: '#2D7D46', marginBottom: 12 }}>
              {t('✓ 已完成簽署')}
              {signature?.signedAt && ` — ${dayjs(signature.signedAt?.toDate?.() || new Date(signature.signedAt?._seconds * 1000)).format('YYYY/MM/DD')}`}
            </div>
            <button onClick={() => setView('copy')} style={s.btnSecondary}>{t('檢視副本')}</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#A32D2D', marginBottom: 12 }}>{t('尚未簽署同意書，無法進行墜落測驗')}</div>
            <button onClick={() => navigate(signUrl)} style={s.btnPrimary}>{t('前往簽署')}</button>
          </>
        )}
      </div>

      {/* 安排墜落測驗：同意書已簽 + 尚未通過 → 選場館排測 / 已排測顯示待現場測驗 */}
      {hasSigned && !testValid && (
        <div style={s.card}>
          <div style={s.sectionTitle}>{t('安排墜落測驗')}</div>
          {booking ? (
            <>
              <div style={{ fontSize: 13, color: '#B5762B', fontWeight: 600, marginBottom: 12 }}>
                {tt(`⏳ 已安排 ${ftGymName(booking.gymId)}，請至該館現場完成測驗`, `⏳ Scheduled at ${ftGymName(booking.gymId)} — please complete the test there in person`, `⏳ ${ftGymName(booking.gymId)}で予約済み。現地でテストを受けてください`)}
              </div>
              <button disabled={ftBusy} onClick={cancelBooking} style={s.btnSecondary}>
                {ftBusy ? t('處理中…') : t('取消 / 更改場館')}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 10, textAlign: 'left' }}>
                {t('請選擇測驗場館，安排後至該館現場由工作人員進行測驗：')}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {FT_GYMS.map(g => (
                  <button key={g.id} disabled={ftBusy} onClick={() => scheduleFallTest(g.id)}
                    style={{ flex: 1, height: 44, borderRadius: 10, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                    {ftBusy ? '…' : t(g.name)}
                  </button>
                ))}
              </div>
            </>
          )}
          {ftMsg && <div style={{ fontSize: 12, color: ftMsgOk ? '#2D7D46' : '#A32D2D', marginTop: 10 }}>{ftMsg}</div>}
        </div>
      )}
    </div>
  );
}
