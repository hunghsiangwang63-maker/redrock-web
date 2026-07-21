import { useState, useEffect, useRef } from 'react';
import MemberLogoutButton from '../../components/MemberLogoutButton';
import { t, toggleMemberLang, getMemberLang } from '../../utils/memberI18n';
import { useNavigate } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { getMemberGyms, getMemberAnnouncements } from '../../api/gyms';
import { memberClient } from '../../api/client';
import MemberOnboardingGate from '../../components/MemberOnboardingGate';
import dayjs from 'dayjs';

export default function MemberHomePage() {
  const { member, logout } = useMember();
  const navigate = useNavigate();
  const [gyms, setGyms] = useState([]);
  const [myEnrollments, setMyEnrollments] = useState([]);
  const [myExperiences, setMyExperiences] = useState([]);
  const [banners, setBanners] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [tab, setTab] = useState('home');
  const [todayCheckin, setTodayCheckin] = useState(null); // { checkedIn, gymId, checkedInAt }
  const [identity, setIdentity] = useState(null);        // { teamMember, courseAccess }（隊員/課程學員身份與效期）
  const [rejectAlerts, setRejectAlerts] = useState([]);   // 轉帳被退回的訂單（首頁通知；補正後自動消失）
  const touchStartX = useRef(null);
  const bannerLen = banners.length || 1;

  useEffect(() => {
    if (member?.id) {
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
      memberClient.get(`/courses/member/${member.id}/enrollments`)
        .then(r => {
          const upcoming = (r.data.enrollments || [])
            .filter(e => (e.status === 'confirmed' || e.status === 'leave' || e.status === 'course_cancelled') && e.date >= today && e.date <= nextWeek)
            .sort((a,b) => a.date.localeCompare(b.date))
            .slice(0, 5);
          setMyEnrollments(upcoming);
        }).catch(() => {});
      memberClient.get('/experience-bookings/my')
        .then(r => {
          const upcoming = (r.data.bookings || [])
            .filter(b => b.status !== 'cancelled' && b.bookingDate >= today && b.bookingDate <= nextWeek)
            .sort((a,b) => a.bookingDate.localeCompare(b.bookingDate));
          setMyExperiences(upcoming);
        }).catch(() => {});
      // 今日入場橫幅（資料源自後端 checkIns，全天顯示、隔日午夜後自然消失、取消後消失）
      memberClient.get('/checkin/my-today')
        .then(r => setTodayCheckin(r.data || null))
        .catch(() => setTodayCheckin(null));
      // 身份別與效期（效期內攀岩隊員 / 課程學員入館權益）
      memberClient.get('/members/my/identity')
        .then(r => setIdentity(r.data || null))
        .catch(() => setIdentity(null));
      // 轉帳被退回通知（含子女訂單；重新上傳後端點即不再回傳、自動消失）
      memberClient.get('/members/my/alerts')
        .then(r => setRejectAlerts(r.data?.alerts || []))
        .catch(() => setRejectAlerts([]));
    }
  }, [member?.id]);

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
              🌐 {getMemberLang() === 'en' ? '中文' : 'EN'}
            </div>
            <div style={{ width:38, height:38, borderRadius:'50%', background:'#F5E8E8', color:'#8B1A1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:600, cursor:'pointer' }}
              onClick={() => navigate('/member/profile')}>
              {member?.name?.[0]}
            </div>
            <MemberLogoutButton inline />
          </div>
        </div>
      </div>

      {/* 今日已入場橫幅（全天顯示；資料源自後端 my-today，隔日消失、取消後消失）*/}
      {todayCheckin?.checkedIn && (
        <div style={{ margin:'14px 16px 0', background:'#E6F4EB', border:'0.5px solid #B3DEC0', borderRadius:12, padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:20 }}>✅</div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#2D7D46' }}>已於 {annGymLabel(todayCheckin.gymId)} 完成入場</div>
            <div style={{ fontSize:11, color:'#5C8A6B', marginTop:2 }}>今日入場紀錄</div>
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
          { icon:'📱', label:'入場QR碼',   path:'/member/qr' },
          { icon:'📋', label:'我的紀錄', path:'/member/records' },
          { icon:'🏆', label:'比賽報名', path:'/member/competitions' },
        { icon:'🧗', label:'體驗課程', path:'/member/experience' },
          { icon:'🧗', label:'加入攀岩隊', path:'/member/team' },
          { icon:'👟', label:'器材租借', path:'/member/rental' },
        ].map(f => (
          <div key={f.label} onClick={() => navigate(f.path)}
            style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 8px', textAlign:'center', cursor:'pointer', transition:'all .15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='#8B1A1A'}
            onMouseLeave={e => e.currentTarget.style.borderColor='#E8D5D5'}>
            <div style={{ fontSize:22, marginBottom:5 }}>{f.icon}</div>
            <div style={{ fontSize:11, color:'#6b6b6b', fontWeight:500 }}>{t(f.label)}</div>
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
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:8, background: g.todayStatus?.isOpen ? '#E6F4EB' : '#FCEBEB', color: g.todayStatus?.isOpen ? '#2D7D46' : '#A32D2D' }}>
                  {g.todayStatus?.isOpen ? '營業中' : '休館'}
                </span>
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
        {myEnrollments.length === 0 && myExperiences.length === 0 ? (
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'16px 14px', textAlign:'center', color:'#999', fontSize:13 }}>
            一週內沒有課程或體驗活動
          </div>
        ) : (<>
          {myEnrollments.map(e => {
            const isLeave = e.status === 'leave';
            const isMakeup = e.isMakeup === true;
            const isCancelled = e.status === 'course_cancelled';
            return (
              <div key={e.id} style={{ background: isCancelled?'#FFF0F0':isLeave?'#F5F5F5':isMakeup?'#F0F8F0':'#fff', borderRadius:12, border:`0.5px solid ${isCancelled?'#FFB3B3':isLeave?'#DDD':isMakeup?'#B3DEC0':'#E8D5D5'}`, padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
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
          })}
          {myExperiences.map(b => (
            <div key={b.id} onClick={() => navigate('/member/experience?tab=my')}
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
          ))}
        </>)}
      </div>

      {/* 🔔 通知（退回事項/待補文件；處理完成自動消失）— 置於課程活動提醒之後 */}
      {rejectAlerts.length > 0 && (
        <div style={{ padding:'14px 16px 0' }}>
          <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>🔔 通知</div>
          {rejectAlerts.map((a, i) => (
            <div key={`ra${i}`} onClick={() => navigate(a.link)}
              style={{ background: a.kind === 'action' ? '#FAEEDA' : '#FCEBEB', border: `0.5px solid ${a.kind === 'action' ? '#EAD3A0' : '#EEC1C1'}`, borderRadius:12, padding:'12px 14px', display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:8 }}>
              <div style={{ fontSize:20 }}>{a.type === 'course_closure_makeup' ? '🧗' : a.kind === 'action' ? '✍️' : a.kind === 'reject' ? '⛔' : '⚠️'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color: a.kind === 'action' ? '#854F0B' : '#A32D2D', textAlign:'left' }}>
                  {a.type === 'course_closure_makeup'
                    ? `休館停課補課通知:${a.name}${a.memberName ? `（👦 ${a.memberName}）` : ''}`
                    : a.type === 'experience_cancelled'
                    ? `${a.label}因場次取消:${a.name}${a.memberName ? `（👦 ${a.memberName}）` : ''}`
                    : a.kind === 'action'
                    ? `${a.label}待補文件:${a.name}${a.memberName ? `（👦 ${a.memberName}）` : ''}`
                    : a.kind === 'reject'
                    ? `${a.label}已被駁回：${a.name}${a.memberName ? `（👦 ${a.memberName}）` : ''}`
                    : `${a.label}${a.method === 'cash' ? '繳費資訊被退回' : '轉帳被退回'}：${a.name}${a.memberName ? `（👦 ${a.memberName}）` : ''}`}
                </div>
                <div style={{ fontSize:11, color: a.kind === 'action' ? '#8A6A1F' : '#8A5A5A', marginTop:2, textAlign:'left' }}>
                  {a.kind === 'reject'
                    ? `${(a.reason || '').replace('報名已被駁回：', '原因：')}　點此查看`
                    : `${a.reason ? `${a.reason}，` : ''}請點此前往處理`}
                </div>
              </div>
              <div style={{ fontSize:14, color: a.kind === 'action' ? '#854F0B' : '#A32D2D' }}>›</div>
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

      {/* 底部導覽 */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, width:'100%', background:'#fff', borderTop:'0.5px solid #E8D5D5', display:'flex', height:60, paddingBottom:"env(safe-area-inset-bottom)", zIndex:50 }}>
        {[
          { icon:'🏠', label:'首頁',     path:'/member/home' },
          { icon:'📚', label:'課程總覽', path:'/member/courses' },
          { icon:'🎫', label:'我的票券', path:'/member/passes' },
          { icon:'👤', label:'我的',     path:'/member/profile' },
        ].map(n => {
          const active = location.pathname === n.path;
          return (
            <div key={n.path} onClick={() => navigate(n.path)}
              style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, cursor:'pointer', color: active ? '#8B1A1A' : '#999' }}>
              <div style={{ fontSize:20 }}>{n.icon}</div>
              <div style={{ fontSize:10, fontWeight: active ? 600 : 400 }}>{t(n.label)}</div>
            </div>
          );
        })}
      </div>
    </div>
    </MemberOnboardingGate>
  );
}
