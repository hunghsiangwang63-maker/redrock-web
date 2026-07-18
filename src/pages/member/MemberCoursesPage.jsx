import { useState, useEffect, useRef } from 'react';
import ErrorAlertModal from '../../components/ErrorAlertModal';
import MemberLogoutButton from '../../components/MemberLogoutButton';
import { t } from '../../utils/memberI18n';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { memberClient } from '../../api/client';
import { requestCourseRefund, requestCoursePause } from '../../api/courseAdjustments';
import SignaturePad from '../../components/SignaturePad.jsx';
import dayjs from 'dayjs';
import { isUnder5 } from '../../utils/age';
import { gymPrefix } from '../../utils/gymLabel';
import { courseColor } from '../../utils/courseColor';
import PaymentSection from '../../components/PaymentSection';
import PaymentFlow, { ONLINE_PAYMENT_ENABLED } from '../../components/PaymentFlow';
import PaymentPlanChoice from '../../components/PaymentPlanChoice';

const WEEKDAYS = ['日','一','二','三','四','五','六'];

export default function MemberCoursesPage() {
  const { member } = useMember();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState('my'); // browse | my
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null); // 兩層式：先選類別（同課多梯次）再選梯次
  const [sessions, setSessions] = useState([]);
  const [myEnrollments, setMyEnrollments] = useState([]);
  const [myMakeups, setMyMakeups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');
  const [enrollSuccess, setEnrollSuccess] = useState(false); // 報名成功確認彈窗
  const [enrollWaitlisted, setEnrollWaitlisted] = useState(false); // 該次報名是否為候補
  const [cancelWaitlistTarget, setCancelWaitlistTarget] = useState(null); // 取消候補確認對象
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollSession, setEnrollSession] = useState(null);
  const [payFor, setPayFor] = useState(null); // { enrollmentId, fee, gymId }
  const [enrollStep, setEnrollStep] = useState(1); // 1=基本資料 2=付款 3=規則確認 4=肖像授權
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [enrollPlan, setEnrollPlan] = useState('full');   // full | installment（課程有開分期時可選）
  const [paymentData, setPaymentData] = useState({ method:'cash', paymentDate:'', bankLastFive:'' });
  const [paymentDate, setPaymentDate] = useState('');
  const [bankLastFive, setBankLastFive] = useState('');
  const [healthNote, setHealthNote] = useState('');
  const [referralSources, setReferralSources] = useState([]); // 如何得知本課程（可複選）
  const [confirmedLeavePolicy, setConfirmedLeavePolicy] = useState(false);
  const [confirmedRefundPolicy, setConfirmedRefundPolicy] = useState(false);
  const [portraitSig, setPortraitSig] = useState(null);
  const [guardianSig, setGuardianSig] = useState(null);
  const [leaveReason, setLeaveReason] = useState('');
  const [bankAccounts, setBankAccounts] = useState({});
  const [screenshot, setScreenshot] = useState(null);
  const [uploadDone, setUploadDone] = useState(false);
  const [makeupRights, setMakeupRights] = useState([]);
  const [showMakeupModal, setShowMakeupModal] = useState(false);
  const [selectedMakeup, setSelectedMakeup] = useState(null);
  const [makeupSessions, setMakeupSessions] = useState([]);
  const [leavingId, setLeavingId] = useState(null);
  const [overLimitConfirm, setOverLimitConfirm] = useState(null); // 超過補課上限請假提醒：{ enrollmentId, memberId }
  const [cancelLeaveTarget, setCancelLeaveTarget] = useState(null); // 取消請假確認：{ enrollmentId, memberId, dateLabel }
  const [cancelMakeupTarget, setCancelMakeupTarget] = useState(null); // 取消補課確認：{ enrollmentId, memberId, dateLabel }
  const [expandedCourseId, setExpandedCourseId] = useState(null);
  const [adjustModal, setAdjustModal] = useState(null); // { type:'refund'|'pause', enrollmentId, courseName }
  // 審核中的退費/暫停申請：key=`${courseId}__${memberId}` → 'refund'|'pause'（載入時從後端回填，跨重整持續）
  const [pendingAdjust, setPendingAdjust] = useState(new Map());
  const adjKey = (courseId, memberId) => `${courseId}__${memberId}`;
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [enrollForMemberId, setEnrollForMemberId] = useState(null); // null = 本人
  const [familyMembers, setFamilyMembers] = useState([]);
  const [reuploadTarget, setReuploadTarget] = useState(null); // 重新上傳轉帳：{ enrollmentId, courseName, amount, memberId, gymId }
  const [reuploadData, setReuploadData] = useState({ method:'transfer', paymentDate:'', bankLastFive:'', bankName:'' });
  const [reuploadFile, setReuploadFile] = useState(null);
  const [reuploadLoading, setReuploadLoading] = useState(false);

  const courseSigRef = useRef(null);
  const courseGuardianSigRef = useRef(null);

  const handleAdjustSubmit = async () => {
    if (!adjustReason.trim()) { showMsg('請填寫原因', 'red'); return; }
    setAdjustLoading(true);
    try {
      if (adjustModal.type === 'refund') {
        const res = await requestCourseRefund(adjustModal.enrollmentId, { reason: adjustReason, memberId: adjustModal.memberId });
        showMsg(`退費申請已送出（建議退款 NT$${res.data.suggestedRefund}），等待管理員審核`);
      } else {
        await requestCoursePause(adjustModal.enrollmentId, { reason: adjustReason, memberId: adjustModal.memberId });
        showMsg('暫停申請已送出，等待管理員審核');
      }
      // 記錄已申請，禁止重複申請（key 含報名對象，家長/子女分開）
      setPendingAdjust(prev => new Map(prev).set(adjKey(adjustModal.enrollmentId, adjustModal.memberId), adjustModal.type));
      setAdjustModal(null);
      setAdjustReason('');
      loadMyEnrollments(); // 退費凍結旗標已寫入 → 重載讓請假/補課等 UI 即時隱藏
    } catch (err) {
      showMsg(err.response?.data?.message || '申請失敗', 'red');
      // 即使失敗也關閉 modal，避免卡住
      setAdjustModal(null);
      setAdjustReason('');
    } finally { setAdjustLoading(false); }
  };
  const [calendarMonth, setCalendarMonth] = useState(dayjs().format('YYYY-MM'));
  const [calendarSessions, setCalendarSessions] = useState([]);
  const [calendarExperiences, setCalendarExperiences] = useState([]);
  const [calendarCompetitions, setCalendarCompetitions] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(null);
  const [calendarExpandedCourseId, setCalendarExpandedCourseId] = useState(null);

  const gymId = member?.defaultGymId || 'gym-hsinchu';
  const [browseGymId, setBrowseGymId] = useState(''); // '' = 全部館別

  const [errorModal, setErrorModal] = useState(null); // 通知彈窗（成功/錯誤一律彈窗）
  const showMsg = (text, type='ok') => setErrorModal({ message: text, type });

  // 報名對象（本人或子會員）；未成年判定以「報名對象」為準，非登入者
  // → 家長代未成年子女報名時，也會自動出現法定代理人簽名欄位
  const enrollTarget = enrollForMemberId ? familyMembers.find(c => c.id === enrollForMemberId) : member;
  const targetIsMinor = enrollTarget?.isMinor
    ?? (enrollTarget?.birthday ? dayjs().diff(dayjs(enrollTarget.birthday), 'year') < 18 : false);
  // 未滿 5 歲無法報名課程（友善提示，後端仍為權威）
  const targetUnder5 = isUnder5(enrollTarget);

  useEffect(() => { loadCourses(); loadMyEnrollments(); loadMakeupRights(); loadBankAccounts(); }, [member?.id]);
  useEffect(() => {
    if (selectedCourse) loadSessions(selectedCourse);
  }, [selectedCourse]);
  useEffect(() => {
    if (tab === 'calendar') loadCalendarSessions();
  }, [tab, calendarMonth]);

  const loadCalendarSessions = async () => {
    setCalendarLoading(true);
    try {
      const fromDate = dayjs(`${calendarMonth}-01`).format('YYYY-MM-DD');
      const toDate = dayjs(`${calendarMonth}-01`).endOf('month').format('YYYY-MM-DD');
      // 家長帳號一併帶子女報名，讓月曆能顯示自己＋子女報名的課
      let childIds = familyMembers.map(c => c.id);
      if (childIds.length === 0) {
        try { const r = await memberClient.get('/members/my/children'); childIds = (r.data.children || []).map(c => c.id); } catch (e) {}
      }
      const memberIds = member?.id ? [member.id, ...childIds] : [];
      const [sessRes, expRes, compRes, ...enrollResList] = await Promise.allSettled([
        memberClient.get('/courses/sessions', { params: { fromDate, toDate } }),
        memberClient.get('/experience-bookings/my'),
        member?.id ? memberClient.get(`/competitions/registrations/member/${member.id}`) : Promise.resolve({ data: { registrations: [] } }),
        ...memberIds.map(id => memberClient.get(`/courses/member/${id}/enrollments`)),
      ]);

      // 建立 sessionId → enrollment 狀態的對照表（僅有效報名；含子女）
      const enrollMap = {};
      enrollResList.forEach(r => {
        if (r.status !== 'fulfilled') return;
        (r.value.data.enrollments || []).forEach(e => {
          // 月曆不放候補課程（只放正取/請假）
          if (!['confirmed', 'leave'].includes(e.status)) return;
          enrollMap[e.sessionId] = { status: e.status, isMakeup: e.isMakeup || false, memberName: e.memberName };
        });
      });

      // 月曆只顯示「自己（含子女）報名的課程」→ 過濾出有報名的場次
      const allSessions = sessRes.status === 'fulfilled' ? (sessRes.value.data.sessions || []) : [];
      setCalendarSessions(allSessions
        .filter(s => enrollMap[s.id])
        .map(s => ({
          ...s,
          enrollmentStatus: enrollMap[s.id]?.status || null,
          isMakeup: enrollMap[s.id]?.isMakeup || false,
        })));

      if (expRes.status==='fulfilled') {
        const all = expRes.value.data.bookings || [];
        setCalendarExperiences(all.filter(b => b.status !== 'cancelled' && b.bookingDate >= fromDate && b.bookingDate <= toDate));
      }
      if (compRes.status==='fulfilled') {
        const all = compRes.value.data.registrations || [];
        setCalendarCompetitions(all.filter(r => r.status !== 'cancelled' && r.eventDate >= fromDate && r.eventDate <= toDate));
      }
    } catch (e) { setCalendarSessions([]); }
    finally { setCalendarLoading(false); }
  };

  useEffect(() => {
    if (member?.id) {
      memberClient.get('/members/my/children')
        .then(r => setFamilyMembers(r.data.children || []))
        .catch(() => {});
    }
  }, [member?.id]);

  const loadCourses = async () => {
    try {
      const res = await memberClient.get('/courses');
      setCourses(res.data.courses || []);
    } catch (e) {}
  };

  const loadSessions = async (course) => {
    try {
      const fromDate = course.startDate || dayjs().format('YYYY-MM-DD');
      const toDate = course.endDate || dayjs().add(180, 'day').format('YYYY-MM-DD');
      const res = await memberClient.get('/courses/sessions', { params: { fromDate, toDate } });
      const filtered = (res.data.sessions || []).filter(s => s.courseId === course.id);
      setSessions(filtered);
    } catch (e) {}
  };

  const loadMyEnrollments = async () => {
    if (!member?.id) return;
    try {
      // 家長帳號：一併載入子女的報名（否則「幫家庭成員報名」的課程不會出現在我的課程）
      let childIds = familyMembers.map(c => c.id);
      if (childIds.length === 0) {
        try { const r = await memberClient.get('/members/my/children'); childIds = (r.data.children || []).map(c => c.id); } catch (e) {}
      }
      const ids = [member.id, ...childIds];
      const lists = await Promise.all(ids.map(id =>
        memberClient.get(`/courses/member/${id}/enrollments`).then(r => r.data.enrollments || []).catch(() => [])));
      setMyEnrollments(lists.flat());

      // 回填審核中的退費/暫停申請（跨重整持續禁止重複申請＋退費凍結顯示）
      const reqLists = await Promise.all(ids.map(id =>
        memberClient.get(`/course-adjustments/member/${id}`).then(r => r.data.requests || []).catch(() => [])));
      const m = new Map();
      reqLists.flat().filter(r => r.status === 'pending')
        .forEach(r => m.set(adjKey(r.courseId, r.memberId), r.type));
      setPendingAdjust(m);
    } catch (e) {}
  };

  const resetEnrollModal = () => {
    setShowEnrollModal(false); // 關閉報名 Modal（原本漏了此行 → 送出成功後只重置到步驟1、Modal 不關 → 使用者以為失敗重複送出、造成重複報名/重複收費）
    setEnrollSession(null);
    setEnrollStep(1);
    setPaymentMethod('cash');
    setEnrollPlan('full');
    setPaymentDate('');
    setBankLastFive('');
    setHealthNote('');
    setReferralSources([]);
    setConfirmedLeavePolicy(false);
    setConfirmedRefundPolicy(false);
    setPortraitSig(null);
    setGuardianSig(null);
    setScreenshot(null);
    setUploadDone(false);
  };

  const handleEnroll = async () => {
    if (!enrollSession) return;
    setLoading(true);
    try {
      const extraFields = {
        deferPayment: ONLINE_PAYMENT_ENABLED, // 線上付款啟用時延後記帳，改由付款 callback 記
        paymentPlan: enrollPlan,              // full | installment（課程有開分期時）
        paymentDate: paymentDate || null,
        bankLastFive: (paymentMethod === 'cash' && bankLastFive) ? bankLastFive : null,
        healthNote: healthNote || null,
        referralSource: referralSources.length ? referralSources.join('、') : null,
        confirmedLeavePolicy,
        confirmedRefundPolicy,
        portraitSignature: portraitSig || null,
        guardianSignature: guardianSig || null,
      };
      let res;
      if (enrollSession.isCourse) {
        const targetId = enrollForMemberId || member.id;
        const targetName = familyMembers.find(c=>c.id===targetId)?.name || member.name;
        res = await memberClient.post(`/courses/${enrollSession.courseId}/enroll-all`, {
          memberId: targetId,
          gymId,
          paymentMethod,
          memberName: targetName,
          ...extraFields,
        });
      } else {
        const targetId = enrollForMemberId || member.id;
        res = await memberClient.post(`/courses/sessions/${enrollSession.id}/enroll`, {
          memberId: targetId,
          gymId,
          paymentMethod,
          ...extraFields,
        });
      }
      const isWaitlisted = !!(res.data.isWaitlist);
      setEnrollWaitlisted(isWaitlisted);
      const enrInfo = enrollSession.isCourse
        ? { id: res.data.enrollmentId, fee: res.data.fee }
        : { id: res.data.enrollment?.id, fee: res.data.enrollment?.enrollmentFee };
      // 轉帳付款：一律建立 transferRecords（截圖或填末五碼皆可）→ 待辦頁確認收款（候補不收款、跳過）
      if (!isWaitlisted && paymentMethod === 'transfer' && enrInfo.id) {
        try {
          const formData = new FormData();
          if (screenshot) formData.append('screenshot', screenshot);
          formData.append('memberId', member.id);
          formData.append('memberName', member.name || '');
          formData.append('gymId', gymId);
          formData.append('orderType', 'course');
          formData.append('refId', enrInfo.id);
          formData.append('orderName', selectedCourse?.name || '');
          formData.append('courseName', selectedCourse?.name || '');
          formData.append('amount', enrInfo.fee || selectedCourse?.price || 0);
          // 轉帳模式下匯款資訊來自 PaymentSection 的 paymentData（含銀行名稱/末五碼/日期）
          if (paymentData.bankLastFive) formData.append('bankLastFive', paymentData.bankLastFive);
          if (paymentData.bankName) formData.append('bankName', paymentData.bankName);
          if (paymentData.paymentDate) formData.append('paymentDate', paymentData.paymentDate);
          await memberClient.post('/transfers/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          showMsg('轉帳資料已提交，等待工作人員確認收款');
        } catch (uploadErr) {
          showMsg('報名成功，但轉帳資料提交失敗，請至付款紀錄補交');
        }
      }
      resetEnrollModal();
      setScreenshot(null);
      await loadMyEnrollments();
      if (selectedCourse) await loadSessions(selectedCourse);
      if (ONLINE_PAYMENT_ENABLED && enrInfo.id && enrInfo.fee > 0) {
        setPayFor({ enrollmentId: enrInfo.id, fee: enrInfo.fee, gymId });
      } else {
        setEnrollSuccess(true); // 跳出「已報名成功」確認（非線上付款流程）
      }
    } catch (err) {
      showMsg(err.response?.data?.message || '報名失敗', 'red');
    } finally { setLoading(false); }
  };

  const loadBankAccounts = async () => {
    try {
      const res = await memberClient.get('/settings/bank-accounts/member');
      setBankAccounts(res.data.bankAccounts || {});
    } catch (e) {}
  };

  const loadMakeupRights = async () => {
    if (!member?.id) return;
    try {
      const res = await memberClient.get(`/courses/makeup/member/${member.id}`);
      setMakeupRights(res.data.rights || []);
    } catch (e) {}
  };

  const openMakeupModal = async (makeup) => {
    setSelectedMakeup(makeup);
    try {
      // 查詢同類別同館的未來場次（排除自己請假的那堂課）
      const courseRes = await memberClient.get(`/courses`);
      const sameCategoryCourses = (courseRes.data.courses || []).filter(c =>
        // 補課額度未存 categoryId（舊資料）時不以類別過濾，交由後端核銷時驗證
        (!makeup.categoryId || c.categoryId === makeup.categoryId) &&
        c.id !== makeup.courseId &&  // 排除自己請假的課程
        (c.gymId === makeup.gymId || !c.gymId || !makeup.gymId)
      );
      const today = dayjs().format('YYYY-MM-DD');
      // 查「今天～未來180天」全部場次再按課程過濾（不用課程起訖日當範圍——
      // 課程結束後「加開」的未來場次也要即時出現在補課選單）
      const allSessions = [];
      const sres = await memberClient.get('/courses/sessions', {
        params: { fromDate: today, toDate: dayjs().add(180, 'day').format('YYYY-MM-DD') },
      });
      const futureSessions = (sres.data.sessions || []).filter(s => s.date >= today && s.status !== 'cancelled');
      for (const c of sameCategoryCourses) {
        futureSessions.filter(s => s.courseId === c.id).forEach(s => allSessions.push({ ...s, courseName: c.name }));
      }
      setMakeupSessions(allSessions.sort((a,b) => a.date.localeCompare(b.date)));
    } catch (e) {}
    setShowMakeupModal(true);
  };

  const handleMakeup = async (targetSessionId) => {
    if (!selectedMakeup) return;
    setLoading(true);
    try {
      const res = await memberClient.post(`/courses/makeup/${selectedMakeup.id}/use`, {
        memberId: member.id,
        targetSessionId,
      });
      showMsg(res.data.message || '補課報名成功');
      setShowMakeupModal(false);
      await loadMakeupRights();
      await loadMyEnrollments();
    } catch (err) {
      showMsg(err.response?.data?.message || '補課失敗', 'red');
    } finally { setLoading(false); }
  };

  const handleLeave = async (enrollmentId, forMemberId) => {
    if (!leaveReason.trim()) { showMsg('請填寫請假原因', 'red'); return; }
    setLoading(true);
    try {
      const r = await memberClient.post(`/courses/enrollments/${enrollmentId}/leave`, { reason: leaveReason, memberId: forMemberId });
      showMsg(r.data?.message || '請假成功');
      setLeavingId(null);
      setLeaveReason('');
      setOverLimitConfirm(null);
      await loadMyEnrollments();
    } catch (err) {
      showMsg(err.response?.data?.message || '請假失敗', 'red');
    } finally { setLoading(false); }
  };

  // 取消請假（銷假）：後端連動作廢補課資格/取消已報名未上的補課
  const handleCancelMakeup = async () => {
    if (!cancelMakeupTarget) return;
    setLoading(true);
    try {
      const r = await memberClient.post(`/courses/enrollments/${cancelMakeupTarget.enrollmentId}/cancel-makeup`, { memberId: cancelMakeupTarget.memberId });
      showMsg(r.data?.message || '已取消補課');
      setCancelMakeupTarget(null);
      await loadMyEnrollments();
      try { const mk = await memberClient.get(`/courses/makeup/member/${cancelMakeupTarget.memberId || member.id}`); setMakeupRights(mk.data.makeupRights || mk.data.rights || []); } catch(e) {}
    } catch (err) {
      showMsg(err.response?.data?.message || '取消補課失敗', 'red');
      setCancelMakeupTarget(null);
    } finally { setLoading(false); }
  };

  const handleCancelLeave = async () => {
    if (!cancelLeaveTarget) return;
    setLoading(true);
    try {
      const r = await memberClient.post(`/courses/enrollments/${cancelLeaveTarget.enrollmentId}/cancel-leave`, { memberId: cancelLeaveTarget.memberId });
      showMsg(r.data?.message || '已取消請假');
      setCancelLeaveTarget(null);
      await loadMyEnrollments();
    } catch (err) {
      showMsg(err.response?.data?.message || '取消請假失敗', 'red');
      setCancelLeaveTarget(null);
    } finally { setLoading(false); }
  };

  const handleCancelWaitlist = async (group) => {
    setLoading(true);
    try {
      const targetId = group.memberId || member?.id;
      await memberClient.post(`/courses/${group.courseId}/cancel-waitlist`, { memberId: targetId });
      showMsg('已取消候補');
      setCancelWaitlistTarget(null);
      // 樂觀移除該課候補列（避免 Firestore 讀寫延遲導致卡片短暫殘留）
      setMyEnrollments(prev => prev.filter(e => e.courseId !== group.courseId));
      await loadMyEnrollments();
    } catch (err) {
      showMsg(err.response?.data?.message || '取消候補失敗', 'red');
    } finally { setLoading(false); }
  };

  const isEnrolled = (sessionId) => myEnrollments.some(e => e.sessionId === sessionId && e.status !== 'cancelled');

  // Firestore Timestamp（{_seconds}）或 ISO 字串 → dayjs；無則 null
  const tsToDay = (ts) => {
    if (!ts) return null;
    const d = ts._seconds != null ? dayjs(ts._seconds * 1000) : dayjs(ts);
    return d.isValid() ? d : null;
  };
  // 群組的主報名（掛付款期限/狀態的那筆，idx0）：優先有 paymentDeadline，其次有收費，否則第一筆
  const primaryOf = (group) =>
    group.sessions.find(s => s.paymentDeadline) ||
    group.sessions.find(s => (s.enrollmentFee || 0) > 0) ||
    group.sessions[0];

  // 重新上傳轉帳（被退回後補正）：走既有 /transfers/upload，refId=主報名 id；不重設付款期限（後端沿用原值）
  const handleReupload = async () => {
    if (!reuploadTarget) return;
    if (reuploadData.method === 'transfer' && !reuploadFile && !reuploadData.bankLastFive) {
      showMsg('請上傳轉帳截圖或填寫帳號末五碼', 'red'); return;
    }
    setReuploadLoading(true);
    try {
      const fd = new FormData();
      if (reuploadFile) fd.append('screenshot', reuploadFile);
      fd.append('memberId', member.id);
      fd.append('memberName', member.name || '');
      fd.append('gymId', reuploadTarget.gymId || '');
      fd.append('orderType', 'course');
      fd.append('refId', reuploadTarget.enrollmentId);
      fd.append('orderName', reuploadTarget.courseName || '');
      fd.append('courseName', reuploadTarget.courseName || '');
      fd.append('amount', reuploadTarget.amount || 0);
      if (reuploadData.bankLastFive) fd.append('bankLastFive', reuploadData.bankLastFive);
      if (reuploadData.bankName) fd.append('bankName', reuploadData.bankName);
      if (reuploadData.paymentDate) fd.append('paymentDate', reuploadData.paymentDate);
      await memberClient.post('/transfers/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showMsg('已重新提交轉帳，等待工作人員確認收款');
      setReuploadTarget(null); setReuploadFile(null);
      setReuploadData({ method:'transfer', paymentDate:'', bankLastFive:'', bankName:'' });
      await loadMyEnrollments();
    } catch (err) {
      showMsg(err.response?.data?.message || '重新提交失敗', 'red');
    } finally { setReuploadLoading(false); }
  };

  const NavBar = () => (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, width:'100%', background:'#fff', borderTop:'0.5px solid #E8D5D5', display:'flex', height:60, paddingBottom:"env(safe-area-inset-bottom)", zIndex:50 }}>
      {[
        { icon:'🏠', label:'首頁', path:'/member/home' },
        { icon:'📚', label:'課程總覽', path:'/member/courses' },
        { icon:'🎫', label:'我的票券', path:'/member/passes' },
        { icon:'👤', label:'我的', path:'/member/profile' },
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

  // 進行中門數：以「課程＋報名對象」分組，計有效報名(confirmed/leave/waitlist)且未結束（有候補或未來/今日場次）的門數
  const activeCourseCount = (() => {
    const today = dayjs().format('YYYY-MM-DD');
    const groups = {};
    myEnrollments.forEach(e => {
      if (!['confirmed', 'leave', 'waitlist'].includes(e.status)) return;
      const key = `${e.courseId}__${e.memberId}`;
      (groups[key] = groups[key] || []).push(e);
    });
    return Object.values(groups).filter(sess => sess.some(s => s.status === 'waitlist' || s.date >= today)).length;
  })();

  return (
    <div style={{ width:'100%', minHeight:'100vh', background:'#F7F3F3', paddingBottom:80 }}>
      {/* 線上付款 Modal（Phase 1：課程報名）*/}
      {payFor && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:210, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:380, padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontWeight:600, fontSize:15 }}>完成繳費</div>
              <button onClick={()=>{ setPayFor(null); showMsg('報名已保留，可於「我的課程」完成繳費或改用匯款'); }} style={{ background:'none', border:'none', fontSize:20, color:'#999', cursor:'pointer' }}>✕</button>
            </div>
            <PaymentFlow
              client={memberClient}
              orderType="course"
              orderRef={{ enrollmentId: payFor.enrollmentId }}
              amount={payFor.fee}
              gymId={payFor.gymId}
              onPaid={()=>{ setPayFor(null); showMsg('繳費完成，報名已確認！'); loadMyEnrollments(); }}
              onCancel={()=>{ setPayFor(null); showMsg('報名已保留，可於「我的課程」完成繳費或改用匯款'); }}
            />
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{ background:'#fff', padding:'16px 20px', borderBottom:'0.5px solid #E8D5D5', display:'flex', alignItems:'center', gap:10 }}>
        <div onClick={() => navigate('/member/home')} style={{ fontSize:20, cursor:'pointer', color:'#8B1A1A' }}>←</div>
        <div style={{ fontWeight:600, fontSize:15 }}>課程報名</div>
      </div>

      {msg && (
        <div style={{ margin:'12px 16px 0', background: msgType==='ok'?'#E6F4EB':'#FCEBEB', borderRadius:8, padding:'10px 14px', fontSize:13, color: msgType==='ok'?'#2D7D46':'#A32D2D' }}>
          {msg}
        </div>
      )}

      {/* 取消候補確認彈窗 */}
      {cancelWaitlistTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => { if (!loading) setCancelWaitlistTarget(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'24px 22px', width:320, maxWidth:'90vw', boxShadow:'0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#1a1a1a', marginBottom:8, textAlign:'left' }}>取消候補</div>
            <div style={{ fontSize:13, color:'#666', lineHeight:1.7, marginBottom:20, textAlign:'left' }}>
              確定要取消「{cancelWaitlistTarget.courseName}」的候補嗎？取消後將移出候補名單，若要再候補需重新報名。
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setCancelWaitlistTarget(null)} disabled={loading}
                style={{ flex:1, height:44, borderRadius:12, border:'0.5px solid #E8D5D5', background:'#fff', fontSize:14, color:'#6b6b6b', cursor:'pointer' }}>返回</button>
              <button onClick={() => handleCancelWaitlist(cancelWaitlistTarget)} disabled={loading}
                style={{ flex:1, height:44, borderRadius:12, background:'#A32D2D', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: loading?'not-allowed':'pointer' }}>
                {loading ? '處理中...' : '確定取消'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ErrorAlertModal modal={errorModal} onClose={() => setErrorModal(null)} />

      {/* 超過補課上限請假提醒 */}
      {overLimitConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => { if (!loading) setOverLimitConfirm(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'24px 22px', width:320, maxWidth:'90vw', boxShadow:'0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#854F0B', marginBottom:8, textAlign:'left' }}>⚠️ 已超過補課上限</div>
            <div style={{ fontSize:13, color:'#666', lineHeight:1.7, marginBottom:20, textAlign:'left' }}>
              本課程可補課上限為 {overLimitConfirm.leaveLimit} 次、已用完。仍可請假，但<strong>此次請假不會產生補課資格</strong>（無法補課）。確定要請假嗎？
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setOverLimitConfirm(null)} disabled={loading}
                style={{ flex:1, height:44, borderRadius:12, border:'0.5px solid #E8D5D5', background:'#fff', fontSize:14, color:'#6b6b6b', cursor:'pointer' }}>返回</button>
              <button onClick={() => handleLeave(overLimitConfirm.enrollmentId, overLimitConfirm.memberId)} disabled={loading}
                style={{ flex:1, height:44, borderRadius:12, background:'#B26A00', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: loading?'not-allowed':'pointer' }}>
                {loading ? '處理中...' : '仍要請假'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 取消請假（銷假）確認 */}
      {cancelLeaveTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => { if (!loading) setCancelLeaveTarget(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'24px 22px', width:320, maxWidth:'90vw', boxShadow:'0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#1a1a1a', marginBottom:8, textAlign:'left' }}>取消請假</div>
            <div style={{ fontSize:13, color:'#666', lineHeight:1.7, marginBottom:20, textAlign:'left' }}>
              確定取消 {cancelLeaveTarget.dateLabel} 的請假、恢復上課嗎？<br/>
              補課額度將依剩餘請假數重算；<strong>已預約的補課不會被自動取消</strong>。若已預約的補課超過取消後的額度，需先自行取消一堂補課才能取消請假。若名額已被候補遞補，將無法取消。
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setCancelLeaveTarget(null)} disabled={loading}
                style={{ flex:1, height:44, borderRadius:12, border:'0.5px solid #E8D5D5', background:'#fff', fontSize:14, color:'#6b6b6b', cursor:'pointer' }}>返回</button>
              <button onClick={handleCancelLeave} disabled={loading}
                style={{ flex:1, height:44, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: loading?'not-allowed':'pointer' }}>
                {loading ? '處理中...' : '確定取消請假'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 取消補課確認 */}
      {cancelMakeupTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => { if (!loading) setCancelMakeupTarget(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'24px 22px', width:320, maxWidth:'90vw', boxShadow:'0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#1a1a1a', marginBottom:8, textAlign:'left' }}>取消補課</div>
            <div style={{ fontSize:13, color:'#666', lineHeight:1.7, marginBottom:20, textAlign:'left' }}>
              確定取消 {cancelMakeupTarget.dateLabel} 的補課嗎？<br/>
              取消後補課資格會退回，可重新選擇其他場次補課（需於上課一天前取消）。
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setCancelMakeupTarget(null)} disabled={loading}
                style={{ flex:1, height:44, borderRadius:12, border:'0.5px solid #E8D5D5', background:'#fff', fontSize:14, color:'#6b6b6b', cursor:'pointer' }}>返回</button>
              <button onClick={handleCancelMakeup} disabled={loading}
                style={{ flex:1, height:44, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: loading?'not-allowed':'pointer' }}>
                {loading ? '處理中...' : '確定取消補課'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重新上傳轉帳（被退回後補正）*/}
      {reuploadTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => { if (!reuploadLoading) setReuploadTarget(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'22px 20px', width:360, maxWidth:'92vw', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:6, textAlign:'left' }}>重新上傳轉帳</div>
            <div style={{ fontSize:12.5, color:'#666', marginBottom:14, textAlign:'left', lineHeight:1.7 }}>
              {reuploadTarget.courseName}　應付 NT${(reuploadTarget.amount || 0).toLocaleString()}<br/>
              <span style={{ color:'#B5651D' }}>重新上傳不會延長付款期限（沿用原報名期限）。</span>
            </div>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4, textAlign:'left' }}>匯款帳號末五碼</label>
            <input value={reuploadData.bankLastFive} onChange={e => setReuploadData(d => ({ ...d, bankLastFive: e.target.value.replace(/\D/g,'').slice(0,5) }))} maxLength={5} placeholder="末五碼"
              style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', boxSizing:'border-box' }} />
            <label style={{ fontSize:12, color:'#666', display:'block', margin:'10px 0 4px', textAlign:'left' }}>匯款日期</label>
            <input type="date" value={reuploadData.paymentDate} onChange={e => setReuploadData(d => ({ ...d, paymentDate: e.target.value }))}
              style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', boxSizing:'border-box' }} />
            <label style={{ fontSize:12, color:'#666', display:'block', margin:'10px 0 4px', textAlign:'left' }}>轉帳截圖（選填）</label>
            <input type="file" accept="image/*" onChange={e => setReuploadFile(e.target.files?.[0] || null)} style={{ fontSize:12 }} />
            <div style={{ fontSize:11, color:'#999', margin:'6px 0 14px', textAlign:'left' }}>截圖或末五碼至少填一項。</div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setReuploadTarget(null)} disabled={reuploadLoading}
                style={{ flex:1, height:44, borderRadius:12, border:'0.5px solid #E8D5D5', background:'#fff', fontSize:14, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
              <button onClick={handleReupload} disabled={reuploadLoading}
                style={{ flex:1, height:44, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: reuploadLoading?'not-allowed':'pointer' }}>
                {reuploadLoading ? '提交中...' : '確認上傳'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 報名成功確認彈窗 */}
      {enrollSuccess && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setEnrollSuccess(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'28px 22px', width:320, maxWidth:'90vw', textAlign:'center', boxShadow:'0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize:46, marginBottom:10 }}>{enrollWaitlisted ? '📝' : '✅'}</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#1a1a1a', marginBottom:8 }}>{enrollWaitlisted ? '已加入候補名單' : '已報名成功'}</div>
            <div style={{ fontSize:14, color:'#666', lineHeight:1.6, marginBottom:22 }}>
              {enrollWaitlisted
                ? '此班正取已額滿，您已排入候補。候補期間不需付款；遞補為正取後將另行通知繳費。可至「我的課程」查詢。'
                : '可至「我的課程」中查詢。'}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setEnrollSuccess(false)}
                style={{ flex:1, height:44, borderRadius:12, border:'0.5px solid #E8D5D5', background:'#fff', fontSize:14, color:'#6b6b6b', cursor:'pointer' }}>知道了</button>
              <button onClick={() => { setEnrollSuccess(false); setTab('my'); }}
                style={{ flex:1, height:44, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>前往我的課程</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', margin:'12px 16px 0', background:'#FBF5F5', border:'0.5px solid #E8D5D5', borderRadius:8, padding:3 }}>
        {[{key:'browse',label:'課程總覽'},{key:'my',label:`我的課程${activeCourseCount > 0 ? ` (${activeCourseCount} 門進行中)` : ''}`},{key:'calendar',label:'月曆'}].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex:1, height:32, borderRadius:6, border: tab===t.key?'0.5px solid #E8D5D5':'none', background: tab===t.key?'#fff':'none', fontSize:12, fontWeight:500, color: tab===t.key?'#1a1a1a':'#999', cursor:'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 課程總覽 ── */}
      {tab === 'browse' && (
        <div style={{ padding:'12px 16px' }}>
          {/* 館別選取（僅第一層類別列表顯示）*/}
          {!selectedCourse && !selectedCategory && (
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              {[{id:'',label:'全部館別'},{id:'gym-hsinchu',label:'新竹館'},{id:'gym-shilin',label:'士林館'}].map(g => (
                <button key={g.id} onClick={() => { setBrowseGymId(g.id); setSelectedCategory(null); }}
                  style={{ height:34, padding:'0 14px', borderRadius:20, border:`1.5px solid ${browseGymId===g.id?'#8B1A1A':'#E8D5D5'}`, background:browseGymId===g.id?'#8B1A1A':'#fff', color:browseGymId===g.id?'#fff':'#666', fontSize:12, fontWeight:browseGymId===g.id?600:400, cursor:'pointer' }}>
                  {g.label}
                </button>
              ))}
            </div>
          )}
          {!selectedCourse ? (
            // 兩層式：第一層【類別】一課一卡 → 點進去 → 第二層列該類別各梯次 → 選一個 → 進報名
            (() => {
              const list = browseGymId ? courses.filter(c => c.gymId === browseGymId) : courses;
              if (list.length === 0) return (
                <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:40, textAlign:'center', color:'#999', fontSize:13 }}>
                  {browseGymId ? '此館目前沒有開放報名的課程' : '目前沒有開放報名的課程'}
                </div>
              );
              const groups = {};
              list.forEach(c => { const k = c.categoryName || '其他'; if (!groups[k]) groups[k] = []; groups[k].push(c); });
              const names = Object.keys(groups).sort((a, b) => a === '其他' ? 1 : b === '其他' ? -1 : a.localeCompare(b, 'zh-Hant'));

              // ── 第二層：某類別的梯次清單 ──
              if (selectedCategory) {
                const cohorts = groups[selectedCategory] || [];
                if (cohorts.length === 0) return (
                  <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:40, textAlign:'center', color:'#999', fontSize:13 }}>
                    此類別目前沒有開放報名的梯次
                    <div><button onClick={() => setSelectedCategory(null)} style={{ marginTop:12, background:'none', border:'none', color:'#8B1A1A', fontSize:13, cursor:'pointer' }}>← 返回類別</button></div>
                  </div>
                );
                // 梯次排序：週一→週日（週日排最後），同日再依開始時間
                const wkKey = (c) => { const d = (c.weekdays && c.weekdays.length) ? c.weekdays[0] : 99; return d === 0 ? 7 : d; };
                const sorted = [...cohorts].sort((a, b) => wkKey(a) - wkKey(b) || (a.startTime || '').localeCompare(b.startTime || ''));
                const catPoster = cohorts.map(c => c.categoryImageUrl || c.imageUrl).find(Boolean);
                const catDesc = cohorts.map(c => c.categoryDescription || c.description).find(Boolean);
                return (
                  <>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                      <button onClick={() => setSelectedCategory(null)}
                        style={{ background:'none', border:'none', fontSize:20, color:'#8B1A1A', cursor:'pointer' }}>←</button>
                      <div style={{ fontWeight:700, fontSize:16 }}>{(() => { const ids = [...new Set(cohorts.map(c => c.gymId))]; return ids.length === 1 ? gymPrefix(ids[0]) : ''; })()}{selectedCategory}</div>
                      <span style={{ fontSize:12, color:'#999' }}>{cohorts.length} 梯</span>
                    </div>
                    {/* 先看到圖片＋課程說明，再看各梯資訊 */}
                    {(catPoster || catDesc) && (
                      <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', marginBottom:14, overflow:'hidden' }}>
                        {catPoster && (
                          <img src={catPoster} alt={selectedCategory} style={{ width:'100%', display:'block', objectFit:'cover' }} />
                        )}
                        {catDesc && (
                          <div style={{ padding:14, fontSize:13, color:'#555', whiteSpace:'pre-wrap', lineHeight:1.7, textAlign:'left' }}>
                            {catDesc}
                          </div>
                        )}
                      </div>
                    )}
                    {sorted.map(c => {
                      const remaining = Math.max(0, (c.maxStudents || 0) - (c.enrolledCount || 0));
                      const isFull = c.statusLabel === 'full' || remaining <= 0;
                      return (
                        <div key={c.id} onClick={() => setSelectedCourse(c)}
                          style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, marginBottom:10, cursor:'pointer' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                            <div style={{ fontWeight:600, fontSize:15 }}>{gymPrefix(c.gymId)}{c.name}</div>
                            {isFull
                              ? <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#F3E0E0', color:'#8B1A1A' }}>額滿</span>
                              : <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#E4F3E8', color:'#1B7A3D' }}>剩 {remaining} 位</span>}
                          </div>
                          <div style={{ fontSize:12, color:'#777', lineHeight:1.7 }}>
                            <div>🗓 每週{c.weekdays?.map(d => WEEKDAYS[d]).join('、')} {c.startTime}～{c.endTime}</div>
                            <div>📅 {c.startDate} ～ {c.endDate}</div>
                            <div>👟 教練：{c.instructor || '—'}</div>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                            <div style={{ fontSize:18, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace' }}>
                              NT${(c.price||0).toLocaleString()}
                            </div>
                            <div style={{ display:'flex', gap:6 }}>
                              <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#E6F1FB', color:'#185FA5' }}>
                                {c.type === 'weekly' ? '週課' : '工作坊'}
                              </span>
                              {c.installment?.enabled && (
                                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#FAEEDA', color:'#854F0B' }}>可分期</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              }

              // ── 第一層：大類分區 → 每個班別一張卡（僅一梯者點卡直接進報名，跳過中間層）──
              const GROUP_LABEL = { adult: '成人班', youth: '青少年兒童班', special: '專班課程', workshop: '工作坊' };
              const GROUP_ORDER = ['adult', 'youth', 'special', 'workshop'];
              const byGroup = {};
              names.forEach(gname => {
                const gk = GROUP_ORDER.includes(groups[gname][0]?.categoryGroup) ? groups[gname][0].categoryGroup : 'special';
                (byGroup[gk] = byGroup[gk] || []).push(gname);
              });
              const renderCatCard = (gname) => {
                const g = groups[gname];
                const prices = g.map(c => c.price || 0);
                const minP = Math.min(...prices), maxP = Math.max(...prices);
                const anyInstallment = g.some(c => c.installment?.enabled);
                const single = g.length === 1;
                // 類別若全屬同一館 → 前綴該館別；跨館（全部館別檢視）則不前綴
                const catGymIds = [...new Set(g.map(c => c.gymId))];
                const catPrefix = catGymIds.length === 1 ? gymPrefix(catGymIds[0]) : '';
                return (
                  <div key={gname} onClick={() => single ? setSelectedCourse(g[0]) : setSelectedCategory(gname)}
                    style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', marginBottom:10, cursor:'pointer', overflow:'hidden' }}>
                    <div style={{ padding:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                      <div style={{ fontWeight:700, fontSize:16 }}>{catPrefix}{gname}</div>
                      <span style={{ fontSize:12, color:'#8B1A1A', fontWeight:600 }}>{single ? '報名 ›' : `${g.length} 梯 ›`}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ fontSize:18, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace' }}>
                        NT${minP.toLocaleString()}{maxP !== minP && `～${maxP.toLocaleString()}`}
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#E6F1FB', color:'#185FA5' }}>
                          {g[0].type === 'weekly' ? '週課' : '工作坊'}
                        </span>
                        {anyInstallment && (
                          <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#FAEEDA', color:'#854F0B' }}>可分期</span>
                        )}
                      </div>
                    </div>
                    {single && (
                      <div style={{ fontSize:12, color:'#999', marginTop:6 }}>
                        每週{g[0].weekdays?.map(d => WEEKDAYS[d]).join('、')} {g[0].startTime}～{g[0].endTime} · {g[0].startDate} 起
                      </div>
                    )}
                    </div>
                  </div>
                );
              };
              return GROUP_ORDER.filter(gk => byGroup[gk]?.length).map(gk => (
                <div key={gk} style={{ marginBottom:18 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#8B1A1A', margin:'0 0 8px 2px', textAlign:'left' }}>{GROUP_LABEL[gk]}</div>
                  {byGroup[gk].map(gname => renderCatCard(gname))}
                </div>
              ));
            })()
          ) : (
            // 場次列表
            <>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <button onClick={() => setSelectedCourse(null)}
                  style={{ background:'none', border:'none', fontSize:20, color:'#8B1A1A', cursor:'pointer' }}>←</button>
                <div style={{ fontWeight:600, fontSize:15 }}>{gymPrefix(selectedCourse.gymId)}{selectedCourse.name}</div>
              </div>
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', marginBottom:12, overflow:'hidden' }}>
                {(selectedCourse.categoryImageUrl || selectedCourse.imageUrl) && (
                  <img src={selectedCourse.categoryImageUrl || selectedCourse.imageUrl} alt={selectedCourse.name} style={{ width:'100%', display:'block', objectFit:'cover' }} />
                )}
                {/* 課程簡介：從類別層進來已看過（不重複）；單一梯次「直接跳報名頁」時在此顯示（否則簡介永遠沒機會出現） */}
                {!selectedCategory && (selectedCourse.categoryDescription || selectedCourse.description) && (
                  <div style={{ padding:'14px 14px 0', fontSize:13, color:'#555', whiteSpace:'pre-wrap', lineHeight:1.7, textAlign:'left' }}>
                    {selectedCourse.categoryDescription || selectedCourse.description}
                  </div>
                )}
                <div style={{ padding:14 }}>
                  <div style={{ fontSize:12, color:'#666' }}>
                    {selectedCourse.startDate} ～ {selectedCourse.endDate}
                    {selectedCourse.instructor && ` · 教練：${selectedCourse.instructor}`}
                  </div>
                  <div style={{ fontSize:13, color:'#999', marginTop:4 }}>
                    每週{selectedCourse.weekdays?.map(d => WEEKDAYS[d]).join('、')} {selectedCourse.startTime}～{selectedCourse.endTime}
                  </div>
                </div>
              </div>

              {/* 週課：整個課程報名 */}
              {selectedCourse.type === 'weekly' && (() => {
                const alreadyEnrolled = myEnrollments.some(e => e.courseId === selectedCourse.id && e.status !== 'cancelled');
                const today = dayjs().format('YYYY-MM-DD');
                const completedCount = sessions.filter(s => s.courseId === selectedCourse.id && s.date < today && s.status !== 'cancelled').length;
                const totalCount = sessions.filter(s => s.courseId === selectedCourse.id && s.status !== 'cancelled').length;
                const isLateJoin = completedCount > 0;
                const remainingCount = totalCount - completedCount;
                const ratio = totalCount > 0 ? remainingCount / totalCount : 1;
                const isBelowHalf = ratio < 0.5;
                const surcharge = selectedCourse.midpointSurcharge || 1.05;
                const baseFee = isLateJoin
                  ? Math.round(selectedCourse.price * ratio * (isBelowHalf ? surcharge : 1))
                  : selectedCourse.price;
                const isTeam = !!member?.isTeamMember;
                const teamDiscount = isTeam && baseFee >= 100 ? Math.round(baseFee * 0.1) : 0;
                const fee = baseFee - teamDiscount;
                // 名額是否已滿（正取）→ 報名將進候補。enrolledCount 已含 reservedSlots
                const capRemaining = (selectedCourse.maxStudents || 0) - (selectedCourse.enrolledCount || 0);
                const isCourseFull = selectedCourse.statusLabel === 'full' || capRemaining <= 0;

                return (
                  <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                    <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>
                      共 {totalCount} 堂 · 已開始 {completedCount} 堂 · 剩餘 {remainingCount} 堂
                    </div>
                    {isCourseFull && !alreadyEnrolled && (
                      <div style={{ background:'#F3E0E0', borderRadius:8, padding:'10px 12px', marginBottom:12, fontSize:12.5, color:'#8B1A1A', lineHeight:1.7, textAlign:'left' }}>
                        ⚠️ 此班正取已額滿。報名將加入<b>候補名單</b>，<b>候補期間不需付款</b>；待有名額遞補為正取後，我們會另行通知您繳費。
                      </div>
                    )}
                    {isLateJoin && !isCourseFull && (
                      <div style={{ background:'#FAEEDA', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#854F0B', textAlign:'left' }}>
                        插班報名：剩餘 {remainingCount}/{totalCount} 堂，費用依比例計算
                        {isBelowHalf && ` × ${surcharge}（低於一半加成）`}
                      </div>
                    )}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <div style={{ fontSize:20, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace' }}>
                        NT${fee.toLocaleString()}
                        {baseFee !== fee && (
                          <span style={{ fontSize:12, color:'#999', textDecoration:'line-through', marginLeft:8 }}>
                            NT${baseFee.toLocaleString()}
                          </span>
                        )}
                        {isCourseFull && <span style={{ fontSize:12, color:'#999', fontFamily:'inherit', marginLeft:8 }}>（遞補後收費）</span>}
                      </div>
                      {teamDiscount > 0 && (
                        <span style={{ fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#FAEEDA', color:'#854F0B' }}>
                          🏔️ 隊員九折
                        </span>
                      )}
                    </div>
                    {alreadyEnrolled ? (
                      <div style={{ textAlign:'center', padding:'10px 0', color:'#2D7D46', fontWeight:600, fontSize:14 }}>
                        ✓ 已報名此課程
                      </div>
                    ) : (
                      <button onClick={() => {
                        setEnrollSession({ id: sessions.find(s => s.courseId === selectedCourse.id && s.date >= today)?.id, courseId: selectedCourse.id, isCourse: true, fee, isWaitlist: isCourseFull });
                        setShowEnrollModal(true);
                      }}
                        style={{ width:'100%', height:44, borderRadius:10, background: isCourseFull?'#B5651D':'#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:500, cursor:'pointer' }}>
                        {isCourseFull ? '加入候補名單' : '報名課程'}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* 工作坊：選場次報名 */}
              {selectedCourse.type === 'workshop' && sessions.filter(s => s.status !== 'cancelled').map(s => {
                const enrolled = isEnrolled(s.id);
                const full = s.enrolledCount >= s.maxStudents;
                return (
                  <div key={s.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:14 }}>
                          {dayjs(s.date).format('MM/DD')}（{WEEKDAYS[dayjs(s.date).day()]}）
                        </div>
                        <div style={{ fontSize:12, color:'#999', marginTop:2 }}>
                          {s.startTime}～{s.endTime}{s.instructor && ` · ${s.instructor}`}
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        {full && !enrolled && (
                          <div style={{ fontSize:12, color:'#A32D2D' }}>額滿</div>
                        )}
                        {enrolled ? (
                          <span style={{ fontSize:11, background:'#E6F4EB', color:'#2D7D46', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>已報名</span>
                        ) : (
                          <button onClick={() => { setEnrollSession(s); setShowEnrollModal(true); }}
                            style={{ marginTop:4, height:30, padding:'0 12px', borderRadius:8, background: full?'#f5f5f5':'#8B1A1A', color: full?'#999':'#fff', border:'none', fontSize:12, cursor: full?'not-allowed':'pointer' }}
                            disabled={full}>
                            {full ? '候補' : '報名'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── 月曆 ── */}
      {tab === 'calendar' && (
        <div style={{ padding:'12px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:14, marginBottom:14 }}>
            <button onClick={() => { setCalendarMonth(dayjs(`${calendarMonth}-01`).subtract(1,'month').format('YYYY-MM')); setCalendarSelectedDate(null); }}
              style={{ width:32, height:32, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', cursor:'pointer', fontSize:15, color:'#333', fontWeight:600 }}>‹</button>
            <div style={{ fontSize:15, fontWeight:600, minWidth:90, textAlign:'center' }}>{dayjs(`${calendarMonth}-01`).format('YYYY年MM月')}</div>
            <button onClick={() => { setCalendarMonth(dayjs(`${calendarMonth}-01`).add(1,'month').format('YYYY-MM')); setCalendarSelectedDate(null); }}
              style={{ width:32, height:32, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', cursor:'pointer', fontSize:15, color:'#333', fontWeight:600 }}>›</button>
          </div>

          {calendarLoading ? (
            <div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}>載入中...</div>
          ) : (() => {
            const startOfMonth = dayjs(`${calendarMonth}-01`);
            const daysInMonth = startOfMonth.daysInMonth();
            const firstDow = startOfMonth.day();
            const cells = [];
            for (let i = 0; i < firstDow; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(startOfMonth.date(d).format('YYYY-MM-DD'));

            const sessionsForDate = (date) => calendarSessions.filter(s => s.date === date);
            const experiencesForDate = (date) => calendarExperiences.filter(b => b.bookingDate === date);
            const competitionsForDate = (date) => calendarCompetitions.filter(r => r.eventDate === date);
            const today = dayjs().format('YYYY-MM-DD');

            return (
              <>
                <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden', marginBottom:14 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))', background:'#FBF5F5' }}>
                    {WEEKDAYS.map(d => <div key={d} style={{ padding:'7px 0', textAlign:'center', fontSize:11, color:'#999', fontWeight:600 }}>{d}</div>)}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))' }}>
                    {cells.map((date, idx) => {
                      const daySessions = date ? sessionsForDate(date) : [];
                      const uniqueCourses = [...new Set(daySessions.map(s => s.courseId))];
                      const isToday = date === today;
                      const isSelected = date === calendarSelectedDate;
                      return (
                        <div key={idx} onClick={() => { if (date && (daySessions.length > 0 || experiencesForDate(date).length > 0 || competitionsForDate(date).length > 0)) setCalendarSelectedDate(date); }}
                          style={{
                            minHeight:52, borderRight:'0.5px solid #F5EFEF', borderBottom:'0.5px solid #F5EFEF',
                            padding:5, cursor: date && (daySessions.length > 0 || experiencesForDate(date).length > 0 || competitionsForDate(date).length > 0) ? 'pointer' : 'default',
                            background: isSelected ? '#FBF0F0' : isToday ? '#FFFBF0' : '#fff',
                          }}>
                          {date && (
                            <>
                              <div style={{ fontSize:11, color: isToday ? '#8B1A1A' : '#999', fontWeight: isToday ? 700 : 400 }}>{dayjs(date).date()}</div>
                              <div style={{ marginTop:2 }}>
                                {uniqueCourses.slice(0,3).map(cid => {
                                  const sess = daySessions.find(s=>s.courseId===cid);
                                  const name = sess?.courseName || '';
                                  const isLeave = sess?.enrollmentStatus === 'leave';
                                  const isMakeup = sess?.isMakeup === true;
                                  const isCancelled = sess?.enrollmentStatus === 'course_cancelled';
                                  const col = courseColor(cid);
                                  const bg = isCancelled ? '#F0F0F0' : isLeave ? '#F2F2F2' : isMakeup ? '#E9F6EE' : col.bg;
                                  const fg = isCancelled ? '#aaa' : isLeave ? '#999' : isMakeup ? '#2D7D46' : col.fg;
                                  const suffix = isCancelled ? '已取消' : isLeave ? '請假' : isMakeup ? '補課' : '';
                                  return (
                                    <div key={cid} style={{ background:bg, borderRadius:4, padding:'1px 3px', marginBottom:1, overflow:'hidden' }}>
                                      <span style={{ fontSize:9, color:fg, fontWeight:600, lineHeight:1.35, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>
                                        {suffix ? `${name}(${suffix})` : name}
                                      </span>
                                    </div>
                                  );
                                })}
                                {experiencesForDate(date).slice(0,2).map((b,i) => (
                                  <div key={`exp_${i}`} style={{ background:'#EAF3FB', borderRadius:4, padding:'1px 3px', marginBottom:1 }}>
                                    <span style={{ fontSize:9, color:'#185FA5', fontWeight:600, lineHeight:1.35 }}>體驗</span>
                                  </div>
                                ))}
                                {competitionsForDate(date).slice(0,2).map((r,i) => (
                                  <div key={`comp_${i}`} style={{ background:'#FBF3E3', borderRadius:4, padding:'1px 3px', marginBottom:1, overflow:'hidden' }}>
                                    <span style={{ fontSize:9, color:'#854F0B', fontWeight:600, lineHeight:1.35, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>比賽</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {calendarSelectedDate && (() => {
                  const daySessions = sessionsForDate(calendarSelectedDate);
                  const byCourse = {};
                  daySessions.forEach(s => {
                    if (!byCourse[s.courseId]) byCourse[s.courseId] = { courseId: s.courseId, courseName: s.courseName, sessions: [] };
                    byCourse[s.courseId].sessions.push(s);
                  });
                  return (
                    <div>
                      <div style={{ fontSize:12, color:'#999', marginBottom:8 }}>{dayjs(calendarSelectedDate).format('MM月DD日')}（{WEEKDAYS[dayjs(calendarSelectedDate).day()]}）</div>
                      {experiencesForDate(calendarSelectedDate).map(b => (
                        <div key={b.id} style={{ background:'#E6F1FB', borderRadius:12, border:'0.5px solid #B5D4F4', padding:12, marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div>
                            <div style={{ fontWeight:600, fontSize:14 }}>🧗 體驗課程預約</div>
                            <div style={{ fontSize:12, color:'#666', marginTop:3 }}>
                              {b.bookingTime} · {b.gymId==='gym-hsinchu'?'新竹館':'士林館'} · {b.numParticipants}人
                            </div>
                            <div style={{ fontSize:11, marginTop:2, color: b.status==='confirmed'?'#2D7D46':'#854F0B' }}>
                              {b.status==='confirmed'?'✓ 已確認':'待確認付款'}
                            </div>
                          </div>
                          <div style={{ fontSize:22 }}>🧗</div>
                        </div>
                      ))}
                      {competitionsForDate(calendarSelectedDate).map(r => (
                        <div key={r.id} style={{ background:'#FFF3E0', borderRadius:12, border:'0.5px solid #FFCC80', padding:12, marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div>
                            <div style={{ fontWeight:600, fontSize:14 }}>🏆 {r.competitionName || '比賽'}</div>
                            <div style={{ fontSize:12, color:'#666', marginTop:3 }}>{r.divisionName || ''}</div>
                            <div style={{ fontSize:11, marginTop:2, color: r.paymentStatus==='confirmed'?'#2D7D46':'#854F0B' }}>
                              {r.paymentStatus==='confirmed'?'✓ 已確認付款':'待確認付款'}
                            </div>
                          </div>
                          <div style={{ fontSize:22 }}>🏆</div>
                        </div>
                      ))}
                      {Object.values(byCourse).map(group => {
                        const isExpanded = calendarExpandedCourseId === group.courseId;
                        const courseInfo = courses.find(c => c.id === group.courseId);
                        const groupSession = group.sessions[0];
                        const isLeaveGroup = groupSession?.enrollmentStatus === 'leave';
                        const isMakeupGroup = groupSession?.isMakeup === true;
                        const isCancelledGroup = groupSession?.enrollmentStatus === 'course_cancelled';
                        return (
                          <div key={group.courseId} style={{ background: isLeaveGroup?'#F5F5F5':isMakeupGroup?'#F0F8F0':'#fff', borderRadius:12, border:`0.5px solid ${isLeaveGroup?'#DDD':isMakeupGroup?'#B3DEC0':'#E8D5D5'}`, padding:14, marginBottom:10 }}>
                            <div onClick={() => setCalendarExpandedCourseId(isExpanded ? null : group.courseId)} style={{ cursor:'pointer' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                <div style={{ fontWeight:600, fontSize:14, color: isLeaveGroup?'#999':isMakeupGroup?'#2D7D46':'#1a1a1a' }}>
                                  {group.courseName}
                                  {isCancelledGroup && <span style={{ fontSize:10, fontWeight:600, marginLeft:6, padding:'1px 6px', borderRadius:6, background:'#FCEBEB', color:'#A32D2D' }}>課程已取消</span>}
                                  {isLeaveGroup && <span style={{ fontSize:10, fontWeight:600, marginLeft:6, padding:'1px 6px', borderRadius:6, background:'#EEE', color:'#999' }}>已請假</span>}
                                  {isMakeupGroup && <span style={{ fontSize:10, fontWeight:600, marginLeft:6, padding:'1px 6px', borderRadius:6, background:'#E6F4EB', color:'#2D7D46' }}>安排補課</span>}
                                </div>
                                <span style={{ fontSize:11, color:'#8B1A1A' }}>{isExpanded ? '收合 ▲' : '查看場次表 ▼'}</span>
                              </div>
                            </div>
                            {isExpanded && (
                              <div style={{ marginTop:10, paddingTop:10, borderTop:'0.5px solid #F5EFEF' }}>
                                {group.sessions.sort((a,b) => a.date.localeCompare(b.date)).map(s => (
                                  <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'7px 0', fontSize:12, borderBottom:'0.5px solid #FBF5F5' }}>
                                    <span>{dayjs(s.date).format('MM/DD')}（{WEEKDAYS[dayjs(s.date).day()]}）{s.startTime}～{s.endTime}
                                      {s.isMakeup && <span style={{ fontSize:10, fontWeight:600, color:'#2D7D46', background:'#E6F4EB', padding:'1px 6px', borderRadius:6, marginLeft:6 }}>補課</span>}
                                    </span>
                                    {s.instructor && (
                                      <span style={{ color: s.isSubstitute ? '#B26A00' : '#999', flexShrink:0 }}>
                                        👟 {s.instructor}{s.isSubstitute ? '（代班）' : ''}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {!calendarSelectedDate && (
                  <div style={{ textAlign:'center', padding:30, color:'#999', fontSize:12 }}>點選上方日期查看當天課程</div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── 我的課程 ── */}
      {tab === 'my' && (
        <div style={{ padding:'12px 16px' }}>
          {/* 補課資格 */}
          {makeupRights.filter(m => m.status === 'available').length > 0 && (
            <div style={{ background:'#FAEEDA', borderRadius:12, border:'0.5px solid #F5C97A', padding:14, marginBottom:14 }}>
              <div style={{ fontWeight:600, fontSize:13, color:'#854F0B', marginBottom:8 }}>
                📋 補課資格（{makeupRights.filter(m => m.status === 'available').length} 筆）
              </div>
              {makeupRights.filter(m => m.status === 'available').map(m => {
                // 該課退費審核中 → 凍結補課資格（後端亦權威擋 REFUND_PENDING）
                const frozen = pendingAdjust.get(adjKey(m.courseId, m.memberId || member?.id)) === 'refund';
                return (
                <div key={m.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, background:'#fff', borderRadius:8, padding:'8px 12px', opacity: frozen ? 0.55 : 1 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{m.courseName}</div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                      有效期至 {dayjs(m.expiresAt?._seconds ? new Date(m.expiresAt._seconds * 1000) : m.expiresAt).format('MM/DD')}
                    </div>
                  </div>
                  {frozen ? (
                    <span style={{ fontSize:11, color:'#A32D2D', fontWeight:600, flexShrink:0 }}>退費審核中</span>
                  ) : (
                  <button onClick={() => openMakeupModal(m)}
                    style={{ height:32, padding:'0 14px', borderRadius:8, background:'#854F0B', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>
                    選擇補課
                  </button>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {!myEnrollments.some(e => ['confirmed','leave','waitlist'].includes(e.status) || (e.status === 'cancelled' && e.cancelReason === 'payment_expired')) ? (
            // 無「可顯示」報名（全部已取消/失效）→ 顯示空狀態，避免整頁空白
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:40, textAlign:'center', color:'#999', fontSize:13 }}>
              尚未報名任何課程
            </div>
          ) : (() => {
            // 按「課程＋報名對象」分組（家長帳號含子女報名，需分開不可合併）
            const byCourse = {};
            myEnrollments.forEach(e => {
              const key = `${e.courseId}__${e.memberId}`;
              if (!byCourse[key]) byCourse[key] = { courseName: e.courseName, courseId: e.courseId, gymId: e.gymId, memberId: e.memberId, memberName: e.memberName, sessions: [] };
              byCourse[key].sessions.push(e);
            });
            return Object.values(byCourse).map(group => {
              const confirmed = group.sessions.filter(s => s.status === 'confirmed');
              const onLeave = group.sessions.filter(s => s.status === 'leave');
              const waitlist = group.sessions.filter(s => s.status === 'waitlist');
              // 候補群組：無正取、僅候補（非正式學員，隱藏請假/退費/暫停等正取功能）
              const isWaitlistGroup = confirmed.length === 0 && onLeave.length === 0 && waitlist.length > 0;
              const waitlistPos = waitlist.find(s => s.waitlistPosition != null)?.waitlistPosition;
              const groupKey = `${group.courseId}__${group.memberId}`;
              const isForChild = group.memberId && member?.id && group.memberId !== member.id; // 幫子女報名的課
              // 報名對象姓名：以家庭成員清單為準（enroll-all 曾把 memberName 存成家長名，不可信）
              const childName = familyMembers.find(c => c.id === group.memberId)?.name || group.memberName;
              // 有家庭成員時，每張課卡都標報名學員（本人或子女）
              const hasFamily = familyMembers.length > 0;
              const enrolleeName = isForChild ? childName : (member?.name || '');
              const enrolleeIcon = isForChild ? '👦' : '👤';
              // 全數已取消/失效 → 一般不顯示幽靈卡；但「因逾期未付款自動取消」需回饋給會員（顯示已取消卡）
              if (confirmed.length === 0 && onLeave.length === 0 && waitlist.length === 0) {
                const expiredCancel = group.sessions.some(s => s.status === 'cancelled' && s.cancelReason === 'payment_expired');
                if (!expiredCancel) return null;
                const grpKey = `${group.courseId}__${group.memberId}`;
                const eName = (familyMembers.find(c => c.id === group.memberId)?.name) || group.memberName;
                const showChild = group.memberId && member?.id && group.memberId !== member.id;
                return (
                  <div key={grpKey} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, marginBottom:10, opacity:0.75 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <div style={{ fontWeight:600, fontSize:15, color:'#666' }}>
                        {gymPrefix(group.gymId)}{group.courseName}
                        {familyMembers.length > 0 && eName && <span style={{ fontSize:11, fontWeight:600, color:'#185FA5', background:'#E6F1FB', padding:'2px 8px', borderRadius:10, marginLeft:8 }}>{showChild ? '👦' : '👤'} {eName}</span>}
                      </div>
                      <span style={{ fontSize:11, background:'#F0EDED', color:'#999', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>已取消</span>
                    </div>
                    <div style={{ fontSize:12, color:'#A32D2D', textAlign:'left', lineHeight:1.6 }}>因逾期未付款，此報名已自動取消、名額已釋出。如仍要上課請重新報名。</div>
                  </div>
                );
              }
              const today = dayjs().format('YYYY-MM-DD');
              const future = confirmed.filter(s => s.date >= today).sort((a,b) => a.date.localeCompare(b.date));
              const past = confirmed.filter(s => s.date < today).sort((a,b) => b.date.localeCompare(a.date));
              const next = future[0];
              const leaveLimit = group.sessions.find(s => s.leaveLimit != null)?.leaveLimit ?? 2;
              const leaveRemaining = group.sessions.find(s => s.leaveRemaining != null)?.leaveRemaining ?? Math.max(0, leaveLimit - onLeave.length);
              // 課程起迄日：優先課程設定，否則用本人場次最早/最晚日
              const gCourse = courses.find(c => c.id === group.courseId);
              const _dates = group.sessions.map(s => s.date).filter(Boolean).sort();
              const rangeStart = gCourse?.startDate || _dates[0];
              const rangeEnd = gCourse?.endDate || _dates[_dates.length - 1];
              const isExpanded = expandedCourseId === groupKey;
              const attendedLabel = (s) => {
                if (s.attendanceStatus === 'present') return { text:'已出席', color:'#2D7D46', bg:'#E6F4EB' };
                if (s.attendanceStatus === 'absent') return { text:'缺席', color:'#A32D2D', bg:'#FCEBEB' };
                return { text:'已上課（未點名）', color:'#999', bg:'#F5F5F5' };
              };
              // 付款狀態（主報名 idx0）：待付款倒數 / 被退回待補正
              const primary = primaryOf(group);
              // 審核中的申請：退費審核中＝凍結（隱藏請假等操作、入場資格後端已即時取消）
              const adjType = pendingAdjust.get(adjKey(group.courseId, group.memberId));
              const refundFrozen = adjType === 'refund' || group.sessions.some(s => s.refundPending === true);
              const makeupOnly = group.sessions.length > 0 && group.sessions.every(s => s.isMakeup === true); // 補課群組：只可取消補課、不可退費/暫停/請假
              const pDeadline = tsToDay(primary?.paymentDeadline);
              const pConfirmed = primary?.paymentConfirmed === true;
              const isRejected = primary?.paymentStatus === 'transfer_rejected';
              const awaitingPay = !pConfirmed && !!pDeadline && ['pending','pending_confirm'].includes(primary?.paymentStatus);
              return (
                <div key={groupKey} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, cursor:'pointer' }}
                    onClick={() => setExpandedCourseId(isExpanded ? null : groupKey)}>
                    <div style={{ fontWeight:600, fontSize:15 }}>
                      {gymPrefix(group.gymId)}{group.courseName}
                      {hasFamily && enrolleeName && <span style={{ fontSize:11, fontWeight:600, color:'#185FA5', background:'#E6F1FB', padding:'2px 8px', borderRadius:10, marginLeft:8 }}>{enrolleeIcon} {enrolleeName}</span>}
                      {refundFrozen && <span style={{ fontSize:11, fontWeight:600, color:'#A32D2D', background:'#FCEBEB', padding:'2px 8px', borderRadius:10, marginLeft:8 }}>退費審核中</span>}
                      {makeupOnly && <span style={{ fontSize:11, fontWeight:600, color:'#2D7D46', background:'#E6F4EB', padding:'2px 8px', borderRadius:10, marginLeft:8 }}>補課</span>}
                    </div>
                    {isWaitlistGroup ? (
                      <span style={{ fontSize:11, background:'#FAEEDA', color:'#B5651D', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>
                        候補中{waitlistPos ? `・第 ${waitlistPos} 位` : ''}
                      </span>
                    ) : (
                      <span style={{ fontSize:11, background:'#E6F4EB', color:'#2D7D46', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>
                        已報名
                      </span>
                    )}
                  </div>

                  {/* 轉帳被退回：待補正 + 重新上傳（期限沿用原值、不延長） */}
                  {!isWaitlistGroup && isRejected && (
                    <div style={{ background:'#FCEBEB', border:'0.5px solid #F0C4C4', borderRadius:8, padding:'10px 12px', marginBottom:8, textAlign:'left' }}>
                      <div style={{ fontSize:12.5, color:'#A32D2D', fontWeight:600 }}>轉帳被退回{primary?.paymentRejectReason ? `：${primary.paymentRejectReason}` : ''}</div>
                      <div style={{ fontSize:11.5, color:'#B5651D', marginTop:3, lineHeight:1.6 }}>
                        {pDeadline ? `請於 ${pDeadline.format('YYYY-MM-DD HH:mm')} 前重新上傳轉帳，逾期未確認將自動取消報名。` : '請重新上傳轉帳。'}
                      </div>
                      <button onClick={() => { setReuploadTarget({ enrollmentId: primary.id, courseName: group.courseName, amount: primary.enrollmentFee || 0, memberId: group.memberId, gymId: primary.gymId }); setReuploadData({ method:'transfer', paymentDate:'', bankLastFive:'', bankName:'' }); setReuploadFile(null); }}
                        style={{ marginTop:8, height:30, padding:'0 14px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                        重新上傳轉帳
                      </button>
                    </div>
                  )}
                  {/* 待付款倒數 */}
                  {!isWaitlistGroup && !isRejected && awaitingPay && (
                    <div style={{ background:'#FFF6E6', border:'0.5px solid #F0D9A0', borderRadius:8, padding:'9px 12px', marginBottom:8, textAlign:'left' }}>
                      <div style={{ fontSize:12, color:'#8B6914', lineHeight:1.6 }}>
                        ⏳ {primary?.paymentStatus === 'pending_confirm' ? '轉帳待工作人員確認' : '待付款'}：請於 <b>{pDeadline.format('YYYY-MM-DD HH:mm')}</b> 前完成付款，逾期未確認將自動取消報名、釋出名額。
                      </div>
                    </div>
                  )}

                  {isWaitlistGroup ? (
                    <div style={{ fontSize:12, color:'#B5651D', marginBottom:8, lineHeight:1.6, textAlign:'left' }}>
                      您已排入候補名單，等待正取名額釋出。遞補為正取後將另行通知您繳費；在此之前不需付款。
                    </div>
                  ) : (
                    <>
                      {(rangeStart || rangeEnd) && (
                        <div style={{ fontSize:12, color:'#666', marginBottom:4, textAlign:'left' }}>📅 {rangeStart} ～ {rangeEnd}</div>
                      )}
                      <div style={{ fontSize:12, color:'#999', marginBottom:8, cursor:'pointer' }}
                        onClick={() => setExpandedCourseId(isExpanded ? null : groupKey)}>
                        共 {confirmed.length + onLeave.length} 堂 · 剩餘 {future.length} 堂{!makeupOnly && <> · 已請假 {onLeave.length} 堂 · <span style={{ color: leaveRemaining<=0?'#A32D2D':'#2D7D46', fontWeight:600 }}>可請假剩餘 {leaveRemaining} 次</span></>}
                        <span style={{ marginLeft:6, color:'#8B1A1A' }}>{isExpanded ? '收合 ▲' : '查看完整紀錄 ▼'}</span>
                      </div>
                    </>
                  )}

                  {isWaitlistGroup ? (
                    <div style={{ display:'flex', gap:6, marginTop:8 }}>
                      <button onClick={() => setCancelWaitlistTarget(group)} disabled={loading}
                        style={{ height:28, padding:'0 12px', borderRadius:6, background:'#fff', color:'#A32D2D', border:'0.5px solid #A32D2D', fontSize:11, cursor: loading?'not-allowed':'pointer' }}>
                        取消候補
                      </button>
                    </div>
                  ) : makeupOnly ? (
                    <div style={{ fontSize:11, color:'#999', marginTop:8, textAlign:'left' }}>補課場次：如無法出席請於上課一天前「取消補課」；不可申請退費／暫停／請假。</div>
                  ) : (
                  <div style={{ display:'flex', gap:6, marginTop:8 }}>
                    {(() => { const dis = !!adjType || refundFrozen; return (<>
                    <button onClick={() => setAdjustModal({ type:'refund', enrollmentId: group.courseId, courseName: group.courseName, memberId: group.memberId })}
                      disabled={dis}
                      style={{ height:28, padding:'0 10px', borderRadius:6, background:'#fff', color: dis ? '#ccc' : '#A32D2D', border:`0.5px solid ${dis ? '#ccc' : '#A32D2D'}`, fontSize:11, cursor: dis ? 'not-allowed' : 'pointer' }}>
                      {refundFrozen ? '退費審核中' : '申請退費'}
                    </button>
                    <button onClick={() => setAdjustModal({ type:'pause', enrollmentId: group.courseId, courseName: group.courseName, memberId: group.memberId })}
                      disabled={dis}
                      style={{ height:28, padding:'0 10px', borderRadius:6, background:'#fff', color: dis ? '#ccc' : '#8B6914', border:`0.5px solid ${dis ? '#ccc' : '#8B6914'}`, fontSize:11, cursor: dis ? 'not-allowed' : 'pointer' }}>
                      {adjType === 'pause' ? '暫停審核中' : '申請暫停'}
                    </button>
                    </>); })()}
                  </div>
                  )}
                  {refundFrozen && (
                    <div style={{ background:'#FCEBEB', border:'0.5px solid #F0C4C4', borderRadius:8, padding:'9px 12px', marginTop:8, fontSize:12, color:'#A32D2D', textAlign:'left', lineHeight:1.6 }}>
                      退費申請審核中：此課程的入場學員資格與上課、請假、補課、暫停等操作已暫停；若申請被退回將自動恢復。
                    </div>
                  )}

                  {!isExpanded && next && (
                    <div style={{ background:'#FBF5F5', borderRadius:8, padding:'8px 12px', marginBottom:10 }}>
                      <div style={{ fontSize:11, color:'#999', marginBottom:3 }}>下一堂</div>
                      <div style={{ fontSize:13, fontWeight:500 }}>
                        {dayjs(next.date).format('MM/DD')}（{WEEKDAYS[dayjs(next.date).day()]}）{next.startTime}～{next.endTime}
                      </div>
                    </div>
                  )}

                  {isExpanded && (
                    <div style={{ marginTop:4, marginBottom:10 }}>
                      {past.length > 0 && (
                        <div style={{ marginBottom:10 }}>
                          <div style={{ fontSize:11, color:'#999', fontWeight:600, marginBottom:6 }}>已上課</div>
                          {past.map(s => {
                            const a = attendedLabel(s);
                            return (
                              <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 10px', background:'#FBFBFB', borderRadius:6, marginBottom:4 }}>
                                <span style={{ fontSize:12 }}>{dayjs(s.date).format('MM/DD')}（{WEEKDAYS[dayjs(s.date).day()]}）{s.startTime}～{s.endTime}</span>
                                <span style={{ fontSize:10, fontWeight:600, color:a.color, background:a.bg, padding:'2px 7px', borderRadius:8 }}>{a.text}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {onLeave.length > 0 && (
                        <div style={{ marginBottom:10 }}>
                          <div style={{ fontSize:11, color:'#999', fontWeight:600, marginBottom:6 }}>已請假</div>
                          {onLeave.sort((a,b) => b.date.localeCompare(a.date)).map(s => {
                            const notStarted = s.date >= dayjs().format('YYYY-MM-DD'); // 課未開始才可取消請假（後端權威再驗上課時間/名額）
                            return (
                            <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 10px', background:'#FBFBFB', borderRadius:6, marginBottom:4, gap:6, flexWrap:'wrap' }}>
                              <span style={{ fontSize:12 }}>{dayjs(s.date).format('MM/DD')}（{WEEKDAYS[dayjs(s.date).day()]}）{s.startTime}～{s.endTime}</span>
                              <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ fontSize:10, fontWeight:600, color:'#854F0B', background:'#FAEEDA', padding:'2px 7px', borderRadius:8 }}>請假{s.leaveReason ? `：${s.leaveReason}` : ''}</span>
                                {notStarted && !refundFrozen && (
                                  <button onClick={() => setCancelLeaveTarget({ enrollmentId: s.id, memberId: group.memberId, dateLabel: `${dayjs(s.date).format('MM/DD')} ${s.startTime}～${s.endTime}` })}
                                    style={{ height:22, padding:'0 8px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:10, cursor:'pointer' }}>取消請假</button>
                                )}
                              </span>
                            </div>
                            );
                          })}
                        </div>
                      )}

                      {future.length > 0 && (
                        <div>
                          <div style={{ fontSize:11, color:'#999', fontWeight:600, marginBottom:6 }}>未來場次</div>
                          {future.map(s => (
                            <div key={s.id} style={{ padding:'7px 10px', background:'#FBFBFB', borderRadius:6, marginBottom:4 }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                <span style={{ fontSize:12 }}>{dayjs(s.date).format('MM/DD')}（{WEEKDAYS[dayjs(s.date).day()]}）{s.startTime}～{s.endTime}</span>
                                {s.isMakeup ? (
                                  <span style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                                    <span style={{ fontSize:10, fontWeight:600, color:'#2D7D46', background:'#E6F4EB', padding:'2px 7px', borderRadius:8 }}>補課</span>
                                    {dayjs().format('YYYY-MM-DD') < s.date && (
                                      <button onClick={() => setCancelMakeupTarget({ enrollmentId: s.id, memberId: group.memberId, dateLabel: `${dayjs(s.date).format('MM/DD')} ${s.startTime}～${s.endTime}` })}
                                        style={{ height:24, padding:'0 9px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:11, cursor:'pointer' }}>取消補課</button>
                                    )}
                                  </span>
                                ) : leavingId !== s.id && !refundFrozen && (
                                  <button onClick={() => setLeavingId(s.id)}
                                    style={{ height:24, padding:'0 9px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:11, cursor:'pointer' }}>
                                    申請請假
                                  </button>
                                )}
                              </div>
                              {leavingId === s.id && !refundFrozen && (
                                <div style={{ marginTop:6 }}>
                                  <input value={leaveReason} onChange={ev => setLeaveReason(ev.target.value)}
                                    placeholder="請假原因"
                                    style={{ width:'100%', height:32, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:12, outline:'none', boxSizing:'border-box', marginBottom:6, color:'#1a1a1a' }}/>
                                  <div style={{ display:'flex', gap:6 }}>
                                    <button onClick={() => { setLeavingId(null); setLeaveReason(''); }}
                                      style={{ flex:1, height:28, borderRadius:6, background:'#f5f5f5', border:'none', fontSize:11, cursor:'pointer' }}>取消</button>
                                    <button onClick={() => {
                                        if (!leaveReason.trim()) { showMsg('請填寫請假原因', 'red'); return; }
                                        // 超過補課上限：仍可請假但不產生補課資格 → 先跳提醒框
                                        if (leaveRemaining <= 0) setOverLimitConfirm({ enrollmentId: s.id, memberId: group.memberId, leaveLimit });
                                        else handleLeave(s.id, group.memberId);
                                      }} disabled={loading}
                                      style={{ flex:1, height:28, borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>確認請假</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!isExpanded && next && !refundFrozen && leavingId === next.id ? (
                    <div>
                      <input value={leaveReason} onChange={ev => setLeaveReason(ev.target.value)}
                        placeholder="請假原因（下一堂）"
                        style={{ width:'100%', height:34, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', marginBottom:6, color:'#1a1a1a' }}/>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => { setLeavingId(null); setLeaveReason(''); }}
                          style={{ flex:1, height:32, borderRadius:6, background:'#f5f5f5', border:'none', fontSize:12, cursor:'pointer' }}>取消</button>
                        <button onClick={() => handleLeave(next.id, group.memberId)} disabled={loading}
                          style={{ flex:1, height:32, borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>確認請假</button>
                      </div>
                    </div>
                  ) : !isExpanded && next && !refundFrozen && (
                    next.isMakeup ? (
                      dayjs().format('YYYY-MM-DD') < next.date ? (
                        <button onClick={() => setCancelMakeupTarget({ enrollmentId: next.id, memberId: group.memberId, dateLabel: `${dayjs(next.date).format('MM/DD')} ${next.startTime}～${next.endTime}` })}
                          style={{ width:'100%', height:32, borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:12, cursor:'pointer' }}>
                          取消補課（下一堂）
                        </button>
                      ) : null
                    ) : (
                    <button onClick={() => setLeavingId(next.id)}
                      style={{ width:'100%', height:32, borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:12, cursor:'pointer' }}>
                      申請請假（下一堂）
                    </button>
                    )
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* 報名 Modal */}
      {showEnrollModal && enrollSession && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'16px 16px 0 0', width:'100%', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
            {/* Header */}
            <div style={{ padding:'16px 20px 12px', borderBottom:'0.5px solid #F0E8E8', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                <div style={{ fontWeight:600, fontSize:15 }}>{enrollSession.isWaitlist ? '候補報名' : '確認報名'} — {selectedCourse?.name}</div>
                <button onClick={resetEnrollModal} style={{ background:'none', border:'none', fontSize:20, color:'#999', cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {[(enrollSession.isWaitlist ? '候補說明' : '付款資訊'),'健康備註','規則確認','肖像授權'].map((s,i) => (
                  <div key={i} style={{ flex:1, height:3, borderRadius:2, background: enrollStep > i+1 ? '#2D7D46' : enrollStep === i+1 ? '#8B1A1A' : '#E8D5D5' }} />
                ))}
              </div>
              <div style={{ fontSize:11, color:'#999', marginTop:4, textAlign:'center' }}>步驟 {enrollStep} / 4</div>
            </div>

            {/* Scrollable content */}
            <div style={{ overflowY:'auto', flex:1, padding:'16px 20px' }}>

            {targetUnder5 && (
              <div style={{ background:'#FDECEC', border:'0.5px solid #F0C4C4', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#B3261E', textAlign:'left' }}>
                {enrollTarget?.name || '報名對象'} 未滿 5 歲，無法報名課程。
              </div>
            )}

            {/* Step 1: 付款資訊 */}
            {enrollStep === 1 && (<>
              {/* 為誰報名 */}
              {familyMembers.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>為誰報名</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button onClick={()=>setEnrollForMemberId(null)}
                      style={{ padding:'6px 14px', borderRadius:20, border:`1.5px solid ${!enrollForMemberId?'#8B1A1A':'#E8D5D5'}`, background:!enrollForMemberId?'#FBF5F5':'#fff', color:!enrollForMemberId?'#8B1A1A':'#666', fontSize:12, cursor:'pointer', fontWeight:!enrollForMemberId?600:400 }}>
                      👤 {member?.name}（本人）
                    </button>
                    {familyMembers.map(c=>(
                      <button key={c.id} onClick={()=>setEnrollForMemberId(c.id)}
                        style={{ padding:'6px 14px', borderRadius:20, border:`1.5px solid ${enrollForMemberId===c.id?'#8B1A1A':'#E8D5D5'}`, background:enrollForMemberId===c.id?'#FBF5F5':'#fff', color:enrollForMemberId===c.id?'#8B1A1A':'#666', fontSize:12, cursor:'pointer', fontWeight:enrollForMemberId===c.id?600:400 }}>
                        {c.gender==='male'?'👦':c.gender==='female'?'👧':'🧒'} {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ background:'#FBF5F5', borderRadius:8, padding:'10px 12px', marginBottom:14 }}>
                <div style={{ fontSize:12, color:'#666' }}>
                  {enrollForMemberId ? `報名人：${familyMembers.find(c=>c.id===enrollForMemberId)?.name} ｜ ` : ''}
                  {dayjs(enrollSession.date).format('MM/DD')}（{WEEKDAYS[dayjs(enrollSession.date).day()]}）{enrollSession.startTime}～{enrollSession.endTime}
                </div>
              </div>
              {enrollSession.isWaitlist ? (
                <div style={{ background:'#F3E0E0', borderRadius:8, padding:'12px 14px', fontSize:13, color:'#8B1A1A', lineHeight:1.8, textAlign:'left' }}>
                  此班正取已額滿，您將加入<b>候補名單</b>。<br/>
                  候補期間<b>不需付款</b>；待有名額遞補為正取後，我們會另行通知您繳費，屆時再選擇付款方式。
                  {(enrollSession?.fee || selectedCourse?.price) ? <><br/><span style={{ fontSize:12, color:'#999' }}>遞補後費用約 NT${((enrollSession?.fee || selectedCourse?.price)||0).toLocaleString()}（依實際堂數計算）</span></> : null}
                </div>
              ) : (<>
              <PaymentPlanChoice installment={selectedCourse?.installment} price={enrollSession?.fee || selectedCourse?.price}
                plan={enrollPlan} hideMethod onChange={({ plan }) => setEnrollPlan(plan)} />
              <PaymentSection
                value={paymentData}
                methods={['cash','transfer']} /* 課程端隱藏電子支付，只留現金/轉帳 */
                onChange={d => { setPaymentData(d); setPaymentMethod(d.method); }}
                amount={(() => { const full = enrollSession?.fee || selectedCourse?.price || 0; const fp = (selectedCourse?.installment?.periods||[])[0]?.percent; return (enrollPlan==='installment' && fp) ? Math.round(full*(Number(fp)||0)/100) : full; })()}
                bankInfo={bankAccounts[gymId] ? { bankName: bankAccounts[gymId].bankName, branch: bankAccounts[gymId].branch||'', account: bankAccounts[gymId].accountNumber, accountName: bankAccounts[gymId].accountName } : null}
              />
              {(paymentData.method==='cash'||paymentData.method==='transfer') && (
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>上傳匯款截圖（選填）</label>
                  <input type="file" accept="image/*" onChange={e => setScreenshot(e.target.files[0])} style={{ fontSize:12, width:'100%' }}/>
                  {screenshot && <div style={{ fontSize:11, color:'#2D7D46', marginTop:4 }}>✓ {screenshot.name}</div>}
                </div>
              )}
              </>)}
            </>)}

            {/* Step 2: 健康備註 + 得知管道 */}
            {enrollStep === 2 && (<>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#333', fontWeight:500, display:'block', marginBottom:6 }}>健康狀況備註</label>
                <div style={{ fontSize:11, color:'#999', marginBottom:8 }}>請告知教練您的體能、健康狀況或需注意事項（選填）</div>
                <textarea value={healthNote} onChange={e => setHealthNote(e.target.value)} rows={4}
                  placeholder="例：膝蓋舊傷、腰椎問題、無特殊狀況..."
                  style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 10px', fontSize:13, resize:'none', outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
              </div>
              <div>
                <label style={{ fontSize:12, color:'#333', fontWeight:500, display:'block', marginBottom:8 }}>如何得知本課程？<span style={{ color:'#999', fontWeight:400 }}>（可複選）</span></label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {['親友介紹','Facebook粉絲頁','臉書社團','網路搜尋','櫃檯人員介紹','傳單','參加過紅石課程','參加紅石體驗'].map(src => {
                    const checked = referralSources.includes(src);
                    return (
                    <label key={src} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:`0.5px solid ${checked?'#8B1A1A':'#E8D5D5'}`, background: checked?'#FBF5F5':'#fff', cursor:'pointer', fontSize:13 }}>
                      <input type="checkbox" value={src} checked={checked}
                        onChange={() => setReferralSources(prev => prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src])}
                        style={{ accentColor:'#8B1A1A' }}/>
                      {src}
                    </label>
                    );
                  })}
                </div>
              </div>
            </>)}

            {/* Step 3: 規則確認 */}
            {enrollStep === 3 && (<>
              <div style={{ marginBottom:16 }}>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>📋 課程請假/補課方式</div>
                <div style={{ background:'#FBF5F5', borderRadius:8, padding:'12px 14px', fontSize:12, color:'#444', lineHeight:1.8, marginBottom:10, textAlign:'left' }}>
                  1. 每期最多可請假 2 次，超過則不予補課。特殊狀況（受傷等不可抗因素）得申請展延。<br/>
                  2. 請假最晚於課前 2 小時告知，否則視為自行放棄，不予補課。<br/>
                  3. 補課可安排其他梯次，最晚於補課前一天告知。<br/>
                  4. 補課請於課程結束後 2 週內完成，逾期視同放棄。
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8, border:`1.5px solid ${confirmedLeavePolicy?'#2D7D46':'#E8D5D5'}`, background: confirmedLeavePolicy?'#E6F4EB':'#fff', cursor:'pointer' }}>
                  <input type="checkbox" checked={confirmedLeavePolicy} onChange={e => setConfirmedLeavePolicy(e.target.checked)} style={{ width:18, height:18, accentColor:'#2D7D46' }}/>
                  <span style={{ fontSize:13, fontWeight:500, color: confirmedLeavePolicy?'#2D7D46':'#444' }}>我已了解課程請假/補課方式</span>
                </label>
              </div>
              <div>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>💰 退費方式（依政府規定）</div>
                {(() => { const _r = Math.round(((selectedCourse?.refundFeeRate ?? 0.2)) * 100); return (
                <div style={{ background:'#FBF5F5', borderRadius:8, padding:'12px 14px', fontSize:12, color:'#444', lineHeight:1.8, marginBottom:10, textAlign:'left' }}>
                  退費金額＝<strong>剩餘堂數價金 − 手續費</strong><br/>
                  1. 每堂單價＝課程費用 ÷ 總堂數；剩餘堂數＝總堂數 − 已開課堂數（不論有無出席/請假）。<br/>
                  2. 手續費＝剩餘堂數價金 × <strong>{_r}%</strong>。<br/>
                  3. 範例：20 堂 30,000 元、上了 10 堂後申請 → 剩餘價金 15,000 − 手續費 {_r}%＝退還 NT${(15000 - Math.round(15000*_r/100)).toLocaleString()}。
                </div>
                ); })()}
                <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8, border:`1.5px solid ${confirmedRefundPolicy?'#2D7D46':'#E8D5D5'}`, background: confirmedRefundPolicy?'#E6F4EB':'#fff', cursor:'pointer' }}>
                  <input type="checkbox" checked={confirmedRefundPolicy} onChange={e => setConfirmedRefundPolicy(e.target.checked)} style={{ width:18, height:18, accentColor:'#2D7D46' }}/>
                  <span style={{ fontSize:13, fontWeight:500, color: confirmedRefundPolicy?'#2D7D46':'#444' }}>我已了解退費方式</span>
                </label>
              </div>
            </>)}

            {/* Step 4: 肖像授權 */}
            {enrollStep === 4 && (<>
              <div style={{ background:'#FBF5F5', borderRadius:8, padding:'12px 14px', marginBottom:16, fontSize:12, color:'#444', lineHeight:1.8 }}>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:6 }}>【肖像權授權同意聲明】</div>
                本課程進行期間，紅石攀岩館將進行局部拍攝與錄影。學員報名本課程，即視為同意授權紅石攀岩館得將含有學員肖像之照片、影像及聲音，基於課程招生或活動宣傳目的，進行編輯、重製，並公開發表於官方網站、社群平台等宣傳管道。若有不便入鏡之需求，請於課程開始時主動告知。
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6 }}>本人簽名（請以正楷書寫）</label>
                <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, background:'#FBF5F5', overflow:'hidden' }}>
                  <SignaturePad ref={courseSigRef} height={200}/>
                </div>
                <div style={{ display:'flex', gap:8, marginTop:6 }}>
                  <button type="button" onClick={()=>{ courseSigRef.current?.clear(); setPortraitSig(null); }} style={{ height:26, padding:'0 10px', borderRadius:6, background:'#FBF5F5', color:'#666', border:'0.5px solid #E8D5D5', fontSize:11, cursor:'pointer' }}>清除</button>
                  <button type="button" onClick={()=>setPortraitSig(courseSigRef.current?.toDataURL()||null)} style={{ height:26, padding:'0 10px', borderRadius:6, background:'#2D7D46', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>儲存簽名</button>
                </div>
                {portraitSig && <div style={{ fontSize:11, color:'#2D7D46', marginTop:4 }}>✓ 已儲存</div>}
              </div>
              {targetIsMinor && (
                <div>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6 }}>法定代理人簽名（報名對象未滿 18 歲必填）</label>
                  <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, background:'#FBF5F5', overflow:'hidden' }}>
                    <SignaturePad ref={courseGuardianSigRef} height={200}/>
                  </div>
                  <div style={{ display:'flex', gap:8, marginTop:6 }}>
                    <button type="button" onClick={()=>{ courseGuardianSigRef.current?.clear(); setGuardianSig(null); }} style={{ height:26, padding:'0 10px', borderRadius:6, background:'#FBF5F5', color:'#666', border:'0.5px solid #E8D5D5', fontSize:11, cursor:'pointer' }}>清除</button>
                    <button type="button" onClick={()=>setGuardianSig(courseGuardianSigRef.current?.toDataURL()||null)} style={{ height:26, padding:'0 10px', borderRadius:6, background:'#2D7D46', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>儲存簽名</button>
                  </div>
                  {guardianSig && <div style={{ fontSize:11, color:'#2D7D46', marginTop:4 }}>✓ 法定代理人已儲存</div>}
                </div>
              )}
            </>)}

            </div>

            {/* Footer buttons */}
            <div style={{ padding:'12px 20px', borderTop:'0.5px solid #F0E8E8', flexShrink:0, display:'flex', gap:8 }}>
              {enrollStep > 1 && (
                <button onClick={() => setEnrollStep(s => s-1)}
                  style={{ flex:1, height:44, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>← 上一步</button>
              )}
              {enrollStep < 4 ? (
                <button onClick={() => {
                  if (enrollStep === 3 && (!confirmedLeavePolicy || !confirmedRefundPolicy)) {
                    showMsg('請確認請假與退費方式', 'red'); return;
                  }
                  setEnrollStep(s => s+1);
                }}
                  style={{ flex:2, height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                  下一步 →
                </button>
              ) : (
                <button onClick={handleEnroll} disabled={loading || targetUnder5 || !portraitSig || (targetIsMinor && !guardianSig)}
                  style={{ flex:2, height:44, borderRadius:10, background: (targetUnder5 || !portraitSig || (targetIsMinor && !guardianSig)) ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor: (targetUnder5 || !portraitSig) ? 'not-allowed' : 'pointer' }}>
                  {loading ? '送出中...' : (enrollSession.isWaitlist ? '✓ 確認加入候補' : '✓ 確認報名')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

            {/* 補課 Modal */}
      {showMakeupModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', overflow:'hidden' }}>
          <div style={{ background:'#fff', borderRadius:'16px 16px 0 0', padding:24, width:'100%', maxWidth:'100vw', maxHeight:'80vh', overflowY:'auto', boxSizing:'border-box' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontWeight:600, fontSize:16 }}>選擇補課場次</div>
              <button onClick={() => setShowMakeupModal(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
            </div>
            <div style={{ fontSize:12, color:'#999', marginBottom:14 }}>
              {selectedMakeup?.courseName} · 同類別同館場次
            </div>
            {(() => {
              const targetMid = selectedMakeup?.memberId || member?.id;
              const appliedIds = new Set(myEnrollments.filter(e => e.isMakeup && e.status === 'confirmed' && e.memberId === targetMid).map(e => e.sessionId));
              const availList = makeupSessions.filter(s => !appliedIds.has(s.id));
              const appliedList = makeupSessions.filter(s => appliedIds.has(s.id));
              return (<>
            {appliedList.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#2D7D46', marginBottom:6 }}>已申請補課的場次</div>
                {appliedList.map(s => (
                  <div key={`ap_${s.id}`} style={{ background:'#F0F8F0', border:'0.5px solid #B3DEC0', borderRadius:10, padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontWeight:500, fontSize:14 }}>{dayjs(s.date).format('MM/DD')}（{WEEKDAYS[dayjs(s.date).day()]}）</div>
                      <div style={{ fontSize:12, color:'#999', marginTop:2 }}>{s.startTime}～{s.endTime} · {s.courseName}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, color:'#2D7D46', background:'#E6F4EB', padding:'3px 10px', borderRadius:8, flexShrink:0 }}>已申請補課</span>
                  </div>
                ))}
                <div style={{ fontSize:10, color:'#999', textAlign:'left' }}>如需更改，請至「我的課程」該補課場次按「取消補課」（上課一天前）。</div>
              </div>
            )}
            {appliedList.length > 0 && availList.length > 0 && (
              <div style={{ fontSize:12, fontWeight:600, color:'#666', marginBottom:6 }}>可補課的場次</div>
            )}
            {availList.length === 0 ? (
              appliedList.length === 0 ? <div style={{ textAlign:'center', padding:32, color:'#999', fontSize:13 }}>目前沒有可補課的場次</div> : null
            ) : availList.map(s => (
              <div key={s.id} style={{ background:'#FBF5F5', borderRadius:10, padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontWeight:500, fontSize:14 }}>
                    {dayjs(s.date).format('MM/DD')}（{WEEKDAYS[dayjs(s.date).day()]}）
                  </div>
                  <div style={{ fontSize:12, color:'#999', marginTop:2 }}>
                    {s.startTime}～{s.endTime} · {s.courseName}
                  </div>
                </div>
                <button onClick={() => handleMakeup(s.id)} disabled={loading || s.enrolledCount >= s.maxStudents}
                  style={{ height:34, padding:'0 14px', borderRadius:8, background: s.enrolledCount >= s.maxStudents ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor: s.enrolledCount >= s.maxStudents ? 'not-allowed' : 'pointer' }}>
                  {s.enrolledCount >= s.maxStudents ? '額滿' : '補課'}
                </button>
              </div>
            ))}
              </>);
            })()}
          </div>
        </div>
      )}

      {/* 退費/暫停申請 Modal */}
      {adjustModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:20, width:'100%', maxWidth:400 }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:4 }}>
              {adjustModal.type === 'refund' ? '申請退費' : '申請暫停課程'}
            </div>
            <div style={{ fontSize:13, color:'#999', marginBottom:16 }}>{adjustModal.courseName}</div>
            {adjustModal.type === 'pause' && (
              <div style={{ background:'#FFF8E6', border:'0.5px solid #F5D87A', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:12, color:'#8B6914' }}>
                ⚠ 暫停期間將移除課程學員入場資格，恢復後由管理員重新加回
              </div>
            )}
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6 }}>原因</label>
            <textarea value={adjustReason} onChange={e => setAdjustReason(e.target.value)} rows={3}
              placeholder={adjustModal.type === 'refund' ? '請說明退費原因' : '請說明暫停原因（如長期出差、受傷等）'}
              style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 10px', fontSize:13, resize:'none', outline:'none', boxSizing:'border-box' }} />
            <div style={{ display:'flex', gap:10, marginTop:14 }}>
              <button onClick={() => { setAdjustModal(null); setAdjustReason(''); }}
                style={{ flex:1, height:42, borderRadius:10, background:'#fff', color:'#666', border:'0.5px solid #E8D5D5', fontSize:14, cursor:'pointer' }}>取消</button>
              <button onClick={handleAdjustSubmit} disabled={adjustLoading}
                style={{ flex:2, height:42, borderRadius:10, background: adjustModal.type === 'refund' ? '#A32D2D' : '#8B6914', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                {adjustLoading ? '送出中...' : '送出申請'}
              </button>
            </div>
          </div>
        </div>
      )}

      <MemberLogoutButton />
      <NavBar />
    </div>
  );
}
