import { useState, useEffect } from 'react';
import { searchMembers, getMember, promoteChild, getMemberWaiver, resetMemberWaiver, getActivePasses, getActiveCourseStudents } from '../../api/members';
import { getStaffFallTestSignature, recordFallTestResult, resetFallTestSignature } from '../../api/fallTests';
import client from '../../api/client';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';
import VipPage from './VipPage';
import SegmentedTabs from '../../components/SegmentedTabs';

const Modal = ({ title, onClose, children }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(3px)' }}>
    <div style={{ background:'#fff', borderRadius:16, padding:24, width:420, maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:600 }}>{title}</div>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const TAG = {
  ok:     { bg:'#E6F4EB', color:'#2D7D46' },
  warn:   { bg:'#FAEEDA', color:'#854F0B' },
  red:    { bg:'#FCEBEB', color:'#A32D2D' },
  blue:   { bg:'#E6F1FB', color:'#185FA5' },
  gray:   { bg:'#F0EDED', color:'#666' },
  purple: { bg:'#F0E8FB', color:'#6B21A8' },
};

const Tag = ({ type='ok', children }) => (
  <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:TAG[type].bg, color:TAG[type].color }}>
    {children}
  </span>
);


function MemberRecords({ records }) {
  const [tab, setTab] = useState('checkins');
  const r = records || {};
  const tabs = [
    { key:'checkins', icon:'🚪', label:'入場', count:(r.checkins||[]).length },
    { key:'passes',   icon:'🎫', label:'定期票', count:(r.passes||[]).length },
    { key:'courses',  icon:'📚', label:'課程', count:(r.courses||[]).length },
    { key:'competitions', icon:'🏆', label:'比賽', count:(r.competitions||[]).length },
    { key:'adjustments', icon:'📋', label:'退費', count:(r.adjustments||[]).length },
  ];
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:4, marginBottom:12 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ height:36, borderRadius:8, border:tab===t.key?'1.5px solid #8B1A1A':'1.5px solid #EDE5E5', background:tab===t.key?'#8B1A1A':'#fff', color:tab===t.key?'#fff':'#666', fontSize:10, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1 }}>
            <span style={{ fontSize:12 }}>{t.icon}</span>
            <span>{t.label}{t.count>0?' ('+t.count+')':''}</span>
          </button>
        ))}
      </div>
      {tab==='checkins' && <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {!(r.checkins||[]).length && <div style={{ color:'#999', fontSize:12, textAlign:'center', padding:12 }}>無入場紀錄</div>}
        {(r.checkins||[]).slice(0,30).map((c,i) => (
          <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', display:'flex', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:12, fontWeight:500 }}>{c.gymId==='gym-hsinchu'?'新竹館':'士林館'}</div>
              <div style={{ fontSize:11, color:'#999' }}>{c.entryType}</div>
            </div>
            <div style={{ fontSize:11, color:'#999' }}>{c.createdAt?._seconds ? dayjs(c.createdAt._seconds*1000).format('MM/DD HH:mm') : c.date}</div>
          </div>
        ))}
      </div>}
      {tab==='passes' && <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {!(r.passes||[]).length && <div style={{ color:'#999', fontSize:12, textAlign:'center', padding:12 }}>無定期票紀錄</div>}
        {(r.passes||[]).map((p,i) => (
          <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px' }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <div style={{ fontSize:12, fontWeight:500 }}>{p.passTypeName||p.passType}</div>
              <span style={{ fontSize:10, padding:'1px 6px', borderRadius:6, background:p.status==='active'?'#E6F4EB':'#F0EDED', color:p.status==='active'?'#2D7D46':'#999' }}>{p.status==='active'?'使用中':'已到期'}</span>
            </div>
            <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{p.startDate} ~ {p.endDate}</div>
          </div>
        ))}
      </div>}
      {tab==='courses' && <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {!(r.courses||[]).length && <div style={{ color:'#999', fontSize:12, textAlign:'center', padding:12 }}>無課程紀錄</div>}
        {(r.courses||[]).slice(0,30).map((e,i) => (
          <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:12, fontWeight:500 }}>{e.courseName}{e.isMakeup?' 🔄':''}</div>
              <div style={{ fontSize:11, color:'#999' }}>{e.date} {e.startTime}</div>
            </div>
            <span style={{ fontSize:10, padding:'1px 6px', borderRadius:6, background:e.status==='confirmed'?'#E6F4EB':e.status==='course_cancelled'?'#FCEBEB':'#F0EDED', color:e.status==='confirmed'?'#2D7D46':e.status==='course_cancelled'?'#A32D2D':'#999' }}>
              {e.status==='confirmed'?'已報名':e.status==='leave'?'已請假':e.status==='course_cancelled'?'課程取消':e.status}
            </span>
          </div>
        ))}
      </div>}
      {tab==='competitions' && <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {!(r.competitions||[]).length && <div style={{ color:'#999', fontSize:12, textAlign:'center', padding:12 }}>無比賽紀錄</div>}
        {(r.competitions||[]).map((c,i) => (
          <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:12, fontWeight:500 }}>{c.competitionName}</div>
            <span style={{ fontSize:10, padding:'1px 6px', borderRadius:6, background:c.paymentStatus==='confirmed'?'#E6F4EB':'#FAEEDA', color:c.paymentStatus==='confirmed'?'#2D7D46':'#854F0B' }}>{c.paymentStatus==='confirmed'?'已繳費':'待繳費'}</span>
          </div>
        ))}
      </div>}
      {tab==='adjustments' && <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {!(r.adjustments||[]).length && <div style={{ color:'#999', fontSize:12, textAlign:'center', padding:12 }}>無退費/調整紀錄</div>}
        {(r.adjustments||[]).map((a,i) => (
          <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px' }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <div style={{ fontSize:12, fontWeight:500 }}>{a.courseName||'申請'}</div>
              <span style={{ fontSize:10, padding:'1px 6px', borderRadius:6, background:a.status==='approved'?'#E6F4EB':a.status==='rejected'?'#FCEBEB':'#FAEEDA', color:a.status==='approved'?'#2D7D46':a.status==='rejected'?'#A32D2D':'#854F0B' }}>
                {a.status==='pending'?'待審核':a.status==='approved'?'已核准':a.status==='rejected'?'已拒絕':a.status}
              </span>
            </div>
            <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
              {a.createdAt?._seconds ? dayjs(a.createdAt._seconds*1000).format('YYYY/MM/DD') : ''}
              {a.refundAmount ? ' · 退款 NT$' + a.refundAmount : ''}
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
}

// 名單（分組、條列式、可搜尋、顯示有效起訖）：定期票 / 課程學員 共用
const fmtDate = (d) => d ? dayjs(d).format('YYYY/MM/DD') : '';
const RowMemberList = ({ loading, groups, searchPlaceholder = '搜尋姓名' }) => {
  const [q, setQ] = useState('');
  if (loading) return <div style={{ textAlign:'center', color:'#999', padding:40, fontSize:13 }}>載入中...</div>;
  const kw = q.trim();
  const shown = (groups || [])
    .map(g => ({ ...g, members: kw ? g.members.filter(m => (m.memberName || m.memberId || '').includes(kw)) : g.members }))
    .filter(g => g.members.length > 0);
  const total = shown.reduce((s, g) => s + g.members.length, 0);
  return (
    <div>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={searchPlaceholder}
          style={{ flex:1, maxWidth:320, height:38, borderRadius:8, border:'1px solid #E8D5D5', padding:'0 14px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }} />
        <span style={{ fontSize:12, color:'#999' }}>共 {total} 人</span>
      </div>
      {(!groups || shown.length === 0) ? (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:40, textAlign:'center', color:'#999', fontSize:13 }}>
          {kw ? '無符合的名單' : '目前無符合的名單'}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {shown.map(g => (
            <div key={g.key} style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', overflow:'hidden' }}>
              <div style={{ padding:'10px 16px', background:'#FBF5F5', borderBottom:'0.5px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:14, fontWeight:600, color:'#8B1A1A' }}>{g.title}</span>
                <span style={{ fontSize:12, color:'#999', flexShrink:0 }}>{g.members.length} 人{g.range ? ` · 效期 ${g.range}` : ''}</span>
              </div>
              {g.members.map((m, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'10px 16px', borderTop: i>0 ? '0.5px solid #F5EFEF' : 'none' }}>
                  <span style={{ fontSize:13, fontWeight:500 }}>{m.memberName || m.memberId}</span>
                  {(m.startDate || m.endDate) && (
                    <span style={{ fontSize:12, color:'#666', fontFamily:'monospace', flexShrink:0 }}>
                      {fmtDate(m.startDate)} ~ {fmtDate(m.endDate)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function MembersPage() {
  const { staff, activeGymId, station, operator, viewGym } = useAuth();
  const targetGymId = activeGymId || staff?.gymId;
  // 報表類：super_admin 依頂部場館選擇（'全館'→undefined=全部）
  const reportGymId = staff?.role === 'super_admin' ? (viewGym || undefined) : targetGymId;
  const isAdmin = ['super_admin', 'gym_manager'].includes(staff?.role) || !!station || !!operator;
  const [memberRecords, setMemberRecords] = useState(null);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [promotingChild, setPromotingChild] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);   // 刪除會員確認
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');
  const [promoteForm, setPromoteForm] = useState({ phone:'', email:'', password:'' });
  const [promoteMsg, setPromoteMsg] = useState('');
  const [promoteLoading, setPromoteLoading] = useState(false);
  // 分頁：search=會員查詢 | vipteam=VIP/攀岩隊員 | passes=定期票有效 | courses=課程效期
  const [view, setView] = useState('search');
  const [passList, setPassList] = useState(null);
  const [courseList, setCourseList] = useState(null);
  const [listLoading, setListLoading] = useState(false);

  const switchView = (v) => {
    setView(v);
    if (v === 'passes' && passList === null) {
      setListLoading(true);
      getActivePasses(reportGymId)
        .then(r => setPassList(r.data.passTypes || [])).catch(() => setPassList([])).finally(() => setListLoading(false));
    }
    if (v === 'courses' && courseList === null) {
      setListLoading(true);
      getActiveCourseStudents(reportGymId)
        .then(r => setCourseList(r.data.courses || [])).catch(() => setCourseList([])).finally(() => setListLoading(false));
    }
  };

  const handlePromote = async () => {
    setPromoteMsg(''); setPromoteLoading(true);
    try {
      const payload = { phone: promoteForm.phone, email: promoteForm.email };
      if (promoteForm.password) payload.password = promoteForm.password;
      await promoteChild(promotingChild.id, payload);
      setPromotingChild(null);
      setPromoteForm({ phone:'', email:'', password:'' });
      if (selected) {
        const res = await getMember(selected.id);
        setDetail(res.data);
      }
    } catch (err) {
      setPromoteMsg(err.response?.data?.message || '升級失敗，請確認資料是否正確');
    } finally { setPromoteLoading(false); }
  };

  const loadMemberRecords = async (memberId) => {
    setRecordsLoading(true);
    try {
      const [checkins, passes, courses, comps, adjs] = await Promise.allSettled([
        client.get('/checkin/history', { params: { memberId, limit:30 } }),
        client.get('/passes/member/' + memberId),
        client.get('/courses/member/' + memberId + '/enrollments'),
        client.get('/competitions/registrations/member/' + memberId),
        client.get('/course-adjustments/member/' + memberId),
      ]);
      setMemberRecords({
        checkins: checkins.status==='fulfilled' ? (checkins.value.data.checkIns || checkins.value.data || []) : [],
        passes: passes.status==='fulfilled' ? (passes.value.data.passes || []) : [],
        courses: courses.status==='fulfilled' ? (courses.value.data.enrollments || []) : [],
        competitions: comps.status==='fulfilled' ? (comps.value.data.registrations || []) : [],
        adjustments: adjs.status==='fulfilled' ? (adjs.value.data.requests || []) : [],
      });
    } catch(e) { setMemberRecords(null); }
    finally { setRecordsLoading(false); }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await searchMembers(query.trim());
      setMembers(res.data.members || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (member) => {
    setSelected(member);
    setDetailLoading(true);
    try {
      const res = await getMember(member.id);
      setDetail(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const openEdit = () => {
    setEditForm({ notes: detail.member?.notes || '' });
    setEditMsg('');
    setShowEdit(true);
  };

  const [checkinEligibility, setCheckinEligibility] = useState(null);

  const openCheckin = async () => {
    setCheckinMsg('');
    setCheckinEligibility(null);
    setShowCheckin(true);
    // 查詢入場資格（有無定期票）
    try {
      const res = await client.get(`/checkin/eligibility/${selected.id}`);
      setCheckinEligibility(res.data);
    } catch (e) {}
    // 載入入場類型
    if (entryTypes.length === 0) {
      try {
        const res = await client.get('/settings/entry-types');
        setEntryTypes((res.data || []).filter(t => t.active));
      } catch (e) {}
    }
  };

  const handleQuickCheckin = async () => {
    if (!checkinEntryType) { setCheckinMsg('請選擇入場類型'); setCheckinMsgType('red'); return; }
    if (!targetGymId) { setCheckinMsg('無法判斷操作館別，請確認登入狀態'); setCheckinMsgType('red'); return; }
    setCheckinSaving(true);
    setCheckinMsg('');
    try {
      await client.post('/checkin/phone', {
        memberId: selected.id,
        gymId: targetGymId,
        entryType: checkinEligibility?.isVip ? 'vip' : checkinEligibility?.hasValidPass ? 'pass' : checkinEligibility?.hasCourseAccess ? 'course_access' : checkinEntryType,
        paymentMethod: checkinPayment,
      });
      setCheckinMsg(`${selected.name} 入場成功`);
      setCheckinMsgType('ok');
      setTimeout(() => setShowCheckin(false), 1200);
    } catch (err) {
      setCheckinMsg(err.response?.data?.message || '入場失敗');
      setCheckinMsgType('red');
    } finally {
      setCheckinSaving(false);
    }
  };

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

  // 編輯資料
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name:'', email:'', emergencyContact:'', notes:'', gender:'' });
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState('');

  // 入場登記
  const [showCheckin, setShowCheckin] = useState(false);

  // Waiver / 墜落測驗
  const [waiverModal, setWaiverModal] = useState(null);
  const [waiverData, setWaiverData] = useState(null);
  const [fallTestModal, setFallTestModal] = useState(null);
  const [fallTestSigData, setFallTestSigData] = useState(null);
  const [resetReason, setResetReason] = useState('');
  const [fallTestResult, setFallTestResult] = useState('passed');
  const [fallTestNotes, setFallTestNotes] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalMsg, setModalMsg] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const showBanner = (msg) => { setSuccessBanner(msg); setTimeout(() => setSuccessBanner(''), 3000); };

  const reloadDetail = async () => {
    if (!detail?.member?.id) return;
    try {
      const res = await getMember(detail.member.id);
      setDetail(res.data);
      const updatedMember = res.data.member;
      if (updatedMember) {
        setMembers(prev => prev.map(m =>
          m.id === updatedMember.id
            ? { ...m, ...updatedMember, waiverSigned: res.data.waiver?.isComplete || false }
            : m
        ));
      }
    } catch {}
  };

  const handleEditSave = async () => {
    setEditSaving(true); setEditMsg('');
    try {
      await client.put('/members/' + selected.id, { notes: editForm.notes || '' });
      await reloadDetail();
      setShowEdit(false);
    } catch(err) { setEditMsg(err.response?.data?.message || '更新失敗'); }
    finally { setEditSaving(false); }
  };

  // 下載會員名單（XLSX，含最後兩次入場時間）；super_admin 依頂部場館，否則鎖自己館
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const params = staff?.role === 'super_admin' && viewGym ? { gymId: viewGym } : {};
      const res = await client.get('/members/download', { responseType: 'blob', params });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `members_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('下載失敗：' + (err.response?.data?.message || err.message));
    } finally { setDownloading(false); }
  };

  // 刪除會員（僅 super_admin）：一併刪其子帳號
  const handleDeleteMember = async () => {
    if (!detail?.member?.id) return;
    setDeleteLoading(true); setDeleteMsg('');
    try {
      const res = await client.delete('/members/' + detail.member.id);
      const removedIds = [detail.member.id, ...(res.data?.deletedChildren || []).map(c => c.id)];
      setMembers(prev => prev.filter(m => !removedIds.includes(m.id)));
      setDeleteModal(false); setSelected(null); setDetail(null);
    } catch (err) {
      setDeleteMsg(err.response?.data?.message || '刪除失敗');
    } finally { setDeleteLoading(false); }
  };

    const openWaiverView = async () => {
    setModalMsg(''); setWaiverData(null);
    try {
      const res = await getMemberWaiver(detail.member.id);
      setWaiverData(res.data.waiver);
      setWaiverModal('view');
    } catch { setModalMsg('無法載入 Waiver 資料'); }
  };

  const openWaiverReset = () => { setResetReason(''); setModalMsg(''); setWaiverModal('reset'); };

  const handleWaiverReset = async () => {
    if (!resetReason.trim()) { setModalMsg('請填寫退回原因'); return; }
    setModalLoading(true);
    try {
      await resetMemberWaiver(detail.member.id, resetReason);
      setWaiverModal(null);
      await reloadDetail();
      showBanner('Waiver 已退回，會員需重新簽署');
    } catch (err) { setModalMsg(err.response?.data?.message || '操作失敗'); }
    finally { setModalLoading(false); }
  };

  const openFallTestView = async () => {
    setModalMsg(''); setFallTestSigData(null);
    try {
      const res = await getStaffFallTestSignature(detail.member.id);
      setFallTestSigData(res.data.signature);
      setFallTestModal('view');
    } catch { setModalMsg('無法載入同意書資料'); }
  };

  const openFallTestReset = () => { setResetReason(''); setModalMsg(''); setFallTestModal('reset'); };

  const handleFallTestReset = async () => {
    if (!resetReason.trim()) { setModalMsg('請填寫退回原因'); return; }
    setModalLoading(true);
    try {
      await resetFallTestSignature(detail.member.id, resetReason);
      setFallTestModal(null);
      await reloadDetail();
      showBanner('墜落測驗同意書已退回，會員需重新簽署');
    } catch (err) { setModalMsg(err.response?.data?.message || '操作失敗'); }
    finally { setModalLoading(false); }
  };

  const openFallTestRecord = () => { setFallTestResult(detail.hasFallTestSignature ? 'passed' : 'failed'); setFallTestNotes(''); setModalMsg(''); setFallTestModal('record'); };

  const handleFallTestRecord = async () => {
    setModalLoading(true);
    try {
      await recordFallTestResult({ memberId: detail.member.id, result: fallTestResult, notes: fallTestNotes });
      setFallTestModal(null);
      await reloadDetail();
      // 同步更新列表的 fallTestPassed 欄位
      if (fallTestResult === 'passed') {
        setMembers(prev => prev.map(m =>
          m.id === detail.member.id ? { ...m, fallTestPassed: true } : m
        ));
      }
      showBanner(`墜落測驗結果已登記：${fallTestResult === 'passed' ? '通過' : '未通過'}`);
    } catch (err) { setModalMsg(err.response?.data?.message || '操作失敗'); }
    finally { setModalLoading(false); }
  };
  const [entryTypes, setEntryTypes] = useState([]);
  const [checkinEntryType, setCheckinEntryType] = useState('');
  const [checkinPayment, setCheckinPayment] = useState('cash');
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState('');
  const [checkinMsgType, setCheckinMsgType] = useState('ok');

  const isMinor = (birthday) => {
    return dayjs().diff(dayjs(birthday), 'year') < 18;
  };

  return (
    <div style={{ padding: isMobile ? 12 : 20, minHeight:'100vh', background:'#F7F3F3', boxSizing:'border-box' }}>

      {/* 分頁 */}
      <SegmentedTabs wrap value={view} onChange={switchView} style={{ marginBottom:14 }} tabs={[
        { key:'search',  label:'會員查詢' },
        { key:'vip',     label:'VIP' },
        { key:'team',    label:'紅石隊員' },
        { key:'passes',  label:'定期票' },
        { key:'courses', label:'課程學員' },
      ]} />

      {view === 'vip' && <VipPage embedded section="vip" />}
      {view === 'team' && <VipPage embedded section="team" />}
      {view === 'passes' && (
        <RowMemberList loading={listLoading} searchPlaceholder="搜尋會員姓名"
          groups={(passList || []).map(g => ({ key: g.passTypeId || g.passTypeName, title: g.passTypeName, members: g.members }))} />
      )}
      {view === 'courses' && (
        <RowMemberList loading={listLoading} searchPlaceholder="搜尋會員姓名"
          groups={(courseList || []).map(g => ({
            key: g.courseId, title: g.courseName, members: g.members,
            range: g.practiceStart && g.practiceEnd ? `${dayjs(g.practiceStart).format('MM/DD')}–${dayjs(g.practiceEnd).format('MM/DD')}` : (g.practiceEnd ? `至 ${dayjs(g.practiceEnd).format('MM/DD')}` : ''),
          }))} />
      )}

      {view === 'search' && (
      <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns:'1fr 420px', gap:16, boxSizing:'border-box' }}>

      {/* 左側：搜尋 + 列表 */}
      <div>
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:16, marginBottom:14 }}>
          <form onSubmit={handleSearch} style={{ display:'flex', gap:8 }}>
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="搜尋姓名或電話號碼..."
              style={{ flex:1, height:40, borderRadius:8, border:'1px solid #E8D5D5', padding:'0 14px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}
            />
            <button type="submit"
              style={{ height:40, padding:'0 18px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {loading ? '搜尋中...' : '搜尋'}
            </button>
            {(staff?.role === 'super_admin' || staff?.role === 'gym_manager') && (
              <button type="button" onClick={handleDownload} disabled={downloading}
                title="下載會員名單（含最後兩次入場時間）"
                style={{ height:40, padding:'0 14px', borderRadius:8, background:'#fff', color:'#6b6b6b', border:'1px solid #E8D5D5', fontSize:13, fontWeight:500, cursor: downloading?'wait':'pointer', whiteSpace:'nowrap' }}>
                {downloading ? '下載中…' : '⬇ 下載名單'}
              </button>
            )}
          </form>
        </div>

        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', overflow:'hidden' }}>
          {members.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:'#999', fontSize:13 }}>
              輸入姓名或電話搜尋會員
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#FBF5F5' }}>
                  <th style={{ padding:'9px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>會員</th>
                  {!isMobile && <th style={{ padding:'9px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>會員身份</th>}
                  <th style={{ padding:'9px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>Waiver</th>
                  <th style={{ padding:'9px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>墜落測驗</th>
                  {!isMobile && <th style={{ padding:'9px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>加入日期</th>}
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id}
                    onClick={() => handleSelect(m)}
                    style={{ borderTop:'1px solid #F5EFEF', cursor:'pointer', background: selected?.id === m.id ? '#FBF5F5' : 'transparent' }}>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background:'#F5E8E8', color:'#8B1A1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, flexShrink:0 }}>
                          {m.name?.[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight:500, display:'flex', alignItems:'center', gap:6 }}>
                            {m.name}
                            {m.isMinor && <Tag type="blue">未成年</Tag>}
                            {m.isChildAccount && <Tag type="gray">子會員</Tag>}
                          </div>
                          <div style={{ fontSize:11, color:'#999', marginTop:1, fontFamily:'monospace' }}>{m.phone}</div>
                        </div>
                      </div>
                    </td>
                    {!isMobile && (
                      <td style={{ padding:'12px 16px' }}>
                        <Tag type={m.memberType==='vip'?'blue':m.memberType==='climbing_team'?'purple':m.memberType==='child'?'warn':m.memberType==='student'?'ok':'gray'}>
                          {{general:'一般', child:'兒童', student:'學生', vip:'VIP', climbing_team:'攀岩隊員'}[m.memberType] || '一般'}
                        </Tag>
                      </td>
                    )}
                    <td style={{ padding:'12px 16px' }}>
                      {m.waiverSigned
                        ? <Tag type="ok">已簽署</Tag>
                        : <Tag type="red">未完成</Tag>}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      {m.fallTestPassed
                        ? <Tag type="ok">已通過</Tag>
                        : <Tag type="red">未通過</Tag>}
                    </td>
                    {!isMobile && (
                      <td style={{ padding:'12px 16px', fontSize:12, color:'#999' }}>
                        {m.createdAt ? dayjs(m.createdAt?._seconds ? m.createdAt._seconds*1000 : m.createdAt).format('YYYY/MM/DD') : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 桌機：紀錄查詢在左欄下方 */}
        {!isMobile && selected && detail && (
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:16, marginTop:16 }}>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>📋 {selected.name} 的紀錄查詢</div>
            {recordsLoading && <div style={{ textAlign:'center', color:'#999', padding:24 }}>載入中...</div>}
            {!recordsLoading && memberRecords && <MemberRecords records={memberRecords} />}
            {!recordsLoading && !memberRecords && <div style={{ textAlign:'center', color:'#ccc', padding:24, fontSize:13 }}>載入中...</div>}
          </div>
        )}
      </div>

      {/* 右側：詳情 */}
      <div style={isMobile && selected ? {
        position:'fixed', inset:0, background:'#fff', zIndex:100, overflowY:'auto', padding:16
      } : {
        background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:16, alignSelf:'start', position:'sticky', top:20
      }}>
        {isMobile && selected && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, paddingBottom:12, borderBottom:'0.5px solid #E8D5D5' }}>
            <button onClick={() => setSelected(null)}
              style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#8B1A1A' }}>←</button>
            <span style={{ fontWeight:600, fontSize:15 }}>會員詳情</span>
          </div>
        )}
        {!selected ? (
          <div style={{ padding:'40px 0', textAlign:'center', color:'#999', fontSize:13 }}>
            <div style={{ fontSize:32, marginBottom:8, opacity:.3 }}>👤</div>
            點選左方會員查看詳情
          </div>
        ) : detailLoading ? (
          <div style={{ padding:'40px 0', textAlign:'center', color:'#999' }}>載入中...</div>
        ) : detail ? (
          <>
            {/* 頭像 + 姓名 */}
            <div style={{ textAlign:'center', marginBottom:16 }}>
              <div style={{ width:52, height:52, borderRadius:'50%', background:'#F5E8E8', color:'#8B1A1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:600, margin:'0 auto 8px' }}>
                {detail.member?.name?.[0]}
              </div>
              <div style={{ fontWeight:600, fontSize:16 }}>{detail.member?.name}</div>
              <div style={{ fontSize:12, color:'#999', marginTop:3, fontFamily:'monospace' }}>{detail.member?.phone}</div>
              <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:8, flexWrap:'wrap' }}>
                {detail.member?.isMinor && <Tag type="blue">未成年</Tag>}
                {detail.member?.isTeamMember && <Tag type="warn">🏔️ 隊員</Tag>}
                {detail.member?.isBlocked && <Tag type="red">封鎖中</Tag>}
              </div>
            </div>

            {/* 基本資訊 */}
            {[
              { label:'生日', value: detail.member?.birthday },
              { label:'Email', value: detail.member?.email },
              { label:'性別', value: detail.member?.gender === 'male' ? '男' : detail.member?.gender === 'female' ? '女' : '不公開' },
              { label:'緊急聯絡人', value: detail.member?.emergencyContact || '—' },
            ].map(r => (
              <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F5EFEF', fontSize:13 }}>
                <span style={{ color:'#6b6b6b' }}>{r.label}</span>
                <span style={{ fontWeight:500 }}>{r.value || '—'}</span>
              </div>
            ))}

            {detail.member?.notes ? (
              <div style={{ marginTop:10, padding:'10px 12px', background:'#FBF5F5', borderRadius:8, marginBottom:8 }}>
                <div style={{ fontSize:11, color:'#6b6b6b', fontWeight:600, marginBottom:4 }}>備註</div>
                <div style={{ fontSize:13, color:'#333', whiteSpace:'pre-wrap' }}>{detail.member.notes}</div>
              </div>
            ) : null}

            {/* Waiver */}
            <div style={{ padding:'10px 0', borderBottom:'1px solid #F5EFEF', fontSize:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: detail.waiver?.isComplete ? 6 : 0 }}>
                <span style={{ color:'#6b6b6b' }}>Waiver</span>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  {detail.waiver?.isComplete
                    ? <Tag type="ok">已完成</Tag>
                    : detail.waiver?.parentRequired && !detail.waiver?.parentSignedAt
                      ? <Tag type="warn">家長待簽</Tag>
                      : <Tag type="red">未簽署</Tag>}
                  {detail.waiver?.isComplete && (
                    <button onClick={openWaiverView} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, border:'0.5px solid #E8D5D5', background:'#fff', color:'#666', cursor:'pointer' }}>檢視副本</button>
                  )}
                  {detail.waiver?.isComplete && isAdmin && (
                    <button onClick={openWaiverReset} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, border:'0.5px solid #A32D2D', background:'#fff', color:'#A32D2D', cursor:'pointer' }}>退回重簽</button>
                  )}
                </div>
              </div>
            </div>

            {/* 墜落測驗 */}
            <div style={{ padding:'10px 0', borderBottom:'1px solid #F5EFEF', fontSize:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:6 }}>
                <span style={{ color:'#6b6b6b' }}>墜落測驗</span>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  {detail.latestFallTest
                    ? <Tag type={detail.latestFallTest.result === 'passed' ? 'ok' : 'red'}>
                        {detail.latestFallTest.result === 'passed' ? '已通過' : '未通過'}
                      </Tag>
                    : <Tag type="red">未測驗</Tag>}
                  {detail.hasFallTestSignature && (
                    <button onClick={openFallTestView} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, border:'0.5px solid #E8D5D5', background:'#fff', color:'#666', cursor:'pointer' }}>檢視同意書</button>
                  )}
                  {detail.hasFallTestSignature && isAdmin && (
                    <button onClick={openFallTestReset} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, border:'0.5px solid #A32D2D', background:'#fff', color:'#A32D2D', cursor:'pointer' }}>退回重簽</button>
                  )}
                  {isAdmin && (
                    <button onClick={openFallTestRecord} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, border:'0.5px solid #185FA5', background:'#fff', color:'#185FA5', cursor:'pointer' }}>登記結果</button>
                  )}
                </div>
              </div>
              {detail.latestFallTest?.result === 'passed' && (
                <div style={{ marginTop:6, fontSize:11, color:'#6b6b6b', display:'flex', gap:12, flexWrap:'wrap' }}>
                  <span>測驗日期：{dayjs((detail.latestFallTest.testedAt?._seconds || 0) * 1000).format('YYYY-MM-DD')}</span>
                  {(detail.latestFallTest.currentExpiresAt || detail.latestFallTest.expiresAt) && (() => {
                    const raw = detail.latestFallTest.currentExpiresAt || detail.latestFallTest.expiresAt;
                    const expiryDate = raw?._seconds ? dayjs(raw._seconds * 1000) : dayjs(raw);
                    const isExpired = dayjs().isAfter(expiryDate);
                    return (
                      <span style={{ color: isExpired ? '#A32D2D' : '#2D7D46' }}>
                        有效期限：{expiryDate.format('YYYY-MM-DD')}
                      </span>
                    );
                  })()}
                  {detail.latestFallTest.extensionCount > 0 && (
                    <span style={{ color:'#185FA5' }}>已展延 {detail.latestFallTest.extensionCount} 次</span>
                  )}
                </div>
              )}
            </div>

            {/* 有效定期票 */}
            <div style={{ padding:'10px 0', borderBottom:'1px solid #F5EFEF' }}>
              <div style={{ fontSize:11, color:'#999', marginBottom:6, fontWeight:600, letterSpacing:.5 }}>有效票券</div>
              {detail.activePasses?.length > 0
                ? detail.activePasses.map(p => (
                    <div key={p.id} style={{ fontSize:12, background:'#F5F9F5', border:'1px solid #B3DEC0', borderRadius:6, padding:'6px 10px', marginBottom:6 }}>
                      <div style={{ fontWeight:500, color:'#2D7D46' }}>{p.passTypeName}</div>
                      <div style={{ color:'#6b6b6b', marginTop:2 }}>到期 {p.endDate}</div>
                    </div>
                  ))
                : <div style={{ fontSize:12, color:'#999' }}>無有效票券</div>}
            </div>

            {/* 子會員 */}
            {detail.children?.length > 0 && (
              <div style={{ padding:'10px 0' }}>
                <div style={{ fontSize:11, color:'#999', marginBottom:6, fontWeight:600, letterSpacing:.5 }}>子會員</div>
                {detail.children.map(c => (
                  <div key={c.id} style={{ fontSize:12, display:'flex', alignItems:'center', gap:8, padding:'5px 0' }}>
                    <div style={{ width:22, height:22, borderRadius:'50%', background:'#E6F1FB', color:'#185FA5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600 }}>
                      {c.name[0]}
                    </div>
                    <span>{c.name}</span>
                    <span style={{ color:'#999' }}>{c.birthday}</span>
                    {c.isChildAccount !== false && (
                    <button onClick={() => { setPromotingChild(c); setPromoteForm({ phone:'', email:'', password:'' }); setPromoteMsg(''); }}
                      style={{ marginLeft:'auto', height:24, padding:'0 9px', borderRadius:6, background:'#fff', border:'0.5px solid #8B1A1A', color:'#8B1A1A', fontSize:10, cursor:'pointer' }}>
                      升級為正式會員
                    </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 操作按鈕 */}
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={openEdit} style={{ flex:1, height:36, borderRadius:8, border:'1px solid #E8D5D5', background:'none', fontSize:12, color:'#6b6b6b', cursor:'pointer' }}>
                編輯資料
              </button>
              <button onClick={openCheckin} style={{ flex:1, height:36, borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, fontWeight:500, cursor:'pointer' }}>
                入場登記
              </button>
            </div>
            {/* 刪除會員：僅系統管理員 */}
            {staff?.role === 'super_admin' && (
              <button onClick={() => { setDeleteMsg(''); setDeleteModal(true); }}
                style={{ width:'100%', height:34, marginTop:8, borderRadius:8, border:'1px solid #E3B7B7', background:'none', fontSize:12, color:'#A32D2D', cursor:'pointer' }}>
                刪除會員
              </button>
            )}
          </>
        ) : null}
      </div>

      {deleteModal && detail?.member && (
        <Modal title="刪除會員" onClose={() => !deleteLoading && setDeleteModal(false)}>
          <div style={{ background:'#FCEBEB', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#A32D2D', lineHeight:1.7 }}>
            確定要刪除會員 <strong>{detail.member.name}</strong>（{detail.member.phone}）嗎？<br/>
            {(detail.children?.length > 0) && <>將<strong>一併刪除其 {detail.children.length} 位子帳號</strong>。<br/></>}
            此動作無法復原；入場／交易／票券等歷史紀錄仍會保留。
          </div>
          {deleteMsg && <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#A32D2D', marginBottom:12 }}>{deleteMsg}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setDeleteModal(false)} disabled={deleteLoading}
              style={{ flex:1, height:42, borderRadius:8, border:'1px solid #E8D5D5', background:'none', fontSize:13, color:'#444', cursor:'pointer' }}>取消</button>
            <button onClick={handleDeleteMember} disabled={deleteLoading}
              style={{ flex:1, height:42, borderRadius:8, background:'#A32D2D', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor: deleteLoading?'wait':'pointer' }}>
              {deleteLoading ? '刪除中…' : '確認刪除'}
            </button>
          </div>
        </Modal>
      )}

      {promotingChild && (
        <Modal title={`升級為正式會員 — ${promotingChild.name}`} onClose={() => setPromotingChild(null)}>
          <div style={{ background:'#FAEEDA', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#854F0B', lineHeight:1.6 }}>
            升級後，{promotingChild.name} 將擁有獨立的手機號碼與Email，可自行登入會員系統，不再共用家長帳號。與家長的關聯仍會保留作為歷史紀錄。
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>新手機號碼</label>
            <input type="tel" value={promoteForm.phone} onChange={e => setPromoteForm({...promoteForm, phone:e.target.value})}
              placeholder="0912345678"
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>新Email</label>
            <input type="email" value={promoteForm.email} onChange={e => setPromoteForm({...promoteForm, email:e.target.value})}
              placeholder="you@example.com"
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>密碼（選填，預設為手機末4碼）</label>
            <input type="password" value={promoteForm.password} onChange={e => setPromoteForm({...promoteForm, password:e.target.value})}
              placeholder="至少8碼，留空則用手機末4碼"
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          {promoteMsg && (
            <div style={{ background:'#FCEBEB', border:'0.5px solid #F5C4C4', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#A32D2D', marginBottom:14 }}>
              {promoteMsg}
            </div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setPromotingChild(null)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handlePromote} disabled={promoteLoading || !promoteForm.phone || !promoteForm.email}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {promoteLoading ? '處理中...' : '確認升級'}
            </button>
          </div>
        </Modal>
      )}

      {/* 編輯資料 Modal */}
      {showEdit && (
        <Modal title={`編輯資料 — ${selected?.name}`} onClose={() => setShowEdit(false)}>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>備註（內部使用，會員不可見）</label>
            <textarea value={editForm.notes || ''} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))} rows={4}
              placeholder="例：VIP客戶、特殊需求..." style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 10px', fontSize:13, resize:'vertical', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }} />
          </div>
          {editMsg && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{editMsg}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowEdit(false)} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleEditSave} disabled={editSaving} style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
              {editSaving ? '儲存中...' : '儲存備註'}
            </button>
          </div>
        </Modal>
      )}

      {/* 入場登記 Modal */}
      {showCheckin && (
        <Modal title={`入場登記 — ${selected?.name}`} onClose={() => setShowCheckin(false)}>
          {checkinEligibility && !checkinEligibility.waiverSigned && (
            <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#A32D2D', fontWeight:500 }}>
              ⚠ 此會員尚未簽署 Waiver，無法完成入場
            </div>
          )}
          {checkinEligibility?.isVip ? (
            <div style={{ background:'#FFF8E6', border:'0.5px solid #F5D87A', borderRadius:10, padding:'12px 14px', marginBottom:16, fontSize:13, color:'#8B6914', fontWeight:500 }}>
              👑 VIP 會員，免費入場{checkinEligibility.vipNote ? `（${checkinEligibility.vipNote}）` : ''}
            </div>
          ) : checkinEligibility?.hasValidPass ? (
            <div style={{ background:'#E6F4EB', border:'0.5px solid #B3DEC0', borderRadius:10, padding:'12px 14px', marginBottom:16, fontSize:13, color:'#2D7D46', fontWeight:500 }}>
              ✓ 持有效定期票，將以定期票免費入場
            </div>
          ) : checkinEligibility?.hasCourseAccess ? (
            <div style={{ background:'#E6F1FB', border:'0.5px solid #B5D4F4', borderRadius:10, padding:'12px 14px', marginBottom:16, fontSize:13, color:'#185FA5', fontWeight:500 }}>
              📚 課程學員有效期間內，將以課程入場（免費）
            </div>
          ) : (
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:8 }}>入場類型</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {entryTypes.map(t => (
                  <button key={t.id} onClick={() => setCheckinEntryType(t.id)}
                    style={{ height:34, padding:'0 12px', borderRadius:8, border: checkinEntryType===t.id?'none':'0.5px solid #E8D5D5', background: checkinEntryType===t.id?'#185FA5':'#fff', color: checkinEntryType===t.id?'#fff':'#666', fontSize:12, cursor:'pointer' }}>
                    {t.name} {t.price > 0 ? `NT$${t.price}` : ''}
                  </button>
                ))}
                {entryTypes.length === 0 && <div style={{ fontSize:12, color:'#999' }}>載入中...</div>}
              </div>
            </div>
          )}
          {!checkinEligibility?.isVip && !checkinEligibility?.hasValidPass && !checkinEligibility?.hasCourseAccess && (
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:8 }}>付款方式</label>
              <div style={{ display:'flex', gap:6 }}>
                {[{key:'cash',label:'現金'},{key:'linepay',label:'Line Pay'},{key:'jkopay',label:'街口'},{key:'taiwanpay',label:'台灣Pay'}].map(pm => (
                  <button key={pm.key} onClick={() => setCheckinPayment(pm.key)}
                    style={{ flex:1, height:34, borderRadius:8, border: checkinPayment===pm.key?'none':'0.5px solid #E8D5D5', background: checkinPayment===pm.key?'#185FA5':'#fff', color: checkinPayment===pm.key?'#fff':'#666', fontSize:12, cursor:'pointer' }}>
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {checkinMsg && (
            <div style={{ background: checkinMsgType==='ok'?'#E6F4EB':'#FCEBEB', border:`0.5px solid ${checkinMsgType==='ok'?'#B3DEC0':'#F5C4C4'}`, borderRadius:8, padding:'8px 12px', fontSize:12, color: checkinMsgType==='ok'?'#2D7D46':'#A32D2D', marginBottom:14 }}>
              {checkinMsg}
            </div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowCheckin(false)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleQuickCheckin} disabled={checkinSaving}
              style={{ flex:2, height:40, borderRadius:9, background:'#2D7D46', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {checkinSaving ? '處理中...' : '確認入場'}
            </button>
          </div>
        </Modal>
      )}

      {/* Success Banner */}
      {successBanner && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#2D7D46', color:'#fff', borderRadius:10, padding:'10px 20px', fontSize:13, fontWeight:500, zIndex:300, boxShadow:'0 4px 16px rgba(0,0,0,0.15)' }}>
          ✓ {successBanner}
        </div>
      )}

      {/* Waiver 副本 Modal */}
      {waiverModal === 'view' && waiverData && (
        <Modal title="Waiver 副本" onClose={() => setWaiverModal(null)}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
            <div style={{ fontSize:12, color:'#999' }}>
              簽署時間：{waiverData.memberSignedAt ? dayjs(waiverData.memberSignedAt._seconds * 1000).format('YYYY/MM/DD HH:mm') : '-'}
            </div>
            <button onClick={() => { const w=window.open('','_blank'); const t=waiverData.memberSignedAt?new Date(waiverData.memberSignedAt._seconds*1000).toLocaleString('zh-TW'):'-'; const body=waiverData.contentSnapshot?.zh||''; const sig=waiverData.memberSignatureUrl?'<img src="'+waiverData.memberSignatureUrl+'" style="max-width:300px">':''; w.document.write('<html><head><title>Waiver</title></head><body style="font-family:sans-serif;padding:24px;max-width:600px"><h2 style="color:#8B1A1A">紅石攀岩 Waiver</h2><p style="color:#666;font-size:12px">簽署時間：'+t+'</p><hr><pre style="white-space:pre-wrap;font-size:13px">'+body+'</pre><h3>簽名</h3>'+sig+'</body></html>'); w.document.close(); w.print(); }}
              style={{ height:28, padding:'0 12px', borderRadius:6, background:'#185FA5', color:'#fff', border:'none', fontSize:11, cursor:'pointer', flexShrink:0, marginLeft:8 }}>
              🖨️ 列印/PDF
            </button>
          </div>
          {waiverData.contentSnapshot?.zh && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'#6b6b6b', marginBottom:6 }}>聲明書內容</div>
              <div style={{ fontSize:12, color:'#333', lineHeight:1.8, whiteSpace:'pre-wrap', background:'#FBF5F5', borderRadius:8, padding:12, textAlign:'left', maxHeight:200, overflowY:'auto' }}>
                {waiverData.contentSnapshot.zh}
              </div>
            </div>
          )}
          {waiverData.memberSignatureUrl && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'#6b6b6b', marginBottom:6 }}>本人簽名</div>
              <img src={waiverData.memberSignatureUrl} alt="簽名" style={{ width:'100%', maxWidth:340, border:'0.5px solid #E8D5D5', borderRadius:8 }} />
            </div>
          )}
          {waiverData.parentSignatureUrl && (
            <div>
              <div style={{ fontSize:12, color:'#6b6b6b', marginBottom:6 }}>家長簽名</div>
              <img src={waiverData.parentSignatureUrl} alt="家長簽名" style={{ width:'100%', maxWidth:340, border:'0.5px solid #E8D5D5', borderRadius:8 }} />
            </div>
          )}
        </Modal>
      )}

      {/* Waiver 退回重簽 Modal */}
      {waiverModal === 'reset' && (
        <Modal title="退回 Waiver 重簽" onClose={() => setWaiverModal(null)} width={420}>
          <div style={{ fontSize:13, color:'#A32D2D', marginBottom:12, lineHeight:1.6 }}>
            退回後會員下次入場時將需要重新簽署 Waiver。
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>退回原因（必填，將記錄於後台）</label>
            <textarea value={resetReason} onChange={e => setResetReason(e.target.value)} rows={3}
              placeholder="例：簽名潦草無法辨識" style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 10px', fontSize:13, resize:'vertical', boxSizing:'border-box' }} />
          </div>
          {modalMsg && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{modalMsg}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setWaiverModal(null)} style={{ flex:1, height:38, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleWaiverReset} disabled={modalLoading} style={{ flex:2, height:38, borderRadius:8, background:'#A32D2D', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
              {modalLoading ? '處理中...' : '確認退回'}
            </button>
          </div>
        </Modal>
      )}

      {/* 墜落測驗同意書副本 Modal */}
      {fallTestModal === 'view' && (
        <Modal title="墜落測驗同意書副本" onClose={() => setFallTestModal(null)}>
          {fallTestSigData ? (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div style={{ fontSize:12, color:'#999' }}>
                  簽署時間：{fallTestSigData.signedAt ? dayjs(fallTestSigData.signedAt._seconds * 1000).format('YYYY/MM/DD HH:mm') : '-'}
                </div>
                <button onClick={() => {
                  const w = window.open('', '_blank');
                  const t = fallTestSigData.signedAt ? new Date(fallTestSigData.signedAt._seconds*1000).toLocaleString('zh-TW') : '-';
                  const body = fallTestSigData.contentSnapshot?.zh || '';
                  const sig = fallTestSigData.signatureData ? '<img src="' + fallTestSigData.signatureData + '" style="max-width:300px;border:1px solid #ddd;border-radius:4px">' : '';
                  const gsig = fallTestSigData.guardianSignatureData ? '<h3>家長/監護人簽名</h3><img src="' + fallTestSigData.guardianSignatureData + '" style="max-width:300px;border:1px solid #ddd;border-radius:4px">' : '';
                  w.document.write('<html><head><title>墜落測驗同意書</title></head><body style="font-family:sans-serif;padding:24px;max-width:600px"><h2 style="color:#8B1A1A">紅石攀岩 — 墜落測驗同意書</h2><p style="color:#666;font-size:12px">簽署時間：' + t + '</p><hr><pre style="white-space:pre-wrap;font-size:13px;line-height:1.8">' + body + '</pre><h3>本人簽名</h3>' + sig + gsig + '</body></html>');
                  w.document.close(); w.print();
                }} style={{ height:28, padding:'0 12px', borderRadius:6, background:'#185FA5', color:'#fff', border:'none', fontSize:11, cursor:'pointer', flexShrink:0, marginLeft:8 }}>
                  🖨️ 列印/PDF
                </button>
              </div>
              {fallTestSigData.contentSnapshot?.zh && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:12, color:'#6b6b6b', marginBottom:6 }}>同意書內容</div>
                  <div style={{ fontSize:12, color:'#333', lineHeight:1.8, whiteSpace:'pre-wrap', background:'#FBF5F5', borderRadius:8, padding:12, textAlign:'left', maxHeight:200, overflowY:'auto' }}>
                    {fallTestSigData.contentSnapshot.zh}
                  </div>
                </div>
              )}
              {fallTestSigData.signatureData && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:12, color:'#6b6b6b', marginBottom:6 }}>本人簽名</div>
                  <img src={fallTestSigData.signatureData} alt="簽名" style={{ width:'100%', maxWidth:340, border:'0.5px solid #E8D5D5', borderRadius:8 }} />
                </div>
              )}
              {fallTestSigData.guardianSignatureData && (
                <div>
                  <div style={{ fontSize:12, color:'#6b6b6b', marginBottom:6 }}>家長/監護人簽名（{fallTestSigData.guardianName}）</div>
                  <img src={fallTestSigData.guardianSignatureData} alt="家長簽名" style={{ width:'100%', maxWidth:340, border:'0.5px solid #E8D5D5', borderRadius:8 }} />
                </div>
              )}
            </>
          ) : (
            <div style={{ color:'#999', fontSize:13 }}>尚未簽署同意書</div>
          )}
        </Modal>
      )}

      {/* 墜落測驗同意書退回 Modal */}
      {fallTestModal === 'reset' && (
        <Modal title="退回墜落測驗同意書重簽" onClose={() => setFallTestModal(null)} width={420}>
          <div style={{ fontSize:13, color:'#A32D2D', marginBottom:12, lineHeight:1.6 }}>
            退回後會員需重新完成影片觀看與同意書簽署。
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>退回原因（必填，將記錄於後台）</label>
            <textarea value={resetReason} onChange={e => setResetReason(e.target.value)} rows={3}
              placeholder="例：簽名潦草無法辨識" style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 10px', fontSize:13, resize:'vertical', boxSizing:'border-box' }} />
          </div>
          {modalMsg && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{modalMsg}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setFallTestModal(null)} style={{ flex:1, height:38, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleFallTestReset} disabled={modalLoading} style={{ flex:2, height:38, borderRadius:8, background:'#A32D2D', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
              {modalLoading ? '處理中...' : '確認退回'}
            </button>
          </div>
        </Modal>
      )}

      {/* 登記墜落測驗結果 Modal */}
      {fallTestModal === 'record' && (
        <Modal title="登記墜落測驗結果" onClose={() => setFallTestModal(null)} width={420}>
          {!detail.hasFallTestSignature && (
            <div style={{ background:'#FCEBEB', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#A32D2D', marginBottom:16, lineHeight:1.6 }}>
              ⚠ 此會員尚未簽署墜落測驗同意書，只能登記「未通過」。
            </div>
          )}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:8 }}>測驗結果</label>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => detail.hasFallTestSignature && setFallTestResult('passed')}
                style={{ flex:1, height:40, borderRadius:9, border:`1.5px solid ${fallTestResult==='passed'?'#2D7D46':'#E8D5D5'}`, background: fallTestResult==='passed'?'#E6F4EB': detail.hasFallTestSignature?'#fff':'#f5f5f5', color: fallTestResult==='passed'?'#2D7D46': detail.hasFallTestSignature?'#666':'#bbb', fontWeight: fallTestResult==='passed'?700:400, fontSize:14, cursor: detail.hasFallTestSignature?'pointer':'not-allowed' }}>
                ✓ 通過
              </button>
              <button onClick={() => setFallTestResult('failed')}
                style={{ flex:1, height:40, borderRadius:9, border:`1.5px solid ${fallTestResult==='failed'?'#A32D2D':'#E8D5D5'}`, background: fallTestResult==='failed'?'#FCEBEB':'#fff', color: fallTestResult==='failed'?'#A32D2D':'#666', fontWeight: fallTestResult==='failed'?700:400, fontSize:14, cursor:'pointer' }}>
                ✗ 未通過
              </button>
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>備註（選填）</label>
            <textarea value={fallTestNotes} onChange={e => setFallTestNotes(e.target.value)} rows={2}
              placeholder="例：需再加強安全繩確認動作" style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 10px', fontSize:13, resize:'vertical', boxSizing:'border-box' }} />
          </div>
          {modalMsg && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{modalMsg}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setFallTestModal(null)} style={{ flex:1, height:38, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleFallTestRecord}
              disabled={modalLoading || (fallTestResult === 'passed' && !detail.hasFallTestSignature)}
              style={{ flex:2, height:38, borderRadius:8, background: fallTestResult==='passed'?'#2D7D46':'#A32D2D', color:'#fff', border:'none', fontSize:13, cursor: (modalLoading || (fallTestResult === 'passed' && !detail.hasFallTestSignature)) ? 'not-allowed':'pointer', opacity: (modalLoading || (fallTestResult === 'passed' && !detail.hasFallTestSignature)) ? 0.5 : 1 }}>
              {modalLoading ? '處理中...' : `確認登記${fallTestResult==='passed'?'（通過）':'（未通過）'}`}
            </button>
          </div>
        </Modal>
      )}
      </div>
      )}
    </div>
  );
}
