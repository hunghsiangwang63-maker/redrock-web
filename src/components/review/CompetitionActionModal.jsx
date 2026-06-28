import { useState } from 'react';
import Modal from '../Modal';
import { confirmCompetitionPayment, refundCompetitionRegistration } from '../../api/competitions';

const inp = { width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };
const lbl = { fontSize:12, color:'#666', display:'block', marginBottom:5 };

// 比賽報名收款／退費（共用：賽事頁 + 待辦頁）
// props: action 'pay'|'refund', reg {id,memberName,divisionName,paymentMethod,bankLastFive,paymentDate,registrationFee}
//        onClose(), onDone(message)
export default function CompetitionActionModal({ action, reg, onClose, onDone }) {
  const [amount, setAmount] = useState(action === 'pay' ? (reg.registrationFee?.toString() || '') : '0');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true); setError('');
    try {
      if (action === 'pay') {
        await confirmCompetitionPayment(reg.id, { amount: Number(amount) });
        onDone('已確認收款');
      } else {
        await refundCompetitionRegistration(reg.id, { refundAmount: Number(amount), reason });
        onDone('退費已處理');
      }
    } catch (err) { setError(err.response?.data?.message || '操作失敗'); setSaving(false); }
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
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>退費原因</label>
          <input style={inp} value={reason} onChange={e => setReason(e.target.value)}/>
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
    </Modal>
  );
}
