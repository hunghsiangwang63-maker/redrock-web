import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import Modal from '../Modal';
import client from '../../api/client';
import { approveCourseAdjustment, rejectCourseAdjustment } from '../../api/courseAdjustments';

const fmtTs = (ts) => ts?._seconds ? dayjs(ts._seconds * 1000).format('YYYY-MM-DD HH:mm') : '—';

// 課程退費／暫停申請審核（共用：票券管理頁 + 待辦頁）
// props: request {id,type:'refund'|'pause',memberName,courseName,reason,suggestedRefund,suggestedPercentage,enrollmentId,
//                 createdAt,paidAmount,actuallyPaid,refundNote}
//        onClose(), onDone(message)
export default function CourseAdjustmentReviewModal({ request, onClose, onDone }) {
  const [refundAmount, setRefundAmount] = useState(request.suggestedRefund?.toString() || '0');
  const [refundSentDate, setRefundSentDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [refundSentLastFive, setRefundSentLastFive] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existingInvoice, setExistingInvoice] = useState(null); // {invoiceNo, amount} | null——退費申請若已開過發票，核准前要警示取回

  // 退費申請才查（暫停不涉及金額/發票）；核准後會自動作廢，這裡先讓審核人員知道要提醒會員交回紙本
  useEffect(() => {
    if (request.type !== 'refund' || !request.enrollmentId) return;
    let alive = true;
    client.get('/invoices/status', { params: { sourceType: 'course', refId: request.enrollmentId } })
      .then(r => { if (alive && r.data.invoiceNo) setExistingInvoice(r.data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [request.type, request.enrollmentId]);

  const approve = async () => {
    setSaving(true); setError('');
    try {
      const data = request.type === 'refund'
        ? { finalRefund: Number(refundAmount), refundSentDate, refundSentLastFive: refundSentLastFive.trim() }
        : {};
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
        <div style={{ color:'#999', fontSize:12, marginTop:4 }}>申請日期：{fmtTs(request.createdAt)}</div>
      </div>
      {request.type === 'refund' && (
        <div style={{ background:'#F0F6FB', border:'0.5px solid #C7DDF0', borderRadius:8, padding:12, marginBottom:16, fontSize:12.5 }}>
          <div style={{ fontWeight:600, color:'#185FA5', marginBottom:6 }}>📐 計算過程</div>
          <div style={{ color:'#444', lineHeight:1.8 }}>
            已繳金額：NT${request.paidAmount ?? '—'}
            {request.actuallyPaid != null && request.actuallyPaid !== request.paidAmount && <>（分期實收 NT${request.actuallyPaid}）</>}
            <br/>
            {request.refundNote || '（無詳細計算過程）'}
            <br/>
            建議退費：NT${request.suggestedRefund}（{request.suggestedPercentage}%）
          </div>
        </div>
      )}
      {request.type === 'refund' && (
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>
            實際退款金額（建議 NT${request.suggestedRefund}，{request.suggestedPercentage}%）
          </label>
          <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
            style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
        </div>
      )}
      {request.type === 'refund' && (
        <div style={{ display:'flex', gap:10, marginBottom:16 }}>
          <div style={{ flex:1 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>退款日期</label>
            <input type="date" value={refundSentDate} onChange={e => setRefundSentDate(e.target.value)}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ flex:1 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>退款帳號後五碼</label>
            <input value={refundSentLastFive} onChange={e => setRefundSentLastFive(e.target.value)} maxLength={5} placeholder="選填"
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
        </div>
      )}
      {request.type === 'refund' && (
        <div style={{ background:'#FBF5F5', borderRadius:8, padding:12, marginBottom:16, fontSize:13 }}>
          <div style={{ fontWeight:600, marginBottom:6 }}>🏦 退款指定帳戶</div>
          {request.refundBankCode || request.refundAccount ? (
            <div style={{ color:'#444', lineHeight:1.8 }}>
              {request.refundBankCode}{request.refundBankName ? `（${request.refundBankName}）` : ''} · {request.refundAccount}
              {request.refundAccountName && <div>戶名：{request.refundAccountName}</div>}
            </div>
          ) : (
            <div style={{ color:'#999' }}>會員未填寫（可能尚未實際付款、無款可退）</div>
          )}
        </div>
      )}
      {request.type === 'pause' && (
        <div style={{ background:'#FFF8E6', border:'0.5px solid #F5D87A', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:12, color:'#8B6914' }}>
          核准後將移除學員課程學員入場資格，並從所有未來場次名單移除
        </div>
      )}
      {existingInvoice && (
        <div style={{ background:'#FCEBEB', border:'1px solid #A32D2D33', borderRadius:8, padding:14, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#A32D2D', marginBottom:6 }}>⚠️ 務必取回原列印發票</div>
          <div style={{ fontSize:12, color:'#444', lineHeight:1.7 }}>
            這筆課程費用已列印過發票，核准退費後系統會自動把它作廢（號碼不會重複使用），
            但<strong>紙本仍在會員手上</strong>——請務必聯繫會員取回，避免流出已失效的發票。
          </div>
          <div style={{ marginTop:8, fontSize:16, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace' }}>{existingInvoice.invoiceNo}</div>
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
