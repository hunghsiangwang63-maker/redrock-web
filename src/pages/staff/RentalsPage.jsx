import { useState, useEffect } from 'react';
import { getRentals, getRentalStats, updateRentalSettings, getRentalSettingsStaff, cancelRentalStaff, updateRentalStaff, saveRentalStaffNote, returnRentalDeposit } from '../../api/rentals';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';
import RentalActionModal from '../../components/review/RentalActionModal';
import SegmentedTabs from '../../components/SegmentedTabs';

const Tag = ({ type='ok', children }) => {
  const s = { ok:{bg:'#E6F4EB',color:'#2D7D46'}, red:{bg:'#FCEBEB',color:'#A32D2D'}, warn:{bg:'#FAEEDA',color:'#854F0B'}, blue:{bg:'#E6F1FB',color:'#185FA5'}, gray:{bg:'#F0EDED',color:'#666'} };
  const st = s[type]||s.ok;
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:st.bg, color:st.color }}>{children}</span>;
};

const Modal = ({ title, onClose, children }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
    <div style={{ background:'#fff', borderRadius:16, padding:24, width:600, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:600 }}>{title}</div>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const ITEM_ICONS = { crashPad:'🪨', helmet:'⛑️', harness:'🔗' };
const PayTag = ({ method }) => method === 'cash'
  ? <Tag type="warn">💵 現金</Tag>
  : method === 'transfer' ? <Tag type="blue">🏦 轉帳</Tag>
  : method ? <Tag type="gray">{method}</Tag> : null;
const STATUS = {
  pending:   { type:'warn', label:'待確認' },
  confirmed: { type:'ok',   label:'已確認' },
  active:    { type:'blue', label:'使用中' },
  returned:  { type:'gray', label:'已歸還' },
  cancelled: { type:'red',  label:'已取消' },
};
const inp = { width:'100%', height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };

export default function RentalsPage({ embedded = false }) {
  const { staff } = useAuth();
  const isAdmin = ['super_admin','gym_manager'].includes(staff?.role);
  const [tab, setTab] = useState('notify');
  const [rentals, setRentals] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState('ok');
  const [filterGym, setFilterGym] = useState('');
  const [filterFrom, setFilterFrom] = useState(dayjs().format('YYYY-MM-DD'));
  const [filterTo, setFilterTo] = useState(dayjs().add(14,'day').format('YYYY-MM-DD'));
  const [actionModal, setActionModal] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);   // 取消申請確認
  const [editTarget, setEditTarget] = useState(null);       // 修改申請 {r, form:{pickupDate,returnDate,rentalType,quantities}, settings}
  const [noteTarget, setNoteTarget] = useState(null);       // 員工備註 {r, text}
  const [depositTarget, setDepositTarget] = useState(null); // 退回押金確認
  const [rowSaving, setRowSaving] = useState(false); // { type:'confirm'|'return', rental }
  const [settingsModal, setSettingsModal] = useState(false);
  const [rentalSettings, setRentalSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const showMsg = (t, type='ok') => { setMsg(t); setMsgType(type); setTimeout(()=>setMsg(''),4000); };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rr, sr] = await Promise.allSettled([
        getRentals({ gymId: filterGym || undefined }),
        getRentalStats({ gymId: filterGym || undefined, from: filterFrom, to: filterTo }),
      ]);
      if (rr.status==='fulfilled') setRentals(rr.value.data.rentals||[]);
      if (sr.status==='fulfilled') setStats(sr.value.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, [filterGym]);

  const loadStats = async () => {
    try {
      const r = await getRentalStats({ gymId: filterGym||undefined, from: filterFrom, to: filterTo });
      setStats(r.data);
    } catch(e) {}
  };


  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      await updateRentalSettings(rentalSettings);
      showMsg('設定已儲存'); setSettingsModal(false);
    } catch(err) { showMsg('儲存失敗','red'); }
    finally { setSettingsSaving(false); }
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    setRowSaving(true);
    try { await cancelRentalStaff(cancelTarget.id); showMsg('租借申請已取消'); setCancelTarget(null); loadAll(); }
    catch (err) { showMsg(err.response?.data?.message || '取消失敗', 'red'); }
    finally { setRowSaving(false); }
  };
  const openEdit = async (r) => {
    let settings = null;
    try { settings = (await getRentalSettingsStaff()).data; } catch (e) {}
    const quantities = {};
    Object.keys(settings || {}).forEach(k => { if (settings[k]?.name) quantities[k] = 0; });
    (r.items || []).forEach(i => { quantities[i.type] = i.quantity; });
    setEditTarget({ r, settings, form: { pickupDate: r.pickupDate, returnDate: r.returnDate, rentalType: r.rentalType, quantities } });
  };
  const doEdit = async () => {
    if (!editTarget) return;
    const { form, r } = editTarget;
    const items = Object.entries(form.quantities).filter(([, q]) => q > 0).map(([type, quantity]) => ({ type, quantity }));
    if (!items.length) { showMsg('請至少保留一項器材', 'red'); return; }
    setRowSaving(true);
    try {
      const res = await updateRentalStaff(r.id, { pickupDate: form.pickupDate, returnDate: form.returnDate, rentalType: form.rentalType, items });
      showMsg(res.data?.message || '已更新'); setEditTarget(null); loadAll();
    } catch (err) { showMsg(err.response?.data?.message || '修改失敗', 'red'); }
    finally { setRowSaving(false); }
  };
  const doReturnDeposit = async () => {
    if (!depositTarget) return;
    setRowSaving(true);
    try { const res = await returnRentalDeposit(depositTarget.id); showMsg(res.data?.message || '押金已退回'); setDepositTarget(null); loadAll(); }
    catch (err) { showMsg(err.response?.data?.message || '操作失敗', 'red'); }
    finally { setRowSaving(false); }
  };
  const doSaveNote = async () => {
    if (!noteTarget) return;
    setRowSaving(true);
    try { await saveRentalStaffNote(noteTarget.r.id, noteTarget.text); showMsg('備註已儲存'); setNoteTarget(null); loadAll(); }
    catch (err) { showMsg(err.response?.data?.message || '儲存失敗', 'red'); }
    finally { setRowSaving(false); }
  };

  const openSettings = async () => {
    const r = await getRentalSettingsStaff();
    setRentalSettings(r.data);
    setSettingsModal(true);
  };

  // 通知分組：確認收款後仍保留在通知，直到 歸還＋押金退回（或歸還時已註記扣除）才移入歷史
  const pendingRentals = rentals.filter(r => r.status === 'pending');
  const confirmedRentals = rentals.filter(r => r.status === 'confirmed');
  const activeRentals = rentals.filter(r => r.status === 'active');
  const awaitDeposit = rentals.filter(r => r.status === 'returned' && !r.depositReturned && !r.depositDeductNote);
  const notifyCount = pendingRentals.length + confirmedRentals.length + activeRentals.length + awaitDeposit.length;
  const historyRentals = rentals.filter(r => r.status === 'cancelled' || (r.status === 'returned' && (r.depositReturned || r.depositDeductNote)))
    .sort((a, b) => (b.returnedAt?._seconds || b.cancelledAt?._seconds || 0) - (a.returnedAt?._seconds || a.cancelledAt?._seconds || 0));

  return (
    <div style={{ padding:24, maxWidth:900, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:20, fontWeight:700 }}>👟 器材租借管理</div>
        <div style={{ display:'flex', gap:8 }}>
          {isAdmin && <button onClick={openSettings} style={{ height:34, padding:'0 14px', borderRadius:8, background:'#FBF5F5', color:'#8B1A1A', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer' }}>⚙ 費率設定</button>}
        </div>
      </div>

      {msg && <div style={{ background:msgType==='ok'?'#E6F4EB':'#FCEBEB', borderRadius:8, padding:'8px 14px', marginBottom:14, fontSize:13, color:msgType==='ok'?'#2D7D46':'#A32D2D' }}>{msg}</div>}

      {/* 篩選 */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <select value={filterGym} onChange={e => setFilterGym(e.target.value)} style={{ height:34, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', color:'#1a1a1a', cursor:'pointer' }}>
          <option value="">全部場館</option>
          <option value="gym-hsinchu">新竹館</option>
          <option value="gym-shilin">士林館</option>
        </select>
        <button onClick={loadAll} style={{ height:34, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>重新載入</button>
      </div>

      {/* Tabs */}
      <SegmentedTabs
        tabs={[
          { key:'notify', label:`通知${notifyCount>0?` (${notifyCount})`:''}` },
          { key:'stats', label:'備貨統計' },
          { key:'all', label:'全部申請' },
          { key:'history', label:'歷史紀錄' },
        ]}
        value={tab}
        onChange={k => { setTab(k); if(k==='stats') loadStats(); }}
        style={{ marginBottom:16 }} />

      {loading ? <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div> : (<>

        {/* ── 通知 ── */}
        {tab === 'notify' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {pendingRentals.length > 0 && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#854F0B', marginBottom:8 }}>⏳ 待確認申請（{pendingRentals.length}）</div>
                {pendingRentals.map(r => <RentalCard key={r.id} r={r} onAction={setActionModal} onCancel={setCancelTarget} onEdit={openEdit} onNote={(x)=>setNoteTarget({ r:x, text:x.staffNote||'' })} onDeposit={setDepositTarget}/>)}
              </div>
            )}
            {confirmedRentals.length > 0 && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#185FA5', marginBottom:8 }}>📦 待取件（{confirmedRentals.length}）</div>
                {confirmedRentals.map(r => <RentalCard key={r.id} r={r} onAction={setActionModal} onCancel={setCancelTarget} onEdit={openEdit} onNote={(x)=>setNoteTarget({ r:x, text:x.staffNote||'' })} onDeposit={setDepositTarget}/>)}
              </div>
            )}
            {activeRentals.length > 0 && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#2D7D46', marginBottom:8 }}>🧗 使用中・待歸還（{activeRentals.length}）</div>
                {activeRentals.map(r => <RentalCard key={r.id} r={r} onAction={setActionModal} onCancel={setCancelTarget} onEdit={openEdit} onNote={(x)=>setNoteTarget({ r:x, text:x.staffNote||'' })} onDeposit={setDepositTarget}/>)}
              </div>
            )}
            {awaitDeposit.length > 0 && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#8B1A1A', marginBottom:8 }}>💰 已歸還・待退押金（{awaitDeposit.length}）</div>
                {awaitDeposit.map(r => <RentalCard key={r.id} r={r} onAction={setActionModal} onCancel={setCancelTarget} onEdit={openEdit} onNote={(x)=>setNoteTarget({ r:x, text:x.staffNote||'' })} onDeposit={setDepositTarget}/>)}
              </div>
            )}
            {notifyCount === 0 && (
              <div style={{ textAlign:'center', color:'#999', padding:40 }}>目前沒有待處理事項</div>
            )}
          </div>
        )}

        {/* ── 備貨統計 ── */}
        {tab === 'stats' && (
          <div>
            <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'flex-end' }}>
              <div>
                <div style={{ fontSize:11, color:'#666', marginBottom:4 }}>起始日</div>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ height:34, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', color:'#1a1a1a' }}/>
              </div>
              <div>
                <div style={{ fontSize:11, color:'#666', marginBottom:4 }}>結束日</div>
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ height:34, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', color:'#1a1a1a' }}/>
              </div>
              <button onClick={loadStats} style={{ height:34, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>查詢</button>
            </div>
            {stats && (<>
              <div style={{ fontSize:12, color:'#999', marginBottom:12 }}>
                {filterFrom} ～ {filterTo} 期間內共 {stats.total} 筆租借
              </div>
              {/* 器材需求總覽 */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
                {(stats.stats||[]).map(s => (
                  <div key={s.type} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, textAlign:'center' }}>
                    <div style={{ fontSize:28, marginBottom:4 }}>{ITEM_ICONS[s.type]||'📦'}</div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{s.name}</div>
                    <div style={{ fontSize:28, fontWeight:700, color:'#8B1A1A', margin:'6px 0' }}>{s.total}</div>
                    <div style={{ fontSize:11, color:'#999' }}>件最多同時出借</div>
                  </div>
                ))}
              </div>
              {/* 每項明細 */}
              {(stats.stats||[]).map(s => s.records?.length > 0 && (
                <div key={s.type} style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>{ITEM_ICONS[s.type]} {s.name} 明細</div>
                  <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'#FBF5F5' }}>
                          {['會員','數量','借出','歸還','狀態'].map(h => (
                            <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#666', borderBottom:'0.5px solid #E8D5D5' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.records.map((rec, i) => (
                          <tr key={i} style={{ borderBottom:'0.5px solid #F0E8E8' }}>
                            <td style={{ padding:'8px 12px' }}>{rec.memberName}</td>
                            <td style={{ padding:'8px 12px', fontWeight:600 }}>{rec.quantity}</td>
                            <td style={{ padding:'8px 12px', color:'#666' }}>{rec.pickupDate}</td>
                            <td style={{ padding:'8px 12px', color:'#666' }}>{rec.returnDate}</td>
                            <td style={{ padding:'8px 12px' }}><Tag type={STATUS[rec.status]?.type||'gray'}>{STATUS[rec.status]?.label||rec.status}</Tag></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>)}
          </div>
        )}

        {/* ── 全部申請 ── */}
        {tab === 'all' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {rentals.length === 0 && <div style={{ textAlign:'center', color:'#999', padding:40 }}>尚無申請記錄</div>}
            {rentals.map(r => <RentalCard key={r.id} r={r} onAction={setActionModal} onCancel={setCancelTarget} onEdit={openEdit} onNote={(x)=>setNoteTarget({ r:x, text:x.staffNote||'' })} onDeposit={setDepositTarget}/>)}
          </div>
        )}

        {/* ── 歷史紀錄（歸還＋押金處理完畢／已取消） ── */}
        {tab === 'history' && (
          <div>
            {historyRentals.length === 0 && <div style={{ textAlign:'center', color:'#999', padding:40 }}>尚無歷史紀錄</div>}
            {historyRentals.length > 0 && (
              <div style={{ background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:720 }}>
                  <thead>
                    <tr style={{ background:'#FBF5F5' }}>
                      {['會員','館別','租借期間','器材','租金','押金','付款','狀態','押金處理','經手'].map(h => (
                        <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:600, color:'#666', borderBottom:'0.5px solid #E8D5D5', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historyRentals.map(r => (
                      <tr key={r.id} style={{ borderBottom:'0.5px solid #F0E8E8' }}>
                        <td style={{ padding:'8px 10px', fontWeight:600, whiteSpace:'nowrap' }}>{r.memberName}</td>
                        <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>{r.gymId==='gym-hsinchu'?'新竹':'士林'}</td>
                        <td style={{ padding:'8px 10px', whiteSpace:'nowrap', color:'#666' }}>{r.pickupDate} ～ {r.returnDate}</td>
                        <td style={{ padding:'8px 10px' }}>{r.items?.map(i=>`${i.name}×${i.quantity}`).join('、')}</td>
                        <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>NT${r.totalRentalFee}</td>
                        <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>NT${r.totalDeposit}</td>
                        <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>{r.paymentMethod==='cash'?'現金':r.paymentMethod==='transfer'?'轉帳':r.paymentMethod||'—'}</td>
                        <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}><Tag type={STATUS[r.status]?.type||'gray'}>{STATUS[r.status]?.label||r.status}</Tag></td>
                        <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>
                          {r.status==='cancelled' ? '—'
                            : r.depositReturned ? <span style={{ color:'#2D7D46' }}>✓ 已退回</span>
                            : <span style={{ color:'#A32D2D' }} title={r.depositDeductNote}>扣除{r.depositDeductNote?`：${r.depositDeductNote}`:''}</span>}
                        </td>
                        <td style={{ padding:'8px 10px', whiteSpace:'nowrap', color:'#666' }}>{r.depositReturnedBy || r.returnedByName || r.cancelledBy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </>)}

      {/* 確認取件/歸還 Modal（共用元件） */}
      {actionModal && (
        <RentalActionModal
          action={actionModal.type}
          rental={actionModal.rental}
          onClose={() => setActionModal(null)}
          onDone={(m)=>{ setActionModal(null); showMsg(m); loadAll(); }}
        />
      )}

      {/* 取消申請確認 */}
      {cancelTarget && (
        <Modal title="取消租借申請" onClose={() => setCancelTarget(null)}>
          <div style={{ fontSize:13, color:'#444', lineHeight:1.7, marginBottom:16 }}>
            確定取消 <strong>{cancelTarget.memberName}</strong> 的租借申請（{cancelTarget.pickupDate} ～ {cancelTarget.returnDate}）？<br/>
            取消後連動的待收款轉帳單將一併作廢。
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setCancelTarget(null)} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>返回</button>
            <button onClick={doCancel} disabled={rowSaving}
              style={{ flex:1, height:40, borderRadius:9, background:'#C0392B', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer' }}>{rowSaving?'處理中...':'確定取消'}</button>
          </div>
        </Modal>
      )}

      {/* 修改申請 */}
      {editTarget && (
        <Modal title={`修改租借申請 — ${editTarget.r.memberName}`} onClose={() => setEditTarget(null)}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
            <div>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>借出日期</label>
              <input type="date" value={editTarget.form.pickupDate}
                onChange={e => setEditTarget(t => ({ ...t, form:{ ...t.form, pickupDate:e.target.value } }))} style={inp}/>
            </div>
            <div>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>歸還日期</label>
              <input type="date" value={editTarget.form.returnDate}
                onChange={e => setEditTarget(t => ({ ...t, form:{ ...t.form, returnDate:e.target.value } }))} style={inp}/>
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>方案</label>
            <select value={editTarget.form.rentalType}
              onChange={e => setEditTarget(t => ({ ...t, form:{ ...t.form, rentalType:e.target.value } }))} style={inp}>
              <option value="weekend">週末方案</option>
              <option value="sevenDay">七天方案</option>
            </select>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:6 }}>器材數量</label>
            {Object.entries(editTarget.form.quantities).map(([type, q]) => {
              const cfg = editTarget.settings?.[type] || {};
              return (
                <div key={type} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:13 }}>{ITEM_ICONS[type]||'📦'} {cfg.name || type}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <button onClick={() => setEditTarget(t => ({ ...t, form:{ ...t.form, quantities:{ ...t.form.quantities, [type]: Math.max(0, q-1) } } }))}
                      style={{ width:28, height:28, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', cursor:'pointer' }}>−</button>
                    <span style={{ width:20, textAlign:'center', fontWeight:600 }}>{q}</span>
                    <button onClick={() => setEditTarget(t => ({ ...t, form:{ ...t.form, quantities:{ ...t.form.quantities, [type]: q+1 } } }))}
                      style={{ width:28, height:28, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', cursor:'pointer' }}>＋</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize:11, color:'#999', marginBottom:12 }}>儲存後租金/押金由系統依費率重新計算。</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setEditTarget(null)} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>返回</button>
            <button onClick={doEdit} disabled={rowSaving}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer' }}>{rowSaving?'儲存中...':'儲存修改'}</button>
          </div>
        </Modal>
      )}

      {/* 員工備註（會員看不到） */}
      {noteTarget && (
        <Modal title={`員工備註 — ${noteTarget.r.memberName}`} onClose={() => setNoteTarget(null)}>
          <div style={{ fontSize:12, color:'#854F0B', marginBottom:8 }}>此備註僅員工端可見，會員看不到。</div>
          <textarea value={noteTarget.text} onChange={e => setNoteTarget(t => ({ ...t, text:e.target.value }))}
            rows={4} placeholder="如：押金已收現金、器材狀況、特殊約定…"
            style={{ ...inp, height:'auto', padding:'10px 12px', resize:'vertical', fontFamily:'inherit' }}/>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={() => setNoteTarget(null)} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>返回</button>
            <button onClick={doSaveNote} disabled={rowSaving}
              style={{ flex:2, height:40, borderRadius:9, background:'#854F0B', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer' }}>{rowSaving?'儲存中...':'儲存備註'}</button>
          </div>
        </Modal>
      )}

      {/* 退回押金確認 */}
      {depositTarget && (
        <Modal title="退回押金" onClose={() => setDepositTarget(null)}>
          <div style={{ fontSize:13, color:'#444', lineHeight:1.7, marginBottom:16 }}>
            確認退回 <strong>{depositTarget.memberName}</strong> 的押金 <strong style={{ color:'#8B1A1A' }}>NT${depositTarget.totalDeposit}</strong>？<br/>
            退回後此筆租借結案、移入歷史紀錄。
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setDepositTarget(null)} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>返回</button>
            <button onClick={doReturnDeposit} disabled={rowSaving}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer' }}>{rowSaving?'處理中...':'確認退回押金'}</button>
          </div>
        </Modal>
      )}

      {/* 費率設定 Modal */}
      {settingsModal && rentalSettings && (
        <Modal title="器材費率設定" onClose={() => setSettingsModal(false)}>
          {Object.entries(rentalSettings).filter(([k]) => k !== 'updatedAt').map(([type, cfg]) => (
            cfg && typeof cfg === 'object' && cfg.name ? (
              <div key={type} style={{ background:'#FBF5F5', borderRadius:10, padding:14, marginBottom:12 }}>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>{ITEM_ICONS[type]} {cfg.name}</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {[
                    { label:'週末租金/件', key:'weekendFee' },
                    { label:'七天租金/件', key:'sevenDayFee' },
                    { label:'押金/件', key:'deposit' },
                  ].map(({label, key}) => (
                    <div key={key}>
                      <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>{label} (NT$)</label>
                      <input type="number" style={inp} value={cfg[key]||0}
                        onChange={e => setRentalSettings(s => ({ ...s, [type]: { ...s[type], [key]: Number(e.target.value) } }))}/>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:8 }}>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>說明</label>
                  <input style={inp} value={cfg.description||''} onChange={e => setRentalSettings(s => ({ ...s, [type]: { ...s[type], description: e.target.value } }))}/>
                </div>
                <div style={{ marginTop:8 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12 }}>
                    <input type="checkbox" checked={cfg.active !== false} onChange={e => setRentalSettings(s => ({ ...s, [type]: { ...s[type], active: e.target.checked } }))}/>
                    開放租借
                  </label>
                </div>
              </div>
            ) : null
          ))}
          <button onClick={handleSaveSettings} disabled={settingsSaving} style={{ width:'100%', height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', marginTop:8 }}>
            {settingsSaving ? '儲存中...' : '儲存費率設定'}
          </button>
        </Modal>
      )}
    </div>
  );
}

function RentalCard({ r, onAction, onCancel, onEdit, onNote, onDeposit }) {
  const sl = STATUS[r.status] || STATUS.pending;
  const editable = ['pending', 'confirmed'].includes(r.status);
  return (
    <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
        <div>
          <div style={{ fontWeight:600, fontSize:14 }}>{r.memberName}</div>
          <div style={{ fontSize:12, color:'#666', marginTop:2 }}>
            {r.gymId==='gym-hsinchu'?'新竹館':'士林館'} ·
            {r.rentalType==='weekend'?' 週末方案':' 七天方案'}
          </div>
          <div style={{ fontSize:12, color:'#999', marginTop:2 }}>
            {r.pickupDate} ～ {r.returnDate}
          </div>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <PayTag method={r.paymentMethod}/>
          <Tag type={sl.type}>{sl.label}</Tag>
        </div>
      </div>
      <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>
        {r.items?.map(i => `${i.name}×${i.quantity}`).join('　')}
      </div>
      <div style={{ fontSize:12, color:'#8B1A1A', marginBottom:10 }}>
        租金 NT${r.totalRentalFee}　押金 NT${r.totalDeposit}
        {r.paymentMethod==='transfer' && r.bankLastFive && ` ｜ 末五碼 ${r.bankLastFive}`}
      </div>
      {r.staffNote && (
        <div style={{ fontSize:12, color:'#854F0B', background:'#FAEEDA', borderRadius:8, padding:'6px 10px', marginBottom:10, textAlign:'left' }}>
          📝 {r.staffNote}<span style={{ color:'#B08A4F', marginLeft:6 }}>（員工備註，會員看不到）</span>
        </div>
      )}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {r.status === 'pending' && (
          <button onClick={() => onAction({ type:'confirm', rental:r })}
            style={{ height:28, padding:'0 14px', borderRadius:6, background:'#2D7D46', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>確認取件收款</button>
        )}
        {r.status === 'active' && (
          <button onClick={() => onAction({ type:'return', rental:r })}
            style={{ height:28, padding:'0 14px', borderRadius:6, background:'#185FA5', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>確認歸還</button>
        )}
        {r.status === 'returned' && !r.depositReturned && !r.depositDeductNote && onDeposit && (
          <button onClick={() => onDeposit(r)}
            style={{ height:28, padding:'0 14px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>💰 退回押金 NT${r.totalDeposit}</button>
        )}
        {editable && (
          <button onClick={() => onEdit(r)}
            style={{ height:28, padding:'0 12px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#444', fontSize:12, cursor:'pointer' }}>修改</button>
        )}
        {editable && (
          <button onClick={() => onCancel(r)}
            style={{ height:28, padding:'0 12px', borderRadius:6, background:'#fff', border:'0.5px solid #C0392B', color:'#C0392B', fontSize:12, cursor:'pointer' }}>取消申請</button>
        )}
        {r.status !== 'cancelled' && (
          <button onClick={() => onNote(r)}
            style={{ height:28, padding:'0 12px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#854F0B', fontSize:12, cursor:'pointer' }}>📝 備註</button>
        )}
        {r.depositReturned && <span style={{ fontSize:11, color:'#2D7D46' }}>✓ 押金已退回</span>}
      </div>
    </div>
  );
}
