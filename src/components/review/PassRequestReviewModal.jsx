import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import Modal from '../Modal';
import { approvePassRequest, rejectPassRequest, getPassRefundPreview } from '../../api/passAdjustments';

const fmtTs = (ts) => ts?._seconds ? dayjs(ts._seconds * 1000).format('YYYY-MM-DD HH:mm') : '—';

// 定期票展延／退費／轉讓／課程練習期遞延 審核（共用：票券管理頁 + 待辦頁）
// props: request {id,type,memberName,passTypeName,reasonLabel,reasonDetail,evidenceUrl,createdAt,
//                 transferToPhone, courseName,practiceEnd,remainingDays,currentEndDate,proposedEndDate}
//        onClose(), onDone(message)
export default function PassRequestReviewModal({ request, onClose, onDone }) {
  const [extensionMonths, setExtensionMonths] = useState('6');
  const [hasInvoice, setHasInvoice] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);       // 退費計算過程（審核核准前預覽）
  const [previewLoading, setPreviewLoading] = useState(false);
  const [refundAmount, setRefundAmount] = useState('0'); // 實際退款金額（可調整，預設帶入計算出的建議值）
  const [refundSentDate, setRefundSentDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [refundSentLastFive, setRefundSentLastFive] = useState('');

  useEffect(() => {
    if (request.type !== 'refund') return;
    let alive = true;
    setPreviewLoading(true);
    getPassRefundPreview(request.id)
      .then(r => { if (!alive) return; setPreview(r.data.preview); setRefundAmount(String(r.data.preview.netRefund)); })
      .catch(err => { if (alive) setError(err.response?.data?.message || '計算退費金額失敗'); })
      .finally(() => { if (alive) setPreviewLoading(false); });
    return () => { alive = false; };
  }, [request.type, request.id]);

  const approve = async () => {
    if (request.type === 'refund' && !hasInvoice) { setError('退費需先確認會員已提供發票正本'); return; }
    setSaving(true); setError('');
    try {
      const data = request.type === 'refund'
        ? { extensionMonths, hasInvoice, finalRefund: Number(refundAmount), refundSentDate, refundSentLastFive: refundSentLastFive.trim() }
        : { extensionMonths, hasInvoice };
      const res = await approvePassRequest(request.id, data);
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
        <div style={{ color:'#999', fontSize:12, marginTop:6 }}>申請日期：{fmtTs(request.createdAt)}</div>
      </div>

      {request.type === 'extension' && (Number(request.extensionDays) > 0 ? (
        // 新制：會員已填停用期間，後端據此順延（唯讀顯示，核准即生效）
        <div style={{ marginBottom:16, background:'#E6F1FB', borderRadius:8, padding:'10px 12px', fontSize:12.5, color:'#185FA5', lineHeight:1.7 }}>
          會員申請停用期間：<strong>{request.suspendStart} ~ {request.suspendEnd}</strong>（{request.extensionDays} 天）<br/>
          {request.passEndDateAtRequest && (
            <>到期日：{request.passEndDateAtRequest} → <strong>{dayjs(request.passEndDateAtRequest).add(Number(request.extensionDays), 'day').format('YYYY-MM-DD')}</strong></>
          )}
        </div>
      ) : (
        // 舊制相容：無停用期間的舊申請 → 店員填月數
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>展延月數（最長6個月）</label>
          <input type="number" min="1" max="6" value={extensionMonths} onChange={e => setExtensionMonths(e.target.value)}
            style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
        </div>
      ))}

      {request.type === 'refund' && (
        <div style={{ background:'#F0F6FB', border:'0.5px solid #C7DDF0', borderRadius:8, padding:12, marginBottom:16, fontSize:12.5 }}>
          <div style={{ fontWeight:600, color:'#185FA5', marginBottom:6 }}>📐 計算過程</div>
          {previewLoading ? (
            <div style={{ color:'#999' }}>計算中...</div>
          ) : preview ? (
            <div style={{ color:'#444', lineHeight:1.8 }}>
              總天數 {preview.totalDays} 天・剩餘 {preview.remainingDays} 天<br/>
              原價 NT${preview.originalPrice} ÷ {preview.totalDays} 天 ＝ 每日 NT${preview.dailyRate}<br/>
              剩餘價值 NT${preview.grossRefund}（NT${preview.dailyRate} × {preview.remainingDays} 天）− 手續費 NT${preview.fee}<br/>
              建議退費：<strong>NT${preview.netRefund}</strong>
            </div>
          ) : (
            <div style={{ color:'#A32D2D' }}>計算失敗，請重新開啟此視窗</div>
          )}
        </div>
      )}
      {request.type === 'refund' && (
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>實際退款金額</label>
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
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={hasInvoice} onChange={e => setHasInvoice(e.target.checked)} />
            會員已親自持發票正本至櫃檯辦理
          </label>
        </div>
      )}

      {request.type === 'transfer' && (
        <div style={{ marginBottom:16, background:'#E6F1FB', borderRadius:8, padding:'10px 12px', fontSize:12.5, color:'#185FA5', lineHeight:1.7 }}>
          將轉讓至：<strong>{request.transferToName || '（未指定）'}</strong>{request.transferToPhone ? `（電話 ${request.transferToPhone}）` : ''}<br/>
          需收取 NT$300 手續費（請於櫃檯另行收取）。核准前請與會員確認接收對象無誤。
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
