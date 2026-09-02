import { useState, useEffect, useRef } from 'react';
import client from '../../api/client';
import { scanQrCode, confirmCheckIn, cancelCheckIn, getTodayStats, getTodayCourseStudents, getCheckInHistory, getCheckinInvoices, createCheckinInvoice, voidCheckinInvoice, scanRentalAddon, confirmRentalAddon, getRentalAddonInvoices, createRentalAddonInvoice } from '../../api/checkin';
import { getGyms } from '../../api/gyms';
import { useAuth } from '../../store/authStore';
import { useEnabledPayments, filterPayments } from '../../utils/paymentMethods';
import SegmentedTabs from '../../components/SegmentedTabs';
import dayjs from 'dayjs';
import jsQR from 'jsqr';
import { entryLabelOf, invoiceEntryItemName, invoiceRentalItemName } from '../../utils/entryLabel';
import useRefetchOnFocus from '../../hooks/useRefetchOnFocus';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import InvoiceIssuer, { RealPrintPanel } from '../../components/InvoiceIssuer';
import { InvoiceButtonAuto } from '../../components/InvoiceButton';
import Modal from '../../components/Modal';
import { getRegistrationInvoices, createRegistrationInvoice, voidCompetitionInvoice } from '../../api/competitions';
import { getCourseInvoices, createCourseInvoice, voidCourseInvoice } from '../../api/members';

const ENTRY_TYPE_LABEL = {
  pass: '定期票', vip: 'VIP', course_access: '課程學員',
  child_free: '兒童入場', student_free: '學生入場',
  discount_card: '優惠折扣券', black_card: '黑卡',
  single_entry_ticket: '單次入場券', single_ticket: '單次購票',
  buy_discount_card: '購買優惠折扣券', buy_pass: '購買定期票', already_paid: '已付費（舊系統）',
  competition: '比賽報到',
};

const PAYMENT_LABEL = { cash:'現金', linepay:'Line Pay', jkopay:'街口支付', taiwanpay:'台灣 Pay' };

