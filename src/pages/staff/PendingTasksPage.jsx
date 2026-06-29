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
import TransferConfirmModal from '../../components/review/TransferConfirmModal';
import { confirmTeamPayment } from '../../api/team';
import { approveTicket, rejectTicket } from '../../api/passes';
import { getCourseAdjustmentRequests } from '../../api/courseAdjustments';
import { getNotifications, markAsRead, markAllAsRead } from '../../api/notifications';

// 通知 type → 類別（待辦頁通知面板過濾用）
const NOTIF_CAT = {
  transfer_payment:'transfer', experience_transfer:'transfer', transfer:'transfer', transfer_confirm:'transfer',
  single_entry_ticket_approved:'ticket', single_entry_ticket_rejected:'ticket',
  ticket_transfer_request:'ticket', ticket_transfer_accepted:'ticket', ticket_transfer_rejected:'ticket',
  competition_payment:'competition',
  cancel_checkin_request:'cancel', cancel_checkin_approved:'cancel', cancel_checkin_rejected:'cancel',
};
const NOTIF_CATS = [
  { key:'', label:'全部' }, { key:'transfer', label:'轉帳' }, { key:'ticket', label:'票券' },
  { key:'competition', label:'比賽' }, { key:'report', label:'報名' }, { key:'cancel', label:'取消入場' }, { key:'system', label:'系統' },
];
const REG_CAT = { course:'課程報名', competition:'比賽報名', experience:'體驗報名' };
const notifCatOf = (t) => NOTIF_CAT[t] || 'system';

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
  transfer_confirm:   { icon:'🏦', color:'#185FA5', bg:'#E6F1FB', label:'轉帳確認' },
  ticket_approval:    { icon:'🎟️', color:'#5B2D8B', bg:'#F3EEF9', label:'票券審核' },
};

