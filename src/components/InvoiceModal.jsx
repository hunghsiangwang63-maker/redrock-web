import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import Modal from './Modal';

const inpS = { width:'100%', height:36, borderRadius:8, border:'1px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };
const labS = { fontSize:12, color:'#666', display:'block', marginBottom:5 };

// 通用「開立發票」modal（預先建立，待日後發票機串接）——課程學員/比賽報名共用同一套邏輯與畫面：
// 同一筆訂單（報名/課程報名）同時最多一張「已開立」發票；開立後只顯示摘要＋「作廢發票」鍵（二次確認），
// 作廢後才能重新開立。金額開立時寫入當日結帳「加減項」（+發票開立），作廢對稱沖銷（-發票作廢）。
//
// props:
//   title        - modal 標題（通常是會員名）
//   subtitle     - 副標（賽事/課程名稱＋組別/梯次資訊）
//   feeInfo      - 選填，顯示於頂部提示框的費用參考文字（如「報名費用 NT$X」）
//   defaultAmount - 金額欄預填值（呼叫端已算好優先序）
//   defaultItemName - 品項欄預填值
//   onClose()
//   listInvoices()          - async () => invoice[]
//   createInvoice(payload)  - async ({itemName,amount,taxId,note,issuedAt}) => invoice
//   voidInvoiceFn(id, voidReason) - async () => void
export default function InvoiceModal({ title, subtitle, feeInfo, defaultAmount, defaultItemName, onClose, listInvoices, createInvoice, voidInvoiceFn }) {
  const [form, setForm] = useState({
    issuedAt: dayjs().format('YYYY-MM-DDTHH:mm'),
    itemName: defaultItemName || '費用',
    amount: defaultAmount ?? 0,
    track: '', number: '',
    taxId: '', note: '',
  });
  const [history, setHistory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmVoidId, setConfirmVoidId] = useState(null); // 二次確認：待作廢的發票 id
  const [voiding, setVoiding] = useState(false);

  const loadHistory = () => listInvoices().then(setHistory).catch(() => setHistory([]));
  useEffect(() => { loadHistory(); }, []);

  // 同一訂單同時最多一張「已開立」（未作廢）發票——有的話只顯示摘要＋作廢鍵，不顯示開立表單
  const activeInvoice = (history || []).find(i => i.status !== 'voided') || null;

  const submit = async () => {
    if (!(Number(form.amount) > 0)) { setMsg('請輸入大於 0 的發票金額'); return; }
    if (!/^[A-Za-z]{2}$/.test(form.track.trim())) { setMsg('發票字軌須為 2 碼英文字母'); return; }
    if (!/^\d{8}$/.test(form.number.trim())) { setMsg('發票號碼須為 8 碼數字'); return; }
    setSaving(true); setMsg('');
    try {
      const invoice = await createInvoice({
        itemName: form.itemName, amount: Number(form.amount), taxId: form.taxId, note: form.note,
        track: form.track.trim().toUpperCase(), number: form.number.trim(),
        issuedAt: form.issuedAt ? new Date(form.issuedAt).toISOString() : undefined,
      });
      setHistory(h => [invoice, ...(h || [])]);
      setMsg('✅ 已開立發票（已計入當日營收加減項）');
      setForm(f => ({ ...f, note: '', track: '', number: '' }));
    } catch (err) {
      setMsg(err.response?.data?.message || '開立發票失敗');
    } finally { setSaving(false); }
  };

  const doVoid = async (id) => {
    setVoiding(true); setMsg('');
    try {
      await voidInvoiceFn(id);
      setConfirmVoidId(null);
      setMsg('✅ 已作廢，可重新開立發票');
      await loadHistory();
    } catch (err) {
      setMsg(err.response?.data?.message || '作廢失敗');
    } finally { setVoiding(false); }
  };

  return (
    <Modal title={`開立發票 · ${title || ''}`} onClose={onClose}>
      <div style={{ background:'#FBF5F5', borderRadius:8, padding:10, marginBottom:14, fontSize:12, color:'#666' }}>
        {subtitle}
        {feeInfo && <div style={{ marginTop:4 }}>{feeInfo}</div>}
        <div style={{ marginTop:6, color:'#A66A00' }}>⚠️ 預先建立，尚未串接實體發票機；開立後金額將寫入當日結帳「加減項」，不影響原本已認列之營收。</div>
      </div>

      {history === null ? (
        <div style={{ fontSize:12, color:'#999', marginBottom:14 }}>載入中...</div>
      ) : activeInvoice ? (
        <div style={{ background:'#FBF5F5', border:'1px solid #E8D5D5', borderRadius:8, padding:12, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#2D7D46', marginBottom:6 }}>✅ 已開立發票</div>
          {activeInvoice.invoiceNo && <div style={{ fontSize:14, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace', marginBottom:4 }}>{activeInvoice.invoiceNo}</div>}
          <div style={{ fontSize:13 }}>
            {activeInvoice.issuedAt?._seconds ? dayjs(activeInvoice.issuedAt._seconds*1000).format('YYYY/MM/DD HH:mm') : ''}　{activeInvoice.itemName}　<strong>NT${activeInvoice.amount}</strong>
          </div>
          {activeInvoice.taxId && <div style={{ fontSize:12, color:'#666', marginTop:2 }}>統編 {activeInvoice.taxId}</div>}
          {activeInvoice.note && <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{activeInvoice.note}</div>}
          <div style={{ fontSize:11, color:'#999', marginTop:4 }}>開立人：{activeInvoice.staffName || '—'}</div>

          {confirmVoidId === activeInvoice.id ? (
            <div style={{ marginTop:10, background:'#FCEBEB', border:'1px solid #F0C0C0', borderRadius:8, padding:10 }}>
              <div style={{ fontSize:12, color:'#A32D2D', marginBottom:8 }}>確定要作廢發票 <strong style={{ fontFamily:'monospace' }}>{activeInvoice.invoiceNo}</strong>？作廢後金額會從當日結帳加減項沖銷，且可重新開立新的一張。</div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setConfirmVoidId(null)} disabled={voiding}
                  style={{ flex:1, height:34, borderRadius:8, border:'1px solid #E8D5D5', background:'#fff', color:'#444', fontSize:12, cursor:'pointer' }}>取消</button>
                <button onClick={() => doVoid(activeInvoice.id)} disabled={voiding}
                  style={{ flex:1, height:34, borderRadius:8, background:'#A32D2D', color:'#fff', border:'none', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  {voiding ? '處理中...' : '確定作廢'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmVoidId(activeInvoice.id)}
              style={{ marginTop:10, height:34, padding:'0 14px', borderRadius:8, border:'1px solid #F0C0C0', background:'#fff', color:'#A32D2D', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              🗑 作廢發票
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ marginBottom:12 }}>
            <label style={labS}>日期時間</label>
            <input type="datetime-local" style={inpS} value={form.issuedAt} onChange={e => setForm(f => ({ ...f, issuedAt: e.target.value }))} />
          </div>
          <div style={{ display:'flex', gap:10, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <label style={labS}>發票字軌（2 碼英文）</label>
              <input style={{ ...inpS, textTransform:'uppercase' }} value={form.track} maxLength={2}
                onChange={e => setForm(f => ({ ...f, track: e.target.value.replace(/[^A-Za-z]/g, '') }))} placeholder="如：AB" />
            </div>
            <div style={{ flex:2 }}>
              <label style={labS}>發票號碼（8 碼數字）</label>
              <input style={inpS} value={form.number} maxLength={8}
                onChange={e => setForm(f => ({ ...f, number: e.target.value.replace(/\D/g, '') }))} placeholder="如：12345678" />
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={labS}>品項</label>
            <input style={inpS} value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} placeholder="如：課程費用" />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={labS}>金額（預填實收金額，可調整）</label>
            <input type="number" style={inpS} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={labS}>統一編號（選填）</label>
            <input style={inpS} value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))} placeholder="8 碼統編（三聯式）" />
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={labS}>備註（管理員統一備註）</label>
            <textarea rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              style={{ ...inpS, height:'auto', paddingTop:8, paddingBottom:8, resize:'vertical', fontFamily:'inherit' }} />
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <button onClick={onClose} style={{ flex:1, height:40, borderRadius:9, border:'1px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>關閉</button>
            <button onClick={submit} disabled={saving} style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {saving ? '處理中...' : '開立發票'}
            </button>
          </div>
        </>
      )}

      {msg && <div style={{ fontSize:12, marginBottom:10, color: msg.startsWith('✅') ? '#2D7D46' : '#A32D2D' }}>{msg}</div>}
      {activeInvoice && (
        <button onClick={onClose} style={{ width:'100%', height:38, borderRadius:9, border:'1px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer', marginBottom:16 }}>關閉</button>
      )}

      <div>
        <div style={{ fontSize:12, fontWeight:600, color:'#666', marginBottom:6 }}>開立紀錄</div>
        {history === null ? (
          <div style={{ fontSize:12, color:'#999' }}>載入中...</div>
        ) : history.length === 0 ? (
          <div style={{ fontSize:12, color:'#999' }}>尚無開立紀錄</div>
        ) : history.map(inv => (
          <div key={inv.id} style={{ fontSize:12, color: inv.status==='voided' ? '#bbb' : '#444', padding:'6px 0', borderTop:'0.5px solid #F5EFEF', textDecoration: inv.status==='voided' ? 'line-through' : 'none' }}>
            {inv.invoiceNo ? <span style={{ fontFamily:'monospace', fontWeight:600 }}>{inv.invoiceNo}　</span> : null}
            {inv.issuedAt?._seconds ? dayjs(inv.issuedAt._seconds*1000).format('YYYY/MM/DD HH:mm') : ''}　{inv.itemName}　NT${inv.amount}
            {inv.taxId ? `　統編 ${inv.taxId}` : ''}
            {inv.status === 'voided' && <span style={{ marginLeft:6, color:'#A32D2D', fontWeight:600 }}>已作廢</span>}
            {inv.note ? <div style={{ color:'#999', marginTop:2, textDecoration:'none' }}>{inv.note}</div> : null}
          </div>
        ))}
      </div>
    </Modal>
  );
}
