import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMember } from '../store/memberStore.jsx';
import { memberClient } from '../api/client';
import { getMemberGyms } from '../api/gyms';
import { getFallTestSignature, getMyFallTestStatus } from '../api/fallTests';
import { getMyFallTestBookings, createFallTestBooking, skipFallTestSchedule } from '../api/fallTestBookings';

/**
 * 新會員入場前置流程（全屏硬卡）：
 *   email 認證 → ① 簽風險安全聲明書 + ② 簽墜落測驗同意書（兩大方框）
 *   → ③ 安排墜落測驗（選場館）→ ④ 等待站台測驗 → 完成後自動解除，顯示正常主畫面。
 *
 * 阻擋條件：登入會員本人尚未完成上述任一項。完成（含墜測通過）即 render children。
 * 注意：持有效體驗券者屬另一條入場豁免路徑，不在此硬卡範圍——見下方 skip 判斷。
 */
export default function MemberOnboardingGate({ children }) {
  const { member, updateMember } = useMember();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(null);   // { needsWaiver, consentSigned, testPassed, booking }
  const [gyms, setGyms] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [justBooked, setJustBooked] = useState(false);  // 剛送出申請 → 顯示確認畫面（可回首頁）
  const [bookedGymId, setBookedGymId] = useState('');
  const [skipped, setSkipped] = useState(false);   // 本次剛按「暫不安排」（旗標另存會員文件，下次由 member.fallTestScheduleSkipped 放行）   // 剛選的場館 id（refresh 尚未回填 booking 前，確認畫面用它顯示館名）

  const memberId = member?.id;

  const refresh = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    try {
      // 刷新 waiver 封鎖狀態（/auth/member/me 即時算 waiver blockReasons）
      let blockReasons = member?.blockReasons || [];
      try {
        const me = await memberClient.get('/auth/member/me');
        if (me.data?.member) {
          blockReasons = me.data.member.blockReasons || [];
          updateMember({ blockReasons, fallTestPassed: me.data.member.fallTestPassed, fallTestScheduleSkipped: me.data.member.fallTestScheduleSkipped });
        }
      } catch (_) {}

      const [sigRes, statusRes, bookRes, expRes] = await Promise.all([
        getFallTestSignature(memberId).catch(() => ({ data: {} })),
        getMyFallTestStatus(memberId).catch(() => ({ data: {} })),
        getMyFallTestBookings().catch(() => ({ data: { bookings: [] } })),
        memberClient.get('/experience-bookings/my').catch(() => ({ data: { bookings: [] } })),
      ]);

      const needsWaiver = blockReasons.includes('waiver_unsigned') || blockReasons.includes('parent_waiver_pending');
      const parentPending = blockReasons.includes('parent_waiver_pending');
      const consentSigned = !!sigRes.data?.signature;
      const testPassed = statusRes.data?.status === 'passed';
      const booking = (bookRes.data?.bookings || []).find(b => b.memberId === memberId) || null;
      // 持體驗券豁免：有未取消的體驗預約者，可憑體驗券入場（免通過墜測），不硬卡排測階段
      const today = new Date().toISOString().slice(0, 10);
      const hasExperience = (expRes.data?.bookings || [])
        .some(b => b.status !== 'cancelled' && (!b.bookingDate || b.bookingDate >= today));

      setState({ needsWaiver, parentPending, consentSigned, testPassed, booking, hasExperience });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { getMemberGyms().then(r => setGyms(r.data.gyms || [])).catch(() => {}); }, []);

  // 尚未判斷完成前，若會員物件已明確通過則直接放行，避免閃現遮罩
  if (!member) return children;
  if (!state && !loading) return children;
  // 完成（waiver + 同意書 + 墜測通過）→ 放行；或已簽兩項且持體驗券豁免 → 放行（憑體驗券入場）
  if (state && !state.needsWaiver && state.consentSigned && (state.testPassed || state.hasExperience)) return children;

  // ── 全屏遮罩 ──
  const overlay = (inner) => (
    <div style={{ position:'fixed', inset:0, zIndex:300, background:'#F7F3F3', overflowY:'auto', padding:'0 0 40px' }}>
      <div style={{ background:'linear-gradient(135deg,#8B1A1A,#C0392B)', padding:'40px 22px 26px', color:'#fff' }}>
        <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:22 }}>RedRock</div>
        <div style={{ fontSize:13, opacity:.9, marginTop:6 }}>嗨，{member?.name}，入場前請先完成以下步驟</div>
      </div>
      <div style={{ padding:'20px 16px', maxWidth:520, margin:'0 auto' }}>{inner}</div>
    </div>
  );

  if (loading && !state) {
    return overlay(<div style={{ textAlign:'center', color:'#999', fontSize:14, padding:'40px 0' }}>載入中…</div>);
  }

  const { needsWaiver, parentPending, consentSigned, testPassed, booking } = state;
  // 家長 email 只在「本人 waiver + 墜測同意書皆簽完」後才寄出（後端 maybeSendParentSignEmail）。
  // parentPending＝本人 waiver 已簽、家長未簽；再加 consentSigned＝兩份皆簽完＝家長已被通知簽署。
  const awaitingParent = parentPending && consentSigned;

  // 階段一：兩大方框（waiver + 墜測同意書）尚未都完成
  if (needsWaiver || !consentSigned) {
    const Box = ({ icon, title, sub, done, doneText, onClick, waiting }) => (
      <div onClick={done ? undefined : onClick}
        style={{ background:'#fff', border:`1.5px solid ${done ? '#B3DEC0' : '#E8D5D5'}`, borderRadius:18, padding:'24px 20px', marginBottom:16, cursor: done ? 'default' : 'pointer', textAlign:'center', boxShadow:'0 1px 4px rgba(0,0,0,.04)' }}>
        <div style={{ fontSize:42, marginBottom:10 }}>{icon}</div>
        <div style={{ fontSize:18, fontWeight:700, color:'#1a1a1a', marginBottom:6 }}>{title}</div>
        <div style={{ fontSize:13, color:'#888', lineHeight:1.6, marginBottom:14 }}>{sub}</div>
        {done ? (
          <div style={{ display:'inline-block', fontSize:14, fontWeight:600, color:'#2D7D46', background:'#E6F4EB', borderRadius:20, padding:'8px 20px' }}>✓ {doneText}</div>
        ) : waiting ? (
          <div style={{ display:'inline-block', fontSize:14, fontWeight:600, color:'#B5762B', background:'#FFF3E0', borderRadius:20, padding:'8px 20px' }}>{doneText}</div>
        ) : (
          <div style={{ display:'inline-block', fontSize:15, fontWeight:600, color:'#fff', background:'#8B1A1A', borderRadius:20, padding:'10px 28px' }}>前往簽署 →</div>
        )}
      </div>
    );
    return overlay(<>
      <div style={{ fontSize:15, color:'#666', lineHeight:1.7, marginBottom:18 }}>
        入場前請先簽署 <strong>風險安全聲明（Waiver）</strong> 與 <strong>安全墜落測驗同意書</strong>，兩者皆完成後即可安排墜落測驗。
      </div>
      {/* 未成年：本人 waiver + 墜測同意書「兩份都簽完」才寄家長 email → 兩份都簽完才顯示「待家長簽署」 */}
      <Box icon="📝" title="風險安全聲明" sub="RedRock 攀岩館入場免責與安全聲明書"
        done={!needsWaiver || parentPending}
        doneText={!needsWaiver ? '已完成簽署' : (awaitingParent ? '已簽署（待法定代理人簽署）' : '已簽署')}
        onClick={() => navigate('/member/waiver?onboarding=1')} />
      <Box icon="🧗" title="安全墜落測驗同意書" sub="觀看安全影片並簽署墜落測驗同意書"
        done={consentSigned}
        doneText={awaitingParent ? '已簽署（待法定代理人簽署）' : '已簽署同意書'}
        onClick={() => navigate('/member/fall-test?onboarding=1')} />
      {awaitingParent && (
        <div style={{ background:'#FFF3E0', border:'0.5px solid #F0C988', borderRadius:12, padding:'12px 14px', fontSize:13, color:'#B5762B', marginTop:4, lineHeight:1.6 }}>
          📧 兩份文件已完成本人簽署，並已寄送 email 給法定代理人（家長／監護人）。請其點開連結於同一頁面一次簽署完成即可入場。
        </div>
      )}
    </>);
  }

  const gymName = (id) => (gyms.find(g => g.id === id)?.shortName) || (id === 'gym-hsinchu' ? '新竹館' : id === 'gym-shilin' ? '士林館' : id);

  // 剛送出申請 → 確認畫面（按「回到首頁」即回正常首頁）
  if (justBooked) {
    return overlay(<>
      <div style={{ background:'#fff', border:'1.5px solid #B3DEC0', borderRadius:18, padding:'28px 22px', textAlign:'center', boxShadow:'0 1px 4px rgba(0,0,0,.04)' }}>
        <div style={{ fontSize:44, marginBottom:12 }}>✅</div>
        <div style={{ fontSize:19, fontWeight:700, marginBottom:8 }}>已送出墜落測驗申請</div>
        <div style={{ fontSize:14, color:'#666', lineHeight:1.7, textAlign:'left' }}>
          已通知 <strong style={{ color:'#8B1A1A' }}>{gymName(booking?.gymId || bookedGymId)}</strong>，請至現場由工作人員為您進行墜落測驗。<br/>
          <span style={{ color:'#B5762B' }}>測驗通過前暫不可入場</span>（持當日體驗課程券者不受此限）。
        </div>
      </div>
      <button onClick={() => setJustBooked(false)}
        style={{ width:'100%', height:46, marginTop:18, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor:'pointer' }}>
        回到首頁
      </button>
    </>);
  }

  // 已排測（pending）→ 回正常首頁（入場仍由後端擋到通過為止）
  if (booking) return children;
  // 已通過 → 放行
  if (testPassed) return children;
  // 已宣告「不入場攀爬、暫不安排」→ 放行（僅影響 App 顯示；入場仍由後端墜測關卡擋）
  if (skipped || member?.fallTestScheduleSkipped) return children;

  // 階段二：兩者已簽 → 請安排墜落測驗（選場館）
  const pick = async (gymId) => {
    setBusy(true); setError('');
    try { await createFallTestBooking({ gymId }); setBookedGymId(gymId); setJustBooked(true); await refresh(); setBusy(false); }
    catch (e) { setError(e.response?.data?.message || '安排失敗，請重試'); setBusy(false); }
  };
  return overlay(<>
    <div style={{ fontSize:20, fontWeight:700, marginBottom:6 }}>請安排墜落測驗</div>
    <div style={{ fontSize:14, color:'#666', lineHeight:1.7, marginBottom:20 }}>
      已完成兩項簽署。請選擇要進行墜落測驗的場館，選定後將通知該館工作人員為您安排。
    </div>
    {error && <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#A32D2D', marginBottom:14 }}>{error}</div>}
    {gyms.map(g => (
      <div key={g.id} onClick={() => !busy && pick(g.id)}
        style={{ background:'#fff', border:'1.5px solid #E8D5D5', borderRadius:16, padding:'20px 22px', marginBottom:14, cursor: busy ? 'wait' : 'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', boxShadow:'0 1px 4px rgba(0,0,0,.04)' }}>
        <div>
          <div style={{ fontSize:17, fontWeight:700 }}>{g.shortName || g.name}</div>
          <div style={{ fontSize:12, color:'#999', marginTop:3 }}>{g.todayStatus?.isOpen ? '今日營業中' : '今日休館'}</div>
        </div>
        <div style={{ fontSize:15, fontWeight:600, color:'#8B1A1A' }}>在此測驗 →</div>
      </div>
    ))}
    {gyms.length === 0 && <div style={{ textAlign:'center', color:'#999', fontSize:14, padding:'20px 0' }}>載入場館中…</div>}
    <button disabled={busy}
      onClick={async () => {
        setBusy(true); setError('');
        try { await skipFallTestSchedule(); setSkipped(true); updateMember({ fallTestScheduleSkipped: true }); }
        catch (e) { setError(e.response?.data?.message || '操作失敗，請重試'); }
        setBusy(false);
      }}
      style={{ width:'100%', height:44, marginTop:6, borderRadius:12, background:'#fff', color:'#666', border:'1px solid #DDD', fontSize:14, cursor: busy ? 'wait' : 'pointer' }}>
      我不入場攀爬，暫不安排
    </button>
    <div style={{ fontSize:12, color:'#999', lineHeight:1.6, marginTop:8, textAlign:'left' }}>
      適合只替家庭成員管理帳號的家長。之後若要入場攀爬，可隨時至「墜落測驗」頁安排測驗（通過前無法入場）。
    </div>
  </>);
}
