import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';
import CourseAdjustmentReviewModal from '../../components/review/CourseAdjustmentReviewModal';
import PassRequestReviewModal from '../../components/review/PassRequestReviewModal';
import CompetitionActionModal from '../../components/review/CompetitionActionModal';
import RentalActionModal from '../../components/review/RentalActionModal';
import ReasonModal from '../../components/review/ReasonModal';
import { confirmTeamPayment } from '../../api/team';
import { approveTicket, rejectTicket } from '../../api/passes';
import { getCourseAdjustmentRequests } from '../../api/courseAdjustments';
import { getAllPassRequests } from '../../api/passAdjustments';

const TYPE_CONFIG = {
  rental:             { icon:'👟', color:'#854F0B', bg:'#FAEEDA', label:'器材租借' },
  rental_pickup:      { icon:'📦', color:'#185FA5', bg:'#E6F1FB', label:'今日取件' },
  rental_return:      { icon:'✅', color:'#2D7D46', bg:'#E6F4EB', label:'今日歸還' },
  course_adjustment:  { icon:'📚', color:'#8B1A1A', bg:'#FBF5F5', label:'課程申請' },
  pass_adjustment:    { icon:'🎫', color:'#5B2D8B', bg:'#F3EEF9', label:'票券申請' },
  competition_payment:{ icon:'🏆', color:'#185FA5', bg:'#E6F1FB', label:'比賽收款' },
  team_member:        { icon:'⚡', color:'#2D7D46', bg:'#E6F4EB', label:'隊員申請' },
  experience:         { icon:'🧗', color:'#8B1A1A', bg:'#FBF5F5', label:'體驗課程' },
  transfer_payment:   { icon:'🏦', color:'#185FA5', bg:'#E6F1FB', label:'課程轉帳待確認' },
  experience_transfer:{ icon:'💳', color:'#185FA5', bg:'#E6F1FB', label:'體驗轉帳待確認' },
  ticket_approval:    { icon:'🎟️', color:'#5B2D8B', bg:'#F3EEF9', label:'票券審核' },
};

const REG_CONFIG = {
  course:      { icon:'📚', color:'#8B1A1A', bg:'#FBF5F5', label:'課程報名' },
  competition: { icon:'🏆', color:'#185FA5', bg:'#E6F1FB', label:'比賽報名' },
  experience:  { icon:'🧗', color:'#2D7D46', bg:'#E6F4EB', label:'體驗報名' },
};

// 待辦總覽：依「內容」分段（每段含對應的 task type）
const CATEGORIES = [
  { key:'ticket',      label:'🎫 票券',   color:'#5B2D8B', types:['pass_adjustment','ticket_approval'] },
  { key:'competition', label:'🏆 比賽',   color:'#185FA5', types:['competition_payment'] },
  { key:'team',        label:'⚡ 攀岩隊', color:'#2D7D46', types:['team_member'] },
  { key:'experience',  label:'🧗 體驗',   color:'#8B1A1A', types:['experience','experience_transfer'] },
  { key:'course',      label:'📚 課程',   color:'#8B1A1A', types:['course_adjustment','transfer_payment'] },
  { key:'equipment',   label:'👟 器材',   color:'#854F0B', types:['rental','rental_pickup','rental_return'] },
];

