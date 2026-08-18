import { useState, useEffect } from 'react';
import Modal from '../Modal';
import client from '../../api/client';
import { confirmCompetitionPayment, rejectCompetitionPayment, refundCompetitionRegistration } from '../../api/competitions';

const inp = { width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };
const lbl = { fontSize:12, color:'#666', display:'block', marginBottom:5 };

// 比賽報名收款／退費（共用：賽事頁 + 待辦頁）
// props: action 'pay'|'refund', reg {id,memberName,divisionName,paymentMethod,bankLastFive,paymentDate,registrationFee,
//        paidAmount,refundBankCode,refundBankName,refundAccount,refundAccountName}
//        onClose(), onDone(message)
export default function CompetitionActionModal({ action, reg, onClose, onDone }) {
  // 退費預設帶入實際已收金額（多為全額退），可再手動改成部分退款
  const [amount, setAmount] = useState(action === 'pay' ? (reg.registrationFee?.toString() || '') : ((reg.paidAmount || reg.registrationFee || '')?.toString() || '0'));
  const [reason, setReason] = useState('');
  const [staffNote, setStaffNote] = useState(reg.staffNote || ''); // 員工內部備註（報名者看不到）
  const [rejectReason, setRejectReason] = useState('');            // 退回原因（報名者看得到，必填）
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existingInvoice, setExistingInvoice] = useState(null); // {invoiceNo, amount} | null——退費若已開過發票，處理前要警示取回

  // 退費才查（收款不涉及發票作廢）；退費處理後會自動作廢，這裡先讓經手人知道要提醒會員交回紙本
  useEffect(() => {
    if (action !== 'refund' || !reg.id) return;
    let alive = true;
    client.get('/invoices/status', { params: { sourceType: 'competition', refId: reg.id } })
      .then(r => { if (alive && r.data.invoiceNo) setExistingInvoice(r.data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [action, reg.id]);

  const submit = async () => {
    setSaving(true); setError('');
    try {
      if (action === 'pay') {
        await confirmCompetitionPayment(reg.id, { amount: Number(amount), staffNote });
        onDone('已確認收款');
      } else {
        await refundCompetitionRegistration(reg.id, { refundAmount: Number(amount), reason });
        onDone('退費已處理');
      }
    } catch (err) { setError(err.response?.data?.message || '操作失敗'); setSaving(false); }
  };

  // 退回：報名者需重新填寫繳費資訊（原因必填、會通知報名者；員工備註一併存檔）
  const submitReject = async () => {
    if (!rejectReason.trim()) { setError('退回需填寫原因（報名者會看到）'); return; }
    setSaving(true); setError('');
    try {
      await rejectCompetitionPayment(reg.id, { reason: rejectReason.trim(), staffNote });
      onDone('已退回，報名者需重新填寫繳費資訊');
    } catch (err) { setError(err.response?.data?.message || '退回失敗'); setSaving(false); }
  };

  return (
    <Modal title={action === 'pay' ? '確認收款' : '處理退費'} onClose={onClose} width={400}>
      <div style={{ marginBottom:12, fontSize:13, color:'#666' }}>
        {reg.memberName} — {reg.divisionName}
      </div>
      {action === 'pay' && (
        <div style={{ background:'#FBF5F5', borderRadius:10, padding:'10px 14px', marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#8B1A1A', marginBottom:8 }}>付款資訊</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:12, color:'#444' }}>
            <div><span style={{ color:'#999' }}>付款方式：</span>
              { reg.paymentMethod==='transfer' ? '銀行轉帳'
              : reg.paymentMethod==='linepay' ? 'Line Pay'
              : reg.paymentMethod==='cash' ? '臨櫃現金'
              : reg.paymentMethod || '—'}
            </div>
            <div><span style={{ color:'#999' }}>匯款末五碼：</span>{reg.bankLastFive || '—'}</div>
            <div><span style={{ color:'#999' }}>匯款日期：</span>{reg.paymentDate || '—'}</div>
            <div><span style={{ color:'#999' }}>報名費：</span>NT${reg.registrationFee || '—'}</div>
          </div>
        </div>
      )}
      <div style={{ marginBottom:14 }}>
        <label style={lbl}>{action === 'pay' ? '收款金額' : '退款金額'} (NT$)</label>
        <input type="number" style={inp} value={amount} onChange={e => setAmount(e.target.value)}/>
      </div>
      {action === 'refund' && (
        <div style={{ background:'#FBF5F5', borderRadius:10, padding:'10px 14px', marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#8B1A1A', marginBottom:8 }}>已收款資訊 / 退費帳號（請自行匯款後點下方確認）</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:12, color:'#444' }}>
            <div><span style={{ color:'#999' }}>已收金額：</span>NT${reg.paidAmount || reg.registrationFee || '—'}</div>
            <div><span style={{ color:'#999' }}>戶名：</span>{reg.refundAccountName || '—'}</div>
            <div><span style={{ color:'#999' }}>銀行：</span>{reg.refundBankCode ? `(${reg.refundBankCode}) ` : ''}{reg.refundBankName || '—'}</div>
            <div><span style={{ color:'#999' }}>帳號：</span>{reg.refundAccount || '—'}</div>
          </div>
        </div>
      )}
      {action === 'refund' && (
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>退費原因</label>
          <input style={inp} value={reason} onChange={e => setReason(e.target.value)}/>
        </div>
      )}
      {existingInvoice && (
        <div style={{ background:'#FCEBEB', border:'1px solid #A32D2D33', borderRadius:8, padding:14, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#A32D2D', marginBottom:6 }}>⚠️ 務必取回原列印發票</div>
          <div style={{ fontSize:12, color:'#444', lineHeight:1.7 }}>
            這筆報名費已列印過發票，處理退費後系統會自動把它作廢（號碼不會重複使用），
            但<strong>紙本仍在會員手上</strong>——請務必聯繫會員取回，避免流出已失效的發票。
          </div>
          <div style={{ marginTop:8, fontSize:16, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace' }}>{existingInvoice.invoiceNo}</div>
        </div>
      )}
      {action === 'pay' && (
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>員工備註（內部用，報名者看不到）</label>
          <input style={inp} value={staffNote} onChange={e => setStaffNote(e.target.value)} placeholder="選填"/>
        </div>
      )}
      {error && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{error}</div>}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onClose} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
        <button onClick={submit} disabled={saving}
          style={{ flex:2, height:40, borderRadius:9, background:action === 'pay' ? '#2D7D46' : '#A32D2D', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          {saving ? '處理中...' : action === 'pay' ? '確認收款' : '確認退費'}
        </button>
      </div>
      {action === 'pay' && (
        <div style={{ marginTop:16, paddingTop:14, borderTop:'0.5px solid #F0E5E5' }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#A32D2D', marginBottom:8 }}>退回（報名者需重新填寫繳費資訊）</div>
          <div style={{ marginBottom:10 }}>
            <label style={lbl}>退回原因（必填，報名者會看到並收到通知）</label>
            <input style={inp} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="例：查無此筆匯款 / 金額不符"/>
          </div>
          <button onClick={submitReject} disabled={saving}
            style={{ width:'100%', height:38, borderRadius:9, background:'#fff', color:'#A32D2D', border:'0.5px solid #A32D2D', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            {saving ? '處理中...' : '退回報名者重新填寫'}
          </button>
        </div>
      )}
    </Modal>
  );
}
