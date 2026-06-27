import { useState, useEffect, useRef } from 'react';
import client from '../../api/client';
import { scanQrCode, confirmCheckIn, cancelCheckIn, getTodayStats, getTodayCourseStudents } from '../../api/checkin';
import { getNotifications, markAllAsRead } from '../../api/notifications';
import { getPendingTickets, approveTicket, rejectTicket } from '../../api/passes';
import { getGyms } from '../../api/gyms';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';

const ENTRY_TYPE_LABEL = {
  pass: '定期票', vip: 'VIP', course_access: '課程學員',
  child_free: '兒童免費', student_free: '學生免費',
  discount_card: '優惠折扣券', black_card: '黑卡',
  single_entry_ticket: '單次入場券', single_ticket: '單次購票',
  buy_discount_card: '購買優惠折扣券',
};

const PAYMENT_LABEL = { cash:'現金', linepay:'Line Pay', jkopay:'街口支付', taiwanpay:'台灣 Pay' };

export default function CheckinPage() {
  const { staff, activeGymId } = useAuth();
  const isSuperAdmin = staff?.role === 'super_admin';
  const [gyms, setGyms] = useState([]);
  const [selectedGymId, setSelectedGymId] = useState('');
  const targetGymId = activeGymId || staff?.gymId || (isSuperAdmin ? selectedGymId : '');

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
      getGyms().then(res => {
        const list = res.data.gyms || [];
        setGyms(list);
        if (!selectedGymId && list.length > 0) setSelectedGymId(list[0].id);
      }).catch(() => {});
    }
  }, [isSuperAdmin, activeGymId]);

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
  const [transfers, setTransfers] = useState([]);
  const [transferCount, setTransferCount] = useState(0); // scan | pending | notifications
  const [qrInput, setQrInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
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
  const [phoneSubMembers, setPhoneSubMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsGymTab, setStatsGymTab] = useState(0);
  const [entryTypes, setEntryTypes] = useState([]);
  const [shoeRental, setShoeRental] = useState({ price: 100, active: true });
  const [chalkRental, setChalkRental] = useState({ price: 50, active: true });
  const [phoneRentShoes, setPhoneRentShoes] = useState(false);
  const [phoneRentChalk, setPhoneRentChalk] = useState(false);
  const [log, setLog] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [pendingTickets, setPendingTickets] = useState([]);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { loadStats(); loadNotifications(); loadPendingTickets(); loadTransfers(); loadEntryTypes(); }, []);
  useEffect(() => {
    if (tab === 'scan') inputRef.current?.focus();
    if (tab === 'today') loadTodayCheckIns();
  }, [tab]);
  useEffect(() => { if (tab === 'scan' && confirmedCheckIn) setTimeout(() => inputRef.current?.focus(), 300); }, [confirmedCheckIn]);

  const loadTransfers = async () => {
    try {
      const res = await client.get('/transfers/pending');
      const list = res.data.transfers || [];
      setTransfers(list);
      setTransferCount(list.length);
    } catch (e) { console.error('loadTransfers', e); }
  };

  const handleConfirmTransfer = async (id) => {
    try {
      await client.put(`/transfers/${id}/confirm`, {});
      await loadTransfers();
    } catch (e) {}
  };

  const handleRejectTransfer = async (id) => {
    const reason = window.prompt('拒絕原因（選填）') || '';
    try {
      await client.put(`/transfers/${id}/reject`, { reason });
      await loadTransfers();
    } catch (e) {}
  };

  const loadStats = async () => {
    try {
      const res = await getTodayStats(staff?.gymId);
      setStats(res.data);
      setLog(res.data.recent || []);
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

  const loadNotifications = async () => {
    try {
      const res = await getNotifications();
      setNotifications(res.data.notifications || []);
    } catch (e) {}
  };

  const loadPendingTickets = async () => {
    try {
      const res = await getPendingTickets();
      setPendingTickets(res.data.tickets || []);
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

  const handleCancelCheckin = async (checkInId, force = false) => {
    const msg = force ? '確定要強制取消這筆入場紀錄？（超管限定）' : '確定要取消這筆入場紀錄？';
    if (!window.confirm(msg)) return;
    setCancellingId(checkInId);
    try {
      await client.post('/checkin/cancel', { checkInId, force });
      setTodayCheckIns(prev => prev.filter(c => c.id !== checkInId));
    } catch(err) {
      alert(err.response?.data?.message || '取消失敗');
    } finally { setCancellingId(null); }
  };

  const handleScan = async (e) => {
    e.preventDefault();
    if (!qrInput.trim()) { inputRef.current?.focus(); setScanResult({ error: '請將游標點入輸入框後再掃描 QR Code' }); return; }
    setLoading(true);
    setScanResult(null);
    setConfirmedCheckIn(null);
    try {
      const res = await scanQrCode(qrInput.trim());
      setScanResult(res.data);
    } catch (err) {
      setScanResult({ error: err.response?.data?.message || '掃描失敗' });
    } finally {
      setLoading(false);
      setQrInput('');
      inputRef.current?.focus();
    }
  };

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
      const found = members.find(m => m.phone === phoneInput.trim() || m.phone === phoneInput.trim().replace(/-/g,''));
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
    console.log('[手機入場] handlePhoneCheckin 觸發，phoneSelectedMember =', phoneSelectedMember);
    if (!phoneSelectedMember) {
      setPhoneError('請先選擇入場人員');
      return;
    }
    // 有定期票時自動使用 pass 入場，不需選入場類型
    const effectiveEntryType = memberEligibility?.isVip ? 'vip' : memberEligibility?.hasValidPass ? 'pass' : memberEligibility?.hasCourseAccess ? 'course_access' : phoneEntryType;
    setPhoneLoading(true);
    try {
      const res = await client.post('/checkin/phone', {
        memberId: phoneSelectedMember.id,
        gymId: targetGymId,
        entryType: effectiveEntryType,
        paymentMethod: phonePayment,
        rentShoes: phoneRentShoes,
        rentChalk: phoneRentChalk,
      });
      setPhoneCheckedIn({
        ...res.data.checkIn,
        needsPromotion: res.data.needsPromotion || false,
        promotionMessage: res.data.promotionMessage,
      });
      setPhoneMember(null);
      setPhoneInput('');
      setPhoneRentShoes(false);
      setPhoneRentChalk(false);
      await loadStats();
    } catch (e) {
      setPhoneError(e.response?.data?.message || '入場失敗');
    } finally {
      setPhoneLoading(false);
    }
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

  const handleApprove = async (id) => {
    try {
      await approveTicket(id);
      await loadPendingTickets();
      await loadNotifications();
      alert('審核通過');
    } catch (err) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleReject = async (id) => {
    if (!rejectReason.trim()) { alert('請填寫拒絕原因'); return; }
    try {
      await rejectTicket(id, rejectReason);
      setRejectingId(null);
      setRejectReason('');
      await loadPendingTickets();
      await loadNotifications();
    } catch (err) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const unreadCount = notifications.length;
  const pendingCount = pendingTickets.length;

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
              <span style={{ fontSize:12, color:selectedGymId ? '#2D7D46' : '#854F0B' }}>{selectedGymId ? '✅ 已選擇館別' : '⚠ 請選擇操作館別：'}</span>
              <select value={selectedGymId} onChange={e => setSelectedGymId(e.target.value)}
                style={{ height:30, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#fff', outline:'none', color:'#1a1a1a' }}>
                {gyms.map(g => <option key={g.id} value={g.id}>{g.shortName || g.name}</option>)}
              </select>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:'flex', borderBottom:'0.5px solid #E8D5D5' }}>
            {[
              { key:'scan', label:'掃描入場' },
              { key:'courseStudents', label:`今日課程學員 ${courseStudents.length > 0 ? `(${courseStudents.length})` : ''}` },
              { key:'pending', label:`待審核 ${pendingCount > 0 ? `(${pendingCount})` : ''}` },
              { key:'notifications', label:`通知 ${unreadCount > 0 ? `(${unreadCount})` : ''}` },
              { key:'transfers', label:`轉帳確認 ${transferCount > 0 ? `(${transferCount})` : ''}` },
              { key:'today', label:'今日入場' },
            ].map(t => (
              <div key={t.key} onClick={() => setTab(t.key)}
                style={{ flex:1, padding:'10px 0', textAlign:'center', fontSize:13, fontWeight: tab === t.key ? 600 : 400,
                  color: tab === t.key ? '#8B1A1A' : '#999',
                  borderBottom: tab === t.key ? '2px solid #8B1A1A' : 'none', cursor:'pointer' }}>
                {t.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── 掃描 tab ── */}
        {tab === 'scan' && (
          <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: isMobile ? undefined : '1fr 1fr', gap:12, marginBottom:12 }}>

            {/* 左：QR Code 掃描 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginBottom: isMobile ? 12 : 0 }}>
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
                  <span style={{ fontWeight:600 }}>{ENTRY_TYPE_LABEL[scanResult.entryType] || scanResult.entryType}</span>
                </div>
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
                <button onClick={() => handleCancel(confirmedCheckIn.id)}
                  style={{ fontSize:12, color:'#A32D2D', background:'none', border:'0.5px solid #A32D2D', borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
                  取消入場（10分鐘內）
                </button>
              </div>
            )}
            </div>

            {/* 右：手機號碼查詢 */}
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
                      {id:'child_free', name:'兒童免費', price:0},
                      {id:'student_free', name:'學生免費', price:0},
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
                    </>
                  )}

                  {phoneEntryType === 'single_ticket' && (
                    <>
                      <div style={{ fontSize:11, color:'#666', marginBottom:6 }}>付款方式</div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                        {[{key:'cash',label:'現金'},{key:'linepay',label:'Line Pay'},{key:'jkopay',label:'街口'},{key:'taiwanpay',label:'台灣Pay'}].map(p => (
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

                  {/* 金額小計 */}
                  {(() => {
                    const entryPrice = (entryTypes.find(t => t.id === phoneEntryType)?.price || 0);
                    const shoePrice = phoneRentShoes ? (shoeRental?.price || 0) : 0;
                    const chalkPrice = phoneRentChalk ? (chalkRental?.price || 50) : 0;
                    const total = entryPrice + shoePrice + chalkPrice;
                    if (total === 0) return null;
                    return (
                      <div style={{ background:'#F5EFEF', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#8B1A1A', fontWeight:500 }}>
                        合計：NT${total}
                        {shoePrice > 0 && <span style={{ fontSize:11, fontWeight:400, color:'#666' }}> （入場 NT${entryPrice} + 岩鞋 NT${shoePrice}）</span>}
                      </div>
                    );
                  })()}

                  <button type="button" onClick={handlePhoneCheckin}
                    disabled={phoneLoading || (memberEligibility && !memberEligibility.waiverSigned)}
                    style={{ width:'100%', height:44, borderRadius:8, background: (memberEligibility && !memberEligibility.waiverSigned) ? '#ccc' : '#2D7D46', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: (memberEligibility && !memberEligibility.waiverSigned) ? 'not-allowed' : 'pointer' }}>
                    {phoneLoading ? '...' : (memberEligibility && !memberEligibility.waiverSigned) ? '⚠ Waiver 未簽署，無法入場' : memberEligibility?.isVip ? '✓ VIP 入場' : memberEligibility?.hasValidPass ? '✓ 定期票入場' : memberEligibility?.hasCourseAccess ? '✓ 課程學員入場' : '✓ 確認入場'}
                  </button>
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
        {tab === 'courseStudents' && (
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

        {/* ── 待審核 tab ── */}
        {tab === 'pending' && (
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
            <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>單次入場券待審核清單</div>
            {pendingTickets.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}>目前無待審核票券</div>
            ) : pendingTickets.map(t => (
              <div key={t.id} style={{ border:'0.5px solid #E8D5D5', borderRadius:10, padding:14, marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{t.memberName}</div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>發放人：{t.soldByStaffName}</div>
                    <div style={{ fontSize:11, color:'#999' }}>發放時間：{dayjs(t.createdAt?._seconds * 1000).format('MM/DD HH:mm')}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:11, color:'#854F0B', background:'#FAEEDA', padding:'2px 8px', borderRadius:10 }}>待審核</div>
                    <div style={{ fontSize:11, color:'#999', marginTop:4 }}>
                      截止：{dayjs(t.approvalDeadline?._seconds * 1000).format('MM/DD HH:mm')}
                    </div>
                  </div>
                </div>

                {rejectingId === t.id ? (
                  <div>
                    <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      placeholder="請填寫拒絕原因"
                      style={{ width:'100%', height:36, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, boxSizing:'border-box', marginBottom:8 }} />
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => { setRejectingId(null); setRejectReason(''); }}
                        style={{ flex:1, height:36, borderRadius:6, background:'#f5f5f5', border:'none', cursor:'pointer', fontSize:13 }}>取消</button>
                      <button onClick={() => handleReject(t.id)}
                        style={{ flex:1, height:36, borderRadius:6, background:'#A32D2D', color:'#fff', border:'none', cursor:'pointer', fontSize:13 }}>確認拒絕</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => { setRejectingId(t.id); setRejectReason(''); }}
                      style={{ flex:1, height:36, borderRadius:6, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', cursor:'pointer', fontSize:13 }}>拒絕</button>
                    <button onClick={() => handleApprove(t.id)}
                      style={{ flex:2, height:36, borderRadius:6, background:'#2D7D46', color:'#fff', border:'none', cursor:'pointer', fontSize:13, fontWeight:600 }}>✓ 審核通過</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── 轉帳確認 tab ── */}
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
                      {c.gymId === 'gym-hsinchu' ? '新竹館' : '士林館'} · {c.entryType}
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

                {tab === 'transfers' && (
          <div style={{ padding:16 }}>
            <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>待確認轉帳截圖</div>
            {transfers.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}>目前無待確認轉帳</div>
            ) : transfers.map(t => (
              <div key={t.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{t.memberName || t.memberId}</div>
                  <span style={{ fontSize:11, background:'#FAEEDA', color:'#854F0B', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>待確認</span>
                </div>
                <div style={{ fontSize:12, color:'#666', marginBottom:4 }}>
                  {t.courseName && <div>課程：{t.courseName}</div>}
                  {t.amount > 0 && <div>金額：NT${t.amount.toLocaleString()}</div>}
                  <div style={{ color:'#999', marginTop:2 }}>{t.submittedAt ? new Date(t.submittedAt._seconds ? t.submittedAt._seconds*1000 : t.submittedAt).toLocaleString('zh-TW') : ''}</div>
                </div>
                {t.screenshotUrl && (
                  <a href={t.screenshotUrl} target="_blank" rel="noreferrer"
                    style={{ display:'block', marginBottom:10 }}>
                    <img src={t.screenshotUrl} alt="截圖" style={{ width:'100%', borderRadius:8, maxHeight:200, objectFit:'cover' }}/>
                  </a>
                )}
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => handleRejectTransfer(t.id)}
                    style={{ flex:1, height:36, borderRadius:8, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:13, cursor:'pointer' }}>
                    拒絕
                  </button>
                  <button onClick={() => handleConfirmTransfer(t.id)}
                    style={{ flex:2, height:36, borderRadius:8, background:'#2D7D46', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                    ✓ 確認收款
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 通知 tab ── */}
        {tab === 'notifications' && (
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:13, color:'#666' }}>系統通知</div>
              {notifications.length > 0 && (
                <button onClick={async () => { await markAllAsRead(); loadNotifications(); }}
                  style={{ fontSize:12, color:'#8B1A1A', background:'none', border:'none', cursor:'pointer' }}>全部已讀</button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}>目前無未讀通知</div>
            ) : notifications.map(n => (
              <div key={n.id} style={{ border:'0.5px solid #E8D5D5', borderRadius:10, padding:12, marginBottom:8, background: n.isRead ? '#fff' : '#FBF5F5' }}>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>{n.title}</div>
                <div style={{ fontSize:12, color:'#666' }}>{n.body}</div>
                <div style={{ fontSize:11, color:'#999', marginTop:6 }}>{dayjs(n.createdAt?._seconds * 1000).format('MM/DD HH:mm')}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右側統計 */}
      <div>
        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, color:'#999', marginBottom:12, fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>今日統計</div>

          {stats?.restricted ? (
            <div style={{ textAlign:'center', padding:'20px 8px', color:'#999', fontSize:12, lineHeight:1.7 }}>
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
              monthly_pass:'定期票', pass:'定期票', new_discount_card:'新優惠卡',
              legacy_discount_card:'舊優惠卡', discount_card:'優惠卡', black_card:'黑卡',
              bonus:'紅利入場', single_ticket:'單次', single_entry_ticket:'單次券',
              course_access:'課程學員', child_free:'兒童免費', student_free:'學生免費', other:'其他',
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

        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, color:'#999', marginBottom:12, fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>今日入場紀錄</div>
          {log.slice(0, 10).map((c, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'0.5px solid #F5EFEF', fontSize:12 }}>
              <div>
                <div style={{ fontWeight:500 }}>{c.memberName}</div>
                <div style={{ fontSize:10, color:'#999' }}>{ENTRY_TYPE_LABEL[c.entryType] || c.entryType}</div>
              </div>
              <div style={{ color:'#999', fontFamily:'monospace', fontSize:11 }}>
                {dayjs(c.checkedInAt?._seconds * 1000).format('HH:mm')}
              </div>
            </div>
          ))}
          {log.length === 0 && <div style={{ textAlign:'center', padding:20, color:'#999', fontSize:12 }}>今日尚無紀錄</div>}
        </div>

        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
          <div style={{ fontSize:22, fontWeight:600, color:'#1a1a1a' }}>{dayjs().format('MM/DD')}</div>
          <div style={{ fontSize:13, color:'#999', marginTop:3 }}>{dayjs().format('dddd')}</div>
        </div>
      </div>
    </div>
  );
}
