import { useState, useEffect, useCallback, useRef } from 'react';
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
import ExperienceDetailModal from '../../components/review/ExperienceDetailModal';
import TicketApprovalModal from '../../components/review/TicketApprovalModal';
import FallTestBookingModal from '../../components/review/FallTestBookingModal';
import { confirmTeamPayment } from '../../api/team';
import { rejectTicket, rejectTicketBatch } from '../../api/passes';
import { getCourseAdjustmentRequests } from '../../api/courseAdjustments';
import { getAllPassRequests } from '../../api/passAdjustments';
import { getNotifications, markAsRead, markAllAsRead } from '../../api/notifications';
import { getMyUpcomingShifts } from '../../api/schedule';
import useRefetchOnFocus from '../../hooks/useRefetchOnFocus';
import { markInstallmentPaid } from '../../api/installments';
import { useEnabledPayments, filterPayments } from '../../utils/paymentMethods';

// 通知 type → 類別（待辦頁通知面板過濾用）
// 對照現行實際會產生的通知 type（2026-08 依 Firestore notifications 集合實際資料 + 全站 createNotification/
// notifyRoleInGym 呼叫點盤點過），未列出的新型別預設落在「系統」（notifCatOf 的 fallback），非遺漏。
const NOTIF_CAT = {
  // 課程（純請假/銷假/補課/退費/代班；名單認領已併入「報名／認領」）
  course_leave:'course', course_leave_cancel:'course', course_makeup_booked:'course', course_makeup_cancel:'course',
  course_refund:'course', course_substitute:'course', course_substitute_cancel:'course', course_waitlist_promoted:'course',
  // 報名／認領：合併原「轉帳」「比賽」兩顆分類——轉帳原本的付款確認/退費型別實際從未產生過通知
  // （那些事件走待辦清單的即時任務，不會寫進 notifications），比賽也只有認領有真實資料；
  // 加上課程名單認領，通通歸在此類（regItems 本就 cat:'report'，此處補齊 notifItems 的對應型別）。
  transfer_payment:'report', experience_transfer:'report', transfer:'report', transfer_confirm:'report',
  experience_refund:'report',
  competition_payment:'report', competition_refund:'report', competition_refund_request:'report',
  competition_reg_claimed:'report', course_roster_claimed:'report',
  // 票券／卡片（單次入場券審核/轉贈 + 定期票舊系統認領 + 優惠卡/黑卡/舊優惠卡綁定揭露）
  single_entry_ticket_approval:'ticket', single_entry_ticket_approved:'ticket', single_entry_ticket_rejected:'ticket',
  ticket_transfer_request:'ticket', ticket_transfer_accepted:'ticket', ticket_transfer_rejected:'ticket',
  legacy_pass_claimed:'ticket',
  discount_bind_disclosure:'ticket', black_bind_disclosure:'ticket', legacy_discount_bind_disclosure:'ticket',
  // 取消入場（checkin_cancelled 為實際使用的直接取消通知；原本的申請/審核流程 2026-08-17
  // 已確認全前端從未呼叫過，整條路徑與後端 cancelCheckin.js 一併移除，不再保留死型別）
  checkin_cancelled:'cancel',
  // 排班
  shift_assigned:'shift', shift_updated:'shift', shift_reminder:'shift',
  // 會員（VIP 等舊系統資料認領）
  legacy_vip_claimed:'member',
  // 結帳（現金差異提醒／發票列印金額被人工改過）
  settlement_difference:'settlement', invoice_amount_modified:'settlement',
  // 系統（明確列出、非僅靠 fallback，供之後對照）
  stocktake_discrepancy:'system',
};
const NOTIF_CATS = [
  { key:'', label:'全部' }, { key:'shift', label:'排班' }, { key:'ticket', label:'票券／卡片' }, { key:'report', label:'報名／認領' },
  { key:'course', label:'課程請假/補課' }, { key:'cancel', label:'取消入場' }, { key:'member', label:'VIP會員認領' }, { key:'settlement', label:'結帳' }, { key:'system', label:'系統' },
];
// 通知未帶 link 時依 type 補預設導向（舊通知/未帶連結的服務端通知「查看」鈕才有得按）
const NOTIF_LINK = {
  shift_assigned: '/staff/schedule', shift_updated: '/staff/schedule', shift_reminder: '/staff/schedule',
  course_roster_claimed: '/staff/courses', course_substitute: '/staff/courses', course_substitute_cancel: '/staff/courses',
  course_leave: '/staff/courses', course_leave_cancel: '/staff/courses', course_makeup_booked: '/staff/courses', course_makeup_cancel: '/staff/courses',
  course_refund: '/staff/courses', course_waitlist_promoted: '/staff/courses',
  legacy_vip_claimed: '/staff/members', legacy_pass_claimed: '/staff/members',
  experience_refund: '/staff/experience',
  single_entry_ticket_approval: '/staff/pending-tasks',
  discount_bind_disclosure: '/staff/cards', black_bind_disclosure: '/staff/cards', legacy_discount_bind_disclosure: '/staff/cards',
  pass_adjustment: '/staff/pending-tasks',
  competition_refund_request: '/staff/pending-tasks', competition_reg_claimed: '/staff/competitions',
  settlement_difference: '/staff/settlement', invoice_amount_modified: '/staff/settlement', stocktake_discrepancy: '/staff/sales',
  checkin_cancelled: '/staff/checkin',
};
const REG_CAT = { course:'課程報名', competition:'比賽報名', experience:'體驗報名' };
const notifCatOf = (t) => NOTIF_CAT[t] || 'system';
// 通知連結：新通知建立時已直接帶 link（見 memberService.js 認領通知）；這裡只為「舊通知」
// （course_roster_claimed/competition_reg_claimed 在補上 link 欄位前建立的既有紀錄，link 為 null）
// 用 referenceId/referenceType 補算出「直接跳到那筆」的深連結，查無才退回 NOTIF_LINK 的通用列表頁
const resolveNotifLink = (n) => {
  if (n.link) return n.link;
  if (n.type === 'course_roster_claimed' && n.referenceType === 'course' && n.referenceId) return `/staff/courses?course=${n.referenceId}`;
  return NOTIF_LINK[n.type] || null;
};

