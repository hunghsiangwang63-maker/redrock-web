import { useState, useEffect, useRef } from 'react';
import { t } from '../../utils/memberI18n';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getGyms, getAnnouncements } from '../../api/gyms';
import dayjs from 'dayjs';

const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_LABELS = { mon:'週一', tue:'週二', wed:'週三', thu:'週四', fri:'週五', sat:'週六', sun:'週日' };

const BottomNav = ({ navigate }) => (
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
);

export default function MemberGymsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetGymId = searchParams.get('gym');
  const gymRefs = useRef({});
  const [gyms, setGyms] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [selectedGym, setSelectedGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info');
  const todayDay = DAYS[dayjs().day()];
  const todayDate = dayjs().format('YYYY-MM-DD');

  useEffect(() => {
    Promise.all([getGyms(), getAnnouncements()])
      .then(([g, a]) => {
        const gymList = g.data.gyms || [];
        setGyms(gymList);
        setAnnouncements(a.data.announcements || []);
        const target = targetGymId ? gymList.find(gym => gym.id === targetGymId) : null;
        setSelectedGym(target || gymList[0] || null);
      }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (targetGymId && gymRefs.current[targetGymId]) {
      setTimeout(() => gymRefs.current[targetGymId]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    }
  }, [gyms]);

  const annTypeColor = (t) => ({ closure:'#FCEBEB', special_hours:'#FAEEDA', route_change:'#E6F1FB', general:'#F0EDED' }[t] || '#F0EDED');
  const annTypeText  = (t) => ({ closure:'#A32D2D', special_hours:'#854F0B', route_change:'#185FA5', general:'#666' }[t] || '#666');
  const annTypeLabel = (t) => ({ closure:'休館', special_hours:'特殊時間', route_change:'路線更換', general:'公告' }[t] || '公告');

  const gymAnns = announcements.filter(a => a.gymId === selectedGym?.id || a.gymId === null);

  // 今日是否有特殊時間或休館公告
  const todaySpecial = gymAnns.find(a =>
    a.type === 'special_hours' &&
    a.effectiveFrom <= todayDate &&
    (a.effectiveTo === null || a.effectiveTo >= todayDate)
  );
  const todayClosure = gymAnns.find(a =>
    a.type === 'closure' &&
    a.effectiveFrom <= todayDate &&
    (a.effectiveTo === null || a.effectiveTo >= todayDate)
  );

  // 未來一週內的營業時間調整（休館 / 特殊時段），逐日含日期標示
  const _DOW = ['日','一','二','三','四','五','六'];
  const upcomingAdjustments = (() => {
    const out = [];
    for (let i = 1; i <= 7; i++) {
      const dt = dayjs().add(i, 'day');
      const ds = dt.format('YYYY-MM-DD');
      const inRange = a => a.effectiveFrom <= ds && (a.effectiveTo === null || a.effectiveTo >= ds);
      const closure = gymAnns.find(a => a.type === 'closure' && inRange(a));
      if (closure) { out.push({ date: ds, mmdd: dt.format('MM/DD'), dow: _DOW[dt.day()], kind: 'closure', note: closure.title, hours: null }); continue; }
      const special = gymAnns.find(a => a.type === 'special_hours' && inRange(a));
      if (special) { out.push({ date: ds, mmdd: dt.format('MM/DD'), dow: _DOW[dt.day()], kind: 'special', note: special.title, hours: (special.specialOpen && special.specialClose) ? `${special.specialOpen} - ${special.specialClose}` : null }); }
    }
    return out;
  })();

  return (
    <div style={{ width:'100%', minHeight:'100vh', background:'#F7F3F3', paddingBottom:80 }}>
      <div style={{ background:'#fff', padding:'16px 20px', borderBottom:'0.5px solid #E8D5D5', display:'flex', alignItems:'center', gap:10 }}>
        <div onClick={() => navigate('/member/home')} style={{ fontSize:20, cursor:'pointer', color:'#8B1A1A' }}>←</div>
        <div style={{ fontWeight:600, fontSize:15 }}>場館資訊</div>
      </div>

      {/* 場館切換 */}
      <div style={{ background:'#fff', padding:'10px 14px', borderBottom:'0.5px solid #E8D5D5', display:'flex', gap:8 }}>
        {gyms.map(g => (
          <button key={g.id} onClick={() => setSelectedGym(g)}
            style={{ flex:1, height:36, borderRadius:20, border:`1px solid ${selectedGym?.id===g.id?'#8B1A1A':'#E8D5D5'}`, background: selectedGym?.id===g.id?'#F5E8E8':'#fff', color: selectedGym?.id===g.id?'#8B1A1A':'#6b6b6b', fontSize:13, fontWeight: selectedGym?.id===g.id?600:400, cursor:'pointer' }}>
            {g.shortName}
          </button>
        ))}
      </div>

      {!loading && selectedGym && (
        <>
          {/* 今日狀態卡 */}
          <div style={{ margin:'14px 14px 0' }}>
            <div style={{ background: selectedGym.todayStatus?.isOpen ? 'linear-gradient(135deg,#1E5C30,#2D7D46)' : 'linear-gradient(135deg,#7A1A1A,#A32D2D)', borderRadius:14, padding:18, color:'#fff' }}>
              <div style={{ fontSize:10, opacity:.75, letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>今日狀態</div>
              <div style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>{selectedGym.todayStatus?.isOpen ? '營業中' : '今日休館'}</div>
              {selectedGym.todayStatus?.todayHours && <div style={{ fontSize:15, opacity:.9 }}>🕙 {selectedGym.todayStatus.todayHours}</div>}
              {selectedGym.todayStatus?.specialNote && (
                <div style={{ background:'rgba(255,255,255,.2)', borderRadius:8, padding:'6px 10px', fontSize:12, marginTop:8 }}>
                  📢 {selectedGym.todayStatus.specialNote}
                </div>
              )}
            </div>
          </div>

          {/* Tab */}
          <div style={{ background:'#fff', borderBottom:'0.5px solid #E8D5D5', display:'flex', margin:'14px 0 0' }}>
            {[
              { key:'info',  label:'場館資訊' },
              { key:'hours', label:'營業時間' },
              { key:'news',  label:`公告${gymAnns.length>0?` (${gymAnns.length})`:''}`},
            ].map(t => (
              <div key={t.key} onClick={() => setTab(t.key)}
                style={{ flex:1, height:44, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:13, fontWeight:tab===t.key?600:400, color:tab===t.key?'#8B1A1A':'#999', borderBottom:tab===t.key?'2px solid #8B1A1A':'2px solid transparent' }}>
                {t.label}
              </div>
            ))}
          </div>

          <div style={{ padding:14 }}>

            {/* ── 場館資訊 ── */}
            {tab === 'info' && (
              <>
                <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
                  <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:12 }}>基本資訊</div>
                  {[
                    { icon:'🏢', label:'名稱', value: selectedGym.name },
                    { icon:'📍', label:'地址', value: selectedGym.address },
                    { icon:'📞', label:'電話', value: selectedGym.phone },
                  ].map(r => (
                    <div key={r.label} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:'0.5px solid #F5EFEF', fontSize:13, alignItems:'flex-start' }}>
                      <span style={{ fontSize:16, flexShrink:0 }}>{r.icon}</span>
                      <div><div style={{ fontSize:11, color:'#999', marginBottom:2 }}>{r.label}</div><div style={{ fontWeight:500 }}>{r.value||'—'}</div></div>
                    </div>
                  ))}
                </div>
                {(selectedGym.transitInfo || selectedGym.parkingInfo) && (
                  <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
                    <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:12 }}>交通與停車</div>
                    {selectedGym.transitInfo && <div style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'0.5px solid #F5EFEF', fontSize:13 }}><span>🚌</span><span style={{ color:'#6b6b6b' }}>{selectedGym.transitInfo}</span></div>}
                    {selectedGym.parkingInfo  && <div style={{ display:'flex', gap:10, padding:'8px 0', fontSize:13 }}><span>🅿️</span><span style={{ color:'#6b6b6b' }}>{selectedGym.parkingInfo}</span></div>}
                  </div>
                )}
                {selectedGym.facilities?.length > 0 && (
                  <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:16 }}>
                    <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:12 }}>場館設施</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {selectedGym.facilities.map((f,i) => (
                        <span key={i} style={{ fontSize:12, padding:'4px 10px', borderRadius:20, background:'#F5E8E8', color:'#8B1A1A', fontWeight:500 }}>{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── 營業時間（連動今日特殊時間）── */}
            {tab === 'hours' && (
              <>
                {/* 今日有特殊情況時，顯示提示框 */}
                {todayClosure && (
                  <div style={{ background:'#FCEBEB', border:'0.5px solid #F5C4C4', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#A32D2D', display:'flex', gap:8 }}>
                    <span>🚫</span>
                    <div>
                      <div style={{ fontWeight:600 }}>今日休館</div>
                      <div style={{ fontSize:12, marginTop:2 }}>{todayClosure.title}</div>
                    </div>
                  </div>
                )}
                {todaySpecial && !todayClosure && (
                  <div style={{ background:'#FAEEDA', border:'0.5px solid #FAC775', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#854F0B', display:'flex', gap:8 }}>
                    <span>⚠️</span>
                    <div>
                      <div style={{ fontWeight:600 }}>今日特殊營業時間</div>
                      <div style={{ fontSize:12, marginTop:2 }}>
                        {todaySpecial.specialOpen} - {todaySpecial.specialClose}（與平常不同）
                      </div>
                      <div style={{ fontSize:11, opacity:.8, marginTop:2 }}>{todaySpecial.title}</div>
                    </div>
                  </div>
                )}

                {/* 近期營業時間調整（未來一週） */}
                {upcomingAdjustments.length > 0 && (
                  <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', overflow:'hidden', marginBottom:12 }}>
                    <div style={{ padding:'10px 16px', borderBottom:'0.5px solid #F5EFEF', fontSize:12, fontWeight:600, color:'#8B1A1A' }}>📅 近期營業時間調整（未來一週）</div>
                    {upcomingAdjustments.map((u, i) => (
                      <div key={u.date} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'10px 16px', borderTop: i>0 ? '0.5px solid #F5EFEF' : 'none' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                          <span style={{ fontSize:13, fontWeight:600, flexShrink:0 }}>{u.mmdd}（{u.dow}）</span>
                          <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:10, flexShrink:0, background: u.kind==='closure'?'#FCEBEB':'#FAEEDA', color: u.kind==='closure'?'#A32D2D':'#854F0B' }}>
                            {u.kind==='closure' ? '休館' : '特殊營業'}
                          </span>
                          {u.note && <span style={{ fontSize:11, color:'#999', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.note}</span>}
                        </div>
                        <span style={{ fontSize:13, fontWeight:600, flexShrink:0, color: u.kind==='closure'?'#A32D2D':'#854F0B' }}>
                          {u.kind==='closure' ? '休館' : (u.hours || '特殊時段')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                  {DAYS.map((d, i) => {
                    const h = selectedGym.regularHours?.[d];
                    const isToday = d === todayDay;

                    // 今日顯示特殊時間
                    const displayHours = isToday && todayClosure
                      ? null  // 休館
                      : isToday && todaySpecial
                        ? `${todaySpecial.specialOpen} - ${todaySpecial.specialClose}`
                        : h?.closed ? null : h ? `${h.open} - ${h.close}` : null;

                    const isSpecialToday = isToday && (todayClosure || todaySpecial);

                    return (
                      <div key={d} style={{ borderBottom: i<6 ? '0.5px solid #F5EFEF' : 'none', background: isToday ? '#FBF5F5' : 'transparent' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:13, fontWeight:isToday?700:400, color:isToday?'#8B1A1A':'#1a1a1a' }}>{DAY_LABELS[d]}</span>
                            {isToday && <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:10, background:'#F5E8E8', color:'#8B1A1A' }}>今日</span>}
                            {isSpecialToday && (
                              <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:10, background: todayClosure ? '#FCEBEB' : '#FAEEDA', color: todayClosure ? '#A32D2D' : '#854F0B' }}>
                                {todayClosure ? '休館' : '特殊'}
                              </span>
                            )}
                          </div>
                          <div style={{ textAlign:'right' }}>
                            {todayClosure && isToday ? (
                              <span style={{ fontSize:13, color:'#A32D2D', fontWeight:600 }}>休館</span>
                            ) : (
                              <span style={{ fontSize:13, fontWeight:isToday?600:400, color: isSpecialToday?'#854F0B':h?.closed?'#999':isToday?'#8B1A1A':'#1a1a1a' }}>
                                {displayHours || (h?.closed ? '公休' : '—')}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* 今日有特殊時間時，顯示原始時間被劃掉 */}
                        {isToday && todaySpecial && !todayClosure && h && !h.closed && (
                          <div style={{ padding:'0 16px 8px', fontSize:11, color:'#999', display:'flex', alignItems:'center', gap:6 }}>
                            <span>標準時間：</span>
                            <span style={{ textDecoration:'line-through' }}>{h.open} - {h.close}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── 公告 ── */}
            {tab === 'news' && (
              gymAnns.length === 0 ? (
                <div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}>
                  <div style={{ fontSize:36, marginBottom:8, opacity:.3 }}>📢</div>目前無公告
                </div>
              ) : gymAnns.map(a => (
                <div key={a.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, marginBottom:10 }}>
                  <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:8 }}>
                    <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:8, background:annTypeColor(a.type), color:annTypeText(a.type) }}>{annTypeLabel(a.type)}</span>
                    {a.gymId === null && <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:8, background:'#F0EDED', color:'#666' }}>兩館</span>}
                    <span style={{ fontSize:11, color:'#999', marginLeft:'auto' }}>{a.effectiveFrom}</span>
                  </div>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>{a.title}</div>
                  {a.content && <div style={{ fontSize:13, color:'#6b6b6b', lineHeight:1.6 }}>{a.content}</div>}
                  {a.effectiveTo && <div style={{ fontSize:11, color:'#999', marginTop:8 }}>📅 有效至 {a.effectiveTo}</div>}
                  {a.type === 'special_hours' && a.specialOpen && (
                    <div style={{ marginTop:8, background:'#FAEEDA', borderRadius:8, padding:'6px 10px', fontSize:12, color:'#854F0B' }}>
                      特殊營業時間：{a.specialOpen} - {a.specialClose}
                    </div>
                  )}
                </div>
              ))
            )}

          </div>
        </>
      )}
      <BottomNav navigate={navigate} />
    </div>
  );
}
