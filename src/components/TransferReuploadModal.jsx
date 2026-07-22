import { useState } from 'react';
import { submitTransferRecord } from '../api/transfers';

// 轉帳被退回 → 重新上傳補正 Modal（體驗/比賽/租借共用；課程、入隊各自已有專屬表單）。
// target: { orderType, refId, orderName, amount, gymId, reason }
export default function TransferReuploadModal({ target, memberName, onClose, onDone }) {
  const [date, setDate] = useState('');
  const [last5, setLast5] = useState('');
  const [paidAmt, setPaidAmt] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!last5.trim()) { setErr('請填寫匯款帳號末五碼'); return; }
    if (!date.trim()) { setErr('請填寫轉帳日期'); return; }
    setBusy(true); setErr('');
    try {
      await submitTransferRecord({
        orderType: target.orderType, refId: target.refId, orderName: target.orderName || '',
        amount: target.amount || 0, gymId: target.gymId || '', memberName: memberName || '',
        bankLastFive: last5.trim(), paymentDate: date, screenshot: file, paidAmount: paidAmt || null,
      });
      onDone?.();
    } catch (e) { setErr(e.response?.data?.message || '送出失敗，請稍後再試'); }
    finally { setBusy(false); }
  };

  if (!target) return null;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:380, padding:20 }}>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:6, textAlign:'left' }}>重新上傳轉帳</div>
        <div style={{ fontSize:12.5, color:'#666', marginBottom:4, textAlign:'left' }}>{target.orderName}{target.amount ? `・應付 NT$${target.amount}` : ''}</div>
        {target.reason && (
          <div style={{ fontSize:12, color:'#A32D2D', background:'#FCEBEB', borderRadius:8, padding:'8px 10px', marginBottom:12, textAlign:'left' }}>
            退回原因：{target.reason}
          </div>
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <div style={{ fontSize:12, color:'#666', marginBottom:4, textAlign:'left' }}>匯款日期</div>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{ width:'100%', height:38, border:'0.5px solid #DCC8C8', borderRadius:8, padding:'0 10px', fontSize:14, boxSizing:'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize:12, color:'#666', marginBottom:4, textAlign:'left' }}>匯款帳號末五碼 *</div>
            <input value={last5} onChange={e=>setLast5(e.target.value.replace(/[^\d]/g,'').slice(0,5))} placeholder="12345" inputMode="numeric"
              style={{ width:'100%', height:38, border:'0.5px solid #DCC8C8', borderRadius:8, padding:'0 10px', fontSize:14, boxSizing:'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize:12, color:'#666', marginBottom:4, textAlign:'left' }}>實際匯款金額</div>
            <input value={paidAmt} onChange={e=>setPaidAmt(e.target.value.replace(/[^\d]/g,''))} placeholder={target.amount ? String(target.amount) : '實際匯出的金額'} inputMode="numeric"
              style={{ width:'100%', height:38, border:'0.5px solid #DCC8C8', borderRadius:8, padding:'0 10px', fontSize:14, boxSizing:'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize:12, color:'#666', marginBottom:4, textAlign:'left' }}>轉帳截圖（選填）</div>
            <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0] || null)} style={{ fontSize:12 }} />
          </div>
        </div>
        {err && <div style={{ fontSize:12, color:'#A32D2D', marginTop:10, textAlign:'left' }}>{err}</div>}
        <div style={{ display:'flex', gap:10, marginTop:16 }}>
          <button onClick={onClose} disabled={busy}
            style={{ flex:1, height:40, borderRadius:10, background:'#fff', color:'#666', border:'0.5px solid #DCC8C8', fontSize:14, cursor:'pointer' }}>取消</button>
          <button onClick={submit} disabled={busy}
            style={{ flex:1, height:40, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer', opacity:busy?0.6:1 }}>
            {busy ? '送出中…' : '送出'}
          </button>
        </div>
      </div>
    </div>
  );
}
