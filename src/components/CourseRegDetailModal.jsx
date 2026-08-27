import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import Modal from './Modal';

// 課程學員「詳細資料」modal（唯讀）：個別學員完整報名/繳費/備註資訊，比照賽事管理報名名單頁的詳細資料彈窗樣式。
// 共用於「會員 → 課程學員」報表（已開課/已過期梯次）與「課程管理 → 報名名單」（尚未開課梯次），資料來源不同、欄位形狀一致。
// props: r {memberName, memberPhone, courseName, range, enrolledAt, fee, paymentMethod, paymentStatus,
//           memberPaidAmount, confirmedAmount, receivedAmount, receivedAmountOverride, bankName, bankLastFive,
//           paymentDate, staffNote, healthNote, referralSource, enrollNote}
const COURSE_PAY_LABEL = { pending: '待確認', confirmed: '已確認', pending_confirm: '待確認', transfer_rejected: '已退回', na: '—' };

// editable/onSaveAmount（選填）：管理員在彈窗內編輯實收金額——預設檢視模式，按「✏️ 編輯」才出現輸入框
// （2026-08-27 需求：名單列不再直接編輯、統一進彈窗檢視後按編輯）。不傳＝維持原本純唯讀（CoursesPage 報名名單沿用）。
export default function CourseRegDetailModal({ r, onClose, editable = false, onSaveAmount }) {
  const [editingAmt, setEditingAmt] = useState(false);
  const [amtVal, setAmtVal] = useState(r.receivedAmount ?? 0);
  const [amtSaving, setAmtSaving] = useState(false);
  useEffect(() => { setAmtVal(r.receivedAmount ?? 0); setEditingAmt(false); }, [r.receivedAmount, r.enrollmentId]);
  const saveAmt = async () => {
    const num = Number(amtVal);
    if (isNaN(num) || num < 0) { setAmtVal(r.receivedAmount ?? 0); setEditingAmt(false); return; }
    if (num === (r.receivedAmount ?? 0)) { setEditingAmt(false); return; }
    setAmtSaving(true);
    try { await onSaveAmount(num); setEditingAmt(false); }
    catch (err) { alert(err?.response?.data?.message || '更新實收金額失敗'); setAmtVal(r.receivedAmount ?? 0); }
    finally { setAmtSaving(false); }
  };
  const Row = (k, v) => (
    <div key={k} style={{ display: 'flex', fontSize: 12, padding: '3px 0' }}>
      <div style={{ width: 96, color: '#999', flexShrink: 0 }}>{k}</div>
      <div style={{ color: '#333', wordBreak: 'break-word' }}>{v || '—'}</div>
    </div>
  );
  const sec = r.enrolledAt?._seconds || r.enrolledAt?.seconds || 0;
  return (
    <Modal title={`報名詳細資料 · ${r.memberName || ''}`} onClose={onClose}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
        {r.courseName}{r.range ? `（效期 ${r.range}）` : ''}
      </div>
      <div style={{ borderTop: '0.5px solid #F0E4E4', paddingTop: 6 }}>
        {Row('電話', r.memberPhone)}
        {Row('報名時間', sec ? dayjs(sec * 1000).format('YYYY-MM-DD HH:mm') : '—')}
        {Row('費用', r.fee != null ? `NT$${r.fee}` : '—')}
        {Row('付款方式', r.paymentMethod)}
        {Row('付款狀態', COURSE_PAY_LABEL[r.paymentStatus] || r.paymentStatus)}
        {Row('會員自報金額', r.memberPaidAmount != null ? `NT$${r.memberPaidAmount}` : '—')}
        {Row('店員核對金額', r.confirmedAmount != null ? `NT$${r.confirmedAmount}` : '—')}
        {Row('實收金額', editingAmt ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="number" value={amtVal} disabled={amtSaving} autoFocus
              onChange={e => setAmtVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveAmt(); if (e.key === 'Escape') { setAmtVal(r.receivedAmount ?? 0); setEditingAmt(false); } }}
              style={{ width: 90, height: 28, fontSize: 12, borderRadius: 6, border: '1px solid #E8D5D5', padding: '0 8px', boxSizing: 'border-box' }} />
            <button onClick={saveAmt} disabled={amtSaving}
              style={{ height: 28, padding: '0 10px', borderRadius: 6, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer' }}>{amtSaving ? '儲存中' : '儲存'}</button>
            <button onClick={() => { setAmtVal(r.receivedAmount ?? 0); setEditingAmt(false); }} disabled={amtSaving}
              style={{ height: 28, padding: '0 10px', borderRadius: 6, background: 'none', color: '#666', border: '1px solid #E8D5D5', fontSize: 11, cursor: 'pointer' }}>取消</button>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#8B1A1A' }}>NT${r.receivedAmount ?? 0}{r.receivedAmountOverride != null ? '（管理員已編修）' : ''}</span>
            {editable && onSaveAmount && r.enrollmentId && (
              <button onClick={() => setEditingAmt(true)}
                style={{ height: 24, padding: '0 8px', borderRadius: 6, background: '#fff', color: '#8B1A1A', border: '1px solid #E8D5D5', fontSize: 11, cursor: 'pointer' }}>✏️ 編輯</button>
            )}
          </span>
        ))}
        {Row('匯款銀行', r.bankName)}
        {Row('匯款末五碼', r.bankLastFive)}
        {Row('匯款日期', r.paymentDate)}
        {Row('員工備註', r.staffNote)}
        {Row('健康備註', r.healthNote)}
        {Row('如何得知', r.referralSource)}
        {Row('自訂備註', r.enrollNote)}
      </div>
      <button onClick={onClose} style={{ marginTop: 14, width: '100%', height: 40, borderRadius: 9, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>關閉</button>
    </Modal>
  );
}