export default function PendingTasksPage() {
  const { staff, operator, station } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gymFilter, setGymFilter] = useState('');
  const isAdmin = ['super_admin','gym_manager'].includes(staff?.role);

  // ── 追蹤查詢面板（顯示於待辦總覽下方）：'course'=課程已完成 | 'pass'=票券審核 ──
  const [trackView, setTrackView] = useState(null);
  const [completed, setCompleted] = useState(null);          // 課程：已核准/已拒絕
  const [completedLoading, setCompletedLoading] = useState(false);
  const [passReqs, setPassReqs] = useState(null);            // 票券審核：依狀態查詢
  const [passFilter, setPassFilter] = useState('pending');   // pending|approved|rejected|''(全部)
  const [passLoading, setPassLoading] = useState(false);

  // ── 權限分隔（對齊後端權威）：依角色決定每類動作可否操作 ──
  const isManager = isAdmin;                          // super_admin / gym_manager
  const isOpStation = !!operator || !!station;        // 值班人員 / 站台電腦帳號
  const perm = {
    rental:              true,                         // 全部員工（後端僅 authenticate）
    rental_return:       true,
    experience:          true,
    course_adjustment:   isManager || isOpStation,     // requireManagerOrStation
    pass_adjustment:     isManager || isOpStation,
    team_member:         isManager || isOpStation,
    competition_payment: isManager,                    // checkPermission('competitions.manage')
    ticket_approval:     isManager,                    // checkPermission('passes.approve')
  };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/pending-tasks', {
        params: isAdmin && gymFilter ? { gymId: gymFilter } : {}
      });
      setTasks(res.data.tasks || []);
      setRegistrations(res.data.registrations || []);
    } catch(e) { setTasks([]); setRegistrations([]); } finally { setLoading(false); }
  }, [gymFilter, isAdmin]);

  useEffect(() => { load(); }, [load]);

  // ── 內嵌審核動作 ──────────────────────────────────────────────
  const [modal, setModal] = useState(null);   // { kind, record?, action?, props? }
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState('');
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const afterDone = (msg) => { setModal(null); showToast(msg); load(); if (trackView === 'course') loadCompleted(); if (trackView === 'pass') loadPassReqs(); };

  // 課程：已完成（已核准/已拒絕）退費/暫停
  const loadCompleted = async () => {
    setCompletedLoading(true);
    try {
      const res = await getCourseAdjustmentRequests(); // 後端依角色授權（主管/站台）
      setCompleted((res.data.requests || []).filter(r => r.status !== 'pending'));
    } catch (e) { setCompleted([]); } finally { setCompletedLoading(false); }
  };
  // 票券審核：依狀態查詢（待審核/已核准/已拒絕/全部）
  const loadPassReqs = async () => {
    setPassLoading(true);
    try {
      const res = await getAllPassRequests(passFilter || undefined);
      setPassReqs(res.data.requests || []);
    } catch (e) { setPassReqs([]); } finally { setPassLoading(false); }
  };
  // 追蹤面板切換（互斥；再點一次收合）
  const openTrack = (view) => {
    const next = trackView === view ? null : view;
    setTrackView(next);
    if (next === 'course' && completed === null) loadCompleted();
    if (next === 'pass' && passReqs === null) loadPassReqs();
  };
  // 票券審核狀態篩選變更時重載
  useEffect(() => { if (trackView === 'pass') loadPassReqs(); /* eslint-disable-next-line */ }, [passFilter]);

  // 一鍵動作（確認收款 / 核准）
  const oneClick = async (id, fn, okMsg) => {
    setBusyId(id);
    try { await fn(); showToast(okMsg); await load(); }
    catch (e) { showToast(e.response?.data?.message || '操作失敗'); }
    finally { setBusyId(null); }
  };

  const primaryBtn = (bg) => ({ height:34, padding:'0 14px', borderRadius:8, background:bg, color:'#fff', border:'none', fontSize:12, fontWeight:500, cursor:'pointer', flexShrink:0 });
  const ghostBtn = { height:34, padding:'0 10px', borderRadius:8, background:'#fff', border:'0.5px solid #E8D5D5', color:'#888', fontSize:12, cursor:'pointer', flexShrink:0 };
  const dangerBtn = { height:34, padding:'0 12px', borderRadius:8, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:12, cursor:'pointer', flexShrink:0 };
  const goLink = (task) => <button onClick={() => navigate(task.link)} style={ghostBtn}>前往</button>;

  const renderActions = (task) => {
    const busy = busyId === task.targetId;
    // 權限分隔：無權限的審核類動作不顯示操作鈕，僅淡化提示
    if (perm[task.type] === false) {
      return <span style={{ fontSize:11, color:'#bbb', whiteSpace:'nowrap' }}>需主管審核</span>;
    }
    switch (task.type) {
      case 'rental':
        return <>{task.record && <button onClick={() => setModal({ kind:'rental', action:'confirm', record:task.record })} style={primaryBtn('#2D7D46')}>確認取件收款</button>}{goLink(task)}</>;
      case 'rental_return':
        return <>{task.record && <button onClick={() => setModal({ kind:'rental', action:'return', record:task.record })} style={primaryBtn('#185FA5')}>確認歸還</button>}{goLink(task)}</>;
      case 'course_adjustment':
        return <>{task.record && <button onClick={() => setModal({ kind:'course', record:task.record })} style={primaryBtn('#2D7D46')}>審核</button>}{goLink(task)}</>;
      case 'pass_adjustment':
        return <>{task.record && <button onClick={() => setModal({ kind:'pass', record:task.record })} style={primaryBtn('#2D7D46')}>審核</button>}{goLink(task)}</>;
      case 'competition_payment':
        return <>{task.record && <button onClick={() => setModal({ kind:'competition', record:task.record })} style={primaryBtn('#2D7D46')}>確認收款</button>}{goLink(task)}</>;
      case 'team_member':
        return <><button disabled={busy} onClick={() => oneClick(task.targetId, () => confirmTeamPayment(task.targetId), '已確認收款')} style={primaryBtn('#2D7D46')}>{busy ? '處理中…' : '確認收款'}</button>{goLink(task)}</>;
      case 'experience':
        return <>
          <button disabled={busy} onClick={() => oneClick(task.targetId, () => client.post(`/experience-bookings/${task.targetId}/confirm`), '已確認')} style={primaryBtn('#2D7D46')}>{busy ? '處理中…' : '確認'}</button>
          <button onClick={() => setModal({ kind:'reason', props:{ title:'取消體驗預約', label:'取消原因', placeholder:'預設「館方取消」', confirmText:'確認取消', required:false, onSubmit: async (reason) => { await client.post(`/experience-bookings/${task.targetId}/cancel`, { reason: reason || '館方取消' }); afterDone('已取消預約'); } } })} style={dangerBtn}>取消</button>
        </>;
      case 'ticket_approval':
        return <>
          <button disabled={busy} onClick={() => oneClick(task.targetId, () => approveTicket(task.targetId), '審核通過')} style={primaryBtn('#2D7D46')}>{busy ? '處理中…' : '核准'}</button>
          <button onClick={() => setModal({ kind:'reason', props:{ title:'拒絕單次入場券', label:'拒絕原因', placeholder:'請填寫拒絕原因', confirmText:'確認拒絕', required:true, onSubmit: async (reason) => { await rejectTicket(task.targetId, reason); afterDone('已拒絕'); } } })} style={dangerBtn}>拒絕</button>
        </>;
      default:
        // rental_pickup（取件提醒）、transfer_payment、experience_transfer：維持前往處理
        return <button onClick={() => navigate(task.link)} style={{ height:34, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, fontWeight:500, cursor:'pointer', flexShrink:0 }}>前往處理</button>;
    }
  };

  // 分組：依「內容」分段（票券/比賽/攀岩隊/體驗/課程/器材），段內依日期新→舊
  const groups = CATEGORIES.map(c => ({
    ...c,
    tasks: tasks.filter(t => c.types.includes(t.type)).sort((a, b) => (a.date < b.date ? 1 : -1)),
  })).filter(g => g.tasks.length > 0);

  const total = tasks.length;

  return (
    <div style={{ padding:24, maxWidth:800, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:20, fontWeight:700 }}>🔔 待辦總覽</div>
          {total > 0 && (
            <span style={{ background:'#A32D2D', color:'#fff', borderRadius:12, padding:'2px 10px', fontSize:12, fontWeight:700 }}>{total}</span>
          )}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {isAdmin && (
            <select value={gymFilter} onChange={e => setGymFilter(e.target.value)}
              style={{ height:32, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', color:'#1a1a1a', cursor:'pointer' }}>
              <option value="">全部館別</option>
              <option value="gym-hsinchu">新竹館</option>
              <option value="gym-shilin">士林館</option>
            </select>
          )}
          {perm.pass_adjustment && (
            <button onClick={() => openTrack('pass')}
              style={{ height:32, padding:'0 14px', borderRadius:8, background: trackView==='pass' ? '#5B2D8B' : '#fff', color: trackView==='pass' ? '#fff' : '#5B2D8B', border:'0.5px solid #5B2D8B', fontSize:12, cursor:'pointer' }}>
              票券審核
            </button>
          )}
          {perm.course_adjustment && (
            <button onClick={() => openTrack('course')}
              style={{ height:32, padding:'0 14px', borderRadius:8, background: trackView==='course' ? '#8B1A1A' : '#fff', color: trackView==='course' ? '#fff' : '#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:12, cursor:'pointer' }}>
              課程已完成
            </button>
          )}
          <button onClick={load} style={{ height:32, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>
            重新整理
          </button>
        </div>
      </div>
      <div style={{ fontSize:12, color:'#999', marginBottom:16 }}>
        上次更新：{dayjs().format('HH:mm')}　·　審核：票券審核、轉帳確認、課程退費/暫停、票券調整、比賽收款、攀岩隊、器材、體驗　·　另含近 7 天新報名通知
      </div>

      {loading && <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div>}
      {!loading && total === 0 && registrations.length === 0 && (
        <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:40, textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#2D7D46' }}>目前沒有待處理事項</div>
          <div style={{ fontSize:13, color:'#999', marginTop:4 }}>所有申請均已處理完畢</div>
        </div>
      )}
      {!loading && total === 0 && registrations.length > 0 && (
        <div style={{ background:'#E6F4EB', borderRadius:12, border:'0.5px solid #B3DEC0', padding:'12px 16px', marginBottom:16, fontSize:13, color:'#2D7D46' }}>
          ✅ 目前沒有待審核事項。以下為近 7 天新報名通知。
        </div>
      )}

      {!loading && groups.map(group => (
        <div key={group.key} style={{ marginBottom:20 }}>
          {/* 內容分段標題 */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{ fontSize:13, fontWeight:700, color:group.color }}>{group.label}</div>
            <div style={{ flex:1, height:1, background:'#E8D5D5' }}/>
            <div style={{ fontSize:12, color:'#999' }}>{group.tasks.length} 項</div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {group.tasks.map(task => {
              const cfg = TYPE_CONFIG[task.type] || TYPE_CONFIG.rental;
              return (
                <div key={task.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
                  {/* 圖示 */}
                  <div style={{ width:40, height:40, borderRadius:10, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                    {cfg.icon}
                  </div>
                  {/* 內容 */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                      <span style={{ fontSize:10, fontWeight:600, padding:'1px 7px', borderRadius:6, background:cfg.bg, color:cfg.color }}>{cfg.label}</span>
                      <span style={{ fontSize:13, fontWeight:600 }}>{task.title}</span>
                    </div>
                    <div style={{ fontSize:12, color:'#666', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.desc}</div>
                    <div style={{ fontSize:11, color:'#bbb', marginTop:2 }}>
                      {task.gymId === 'gym-hsinchu' ? '新竹館' : task.gymId === 'gym-shilin' ? '士林館' : ''}
                      {task.gymId && task.date ? ' · ' : ''}
                      {task.date}
                    </div>
                  </div>
                  {/* 內嵌動作 */}
                  <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                    {renderActions(task)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 新報名通知（近 7 天，分項） */}
      {!loading && registrations.length > 0 && (
        <div style={{ marginTop:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, margin:'8px 0 12px' }}>
            <div style={{ fontSize:14, fontWeight:700 }}>🆕 新報名通知（近 7 天）</div>
            <div style={{ flex:1, height:1, background:'#E8D5D5' }}/>
            <div style={{ fontSize:12, color:'#999' }}>{registrations.length} 項</div>
          </div>
          {['course','competition','experience'].map(rt => {
            const items = registrations.filter(r => r.regType === rt);
            if (!items.length) return null;
            const cfg = REG_CONFIG[rt];
            return (
              <div key={rt} style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:600, color:cfg.color, marginBottom:6 }}>{cfg.icon} {cfg.label}（{items.length}）</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {items.map(r => (
                    <div key={r.id} style={{ background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', padding:'10px 12px', display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:34, height:34, borderRadius:8, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>{cfg.icon}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.memberName} <span style={{ fontWeight:400, color:'#666' }}>報名 {r.name}</span></div>
                        <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                          {r.detail}{r.detail && r.dateStr ? ' · ' : ''}{r.dateStr}
                          {r.gymId==='gym-hsinchu' ? ' · 新竹館' : r.gymId==='gym-shilin' ? ' · 士林館' : ''}
                        </div>
                      </div>
                      <button onClick={() => navigate(r.link)}
                        style={{ height:30, padding:'0 12px', borderRadius:7, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:12, cursor:'pointer', flexShrink:0 }}>查看</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 課程已完成查詢（退費/暫停：已核准 / 已拒絕） */}
      {trackView === 'course' && (
        <div style={{ marginTop:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, margin:'8px 0 12px' }}>
            <div style={{ fontSize:14, fontWeight:700 }}>📚 課程已完成 · 退費／暫停</div>
            <div style={{ flex:1, height:1, background:'#E8D5D5' }}/>
            <div style={{ fontSize:12, color:'#999' }}>{completed ? `${completed.length} 項` : ''}</div>
          </div>
          {completedLoading && <div style={{ textAlign:'center', color:'#999', padding:24 }}>載入中...</div>}
          {!completedLoading && completed && completed.length === 0 && (
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:24, textAlign:'center', color:'#999', fontSize:13 }}>
              尚無已完成的課程退費／暫停申請
            </div>
          )}
          {!completedLoading && completed && completed.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {completed.map(r => {
                const typeLabel = { refund:'退費', pause:'暫停' }[r.type] || r.type;
                const approved = r.status === 'approved';
                const badge = approved ? { bg:'#E6F4EB', color:'#2D7D46', label:'已核准' } : { bg:'#FCEBEB', color:'#A32D2D', label:'已拒絕' };
                const ts = (approved ? r.approvedAt : r.rejectedAt) || r.createdAt;
                const dateStr = ts?._seconds ? dayjs(ts._seconds * 1000).format('YYYY-MM-DD') : '';
                return (
                  <div key={r.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{r.memberName} — {r.courseName}</div>
                        <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{typeLabel} · 原因：{r.reason || '—'}</div>
                        {approved && r.type === 'refund' && r.finalRefund !== undefined && (
                          <div style={{ fontSize:11, color:'#2D7D46', marginTop:3 }}>已退款 NT${r.finalRefund}</div>
                        )}
                        {!approved && r.rejectReason && (
                          <div style={{ fontSize:11, color:'#A32D2D', marginTop:3 }}>拒絕原因：{r.rejectReason}</div>
                        )}
                        {dateStr && <div style={{ fontSize:11, color:'#bbb', marginTop:2 }}>{dateStr}</div>}
                      </div>
                      <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:6, background:badge.bg, color:badge.color, flexShrink:0 }}>{badge.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 票券審核追蹤查詢（展延/退費/轉讓/課程練習期遞延 · 待審核/已核准/已拒絕/全部） */}
      {trackView === 'pass' && (
        <div style={{ marginTop:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, margin:'8px 0 12px' }}>
            <div style={{ fontSize:14, fontWeight:700 }}>🎫 票券審核</div>
            <div style={{ flex:1, height:1, background:'#E8D5D5' }}/>
            <div style={{ fontSize:12, color:'#999' }}>{passReqs ? `${passReqs.length} 項` : ''}</div>
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            {[{key:'pending',label:'待審核'},{key:'approved',label:'已核准'},{key:'rejected',label:'已拒絕'},{key:'',label:'全部'}].map(f => (
              <button key={f.key} onClick={() => setPassFilter(f.key)}
                style={{ height:30, padding:'0 12px', borderRadius:8, border: passFilter===f.key?'none':'0.5px solid #E8D5D5', background: passFilter===f.key?'#5B2D8B':'#fff', color: passFilter===f.key?'#fff':'#666', fontSize:12, fontWeight:500, cursor:'pointer' }}>
                {f.label}
              </button>
            ))}
          </div>
          {passLoading && <div style={{ textAlign:'center', color:'#999', padding:24 }}>載入中...</div>}
          {!passLoading && passReqs && passReqs.length === 0 && (
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:24, textAlign:'center', color:'#999', fontSize:13 }}>
              目前沒有符合的票券申請
            </div>
          )}
          {!passLoading && passReqs && passReqs.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {passReqs.map(r => {
                const typeLabel = { extension:'展延', refund:'退費', transfer:'轉讓', course_practice_deferral:'課程練習期遞延' }[r.type] || r.type;
                const badge = r.status === 'pending' ? { bg:'#FAEEDA', color:'#854F0B', label:'待審核' }
                  : r.status === 'approved' ? { bg:'#E6F4EB', color:'#2D7D46', label:'已核准' }
                  : { bg:'#FCEBEB', color:'#A32D2D', label:'已拒絕' };
                return (
                  <div key={r.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{r.memberName} — {r.passTypeName || '定期票'}</div>
                        <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                          {typeLabel}
                          {r.type === 'course_practice_deferral' ? ` · 課程：${r.courseName} · 練習期至：${r.practiceEnd}` : ` · 事由：${r.reasonLabel || '—'}`}
                          {r.type === 'transfer' && r.transferToPhone && ` · 轉讓予：${r.transferToPhone}`}
                        </div>
                        {r.type === 'course_practice_deferral' && (
                          <div style={{ fontSize:11, color:'#185FA5', marginTop:4 }}>定期票剩餘 {r.remainingDays} 天｜{r.currentEndDate} → {r.proposedEndDate}</div>
                        )}
                        {r.reasonDetail && r.type !== 'course_practice_deferral' && (
                          <div style={{ fontSize:11, color:'#999', marginTop:2 }}>補充：{r.reasonDetail}</div>
                        )}
                        {r.status === 'approved' && (
                          <div style={{ fontSize:11, color:'#2D7D46', marginTop:3 }}>
                            {r.type === 'extension' && `已展延至 ${r.result?.newEndDate}`}
                            {r.type === 'refund' && `退費 NT$${r.result?.netRefund?.toLocaleString?.() ?? r.result?.netRefund}（扣手續費 NT$${r.result?.fee}）`}
                            {r.type === 'transfer' && `已轉讓予 ${r.result?.newOwnerName}`}
                            {r.type === 'course_practice_deferral' && `已遞延至 ${r.proposedEndDate}`}
                          </div>
                        )}
                        {r.status === 'rejected' && r.rejectReason && (
                          <div style={{ fontSize:11, color:'#A32D2D', marginTop:3 }}>拒絕原因：{r.rejectReason}</div>
                        )}
                        {r.type !== 'course_practice_deferral' && r.evidenceUrl && (
                          <a href={r.evidenceUrl} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#185FA5', marginTop:3, display:'inline-block' }}>查看證明文件</a>
                        )}
                        {r.status === 'pending' && (
                          <div style={{ fontSize:11, color:'#854F0B', marginTop:3 }}>待審核（於上方票券分段處理）</div>
                        )}
                      </div>
                      <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:6, background:badge.bg, color:badge.color, flexShrink:0 }}>{badge.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 內嵌審核彈窗 */}
      {modal?.kind === 'course' && <CourseAdjustmentReviewModal request={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'pass' && <PassRequestReviewModal request={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'competition' && <CompetitionActionModal action="pay" reg={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'rental' && <RentalActionModal action={modal.action} rental={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'reason' && <ReasonModal {...modal.props} onClose={() => setModal(null)} />}

      {/* 操作結果提示 */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#1a1a1a', color:'#fff', padding:'10px 20px', borderRadius:10, fontSize:13, zIndex:300, boxShadow:'0 4px 16px rgba(0,0,0,.2)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
