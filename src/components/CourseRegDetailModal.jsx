import dayjs from 'dayjs';
import Modal from './Modal';

// 課程學員「詳細資料」modal（唯讀）：個別學員完整報名/繳費/備註資訊，比照賽事管理報名名單頁的詳細資料彈窗樣式。
// 共用於「會員 → 課程學員」報表（已開課/已過期梯次）與「課程管理 → 報名名單」（尚未開課梯次），資料來源不同、欄位形狀一致。
// props: r {memberName, memberPhone, courseName, range, enrolledAt, fee, paymentMethod, paymentStatus,
//           memberPaidAmount, confirmedAmount, receivedAmount, receivedAmountOverride, bankLastFive,
//           paymentDate, staffNote, healthNote, referralSource, enrollNote}
const COURSE_PAY_LABEL = { pending: '待確認', confirmed: '已確認', pending_confirm: '待確認', transfer_rejected: '已退回', na: '—' };

export default function CourseRegDetailModal({ r, onClose }) {
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
        {Row('實收金額', <span style={{ fontWeight: 600, color: '#8B1A1A' }}>NT${r.receivedAmount ?? 0}{r.receivedAmountOverride != null ? '（管理員已編修）' : ''}</span>)}
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
