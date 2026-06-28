import { useState } from 'react';
import Modal from '../Modal';
import { approveCourseAdjustment, rejectCourseAdjustment } from '../../api/courseAdjustments';

// 課程退費／暫停申請審核（共用：票券管理頁 + 待辦頁）
// props: request {id,type:'refund'|'pause',memberName,courseName,reason,suggestedRefund,suggestedPercentage}
//        onClose(), onDone(message)
export default function CourseAdjustmentReviewModal({ request, onClose, onDone }) {
  const [refundAmount, setRefundAmount] = useState(request.suggestedRefund?.toString() || '0');
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const approve = async () => {
    setSaving(true); setError('');
    try {
      const data = request.type === 'refund' ? { finalRefund: Number(refundAmount) } : {};
      const res = await approveCourseAdjustment(request.id, data);
      onDone(res.data.message || '已核准');
    } catch (err) { setError(err.response?.data?.message || '操作失敗'); setSaving(false); }
  };

  const reject = async () => {
    setSaving(true); setError('');
    try {
      await rejectCourseAdjustment(request.id, { reason: rejectReason });
      onDone('已拒絕');
    } catch (err) { setError(err.response?.data?.message || '操作失敗'); setSaving(false); }
  };

  return (
    <Modal title={`審核課程申請 — ${request.memberName}`} onClose={onClose}>
      <div style={{ background:'#FBF5F5', borderRadius:8, padding:12, marginBottom:16, fontSize:13 }}>
        <div>{request.courseName} · {{ refund:'退費', pause:'暫停' }[request.type]}申請</div>
        <div style={{ color:'#999', fontSize:12, marginTop:4 }}>原因：{request.reason}</div>
      </div>
      {request.type === 'refund' && (
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>
            實際退款金額（建議 NT${request.suggestedRefund}，{request.suggestedPercentage}%）
          </label>
          <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
            style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
        </div>
      )}
      {request.type === 'pause' && (
        <div style={{ background:'#FFF8E6', border:'0.5px solid #F5D87A', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:12, color:'#8B6914' }}>
          核准後將移除學員課程學員入場資格，並從所有未來場次名單移除
        </div>
      )}
      <div style={{ marginBottom:14 }}>
        <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>若拒絕，請填寫原因</label>
        <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="拒絕原因（選填）"
          style={{ width:'100%', height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box' }}/>
      </div>
      {error && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{error}</div>}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={reject} disabled={saving}
          style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #A32D2D', background:'#fff', color:'#A32D2D', fontSize:13, cursor:'pointer' }}>拒絕</button>
        <button onClick={approve} disabled={saving}
          style={{ flex:2, height:40, borderRadius:9, background:'#2D7D46', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          {saving ? '處理中...' : '核准'}
        </button>
      </div>
    </Modal>
  );
}
