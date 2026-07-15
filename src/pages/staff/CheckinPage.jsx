import { useState, useEffect, useRef } from 'react';
import client from '../../api/client';
import { scanQrCode, confirmCheckIn, cancelCheckIn, getTodayStats, getTodayCourseStudents, getCheckInHistory } from '../../api/checkin';
import { getGyms } from '../../api/gyms';
import { useAuth } from '../../store/authStore';
import { useEnabledPayments, filterPayments } from '../../utils/paymentMethods';
import SegmentedTabs from '../../components/SegmentedTabs';
import dayjs from 'dayjs';
import jsQR from 'jsqr';
import { entryLabelOf } from '../../utils/entryLabel';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

const ENTRY_TYPE_LABEL = {
  pass: '定期票', vip: 'VIP', course_access: '課程學員',
  child_free: '兒童入場', student_free: '學生入場',
  discount_card: '優惠折扣券', black_card: '黑卡',
  single_entry_ticket: '單次入場券', single_ticket: '單次購票',
  buy_discount_card: '購買優惠折扣券', buy_pass: '購買定期票', already_paid: '已付費（舊系統）',
};

const PAYMENT_LABEL = { cash:'現金', linepay:'Line Pay', jkopay:'街口支付', taiwanpay:'台灣 Pay' };

