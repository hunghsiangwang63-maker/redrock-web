import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import Modal from '../Modal';
import client from '../../api/client';
import { confirmCompetitionPayment, rejectCompetitionPayment, refundCompetitionRegistration, getCompetitionRefundPreview } from '../../api/competitions';

const inp = { width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };
const lbl = { fontSize:12, color:'#666', display:'block', marginBottom:5 };
const fmtTs = (ts) => ts?._seconds ? dayjs(ts._seconds * 1000).format('YYYY-MM-DD HH:mm') : '—';

// 比賽報名收款／退費（共用：賽事頁 + 待辦頁）
// props: action 'pay'|'refund', reg {id,memberName,divisionName,paymentMethod,bankLastFive,paymentDate,registrationFee,
//        paidAmount,cancelledAt,refundBankCode,refundBankName,refundAccount,refundAccountName}
//        onClose(), onDone(message)
export default function CompetitionActionModal({ action, reg, onClose, onDone }) {
  // 退費預設帶入實際已收金額（多為全額退），可再手動改成部分退款
  const [amount, setAmount] = useState(action === 'pay' ? (reg.registrationFee?.toString() || '') : ((reg.paidAmount || reg.registrationFee || '')?.toString() || '0'));
  const [reason, setReason] = useState('');
  const [refundSentDate, setRefundSentDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [refundSentLastFive, setRefundSentLastFive] = useState('');
  const [staffNote, setStaffNote] = useState(reg.staffNote || ''); // 員工內部備註（報名者看不到）
  const [rejectReason, setRejectReason] = useState('');            // 退回原因（報名者看得到，必填）
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existingInvoice, setExistingInvoice] = useState(null); // {invoiceNo, amount} | null——退費若已開過發票，處理前要警示取回
  const [refundPreview, setRefundPreview] = useState(null); // 退費政策計算過程（依實際取消日回溯套用分級政策）
  const [previewLoading, setPreviewLoading] = useState(false);

  // 退費才查（收款不涉及發票作廢）；退費處理後會自動作廢，這裡先讓經手人知道要提醒會員交回紙本
  useEffect(() => {
    if (action !== 'refund' || !reg.id) return;
    let alive = true;
    client.get('/invoices/status', { params: { sourceType: 'competition', refId: reg.id } })
      .then(r => { if (alive && r.data.invoiceNo) setExistingInvoice(r.data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [action, reg.id]);

  // 退費才查政策計算過程；有匹配到政策段落才用計算出的建議金額覆蓋預設帶入的全額
  useEffect(() => {
    if (action !== 'refund' || !reg.id) return;
    let alive = true;
    setPreviewLoading(true);
    getCompetitionRefundPreview(reg.id)
      .then(r => {
        if (!alive) return;
        setRefundPreview(r.data.preview);
        if (r.data.preview.matchedDeadline) setAmount(String(r.data.preview.estimate));
      })
      .catch(() => {})
      .finally(() => { if (alive) setPreviewLoading(false); });
    return () => { alive = false; };
  }, [action, reg.id]);

  const submit = async () => {
    setSaving(true); setError('');
    try {
      if (action === 'pay') {
        await confirmCompetitionPayment(reg.id, { amount: Number(amount), staffNote });
        onDone('已確認收款');
      } else {
        await refundCompetitionRegistration(reg.id, { refundAmount: Number(amount), reason, refundSentDate, refundSentLastFive: refundSentLastFive.trim() });
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
            <div><span style={{ color:'#999' }}>申請日期：</span>{fmtTs(reg.cancelledAt)}</div>
            <div><span style={{ color:'#999' }}>已收金額：</span>NT${reg.paidAmount || reg.registrationFee || '—'}</div>
            <div><span style={{ color:'#999' }}>戶名：</span>{reg.refundAccountName || '—'}</div>
            <div><span style={{ color:'#999' }}>銀行：</span>{reg.refundBankCode ? `(${reg.refundBankCode}) ` : ''}{reg.refundBankName || '—'}</div>
            <div><span style={{ color:'#999' }}>帳號：</span>{reg.refundAccount || '—'}</div>
          </div>
        </div>
      )}
      {action === 'refund' && (
        <div style={{ background:'#F0F6FB', border:'0.5px solid #C7DDF0', borderRadius:8, padding:12, marginBottom:14, fontSize:12.5 }}>
          <div style={{ fontWeight:600, color:'#185FA5', marginBottom:6 }}>📐 退費政策計算過程</div>
          {previewLoading ? (
            <div style={{ color:'#999' }}>計算中...</div>
          ) : !refundPreview || refundPreview.policies.length === 0 ? (
            <div style={{ color:'#999' }}>此賽事未設定退費政策，請依實際情形手動填寫退款金額</div>
          ) : (
            <div style={{ color:'#444', lineHeight:1.8 }}>
              {refundPreview.policies.map((p, i) => (
                <div key={i}>
                  • {p.deadline} 前取消：{p.rule === 'full_minus_admin' ? `全額退（扣行政費 NT$${p.adminFee || 0}）` : p.rule === 'half_minus_admin' ? `50% 退（扣行政費 NT$${p.adminFee || 0}）` : '不予退費'}
                </div>
              ))}
              <div>• {refundPreview.policies[refundPreview.policies.length - 1]?.deadline} 之後取消：不予退費</div>
              <div style={{ marginTop:6 }}>
                實際取消日 {refundPreview.cancelDate || '—'} → {refundPreview.matchedDeadline ? refundPreview.ruleLabel : '已逾全部政策期限，不予退費'}
              </div>
              <div style={{ marginTop:4, fontWeight:700 }}>建議退費：NT${refundPreview.estimate}（報名費 NT${refundPreview.registrationFee}）</div>
            </div>
          )}
        </div>
      )}
      {action === 'refund' && (
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>退費原因</label>
          <input style={inp} value={reason} onChange={e => setReason(e.target.value)}/>
        </div>
      )}
      {action === 'refund' && (
        <div style={{ display:'flex', gap:10, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <label style={lbl}>退款日期</label>
            <input type="date" style={inp} value={refundSentDate} onChange={e => setRefundSentDate(e.target.value)}/>
          </div>
          <div style={{ flex:1 }}>
            <label style={lbl}>退款帳號後五碼</label>
            <input style={inp} value={refundSentLastFive} onChange={e => setRefundSentLastFive(e.target.value)} maxLength={5} placeholder="選填"/>
          </div>
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