const TYPE_CONFIG = {
  rental:             { icon:'👟', color:'#854F0B', bg:'#FAEEDA', label:'器材租借' },
  rental_pickup:      { icon:'📦', color:'#185FA5', bg:'#E6F1FB', label:'器材取件' },
  rental_return:      { icon:'✅', color:'#2D7D46', bg:'#E6F4EB', label:'器材歸還' },
  course_adjustment:  { icon:'📚', color:'#8B1A1A', bg:'#FBF5F5', label:'課程申請' },
  pass_adjustment:    { icon:'🎫', color:'#5B2D8B', bg:'#F3EEF9', label:'票券申請' },
  competition_payment:{ icon:'🏆', color:'#185FA5', bg:'#E6F1FB', label:'比賽收款' },
  competition_refund: { icon:'🏆', color:'#A32D2D', bg:'#FCEBEB', label:'比賽退費' },
  team_member:        { icon:'⚡', color:'#2D7D46', bg:'#E6F4EB', label:'隊員申請' },
  experience:         { icon:'🧗', color:'#8B1A1A', bg:'#FBF5F5', label:'體驗課程' },
  transfer_payment:   { icon:'🏦', color:'#185FA5', bg:'#E6F1FB', label:'課程轉帳待確認' },
  experience_transfer:{ icon:'💳', color:'#185FA5', bg:'#E6F1FB', label:'體驗轉帳待確認' },
  transfer_confirm:   { icon:'🏦', color:'#185FA5', bg:'#E6F1FB', label:'轉帳確認' },
  ticket_approval:    { icon:'🎟️', color:'#5B2D8B', bg:'#F3EEF9', label:'票券審核' },
  fall_test_pending:  { icon:'🧗', color:'#8B1A1A', bg:'#FBF5F5', label:'墜落測驗' },
  installment:        { icon:'🧾', color:'#185FA5', bg:'#E6F1FB', label:'分期收款' },
};

const INSTALLMENT_PAY_METHODS = [
  { key:'cash', label:'現金' },
  { key:'transfer', label:'轉帳' },
  { key:'linepay', label:'Line Pay' },
  { key:'jkopay', label:'街口支付' },
  { key:'taiwanpay', label:'台灣Pay' },
];

