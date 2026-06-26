import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { getMemberGyms, getMemberAnnouncements } from '../../api/gyms';
import { memberClient } from '../../api/client';
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

  return (
    <div style={{ width:'100%', minHeight:'100vh', background:'#F7F3F3', paddingBottom:80 }}>

      {/* 頂部 Header */}
      <div style={{ background:'#fff', padding:'16px 20px 12px', borderBottom:'0.5px solid #E8D5D5' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:20, color:'#8B1A1A' }}>RedRock</div>
            <div style={{ fontSize:12, color:'#999', marginTop:1 }}>嗨，{member?.name} 👋</div>
          </div>
          <div style={{ width:38, height:38, borderRadius:'50%', background:'#F5E8E8', color:'#8B1A1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:600, cursor:'pointer' }}
            onClick={() => navigate('/member/profile')}>
            {member?.name?.[0]}
          </div>
        </div>
      </div>

      {/* Waiver 未完成提醒 */}
      {member?.blockReasons?.includes('waiver_unsigned') && (
        <div onClick={() => navigate('/member/waiver')}
          style={{ margin:'14px 16px 0', background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
          <div style={{ fontSize:13, color:'#A32D2D' }}>🚫 您尚未簽署免責聲明書，請先完成簽署才能入場</div>
          <div style={{ fontSize:12, color:'#A32D2D', fontWeight:600, whiteSpace:'nowrap', marginLeft:8 }}>立即簽署 →</div>
        </div>
      )}
      {member?.blockReasons?.includes('parent_waiver_pending') && (
        <div onClick={() => navigate('/member/waiver')}
          style={{ margin:'14px 16px 0', background:'#FFF3E0', border:'0.5px solid #F0C988', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
          <div style={{ fontSize:13, color:'#B5762B' }}>📧 等待家長/監護人完成簽署，才能入場</div>
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
            <div style={{ color:'#fff', flex:1 }}>
              <div style={{ fontSize:10, opacity:.75, letterSpacing:.5, marginBottom:4 }}>
                {annTypeLabel(banners[bannerIdx % bannerLen]?.type)}
              </div>
              <div style={{ fontSize:16, fontWeight:600, lineHeight:1.4 }}>
                {banners[bannerIdx % bannerLen]?.title}
              </div>
              <div style={{ fontSize:12, opacity:.8, marginTop:4 }}>
                {banners[bannerIdx % bannerLen]?.effectiveFrom}
                {banners[bannerIdx % bannerLen]?.effectiveTo && ` ～ ${banners[bannerIdx % bannerLen]?.effectiveTo}`}
              </div>
            </div>
            {banners.length > 1 && (
              <div style={{ position:'absolute', bottom:10, right:14, display:'flex', gap:4 }}>
                {banners.map((_,i) => (
                  <div key={i} onClick={() => setBannerIdx(i)}
                    style={{ width: i===bannerIdx%bannerLen?16:6, height:6, borderRadius:3, background:'rgba(255,255,255,.6)', cursor:'pointer', transition:'width .3s' }}/>
                ))}
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
          { icon:'📱', label:'我的 QR',   path:'/member/qr' },
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
            <div style={{ fontSize:11, color:'#6b6b6b', fontWeight:500 }}>{f.label}</div>
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
            <div key={b.id} onClick={() => navigate('/member/experience')}
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
              <div style={{ fontSize:13, fontWeight:500 }}>{a.title}</div>
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
              <div style={{ fontSize:10, fontWeight: active ? 600 : 400 }}>{n.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
