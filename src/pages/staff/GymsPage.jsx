import { useState, useEffect } from 'react';
import { getGyms, getAnnouncements, updateGymInfo, updateGymHours, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../api/gyms';
import client from '../../api/client';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';

const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_LABELS = { mon:'週一', tue:'週二', wed:'週三', thu:'週四', fri:'週五', sat:'週六', sun:'週日' };

// 公告排程發布時間：Firestore Timestamp → datetime-local 字串 / 毫秒
const tsToLocalInput = (ts) => {
  if (!ts) return '';
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const annPublishMs = (ts) => ts ? (ts._seconds ? ts._seconds * 1000 : new Date(ts).getTime()) : 0;

const Tag = ({ type='ok', children }) => {
  const s = { ok:{bg:'#E6F4EB',color:'#2D7D46'}, red:{bg:'#FCEBEB',color:'#A32D2D'}, warn:{bg:'#FAEEDA',color:'#854F0B'}, blue:{bg:'#E6F1FB',color:'#185FA5'}, gray:{bg:'#F0EDED',color:'#666'} };
  const st = s[type]||s.ok;
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:st.bg, color:st.color }}>{children}</span>;
};

export default function GymsPage({ embedded = false }) {
  const { staff, operator, activeGymId } = useAuth();
  const role = operator?.role || staff?.role;
  const isSuperAdmin = role === 'super_admin';
  const myGymId = activeGymId;
  // 非 super_admin（館別管理員／值班）：只管自己館的公告，其餘場館設定隱藏
  const annOnly = !isSuperAdmin;
  const [gyms, setGyms] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddAnn, setShowAddAnn] = useState(false);
  const [annForm, setAnnForm] = useState({ title:'', content:'', type:'general', effectiveFrom:'', effectiveTo:'', specialOpen:'', specialClose:'', showOnBanner:false, publishAt:'', publishUntil:'' });
  const [affectCourses, setAffectCourses] = useState('no'); // 休館/特殊時間是否影響課程（yes→停課發券流程）
  const [affectModal, setAffectModal] = useState(null);       // {sessions, checked:Set, running}
  const [annSaving, setAnnSaving] = useState(false);
  const [annMsg, setAnnMsg] = useState('');
  const [editingAnn, setEditingAnn] = useState(null);
  const [showEditGym, setShowEditGym] = useState(false);
  const [gymForm, setGymForm] = useState({ name:'', shortName:'', address:'', phone:'', googleMapsUrl:'', parkingInfo:'', transitInfo:'', description:'' });
  const [gymSaving, setGymSaving] = useState(false);
  const [gymMsg, setGymMsg] = useState('');
  const [showEditHours, setShowEditHours] = useState(false);
  const [hoursForm, setHoursForm] = useState({});
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursMsg, setHoursMsg] = useState('');
  const [bankAccounts, setBankAccounts] = useState({});
  const [showEditBank, setShowEditBank] = useState(false);
  const [bankForm, setBankForm] = useState({ bankName:'', accountNumber:'', accountName:'', notes:'' });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMsg, setBankMsg] = useState('');

  const loadBank = async () => {
    try {
      const res = await client.get('/settings/bank-accounts');
      setBankAccounts(res.data.bankAccounts || {});
    } catch (e) {}
  };

  useEffect(() => {
    loadBank();
    Promise.all([getGyms(), getAnnouncements()])
      .then(([gRes, aRes]) => {
        const gs = gRes.data.gyms || [];
        setGyms(gs);
        setAnnouncements(aRes.data.announcements || []);
        const mine = isSuperAdmin ? gs : gs.filter(g => g.id === myGymId);
        if (mine.length > 0) setSelected(mine[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  const reloadGyms = async () => {
    const gRes = await getGyms();
    setGyms(gRes.data.gyms || []);
    if (selected) {
      const fresh = (gRes.data.gyms || []).find(g => g.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  };

const runAffectClosure = async () => {
    if (!affectModal || affectModal.running) return;
    const ids = [...affectModal.checked];
    if (!ids.length) { setAffectModal(null); return; }
    setAffectModal(m => ({ ...m, running: true }));
    let ok = 0, fail = 0, issued = 0;
    for (const id of ids) {
      try {
        const r = await client.post(`/courses/sessions/${id}/closure-cancel`, { reason: '休館停課（公告連動）' });
        ok++; issued += r.data?.issued || 0;
      } catch (e) { fail++; }
    }
    setAffectModal(null);
    setAnnMsg(`公告已儲存；停課 ${ok} 堂、發出 ${issued} 張休館補課券${fail ? `、${fail} 堂失敗（請至場次管理處理）` : ''}`);
  };

  const handleAddAnn = async () => {
    if (!annForm.title || !annForm.effectiveFrom) { setAnnMsg('請填寫標題和開始日期'); return; }
    setAnnSaving(true);
    try {
      const gymPathId = editingAnn ? (editingAnn.gymId || 'all') : (selected?.id || 'all');
      if (editingAnn) {
        await updateAnnouncement(gymPathId, editingAnn.id, annForm);
        setAnnMsg('公告已更新');
      } else {
        await createAnnouncement(gymPathId, annForm);
        setAnnMsg('公告已新增');
      }
      setShowAddAnn(false);
      setEditingAnn(null);
      // 休館/特殊營業時間且勾「影響課程」→ 列出生效期間內場次供逐堂停課（發豁免補課券）
      if (['closure','special_hours'].includes(annForm.type) && affectCourses === 'yes') {
        try {
          const from = annForm.effectiveFrom, to = annForm.effectiveTo || annForm.effectiveFrom;
          const params = { fromDate: from, toDate: to };
          if (gymPathId && gymPathId !== 'all') params.gymId = gymPathId;
          const sr = await client.get('/courses/sessions', { params });
          const sess = (sr.data.sessions || []).filter(x => x.status !== 'cancelled')
            .sort((a,b)=>(a.date+a.startTime).localeCompare(b.date+b.startTime));
          if (!sess.length) setAnnMsg('公告已儲存；期間內無課程場次，無需停課');
          else setAffectModal({ sessions: sess, checked: new Set(sess.map(x=>x.id)), running:false });
        } catch (e) { setAnnMsg('公告已儲存，但場次載入失敗——請至課程場次管理逐堂按「休館停課」'); }
      }
      setAffectCourses('no');
      setAnnForm({ title:'', content:'', type:'general', effectiveFrom:'', effectiveTo:'', specialOpen:'', specialClose:'', showOnBanner:false, publishAt:'', publishUntil:'' });
      const aRes = await getAnnouncements();
      setAnnouncements(aRes.data.announcements || []);
    } catch (e) {
      setAnnMsg(e.response?.data?.message || (editingAnn ? '更新失敗' : '新增失敗'));
    } finally { setAnnSaving(false); }
  };

  const openEditAnn = (a) => {
    setEditingAnn(a);
    setAnnForm({ title:a.title, content:a.content||'', type:a.type, effectiveFrom:a.effectiveFrom, effectiveTo:a.effectiveTo||'', specialOpen:a.specialOpen||'', specialClose:a.specialClose||'', showOnBanner:!!a.showOnBanner, publishAt:tsToLocalInput(a.publishAt), publishUntil:tsToLocalInput(a.publishUntil) });
    setAnnMsg('');
    setShowAddAnn(true);
  };

  const handleDeleteAnn = async (a) => {
    if (!window.confirm(`確定要下架「${a.title}」？`)) return;
    try {
      await deleteAnnouncement(a.gymId || 'all', a.id);
      const aRes = await getAnnouncements();
      setAnnouncements(aRes.data.announcements || []);
    } catch (e) {
      alert(e.response?.data?.message || '下架失敗');
    }
  };

  const openEditGym = () => {
    setGymForm({
      name: selected.name || '', shortName: selected.shortName || '', address: selected.address || '',
      phone: selected.phone || '', googleMapsUrl: selected.googleMapsUrl || '',
      parkingInfo: selected.parkingInfo || '', transitInfo: selected.transitInfo || '', description: selected.description || '',
    });
    setGymMsg('');
    setShowEditGym(true);
  };

  const handleSaveGym = async () => {
    setGymSaving(true);
    try {
      await updateGymInfo(selected.id, gymForm);
      setGymMsg('已儲存');
      await reloadGyms();
      setTimeout(() => setShowEditGym(false), 600);
    } catch (e) {
      setGymMsg(e.response?.data?.message || '儲存失敗');
    } finally { setGymSaving(false); }
  };

  const openEditHours = () => {
    const base = {};
    DAYS.forEach(d => {
      const h = selected.regularHours?.[d];
      base[d] = h ? { open: h.open || '10:00', close: h.close || '22:00', closed: !!h.closed } : { open:'10:00', close:'22:00', closed:false };
    });
    setHoursForm(base);
    setHoursMsg('');
    setShowEditHours(true);
  };

  const handleSaveHours = async () => {
    setHoursSaving(true);
    try {
      await updateGymHours(selected.id, hoursForm);
      setHoursMsg('已儲存');
      await reloadGyms();
      setTimeout(() => setShowEditHours(false), 600);
    } catch (e) {
      setHoursMsg(e.response?.data?.message || '儲存失敗');
    } finally { setHoursSaving(false); }
  };

  const openEditBank = () => {
    const c = bankAccounts[selected.id] || {};
    setBankForm({ bankName: c.bankName||'', accountNumber: c.accountNumber||'', accountName: c.accountName||'', notes: c.notes||'' });
    setBankMsg('');
    setShowEditBank(true);
  };

  const handleSaveBank = async () => {
    setBankSaving(true);
    try {
      await client.put(`/settings/bank-accounts/${selected.id}`, bankForm);
      setBankMsg('已儲存');
      await loadBank();
      setTimeout(() => setShowEditBank(false), 600);
    } catch (e) {
      setBankMsg(e.response?.data?.message || '儲存失敗');
    } finally { setBankSaving(false); }
  };

  const annTypeLabel = (type) => ({
    closure:'休館', special_hours:'特殊時間', route_change:'路線更換', general:'一般公告'
  }[type] || type);

  const annTypeTag = (type) => ({
    closure:'red', special_hours:'warn', route_change:'blue', general:'gray'
  }[type] || 'gray');

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'#999' }}>載入中...</div>;

  return (
    <div style={{ padding:20, background:'#F7F3F3', minHeight:'100vh' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        {(isSuperAdmin ? gyms : gyms.filter(g => g.id === myGymId)).map(g => (
          <div key={g.id} onClick={() => setSelected(g)}
            style={{ background:'#fff', borderRadius:12, border:`1.5px solid ${selected?.id===g.id ? '#8B1A1A' : '#E8D5D5'}`, padding:16, cursor:'pointer', transition:'border-color .15s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:15 }}>{g.name}</div>
                <div style={{ fontSize:12, color:'#999', marginTop:3 }}>{g.address}</div>
              </div>
              {g.todayStatus ? (
                <Tag type={g.todayStatus.isOpen ? 'ok' : 'red'}>
                  {g.todayStatus.isOpen ? '營業中' : '休館'}
                </Tag>
              ) : <Tag type="gray">載入中</Tag>}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div style={{ background:'#FBF5F5', borderRadius:8, padding:'8px 10px', fontSize:12 }}>
                <div style={{ color:'#999' }}>今日時間</div>
                <div style={{ fontWeight:500, marginTop:2 }}>{g.todayStatus?.todayHours || '—'}</div>
              </div>
              <div style={{ background:'#FBF5F5', borderRadius:8, padding:'8px 10px', fontSize:12 }}>
                <div style={{ color:'#999' }}>電話</div>
                <div style={{ fontWeight:500, marginTop:2 }}>{g.phone}</div>
              </div>
            </div>
            {selected?.id === g.id && isSuperAdmin && (
              <button onClick={e => { e.stopPropagation(); openEditGym(); }}
                style={{ width:'100%', marginTop:10, height:28, borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:11, cursor:'pointer' }}>
                修改場館資料
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns: annOnly ? '1fr' : '1fr 1fr', gap:16 }}>
        {/* 標準營業時間（僅 super_admin）*/}
        {selected && !annOnly && (
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <span style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>
                {selected.shortName} 標準營業時間
              </span>
              <button onClick={openEditHours} style={{ height:24, padding:'0 9px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:11, cursor: isSuperAdmin ? 'pointer' : 'not-allowed', opacity: isSuperAdmin ? 1 : 0.4 }} disabled={!isSuperAdmin}>修改</button>
            </div>
            {DAYS.map(d => {
              const h = selected.regularHours?.[d];
              const isToday = DAYS[dayjs().day()] === d;
              return (
                <div key={d} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F5EFEF', fontSize:13, background: isToday ? '#FBF5F5' : 'transparent', margin:'0 -8px', padding:'8px 8px' }}>
                  <span style={{ color: isToday ? '#8B1A1A' : '#6b6b6b', fontWeight: isToday ? 600 : 400 }}>
                    {DAY_LABELS[d]} {isToday && '（今日）'}
                  </span>
                  <span style={{ fontWeight:500 }}>
                    {h?.closed ? <Tag type="gray">公休</Tag> : h ? `${h.open} - ${h.close}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 公告列表 */}
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>公告列表</span>
            <button onClick={() => setShowAddAnn(true)} style={{ height:28, padding:'0 10px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>＋ 新增公告</button>
          </div>
          {announcements.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:'#999', fontSize:13 }}>目前無公告</div>
          ) : announcements.map(a => (
            <div key={a.id} style={{ padding:'12px 16px', borderBottom:'1px solid #F5EFEF' }}>
              <div style={{ display:'flex', gap:6, marginBottom:5, alignItems:'center' }}>
                <Tag type={annTypeTag(a.type)}>{annTypeLabel(a.type)}</Tag>
                {a.showOnBanner && <Tag type="blue">輪播</Tag>}
                {annPublishMs(a.publishAt) > Date.now() && <Tag type="warn">排程中</Tag>}
                <span style={{ fontSize:11, color:'#999', marginLeft:'auto' }}>{a.effectiveFrom}</span>
              </div>
              <div style={{ fontSize:13, fontWeight:500 }}>{a.title}</div>
              {a.content && <div style={{ fontSize:12, color:'#6b6b6b', marginTop:3 }}>{a.content}</div>}
              {a.effectiveTo && <div style={{ fontSize:11, color:'#999', marginTop:4 }}>有效至 {a.effectiveTo}</div>}
              {annPublishMs(a.publishAt) > Date.now() && <div style={{ fontSize:11, color:'#854F0B', marginTop:4 }}>預計發布 {tsToLocalInput(a.publishAt).replace('T',' ')}</div>}
              <div style={{ display:'flex', gap:6, marginTop:8 }}>
                <button onClick={() => openEditAnn(a)} style={{ height:24, padding:'0 9px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:10, cursor:'pointer' }}>編輯</button>
                <button onClick={() => handleDeleteAnn(a)} style={{ height:24, padding:'0 9px', borderRadius:6, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:10, cursor:'pointer' }}>下架</button>
              </div>
            </div>
          ))}
        </div>

        {/* 銀行轉帳帳號（僅 super_admin）*/}
        {selected && !annOnly && (
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <span style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>
                {selected.shortName} 銀行轉帳帳號
              </span>
              <button onClick={openEditBank} style={{ height:24, padding:'0 9px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:11, cursor: isSuperAdmin ? 'pointer' : 'not-allowed', opacity: isSuperAdmin ? 1 : 0.4 }} disabled={!isSuperAdmin}>修改</button>
            </div>
            {(() => {
              const info = bankAccounts[selected.id];
              if (!info?.bankName) return <div style={{ fontSize:13, color:'#999', padding:'8px 0' }}>尚未設定</div>;
              const rows = [['銀行', info.bankName], ['帳號', info.accountNumber], ['戶名', info.accountName]];
              if (info.notes) rows.push(['備註', info.notes]);
              return rows.map(([k, v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F5EFEF', fontSize:13 }}>
                  <span style={{ color:'#999' }}>{k}</span>
                  <span style={{ fontWeight:500, fontFamily: k==='帳號' ? 'monospace' : 'inherit', letterSpacing: k==='帳號' ? 1 : 0 }}>{v}</span>
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {/* 新增/編輯公告 Modal */}
      {showAddAnn && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:480 }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>{editingAnn ? '編輯公告' : '新增公告'}</div>
            {annMsg && <div style={{ background: annMsg.includes('成功')||annMsg.includes('已') ? '#E6F4EB' : '#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:13, color: annMsg.includes('成功')||annMsg.includes('已') ? '#2D7D46' : '#A32D2D', marginBottom:12 }}>{annMsg}</div>}
            {[
              { label:'標題', key:'title', placeholder:'公告標題', type:'text' },
              { label:'內容（選填）', key:'content', placeholder:'公告詳細內容', type:'text' },
              { label:'生效開始日期（休館／營業調整生效起）', key:'effectiveFrom', placeholder:'', type:'date' },
              { label:'生效結束日期（選填）', key:'effectiveTo', placeholder:'', type:'date' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                <input type={f.type} value={annForm[f.key]} placeholder={f.placeholder}
                  onChange={e => setAnnForm(p => ({...p, [f.key]: e.target.value}))}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>類型</label>
              <select value={annForm.type} onChange={e => setAnnForm(p => ({...p, type: e.target.value}))}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                <option value="general">一般公告</option>
                {!annOnly && <option value="closure">休館</option>}
                {!annOnly && <option value="special_hours">特殊時間</option>}
                <option value="route_change">路線更換</option>
              </select>
              {annOnly && <div style={{ fontSize:11, color:'#999', marginTop:4 }}>休館／特殊營業時間公告請由管理員發布</div>}
            </div>

            {annForm.type === 'closure' && (
              <div style={{ background:'#FCEBEB', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#A32D2D', marginBottom:16, lineHeight:1.6 }}>
                此類型會自動覆蓋有效期間內的營業狀態，會員端與場館卡片會顯示「今日休館」，不需另外調整標準營業時間。
              </div>
            )}

            {['closure','special_hours'].includes(annForm.type) && !editingAnn && (
              <div style={{ background:'#F5F8FB', border:'0.5px solid #D6E2EE', borderRadius:8, padding:'10px 12px', marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#185FA5', marginBottom:6 }}>是否影響該時段課程？</div>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', marginBottom:4 }}>
                  <input type="radio" name="affectCourses" checked={affectCourses==='no'} onChange={()=>setAffectCourses('no')} style={{ accentColor:'#185FA5' }}/>
                  不影響——課程照常上課（休館不停課）
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                  <input type="radio" name="affectCourses" checked={affectCourses==='yes'} onChange={()=>setAffectCourses('yes')} style={{ accentColor:'#C0392B' }}/>
                  影響——送出後列出期間內場次，逐堂停課並發休館補課券
                </label>
                <div style={{ fontSize:11, color:'#8AA4BC', marginTop:6 }}>「停課但不休館」不用發公告：直接到課程場次管理按「⛔ 休館停課」即可。</div>
              </div>
            )}

            {annForm.type === 'special_hours' && (
              <>
                <div style={{ background:'#FFF3E0', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#B5762B', marginBottom:12, lineHeight:1.6 }}>
                  此類型會自動覆蓋有效期間內當天顯示的營業時間，不需另外調整標準營業時間。請填寫當天實際的營業時段。
                </div>
                <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>當天開始時間</label>
                    <input type="time" value={annForm.specialOpen}
                      onChange={e => setAnnForm(p => ({...p, specialOpen: e.target.value}))}
                      style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>當天結束時間</label>
                    <input type="time" value={annForm.specialClose}
                      onChange={e => setAnnForm(p => ({...p, specialClose: e.target.value}))}
                      style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
                  </div>
                </div>
              </>
            )}

            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#444', marginBottom:14, cursor:'pointer' }}>
              <input type="checkbox" checked={annForm.showOnBanner} onChange={e => setAnnForm(p => ({...p, showOnBanner: e.target.checked}))} />
              首頁輪播顯示
            </label>

            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>發布開始時間（排程上架，選填，留空＝立即發布）</label>
              <input type="datetime-local" value={annForm.publishAt}
                onChange={e => setAnnForm(p => ({...p, publishAt: e.target.value}))}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              <div style={{ fontSize:11, color:'#999', marginTop:4 }}>設定未來時間後，會員端要到該時間才會看到此公告。</div>
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>發布結束時間（選填，留空＝不自動下架）</label>
              <input type="datetime-local" value={annForm.publishUntil}
                onChange={e => setAnnForm(p => ({...p, publishUntil: e.target.value}))}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              <div style={{ fontSize:11, color:'#999', marginTop:4 }}>到此時間後，會員端不再顯示此公告（不影響休館生效日期）。</div>
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { setShowAddAnn(false); setEditingAnn(null); setAnnMsg(''); }}
                style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:13, cursor:'pointer' }}>取消</button>
              <button onClick={handleAddAnn} disabled={annSaving}
                style={{ flex:2, height:40, borderRadius:8, background: annSaving?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: annSaving?'not-allowed':'pointer' }}>
                {annSaving ? '處理中...' : editingAnn ? '儲存變更' : '確認新增'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改場館資料 Modal */}
      {showEditGym && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>修改場館資料</div>
            {gymMsg && <div style={{ background: gymMsg==='已儲存' ? '#E6F4EB' : '#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:13, color: gymMsg==='已儲存' ? '#2D7D46' : '#A32D2D', marginBottom:12 }}>{gymMsg}</div>}
            {[
              { label:'場館全名', key:'name' },
              { label:'簡稱', key:'shortName' },
              { label:'地址', key:'address' },
              { label:'電話', key:'phone' },
              { label:'Google地圖連結（選填）', key:'googleMapsUrl' },
              { label:'停車資訊（選填）', key:'parkingInfo' },
              { label:'交通資訊（選填）', key:'transitInfo' },
              { label:'場館描述（選填）', key:'description' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                <input value={gymForm[f.key]}
                  onChange={e => setGymForm(p => ({...p, [f.key]: e.target.value}))}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              </div>
            ))}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowEditGym(false)}
                style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:13, cursor:'pointer' }}>取消</button>
              <button onClick={handleSaveGym} disabled={gymSaving}
                style={{ flex:2, height:40, borderRadius:8, background: gymSaving?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: gymSaving?'not-allowed':'pointer' }}>
                {gymSaving ? '儲存中...' : '儲存變更'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改標準營業時間 Modal */}
      {showEditHours && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>修改標準營業時間</div>
            {hoursMsg && <div style={{ background: hoursMsg==='已儲存' ? '#E6F4EB' : '#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:13, color: hoursMsg==='已儲存' ? '#2D7D46' : '#A32D2D', marginBottom:12 }}>{hoursMsg}</div>}
            {DAYS.map(d => (
              <div key={d} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, padding:'8px 0', borderBottom:'0.5px solid #F5EFEF' }}>
                <span style={{ width:44, fontSize:13, fontWeight:500 }}>{DAY_LABELS[d]}</span>
                {hoursForm[d]?.closed ? (
                  <span style={{ flex:1, fontSize:12, color:'#999' }}>公休</span>
                ) : (
                  <>
                    <input type="time" value={hoursForm[d]?.open || ''}
                      onChange={e => setHoursForm(p => ({...p, [d]: {...p[d], open: e.target.value}}))}
                      style={{ height:32, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:12, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }} />
                    <span style={{ fontSize:12, color:'#999' }}>–</span>
                    <input type="time" value={hoursForm[d]?.close || ''}
                      onChange={e => setHoursForm(p => ({...p, [d]: {...p[d], close: e.target.value}}))}
                      style={{ height:32, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:12, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }} />
                  </>
                )}
                <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:'auto', fontSize:11, color:'#666', cursor:'pointer' }}>
                  <input type="checkbox" checked={!!hoursForm[d]?.closed}
                    onChange={e => setHoursForm(p => ({...p, [d]: {...p[d], closed: e.target.checked}}))} />
                  公休
                </label>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={() => setShowEditHours(false)}
                style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:13, cursor:'pointer' }}>取消</button>
              <button onClick={handleSaveHours} disabled={hoursSaving}
                style={{ flex:2, height:40, borderRadius:8, background: hoursSaving?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: hoursSaving?'not-allowed':'pointer' }}>
                {hoursSaving ? '儲存中...' : '儲存變更'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改銀行轉帳帳號 Modal */}
      {showEditBank && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:420, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>銀行轉帳帳號 — {selected?.name}</div>
            {bankMsg && <div style={{ background: bankMsg==='已儲存' ? '#E6F4EB' : '#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:13, color: bankMsg==='已儲存' ? '#2D7D46' : '#A32D2D', marginBottom:12 }}>{bankMsg}</div>}
            {[
              { label:'銀行名稱', key:'bankName', placeholder:'例：玉山銀行' },
              { label:'帳號', key:'accountNumber', placeholder:'例：0081234567890' },
              { label:'戶名', key:'accountName', placeholder:'例：紅石攀岩館' },
              { label:'備註（選填）', key:'notes', placeholder:'例：請備註姓名' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                <input value={bankForm[f.key]} placeholder={f.placeholder}
                  onChange={e => setBankForm(p => ({...p, [f.key]: e.target.value}))}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              </div>
            ))}
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button onClick={() => setShowEditBank(false)}
                style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:13, cursor:'pointer' }}>取消</button>
              <button onClick={handleSaveBank} disabled={bankSaving}
                style={{ flex:2, height:40, borderRadius:8, background: bankSaving?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: bankSaving?'not-allowed':'pointer' }}>
                {bankSaving ? '儲存中...' : '儲存變更'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 公告連動停課：期間內場次勾選 */}
      {affectModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:20, width:520, maxWidth:'94vw', maxHeight:'85vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>⛔ 選擇要停課的場次（{affectModal.checked.size}/{affectModal.sessions.length}）</div>
            <div style={{ fontSize:12, color:'#666', marginBottom:12, lineHeight:1.6 }}>
              勾選的場次將停課並對正取學員發放<strong>休館補課券</strong>（不佔請假額度）；取消勾選＝照常上課。
            </div>
            {affectModal.sessions.map(sx => (
              <label key={sx.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:8, border:'0.5px solid #F0E8E8', marginBottom:6, cursor:'pointer', fontSize:13 }}>
                <input type="checkbox" checked={affectModal.checked.has(sx.id)}
                  onChange={() => setAffectModal(m => { const c = new Set(m.checked); c.has(sx.id) ? c.delete(sx.id) : c.add(sx.id); return { ...m, checked: c }; })}
                  style={{ width:16, height:16, accentColor:'#C0392B' }}/>
                <span style={{ flex:1, textAlign:'left' }}>{sx.date} {sx.startTime}~{sx.endTime}　{sx.courseName}</span>
                <span style={{ fontSize:11, color:'#999' }}>{(sx.registeredCount ?? sx.enrolledCount) || 0} 人</span>
              </label>
            ))}
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button onClick={() => { if (!affectModal.running) { setAffectModal(null); setAnnMsg('公告已儲存；未停任何課'); } }}
                style={{ flex:1, height:42, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>全部照常上課</button>
              <button onClick={runAffectClosure} disabled={affectModal.running}
                style={{ flex:2, height:42, borderRadius:10, background:'#C0392B', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {affectModal.running ? '停課處理中…' : `確定停課 ${affectModal.checked.size} 堂並發券`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
