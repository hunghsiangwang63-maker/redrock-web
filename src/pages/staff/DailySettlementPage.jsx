import { useState, useEffect } from 'react';
import client from '../../api/client';
import { useAuth } from '../../store/authStore.jsx';
import { getGyms } from '../../api/gyms';
import dayjs from 'dayjs';
import SegmentedTabs from '../../components/SegmentedTabs';
import Modal from '../../components/Modal';

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
const INCOME_KEYS = ['entry', 'shoeRental', 'product', 'course', 'pass'];

// ── 入場費固定六分類（結帳畫面預設就顯示、可逐類手動輸入）──────────────────
const ENTRY_CATS = ['成人', '學生', '兒童', '個別使用優惠券', '隊員折扣', '隊員＋優惠券'];
// 某分類的系統值（自 income.entryItems 取；無則 0）
const sysEntryVal = (income, cat) => (income?.entryItems || []).find(x => x.label === cat)?.value || 0;
// 顯示用分類清單：固定六類 ＋ 其他有系統值的分類（如 VIP/定期票入場/單次入場券）
const entryCatList = (income) => {
  const extra = (income?.entryItems || []).map(x => x.label).filter(l => l && !ENTRY_CATS.includes(l));
  return [...ENTRY_CATS, ...extra];
};
// 某分類的手動值（存於 incomeManual.entryItems[label]）
const manEntryVal = (im, cat) => im?.entryItems?.[cat];
// 入場費手計總額：有 entryItems 逐類 Σ(手動 ?? 系統)；無則回退舊單一 entry 手動值
const entryManualTotal = (income, im) => {
  if (im?.entryItems && typeof im.entryItems === 'object') {
    return entryCatList(income).reduce((s, cat) => {
      const m = manEntryVal(im, cat);
      return s + ((m !== '' && m != null) ? (Number(m) || 0) : sysEntryVal(income, cat));
    }, 0);
  }
  return (im?.entry !== '' && im?.entry != null) ? (Number(im.entry) || 0) : (income?.entry || 0);
};
// 手計總額：入場走逐類加總，其餘項有手動值取手動、缺項回退系統；無 incomeManual 回 null
const manualIncomeTotal = (income, im) => im
  ? entryManualTotal(income, im) + ['shoeRental', 'product', 'course', 'pass']
      .reduce((s, k) => s + ((im[k] !== '' && im[k] != null) ? (Number(im[k]) || 0) : (income?.[k] || 0)), 0)
  : null;

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
  // 發票多段：一天內換發票捲可加多段起末號
  const [invoiceSegments, setInvoiceSegments] = useState([{ start:'', last:'' }]);
  const [showConfirm, setShowConfirm] = useState(false);   // 完成結帳確認 modal
  const [savingDraft, setSavingDraft] = useState(false);
  const [resettleMode, setResettleMode] = useState(false); // 當日再次結帳（由已結帳畫面進入）
  const [resettleReason, setResettleReason] = useState('');
  const setSegment = (i, field, val) => setInvoiceSegments(prev => prev.map((sg, idx) => idx === i ? { ...sg, [field]: val } : sg));
  const addSegment = () => setInvoiceSegments(prev => {
    const lastSeg = prev[prev.length - 1];
    const suggest = /^\d+$/.test(String(lastSeg?.last || '')) ? String(Number(lastSeg.last) + 1).padStart(String(lastSeg.last).length, '0') : '';
    return [...prev, { start: suggest, last: '' }];
  });
  const removeSegment = (i) => setInvoiceSegments(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
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
  const [expandedDay, setExpandedDay] = useState(null); // 歷史紀錄：展開結帳摘要的那一天 id
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
      setResettleMode(false);
      const draft = res.data.draft;
      if (draft) {
        // 載回暫存檔續填
        if (draft.denominations) setDenominations(draft.denominations);
        if (Array.isArray(draft.deductions)) setDeductions(draft.deductions);
        if (Array.isArray(draft.invoiceSegments) && draft.invoiceSegments.length) setInvoiceSegments(draft.invoiceSegments);
        else if (draft.invoiceStartNumber || draft.invoiceLastNumber) setInvoiceSegments([{ start: draft.invoiceStartNumber || '', last: draft.invoiceLastNumber || '' }]);
        if (draft.invoiceVoidNumbers) setVoidList(String(draft.invoiceVoidNumbers).split(/[,、\s]+/).map(x => x.trim()).filter(Boolean));
        setCardOrangeFirst(draft.cardOrangeFirst || ''); setCardFullFirst(draft.cardFullFirst || '');
        setNotes(draft.notes || '');
        if (draft.incomeManual) setIncomeManual(draft.incomeManual);
        if (draft.paymentManual) setPaymentManual(draft.paymentManual);
        showMsg('已載入暫存檔');
      } else if (!res.data.alreadySettled) {
        // 無暫存 → 首段起始號帶入前一天最後+1（可改）
        const sug = res.data.settlement?.suggestedInvoiceStart;
        if (sug) setInvoiceSegments(prev => (prev.length === 1 && !prev[0].start && !prev[0].last) ? [{ start: sug, last: '' }] : prev);
      }
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
  const manualCashVal = transition.settlementManualInput && paymentManual.cash !== '' && paymentManual.cash != null ? Number(paymentManual.cash) || 0 : null;
  const effectiveCash = manualCashVal != null ? manualCashVal : (settlement?.payment?.cash || 0);
  const expectedCash = (settlement?.prevCashBalance || 0) + effectiveCash + netAdjust;
  const difference = actualCash - expectedCash;
  // 發票總金額＝income 各項合計（轉換期手動開啟時：入場逐類加總、其餘取手動缺項回退系統）
  const invoiceTotal = transition.settlementManualInput
    ? manualIncomeTotal(settlement?.income, incomeManual)
    : (settlement?.income?.total || 0);

  const addDeduction = () => setDeductions(prev => [...prev, { sign: '-', type: DEDUCTION_TYPES[0], amount: '', note: '' }]);
  const removeDeduction = (i) => setDeductions(prev => prev.filter((_, idx) => idx !== i));

  const cleanSegments = () => invoiceSegments.map(sg => ({ start: String(sg.start || '').trim(), last: String(sg.last || '').trim() })).filter(sg => sg.start || sg.last);
  const buildBody = () => ({
    gymId, income: settlement?.income, payment: settlement?.payment,
    deductions, denominations, notes,
    invoiceSegments: cleanSegments(),
    invoiceVoidNumbers: [...voidList, voidInput.trim()].filter(Boolean).join(', '),
    cardOrangeFirst, cardFullFirst,
    checkinCount: settlement?.checkinCount ?? null,
    ...(transition.settlementManualInput ? { incomeManual, paymentManual } : {}),
  });

  const saveDraft = async () => {
    setSavingDraft(true);
    try { await client.put('/daily-settlements/draft', buildBody()); showMsg('已暫存'); }
    catch (e) { showMsg(e.response?.data?.message || '暫存失敗', 'err'); }
    finally { setSavingDraft(false); }
  };

  const openConfirm = () => {
    const segs = cleanSegments();
    if (!segs.length || !segs[segs.length - 1].last) { showMsg('請至少填一段發票，且最後一段需填末號', 'err'); return; }
    setShowConfirm(true);
  };

  const doSettle = async () => {
    setSaving(true);
    try {
      const res = await client.post('/daily-settlements', { ...buildBody(), ...(resettleMode ? { resettleReason } : {}) });
      setShowConfirm(false);
      showMsg(res.data?.message || '結帳完成！');
      await loadToday(); await loadHistory();
    } catch (e) { showMsg(e.response?.data?.message || '結帳失敗', 'err'); }
    finally { setSaving(false); }
  };

  // 由「今日已結帳」進入當日再次結帳：用已結帳資料預填表單、切回編輯
  const startResettle = () => {
    const st = settlement;
    if (st?.denominations) setDenominations(st.denominations);
    if (Array.isArray(st?.deductions)) setDeductions(st.deductions);
    if (Array.isArray(st?.invoiceSegments) && st.invoiceSegments.length) setInvoiceSegments(st.invoiceSegments);
    else setInvoiceSegments([{ start: st?.invoiceStartNumber || '', last: st?.invoiceLastNumber || '' }]);
    setVoidList(st?.invoiceVoidNumbers ? String(st.invoiceVoidNumbers).split(/[,、\s]+/).map(x => x.trim()).filter(Boolean) : []);
    setCardOrangeFirst(st?.cardOrangeFirst || ''); setCardFullFirst(st?.cardFullFirst || '');
    setNotes(st?.notes || ''); setResettleReason('');
    if (st?.incomeManual) setIncomeManual(st.incomeManual);
    if (st?.paymentManual) setPaymentManual(st.paymentManual);
    setResettleMode(true);
    setAlreadySettled(false);
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
          <div style={{ fontSize:13, color:'#888', lineHeight:1.7, textAlign:'left' }}>
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
          ) : history.map(h => {
            const open = expandedDay === h.id;
            return (
            <div key={h.id} style={s.card}>
              <div onClick={() => setExpandedDay(open ? null : h.id)}
                style={{ padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14 }}>{h.date}{h.resettleCount ? <span style={{ fontSize:11, color:'#999', marginLeft:6 }}>· 再結 {h.resettleCount} 次</span> : ''}</div>
                  <div style={{ fontSize:12, color:'#999', marginTop:2 }}>{h.staffName}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontWeight:600, color:'#8B1A1A' }}>NT${(h.income?.total || 0).toLocaleString()}</div>
                    <div style={{ fontSize:11, color: Math.abs(h.difference||0) > 200 ? '#A32D2D' : '#2D7D46', marginTop:2 }}>
                      差異 NT${h.difference || 0}
                    </div>
                  </div>
                  <span style={{ fontSize:12, color:'#8B1A1A', whiteSpace:'nowrap' }}>{open ? '收合 ▲' : '結帳摘要 ▼'}</span>
                </div>
              </div>
              {open && (
                <div style={{ padding:'4px 16px 14px', borderTop:'0.5px solid #F5EFEF' }}>
                  <SettlementSummary
                    invoiceTotal={h.income?.total || 0}
                    manualTotal={manualIncomeTotal(h.income, h.incomeManual)}
                    income={h.income}
                    incomeManual={h.incomeManual || null}
                    deductions={h.deductions || []}
                    netAdjust={(h.deductions || []).reduce((sum, d) => sum + ((d.sign === '+' ? 1 : -1) * (Number(d.amount) || 0)), 0)}
                    actualCash={h.actualCashBalance || 0}
                    difference={h.difference || 0}
                    segments={(h.invoiceSegments && h.invoiceSegments.length) ? h.invoiceSegments : [{ start: h.invoiceStartNumber || '', last: h.invoiceLastNumber || '' }]}
                    voids={h.invoiceVoidNumbers ? String(h.invoiceVoidNumbers).split(/[,、\s]+/).map(x => x.trim()).filter(Boolean) : []} />
                </div>
              )}
            </div>
          );})}
        </div>
      ) : alreadySettled ? (
        <div>
          <div style={{ background:'#E6F4EB', borderRadius:12, padding:16, marginBottom:14, textAlign:'center' }}>
            <div style={{ fontSize:20, marginBottom:4 }}>✅</div>
            <div style={{ fontWeight:600, fontSize:14, color:'#2D7D46' }}>今日已完成結帳</div>
            <div style={{ fontSize:12, color:'#666', marginTop:4 }}>{settlement?.date} · {settlement?.staffName}{settlement?.resettleCount ? ` · 已再次結帳 ${settlement.resettleCount} 次` : ''}</div>
          </div>
          {/* 結帳摘要（與確認 modal 五項一致）*/}
          <div style={{ ...s.card, padding:'6px 16px 12px' }}>
            <div style={{ ...s.cardHead, padding:'10px 0', marginBottom:2 }}>結帳摘要</div>
            <SettlementSummary
              invoiceTotal={settlement?.income?.total || 0}
              manualTotal={manualIncomeTotal(settlement?.income, settlement?.incomeManual)}
              income={settlement?.income}
              incomeManual={settlement?.incomeManual || null}
              deductions={settlement?.deductions || []}
              netAdjust={(settlement?.deductions || []).reduce((sum, d) => sum + ((d.sign === '+' ? 1 : -1) * (Number(d.amount) || 0)), 0)}
              actualCash={settlement?.actualCashBalance || 0}
              difference={settlement?.difference || 0}
              segments={(settlement?.invoiceSegments && settlement.invoiceSegments.length) ? settlement.invoiceSegments : [{ start: settlement?.invoiceStartNumber || '', last: settlement?.invoiceLastNumber || '' }]}
              voids={settlement?.invoiceVoidNumbers ? String(settlement.invoiceVoidNumbers).split(/[,、\s]+/).map(x => x.trim()).filter(Boolean) : []} />
          </div>
          <button onClick={startResettle}
            style={{ width:'100%', height:46, borderRadius:12, background:'#fff', color:'#8B1A1A', border:'1px solid #8B1A1A', fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:20 }}>
            🔁 當日再次結帳
          </button>
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
              { key:'entry', label:'入場收入', value: settlement?.income?.entry || 0 },
              { key:'shoeRental', label:'岩鞋租借', value: settlement?.income?.shoeRental || 0 },
              { key:'product', label:'商品銷售', value: settlement?.income?.product || 0 },
              { key:'course', label:'課程收入', value: settlement?.income?.course || 0 },
              { key:'pass', label:'定期票', value: settlement?.income?.pass || 0, sub: settlement?.income?.passItems },
            ].map((item, i) => (
              <div key={i}>
                <div style={s.row}>
                  <span style={s.label}>{item.label}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {/* 入場收入：手動輸入改逐分類（下方各列），此處總額＝各類加總、不放單一輸入框 */}
                    {transition.settlementManualInput && item.key !== 'entry' && (
                      <input type="number" value={incomeManual[item.key] ?? ''} placeholder="手動"
                        onChange={e => setIncomeManual(p => ({ ...p, [item.key]: e.target.value }))}
                        style={{ width:88, height:30, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:13, background:'#FFFDF5', textAlign:'right', boxSizing:'border-box' }} />
                    )}
                    <span style={{ ...s.value, color: transition.settlementManualInput ? '#999' : '#1a1a1a', minWidth:72, textAlign:'right' }}>
                      NT${(item.key === 'entry' && transition.settlementManualInput
                        ? entryManualTotal(settlement?.income, incomeManual)
                        : item.value).toLocaleString()}
                    </span>
                  </div>
                </div>
                {/* 入場收入：固定六分類（＋其他有系統值的分類）逐列，預設就顯示；手動模式各類給輸入框 */}
                {item.key === 'entry' && entryCatList(settlement?.income).map((cat, j) => (
                  <div key={j} style={{ ...s.row, padding:'4px 0 4px 22px' }}>
                    <span style={{ ...s.label, fontSize:12, color:'#999' }}>· {cat}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {transition.settlementManualInput && (
                        <input type="number" value={incomeManual.entryItems?.[cat] ?? ''} placeholder="手動"
                          onChange={e => setIncomeManual(p => ({ ...p, entryItems: { ...(p.entryItems || {}), [cat]: e.target.value } }))}
                          style={{ width:76, height:26, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:12, background:'#FFFDF5', textAlign:'right', boxSizing:'border-box' }} />
                      )}
                      <span style={{ ...s.value, fontSize:12, color:'#999', minWidth:64, textAlign:'right' }}>{transition.settlementManualInput ? '系統 ' : 'NT$'}{sysEntryVal(settlement?.income, cat).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                {/* 其他項（定期票細項）保留原顯示 */}
                {item.key !== 'entry' && Array.isArray(item.sub) && item.sub.length > 0 && item.sub.map((x, j) => (
                  <div key={j} style={{ ...s.row, padding:'4px 0 4px 22px' }}>
                    <span style={{ ...s.label, fontSize:12, color:'#999' }}>· {x.label}</span>
                    <span style={{ ...s.value, fontSize:12, color:'#999' }}>NT${(x.value||0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ ...s.row, background:'#FBF5F5' }}>
              <span style={{ ...s.label, fontWeight:600, color:'#1a1a1a' }}>總計</span>
              <span style={{ fontSize:16, fontWeight:700, color:'#8B1A1A' }}>NT${(transition.settlementManualInput ? manualIncomeTotal(settlement?.income, incomeManual) : (settlement?.income?.total || 0)).toLocaleString()}</span>
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

          {/* 發票號碼（多段：換發票捲時可加新序號起始）*/}
          <div style={s.card}>
            <div style={{ ...s.cardHead, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>發票管理</span>
              <button onClick={addSegment}
                style={{ height:28, padding:'0 12px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>＋ 新增發票序號</button>
            </div>
            {invoiceSegments.map((sg, i) => (
              <div key={i} style={{ padding:'10px 16px', borderBottom:'0.5px solid #F5EFEF', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span style={{ ...s.label, minWidth:56 }}>{invoiceSegments.length > 1 ? `第 ${i+1} 段` : '發票號'}</span>
                <input value={sg.start} onChange={e => setSegment(i, 'start', e.target.value)} placeholder="起始號" style={{ ...s.input, width:130 }} />
                <span style={{ color:'#999' }}>～</span>
                <input value={sg.last} onChange={e => setSegment(i, 'last', e.target.value)} placeholder="最後一張" style={{ ...s.input, width:130 }} />
                {invoiceSegments.length > 1 && (
                  <button onClick={() => removeSegment(i)}
                    style={{ height:36, width:36, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', color:'#A32D2D', cursor:'pointer', fontSize:16 }}>✕</button>
                )}
              </div>
            ))}
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

          {resettleMode && (
            <div style={{ background:'#FFF8E6', border:'0.5px solid #F0D98C', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#854F0B' }}>
              🔁 當日再次結帳：將更新今日這筆結帳（保留原版稽核）。
            </div>
          )}
          {/* 存暫存檔 + 完成結帳 */}
          <div style={{ display:'flex', gap:10, marginBottom:20 }}>
            <button onClick={saveDraft} disabled={savingDraft || saving}
              style={{ flex:1, height:52, borderRadius:14, background:'#fff', color:'#8B1A1A', border:'1px solid #8B1A1A', fontSize:15, fontWeight:600, cursor:(savingDraft||saving)?'not-allowed':'pointer' }}>
              {savingDraft ? '暫存中...' : '💾 存暫存檔'}
            </button>
            <button onClick={openConfirm} disabled={saving}
              style={{ flex:2, height:52, borderRadius:14, background: saving?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:16, fontWeight:600, cursor: saving?'not-allowed':'pointer' }}>
              {resettleMode ? '✓ 更新結帳' : '✓ 完成結帳'}
            </button>
          </div>
        </>
      )}

      {/* 完成結帳確認 Modal（含摘要）*/}
      {showConfirm && (
        <Modal title={resettleMode ? '確認更新今日結帳' : '確認完成結帳'} onClose={() => !saving && setShowConfirm(false)} width={460}>
          <SettlementSummary
            invoiceTotal={invoiceTotal}
            manualTotal={transition.settlementManualInput ? invoiceTotal : null}
            income={settlement?.income}
            incomeManual={transition.settlementManualInput ? incomeManual : null}
            deductions={deductions} netAdjust={netAdjust}
            actualCash={actualCash} difference={difference}
            segments={cleanSegments()} voids={[...voidList, voidInput.trim()].filter(Boolean)} />
          {resettleMode && (
            <div style={{ marginTop:12 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>再次結帳原因（選填）</label>
              <input value={resettleReason} onChange={e => setResettleReason(e.target.value)} placeholder="例：補開兩張發票 / 更正金額"
                style={{ ...s.input, width:'100%' }} />
            </div>
          )}
          <div style={{ display:'flex', gap:8, marginTop:18 }}>
            <button onClick={() => setShowConfirm(false)} disabled={saving}
              style={{ flex:1, height:44, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
            <button onClick={doSettle} disabled={saving}
              style={{ flex:2, height:44, borderRadius:10, background: saving?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: saving?'not-allowed':'pointer' }}>
              {saving ? '處理中...' : (resettleMode ? '確認更新' : '確認結帳')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// 結帳摘要（確認 modal 與已結帳畫面共用，五項一致順序）
function SettlementSummary({ invoiceTotal, manualTotal, income, incomeManual, deductions, netAdjust, actualCash, difference, segments, voids }) {
  const row = { display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'8px 0', borderBottom:'0.5px solid #F5EFEF', fontSize:13, gap:12 };
  const money = (n) => `NT$${(Number(n) || 0).toLocaleString()}`;
  const bigDiff = Math.abs(difference) > 200;
  const sysTotal = income?.total ?? invoiceTotal ?? 0;
  const hasManual = manualTotal !== null && manualTotal !== undefined;
  const showManualCol = !!incomeManual; // 分項是否並列手動輸入
  const manVal = (k, sysV) => (incomeManual && incomeManual[k] !== '' && incomeManual[k] != null) ? (Number(incomeManual[k]) || 0) : sysV; // 缺項回退系統
  // 總金額分項：入場（含細項）/ 課程 / 裝備銷售 / 出租 / 定期票
  const cats = income ? [
    { key:'entry', label:'入場', value: income.entry || 0, sub: income.entryItems },
    { key:'course', label:'課程', value: income.course || 0 },
    { key:'product', label:'裝備銷售', value: income.product || 0 },
    { key:'shoeRental', label:'出租', value: income.shoeRental || 0 },
    { key:'pass', label:'定期票', value: income.pass || 0, sub: income.passItems },
  ] : [];
  return (
    <div>
      {/* 發票總金額：手計 + 系統紀錄並列 */}
      <div style={{ ...row, flexDirection:'column', alignItems:'stretch' }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{ color:'#666' }}>發票總金額</span>
          <span style={{ fontWeight:700, color:'#8B1A1A' }}>{money(invoiceTotal)}</span>
        </div>
        {hasManual && (
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginTop:4, color:'#888' }}>
            <span>手計 {money(manualTotal)}　·　系統 {money(sysTotal)}</span>
            {Number(manualTotal) !== Number(sysTotal) && <span style={{ color:'#A32D2D' }}>差 {money(Number(manualTotal) - Number(sysTotal))}</span>}
          </div>
        )}
      </div>
      {/* 總金額分項：手動輸入 / 系統紀錄 並列（無手動輸入則只顯示系統）*/}
      {cats.length > 0 && (
        <div style={{ ...row, flexDirection:'column', alignItems:'stretch' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span style={{ color:'#666' }}>總金額分項{showManualCol ? '（手動 · 系統）' : '（系統紀錄）'}</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {cats.map((c, i) => {
              const man = c.key === 'entry' ? entryManualTotal(income, incomeManual) : manVal(c.key, c.value);
              const diff = showManualCol && Number(man) !== Number(c.value);
              return (
              <div key={i}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12.5 }}>
                  <span style={{ textAlign:'left' }}>{c.label}</span>
                  {showManualCol ? (
                    <span style={{ color: diff ? '#A32D2D' : undefined }}>手動 {money(man)}　·　系統 {money(c.value)}</span>
                  ) : (
                    <span>{money(c.value)}</span>
                  )}
                </div>
                {/* 入場：固定六分類（＋其他有系統值）逐列——手動模式全列(即使0)、純系統檢視只列>0 */}
                {c.key === 'entry' && entryCatList(income).map((cat, j) => {
                  const sysV = sysEntryVal(income, cat);
                  const mv = manEntryVal(incomeManual, cat);
                  const manV = (mv !== '' && mv != null) ? (Number(mv) || 0) : sysV;
                  if (!showManualCol && sysV <= 0) return null;
                  return (
                    <div key={j} style={{ display:'flex', justifyContent:'space-between', fontSize:11.5, color:'#999', paddingLeft:14 }}>
                      <span style={{ textAlign:'left' }}>· {cat}</span>
                      {showManualCol ? <span style={{ color: Number(manV) !== Number(sysV) ? '#A32D2D' : undefined }}>{money(manV)}　·　{money(sysV)}</span> : <span>{money(sysV)}</span>}
                    </div>
                  );
                })}
                {/* 其他（定期票）細項 */}
                {c.key !== 'entry' && Array.isArray(c.sub) && c.sub.filter(x => (x.value || 0) > 0).map((x, j) => (
                  <div key={j} style={{ display:'flex', justifyContent:'space-between', fontSize:11.5, color:'#999', paddingLeft:14 }}>
                    <span style={{ textAlign:'left' }}>· {x.label}</span><span>{money(x.value)}</span>
                  </div>
                ))}
              </div>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ ...row, flexDirection:'column', alignItems:'stretch' }}>
        <span style={{ color:'#666', marginBottom:4 }}>加減項</span>
        {(!deductions || deductions.length === 0) ? (
          <span style={{ color:'#999', textAlign:'left' }}>無</span>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {deductions.map((d, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12.5 }}>
                <span style={{ color: d.sign === '+' ? '#2D7D46' : '#A32D2D', textAlign:'left' }}>
                  {d.sign === '+' ? '＋' : '－'}{d.type}{d.note ? `（${d.note}）` : ''}
                </span>
                <span style={{ color: d.sign === '+' ? '#2D7D46' : '#A32D2D' }}>{d.sign === '+' ? '+' : '−'}{money(Math.abs(Number(d.amount) || 0))}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', fontWeight:600, marginTop:2 }}>
              <span style={{ textAlign:'left' }}>淨額小計</span>
              <span style={{ color: netAdjust >= 0 ? '#2D7D46' : '#A32D2D' }}>{netAdjust >= 0 ? '+' : '−'}{money(Math.abs(netAdjust))}</span>
            </div>
          </div>
        )}
      </div>
      <div style={row}><span style={{ color:'#666' }}>實際現金</span><span style={{ fontWeight:600 }}>{money(actualCash)}</span></div>
      <div style={row}><span style={{ color:'#666' }}>差異（實際−預期）</span>
        <span style={{ fontWeight:700, color: bigDiff ? '#A32D2D' : '#2D7D46' }}>
          {difference >= 0 ? '+' : ''}{money(difference)}{bigDiff ? '　⚠ 將通知管理員' : ''}
        </span>
      </div>
      <div style={{ ...row, flexDirection:'column', alignItems:'stretch', borderBottom:'none' }}>
        <span style={{ color:'#666', marginBottom:4 }}>發票起末號碼</span>
        <div style={{ display:'flex', flexDirection:'column', gap:2, textAlign:'left' }}>
          {(segments && segments.length ? segments : [{ start:'', last:'' }]).map((sg, i) => (
            <span key={i} style={{ fontFamily:'monospace', fontSize:12.5 }}>{segments.length > 1 ? `第${i+1}段：` : ''}{sg.start || '—'} ～ {sg.last || '—'}</span>
          ))}
          {voids && voids.length > 0 && <span style={{ fontSize:12, color:'#A32D2D' }}>作廢：{voids.join('、')}</span>}
        </div>
      </div>
    </div>
  );
}
