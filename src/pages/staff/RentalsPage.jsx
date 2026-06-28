import { useState, useEffect } from 'react';
import { getRentals, getRentalStats, updateRentalSettings, getRentalSettings } from '../../api/rentals';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';
import RentalActionModal from '../../components/review/RentalActionModal';

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
  const [actionModal, setActionModal] = useState(null); // { type:'confirm'|'return', rental }
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

  const openSettings = async () => {
    const r = await getRentalSettings();
    setRentalSettings(r.data);
    setSettingsModal(true);
  };

  const pendingRentals = rentals.filter(r => r.status === 'pending');
  const todayPickup = rentals.filter(r => r.pickupDate === dayjs().format('YYYY-MM-DD') && r.status === 'confirmed');
  const todayReturn = rentals.filter(r => r.returnDate === dayjs().format('YYYY-MM-DD') && r.status === 'active');

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
      <div style={{ display:'flex', gap:0, background:'#FBF5F5', border:'0.5px solid #E8D5D5', borderRadius:8, padding:3, marginBottom:16, width:'fit-content' }}>
        {[
          { key:'notify', label:`通知${(pendingRentals.length+todayPickup.length+todayReturn.length)>0?` (${pendingRentals.length+todayPickup.length+todayReturn.length})`:''}` },
          { key:'stats', label:'備貨統計' },
          { key:'all', label:'全部申請' },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); if(t.key==='stats') loadStats(); }}
            style={{ height:32, padding:'0 16px', borderRadius:6, border: tab===t.key?'0.5px solid #E8D5D5':'none', background: tab===t.key?'#fff':'none', fontSize:12, fontWeight:500, color: tab===t.key?'#1a1a1a':'#999', cursor:'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div> : (<>

        {/* ── 通知 ── */}
        {tab === 'notify' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* 待確認 */}
            {pendingRentals.length > 0 && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#854F0B', marginBottom:8 }}>⏳ 待確認申請（{pendingRentals.length}）</div>
                {pendingRentals.map(r => <RentalCard key={r.id} r={r} onAction={setActionModal}/>)}
              </div>
            )}
            {/* 今日取件 */}
            {todayPickup.length > 0 && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#185FA5', marginBottom:8 }}>📦 今日取件（{todayPickup.length}）</div>
                {todayPickup.map(r => <RentalCard key={r.id} r={r} onAction={setActionModal}/>)}
              </div>
            )}
            {/* 今日歸還 */}
            {todayReturn.length > 0 && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#2D7D46', marginBottom:8 }}>✅ 今日歸還（{todayReturn.length}）</div>
                {todayReturn.map(r => <RentalCard key={r.id} r={r} onAction={setActionModal}/>)}
              </div>
            )}
            {pendingRentals.length===0 && todayPickup.length===0 && todayReturn.length===0 && (
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
            {rentals.map(r => <RentalCard key={r.id} r={r} onAction={setActionModal}/>)}
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

function RentalCard({ r, onAction }) {
  const sl = STATUS[r.status] || STATUS.pending;
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
        <Tag type={sl.type}>{sl.label}</Tag>
      </div>
      <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>
        {r.items?.map(i => `${i.name}×${i.quantity}`).join('　')}
      </div>
      <div style={{ fontSize:12, color:'#8B1A1A', marginBottom:10 }}>
        租金 NT${r.totalRentalFee}　押金 NT${r.totalDeposit}
        {r.paymentMethod==='transfer' && r.bankLastFive && ` ｜ 末五碼 ${r.bankLastFive}`}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        {r.status === 'pending' && (
          <button onClick={() => onAction({ type:'confirm', rental:r })}
            style={{ height:28, padding:'0 14px', borderRadius:6, background:'#2D7D46', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>確認取件收款</button>
        )}
        {r.status === 'active' && (
          <button onClick={() => onAction({ type:'return', rental:r })}
            style={{ height:28, padding:'0 14px', borderRadius:6, background:'#185FA5', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>確認歸還</button>
        )}
        {r.depositReturned && <span style={{ fontSize:11, color:'#2D7D46' }}>✓ 押金已退回</span>}
      </div>
    </div>
  );
}
