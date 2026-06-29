import { useState, useEffect } from 'react';
import { getCompetitions, createCompetition, updateCompetition, getCompetitionRegistrations } from '../../api/competitions';
import client from '../../api/client';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';
import CompetitionActionModal from '../../components/review/CompetitionActionModal';
import SegmentedTabs from '../../components/SegmentedTabs';

const Tag = ({ type='ok', children }) => {
  const s = { ok:{bg:'#E6F4EB',color:'#2D7D46'}, red:{bg:'#FCEBEB',color:'#A32D2D'}, warn:{bg:'#FAEEDA',color:'#854F0B'}, blue:{bg:'#E6F1FB',color:'#185FA5'}, gray:{bg:'#F0EDED',color:'#666'} };
  const st = s[type]||s.ok;
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:st.bg, color:st.color }}>{children}</span>;
};

const Modal = ({ title, onClose, children, width=620 }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
    <div style={{ background:'#fff', borderRadius:16, padding:24, width, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:600 }}>{title}</div>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const inp = { width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };
const lbl = { fontSize:12, color:'#666', display:'block', marginBottom:5 };

const STATUS_LABEL = {
  draft:  { type:'gray', label:'草稿' },
  open:   { type:'ok',   label:'開放報名' },
  closed: { type:'red',  label:'已截止' },
};

const emptyForm = () => ({
  name:'', description:'', gymId:'gym-hsinchu',
  registrationStart: dayjs().format('YYYY-MM-DD'),
  registrationEnd: dayjs().add(14,'day').format('YYYY-MM-DD'),
  earlyBirdDeadline: dayjs().add(7,'day').format('YYYY-MM-DD'),
  eventDate: dayjs().add(21,'day').format('YYYY-MM-DD'),
  divisions: [
    { id:`d${Date.now()}1`, name:'V2-V3組', maxParticipants:40, waitlistMax:5 },
    { id:`d${Date.now()}2`, name:'V4-V5組', maxParticipants:40, waitlistMax:5 },
  ],
  fees: { adultEarlyBird:990, adultRegular:1100, childEarlyBird:840, childRegular:950, teamMemberDiscount:0.9, childAgeLimit:15 },
  refundPolicies: [
    { deadline: dayjs().add(5,'day').format('YYYY-MM-DD'), rule:'full_minus_admin', adminFee:100 },
    { deadline: dayjs().add(12,'day').format('YYYY-MM-DD'), rule:'half_minus_admin', adminFee:100 },
  ],
  waiverContent: { zh:'', en:'' },
  scoringSystem:'rating_system',
  webhookUrl:'',
  status:'draft',
});

export default function CompetitionsPage() {
  const { staff } = useAuth();
  const canManage = ['super_admin','gym_manager'].includes(staff?.role);
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState('ok');
  const [tab, setTab] = useState('list');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showRegistrations, setShowRegistrations] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [regLoading, setRegLoading] = useState(false);
  const [regTab, setRegTab] = useState('all'); // all | refunds
  const [actionModal, setActionModal] = useState(null); // { type:'pay'|'refund', reg }

  const showMsg = (t, type='ok') => { setMsg(t); setMsgType(type); setTimeout(()=>setMsg(''),4000); };

  const loadCompetitions = async () => {
    setLoading(true);
    try { const r = await getCompetitions(); setCompetitions(r.data.competitions||[]); }
    catch(e) { setCompetitions([]); } finally { setLoading(false); }
  };
  useEffect(()=>{ loadCompetitions(); },[]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setShowForm(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name:c.name, description:c.description||'', gymId:c.gymId||'gym-hsinchu',
      registrationStart:c.registrationStart, registrationEnd:c.registrationEnd,
      earlyBirdDeadline:c.earlyBirdDeadline||'', eventDate:c.eventDate,
      divisions: c.divisions?.length ? c.divisions.map(d=>({ id:d.id, name:d.name, maxParticipants:d.maxParticipants||40, waitlistMax:d.waitlistMax||5 })) : emptyForm().divisions,
      fees: c.fees || emptyForm().fees,
      refundPolicies: c.refundPolicies || emptyForm().refundPolicies,
      waiverContent: c.waiverContent||{zh:'',en:''},
      scoringSystem:c.scoringSystem, webhookUrl:c.webhookUrl||'', status:c.status,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showMsg('請輸入賽事名稱','red'); return; }
    if (form.divisions.some(d=>!d.name.trim())) { showMsg('請填寫所有組別名稱','red'); return; }
    setSaving(true);
    try {
      const payload = { ...form, webhookUrl:form.webhookUrl||null };
      editingId ? await updateCompetition(editingId, payload) : await createCompetition(payload);
      showMsg(editingId ? '賽事已更新' : '賽事已建立');
      setShowForm(false); await loadCompetitions();
    } catch(err) { showMsg(err.response?.data?.message||'儲存失敗','red'); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (c, status) => {
    try { await updateCompetition(c.id, { status }); showMsg('狀態已更新'); await loadCompetitions(); }
    catch(err) { showMsg('更新失敗','red'); }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`確定要刪除「${c.name}」？此動作無法復原。`)) return;
    try {
      await client.delete(`/competitions/${c.id}`);
      showMsg('比賽已刪除');
      await loadCompetitions();
    } catch(err) { showMsg('刪除失敗','red'); }
  };

  const openRegistrations = async (c) => {
    setShowRegistrations(c); setRegLoading(true);
    try { const r = await getCompetitionRegistrations(c.id); setRegistrations(r.data.registrations||[]); }
    catch(e) { setRegistrations([]); } finally { setRegLoading(false); }
  };

  const handleDownloadRefundCSV = (c) => {
    const refunds = registrations.filter(r => r.refundRequested || r.status === 'cancelled');
    if (!refunds.length) { alert('目前沒有退費申請記錄'); return; }
    const headers = ['序號','姓名','組別','報名費','付款狀態','取消時間','原匯款末五碼','退費銀行代碼','退費銀行','退費帳號','退費戶名','取消原因'];
    const rows = refunds.map((r,i) => [
      i+1, `"${r.memberName||''}"`, `"${r.divisionName||''}"`,
      r.registrationFee||'', r.paymentStatus||'pending',
      r.cancelledAt?._seconds ? new Date(r.cancelledAt._seconds*1000).toLocaleString('zh-TW') : '',
      r.bankLastFive||'',
      r.refundBankCode||'', `"${r.refundBankName||''}"`, r.refundAccount||'', `"${r.refundAccountName||''}"`,
      `"${r.cancelReason||''}"`,
    ].join(','));
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`refunds_${c.name}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleDownloadCSV = (c) => {
    window.open(`${import.meta.env.VITE_API_BASE || 'https://redrock-api-production.up.railway.app'}/competitions/${c.id}/registrations/download`, '_blank');
  };


  const updateDivision = (idx, patch) => setForm(f=>({ ...f, divisions: f.divisions.map((d,i)=>i===idx?{...d,...patch}:d) }));
  const addDivision = () => setForm(f=>({ ...f, divisions:[...f.divisions,{ id:`d${Date.now()}`, name:'', maxParticipants:40, waitlistMax:5 }] }));
  const removeDivision = (idx) => { if(form.divisions.length<=1) return; setForm(f=>({ ...f, divisions:f.divisions.filter((_,i)=>i!==idx) })); };
  const updatePolicy = (idx, patch) => setForm(f=>({ ...f, refundPolicies: f.refundPolicies.map((p,i)=>i===idx?{...p,...patch}:p) }));
  const addPolicy = () => setForm(f=>({ ...f, refundPolicies:[...f.refundPolicies,{ deadline:'', rule:'full_minus_admin', adminFee:100 }] }));
  const removePolicy = (idx) => setForm(f=>({ ...f, refundPolicies:f.refundPolicies.filter((_,i)=>i!==idx) }));

  const payStatusInfo = (r) => {
    if (r.paymentStatus==='confirmed') return { type:'ok', label:'已付款' };
    if (r.paymentStatus==='refunded') return { type:'gray', label:'已退費' };
    return { type:'warn', label:'待付款' };
  };

  return (
    <div style={{ padding:24, maxWidth:900, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:20, fontWeight:700, color:'#1a1a1a' }}>🏆 賽事管理</div>
        {canManage && <button onClick={openCreate} style={{ height:36, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>+ 新增賽事</button>}
      </div>

      {msg && <div style={{ background:msgType==='ok'?'#E6F4EB':'#FCEBEB', border:`0.5px solid ${msgType==='ok'?'#B3DEC0':'#F5C4C4'}`, borderRadius:8, padding:'8px 14px', marginBottom:14, fontSize:13, color:msgType==='ok'?'#2D7D46':'#A32D2D' }}>{msg}</div>}

      {loading ? <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {competitions.length===0 && <div style={{ textAlign:'center', color:'#999', padding:40 }}>尚無賽事</div>}
          {competitions.map(c => {
            const sl = STATUS_LABEL[c.status]||STATUS_LABEL.draft;
            return (
              <div key={c.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:15 }}>{c.name}</div>
                    <div style={{ fontSize:12, color:'#999', marginTop:3 }}>
                      比賽日：{c.eventDate} ｜ 報名截止：{c.registrationEnd}
                      {c.earlyBirdDeadline && ` ｜ 早鳥：${c.earlyBirdDeadline}`}
                    </div>
                    <div style={{ fontSize:12, color:'#999', marginTop:2 }}>
                      組別：{(c.divisions||[]).map(d=>`${d.name}(${d.maxParticipants}人+候補${d.waitlistMax})`).join(' / ')}
                    </div>
                  </div>
                  <Tag type={sl.type}>{sl.label}</Tag>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {canManage && <>
                    <button onClick={()=>openEdit(c)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#8B1A1A', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer' }}>編輯</button>
                    {c.status==='draft' && <button onClick={()=>handleStatusChange(c,'open')} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#E6F4EB', color:'#2D7D46', border:'0.5px solid #B3DEC0', fontSize:12, cursor:'pointer' }}>開放報名</button>}
                    {c.status==='open'   && <button onClick={()=>handleStatusChange(c,'closed')} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FCEBEB', color:'#A32D2D', border:'0.5px solid #F5C4C4', fontSize:12, cursor:'pointer' }}>關閉報名</button>}
                    {c.status==='closed' && <button onClick={()=>handleStatusChange(c,'open')} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#E6F4EB', color:'#2D7D46', border:'0.5px solid #B3DEC0', fontSize:12, cursor:'pointer' }}>重新開放</button>}
                    <button onClick={()=>openRegistrations(c)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#E6F1FB', color:'#185FA5', border:'0.5px solid #B5D4F4', fontSize:12, cursor:'pointer' }}>查看名單</button>
                    <button onClick={()=>handleDownloadCSV(c)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#185FA5', border:'0.5px solid #B5D4F4', fontSize:12, cursor:'pointer' }}>⬇ 下載名單</button>
                    <button onClick={()=>handleDelete(c)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FCEBEB', color:'#A32D2D', border:'0.5px solid #F5C4C4', fontSize:12, cursor:'pointer' }}>🗑 刪除</button>
                  </>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 建立/編輯 Modal */}
      {showForm && (
        <Modal title={editingId?'編輯賽事':'新增賽事'} onClose={()=>setShowForm(false)} width={680}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <div style={{ gridColumn:'1/-1' }}><label style={lbl}>賽事名稱</label><input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><label style={lbl}>比賽日期</label><input type="date" style={inp} value={form.eventDate} onChange={e=>setForm(f=>({...f,eventDate:e.target.value}))}/></div>
            <div><label style={lbl}>場館</label>
              <select style={inp} value={form.gymId} onChange={e=>setForm(f=>({...f,gymId:e.target.value}))}>
                <option value="gym-hsinchu">新竹館</option>
                <option value="gym-shilin">士林館</option>
              </select>
            </div>
            <div><label style={lbl}>報名開始</label><input type="date" style={inp} value={form.registrationStart} onChange={e=>setForm(f=>({...f,registrationStart:e.target.value}))}/></div>
            <div><label style={lbl}>報名截止</label><input type="date" style={inp} value={form.registrationEnd} onChange={e=>setForm(f=>({...f,registrationEnd:e.target.value}))}/></div>
            <div><label style={lbl}>早鳥截止日</label><input type="date" style={inp} value={form.earlyBirdDeadline} onChange={e=>setForm(f=>({...f,earlyBirdDeadline:e.target.value}))}/></div>
            <div><label style={lbl}>計分系統</label>
              <select style={inp} value={form.scoringSystem} onChange={e=>setForm(f=>({...f,scoringSystem:e.target.value}))}>
                <option value="rating_system">Rating System</option>
                <option value="competition_management_v2">紅石賽事管理 V2</option>
              </select>
            </div>
          </div>

          {/* 組別設定 */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>組別設定</div>
              <button onClick={addDivision} style={{ height:26, padding:'0 10px', borderRadius:6, background:'#FBF5F5', color:'#8B1A1A', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer' }}>+ 新增組別</button>
            </div>
            {form.divisions.map((d,i)=>(
              <div key={d.id} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 28px', gap:8, marginBottom:8, alignItems:'center' }}>
                <input style={inp} placeholder="組別名稱（如 V2-V3組）" value={d.name} onChange={e=>updateDivision(i,{name:e.target.value})}/>
                <input type="number" style={{...inp, padding:'0 8px'}} placeholder="人數" value={d.maxParticipants} onChange={e=>updateDivision(i,{maxParticipants:Number(e.target.value)})}/>
                <input type="number" style={{...inp, padding:'0 8px'}} placeholder="候補" value={d.waitlistMax} onChange={e=>updateDivision(i,{waitlistMax:Number(e.target.value)})}/>
                <button onClick={()=>removeDivision(i)} style={{ width:28, height:28, borderRadius:6, background:'#FCEBEB', color:'#A32D2D', border:'none', fontSize:14, cursor:'pointer' }}>✕</button>
              </div>
            ))}
            <div style={{ fontSize:11, color:'#999' }}>欄位順序：組別名稱 / 人數上限 / 候補名額</div>
          </div>

          {/* 費用設定 */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>費用設定</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              {[
                { k:'adultEarlyBird', label:'成人早鳥' },
                { k:'adultRegular', label:'成人一般' },
                { k:'teamMemberDiscount', label:'隊員折扣（如0.9）' },
                { k:'childEarlyBird', label:'兒童早鳥' },
                { k:'childRegular', label:'兒童一般' },
                { k:'childAgeLimit', label:'兒童年齡上限（歲）' },
              ].map(({k,label})=>(
                <div key={k}>
                  <label style={lbl}>{label}</label>
                  <input type="number" style={inp} value={form.fees[k]} onChange={e=>setForm(f=>({...f,fees:{...f.fees,[k]:Number(e.target.value)}}))}/>
                </div>
              ))}
            </div>
          </div>

          {/* 退費政策 */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>退費政策</div>
              <button onClick={addPolicy} style={{ height:26, padding:'0 10px', borderRadius:6, background:'#FBF5F5', color:'#8B1A1A', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer' }}>+ 新增</button>
            </div>
            {form.refundPolicies.map((p,i)=>(
              <div key={i} style={{ display:'grid', gridTemplateColumns:'120px 1fr 80px 28px', gap:8, marginBottom:8, alignItems:'center' }}>
                <input type="date" style={inp} value={p.deadline} onChange={e=>updatePolicy(i,{deadline:e.target.value})}/>
                <select style={inp} value={p.rule} onChange={e=>updatePolicy(i,{rule:e.target.value})}>
                  <option value="full_minus_admin">全額退（扣行政費）</option>
                  <option value="half_minus_admin">半額退（扣行政費）</option>
                  <option value="no_refund">不退費</option>
                </select>
                <input type="number" style={inp} placeholder="行政費" value={p.adminFee} onChange={e=>updatePolicy(i,{adminFee:Number(e.target.value)})}/>
                <button onClick={()=>removePolicy(i)} style={{ width:28, height:28, borderRadius:6, background:'#FCEBEB', color:'#A32D2D', border:'none', fontSize:14, cursor:'pointer' }}>✕</button>
              </div>
            ))}
          </div>

          {/* Webhook & waiver */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div><label style={lbl}>Webhook URL（計分系統）</label><input style={inp} value={form.webhookUrl} onChange={e=>setForm(f=>({...f,webhookUrl:e.target.value}))}/></div>
            <div><label style={lbl}>狀態</label>
              <select style={inp} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                <option value="draft">草稿</option>
                <option value="open">開放報名</option>
                <option value="closed">已截止</option>
              </select>
            </div>
            <div style={{ gridColumn:'1/-1' }}><label style={lbl}>賽事說明</label><textarea rows={3} style={{...inp, height:'auto', padding:'8px 12px', resize:'none'}} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
            <div style={{ gridColumn:'1/-1' }}><label style={lbl}>同意書內容（繁中）</label><textarea rows={4} style={{...inp, height:'auto', padding:'8px 12px', resize:'none'}} value={form.waiverContent.zh} onChange={e=>setForm(f=>({...f,waiverContent:{...f.waiverContent,zh:e.target.value}}))}/></div>
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>setShowForm(false)} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleSave} disabled={saving} style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>{saving?'儲存中...':'儲存賽事'}</button>
          </div>
        </Modal>
      )}

      {/* 報名名單 Modal */}
      {showRegistrations && (
        <Modal title={`報名名單 — ${showRegistrations.name}`} onClose={()=>setShowRegistrations(null)} width={760}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <SegmentedTabs value={regTab} onChange={setRegTab} tabs={[
              { key:'all',     label:`全部 (${registrations.length})` },
              { key:'refunds', label:`退費申請 (${registrations.filter(r=>r.refundRequested||r.status==='cancelled').length})` },
            ]} />
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={()=>handleDownloadCSV(showRegistrations)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#185FA5', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>⬇ 名單</button>
              <button onClick={()=>handleDownloadRefundCSV(showRegistrations)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#A32D2D', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>⬇ 退費清單</button>
            </div>
          </div>
          {regLoading ? <div style={{ textAlign:'center', color:'#999', padding:20 }}>載入中...</div> : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {registrations.length===0 && <div style={{ textAlign:'center', color:'#999', padding:20 }}>尚無報名記錄</div>}
              {(regTab==='refunds' ? registrations.filter(r=>r.refundRequested||r.status==='cancelled') : registrations).map(r => {
                const ps = payStatusInfo(r);
                return (
                  <div key={r.id} style={{ background:'#FBF5F5', borderRadius:10, padding:'12px 14px', border:'0.5px solid #E8D5D5' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:14 }}>{r.memberName} {r.isHonorary && <span style={{ fontSize:10, background:'#FAEEDA', color:'#854F0B', padding:'1px 6px', borderRadius:6, fontWeight:600 }}>榮譽</span>}</div>
                        <div style={{ fontSize:12, color:'#666', marginTop:3 }}>
                          {r.divisionName} ｜ 報名費：NT${r.registrationFee} {r.isEarlyBird?'（早鳥）':''}
                          {r.status==='waitlist' && <span style={{ marginLeft:6, color:'#854F0B' }}>候補#{r.waitlistPosition}</span>}
                        </div>
                        <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                          身高：{r.height||'—'} ｜ 臂展：{r.armSpan||'—'} ｜ 匯款末五碼：{r.bankLastFive||'—'}
                        </div>
                        {(r.idNumber || r.emergencyContact) && (
                          <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                            身分證：{r.idNumber||'—'} ｜ 緊急聯絡：{r.emergencyContact||'—'} {r.emergencyPhone||''}
                          </div>
                        )}
                        {r.refundAccount && (
                          <div style={{ fontSize:11, color:'#A32D2D', marginTop:4, background:'#FCEBEB', borderRadius:6, padding:'4px 8px', display:'inline-block' }}>
                            退費帳號：({r.refundBankCode}) {r.refundBankName} {r.refundAccount} {r.refundAccountName}
                          </div>
                        )}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                        <Tag type={ps.type}>{ps.label}</Tag>
                        {r.isComplete ? <Tag type="ok">已簽署</Tag> : <Tag type="warn">待家長簽</Tag>}
                        {r.refundRequested && r.status==='cancelled' && <Tag type="red">退費申請中</Tag>}
                      </div>
                    </div>
                    {r.paymentStatus==='pending' && (
                      <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'center' }}>
                        <span style={{ fontSize:11, color:'#854F0B' }}>待收款（於待辦總覽確認）</span>
                        <button onClick={()=>setActionModal({type:'refund',reg:r})}
                          style={{ marginLeft:'auto', height:28, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#A32D2D', border:'0.5px solid #A32D2D', fontSize:12, cursor:'pointer' }}>退費</button>
                      </div>
                    )}
                    {r.paymentStatus==='confirmed' && (
                      <div style={{ fontSize:11, color:'#2D7D46', marginTop:8 }}>
                        已確認收款 NT${r.paidAmount} ｜ 確認人：{r.paidConfirmedByName||'—'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {/* 收款/退費 Modal（共用元件） */}
      {actionModal && (
        <CompetitionActionModal
          action={actionModal.type}
          reg={actionModal.reg}
          onClose={()=>setActionModal(null)}
          onDone={(m)=>{ setActionModal(null); showMsg(m); openRegistrations(showRegistrations); }}
        />
      )}
    </div>
  );
}
