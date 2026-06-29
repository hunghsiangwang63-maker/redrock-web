import { useState, useEffect } from 'react';
import client from '../../api/client';
import { useAuth } from '../../store/authStore.jsx';
import dayjs from 'dayjs';

const DENOMINATIONS = [
  { key:'d1000', label:'NT$1,000', value:1000 },
  { key:'d500',  label:'NT$500',  value:500  },
  { key:'d100',  label:'NT$100',  value:100  },
  { key:'d50',   label:'NT$50',   value:50   },
  { key:'d10',   label:'NT$10',   value:10   },
  { key:'d5',    label:'NT$5',    value:5    },
  { key:'d1',    label:'NT$1',    value:1    },
];

const DEDUCTION_TYPES = ['教練費','定線費','現金領取','其他退款'];

export default function DailySettlementPage() {
  const { staff, activeGymId, operator, isStationMode } = useAuth();
  const gymId = activeGymId || staff?.gymId;
  const isOperatorMode = isStationMode && !!operator;
  const isAdmin = ['super_admin', 'gym_manager'].includes(operator?.role || staff?.role);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settlement, setSettlement] = useState(null);
  const [alreadySettled, setAlreadySettled] = useState(false);
  const [denominations, setDenominations] = useState({ d1:0, d5:0, d10:0, d50:0, d100:0, d500:0, d1000:0 });
  const [deductions, setDeductions] = useState([]);
  const [invoiceLastNumber, setInvoiceLastNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState('today');

  useEffect(() => { if (isOperatorMode) { loadToday(); loadHistory(); } else { setLoading(false); } }, []);

  const loadToday = async () => {
    setLoading(true);
    try {
      const res = await client.get('/daily-settlements/today', { params: { gymId } });
      setSettlement(res.data.settlement);
      setAlreadySettled(res.data.alreadySettled);
      if (res.data.settlement?.denominations) setDenominations(res.data.settlement.denominations);
      if (res.data.settlement?.invoiceLastNumber) setInvoiceLastNumber(res.data.settlement.invoiceLastNumber);
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
  const totalDeductions = deductions.reduce((sum, d) => sum + (Number(d.amount)||0), 0);
  const expectedCash = (settlement?.prevCashBalance || 0) + (settlement?.payment?.cash || 0) - totalDeductions;
  const difference = actualCash - expectedCash;

  const addDeduction = () => setDeductions(prev => [...prev, { type: DEDUCTION_TYPES[0], amount: '', note: '' }]);
  const removeDeduction = (i) => setDeductions(prev => prev.filter((_, idx) => idx !== i));

  const handleSettle = async () => {
    if (!invoiceLastNumber) { showMsg('請輸入最後一張發票號碼', 'err'); return; }
    setSaving(true);
    try {
      await client.post('/daily-settlements', {
        gymId, income: settlement?.income, payment: settlement?.payment,
        deductions, denominations, invoiceLastNumber, notes,
      });
      showMsg(Math.abs(difference) > 200 ? `結帳完成，差異 NT$${difference} 已通知管理員` : '結帳完成！');
      await loadToday();
      await loadHistory();
    } catch (e) { showMsg(e.response?.data?.message || '結帳失敗', 'err'); }
    finally { setSaving(false); }
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

  if (!isOperatorMode) {
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

      {/* Tab（歷史紀錄僅管理員可見）*/}
      <div style={{ display:'flex', gap:2, background:'#FBF5F5', border:'0.5px solid #E8D5D5', borderRadius:8, padding:3, marginBottom:16 }}>
        {[{ key:'today', label:'今日結帳' }, ...(isAdmin ? [{ key:'history', label:'歷史紀錄' }] : [])].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex:1, height:32, borderRadius:6, border: tab===t.key?'0.5px solid #E8D5D5':'none', background: tab===t.key?'#fff':'none', fontSize:13, fontWeight:500, color: tab===t.key?'#1a1a1a':'#999', cursor:'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'history' && isAdmin ? (
        <div>
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
            <div style={s.cardHead}>今日收入（系統自動帶入）</div>
            {[
              { label:'入場收入', value: settlement?.income?.entry || 0, sub: settlement?.income?.entryItems },
              { label:'岩鞋租借', value: settlement?.income?.shoeRental || 0 },
              { label:'商品銷售', value: settlement?.income?.product || 0 },
              { label:'課程收入', value: settlement?.income?.course || 0 },
              { label:'定期票', value: settlement?.income?.pass || 0, sub: settlement?.income?.passItems },
            ].map((item, i) => (
              <div key={i}>
                <div style={s.row}>
                  <span style={s.label}>{item.label}</span>
                  <span style={s.value}>NT${item.value.toLocaleString()}</span>
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
            <div style={s.cardHead}>付款方式統計</div>
            {[
              { label:'現金', value: settlement?.payment?.cash || 0 },
              { label:'Line Pay', value: settlement?.payment?.linePay || 0 },
              { label:'街口支付', value: settlement?.payment?.jko || 0 },
              { label:'台灣Pay', value: settlement?.payment?.taiwanPay || 0 },
            ].map((item, i) => (
              <div key={i} style={s.row}>
                <span style={s.label}>{item.label}</span>
                <span style={s.value}>NT${item.value.toLocaleString()}</span>
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

          {/* 減項 */}
          <div style={s.card}>
            <div style={{ ...s.cardHead, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>減項</span>
              <button onClick={addDeduction}
                style={{ height:28, padding:'0 12px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>＋ 新增減項</button>
            </div>
            {deductions.length === 0 ? (
              <div style={{ padding:'12px 16px', fontSize:13, color:'#ccc' }}>尚無減項</div>
            ) : deductions.map((d, i) => (
              <div key={i} style={{ padding:'10px 16px', borderBottom:'0.5px solid #F5EFEF' }}>
                <div style={{ display:'flex', gap:8, marginBottom:6 }}>
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
                <span style={s.label}>減項合計</span>
                <span style={{ ...s.value, color:'#A32D2D' }}>-NT${totalDeductions.toLocaleString()}</span>
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
              <span style={s.label}>最後一張發票號碼</span>
              <input value={invoiceLastNumber} onChange={e => setInvoiceLastNumber(e.target.value)}
                placeholder="例：AB12345678"
                style={{ ...s.input, width:160 }} />
            </div>
            <div style={{ padding:'6px 16px 10px', fontSize:11, color:'#999' }}>隔天系統自動帶入下一張號碼</div>
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