export default function CheckinPage() {
  const enabledPay = useEnabledPayments();
  const { staff, operator, activeGymId, viewGym } = useAuth();
  const isSuperAdmin = staff?.role === 'super_admin';
  // 入場動作限值班(operator)/管理員（與後端 requireManagerOrStation 一致）；報表 tab 不限
  const canCheckin = ['super_admin', 'gym_manager'].includes(staff?.role) || !!operator;
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
    // super_admin 不帶 gymId → 後端回兩館各自序列，圖表分線（新竹紅/士林藍）
    client.get('/checkin/monthly-daily-counts', { params: { gymId: isSuperAdmin ? undefined : (targetGymId || undefined) } })
      .then(r => setTrend(r.data)).catch(() => setTrend({ data: [] }));
  }, [targetGymId, isSuperAdmin]);

  const [courseStudents, setCourseStudents] = useState([]);
  const [courseStudentsLoading, setCourseStudentsLoading] = useState(false);
  const [quickCheckinLoading, setQuickCheckinLoading] = useState(null); // memberId 正在處理中

  const loadCourseStudents = async () => {
    if (!targetGymId) return;
    setCourseStudentsLoading(true);
    try {
      const res = await getTodayCourseStudents(targetGymId);
      setCourseStudents(res.data.students || []);
    } catch (e) { setCourseStudents([]); }
    finally { setCourseStudentsLoading(false); }
  };

  useEffect(() => { loadCourseStudents(); }, [targetGymId]);

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
  const [qrInput, setQrInput] = useState('');
  const [showCamera, setShowCamera] = useState(false);   // 相機掃碼視窗
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const scanningRef = useRef(false);
  const [scanResult, setScanResult] = useState(null);
  const [compScan, setCompScan] = useState(null); // 比賽報到掃描結果（compchk: QR）
  const [confirmedCheckIn, setConfirmedCheckIn] = useState(null);
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
  // 歷史入場（按日期、全館逐筆）
  const [historyDate, setHistoryDate] = useState(dayjs().format('YYYY-MM-DD'));
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
  useEffect(() => { if (tab === 'history') loadHistory(); /* eslint-disable-next-line */ }, [historyDate, targetGymId]);
  useEffect(() => { if (tab === 'scan' && confirmedCheckIn) setTimeout(() => inputRef.current?.focus(), 300); }, [confirmedCheckIn]);

  const loadStats = async () => {
    try {
      const res = await getTodayStats(staff?.gymId);
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

  const loadTodayCheckIns = async () => {
    setTodayLoading(true);
    try {
      const res = await client.get('/checkin/today');
      const all = res.data?.recent || [];
      setTodayCheckIns(all.filter(c => !c.isCancelled));
    } catch(e) { console.error(e); }
    finally { setTodayLoading(false); }
  };

  // 歷史入場：指定日期（台灣時間整日）全館逐筆
  const loadHistory = async () => {
    if (!targetGymId && !isSuperAdmin) return;
    setHistoryLoading(true);
    try {
      const res = await getCheckInHistory({
        gymId: targetGymId || undefined,
        dateFrom: `${historyDate}T00:00:00+08:00`,
        dateTo: `${historyDate}T23:59:59+08:00`,
        limit: 500,
      });
      setHistoryCheckIns((res.data.checkIns || []).filter(c => !c.isCancelled));
    } catch (e) { setHistoryCheckIns([]); }
    finally { setHistoryLoading(false); }
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
    a.href = url; a.download = `入場紀錄_${historyDate}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const handleCancelCheckin = async (checkInId, force = false) => {
    const msg = force ? '確定要強制取消這筆入場紀錄？（超管限定）' : '確定要取消這筆入場紀錄？';
    if (!window.confirm(msg)) return;
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

  // 共用掃描邏輯（掃描槍輸入框 / 相機掃碼皆走此）
  const runScan = async (token) => {
    const t = (token || '').trim();
    if (!t) return;
    // 比賽報到 QR（compchk: 前綴）→ 走比賽報到流程（驗報名資格、不卡墜測）
    if (t.startsWith('compchk:')) {
      setLoading(true); setScanResult(null); setConfirmedCheckIn(null); setCompScan(null);
      try {
        const res = await client.post('/competitions/checkin/scan', { token: t });
        setCompScan({ ...res.data, token: t });
      } catch (err) {
        setCompScan({ error: err.response?.data?.message || '掃描失敗' });
      } finally { setLoading(false); }
      return;
    }
    setLoading(true);
    setScanResult(null);
    setConfirmedCheckIn(null);
    setCompScan(null);
    try {
      const res = await scanQrCode(t);
      setScanResult(res.data);
    } catch (err) {
      setScanResult({ error: err.response?.data?.message || '掃描失敗' });
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
              { key:'history', label:'歷史入場' },
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
                    <div style={{ fontSize:13, lineHeight:2 }}>
                      <div>選手：<strong>{compScan.memberName}</strong></div>
                      <div>賽事：{compScan.competitionName}・{compScan.divisionName}</div>
                      <div>比賽日：{compScan.eventDate}</div>
                      <div>繳費：{compScan.paymentStatus === 'confirmed'
                        ? <span style={{ color:'#2D7D46', fontWeight:600 }}>已確認（NT${compScan.registrationFee}）</span>
                        : <span style={{ color:'#A32D2D', fontWeight:700 }}>⚠ 未確認收款（NT${compScan.registrationFee}），請先收款</span>}</div>
                      {!compScan.isComplete && <div style={{ color:'#A32D2D', fontWeight:600 }}>⚠ 尚未完成簽署（待法定代理人）</div>}
                      {compScan.checkedInAt && <div style={{ color:'#854F0B', fontWeight:700 }}>⚠ 此選手已完成報到</div>}
                    </div>
                    {!compScan.checkedInAt && (
                      <button onClick={async () => {
                        try {
                          const r = await client.post('/competitions/checkin/confirm', { token: compScan.token });
                          setCompScan(null);
                          setConfirmedCheckIn({ memberName: compScan.memberName, entryType: 'competition', amountPaid: 0, message: r.data.message });
                        } catch (err) { setCompScan(prev => ({ ...prev, error: err.response?.data?.message || '報到失敗' })); }
                      }}
                        style={{ marginTop:12, width:'100%', height:42, borderRadius:9, background:'#2D7D46', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                        ✓ 確認報到（不卡墜落測驗）
                      </button>
                    )}
                  </>
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
                {scanResult.partnerVendor && (
                  <div style={{ background:'#FEF3E2', border:'1px solid #F0C889', borderRadius:8, padding:'10px 12px', marginBottom:8, fontSize:13, color:'#8A5A00', fontWeight:600 }}>
                    ⚠ 特約廠商優惠（−20）：請會員出示特約廠商證件確認後再放行
                  </div>
                )}
                {scanResult.entryType === 'student_free' && (
                  <div style={{ background:'#FEF3E2', border:'1px solid #F0C889', borderRadius:8, padding:'10px 12px', marginBottom:8, fontSize:13, color:'#8A5A00', fontWeight:600 }}>
                    🎓 學生入場：請查驗學生證後再放行
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
                  {confirmedCheckIn.memberName} — {ENTRY_TYPE_LABEL[confirmedCheckIn.entryType] || confirmedCheckIn.entryType}
                  {confirmedCheckIn.amountPaid > 0 && ` — NT$${confirmedCheckIn.amountPaid}`}
                </div>
                {confirmedCheckIn.id && (
                  <button onClick={() => handleCancel(confirmedCheckIn.id)}
                    style={{ fontSize:12, color:'#A32D2D', background:'none', border:'0.5px solid #A32D2D', borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
                    取消入場（10分鐘內）
                  </button>
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
                  <button onClick={() => setPhoneCheckedIn(null)}
                    style={{ marginTop:8, fontSize:12, color:'#999', background:'none', border:'none', cursor:'pointer' }}>關閉</button>
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
                {courseStudents.map(s => (
                  <button key={`${s.memberId}-${s.courseId}`}
                    onClick={() => handleQuickCourseCheckin(s)}
                    disabled={s.alreadyCheckedIn || quickCheckinLoading === s.memberId}
                    style={{
                      textAlign:'left', padding:'10px 12px', borderRadius:8,
                      border: s.alreadyCheckedIn ? '0.5px solid #E8D5D5' : '0.5px solid #B3DEC0',
                      background: s.alreadyCheckedIn ? '#F5F5F5' : '#F0F8F2',
                      cursor: s.alreadyCheckedIn ? 'default' : 'pointer',
                      opacity: s.alreadyCheckedIn ? 0.6 : 1,
                    }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:13, fontWeight:600, color:'#1a1a1a' }}>{s.memberName}</span>
                      {s.alreadyCheckedIn ? (
                        <span style={{ fontSize:10, color:'#999', fontWeight:600 }}>已入場</span>
                      ) : quickCheckinLoading === s.memberId ? (
                        <span style={{ fontSize:10, color:'#185FA5' }}>處理中...</span>
                      ) : (
                        <span style={{ fontSize:10, color:'#2D7D46', fontWeight:600 }}>點擊入場</span>
                      )}
                    </div>
                    <div style={{ fontSize:11, color:'#999', marginTop:3 }}>{s.courseName}</div>
                    <div style={{ fontSize:11, color:'#999' }}>{s.startTime}～{s.endTime}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 今日入場 tab ── */}
        {tab === 'today' && (
          <div style={{ padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:14, fontWeight:600 }}>今日入場紀錄</div>
              <button onClick={loadTodayCheckIns} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#F7F3F3', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer', color:'#8B1A1A' }}>重新整理</button>
            </div>
            {todayLoading && <div style={{ textAlign:'center', color:'#999', padding:24 }}>載入中...</div>}
            {!todayLoading && todayCheckIns.length === 0 && <div style={{ textAlign:'center', color:'#999', padding:24 }}>今日尚無入場紀錄</div>}
            {!todayLoading && todayCheckIns.map(c => {
              const checkedInAt = c.checkedInAt?._seconds ? new Date(c.checkedInAt._seconds * 1000) : new Date(c.checkedInAt);
              const minutesAgo = Math.floor((Date.now() - checkedInAt.getTime()) / 60000);
              const canCancel = minutesAgo <= 10;
              return (
                <div key={c.id} style={{ background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{c.memberName}</div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                      {c.gymId === 'gym-hsinchu' ? '新竹館' : '士林館'} · {entryLabelOf(c)}
                      {c.rentShoes ? ' · 岩鞋' : ''}{c.rentChalk ? ' · 粉袋' : ''}
                    </div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                      {checkedInAt.toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' })}
                      {' · NT$'}{c.amountPaid}
                      {canCancel ? <span style={{ color:'#2D7D46', marginLeft:6 }}>({minutesAgo}分鐘前)</span> : <span style={{ color:'#ccc', marginLeft:6 }}>(已超過10分鐘)</span>}
                    </div>
                  </div>
                  {canCancel && (
                    <button onClick={() => handleCancelCheckin(c.id)} disabled={cancellingId === c.id}
                      style={{ height:32, padding:'0 12px', borderRadius:8, background:'#FCEBEB', color:'#A32D2D', border:'0.5px solid #F5C6C6', fontSize:12, cursor:'pointer', flexShrink:0 }}>
                      {cancellingId === c.id ? '取消中...' : '取消入場'}
                    </button>
                  )}
                  {!canCancel && isSuperAdmin && (
                    <button onClick={() => handleCancelCheckin(c.id, true)} disabled={cancellingId === c.id}
                      style={{ height:32, padding:'0 12px', borderRadius:8, background:'#F0EDED', color:'#854F0B', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer', flexShrink:0 }}>
                      {cancellingId === c.id ? '取消中...' : '強制取消'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── 歷史入場 tab ── */}
        {tab === 'history' && (
          <div style={{ padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:14, fontWeight:600 }}>歷史入場</span>
                <input type="date" value={historyDate} max={dayjs().format('YYYY-MM-DD')}
                  onChange={e => setHistoryDate(e.target.value)}
                  style={{ height:34, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, color:'#1a1a1a' }} />
                <span style={{ fontSize:12, color:'#999' }}>共 {historyCheckIns.length} 筆</span>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={loadHistory} style={{ height:34, padding:'0 12px', borderRadius:8, background:'#F7F3F3', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer', color:'#8B1A1A' }}>重新整理</button>
                <button onClick={exportHistoryCsv} disabled={!historyCheckIns.length}
                  style={{ height:34, padding:'0 12px', borderRadius:8, background:'#fff', border:'0.5px solid #E8D5D5', fontSize:12, cursor: historyCheckIns.length?'pointer':'default', color:'#6b6b6b', opacity: historyCheckIns.length?1:.5 }}>↓ 匯出 CSV</button>
              </div>
            </div>
            {historyLoading && <div style={{ textAlign:'center', color:'#999', padding:24 }}>載入中...</div>}
            {!historyLoading && historyCheckIns.length === 0 && <div style={{ textAlign:'center', color:'#999', padding:24 }}>{dayjs(historyDate).format('MM/DD')} 無入場紀錄</div>}
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
                  {isSuperAdmin && (
                    <button onClick={() => handleCancelCheckin(c.id, true)} disabled={cancellingId === c.id}
                      style={{ height:32, padding:'0 12px', borderRadius:8, background:'#F0EDED', color:'#854F0B', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer', flexShrink:0 }}>
                      {cancellingId === c.id ? '取消中...' : '強制取消'}
                    </button>
                  )}
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
              legacy_physical_card:'實體優惠卡', competition:'比賽報到',
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
                  <Line type="monotone" dataKey="previous" name={`上月（${trend.prevLabel}）`} stroke="#C9BFBF" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                  {isSuperAdmin ? (
                    <>
                      <Line type="monotone" dataKey="hsinchu" name="新竹館" stroke="#8B1A1A" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                      <Line type="monotone" dataKey="shilin" name="士林館" stroke="#185FA5" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                    </>
                  ) : (
                    <Line type="monotone" dataKey="current" name={`本月（${trend.curLabel}）`} stroke={targetGymId === 'gym-shilin' ? '#185FA5' : '#8B1A1A'} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
              <div style={{ display:'flex', gap:14, justifyContent:'center', fontSize:10, color:'#777', marginTop:2 }}>
                {isSuperAdmin ? (
                  <>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:12, height:2, background:'#8B1A1A', display:'inline-block' }} />新竹館</span>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:12, height:2, background:'#185FA5', display:'inline-block' }} />士林館</span>
                  </>
                ) : (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:12, height:2, background: targetGymId === 'gym-shilin' ? '#185FA5' : '#8B1A1A', display:'inline-block' }} />本月（{trend.curLabel}）</span>
                )}
                <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:12, height:2, background:'#C9BFBF', display:'inline-block' }} />上月（{trend.prevLabel}）</span>
              </div>
            </>
          ) : (
            <div style={{ textAlign:'center', color:'#999', fontSize:12, padding:'24px 0' }}>{trend ? '本月與上月暫無入場資料' : '載入中…'}</div>
          )}
        </div>
      </div>
    </div>
  );
}
