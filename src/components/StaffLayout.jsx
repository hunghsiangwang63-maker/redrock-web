import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/authStore.jsx';
import client from '../api/client';

const NAV = [
  { path:'/staff/pending-tasks', icon:'ti-bell', label:'待辦' },
  { path:'/staff/checkin',    icon:'ti-door-enter',    label:'入場' },
  { path:'/staff/members',    icon:'ti-users',         label:'會員' },
  { path:'/staff/passes',     icon:'ti-ticket',        label:'票券管理' },
  { path:'/staff/shop',       icon:'ti-shopping-cart', label:'商品/租借' },
  { path:'/staff/finance',    icon:'ti-chart-bar',     label:'財務' },
  { path:'/staff/settlement', icon:'ti-calculator',    label:'結帳' },
  { path:'/staff/schedule',  icon:'ti-calendar-time',  label:'排班表' },
  { path:'/staff/activities', icon:'ti-calendar-event', label:'課程活動' },
  { path:'/staff/settings',   icon:'ti-settings',      label:'設定' },
];

// 手機底部導覽只顯示最常用的 5 個
const NAV_MOBILE = [
  { path:'/staff/pending-tasks', icon:'ti-bell',           label:'待辦' },
  { path:'/staff/checkin',       icon:'ti-door-enter',     label:'入場' },
  { path:'/staff/members',       icon:'ti-users',          label:'會員' },
  { path:'/staff/activities',    icon:'ti-calendar-event', label:'課程活動' },
  { path:'__more__',             icon:'ti-dots',           label:'更多' },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function StaffLayout() {
  const { logout, logoutStation, staff, station, operator, isStationMode, isOperational, clockIn, clockOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [tooltip, setTooltip] = useState(null); // { label, top }
  const [pendingCount, setPendingCount] = useState(0);

  // 每 30 秒自動抓取待辦數量（需已打卡值班或個人登入；純站台模式不打 staff 端點，避免 401 把站台登出）
  useEffect(() => {
    if (!isOperational) { setPendingCount(0); return; }
    const fetchCount = () => {
      client.get('/pending-tasks').then(r => {
        setPendingCount(r.data?.total || 0);
      }).catch(() => {});
    };
    fetchCount(); // 立即執行一次
    const timer = setInterval(fetchCount, 30000);
    return () => clearInterval(timer);
  }, [isOperational]);

  const [showClockIn, setShowClockIn] = useState(false);
  const [clockInEmail, setClockInEmail] = useState('');
  const [clockInPw, setClockInPw] = useState('');
  const [clockInErr, setClockInErr] = useState('');
  const [clockInLoading, setClockInLoading] = useState(false);
  const [showClockOut, setShowClockOut] = useState(false);
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [clockOutLoading, setClockOutLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const handleClockIn = async (e) => {
    e.preventDefault();
    setClockInErr(''); setClockInLoading(true);
    try {
      const res = await client.post('/stations/shift/clockin', {
        email: clockInEmail, password: clockInPw,
        stationId: station.id, gymId: station.gymId,
      });
      clockIn(res.data.operatorToken, { ...res.data.operator, gymId: station.gymId });
      setShowClockIn(false);
      setClockInEmail(''); setClockInPw('');
    } catch (err) {
      setClockInErr(err.response?.data?.message || '打卡失敗');
    } finally { setClockInLoading(false); }
  };

  const handleClockOut = async () => {
    setClockOutLoading(true);
    try {
      await client.post('/stations/shift/clockout', {
        shiftId: operator.shiftId, stationId: station.id, notes: clockOutNotes,
      });
      clockOut(); setShowClockOut(false); setClockOutNotes('');
    } catch (err) {
      alert(err.response?.data?.message || '交班失敗');
    } finally { setClockOutLoading(false); }
  };

  const handleLogout = () => {
    if (isStationMode) {
      if (window.confirm('確定要登出館別電腦帳號？')) { logoutStation(); navigate('/login'); }
    } else { logout(); navigate('/login'); }
  };

  const needClockIn = isStationMode && !operator;

  const inp = { width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:15, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#F7F3F3' }}>

      {/* ── 頂部狀態列 ── */}
      <div style={{ height:isMobile?52:44, background:'#fff', borderBottom:'0.5px solid #E8D5D5', display:'flex', alignItems:'center', justifyContent:'space-between', padding: isMobile?'0 16px':'0 16px', fontSize:13, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:isMobile?14:13, color:'#8B1A1A', letterSpacing:0.5 }}>RedRock 紅石攀岩館</span>
          {station && (
            <span style={{ fontSize:isMobile?13:12, color:'#185FA5', background:'#E6F1FB', padding:'3px 8px', borderRadius:10 }}>
              {isMobile ? (station.gymName?.replace('紅石攀岩館 ','') || station.gymName) : station.gymName}
            </span>
          )}
          {operator && (
            <span style={{ fontSize:isMobile?13:12, color:'#2D7D46', background:'#E6F4EB', padding:'3px 8px', borderRadius:10 }}>
              {operator.name}{!isMobile && ' 值班中'}
            </span>
          )}
          {staff && !station && (
            <span style={{ fontSize:isMobile?13:12, color:'#185FA5', background:'#E6F1FB', padding:'3px 8px', borderRadius:10 }}>
              {staff.name}
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {isStationMode && operator && (
            <button onClick={() => setShowClockOut(true)}
              style={{ height:isMobile?36:30, padding:'0 12px', borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', color:'#666', fontSize:isMobile?13:12, cursor:'pointer' }}>
              交班
            </button>
          )}
          {isStationMode && !operator && (
            <button onClick={() => setShowClockIn(true)}
              style={{ height:isMobile?36:30, padding:'0 12px', borderRadius:8, border:'none', background:'#8B1A1A', color:'#fff', fontSize:isMobile?13:12, cursor:'pointer', fontWeight:500 }}>
              打卡上班
            </button>
          )}
          <button onClick={handleLogout}
            style={{ height:isMobile?36:30, padding:'0 10px', borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', color:'#999', fontSize:isMobile?13:12, cursor:'pointer' }}>
            登出
          </button>
        </div>
      </div>

      {/* ── 主區域 ── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* 桌機：左側導覽 */}
        {!isMobile && (
          <div style={{ width:56, background:'#fff', borderRight:'0.5px solid #E8D5D5', display:'flex', flexDirection:'column', alignItems:'center', padding:'12px 0', gap:4, flexShrink:0 }}>
            {NAV.filter(n => n.path !== '/staff/settlement' || (isStationMode && operator)).map(n => {
              const active = n.path === '/staff/activities'
                ? location.pathname === '/staff/activities'
                : location.pathname === n.path;
              return (
                <div key={n.path} onClick={() => navigate(n.path)}
                  onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTooltip({ label: n.label, top: r.top + r.height / 2 }); }}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ width:40, height:40, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background: active?'#F5E8E8':'transparent', color: active?'#8B1A1A':'#999', transition:'all .15s', position:'relative' }}>
                  <i className={`ti ${n.icon}`} style={{ fontSize:20 }} aria-hidden="true"/>
                  {n.path === '/staff/pending-tasks' && pendingCount > 0 && (
                    <span style={{ position:'absolute', top:4, right:4, background:'#A32D2D', color:'#fff', borderRadius:8, fontSize:9, fontWeight:700, minWidth:14, height:14, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </div>
              );
            })}
            <div style={{ marginTop:'auto', width:40, height:40, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#ccc' }}
              onClick={handleLogout}
              onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTooltip({ label: '登出', top: r.top + r.height / 2 }); }}
              onMouseLeave={() => setTooltip(null)}>
              <i className="ti ti-logout" style={{ fontSize:20 }} aria-hidden="true"/>
            </div>
            {tooltip && (
              <div style={{ position:'fixed', left:64, top: tooltip.top, transform:'translateY(-50%)', background:'#1a1a1a', color:'#fff', fontSize:12, fontWeight:500, padding:'5px 10px', borderRadius:6, whiteSpace:'nowrap', pointerEvents:'none', zIndex:9999, boxShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>
                <div style={{ position:'absolute', left:-5, top:'50%', transform:'translateY(-50%)', width:0, height:0, borderTop:'5px solid transparent', borderBottom:'5px solid transparent', borderRight:'5px solid #1a1a1a' }}/>
                {tooltip.label}
              </div>
            )}
          </div>
        )}

        {/* 主內容 */}
        <div style={{ flex:1, overflow:'auto', position:'relative', paddingBottom: isMobile?64:0 }}>
          {needClockIn && (
            <div style={{ position:'absolute', inset:0, background:'rgba(247,243,243,0.96)', zIndex:10, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
              <i className="ti ti-clock" style={{ fontSize:48, color:'#8B1A1A' }}/>
              <div style={{ fontSize:18, fontWeight:500, color:'#1a1a1a' }}>請先打卡上班</div>
              <div style={{ fontSize:13, color:'#666', textAlign:'center', padding:'0 24px' }}>{station.gymName} — 輸入帳號密碼開始值班</div>
              <button onClick={() => setShowClockIn(true)}
                style={{ height:48, padding:'0 36px', borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:500, cursor:'pointer' }}>
                打卡上班
              </button>
            </div>
          )}
          <Outlet />
        </div>
      </div>

      {/* 手機：底部導覽列 */}
      {isMobile && (
        <div style={{ position:'fixed', bottom:0, left:0, right:0, height:60, background:'#fff', borderTop:'0.5px solid #E8D5D5', display:'flex', alignItems:'center', zIndex:100 }}>
          {NAV_MOBILE.map(n => {
            const isMore = n.path === '__more__';
            const active = isMore ? showMoreMenu
              : n.path === '/staff/activities' ? location.pathname.startsWith('/staff/activities')
              : location.pathname === n.path;
            return (
              <button key={n.path} onClick={() => {
                if (isMore) { setShowMoreMenu(v => !v); }
                else { setShowMoreMenu(false); navigate(n.path); }
              }}
                style={{ flex:1, height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, border:'none', background:'none', cursor:'pointer', color: active?'#8B1A1A':'#999', position:'relative' }}>
                <div style={{ position:'relative', display:'inline-block' }}>
                  <i className={`ti ${n.icon}`} style={{ fontSize:22 }} aria-hidden="true"/>
                  {n.path === '/staff/pending-tasks' && pendingCount > 0 && (
                    <span style={{ position:'absolute', top:-4, right:-6, background:'#A32D2D', color:'#fff', borderRadius:8, fontSize:9, fontWeight:700, minWidth:14, height:14, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </div>
                <span style={{ fontSize:10 }}>{n.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 手機：更多選單 */}
      {isMobile && showMoreMenu && (
        <div style={{ position:'fixed', bottom:60, left:0, right:0, top:0, zIndex:98 }}
          onClick={() => setShowMoreMenu(false)}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)' }}/>
          <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'#fff', borderRadius:'16px 16px 0 0', borderTop:'0.5px solid #E8D5D5' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding:'10px 0 6px', textAlign:'center' }}>
              <div style={{ width:36, height:4, borderRadius:2, background:'#E8D5D5', margin:'0 auto 6px' }}/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'#F5EFEF', borderTop:'0.5px solid #F5EFEF' }}>
              {[
                { path:'/staff/pending-tasks', icon:'ti-bell',         label:'待辦總覽' },
                { path:'/staff/shop',          icon:'ti-shopping-cart', label:'商品/租借' },
                { path:'/staff/passes',        icon:'ti-ticket',       label:'票券管理' },
                { path:'/staff/finance',       icon:'ti-chart-bar',    label:'財務' },
                { path:'/staff/settlement',    icon:'ti-calculator',   label:'每日結算' },
                { path:'/staff/schedule',      icon:'ti-calendar-time',label:'排班表' },
                { path:'/staff/settings',      icon:'ti-settings',     label:'系統設定' },
              ].map(n => {
                const active = location.pathname === n.path;
                return (
                  <div key={n.path} onClick={() => { navigate(n.path); setShowMoreMenu(false); }}
                    style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, padding:'16px 8px', background: active?'#FBF5F5':'#fff', cursor:'pointer' }}>
                    <i className={`ti ${n.icon}`} style={{ fontSize:22, color: active?'#8B1A1A':'#666' }} aria-hidden="true"/>
                    <span style={{ fontSize:11, color: active?'#8B1A1A':'#444', fontWeight: active?600:400, textAlign:'center' }}>{n.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ height:'env(safe-area-inset-bottom, 12px)', minHeight:12, background:'#fff' }}/>
          </div>
        </div>
      )}

      {/* 打卡 Modal */}
      {showClockIn && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:28, width:'100%', maxWidth:480, border:'0.5px solid #E8D5D5' }}>
            <div style={{ fontWeight:600, fontSize:17, marginBottom:4 }}>值班打卡</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:20 }}>{station?.gymName} — 輸入你的工作人員帳號</div>
            <form onSubmit={handleClockIn}>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6 }}>Email</label>
                <input type="email" value={clockInEmail} onChange={e => setClockInEmail(e.target.value)}
                  placeholder="staff@redrock.app" required autoFocus style={inp} />
              </div>
              <div style={{ marginBottom:18 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6 }}>密碼</label>
                <input type="password" value={clockInPw} onChange={e => setClockInPw(e.target.value)}
                  placeholder="••••••••" required style={inp} />
              </div>
              {clockInErr && <div style={{ background:'#FCEBEB', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#A32D2D', marginBottom:14 }}>{clockInErr}</div>}
              <div style={{ display:'flex', gap:10 }}>
                <button type="button" onClick={() => { setShowClockIn(false); setClockInErr(''); }}
                  style={{ flex:1, height:48, borderRadius:12, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:15, cursor:'pointer' }}>取消</button>
                <button type="submit" disabled={clockInLoading}
                  style={{ flex:2, height:48, borderRadius:12, background: clockInLoading?'#C0B8B8':'#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:500, cursor: clockInLoading?'not-allowed':'pointer' }}>
                  {clockInLoading ? '打卡中...' : '打卡上班'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 交班 Modal */}
      {showClockOut && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:28, width:'100%', maxWidth:480 }}>
            <div style={{ fontWeight:600, fontSize:17, marginBottom:4 }}>交班</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:16 }}>{operator?.name} 結束值班 — {station?.gymName}</div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6 }}>交班備註（選填）</label>
              <textarea value={clockOutNotes} onChange={e => setClockOutNotes(e.target.value)}
                placeholder="例：收銀 NT$3,200..." rows={3}
                style={{ width:'100%', borderRadius:10, border:'0.5px solid #E8D5D5', padding:'10px 14px', fontSize:14, background:'#FBF5F5', outline:'none', resize:'none', boxSizing:'border-box', color:'#1a1a1a' }} />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setShowClockOut(false); setClockOutNotes(''); }}
                style={{ flex:1, height:48, borderRadius:12, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:15, cursor:'pointer' }}>取消</button>
              <button onClick={handleClockOut} disabled={clockOutLoading}
                style={{ flex:2, height:48, borderRadius:12, background: clockOutLoading?'#C0B8B8':'#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:500, cursor: clockOutLoading?'not-allowed':'pointer' }}>
                {clockOutLoading ? '交班中...' : '確認交班'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