// 待辦總覽：依「內容」分段（每段含對應的 task type）
const CATEGORIES = [
  { key:'transfer',    label:'🏦 轉帳確認', color:'#185FA5', types:['transfer_confirm'] },
  { key:'ticket',      label:'🎫 票券',   color:'#5B2D8B', types:['pass_adjustment','ticket_approval'] },
  { key:'competition', label:'🏆 比賽',   color:'#185FA5', types:['competition_payment'] },
  { key:'team',        label:'⚡ 攀岩隊', color:'#2D7D46', types:['team_member'] },
  { key:'experience',  label:'🧗 體驗',   color:'#8B1A1A', types:['experience'] },
  { key:'course',      label:'📚 課程',   color:'#8B1A1A', types:['course_adjustment'] },
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

  // ── 追蹤查詢面板（顯示於待辦總覽下方）：'course'=課程相關 | 'notif'=通知（近7天統一動態）──
  const [trackView, setTrackView] = useState(null);
  const [completed, setCompleted] = useState(null);          // 課程：已核准/已拒絕
  const [completedLoading, setCompletedLoading] = useState(false);
  const [notifs, setNotifs] = useState(null);                // 通知（系統未讀）
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifCat, setNotifCat] = useState('');              // 類別過濾

  // ── 權限分隔（對齊後端權威）：依角色決定每類動作可否操作 ──
  const isManager = isAdmin;                          // super_admin / gym_manager
  const isOpStation = !!operator || !!station;        // 值班人員 / 站台電腦帳號
  const perm = {
    rental:              true,                         // 全部員工（後端僅 authenticate）
    rental_return:       true,
    experience:          true,
    transfer_confirm:    true,                          // 轉帳確認：後端 authenticate（全員工）
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
  const afterDone = (msg) => { setModal(null); showToast(msg); load(); if (trackView === 'course') loadCompleted(); if (trackView === 'notif') loadNotifs(); };

  // 課程：已完成（已核准/已拒絕）退費/暫停
  const loadCompleted = async () => {
    setCompletedLoading(true);
    try {
      const res = await getCourseAdjustmentRequests(); // 後端依角色授權（主管/站台）
      setCompleted((res.data.requests || []).filter(r => r.status !== 'pending'));
    } catch (e) { setCompleted([]); } finally { setCompletedLoading(false); }
  };
  // 通知：載入系統未讀通知
  const loadNotifs = async () => {
    setNotifLoading(true);
    try {
      const res = await getNotifications();
      setNotifs(res.data.notifications || []);
    } catch (e) { setNotifs([]); } finally { setNotifLoading(false); }
  };
  // 追蹤面板切換（互斥；再點一次收合）
  const openTrack = (view) => {
    const next = trackView === view ? null : view;
    setTrackView(next);
    if (next === 'course' && completed === null) loadCompleted();
    if (next === 'notif' && notifs === null) loadNotifs();
  };

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
      case 'transfer_confirm':
        return <>
          <button onClick={() => setModal({ kind:'transfer', record: task.record })} style={primaryBtn('#2D7D46')}>確認收款</button>
          <button onClick={() => setModal({ kind:'reason', props:{ title:'退回轉帳', label:'退回原因', placeholder:'請填寫退回原因', confirmText:'確認退回', required:true, onSubmit: async (reason) => { await client.put(`/transfers/${task.targetId}/reject`, { reason }); afterDone('已退回'); } } })} style={dangerBtn}>退回</button>
        </>;
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
          {perm.course_adjustment && (
            <button onClick={() => openTrack('course')}
              style={{ height:32, padding:'0 14px', borderRadius:8, background: trackView==='course' ? '#8B1A1A' : '#fff', color: trackView==='course' ? '#fff' : '#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:12, cursor:'pointer' }}>
              課程相關
            </button>
          )}
          <button onClick={() => openTrack('notif')}
            style={{ height:32, padding:'0 14px', borderRadius:8, background: trackView==='notif' ? '#854F0B' : '#fff', color: trackView==='notif' ? '#fff' : '#854F0B', border:'0.5px solid #854F0B', fontSize:12, cursor:'pointer' }}>
            🔔 通知
          </button>
          <button onClick={load} style={{ height:32, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>
            重新整理
          </button>
        </div>
      </div>
      <div style={{ fontSize:12, color:'#999', marginBottom:16 }}>
        上次更新：{dayjs().format('HH:mm')}　·　待處理：轉帳確認、票券、比賽、攀岩隊、體驗、課程、器材　·　近 7 天報名／轉帳／票券／系統動態請看「🔔 通知」
      </div>

      {loading && <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div>}
      {!loading && total === 0 && (
        <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:40, textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#2D7D46' }}>目前沒有待處理事項</div>
          <div style={{ fontSize:13, color:'#999', marginTop:4 }}>近 7 天報名與通知請點右上「🔔 通知」</div>
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

      {/* 課程相關查詢（退費/暫停：已核准 / 已拒絕） */}
      {trackView === 'course' && (
        <div style={{ marginTop:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, margin:'8px 0 12px' }}>
            <div style={{ fontSize:14, fontWeight:700 }}>📚 課程相關 · 退費／暫停（已核准／已拒絕）</div>
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


      {/* 通知 = 近 7 天統一動態（系統未讀通知 + 近 7 天報名）+ 類別過濾 */}
      {trackView === 'notif' && (() => {
        const cutoff = Date.now() / 1000 - 7 * 24 * 3600;
        const notifItems = (notifs || [])
          .filter(n => !n.createdAt?._seconds || n.createdAt._seconds >= cutoff)
          .map(n => ({ key: 'n_' + n.id, notifId: n.id, cat: notifCatOf(n.type), title: n.title || '通知', message: n.message, ts: n.createdAt?._seconds || 0, link: n.link, catLabel: NOTIF_CATS.find(c => c.key === notifCatOf(n.type))?.label || '系統', canRead: true }));
        const regItems = (registrations || []).map(r => ({ key: 'r_' + r.id, cat: 'report', title: `${r.memberName} 報名 ${r.name}`, message: [r.detail, REG_CAT[r.regType]].filter(Boolean).join(' · ') + (r.gymId === 'gym-hsinchu' ? ' · 新竹館' : r.gymId === 'gym-shilin' ? ' · 士林館' : ''), ts: r.createdAt || 0, link: r.link, catLabel: '報名', canRead: false }));
        const feed = [...notifItems, ...regItems].filter(i => !notifCat || i.cat === notifCat).sort((a, b) => b.ts - a.ts);
        return (
          <div style={{ marginTop:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, margin:'8px 0 12px' }}>
              <div style={{ fontSize:14, fontWeight:700 }}>🔔 通知 · 近 7 天動態</div>
              <div style={{ flex:1, height:1, background:'#E8D5D5' }}/>
              {notifs && notifs.length > 0 && (
                <button onClick={async () => { await markAllAsRead(); loadNotifs(); }}
                  style={{ height:28, padding:'0 10px', borderRadius:8, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:12, cursor:'pointer' }}>全部已讀</button>
              )}
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              {NOTIF_CATS.map(c => (
                <button key={c.key} onClick={() => setNotifCat(c.key)}
                  style={{ height:30, padding:'0 12px', borderRadius:8, border: notifCat===c.key?'none':'0.5px solid #E8D5D5', background: notifCat===c.key?'#854F0B':'#fff', color: notifCat===c.key?'#fff':'#666', fontSize:12, fontWeight:500, cursor:'pointer' }}>{c.label}</button>
              ))}
            </div>
            {notifLoading && <div style={{ textAlign:'center', color:'#999', padding:24 }}>載入中...</div>}
            {!notifLoading && feed.length === 0 && (
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:24, textAlign:'center', color:'#999', fontSize:13 }}>
                {notifCat ? '此類別近 7 天無動態' : '近 7 天無通知／報名'}
              </div>
            )}
            {!notifLoading && feed.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {feed.map(i => (
                  <div key={i.key} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px', display:'flex', alignItems:'flex-start', gap:10 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{i.title}</div>
                      {i.message && <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{i.message}</div>}
                      <div style={{ fontSize:11, color:'#bbb', marginTop:2 }}>
                        {i.catLabel}
                        {i.ts ? ` · ${dayjs(i.ts*1000).format('MM/DD HH:mm')}` : ''}
                      </div>
                    </div>
                    {i.link && <button onClick={() => navigate(i.link)} style={ghostBtn}>{i.canRead ? '前往' : '查看'}</button>}
                    {i.canRead && <button onClick={async () => { await markAsRead(i.notifId); loadNotifs(); }} style={{ ...ghostBtn, color:'#854F0B' }}>已讀</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* 內嵌審核彈窗 */}
      {modal?.kind === 'course' && <CourseAdjustmentReviewModal request={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'pass' && <PassRequestReviewModal request={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'competition' && <CompetitionActionModal action="pay" reg={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'rental' && <RentalActionModal action={modal.action} rental={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'reason' && <ReasonModal {...modal.props} onClose={() => setModal(null)} />}
      {modal?.kind === 'transfer' && <TransferConfirmModal record={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}

      {/* 操作結果提示 */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#1a1a1a', color:'#fff', padding:'10px 20px', borderRadius:10, fontSize:13, zIndex:300, boxShadow:'0 4px 16px rgba(0,0,0,.2)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
