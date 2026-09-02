import { useState, useEffect, useRef } from 'react';
import MemberLogoutButton from '../../components/MemberLogoutButton';
import MemberBottomNav from '../../components/MemberBottomNav';
import { t, toggleMemberLang, nextLangLabel } from '../../utils/memberI18n';
import { useNavigate } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { getMemberGyms, getMemberAnnouncements } from '../../api/gyms';
import { memberClient } from '../../api/client';
import MemberOnboardingGate from '../../components/MemberOnboardingGate';
import useRefetchOnFocus from '../../hooks/useRefetchOnFocus';
import dayjs from 'dayjs';
import { gymOpenLabel } from '../../utils/gymOpenStatus';
import QRCode from 'qrcode';
import { requestRentalAddon, getRentalAddonStatus } from '../../api/checkin';
import PaymentSection from '../../components/PaymentSection';
import { getMyReminders } from '../../api/memberReminders';

export default function MemberHomePage() {
  const { member, logout } = useMember();
  const navigate = useNavigate();
  const [gyms, setGyms] = useState([]);
  const [myEnrollments, setMyEnrollments] = useState([]);
  const [myExperiences, setMyExperiences] = useState([]);
  const [myReminders, setMyReminders] = useState([]);
  const [reminderImgPreview, setReminderImgPreview] = useState(null); // 提醒卡縮圖點擊 → 全螢幕看完整圖 // 店員手動增減的首頁自訂提醒（比賽等活動），與課程/體驗提醒混在同一份清單依日期排序
  const [banners, setBanners] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [tab, setTab] = useState('home');
  const [todayCheckin, setTodayCheckin] = useState(null); // { checkedIn, gymId, checkedInAt }
  const [identity, setIdentity] = useState(null);        // { teamMember, courseAccess }（隊員/課程學員身份與效期）
  const [rejectAlerts, setRejectAlerts] = useState([]);   // 轉帳被退回的訂單（首頁通知；補正後自動消失）
  // 補租器材（已入場後補租岩鞋/粉袋）：'idle'(未開啟) | 'select'(選項目+付款) | 'qr'(等店員掃碼確認) | 'confirmed'
  const [raStep, setRaStep] = useState('idle');
  const [raSel, setRaSel] = useState({ shoes: false, chalk: false });
  const [raPayment, setRaPayment] = useState('');
  const [raToken, setRaToken] = useState(null);
  const [raQrDataUrl, setRaQrDataUrl] = useState('');
  const [raCost, setRaCost] = useState(0);
  const [raBusy, setRaBusy] = useState(false);
  const [raError, setRaError] = useState('');
  const touchStartX = useRef(null);

  const openRentalAddon = () => { setRaStep('select'); setRaSel({ shoes:false, chalk:false }); setRaPayment(''); setRaError(''); };
  const closeRentalAddon = () => { setRaStep('idle'); setRaToken(null); setRaQrDataUrl(''); };

  const submitRentalAddon = async () => {
    if ((!raSel.shoes && !raSel.chalk) || !raPayment) return;
    setRaBusy(true); setRaError('');
    try {
      const res = await requestRentalAddon(todayCheckin.checkInId, { addShoes: raSel.shoes, addChalk: raSel.chalk, paymentMethod: raPayment });
      const { token, cost } = res.data;
      setRaToken(token); setRaCost(cost);
      const dataUrl = await QRCode.toDataURL(token, { width: 220, margin: 2 });
      setRaQrDataUrl(dataUrl);
      setRaStep('qr');
    } catch (err) {
      setRaError(err.response?.data?.message || '補租失敗，請重試');
    } finally { setRaBusy(false); }
  };

  // 產生 QR 後輪詢店員是否已掃碼確認（比照入場 QR），確認後自動跳回並重新整理今日入場狀態
  useEffect(() => {
    if (raStep !== 'qr' || !raToken) return;
    const timer = setInterval(async () => {
      try {
        const res = await getRentalAddonStatus(raToken);
        if (res.data.status === 'confirmed') {
          clearInterval(timer);
          setRaStep('confirmed');
          memberClient.get('/checkin/my-today').then(r => setTodayCheckin(r.data || null)).catch(() => {});
        } else if (res.data.status === 'expired' || res.data.status === 'cancelled') {
          clearInterval(timer);
          setRaError('此補租請求已逾時，請重新產生');
          setRaStep('select');
        }
      } catch (_) {}
    }, 3000);
    return () => clearInterval(timer);
  }, [raStep, raToken]);
  const bannerLen = banners.length || 1;

  // ⚠️ 由 mount effect 與 useRefetchOnFocus（視窗取得焦點）兩處觸發，快速切回分頁時可能與前一次
  // 尚未完成的載入重疊；用單一序號蓋住底下 5 個獨立請求，過期的那一輪回應一律不採用，避免舊資料
  // 蓋掉最新狀態（比照 PendingTasksPage.jsx 同一套修法）。
  const loadSeqRef = useRef(0);
  const loadHomeData = () => {
    if (!member?.id) return;
    const seq = ++loadSeqRef.current;
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
    memberClient.get(`/courses/member/${member.id}/enrollments`)
      .then(r => {
        if (seq !== loadSeqRef.current) return;
        const upcoming = (r.data.enrollments || [])
          .filter(e => (e.status === 'confirmed' || e.status === 'leave' || e.status === 'course_cancelled') && e.date >= today && e.date <= nextWeek)
          .sort((a,b) => a.date.localeCompare(b.date))
          .slice(0, 5);
        setMyEnrollments(upcoming);
      }).catch(() => { if (seq === loadSeqRef.current) setMyEnrollments([]); });
    memberClient.get('/experience-bookings/my')
      .then(r => {
        if (seq !== loadSeqRef.current) return;
        const upcoming = (r.data.bookings || [])
          .filter(b => b.status !== 'cancelled' && b.bookingDate >= today && b.bookingDate <= nextWeek)
          .sort((a,b) => a.bookingDate.localeCompare(b.bookingDate));
        setMyExperiences(upcoming);
      }).catch(() => { if (seq === loadSeqRef.current) setMyExperiences([]); });
    getMyReminders()
      .then(r => { if (seq === loadSeqRef.current) setMyReminders(r.data.reminders || []); })
      .catch(() => { if (seq === loadSeqRef.current) setMyReminders([]); });
    // 今日入場橫幅（資料源自後端 checkIns，全天顯示、隔日午夜後自然消失、取消後消失）
    memberClient.get('/checkin/my-today')
      .then(r => { if (seq === loadSeqRef.current) setTodayCheckin(r.data || null); })
      .catch(() => { if (seq === loadSeqRef.current) setTodayCheckin(null); });
    // 身份別與效期（效期內攀岩隊員 / 課程學員入館權益）
    memberClient.get('/members/my/identity')
      .then(r => { if (seq === loadSeqRef.current) setIdentity(r.data || null); })
      .catch(() => { if (seq === loadSeqRef.current) setIdentity(null); });
    // 轉帳被退回通知（含子女訂單；重新上傳後端點即不再回傳、自動消失）
    memberClient.get('/members/my/alerts')
      .then(r => { if (seq === loadSeqRef.current) setRejectAlerts(r.data?.alerts || []); })
      .catch(() => { if (seq === loadSeqRef.current) setRejectAlerts([]); });
  };

  // 「知道了」關閉比賽已駁回通知（不影響其他通知類型；樂觀移除，失敗則不動畫面）
  const dismissRejectAlert = async (a, e) => {
    e.stopPropagation();
    if (!a.regId) return;
    try {
      await memberClient.post(`/competitions/registrations/${a.regId}/dismiss-rejection`);
      setRejectAlerts(list => list.filter(x => x !== a));
    } catch (err) { /* 失敗保留原樣，可再按一次 */ }
  };

  // 「知道了」關閉比賽退費已完成通知
  const dismissRefundAlert = async (a, e) => {
    e.stopPropagation();
    if (!a.regId) return;
    try {
      await memberClient.post(`/competitions/registrations/${a.regId}/dismiss-refund-alert`);
      setRejectAlerts(list => list.filter(x => x !== a));
    } catch (err) { /* 失敗保留原樣，可再按一次 */ }
  };

  useEffect(() => { loadHomeData(); }, [member?.id]);
  // 會員可能把 App 留在背景很久（切別的 App、鎖螢幕）：回到前景時重抓一次，
  // 今日入場/身份效期/退回通知才不會停在剛登入當下的舊資料。
  useRefetchOnFocus(loadHomeData);

  useEffect(() => {
    getMemberGyms().then(r => setGyms(r.data.gyms || []));
    getMemberAnnouncements().then(r => {
      setBanners(r.data.banner || []);
      setAnnouncements(r.data.announcements || []);
    });
    const t = setInterval(() => setBannerIdx(i => (i+1) % Math.max(1, banners.length)), 4000);
    return () => clearInterval(t);
  }, []);

  const annTypeColor = (type) => ({
    closure:'#FCEBEB', special_hours:'#FAEEDA', route_change:'#E6F1FB', general:'#F0EDED'
  }[type] || '#F0EDED');

  const annTypeTextColor = (type) => ({
    closure:'#A32D2D', special_hours:'#854F0B', route_change:'#185FA5', general:'#666'
  }[type] || '#666');

  const annTypeLabel = (type) => ({
    closure:'休館', special_hours:'特殊時間', route_change:'路線更換', general:'公告'
  }[type] || '公告');

  // 館別標示（null=全館；勿用二元寫法，否則全館會被誤標成士林）
  const annGymLabel = (gymId) => gymId==='gym-hsinchu' ? '新竹館' : gymId==='gym-shilin' ? '士林館' : '全館';

  return (
    <MemberOnboardingGate>
    <div style={{ width:'100%', minHeight:'100vh', background:'#F7F3F3', paddingBottom:80 }}>

      {/* 頂部 Header */}
      <div style={{ background:'#fff', padding:'16px 20px 12px', borderBottom:'0.5px solid #E8D5D5' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:20, color:'#8B1A1A' }}>RedRock</div>
            <div style={{ fontSize:15, color:'#666', marginTop:2 }}>嗨，<span style={{ fontWeight:700, color:'#1a1a1a' }}>{member?.name}</span> 👋</div>
            {identity?.fallTest?.status === 'passed' && (
              <div style={{ fontSize:10, color:'#8AA79A', marginTop:2 }}>🧗 墜落測驗有效至 {identity.fallTest.expiresAt}</div>
            )}
            {identity?.fallTest?.status === 'expired' && (
              <div style={{ fontSize:10, color:'#A32D2D', marginTop:2 }}>🧗 墜落測驗已到期，請重新測驗</div>
            )}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div onClick={toggleMemberLang}
              style={{ height:26, padding:'0 10px', borderRadius:13, border:'0.5px solid #E8D5D5', background:'#fff', color:'#8B1A1A', fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:4, cursor:'pointer' }}>
              🌐 {nextLangLabel()}
            </div>
            <div style={{ width:38, height:38, borderRadius:'50%', background:'#F5E8E8', color:'#8B1A1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:600, cursor:'pointer' }}
              onClick={() => navigate('/member/profile')}>
              {(member?.nickname || member?.name)?.[0]}
            </div>
            <MemberLogoutButton inline />
          </div>
        </div>
      </div>

      {/* 今日已入場橫幅（全天顯示；資料源自後端 my-today，隔日消失、取消後消失）*/}
      {todayCheckin?.checkedIn && (
        <div style={{ margin:'14px 16px 0', background:'#E6F4EB', border:'0.5px solid #B3DEC0', borderRadius:12, padding:'12px 14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontSize:20 }}>✅</div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#2D7D46' }}>已於 {annGymLabel(todayCheckin.gymId)} 完成入場</div>
              <div style={{ fontSize:11, color:'#5C8A6B', marginTop:2 }}>今日入場紀錄</div>
            </div>
          </div>
          {(!todayCheckin.rentShoes || !todayCheckin.rentChalk) && (
            <div style={{ display:'flex', gap:8, marginTop:10 }}>
              <button onClick={openRentalAddon}
                style={{ flex:1, height:34, borderRadius:8, background:'#fff', border:'0.5px solid #B3DEC0', color:'#2D7D46', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                🎒 補租器材
              </button>
            </div>
          )}
        </div>
      )}

      {/* 補租器材 modal（select → qr → confirmed） */}
      {raStep !== 'idle' && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={raStep === 'select' ? closeRentalAddon : undefined}>
          <div style={{ background:'#fff', borderRadius:16, padding:22, width:'100%', maxWidth:360, maxHeight:'85vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
            {raStep === 'select' && (<>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:14 }}>🎒 補租器材</div>
              {!todayCheckin.rentShoes && (
                <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', border:`1.5px solid ${raSel.shoes?'#8B1A1A':'#E8D5D5'}`, borderRadius:10, marginBottom:10, cursor:'pointer' }}>
                  <input type="checkbox" checked={raSel.shoes} onChange={e => setRaSel(s => ({ ...s, shoes: e.target.checked }))} />
                  <span style={{ flex:1, fontSize:14 }}>岩鞋租借</span><span style={{ fontSize:13, color:'#8B1A1A', fontWeight:600 }}>NT$100</span>
                </label>
              )}
              {!todayCheckin.rentChalk && (
                <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', border:`1.5px solid ${raSel.chalk?'#8B1A1A':'#E8D5D5'}`, borderRadius:10, marginBottom:16, cursor:'pointer' }}>
                  <input type="checkbox" checked={raSel.chalk} onChange={e => setRaSel(s => ({ ...s, chalk: e.target.checked }))} />
                  <span style={{ flex:1, fontSize:14 }}>粉袋租借</span><span style={{ fontSize:13, color:'#8B1A1A', fontWeight:600 }}>NT$50</span>
                </label>
              )}
              {(raSel.shoes || raSel.chalk) && (
                <div style={{ marginBottom:16 }}>
                  <PaymentSection
                    value={{ method: raPayment }}
                    methods={['cash','linepay','jkopay','taiwanpay']}
                    variant="pill"
                    onChange={v => setRaPayment(v.method)}
                  />
                </div>
              )}
              {raError && <div style={{ fontSize:12, color:'#A32D2D', marginBottom:12 }}>{raError}</div>}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={closeRentalAddon} style={{ flex:1, height:42, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
                <button onClick={submitRentalAddon} disabled={raBusy || (!raSel.shoes && !raSel.chalk) || !raPayment}
                  style={{ flex:2, height:42, borderRadius:10, background: (raBusy||(!raSel.shoes && !raSel.chalk)||!raPayment) ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                  {raBusy ? '產生中...' : '產生 QR Code'}
                </button>
              </div>
            </>)}
            {raStep === 'qr' && (<>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:14, textAlign:'center' }}>請出示 QR 給店員掃描</div>
              <div style={{ textAlign:'center' }}>
                {raQrDataUrl && <img src={raQrDataUrl} alt="QR" style={{ width:200, height:200, borderRadius:10 }} />}
                <div style={{ fontSize:14, fontWeight:700, color:'#8B1A1A', marginTop:12 }}>NT${raCost}</div>
                <div style={{ fontSize:12, color:'#999', marginTop:6 }}>店員掃碼確認後會自動完成</div>
              </div>
              <button onClick={closeRentalAddon} style={{ width:'100%', height:40, marginTop:16, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#666', fontSize:13, cursor:'pointer' }}>取消</button>
            </>)}
            {raStep === 'confirmed' && (<>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:40, marginBottom:10 }}>✅</div>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>補租完成</div>
                <div style={{ fontSize:13, color:'#666' }}>已為您加租，祝攀岩愉快！</div>
              </div>
              <button onClick={closeRentalAddon} style={{ width:'100%', height:42, marginTop:18, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>完成</button>
            </>)}
          </div>
        </div>
      )}

      {/* 身份別與效期（單一方框、10px：攀岩隊員 / 課程學員 / 定期票；效期內才顯示）*/}
      {(identity?.teamMember || identity?.courseAccess?.length > 0 || identity?.passes?.length > 0) && (
        <div style={{ margin:'14px 16px 0', background:'#fff', border:'0.5px solid #E8D5D5', borderRadius:12, padding:'10px 14px', display:'flex', flexDirection:'column', gap:5 }}>
          {identity?.teamMember && (
            <div style={{ fontSize:10, color:'#185FA5', textAlign:'left' }}>
              🏅 <span style={{ fontWeight:700 }}>攀岩隊員</span>　效期 {identity.teamMember.since || '—'} ～ {identity.teamMember.until || '—'}
            </div>
          )}
          {(identity?.courseAccess || []).map((c, i) => (
            <div key={`ca${i}`} style={{ fontSize:10, color:'#8A6A1F', textAlign:'left' }}>
              📚 <span style={{ fontWeight:700 }}>課程學員 · {c.courseName}</span>　入館效期 {c.gymAccessStart || '—'} ～ {c.gymAccessEnd || '—'}
            </div>
          ))}
          {(identity?.passes || []).map((p, i) => (
            <div key={`ps${i}`} style={{ fontSize:10, color:'#8B1A1A', textAlign:'left' }}>
              🎫 <span style={{ fontWeight:700 }}>{p.passTypeName}</span>　有效至 {p.endDate || '—'}{p.credits != null ? `（剩 ${p.credits} 次）` : ''}
            </div>
          ))}
        </div>
      )}

      {/* Waiver 未完成提醒 */}
      {member?.blockReasons?.includes('waiver_unsigned') && (
        <div onClick={() => navigate('/member/waiver')}
          style={{ margin:'14px 16px 0', background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
          <div style={{ fontSize:13, color:'#A32D2D' }}>🚫 您尚未簽署風險安全聲明書，請先完成簽署才能入場</div>
          <div style={{ fontSize:12, color:'#A32D2D', fontWeight:600, whiteSpace:'nowrap', marginLeft:8 }}>立即簽署 →</div>
        </div>
      )}
      {member?.blockReasons?.includes('parent_waiver_pending') && (
        <div onClick={() => navigate('/member/waiver')}
          style={{ margin:'14px 16px 0', background:'#FFF3E0', border:'0.5px solid #F0C988', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
          <div style={{ fontSize:13, color:'#B5762B' }}>📧 等待法定代理人完成簽署，才能入場</div>
          <div style={{ fontSize:12, color:'#B5762B', fontWeight:600, whiteSpace:'nowrap', marginLeft:8 }}>查看狀態 →</div>
        </div>
      )}

      {/* Banner 輪播 */}
      {banners.length > 0 ? (
        <div
          style={{ margin:'14px 16px 0', borderRadius:12, overflow:'hidden', position:'relative', height:120, cursor:'grab' }}
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            if (touchStartX.current === null) return;
            const diff = touchStartX.current - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 40) {
              setBannerIdx(i => diff > 0
                ? (i + 1) % bannerLen
                : (i - 1 + bannerLen) % bannerLen
              );
            }
            touchStartX.current = null;
          }}
        >
          <div style={{ background:'linear-gradient(135deg,#8B1A1A,#C0392B)', height:'100%', display:'flex', alignItems:'center', padding:'0 20px', position:'relative' }}>
            {banners[bannerIdx % bannerLen]?.bannerImage && (
              <>
                <img src={banners[bannerIdx % bannerLen].bannerImage} alt=""
                  style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
                {/* 文字可讀性：圖上壓左深右淺漸層 */}
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.15))' }} />
              </>
            )}
            <div style={{ color:'#fff', flex:1, position:'relative', zIndex:1 }}>
              <div style={{ fontSize:10, opacity:.75, letterSpacing:.5, marginBottom:4 }}>
                {annTypeLabel(banners[bannerIdx % bannerLen]?.type)}
              </div>
              <div style={{ fontSize:16, fontWeight:600, lineHeight:1.4 }}>
                {`【${annGymLabel(banners[bannerIdx % bannerLen]?.gymId)}】${banners[bannerIdx % bannerLen]?.title || ''}`}
              </div>
              <div style={{ fontSize:12, opacity:.8, marginTop:4 }}>
                {banners[bannerIdx % bannerLen]?.effectiveFrom}
                {banners[bannerIdx % bannerLen]?.effectiveTo && ` ～ ${banners[bannerIdx % bannerLen]?.effectiveTo}`}
              </div>
            </div>
            {banners.length > 1 && (
              <div style={{ position:'absolute', bottom:10, right:14, display:'flex', gap:4, zIndex:1 }}>
                {banners.map((_,i) => {
                  const active = i === bannerIdx % bannerLen;
                  return (
                    <div key={i} onClick={() => setBannerIdx(i)}
                      style={{ width:14, height:14, borderRadius:3, boxSizing:'border-box',
                        border:'1px solid rgba(255,255,255,.85)',
                        background: active ? 'rgba(255,255,255,.95)' : 'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        cursor:'pointer', transition:'all .2s' }}>
                      {active && (
                        // 純 CSS 打勾（不用字型字元，避免缺字變黑方塊）
                        <span style={{ display:'block', width:3, height:6, marginTop:-1,
                          borderRight:'2px solid #8B1A1A', borderBottom:'2px solid #8B1A1A',
                          transform:'rotate(45deg)' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* 左右箭頭（手機上半透明） */}
            {banners.length > 1 && (
              <>
                <div onClick={() => setBannerIdx(i => (i - 1 + bannerLen) % bannerLen)}
                  style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.5)', fontSize:20, cursor:'pointer', padding:'4px 8px' }}>‹</div>
                <div onClick={() => setBannerIdx(i => (i + 1) % bannerLen)}
                  style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.5)', fontSize:20, cursor:'pointer', padding:'4px 8px' }}>›</div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ margin:'14px 16px 0', borderRadius:12, overflow:'hidden', height:100, background:'linear-gradient(135deg,#8B1A1A,#C0392B)', display:'flex', alignItems:'center', padding:'0 20px' }}>
          <div style={{ color:'#fff' }}>
            <div style={{ fontSize:10, opacity:.75, letterSpacing:.5 }}>歡迎回來</div>
            <div style={{ fontSize:18, fontWeight:600, marginTop:3 }}>開始今天的攀岩！</div>
          </div>
        </div>
      )}

      {/* 快速功能 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, padding:'14px 16px 0' }}>
        {[
          { iconClass:'ti ti-qrcode', label:'入場QR碼',   path:'/member/qr', highlight:true },
          { icon:'📋', label:'我的紀錄', path:'/member/records' },
          // 抱石路線攻略：2026-09-02 正式放上首頁，標「施工中」（各館路線資料尚未建置完成，
          // 待現場陸續補上路線後拿掉此標籤）——功能本身可正常使用，非阻擋點擊。
          { icon:'🪨', label:'路線攻略', path:'/member/routes', badge:'施工中' },
          { icon:'🏆', label:'比賽報名', path:'/member/competitions' },
        { icon:'🧗', label:'體驗課程', path:'/member/experience' },
          { icon:'💪', label:'加入攀岩隊', path:'/member/team' },
          { icon:'🦺', label:'器材租借', path:'/member/rental' },
          { img:'https://comp.redrocktaiwan.com/apple-touch-icon.png', label:'成績快報', path:'https://comp.redrocktaiwan.com', external:true },
        ].map(f => (
          <div key={f.label} onClick={() => f.external ? window.open(f.path, '_blank', 'noopener') : navigate(f.path)}
            style={f.highlight
              ? { position:'relative', background:'linear-gradient(135deg,#9C3C3C,#BE5858)', borderRadius:12, border:'none', padding:'12px 8px', textAlign:'center', cursor:'pointer', transition:'all .15s', boxShadow:'0 3px 10px rgba(156,60,60,.35)' }
              : { position:'relative', background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 8px', textAlign:'center', cursor:'pointer', transition:'all .15s' }}
            onMouseEnter={e => { if (!f.highlight) e.currentTarget.style.borderColor='#8B1A1A'; }}
            onMouseLeave={e => { if (!f.highlight) e.currentTarget.style.borderColor='#E8D5D5'; }}>
            {f.badge && (
              <div style={{ position:'absolute', top:-6, right:-4, background:'#F2A93B', color:'#fff', fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:8, whiteSpace:'nowrap' }}>
                {t(f.badge)}
              </div>
            )}
            {f.img
              ? <img src={f.img} alt="" style={{ width:22, height:22, borderRadius:5, marginBottom:5 }}/>
              : f.iconClass
              ? <div style={{ width:26, height:26, margin:'0 auto 5px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className={f.iconClass} style={{ fontSize:24, color:'#fff' }} aria-hidden="true" />
                </div>
              : <div style={{ fontSize:22, marginBottom:5 }}>{f.icon}</div>}
            <div style={{ fontSize:11, color: f.highlight ? '#fff' : '#6b6b6b', fontWeight: f.highlight ? 700 : 500 }}>{t(f.label)}</div>
          </div>
        ))}
      </div>

      {/* 場館狀態 */}
      <div style={{ padding:'14px 16px 0' }}>
        <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>今日場館</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {gyms.map(g => (
            <div key={g.id} onClick={() => navigate(`/member/gyms?gym=${g.id}`)}
              style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:12, cursor:'pointer' }}
              onMouseEnter={e => e.currentTarget.style.borderColor='#8B1A1A'}
              onMouseLeave={e => e.currentTarget.style.borderColor='#E8D5D5'}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                <div style={{ fontWeight:500, fontSize:13 }}>{g.shortName}</div>
                {(() => { const st = gymOpenLabel(g.todayStatus); return (
                  <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:8, background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                ); })()}
              </div>
              <div style={{ fontSize:12, color:'#999' }}>
                {g.todayStatus?.todayHours || '—'}
              </div>
              {g.todayStatus?.specialNote && (
                <div style={{ fontSize:11, color:'#854F0B', marginTop:4, background:'#FAEEDA', borderRadius:5, padding:'3px 7px' }}>
                  {g.todayStatus.specialNote}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 課程活動提醒 - 永遠顯示 */}
      <div style={{ padding:'14px 16px 0' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>課程活動提醒</div>
          <div onClick={() => navigate('/member/courses')} style={{ fontSize:11, color:'#8B1A1A', cursor:'pointer' }}>查看全部 →</div>
        </div>
        {myEnrollments.length === 0 && myExperiences.length === 0 && myReminders.length === 0 ? (
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'16px 14px', textAlign:'center', color:'#999', fontSize:13 }}>
            一週內沒有課程或體驗活動
          </div>
        ) : (() => {
          // 課程/體驗提醒為系統自動產生（近一週），自訂提醒為店員手動增減（不限一週、依開始顯示日排序，無日期者排最前）；
          // 三種混在同一份清單依日期排序顯示，各自保留原本的卡片樣式。
          const items = [
            ...myEnrollments.map(e => ({ sortKey: e.date, node: (() => {
              const isLeave = e.status === 'leave';
              const isMakeup = e.isMakeup === true;
              const isCancelled = e.status === 'course_cancelled';
              return (
                <div key={`c-${e.id}`} style={{ background: isCancelled?'#FFF0F0':isLeave?'#F5F5F5':isMakeup?'#F0F8F0':'#fff', borderRadius:12, border:`0.5px solid ${isCancelled?'#FFB3B3':isLeave?'#DDD':isMakeup?'#B3DEC0':'#E8D5D5'}`, padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14, color: isCancelled?'#A32D2D':isLeave?'#999':isMakeup?'#2D7D46':'#1a1a1a', display:'flex', alignItems:'center', gap:6 }}>
                      {e.courseName}
                      {isCancelled && <span style={{ fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:6, background:'#FCEBEB', color:'#A32D2D' }}>課程已取消</span>}
                      {isLeave && <span style={{ fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:6, background:'#EEE', color:'#999' }}>已請假</span>}
                      {isMakeup && <span style={{ fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:6, background:'#E6F4EB', color:'#2D7D46' }}>安排補課</span>}
                    </div>
                    <div style={{ fontSize:12, color:'#999', marginTop:3 }}>
                      {new Date(e.date).toLocaleDateString('zh-TW', { month:'numeric', day:'numeric', weekday:'short' })} {e.startTime}～{e.endTime}
                    </div>
                  </div>
                  <div style={{ fontSize:20 }}>{isCancelled?'❌':isLeave?'💤':isMakeup?'🔄':'📚'}</div>
                </div>
              );
            })() })),
            ...myExperiences.map(b => ({ sortKey: b.bookingDate, node: (
              <div key={`x-${b.id}`} onClick={() => navigate('/member/experience?tab=my')}
                style={{ background:'#FBF5F5', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14 }}>🧗 體驗課程預約</div>
                  <div style={{ fontSize:12, color:'#999', marginTop:3 }}>
                    {b.bookingDate} {b.bookingTime} · {b.gymId==='gym-hsinchu'?'新竹館':'士林館'} · {b.numParticipants}人
                  </div>
                  <div style={{ fontSize:11, color: b.status==='confirmed'?'#2D7D46':'#854F0B', marginTop:2 }}>
                    {b.status==='confirmed'?'✓ 已確認':'待確認付款'}
                  </div>
                </div>
                <div style={{ fontSize:20 }}>🧗</div>
              </div>
            ) })),
            ...myReminders.map(r => ({ sortKey: r.showFrom || '0000-00-00', node: (
              <div key={`r-${r.id}`} onClick={r.link ? () => navigate(r.link) : undefined}
                style={{ background:'#FFF8E6', borderRadius:12, border:'0.5px solid #F0D890', padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center', cursor: r.link ? 'pointer' : 'default' }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, color:'#8A5A00' }}>{r.title}</div>
                  {r.subtitle && <div style={{ fontSize:12, color:'#999', marginTop:3 }}>{r.subtitle}</div>}
                </div>
                {r.imageUrl
                  ? <img src={r.imageUrl} alt="" onClick={(e) => { e.stopPropagation(); setReminderImgPreview(r.imageUrl); }}
                      style={{ width:44, height:44, borderRadius:8, objectFit:'cover', flexShrink:0, cursor:'zoom-in' }}/>
                  : <div style={{ fontSize:20 }}>{r.icon || '📣'}</div>}
              </div>
            ) })),
          ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
          return <>{items.map(i => i.node)}</>;
        })()}
      </div>

      {/* 🔔 通知（退回事項/待補文件；處理完成自動消失）— 置於課程活動提醒之後 */}
      {rejectAlerts.length > 0 && (
        <div style={{ padding:'14px 16px 0' }}>
          <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>🔔 通知</div>
          {rejectAlerts.map((a, i) => (
            <div key={`ra${i}`} onClick={() => navigate(a.link)}
              style={{ background: a.kind === 'refund_done' ? '#E6F4EB' : a.kind === 'action' ? '#FAEEDA' : '#FCEBEB', border: `0.5px solid ${a.kind === 'refund_done' ? '#C3E6D0' : a.kind === 'action' ? '#EAD3A0' : '#EEC1C1'}`, borderRadius:12, padding:'12px 14px', display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:8 }}>
              <div style={{ fontSize:20 }}>{a.type === 'course_closure_makeup' ? '🧗' : a.kind === 'refund_done' ? '✅' : a.kind === 'action' ? '✍️' : a.kind === 'reject' ? '⛔' : '⚠️'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color: a.kind === 'refund_done' ? '#2D7D46' : a.kind === 'action' ? '#854F0B' : '#A32D2D', textAlign:'left' }}>
                  {a.type === 'course_closure_makeup'
                    ? `休館停課補課通知:${a.name}${a.memberName ? `（👦 ${a.memberName}）` : ''}`
                    : a.type === 'experience_cancelled'
                    ? `${a.label}因場次取消:${a.name}${a.memberName ? `（👦 ${a.memberName}）` : ''}`
                    : a.type === 'competition_refund_done'
                    ? `${a.label}退費已完成：${a.name}${a.memberName ? `（👦 ${a.memberName}）` : ''}`
                    : a.kind === 'action'
                    ? `${a.label}待補文件:${a.name}${a.memberName ? `（👦 ${a.memberName}）` : ''}`
                    : a.kind === 'reject'
                    ? `${a.label}已被駁回：${a.name}${a.memberName ? `（👦 ${a.memberName}）` : ''}`
                    : `${a.label}${a.method === 'cash' ? '繳費資訊被退回' : '轉帳被退回'}：${a.name}${a.memberName ? `（👦 ${a.memberName}）` : ''}`}
                </div>
                <div style={{ fontSize:11, color: a.kind === 'refund_done' ? '#2D7D46' : a.kind === 'action' ? '#8A6A1F' : '#8A5A5A', marginTop:2, textAlign:'left' }}>
                  {a.kind === 'reject'
                    ? `${(a.reason || '').replace('報名已被駁回：', '原因：')}　點此查看`
                    : a.kind === 'refund_done'
                    ? a.reason
                    : `${a.reason ? `${a.reason}，` : ''}請點此前往處理`}
                </div>
              </div>
              {a.kind === 'reject' && a.regId ? (
                <button onClick={(e) => dismissRejectAlert(a, e)}
                  style={{ flexShrink:0, fontSize:12, fontWeight:600, color:'#A32D2D', background:'#fff', border:'0.5px solid #EEC1C1', borderRadius:8, padding:'6px 10px', cursor:'pointer' }}>
                  {t('知道了')}
                </button>
              ) : a.kind === 'refund_done' && a.regId ? (
                <button onClick={(e) => dismissRefundAlert(a, e)}
                  style={{ flexShrink:0, fontSize:12, fontWeight:600, color:'#2D7D46', background:'#fff', border:'0.5px solid #C3E6D0', borderRadius:8, padding:'6px 10px', cursor:'pointer' }}>
                  {t('知道了')}
                </button>
              ) : (
                <div style={{ fontSize:14, color: a.kind === 'action' ? '#854F0B' : '#A32D2D' }}>›</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 公告列表 */}
      {announcements.length > 0 && (
        <div style={{ padding:'14px 16px 0' }}>
          <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>最新公告</div>
          {announcements.slice(0,3).map(a => (
            <div key={a.id} style={{ background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', padding:'11px 13px', marginBottom:8 }}>
              <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:5 }}>
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:8, background:annTypeColor(a.type), color:annTypeTextColor(a.type) }}>
                  {annTypeLabel(a.type)}
                </span>
                <span style={{ fontSize:11, color:'#999', marginLeft:'auto' }}>{a.effectiveFrom}</span>
              </div>
              <div style={{ fontSize:13, fontWeight:500 }}>{`【${annGymLabel(a.gymId)}】${a.title}`}</div>
              {a.bannerImage && (
                <img src={a.bannerImage} alt="" style={{ width:'100%', maxHeight:120, objectFit:'cover', borderRadius:8, marginTop:6, display:'block' }} />
              )}
              {a.content && <div style={{ fontSize:12, color:'#6b6b6b', marginTop:3, lineHeight:1.5 }}>{a.content}</div>}
            </div>
          ))}
        </div>
      )}

      {/* 提醒圖片全螢幕預覽（點任意處關閉） */}
      {reminderImgPreview && (
        <div onClick={() => setReminderImgPreview(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16, cursor:'zoom-out' }}>
          <img src={reminderImgPreview} alt="" style={{ maxWidth:'100%', maxHeight:'90vh', borderRadius:12, objectFit:'contain' }}/>
        </div>
      )}

      {/* 底部導覽 */}
      <MemberBottomNav navigate={navigate} />
    </div>
    </MemberOnboardingGate>
  );
}