// 待辦總覽：依「性質」分段（今日提醒／需審核／待收款）
const CATEGORIES = [
  { key:'remind',  label:'🔔 今日提醒／預約', color:'#854F0B', types:['rental_pickup','rental_return','experience'] },
  { key:'falltest',label:'🧗 墜落測驗待安排', color:'#8B1A1A', types:['fall_test_pending'] },
  { key:'review',  label:'🔍 需審核（核准／拒絕）', color:'#5B2D8B', types:['course_adjustment','pass_adjustment','ticket_approval'] },
  { key:'payment', label:'💰 待收款（核對後確認）', color:'#185FA5', types:['transfer_confirm','competition_payment','competition_refund','team_member','rental','installment'] },
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

export default function PendingTasksPage() {
  const isMobile = useIsMobile();
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
  const [passCompleted, setPassCompleted] = useState(null);  // 定期票：已核准/已拒絕（展延/退費/轉讓）
  const [passCompletedLoading, setPassCompletedLoading] = useState(false);
  const [notifs, setNotifs] = useState(null);                // 通知（系統未讀）
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifCat, setNotifCat] = useState('');              // 類別過濾

  // ── 權限分隔（對齊後端權威）：依角色決定每類動作可否操作 ──
  const isManager = isAdmin;                          // super_admin / gym_manager
  const isOpStation = !!operator || !!station;        // 值班人員 / 站台電腦帳號
  // 兼職個人帳號（未打卡值班）待辦頁權限收斂（2026-08-08 拍板）：只留「今日提醒／預約」+ 我的近7日班表，
  // 通知／退回追蹤兩個按鈕隱藏（課程相關／定期票相關本就靠下方 perm.course_adjustment 等已是 false 而隱藏，不用再改）。
  // 對應後端 pendingTasks.js 同步收斂（GET / 只回 remind 類型任務、GET /returned 回空）。
  // ⚠ 不直接用下方才宣告的 isRealStaff（避免 TDZ），改就地重算同一條件。
  // 2026-08-08 同日再擴及正職（非值班）：兼職／正職個人帳號皆收斂，值班(operator)/館別電腦/管理員不受影響。
  const isRestrictedPartTime = !!staff?.id && !operator && !station && ['part_time', 'full_time'].includes(staff?.role);
  const perm = {
    rental:              true,                         // 全部員工（後端僅 authenticate）
    rental_return:       true,
    experience:          true,
    transfer_confirm:    true,                          // 轉帳確認：後端 authenticate（全員工）
    course_adjustment:   isManager || isOpStation,     // requireManagerOrStation
    pass_adjustment:     isManager || isOpStation,
    team_member:         isManager || isOpStation,
    competition_payment: true,                         // 現金→值班/管理員、轉帳→管理員（per-task 分支判斷，對齊後端）
    competition_refund:  isManager,
    ticket_approval:     isManager,                    // checkPermission('passes.approve')
    fall_test_pending:   true,                          // 站台/值班/員工皆可登記（後端 authenticate）
    installment:         isManager || isOpStation,      // checkPermission('installments.manage')
  };
  const [returnedItems, setReturnedItems] = useState([]);
  const [returnedDetail, setReturnedDetail] = useState(null);
  // ⚠️ load() 被 afterDone()（每次審核動作完成後）、視窗取得焦點（useRefetchOnFocus）、初次掛載三處觸發，
  // 連續快速處理多筆待辦（核准A→立刻核准B）很容易讓兩個請求同時在飛；較舊的請求若較晚回來，會用過期
  // 資料蓋掉剛核准完成後的最新清單，讓已處理項目「看起來又跑回來」。用序號只採用最新一次請求的回應
  // （比照 loadNotifs() 同一套修法）。
  const loadReqSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadReqSeq.current;
    setLoading(true);
    try {
      const params = isAdmin && gymFilter ? { gymId: gymFilter } : {};
      const res = await client.get('/pending-tasks', { params });
      if (seq !== loadReqSeq.current) return;
      setTasks(res.data.tasks || []);
      setRegistrations(res.data.registrations || []);
      client.get('/pending-tasks/returned', { params })
        .then(r => { if (seq === loadReqSeq.current) setReturnedItems(r.data.items || []); })
        .catch(() => { if (seq === loadReqSeq.current) setReturnedItems([]); });
    } catch(e) { if (seq === loadReqSeq.current) { setTasks([]); setRegistrations([]); } }
    finally { if (seq === loadReqSeq.current) setLoading(false); }
  }, [gymFilter, isAdmin]);

  useEffect(() => { load(); }, [load]);
  // 待辦頁常整天開著不關：切回分頁/視窗取得焦點時重抓一次，不必靠人工整頁重整
  useRefetchOnFocus(load);

  // ── 我的近七日排班（僅員工本人登入顯示；站台/值班電腦帳號不顯示）──
  const isRealStaff = !!staff?.id && !operator && !station;
  const [myShifts, setMyShifts] = useState(null);
  useEffect(() => {
    if (!isRealStaff) return;
    const from = dayjs().format('YYYY-MM-DD');
    const to = dayjs().add(6, 'day').format('YYYY-MM-DD');
    getMyUpcomingShifts(from, to).then(r => setMyShifts(r.data.shifts || [])).catch(() => setMyShifts([]));
  }, [isRealStaff]);

  // ── 內嵌審核動作 ──────────────────────────────────────────────
  const [modal, setModal] = useState(null);   // { kind, record?, action?, props? }
  const [teamNote, setTeamNote] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [installMethod, setInstallMethod] = useState('cash');
  const [installBusy, setInstallBusy] = useState(false);
  const [installError, setInstallError] = useState('');
  const enabledPay = useEnabledPayments();
  const [toast, setToast] = useState('');
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const afterDone = (msg) => { setModal(null); showToast(msg); load(); if (trackView === 'course') loadCompleted(); if (trackView === 'pass') loadPassCompleted(); if (trackView === 'notif') loadNotifs(); };

  // 課程：已完成（已核准/已拒絕）退費/暫停
  // 同 load()／loadNotifs()：afterDone() 與切換分頁都可能觸發，快速連續處理時用序號擋過期回應。
  const completedReqSeq = useRef(0);
  const loadCompleted = async () => {
    const seq = ++completedReqSeq.current;
    setCompletedLoading(true);
    try {
      const res = await getCourseAdjustmentRequests(); // 後端依角色授權（主管/站台）
      if (seq !== completedReqSeq.current) return;
      setCompleted((res.data.requests || []).filter(r => r.status !== 'pending'));
    } catch (e) { if (seq === completedReqSeq.current) setCompleted([]); }
    finally { if (seq === completedReqSeq.current) setCompletedLoading(false); }
  };
  // 定期票：已完成（已核准/已拒絕）展延/退費/轉讓
  const passCompletedReqSeq = useRef(0);
  const loadPassCompleted = async () => {
    const seq = ++passCompletedReqSeq.current;
    setPassCompletedLoading(true);
    try {
      const res = await getAllPassRequests(); // 不帶 status＝全部，前端自行過濾已完成
      if (seq !== passCompletedReqSeq.current) return;
      setPassCompleted((res.data.requests || []).filter(r => r.status !== 'pending'));
    } catch (e) { if (seq === passCompletedReqSeq.current) setPassCompleted([]); }
    finally { if (seq === passCompletedReqSeq.current) setPassCompletedLoading(false); }
  };
  // 通知：載入系統未讀通知
  // ⚠️ 頁面內多處會觸發 loadNotifs()（手動點已讀/全部已讀、afterDone() 完成其他審核動作時），
  // 快速連續操作可能讓兩個請求同時在飛、且較「舊」的那個請求反而較晚回來——若不擋，會用過期的
  // 回應蓋掉剛標記已讀後的最新狀態，讓已讀項目「看起來又跑回來」。用序號只採用最新一次請求的回應。
  const notifReqSeq = useRef(0);
  const loadNotifs = async () => {
    const seq = ++notifReqSeq.current;
    setNotifLoading(true);
    try {
      const res = await getNotifications();
      if (seq !== notifReqSeq.current) return; // 已有更新的請求發出，這筆回應過期、不採用
      setNotifs(res.data.notifications || []);
    } catch (e) { if (seq === notifReqSeq.current) setNotifs([]); }
    finally { if (seq === notifReqSeq.current) setNotifLoading(false); }
  };
  // 追蹤面板切換（互斥；再點一次收合）
  const openTrack = (view) => {
    const next = trackView === view ? null : view;
    setTrackView(next);
    if (next === 'course' && completed === null) loadCompleted();
    if (next === 'pass' && passCompleted === null) loadPassCompleted();
    if (next === 'notif' && notifs === null) loadNotifs();
  };

  const primaryBtn = (bg) => ({ height:34, padding:'0 14px', borderRadius:8, background:bg, color:'#fff', border:'none', fontSize:12, fontWeight:500, cursor:'pointer', flexShrink:0 });
  const ghostBtn = { height:34, padding:'0 10px', borderRadius:8, background:'#fff', border:'0.5px solid #E8D5D5', color:'#888', fontSize:12, cursor:'pointer', flexShrink:0 };
  const dangerBtn = { height:34, padding:'0 12px', borderRadius:8, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:12, cursor:'pointer', flexShrink:0 };
  const goLink = (task) => <button onClick={() => navigate(task.link)} style={ghostBtn}>前往</button>;

  const renderActions = (task) => {
    // 收款確認權限：現金→值班 operator 或管理員；轉帳→僅管理員（對齊後端）
    if (task.type === 'transfer_confirm' || task.type === 'competition_payment') {
      const isCash = task.type === 'competition_payment' ? task.record?.paymentMethod === 'cash' : task.method === 'cash';
      const allowed = isCash ? (isOpStation || isManager) : isManager;
      if (!allowed) return <span style={{ fontSize:11, color:'#bbb', whiteSpace:'nowrap' }}>{isCash ? '需值班或管理員確認' : '需管理員確認'}</span>;
    }
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
      case 'competition_refund':
        return <>{task.record && <button onClick={() => setModal({ kind:'competition-refund', record:task.record })} style={primaryBtn('#A32D2D')}>處理退費</button>}{goLink(task)}</>;
      case 'transfer_confirm':
        return <>
          <button onClick={() => setModal({ kind:'transfer', record: task.record })} style={primaryBtn('#2D7D46')}>確認收款</button>
          <button onClick={() => setModal({ kind:'reason', props:{ title:'退回轉帳', label:'退回原因', placeholder:'請填寫退回原因', confirmText:'確認退回', required:true, onSubmit: async (reason) => { await client.put(`/transfers/${task.targetId}/reject`, { reason }); afterDone('已退回'); } } })} style={dangerBtn}>退回</button>
        </>;
      case 'team_member':
        return <><button onClick={() => { setTeamNote(''); setTeamError(''); setModal({ kind:'team', props:{ task } }); }} style={primaryBtn('#2D7D46')}>確認收款</button>{goLink(task)}</>;
      case 'experience':
        // 已確認＝僅提醒（不再顯示確認/取消）；待確認＝可確認/取消
        if (task.confirmed) return <><span style={{ fontSize:11, color:'#2D7D46', whiteSpace:'nowrap' }}>已確認{task.ticketsIssued > 0 ? '·已發放入場券' : ''}</span>{goLink(task)}</>;
        return <>
          <button onClick={() => setModal({ kind:'experience', record: task.record })} style={primaryBtn('#2D7D46')}>確認</button>
          <button onClick={() => setModal({ kind:'reason', props:{ title:'取消體驗預約', label:'取消原因', placeholder:'預設「館方取消」', confirmText:'確認取消', required:false, onSubmit: async (reason) => { await client.post(`/experience-bookings/${task.targetId}/cancel`, { reason: reason || '館方取消' }); afterDone('已取消預約'); } } })} style={dangerBtn}>取消</button>
        </>;
      case 'ticket_approval': {
        const isBatch = !!task.record?.isBatch;
        return <>
          <button onClick={() => setModal({ kind:'ticket', record: task.record })} style={primaryBtn('#2D7D46')}>核准{isBatch ? `（×${task.record.quantity}）` : ''}</button>
          <button onClick={() => setModal({ kind:'reason', props:{ title: isBatch ? `拒絕單次入場券（×${task.record.quantity}）` : '拒絕單次入場券', label:'拒絕原因', placeholder:'請填寫拒絕原因', confirmText:'確認拒絕', required:true, onSubmit: async (reason) => {
            if (isBatch) await rejectTicketBatch(task.record.batchId, reason);
            else await rejectTicket(task.targetId, reason);
            afterDone('已拒絕');
          } } })} style={dangerBtn}>拒絕</button>
        </>;
      }
      case 'fall_test_pending':
        return <><button onClick={() => setModal({ kind:'falltest', record: task.record })} style={primaryBtn('#8B1A1A')}>檢視／登記</button></>;
      case 'installment':
        return <>
          <button onClick={() => { setInstallMethod('cash'); setInstallError(''); setModal({ kind:'installment', record: task.record, props:{ seq: task.dueSeq, amount: task.dueAmount, desc: task.desc } }); }} style={primaryBtn('#2D7D46')}>確認收款</button>
          {goLink(task)}
        </>;
      default:
        // rental_pickup（取件提醒）、transfer_payment、experience_transfer：維持前往處理
        return <button onClick={() => navigate(task.link)} style={{ height:34, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, fontWeight:500, cursor:'pointer', flexShrink:0 }}>前往處理</button>;
    }
  };

  // 「今日提醒／預約」依日期+時間排序（最近的在最上面）：體驗預約有 bookingTime 精確到分鐘；
  // 器材取件/歸還無特定時段（全日事項），視為當日 00:00、排在同日有時段任務之前。
  const remindSortKey = (t) => {
    const m = String(t.bookingTime || '').match(/(\d{1,2}):(\d{2})/);
    const hhmm = m ? `${m[1].padStart(2, '0')}:${m[2]}` : '00:00';
    return `${t.date || ''} ${hhmm}`;
  };

  // 分組：依「內容」分段（票券/比賽/攀岩隊/體驗/課程/器材）；「今日提醒／預約」段內依時間近→遠，其餘依日期新→舊
  const groups = CATEGORIES.map(c => ({
    ...c,
    tasks: tasks.filter(t => c.types.includes(t.type)).sort(
      c.key === 'remind'
        ? (a, b) => remindSortKey(a).localeCompare(remindSortKey(b))
        : (a, b) => (a.date < b.date ? 1 : -1)
    ),
  })).filter(g => g.tasks.length > 0);

  const total = tasks.length;

  return (
    <div style={{ padding: isMobile ? 14 : 24, maxWidth:800, margin:'0 auto', textAlign:'left' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
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
          {perm.pass_adjustment && (
            <button onClick={() => openTrack('pass')}
              style={{ height:32, padding:'0 14px', borderRadius:8, background: trackView==='pass' ? '#5B2D8B' : '#fff', color: trackView==='pass' ? '#fff' : '#5B2D8B', border:'0.5px solid #5B2D8B', fontSize:12, cursor:'pointer' }}>
              🎫 定期票相關
            </button>
          )}
          {!isRestrictedPartTime && (
            <button onClick={() => openTrack('notif')}
              style={{ height:32, padding:'0 14px', borderRadius:8, background: trackView==='notif' ? '#854F0B' : '#fff', color: trackView==='notif' ? '#fff' : '#854F0B', border:'0.5px solid #854F0B', fontSize:12, cursor:'pointer' }}>
              🔔 通知
            </button>
          )}
          {!isRestrictedPartTime && (
            <button onClick={() => openTrack('returned')}
              style={{ height:32, padding:'0 14px', borderRadius:8, background: trackView==='returned' ? '#A32D2D' : '#fff', color: trackView==='returned' ? '#fff' : '#A32D2D', border:'0.5px solid #A32D2D', fontSize:12, cursor:'pointer' }}>
              ↩️ 退回追蹤{returnedItems.length ? `（${returnedItems.length}）` : ''}
            </button>
          )}
          <button onClick={load} style={{ height:32, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>
            重新整理
          </button>
        </div>
      </div>
      <div style={{ fontSize:12, color:'#999', marginBottom:16 }}>
        {isRestrictedPartTime
          ? `上次更新：${dayjs().format('HH:mm')}　·　🔔 今日提醒（器材取件·歸還／體驗）`
          : `上次更新：${dayjs().format('HH:mm')}　·　🔔 今日提醒（器材取件·歸還／體驗）　🔍 需審核（課程／票券／單次券）　💰 待收款（轉帳／比賽／攀岩隊／器材）　·　近 7 天動態請看「🔔 通知」`}
      </div>

      {/* 我的近 7 日班表（員工本人登入才顯示；站台／值班電腦帳號不顯示）*/}
      {isRealStaff && (
        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'14px 16px', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <div style={{ fontSize:14, fontWeight:700 }}>🗓️ 我的近 7 日班表</div>
            <div style={{ flex:1, height:1, background:'#F0E8E8' }}/>
            <div style={{ fontSize:12, color:'#999' }}>{myShifts ? `${myShifts.length} 個班` : ''}</div>
          </div>
          {myShifts === null && <div style={{ fontSize:13, color:'#999', padding:'6px 0' }}>載入中…</div>}
          {myShifts !== null && myShifts.length === 0 && <div style={{ fontSize:13, color:'#999', padding:'6px 0' }}>近 7 天沒有排班</div>}
          {myShifts !== null && myShifts.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {myShifts.map(s => {
                const d = dayjs(s.date);
                const wd = ['日','一','二','三','四','五','六'][d.day()];
                const isToday = s.date === dayjs().format('YYYY-MM-DD');
                const time = s.type === 'full_day' ? '全天' : `${s.startTime || ''}–${s.endTime || ''}`;
                return (
                  <div key={s.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', borderRadius:8, background: isToday ? '#FBF5F5' : '#FAFAFA', border:'0.5px solid #F0E8E8' }}>
                    <div style={{ minWidth:82, fontSize:13, fontWeight:600, color:'#8B1A1A', flexShrink:0 }}>
                      {d.format('MM/DD')}（{wd}）{isToday && <span style={{ fontSize:10, color:'#fff', background:'#A32D2D', borderRadius:4, padding:'1px 5px', marginLeft:4 }}>今</span>}
                    </div>
                    <div style={{ minWidth:92, fontSize:13, fontWeight:500, color: s.type==='full_day' ? '#2D7D46' : '#185FA5', flexShrink:0 }}>
                      {s.type==='full_day' ? '☀️' : '🕒'} {time}
                    </div>
                    <div style={{ flex:1, fontSize:12, color:'#666', wordBreak:'break-all' }}>{s.note || ''}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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

      {/* 定期票相關查詢（展延/退費/轉讓：已核准 / 已拒絕） */}
      {trackView === 'pass' && (
        <div style={{ marginTop:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, margin:'8px 0 12px' }}>
            <div style={{ fontSize:14, fontWeight:700 }}>🎫 定期票相關 · 展延／退費／轉讓（已核准／已拒絕）</div>
            <div style={{ flex:1, height:1, background:'#E8D5D5' }}/>
            <div style={{ fontSize:12, color:'#999' }}>{passCompleted ? `${passCompleted.length} 項` : ''}</div>
          </div>
          {passCompletedLoading && <div style={{ textAlign:'center', color:'#999', padding:24 }}>載入中...</div>}
          {!passCompletedLoading && passCompleted && passCompleted.length === 0 && (
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:24, textAlign:'center', color:'#999', fontSize:13 }}>
              尚無已完成的定期票展延／退費／轉讓申請
            </div>
          )}
          {!passCompletedLoading && passCompleted && passCompleted.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {passCompleted.map(r => {
                const typeLabel = { extension:'展延', refund:'退費', transfer:'轉讓' }[r.type] || r.type;
                const approved = r.status === 'approved';
                const badge = approved ? { bg:'#E6F4EB', color:'#2D7D46', label:'已核准' } : { bg:'#FCEBEB', color:'#A32D2D', label:'已拒絕' };
                const dateStr = r.reviewedAt?._seconds ? dayjs(r.reviewedAt._seconds * 1000).format('YYYY-MM-DD') : '';
                return (
                  <div key={r.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{r.memberName} — {r.passTypeName}</div>
                        <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{typeLabel} · 原因：{r.reasonLabel || '—'}</div>
                        {approved && r.type === 'extension' && r.result?.newEndDate && (
                          <div style={{ fontSize:11, color:'#2D7D46', marginTop:3 }}>新到期日：{r.result.newEndDate}{r.result.suspendStart ? `（停用期間 ${r.result.suspendStart}~${r.result.suspendEnd}）` : ''}</div>
                        )}
                        {approved && r.type === 'refund' && r.result?.netRefund != null && (
                          <div style={{ fontSize:11, color:'#2D7D46', marginTop:3 }}>已退款 NT${r.result.netRefund}（毛額 NT${r.result.grossRefund}－手續費 NT${r.result.fee}）</div>
                        )}
                        {approved && r.type === 'transfer' && r.result?.newOwnerName && (
                          <div style={{ fontSize:11, color:'#2D7D46', marginTop:3 }}>已轉讓給 {r.result.newOwnerName}</div>
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
          .map(n => ({ key: 'n_' + n.id, notifId: n.id, cat: notifCatOf(n.type), title: n.title || '通知', message: n.message || n.body, ts: n.createdAt?._seconds || 0, link: resolveNotifLink(n), catLabel: NOTIF_CATS.find(c => c.key === notifCatOf(n.type))?.label || '系統', canRead: true,
            // 單次入場券審核：實際審核 UI 就在本頁「🔍 需審核」區塊（無其他頁可導），
            // link 落回 /staff/pending-tasks 等於原地不動的死連結——改成直接開審核 modal。
            ticketRef: n.type === 'single_entry_ticket_approval' ? n.referenceId : null }));
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
                  <div key={i.key} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px', display:'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-start', gap:10 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, wordBreak:'break-word' }}>{i.title}</div>
                      {i.message && <div style={{ fontSize:12, color:'#666', marginTop:2, wordBreak:'break-word', lineHeight:1.5 }}>{i.message}</div>}
                      <div style={{ fontSize:11, color:'#bbb', marginTop:2 }}>
                        {i.catLabel}
                        {i.ts ? ` · ${dayjs(i.ts*1000).format('MM/DD HH:mm')}` : ''}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0, justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                      {i.ticketRef ? (
                        <button onClick={() => {
                          const found = tasks.find(t => t.type === 'ticket_approval' && t.targetId === i.ticketRef);
                          if (found) setModal({ kind:'ticket', record: found.record });
                          else showToast('此票券已審核或找不到，可能已被處理');
                        }} style={ghostBtn}>前往</button>
                      ) : (i.link && <button onClick={() => navigate(i.link)} style={ghostBtn}>{i.canRead ? '前往' : '查看'}</button>)}
                      {i.canRead && <button onClick={async () => { await markAsRead(i.notifId); loadNotifs(); }} style={{ ...ghostBtn, color:'#854F0B' }}>已讀</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {trackView === 'returned' && (
        <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:16, marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>↩️ 退回追蹤 · 退回的申請／繳費（追蹤至結案）</div>
          <div style={{ fontSize:11, color:'#999', marginBottom:12, lineHeight:1.6 }}>管理者／值班退回後在此追蹤：待會員補正 → 已補正待確認 → 確認收款或取消即結案（自動移除）。點「詳情」看會員填寫資料與退回原因。</div>
          {returnedItems.length === 0 && <div style={{ fontSize:13, color:'#999', padding:'12px 0', textAlign:'center' }}>目前沒有待追蹤的退回件</div>}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {returnedItems.map(it => (
              <div key={`${it.orderType}_${it.orderId}`} style={{ background:'#FBF5F5', borderRadius:10, border:'0.5px solid #E8D5D5', padding:'12px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600 }}>{it.memberName} <span style={{ fontSize:11, color:'#666', fontWeight:400 }}>· {it.label}</span></div>
                    <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{it.orderName}</div>
                    <div style={{ fontSize:11, color:'#999', marginTop:3, lineHeight:1.5 }}>
                      退回原因：{it.reason || '—'}
                      {it.returnByName ? `　· 退回人：${it.returnByName}` : ''}
                      {it.returnAtSec ? `　· ${dayjs(it.returnAtSec*1000).format('MM/DD HH:mm')}` : ''}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }}>
                    <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background: it.returnType==='form'?'#FFF8E6':'#FCEBEB', color: it.returnType==='form'?'#854F0B':'#A32D2D' }}>{it.returnType==='form'?'報名表退回':'繳費退回'}</span>
                    <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background: it.subStatus==='awaiting_member'?'#FAEEDA':'#E6F1FB', color: it.subStatus==='awaiting_member'?'#854F0B':'#185FA5' }}>{it.subStatus==='awaiting_member'?'待會員補正':'已補正待確認'}</span>
                    <button onClick={()=>setReturnedDetail(it)} style={ghostBtn}>詳情</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {returnedDetail && (() => {
        const d = returnedDetail; const md = d.memberData || {};
        const rows = d.returnType === 'form'
          ? [['組別', md.divisionName], ['性別', md.gender==='male'?'男':md.gender==='female'?'女':md.gender], ['手機', md.phone], ['Email', md.email], ['身分證', md.idNumber], ['緊急聯絡', [md.emergencyContact, md.emergencyPhone].filter(Boolean).join(' ')]]
          : [['付款方式', md.paymentMethod==='cash'?'臨櫃現金':md.paymentMethod==='transfer'?'銀行轉帳':md.paymentMethod], ['金額', md.amount?`NT$${md.amount}`:null], ['匯款末五碼', md.bankLastFive], ['匯款銀行', md.bankName], ['繳款日期', md.paymentDate]];
        const mgr = [['退回類型', d.returnType==='form'?'報名表退回':'繳費退回'], ['退回原因', d.reason], ['退回人', d.returnByName], ['退回時間', d.returnAtSec?dayjs(d.returnAtSec*1000).format('YYYY-MM-DD HH:mm'):null], ['目前狀態', d.subStatus==='awaiting_member'?'待會員補正':'已補正待確認']];
        const Row = ([k,v]) => <div key={k} style={{ display:'flex', fontSize:12, padding:'2px 0' }}><div style={{ width:78, color:'#999', flexShrink:0 }}>{k}</div><div style={{ color:'#333', wordBreak:'break-word' }}>{v || '—'}</div></div>;
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={()=>setReturnedDetail(null)}>
            <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, padding:20, width:'100%', maxWidth:420, maxHeight:'85vh', overflowY:'auto' }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>退回件詳情</div>
              <div style={{ fontSize:12, color:'#666', marginBottom:12 }}>{d.memberName} · {d.label} · {d.orderName}</div>
              <div style={{ background:'#FCEBEB', borderRadius:8, padding:'10px 12px', marginBottom:10 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#A32D2D', marginBottom:4 }}>👔 管理者退回資料</div>
                {mgr.map(Row)}
              </div>
              <div style={{ background:'#FBF5F5', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#8B1A1A', marginBottom:4 }}>🧑 會員填寫資料</div>
                {rows.map(Row)}
              </div>
              <button onClick={()=>setReturnedDetail(null)} style={{ marginTop:14, width:'100%', height:42, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, cursor:'pointer' }}>關閉</button>
            </div>
          </div>
        );
      })()}

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
              const isCashPay = task.type === 'transfer_confirm' && task.method === 'cash';
              const badgeLabel = isCashPay ? '現金確認' : cfg.label;
              const badgeIcon = isCashPay ? '💵' : cfg.icon;
              // 待收款類任務：付款方式標籤（轉帳 / 臨櫃繳款 / 電子支付）
              const PAY_TAG = { cash:{ label:'臨櫃繳款', bg:'#FFF8E6', color:'#8A5A00' }, transfer:{ label:'轉帳', bg:'#E6F1FB', color:'#185FA5' }, linepay:{ label:'Line Pay', bg:'#E6F4EB', color:'#2D7D46' }, jkopay:{ label:'街口', bg:'#FCEBEB', color:'#A32D2D' }, taiwanpay:{ label:'台灣Pay', bg:'#EFEAF8', color:'#533AB7' } };
              const isPayTask = ['transfer_confirm','competition_payment','team_member','rental'].includes(task.type);
              const payTag = isPayTask ? PAY_TAG[task.method || task.record?.paymentMethod] : null;
              // 比賽報名友館優惠：直接標出選了哪個友館，方便快速審核（不用點進去才知道）
              const partnerGymTag = task.partnerGym || task.record?.partnerGym;
              return (
                <div key={task.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px', display:'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 12 }}>
                  <div style={{ display:'flex', alignItems: isMobile ? 'flex-start' : 'center', gap:12, minWidth:0 }}>
                    {/* 圖示 */}
                    <div style={{ width:40, height:40, borderRadius:10, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                      {badgeIcon}
                    </div>
                    {/* 內容 */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                        <span style={{ fontSize:10, fontWeight:600, padding:'1px 7px', borderRadius:6, background:cfg.bg, color:cfg.color, flexShrink:0 }}>{badgeLabel}</span>
                        <span style={{ fontSize:13, fontWeight:600 }}>{task.title}</span>
                        {payTag && <span style={{ fontSize:10, fontWeight:600, padding:'1px 7px', borderRadius:6, background:payTag.bg, color:payTag.color, flexShrink:0 }}>{payTag.label}</span>}
                        {partnerGymTag && <span style={{ fontSize:10, fontWeight:600, padding:'1px 7px', borderRadius:6, background:'#EFEAF8', color:'#533AB7', flexShrink:0 }}>🧗 友館：{partnerGymTag}</span>}
                      </div>
                      <div style={{ fontSize:12, color:'#666', ...(isMobile ? { lineHeight:1.5, wordBreak:'break-word' } : { overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }) }}>{task.desc}</div>
                      <div style={{ fontSize:11, color:'#bbb', marginTop:2 }}>
                        {task.gymId === 'gym-hsinchu' ? '新竹館' : task.gymId === 'gym-shilin' ? '士林館' : ''}
                        {task.gymId && task.date ? ' · ' : ''}
                        {task.date}
                      </div>
                    </div>
                  </div>
                  {/* 內嵌動作 */}
                  <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0, flexWrap:'wrap', justifyContent: isMobile ? 'flex-end' : 'flex-start', ...(isMobile ? { borderTop:'0.5px solid #F5EFEF', paddingTop:10 } : {}) }}>
                    {renderActions(task)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}


      {/* 內嵌審核彈窗 */}
      {modal?.kind === 'course' && <CourseAdjustmentReviewModal request={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'pass' && <PassRequestReviewModal request={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'competition' && <CompetitionActionModal action="pay" reg={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'competition-refund' && <CompetitionActionModal action="refund" reg={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'rental' && <RentalActionModal action={modal.action} rental={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'reason' && <ReasonModal {...modal.props} onClose={() => setModal(null)} />}
      {modal?.kind === 'transfer' && <TransferConfirmModal record={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'experience' && <ExperienceDetailModal record={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'ticket' && <TicketApprovalModal record={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'falltest' && <FallTestBookingModal record={modal.record} onClose={() => setModal(null)} onDone={afterDone} />}
      {modal?.kind === 'team' && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:220, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:420, border:'0.5px solid #E8D5D5' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontSize:16, fontWeight:600 }}>💰 確認收款 — 攀岩隊入隊申請</div>
              <span onClick={() => setModal(null)} style={{ cursor:'pointer', color:'#999', fontSize:18 }}>×</span>
            </div>
            <div style={{ background:'#FBF5F5', borderRadius:8, padding:12, marginBottom:14, fontSize:13, color:'#444' }}>{modal.props.task.desc}</div>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>員工備註（選填，會員看不到）</label>
            <textarea value={teamNote} onChange={e => setTeamNote(e.target.value)} rows={2} placeholder="核對備註、特殊狀況…"
              style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 10px', fontSize:13, boxSizing:'border-box', resize:'vertical', fontFamily:'inherit', marginBottom:14 }} />
            {teamError && <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#A32D2D', marginBottom:12 }}>{teamError}</div>}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setModal(null)} disabled={teamBusy} style={{ flex:1, height:42, borderRadius:8, background:'#f5f5f5', border:'none', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
              <button disabled={teamBusy} onClick={async () => {
                setTeamBusy(true); setTeamError('');
                try { await confirmTeamPayment(modal.props.task.targetId, { staffNote: teamNote }); afterDone('已確認收款'); }
                catch (e) { setTeamError(e.response?.data?.message || '確認失敗，請重試'); setTeamBusy(false); }
              }} style={{ flex:2, height:42, borderRadius:8, background: teamBusy ? '#9CB9A6' : '#2D7D46', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: teamBusy ? 'not-allowed' : 'pointer' }}>
                {teamBusy ? '處理中…' : '確認收款'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === 'installment' && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:220, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:420, border:'0.5px solid #E8D5D5' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontSize:16, fontWeight:600 }}>🧾 確認收款 — 分期付款</div>
              <span onClick={() => setModal(null)} style={{ cursor:'pointer', color:'#999', fontSize:18 }}>×</span>
            </div>
            <div style={{ background:'#FBF5F5', borderRadius:8, padding:12, marginBottom:14, fontSize:13, color:'#444' }}>{modal.props.desc}</div>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:8 }}>收款方式</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
              {filterPayments(INSTALLMENT_PAY_METHODS, enabledPay).map(pm => (
                <button key={pm.key} onClick={() => setInstallMethod(pm.key)}
                  style={{ height:38, borderRadius:8, border: installMethod===pm.key?'none':'0.5px solid #E8D5D5', background: installMethod===pm.key?'#8B1A1A':'#fff', color: installMethod===pm.key?'#fff':'#666', fontSize:13, cursor:'pointer' }}>
                  {pm.label}
                </button>
              ))}
            </div>
            {installError && <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#A32D2D', marginBottom:12 }}>{installError}</div>}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setModal(null)} disabled={installBusy} style={{ flex:1, height:42, borderRadius:8, background:'#f5f5f5', border:'none', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
              <button disabled={installBusy} onClick={async () => {
                setInstallBusy(true); setInstallError('');
                try {
                  const res = await markInstallmentPaid(modal.record.id, modal.props.seq, installMethod);
                  afterDone(res.data.message || '已標記此期繳款完成');
                } catch (e) { setInstallError(e.response?.data?.message || '確認失敗，請重試'); setInstallBusy(false); }
              }} style={{ flex:2, height:42, borderRadius:8, background: installBusy ? '#9CB9A6' : '#2D7D46', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: installBusy ? 'not-allowed' : 'pointer' }}>
                {installBusy ? '處理中…' : '確認收款'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 操作結果提示 */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#1a1a1a', color:'#fff', padding:'10px 20px', borderRadius:10, fontSize:13, zIndex:300, boxShadow:'0 4px 16px rgba(0,0,0,.2)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
