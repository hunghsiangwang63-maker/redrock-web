import { useState } from 'react';
import Modal from '../Modal';
import { approvePassRequest, rejectPassRequest } from '../../api/passAdjustments';

// 定期票展延／退費／轉讓／課程練習期遞延 審核（共用：票券管理頁 + 待辦頁）
// props: request {id,type,memberName,passTypeName,reasonLabel,reasonDetail,evidenceUrl,
//                 transferToPhone, courseName,practiceEnd,remainingDays,currentEndDate,proposedEndDate}
//        onClose(), onDone(message)
export default function PassRequestReviewModal({ request, onClose, onDone }) {
  const [extensionMonths, setExtensionMonths] = useState('6');
  const [hasInvoice, setHasInvoice] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const approve = async () => {
    if (request.type === 'refund' && !hasInvoice) { setError('退費需先確認會員已提供發票正本'); return; }
    setSaving(true); setError('');
    try {
      const res = await approvePassRequest(request.id, { extensionMonths, hasInvoice });
      onDone(res.data.message || '申請已核准');
    } catch (err) { setError(err.response?.data?.message || '核准失敗'); setSaving(false); }
  };

  const reject = async () => {
    if (!rejectReason.trim()) { setError('請填寫拒絕原因'); return; }
    setSaving(true); setError('');
    try {
      await rejectPassRequest(request.id, rejectReason);
      onDone('已拒絕此申請');
    } catch (err) { setError(err.response?.data?.message || '操作失敗'); setSaving(false); }
  };

  return (
    <Modal title={`審核申請 — ${request.memberName}`} onClose={onClose}>
      <div style={{ background:'#FBF5F5', borderRadius:8, padding:12, marginBottom:16, fontSize:13 }}>
        <div>{request.passTypeName || '定期票'} · {{ extension:'展延', refund:'退費', transfer:'轉讓', course_practice_deferral:'課程練習期遞延' }[request.type] || request.type}申請</div>
        {request.type === 'course_practice_deferral' ? (
          <div style={{ color:'#185FA5', fontSize:12, marginTop:6, background:'#E6F1FB', borderRadius:6, padding:'6px 10px' }}>
            課程：{request.courseName}<br/>
            無限練習期至：{request.practiceEnd}<br/>
            定期票剩餘 {request.remainingDays} 天<br/>
            到期日：{request.currentEndDate} → <strong>{request.proposedEndDate}</strong>
          </div>
        ) : (
          <>
            <div style={{ color:'#999', fontSize:12, marginTop:4 }}>事由：{request.reasonLabel}</div>
            {request.reasonDetail && <div style={{ color:'#999', fontSize:12 }}>補充：{request.reasonDetail}</div>}
            {request.evidenceUrl && <a href={request.evidenceUrl} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'#185FA5', display:'inline-block', marginTop:6 }}>查看證明文件 →</a>}
          </>
        )}
      </div>

      {request.type === 'extension' && (
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>展延月數（最長6個月）</label>
          <input type="number" min="1" max="6" value={extensionMonths} onChange={e => setExtensionMonths(e.target.value)}
            style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
        </div>
      )}

      {request.type === 'refund' && (
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={hasInvoice} onChange={e => setHasInvoice(e.target.checked)} />
            會員已親自持發票正本至櫃檯辦理
          </label>
          <div style={{ fontSize:11, color:'#999', marginTop:6 }}>系統將自動依剩餘天數比例計算退費金額，扣除NT$600手續費後四捨五入。</div>
        </div>
      )}

      {request.type === 'transfer' && (
        <div style={{ marginBottom:16, fontSize:12, color:'#999' }}>
          將轉讓至電話 {request.transferToPhone} 的會員，需收取NT$300手續費（手續費收取請於櫃檯另行處理）。
        </div>
      )}

      <div style={{ marginBottom:16 }}>
        <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>若拒絕，請填寫原因</label>
        <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="僅拒絕時需填寫"
          style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
      </div>

      {error && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{error}</div>}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={reject} disabled={saving}
          style={{ flex:1, height:42, borderRadius:9, border:'0.5px solid #A32D2D', background:'none', color:'#A32D2D', fontSize:13, cursor:'pointer' }}>
          拒絕
        </button>
        <button onClick={approve} disabled={saving}
          style={{ flex:2, height:42, borderRadius:9, background:'#2D7D46', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          {saving ? '處理中...' : '核准'}
        </button>
      </div>
    </Modal>
  );
}
