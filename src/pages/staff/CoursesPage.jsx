import { useState, useEffect } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../api/courseCategories';
import { getCourses, createCourse, getSessions, createSession,
         getSessionRoster, enrollCourse, markAttendance,
         generateWeeklySessions, updateSession, setSessionSubstitute, clearSessionSubstitute, deleteCourse, permanentDeleteCourse } from '../../api/courses';
import { searchMembers } from '../../api/members';
import client from '../../api/client';
import { useAuth } from '../../store/authStore';
import CoachSelect from '../../components/CoachSelect';
import SegmentedTabs from '../../components/SegmentedTabs';
import InstallmentRuleEditor from '../../components/InstallmentRuleEditor';
import PaymentPlanChoice from '../../components/PaymentPlanChoice';
import dayjs from 'dayjs';

const Tag = ({ type='ok', children }) => {
  const s = {
    ok:      { bg:'#E6F4EB', color:'#2D7D46' },
    red:     { bg:'#FCEBEB', color:'#A32D2D' },
    warn:    { bg:'#FAEEDA', color:'#854F0B' },
    gray:    { bg:'#F0EDED', color:'#666' },
    blue:    { bg:'#E6F1FB', color:'#185FA5' },
    purple:  { bg:'#EEEDFE', color:'#534AB7' },
  };
  const st = s[type] || s.ok;
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:st.bg, color:st.color }}>{children}</span>;
};

