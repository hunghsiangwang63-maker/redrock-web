import { useState, useEffect } from 'react';
import client from '../../api/client';
import SaveButton from '../../components/SaveButton';
import SegmentedTabs from '../../components/SegmentedTabs';
import CoachSelect from '../../components/CoachSelect';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';

const API = import.meta.env.VITE_API_BASE || 'https://api.redrocktaiwan.com';
const STATUS = {
  pending:   { bg:'#FAEEDA', color:'#854F0B', label:'待確認' },
  confirmed: { bg:'#E6F4EB', color:'#2D7D46', label:'已確認' },
  cancelled: { bg:'#FCEBEB', color:'#A32D2D', label:'已取消' },
};
// 教練費預填表（教練1人；9~12人同1300）；發票金額預填＝總金額−人數×175（保險不開發票）
const COACH_FEE_TABLE = { 1:400, 2:420, 3:660, 4:720, 5:780, 6:840, 7:900, 8:960 };
const defaultCoachFee = (n) => n >= 9 ? 1300 : (COACH_FEE_TABLE[n] ?? '');
const defaultInvoice = (b) => Math.max(0, (b.totalFee || 0) - (b.numParticipants || 0) * 175);

const inp = { height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', color:'#1a1a1a', outline:'none', boxSizing:'border-box' };
const tinp = { width:'100%', height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#fff', color:'#1a1a1a', outline:'none', boxSizing:'border-box' };

export default function ExperienceBookingsPage() {
  const { staff, token } = useAuth();
  const isAdmin = ['super_admin','gym_manager'].includes(staff?.role);
  const [tab, setTab] = useState('bookings');
  const [bookings, setBookings] = useState([]);
  const [showPast, setShowPast] = useState(false); // 已完成（過期）預約收合
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState('ok');
  const [gymFilter, setGymFilter] = useState('');
  const [fromDate, setFromDate] = useState(dayjs().subtract(7,'day').format('YYYY-MM-DD'));
  const [toDate, setToDate] = useState(dayjs().add(60,'day').format('YYYY-MM-DD'));
  const [expanded, setExpanded] = useState(null);
  // Settings
  const [settings, setSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [history, setHistory] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [financeEdit, setFinanceEdit] = useState({});   // { bookingId: { coachFee, invoiceAmount } } 管理員手動輸入
  const [savingFinanceId, setSavingFinanceId] = useState(null);
  const [issuingId, setIssuingId] = useState(null);
  const [editBooking, setEditBooking] = useState(null);   // 編輯預約（參加者 + 日期/時段）
  const [editParts, setEditParts] = useState([]);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [savingParts, setSavingParts] = useState(false);
  const [coachBooking, setCoachBooking] = useState(null); // 指定/改教練的預約
  const [coachVal, setCoachVal] = useState({ coachId: null, coachName: '' });
  const [savingCoach, setSavingCoach] = useState(false);
  const [cancelBooking, setCancelBooking] = useState(null); // 取消的預約
  const [noteBooking, setNoteBooking] = useState(null);     // 員工備註 {b, text}
  const [noteSaving, setNoteSaving] = useState(false);
  const doSaveNote = async () => {
    if (!noteBooking) return;
    setNoteSaving(true);
    try {
      await client.put(`/experience-bookings/${noteBooking.b.id}/staff-note`, { staffNote: noteBooking.text });
      showMsg('✅ 備註已儲存'); setNoteBooking(null); load();
    } catch (err) { showMsg(err.response?.data?.message || '儲存失敗', 'red'); }
    finally { setNoteSaving(false); }
  };
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const doCancel = async () => {
    setCancelling(true);
    try {
      const r = await client.post(`/experience-bookings/${cancelBooking.id}/cancel`, { reason: cancelReason.trim() || '館方取消' });
      const v = r.data.voidedTickets ? `（作廢票券 ${r.data.voidedTickets} 張）` : '';
      showMsg('✅ 已取消預約' + v);
      setCancelBooking(null); setCancelReason(''); load();
    } catch (e) { showMsg(e.response?.data?.message || '取消失敗', 'red'); }
    finally { setCancelling(false); }
  };

  const openCoach = (b) => {
    setCoachBooking(b);
    setCoachVal({ coachId: b.coachId || null, coachName: b.coachName || '' });
  };
  const saveCoach = async () => {
    if (!coachVal.coachName?.trim()) { showMsg('請選擇或輸入教練', 'red'); return; }
    setSavingCoach(true);
    try {
      const r = await client.post(`/experience-bookings/${coachBooking.id}/confirm`,
        { coachId: coachVal.coachId || undefined, coachName: coachVal.coachName.trim() });
      showMsg('✅ ' + (r.data.message || '已更新教練與排班'));
      setCoachBooking(null); load();
    } catch (e) { showMsg(e.response?.data?.message || '更新失敗', 'red'); }
    finally { setSavingCoach(false); }
  };

  const issueTickets = async (b) => {
    if (!window.confirm(`發放體驗入場券給 ${b.contactName}？\n數量＝報名人數 ${b.numParticipants} 張，限 ${b.bookingDate} 當天使用，無另外收費。`)) return;
    setIssuingId(b.id);
    try {
      const r = await client.post(`/experience-bookings/${b.id}/issue-tickets`);
      showMsg('🎟️ ' + (r.data.message || '已發放'));
      load();
    } catch (e) { showMsg(e.response?.data?.message || '發放失敗', 'red'); }
    finally { setIssuingId(null); }
  };

  const openEditParticipants = (b) => {
    setEditBooking(b);
    setEditParts((b.participants || []).map(p => ({ ...p })));
    setEditDate(b.bookingDate || '');
    setEditTime(b.bookingTime || '');
  };
  const updPart = (i, f, v) => setEditParts(ps => ps.map((p, idx) => idx === i ? { ...p, [f]: v } : p));
  const addPart = () => setEditParts(ps => [...ps, { name: '', idNumber: '', birthday: '', nationality: '台灣' }]);
  const rmPart = (i) => setEditParts(ps => ps.filter((_, idx) => idx !== i));
  const saveParticipants = async () => {
    if (editParts.some(p => !p.name?.trim())) { showMsg('每位參加者都需填姓名', 'red'); return; }
    if (!editDate) { showMsg('請填寫體驗日期', 'red'); return; }
    setSavingParts(true);
    try {
      let schedMsg = '';
      // 日期/時段有變更 → 先連動課程/場次/教練排班/入場券
      if (editDate !== editBooking.bookingDate || editTime !== (editBooking.bookingTime || '')) {
        const sr = await client.put(`/experience-bookings/${editBooking.id}/schedule`, { bookingDate: editDate, bookingTime: editTime });
        schedMsg = `（日期/時段已更新${sr.data.ticketsUpdated ? `，票券效期同步 ${sr.data.ticketsUpdated} 張` : ''}）`;
      }
      const r = await client.put(`/experience-bookings/${editBooking.id}/participants`, { participants: editParts });
      const sync = (r.data.issued || r.data.voided) ? `（票券：補發 ${r.data.issued||0}、作廢 ${r.data.voided||0}）` : '';
      showMsg('✅ 已更新' + schedMsg + sync);
      setEditBooking(null); load();
    } catch (e) { showMsg(e.response?.data?.message || '更新失敗', 'red'); }
    finally { setSavingParts(false); }
  };

  const financeVal = (b, key) => {
    const edited = financeEdit[b.id]?.[key];
    if (edited !== undefined) return edited;
    if (b[key] != null) return b[key];
    return key === 'coachFee' ? defaultCoachFee(b.numParticipants || 0) : defaultInvoice(b);
  };
  const saveFinance = async (b) => {
    const cf = financeVal(b, 'coachFee');
    const inv = financeVal(b, 'invoiceAmount');
    // 空值擋下：清空欄位存檔會被後端存成 null → 顯示回預設值（王之荷 0→420 事故）。0＝免收，須明確輸入。
    if (cf === '' || cf == null || inv === '' || inv == null) { showMsg('金額不可留空（免收請輸入 0）', 'red'); return; }
    setSavingFinanceId(b.id);
    try {
      await client.put(`/experience-bookings/${b.id}/finance`, {
        coachFee: Number(cf), invoiceAmount: Number(inv),
      });
      showMsg('✅ 教練費／發票金額已儲存');
      load();
    } catch (e) { showMsg(e.response?.data?.message || '儲存失敗', 'red'); }
    finally { setSavingFinanceId(null); }
  };

  const ctNeedsInsurance = (courseType) => {
    const ct = settings?.courseTypes?.find(c => c.id === courseType);
    return ct ? ct.needsInsurance !== false : true; // 找不到設定時預設需要（保守）
  };

  const showMsg = (t, type='ok') => { setMsg(t); setMsgType(type); setTimeout(()=>setMsg(''),4000); };

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/experience-bookings', { params:{ gymId:gymFilter||undefined, from:fromDate, to:toDate } });
      setBookings(res.data.bookings||[]);
    } catch(e){} finally { setLoading(false); }
  };

  const loadSettings = async () => {
    try { const r = await client.get('/experience-bookings/settings'); setSettings(r.data); }
    catch(e) {}
  };

  useEffect(()=>{ load(); }, [gymFilter]);
  useEffect(()=>{ loadSettings(); }, []); // 需 needsInsurance 設定判斷是否顯示寄送鈕

  const sendInsurance = async (b) => {
    const to = (settings?.insuranceRecipientEmail||'').trim();
    if (!to) { showMsg('尚未設定保險名冊收件人 email（請至「⚙ 課程設定」填寫）','red'); return; }
    if (!window.confirm(`確定寄送此預約的保險名冊至 ${to}？\n（${b.contactName} · ${b.bookingDate} · ${b.numParticipants}人）`)) return;
    setSendingId(b.id);
    try {
      const r = await client.post(`/experience-bookings/${b.id}/send-insurance-email`);
      showMsg('📧 ' + (r.data.message || '已寄送'));
      if (tab==='history') loadHistory();
    } catch(e) { showMsg(e.response?.data?.message || '寄送失敗','red'); }
    finally { setSendingId(null); }
  };

  const loadHistory = async (g) => {
    setHistory(null);
    const gid = g !== undefined ? g : gymFilter;
    try { const r = await client.get('/experience-bookings/insurance-history', { params:{ gymId: gid||undefined } }); setHistory(r.data.records||[]); }
    catch(e) { setHistory([]); }
  };


  const getToken = () => token || localStorage.getItem('token') || localStorage.getItem('operatorToken') || '';

  const downloadXLS = () => {
    const params = new URLSearchParams();
    if (gymFilter) params.set('gymId',gymFilter);
    if (fromDate) params.set('from',fromDate);
    if (toDate) params.set('to',toDate);
    fetch(`${API}/experience-bookings/download?${params}`, { headers:{ Authorization:`Bearer ${getToken()}` } })
      .then(r=>r.blob()).then(blob=>{ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`experience_${dayjs().format('YYYYMMDD')}.xlsx`; a.click(); URL.revokeObjectURL(url); });
  };

  const downloadInsurance = (bookingId) => {
    const params = new URLSearchParams();
    if (bookingId) { params.set('bookingId',bookingId); }
    else { if (gymFilter) params.set('gymId',gymFilter); if (fromDate) params.set('from',fromDate); if (toDate) params.set('to',toDate); }
    fetch(`${API}/experience-bookings/insurance-download?${params}`, { headers:{ Authorization:`Bearer ${getToken()}` } })
      .then(r=>r.blob()).then(blob=>{ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`旅平險名冊_${dayjs().format('YYYYMMDD')}.xls`; a.click(); URL.revokeObjectURL(url); });
  };

  const saveSettings = async () => {
    await client.put('/experience-bookings/settings', settings);
    setSettingsDirty(false);
    showMsg('✅ 設定已儲存');
  };

  const updateCT = (idx, field, val) => { setSettingsDirty(true); setSettings(s=>({...s, courseTypes:s.courseTypes.map((ct,i)=>i===idx?{...ct,[field]:val}:ct)})); };
  const updateTier = (ctIdx, tIdx, field, val) => { setSettingsDirty(true); setSettings(s=>({...s, courseTypes:s.courseTypes.map((ct,i)=>i!==ctIdx?ct:{...ct,tiers:ct.tiers.map((t,j)=>j===tIdx?{...t,[field]:Number(val)||0}:t)})})); };

  return (
    <div style={{ padding:24, maxWidth:900, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:20, fontWeight:700 }}>🧗 體驗課程預約管理</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={downloadXLS} style={{ height:36, padding:'0 14px', borderRadius:8, background:'#2D7D46', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>⬇ XLS 名單</button>
          <button onClick={()=>downloadInsurance()} style={{ height:36, padding:'0 14px', borderRadius:8, background:'#185FA5', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>📋 保險名冊</button>
        </div>
      </div>

      {msg && <div style={{ background:msgType==='ok'?'#E6F4EB':'#FCEBEB', borderRadius:8, padding:'8px 14px', marginBottom:14, fontSize:13, color:msgType==='ok'?'#2D7D46':'#A32D2D' }}>{msg}</div>}

      {/* Tabs */}
      <SegmentedTabs
        tabs={[{key:'bookings',label:'預約管理'},{key:'history',label:'📁 歷史名冊'},...(isAdmin?[{key:'settings',label:'⚙ 課程設定'}]:[])]}
        value={tab}
        onChange={k=>{ setTab(k); if(k==='settings') loadSettings(); if(k==='history') loadHistory(); }}
        style={{ marginBottom:16 }} />

      {/* ── 預約管理 ── */}
      {tab==='bookings' && (
        <div>
          {/* 篩選 */}
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'flex-end' }}>
            {isAdmin && <select value={gymFilter} onChange={e=>setGymFilter(e.target.value)} style={inp}>
              <option value="">全部館別</option>
              <option value="gym-hsinchu">新竹館</option>
              <option value="gym-shilin">士林館</option>
            </select>}
            <div><div style={{ fontSize:11, color:'#666', marginBottom:3 }}>起</div><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} style={inp}/></div>
            <div><div style={{ fontSize:11, color:'#666', marginBottom:3 }}>迄</div><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} style={inp}/></div>
            <button onClick={load} style={{ height:34, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>查詢</button>
          </div>
          {/* 統計 */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
            {[{label:'總預約數',value:bookings.length,color:'#1a1a1a'},{label:'待確認',value:bookings.filter(b=>b.status==='pending').length,color:'#854F0B'},{label:'已確認',value:bookings.filter(b=>b.status==='confirmed').length,color:'#2D7D46'}].map(s=>(
              <div key={s.label} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px', textAlign:'center' }}>
                <div style={{ fontSize:11, color:'#999', marginBottom:4 }}>{s.label}</div>
                <div style={{ fontSize:24, fontWeight:700, color:s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          {loading && <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div>}
          {!loading && bookings.length===0 && <div style={{ textAlign:'center', color:'#999', padding:40 }}>查無預約記錄</div>}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {(() => {
              const _today = dayjs().format('YYYY-MM-DD');
              const isPast = (b) => (b.bookingDate || '') < _today;
              const renderBookingCard = (b) => {
              const sl = STATUS[b.status]||STATUS.pending;
              const isExpanded = expanded===b.id;
              return (
                <div key={b.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                  <div style={{ padding:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                          <span style={{ fontWeight:600, fontSize:14 }}>{b.contactName}</span>
                          <span style={{ fontSize:12, color:'#666' }}>{b.gymId==='gym-hsinchu'?'新竹館':'士林館'}</span>
                          <span style={{ fontSize:11, fontWeight:600, padding:'1px 8px', borderRadius:6, background:sl.bg, color:sl.color }}>{sl.label}</span>
                          {b.kind==='trial' && <span style={{ fontSize:11, fontWeight:600, padding:'1px 8px', borderRadius:6, background:'#F3EEF9', color:'#5B2D8B' }}>試上</span>}
                        </div>
                        {b.kind==='trial' && <div style={{ fontSize:12, color:'#5B2D8B', marginBottom:2 }}>🧗 {b.courseName}</div>}
                        <div style={{ fontSize:13, color:'#444' }}>{b.bookingDate} {b.bookingTime} · {b.numParticipants} 人 · NT${b.totalFee}</div>
                        <div style={{ fontSize:12, color:'#999', marginTop:3 }}>
                          {b.contactPhone}{b.bankLastFive&&` · 末五碼：${b.bankLastFive}`}{b.paymentDate&&` · 匯款日：${b.paymentDate}`}
                        </div>
                        {b.coachName && <div style={{ fontSize:12, color:'#2D7D46', marginTop:3 }}>👟 教練：{b.coachName}</div>}
                        {b.facebookName && <div style={{ fontSize:12, color:'#185FA5', marginTop:3 }}>📘 FB：{b.facebookName}</div>}
                        {b.notes && <div style={{ fontSize:12, color:'#854F0B', marginTop:3, textAlign:'left' }}>💬 會員備註：{b.notes}</div>}
                      </div>
                      <button onClick={()=>setExpanded(isExpanded?null:b.id)}
                        style={{ height:28, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#8B1A1A', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer', flexShrink:0 }}>
                        {isExpanded?'收起':'查看名單'}
                      </button>
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap', alignItems:'center' }}>
                      {b.status==='pending' && <span style={{ fontSize:11, color:'#854F0B' }}>待確認（於待辦總覽確認/取消）</span>}
                      {b.status!=='cancelled' && b.needsInsurance!==false && ctNeedsInsurance(b.courseType) && (
                        <button onClick={()=>downloadInsurance(b.id)} style={{ height:28, padding:'0 12px', borderRadius:6, background:'#185FA5', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>📋 保險名冊</button>
                      )}
                      {b.status!=='cancelled' && b.needsInsurance!==false && ctNeedsInsurance(b.courseType) && (
                        <button disabled={sendingId===b.id} onClick={()=>sendInsurance(b)} style={{ height:28, padding:'0 12px', borderRadius:6, background:sendingId===b.id?'#9CB9A6':'#2D7D46', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>{sendingId===b.id?'寄送中…':'📧 寄送保險'}</button>
                      )}
                      {b.status!=='cancelled' && (b.needsInsurance===false || !ctNeedsInsurance(b.courseType)) && <span style={{ fontSize:11, color:'#999' }}>{b.kind==='trial'?'試上免保險':'此課程免保險'}</span>}
                      {b.status==='confirmed' && (
                        <button disabled={issuingId===b.id} onClick={()=>issueTickets(b)}
                          title={b.ticketsIssued>0 ? '已發放；如有增加參加者可再按補發' : ''}
                          style={{ height:28, padding:'0 12px', borderRadius:6,
                            background: b.ticketsIssued>0 ? '#fff' : (issuingId===b.id?'#C9A24A':'#854F0B'),
                            color: b.ticketsIssued>0 ? '#2D7D46' : '#fff',
                            border: b.ticketsIssued>0 ? '0.5px solid #2D7D46' : 'none', fontSize:12, cursor:'pointer' }}>
                          {issuingId===b.id ? '發放中…' : (b.ticketsIssued>0 ? `✅ 已發放入場券（${b.ticketsIssued} 張）` : '🎟️ 發放入場券')}
                        </button>
                      )}
                      {b.status!=='cancelled' && (
                        <button onClick={()=>openEditParticipants(b)} style={{ height:28, padding:'0 12px', borderRadius:6, background:'#fff', border:'0.5px solid #8B1A1A', color:'#8B1A1A', fontSize:12, cursor:'pointer' }}>✏️ 編輯參加者</button>
                      )}
                      {b.status==='confirmed' && (
                        <button onClick={()=>openCoach(b)} style={{ height:28, padding:'0 12px', borderRadius:6, background:'#fff', border:'0.5px solid #2D7D46', color:'#2D7D46', fontSize:12, cursor:'pointer' }}>{b.coachName?'👟 改教練':'👟 指定教練'}</button>
                      )}
                      {b.status==='confirmed' && (
                        <button onClick={()=>{ setCancelBooking(b); setCancelReason(''); }} style={{ height:28, padding:'0 12px', borderRadius:6, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:12, cursor:'pointer' }}>🗑 取消預約</button>
                      )}
                      <button onClick={()=>setNoteBooking({ b, text: b.staffNote||'' })}
                        style={{ height:28, padding:'0 12px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#854F0B', fontSize:12, cursor:'pointer' }}>📝 備註</button>
                    </div>
                    {b.staffNote && (
                      <div style={{ fontSize:12, color:'#854F0B', background:'#FAEEDA', borderRadius:8, padding:'6px 10px', marginTop:8, textAlign:'left' }}>
                        📝 {b.staffNote}<span style={{ color:'#B08A4F', marginLeft:6 }}>（員工備註，會員看不到）</span>
                      </div>
                    )}
                    {b.status==='cancelled' && b.refundRequested && (
                      <div style={{ fontSize:12, color:'#A32D2D', background:'#FCEBEB', border:'0.5px solid #EEC1C1', borderRadius:8, padding:'8px 10px', marginTop:8, textAlign:'left', lineHeight:1.7 }}>
                        💰 <strong>會員取消・待退款 NT${(b.refundAmount||0).toLocaleString()}</strong>（已繳 NT${(b.totalFee||0).toLocaleString()} − 手續費 NT${(b.refundHandlingFee||0).toLocaleString()}）<br/>
                        退款帳號：{b.refundBankCode}-{b.refundAccount}{b.refundAccountName?`（${b.refundAccountName}）`:''}
                        {b.refundStatus==='done' ? <span style={{ color:'#2D7D46', marginLeft:8 }}>✓ 已退款</span> : <span style={{ marginLeft:8 }}>（匯款後請於備註記錄）</span>}
                      </div>
                    )}
                    {/* 教練費／發票金額：管理員可改可存；櫃檯（值班/站台）唯讀可見 */}
                    {!isAdmin && b.status==='confirmed' && b.kind!=='trial' && (
                      <div style={{ display:'flex', gap:14, marginTop:10, flexWrap:'wrap', background:'#FBF8F2', border:'0.5px solid #EBDDC2', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#8a6d3b' }}>
                        <span>教練費 <strong>NT${financeVal(b,'coachFee') || 0}</strong>{b.coachFee==null && <span style={{ fontSize:10, color:'#b09a6a' }}>（預設）</span>}</span>
                        <span>發票金額 <strong>NT${financeVal(b,'invoiceAmount') || 0}</strong>{b.invoiceAmount==null && <span style={{ fontSize:10, color:'#b09a6a' }}>（預設）</span>}</span>
                      </div>
                    )}
                    {isAdmin && b.status==='confirmed' && b.kind!=='trial' && (
                      <div style={{ display:'flex', gap:10, alignItems:'flex-end', marginTop:10, flexWrap:'wrap', background:'#FBF8F2', border:'0.5px solid #EBDDC2', borderRadius:8, padding:'8px 12px' }}>
                        <div>
                          <div style={{ fontSize:10, color:'#8a6d3b', marginBottom:3 }}>教練費（依人數預填）</div>
                          <input type="number" min="0" value={financeVal(b,'coachFee')}
                            onChange={e=>setFinanceEdit(fe=>({ ...fe, [b.id]: { ...fe[b.id], coachFee: e.target.value } }))}
                            style={{ width:100, height:30, borderRadius:6, border:'0.5px solid #E0D2B4', padding:'0 8px', fontSize:12, background:'#fff', color:'#1a1a1a', outline:'none', boxSizing:'border-box' }}/>
                        </div>
                        <div>
                          <div style={{ fontSize:10, color:'#8a6d3b', marginBottom:3 }}>發票金額（總額−{b.numParticipants||0}×175）</div>
                          <input type="number" min="0" value={financeVal(b,'invoiceAmount')}
                            onChange={e=>setFinanceEdit(fe=>({ ...fe, [b.id]: { ...fe[b.id], invoiceAmount: e.target.value } }))}
                            style={{ width:100, height:30, borderRadius:6, border:'0.5px solid #E0D2B4', padding:'0 8px', fontSize:12, background:'#fff', color:'#1a1a1a', outline:'none', boxSizing:'border-box' }}/>
                        </div>
                        <button disabled={savingFinanceId===b.id} onClick={()=>saveFinance(b)}
                          style={{ height:30, padding:'0 14px', borderRadius:6, background: b.coachFee!=null||b.invoiceAmount!=null ? '#fff' : '#8a6d3b', color: b.coachFee!=null||b.invoiceAmount!=null ? '#8a6d3b' : '#fff', border:'0.5px solid #8a6d3b', fontSize:12, cursor:'pointer' }}>
                          {savingFinanceId===b.id ? '儲存中…' : (b.coachFee!=null||b.invoiceAmount!=null ? '✓ 已存・更新' : '儲存')}
                        </button>
                      </div>
                    )}
                  </div>
                  {isExpanded && (
                    <div style={{ borderTop:'0.5px solid #F5EFEF', background:'#FBF5F5', padding:'12px 14px' }}>
                      <div style={{ fontSize:12, fontWeight:600, marginBottom:10, color:'#666' }}>參加者名單（保險資料）</div>
                      <div style={{ background:'#fff', borderRadius:10, overflow:'hidden', border:'0.5px solid #E8D5D5' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                          <thead><tr style={{ background:'#FBF5F5' }}>
                            {['序','姓名','身分證字號','生日（民國）','國籍'].map(h=>(
                              <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:600, color:'#666', borderBottom:'0.5px solid #E8D5D5' }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {(b.participants||[]).map((p,i)=>(
                              <tr key={i} style={{ borderBottom:'0.5px solid #F5EFEF' }}>
                                <td style={{ padding:'8px 10px', color:'#999' }}>{i+1}</td>
                                <td style={{ padding:'8px 10px', fontWeight:500 }}>{p.name}</td>
                                <td style={{ padding:'8px 10px', fontFamily:'monospace' }}>{p.idNumber}</td>
                                <td style={{ padding:'8px 10px' }}>{p.birthday}</td>
                                <td style={{ padding:'8px 10px' }}>{p.nationality||'台灣'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {b.notes && <div style={{ fontSize:12, color:'#666', marginTop:8 }}>備註：{b.notes}</div>}
                    </div>
                  )}
                </div>
              );
              };
              const current = bookings.filter(b => !isPast(b));
              const past = bookings.filter(isPast);
              return (<>
                {current.map(renderBookingCard)}
                {past.length > 0 && (
                  <div>
                    <button onClick={() => setShowPast(v => !v)}
                      style={{ width:'100%', height:38, borderRadius:10, background:'#F5F1F1', border:'0.5px solid #E8D5D5', color:'#666', fontSize:13, cursor:'pointer' }}>
                      已完成（過期）（{past.length}）{showPast ? ' ▲ 收合' : ' ▼ 展開'}
                    </button>
                    {showPast && (
                      <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:10, opacity:.85 }}>
                        {past.sort((a,b) => (b.bookingDate||'').localeCompare(a.bookingDate||'')).map(renderBookingCard)}
                      </div>
                    )}
                  </div>
                )}
              </>);
            })()}
          </div>
        </div>
      )}

      {/* ── 歷史名冊（分館） ── */}
      {tab==='history' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
            {isAdmin && <select value={gymFilter} onChange={e=>{ setGymFilter(e.target.value); loadHistory(e.target.value); }} style={inp}>
              <option value="">全部館別</option><option value="gym-hsinchu">新竹館</option><option value="gym-shilin">士林館</option>
            </select>}
            <button onClick={()=>loadHistory()} style={{ height:34, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>重新整理</button>
            <span style={{ fontSize:12, color:'#999' }}>已寄送的保險名冊紀錄，可重新下載</span>
          </div>
          {history===null && <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div>}
          {history!==null && history.length===0 && <div style={{ textAlign:'center', color:'#999', padding:40 }}>尚無已寄送的保險名冊</div>}
          {history!==null && history.length>0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {history.map(h=>{
                const ts = h.createdAt?._seconds ? dayjs(h.createdAt._seconds*1000).format('YYYY-MM-DD HH:mm') : '';
                return (
                  <div key={h.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis' }}>{h.title}</div>
                      <div style={{ fontSize:11, color:'#999', marginTop:3 }}>
                        {h.gymId==='gym-hsinchu'?'新竹館':h.gymId==='gym-shilin'?'士林館':''} · 收件人 {h.recipient||'—'} · 寄送 {ts}{h.skipped?' · ⚠ 未實際寄出':''}
                      </div>
                    </div>
                    {h.fileUrl
                      ? <a href={h.fileUrl} target="_blank" rel="noreferrer" style={{ height:30, padding:'0 12px', borderRadius:7, background:'#185FA5', color:'#fff', fontSize:12, textDecoration:'none', display:'inline-flex', alignItems:'center', flexShrink:0 }}>⬇ 下載</a>
                      : <span style={{ fontSize:11, color:'#bbb', flexShrink:0 }}>無檔案</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 課程設定 ── */}
      {tab==='settings' && isAdmin && (
        <div>
          {!settings && <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div>}
          {settings && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* 課程說明 */}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>📋 課程說明文字</div>
                <div style={{ marginBottom:10 }}>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>課程說明（會員端顯示）</label>
                  <textarea rows={3} value={settings.description||''} onChange={e=>{ setSettingsDirty(true); setSettings(s=>({...s,description:e.target.value})); }}
                    style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', fontSize:13, resize:'vertical', outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                </div>
                <div style={{ marginBottom:10 }}>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>注意事項</label>
                  <textarea rows={2} value={settings.notice||''} onChange={e=>{ setSettingsDirty(true); setSettings(s=>({...s,notice:e.target.value})); }}
                    style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', fontSize:13, resize:'vertical', outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <label style={{ fontSize:12, color:'#666' }}>付款期限</label>
                  <input type="number" min={1} max={14} value={settings.paymentDeadlineDays||3} onChange={e=>setSettings(s=>({...s,paymentDeadlineDays:Number(e.target.value)}))}
                    style={{ ...inp, width:60 }}/>
                  <span style={{ fontSize:12, color:'#666' }}>日內完成匯款</span>
                </div>
              </div>
              {/* 匯款帳號 - 兩館分開 */}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>🏦 匯款帳號</div>
                {[{key:'hsinchu',label:'新竹館'},{key:'shilin',label:'士林館'}].map(gym=>(
                  <div key={gym.key} style={{ marginBottom:16 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#8B1A1A', marginBottom:8 }}>{gym.label}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {[{label:'銀行名稱',field:'bankName'},{label:'分行',field:'branch'},{label:'帳號',field:'account'},{label:'戶名',field:'accountName'}].map(({label,field})=>(
                        <div key={field}>
                          <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>{label}</label>
                          <input value={settings.bankInfo?.[gym.key]?.[field]||''} onChange={e=>setSettings(s=>({...s,bankInfo:{...s.bankInfo,[gym.key]:{...(s.bankInfo?.[gym.key]||{}),[field]:e.target.value}}}))} style={tinp}/>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {/* 課程類型 */}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>🧗 課程類型與費率</div>
                {(settings.courseTypes||[]).map((ct,ctIdx)=>(
                  <div key={ct.id} style={{ background:'#FBF5F5', borderRadius:10, padding:14, marginBottom:12, border:'0.5px solid #E8D5D5' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <div style={{ fontWeight:600, fontSize:13, color:'#8B1A1A' }}>{ct.id}</div>
                      <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                        <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12 }}>
                          <input type="checkbox" checked={ct.active!==false} onChange={e=>updateCT(ctIdx,'active',e.target.checked)} style={{ accentColor:'#8B1A1A' }}/>開放報名
                        </label>
                        <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12, color:ct.needsInsurance!==false?'#185FA5':'#999' }}>
                          <input type="checkbox" checked={ct.needsInsurance!==false} onChange={e=>updateCT(ctIdx,'needsInsurance',e.target.checked)} style={{ accentColor:'#185FA5' }}/>需保險
                        </label>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                      <div><label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>課程名稱</label><input value={ct.label||''} onChange={e=>updateCT(ctIdx,'label',e.target.value)} style={tinp}/></div>
                      <div><label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>時數說明</label><input value={ct.durationNote||''} onChange={e=>updateCT(ctIdx,'durationNote',e.target.value)} style={tinp}/></div>
                    </div>
                    {ct.pricingType==='fixed' ? (
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <label style={{ fontSize:12, color:'#666' }}>費用</label>
                        <input type="number" value={ct.price||0} onChange={e=>updateCT(ctIdx,'price',Number(e.target.value))} style={{ ...tinp, width:100 }}/>
                        <span style={{ fontSize:12, color:'#666' }}>元/人</span>
                      </div>
                    ) : (
                      <div>
                        <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:6 }}>階梯費率（人數→單價）</label>
                        {(ct.tiers||[]).map((tier,tIdx)=>(
                          <div key={tIdx} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6, fontSize:12 }}>
                            <span style={{ color:'#999', minWidth:20 }}>{tier.min}~</span>
                            <input type="number" value={tier.max} onChange={e=>updateTier(ctIdx,tIdx,'max',e.target.value)} style={{ ...tinp, width:50, height:30 }}/>
                            <span style={{ color:'#666' }}>人：</span>
                            <input type="number" value={tier.price} onChange={e=>updateTier(ctIdx,tIdx,'price',e.target.value)} style={{ ...tinp, width:70, height:30 }}/>
                            <span style={{ color:'#666' }}>元/人</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* 取消退款手續費 */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>💰 會員取消退款手續費（NT$）</div>
                <input type="number" value={settings.refundHandlingFee ?? 100}
                  onChange={e=>{ setSettingsDirty(true); setSettings(s=>({ ...s, refundHandlingFee: Math.max(0, Number(e.target.value)||0) })); }}
                  style={{ width:160, height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, boxSizing:'border-box' }}/>
                <div style={{ fontSize:11, color:'#999', marginTop:4 }}>會員自行取消已繳費的體驗/試上時，退款＝已繳金額−此手續費（預設 100）。</div>
              </div>
              {/* 保險名冊寄送設定 */}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>📧 保險名冊寄送設定</div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>收件人 Email（全館共用）</label>
                  <input value={settings.insuranceRecipientEmail||''} onChange={e=>{ setSettingsDirty(true); setSettings(s=>({...s,insuranceRecipientEmail:e.target.value})); }}
                    placeholder="insurance@example.com" style={tinp}/>
                </div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>副本收件人（CC，選填；多個以逗號分隔）</label>
                  <input value={settings.insuranceCcEmails||''} onChange={e=>{ setSettingsDirty(true); setSettings(s=>({...s,insuranceCcEmails:e.target.value})); }}
                    placeholder="a@example.com, b@example.com" style={tinp}/>
                </div>
                <div>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>信件內容公版</label>
                  <textarea rows={3} value={settings.insuranceEmailTemplate||''} onChange={e=>{ setSettingsDirty(true); setSettings(s=>({...s,insuranceEmailTemplate:e.target.value})); }}
                    placeholder="{title}"
                    style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', fontSize:13, resize:'vertical', outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                  <div style={{ fontSize:11, color:'#999', marginTop:5, lineHeight:1.6 }}>
                    可用佔位符：{'{title}'}（完整標題）、{'{gym}'}（館別）、{'{date}'}（日期）、{'{name}'}（首位姓名）、{'{count}'}（人數）。留空＝同標題。<br/>
                    標題固定格式：紅石攀岩XX館XXXX年XX月XX日XXX等X人保險名冊
                  </div>
                </div>
              </div>
              <SaveButton onSave={saveSettings} isDirty={settingsDirty} label='✓ 儲存設定' fullWidth />
            </div>
          )}
        </div>
      )}

      {/* 編輯參加者 Modal */}
      {editBooking && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:560, maxHeight:'88vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ fontSize:16, fontWeight:600 }}>✏️ 編輯預約</div>
              <span onClick={()=>setEditBooking(null)} style={{ cursor:'pointer', color:'#999', fontSize:18 }}>×</span>
            </div>
            <div style={{ fontSize:12, color:'#999', marginBottom:14 }}>{editBooking.contactName} · 目前 {editParts.length} 人。已發券者：加人補發、減人作廢一張未用票。</div>
            {/* 課程日期/時段 */}
            <div style={{ background:'#F5F8FB', borderRadius:10, padding:12, marginBottom:12, border:'0.5px solid #D6E2EE' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#185FA5', marginBottom:8 }}>課程日期／時段</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div><label style={{ fontSize:11, color:'#666' }}>日期 *</label><input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)} style={tinp}/></div>
                <div><label style={{ fontSize:11, color:'#666' }}>時段</label><input value={editTime} onChange={e=>setEditTime(e.target.value)} placeholder="ex: 16:00-17:30" style={tinp}/></div>
              </div>
              <div style={{ fontSize:10, color:'#999', marginTop:6 }}>改日期/時段會連動更新課程場次、教練排班與已發入場券效期。</div>
            </div>
            <div style={{ fontSize:12, fontWeight:600, color:'#666', marginBottom:8 }}>參加者</div>
            {editParts.map((p,i)=>(
              <div key={i} style={{ background:'#FBF5F5', borderRadius:10, padding:12, marginBottom:10, border:'0.5px solid #E8D5D5' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#8B1A1A' }}>第 {i+1} 位</div>
                  {editParts.length>1 && <button onClick={()=>rmPart(i)} style={{ width:24, height:24, borderRadius:6, background:'#FCEBEB', color:'#A32D2D', border:'none', fontSize:14, cursor:'pointer', lineHeight:1 }}>✕</button>}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div style={{ gridColumn:'1/-1' }}><label style={{ fontSize:11, color:'#666' }}>姓名 *</label><input value={p.name||''} onChange={e=>updPart(i,'name',e.target.value)} style={tinp}/></div>
                  <div style={{ gridColumn:'1/-1' }}><label style={{ fontSize:11, color:'#666' }}>身分證/居留證號</label><input value={p.idNumber||''} onChange={e=>updPart(i,'idNumber',e.target.value)} style={{ ...tinp, fontFamily:'monospace' }}/></div>
                  <div><label style={{ fontSize:11, color:'#666' }}>生日（民國）</label><input value={p.birthday||''} onChange={e=>updPart(i,'birthday',e.target.value)} placeholder="920110" maxLength={7} style={{ ...tinp, fontFamily:'monospace' }}/></div>
                  <div><label style={{ fontSize:11, color:'#666' }}>國籍</label><input value={p.nationality||''} onChange={e=>updPart(i,'nationality',e.target.value)} style={tinp}/></div>
                </div>
              </div>
            ))}
            <button onClick={addPart} style={{ width:'100%', height:36, borderRadius:8, background:'#fff', border:'1px dashed #8B1A1A', color:'#8B1A1A', fontSize:13, cursor:'pointer', marginBottom:14 }}>+ 新增參加者</button>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setEditBooking(null)} disabled={savingParts} style={{ flex:1, height:44, borderRadius:10, background:'#f5f5f5', border:'none', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
              <button onClick={saveParticipants} disabled={savingParts} style={{ flex:2, height:44, borderRadius:10, background:savingParts?'#C0B8B8':'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>{savingParts?'儲存中…':'儲存（連動票券）'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 指定 / 改教練 Modal */}
      {coachBooking && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:420 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ fontSize:16, fontWeight:600 }}>👟 {coachBooking.coachName?'改教練':'指定教練'}</div>
              <span onClick={()=>setCoachBooking(null)} style={{ cursor:'pointer', color:'#999', fontSize:18 }}>×</span>
            </div>
            <div style={{ fontSize:12, color:'#999', marginBottom:14 }}>{coachBooking.contactName} · {coachBooking.bookingDate} {coachBooking.bookingTime} · {coachBooking.numParticipants} 人</div>
            <CoachSelect gymId={coachBooking.gymId} value={coachVal} onChange={setCoachVal} style={tinp} />
            <div style={{ fontSize:11, color:'#999', margin:'8px 0 16px' }}>
              指定後會建立體驗課程與該教練當日排班；改教練會同步更新課程並將排班換成新教練。
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setCoachBooking(null)} disabled={savingCoach} style={{ flex:1, height:44, borderRadius:10, background:'#f5f5f5', border:'none', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
              <button onClick={saveCoach} disabled={savingCoach} style={{ flex:2, height:44, borderRadius:10, background:savingCoach?'#9CB9A6':'#2D7D46', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>{savingCoach?'儲存中…':'儲存（排課／排班）'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 員工備註 Modal（會員看不到） */}
      {noteBooking && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:420, maxWidth:'92vw' }}>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:8 }}>📝 員工備註 — {noteBooking.b.contactName || noteBooking.b.memberName}</div>
            <div style={{ fontSize:12, color:'#854F0B', marginBottom:8 }}>此備註僅員工端可見，會員看不到。</div>
            <textarea value={noteBooking.text} onChange={e=>setNoteBooking(t=>({ ...t, text:e.target.value }))}
              rows={4} placeholder="如：現金已收、包場特殊需求、退款已匯…"
              style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'10px 12px', fontSize:13, boxSizing:'border-box', resize:'vertical', fontFamily:'inherit' }}/>
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={()=>setNoteBooking(null)} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>返回</button>
              <button onClick={doSaveNote} disabled={noteSaving}
                style={{ flex:2, height:40, borderRadius:9, background:'#854F0B', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer' }}>{noteSaving?'儲存中...':'儲存備註'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 取消預約 Modal */}
      {cancelBooking && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:420 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ fontSize:16, fontWeight:600, color:'#A32D2D' }}>🗑 取消體驗預約</div>
              <span onClick={()=>setCancelBooking(null)} style={{ cursor:'pointer', color:'#999', fontSize:18 }}>×</span>
            </div>
            <div style={{ fontSize:12, color:'#999', marginBottom:14 }}>{cancelBooking.contactName} · {cancelBooking.bookingDate} {cancelBooking.bookingTime} · {cancelBooking.numParticipants} 人</div>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>取消原因</label>
            <input value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="預設「館方取消」" style={tinp} />
            <div style={{ fontSize:11, color:'#999', margin:'8px 0 16px' }}>
              取消後將作廢未使用的體驗入場券；若已指定教練，會一併取消體驗課程並移除教練當日排班。
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setCancelBooking(null)} disabled={cancelling} style={{ flex:1, height:44, borderRadius:10, background:'#f5f5f5', border:'none', color:'#444', fontSize:14, cursor:'pointer' }}>返回</button>
              <button onClick={doCancel} disabled={cancelling} style={{ flex:2, height:44, borderRadius:10, background:cancelling?'#C99':'#A32D2D', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>{cancelling?'取消中…':'確認取消預約'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
