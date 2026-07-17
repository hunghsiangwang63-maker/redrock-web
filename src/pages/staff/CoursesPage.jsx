import { useState, useEffect } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../api/courseCategories';
import { getCourses, createCourse, getSessions, createSession,
         getSessionRoster, enrollCourse, markAttendance,
         generateWeeklySessions, updateSession, setSessionSubstitute, clearSessionSubstitute, deleteCourse, permanentDeleteCourse } from '../../api/courses';
import { searchMembers } from '../../api/members';
import client from '../../api/client';
import { useAuth } from '../../store/authStore';
import { useEnabledPayments, filterPayments } from '../../utils/paymentMethods';
import CoachSelect from '../../components/CoachSelect';
import { gymPrefix } from '../../utils/gymLabel';
import { courseColor } from '../../utils/courseColor';
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
  const enabledPay = useEnabledPayments();
  const { staff, activeGymId, viewGym } = useAuth();
  const isSuperAdmin = staff?.role === 'super_admin';
  // super_admin 走頂部「檢視場館」選單 viewGym（全館＝''）；一般員工用自己館別
  const effectiveGymId = activeGymId || staff?.gymId || (isSuperAdmin ? (viewGym || '') : '');
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
  const EMPTY_CAT_FORM = {
    name: '', group: 'adult', description: '', color: '#8B1A1A', makeupTypeIds: [],
    allowTrial: false, trialPrice: '', leaveDeadlineHours: 2, maxLeaves: 2,
    allowMakeup: true, makeupDeadlineDays: 60, perSessionDeduction: 850, handlingFeeRate: 5,
  };
  const [categoryForm, setCategoryForm] = useState(EMPTY_CAT_FORM);
  const [catImageFile, setCatImageFile] = useState(null);      // 班別廣告照片（建立/編輯後上傳）
  const [makeupTypes, setMakeupTypes] = useState([]);           // 補課類型（named 實體；班別多選掛類型、同類型可互補）
  const [newTypeName, setNewTypeName] = useState('');
  const GROUP_LABEL = { adult: '成人班', youth: '青少年兒童班', special: '專班課程', workshop: '工作坊' };
  const GROUP_ORDER = ['adult', 'youth', 'special', 'workshop'];
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
  const [selectedCategory, setSelectedCategory] = useState(null); // 課程列表兩層：先類別總頁、再各梯次
  const [selectedSession, setSelectedSession] = useState(null);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');
  // 改課表重產：孤兒場次確認 Modal { courseId, orphans, willCreate, willDelete }
  const [orphanConfirm, setOrphanConfirm] = useState(null);
  const [orphanBusy, setOrphanBusy] = useState(false);

  // 加開梯次（兩步：1 選班別/類型/館別＋梯次名稱 → 2 梯次資料＋覆寫規則）
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [createImageFile, setCreateImageFile] = useState(null); // 新增課程時選的海報，建立後上傳
  const [editingCourse, setEditingCourse] = useState(null);
  const [imgUploading, setImgUploading] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [copyFrom, setCopyFrom] = useState('');
  const EMPTY_COURSE_FORM = {
    cohortName: '', name: '', price: '', maxStudents: 6, maxWaitlist: 2, reservedSlots: '', categoryId: '',
    type: 'weekly', totalSessions: '', startDate: '', endDate: '',
    startTime: '', endTime: '', instructor: '',
    gymAccessDays: 1, midpointSurcharge: 1.05,
    // 覆寫班別規則（空字串＝用班別預設；overrideRules 展開才送）
    leaveDeadlineHours: '', maxLeaves: '', allowMakeup: '', makeupDeadlineDays: '',
    allowTrial: '', trialPrice: '', perSessionDeduction: '', handlingFeeRate: '',
    unlimitedPracticeStart: '', unlimitedPracticeEnd: '',
    installment: { enabled: false, periods: [] },
  };
  const [courseForm, setCourseForm] = useState(EMPTY_COURSE_FORM);
  const [showOverrideRules, setShowOverrideRules] = useState(false);

  // 新增場次
  const [showAddSession, setShowAddSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    date: dayjs().format('YYYY-MM-DD'),
    startTime: '', endTime: '', instructor: '', notes: '',
  });

  const [addSessionStudents, setAddSessionStudents] = useState([]); // 帶入學員：[{memberId,name,checked}]
  const openAddSession = (course) => {
    setSessionForm({
      date: dayjs().format('YYYY-MM-DD'),
      startTime: course?.startTime || '',
      endTime: course?.endTime || '',
      instructor: course?.instructor || '',
      notes: '',
    });
    setShowAddSession(true);
    // 載入該課現有學員（依 memberId 去重，confirmed/leave 都算課程學員）供勾選帶入（預設全勾）
    setAddSessionStudents([]);
    client.get(`/courses/${course.id}/enrollments`).then(res => {
      const seen = new Map();
      (res.data.enrollments || []).forEach(e => {
        if (!['confirmed', 'leave'].includes(e.status)) return;
        if (!seen.has(e.memberId)) seen.set(e.memberId, { memberId: e.memberId, name: e.memberName || '', checked: true });
      });
      setAddSessionStudents([...seen.values()]);
    }).catch(() => setAddSessionStudents([]));
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

  // 切換館別（super_admin 頂部選單）時重新載入該館課程並回到類別總頁，避免顯示他館課程（如士林館看到新竹館小蜘蛛人）
  useEffect(() => { loadCourses(); loadCategories(); loadMakeupTypes(); setSelectedCategory(null); }, [effectiveGymId]);
  useEffect(() => { if (tab === 'sessions' && selectedCourse) loadSessions(selectedCourse); }, [tab]);
  useEffect(() => { if (tab === 'calendar') loadCalendarSessions(); }, [tab, calendarMonth, effectiveGymId]);

  const loadCategories = async () => {
    try {
      const res = await getCategories();
      setCategories(res.data.categories || []);
    } catch (e) {}
  };

  // 班別表單 → API payload（規則空值＝null 用系統預設；手續費率 % → 小數）
  const catPayload = () => ({
    name: categoryForm.name, group: categoryForm.group,
    description: categoryForm.description || '', color: categoryForm.color || '#8B1A1A',
    makeupTypeIds: categoryForm.makeupTypeIds || [],
    allowTrial: !!categoryForm.allowTrial,
    trialPrice: categoryForm.trialPrice === '' ? null : Number(categoryForm.trialPrice),
    leaveDeadlineHours: categoryForm.leaveDeadlineHours === '' ? null : Number(categoryForm.leaveDeadlineHours),
    maxLeaves: categoryForm.maxLeaves === '' ? null : Number(categoryForm.maxLeaves),
    allowMakeup: !!categoryForm.allowMakeup,
    makeupDeadlineDays: categoryForm.makeupDeadlineDays === '' ? null : Number(categoryForm.makeupDeadlineDays),
    perSessionDeduction: categoryForm.perSessionDeduction === '' ? null : Number(categoryForm.perSessionDeduction),
    handlingFeeRate: categoryForm.handlingFeeRate === '' ? null : Number(categoryForm.handlingFeeRate) / 100,
  });
  // 補課類型管理（named 實體）
  const loadMakeupTypes = async () => {
    try { const r = await client.get('/course-categories/makeup-types'); setMakeupTypes(r.data.types || []); } catch (e) {}
  };
  const handleAddMakeupType = async () => {
    if (!newTypeName.trim()) return;
    try {
      await client.post('/course-categories/makeup-types', { name: newTypeName.trim() });
      setNewTypeName(''); await loadMakeupTypes();
    } catch (e) { showMsg(e.response?.data?.message || '新增失敗', 'red'); }
  };
  const handleDeleteMakeupType = async (t) => {
    if (!window.confirm(`確定刪除補課類型「${t.name}」？`)) return;
    try { await client.delete(`/course-categories/makeup-types/${t.id}`); await loadMakeupTypes(); }
    catch (e) { showMsg(e.response?.data?.message || '刪除失敗', 'red'); }
  };
  const uploadCatImage = async (catId) => {
    if (!catImageFile) return;
    const fd = new FormData(); fd.append('file', catImageFile);
    await client.post(`/course-categories/${catId}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  };
  const handleCreateCategory = async () => {
    if (!categoryForm.name?.trim()) { showMsg('請填班別名稱', 'red'); return; }
    try {
      const res = await createCategory(catPayload());
      try { await uploadCatImage(res.data.category.id); } catch (e) { showMsg('班別已建立，但照片上傳失敗', 'red'); }
      showMsg('班別建立成功');
      setShowAddCategory(false);
      setCategoryForm(EMPTY_CAT_FORM); setCatImageFile(null);
      await loadCategories();
    } catch (err) {
      showMsg(err.response?.data?.message || '建立失敗', 'red');
    }
  };

  const [editingCategory, setEditingCategory] = useState(null);
  const openEditCategory = (c) => {
    setEditingCategory(c); setCatImageFile(null);
    setCategoryForm({
      name: c.name || '', group: c.group || 'adult', description: c.description || '', color: c.color || '#8B1A1A',
      makeupTypeIds: c.makeupTypeIds || [],
      allowTrial: c.allowTrial === true, trialPrice: c.trialPrice ?? '',
      leaveDeadlineHours: c.leaveDeadlineHours ?? 2, maxLeaves: c.maxLeaves ?? 2,
      allowMakeup: c.allowMakeup !== false, makeupDeadlineDays: c.makeupDeadlineDays ?? 60,
      perSessionDeduction: c.perSessionDeduction ?? 850,
      handlingFeeRate: c.handlingFeeRate != null ? Math.round(c.handlingFeeRate * 100) : 5,
    });
  };
  const handleUpdateCategory = async () => {
    try {
      await updateCategory(editingCategory.id, catPayload());
      try { await uploadCatImage(editingCategory.id); } catch (e) { showMsg('已更新，但照片上傳失敗', 'red'); }
      showMsg('班別已更新');
      setEditingCategory(null);
      setCategoryForm(EMPTY_CAT_FORM); setCatImageFile(null);
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
      // toDate 不截在課程結束日：加開/改期到結束日之後的場次才看得到（取 課程結束日 vs 今日+180 較晚者）
      const horizon = dayjs().add(180, 'day').format('YYYY-MM-DD');
      const toDate = (c?.endDate && c.endDate > horizon) ? c.endDate : horizon;
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
      const catName = categories.find(c => c.id === courseForm.categoryId)?.name || '';
      // 覆寫規則：只送有填的欄位（空＝繼承班別）
      const ov = {};
      const num = (v) => (v === '' || v === null || v === undefined) ? undefined : Number(v);
      if (num(courseForm.leaveDeadlineHours) !== undefined) ov.leaveDeadlineHours = num(courseForm.leaveDeadlineHours);
      if (num(courseForm.maxLeaves) !== undefined) ov.maxLeaves = num(courseForm.maxLeaves);
      if (courseForm.allowMakeup !== '') ov.allowMakeup = courseForm.allowMakeup === true || courseForm.allowMakeup === 'true';
      if (num(courseForm.makeupDeadlineDays) !== undefined) ov.makeupDeadlineDays = num(courseForm.makeupDeadlineDays);
      if (courseForm.allowTrial !== '') ov.allowTrial = courseForm.allowTrial === true || courseForm.allowTrial === 'true';
      if (num(courseForm.trialPrice) !== undefined) ov.trialPrice = num(courseForm.trialPrice);
      if (num(courseForm.perSessionDeduction) !== undefined) ov.perSessionDeduction = num(courseForm.perSessionDeduction);
      if (num(courseForm.handlingFeeRate) !== undefined) ov.handlingFeeRate = num(courseForm.handlingFeeRate) / 100;
      const res = await createCourse({
        ...courseForm,
        gymId: courseForm.gymId || effectiveGymId,   // super_admin 未動館別下拉時 courseForm.gymId 為空 → 補當前檢視館別，避免建出 gymId=null 幽靈課
        leaveDeadlineHours: undefined, maxLeaves: undefined, allowMakeup: undefined, makeupDeadlineDays: undefined,
        allowTrial: undefined, trialPrice: undefined, perSessionDeduction: undefined, handlingFeeRate: undefined,
        ...ov,
        cohortName: courseForm.cohortName,
        name: catName ? `${catName} ${courseForm.cohortName}` : courseForm.cohortName,
        price: parseInt(courseForm.price),
        maxStudents: parseInt(courseForm.maxStudents),
        totalSessions: parseInt(courseForm.totalSessions) || 0,
        gymAccessDays: parseInt(courseForm.gymAccessDays),
        gymAccessDaysAfter: parseInt(courseForm.gymAccessDays),
        midpointSurcharge: parseFloat(courseForm.midpointSurcharge) || 1.05,
        weekdays: courseForm.weekdays.map(Number),
      });
      const newId = res.data.course?.id;
      // 上傳課程海報（若有選；課程已建立，海報失敗不阻斷）
      if (newId && createImageFile) {
        try {
          const fd = new FormData(); fd.append('file', createImageFile);
          await client.post(`/courses/${newId}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        } catch (e) { showMsg('課程已建立，但海報上傳失敗，可到課程編輯重傳', 'red'); }
      }
      // 週課自動產生場次
      if (courseForm.type === 'weekly' && courseForm.weekdays.length > 0 &&
          courseForm.startDate && courseForm.endDate) {
        await generateWeeklySessions(newId, { confirm: true });
        showMsg('課程建立成功，場次已自動產生');
      } else {
        showMsg('課程建立成功');
      }
      setShowAddCourse(false);
      setCreateImageFile(null);
      await loadCourses();
    } catch (err) {
      showMsg(err.response?.data?.message || '建立失敗', 'red');
    } finally { setLoading(false); }
  };

  const handleEditCourse = (course) => {
    setEditForm({
      cohortName: course.cohortName || course.name || '',
      weekdays: course.weekdays || [],
      price: course.price || '',
      maxStudents: course.maxStudents || 10,
      maxWaitlist: course.maxWaitlist ?? '',
      reservedSlots: course.reservedSlots ?? '',
      reservedSlotsNote: course.reservedSlotsNote || '',
      startDate: course.startDate || '',
      endDate: course.endDate || '',
      startTime: course.startTime || '',
      endTime: course.endTime || '',
      instructor: course.instructor || '',
      totalSessions: course.totalSessions || '',
      // 規則覆寫（''＝用班別預設）：只有梯次真的有覆寫值才顯示
      leaveDeadlineHours: course.leaveDeadlineHours ?? '',
      maxLeaves: course.maxLeaves ?? '',
      makeupDeadlineDays: course.makeupDeadlineDays ?? '',
      perSessionDeduction: course.perSessionDeduction ?? '',
      handlingFeeRate: course.handlingFeeRate != null ? Math.round(course.handlingFeeRate * 100) : '',
      allowMakeup: course.allowMakeup ?? '',
      allowTrial: course.allowTrial ?? '',
      trialPrice: course.trialPrice ?? '',
      midpointSurcharge: course.midpointSurcharge || 1.05,
      type: course.type || 'weekly',
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
      const ovNum = (v) => (v === '' || v === null || v === undefined) ? null : Number(v);
      const ovBool = (v) => (v === '' || v === null || v === undefined) ? null : (v === true || v === 'true');
      await updateCourse(editingCourse.id, {
        ...editForm,
        name: undefined,                       // 顯示名由後端依 班別名+梯次名 重組
        cohortName: editForm.cohortName,
        price: parseInt(editForm.price),
        maxStudents: parseInt(editForm.maxStudents),
        totalSessions: parseInt(editForm.totalSessions) || 0,
        midpointSurcharge: parseFloat(editForm.midpointSurcharge) || 1.05,
        // 規則：空＝null（清除覆寫、回到班別預設）
        leaveDeadlineHours: ovNum(editForm.leaveDeadlineHours),
        maxLeaves: ovNum(editForm.maxLeaves),
        makeupDeadlineDays: ovNum(editForm.makeupDeadlineDays),
        perSessionDeduction: ovNum(editForm.perSessionDeduction),
        handlingFeeRate: editForm.handlingFeeRate === '' ? null : (parseFloat(editForm.handlingFeeRate) || 0) / 100,
        allowMakeup: ovBool(editForm.allowMakeup),
        allowTrial: ovBool(editForm.allowTrial),
        trialPrice: ovNum(editForm.trialPrice),
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
      const enrollMemberIds = addSessionStudents.filter(s => s.checked).map(s => s.memberId);
      await createSession(selectedCourse.id, { ...sessionForm, enrollMemberIds });
      showMsg(`場次建立成功${enrollMemberIds.length ? `，已帶入 ${enrollMemberIds.length} 位學員` : ''}`);
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
    { key:'categories', icon:'🏷️', label:'班別管理' },
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
        {tab === 'courses' && selectedCategory && (
          <button onClick={() => {
            setCreateStep(1);
            setCreateImageFile(null);
            // 只在班別第二層顯示 → 預帶當前班別
            const preCat = categories.find(c => c.name === selectedCategory)?.id || '';
            setCourseForm({ ...EMPTY_COURSE_FORM, weekdays: [], categoryId: preCat, gymId: effectiveGymId || '' });
            setCopyFrom(''); setCreateStep(1); setShowOverrideRules(false); setCreateImageFile(null);
            setShowAddCourse(true);
          }}
            style={{ height:36, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            ＋ 加開梯次
          </button>
        )}
        {tab === 'sessions' && selectedCourse && (
          <button onClick={() => openAddSession(selectedCourse)}
            style={{ height:36, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            ＋ 新增場次
          </button>
        )}
      </div>

      {/* ── 課程列表（兩層：類別總頁 → 各梯次）── */}
      {tab === 'courses' && ((() => {
        // 依班別分組（無班別歸「其他」），班別再依大類分區
        const groups = {};
        courses.forEach(c => { const k = c.categoryName || '其他'; (groups[k] = groups[k] || []).push(c); });
        const names = Object.keys(groups).sort((a, b) => a === '其他' ? 1 : b === '其他' ? -1 : a.localeCompare(b, 'zh-Hant'));

        // ── 第一層：大類 → 班別卡 ──
        if (!selectedCategory) {
          const byGroup = {};
          names.forEach(gname => {
            const gk = groups[gname][0]?.categoryGroup || 'special';
            (byGroup[gk] = byGroup[gk] || []).push(gname);
          });
          // 空班別（啟用但尚無梯次）也列出，標「尚未開課」——點入即可加開第一梯
          categories.filter(cat => cat.isActive && !groups[cat.name]).forEach(cat => {
            const gk = GROUP_ORDER.includes(cat.group) ? cat.group : 'special';
            groups[cat.name] = [];
            (byGroup[gk] = byGroup[gk] || []).push(cat.name);
          });
          return (
            <>
              {GROUP_ORDER.map(gk => (
                <div key={gk} style={{ marginBottom:20 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#8B1A1A', margin:'0 0 10px 2px' }}>{GROUP_LABEL[gk]}</div>
                  <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                    {!(byGroup[gk]?.length) && (
                      <div style={{ padding:'14px 16px', color:'#bbb', fontSize:12 }}>（尚無班別——到「班別管理」新增）</div>
                    )}
                    {(byGroup[gk] || []).map(gname => {
                      const g = groups[gname];
                      const empty = g.length === 0;
                      const prices = g.map(c => c.price || 0);
                      const minP = empty ? 0 : Math.min(...prices), maxP = empty ? 0 : Math.max(...prices);
                      const enrolled = g.reduce((s, c) => s + (c.enrolledCount || 0), 0);
                      const cap = g.reduce((s, c) => s + (c.maxStudents || 0), 0);
                      const anyInactive = g.some(c => c.isActive === false && c.status !== 'cancelled');
                      const catGymIds = [...new Set(g.map(c => c.gymId))];
                      const catPrefix = catGymIds.length === 1 ? gymPrefix(catGymIds[0]) : '';
                      return (
                        <div key={gname} onClick={() => setSelectedCategory(gname)}
                          style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', borderBottom:'0.5px solid #F5EFEF', cursor:'pointer', opacity: empty ? 0.75 : 1 }}>
                          <div style={{ fontWeight:600, fontSize:14, flex:'1 1 200px', minWidth:0 }}>
                            {catPrefix}{gname}
                            {empty && <span style={{ fontSize:10, fontWeight:600, color:'#854F0B', background:'#FAEEDA', borderRadius:6, padding:'1px 6px', marginLeft:8 }}>尚未開課</span>}
                          </div>
                          <div style={{ fontSize:12, color:'#666', width:60, textAlign:'right' }}>{g.length} 梯</div>
                          <div style={{ fontSize:13, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace', width:150, textAlign:'right' }}>
                            {empty ? '—' : <>NT${minP.toLocaleString()}{maxP !== minP && `～${maxP.toLocaleString()}`}</>}
                          </div>
                          <div style={{ fontSize:12, color:'#999', width:130, textAlign:'right' }}>{empty ? '' : `正取 ${enrolled}/${cap}${anyInactive ? ' · 含停用' : ''}`}</div>
                          <span style={{ color:'#8B1A1A', fontWeight:600 }}>›</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(byGroup).filter(gk => !GROUP_ORDER.includes(gk)).length > 0 && null}
            </>
          );
        }

        // ── 第二層：某類別的各梯次 ──
        const list = groups[selectedCategory] || [];
        return (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <button onClick={() => setSelectedCategory(null)}
                style={{ height:32, padding:'0 12px', borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', color:'#8B1A1A', fontSize:13, cursor:'pointer' }}>← 返回課程總頁</button>
              <div style={{ fontWeight:700, fontSize:16 }}>{(() => { const ids = [...new Set(list.map(c => c.gymId))]; return ids.length === 1 ? gymPrefix(ids[0]) : ''; })()}{selectedCategory}</div>
              <span style={{ fontSize:12, color:'#999' }}>{list.length} 梯</span>
            </div>
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
              {list.length === 0 && (
                <div style={{ padding:36, textAlign:'center', color:'#999', fontSize:13 }}>
                  此班別尚未開課——點右上「＋ 加開梯次」開設第一梯
                </div>
              )}
              {list.map(c => {
                const st = courseStatus(c);
                const inactive = c.isActive === false && c.status !== 'cancelled';
                const wk = (c.weekdays || []).map(d => '日一二三四五六'[d]).join('、');
                return (
                  <div key={c.id} onClick={() => c.status !== 'cancelled' && handleEditCourse(c)}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'0.5px solid #F5EFEF', cursor: c.status !== 'cancelled' ? 'pointer' : 'default', opacity: inactive ? 0.55 : 1, flexWrap:'wrap' }}>
                    <div style={{ flex:'1 1 220px', minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ fontWeight:600, fontSize:14 }}>{gymPrefix(c.gymId)}{c.name}</span>
                        <Tag type={c.type==='weekly'?'blue':'purple'}>{courseTypeLabel(c.type)}</Tag>
                        {inactive && <Tag type="gray">已停用</Tag>}
                        <Tag type={st.type}>{st.label}</Tag>
                      </div>
                      <div style={{ fontSize:12, color:'#999', marginTop:3 }}>
                        {wk ? `每週${wk} ` : ''}{c.startTime}~{c.endTime} · {c.startDate}~{c.endDate} · 👟{c.instructor || '—'}
                      </div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace', width:90, textAlign:'right' }}>NT${(c.price||0).toLocaleString()}</div>
                    <div style={{ fontSize:12, color:'#666', width:150, textAlign:'right' }} title={c.reservedSlotsNote || ''}>
                      <span style={{ fontWeight:600 }}>{c.enrolledCount || 0}/{c.maxStudents} 人</span>
                      {(c.reservedSlots || 0) > 0 && (
                        <div style={{ fontSize:10, color:'#B5762B' }}>系統 {c.realEnrolled ?? ((c.enrolledCount||0)-(c.reservedSlots||0))}＋佔用 {c.reservedSlots} ⓘ</div>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setSelectedCourse(c); setSelectedSession(null); setRoster(null); setTab('sessions'); }}
                        style={{ height:28, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:11, cursor:'pointer' }}>場次</button>
                      <button onClick={() => loadCourseRoster(c)}
                        style={{ height:28, padding:'0 10px', borderRadius:6, background:'#8B1A1A', border:'none', color:'#fff', fontSize:11, cursor:'pointer' }}>名單</button>
                      {c.status !== 'cancelled' && (inactive ? (
                        <button onClick={() => handleToggleCourseActive(c, true)}
                          style={{ height:28, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #2D7D46', color:'#2D7D46', fontSize:11, cursor:'pointer' }}>啟用</button>
                      ) : (
                        <button onClick={() => handleToggleCourseActive(c, false)}
                          style={{ height:28, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #B5762B', color:'#B5762B', fontSize:11, cursor:'pointer' }}>停用</button>
                      ))}
                      {c.status !== 'cancelled' && (
                        <button onClick={() => handleDeleteCourse(c)}
                          style={{ height:28, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:11, cursor:'pointer' }}>取消</button>
                      )}
                      {isSuperAdmin && (
                        <button onClick={() => handlePermanentDelete(c)}
                          style={{ height:28, padding:'0 10px', borderRadius:6, background:'#A32D2D', border:'none', color:'#fff', fontSize:11, cursor:'pointer' }}>刪除</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize:11, color:'#999', marginTop:8 }}>點擊梯次列即可編輯；「場次」進場次管理、「名單」看報名學員。人數＝系統報名＋外部佔用（佔用＝舊系統/BeClass 帶入的既有報名，滑鼠停在人數上可看佔用說明；到編輯視窗可調整佔用數與說明）。</div>
          </>
        );
      })())}

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
                <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflowX:'auto', WebkitOverflowScrolling:'touch', marginBottom:16 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))', background:'#FBF5F5', minWidth:640 }}>
                    {['日','一','二','三','四','五','六'].map(d => <div key={d} style={{ padding:'8px 0', textAlign:'center', fontSize:11, color:'#999', fontWeight:600 }}>{d}</div>)}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))', minWidth:640 }}>
                    {cells.map((date, idx) => {
                      const daySessions = date ? sessionsForDate(date) : [];
                      const totalEnrolled = daySessions.reduce((sum,s) => sum + (s.enrolledCount||0), 0);
                      const isToday = date === today;
                      const isSelected = date === calendarSelectedDate;
                      return (
                        <div key={idx} onClick={() => date && daySessions.length > 0 && setCalendarSelectedDate(date)}
                          style={{
                            minHeight:90, borderRight:'0.5px solid #F5EFEF', borderBottom:'0.5px solid #F5EFEF',
                            padding:6, cursor: date && daySessions.length > 0 ? 'pointer' : 'default',
                            background: isSelected ? '#FBF0F0' : isToday ? '#FFFBF0' : '#fff',
                          }}>
                          {date && (
                            <>
                              <div style={{ fontSize:11, color: isToday ? '#8B1A1A' : '#999', fontWeight: isToday ? 700 : 400, marginBottom:4 }}>{dayjs(date).date()}</div>
                              {daySessions.length > 0 && (
                                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                                  {[...daySessions].sort((a,b) => (a.startTime||'').localeCompare(b.startTime||'')).map(s => {
                                    const col = courseColor(s.courseId || s.courseName);
                                    return (
                                    <div key={s.id} style={{ fontSize:9, background:col.bg, borderRadius:4, padding:'2px 3px', lineHeight:1.25, overflow:'hidden' }}>
                                      <div style={{ fontWeight:600, color:col.fg, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.courseName}</div>
                                      <div style={{ color:col.fg, opacity:.8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>👟{s.instructor || '—'}·{(s.registeredCount ?? s.enrolledCount ?? 0)}人</div>
                                    </div>
                                    );
                                  })}
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
                <div style={{ fontWeight:600, fontSize:15 }}>{gymPrefix(rosterSession.gymId)}{rosterSession.courseName}</div>
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
              <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>梯次</div>
              <select value={selectedCourse?.id || ''}
                onChange={e => {
                  const c = courses.find(x => x.id === e.target.value);
                  if (c) { setSelectedCourse(c); setSelectedSession(null); setRoster(null); loadSessions(c); }
                }}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                <option value="">選擇梯次…</option>
                {courses.map(c => <option key={c.id} value={c.id}>{gymPrefix(c.gymId)}{c.name}</option>)}
              </select>
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
                        {gymPrefix(selectedCourse?.gymId)}{selectedCourse?.name} — {dayjs(selectedSession.date).format('MM/DD')}（{WEEKDAYS[dayjs(selectedSession.date).day()]}）
                      </div>
                      <div style={{ fontSize:13, color:'#999', marginTop:4 }}>
                        {selectedSession.startTime}～{selectedSession.endTime}
                        {selectedSession.instructor && ` · 教練：${selectedSession.instructor}`}
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

      {/* ── 班別管理 tab（樹：大類 → 班別；介紹/照片/規則為同班別所有梯次共用預設）── */}
      {tab === 'categories' && (
        <div>
          {/* 補課類型管理：先建類型 → 班別各自多選掛類型 → 同類型班別可互相補課 */}
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 16px', marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#8B1A1A', marginBottom:8 }}>補課類型（掛同一類型的班別可互相補課）</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
              {makeupTypes.map(t => (
                <span key={t.id} style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#E6F1FB', color:'#185FA5', borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:600 }}>
                  {t.name}
                  <span onClick={() => handleDeleteMakeupType(t)} style={{ cursor:'pointer', color:'#7AA5CC', fontSize:13 }}>×</span>
                </span>
              ))}
              {makeupTypes.length === 0 && <span style={{ fontSize:12, color:'#bbb' }}>尚無類型</span>}
              <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddMakeupType()}
                placeholder="新類型名稱（如：小蜘蛛人）"
                style={{ height:30, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:12, background:'#FBF5F5', outline:'none', color:'#1a1a1a', width:180 }}/>
              <button onClick={handleAddMakeupType}
                style={{ height:30, padding:'0 12px', borderRadius:8, background:'#185FA5', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>＋ 新增類型</button>
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button onClick={() => { setCategoryForm(EMPTY_CAT_FORM); setCatImageFile(null); setShowAddCategory(true); }}
              style={{ height:36, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
              ＋ 新增班別
            </button>
          </div>
          {GROUP_ORDER.map(g => {
            const list = categories.filter(c => c.isActive && (c.group || 'special') === g);
            return (
              <div key={g} style={{ marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#8B1A1A', margin:'0 0 8px 2px' }}>{GROUP_LABEL[g]}</div>
                <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                  {list.length === 0 ? (
                    <div style={{ padding:'14px 16px', color:'#bbb', fontSize:12 }}>（尚無班別）</div>
                  ) : list.map(c => (
                    <div key={c.id} style={{ padding:'12px 16px', borderBottom:'0.5px solid #F5EFEF', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                        {c.imageUrl
                          ? <img src={c.imageUrl} alt="" style={{ width:36, height:36, borderRadius:8, objectFit:'cover', flexShrink:0 }}/>
                          : <div style={{ width:12, height:12, borderRadius:6, background: c.color || '#8B1A1A', flexShrink:0 }}/>}
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontWeight:600, fontSize:14 }}>{c.name}
                            {c.allowTrial === true && <span style={{ fontSize:10, color:'#854F0B', background:'#FAEEDA', borderRadius:6, padding:'1px 6px', marginLeft:6 }}>試上 ${c.trialPrice ?? 0}</span>}
                            {(c.makeupTypeIds || []).length > 0 && (
                              <span style={{ fontSize:10, color:'#185FA5', background:'#E6F1FB', borderRadius:6, padding:'1px 6px', marginLeft:6 }}>
                                補課類型：{(c.makeupTypeIds || []).map(id => makeupTypes.find(t => t.id === id)?.name).filter(Boolean).join('、')}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                            請假 前{c.leaveDeadlineHours ?? 2}h/上限{c.maxLeaves ?? 2}次 · 補課 {c.allowMakeup === false ? '關閉' : `結束後${c.makeupDeadlineDays ?? 60}天`} · 退費費率{Math.min(Math.round((c.handlingFeeRate ?? 0.2) * 100), 20)}%（政府公式）
                          </div>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <button onClick={() => openEditCategory(c)}
                          style={{ height:28, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#444', fontSize:11, cursor:'pointer' }}>
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
              </div>
            );
          })}

          {(showAddCategory || editingCategory) && (
            <Modal title={editingCategory ? `編輯班別 — ${editingCategory.name}` : '新增班別'} width={560}
              onClose={() => { setShowAddCategory(false); setEditingCategory(null); }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>所屬大類</label>
                  <select value={categoryForm.group} onChange={e => setCategoryForm({...categoryForm, group:e.target.value})}
                    style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                    {GROUP_ORDER.map(g => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>班別名稱</label>
                  <input value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name:e.target.value})}
                    placeholder="如：入門班、小蜘蛛人入門班"
                    style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>課程介紹（同班別所有梯次共用）</label>
                  <textarea value={categoryForm.description} onChange={e => setCategoryForm({...categoryForm, description:e.target.value})} rows={4}
                    style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box', resize:'vertical' }}/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>廣告照片（同班別所有梯次共用）</label>
                  {editingCategory?.imageUrl && !catImageFile && (
                    <img src={editingCategory.imageUrl} alt="" style={{ width:'100%', maxHeight:120, objectFit:'cover', borderRadius:8, marginBottom:6 }}/>
                  )}
                  <input type="file" accept="image/*" onChange={e => setCatImageFile(e.target.files?.[0] || null)} style={{ fontSize:12, width:'100%' }}/>
                  {catImageFile && <div style={{ fontSize:11, color:'#2D7D46', marginTop:4 }}>✓ {catImageFile.name}（儲存後上傳）</div>}
                </div>
                <div style={{ gridColumn:'1/-1', borderTop:'0.5px solid #F0E5E5', paddingTop:10, fontSize:12, fontWeight:700, color:'#8B1A1A' }}>規則（此班別所有梯次的預設，梯次可個別覆寫）</div>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>請假截止（上課前 N 小時）</label>
                  <input type="number" value={categoryForm.leaveDeadlineHours} onChange={e => setCategoryForm({...categoryForm, leaveDeadlineHours:e.target.value})}
                    style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>整期可請假次數</label>
                  <input type="number" value={categoryForm.maxLeaves} onChange={e => setCategoryForm({...categoryForm, maxLeaves:e.target.value})}
                    style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="checkbox" id="catAllowMakeup" checked={categoryForm.allowMakeup}
                    onChange={e => setCategoryForm({...categoryForm, allowMakeup:e.target.checked})}/>
                  <label htmlFor="catAllowMakeup" style={{ fontSize:13, cursor:'pointer' }}>開放補課</label>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>補課期限（課程結束後 N 天）</label>
                  <input type="number" value={categoryForm.makeupDeadlineDays} onChange={e => setCategoryForm({...categoryForm, makeupDeadlineDays:e.target.value})}
                    style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>退費：開課前手續費率（%）</label>
                  <input type="number" value={categoryForm.handlingFeeRate} onChange={e => setCategoryForm({...categoryForm, handlingFeeRate:e.target.value})}
                    style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="checkbox" id="catAllowTrial" checked={categoryForm.allowTrial}
                    onChange={e => setCategoryForm({...categoryForm, allowTrial:e.target.checked})}/>
                  <label htmlFor="catAllowTrial" style={{ fontSize:13, cursor:'pointer' }}>開放試上（發單日體驗券、不卡墜測）</label>
                </div>
                {categoryForm.allowTrial && (
                  <div>
                    <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>試上費（NT$）</label>
                    <input type="number" value={categoryForm.trialPrice} onChange={e => setCategoryForm({...categoryForm, trialPrice:e.target.value})}
                      style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                  </div>
                )}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>適用補課類型（可多選；掛同一類型的班別可互相補課，不勾＝只能補本班別的其他梯次）</label>
                  <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, background:'#FBF5F5', padding:'8px 12px', display:'flex', flexWrap:'wrap', gap:'6px 14px' }}>
                    {makeupTypes.length === 0 && <span style={{ fontSize:12, color:'#bbb' }}>尚無補課類型——到列表上方「補課類型」先新增</span>}
                    {makeupTypes.map(t => (
                      <label key={t.id} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12.5, cursor:'pointer', color:'#1a1a1a' }}>
                        <input type="checkbox" checked={(categoryForm.makeupTypeIds || []).includes(t.id)}
                          onChange={e => setCategoryForm(f => ({ ...f, makeupTypeIds: e.target.checked
                            ? [...(f.makeupTypeIds || []), t.id]
                            : (f.makeupTypeIds || []).filter(x => x !== t.id) }))}/>
                        {t.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:18 }}>
                <button onClick={() => { setShowAddCategory(false); setEditingCategory(null); }}
                  style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
                <button onClick={editingCategory ? handleUpdateCategory : handleCreateCategory}
                  style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  {editingCategory ? '儲存變更' : '建立班別'}
                </button>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ── 加開梯次 Modal（兩步：1 選班別/類型/館別＋梯次名稱 → 2 梯次資料＋覆寫規則）── */}
      {showAddCourse && (
        <Modal title={createStep === 1 ? '加開梯次（1/2）· 選班別' : '加開梯次（2/2）· 梯次資料'} onClose={() => setShowAddCourse(false)} width={560}>
          {createStep === 1 ? (
          <>
            {courses.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>複製現有梯次（選填，帶入該梯設定）</label>
                <select value={copyFrom} onChange={e => {
                  setCopyFrom(e.target.value);
                  if (e.target.value) {
                    const src = courses.find(c => c.id === e.target.value);
                    if (src) setCourseForm(prev => ({
                      ...prev,
                      cohortName: (src.cohortName || src.name) + '（複製）',
                      price: src.price || '',
                      maxStudents: src.maxStudents || 6,
                      maxWaitlist: src.maxWaitlist ?? '',
                      type: src.type || 'weekly',
                      categoryId: src.categoryId || prev.categoryId || '',
                      gymId: src.gymId || prev.gymId || '',
                      instructor: src.instructor || '',
                      totalSessions: src.totalSessions || '',
                      gymAccessDays: src.gymAccessDaysAfter || 1,
                      midpointSurcharge: src.midpointSurcharge || 1.05,
                      weekdays: src.weekdays || [],
                      installment: src.installment || prev.installment,
                    }));
                  }
                }}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                  <option value="">不複製，從頭建立</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>班別（此梯次屬於哪個班別）</label>
              <select value={courseForm.categoryId || ''} onChange={e => setCourseForm({...courseForm, categoryId:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                <option value="">請選擇班別</option>
                {GROUP_ORDER.map(g => {
                  const list = categories.filter(c => c.isActive && (c.group || 'special') === g);
                  return list.length ? (
                    <optgroup key={g} label={GROUP_LABEL[g]}>
                      {list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
              <div style={{ fontSize:10, color:'#999', marginTop:4 }}>介紹/照片/試上/請假/補課/退費規則由班別提供（到「班別管理」設定）；梯次可於下一步覆寫規則。</div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>梯次名稱</label>
              <input value={courseForm.cohortName} onChange={e => setCourseForm({...courseForm, cohortName:e.target.value})}
                placeholder="如：週日A班、9-10月平日班"
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              {courseForm.categoryId && courseForm.cohortName && (
                <div style={{ fontSize:10, color:'#2D7D46', marginTop:4 }}>顯示名稱：{categories.find(c => c.id === courseForm.categoryId)?.name} {courseForm.cohortName}</div>
              )}
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>課程類型</label>
              <select value={courseForm.type} onChange={e => setCourseForm({...courseForm, type:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                <option value="weekly">固定週課</option>
                <option value="workshop">單次工作坊</option>
              </select>
            </div>
            {isSuperAdmin && (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>館別</label>
                <select value={courseForm.gymId || effectiveGymId || ''} onChange={e => setCourseForm({...courseForm, gymId: e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                  <option value="">請選擇館別</option>
                  {GYMS.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ display:'flex', gap:8, marginTop:20 }}>
              <button onClick={() => setShowAddCourse(false)}
                style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
              <button onClick={() => {
                if (isSuperAdmin && !(courseForm.gymId || effectiveGymId)) { showMsg('請先選擇館別', 'red'); return; }
                if (!courseForm.categoryId) { showMsg('請選擇班別', 'red'); return; }
                if (!courseForm.cohortName?.trim()) { showMsg('請填梯次名稱', 'red'); return; }
                setCreateStep(2);
              }}
                style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>下一步 →</button>
            </div>
          </>
          ) : (
          <>
          <div style={{ fontSize:12, color:'#666', background:'#FBF5F5', borderRadius:8, padding:'8px 12px', marginBottom:14 }}>
            班別：<strong>{categories.find(c => c.id === courseForm.categoryId)?.name || '—'}</strong> · {courseForm.type === 'weekly' ? '固定週課' : '單次工作坊'} · 梯次「{courseForm.cohortName || '（未命名）'}」
          </div>
          <div style={{ fontSize:11, color:'#999', marginBottom:10 }}>以下為此梯次專屬資料（費用/名額/上課時段）：</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { label:'費用（NT$）', key:'price', type:'number' },
              { label:'最多人數（正取）', key:'maxStudents', type:'number' },
              { label:'候補上限（留空＝不限、0＝不開放）', key:'maxWaitlist', type:'number' },
              { label:'已佔用名額（外部帶入，剩餘＝上限−已報名−此值）', key:'reservedSlots', type:'number' },
              { label:'佔用說明（為何被佔用／來源）', key:'reservedSlotsNote', type:'text' },
              { label:'入館有效天數', key:'gymAccessDays', type:'number' },
              { label:'課程開始日期', key:'startDate', type:'date' },
              { label:'課程結束日期', key:'endDate', type:'date' },
              { label:'上課開始時間', key:'startTime', type:'time' },
              { label:'上課結束時間', key:'endTime', type:'time' },
              { label:'教練', key:'instructor', type:'text', colSpan:2 },
            ].map(f => (
              <div key={f.key} style={{ gridColumn: f.colSpan===2 ? '1/-1' : 'auto' }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                <input type={f.type} value={courseForm[f.key]}
                  onChange={e => setCourseForm({...courseForm, [f.key]: e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>
            ))}
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
          <div style={{ marginTop:14 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>插班加成（剩餘堂數低於一半時的加成係數）</label>
            <input type="number" step="0.01" value={courseForm.midpointSurcharge}
              onChange={e => setCourseForm({...courseForm, midpointSurcharge: e.target.value})}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ marginTop:14 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6 }}>是否分期（分期付款規則）</label>
            <InstallmentRuleEditor value={courseForm.installment} price={courseForm.price}
              onChange={v => setCourseForm({...courseForm, installment: v})} />
          </div>
          {/* 覆寫班別規則（收合；空＝用班別預設）*/}
          <div style={{ marginTop:14, border:'0.5px solid #E8D5D5', borderRadius:10, overflow:'hidden' }}>
            <div onClick={() => setShowOverrideRules(v => !v)}
              style={{ padding:'10px 14px', background:'#FBF5F5', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', justifyContent:'space-between' }}>
              <span>⚙ 覆寫班別規則（選填）</span><span>{showOverrideRules ? '▲' : '▼ 目前使用班別預設'}</span>
            </div>
            {showOverrideRules && (() => {
              const cat = categories.find(c => c.id === courseForm.categoryId) || {};
              const ph = (v, d) => `班別預設 ${v ?? d}`;
              return (
                <div style={{ padding:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div style={{ gridColumn:'1/-1', fontSize:11, color:'#999' }}>留空＝使用班別預設；填了＝此梯次個別覆寫。</div>
                  {[
                    { label:'請假截止（小時前）', key:'leaveDeadlineHours', p: ph(cat.leaveDeadlineHours, 2) },
                    { label:'整期可請假次數', key:'maxLeaves', p: ph(cat.maxLeaves, 2) },
                    { label:'補課期限（課程結束後 N 天）', key:'makeupDeadlineDays', p: ph(cat.makeupDeadlineDays, 60) },
                    { label:'試上費（NT$）', key:'trialPrice', p: ph(cat.trialPrice, 0) },
                    { label:'退費：手續費率（%）', key:'handlingFeeRate', p: `班別預設 ${Math.round((cat.handlingFeeRate ?? 0.05) * 100)}` },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                      <input type="number" value={courseForm[f.key]} placeholder={f.p}
                        onChange={e => setCourseForm({...courseForm, [f.key]: e.target.value})}
                        style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#fff', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>開放補課</label>
                    <select value={courseForm.allowMakeup} onChange={e => setCourseForm({...courseForm, allowMakeup: e.target.value})}
                      style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#fff', outline:'none', color:'#1a1a1a' }}>
                      <option value="">班別預設（{cat.allowMakeup === false ? '關閉' : '開放'}）</option>
                      <option value="true">開放</option>
                      <option value="false">關閉</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>開放試上</label>
                    <select value={courseForm.allowTrial} onChange={e => setCourseForm({...courseForm, allowTrial: e.target.value})}
                      style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#fff', outline:'none', color:'#1a1a1a' }}>
                      <option value="">班別預設（{cat.allowTrial === true ? '開放' : '關閉'}）</option>
                      <option value="true">開放</option>
                      <option value="false">關閉</option>
                    </select>
                  </div>
                </div>
              );
            })()}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:20 }}>
            <button onClick={() => setCreateStep(1)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>← 上一步</button>
            <button onClick={handleCreateCourse} disabled={loading}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {loading ? '建立中...' : '建立課程'}
            </button>
          </div>
          </>
          )}
        </Modal>
      )}

      {/* ── 新增場次 Modal ── */}
      {showAddSession && selectedCourse && (
        <Modal title={`新增場次 — ${selectedCourse.name}`} onClose={() => setShowAddSession(false)}>
          {[
            { label:'日期', key:'date', type:'date' },
            { label:'開始時間', key:'startTime', type:'time' },
            { label:'結束時間', key:'endTime', type:'time' },
            { label:'教練', key:'instructor', type:'text' },
            { label:'備註', key:'notes', type:'text' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
              <input type={f.type} value={sessionForm[f.key]}
                onChange={e => setSessionForm({...sessionForm, [f.key]:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
          ))}
          {/* 帶入學員（可個別勾選；預設全勾） */}
          {addSessionStudents.length > 0 && (
            <div style={{ background:'#FBF5F5', borderRadius:10, padding:'10px 12px', marginBottom:12, border:'0.5px solid #E8D5D5' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:12, fontWeight:600, color:'#8B1A1A' }}>帶入本課學員（{addSessionStudents.filter(s=>s.checked).length}/{addSessionStudents.length}）</span>
                <button type="button" onClick={() => { const all = addSessionStudents.every(s=>s.checked); setAddSessionStudents(ss => ss.map(s => ({ ...s, checked: !all }))); }}
                  style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', cursor:'pointer' }}>
                  {addSessionStudents.every(s=>s.checked) ? '全不選' : '全選'}
                </button>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {addSessionStudents.map(s => (
                  <label key={s.memberId} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#444', background:'#fff', border:`0.5px solid ${s.checked?'#8B1A1A':'#E8D5D5'}`, borderRadius:8, padding:'4px 9px', cursor:'pointer' }}>
                    <input type="checkbox" checked={s.checked}
                      onChange={() => setAddSessionStudents(ss => ss.map(x => x.memberId === s.memberId ? { ...x, checked: !x.checked } : x))} />
                    {s.name || s.memberId}
                  </label>
                ))}
              </div>
              <div style={{ fontSize:10, color:'#999', marginTop:6, textAlign:'left' }}>勾選者將直接加入此場次名單（不另計費）；未勾選者不會看到這堂課。</div>
            </div>
          )}
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
            { label:'教練', key:'instructor', type:'text' },
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
              {filterPayments(PAYMENT_METHODS, enabledPay).map(pm => (
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
              { label:'梯次名稱（顯示名＝班別名＋梯次名）', key:'cohortName', type:'text', colSpan:2 },
              { label:'費用（NT$）', key:'price', type:'number' },
              { label:'最多人數（正取）', key:'maxStudents', type:'number' },
              { label:'候補上限（留空＝不限、0＝不開放）', key:'maxWaitlist', type:'number' },
              { label:'已佔用名額（外部帶入，剩餘＝上限−已報名−此值）', key:'reservedSlots', type:'number', colSpan:2 },
              { label:'課程開始日期', key:'startDate', type:'date' },
              { label:'課程結束日期', key:'endDate', type:'date' },
              { label:'上課開始時間', key:'startTime', type:'time' },
              { label:'上課結束時間', key:'endTime', type:'time' },
              { label:'教練', key:'instructor', type:'text', colSpan:2 },
              { label:'插班加成', key:'midpointSurcharge', type:'number' },
              { label:'請假截止（小時前）', key:'leaveDeadlineHours', type:'number', ph:'留空＝班別預設' },
              { label:'整期可請假次數', key:'maxLeaves', type:'number', ph:'留空＝班別預設', hint:'留空＝用班別預設；插班學員可於「查看名單」個別設定' },
              { label:'補課期限（課程結束後 N 天）', key:'makeupDeadlineDays', type:'number', ph:'留空＝班別預設' },
              { label:'退費-手續費率（%）', key:'handlingFeeRate', type:'number', ph:'留空＝班別預設' },
            ].map(f => (
              <div key={f.key} style={{ gridColumn: f.colSpan===2 ? '1/-1' : 'auto' }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                <input type={f.type} value={editForm[f.key] ?? ''} placeholder={f.ph || ''}
                  onChange={e => setEditForm({...editForm, [f.key]: e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                {f.hint && <div style={{ fontSize:10, color:'#999', marginTop:4, lineHeight:1.4 }}>{f.hint}</div>}
              </div>
            ))}
            <div style={{ gridColumn:'1/-1', fontSize:11, color:'#999', background:'#FBF5F5', borderRadius:8, padding:'8px 12px' }}>
              課程介紹與廣告照片改由「班別管理」設定（同班別所有梯次共用）。
            </div>
            <div>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>開放補課</label>
              <select value={editForm.allowMakeup == null || editForm.allowMakeup === '' ? '' : String(editForm.allowMakeup)}
                onChange={e => setEditForm({...editForm, allowMakeup: e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                <option value="">班別預設</option>
                <option value="true">開放</option>
                <option value="false">關閉</option>
              </select>
            </div>
            {(editForm.type || editingCourse?.type) === 'weekly' && (
              <div>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>開放試上</label>
                <select value={editForm.allowTrial == null || editForm.allowTrial === '' ? '' : String(editForm.allowTrial)}
                  onChange={e => setEditForm({...editForm, allowTrial: e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                  <option value="">班別預設</option>
                  <option value="true">開放</option>
                  <option value="false">關閉</option>
                </select>
              </div>
            )}
            {(editForm.type || editingCourse?.type) === 'weekly' && (
              <div>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>試上費（留空＝班別預設）</label>
                <input type="number" min={0} value={editForm.trialPrice ?? ''}
                  onChange={e => setEditForm({...editForm, trialPrice:e.target.value})} placeholder="班別預設"
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
                  {rosterModal.enrollments ? `共 ${new Set(rosterModal.enrollments.map(e => e.memberId)).size} 人` : '載入中...'}
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