const Modal = ({ title, onClose, children, width=480 }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ background:'#fff', borderRadius:16, padding:24, width, maxWidth:'95vw', maxHeight:'88vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:600 }}>{title}</div>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const WEEKDAYS = ['日','一','二','三','四','五','六'];
const PAYMENT_METHODS = [
  { key:'cash', label:'現金' },
  { key:'linepay', label:'Line Pay' },
  { key:'jkopay', label:'街口支付' },
  { key:'taiwanpay', label:'台灣Pay' },
];

export default function CoursesPage({ embedded = false }) {
  const { staff, activeGymId } = useAuth();
  const effectiveGymId = activeGymId || staff?.gymId;
  const isSuperAdmin = staff?.role === 'super_admin';
  const GYMS = [
    { id: 'gym-hsinchu', name: '新竹館' },
    { id: 'gym-shilin',  name: '士林館' },
  ];
  const [tab, setTab] = useState('courses');
  const [rosterModal, setRosterModal] = useState(null); // { course, enrollments }
  const [editLeave, setEditLeave] = useState(null); // { memberId, value }
  const [savingLeave, setSavingLeave] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [courses, setCourses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '#8B1A1A' });
  const [sessions, setSessions] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(dayjs().format('YYYY-MM'));
  const [calendarSessions, setCalendarSessions] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(null);
  const [rosterSession, setRosterSession] = useState(null);
  // 代班教練
  const [subSession, setSubSession] = useState(null);
  const [subCoach, setSubCoach] = useState({ coachId: null, coachName: '' });
  const [subReason, setSubReason] = useState('');
  const [subSaving, setSubSaving] = useState(false);
  const [rosterData, setRosterData] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');
  // 改課表重產：孤兒場次確認 Modal { courseId, orphans, willCreate, willDelete }
  const [orphanConfirm, setOrphanConfirm] = useState(null);
  const [orphanBusy, setOrphanBusy] = useState(false);

  // 新增課程
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [imgUploading, setImgUploading] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [copyFrom, setCopyFrom] = useState('');
  const [courseForm, setCourseForm] = useState({
    name: '', description: '', price: '', maxStudents: 10, categoryId: '',
    type: 'weekly', totalSessions: '', startDate: '', endDate: '',
    startTime: '', endTime: '', instructor: '',
    gymAccessDays: 1, leaveDeadlineHours: 2,
    maxLeaves: 2, allowMakeup: true, makeupDeadlineDays: 60, midpointSurcharge: 1.05,
    allowTrial: false, trialPrice: '',
    unlimitedPracticeStart: '', unlimitedPracticeEnd: '',
    perSessionDeduction: 850, handlingFeeRate: 5,
    installment: { enabled: false, periods: [] },
  });

  // 新增場次
  const [showAddSession, setShowAddSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    date: dayjs().format('YYYY-MM-DD'),
    startTime: '', endTime: '', instructor: '', notes: '',
  });

  const openAddSession = (course) => {
    setSessionForm({
      date: dayjs().format('YYYY-MM-DD'),
      startTime: course?.startTime || '',
      endTime: course?.endTime || '',
      instructor: course?.instructor || '',
      notes: '',
    });
    setShowAddSession(true);
  };

  const [editingSession, setEditingSession] = useState(null);
  const openEditSession = (session) => {
    setSessionForm({
      date: session.date || '',
      startTime: session.startTime || '',
      endTime: session.endTime || '',
      instructor: session.instructor || '',
      notes: session.notes || '',
    });
    setEditingSession(session);
  };
  const handleSaveEditSession = async () => {
    try {
      await handleUpdateSession(editingSession.id, sessionForm);
      setEditingSession(null);
    } catch (err) {}
  };

  // 報名會員
  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollQuery, setEnrollQuery] = useState('');
  const [enrollResults, setEnrollResults] = useState([]);
  const [enrollMember, setEnrollMember] = useState(null);
  const [enrollPayment, setEnrollPayment] = useState('cash');
  const [enrollPaymentPlan, setEnrollPaymentPlan] = useState('full');

  const openSubstitute = (s) => {
    setSubSession(s);
    setSubCoach({ coachId: s.coachId || null, coachName: s.instructor || '' });
    setSubReason('');
  };
  const saveSubstitute = async () => {
    if (!subCoach.coachName?.trim()) { showMsg('請選擇或輸入代班教練', 'red'); return; }
    setSubSaving(true);
    try {
      await setSessionSubstitute(subSession.id, { coachId: subCoach.coachId || undefined, coachName: subCoach.coachName.trim(), reason: subReason.trim() });
      showMsg('✅ 已設定代班教練並發送待辦提醒');
      setSubSession(null);
      loadCalendarSessions();
    } catch (e) { showMsg(e.response?.data?.message || '設定失敗', 'red'); }
    finally { setSubSaving(false); }
  };
  const clearSubstitute = async (s) => {
    try {
      await clearSessionSubstitute(s.id);
      showMsg('✅ 已取消代班，恢復原教練');
      loadCalendarSessions();
    } catch (e) { showMsg(e.response?.data?.message || '取消失敗', 'red'); }
  };

  const showMsg = (text, type='ok') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 3000);
  };

  useEffect(() => { loadCourses(); loadCategories(); }, []);
  useEffect(() => { if (tab === 'sessions' && selectedCourse) loadSessions(selectedCourse); }, [tab]);
  useEffect(() => { if (tab === 'calendar') loadCalendarSessions(); }, [tab, calendarMonth, effectiveGymId]);

  const loadCategories = async () => {
    try {
      const res = await getCategories();
      setCategories(res.data.categories || []);
    } catch (e) {}
  };

  const handleCreateCategory = async () => {
    try {
      await createCategory(categoryForm);
      showMsg('類別建立成功');
      setShowAddCategory(false);
      setCategoryForm({ name: '', description: '', color: '#8B1A1A' });
      await loadCategories();
    } catch (err) {
      showMsg(err.response?.data?.message || '建立失敗', 'red');
    }
  };

  const [editingCategory, setEditingCategory] = useState(null);
  const handleUpdateCategory = async () => {
    try {
      await updateCategory(editingCategory.id, categoryForm);
      showMsg('類別已更新');
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '', color: '#8B1A1A' });
      await loadCategories();
    } catch (err) {
      showMsg(err.response?.data?.message || '更新失敗', 'red');
    }
  };

  const handleDeleteCategory = async (id, name) => {
    if (!window.confirm(`確定停用「${name}」？`)) return;
    try {
      await deleteCategory(id);
      showMsg('類別已停用');
      await loadCategories();
    } catch (err) {
      showMsg('操作失敗', 'red');
    }
  };

  const loadCourses = async () => {
    try {
      const res = await getCourses(effectiveGymId);
      setCourses(res.data.courses || []);
    } catch (e) {}
  };

  const loadSessions = async (course) => {
    try {
      const c = course || selectedCourse;
      const fromDate = c?.startDate || dayjs().subtract(7, 'day').format('YYYY-MM-DD');
      const toDate = c?.endDate || dayjs().add(180, 'day').format('YYYY-MM-DD');
      const res = await getSessions({ gymId: effectiveGymId, fromDate, toDate });
      setSessions(res.data.sessions || []);
    } catch (e) {}
  };

  const loadCalendarSessions = async () => {
    setCalendarLoading(true);
    try {
      const fromDate = dayjs(`${calendarMonth}-01`).format('YYYY-MM-DD');
      const toDate = dayjs(`${calendarMonth}-01`).endOf('month').format('YYYY-MM-DD');
      const res = await getSessions({ gymId: effectiveGymId, fromDate, toDate });
      setCalendarSessions(res.data.sessions || []);
    } catch (e) { setCalendarSessions([]); }
    finally { setCalendarLoading(false); }
  };

  const loadRoster = async (sessionId) => {
    try {
      const res = await getSessionRoster(sessionId);
      setRoster(res.data);
    } catch (e) {}
  };

  const handleCreateCourse = async () => {
    setLoading(true);
    try {
      const res = await createCourse({
        ...courseForm,
        price: parseInt(courseForm.price),
        maxStudents: parseInt(courseForm.maxStudents),
        totalSessions: parseInt(courseForm.totalSessions) || 0,
        gymAccessDays: parseInt(courseForm.gymAccessDays),
        gymAccessDaysAfter: parseInt(courseForm.gymAccessDays),
        leaveDeadlineHours: parseInt(courseForm.leaveDeadlineHours),
        maxLeaves: parseInt(courseForm.maxLeaves),
        makeupDeadlineDays: parseInt(courseForm.makeupDeadlineDays),
        midpointSurcharge: parseFloat(courseForm.midpointSurcharge) || 1.05,
        perSessionDeduction: parseInt(courseForm.perSessionDeduction) || 850,
        handlingFeeRate: (parseFloat(courseForm.handlingFeeRate) || 5) / 100,
        allowTrial: courseForm.type === 'weekly' && !!courseForm.allowTrial,
        trialPrice: parseInt(courseForm.trialPrice) || 0,
        weekdays: courseForm.weekdays.map(Number),
      });
      // 週課自動產生場次
      if (courseForm.type === 'weekly' && courseForm.weekdays.length > 0 &&
          courseForm.startDate && courseForm.endDate) {
        await generateWeeklySessions(res.data.course?.id, { confirm: true });
        showMsg('課程建立成功，場次已自動產生');
      } else {
        showMsg('課程建立成功');
      }
      setShowAddCourse(false);
      await loadCourses();
    } catch (err) {
      showMsg(err.response?.data?.message || '建立失敗', 'red');
    } finally { setLoading(false); }
  };

  const handleEditCourse = (course) => {
    setEditForm({
      name: course.name || '',
      weekdays: course.weekdays || [],
      description: course.description || '',
      imageUrl: course.imageUrl || '',
      price: course.price || '',
      maxStudents: course.maxStudents || 10,
      startDate: course.startDate || '',
      endDate: course.endDate || '',
      startTime: course.startTime || '',
      endTime: course.endTime || '',
      instructor: course.instructor || '',
      totalSessions: course.totalSessions || '',
      leaveDeadlineHours: course.leaveDeadlineHours || 2,
      maxLeaves: course.maxLeaves || 2,
      makeupDeadlineDays: course.makeupDeadlineDays || 60,
      midpointSurcharge: course.midpointSurcharge || 1.05,
      perSessionDeduction: course.perSessionDeduction ?? 850,
      handlingFeeRate: Math.round((course.handlingFeeRate ?? 0.05) * 100),
      allowMakeup: course.allowMakeup !== false,
      type: course.type || 'weekly',
      allowTrial: course.allowTrial === true,
      trialPrice: course.trialPrice || '',
      unlimitedPracticeStart: course.unlimitedPracticeStart || course.startDate || '',
      unlimitedPracticeEnd: course.unlimitedPracticeEnd || course.endDate || '',
      installment: course.installment || { enabled: false, periods: [] },
    });
    setEditingCourse(course);
  };

  const handleUpdateCourse = async () => {
    setLoading(true);
    // 課表（上課星期 / 起訖日）是否有變動 → 需重新產生場次
    const norm = (arr) => [...(arr || [])].map(Number).sort((a, b) => a - b).join(',');
    const courseId = editingCourse.id;
    const scheduleChanged =
      norm(editForm.weekdays) !== norm(editingCourse.weekdays) ||
      editForm.startDate !== editingCourse.startDate ||
      editForm.endDate !== editingCourse.endDate;
    const needRegen = editingCourse.type === 'weekly' && scheduleChanged &&
      editForm.weekdays?.length > 0 && editForm.startDate && editForm.endDate;
    try {
      const { updateCourse } = await import('../../api/courses');
      await updateCourse(editingCourse.id, {
        ...editForm,
        price: parseInt(editForm.price),
        maxStudents: parseInt(editForm.maxStudents),
        totalSessions: parseInt(editForm.totalSessions) || 0,
        leaveDeadlineHours: parseInt(editForm.leaveDeadlineHours),
        maxLeaves: parseInt(editForm.maxLeaves),
        makeupDeadlineDays: parseInt(editForm.makeupDeadlineDays),
        midpointSurcharge: parseFloat(editForm.midpointSurcharge) || 1.05,
        perSessionDeduction: parseInt(editForm.perSessionDeduction) || 850,
        handlingFeeRate: (parseFloat(editForm.handlingFeeRate) || 5) / 100,
        allowTrial: (editForm.type || editingCourse?.type) === 'weekly' && !!editForm.allowTrial,
        trialPrice: parseInt(editForm.trialPrice) || 0,
      });
      showMsg(needRegen ? '課程已更新，正在依新課表重排場次…' : '課程已更新');
      setEditingCourse(null);
      await loadCourses();
      // 改課表 → 重新產生場次（孤兒場次走確認/轉移流程）
      if (needRegen) await handleGenerateSessions(courseId);
    } catch (err) {
      showMsg(err.response?.data?.message || '更新失敗', 'red');
    } finally { setLoading(false); }
  };

  const handleDeleteCourse = async (course) => {
    if (!window.confirm(`確定要取消「${course.name}」？尚未開始的場次將一併取消，已完成的歷史紀錄會保留。`)) return;
    try {
      await deleteCourse(course.id);
      showMsg('課程已取消');
      await loadCourses();
    } catch (err) {
      showMsg(err.response?.data?.message || '取消失敗', 'red');
    }
  };

  // 停用/啟用課程（會員課程總覽隱藏/顯示，可逆；不通知學員、不動報名，與「取消課程」不同）
  const handleToggleCourseActive = async (course, isActive) => {
    if (!isActive && !window.confirm(`停用「${course.name}」？停用後會員在課程總覽將看不到（不會通知學員、不影響已報名者），日後可再啟用。`)) return;
    try {
      const { updateCourse } = await import('../../api/courses');
      await updateCourse(course.id, { isActive });
      showMsg(isActive ? '課程已啟用' : '課程已停用');
      await loadCourses();
    } catch (err) {
      showMsg(err.response?.data?.message || '操作失敗', 'red');
    }
  };

  const handlePermanentDelete = async (course) => {
    if (!window.confirm(`⚠️ 永久刪除「${course.name}」？\n將一併刪除所有場次、報名與補課紀錄，無法復原。\n（若仍有學員報名會被擋下，請先「取消課程」並處理退費）`)) return;
    try {
      await permanentDeleteCourse(course.id);
      showMsg('課程已永久刪除');
      if (selectedCourse?.id === course.id) setSelectedCourse(null);
      await loadCourses();
    } catch (err) {
      showMsg(err.response?.data?.message || '刪除失敗', 'red');
    }
  };

  const handleGenerateSessions = async (courseId) => {
    try {
      // 先預覽：偵測孤兒場次（有學員、但不在新課表的舊場次）
      const res = await generateWeeklySessions(courseId, { confirm: false });
      if ((res.data.orphans || []).length > 0) {
        setOrphanConfirm({ courseId, ...res.data }); // 跳確認 Modal
        return;
      }
      await runGenerateSessions(courseId); // 無孤兒 → 直接產生
    } catch (err) {
      showMsg(err.response?.data?.message || '產生場次失敗', 'red');
    }
  };

  const runGenerateSessions = async (courseId) => {
    setOrphanBusy(true);
    try {
      const res = await generateWeeklySessions(courseId, { confirm: true });
      showMsg(res.data.message);
      setOrphanConfirm(null);
      await Promise.all([loadSessions(), loadCourses()]); // 同步刷新場次與課程卡（堂數）
    } catch (err) {
      showMsg(err.response?.data?.message || '產生場次失敗', 'red');
    } finally { setOrphanBusy(false); }
  };

  const handleUpdateSession = async (sessionId, data) => {
    try {
      await updateSession(sessionId, data);
      showMsg('場次已更新');
      await loadSessions();
      if (selectedSession?.id === sessionId) setSelectedSession(null);
    } catch (err) {
      showMsg(err.response?.data?.message || '更新失敗', 'red');
    }
  };

  const handleCancelSession = async (sessionId) => {
    if (!window.confirm('確定要取消此場次？')) return;
    await handleUpdateSession(sessionId, { status: 'cancelled' });
  };

  const handleCreateSession = async () => {
    if (!selectedCourse) return;
    setLoading(true);
    try {
      await createSession(selectedCourse.id, sessionForm);
      showMsg('場次建立成功');
      setShowAddSession(false);
      await loadSessions();
    } catch (err) {
      showMsg(err.response?.data?.message || '建立失敗', 'red');
    } finally { setLoading(false); }
  };

  const handleEnroll = async () => {
    if (!enrollMember || !selectedSession) return;
    setLoading(true);
    try {
      await enrollCourse(selectedSession.id, {
        memberId: enrollMember.id,
        paymentMethod: enrollPayment,
        paymentPlan: enrollPaymentPlan,
      });
      showMsg(`${enrollMember.name} 報名成功`);
      setShowEnroll(false);
      setEnrollMember(null);
      setEnrollQuery('');
      await loadRoster(selectedSession.id);
    } catch (err) {
      showMsg(err.response?.data?.message || '報名失敗', 'red');
    } finally { setLoading(false); }
  };

  const handleMarkAttendance = async (sessionId, memberId, status) => {
    try {
      await markAttendance(sessionId, { memberId, status });
      showMsg('出席狀態已更新');
      await loadRoster(sessionId);
    } catch (err) {
      showMsg(err.response?.data?.message || '更新失敗', 'red');
    }
  };

  // 下載整門課的出缺席點名表 CSV（走 axios client，interceptor 自動帶正確 token）
  const downloadAttendanceCSV = async (courseId, courseName) => {
    try {
      const r = await client.get(`/courses/${courseId}/attendance/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url;
      a.download = `${courseName || '課程'}_出缺席_${dayjs().format('YYYY-MM-DD')}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) {
      showMsg(e.response?.status === 403 ? '權限不足：僅管理員可下載' : '下載失敗，請重新登入後再試', 'red');
    }
  };

  const searchEnrollMember = async (q) => {
    setEnrollQuery(q);
    if (q.length < 2) { setEnrollResults([]); return; }
    const res = await searchMembers(q);
    setEnrollResults(res.data.members || []);
  };

  const loadCourseRoster = async (course) => {
    setRosterModal({ course, enrollments: null });
    setRosterLoading(true);
    try {
      const res = await client.get(`/courses/${course.id}/enrollments`);
      const enrollments = res.data.enrollments || [];
      setRosterModal({ course, enrollments });
    } catch(e) { setRosterModal({ course, enrollments: [] }); }
    finally { setRosterLoading(false); }
  };

  // 管理員為（插班）學員個別填寫可請假次數（空＝回課程整期預設）
  const saveLeaveAllowance = async (courseId, memberId, raw) => {
    setSavingLeave(true);
    try {
      const res = await client.put(`/courses/${courseId}/members/${memberId}/max-leaves`, { maxLeavesAllowed: raw === '' ? null : parseInt(raw, 10) });
      setRosterModal(rm => rm ? { ...rm, enrollments: rm.enrollments.map(e => e.memberId === memberId ? { ...e, maxLeavesAllowed: res.data.maxLeavesAllowed } : e) } : rm);
      setEditLeave(null);
      showMsg(res.data.message || '已更新');
    } catch (e) { showMsg(e.response?.data?.message || '更新失敗', 'red'); }
    finally { setSavingLeave(false); }
  };

  const courseTypeLabel = (t) => t === 'weekly' ? '週課' : '工作坊';
  const STATUS_LABEL_MAP = {
    enrolling:      { type:'blue',  label:'報名中' },
    starting_soon:  { type:'warn',  label:'即將開始' },
    ongoing:        { type:'ok',    label:'進行中' },
    full:           { type:'red',   label:'已滿' },
    ended:          { type:'gray',  label:'已結束' },
    cancelled:      { type:'gray',  label:'已取消' },
  };
  const courseStatus = (c) => STATUS_LABEL_MAP[c.statusLabel] || { type:'blue', label:'計畫中' };

  const COURSE_TABS = [
    { key:'courses',    icon:'📚', label:'課程列表' },
    { key:'calendar',   icon:'📅', label:'月曆' },
    { key:'sessions',   icon:'🕐', label:'場次管理' },
    { key:'categories', icon:'🏷️', label:'類別管理' },
  ];

  return (
    <div style={{ padding: embedded?0:20, background:'#F7F3F3' }}>
      {msg && (
        <div style={{ background: msgType==='ok'?'#E6F4EB':'#FCEBEB', border:`0.5px solid ${msgType==='ok'?'#B3DEC0':'#F09595'}`, borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color: msgType==='ok'?'#2D7D46':'#A32D2D', display:'flex', justifyContent:'space-between' }}>
          {msg} <span style={{ cursor:'pointer' }} onClick={() => setMsg('')}>✕</span>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:16 }}>
        <SegmentedTabs wrap minTabWidth={130} tabs={COURSE_TABS} value={tab} onChange={setTab} style={{ flex:'1 1 280px', minWidth:0 }} />
        {tab === 'courses' && (
          <button onClick={() => setShowAddCourse(true)}
            style={{ height:36, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            ＋ 新增課程
          </button>
        )}
        {tab === 'sessions' && selectedCourse && (
          <button onClick={() => openAddSession(selectedCourse)}
            style={{ height:36, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            ＋ 新增場次
          </button>
        )}
      </div>

      {/* ── 課程列表 ── */}
      {tab === 'courses' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
          {courses.length === 0 ? (
            <div style={{ gridColumn:'1/-1', background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:40, textAlign:'center', color:'#999', fontSize:13 }}>
              目前沒有課程，點右上角新增
            </div>
          ) : courses.map(c => {
            const st = courseStatus(c);
            const inactive = c.isActive === false && c.status !== 'cancelled';
            return (
              <div key={c.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, cursor:'pointer', opacity: inactive ? 0.6 : 1 }}
                onClick={() => { setSelectedCourse(c); setTab('sessions'); }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, gap:6 }}>
                  <Tag type={c.type==='weekly'?'blue':'purple'}>{courseTypeLabel(c.type)}</Tag>
                  <div style={{ display:'flex', gap:6 }}>
                    {inactive && <Tag type="gray">已停用</Tag>}
                    <Tag type={st.type}>{st.label}</Tag>
                  </div>
                </div>
                <div style={{ fontWeight:600, fontSize:15, marginBottom:4 }}>{c.name}</div>
                <div style={{ fontSize:20, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace', marginBottom:8 }}>
                  NT${(c.price||0).toLocaleString()}
                </div>
                <div style={{ fontSize:12, color:'#999' }}>
                  {c.enrolledCount || 0} / {c.maxStudents} 人 · {c.totalSessions ? `共 ${c.totalSessions} 堂` : ''}
                </div>
                {c.description && (
                  <div style={{ fontSize:12, color:'#666', marginTop:8, borderTop:'0.5px solid #F5EFEF', paddingTop:8 }}>
                    {c.description.slice(0,50)}{c.description.length>50?'...':''}
                  </div>
                )}
                <div style={{ marginTop:10, display:'flex', gap:6, flexWrap:'wrap' }} onClick={e => e.stopPropagation()}>
                  {c.status !== 'cancelled' && (
                    <button onClick={() => handleEditCourse(c)}
                      style={{ flex:1, minWidth:60, height:28, borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:11, cursor:'pointer' }}>
                      編輯
                    </button>
                  )}
                  {c.status !== 'cancelled' && (
                    inactive ? (
                      <button onClick={() => handleToggleCourseActive(c, true)}
                        style={{ flex:1, minWidth:60, height:28, borderRadius:6, background:'#fff', border:'0.5px solid #2D7D46', color:'#2D7D46', fontSize:11, cursor:'pointer' }}>
                        啟用
                      </button>
                    ) : (
                      <button onClick={() => handleToggleCourseActive(c, false)}
                        style={{ flex:1, minWidth:60, height:28, borderRadius:6, background:'#fff', border:'0.5px solid #B5762B', color:'#B5762B', fontSize:11, cursor:'pointer' }}>
                        停用
                      </button>
                    )
                  )}
                  {c.status !== 'cancelled' && (
                    <button onClick={() => handleDeleteCourse(c)}
                      style={{ flex:1, minWidth:60, height:28, borderRadius:6, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:11, cursor:'pointer' }}>
                      取消課程
                    </button>
                  )}
                  <button onClick={() => loadCourseRoster(c)}
                    style={{ flex:1, minWidth:60, height:28, borderRadius:6, background:'#8B1A1A', border:'none', color:'#fff', fontSize:11, cursor:'pointer' }}>
                    查看名單
                  </button>
                  {isSuperAdmin && (
                    <button onClick={() => handlePermanentDelete(c)}
                      style={{ flex:1, minWidth:60, height:28, borderRadius:6, background:'#A32D2D', border:'none', color:'#fff', fontSize:11, cursor:'pointer' }}>
                      刪除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 月曆 ── */}
      {tab === 'calendar' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:14, marginBottom:16 }}>
            <button onClick={() => { setCalendarMonth(dayjs(`${calendarMonth}-01`).subtract(1,'month').format('YYYY-MM')); setCalendarSelectedDate(null); }}
              style={{ width:34, height:34, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', cursor:'pointer', fontSize:16, color:'#333', fontWeight:600 }}>‹</button>
            <div style={{ fontSize:16, fontWeight:600, minWidth:100, textAlign:'center' }}>{dayjs(`${calendarMonth}-01`).format('YYYY年MM月')}</div>
            <button onClick={() => { setCalendarMonth(dayjs(`${calendarMonth}-01`).add(1,'month').format('YYYY-MM')); setCalendarSelectedDate(null); }}
              style={{ width:34, height:34, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', cursor:'pointer', fontSize:16, color:'#333', fontWeight:600 }}>›</button>
            <button onClick={() => { setCalendarMonth(dayjs().format('YYYY-MM')); setCalendarSelectedDate(null); }}
              style={{ height:34, padding:'0 12px', borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', cursor:'pointer', fontSize:12, color:'#666' }}>回到本月</button>
          </div>

          {calendarLoading ? (
            <div style={{ textAlign:'center', padding:60, color:'#999', fontSize:13 }}>載入中...</div>
          ) : (() => {
            const startOfMonth = dayjs(`${calendarMonth}-01`);
            const daysInMonth = startOfMonth.daysInMonth();
            const firstDow = startOfMonth.day();
            const cells = [];
            for (let i = 0; i < firstDow; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(startOfMonth.date(d).format('YYYY-MM-DD'));

            const sessionsForDate = (date) => calendarSessions.filter(s => s.date === date && s.status !== 'cancelled');
            const today = dayjs().format('YYYY-MM-DD');

            return (
              <>
                <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden', marginBottom:16 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', background:'#FBF5F5' }}>
                    {['日','一','二','三','四','五','六'].map(d => <div key={d} style={{ padding:'8px 0', textAlign:'center', fontSize:11, color:'#999', fontWeight:600 }}>{d}</div>)}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
                    {cells.map((date, idx) => {
                      const daySessions = date ? sessionsForDate(date) : [];
                      const totalEnrolled = daySessions.reduce((sum,s) => sum + (s.enrolledCount||0), 0);
                      const isToday = date === today;
                      const isSelected = date === calendarSelectedDate;
                      return (
                        <div key={idx} onClick={() => date && daySessions.length > 0 && setCalendarSelectedDate(date)}
                          style={{
                            minHeight:74, borderRight:'0.5px solid #F5EFEF', borderBottom:'0.5px solid #F5EFEF',
                            padding:6, cursor: date && daySessions.length > 0 ? 'pointer' : 'default',
                            background: isSelected ? '#FBF0F0' : isToday ? '#FFFBF0' : '#fff',
                          }}>
                          {date && (
                            <>
                              <div style={{ fontSize:11, color: isToday ? '#8B1A1A' : '#999', fontWeight: isToday ? 700 : 400, marginBottom:4 }}>{dayjs(date).date()}</div>
                              {daySessions.length > 0 && (
                                <div style={{ fontSize:10, color:'#8B1A1A', background:'#FBF0F0', borderRadius:4, padding:'2px 4px', display:'inline-block' }}>
                                  {daySessions.length}堂 · {totalEnrolled}人
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {calendarSelectedDate ? (
                  <div>
                    <div style={{ fontSize:12, color:'#999', marginBottom:8 }}>{dayjs(calendarSelectedDate).format('MM月DD日')} 課程場次</div>
                    {sessionsForDate(calendarSelectedDate).sort((a,b) => a.startTime.localeCompare(b.startTime)).map(s => (
                      <div key={s.id} onClick={() => { setRosterSession(s); loadRoster(s.id); }}
                        style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, marginBottom:8, cursor:'pointer' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div>
                            <div style={{ fontWeight:600, fontSize:14 }}>{s.courseName}</div>
                            <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                              {s.startTime}～{s.endTime}{s.instructor ? ` · 👟 ${s.instructor}` : ''}
                              {s.isSubstitute && <span style={{ marginLeft:6, fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:5, background:'#FFF3E0', color:'#B26A00' }}>代班{s.originalInstructor?`（原 ${s.originalInstructor}）`:''}</span>}
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                            <Tag type="ok">報名 {s.registeredCount ?? s.enrolledCount ?? 0}</Tag>
                            <Tag type="blue">預計上課 {s.expectedCount ?? s.enrolledCount ?? 0}</Tag>
                            {(s.leaveCount||0) > 0 && <Tag type="gray">請假 {s.leaveCount}</Tag>}
                            {(s.makeupCount||0) > 0 && <Tag type="blue">補課 {s.makeupCount}</Tag>}
                            {(s.trialCount||0) > 0 && <Tag type="blue">試上 {s.trialCount}</Tag>}
                          </div>
                        </div>
                        <div style={{ marginTop:8, textAlign:'right', display:'flex', gap:6, justifyContent:'flex-end' }}>
                          {s.isSubstitute && (
                            <button onClick={e => { e.stopPropagation(); clearSubstitute(s); }}
                              style={{ height:26, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #999', color:'#666', fontSize:11, cursor:'pointer' }}>
                              取消代班
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); openSubstitute(s); }}
                            style={{ height:26, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #B26A00', color:'#B26A00', fontSize:11, cursor:'pointer' }}>
                            👟 {s.isSubstitute ? '更改代班' : '設定代班'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign:'center', padding:30, color:'#999', fontSize:12 }}>點選上方日期查看當天場次</div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* 月曆名單 Modal */}
      {/* 改課表重產：孤兒場次轉移確認 */}
      {orphanConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:210, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={() => !orphanBusy && setOrphanConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:20, width:460, maxWidth:'95vw', maxHeight:'82vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
            <div style={{ fontWeight:600, fontSize:15, marginBottom:6 }}>重新產生場次</div>
            <div style={{ fontSize:12, color:'#666', lineHeight:1.6, marginBottom:14 }}>
              以下 {orphanConfirm.orphans.length} 個場次已有學員、但不在新課表內。
              確認後將把報名轉移到「最接近的新場次」（同週優先），目標額滿者會保留在原日期。
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {orphanConfirm.orphans.map(o => (
                <div key={o.sessionId} style={{ background:'#FBF5F5', borderRadius:10, border:'0.5px solid #F0E0E0', padding:'10px 12px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>
                      {dayjs(o.date).format('MM/DD')}（{WEEKDAYS[dayjs(o.date).day()]}）{o.startTime}
                    </div>
                    <div style={{ fontSize:12, color: o.willTransfer ? '#2D7D46' : '#A32D2D', fontWeight:600 }}>
                      {o.willTransfer
                        ? `→ ${dayjs(o.targetDate).format('MM/DD')}（${WEEKDAYS[dayjs(o.targetDate).day()]}）`
                        : `保留原場次`}
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:'#999', marginTop:4 }}>
                    報名 {o.confirmedCount} 人
                    {o.waitlistCount > 0 && ` · 候補 ${o.waitlistCount}`}
                    {o.leaveCount > 0 && ` · 請假 ${o.leaveCount}`}
                    {o.members.length > 0 && `：${o.members.join('、')}`}
                  </div>
                  {!o.willTransfer && o.reason && (
                    <div style={{ fontSize:11, color:'#A32D2D', marginTop:2 }}>⚠️ {o.reason}</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => !orphanBusy && setOrphanConfirm(null)} disabled={orphanBusy}
                style={{ flex:1, height:44, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#666', fontSize:14, cursor: orphanBusy ? 'default' : 'pointer' }}>
                取消
              </button>
              <button onClick={() => runGenerateSessions(orphanConfirm.courseId)} disabled={orphanBusy}
                style={{ flex:2, height:44, borderRadius:10, border:'none', background:'#8B1A1A', color:'#fff', fontSize:14, fontWeight:600, cursor: orphanBusy ? 'default' : 'pointer', opacity: orphanBusy ? .6 : 1 }}>
                {orphanBusy ? '處理中…' : '確認轉移並產生場次'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rosterSession && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={() => setRosterSession(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:20, width:440, maxWidth:'95vw', maxHeight:'80vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:15 }}>{rosterSession.courseName}</div>
                <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{rosterSession.date} {rosterSession.startTime}～{rosterSession.endTime}</div>
              </div>
              <button onClick={() => setRosterSession(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
            </div>
            {rosterLoading ? (
              <div style={{ textAlign:'center', padding:30, color:'#999', fontSize:13 }}>載入中...</div>
            ) : (() => {
              const list = Array.isArray(roster) ? roster : (roster?.roster || []);
              const enrolled = list.filter(e => e.status === 'confirmed');
              const waitlist = list.filter(e => e.status === 'waitlist');
              const onLeave = list.filter(e => e.status === 'leave');
              if (list.length === 0) return <div style={{ textAlign:'center', padding:30, color:'#999', fontSize:13 }}>尚無學員報名</div>;
              return (
                <>
                  {enrolled.length > 0 && (
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, color:'#999', fontWeight:600, marginBottom:6 }}>正取（{enrolled.length}）</div>
                      {enrolled.map((e,i) => (
                        <div key={e.id||i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 10px', background:'#FBFBFB', borderRadius:6, marginBottom:4, fontSize:13 }}>
                          <span>{e.memberName}{e.isMakeup && <span style={{fontSize:10,color:'#185FA5',marginLeft:6}}>補課</span>}</span>
                          <span style={{ color:'#999', fontSize:12 }}>{e.memberPhone}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {waitlist.length > 0 && (
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, color:'#999', fontWeight:600, marginBottom:6 }}>候補（{waitlist.length}）</div>
                      {waitlist.map((e,i) => (
                        <div key={e.id||i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 10px', background:'#FBFBFB', borderRadius:6, marginBottom:4, fontSize:13 }}>
                          <span>{e.memberName}</span><span style={{ color:'#999', fontSize:12 }}>{e.memberPhone}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {onLeave.length > 0 && (
                    <div>
                      <div style={{ fontSize:11, color:'#999', fontWeight:600, marginBottom:6 }}>請假（{onLeave.length}）</div>
                      {onLeave.map((e,i) => (
                        <div key={e.id||i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 10px', background:'#FBFBFB', borderRadius:6, marginBottom:4, fontSize:13 }}>
                          <span>{e.memberName}</span><span style={{ color:'#999', fontSize:12 }}>{e.memberPhone}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── 場次管理 ── */}
      {tab === 'sessions' && (
        <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:16 }}>
          {/* 左：課程選擇 + 場次列表 */}
          <div>
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:12, marginBottom:12 }}>
              <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:10 }}>選擇課程</div>
              {courses.map(c => (
                <div key={c.id} onClick={() => { setSelectedCourse(c); setSelectedSession(null); setRoster(null); loadSessions(c); }}
                  style={{ padding:'8px 10px', borderRadius:8, marginBottom:4, cursor:'pointer', background: selectedCourse?.id===c.id ? '#F5E8E8' : 'none', color: selectedCourse?.id===c.id ? '#8B1A1A' : '#1a1a1a', fontSize:13, fontWeight: selectedCourse?.id===c.id ? 600 : 400 }}>
                  {c.name}
                </div>
              ))}
            </div>

            {selectedCourse && (
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                <div style={{ padding:'10px 14px', borderBottom:'0.5px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'#999', textTransform:'uppercase', letterSpacing:.5 }}>場次</span>
                  <span style={{ fontSize:11, color:'#999' }}>
                    共 {sessions.filter(s => s.courseId === selectedCourse.id && s.status !== 'cancelled').length} 堂
                  </span>
                </div>
                {sessions.filter(s => s.courseId === selectedCourse.id).length === 0 ? (
                  <div style={{ padding:20, textAlign:'center', color:'#999', fontSize:12 }}>尚無場次</div>
                ) : (() => {
                  const filtered = sessions.filter(s => s.courseId === selectedCourse.id).sort((a,b) => a.date.localeCompare(b.date));
                  // 按月分組
                  const byMonth = {};
                  filtered.forEach(s => {
                    const m = dayjs(s.date).format('YYYY-MM');
                    if (!byMonth[m]) byMonth[m] = [];
                    byMonth[m].push(s);
                  });
                  return Object.entries(byMonth).map(([month, monthSessions]) => (
                    <div key={month}>
                      <div style={{ padding:'6px 14px', background:'#FBF5F5', fontSize:11, color:'#999', fontWeight:600 }}>
                        {dayjs(month).format('YYYY年M月')}（{monthSessions.filter(s=>s.status!=='cancelled').length} 堂）
                      </div>
                      {monthSessions.map(s => (
                        <div key={s.id} onClick={() => { setSelectedSession(s); loadRoster(s.id); }}
                          style={{ padding:'8px 14px', borderBottom:'0.5px solid #F5EFEF', cursor:'pointer', background: selectedSession?.id===s.id ? '#F5E8E8' : 'none', display:'flex', justifyContent:'space-between', alignItems:'center', opacity: s.status==='cancelled' ? 0.5 : 1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:6, height:6, borderRadius:3, background: s.status==='cancelled'?'#ccc': selectedSession?.id===s.id?'#8B1A1A':'#2D7D46', flexShrink:0 }}/>
                            <div>
                              <span style={{ fontSize:13, fontWeight:500, color: selectedSession?.id===s.id?'#8B1A1A':'#1a1a1a' }}>
                                {dayjs(s.date).format('MM/DD')}（{WEEKDAYS[dayjs(s.date).day()]}）
                              </span>
                              {s.status==='cancelled' && <span style={{ fontSize:10, color:'#A32D2D', marginLeft:6 }}>已取消</span>}
                            </div>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ fontSize:11, color: (s.enrolledCount||0) >= selectedCourse.maxStudents ? '#A32D2D' : '#999' }}>
                              {s.enrolledCount||0}/{selectedCourse.maxStudents}
                            </span>
                            {s.status !== 'cancelled' && (
                              <button onClick={e => { e.stopPropagation(); openEditSession(s); }}
                                style={{ fontSize:10, color:'#666', background:'none', border:'0.5px solid #E8D5D5', borderRadius:4, padding:'1px 5px', cursor:'pointer' }}>
                                編輯
                              </button>
                            )}
                            {s.status !== 'cancelled' && (
                              <button onClick={e => { e.stopPropagation(); handleCancelSession(s.id); }}
                                style={{ fontSize:10, color:'#A32D2D', background:'none', border:'0.5px solid #A32D2D', borderRadius:4, padding:'1px 5px', cursor:'pointer' }}>
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* 右：場次詳情 + 名單 */}
          <div>
            {!selectedSession ? (
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:40, textAlign:'center', color:'#999', fontSize:13 }}>
                選擇左側場次查看名單
              </div>
            ) : (
              <>
                {/* 場次資訊 */}
                <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:16 }}>
                        {selectedCourse?.name} — {dayjs(selectedSession.date).format('MM/DD')}（{WEEKDAYS[dayjs(selectedSession.date).day()]}）
                      </div>
                      <div style={{ fontSize:13, color:'#999', marginTop:4 }}>
                        {selectedSession.startTime}～{selectedSession.endTime}
                        {selectedSession.instructor && ` · 講師：${selectedSession.instructor}`}
                      </div>
                    </div>
                    <button onClick={() => setShowEnroll(true)}
                      style={{ height:34, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>
                      ＋ 報名
                    </button>
                  </div>
                </div>

                {/* 學員名單 */}
                <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                  {(() => {
                    const rosterList = Array.isArray(roster) ? roster : (roster?.roster || []);
                    const enrolled = rosterList.filter(e => e.status === 'confirmed');
                    const waitlist = rosterList.filter(e => e.status === 'waitlist');
                    const onLeave = rosterList.filter(e => e.status === 'leave');
                    const makeupCount = enrolled.filter(e => e.isMakeup).length;
                    return (
                      <>
                        <div style={{ padding:'12px 16px', borderBottom:'0.5px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                          <span style={{ fontWeight:600, fontSize:13 }}>學員名單</span>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <span style={{ fontSize:12, color:'#999' }}>
                              正取 {enrolled.length} / {selectedCourse?.maxStudents} · 候補 {waitlist.length} · 請假 {onLeave.length}{makeupCount > 0 ? ` · 補課 ${makeupCount}` : ''}
                            </span>
                            <button onClick={() => downloadAttendanceCSV(selectedCourse?.id, selectedCourse?.name)}
                              style={{ height:28, padding:'0 12px', borderRadius:6, background:'#fff', border:'0.5px solid #185FA5', color:'#185FA5', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
                              ⬇ 下載出缺席
                            </button>
                          </div>
                        </div>

                        {/* 正取 */}
                        {enrolled.map((e, i) => (
                          <div key={e.id || i} style={{ padding:'12px 16px', borderBottom:'0.5px solid #F5EFEF', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <div>
                              <div style={{ fontWeight:500, fontSize:13 }}>
                                {e.memberName}
                                {e.isMakeup && <span style={{ fontSize:10, color:'#185FA5', marginLeft:6, fontWeight:600 }}>補課</span>}
                              </div>
                              <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                                {e.memberPhone}
                                {e.paymentStatus === 'pending' && <span style={{ color:'#854F0B', marginLeft:6 }}>待付款</span>}
                              </div>
                            </div>
                            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                              {[['present','出席','#2D7D46'],['late','遲到','#B5762B'],['absent','缺席','#A32D2D']].map(([st,label,color]) => {
                                const active = e.attendanceStatus === st;
                                return (
                                  <button key={st} onClick={() => handleMarkAttendance(selectedSession.id, e.memberId, st)}
                                    disabled={selectedSession?.status === 'cancelled'}
                                    style={{ height:26, padding:'0 10px', borderRadius:6, fontSize:11, cursor: selectedSession?.status==='cancelled'?'default':'pointer',
                                      border:`1px solid ${active?color:'#E8D5D5'}`, background: active?color:'#fff', color: active?'#fff':'#999', fontWeight: active?600:400 }}>
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        {/* 候補 */}
                        {waitlist.length > 0 && (
                          <>
                            <div style={{ padding:'8px 16px', background:'#FBF5F5', fontSize:11, color:'#999', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 }}>
                              候補名單
                            </div>
                            {waitlist.map((e, i) => (
                              <div key={e.id || i} style={{ padding:'12px 16px', borderBottom:'0.5px solid #F5EFEF', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                <div>
                                  <div style={{ fontWeight:500, fontSize:13 }}>{e.memberName}</div>
                                  <div style={{ fontSize:11, color:'#999' }}>{e.memberPhone} · 候補第 {i+1} 位</div>
                                </div>
                                <Tag type="warn">候補</Tag>
                              </div>
                            ))}
                          </>
                        )}

                        {/* 請假 */}
                        {onLeave.length > 0 && (
                          <>
                            <div style={{ padding:'8px 16px', background:'#FBF5F5', fontSize:11, color:'#999', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 }}>
                              請假名單
                            </div>
                            {onLeave.map((e, i) => (
                              <div key={e.id || i} style={{ padding:'12px 16px', borderBottom:'0.5px solid #F5EFEF', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                <div>
                                  <div style={{ fontWeight:500, fontSize:13 }}>{e.memberName}</div>
                                  <div style={{ fontSize:11, color:'#999' }}>{e.memberPhone}{e.leaveReason ? ` · ${e.leaveReason}` : ''}</div>
                                </div>
                                <Tag type="gray">請假</Tag>
                              </div>
                            ))}
                          </>
                        )}

                        {enrolled.length === 0 && waitlist.length === 0 && onLeave.length === 0 && (
                          <div style={{ padding:32, textAlign:'center', color:'#999', fontSize:13 }}>尚無學員報名</div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 類別管理 tab ── */}
      {tab === 'categories' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button onClick={() => setShowAddCategory(true)}
              style={{ height:36, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
              ＋ 新增類別
            </button>
          </div>
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
            {categories.filter(c => c.isActive).length === 0 ? (
              <div style={{ padding:32, textAlign:'center', color:'#999', fontSize:13 }}>尚無類別，點右上角新增</div>
            ) : categories.filter(c => c.isActive).map(c => (
              <div key={c.id} style={{ padding:'14px 16px', borderBottom:'0.5px solid #F5EFEF', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:12, height:12, borderRadius:6, background: c.color || '#8B1A1A' }}/>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{c.name}</div>
                    {c.description && <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{c.description}</div>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => { setEditingCategory(c); setCategoryForm({ name:c.name, description:c.description||'', color:c.color||'#8B1A1A' }); }}
                    style={{ height:28, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', fontSize:11, cursor:'pointer' }}>
                    編輯
                  </button>
                  <button onClick={() => handleDeleteCategory(c.id, c.name)}
                    style={{ height:28, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:11, cursor:'pointer' }}>
                    停用
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showAddCategory && (
            <Modal title="新增課程類別" onClose={() => setShowAddCategory(false)}>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>類別名稱</label>
                <input value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name:e.target.value})}
                  placeholder="如：初級、進階、工作坊"
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>說明（選填）</label>
                <input value={categoryForm.description} onChange={e => setCategoryForm({...categoryForm, description:e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>顏色</label>
                <div style={{ display:'flex', gap:8 }}>
                  {['#8B1A1A','#185FA5','#2D7D46','#854F0B','#533AB7','#0F6E56'].map(c => (
                    <div key={c} onClick={() => setCategoryForm({...categoryForm, color:c})}
                      style={{ width:32, height:32, borderRadius:16, background:c, cursor:'pointer', border: categoryForm.color===c ? '3px solid #1a1a1a' : 'none' }}/>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setShowAddCategory(false)}
                  style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
                <button onClick={handleCreateCategory}
                  style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>建立類別</button>
              </div>
            </Modal>
          )}

          {editingCategory && (
            <Modal title={`編輯類別 — ${editingCategory.name}`} onClose={() => setEditingCategory(null)}>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>類別名稱</label>
                <input value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name:e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>說明（選填）</label>
                <input value={categoryForm.description} onChange={e => setCategoryForm({...categoryForm, description:e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>顏色</label>
                <div style={{ display:'flex', gap:8 }}>
                  {['#8B1A1A','#185FA5','#2D7D46','#854F0B','#533AB7','#0F6E56'].map(c => (
                    <div key={c} onClick={() => setCategoryForm({...categoryForm, color:c})}
                      style={{ width:32, height:32, borderRadius:16, background:c, cursor:'pointer', border: categoryForm.color===c ? '3px solid #1a1a1a' : 'none' }}/>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setEditingCategory(null)}
                  style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
                <button onClick={handleUpdateCategory}
                  style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>儲存變更</button>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ── 新增課程 Modal ── */}
      {showAddCourse && (
        <Modal title="新增課程" onClose={() => setShowAddCourse(false)} width={560}>
          {courses.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>複製現有課程（選填）</label>
              <select value={copyFrom} onChange={e => {
                setCopyFrom(e.target.value);
                if (e.target.value) {
                  const src = courses.find(c => c.id === e.target.value);
                  if (src) setCourseForm({
                    name: src.name + '（複製）',
                    description: src.description || '',
                    price: src.price || '',
                    maxStudents: src.maxStudents || 10,
                    type: src.type || 'weekly',
                    totalSessions: src.totalSessions || '',
                    gymAccessDays: src.gymAccessDaysAfter || 1,
                    leaveDeadlineHours: src.leaveDeadlineHours || 2,
                    maxLeaves: src.maxLeaves || 2,
                    allowMakeup: src.allowMakeup !== false,
                    makeupDeadlineDays: src.makeupDeadlineDays || 60,
                    midpointSurcharge: src.midpointSurcharge || 1.05,
                  });
                }
              }}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                <option value="">不複製，從頭建立</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { label:'課程名稱', key:'name', type:'text', colSpan:2 },
              { label:'課程說明', key:'description', type:'text', colSpan:2 },
              { label:'費用（NT$）', key:'price', type:'number' },
              { label:'最多人數', key:'maxStudents', type:'number' },
              { label:'入館有效天數', key:'gymAccessDays', type:'number' },
              { label:'請假截止（小時前）', key:'leaveDeadlineHours', type:'number' },
              { label:'整期可請假/補課次數', key:'maxLeaves', type:'number', hint:'此為整期學員共用；插班學員請於該課程「查看名單」個別設定' },
              { label:'補課期限（天）', key:'makeupDeadlineDays', type:'number' },
              { label:'課程開始日期', key:'startDate', type:'date' },
              { label:'課程結束日期', key:'endDate', type:'date' },
              { label:'上課開始時間', key:'startTime', type:'time' },
              { label:'上課結束時間', key:'endTime', type:'time' },
              { label:'教練', key:'instructor', type:'text', colSpan:2 },
              { label:'插班加成（低於一半堂數）', key:'midpointSurcharge', type:'number' },
              { label:'退費-開課後每堂扣除金額（NT$）', key:'perSessionDeduction', type:'number' },
              { label:'退費-開課前手續費率（%）', key:'handlingFeeRate', type:'number' },
            ].map(f => (
              <div key={f.key} style={{ gridColumn: f.colSpan===2 ? '1/-1' : 'auto' }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                <input type={f.type} value={courseForm[f.key]}
                  onChange={e => setCourseForm({...courseForm, [f.key]: e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                {f.hint && <div style={{ fontSize:10, color:'#999', marginTop:4, lineHeight:1.4 }}>{f.hint}</div>}
              </div>
            ))}
            <div>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>課程類別</label>
              <select value={courseForm.categoryId || ''} onChange={e => setCourseForm({...courseForm, categoryId:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                <option value="">不分類</option>
                {categories.filter(c => c.isActive).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {isSuperAdmin && (
              <div>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>館別</label>
                <select value={courseForm.gymId || effectiveGymId || ''} onChange={e => setCourseForm({...courseForm, gymId: e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                  <option value="">請選擇館別</option>
                  {GYMS.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>課程類型</label>
              <select value={courseForm.type} onChange={e => setCourseForm({...courseForm, type:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                <option value="weekly">固定週課</option>
                <option value="workshop">單次工作坊</option>
              </select>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:20 }}>
              <input type="checkbox" id="allowMakeup" checked={courseForm.allowMakeup}
                onChange={e => setCourseForm({...courseForm, allowMakeup:e.target.checked})}/>
              <label htmlFor="allowMakeup" style={{ fontSize:13, cursor:'pointer' }}>開放補課</label>
            </div>
            {courseForm.type === 'weekly' && (
              <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:20 }}>
                <input type="checkbox" id="allowTrial" checked={courseForm.allowTrial}
                  onChange={e => setCourseForm({...courseForm, allowTrial:e.target.checked})}/>
                <label htmlFor="allowTrial" style={{ fontSize:13, cursor:'pointer' }}>開放試上</label>
              </div>
            )}
            {courseForm.type === 'weekly' && courseForm.allowTrial && (
              <div>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>試上費用（另收）</label>
                <input type="number" min={0} value={courseForm.trialPrice}
                  onChange={e => setCourseForm({...courseForm, trialPrice:e.target.value})}
                  placeholder="0"
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}/>
              </div>
            )}
            {courseForm.type === 'weekly' && (
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:8 }}>上課星期（可複選）</label>
                <div style={{ display:'flex', gap:8 }}>
                  {['日','一','二','三','四','五','六'].map((d, i) => (
                    <button key={i} type="button"
                      onClick={() => {
                        const w = courseForm.weekdays?.includes(i)
                          ? courseForm.weekdays?.filter(x => x !== i)
                          : [...(courseForm.weekdays || []), i];
                        setCourseForm({...courseForm, weekdays: w});
                      }}
                      style={{ width:40, height:40, borderRadius:20, border:`0.5px solid ${courseForm.weekdays?.includes(i)?'#8B1A1A':'#E8D5D5'}`, background: courseForm.weekdays?.includes(i)?'#8B1A1A':'#fff', color: courseForm.weekdays?.includes(i)?'#fff':'#666', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ marginTop:16 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6 }}>分期付款規則</label>
            <InstallmentRuleEditor value={courseForm.installment} price={courseForm.price}
              onChange={v => setCourseForm({...courseForm, installment: v})} />
          </div>
          <div style={{ display:'flex', gap:8, marginTop:20 }}>
            <button onClick={() => setShowAddCourse(false)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleCreateCourse} disabled={loading}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {loading ? '建立中...' : '建立課程'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── 新增場次 Modal ── */}
      {showAddSession && selectedCourse && (
        <Modal title={`新增場次 — ${selectedCourse.name}`} onClose={() => setShowAddSession(false)}>
          {[
            { label:'日期', key:'date', type:'date' },
            { label:'開始時間', key:'startTime', type:'time' },
            { label:'結束時間', key:'endTime', type:'time' },
            { label:'講師', key:'instructor', type:'text' },
            { label:'備註', key:'notes', type:'text' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
              <input type={f.type} value={sessionForm[f.key]}
                onChange={e => setSessionForm({...sessionForm, [f.key]:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
          ))}
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={() => setShowAddSession(false)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleCreateSession} disabled={loading}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {loading ? '建立中...' : '建立場次'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── 編輯場次 Modal ── */}
      {editingSession && (
        <Modal title={`編輯場次 — ${dayjs(editingSession.date).format('MM/DD')}`} onClose={() => setEditingSession(null)}>
          {[
            { label:'日期', key:'date', type:'date' },
            { label:'開始時間', key:'startTime', type:'time' },
            { label:'結束時間', key:'endTime', type:'time' },
            { label:'講師', key:'instructor', type:'text' },
            { label:'備註', key:'notes', type:'text' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
              <input type={f.type} value={sessionForm[f.key]}
                onChange={e => setSessionForm({...sessionForm, [f.key]:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
          ))}
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={() => setEditingSession(null)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleSaveEditSession}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              儲存變更
            </button>
          </div>
        </Modal>
      )}

      {/* ── 代班教練 Modal ── */}
      {subSession && (
        <Modal title={`設定代班教練 — ${dayjs(subSession.date).format('MM/DD')}`} onClose={() => setSubSession(null)}>
          <div style={{ fontSize:12, color:'#666', marginBottom:12 }}>
            {subSession.courseName} · {subSession.startTime}～{subSession.endTime}
            {subSession.originalInstructor || subSession.instructor ? <div style={{ marginTop:4 }}>原教練：{subSession.originalInstructor || subSession.instructor}</div> : null}
          </div>
          <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>代班教練</label>
          <CoachSelect gymId={subSession.gymId || effectiveGymId} value={subCoach} onChange={setSubCoach}
            style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
          <label style={{ fontSize:11, color:'#666', display:'block', margin:'12px 0 5px' }}>代班原因（選填）</label>
          <input value={subReason} onChange={e => setSubReason(e.target.value)} placeholder="例：原教練請假"
            style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
          <div style={{ fontSize:11, color:'#999', margin:'8px 0 4px' }}>儲存後：員工／會員課程月曆自動顯示代班教練，並發送待辦提醒給代班教練與館管理員。</div>
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={() => setSubSession(null)} disabled={subSaving}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={saveSubstitute} disabled={subSaving}
              style={{ flex:2, height:40, borderRadius:9, background:subSaving?'#C9A24A':'#B26A00', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {subSaving ? '儲存中…' : '儲存代班'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── 報名 Modal ── */}
      {showEnroll && selectedSession && (
        <Modal title={`報名 — ${selectedCourse?.name} ${dayjs(selectedSession.date).format('MM/DD')}`} onClose={() => setShowEnroll(false)}>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>搜尋會員</label>
            <input value={enrollQuery} onChange={e => searchEnrollMember(e.target.value)}
              placeholder="輸入姓名或手機..."
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            {enrollResults.length > 0 && !enrollMember && (
              <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, marginTop:4, overflow:'hidden' }}>
                {enrollResults.slice(0,5).map(m => (
                  <div key={m.id} onClick={() => { setEnrollMember(m); setEnrollQuery(m.name); setEnrollResults([]); }}
                    style={{ padding:'10px 14px', cursor:'pointer', fontSize:13, borderBottom:'0.5px solid #F5EFEF', display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontWeight:500 }}>{m.name}</span>
                    <span style={{ color:'#999' }}>{m.phone}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {enrollMember && (
            <div style={{ background:'#E6F4EB', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:13, display:'flex', justifyContent:'space-between' }}>
              <span>已選：<strong>{enrollMember.name}</strong>（{enrollMember.phone}）</span>
              <span onClick={() => { setEnrollMember(null); setEnrollQuery(''); }} style={{ cursor:'pointer', color:'#999' }}>×</span>
            </div>
          )}

          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>付款方式</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {PAYMENT_METHODS.map(pm => (
                <button key={pm.key} onClick={() => setEnrollPayment(pm.key)}
                  style={{ height:34, padding:'0 14px', borderRadius:8, border:`0.5px solid ${enrollPayment===pm.key?'#8B1A1A':'#E8D5D5'}`, background: enrollPayment===pm.key?'#8B1A1A':'#fff', color: enrollPayment===pm.key?'#fff':'#666', fontSize:12, cursor:'pointer' }}>
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background:'#FBF5F5', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13 }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ color:'#666' }}>課程費用</span>
              <span style={{ fontWeight:700, color:'#8B1A1A' }}>NT${(selectedCourse?.price||0).toLocaleString()}</span>
            </div>
          </div>

          <PaymentPlanChoice installment={selectedCourse?.installment} price={selectedCourse?.price}
            plan={enrollPaymentPlan} paymentMethod={enrollPayment}
            onChange={({ plan, paymentMethod }) => { setEnrollPaymentPlan(plan); if (paymentMethod) setEnrollPayment(paymentMethod); }} />

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowEnroll(false)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleEnroll} disabled={!enrollMember || loading}
              style={{ flex:2, height:40, borderRadius:9, background: enrollMember?'#8B1A1A':'#ccc', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: enrollMember?'pointer':'not-allowed' }}>
              {loading ? '報名中...' : '確認報名'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── 編輯課程 Modal ── */}
      {editingCourse && (
        <Modal title={`編輯課程 — ${editingCourse.name}`} onClose={() => setEditingCourse(null)} width={560}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { label:'課程名稱', key:'name', type:'text', colSpan:2 },
              { label:'課程說明', key:'description', type:'text', colSpan:2 },
              { label:'費用（NT$）', key:'price', type:'number' },
              { label:'最多人數', key:'maxStudents', type:'number' },
              { label:'課程開始日期', key:'startDate', type:'date' },
              { label:'課程結束日期', key:'endDate', type:'date' },
              { label:'上課開始時間', key:'startTime', type:'time' },
              { label:'上課結束時間', key:'endTime', type:'time' },
              { label:'教練', key:'instructor', type:'text', colSpan:2 },
              { label:'插班加成', key:'midpointSurcharge', type:'number' },
              { label:'請假截止（小時前）', key:'leaveDeadlineHours', type:'number' },
              { label:'整期可請假/補課次數', key:'maxLeaves', type:'number', hint:'此為整期學員共用；插班學員請於該課程「查看名單」個別設定' },
              { label:'補課期限（天）', key:'makeupDeadlineDays', type:'number' },
              { label:'退費-開課後每堂扣除金額（NT$）', key:'perSessionDeduction', type:'number' },
              { label:'退費-開課前手續費率（%）', key:'handlingFeeRate', type:'number' },
            ].map(f => (
              <div key={f.key} style={{ gridColumn: f.colSpan===2 ? '1/-1' : 'auto' }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                <input type={f.type} value={editForm[f.key] || ''}
                  onChange={e => setEditForm({...editForm, [f.key]: e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                {f.hint && <div style={{ fontSize:10, color:'#999', marginTop:4, lineHeight:1.4 }}>{f.hint}</div>}
              </div>
            ))}
            {/* 課程海報（單張，上傳存 Storage，會員卡片＋詳情顯示）*/}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>課程海報（會員端顯示）</label>
              {editForm.imageUrl && (
                <img src={editForm.imageUrl} alt="海報" style={{ width:'100%', maxHeight:200, objectFit:'contain', borderRadius:8, border:'0.5px solid #E8D5D5', marginBottom:8, background:'#FBF5F5' }}/>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <label style={{ fontSize:12, color:'#8B1A1A', border:'1px solid #8B1A1A', borderRadius:8, padding:'7px 14px', cursor: imgUploading?'default':'pointer', opacity: imgUploading?0.5:1 }}>
                  {imgUploading ? '上傳中…' : (editForm.imageUrl ? '更換海報' : '上傳海報')}
                  <input type="file" accept="image/*" disabled={imgUploading} style={{ display:'none' }}
                    onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      setImgUploading(true);
                      try {
                        const fd = new FormData(); fd.append('file', file);
                        const r = await client.post(`/courses/${editingCourse.id}/image`, fd, { headers:{ 'Content-Type':'multipart/form-data' } });
                        setEditForm(prev => ({ ...prev, imageUrl: r.data.imageUrl }));
                        setEditingCourse(prev => ({ ...prev, imageUrl: r.data.imageUrl }));
                        showMsg('海報已上傳');
                      } catch (err) {
                        showMsg(err.response?.data?.message || '上傳失敗', 'red');
                      } finally { setImgUploading(false); e.target.value = ''; }
                    }}/>
                </label>
                {editForm.imageUrl && !imgUploading && (
                  <button type="button" onClick={() => setEditForm(prev => ({ ...prev, imageUrl:'' }))}
                    style={{ fontSize:12, color:'#999', background:'none', border:'none', cursor:'pointer' }}>移除（儲存後生效）</button>
                )}
              </div>
              <div style={{ fontSize:10, color:'#999', marginTop:4 }}>上傳後即存檔生效；「移除」需按下方「儲存」才寫入。</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:20 }}>
              <input type="checkbox" id="editAllowMakeup" checked={editForm.allowMakeup !== false}
                onChange={e => setEditForm({...editForm, allowMakeup:e.target.checked})}/>
              <label htmlFor="editAllowMakeup" style={{ fontSize:13, cursor:'pointer' }}>開放補課</label>
            </div>
            {(editForm.type || editingCourse?.type) === 'weekly' && (
              <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:20 }}>
                <input type="checkbox" id="editAllowTrial" checked={editForm.allowTrial === true}
                  onChange={e => setEditForm({...editForm, allowTrial:e.target.checked})}/>
                <label htmlFor="editAllowTrial" style={{ fontSize:13, cursor:'pointer' }}>開放試上</label>
              </div>
            )}
            {(editForm.type || editingCourse?.type) === 'weekly' && editForm.allowTrial && (
              <div>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>試上費用（另收）</label>
                <input type="number" min={0} value={editForm.trialPrice || ''}
                  onChange={e => setEditForm({...editForm, trialPrice:e.target.value})} placeholder="0"
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>
            )}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:8 }}>上課星期（可複選）</label>
              <div style={{ display:'flex', gap:8 }}>
                {['日','一','二','三','四','五','六'].map((d, i) => (
                  <button key={i} type="button"
                    onClick={() => {
                      const w = (editForm.weekdays || []).includes(i)
                        ? (editForm.weekdays || []).filter(x => x !== i)
                        : [...(editForm.weekdays || []), i];
                      setEditForm({...editForm, weekdays: w});
                    }}
                    style={{ width:40, height:40, borderRadius:20, border:`0.5px solid ${(editForm.weekdays || []).includes(i)?'#8B1A1A':'#E8D5D5'}`, background: (editForm.weekdays || []).includes(i)?'#8B1A1A':'#fff', color: (editForm.weekdays || []).includes(i)?'#fff':'#666', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ gridColumn:'1/-1', background:'#FFFBF0', border:'0.5px solid #F0D9A8', borderRadius:8, padding:12, marginTop:4 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <label style={{ fontSize:12, color:'#854F0B', fontWeight:600 }}>無限練習期間</label>
                <button type="button" onClick={() => setEditForm({...editForm, unlimitedPracticeStart: editForm.startDate, unlimitedPracticeEnd: editForm.endDate})}
                  style={{ fontSize:11, color:'#185FA5', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                  套用課程日期
                </button>
              </div>
              <div style={{ fontSize:11, color:'#999', marginBottom:10, lineHeight:1.6 }}>
                此區間內，已報名此課程的會員入場時會自動視為「課程學員」身份，不限上課當天。可獨立於課程日期手動調整。
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>開始日期</label>
                  <input type="date" value={editForm.unlimitedPracticeStart || ''}
                    onChange={e => setEditForm({...editForm, unlimitedPracticeStart: e.target.value})}
                    style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#fff', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>結束日期</label>
                  <input type="date" value={editForm.unlimitedPracticeEnd || ''}
                    onChange={e => setEditForm({...editForm, unlimitedPracticeEnd: e.target.value})}
                    style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#fff', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop:16 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6 }}>分期付款規則</label>
            <InstallmentRuleEditor value={editForm.installment} price={editForm.price}
              onChange={v => setEditForm({...editForm, installment: v})} />
          </div>
          <div style={{ display:'flex', gap:8, marginTop:20 }}>
            <button onClick={() => setEditingCourse(null)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleUpdateCourse} disabled={loading}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {loading ? '更新中...' : '儲存變更'}
            </button>
          </div>
        </Modal>
      )}

      {/* 課程名單 Modal */}
      {rosterModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => setRosterModal(null)}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:560, maxHeight:'80vh', overflow:'hidden', display:'flex', flexDirection:'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:600 }}>{rosterModal.course?.name} — 報名名單</div>
                <div style={{ fontSize:12, color:'#999', marginTop:2 }}>
                  {rosterModal.enrollments ? `共 ${rosterModal.enrollments.length} 人` : '載入中...'}
                </div>
              </div>
              <button onClick={() => setRosterModal(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {rosterLoading && <div style={{ textAlign:'center', padding:40, color:'#999' }}>載入中...</div>}
              {!rosterLoading && rosterModal.enrollments?.length === 0 && (
                <div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}>目前沒有報名學員</div>
              )}
              {!rosterLoading && rosterModal.enrollments?.length > 0 && (() => {
                const courseMax = rosterModal.course?.maxLeaves ?? 2;
                const byMember = {};
                rosterModal.enrollments.forEach(e => {
                  const m = byMember[e.memberId] || (byMember[e.memberId] = { memberId:e.memberId, memberName:e.memberName, memberPhone:e.memberPhone, paymentMethod:e.paymentMethod, bankLastFive:e.bankLastFive, count:0, leaveUsed:0, override:null });
                  m.count++;
                  if (e.status==='leave') m.leaveUsed++;
                  if (e.maxLeavesAllowed != null) m.override = e.maxLeavesAllowed;
                });
                const members = Object.values(byMember);
                return (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#FBF5F5' }}>
                      <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#666' }}>學員</th>
                      <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#666' }}>電話</th>
                      <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#666' }}>報名堂數</th>
                      <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#666' }}>付款方式</th>
                      <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#666' }}>可請假（已用/上限）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m, i) => {
                      const limit = m.override ?? courseMax;
                      const isEditing = editLeave?.memberId === m.memberId;
                      return (
                      <tr key={i} style={{ borderTop:'0.5px solid #F5EFEF' }}>
                        <td style={{ padding:'10px 12px', fontWeight:500 }}>{m.memberName}</td>
                        <td style={{ padding:'10px 12px', color:'#666', fontFamily:'monospace', fontSize:12 }}>{m.memberPhone}</td>
                        <td style={{ padding:'10px 12px', color:'#666' }}>{m.count} 堂</td>
                        <td style={{ padding:'10px 12px', color:'#666', fontSize:12 }}>
                          {m.paymentMethod === 'transfer' ? `轉帳${m.bankLastFive ? ` (末五碼 ${m.bankLastFive})` : ''}` : m.paymentMethod || '—'}
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          {isEditing ? (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                              <input type="number" min="0" autoFocus value={editLeave.value}
                                onChange={ev => setEditLeave({ memberId:m.memberId, value:ev.target.value })}
                                placeholder={`預設 ${courseMax}`}
                                style={{ width:64, height:30, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:13 }} />
                              <button disabled={savingLeave} onClick={()=>saveLeaveAllowance(rosterModal.course.id, m.memberId, editLeave.value)}
                                style={{ height:30, padding:'0 10px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>儲存</button>
                              <button disabled={savingLeave} onClick={()=>saveLeaveAllowance(rosterModal.course.id, m.memberId, '')}
                                style={{ height:30, padding:'0 8px', borderRadius:6, background:'#fff', color:'#999', border:'0.5px solid #E8D5D5', fontSize:11, cursor:'pointer' }}>清除</button>
                              <button onClick={()=>setEditLeave(null)} style={{ background:'none', border:'none', color:'#999', cursor:'pointer' }}>✕</button>
                            </span>
                          ) : (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                              <span style={{ color: m.leaveUsed>=limit?'#A32D2D':'#1a1a1a' }}>請假 {m.leaveUsed}/{limit}</span>
                              {m.override != null && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:5, background:'#FAEEDA', color:'#854F0B' }}>插班</span>}
                              <button onClick={()=>setEditLeave({ memberId:m.memberId, value: m.override ?? '' })}
                                style={{ height:26, padding:'0 8px', borderRadius:6, background:'#fff', border:'0.5px solid #8B1A1A', color:'#8B1A1A', fontSize:11, cursor:'pointer' }}>✏️ 填寫</button>
                            </span>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
