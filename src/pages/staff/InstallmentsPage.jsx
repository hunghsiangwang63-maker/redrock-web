import { useState, useEffect } from 'react';
import { createInstallmentPlan, markInstallmentPaid, getAllInstallments, runOverdueCheck, sendInstallmentReminders } from '../../api/installments';
import { searchMembers } from '../../api/members';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';

const Tag = ({ type='ok', children }) => {
  const s = { ok:{bg:'#E6F4EB',color:'#2D7D46'}, red:{bg:'#FCEBEB',color:'#A32D2D'}, warn:{bg:'#FAEEDA',color:'#854F0B'}, blue:{bg:'#E6F1FB',color:'#185FA5'}, gray:{bg:'#F0EDED',color:'#666'} };
  const st = s[type]||s.ok;
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:st.bg, color:st.color }}>{children}</span>;
};

const Modal = ({ title, onClose, children, width=520 }) => (
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

const PAY_METHODS = [
  { key:'cash', label:'現金' },
  { key:'transfer', label:'轉帳' },
  { key:'linepay', label:'Line Pay' },
  { key:'jkopay', label:'街口支付' },
  { key:'taiwanpay', label:'台灣Pay' },
];

const STATUS_LABEL = {
  active:    { type:'blue', label:'進行中' },
  overdue:   { type:'red',  label:'有逾期' },
  completed: { type:'ok',   label:'已結清' },
};

export default function InstallmentsPage({ embedded = false }) {
  const { staff } = useAuth();
  const [plans, setPlans] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');

  const [showCreate, setShowCreate] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [planForm, setPlanForm] = useState({ relatedType:'course', itemName:'', relatedId:'', gymId: staff?.gymId || '', recognitionDate:'', firstPaymentMethod:'cash' });
  const [gyms, setGyms] = useState([]);
  useEffect(() => { import('../../api/gyms').then(m => m.getGyms()).then(r => setGyms(r.data.gyms || [])).catch(() => {}); }, []);
  const [installmentRows, setInstallmentRows] = useState([
    { amount:'', dueDate: dayjs().add(7,'day').format('YYYY-MM-DD') },
    { amount:'', dueDate: dayjs().add(37,'day').format('YYYY-MM-DD') },
  ]);
  const [creating, setCreating] = useState(false);

  const [payingPlan, setPayingPlan] = useState(null);
  const [payingSeq, setPayingSeq] = useState(null);
  const [payMethod, setPayMethod] = useState('cash');
  const [paying, setPaying] = useState(false);

  const showMsg = (text, type='ok') => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(''), 4000); };

  const loadPlans = async () => {
    setLoading(true);
    try {
      const res = await getAllInstallments(statusFilter || undefined);
      setPlans(res.data.plans || []);
    } catch (e) { setPlans([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPlans(); }, [statusFilter]);

  const handleSearchMember = async (q) => {
    setMemberQuery(q);
    if (q.length < 2) { setMemberResults([]); return; }
    try {
      const res = await searchMembers(q);
      setMemberResults(res.data.members || []);
    } catch (e) {}
  };

  const addInstallmentRow = () => {
    const last = installmentRows[installmentRows.length - 1];
    setInstallmentRows([...installmentRows, { amount:'', dueDate: dayjs(last?.dueDate).add(30,'day').format('YYYY-MM-DD') }]);
  };
  const removeInstallmentRow = (idx) => {
    if (installmentRows.length <= 2) { showMsg('分期至少需要2期', 'red'); return; }
    setInstallmentRows(installmentRows.filter((_, i) => i !== idx));
  };
  const updateInstallmentRow = (idx, field, value) => {
    setInstallmentRows(installmentRows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const totalPlanned = installmentRows.reduce((sum, r) => sum + (parseInt(r.amount) || 0), 0);

  const resetCreateForm = () => {
    setSelectedMember(null); setMemberQuery(''); setMemberResults([]);
    setPlanForm({ relatedType:'course', itemName:'', relatedId:'', gymId: staff?.gymId || '', recognitionDate:'', firstPaymentMethod:'cash' });
    setInstallmentRows([
      { amount:'', dueDate: dayjs().add(7,'day').format('YYYY-MM-DD') },
      { amount:'', dueDate: dayjs().add(37,'day').format('YYYY-MM-DD') },
    ]);
  };

  const handleCreatePlan = async () => {
    if (!selectedMember) { showMsg('請選擇會員', 'red'); return; }
    if (!planForm.itemName.trim()) { showMsg('請輸入項目名稱', 'red'); return; }
    if (installmentRows.some(r => !r.amount || parseInt(r.amount) <= 0 || !r.dueDate)) {
      showMsg('請完整填寫每期金額與到期日', 'red'); return;
    }
    setCreating(true);
    try {
      if (!planForm.gymId) { showMsg('請選擇館別', 'red'); setCreating(false); return; }
      if (planForm.relatedType === 'course' && !planForm.recognitionDate) { showMsg('課程分期請填「課程最後一堂（認列日）」', 'red'); setCreating(false); return; }
      await createInstallmentPlan({
        memberId: selectedMember.id,
        memberName: selectedMember.name,
        gymId: planForm.gymId,
        relatedType: planForm.relatedType,
        relatedId: planForm.relatedId || `manual-${Date.now()}`,
        itemName: planForm.itemName,
        recognitionDate: planForm.relatedType === 'course' ? planForm.recognitionDate : null,
        firstPaymentMethod: planForm.firstPaymentMethod || 'cash',
        installments: installmentRows.map(r => ({ amount: parseInt(r.amount), dueDate: r.dueDate })),
      });
      showMsg('分期付款計畫已建立');
      setShowCreate(false);
      resetCreateForm();
      await loadPlans();
    } catch (err) {
      showMsg(err.response?.data?.message || '建立失敗', 'red');
    } finally { setCreating(false); }
  };

  const openPayModal = (plan, seq) => {
    setPayingPlan(plan); setPayingSeq(seq); setPayMethod('cash');
  };

  const handleMarkPaid = async () => {
    setPaying(true);
    try {
      const res = await markInstallmentPaid(payingPlan.id, payingSeq, payMethod);
      showMsg(res.data.message);
      setPayingPlan(null); setPayingSeq(null);
      await loadPlans();
    } catch (err) {
      showMsg(err.response?.data?.message || '標記失敗', 'red');
    } finally { setPaying(false); }
  };

  const handleRunOverdueCheck = async () => {
    try {
      const res = await runOverdueCheck();
      showMsg(res.data.message);
      await loadPlans();
    } catch (err) { showMsg('檢查失敗', 'red'); }
  };

  const handleSendReminders = async () => {
    try {
      const res = await sendInstallmentReminders();
      showMsg(res.data.message);
    } catch (err) { showMsg('發送失敗', 'red'); }
  };

  return (
    <div style={{ padding: embedded?0:20, background:'#F7F3F3' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:600 }}>分期付款管理</div>
          <div style={{ fontSize:12, color:'#999', marginTop:3 }}>適用課程報名、定期票等大額項目的分期收款追蹤</div>
        </div>
        <button onClick={() => setShowCreate(true)}
          style={{ height:40, padding:'0 18px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          ＋ 新增分期計畫
        </button>
      </div>

      {msg && (
        <div style={{ background: msgType==='ok'?'#E6F4EB':'#FCEBEB', border:`0.5px solid ${msgType==='ok'?'#B3DEC0':'#F09595'}`, borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color: msgType==='ok'?'#2D7D46':'#A32D2D' }}>
          {msg}
        </div>
      )}

      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        {[{key:'',label:'全部'},{key:'active',label:'進行中'},{key:'overdue',label:'有逾期'},{key:'completed',label:'已結清'}].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            style={{ height:32, padding:'0 14px', borderRadius:8, border: statusFilter===f.key?'none':'0.5px solid #E8D5D5', background: statusFilter===f.key?'#8B1A1A':'#fff', color: statusFilter===f.key?'#fff':'#666', fontSize:12, fontWeight:500, cursor:'pointer' }}>
            {f.label}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={handleRunOverdueCheck}
            style={{ height:32, padding:'0 12px', borderRadius:8, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:11, cursor:'pointer' }}>
            手動檢查逾期
          </button>
          <button onClick={handleSendReminders}
            style={{ height:32, padding:'0 12px', borderRadius:8, background:'#fff', border:'0.5px solid #185FA5', color:'#185FA5', fontSize:11, cursor:'pointer' }}>
            手動發送提醒信
          </button>
        </div>
      </div>
      <div style={{ fontSize:11, color:'#999', marginBottom:14, lineHeight:1.6 }}>
        ⓘ 到期前14天會發送站內通知給管理員（鈴鐺通知）、到期前3天發Email提醒會員、逾期後發Email通知會員並暫停入場。系統每日台灣時間 09:00 自動執行逾期檢查與提醒；上方按鈕可隨時手動補跑。
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'#999', fontSize:13 }}>載入中...</div>
      ) : plans.length === 0 ? (
        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:40, textAlign:'center', color:'#999', fontSize:13 }}>
          目前沒有分期付款計畫
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {plans.map(p => {
            const st = STATUS_LABEL[p.status] || STATUS_LABEL.active;
            const paidCount = p.installments.filter(i => i.status === 'paid').length;
            return (
              <div key={p.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:15 }}>{p.memberName} — {p.itemName}</div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                      {p.relatedType === 'course' ? '課程報名' : '定期票'} · 總額 NT${p.totalAmount.toLocaleString()} · 已繳 {paidCount}/{p.installments.length} 期
                    </div>
                  </div>
                  <Tag type={st.type}>{st.label}</Tag>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {p.installments.map(i => (
                    <div key={i.seq} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', background: i.status==='overdue' ? '#FCEBEB' : '#FBFBFB', borderRadius:6 }}>
                      <div style={{ fontSize:12 }}>
                        第 {i.seq} 期 · NT${i.amount.toLocaleString()} · 到期 {i.dueDate}
                        {i.status === 'paid' && i.paidAt && (
                          <span style={{ color:'#999', marginLeft:6 }}>
                            （{dayjs(i.paidAt?._seconds ? i.paidAt._seconds*1000 : i.paidAt).format('MM/DD')} 已收 · {PAY_METHODS.find(m=>m.key===i.paymentMethod)?.label || i.paymentMethod}）
                          </span>
                        )}
                      </div>
                      {i.status === 'paid' ? (
                        <Tag type="ok">已繳款</Tag>
                      ) : i.status === 'overdue' ? (
                        <button onClick={() => openPayModal(p, i.seq)}
                          style={{ height:26, padding:'0 10px', borderRadius:6, background:'#A32D2D', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>
                          逾期 · 標記繳款
                        </button>
                      ) : (
                        <button onClick={() => openPayModal(p, i.seq)}
                          style={{ height:26, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:11, cursor:'pointer' }}>
                          標記繳款
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新增分期計畫 Modal */}
      {showCreate && (
        <Modal title="新增分期付款計畫" onClose={() => { setShowCreate(false); resetCreateForm(); }}>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>會員</label>
            {selectedMember ? (
              <div style={{ background:'#E6F4EB', borderRadius:8, padding:'8px 12px', fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span><strong>{selectedMember.name}</strong>（{selectedMember.phone}）</span>
                <span onClick={() => { setSelectedMember(null); setMemberQuery(''); }} style={{ cursor:'pointer', color:'#999' }}>×</span>
              </div>
            ) : (
              <>
                <input value={memberQuery} onChange={e => handleSearchMember(e.target.value)}
                  placeholder="搜尋姓名或手機號碼..."
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                {memberResults.length > 0 && (
                  <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, marginTop:4, overflow:'hidden' }}>
                    {memberResults.slice(0,5).map(m => (
                      <div key={m.id} onClick={() => { setSelectedMember(m); setMemberResults([]); }}
                        style={{ padding:'10px 12px', cursor:'pointer', fontSize:13, borderBottom:'0.5px solid #F5EFEF', display:'flex', justifyContent:'space-between' }}>
                        <span style={{ fontWeight:500 }}>{m.name}</span><span style={{ color:'#999' }}>{m.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ display:'flex', gap:8, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>項目類型</label>
              <select value={planForm.relatedType} onChange={e => setPlanForm({...planForm, relatedType:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                <option value="course">課程報名</option>
                <option value="pass">定期票</option>
              </select>
            </div>
            <div style={{ flex:2 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>項目名稱</label>
              <input value={planForm.itemName} onChange={e => setPlanForm({...planForm, itemName:e.target.value})}
                placeholder="例如：成人攀岩season課程"
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:120 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>館別</label>
              <select value={planForm.gymId} onChange={e => setPlanForm({...planForm, gymId:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                <option value="">請選擇</option>
                {gyms.map(g => <option key={g.id} value={g.id}>{g.name || g.id}</option>)}
              </select>
            </div>
            <div style={{ flex:1, minWidth:150 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>頭款收款方式（第一期自動收）</label>
              <select value={planForm.firstPaymentMethod} onChange={e => setPlanForm({...planForm, firstPaymentMethod:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                {PAY_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                <option value="">不自動收（各期手動）</option>
              </select>
            </div>
            {planForm.relatedType === 'course' && (
              <div style={{ flex:1, minWidth:140 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>課程最後一堂（認列日）</label>
                <input type="date" value={planForm.recognitionDate} onChange={e => setPlanForm({...planForm, recognitionDate:e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>
            )}
          </div>

          <div style={{ marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <label style={{ fontSize:12, color:'#666' }}>分期明細（自由設定期數與金額）</label>
            <span style={{ fontSize:12, color:'#8B1A1A', fontWeight:600 }}>合計 NT${totalPlanned.toLocaleString()}</span>
          </div>
          {installmentRows.map((row, idx) => (
            <div key={idx} style={{ display:'flex', gap:6, marginBottom:8, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'#999', width:36 }}>第{idx+1}期</span>
              <input type="number" value={row.amount} onChange={e => updateInstallmentRow(idx, 'amount', e.target.value)}
                placeholder="金額"
                style={{ flex:1, height:36, borderRadius:7, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              <input type="date" value={row.dueDate} onChange={e => updateInstallmentRow(idx, 'dueDate', e.target.value)}
                style={{ flex:1, height:36, borderRadius:7, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              <button onClick={() => removeInstallmentRow(idx)}
                style={{ width:30, height:36, borderRadius:7, background:'#fff', border:'0.5px solid #E8D5D5', color:'#999', cursor:'pointer' }}>×</button>
            </div>
          ))}
          <button onClick={addInstallmentRow}
            style={{ width:'100%', height:34, borderRadius:7, background:'#fff', border:'0.5px dashed #E8D5D5', color:'#666', fontSize:12, cursor:'pointer', marginBottom:20 }}>
            ＋ 新增一期
          </button>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { setShowCreate(false); resetCreateForm(); }}
              style={{ flex:1, height:42, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleCreatePlan} disabled={creating}
              style={{ flex:2, height:42, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {creating ? '建立中...' : '建立分期計畫'}
            </button>
          </div>
        </Modal>
      )}

      {/* 標記繳款 Modal */}
      {payingPlan && payingSeq && (
        <Modal title={`標記繳款 — 第 ${payingSeq} 期`} onClose={() => { setPayingPlan(null); setPayingSeq(null); }} width={400}>
          <div style={{ background:'#FBF5F5', borderRadius:8, padding:'10px 12px', marginBottom:16, fontSize:13 }}>
            {payingPlan.memberName} — {payingPlan.itemName}<br/>
            金額：NT${payingPlan.installments.find(i=>i.seq===payingSeq)?.amount.toLocaleString()}
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:8 }}>收款方式</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {PAY_METHODS.map(pm => (
                <button key={pm.key} onClick={() => setPayMethod(pm.key)}
                  style={{ height:38, borderRadius:8, border: payMethod===pm.key?'none':'0.5px solid #E8D5D5', background: payMethod===pm.key?'#8B1A1A':'#fff', color: payMethod===pm.key?'#fff':'#666', fontSize:13, cursor:'pointer' }}>
                  {pm.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { setPayingPlan(null); setPayingSeq(null); }}
              style={{ flex:1, height:42, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleMarkPaid} disabled={paying}
              style={{ flex:2, height:42, borderRadius:9, background:'#2D7D46', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {paying ? '處理中...' : '確認已收款'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
