import { useState } from 'react';
import Modal from '../Modal';
import { confirmRental, returnRental } from '../../api/rentals';

const inp = { width:'100%', height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };

// 器材租借確認取件／確認歸還（共用：租借頁 + 待辦頁）
// props: action 'confirm'|'return', rental {id,memberName,gymId,pickupDate,returnDate,items,totalRentalFee,totalDeposit}
//        onClose(), onDone(message)
export default function RentalActionModal({ action, rental, onClose, onDone }) {
  const [depositReturned, setDepositReturned] = useState(true);
  const [deductNote, setDeductNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true); setError('');
    try {
      if (action === 'confirm') {
        await confirmRental(rental.id);
        onDone('已確認取件收款');
      } else {
        await returnRental(rental.id, { depositReturned, deductNote });
        onDone('歸還已確認');
      }
    } catch (err) { setError(err.response?.data?.message || '操作失敗'); setSaving(false); }
  };

  return (
    <Modal title={action === 'confirm' ? '確認取件收款' : '確認歸還'} onClose={onClose}>
      <div style={{ background:'#FBF5F5', borderRadius:8, padding:12, marginBottom:16, fontSize:13 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:600 }}>{rental.memberName}</div>
          {rental.paymentMethod === 'cash'
            ? <span style={{ fontSize:11, fontWeight:600, padding:'2px 10px', borderRadius:8, background:'#FFF8E6', color:'#8A5A00' }}>💵 現金</span>
            : rental.paymentMethod === 'transfer'
            ? <span style={{ fontSize:11, fontWeight:600, padding:'2px 10px', borderRadius:8, background:'#E6F1FB', color:'#185FA5' }}>🏦 轉帳</span>
            : null}
        </div>
        <div style={{ color:'#666', fontSize:12, marginTop:4 }}>
          {rental.gymId==='gym-hsinchu'?'新竹館':'士林館'} ·
          {rental.pickupDate} ～ {rental.returnDate}
        </div>
        <div style={{ marginTop:6 }}>
          {rental.items?.map(i=>`${i.name}×${i.quantity}`).join('　')}
        </div>
        <div style={{ color:'#8B1A1A', fontWeight:600, marginTop:6 }}>
          租金 NT${rental.totalRentalFee}　押金 NT${rental.totalDeposit}
          {rental.paymentMethod === 'transfer' && rental.bankLastFive ? `　末五碼 ${rental.bankLastFive}` : ''}
        </div>
        {rental.paymentMethod === 'cash' && (
          <div style={{ fontSize:12, color:'#8A5A00', marginTop:6 }}>臨櫃現金：請收妥租金＋押金後再按確認。</div>
        )}
        {rental.staffNote && (
          <div style={{ fontSize:12, color:'#854F0B', marginTop:6 }}>📝 {rental.staffNote}（員工備註）</div>
        )}
      </div>
      {action === 'return' && (
        <>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input type="checkbox" checked={depositReturned} onChange={e => setDepositReturned(e.target.checked)} style={{ width:16, height:16 }}/>
              <span style={{ fontSize:13 }}>當場退還押金 NT${rental.totalDeposit}</span>
            </label>
          </div>
          {!depositReturned && (
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>押金扣除原因（留空＝稍後退回，將保留在通知「待退押金」）</label>
              <input style={inp} value={deductNote} onChange={e => setDeductNote(e.target.value)} placeholder="如：器材損壞…（填了＝押金扣除結案）"/>
            </div>
          )}
        </>
      )}
      {error && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{error}</div>}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onClose} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
        <button onClick={submit} disabled={saving}
          style={{ flex:2, height:40, borderRadius:9, background:action === 'confirm' ? '#2D7D46' : '#185FA5', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          {saving ? '處理中...' : action === 'confirm' ? '確認取件收款' : '確認歸還'}
        </button>
      </div>
    </Modal>
  );
}