export default function CheckinPage() {
  const enabledPay = useEnabledPayments();
  const { staff, operator, activeGymId, viewGym } = useAuth();
  const isSuperAdmin = staff?.role === 'super_admin';
  const isManagerOnly = ['super_admin', 'gym_manager'].includes(staff?.role); // 下載明細限管理員
  // 入場動作限值班(operator)/管理員（與後端 requireManagerOrStation 一致）；報表 tab 不限
  const canCheckin = ['super_admin', 'gym_manager'].includes(staff?.role) || !!operator;
  // 歷史入場查詢限管理員「個人帳號」使用（2026-08-08 先擋個人正職/兼職未值班；2026-08-13 再拍板
  // 擴大擋「值班 operator」——含館長/系統管理員值班身分時也一併擋，與後端 checkin.js /history 對齊）
  const canViewHistory = ['super_admin', 'gym_manager'].includes(staff?.role) && !operator;
  const [gyms, setGyms] = useState([]);
  // 場館由頂部全域選擇器控制；入場屬操作類，super_admin 個人登入時「全館」退回第一個館
  const targetGymId = activeGymId || staff?.gymId || (isSuperAdmin ? (viewGym || gyms[0]?.id || '') : '');

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setIsMobile(window.innerWidth < 768), 150);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (isSuperAdmin && !activeGymId && !staff?.gymId) {
      getGyms().then(res => setGyms(res.data.gyms || [])).catch(() => {});
    }
  }, [isSuperAdmin, activeGymId]);

  const [trend, setTrend] = useState(null);   // 每日入場數折線（本月 vs 上月）
  useEffect(() => {
    // 圖表延後到瀏覽器閒置才載入，讓「今日課程學員/統計」先出來（非關鍵資訊、不阻塞主內容）
    let cancelled = false;
    const run = () => {
      // super_admin 不帶 gymId → 後端回兩館各自序列，圖表分線（新竹紅/士林藍）
      client.get('/checkin/monthly-daily-counts', { params: { gymId: isSuperAdmin ? undefined : (targetGymId || undefined) } })
        .then(r => { if (!cancelled) setTrend(r.data); }).catch(() => { if (!cancelled) setTrend({ data: [] }); });
    };
    const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 1200));
    const cic = window.cancelIdleCallback || clearTimeout;
    const id = ric(run, { timeout: 2500 });
    return () => { cancelled = true; cic(id); };
  }, [targetGymId, isSuperAdmin]);

  const [courseStudents, setCourseStudents] = useState([]);
  const [courseStudentsLoading, setCourseStudentsLoading] = useState(false);
  const [quickCheckinLoading, setQuickCheckinLoading] = useState(null); // memberId 正在處理中

  // ⚠️ 由 targetGymId 效果、快速入場成功後、視窗取得焦點三處觸發；連續快速入場多位學員可能讓
  // 多次載入重疊，用序號只採用最新一次回應，避免過期資料蓋掉最新學員名單。
  const courseStudentsSeqRef = useRef(0);
  const loadCourseStudents = async () => {
    if (!targetGymId) return;
    const seq = ++courseStudentsSeqRef.current;
    setCourseStudentsLoading(true);
    try {
      const res = await getTodayCourseStudents(targetGymId);
      if (seq !== courseStudentsSeqRef.current) return;
      setCourseStudents(res.data.students || []);
    } catch (e) { if (seq === courseStudentsSeqRef.current) setCourseStudents([]); }
    finally { if (seq === courseStudentsSeqRef.current) setCourseStudentsLoading(false); }
  };

  useEffect(() => { loadCourseStudents(); }, [targetGymId]);

  // 合併列印發票：查該館是否已開真列印（僅真列印館別提供此功能，見上方 mergeMode 註解）
  useEffect(() => {
    if (!targetGymId) { setPrintingEnabled(false); return; }
    let alive = true;
    client.get('/invoices/printing-status', { params: { gymId: targetGymId } })
      .then(r => { if (alive) setPrintingEnabled(!!r.data.enabled); })
      .catch(() => { if (alive) setPrintingEnabled(false); });
    setMergeMode(false); setMergeSelected(new Set()); // 切館別重置選取，避免跨館混選
    return () => { alive = false; };
  }, [targetGymId]);

  const handleQuickCourseCheckin = async (student) => {
    if (student.alreadyCheckedIn || quickCheckinLoading) return;
    setQuickCheckinLoading(student.memberId);
    try {
      await client.post('/checkin/phone', {
        memberId: student.memberId,
        gymId: targetGymId,
        entryType: 'course_access',
        paymentMethod: 'cash',
      });
      showQuickMsg(`${student.memberName} 入場成功`);
      await loadCourseStudents();
      await loadStats();
    } catch (err) {
      showQuickMsg(err.response?.data?.message || '入場失敗', 'red');
    } finally {
      setQuickCheckinLoading(null);
    }
  };

  const [quickMsg, setQuickMsg] = useState('');
  const [quickMsgType, setQuickMsgType] = useState('ok');
  const showQuickMsg = (text, type='ok') => { setQuickMsg(text); setQuickMsgType(type); setTimeout(() => setQuickMsg(''), 3000); };

  const [tab, setTab] = useState('scan');
  const [todayCheckIns, setTodayCheckIns] = useState([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelConfirm, setCancelConfirm] = useState(null); // {checkInId, force, invoice, checking}——取消入場前的確認彈窗（含發票查詢）
  const [qrInput, setQrInput] = useState('');
  const [showCamera, setShowCamera] = useState(false);   // 相機掃碼視窗
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const scanningRef = useRef(false);
  // 目前處理中／顯示中尚未確認的掃描結果所屬 token。掃描槍連續觸發（trigger 沒放開會一直重送同一組
  // 資料）或相機在同一張 QR 上重複偵測時，同一個 token 的重複掃描會直接 no-op，避免把畫面清空重繪、
  // 讓店員來不及點「確認入場／報到／入館／補租」就整個跳開重來。只在真的成功「確認」了才清空，
  // 讓下一次全新掃描（不同 token，或同 token 但真的想重掃）可以正常進行。
  const pendingScanTokenRef = useRef(null);
  const [scanResult, setScanResult] = useState(null);
  const [compScan, setCompScan] = useState(null); // 比賽報到掃描結果（compchk: QR）
  const [compInvoiceTarget, setCompInvoiceTarget] = useState(null); // 比賽報到「開立發票」modal 目標
  const [compInvRefresh, setCompInvRefresh] = useState(0); // 關閉發票 modal 時 +1，讓按鍵重查一次最新狀態
  const [staffScan, setStaffScan] = useState(null); // 員工入館掃描結果（staffentry: QR）
  const [rentalAddonScan, setRentalAddonScan] = useState(null); // 會員自助補租器材掃描結果（rentaladd: QR）
  const [confirmingRentalAddon, setConfirmingRentalAddon] = useState(false);
  const [confirmedRentalAddon, setConfirmedRentalAddon] = useState(null); // 補租確認並收款成功後，供開立發票用（2026-08-15）
  const [confirmedCheckIn, setConfirmedCheckIn] = useState(null);
  const [checkinInvoiceTarget, setCheckinInvoiceTarget] = useState(null); // 入場「開立發票」modal 目標（checkIn 物件）
  const [checkinInvRefresh, setCheckinInvRefresh] = useState(0); // 關閉發票 modal 時 +1，讓按鍵重查一次最新狀態
  const [renewalInvoiceTarget, setRenewalInvoiceTarget] = useState(null); // 定期票線上續約待開發票 modal 目標
  const [renewalInvRefresh, setRenewalInvRefresh] = useState(0);
  const [courseInvoiceTarget, setCourseInvoiceTarget] = useState(null); // 今日課程學員「最後一堂」開立課程發票 modal 目標
  const [courseInvRefresh, setCourseInvRefresh] = useState(0); // 關閉發票 modal 時 +1，讓按鍵重查一次最新狀態
  // 合併列印發票（多筆入場合開一張，如同行三人一起付款）——僅真列印館別開放（見下方 printingEnabled 查詢），
  // 手動記帳版沒有自然的「多筆合一」記錄方式，不提供此功能。
  const [printingEnabled, setPrintingEnabled] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelected, setMergeSelected] = useState(() => new Set());
  const [mergedInvoiceList, setMergedInvoiceList] = useState(null); // 開啟合併發票 modal 時，鎖定當下選取的清單快照
  const [invoicedTodayIds, setInvoicedTodayIds] = useState(() => new Set()); // 今天已開過發票（個別或已被合併涵蓋）的入場 id，合併選取時要排除避免重複開票

  // 進入合併選取模式時查一次今日已開立的發票（含個別＋合併），排除已開過票的人不給再勾選
  const loadInvoicedTodayIds = async () => {
    if (!targetGymId) { setInvoicedTodayIds(new Set()); return; }
    try {
      const res = await client.get('/invoices/today', { params: { gymId: targetGymId } });
      const ids = new Set();
      (res.data.invoices || []).forEach(inv => {
        if (inv.status !== 'issued') return;
        if (inv.sourceType === 'checkin' && inv.refId) ids.add(inv.refId);
        if (inv.sourceType === 'checkin_merged' && Array.isArray(inv.mergedCheckinIds)) inv.mergedCheckinIds.forEach(id => ids.add(id));
      });
      setInvoicedTodayIds(ids);
    } catch (e) { setInvoicedTodayIds(new Set()); }
  };
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneMember, setPhoneMember] = useState(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [phoneEntryType, setPhoneEntryType] = useState('single_ticket');
  const [phonePayment, setPhonePayment] = useState('cash');
  const [phoneCheckedIn, setPhoneCheckedIn] = useState(null);
  const [phoneSelectedMember, setPhoneSelectedMember] = useState(null);
  const [memberEligibility, setMemberEligibility] = useState(null);
  const [phoneInstrument, setPhoneInstrument] = useState(null); // 票券：null=一般付款
  const [phoneSubMembers, setPhoneSubMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsGymTab, setStatsGymTab] = useState(0);
  const [entryTypes, setEntryTypes] = useState([]);
  const [shoeRental, setShoeRental] = useState({ price: 100, active: true });
  const [checkinAlreadyPaid, setCheckinAlreadyPaid] = useState(false); // 轉換期：電話搜尋顯示「已付費」放行
  const [checkinLegacyDiscount, setCheckinLegacyDiscount] = useState(false); // 轉換期：電話搜尋可用「舊折扣卡 8 折」
  const [chalkRental, setChalkRental] = useState({ price: 50, active: true });
  const [phoneRentShoes, setPhoneRentShoes] = useState(false);
  const [phoneRentChalk, setPhoneRentChalk] = useState(false);
  // 歷史入場（區間、全館逐筆）
  const [historyFrom, setHistoryFrom] = useState(dayjs().format('YYYY-MM-DD'));
  const [historyTo, setHistoryTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [historyCheckIns, setHistoryCheckIns] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { loadStats(); loadEntryTypes(); }, []); // 待審核/轉帳確認/通知 已移至待辦頁
  useEffect(() => { client.get('/settings/transition').then(r => { setCheckinAlreadyPaid(!!r.data.checkinAlreadyPaid); setCheckinLegacyDiscount(!!r.data.checkinLegacyDiscountCard); }).catch(() => {}); }, []);
  useEffect(() => {
    if (tab === 'scan') inputRef.current?.focus();
    if (tab === 'today') loadTodayCheckIns();
    if (tab === 'history') loadHistory();
  }, [tab]);
  useEffect(() => { if (tab === 'history') loadHistory(); /* eslint-disable-next-line */ }, [historyFrom, historyTo, targetGymId]);
  useEffect(() => { if (tab === 'scan' && confirmedCheckIn) setTimeout(() => inputRef.current?.focus(), 300); }, [confirmedCheckIn]);

  // 站台電腦常整天開著不關：切回分頁/視窗取得焦點時重抓今日統計/課程學員/當前分頁清單，
  // 不必靠人工整頁重整才能看到最新資料。
  useRefetchOnFocus(() => {
    loadStats();
    loadCourseStudents();
    if (tab === 'today') loadTodayCheckIns();
    if (tab === 'history') loadHistory();
  });

  // ⚠️ 由 8+ 處觸發（入場/取消/確認等每個動作完成後皆呼叫），序號防過期回應覆蓋最新統計。
  const statsSeqRef = useRef(0);
  const loadStats = async () => {
    const seq = ++statsSeqRef.current;
    try {
      const res = await getTodayStats(staff?.gymId);
      if (seq !== statsSeqRef.current) return;
      setStats(res.data);
    } catch (e) {}
  };

  const loadEntryTypes = async () => {
    try {
      const res = await client.get('/settings/entry-types');
      setEntryTypes((res.data || []).filter(t => t.active));
    } catch (e) {}
    try {
      const res = await client.get('/settings/shoe-rental');
      setShoeRental(res.data);
    } catch (e) {}
    try {
      const res = await client.get('/settings/chalk-rental');
      setChalkRental(res.data);
    } catch (e) {}
  };

  // ⚠️ 由分頁切換、視窗取得焦點兩處觸發，序號防過期回應覆蓋。
  const todayCheckInsSeqRef = useRef(0);
  const loadTodayCheckIns = async () => {
    const seq = ++todayCheckInsSeqRef.current;
    setTodayLoading(true);
    try {
      const res = await client.get('/checkin/today');
      if (seq !== todayCheckInsSeqRef.current) return;
      const all = res.data?.recent || [];
      setTodayCheckIns(all.filter(c => !c.isCancelled));
    } catch(e) { console.error(e); }
    finally { if (seq === todayCheckInsSeqRef.current) setTodayLoading(false); }
  };

  // 歷史入場：指定區間（台灣時間，含起訖整日）全館逐筆
  // ⚠️ 由分頁切換、日期區間變動、視窗取得焦點三處觸發，序號防過期回應覆蓋。
  const historySeqRef = useRef(0);
  const loadHistory = async () => {
    if (!targetGymId && !isSuperAdmin) return;
    if (historyFrom > historyTo) { setHistoryCheckIns([]); return; }
    const seq = ++historySeqRef.current;
    setHistoryLoading(true);
    try {
      const res = await getCheckInHistory({
        gymId: targetGymId || undefined,
        dateFrom: `${historyFrom}T00:00:00+08:00`,
        dateTo: `${historyTo}T23:59:59+08:00`,
        limit: 10000,
      });
      if (seq !== historySeqRef.current) return;
      setHistoryCheckIns((res.data.checkIns || []).filter(c => !c.isCancelled));
    } catch (e) { if (seq === historySeqRef.current) setHistoryCheckIns([]); }
    finally { if (seq === historySeqRef.current) setHistoryLoading(false); }
  };

  const exportHistoryCsv = () => {
    const rows = [['日期時間', '會員', '館別', '入場資格', '金額']];
    historyCheckIns.forEach(c => {
      const t = c.checkedInAt?._seconds ? new Date(c.checkedInAt._seconds * 1000) : new Date(c.checkedInAt);
      rows.push([
        dayjs(t).format('YYYY-MM-DD HH:mm'),
        c.memberName || '',
        c.gymId === 'gym-hsinchu' ? '新竹館' : c.gymId === 'gym-shilin' ? '士林館' : c.gymId || '',
        entryLabelOf(c) || '',
        c.amountPaid || 0,
      ]);
    });
    const csv = '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    const fname = historyFrom === historyTo ? `入場紀錄_${historyFrom}.csv` : `入場紀錄_${historyFrom}_至_${historyTo}.csv`;
    a.href = url; a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const handleCancelCheckin = async (checkInId, force = false) => {
    setCancellingId(checkInId);
    try {
      await client.post('/checkin/cancel', { checkInId, force });
      setTodayCheckIns(prev => prev.filter(c => c.id !== checkInId));
      setHistoryCheckIns(prev => prev.filter(c => c.id !== checkInId));
      await loadStats();
    } catch(err) {
      alert(err.response?.data?.message || '取消失敗');
    } finally { setCancellingId(null); }
  };

  // 按下取消入場前先開確認彈窗，並查這筆有沒有已列印、作用中的發票——
  // 有的話彈窗要醒目警示店員「務必取回原紙本」並附發票號碼/品名/金額；
  // 沒有（未列印過，或該館尚未開啟真列印）則只顯示一般確認文字。
  const openCancelConfirm = (checkInId, force = false) => {
    setCancelConfirm({ checkInId, force, invoice: null, checking: true });
    client.get('/invoices/active', { params: { sourceType: 'checkin', refId: checkInId } })
      .then(r => setCancelConfirm(prev => (prev && prev.checkInId === checkInId) ? { ...prev, invoice: r.data.invoice || null, checking: false } : prev))
      .catch(() => setCancelConfirm(prev => (prev && prev.checkInId === checkInId) ? { ...prev, invoice: null, checking: false } : prev));
  };

  // 共用掃描邏輯（掃描槍輸入框 / 相機掃碼皆走此）
  const runScan = async (token) => {
    const t = (token || '').trim();
    if (!t) return;
    // 同一張 QR 還在處理中或結果還顯示著（尚未按下確認）→ 忽略這次重複掃描，不清空畫面
    if (t === pendingScanTokenRef.current) return;
    // 比賽報到 QR（compchk: 前綴）→ 走比賽報到流程（驗報名資格、不卡墜測）
    if (t.startsWith('compchk:')) {
      pendingScanTokenRef.current = t;
      setLoading(true); setScanResult(null); setConfirmedCheckIn(null); setCompScan(null);
      try {
        const res = await client.post('/competitions/checkin/scan', { token: t });
        setCompScan({ ...res.data, token: t });
      } catch (err) {
        setCompScan({ error: err.response?.data?.message || '掃描失敗' });
        pendingScanTokenRef.current = null; // 失敗不算「待確認」，允許立即重掃
      } finally { setLoading(false); }
      return;
    }
    // 員工入館 QR（staffentry: 前綴）
    if (t.startsWith('staffentry:')) {
      pendingScanTokenRef.current = t;
      setLoading(true); setScanResult(null); setConfirmedCheckIn(null); setCompScan(null); setStaffScan(null);
      try {
        const res = await client.post('/staff-entry/scan', { token: t });
        setStaffScan({ ...res.data, token: t });
      } catch (err) {
        setStaffScan({ error: err.response?.data?.message || '掃描失敗' });
        pendingScanTokenRef.current = null;
      } finally { setLoading(false); }
      return;
    }
    // 會員自助「補租器材」QR（rentaladd: 前綴）
    if (t.startsWith('rentaladd:')) {
      pendingScanTokenRef.current = t;
      setLoading(true); setScanResult(null); setConfirmedCheckIn(null); setCompScan(null); setStaffScan(null); setRentalAddonScan(null);
      try {
        const res = await scanRentalAddon(t);
        setRentalAddonScan({ ...res.data, token: t });
      } catch (err) {
        setRentalAddonScan({ error: err.response?.data?.message || '掃描失敗' });
        pendingScanTokenRef.current = null;
      } finally { setLoading(false); }
      return;
    }
    pendingScanTokenRef.current = t;
    setLoading(true);
    setScanResult(null);
    setConfirmedCheckIn(null);
    setCompScan(null);
    setStaffScan(null);
    try {
      const res = await scanQrCode(t);
      setScanResult({ ...res.data, qrToken: res.data.qrToken || t });
    } catch (err) {
      setScanResult({ error: err.response?.data?.message || '掃描失敗' });
      pendingScanTokenRef.current = null;
    } finally {
      setLoading(false);
      setQrInput('');
    }
  };

  const handleScan = async (e) => {
    e.preventDefault();
    if (!qrInput.trim()) { inputRef.current?.focus(); setScanResult({ error: '請將游標點入輸入框後再掃描 QR Code' }); return; }
    await runScan(qrInput);
    inputRef.current?.focus();
  };

  // ── 相機掃碼（iPad/手機相機，jsQR 解碼，適用 Safari）──
  const stopCamera = () => {
    scanningRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(tr => tr.stop()); streamRef.current = null; }
  };
  const closeCamera = () => { stopCamera(); setShowCamera(false); setCameraError(''); };
  const openCamera = async () => {
    setCameraError('');
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
      video.setAttribute('playsinline', 'true'); // iOS 需 inline 播放
      video.srcObject = stream;
      await video.play();
      scanningRef.current = true;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!scanningRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) {
            stopCamera();
            setShowCamera(false);
            runScan(code.data);
            return;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      const msg = err?.name === 'NotAllowedError' ? '相機權限被拒絕，請至瀏覽器設定允許相機'
        : err?.name === 'NotFoundError' ? '找不到相機裝置'
        : (location.protocol !== 'https:' ? '相機需在 HTTPS 環境使用' : ('無法開啟相機：' + (err?.message || err?.name || '未知錯誤')));
      setCameraError(msg);
      stopCamera();
    }
  };
  useEffect(() => () => stopCamera(), []); // 卸載時關相機

  const handleConfirm = async () => {
    if (!scanResult?.qrToken) return;
    setLoading(true);
    try {
      const res = await confirmCheckIn(scanResult.qrToken);
      setConfirmedCheckIn(res.data.checkIn);
      setScanResult(null);
      pendingScanTokenRef.current = null;
      await loadStats();
    } catch (err) {
      setScanResult({ ...scanResult, confirmError: err.response?.data?.message || '確認失敗' });
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handlePhoneSearch = async () => {
    if (!phoneInput.trim()) return;
    setPhoneLoading(true);
    setPhoneMember(null);
    setPhoneSubMembers([]);
    setPhoneError('');
    setPhoneCheckedIn(null);
    setPhoneSelectedMember(null);
    setMemberEligibility(null);
    try {
      const res = await client.get('/members', { params: { q: phoneInput.trim() } });
      const members = res.data.members || [];
      const target = phoneInput.trim();
      const matches = members.filter(m => m.phone === target || m.phone === target.replace(/-/g,''));
      // 親子共用電話：子帳號繼承家長電話，且搜尋依建立時間新→舊（子帳號常較晚建立排在前）。
      // 優先解析為「家長帳號」（非子帳號），再由家長 children 清單選子會員，避免只看到子帳號。
      const found = matches.find(m => !m.isChildAccount && !m.parentMemberId) || matches[0];
      if (found) {
        setPhoneMember(found);
        try {
          const detailRes = await client.get(`/members/${found.id}`);
          setPhoneSubMembers(detailRes.data.children || []);
        } catch (e) { /* 子會員載入失敗不影響家長入場 */ }
      } else {
        setPhoneError('找不到此手機號碼的會員');
      }
    } catch (e) {
      setPhoneError('查詢失敗');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handlePhoneCheckin = async () => {
    if (!phoneSelectedMember) {
      setPhoneError('請先選擇入場人員');
      return;
    }
    setPhoneLoading(true);
    try {
      let res;
      if (phoneInstrument && phoneInstrument.kind !== 'legacyDiscount') {
        // 兩段流程：身分(phoneEntryType) + 票券(instrument)，走 /checkin/direct（重用結算邏輯）
        res = await client.post('/checkin/direct', {
          memberId: phoneSelectedMember.id,
          gymId: targetGymId,
          entryType: phoneInstrument.type,      // discount_card/black_card/bonus/single_entry_ticket
          baseEntryType: phoneEntryType,        // 身分（折扣券 8 折基準）
          discountCardId: phoneInstrument.kind === 'discountCard' ? phoneInstrument.cardId : undefined,
          blackCardId: phoneInstrument.kind === 'blackCard' ? phoneInstrument.cardId : undefined,
          bonusId: phoneInstrument.kind === 'bonus' ? phoneInstrument.cardId : undefined,
          singleEntryTicketId: phoneInstrument.kind === 'singleEntryTicket' ? phoneInstrument.cardId : undefined,
          paymentMethod: phonePayment,
          rentShoes: phoneRentShoes,
          rentChalk: phoneRentChalk,
        });
      } else {
        // 一般付款／免費身分／舊折扣卡8折：走 /checkin/phone（後端權威算價）
        const effectiveEntryType = memberEligibility?.isVip ? 'vip' : memberEligibility?.hasValidPass ? 'pass' : memberEligibility?.hasCourseAccess ? 'course_access' : phoneEntryType;
        res = await client.post('/checkin/phone', {
          memberId: phoneSelectedMember.id,
          gymId: targetGymId,
          entryType: effectiveEntryType,
          paymentMethod: phonePayment,
          rentShoes: phoneRentShoes,
          rentChalk: phoneRentChalk,
          legacyDiscountCard: phoneInstrument?.kind === 'legacyDiscount', // 轉換期舊折扣卡8折
        });
      }
      setPhoneCheckedIn({
        ...res.data.checkIn,
        needsPromotion: res.data.needsPromotion || false,
        promotionMessage: res.data.promotionMessage,
      });
      setPhoneMember(null);
      setPhoneInput('');
      setPhoneRentShoes(false);
      setPhoneRentChalk(false);
      setPhoneInstrument(null);
      await loadStats();
    } catch (e) {
      setPhoneError(e.response?.data?.message || '入場失敗');
    } finally {
      setPhoneLoading(false);
    }
  };

  // 轉換期「已付費」放行：會員於舊系統已付「入場費」，入場費記 NT$0。
  // 但若加購岩鞋/粉袋仍須另收（帶 rentShoes/rentChalk + 付款方式，後端以真實付款方式收加購）。仍須 Waiver/墜測（後端硬擋）。
  const handlePhoneAlreadyPaid = async () => {
    if (!phoneSelectedMember) { setPhoneError('請先選擇入場人員'); return; }
    setPhoneLoading(true);
    try {
      const res = await client.post('/checkin/phone', {
        memberId: phoneSelectedMember.id,
        gymId: targetGymId,
        alreadyPaid: true,
        rentShoes: phoneRentShoes,
        rentChalk: phoneRentChalk,
        paymentMethod: phonePayment,
      });
      setPhoneCheckedIn({ ...res.data.checkIn, needsPromotion: res.data.needsPromotion || false, promotionMessage: res.data.promotionMessage });
      setPhoneMember(null); setPhoneInput(''); setPhoneRentShoes(false); setPhoneRentChalk(false); setPhoneInstrument(null);
      await loadStats();
    } catch (e) { setPhoneError(e.response?.data?.message || '入場失敗'); }
    finally { setPhoneLoading(false); }
  };

  const handleCancel = async (checkInId) => {
    if (!window.confirm('確定要取消此次入場？相關票券將退回。')) return;
    try {
      await cancelCheckIn(checkInId);
      setConfirmedCheckIn(null);
      await loadStats();
      alert('入場已取消，票券已退回');
    } catch (err) {
      alert(err.response?.data?.message || '取消失敗');
    }
  };

  return (
    <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: isMobile ? undefined : '1fr 300px', gap:16, padding: isMobile ? 12 : 20, minHeight:'100vh', background:'#F7F3F3', boxSizing:'border-box' }}>

      {/* 左側主區 */}
      <div>
        {/* Header */}
        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden', marginBottom:12 }}>
          <div style={{ background:'#8B1A1A', padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:18, color:'#fff' }}>RedRock</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.7)', marginLeft:'auto' }}>{staff?.gymName}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.7)' }}>{staff?.name}</div>
          </div>

          {isSuperAdmin && !activeGymId && !staff?.gymId && gyms.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', background:'#FFFBF0', borderBottom:'0.5px solid #F0D9A8' }}>
              <span style={{ fontSize:12, color:'#854F0B' }}>操作館別：<b style={{ color:'#8B1A1A' }}>{gyms.find(g => g.id === targetGymId)?.shortName || gyms.find(g => g.id === targetGymId)?.name || targetGymId}</b></span>
              <span style={{ fontSize:11, color:'#999' }}>{viewGym ? '（依上方場館選擇）' : '（上方為「全館」，入場預設此館；如需其他館請於上方切換）'}</span>
            </div>
          )}

          {/* Tabs */}
          <SegmentedTabs
            tabs={[
              { key:'scan', label:'掃描入場' },
              { key:'courseStudents', label:`今日課程學員 ${courseStudents.length > 0 ? `(${courseStudents.length})` : ''}` },
              { key:'today', label:'今日入場' },
              ...(canViewHistory ? [{ key:'history', label:'歷史入場' }] : []),
            ]}
            value={tab}
            onChange={setTab}
            style={{ margin:'12px 16px' }}
          />
        </div>

        {/* ── 掃描 tab ── */}
        {tab === 'scan' && !canCheckin && (
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:24, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🔒</div>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>入場功能限值班/管理員</div>
            <div style={{ fontSize:13, color:'#999' }}>請於館別電腦打卡值班後使用，或以管理員帳號操作。</div>
          </div>
        )}
        {tab === 'scan' && canCheckin && (
          <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:12 }}>

            {/* 上：QR Code 掃描 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#8B1A1A', marginBottom:12 }} onClick={() => inputRef.current?.focus()}>📷 掃描 QR Code</div>
              <div style={{ fontSize:11, color:'#999', marginBottom:8 }}>定期票、優惠卡、黑卡、紅利入場</div>
              <div style={{ fontSize:11, color:'#185FA5', marginBottom:12, cursor:'pointer' }} onClick={() => inputRef.current?.focus()}>💡 掃描前請先點擊下方輸入框確認游標在內</div>
            <form onSubmit={handleScan} style={{ display:'flex', gap:8, marginBottom:16 }}>
              <input ref={inputRef}
                value={qrInput} onChange={e => setQrInput(e.target.value)}
                placeholder="點此後掃描 QR Code..."
                onClick={() => inputRef.current?.focus()}
                style={{ flex:1, height:44, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}
                autoFocus
              />
              <button type="submit" disabled={loading}
                style={{ height:44, padding:'0 20px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                {loading ? '...' : '掃描'}
              </button>
            </form>
            {/* 相機掃碼（掃描槍以外，iPad/手機相機直接掃）*/}
            <button type="button" onClick={openCamera} disabled={loading}
              style={{ width:'100%', height:44, borderRadius:8, background:'#fff', color:'#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:16 }}>
              📷 用相機掃描
            </button>

            {showCamera && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:400, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16 }}>
                <div style={{ color:'#fff', fontSize:15, fontWeight:600, marginBottom:12 }}>📷 對準會員入場 QR Code</div>
                <div style={{ position:'relative', width:'100%', maxWidth:340, aspectRatio:'1 / 1', borderRadius:16, overflow:'hidden', background:'#000' }}>
                  <video ref={videoRef} playsInline muted autoPlay style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  <div style={{ position:'absolute', inset:'14%', border:'3px solid rgba(255,255,255,.85)', borderRadius:12, boxShadow:'0 0 0 9999px rgba(0,0,0,.25)', pointerEvents:'none' }} />
                </div>
                {cameraError
                  ? <div style={{ color:'#FFB4B4', fontSize:13, marginTop:14, textAlign:'center', maxWidth:340, lineHeight:1.6 }}>{cameraError}</div>
                  : <div style={{ fontSize:12, color:'rgba(255,255,255,.7)', marginTop:12, textAlign:'center', maxWidth:340 }}>掃到後自動帶入並顯示入場資訊，再按「確認入場」</div>}
                <button onClick={closeCamera}
                  style={{ marginTop:18, height:46, padding:'0 34px', borderRadius:10, background:'#fff', color:'#333', border:'none', fontSize:15, fontWeight:600, cursor:'pointer' }}>
                  關閉
                </button>
              </div>
            )}

            {/* 比賽報到掃描結果 */}
            {compScan && (
              <div style={{ background:'#F7F3F3', borderRadius:10, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
                {compScan.error ? (
                  <div style={{ color:'#A32D2D', fontSize:13 }}>❌ {compScan.error}</div>
                ) : (
                  <>
                    <div style={{ fontWeight:600, fontSize:15, marginBottom:10 }}>🎫 比賽報到</div>
                    {/* 2026-08-27 精簡：只顯示 選手/比賽名稱/組別/背號（計分系統配發）＋三個警示（拍板保留）；
                        比賽日與「已確認收款」正常態繳費行移除（繳費資訊只在未確認時以警示呈現） */}
                    <div style={{ fontSize:13, lineHeight:2 }}>
                      <div>選手：<strong>{compScan.memberName}</strong></div>
                      <div>比賽名稱：{compScan.competitionName}</div>
                      <div>組別：{compScan.divisionName}</div>
                      <div>背號：{compScan.bibNumber
                        ? <strong style={{ fontSize:16, color:'#8B1A1A' }}>{compScan.bibNumber}</strong>
                        : <span style={{ color:'#999' }}>—（計分系統尚未配發）</span>}</div>
                      {compScan.paymentStatus !== 'confirmed' &&
                        <div style={{ color:'#A32D2D', fontWeight:700 }}>⚠ 未確認收款（NT${compScan.registrationFee}），請先收款</div>}
                      {!compScan.isComplete && <div style={{ color:'#A32D2D', fontWeight:600 }}>⚠ 尚未完成簽署（待法定代理人）</div>}
                      {compScan.checkedInAt && <div style={{ color:'#854F0B', fontWeight:700 }}>⚠ 此選手已完成報到</div>}
                    </div>
                    {!compScan.checkedInAt && (
                      <button onClick={async () => {
                        try {
                          const r = await client.post('/competitions/checkin/confirm', { token: compScan.token });
                          setCompScan(null);
                          pendingScanTokenRef.current = null;
                          setConfirmedCheckIn({ memberName: compScan.memberName, entryType: 'competition', amountPaid: 0, message: r.data.message });
                        } catch (err) { setCompScan(prev => ({ ...prev, error: err.response?.data?.message || '報到失敗' })); }
                      }}
                        style={{ marginTop:12, width:'100%', height:42, borderRadius:9, background:'#2D7D46', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                        ✓ 確認報到（不卡墜落測驗）
                      </button>
                    )}
                    {/* 開立比賽發票：2026-08-17 放寬值班站台可開（原限管理員），與後端 requireManagerOrStation 對齊 */}
                    {canCheckin && (compScan.receivedAmount ?? compScan.registrationFee ?? 0) > 0 && (
                      <InvoiceButtonAuto sourceType="competition" refId={compScan.registrationId} refreshToken={compInvRefresh}
                        onClick={() => setCompInvoiceTarget(compScan)}
                        style={{ marginTop:8, width:'100%', height:38, borderRadius:9, fontSize:13 }} />
                    )}
                  </>
                )}
              </div>
            )}

            {/* 比賽報到「開立發票」（共用元件，與賽事管理報名名單頁/課程學員頁同一套；依開關自動切換真列印／手動記帳版） */}
            {compInvoiceTarget && (
              <InvoiceIssuer
                gymId={compInvoiceTarget.gymId}
                sourceType="competition"
                refId={compInvoiceTarget.registrationId}
                memberId={compInvoiceTarget.memberId}
                memberName={compInvoiceTarget.memberName}
                paymentMethod={compInvoiceTarget.paymentMethod}
                title={compInvoiceTarget.memberName || ''}
                subtitle={`${compInvoiceTarget.competitionName || ''}・${compInvoiceTarget.divisionName || ''}`}
                feeInfo={`報名費用 NT$${compInvoiceTarget.registrationFee ?? 0}` + (compInvoiceTarget.insuranceFee != null ? `　保費 NT$${compInvoiceTarget.insuranceFee}` : '')}
                defaultItemName={`${compInvoiceTarget.competitionName || '比賽'}報名費`}
                defaultAmount={compInvoiceTarget.receivedAmount ?? compInvoiceTarget.registrationFee ?? 0}
                onClose={() => { setCompInvoiceTarget(null); setCompInvRefresh(v => v + 1); }}
                listInvoices={() => getRegistrationInvoices(compInvoiceTarget.registrationId).then(r => r.data.invoices || [])}
                createInvoice={(payload) => createRegistrationInvoice(compInvoiceTarget.registrationId, payload).then(r => r.data.invoice)}
                voidInvoiceFn={(id) => voidCompetitionInvoice(id)}
              />
            )}

            {/* 員工入館掃描結果 */}
            {staffScan && (
              <div style={{ background:'#F7F3F3', borderRadius:10, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
                {staffScan.error ? (
                  <div style={{ color:'#A32D2D', fontSize:13 }}>❌ {staffScan.error}</div>
                ) : (
                  <>
                    <div style={{ fontWeight:600, fontSize:15, marginBottom:10 }}>🎫 員工入館</div>
                    <div style={{ fontSize:13, lineHeight:2 }}>
                      <div>員工：<strong>{staffScan.staffName}</strong></div>
                      <div>資格：{staffScan.free
                        ? <span style={{ color:'#2D7D46', fontWeight:700 }}>免費入館</span>
                        : <span style={{ color:'#A32D2D', fontWeight:700 }}>{staffScan.tier==='half'?'半價':'一般價'} NT${staffScan.fee}（請收現金）</span>}</div>
                      <div style={{ fontSize:12, color:'#999' }}>{staffScan.reason}</div>
                    </div>
                    <button onClick={async () => {
                      try {
                        const r = await client.post('/staff-entry/confirm', { token: staffScan.token });
                        setStaffScan(null);
                        pendingScanTokenRef.current = null;
                        setConfirmedCheckIn({ memberName: staffScan.staffName, entryType: 'staff_entry', amountPaid: staffScan.fee, message: r.data.message });
                      } catch (err) { setStaffScan(prev => ({ ...prev, error: err.response?.data?.message || '入館失敗' })); }
                    }}
                      style={{ marginTop:12, width:'100%', height:42, borderRadius:9, background:'#2D7D46', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                      ✓ 確認入館{staffScan.free ? '' : `（收現金 NT$${staffScan.fee}）`}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* 會員自助補租器材（rentaladd: QR）掃描結果 */}
            {rentalAddonScan && (
              <div style={{ background:'#F7F3F3', borderRadius:10, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
                {rentalAddonScan.error ? (
                  <div style={{ color:'#A32D2D', fontSize:13 }}>❌ {rentalAddonScan.error}</div>
                ) : (
                  <>
                    <div style={{ fontWeight:600, fontSize:15, marginBottom:10 }}>🎒 補租器材確認</div>
                    <div style={{ fontSize:13, lineHeight:2 }}>
                      <div>會員：<strong>{rentalAddonScan.memberName}</strong></div>
                      <div>補租項目：{[rentalAddonScan.addShoes && '岩鞋', rentalAddonScan.addChalk && '粉袋'].filter(Boolean).join('、')}</div>
                      <div>付款方式：{PAYMENT_LABEL?.[rentalAddonScan.paymentMethod] || rentalAddonScan.paymentMethod}</div>
                      <div>金額：<strong style={{ color:'#8B1A1A' }}>NT${rentalAddonScan.cost}</strong></div>
                    </div>
                    <button onClick={async () => {
                      setConfirmingRentalAddon(true);
                      try {
                        const res = await confirmRentalAddon(rentalAddonScan.token);
                        setRentalAddonScan(null);
                        pendingScanTokenRef.current = null;
                        // 補租本身沒有對應的既有訂單發票（同一入場紀錄可能早就開過另一張了，見後端
                        // 註解），確認並收款成功後緊接著開發票入口，取代原本的 alert（2026-08-15）。
                        setConfirmedRentalAddon(res.data);
                      } catch (err) { setRentalAddonScan(prev => ({ ...prev, error: err.response?.data?.message || '確認失敗' })); }
                      finally { setConfirmingRentalAddon(false); }
                    }}
                      disabled={confirmingRentalAddon}
                      style={{ marginTop:12, width:'100%', height:42, borderRadius:9, background:'#2D7D46', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                      {confirmingRentalAddon ? '處理中...' : `✓ 確認並收款 NT$${rentalAddonScan.cost}`}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* 補租器材確認並收款成功後開立發票（2026-08-15；2026-08-23 修正重複開發票）——
                sourceType 用獨立的 'rental_addon'、refId 用補租請求自己的 id（非原入場的 checkInId）
                避免跟原入場可能已開過的發票撞號（同一組 sourceType+refId 只能有一張作用中發票，見
                invoices.js getActiveRealInvoice）。⚠️ 只有「原入場此刻已經開過發票」才顯示這個獨立
                開票入口（真實案例：同一筆補租金額被開了兩張紙本——一張走這裡、一張是店員後來從
                「今日入場」清單另外幫同一筆入場開票，因為 addRentalToCheckIn 早已把補租費用併進
                checkIn.amountPaid，兩邊各開一張等於重複）。原入場還沒開過發票時，改提示店員改用
                入場自己的發票鍵（金額已自動包含這次補租）。見 flow.js confirmRentalAddon 的
                checkinAlreadyInvoiced 判斷。 */}
            {confirmedRentalAddon && (
              <div style={{ background:'#F7F3F3', borderRadius:10, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
                <div style={{ fontWeight:600, fontSize:15, marginBottom:10, color:'#2D7D46' }}>✓ 已確認補租，扣費完成</div>
                <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>
                  {confirmedRentalAddon.memberName}・{invoiceRentalItemName({ shoesPrice: confirmedRentalAddon.addShoes ? 100 : 0, chalkPrice: confirmedRentalAddon.addChalk ? 50 : 0 })}・NT${confirmedRentalAddon.cost}
                </div>
                {confirmedRentalAddon.checkinAlreadyInvoiced ? (
                  <InvoiceIssuer
                    gymId={confirmedRentalAddon.gymId}
                    sourceType="rental_addon"
                    refId={confirmedRentalAddon.addonId}
                    memberId={confirmedRentalAddon.memberId}
                    memberName={confirmedRentalAddon.memberName}
                    paymentMethod={confirmedRentalAddon.paymentMethod}
                    title="補租器材"
                    subtitle={confirmedRentalAddon.memberName}
                    defaultItemName={invoiceRentalItemName({ shoesPrice: confirmedRentalAddon.addShoes ? 100 : 0, chalkPrice: confirmedRentalAddon.addChalk ? 50 : 0 })}
                    defaultAmount={confirmedRentalAddon.cost}
                    onClose={() => setConfirmedRentalAddon(null)}
                    listInvoices={() => getRentalAddonInvoices(confirmedRentalAddon.addonId).then(r => r.data.invoices || [])}
                    createInvoice={(payload) => createRentalAddonInvoice(confirmedRentalAddon.addonId, payload).then(r => r.data.invoice)}
                    voidInvoiceFn={(id) => voidCheckinInvoice(id)}
                  />
                ) : (
                  <div style={{ background:'#FFF7E6', border:'1px solid #F0D28A', borderRadius:8, padding:'10px 12px', fontSize:13, color:'#8A6D1D' }}>
                    ℹ️ 此筆補租金額已併入原入場總額，請至「今日入場」清單開立<b>該筆入場</b>的發票（金額將自動包含本次補租費用），避免重複開立。
                    <button
                      onClick={() => setConfirmedRentalAddon(null)}
                      style={{ display:'block', marginTop:8, background:'transparent', border:'none', color:'#8A6D1D', textDecoration:'underline', cursor:'pointer', fontSize:13, padding:0 }}
                    >
                      知道了，關閉
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 掃描結果預覽 */}
            {scanResult && !scanResult.error && (
              <div style={{ background:'#F7F3F3', borderRadius:10, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
                <div style={{ fontWeight:600, fontSize:15, marginBottom:12 }}>入場資訊確認</div>

                {/* 會員資訊 */}
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13 }}>
                  <span style={{ color:'#666' }}>會員</span>
                  <span style={{ fontWeight:600 }}>
                    {scanResult.memberName}
                    {scanResult.isTeamMember && <span style={{ marginLeft:6, fontSize:11, background:'#E6F1FB', color:'#185FA5', padding:'2px 6px', borderRadius:10 }}>隊員</span>}
                  </span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13 }}>
                  <span style={{ color:'#666' }}>入場資格</span>
                  <span style={{ fontWeight:600 }}>
                    {ENTRY_TYPE_LABEL[scanResult.entryType] || scanResult.entryType}
                    {scanResult.usePass && <span style={{ color:'#185FA5' }}>（{scanResult.usePass.passTypeName}）</span>}
                  </span>
                </div>
                {/* 購買定期票：標示票種與金額 */}
                {scanResult.buyPass && (
                  <>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13 }}>
                      <span style={{ color:'#666' }}>購買票種</span>
                      <span style={{ fontWeight:600 }}>{scanResult.buyPass.passTypeName}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13 }}>
                      <span style={{ color:'#666' }}>票種金額</span>
                      <span style={{ fontWeight:600 }}>
                        {scanResult.buyPass.plan === 'installment'
                          ? <>分期首期 NT${scanResult.buyPass.dueNow}<span style={{ color:'#999', fontWeight:400 }}>（全額 NT${scanResult.buyPass.fullPrice}）</span></>
                          : <>NT${scanResult.buyPass.fullPrice}</>}
                      </span>
                    </div>
                  </>
                )}
                {scanResult.paymentMethod && (
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13 }}>
                    <span style={{ color:'#666' }}>付款方式</span>
                    <span>{PAYMENT_LABEL[scanResult.paymentMethod]}</span>
                  </div>
                )}
                {scanResult.totalAmount > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13 }}>
                    <span style={{ color:'#666' }}>應收金額</span>
                    <span style={{ fontWeight:700, color:'#8B1A1A', fontSize:16 }}>NT${scanResult.totalAmount}</span>
                  </div>
                )}
                {scanResult.rentShoes && (
                  <div style={{ background:'#FAEEDA', borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:12, color:'#854F0B' }}>
                    👟 需租借岩鞋 NT${scanResult.shoesPrice}
                  </div>
                )}
                {scanResult.rentChalk && (
                  <div style={{ background:'#FAEEDA', borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:12, color:'#854F0B' }}>
                    🧴 需租借粉袋 NT${scanResult.chalkPrice || 50}
                  </div>
                )}
                {scanResult.isTeamDiscount && (
                  <div style={{ background:'#E6F1FB', borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:12, color:'#185FA5' }}>
                    🏅 隊員九折優惠已套用
                  </div>
                )}
                {scanResult.onlineTicket && (
                  <div style={{ background:'#E6F4EB', border:'1px solid #B3DEC0', borderRadius:8, padding:'10px 12px', marginBottom:8, fontSize:13, color:'#2D7D46', fontWeight:600 }}>
                    ✅ 此券已透過{PAYMENT_LABEL[scanResult.onlineTicket.paymentMethod] || scanResult.onlineTicket.paymentMethod}線上付款 NT${scanResult.onlineTicket.amount}，免再收費
                    {scanResult.onlineTicket.grantsDiscountCard && '（確認入場後將自動開通一張優惠折扣券）'}
                    {scanResult.onlineTicket.grantsPassTypeName && `（確認入場後將自動開通定期票：${scanResult.onlineTicket.grantsPassTypeName}）`}
                    {scanResult.onlineTicket.usesDiscountCard && '（金額已含使用會員自己的優惠折扣券8折，確認入場後將自動扣點）'}
                  </div>
                )}
                {/* 定期票在家線上續約後尚未開發票——與本次入場類型完全無關（只是剛好命中同一位會員），
                    獨立於上方 onlineTicket 顯示；點擊即開發票 modal，不需先確認入場。*/}
                {scanResult.pendingRenewalInvoice && (
                  <div style={{ background:'#FEF3E2', border:'1px solid #F0C889', borderRadius:8, padding:'10px 12px', marginBottom:8, fontSize:13, color:'#8A5A00' }}>
                    <div style={{ fontWeight:600, marginBottom:6 }}>
                      🧾 此會員的定期票（{scanResult.pendingRenewalInvoice.passTypeName}）已於線上續約付款 NT${scanResult.pendingRenewalInvoice.amount}，尚未開立發票
                    </div>
                    <InvoiceButtonAuto sourceType="pass_renewal" refId={scanResult.pendingRenewalInvoice.paymentId} refreshToken={renewalInvRefresh}
                      onClick={() => setRenewalInvoiceTarget(scanResult.pendingRenewalInvoice)} style={{ height:'auto', padding:'4px 10px' }} />
                  </div>
                )}
                {scanResult.partnerVendor && (
                  <div style={{ background:'#FEF3E2', border:'1px solid #F0C889', borderRadius:8, padding:'10px 12px', marginBottom:8, fontSize:13, color:'#8A5A00', fontWeight:600 }}>
                    ⚠ 特約廠商優惠（−20）：請會員出示特約廠商證件確認後再放行
                  </div>
                )}
                {scanResult.partnerGymMember && (
                  <div style={{ background:'#FEF3E2', border:'1px solid #F0C889', borderRadius:8, padding:'10px 12px', marginBottom:8, fontSize:13, color:'#8A5A00', fontWeight:600 }}>
                    ⚠ 友館隊員優惠（9折）：請會員出示友館隊員證明確認後再放行
                  </div>
                )}
                {scanResult.entryType === 'student_free' && (
                  <div style={{ background:'#FEF3E2', border:'1px solid #F0C889', borderRadius:8, padding:'10px 12px', marginBottom:8, fontSize:13, color:'#8A5A00', fontWeight:600 }}>
                    🎓 學生入場：請查驗學生證後再放行
                  </div>
                )}
                {(scanResult.paymentMethod === 'linepay' || scanResult.paymentMethod === 'taiwanpay') && (
                  <div style={{ background:'#FCEBEB', border:'1.5px solid #E8A0A0', borderRadius:8, padding:'10px 12px', marginBottom:8, fontSize:13, color:'#A32D2D', fontWeight:700 }}>
                    📷 {scanResult.paymentMethod === 'linepay' ? 'LINE Pay' : '台灣Pay'}為現場立牌掃碼付款、系統無法自動確認收款，請務必確認會員已完成付款（可查看店家 App 交易紀錄）後再放行入場
                  </div>
                )}

                {scanResult.confirmError && (
                  <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:12, color:'#A32D2D' }}>
                    {scanResult.confirmError}
                  </div>
                )}

                <div style={{ display:'flex', gap:8, marginTop:12 }}>
                  <button onClick={() => setScanResult(null)}
                    style={{ flex:1, height:44, borderRadius:8, background:'#f5f5f5', color:'#666', border:'0.5px solid #ddd', fontSize:14, cursor:'pointer' }}>
                    取消
                  </button>
                  <button onClick={handleConfirm} disabled={loading}
                    style={{ flex:2, height:44, borderRadius:8, background:'#2D7D46', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                    {loading ? '...' : '✓ 確認入場'}
                  </button>
                </div>
              </div>
            )}

            {scanResult?.error && (
              <div style={{ background:'#FCEBEB', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#A32D2D', marginBottom:12 }}>
                ✕ {scanResult.error}
              </div>
            )}

            {/* 入場成功 + 10分鐘取消 */}
            {confirmedCheckIn && (
              <div style={{ background:'#E6F4EB', borderRadius:10, border:'0.5px solid #2D7D4633', padding:16, marginBottom:12 }}>
                <div style={{ fontWeight:600, color:'#2D7D46', fontSize:15, marginBottom:8 }}>✓ 入場成功</div>
                <div style={{ fontSize:13, color:'#2D7D46', marginBottom:12 }}>
                  {confirmedCheckIn.memberName} — {
                    confirmedCheckIn.onlineTicket?.grantsDiscountCard ? '購買優惠折扣券（已開通）'
                    : confirmedCheckIn.onlineTicket?.grantsPassTypeName ? `定期票（${confirmedCheckIn.onlineTicket.grantsPassTypeName}，已開通）`
                    : confirmedCheckIn.onlineTicket?.usesDiscountCard ? '使用優惠折扣券（已扣點）'
                    : (ENTRY_TYPE_LABEL[confirmedCheckIn.entryType] || confirmedCheckIn.entryType)
                  }
                  {confirmedCheckIn.amountPaid > 0 && ` — NT$${confirmedCheckIn.amountPaid}`}
                  {/* 此券線上付款當下已含租借費用，本次入場 amountPaid 為 0（無需再收）——另外標示已付總額 */}
                  {!confirmedCheckIn.amountPaid && confirmedCheckIn.onlineTicket?.amount > 0 &&
                    ` — 已線上付款 NT$${confirmedCheckIn.onlineTicket.amount}`}
                </div>
                {confirmedCheckIn.pendingRenewalInvoice && (
                  <div style={{ background:'#FEF3E2', border:'1px solid #F0C889', borderRadius:8, padding:'10px 12px', marginBottom:12, fontSize:13, color:'#8A5A00' }}>
                    <div style={{ fontWeight:600, marginBottom:6 }}>
                      🧾 此會員的定期票（{confirmedCheckIn.pendingRenewalInvoice.passTypeName}）已於線上續約付款 NT${confirmedCheckIn.pendingRenewalInvoice.amount}，尚未開立發票
                    </div>
                    <InvoiceButtonAuto sourceType="pass_renewal" refId={confirmedCheckIn.pendingRenewalInvoice.paymentId} refreshToken={renewalInvRefresh}
                      onClick={() => setRenewalInvoiceTarget(confirmedCheckIn.pendingRenewalInvoice)} style={{ height:'auto', padding:'4px 10px' }} />
                  </div>
                )}
                {confirmedCheckIn.id && (
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button onClick={() => handleCancel(confirmedCheckIn.id)}
                      style={{ fontSize:12, color:'#A32D2D', background:'none', border:'0.5px solid #A32D2D', borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
                      取消入場（10分鐘內）
                    </button>
                    {/* 定期票/課程學員/VIP 等免費入場（沒有實際收款）不需要開發票；線上付款已含租借的
                        免費入場（amountPaid=0 但 onlineTicket 有金額）仍需要開票，見下方判斷 */}
                    {(confirmedCheckIn.amountPaid > 0 || confirmedCheckIn.onlineTicket?.amount > 0) && (
                      <InvoiceButtonAuto sourceType="checkin" refId={confirmedCheckIn.id} refreshToken={checkinInvRefresh}
                        onClick={() => setCheckinInvoiceTarget(confirmedCheckIn)}
                        style={{ height:'auto', padding:'4px 10px' }} />
                    )}
                  </div>
                )}
              </div>
            )}

            </div>

            {/* 下：手機號碼查詢 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#185FA5', marginBottom:12 }}>📱 手機號碼入場</div>
              <div style={{ fontSize:11, color:'#999', marginBottom:12 }}>單次、兒童、學生票現場購買</div>
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <input value={phoneInput} onChange={e => setPhoneInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePhoneSearch()}
                  placeholder="輸入手機號碼..."
                  style={{ flex:1, height:44, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}
                />
                <button onClick={handlePhoneSearch} disabled={phoneLoading}
                  style={{ height:44, padding:'0 16px', borderRadius:8, background:'#185FA5', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                  {phoneLoading ? '...' : '查詢'}
                </button>
              </div>

              {phoneError && (
                <div style={{ background:'#FCEBEB', borderRadius:8, padding:'10px 12px', fontSize:13, color:'#A32D2D', marginBottom:12 }}>
                  ✕ {phoneError}
                </div>
              )}

              {phoneMember && (
                <div style={{ background:'#F0F7FF', borderRadius:10, border:'0.5px solid #BDD7F5', padding:14 }}>
                  <div style={{ fontSize:11, color:'#666', marginBottom:6 }}>選擇入場人員</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                    {[phoneMember, ...phoneSubMembers.filter(m => m.isChildAccount !== false)].map(m => (
                      <button key={m.id || m.name} type="button" onClick={async () => {
                        setPhoneSelectedMember(m);
                        setMemberEligibility(null);
                        setPhoneInstrument(null);
                        try {
                          const res = await client.get(`/checkin/eligibility/${m.id}`, { params: { gymId: targetGymId } });
                          // 若後端 isVip 未設定，用本地 memberType 補強
                          const data = res.data;
                          if (!data.isVip && m.memberType === 'vip') data.isVip = true;
                          setMemberEligibility(data);
                        } catch (e) {
                          setMemberEligibility({
                            memberType: m.memberType || 'general',
                            hasCourseAccess: false,
                            waiverSigned: true,
                            hasValidPass: false,
                            isVip: m.memberType === 'vip',
                          });
                        }
                      }}
                        style={{ height:34, padding:'0 12px', borderRadius:8, border:`0.5px solid ${phoneSelectedMember?.id === m.id || phoneSelectedMember?.name === m.name ? '#185FA5':'#E8D5D5'}`, background: phoneSelectedMember?.id === m.id || phoneSelectedMember?.name === m.name ? '#185FA5':'#fff', color: phoneSelectedMember?.id === m.id || phoneSelectedMember?.name === m.name ? '#fff':'#333', fontSize:13, cursor:'pointer' }}>
                        {m.name}{m.birthday ? ` (${m.birthday})` : ''}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontWeight:600, fontSize:15, marginBottom:4 }}>{phoneSelectedMember?.name}</div>
                  <div style={{ fontSize:12, color:'#666', marginBottom:12 }}>{phoneMember.phone}</div>

                  {memberEligibility && !memberEligibility.waiverSigned && (
                    <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#A32D2D', fontWeight:500 }}>
                      ⚠ 此會員尚未簽署 Waiver，無法完成入場
                    </div>
                  )}
                  {memberEligibility && memberEligibility.fallTestPassed === false && (
                    <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#A32D2D', fontWeight:500 }}>
                      ⚠ {memberEligibility.fallTestReason === 'expired' ? '墜落測驗已到期，需重新測驗才能入場' : '尚未通過安全墜落測驗，無法完成入場'}
                    </div>
                  )}
                  {memberEligibility?.isVip ? (
                    <div style={{ background:'#FFF8E6', border:'0.5px solid #F5D87A', borderRadius:10, padding:'10px 12px', marginBottom:12, fontSize:13, color:'#8B6914', fontWeight:500 }}>
                      👑 VIP 會員，免費入場{memberEligibility.vipNote ? `（${memberEligibility.vipNote}）` : ''}
                    </div>
                  ) : memberEligibility?.hasValidPass ? (
                    <div style={{ background:'#E6F4EB', border:'0.5px solid #B3DEC0', borderRadius:10, padding:'10px 12px', marginBottom:12, fontSize:13, color:'#2D7D46', fontWeight:500 }}>
                      ✓ 持有效定期票，將以定期票免費入場
                    </div>
                  ) : memberEligibility?.hasCourseAccess ? (
                    <div style={{ background:'#E6F1FB', border:'0.5px solid #B5D4F4', borderRadius:10, padding:'10px 12px', marginBottom:12, fontSize:13, color:'#185FA5', fontWeight:500 }}>
                      📚 課程學員有效期間內，將以課程入場（免費）
                    </div>
                  ) : (
                    <>
                  <div style={{ fontSize:11, color:'#666', marginBottom:6 }}>入場類型</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                    {(entryTypes.length > 0 ? entryTypes : [
                      {id:'single_ticket', name:'單次入場', price:200},
                      {id:'course_access', name:'課程學員', price:0},
                      {id:'child_free', name:'兒童入場', price:100},
                      {id:'student_free', name:'學生入場', price:250},
                    ]).filter(t => {
                      // 這個清單只會在 !memberEligibility.hasCourseAccess 時渲染（有課程學員資格時
                      // 上層 banner 分支已直接帶入 course_access、不會走到這裡）→ 課程學員選項一律隱藏，
                      // 不再讓店員手動覆寫（2026-08-17 起改為：無課程學員身份就不給選）
                      if (t.id === 'course_access') return false;
                      if (!t.memberTypes || t.memberTypes.length === 0) return true;
                      if (!memberEligibility) return true;
                      const memberTypeMatch = t.memberTypes.includes(memberEligibility.memberType);
                      const courseMatch = t.memberTypes.includes('course_member') && memberEligibility.hasCourseAccess;
                      return memberTypeMatch || courseMatch;
                    }).map(t => (
                      <button key={t.id} type="button" onClick={() => setPhoneEntryType(t.id)}
                        style={{ height:34, padding:'0 12px', borderRadius:8, border:`0.5px solid ${phoneEntryType===t.id?'#185FA5':'#E8D5D5'}`, background: phoneEntryType===t.id?'#185FA5':'#fff', color: phoneEntryType===t.id?'#fff':'#666', fontSize:12, cursor:'pointer' }}>
                        {t.name}{t.price > 0 ? ` NT$${t.price}` : ''}
                      </button>
                    ))}
                  </div>
                  {/* 票券（兩段流程第二段）：選身分後可改用優惠券/黑卡/紅利/單次券 */}
                  {(() => {
                    const inst = memberEligibility?.instruments || {};
                    const basePrice = entryTypes.find(t => t.id === phoneEntryType)?.price || 0;
                    const opts = [{ key:'pay', kind:null, type:null, label:'一般付款' }];
                    if (inst.discountCard?.available) opts.push({ key:'discountCard', kind:'discountCard', type:'discount_card', label:`${inst.discountCard.teamStacked ? '優惠券8折+隊員9折' : '優惠券8折'} NT$${Math.round(basePrice*(inst.discountCard.rate||0.8))}`, cardId: inst.discountCard.cards[0]?.id });
                    if (inst.blackCard?.available) opts.push({ key:'blackCard', kind:'blackCard', type:'black_card', label:'黑卡（免費）', cardId: inst.blackCard.cards[0]?.id });
                    if (inst.bonus?.available) opts.push({ key:'bonus', kind:'bonus', type:'bonus', label:'紅利（免費）', cardId: inst.bonus.bonuses[0]?.id });
                    if (inst.singleEntryTicket?.available) opts.push({ key:'ticket', kind:'singleEntryTicket', type:'single_entry_ticket', label:'單次入場券（免費）', cardId: inst.singleEntryTicket.tickets[0]?.id });
                    // 轉換期：持實體舊折扣卡、未轉入新優惠卡者，員工可手動套 8 折（有效隊員再疊 9 折）。
                    // 僅在開關開啟、會員名下無新優惠卡、該身分有票價、且非兒童（兒童不適用折扣卡）時提供。
                    if (checkinLegacyDiscount && !inst.discountCard?.available && basePrice > 0 && phoneEntryType !== 'child_free') {
                      const teamStacked = !!inst.discountCard?.teamStacked;
                      const rate = inst.discountCard?.rate || 0.8; // 0.72(隊員疊加) / 0.8
                      opts.push({ key:'legacyDiscount', kind:'legacyDiscount', type:null, label:`${teamStacked ? '舊折扣卡8折+隊員9折' : '舊折扣卡8折'} NT$${Math.round(basePrice*rate)}` });
                    }
                    if (opts.length === 1) return null;
                    const cur = phoneInstrument?.kind || null;
                    return (
                      <>
                        <div style={{ fontSize:11, color:'#666', marginBottom:6 }}>使用票券</div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                          {opts.map(o => (
                            <button key={o.key} type="button"
                              onClick={() => setPhoneInstrument(o.kind ? { kind:o.kind, type:o.type, cardId:o.cardId } : null)}
                              style={{ height:34, padding:'0 12px', borderRadius:8, border:`0.5px solid ${cur===o.kind?'#8B1A1A':'#E8D5D5'}`, background: cur===o.kind?'#8B1A1A':'#fff', color: cur===o.kind?'#fff':'#666', fontSize:12, cursor:'pointer' }}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                    </>
                  )}

                  {phoneEntryType === 'single_ticket' && (
                    <>
                      <div style={{ fontSize:11, color:'#666', marginBottom:6 }}>付款方式</div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                        {filterPayments([{key:'cash',label:'現金'},{key:'linepay',label:'Line Pay'},{key:'jkopay',label:'街口'},{key:'taiwanpay',label:'台灣Pay'}], enabledPay).map(p => (
                          <button key={p.key} onClick={() => setPhonePayment(p.key)}
                            style={{ height:30, padding:'0 10px', borderRadius:8, border:`0.5px solid ${phonePayment===p.key?'#185FA5':'#E8D5D5'}`, background: phonePayment===p.key?'#185FA5':'#fff', color: phonePayment===p.key?'#fff':'#666', fontSize:12, cursor:'pointer' }}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {/* 岩鞋租借 */}
                  {shoeRental?.active && (
                    <div style={{ marginBottom:8 }}>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'10px 12px', borderRadius:8, border:`0.5px solid ${phoneRentShoes?'#185FA5':'#E8D5D5'}`, background: phoneRentShoes?'#E6F1FB':'#fff' }}>
                        <input type="checkbox" checked={phoneRentShoes} onChange={e => setPhoneRentShoes(e.target.checked)} style={{ width:16, height:16 }} />
                        <span style={{ fontSize:13, color: phoneRentShoes?'#185FA5':'#444', fontWeight: phoneRentShoes?500:400 }}>
                          <img src="/climbing-shoe.webp" alt="岩鞋" style={{width:18,height:18,objectFit:"contain",verticalAlign:"middle",marginRight:4}}/> 租借岩鞋 NT${shoeRental.price}
                        </span>
                      </label>
                    </div>
                  )}

                  {/* 粉袋租借 */}
                  {chalkRental?.active && (
                    <div style={{ marginBottom:12 }}>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'10px 12px', borderRadius:8, border:`0.5px solid ${phoneRentChalk?'#185FA5':'#E8D5D5'}`, background: phoneRentChalk?'#E6F1FB':'#fff' }}>
                        <input type="checkbox" checked={phoneRentChalk} onChange={e => setPhoneRentChalk(e.target.checked)} style={{ width:16, height:16 }} />
                        <span style={{ fontSize:13, color: phoneRentChalk?'#185FA5':'#444', fontWeight: phoneRentChalk?500:400 }}>
                          <img src="/chalk-bag.webp" alt="粉袋" style={{ width:18, height:18, objectFit:"contain", borderRadius:2, verticalAlign:"middle", marginRight:4 }}/> 租借粉袋 NT${chalkRental.price || 50}
                        </span>
                      </label>
                    </div>
                  )}

                  {/* 金額小計（反映所選票券：折扣券8折、黑卡/紅利/單次券免費） */}
                  {(() => {
                    const basePrice = (entryTypes.find(t => t.id === phoneEntryType)?.price || 0);
                    let entryPrice = basePrice;
                    if (phoneInstrument) {
                      if (phoneInstrument.kind === 'discountCard' || phoneInstrument.kind === 'legacyDiscount') {
                        const rate = memberEligibility?.instruments?.discountCard?.rate || 0.8; // 8折(或隊員疊9折=0.72)
                        entryPrice = Math.round(basePrice * rate);
                      } else {
                        entryPrice = 0; // 黑卡/紅利/單次券免費
                      }
                    }
                    const shoePrice = phoneRentShoes ? (shoeRental?.price || 0) : 0;
                    const chalkPrice = phoneRentChalk ? (chalkRental?.price || 50) : 0;
                    const total = entryPrice + shoePrice + chalkPrice;
                    const freeByInstrument = phoneInstrument && phoneInstrument.kind !== 'discountCard' && phoneInstrument.kind !== 'legacyDiscount';
                    if (total === 0 && !freeByInstrument) return null;
                    return (
                      <div style={{ background:'#F5EFEF', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#8B1A1A', fontWeight:500 }}>
                        合計：NT${total}
                        {freeByInstrument && <span style={{ fontSize:11, fontWeight:400, color:'#2D7D46' }}> （票券免費入場{shoePrice>0?`，岩鞋 NT$${shoePrice}`:''}{chalkPrice>0?`，粉袋 NT$${chalkPrice}`:''}）</span>}
                        {!freeByInstrument && shoePrice > 0 && <span style={{ fontSize:11, fontWeight:400, color:'#666' }}> （入場 NT${entryPrice} + 岩鞋 NT${shoePrice}）</span>}
                      </div>
                    );
                  })()}

                  {(() => {
                    const noWaiver = memberEligibility && !memberEligibility.waiverSigned;
                    const noFallTest = memberEligibility && memberEligibility.fallTestPassed === false;
                    const blocked = noWaiver || noFallTest;
                    return (
                  <>
                  <button type="button" onClick={handlePhoneCheckin}
                    disabled={phoneLoading || blocked}
                    style={{ width:'100%', height:44, borderRadius:8, background: blocked ? '#ccc' : '#2D7D46', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: blocked ? 'not-allowed' : 'pointer' }}>
                    {phoneLoading ? '...' : noWaiver ? '⚠ Waiver 未簽署，無法入場' : noFallTest ? '⚠ 未通過墜落測驗，無法入場' : memberEligibility?.isVip ? '✓ VIP 入場' : memberEligibility?.hasValidPass ? '✓ 定期票入場' : memberEligibility?.hasCourseAccess ? '✓ 課程學員入場' : '✓ 確認入場'}
                  </button>
                  {checkinAlreadyPaid && !blocked && (() => {
                    const rentTotal = (phoneRentShoes ? (shoeRental?.price || 0) : 0) + (phoneRentChalk ? (chalkRental?.price || 50) : 0);
                    return (
                    <button type="button" onClick={handlePhoneAlreadyPaid} disabled={phoneLoading}
                      title="會員於舊系統已付『入場費』，入場費記 NT$0；加購岩鞋/粉袋仍另收"
                      style={{ width:'100%', height:40, borderRadius:8, background:'#fff', color:'#854F0B', border:'0.5px solid #E0C067', fontSize:13, fontWeight:600, cursor:'pointer', marginTop:8 }}>
                      💳 已付費入場（入場費 NT$0{rentTotal > 0 ? `，加購另收 NT$${rentTotal}` : ''}）
                    </button>
                    );
                  })()}
                  </>
                    );
                  })()}
                </div>
              )}

              {phoneCheckedIn && (
                <div style={{ background:'#E6F4EB', borderRadius:10, border:'0.5px solid #2D7D4633', padding:14, marginTop:12 }}>
                  <div style={{ fontWeight:600, color:'#2D7D46', fontSize:15, marginBottom:4 }}>✓ 入場成功</div>
                  <div style={{ fontSize:13, color:'#2D7D46' }}>
                    {phoneCheckedIn.memberName} — {ENTRY_TYPE_LABEL[phoneCheckedIn.entryType] || phoneCheckedIn.entryType}
                    {phoneCheckedIn.amountPaid > 0 && ` — NT$${phoneCheckedIn.amountPaid}`}
                  </div>
                  {phoneCheckedIn.needsPromotion && (
                    <div style={{ background:'#FAEEDA', border:'0.5px solid #F0D9A8', borderRadius:8, padding:'8px 11px', marginTop:10, fontSize:12, color:'#854F0B' }}>
                      ⚠️ {phoneCheckedIn.promotionMessage}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
                    <button onClick={() => setPhoneCheckedIn(null)}
                      style={{ fontSize:12, color:'#999', background:'none', border:'none', cursor:'pointer' }}>關閉</button>
                    {/* 定期票/課程學員/VIP 等免費入場（沒有實際收款）不需要開發票 */}
                    {phoneCheckedIn.amountPaid > 0 && (
                      <InvoiceButtonAuto sourceType="checkin" refId={phoneCheckedIn.id} refreshToken={checkinInvRefresh}
                        onClick={() => setCheckinInvoiceTarget(phoneCheckedIn)}
                        style={{ height:'auto', padding:'4px 10px' }} />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 今日課程學員 tab ── */}
        {tab === 'courseStudents' && !canCheckin && (
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:24, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🔒</div>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>入場功能限值班/管理員</div>
            <div style={{ fontSize:13, color:'#999' }}>請於館別電腦打卡值班後使用，或以管理員帳號操作。</div>
          </div>
        )}
        {tab === 'courseStudents' && canCheckin && (
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#2D7D46' }}>🧗 今日課程學員</div>
              {quickMsg && (
                <span style={{ fontSize:12, color: quickMsgType==='ok' ? '#2D7D46' : '#A32D2D' }}>{quickMsg}</span>
              )}
            </div>
            {courseStudentsLoading ? (
              <div style={{ textAlign:'center', padding:20, color:'#999', fontSize:12 }}>載入中...</div>
            ) : courseStudents.length === 0 ? (
              <div style={{ textAlign:'center', padding:20, color:'#999', fontSize:12 }}>今日尚無課程報名者</div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:8 }}>
                {courseStudents.map(s => {
                  const clickDisabled = s.isCrossMakeup || s.alreadyCheckedIn || quickCheckinLoading === s.memberId;
                  return (
                  <div key={`${s.memberId || s.memberName}-${s.courseId}`}
                    onClick={() => { if (!clickDisabled) handleQuickCourseCheckin(s); }}
                    style={{
                      textAlign:'left', padding:'10px 12px', borderRadius:8,
                      border: s.alreadyCheckedIn ? '0.5px solid #E8D5D5' : '0.5px solid #B3DEC0',
                      background: s.alreadyCheckedIn ? '#F5F5F5' : '#F0F8F2',
                      cursor: clickDisabled ? 'default' : 'pointer',
                      opacity: s.alreadyCheckedIn ? 0.6 : 1,
                    }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'#1a1a1a' }}>
                        {s.memberName}
                        {s.isMakeup && !s.isCrossMakeup && <span style={{ fontSize:9, fontWeight:600, color:'#2D7D46', background:'#E6F4EB', padding:'1px 6px', borderRadius:6, marginLeft:6 }}>補課</span>}
                        {s.isCrossMakeup && <span style={{ fontSize:9, fontWeight:600, color:'#5B2D8B', background:'#F3EEF9', padding:'1px 6px', borderRadius:6, marginLeft:6 }} title={s.crossNote||''}>跨期補課・櫃檯放行</span>}
                        {s.isTrial && <span style={{ fontSize:9, fontWeight:600, color:'#5B2D8B', background:'#F3EEF9', padding:'1px 6px', borderRadius:6, marginLeft:6 }}>試上</span>}
                        {s.trialUnpaid && <span style={{ fontSize:9, fontWeight:600, color:'#A32D2D', background:'#FCEBEB', padding:'1px 6px', borderRadius:6, marginLeft:4 }}>試上費未收</span>}
                        {s.isLastSession && <span style={{ fontSize:9, fontWeight:600, color:'#A32D2D', background:'#FCEBEB', padding:'1px 6px', borderRadius:6, marginLeft:4 }}>最後一堂，請開立發票</span>}
                      </span>
                      {s.isCrossMakeup ? (
                        <span style={{ fontSize:10, color:'#5B2D8B', fontWeight:600 }}>非會員名單</span>
                      ) : s.alreadyCheckedIn ? (
                        <span style={{ fontSize:10, color:'#999', fontWeight:600 }}>已入場</span>
                      ) : quickCheckinLoading === s.memberId ? (
                        <span style={{ fontSize:10, color:'#185FA5' }}>處理中...</span>
                      ) : (
                        <span style={{ fontSize:10, color:'#2D7D46', fontWeight:600 }}>點擊入場</span>
                      )}
                    </div>
                    <div style={{ fontSize:11, color:'#999', marginTop:3 }}>{s.courseName}</div>
                    <div style={{ fontSize:11, color:'#999' }}>{s.startTime}～{s.endTime}</div>
                    {/* 課程發票：2026-08-17 放寬值班站台可開（原限管理員，後端已改
                        requireManagerOrStation，與本頁其餘入場/補租一致） */}
                    {s.isLastSession && canCheckin && (s.receivedAmount ?? 0) > 0 && (
                      <div onClick={(e) => e.stopPropagation()} style={{ marginTop:6 }}>
                        <InvoiceButtonAuto sourceType="course" refId={s.enrollmentId} refreshToken={courseInvRefresh}
                          onClick={() => setCourseInvoiceTarget(s)} style={{ width:'100%', textAlign:'center' }} />
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {courseInvoiceTarget && (
          <InvoiceIssuer
            gymId={targetGymId}
            sourceType="course"
            refId={courseInvoiceTarget.enrollmentId}
            memberId={courseInvoiceTarget.memberId}
            memberName={courseInvoiceTarget.memberName}
            paymentMethod={courseInvoiceTarget.paymentMethod}
            title={courseInvoiceTarget.memberName || ''}
            subtitle={courseInvoiceTarget.courseName || ''}
            feeInfo={courseInvoiceTarget.receivedAmount != null ? `實收金額 NT$${courseInvoiceTarget.receivedAmount}` : null}
            defaultItemName={courseInvoiceTarget.courseName || '課程費用'}
            defaultAmount={courseInvoiceTarget.receivedAmount ?? 0}
            onClose={() => { setCourseInvoiceTarget(null); setCourseInvRefresh(v => v + 1); }}
            listInvoices={() => getCourseInvoices({ enrollmentId: courseInvoiceTarget.enrollmentId }).then(r => r.data.invoices || [])}
            createInvoice={(payload) => createCourseInvoice({
              enrollmentId: courseInvoiceTarget.enrollmentId, memberId: courseInvoiceTarget.memberId,
              memberName: courseInvoiceTarget.memberName, courseId: courseInvoiceTarget.courseId,
              courseName: courseInvoiceTarget.courseName, gymId: targetGymId, ...payload,
            }).then(r => r.data.invoice)}
            voidInvoiceFn={(id) => voidCourseInvoice(id)}
          />
        )}

        {/* ── 今日入場 tab ── */}
        {tab === 'today' && (
          <div style={{ padding:16, paddingBottom: mergeMode && mergeSelected.size > 0 ? 76 : 16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, gap:8, flexWrap:'wrap' }}>
              <div style={{ fontSize:14, fontWeight:600 }}>今日入場紀錄</div>
              <div style={{ display:'flex', gap:8 }}>
                {printingEnabled && (
                  <button onClick={() => { setMergeMode(m => !m); setMergeSelected(new Set()); if (!mergeMode) loadInvoicedTodayIds(); }}
                    style={{ height:30, padding:'0 12px', borderRadius:6, background: mergeMode ? '#FCEBEB' : '#F7F3F3', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer', color: mergeMode ? '#A32D2D' : '#8B1A1A' }}>
                    {mergeMode ? '✕ 取消合併列印' : '🧾 合併列印發票'}
                  </button>
                )}
                <button onClick={loadTodayCheckIns} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#F7F3F3', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer', color:'#8B1A1A' }}>重新整理</button>
              </div>
            </div>
            {mergeMode && <div style={{ fontSize:12, color:'#854F0B', background:'#FCEBD6', borderRadius:8, padding:'8px 10px', marginBottom:10 }}>勾選要合併成同一張發票的多筆入場（如同行多人一起付款），下方會出現「合併列印發票」按鈕。</div>}
            {todayLoading && <div style={{ textAlign:'center', color:'#999', padding:24 }}>載入中...</div>}
            {!todayLoading && todayCheckIns.length === 0 && <div style={{ textAlign:'center', color:'#999', padding:24 }}>今日尚無入場紀錄</div>}
            {!todayLoading && todayCheckIns.map(c => {
              const checkedInAt = c.checkedInAt?._seconds ? new Date(c.checkedInAt._seconds * 1000) : new Date(c.checkedInAt);
              const minutesAgo = Math.floor((Date.now() - checkedInAt.getTime()) / 60000);
              const canCancel = minutesAgo <= 10;
              const alreadyInvoiced = invoicedTodayIds.has(c.id);
              const selectable = mergeMode && c.amountPaid > 0 && !alreadyInvoiced;
              const checked = mergeSelected.has(c.id);
              return (
                <div key={c.id} style={{ background: checked ? '#FBF5F5' : '#fff', borderRadius:10, border: checked ? '1.5px solid #8B1A1A' : '0.5px solid #E8D5D5', padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                  {mergeMode && (
                    <input type="checkbox" checked={checked} disabled={!selectable}
                      onChange={e => setMergeSelected(prev => { const next = new Set(prev); e.target.checked ? next.add(c.id) : next.delete(c.id); return next; })}
                      style={{ width:18, height:18, flexShrink:0, opacity: selectable ? 1 : 0.3 }} />
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:14 }}>
                      {c.memberName}
                      {mergeMode && alreadyInvoiced && <span style={{ fontSize:10, fontWeight:600, color:'#777', background:'#F0EDED', padding:'1px 6px', borderRadius:6, marginLeft:6 }}>已開票</span>}
                    </div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                      {c.gymId === 'gym-hsinchu' ? '新竹館' : '士林館'} · {entryLabelOf(c)}
                      {c.rentShoes ? ' · 岩鞋' : ''}{c.rentChalk ? ' · 粉袋' : ''}
                    </div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                      {checkedInAt.toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' })}
                      {' · NT$'}{c.amountPaid}
                      {c.amountPaid > 0 && c.paymentMethod ? ` (${PAYMENT_LABEL[c.paymentMethod] || c.paymentMethod})` : ''}
                      {canCancel ? <span style={{ color:'#2D7D46', marginLeft:6 }}>({minutesAgo}分鐘前)</span> : <span style={{ color:'#ccc', marginLeft:6 }}>(已超過10分鐘)</span>}
                    </div>
                  </div>
                  {!mergeMode && (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }}>
                      {/* 線上付款（街口等）購買的單次入場券兌換入場時 amountPaid 恆為 0（錢已在購票當下
                          收取），但仍是應開發票的真實金額——見 confirmCheckIn 寫回的 onlineTicket 欄位
                          （2026-09-03 修復：原本只判斷 amountPaid>0，此類入場的發票鈕會被誤藏）。 */}
                      {(c.amountPaid > 0 || c.onlineTicket?.amount > 0) && (
                        <InvoiceButtonAuto sourceType="checkin" refId={c.id} refreshToken={checkinInvRefresh}
                          onClick={() => setCheckinInvoiceTarget(c)} />
                      )}
                      {/* 課程學員剛好是最後一堂：先入場後也能在這裡開同一張課程發票（非入場費本身，
                          與上面「入場」發票各自獨立），資料來源見 GET /checkin/today 的 courseInvoice */}
                      {c.courseInvoice && canCheckin && (c.courseInvoice.receivedAmount ?? 0) > 0 && (
                        <InvoiceButtonAuto sourceType="course" refId={c.courseInvoice.enrollmentId} refreshToken={courseInvRefresh}
                          onClick={() => setCourseInvoiceTarget({
                            memberId: c.memberId, memberName: c.memberName,
                            courseId: c.courseInvoice.courseId, courseName: c.courseInvoice.courseName,
                            enrollmentId: c.courseInvoice.enrollmentId, paymentMethod: c.courseInvoice.paymentMethod,
                            receivedAmount: c.courseInvoice.receivedAmount,
                          })} />
                      )}
                      {/* 比賽報到入場：顯示/開立「報名費」發票（與賽事管理名單、報到掃描同一張；
                          資料來源見 GET /checkin/today 的 competitionInvoice，2026-08-30 比賽日需求） */}
                      {c.competitionInvoice && canCheckin && (c.competitionInvoice.receivedAmount ?? 0) > 0 && (
                        <InvoiceButtonAuto sourceType="competition" refId={c.competitionInvoice.registrationId} refreshToken={compInvRefresh}
                          onClick={() => setCompInvoiceTarget({ ...c.competitionInvoice, gymId: c.gymId })} />
                      )}
                      {canCancel && (
                        <button onClick={() => openCancelConfirm(c.id)} disabled={cancellingId === c.id}
                          style={{ height:32, padding:'0 12px', borderRadius:8, background:'#FCEBEB', color:'#A32D2D', border:'0.5px solid #F5C6C6', fontSize:12, cursor:'pointer', flexShrink:0 }}>
                          {cancellingId === c.id ? '取消中...' : '取消入場'}
                        </button>
                      )}
                      {!canCancel && isSuperAdmin && (
                        <button onClick={() => openCancelConfirm(c.id, true)} disabled={cancellingId === c.id}
                          style={{ height:32, padding:'0 12px', borderRadius:8, background:'#F0EDED', color:'#854F0B', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer', flexShrink:0 }}>
                          {cancellingId === c.id ? '取消中...' : '強制取消'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {mergeMode && mergeSelected.size > 0 && (
              <div style={{ position:'fixed', left:0, right:0, bottom:0, background:'#fff', borderTop:'1px solid #E8D5D5', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, boxShadow:'0 -2px 8px rgba(0,0,0,0.06)', zIndex:20 }}>
                <span style={{ fontSize:13, color:'#666' }}>
                  已選 {mergeSelected.size} 筆　合計 NT${todayCheckIns.filter(c => mergeSelected.has(c.id)).reduce((s, c) => s + (Number(c.amountPaid) || 0), 0).toLocaleString()}
                </span>
                <button
                  onClick={() => setMergedInvoiceList(todayCheckIns.filter(c => mergeSelected.has(c.id)))}
                  disabled={mergeSelected.size < 2}
                  style={{ height:40, padding:'0 18px', borderRadius:9, background: mergeSelected.size < 2 ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor: mergeSelected.size < 2 ? 'not-allowed' : 'pointer' }}>
                  🧾 合併列印發票{mergeSelected.size < 2 ? '（至少選 2 筆）' : ''}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── 歷史入場 tab ── */}
        {tab === 'history' && (
          <div style={{ padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span style={{ fontSize:14, fontWeight:600 }}>歷史入場</span>
                <input type="date" value={historyFrom} max={historyTo || dayjs().format('YYYY-MM-DD')}
                  onChange={e => setHistoryFrom(e.target.value)}
                  style={{ height:34, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, color:'#1a1a1a' }} />
                <span style={{ fontSize:12, color:'#999' }}>～</span>
                <input type="date" value={historyTo} min={historyFrom} max={dayjs().format('YYYY-MM-DD')}
                  onChange={e => setHistoryTo(e.target.value)}
                  style={{ height:34, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, color:'#1a1a1a' }} />
                <span style={{ fontSize:12, color:'#999' }}>共 {historyCheckIns.length} 筆</span>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={loadHistory} style={{ height:34, padding:'0 12px', borderRadius:8, background:'#F7F3F3', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer', color:'#8B1A1A' }}>重新整理</button>
                {isManagerOnly && (
                  <button onClick={exportHistoryCsv} disabled={!historyCheckIns.length}
                    style={{ height:34, padding:'0 12px', borderRadius:8, background:'#fff', border:'0.5px solid #E8D5D5', fontSize:12, cursor: historyCheckIns.length?'pointer':'default', color:'#6b6b6b', opacity: historyCheckIns.length?1:.5 }}>↓ 匯出 CSV</button>
                )}
              </div>
            </div>
            {historyLoading && <div style={{ textAlign:'center', color:'#999', padding:24 }}>載入中...</div>}
            {!historyLoading && historyCheckIns.length === 0 && <div style={{ textAlign:'center', color:'#999', padding:24 }}>{historyFrom === historyTo ? dayjs(historyFrom).format('MM/DD') : `${dayjs(historyFrom).format('MM/DD')}～${dayjs(historyTo).format('MM/DD')}`} 無入場紀錄</div>}
            {!historyLoading && historyCheckIns.map(c => {
              const t = c.checkedInAt?._seconds ? new Date(c.checkedInAt._seconds * 1000) : new Date(c.checkedInAt);
              return (
                <div key={c.id} style={{ background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{c.memberName}</div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                      {c.gymId === 'gym-hsinchu' ? '新竹館' : c.gymId === 'gym-shilin' ? '士林館' : ''} · {entryLabelOf(c)}
                      {c.rentShoes ? ' · 岩鞋' : ''}{c.rentChalk ? ' · 粉袋' : ''}
                    </div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                      {dayjs(t).format('YYYY-MM-DD HH:mm')}{c.amountPaid > 0 ? ` · NT$${c.amountPaid}` : ''}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }}>
                    {(c.amountPaid > 0 || c.onlineTicket?.amount > 0) && (
                      <InvoiceButtonAuto sourceType="checkin" refId={c.id} refreshToken={checkinInvRefresh}
                        onClick={() => setCheckinInvoiceTarget(c)} />
                    )}
                    {isSuperAdmin && (
                      <button onClick={() => openCancelConfirm(c.id, true)} disabled={cancellingId === c.id}
                        style={{ height:32, padding:'0 12px', borderRadius:8, background:'#F0EDED', color:'#854F0B', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer', flexShrink:0 }}>
                        {cancellingId === c.id ? '取消中...' : '強制取消'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* 右側統計 */}
      <div>
        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, color:'#999', marginBottom:12, fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>今日統計</div>

          {stats?.restricted ? (
            <div style={{ textAlign:'left', padding:'20px 8px', color:'#999', fontSize:12, lineHeight:1.7 }}>
              個人帳號登入無法查看今日統計，<br />請使用館別電腦登入並打卡值班查看。
            </div>
          ) : (
          <>
          {/* 多館 Tab */}
          {stats?.statsByGym?.length > 1 && (
            <div style={{ display:'flex', gap:4, marginBottom:12 }}>
              {stats.statsByGym.map((g, i) => (
                <button key={g.gymId} onClick={() => setStatsGymTab(i)}
                  style={{ padding:'4px 12px', borderRadius:16, border:'0.5px solid #E8D5D5', background: statsGymTab===i?'#8B1A1A':'#fff', color: statsGymTab===i?'#fff':'#666', fontSize:12, cursor:'pointer' }}>
                  {g.gymName}（{g.total}）
                </button>
              ))}
            </div>
          )}

          {/* 當前館統計 */}
          {(() => {
            const gymStat = stats?.statsByGym?.[statsGymTab];
            if (!gymStat) return (
              <div style={{ textAlign:'center', padding:20, color:'#999', fontSize:12 }}>載入中...</div>
            );
            const typeLabel = {
              monthly_pass:'定期票', pass:'定期票', buy_pass:'購買定期票', new_discount_card:'新優惠卡',
              legacy_discount_card:'舊優惠卡', discount_card:'優惠卡', buy_discount_card:'購買優惠折扣券', black_card:'黑卡',
              bonus:'紅利入場', single_ticket:'單次', single_entry_ticket:'單次券', vip:'VIP',
              course_access:'課程學員', child_free:'兒童入場', student_free:'學生入場', other:'其他',
              legacy_physical_card:'實體優惠卡', competition:'比賽報到', already_paid:'已付費放行', staff_entry:'員工入館',
            };
            return (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'0.5px solid #F5EFEF', fontSize:13 }}>
                  <span style={{ color:'#6b6b6b' }}>總入場</span>
                  <span style={{ fontWeight:700, color:'#8B1A1A', fontFamily:'monospace', fontSize:15 }}>{gymStat.total}</span>
                </div>
                {Object.entries(gymStat.counts || {}).map(([key, val]) => val > 0 ? (
                  <div key={key} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'0.5px solid #F5EFEF', fontSize:13 }}>
                    <span style={{ color:'#6b6b6b' }}>{typeLabel[key] || key}</span>
                    <span style={{ fontWeight:700, color:'#185FA5', fontFamily:'monospace', fontSize:15 }}>{val}</span>
                  </div>
                ) : null)}
              </>
            );
          })()}

          {stats?.statsByGym?.length > 1 && (
            <div style={{ marginTop:10, paddingTop:8, borderTop:'0.5px solid #F5EFEF', fontSize:12, color:'#999', textAlign:'right' }}>
              全館合計：{stats.total} 人
            </div>
          )}
          </>
          )}
        </div>

        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 12px 8px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
            <span style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>每日入場數</span>
            <span style={{ fontSize:12, color:'#1a1a1a', fontWeight:600 }}>{dayjs().format('MM/DD')}（{dayjs().format('ddd')}）</span>
          </div>
          {trend?.data?.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={trend.data} margin={{ top:4, right:6, left:-24, bottom:0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#F2EEEE" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize:9, fill:'#bbb' }} interval={4} tickLine={false} axisLine={{ stroke:'#E8D5D5' }} />
                  <YAxis tick={{ fontSize:9, fill:'#bbb' }} width={26} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize:11, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'4px 8px' }} labelFormatter={d => `${d} 日`} />
                  {isSuperAdmin ? (
                    <>
                      {/* 上月：兩館淡色細虛線（畫在後、當背景參考）*/}
                      <Line type="monotone" dataKey="hsinchuPrev" name="上月新竹" stroke="#E0A6A6" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls isAnimationActive={false} />
                      <Line type="monotone" dataKey="shilinPrev" name="上月士林" stroke="#A6C3E5" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls isAnimationActive={false} />
                      {/* 本月：兩館實線 */}
                      <Line type="monotone" dataKey="hsinchu" name="新竹館" stroke="#8B1A1A" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                      <Line type="monotone" dataKey="shilin" name="士林館" stroke="#185FA5" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                    </>
                  ) : (
                    <>
                      <Line type="monotone" dataKey="previous" name={`上月（${trend.prevLabel}）`} stroke="#C9BFBF" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                      <Line type="monotone" dataKey="current" name={`本月（${trend.curLabel}）`} stroke={targetGymId === 'gym-shilin' ? '#185FA5' : '#8B1A1A'} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
              <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap', fontSize:10, color:'#777', marginTop:2 }}>
                {isSuperAdmin ? (
                  <>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:12, height:2, background:'#8B1A1A', display:'inline-block' }} />新竹館</span>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:12, height:2, background:'#185FA5', display:'inline-block' }} />士林館</span>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:12, height:0, borderTop:'1.5px dashed #E0A6A6', display:'inline-block' }} />上月新竹</span>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:12, height:0, borderTop:'1.5px dashed #A6C3E5', display:'inline-block' }} />上月士林</span>
                  </>
                ) : (
                  <>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:12, height:2, background: targetGymId === 'gym-shilin' ? '#185FA5' : '#8B1A1A', display:'inline-block' }} />本月（{trend.curLabel}）</span>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:12, height:2, background:'#C9BFBF', display:'inline-block' }} />上月（{trend.prevLabel}）</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign:'center', color:'#999', fontSize:12, padding:'24px 0' }}>{trend ? '本月與上月暫無入場資料' : '載入中…'}</div>
          )}
        </div>
      </div>

      {/* 開立發票（共用元件，與比賽報到頁/課程學員頁同一套；依開關自動切換真列印／手動記帳版）——
          品項名稱比照「今日結帳」的入場分類（成人/學生/兒童＋優惠券/隊員/特約商店），租借岩鞋/粉袋
          另列一行，不是原始 entryType 英文對照的「入場費」籠統帶過。
          ⚠ 放在 tab 切換範圍之外（與下方 cancelConfirm 同層）——曾經誤放在 tab==='scan' 區塊內，
          導致「今日入場」「歷史入場」分頁按鍵能設定 checkinInvoiceTarget、但沒有對應的渲染路徑會
          真的顯示視窗（切到掃描分頁才會突然跳出來），點下去像完全沒反應。*/}
      {checkinInvoiceTarget && (() => {
        // 2026-08-23：線上付款（街口等）已含租借費用時，checkIn.amountPaid/shoesPrice 皆為 0
        // （租借已於付款當下收取，見 checkin/flow.js createPendingCheckIn 的權威覆寫）——改用
        // onlineTicket.amount（真正實收總額）＋ rentShoes/rentChalk 反推品項金額，讓開立發票時
        // 正確顯示「已線上付款」的全部品項，而非誤顯示成 0 元。
        const ot = checkinInvoiceTarget.onlineTicket;
        // 2026-08-24：此券線上購買的其實是優惠折扣券/定期票時，checkIn.entryType 恆為
        // 'single_entry_ticket'（redeem 統一走這個入場類型），invoiceEntryItemName 只認 entryType
        // 會誤標成「單次入場券」——用票券自帶的 grantsDiscountCard/grantsPassTypeName 覆寫正確品項名稱。
        // 2026-08-27：使用（已持有的）優惠折扣券同理——改用票上的 discountCardBaseEntryType（真正
        // 身分）組成合法 rec 再交給 invoiceEntryItemName，正確歸「成人／學生使用優惠券」（而非
        // 用 checkIn.entryType='single_entry_ticket' 誤判成單次入場券）。
        const entryName = ot?.grantsDiscountCard ? '購買優惠折扣券'
          : ot?.grantsPassTypeName ? `定期票（${ot.grantsPassTypeName}）`
          : ot?.usesDiscountCard ? invoiceEntryItemName({ entryType: 'discount_card', baseEntryType: ot.discountCardBaseEntryType })
          : invoiceEntryItemName(checkinInvoiceTarget);
        const rentalName = ot ? invoiceRentalItemName({ shoesPrice: ot.rentShoes ? 100 : 0, chalkPrice: ot.rentChalk ? 50 : 0 })
          : invoiceRentalItemName(checkinInvoiceTarget);
        const rentalAmount = ot ? (ot.rentShoes ? 100 : 0) + (ot.rentChalk ? 50 : 0)
          : (Number(checkinInvoiceTarget.shoesPrice) || 0) + (Number(checkinInvoiceTarget.chalkPrice) || 0);
        const totalAmount = ot?.amount > 0 ? ot.amount : (Number(checkinInvoiceTarget.amountPaid) || 0);
        const entryFee = ot?.amount > 0
          ? totalAmount - rentalAmount
          : (checkinInvoiceTarget.entryFee != null ? Number(checkinInvoiceTarget.entryFee) : totalAmount - rentalAmount); // 舊資料無 entryFee 欄位時反推
        return (
          <InvoiceIssuer
            gymId={checkinInvoiceTarget.gymId}
            sourceType="checkin"
            refId={checkinInvoiceTarget.id}
            memberId={checkinInvoiceTarget.memberId}
            memberName={checkinInvoiceTarget.memberName}
            paymentMethod={ot?.paymentMethod || checkinInvoiceTarget.paymentMethod}
            title={checkinInvoiceTarget.memberName || ''}
            subtitle={ot?.grantsDiscountCard ? '購買優惠折扣券' : ot?.grantsPassTypeName ? `定期票（${ot.grantsPassTypeName}）` : ot?.usesDiscountCard ? entryName : (ENTRY_TYPE_LABEL[checkinInvoiceTarget.entryType] || checkinInvoiceTarget.entryType || '')}
            feeInfo={totalAmount > 0 ? `實收金額 NT$${totalAmount}${ot ? '（已線上付款）' : ''}` : ''}
            defaultItemName={rentalName ? `${entryName}＋${rentalName}` : entryName}
            defaultAmount={totalAmount}
            itemBreakdown={rentalName ? [{ name: entryName, amount: entryFee }, { name: rentalName, amount: rentalAmount }] : null}
            onClose={() => { setCheckinInvoiceTarget(null); setCheckinInvRefresh(v => v + 1); }}
            listInvoices={() => getCheckinInvoices(checkinInvoiceTarget.id).then(r => r.data.invoices || [])}
            createInvoice={(payload) => createCheckinInvoice(checkinInvoiceTarget.id, payload).then(r => r.data.invoice)}
            voidInvoiceFn={(id) => voidCheckinInvoice(id)}
          />
        );
      })()}

      {/* 合併列印發票（多筆入場合開一張，如同行多人一起付款）——僅真列印館別提供（見 mergeMode 按鈕本身
          就只在 printingEnabled 時顯示），直接用 RealPrintPanel（不經 InvoiceIssuer 的開關判斷，反正只有
          真列印時才會走到這裡）；每人一行明細（itemBreakdown），付款方式沒有單一來源可回寫，改用
          alwaysShowPaymentSelector 讓值班人員自行選一個合併付款方式（僅供決定要不要開錢櫃/找零計算）。*/}
      {mergedInvoiceList && (() => {
        const list = mergedInvoiceList;
        const total = list.reduce((s, c) => s + (Number(c.amountPaid) || 0), 0);
        // 紙本不印會員姓名（2026-08-15 使用者要求）——只列入場類型，姓名僅供螢幕上 title/subtitle
        // 讓值班人員核對是否選對人，不進印出的明細。
        return (
          <RealPrintPanel
            gymId={list[0]?.gymId}
            sourceType="checkin_merged"
            refId={null}
            memberId={null}
            memberName={list.map(c => c.memberName).join('、')}
            paymentMethod={list[0]?.paymentMethod || 'cash'}
            title={`合併列印發票（${list.length} 人）`}
            subtitle={list.map(c => c.memberName).join('、')}
            defaultItemName="入場費（合併）"
            defaultAmount={total}
            itemBreakdown={list.map(c => ({ name: entryLabelOf(c), amount: Number(c.amountPaid) || 0 }))}
            mergedCheckinIds={list.map(c => c.id)}
            alwaysShowPaymentSelector
            onClose={() => { setMergedInvoiceList(null); setMergeMode(false); setMergeSelected(new Set()); loadTodayCheckIns(); }}
          />
        );
      })()}

      {/* 取消入場確認彈窗——先查這筆有沒有已列印/作用中的發票，有的話醒目警示務必取回原紙本 */}
      {cancelConfirm && (
        <Modal title={cancelConfirm.force ? '強制取消入場' : '取消入場'} onClose={() => setCancelConfirm(null)}>
          {cancelConfirm.checking ? (
            <div style={{ fontSize:13, color:'#999', textAlign:'center', padding:'20px 0' }}>查詢發票中...</div>
          ) : (
            <>
              {cancelConfirm.invoice ? (
                <div style={{ background:'#FCEBEB', border:'1px solid #A32D2D33', borderRadius:8, padding:14, marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#A32D2D', marginBottom:8 }}>⚠️ 務必取回原列印發票</div>
                  <div style={{ fontSize:12, color:'#444', lineHeight:1.7 }}>
                    這筆入場已列印過發票，取消後系統會自動把它作廢（號碼不會重複使用），
                    但<strong>紙本仍在客人手上</strong>——請務必當面取回，避免流出已失效的發票。
                  </div>
                  <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #A32D2D22' }}>
                    <div style={{ fontSize:16, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace' }}>{cancelConfirm.invoice.invoiceNo}</div>
                    <div style={{ fontSize:13, marginTop:2 }}>{cancelConfirm.invoice.itemName}　NT${cancelConfirm.invoice.amount}</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize:13, color:'#444', marginBottom:16, lineHeight:1.6 }}>
                  {cancelConfirm.force ? '確定要強制取消這筆入場紀錄？（超管限定，可超過10分鐘時限）' : '確定要取消這筆入場紀錄？'}
                </div>
              )}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setCancelConfirm(null)}
                  style={{ flex:1, height:40, borderRadius:9, border:'1px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>
                  取消
                </button>
                <button onClick={() => { const { checkInId, force } = cancelConfirm; setCancelConfirm(null); handleCancelCheckin(checkInId, force); }}
                  style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  確定{cancelConfirm.force ? '強制取消' : '取消'}入場
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
