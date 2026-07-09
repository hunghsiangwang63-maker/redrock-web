import { useState } from 'react';
import client from '../../api/client';

// 轉帳「確認收款」彈窗：顯示完整匯款資訊，按「確認收款」才正式確認
const ORDER_TYPE_LABEL = {
  course: '課程', experience: '體驗', competition: '競賽',
  rental: '器材租借', team_member: '攀岩隊員',
};
const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };

const Row = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '0.5px solid #F5EFEF', fontSize: 13 }}>
    <span style={{ width: 80, color: '#999', flexShrink: 0 }}>{label}</span>
    <span style={{ flex: 1, color: '#1a1a1a', wordBreak: 'break-all' }}>{children}</span>
  </div>
);

export default function TransferConfirmModal({ record, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!record) return null;

  const isCash = record.paymentMethod === 'cash';
  const ts = record.createdAt?._seconds ? new Date(record.createdAt._seconds * 1000) : null;
  const confirm = async () => {
    setBusy(true); setError('');
    try {
      await client.put(`/transfers/${record.id}/confirm`);
      onDone?.('已確認收款');
    } catch (e) {
      setError(e.response?.data?.message || '確認失敗，請重試');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto', border: '0.5px solid #E8D5D5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{isCash ? '💵 確認現金收款' : '🏦 確認轉帳收款'}</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: '#999', fontSize: 18 }}>×</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Row label="會員">{record.memberName || '—'}</Row>
          <Row label="訂單">
            {record.orderName || '—'}
            {record.orderType && <span style={{ marginLeft: 6, fontSize: 11, color: '#185FA5', background: '#E6F1FB', padding: '1px 7px', borderRadius: 6 }}>{ORDER_TYPE_LABEL[record.orderType] || record.orderType}</span>}
          </Row>
          <Row label="金額"><strong style={{ color: '#A32D2D' }}>NT${(record.amount || 0).toLocaleString()}</strong></Row>
          <Row label="付款方式">{isCash ? '現金' : '轉帳'}</Row>
          {!isCash && <Row label="匯款銀行">{record.bankName || <span style={{ color: '#bbb' }}>—</span>}</Row>}
          {!isCash && <Row label="匯款末五碼">{record.bankLastFive ? <strong>{record.bankLastFive}</strong> : <span style={{ color: '#bbb' }}>未填（僅附截圖）</span>}</Row>}
          {!isCash && <Row label="匯款日期">{record.paymentDate || '—'}</Row>}
          <Row label="館別">{GYM_LABEL[record.gymId] || record.gymId || '—'}</Row>
          {ts && <Row label="報名時間">{ts.toLocaleString('zh-TW')}</Row>}
          {!isCash && record.screenshotUrl && (
            <div style={{ paddingTop: 10 }}>
              <a href={record.screenshotUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#185FA5' }}>🖼️ 開啟匯款截圖</a>
              <div style={{ marginTop: 8 }}>
                <img src={record.screenshotUrl} alt="匯款截圖" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, border: '0.5px solid #E8D5D5' }} />
              </div>
            </div>
          )}
        </div>

        {error && <div style={{ background: '#FCEBEB', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#A32D2D', marginBottom: 12 }}>{error}</div>}

        <div style={{ background: '#FBF5F5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#854F0B', marginBottom: 14 }}>
          {isCash ? '請確認已向會員收到現金後再按確認收款。' : '請核對匯款資訊無誤後再確認收款，確認後將開通對應的課程／票券／資格。'}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} disabled={busy}
            style={{ flex: 1, height: 42, borderRadius: 8, background: '#f5f5f5', border: 'none', color: '#444', fontSize: 14, cursor: 'pointer' }}>取消</button>
          <button onClick={confirm} disabled={busy}
            style={{ flex: 2, height: 42, borderRadius: 8, background: busy ? '#9CB9A6' : '#2D7D46', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? '處理中…' : '確認收款'}
          </button>
        </div>
      </div>
    </div>
  );
}
