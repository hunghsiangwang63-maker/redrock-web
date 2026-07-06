import { useState, useEffect } from 'react';
import { getPassTypes, getMemberPasses, createPass, updatePass, renewPass,
         getMemberSingleEntryTickets, issueSingleEntryTicket,
         createPassType, updatePassType, deactivatePassType } from '../../api/passes';
import { getPassHistory, editPassWithReason, runHolidayBatchExtension, getHolidayHistory } from '../../api/passAdjustments';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getGyms } from '../../api/gyms';
import { searchMembers } from '../../api/members';
import { useAuth } from '../../store/authStore';
import client from '../../api/client';
import InstallmentRuleEditor from '../../components/InstallmentRuleEditor';
import PaymentPlanChoice from '../../components/PaymentPlanChoice';
import dayjs from 'dayjs';
import SegmentedTabs from '../../components/SegmentedTabs';
import CardsPage from './CardsPage';

// 效期顯示：優先月數（一個月一個月算），否則天數
const durationLabel = (t) => (t && t.durationMonths) ? `${t.durationMonths} 個月` : `${(t && t.durationDays) || 0} 天`;

const Tag = ({ type='ok', children }) => {
  const styles = {
    ok:      { bg:'#E6F4EB', color:'#2D7D46' },
    red:     { bg:'#FCEBEB', color:'#A32D2D' },
    warn:    { bg:'#FAEEDA', color:'#854F0B' },
    gray:    { bg:'#F0EDED', color:'#666' },
    blue:    { bg:'#E6F1FB', color:'#185FA5' },
    pending: { bg:'#FAEEDA', color:'#854F0B' },
  };
  const s = styles[type] || styles.ok;
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:s.bg, color:s.color }}>{children}</span>;
};

