import { useState } from 'react';
import { approveTicket } from '../../api/passes';

// 單次入場券「核准」彈窗：顯示票券詳情，按「核准」才正式審核通過
const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };
const PAY_LABEL = { cash: '現金', transfer: '轉帳', linepay: 'LinePay', jkopay: '街口', taiwanpay: '台灣Pay' };

const Row = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '0.5px solid #F5EFEF', fontSize: 13 }}>
    <span style={{ width: 80, color: '#999', flexShrink: 0 }}>{label}</span>
    <span style={{ flex: 1, color: '#1a1a1a', wordBreak: 'break-all' }}>{children}</span>
  </div>
);

const fmtDeadline = (d) => {
  if (!d) return null;
  const ts = d._seconds ? d._seconds * 1000 : (typeof d === 'string' ? Date.parse(d) : null);
  return ts ? new Date(ts).toLocaleString('zh-TW') : null;
};

export default function TicketApprovalModal({ record, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!record) return null;

  const deadline = fmtDeadline(record.approvalDeadline);
  const approve = async () => {
    setBusy(true); setError('');
    try {
      await approveTicket(record.id);
      onDone?.('審核通過');
    } catch (e) {
      setError(e.response?.data?.message || '核准失敗，請重試');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto', border: '0.5px solid #E8D5D5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>🎟️ 單次入場券審核</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: '#999', fontSize: 18 }}>×</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Row label="會員">{record.memberName || '—'}</Row>
          <Row label="金額"><strong style={{ color: '#A32D2D' }}>NT${(record.amount || 0).toLocaleString()}</strong></Row>
          <Row label="付款方式">{PAY_LABEL[record.paymentMethod] || record.paymentMethod || '—'}</Row>
          <Row label="開立日">{record.issuedAt || '—'}</Row>
          <Row label="有效期限">{record.expiresAt || '—'}</Row>
          <Row label="館別">{GYM_LABEL[record.gymId] || record.gymId || '—'}</Row>
          {deadline && <Row label="審核期限">{deadline}</Row>}
        </div>

        {error && <div style={{ background: '#FCEBEB', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#A32D2D', marginBottom: 12 }}>{error}</div>}

        <div style={{ background: '#FBF5F5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#854F0B', marginBottom: 14 }}>
          請確認已收款且資料無誤後再核准；核准後票券即可使用入場。
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} disabled={busy}
            style={{ flex: 1, height: 42, borderRadius: 8, background: '#f5f5f5', border: 'none', color: '#444', fontSize: 14, cursor: 'pointer' }}>取消</button>
          <button onClick={approve} disabled={busy}
            style={{ flex: 2, height: 42, borderRadius: 8, background: busy ? '#9CB9A6' : '#2D7D46', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? '處理中…' : '核准'}
          </button>
        </div>
      </div>
    </div>
  );
}
