import { useState, useEffect } from 'react';
import client from '../../api/client';
import { useAuth } from '../../store/authStore.jsx';
import { getGyms } from '../../api/gyms';
import dayjs from 'dayjs';
import SegmentedTabs from '../../components/SegmentedTabs';

const DENOMINATIONS = [
  { key:'d1000', label:'NT$1,000', value:1000 },
  { key:'d500',  label:'NT$500',  value:500  },
  { key:'d100',  label:'NT$100',  value:100  },
  { key:'d50',   label:'NT$50',   value:50   },
  { key:'d10',   label:'NT$10',   value:10   },
  { key:'d5',    label:'NT$5',    value:5    },
  { key:'d1',    label:'NT$1',    value:1    },
];

const DEDUCTION_TYPES = ['教練費','定線費','現金領取','現金補入','其他退款','其他'];

export default function DailySettlementPage() {
  const { staff, activeGymId, operator, isStationMode, viewGym } = useAuth();
  const isSuperAdmin = (operator?.role || staff?.role) === 'super_admin';
  const [gyms, setGyms] = useState([]);
  // 場館由頂部全域選擇器控制；結帳必須是具體某館，「全館」(viewGym='') 不載入、提示先選館
  const gymId = activeGymId || staff?.gymId || (isSuperAdmin ? viewGym : '');
  const isOperatorMode = isStationMode && !!operator;
  const isAdmin = ['super_admin', 'gym_manager'].includes(operator?.role || staff?.role);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settlement, setSettlement] = useState(null);
  const [alreadySettled, setAlreadySettled] = useState(false);
  const [denominations, setDenominations] = useState({ d1:0, d5:0, d10:0, d50:0, d100:0, d500:0, d1000:0 });
  const [deductions, setDeductions] = useState([]);
  const [invoiceLastNumber, setInvoiceLastNumber] = useState('');
  const [invoiceStartNumber, setInvoiceStartNumber] = useState('');
  const [voidList, setVoidList] = useState([]);   // 作廢發票號碼（逐張標籤）
  const [voidInput, setVoidInput] = useState('');
  const addVoid = () => {
    const parts = voidInput.split(/[,、\s]+/).map(x => x.trim()).filter(Boolean);
    if (!parts.length) return;
    setVoidList(prev => [...prev, ...parts.filter(p => !prev.includes(p))]);
    setVoidInput('');
  };
  const removeVoid = (n) => setVoidList(prev => prev.filter(x => x !== n));
  const [cardOrangeFirst, setCardOrangeFirst] = useState('');
  const [cardFullFirst, setCardFullFirst] = useState('');
  // 系統轉換期：手動輸入並列 + 卡號顯示開關
  const [transition, setTransition] = useState({ settlementManualInput: false, settlementShowCardNumbers: true });
  const [incomeManual, setIncomeManual] = useState({});
  const [paymentManual, setPaymentManual] = useState({});
  const [exportMonth, setExportMonth] = useState(dayjs().format('YYYY-MM'));
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState('today');

  useEffect(() => {
    if (isOperatorMode) { loadToday(); loadHistory(); return; }
    if (isSuperAdmin) {
      getGyms().then(res => setGyms(res.data.gyms || [])).catch(() => {});
    }
    setLoading(false);
  }, []);

  // 系統管理員於頂部選定具體館別後載入該館今日結算（「全館」不載入）
  useEffect(() => {
    if (!isOperatorMode && isSuperAdmin && gymId) { loadToday(); loadHistory(); }
  }, [gymId]);

  // 系統轉換期設定（手動輸入並列 / 卡號顯示）
  useEffect(() => { client.get('/settings/transition').then(r => setTransition(r.data)).catch(() => {}); }, []);

  const loadToday = async () => {
    setLoading(true);
    try {
      const res = await client.get('/daily-settlements/today', { params: { gymId } });
      setSettlement(res.data.settlement);
      setAlreadySettled(res.data.alreadySettled);
      if (res.data.settlement?.denominations) setDenominations(res.data.settlement.denominations);
      if (res.data.settlement?.invoiceLastNumber) setInvoiceLastNumber(res.data.settlement.invoiceLastNumber);
      // 發票起始號＝前一天最後一張+1（帶入，可改）
      if (res.data.settlement?.suggestedInvoiceStart) setInvoiceStartNumber(prev => prev || res.data.settlement.suggestedInvoiceStart);
    } catch (e) { showMsg('載入失敗', 'err'); }
    finally { setLoading(false); }
  };

  const loadHistory = async () => {
    try {
      const res = await client.get('/daily-settlements', { params: { gymId, days: 30 } });
      setHistory(res.data.settlements || []);
    } catch (e) {}
  };

  const showMsg = (text, type='ok') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 4000);
  };

  // 計算實際現金
  const actualCash = DENOMINATIONS.reduce((sum, d) => sum + (denominations[d.key]||0) * d.value, 0);
  // 加減項：sign '+' ＝加入抽屜（預期上升）、'-' ＝取出（預期下降）；舊資料無 sign 視為 '-'（減）
  const netAdjust = deductions.reduce((sum, d) => sum + ((d.sign === '+' ? 1 : -1) * (Number(d.amount)||0)), 0);
  const expectedCash = (settlement?.prevCashBalance || 0) + (settlement?.payment?.cash || 0) + netAdjust;
  const difference = actualCash - expectedCash;

  const addDeduction = () => setDeductions(prev => [...prev, { sign: '-', type: DEDUCTION_TYPES[0], amount: '', note: '' }]);
  const removeDeduction = (i) => setDeductions(prev => prev.filter((_, idx) => idx !== i));

  const handleSettle = async () => {
    if (!invoiceLastNumber) { showMsg('請輸入最後一張發票號碼', 'err'); return; }
    setSaving(true);
    try {
      await client.post('/daily-settlements', {
        gymId, income: settlement?.income, payment: settlement?.payment,
        deductions, denominations, invoiceLastNumber, notes,
        invoiceStartNumber, cardOrangeFirst, cardFullFirst,
        invoiceVoidNumbers: [...voidList, voidInput.trim()].filter(Boolean).join(', '),
        checkinCount: settlement?.checkinCount ?? null,
        ...(transition.settlementManualInput ? { incomeManual, paymentManual } : {}),
      });
      showMsg(Math.abs(difference) > 200 ? `結帳完成，差異 NT$${difference} 已通知管理員` : '結帳完成！');
      await loadToday();
      await loadHistory();
    } catch (e) { showMsg(e.response?.data?.message || '結帳失敗', 'err'); }
    finally { setSaving(false); }
  };

  const downloadMonthly = async () => {
    try {
      const API = import.meta.env.VITE_API_BASE || 'https://redrock-api-production.up.railway.app';
      const tok = localStorage.getItem('operatorToken') || localStorage.getItem('token') || localStorage.getItem('stationToken') || '';
      const r = await fetch(`${API}/daily-settlements/monthly-export?month=${exportMonth}&gymId=${gymId}`, { headers: { Authorization: `Bearer ${tok}` } });
      if (!r.ok) throw new Error(`${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `月銷售紀錄_${exportMonth}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { showMsg('下載失敗 ' + e.message, 'err'); }
  };

  const s = {
    card: { background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', marginBottom:14, overflow:'hidden' },
    cardHead: { padding:'12px 16px', borderBottom:'0.5px solid #F5EFEF', fontWeight:600, fontSize:14, color:'#1a1a1a' },
    row: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 16px', borderBottom:'0.5px solid #F5EFEF' },
    label: { fontSize:13, color:'#666' },
    value: { fontSize:13, fontWeight:500, color:'#1a1a1a' },
    input: { height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' },
  };

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'#999' }}>載入中...</div>;

  if (!isOperatorMode && !isSuperAdmin) {
    return (
      <div style={{ padding:16, background:'#F7F3F3', minHeight:'100vh' }}>
        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:32, textAlign:'center', maxWidth:480, margin:'40px auto' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🖥️</div>
          <div style={{ fontWeight:600, fontSize:16, marginBottom:10 }}>結帳功能僅限館別電腦</div>
          <div style={{ fontSize:13, color:'#888', lineHeight:1.7 }}>
            單日結帳必須在館別電腦帳號登入、並由值班人員打卡上班後才能使用。<br />
            個人帳號登入無法進行結帳，請於館別電腦操作。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding:16, background:'#F7F3F3', minHeight:'100vh' }}>
      {msg && (
        <div style={{ background: msgType==='ok'?'#E6F4EB':'#FCEBEB', border:`0.5px solid ${msgType==='ok'?'#B3DEC0':'#F09595'}`, borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color: msgType==='ok'?'#2D7D46':'#A32D2D' }}>{msg}</div>
      )}

      {/* 系統管理員非站台：依頂部場館選擇遠端結算（結帳須為具體某館） */}
      {!isOperatorMode && isSuperAdmin && (
        <div style={{ background:'#FFF8E6', border:'0.5px solid #F0D98C', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <span style={{ color:'#854F0B', fontWeight:600 }}>🖥️ 系統管理員遠端結算</span>
          {gymId ? (
            <>
              <span style={{ color:'#854F0B' }}>操作館別：<b style={{ color:'#8B1A1A' }}>{gyms.find(g => g.id === gymId)?.name || (gymId==='gym-hsinchu'?'新竹館':gymId==='gym-shilin'?'士林館':gymId)}</b></span>
              <span style={{ fontSize:11, color:'#A98B3B' }}>依上方場館選擇，不需在本館電腦登入即可結算</span>
            </>
          ) : (
            <span style={{ color:'#A32D2D' }}>⚠ 目前為「🏛 全館」，結帳需針對單一場館，請於上方切換到具體場館。</span>
          )}
        </div>
      )}

      {/* Tab（歷史紀錄僅管理員可見）*/}
      <SegmentedTabs
        tabs={[{ key:'today', label:'今日結帳' }, ...(isAdmin ? [{ key:'history', label:'歷史紀錄' }] : [])]}
        value={tab} onChange={setTab} style={{ marginBottom:16 }} />

      {tab === 'history' && isAdmin ? (
        <div>
          {/* 月銷售紀錄下載 */}
          <div style={{ ...s.card, padding:'12px 16px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <span style={{ fontSize:13, fontWeight:600 }}>📥 月銷售紀錄</span>
            <input type="month" value={exportMonth} onChange={e => setExportMonth(e.target.value)}
              style={{ height:34, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5' }} />
            <button onClick={downloadMonthly}
              style={{ height:34, padding:'0 16px', borderRadius:8, background:'#2D7D46', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>下載 Excel</button>
            <span style={{ fontSize:11, color:'#999' }}>整月每日一欄，自動帶入結帳資料</span>
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}>尚無結帳紀錄</div>
          ) : history.map(h => (
            <div key={h.id} style={s.card}>
              <div style={{ padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14 }}>{h.date}</div>
                  <div style={{ fontSize:12, color:'#999', marginTop:2 }}>{h.staffName}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:600, color:'#8B1A1A' }}>NT${(h.income?.total || 0).toLocaleString()}</div>
                  <div style={{ fontSize:11, color: Math.abs(h.difference||0) > 200 ? '#A32D2D' : '#2D7D46', marginTop:2 }}>
                    差異 NT${h.difference || 0}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : alreadySettled ? (
        <div>
          <div style={{ background:'#E6F4EB', borderRadius:12, padding:16, marginBottom:14, textAlign:'center' }}>
            <div style={{ fontSize:20, marginBottom:4 }}>✅</div>
            <div style={{ fontWeight:600, fontSize:14, color:'#2D7D46' }}>今日已完成結帳</div>
            <div style={{ fontSize:12, color:'#666', marginTop:4 }}>{settlement?.date} · {settlement?.staffName}</div>
          </div>
          {/* 顯示結帳摘要 */}
          <div style={s.card}>
            <div style={s.cardHead}>結帳摘要</div>
            <div style={s.row}><span style={s.label}>總收入</span><span style={{ ...s.value, color:'#8B1A1A', fontWeight:600 }}>NT${(settlement?.income?.total||0).toLocaleString()}</span></div>
            <div style={s.row}><span style={s.label}>實際現金</span><span style={s.value}>NT${(settlement?.actualCashBalance||0).toLocaleString()}</span></div>
            <div style={s.row}><span style={s.label}>差異</span><span style={{ ...s.value, color: Math.abs(settlement?.difference||0) > 200 ? '#A32D2D' : '#2D7D46' }}>NT${settlement?.difference || 0}</span></div>
            <div style={s.row}><span style={s.label}>發票末號</span><span style={s.value}>{settlement?.invoiceLastNumber || '—'}</span></div>
          </div>
        </div>
      ) : (
        <>
          {/* 日期 + 館別 */}
          <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>
            📅 {dayjs().format('YYYY/MM/DD')} · {gymId === 'gym-hsinchu' ? '新竹館' : '士林館'}
          </div>

          {/* 五大類收入 */}
          <div style={s.card}>
            <div style={s.cardHead}>今日收入{transition.settlementManualInput ? '（左：手動輸入　右：系統值）' : '（系統自動帶入）'}</div>
            {[
              { key:'entry', label:'入場收入', value: settlement?.income?.entry || 0, sub: settlement?.income?.entryItems },
              { key:'shoeRental', label:'岩鞋租借', value: settlement?.income?.shoeRental || 0 },
              { key:'product', label:'商品銷售', value: settlement?.income?.product || 0 },
              { key:'course', label:'課程收入', value: settlement?.income?.course || 0 },
              { key:'pass', label:'定期票', value: settlement?.income?.pass || 0, sub: settlement?.income?.passItems },
            ].map((item, i) => (
              <div key={i}>
                <div style={s.row}>
                  <span style={s.label}>{item.label}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {transition.settlementManualInput && (
                      <input type="number" value={incomeManual[item.key] ?? ''} placeholder="手動"
                        onChange={e => setIncomeManual(p => ({ ...p, [item.key]: e.target.value }))}
                        style={{ width:88, height:30, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:13, background:'#FFFDF5', textAlign:'right', boxSizing:'border-box' }} />
                    )}
                    <span style={{ ...s.value, color: transition.settlementManualInput ? '#999' : '#1a1a1a', minWidth:72, textAlign:'right' }}>NT${item.value.toLocaleString()}</span>
                  </div>
                </div>
                {Array.isArray(item.sub) && item.sub.length > 0 && item.sub.map((x, j) => (
                  <div key={j} style={{ ...s.row, padding:'4px 0 4px 22px' }}>
                    <span style={{ ...s.label, fontSize:12, color:'#999' }}>· {x.label}</span>
                    <span style={{ ...s.value, fontSize:12, color:'#999' }}>NT${(x.value||0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ ...s.row, background:'#FBF5F5' }}>
              <span style={{ ...s.label, fontWeight:600, color:'#1a1a1a' }}>總計</span>
              <span style={{ fontSize:16, fontWeight:700, color:'#8B1A1A' }}>NT${(settlement?.income?.total||0).toLocaleString()}</span>
            </div>
          </div>

          {/* 付款方式 */}
          <div style={s.card}>
            <div style={s.cardHead}>付款方式統計{transition.settlementManualInput ? '（左：手動輸入　右：系統值）' : ''}</div>
            {[
              { key:'cash', label:'現金', value: settlement?.payment?.cash || 0 },
              { key:'linePay', label:'Line Pay', value: settlement?.payment?.linePay || 0 },
              { key:'jko', label:'街口支付', value: settlement?.payment?.jko || 0 },
              { key:'taiwanPay', label:'台灣Pay', value: settlement?.payment?.taiwanPay || 0 },
            ].map((item, i) => (
              <div key={i} style={s.row}>
                <span style={s.label}>{item.label}</span>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {transition.settlementManualInput && (
                    <input type="number" value={paymentManual[item.key] ?? ''} placeholder="手動"
                      onChange={e => setPaymentManual(p => ({ ...p, [item.key]: e.target.value }))}
                      style={{ width:88, height:30, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:13, background:'#FFFDF5', textAlign:'right', boxSizing:'border-box' }} />
                  )}
                  <span style={{ ...s.value, color: transition.settlementManualInput ? '#999' : '#1a1a1a', minWidth:72, textAlign:'right' }}>NT${item.value.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 前日餘額 */}
          <div style={s.card}>
            <div style={s.cardHead}>收銀機餘額</div>
            <div style={s.row}><span style={s.label}>前日餘額</span><span style={s.value}>NT${(settlement?.prevCashBalance||0).toLocaleString()}</span></div>
            <div style={s.row}><span style={s.label}>今日現金收入</span><span style={s.value}>NT${(settlement?.payment?.cash||0).toLocaleString()}</span></div>
            <div style={{ ...s.row, background:'#FBF5F5' }}>
              <span style={{ ...s.label, fontWeight:500 }}>應有餘額</span>
              <span style={{ fontSize:15, fontWeight:600, color:'#185FA5' }}>NT${expectedCash.toLocaleString()}</span>
            </div>
          </div>

          {/* 加減項（可加可減）*/}
          <div style={s.card}>
            <div style={{ ...s.cardHead, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>加減項</span>
              <button onClick={addDeduction}
                style={{ height:28, padding:'0 12px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>＋ 新增加減項</button>
            </div>
            {deductions.length === 0 ? (
              <div style={{ padding:'12px 16px', fontSize:13, color:'#ccc' }}>尚無加減項</div>
            ) : deductions.map((d, i) => (
              <div key={i} style={{ padding:'10px 16px', borderBottom:'0.5px solid #F5EFEF' }}>
                <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                  <select value={d.sign || '-'} onChange={e => setDeductions(prev => prev.map((x,idx) => idx===i ? {...x, sign: e.target.value} : x))}
                    style={{ ...s.input, width:72, color: (d.sign==='+') ? '#2D7D46' : '#A32D2D', fontWeight:600 }}>
                    <option value="-">－減</option>
                    <option value="+">＋加</option>
                  </select>
                  <select value={d.type} onChange={e => setDeductions(prev => prev.map((x,idx) => idx===i ? {...x, type: e.target.value} : x))}
                    style={{ ...s.input, flex:1 }}>
                    {DEDUCTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="number" value={d.amount} placeholder="金額"
                    onChange={e => setDeductions(prev => prev.map((x,idx) => idx===i ? {...x, amount: e.target.value} : x))}
                    style={{ ...s.input, width:100 }} />
                  <button onClick={() => removeDeduction(i)}
                    style={{ height:36, width:36, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', color:'#A32D2D', cursor:'pointer', fontSize:16 }}>✕</button>
                </div>
                <input value={d.note} placeholder="備註（選填）"
                  onChange={e => setDeductions(prev => prev.map((x,idx) => idx===i ? {...x, note: e.target.value} : x))}
                  style={{ ...s.input, width:'100%' }} />
              </div>
            ))}
            {deductions.length > 0 && (
              <div style={{ ...s.row, background:'#FBF5F5' }}>
                <span style={s.label}>加減項合計</span>
                <span style={{ ...s.value, color: netAdjust >= 0 ? '#2D7D46' : '#A32D2D' }}>{netAdjust >= 0 ? '+' : '-'}NT${Math.abs(netAdjust).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* 點鈔 */}
          <div style={s.card}>
            <div style={s.cardHead}>點鈔結果</div>
            {DENOMINATIONS.map(d => (
              <div key={d.key} style={s.row}>
                <span style={s.label}>{d.label}</span>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="number" min="0" value={denominations[d.key] || ''} placeholder="0"
                    onChange={e => setDenominations(prev => ({...prev, [d.key]: Number(e.target.value)||0}))}
                    style={{ ...s.input, width:80, textAlign:'right' }} />
                  <span style={{ fontSize:12, color:'#999', width:60, textAlign:'right' }}>= NT${((denominations[d.key]||0)*d.value).toLocaleString()}</span>
                </div>
              </div>
            ))}
            <div style={{ ...s.row, background:'#FBF5F5' }}>
              <span style={{ ...s.label, fontWeight:500 }}>實際現金合計</span>
              <span style={{ fontSize:16, fontWeight:700, color:'#185FA5' }}>NT${actualCash.toLocaleString()}</span>
            </div>
            <div style={{ ...s.row, background: Math.abs(difference) > 200 ? '#FCEBEB' : '#E6F4EB' }}>
              <span style={{ ...s.label, fontWeight:500 }}>差異</span>
              <span style={{ fontSize:16, fontWeight:700, color: Math.abs(difference) > 200 ? '#A32D2D' : '#2D7D46' }}>
                {difference >= 0 ? '+' : ''}NT${difference.toLocaleString()}
                {Math.abs(difference) > 200 && ' ⚠ 差異過大'}
              </span>
            </div>
          </div>

          {/* 發票號碼 */}
          <div style={s.card}>
            <div style={s.cardHead}>發票管理</div>
            <div style={s.row}>
              <span style={s.label}>發票起始號碼</span>
              <input value={invoiceStartNumber} onChange={e => setInvoiceStartNumber(e.target.value)}
                placeholder="例：35371459" style={{ ...s.input, width:160 }} />
            </div>
            <div style={s.row}>
              <span style={s.label}>最後一張發票號碼</span>
              <input value={invoiceLastNumber} onChange={e => setInvoiceLastNumber(e.target.value)}
                placeholder="例：35371479" style={{ ...s.input, width:160 }} />
            </div>
            <div style={{ ...s.row, alignItems:'flex-start' }}>
              <span style={{ ...s.label, marginTop:8 }}>作廢發票號碼</span>
              <div style={{ display:'flex', flexDirection:'column', gap:6, flex:1, maxWidth:340 }}>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={voidInput} onChange={e => setVoidInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVoid(); } }}
                    placeholder="輸入一張號碼後按 Enter / 加入（無則留空）" style={{ ...s.input, flex:1 }} />
                  <button type="button" onClick={addVoid}
                    style={{ height:36, padding:'0 14px', borderRadius:8, border:'0.5px solid #8B1A1A', background:'#fff', color:'#8B1A1A', fontSize:13, cursor:'pointer', whiteSpace:'nowrap' }}>加入</button>
                </div>
                {voidList.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {voidList.map(n => (
                      <span key={n} style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#FBEEEE', border:'0.5px solid #E8C5C5', color:'#A32D2D', borderRadius:14, padding:'3px 6px 3px 10px', fontSize:12, fontFamily:'monospace' }}>
                        {n}
                        <button type="button" onClick={() => removeVoid(n)}
                          style={{ border:'none', background:'#A32D2D', color:'#fff', borderRadius:'50%', width:16, height:16, lineHeight:'14px', fontSize:11, cursor:'pointer', padding:0 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding:'6px 16px 10px', fontSize:11, color:'#999' }}>作廢多張可逐一加入（也可一次貼多組、以逗號分隔）；起訖／作廢號碼會帶入月銷售紀錄</div>
          </div>

          {/* 票卡資訊 + check-in（月銷售紀錄用） */}
          <div style={s.card}>
            <div style={s.cardHead}>票卡資訊 / 人數</div>
            <div style={s.row}>
              <span style={s.label}>今日 check-in 人數</span>
              <span style={s.value}>{settlement?.checkinCount ?? '—'} 人（自動）</span>
            </div>
            {transition.settlementShowCardNumbers && (
              <>
                <div style={s.row}>
                  <span style={s.label}>優惠卡最前號碼</span>
                  <input value={cardOrangeFirst} onChange={e => setCardOrangeFirst(e.target.value)}
                    placeholder="例：1726" style={{ ...s.input, width:160 }} />
                </div>
                <div style={s.row}>
                  <span style={s.label}>全票最前號碼</span>
                  <input value={cardFullFirst} onChange={e => setCardFullFirst(e.target.value)}
                    placeholder="例：9582" style={{ ...s.input, width:160 }} />
                </div>
              </>
            )}
          </div>

          {/* 備註 */}
          <div style={s.card}>
            <div style={s.cardHead}>結帳備註（選填）</div>
            <div style={{ padding:12 }}>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="例：發現收銀機按鍵異常、補充硬幣..."
                rows={3}
                style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', fontSize:13, background:'#FBF5F5', outline:'none', resize:'none', boxSizing:'border-box', color:'#1a1a1a' }} />
            </div>
          </div>

          {/* 確認結帳 */}
          <button onClick={handleSettle} disabled={saving}
            style={{ width:'100%', height:52, borderRadius:14, background: saving?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:16, fontWeight:600, cursor: saving?'not-allowed':'pointer', marginBottom:20 }}>
            {saving ? '結帳中...' : '✓ 確認完成結帳'}
          </button>
        </>
      )}
    </div>
  );
}