const Modal = ({ title, onClose, children }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(3px)' }}>
    <div style={{ background:'#fff', borderRadius:16, padding:24, width:480, maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:600 }}>{title}</div>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

export default function PassesPage() {
  const { staff, operator, viewGym } = useAuth();
  const canManagePass = ['super_admin', 'gym_manager'].includes(staff?.role) || !!operator;
  // 新增定期票給會員 = 僅管理員（gym_manager/super_admin）；operator 值班不可（與後端 requireManager 一致）
  const canAddPass = ['super_admin', 'gym_manager'].includes(staff?.role);
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
    getGyms().then(res => setGyms(res.data.gyms || [])).catch(() => {});
  }, []);

  const canManageTypes = ['super_admin', 'gym_manager'].includes(staff?.role);
  const [tab, setTab] = useState('list');

  // 定期票
  const [passTypes, setPassTypes] = useState([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberPasses, setMemberPasses] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ passTypeId:'', startDate: dayjs().format('YYYY-MM-DD'), notes:'', paymentPlan:'full', paymentMethod:'cash' });
  const [editingPass, setEditingPass] = useState(null);
  const [editPassForm, setEditPassForm] = useState({ endDate:'', credits:'', status:'active', notes:'', reason:'' });
  const [editPassSaving, setEditPassSaving] = useState(false);
  const [passHistory, setPassHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 票券統計
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const API_BASE = import.meta.env.VITE_API_BASE || 'https://redrock-api-production.up.railway.app';

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const r = await client.get('/pass-adjustments/analytics');
      setAnalyticsData(r.data);
    } catch(e) {} finally { setAnalyticsLoading(false); }
  };

  const downloadAnalyticsCSV = (type) => {
    const token = localStorage.getItem('staffToken') || sessionStorage.getItem('staffToken') || '';
    fetch(`${API_BASE}/pass-adjustments/analytics/download?type=${type}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.blob()).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `${type}_${new Date().toISOString().slice(0,10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    });
  };

  // 年假批次展延
  const [gyms, setGyms] = useState([]);
  const [holidayRanges, setHolidayRanges] = useState({});
  const [holidayRunning, setHolidayRunning] = useState(false);
  const [holidayResult, setHolidayResult] = useState(null);
  const [holidayHistory, setHolidayHistory] = useState([]);
  const [showHolidayHistory, setShowHolidayHistory] = useState(false);

  const loadHolidayHistory = async () => {
    try {
      const res = await getHolidayHistory();
      setHolidayHistory(res.data.history || []);
    } catch (e) {}
  };

  // 票種管理
  const [showAddType, setShowAddType] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [typeForm, setTypeForm] = useState({ name:'', scope:'shared', targetGymId:'', price:'', durationValue:'', durationUnit:'month', credits:'', installment:{ enabled:false, periods:[] } });
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeMsg, setTypeMsg] = useState('');

  // 單次入場券
  const [ticketMemberQuery, setTicketMemberQuery] = useState('');
  const [ticketMemberResults, setTicketMemberResults] = useState([]);
  const [ticketMember, setTicketMember] = useState(null);
  const [memberTickets, setMemberTickets] = useState([]);
  const [showIssueTicket, setShowIssueTicket] = useState(false);
  const [ticketNotes, setTicketNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');

  const showMsg = (text, type='ok') => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(''), 3000); };

  // super_admin 帶頂部選定的檢視場館（viewGym）；一般員工由後端以自身館別過濾（忽略此值）
  const loadPassTypes = () => getPassTypes(viewGym).then(r => setPassTypes(r.data.passTypes || []));

  useEffect(() => {
    loadPassTypes();
  }, [viewGym]);

  useEffect(() => {
    if (tab === 'holiday') loadGymsForHoliday();
  }, [tab]);

  const loadGymsForHoliday = async () => {
    try {
      const res = await getGyms();
      const list = res.data.gyms || [];
      setGyms(list);
      setHolidayRanges(prev => {
        const next = { ...prev };
        list.forEach(g => { if (!next[g.id]) next[g.id] = { enabled:false, start:'', end:'' }; });
        return next;
      });
    } catch (e) {}
  };

  const openAddType = () => {
    setEditingType(null);
    setTypeForm({ name:'', scope:'shared', targetGymId:'', price:'', durationValue:'', durationUnit:'month', credits:'', installment:{ enabled:false, periods:[] } });
    setTypeMsg('');
    setShowAddType(true);
  };

  const openEditType = (t) => {
    setEditingType(t);
    // 有月數 → 以月為單位；否則沿用天數
    const unit = t.durationMonths ? 'month' : 'day';
    const val = t.durationMonths ? t.durationMonths : t.durationDays;
    setTypeForm({ name:t.name, scope:t.scope, targetGymId:t.targetGymId || '', price:String(t.price), durationValue: val != null ? String(val) : '', durationUnit: unit, credits:t.credits ? String(t.credits) : '', installment: t.installment || { enabled:false, periods:[] } });
    setTypeMsg('');
    setShowAddType(true);
  };

  const handleSaveType = async () => {
    if (!typeForm.name || !typeForm.price || !typeForm.durationValue) {
      setTypeMsg('請填寫名稱、價格、效期'); return;
    }
    if (typeForm.scope === 'single' && !typeForm.targetGymId) {
      setTypeMsg('請選擇此票種適用的場館'); return;
    }
    setTypeSaving(true);
    try {
      const durNum = parseInt(typeForm.durationValue);
      const byMonth = typeForm.durationUnit === 'month';
      const payload = {
        name: typeForm.name, scope: typeForm.scope,
        targetGymId: typeForm.scope === 'single' ? typeForm.targetGymId : null,
        price: parseInt(typeForm.price),
        // 月數優先（一個月一個月算，7/6→10/6）；另一項送空字串讓後端清除
        durationMonths: byMonth ? durNum : '',
        durationDays: byMonth ? '' : durNum,
        credits: typeForm.credits ? parseInt(typeForm.credits) : null,
        installment: typeForm.installment || { enabled:false, periods:[] },
      };
      if (editingType) {
        await updatePassType(editingType.id, payload);
        setTypeMsg('已更新');
      } else {
        await createPassType(payload);
        setTypeMsg('已新增');
      }
      await loadPassTypes();
      setTimeout(() => setShowAddType(false), 500);
    } catch (err) {
      setTypeMsg(err.response?.data?.message || '儲存失敗');
    } finally { setTypeSaving(false); }
  };

  const handleDeactivateType = async (t) => {
    if (!window.confirm(`確定要停用「${t.name}」？已購買此票種的會員不受影響，僅未來無法再選購此票種。`)) return;
    try {
      await deactivatePassType(t.id);
      await loadPassTypes();
    } catch (err) {
      alert(err.response?.data?.message || '停用失敗');
    }
  };

  // ── 定期票 ──
  const searchMember = async (e) => {
    e.preventDefault();
    if (!memberQuery.trim()) return;
    const res = await searchMembers(memberQuery.trim());
    setMemberResults(res.data.members || []);
  };

  const selectMember = async (m) => {
    setSelectedMember(m);
    setMemberResults([]);
    setMemberQuery(m.name);
    const res = await getMemberPasses(m.id);
    setMemberPasses(res.data.passes || []);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createPass({ ...addForm, memberId: selectedMember.id });
      showMsg('定期票已建立');
      setShowAdd(false);
      const res = await getMemberPasses(selectedMember.id);
      setMemberPasses(res.data.passes || []);
    } catch (err) {
      showMsg(err.response?.data?.message || '建立失敗', 'red');
    } finally {
      setLoading(false);
    }
  };

  const handleRenew = async (pass) => {
    try {
      await renewPass(pass.id, { passTypeId: pass.passTypeId });
      showMsg('已續約成功');
      const res = await getMemberPasses(selectedMember.id);
      setMemberPasses(res.data.passes || []);
    } catch (err) {
      showMsg('續約失敗', 'red');
    }
  };

  const openEditPass = (pass) => {
    setEditingPass(pass);
    setEditPassForm({
      endDate: pass.endDate || '',
      credits: pass.credits !== null && pass.credits !== undefined ? String(pass.credits) : '',
      status: pass.status || 'active',
      notes: pass.notes || '',
      reason: '',
    });
    loadPassHistory(pass.id);
  };

  const loadPassHistory = async (passId) => {
    setHistoryLoading(true);
    try {
      const res = await getPassHistory(passId);
      setPassHistory(res.data.history || []);
    } catch (e) { setPassHistory([]); }
    finally { setHistoryLoading(false); }
  };

  const handleSavePass = async () => {
    if (!editPassForm.endDate) { showMsg('請輸入到期日', 'red'); return; }
    if (!editPassForm.reason.trim()) { showMsg('請填寫異動原因', 'red'); return; }
    setEditPassSaving(true);
    try {
      const payload = {
        endDate: editPassForm.endDate,
        status: editPassForm.status,
        notes: editPassForm.notes,
        reason: editPassForm.reason,
      };
      if (editPassForm.credits !== '') payload.credits = parseInt(editPassForm.credits);
      await editPassWithReason(editingPass.id, payload);
      showMsg('定期票已更新');
      await loadPassHistory(editingPass.id);
      setEditPassForm({ ...editPassForm, reason:'' });
      const res = await getMemberPasses(selectedMember.id);
      setMemberPasses(res.data.passes || []);
    } catch (err) {
      showMsg(err.response?.data?.message || '更新失敗', 'red');
    } finally { setEditPassSaving(false); }
  };

  const toggleHolidayGym = (gymId, field, value) => {
    setHolidayRanges(prev => ({ ...prev, [gymId]: { ...prev[gymId], [field]: value } }));
  };

  const handleRunHolidayBatch = async () => {
    const ranges = Object.entries(holidayRanges)
      .filter(([_, r]) => r.enabled && r.start && r.end)
      .map(([gymId, r]) => ({ gymId, start: r.start, end: r.end }));
    if (ranges.length === 0) { showMsg('請至少設定一個場館的假期區間', 'red'); return; }
    if (!window.confirm(`即將為 ${ranges.length} 個場館設定的假期區間，批次展延所有有效定期票，此操作無法復原，確定執行？`)) return;

    setHolidayRunning(true);
    setHolidayResult(null);
    try {
      const res = await runHolidayBatchExtension(ranges);
      setHolidayResult(res.data);
      showMsg(res.data.message);
    } catch (err) {
      showMsg(err.response?.data?.message || '執行失敗', 'red');
    } finally { setHolidayRunning(false); }
  };

  const passStatus = (p) => {
    if (p.status === 'cancelled') return { type:'gray', label:'已取消' };
    if (p.endDate < dayjs().format('YYYY-MM-DD')) return { type:'red', label:'已過期' };
    const daysLeft = dayjs(p.endDate).diff(dayjs(), 'day');
    if (daysLeft <= 7) return { type:'warn', label:`剩 ${daysLeft} 天` };
    return { type:'ok', label:'有效' };
  };

  // ── 單次入場券 ──
  const searchTicketMember = async (e) => {
    e.preventDefault();
    if (!ticketMemberQuery.trim()) return;
    const res = await searchMembers(ticketMemberQuery.trim());
    setTicketMemberResults(res.data.members || []);
  };

  const selectTicketMember = async (m) => {
    setTicketMember(m);
    setTicketMemberResults([]);
    setTicketMemberQuery(m.name);
    const res = await getMemberSingleEntryTickets(m.id);
    setMemberTickets(res.data.tickets || []);
  };

  const handleIssueTicket = async () => {
    if (!ticketMember) return;
    setLoading(true);
    try {
      await issueSingleEntryTicket({ memberId: ticketMember.id, notes: ticketNotes });
      showMsg('單次入場券已發放，等待審核');
      setShowIssueTicket(false);
      setTicketNotes('');
      const res = await getMemberSingleEntryTickets(ticketMember.id);
      setMemberTickets(res.data.tickets || []);
    } catch (err) {
      showMsg(err.response?.data?.message || '發放失敗', 'red');
    } finally {
      setLoading(false);
    }
  };

  const ticketStatusLabel = (t) => {
    if (t.status === 'pending_approval') return { type:'pending', label:'待審核' };
    if (t.status === 'active') return { type:'ok', label:'有效' };
    if (t.status === 'used') return { type:'gray', label:'已使用' };
    if (t.status === 'expired') return { type:'red', label:'已過期' };
    if (t.status === 'cancelled') return { type:'red', label:'已取消' };
    return { type:'gray', label:t.status };
  };

  const PASSES_TAB_GROUPS = [
    {
      group: '票券管理',
      items: [
        { key:'list',    icon:'🎫', label:'定期票' },
        { key:'types',   icon:'📋', label:'票種定義' },
        { key:'cards',   icon:'💳', label:'優惠卡/黑卡' },
        { key:'tickets', icon:'🎟️', label:'單次發放' },
      ],
    },
    {
      group: '其他',
      items: canManagePass ? [
        { key:'holiday',   icon:'📅', label:'年假展延' },
        { key:'analytics', icon:'📊', label:'票券統計' },
      ] : [],
    },
  ];

  return (
    <div style={{ padding:20, background:'#F7F3F3', minHeight:'100vh' }}>
      {msg && (
        <div style={{ background: msgType==='ok' ? '#E6F4EB' : '#FCEBEB', border:`0.5px solid ${msgType==='ok'?'#B3DEC0':'#F09595'}`, borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color: msgType==='ok'?'#2D7D46':'#A32D2D', display:'flex', justifyContent:'space-between' }}>
          {msg} <span style={{ cursor:'pointer' }} onClick={() => setMsg('')}>✕</span>
        </div>
      )}

      <SegmentedTabs
        wrap
        value={tab}
        onChange={(k) => { setTab(k); if (k==='analytics') loadAnalytics(); }}
        style={{ marginBottom:20 }}
        tabs={PASSES_TAB_GROUPS.flatMap(g => g.items)}
      />

      {/* ── 會員定期票 ── */}
      {tab === 'list' && (
        <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: isMobile ? undefined : '1.3fr 1fr', gap:16 }}>
          <div style={isMobile ? { marginBottom:16 } : undefined}>
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <span style={{ fontSize:12, color:'#999' }}>搜尋會員後查看/管理其定期票</span>
                {canAddPass && (
                <button onClick={() => { setAddForm({ passTypeId:'', startDate: dayjs().format('YYYY-MM-DD'), notes:'', paymentPlan:'full', paymentMethod:'cash' }); setShowAdd(true); }}
                  style={{ height:30, padding:'0 12px', borderRadius:7, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
                  ＋ 新增定期票
                </button>
                )}
              </div>
              <form onSubmit={searchMember} style={{ display:'flex', gap:8 }}>
                <input value={memberQuery} onChange={e => setMemberQuery(e.target.value)}
                  placeholder="搜尋會員姓名或電話..."
                  style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}/>
                <button type="submit" style={{ height:40, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>搜尋</button>
              </form>
              {memberResults.length > 0 && (
                <div style={{ marginTop:8, border:'0.5px solid #E8D5D5', borderRadius:8, overflow:'hidden' }}>
                  {memberResults.map(m => (
                    <div key={m.id} onClick={() => selectMember(m)}
                      style={{ padding:'10px 12px', cursor:'pointer', fontSize:13, borderBottom:'0.5px solid #F5EFEF', display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:'#F5E8E8', color:'#8B1A1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600 }}>{m.name[0]}</div>
                      <div><div style={{ fontWeight:500 }}>{m.name}</div><div style={{ fontSize:11, color:'#999' }}>{m.phone}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedMember && (
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'0.5px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:600, fontSize:13 }}>{selectedMember.name} 的定期票</span>
                  {canAddPass && (
                  <button onClick={() => setShowAdd(true)}
                    style={{ height:30, padding:'0 12px', borderRadius:7, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>＋ 新增定期票</button>
                  )}
                </div>
                {memberPasses.length === 0 ? (
                  <div style={{ padding:24, textAlign:'center', color:'#999', fontSize:13 }}>目前沒有定期票</div>
                ) : memberPasses.map(p => {
                  const st = passStatus(p);
                  const pct = Math.min(100, Math.max(0,
                    (1 - dayjs(p.endDate).diff(dayjs(), 'day') / dayjs(p.endDate).diff(dayjs(p.startDate), 'day')) * 100
                  ));
                  return (
                    <div key={p.id} style={{ padding:'14px 16px', borderBottom:'0.5px solid #F5EFEF' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <div style={{ fontWeight:500, fontSize:14 }}>{p.passTypeName}</div>
                        <Tag type={st.type}>{st.label}</Tag>
                      </div>
                      <div style={{ fontSize:12, color:'#999', marginBottom:8 }}>
                        {p.startDate} ～ {p.endDate}
                        {p.credits != null && ` · 剩餘 ${p.credits} 次`}
                      </div>
                      <div style={{ height:4, background:'#EEE', borderRadius:2, overflow:'hidden', marginBottom:10 }}>
                        <div style={{ height:'100%', width:`${pct}%`, background: st.type==='ok'?'#2D7D46':st.type==='warn'?'#EF9F27':'#E24B4A', borderRadius:2 }}/>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        {canManagePass && (
                          <button onClick={() => openEditPass(p)} style={{ flex:1, height:28, borderRadius:6, border:'0.5px solid #E8D5D5', background:'none', fontSize:12, color:'#6b6b6b', cursor:'pointer' }}>編輯</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, alignSelf:'start' }}>
            <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:12 }}>票種一覽</div>
            {passTypes.map(t => (
              <div key={t.id} style={{ padding:'10px 0', borderBottom:'0.5px solid #F5EFEF' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:13, fontWeight:500 }}>{t.name}</span>
                  <span style={{ fontSize:14, fontWeight:600, color:'#8B1A1A', fontFamily:'monospace' }}>NT${t.price.toLocaleString()}</span>
                </div>
                <div style={{ fontSize:11, color:'#999' }}>{durationLabel(t)} · {t.scope==='shared'?'全館':'單館'}{t.credits?` · ${t.credits} 次`:''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 票種定義 ── */}
      {tab === 'types' && (
        <div>
          {canManageTypes && (
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
              <button onClick={openAddType}
                style={{ height:34, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>
                ＋ 新增票種
              </button>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap:12 }}>
            {passTypes.map(t => (
              <div key={t.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <Tag type={t.scope==='shared'?'blue':'gray'}>
                    {t.scope==='shared' ? '全館' : (gyms.find(g => g.id === t.targetGymId)?.shortName || gyms.find(g => g.id === t.gymId)?.shortName || '單館')}
                  </Tag>
                </div>
                <div style={{ fontWeight:600, fontSize:15, marginBottom:4 }}>{t.name}</div>
                <div style={{ fontSize:20, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace', marginBottom:8 }}>NT${t.price.toLocaleString()}</div>
                <div style={{ fontSize:12, color:'#999', marginBottom: canManageTypes ? 10 : 0 }}>{durationLabel(t)}{t.credits?` · ${t.credits} 次`:''}</div>
                {canManageTypes && (
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => openEditType(t)}
                      style={{ flex:1, height:28, borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:11, cursor:'pointer' }}>編輯</button>
                    <button onClick={() => handleDeactivateType(t)}
                      style={{ flex:1, height:28, borderRadius:6, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:11, cursor:'pointer' }}>停用</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 票券統計 ── */}
      {tab === 'analytics' && (
        <div style={{ padding:16 }}>
          {analyticsLoading && <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div>}
          {!analyticsLoading && !analyticsData && <div style={{ textAlign:'center', color:'#999', padding:40 }}>點擊分頁載入統計</div>}
          {analyticsData && (() => {
            const { passStats, discountStats, blackStats, ticketStats, bonusStats } = analyticsData;
            const COLORS_MAP = { active:'#2D7D46', expired:'#A32D2D', used:'#185FA5', cancelled:'#999', fullyUsed:'#8B1A1A', remaining:'#2D7D46', pending:'#854F0B' };
            const Stat = ({ label, value, color='#1a1a1a' }) => (
              <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', padding:'12px 14px', textAlign:'center' }}>
                <div style={{ fontSize:11, color:'#999', marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:24, fontWeight:700, color }}>{(value||0).toLocaleString()}</div>
              </div>
            );
            const DlBtn = ({ type, label }) => (
              <button onClick={() => downloadAnalyticsCSV(type)}
                style={{ height:28, padding:'0 12px', borderRadius:6, background:'#185FA5', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>
                ⬇ {label}
              </button>
            );
            const Tip = ({ active, payload }) => active && payload?.length ? (
              <div style={{ background:'#fff', border:'0.5px solid #E8D5D5', borderRadius:8, padding:'6px 10px', fontSize:12 }}>
                {payload.map((p,i) => <div key={i} style={{ color: p.color||p.fill }}>{p.name}：{(p.value||0).toLocaleString()}</div>)}
              </div>
            ) : null;

            return (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {/* 定期票 */}
                <div style={{ background:'#FBF5F5', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>📋 定期票</div>
                    <DlBtn type="passes" label="下載明細"/>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 }}>
                    <Stat label="總發出" value={passStats.total}/>
                    <Stat label="有效" value={passStats.active} color={COLORS_MAP.active}/>
                    <Stat label="已過期" value={passStats.expired} color={COLORS_MAP.expired}/>
                    <Stat label="已取消" value={passStats.cancelled} color={COLORS_MAP.cancelled}/>
                  </div>
                  {Object.keys(passStats.byType||{}).length > 0 && (
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={Object.entries(passStats.byType).map(([name,v])=>({name,...v}))} layout="vertical" margin={{left:10,right:10}}>
                        <CartesianGrid strokeDasharray="3 3"/>
                        <XAxis type="number" fontSize={10}/>
                        <YAxis dataKey="name" type="category" fontSize={10} width={90}/>
                        <Tooltip content={<Tip/>}/>
                        <Legend wrapperStyle={{fontSize:11}}/>
                        <Bar dataKey="active" name="有效" fill={COLORS_MAP.active} stackId="a"/>
                        <Bar dataKey="expired" name="過期" fill={COLORS_MAP.expired} stackId="a"/>
                        <Bar dataKey="cancelled" name="取消" fill={COLORS_MAP.cancelled} stackId="a"/>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* 優惠卡 + 黑卡 */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  {[
                    { title:'🎫 優惠卡', stats: discountStats, type:'discounts', total: discountStats.total, active: discountStats.active, fullyUsed: discountStats.fullyUsed, expired: discountStats.expired, creditsIssued: discountStats.totalCreditsIssued, creditsUsed: discountStats.totalCreditsUsed, creditsLeft: discountStats.totalCreditsRemaining },
                    { title:'⬛ 黑卡', stats: blackStats, type:'blacks', total: blackStats.total, active: blackStats.active, fullyUsed: blackStats.fullyUsed, expired: blackStats.expired, creditsIssued: blackStats.totalCreditsIssued, creditsUsed: blackStats.totalCreditsUsed, creditsLeft: blackStats.totalCreditsRemaining },
                  ].map(s => (
                    <div key={s.type} style={{ background:'#FBF5F5', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                        <div style={{ fontSize:14, fontWeight:700 }}>{s.title}</div>
                        <DlBtn type={s.type} label="下載"/>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
                        <Stat label="總張數" value={s.total}/>
                        <Stat label="有效" value={s.active} color={COLORS_MAP.active}/>
                        <Stat label="已用完" value={s.fullyUsed} color={COLORS_MAP.fullyUsed}/>
                        <Stat label="過期" value={s.expired} color={COLORS_MAP.expired}/>
                      </div>
                      <ResponsiveContainer width="100%" height={120}>
                        <PieChart>
                          <Pie data={[{name:'已用',value:s.creditsUsed},{name:'剩餘',value:s.creditsLeft}].filter(d=>d.value>0)}
                            dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={45}
                            label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                            <Cell fill={COLORS_MAP.used}/><Cell fill={COLORS_MAP.active}/>
                          </Pie>
                          <Tooltip content={<Tip/>}/>
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ fontSize:11, color:'#666', textAlign:'center' }}>
                        總次數 {(s.creditsIssued||0).toLocaleString()}　已用 {(s.creditsUsed||0).toLocaleString()}　剩餘 {(s.creditsLeft||0).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 單日券 */}
                <div style={{ background:'#FBF5F5', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>🎟 單日券</div>
                    <DlBtn type="tickets" label="下載明細"/>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
                    <Stat label="總張數" value={ticketStats.total}/>
                    <Stat label="有效" value={ticketStats.valid} color={COLORS_MAP.active}/>
                    <Stat label="已使用" value={ticketStats.used} color={COLORS_MAP.used}/>
                    <Stat label="已過期" value={ticketStats.expired} color={COLORS_MAP.expired}/>
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <PieChart>
                      <Pie data={[{name:'有效',value:ticketStats.valid},{name:'已用',value:ticketStats.used},{name:'過期',value:ticketStats.expired}].filter(d=>d.value>0)}
                        dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={45}
                        label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                        <Cell fill={COLORS_MAP.active}/><Cell fill={COLORS_MAP.used}/><Cell fill={COLORS_MAP.expired}/>
                      </Pie>
                      <Tooltip content={<Tip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* 紅利 */}
                <div style={{ background:'#FBF5F5', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>🎁 紅利（無限練習）</div>
                    <DlBtn type="bonuses" label="下載明細"/>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                    <Stat label="總筆數" value={bonusStats.total}/>
                    <Stat label="仍有效" value={bonusStats.active} color={COLORS_MAP.active}/>
                    <Stat label="已使用天數" value={bonusStats.totalDaysUsed} color={COLORS_MAP.used}/>
                    <Stat label="剩餘天數" value={bonusStats.totalDaysRemaining} color={COLORS_MAP.active}/>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── 年假批次展延 ── */}
      {tab === 'holiday' && (
        <div>
          <div style={{ background:'#FFFBF0', border:'0.5px solid #F0D9A8', borderRadius:10, padding:14, marginBottom:16, fontSize:12, color:'#854F0B', lineHeight:1.7 }}>
            ⓘ 設定各場館的休館期間後，系統會將該館休館天數展延至所有受影響的有效定期票：單館票按該館休館天數展延；全館票則取「有設定假期之場館的聯集天數」展延（避免兩館分別公告假期時被重複加總）。此操作不計入個人展延次數限制，執行後無法復原，請謹慎確認。
          </div>

          {gyms.map(g => {
            const r = holidayRanges[g.id] || { enabled:false, start:'', end:'' };
            return (
              <div key={g.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginBottom:10 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom: r.enabled ? 12 : 0, cursor:'pointer' }}>
                  <input type="checkbox" checked={r.enabled} onChange={e => toggleHolidayGym(g.id, 'enabled', e.target.checked)} />
                  <span style={{ fontWeight:600, fontSize:14 }}>{g.shortName || g.name}</span>
                </label>
                {r.enabled && (
                  <div style={{ display:'flex', gap:8 }}>
                    <div style={{ flex:1 }}>
                      <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>休館開始日</label>
                      <input type="date" value={r.start} onChange={e => toggleHolidayGym(g.id, 'start', e.target.value)}
                        style={{ width:'100%', height:36, borderRadius:7, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>休館結束日</label>
                      <input type="date" value={r.end} onChange={e => toggleHolidayGym(g.id, 'end', e.target.value)}
                        style={{ width:'100%', height:36, borderRadius:7, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ display:'flex', gap:10, marginTop:8 }}>
            <button onClick={handleRunHolidayBatch} disabled={holidayRunning}
              style={{ flex:1, height:46, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
              {holidayRunning ? '執行中...' : '執行批次展延'}
            </button>
            <button onClick={async () => { await loadHolidayHistory(); setShowHolidayHistory(v => !v); }}
              style={{ height:46, padding:'0 16px', borderRadius:10, background:'#fff', color:'#666', border:'0.5px solid #DDD', fontSize:13, cursor:'pointer' }}>
              歷史紀錄
            </button>
          </div>

          {holidayResult && (
            <div style={{ marginTop:14 }}>
              <div style={{ background:'#E6F4EB', border:'0.5px solid #B3DEC0', borderRadius:10, padding:14, fontSize:13, color:'#2D7D46', marginBottom:12 }}>
                ✅ 已為 <strong>{holidayResult.extendedCount}</strong> 張定期票展延（共檢查 {holidayResult.totalPasses} 張，全館票聯集 {holidayResult.unionDays} 天）
              </div>
              {holidayResult.extendedList?.length > 0 && (
                <div style={{ border:'0.5px solid #E8D5D5', borderRadius:10, overflow:'hidden' }}>
                  <div style={{ background:'#FBF5F5', padding:'8px 12px', fontSize:12, fontWeight:600, color:'#666', display:'grid', gridTemplateColumns:'1fr 1fr 100px 100px 60px', gap:8 }}>
                    <span>會員</span><span>票種</span><span>原到期日</span><span>新到期日</span><span>延長天數</span>
                  </div>
                  {holidayResult.extendedList.map((item, i) => (
                    <div key={i} style={{ padding:'8px 12px', fontSize:12, borderTop:'0.5px solid #F5EFEF', display:'grid', gridTemplateColumns:'1fr 1fr 100px 100px 60px', gap:8, color:'#333' }}>
                      <span>{item.memberName || item.memberId}</span>
                      <span style={{ color:'#999' }}>{item.scope === 'single' ? '單館票' : '全館票'}</span>
                      <span>{item.beforeEndDate}</span>
                      <span style={{ color:'#2D7D46', fontWeight:500 }}>{item.afterEndDate}</span>
                      <span style={{ textAlign:'center' }}>+{item.extendDays}天</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 年假批次展延歷史 */}
      {showHolidayHistory && (
        <div style={{ padding:16, borderTop:'0.5px solid #F0E8E8' }}>
          <div style={{ fontSize:14, fontWeight:600, color:'#333', marginBottom:12 }}>批次展延歷史紀錄</div>
          {holidayHistory.length === 0 ? (
            <div style={{ fontSize:13, color:'#999', textAlign:'center', padding:20 }}>尚無歷史紀錄</div>
          ) : holidayHistory.map(group => (
            <div key={group.key} style={{ marginBottom:16, border:'0.5px solid #E8D5D5', borderRadius:10, overflow:'hidden' }}>
              <div style={{ background:'#FBF5F5', padding:'8px 12px', fontSize:12, color:'#666', display:'flex', justifyContent:'space-between' }}>
                <span>操作者：{group.operatorName}</span>
                <span>{group.createdAt?._seconds ? new Date(group.createdAt._seconds * 1000).toLocaleString('zh-TW') : ''}</span>
              </div>
              <div style={{ background:'#FBF5F5', padding:'6px 12px', fontSize:11, fontWeight:600, color:'#888', display:'grid', gridTemplateColumns:'1fr 1fr 90px 90px 60px', gap:8 }}>
                <span>會員</span><span>票種</span><span>原到期</span><span>新到期</span><span>延長</span>
              </div>
              {group.items.map((item, i) => (
                <div key={i} style={{ padding:'7px 12px', fontSize:12, borderTop:'0.5px solid #F5EFEF', display:'grid', gridTemplateColumns:'1fr 1fr 90px 90px 60px', gap:8, color:'#333' }}>
                  <span>{item.memberName || item.memberId}</span>
                  <span style={{ color:'#999' }}>{item.afterData?.scope === 'single' ? '單館票' : '全館票'}</span>
                  <span>{item.beforeData?.endDate}</span>
                  <span style={{ color:'#2D7D46', fontWeight:500 }}>{item.afterData?.endDate}</span>
                  <span style={{ textAlign:'center' }}>+{item.afterData?.extendDays}天</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── 單次入場券 ── */}
      {tab === 'tickets' && (
        <div style={{ maxWidth:560 }}>
          <div style={{ fontSize:12, color:'#999', marginBottom:12 }}>
            單次入場券的待審核已移至 🔔 待辦總覽統一處理。此頁可搜尋會員、查看票券狀態並發放新票券。
          </div>
          {/* 會員票券 */}
          <div>
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginBottom:14 }}>
              <form onSubmit={searchTicketMember} style={{ display:'flex', gap:8 }}>
                <input value={ticketMemberQuery} onChange={e => setTicketMemberQuery(e.target.value)}
                  placeholder="搜尋會員姓名或電話..."
                  style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}/>
                <button type="submit" style={{ height:40, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>搜尋</button>
              </form>
              {ticketMemberResults.length > 0 && (
                <div style={{ marginTop:8, border:'0.5px solid #E8D5D5', borderRadius:8, overflow:'hidden' }}>
                  {ticketMemberResults.map(m => (
                    <div key={m.id} onClick={() => selectTicketMember(m)}
                      style={{ padding:'10px 12px', cursor:'pointer', fontSize:13, borderBottom:'0.5px solid #F5EFEF', display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:'#F5E8E8', color:'#8B1A1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600 }}>{m.name[0]}</div>
                      <div><div style={{ fontWeight:500 }}>{m.name}</div><div style={{ fontSize:11, color:'#999' }}>{m.phone}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {ticketMember && (
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'0.5px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:600, fontSize:13 }}>{ticketMember.name} 的單次入場券</span>
                  {canManagePass && (
                  <button onClick={() => setShowIssueTicket(true)}
                    style={{ height:30, padding:'0 12px', borderRadius:7, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>＋ 發放</button>
                  )}
                </div>
                {memberTickets.length === 0 ? (
                  <div style={{ padding:24, textAlign:'center', color:'#999', fontSize:13 }}>目前沒有單次入場券</div>
                ) : memberTickets.map(t => {
                  const st = ticketStatusLabel(t);
                  return (
                    <div key={t.id} style={{ padding:'14px 16px', borderBottom:'0.5px solid #F5EFEF' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <div style={{ fontWeight:500, fontSize:13 }}>單次入場券</div>
                        <Tag type={st.type}>{st.label}</Tag>
                      </div>
                      <div style={{ fontSize:12, color:'#999', marginBottom:4 }}>
                        發放：{t.issuedAt} · 到期：{t.expiresAt}
                      </div>
                      {t.status === 'pending_approval' && (
                        <div style={{ fontSize:11, color:'#854F0B', background:'#FAEEDA', borderRadius:6, padding:'4px 8px', marginTop:4 }}>
                          等待審核中，截止：{t.approvalDeadline?._seconds ? dayjs(t.approvalDeadline._seconds*1000).format('MM/DD HH:mm') : '—'}
                        </div>
                      )}
                      {t.notes && <div style={{ fontSize:11, color:'#999', marginTop:4 }}>備註：{t.notes}</div>}
                      {t.transferHistory?.length > 0 && (
                        <div style={{ fontSize:11, color:'#185FA5', marginTop:4 }}>已轉移 {t.transferHistory.length} 次</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* 新增定期票 Modal */}
      {showAdd && (
        <Modal title={selectedMember ? `新增定期票 — ${selectedMember.name}` : '新增定期票'} onClose={() => setShowAdd(false)}>
          {!selectedMember ? (
            <>
              <div style={{ fontSize:12, color:'#999', marginBottom:10 }}>請先搜尋並選擇要新增定期票的會員</div>
              <form onSubmit={searchMember} style={{ display:'flex', gap:8, marginBottom:10 }}>
                <input value={memberQuery} onChange={e => setMemberQuery(e.target.value)} autoFocus
                  placeholder="搜尋會員姓名或電話..."
                  style={{ flex:1, height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}/>
                <button type="submit" style={{ height:38, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>搜尋</button>
              </form>
              {memberResults.length > 0 && (
                <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, overflow:'hidden', marginBottom:10 }}>
                  {memberResults.map(m => (
                    <div key={m.id} onClick={() => selectMember(m)}
                      style={{ padding:'10px 12px', cursor:'pointer', fontSize:13, borderBottom:'0.5px solid #F5EFEF', display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:'#F5E8E8', color:'#8B1A1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600 }}>{m.name[0]}</div>
                      <div><div style={{ fontWeight:500 }}>{m.name}</div><div style={{ fontSize:11, color:'#999' }}>{m.phone}</div></div>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setShowAdd(false)}
                style={{ width:'100%', height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            </>
          ) : (
          <form onSubmit={handleAdd}>
            <div style={{ background:'#FBF5F5', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>會員：<strong>{selectedMember.name}</strong>（{selectedMember.phone}）</span>
              <span onClick={() => { setSelectedMember(null); setMemberResults([]); setMemberQuery(''); }} style={{ color:'#8B1A1A', cursor:'pointer' }}>更換</span>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>票種</label>
              <select value={addForm.passTypeId} onChange={e => setAddForm({...addForm, passTypeId:e.target.value})} required
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none' }}>
                <option value="">選擇票種...</option>
                {passTypes.map(t => <option key={t.id} value={t.id}>{t.name} — NT${t.price.toLocaleString()}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>生效日期</label>
              <input type="date" value={addForm.startDate} onChange={e => setAddForm({...addForm, startDate:e.target.value})} required
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>備註</label>
              <input value={addForm.notes} onChange={e => setAddForm({...addForm, notes:e.target.value})} placeholder="選填"
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
            {(() => { const pt = passTypes.find(t => t.id === addForm.passTypeId); return pt ? (
              <PaymentPlanChoice installment={pt.installment} price={pt.price}
                plan={addForm.paymentPlan || 'full'} paymentMethod={addForm.paymentMethod}
                onChange={({ plan, paymentMethod }) => setAddForm({ ...addForm, paymentPlan: plan, paymentMethod })} />
            ) : null; })()}
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" onClick={() => setShowAdd(false)}
                style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
              <button type="submit" disabled={loading}
                style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                {loading ? '建立中...' : '建立定期票'}
              </button>
            </div>
          </form>
          )}
        </Modal>
      )}

      {/* 發放單次入場券 Modal */}
      {showIssueTicket && ticketMember && (
        <Modal title={`發放單次入場券 — ${ticketMember.name}`} onClose={() => setShowIssueTicket(false)}>
          <div style={{ background:'#FAEEDA', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#854F0B' }}>
            ⚠ 發放後需館長或管理員於 24 小時內審核，審核通過後才可使用
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13, color:'#666', marginBottom:8 }}>會員：<strong>{ticketMember.name}</strong>（{ticketMember.phone}）</div>
            <div style={{ fontSize:13, color:'#666' }}>有效期：發放日起 1 年</div>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>備註（選填）</label>
            <input value={ticketNotes} onChange={e => setTicketNotes(e.target.value)} placeholder="如：活動贈送、比賽獎勵..."
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', boxSizing:'border-box' }}/>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowIssueTicket(false)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleIssueTicket} disabled={loading}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {loading ? '發放中...' : '確認發放'}
            </button>
          </div>
        </Modal>
      )}

      {/* 編輯定期票 Modal */}
      {editingPass && (
        <Modal title={`編輯定期票 — ${editingPass.passTypeName}`} onClose={() => setEditingPass(null)}>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>到期日</label>
            <input type="date" value={editPassForm.endDate} onChange={e => setEditPassForm({...editPassForm, endDate:e.target.value})}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          {editingPass.credits !== null && editingPass.credits !== undefined && (
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>剩餘次數</label>
              <input type="number" value={editPassForm.credits} onChange={e => setEditPassForm({...editPassForm, credits:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
          )}
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>狀態</label>
            <select value={editPassForm.status} onChange={e => setEditPassForm({...editPassForm, status:e.target.value})}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
              <option value="active">有效</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>備註</label>
            <input value={editPassForm.notes} onChange={e => setEditPassForm({...editPassForm, notes:e.target.value})}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, color:'#854F0B', display:'block', marginBottom:5 }}>異動原因（必填，將記錄於歷史）</label>
            <input value={editPassForm.reason} onChange={e => setEditPassForm({...editPassForm, reason:e.target.value})}
              placeholder="例如：會員臨時出差申請延後使用"
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #F0D9A8', padding:'0 11px', fontSize:13, background:'#FFFBF0', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            <button onClick={() => setEditingPass(null)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>關閉</button>
            <button onClick={handleSavePass} disabled={editPassSaving}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {editPassSaving ? '儲存中...' : '儲存變更'}
            </button>
          </div>

          <div style={{ borderTop:'0.5px solid #F5EFEF', paddingTop:16 }}>
            <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:10 }}>異動歷史</div>
            {historyLoading ? (
              <div style={{ textAlign:'center', color:'#999', fontSize:12, padding:16 }}>載入中...</div>
            ) : passHistory.length === 0 ? (
              <div style={{ textAlign:'center', color:'#999', fontSize:12, padding:16 }}>尚無異動紀錄</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:240, overflowY:'auto' }}>
                {passHistory.map(h => {
                  const typeLabel = { edit:'手動編輯', extension:'展延', refund:'退費', transfer:'轉讓', holiday_batch:'年假批次展延' }[h.type] || h.type;
                  const ts = h.createdAt?._seconds ? h.createdAt._seconds*1000 : h.createdAt;
                  return (
                    <div key={h.id} style={{ background:'#FBFBFB', borderRadius:8, padding:'9px 11px', fontSize:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ fontWeight:600 }}>{typeLabel}</span>
                        <span style={{ color:'#999', fontSize:11 }}>{dayjs(ts).format('YYYY/MM/DD HH:mm')}</span>
                      </div>
                      <div style={{ color:'#666' }}>{h.reason}</div>
                      <div style={{ color:'#aaa', fontSize:11, marginTop:3 }}>操作人：{h.operatorName || '系統'}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* 新增/編輯票種 Modal */}
      {showAddType && (
        <Modal title={editingType ? `編輯票種 — ${editingType.name}` : '新增票種'} onClose={() => setShowAddType(false)}>
          {typeMsg && (
            <div style={{ background: typeMsg==='已新增'||typeMsg==='已更新' ? '#E6F4EB' : '#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:12, color: typeMsg==='已新增'||typeMsg==='已更新' ? '#2D7D46' : '#A32D2D', marginBottom:14 }}>
              {typeMsg}
            </div>
          )}
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>票種名稱</label>
            <input value={typeForm.name} onChange={e => setTypeForm({...typeForm, name:e.target.value})}
              placeholder="例如：月票、季票、10次優惠卡"
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>適用範圍</label>
            <select
              value={typeForm.scope === 'single' ? `single:${typeForm.targetGymId}` : 'shared'}
              onChange={e => {
                const v = e.target.value;
                if (v === 'shared') setTypeForm({...typeForm, scope:'shared', targetGymId:''});
                else setTypeForm({...typeForm, scope:'single', targetGymId: v.split(':')[1]});
              }}
              disabled={!!editingType}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background: editingType ? '#F0EDED' : '#FBF5F5', outline:'none', color:'#1a1a1a' }}>
              {gyms.map(g => (
                <option key={g.id} value={`single:${g.id}`}>{g.shortName || g.name}專用</option>
              ))}
              <option value="shared">全館通用（所有場館皆可使用）</option>
            </select>
            {editingType && <div style={{ fontSize:10, color:'#999', marginTop:4 }}>適用範圍建立後無法修改，如需變更請停用後重新建立</div>}
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>價格 (NT$)</label>
              <input type="number" value={typeForm.price} onChange={e => setTypeForm({...typeForm, price:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>效期</label>
              <div style={{ display:'flex', gap:6 }}>
                <input type="number" value={typeForm.durationValue} onChange={e => setTypeForm({...typeForm, durationValue:e.target.value})}
                  style={{ flex:1, width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                <select value={typeForm.durationUnit} onChange={e => setTypeForm({...typeForm, durationUnit:e.target.value})}
                  style={{ width:78, height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}>
                  <option value="month">個月</option>
                  <option value="day">天</option>
                </select>
              </div>
              <div style={{ fontSize:10, color:'#999', marginTop:4 }}>
                {typeForm.durationUnit === 'month' ? '一個月一個月算（例 7/6 起 3 個月 → 10/6）' : '曆日計算（例 起 90 天）'}
              </div>
            </div>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>使用次數（選填，留空代表不限次數，如月票）</label>
            <input type="number" value={typeForm.credits} onChange={e => setTypeForm({...typeForm, credits:e.target.value})}
              placeholder="例如優惠卡填 10、黑卡填 12"
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>分期付款規則</label>
            <InstallmentRuleEditor value={typeForm.installment} price={typeForm.price}
              onChange={v => setTypeForm({...typeForm, installment: v})} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowAddType(false)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleSaveType} disabled={typeSaving}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {typeSaving ? '儲存中...' : editingType ? '儲存變更' : '確認新增'}
            </button>
          </div>
        </Modal>
      )}
      {/* ── 優惠卡/黑卡 ── */}
      {tab === 'cards' && (
        <CardsPage embedded />
      )}
    </div>
  );
}
