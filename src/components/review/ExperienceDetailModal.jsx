import { useState, useEffect } from 'react';
import client from '../../api/client';
import CoachSelect from '../CoachSelect';

// 體驗預約「確認」彈窗：顯示完整預約資訊 + 指定教練，按「確認預約」正式確認並排課/排班
const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };

const fieldStyle = { width: '100%', height: 38, borderRadius: 8, border: '0.5px solid #E8D5D5', padding: '0 10px', fontSize: 13, background: '#FBF5F5', color: '#1a1a1a', outline: 'none', boxSizing: 'border-box' };

const Row = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '0.5px solid #F5EFEF', fontSize: 13 }}>
    <span style={{ width: 80, color: '#999', flexShrink: 0 }}>{label}</span>
    <span style={{ flex: 1, color: '#1a1a1a', wordBreak: 'break-all' }}>{children}</span>
  </div>
);

export default function ExperienceDetailModal({ record, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [coach, setCoach] = useState({ coachId: record?.coachId || null, coachName: record?.coachName || '' });
  if (!record) return null;

  const participants = Array.isArray(record.participants) ? record.participants : [];
  const confirm = async () => {
    setBusy(true); setError('');
    try {
      await client.post(`/experience-bookings/${record.id}/confirm`,
        coach.coachName ? { coachId: coach.coachId || undefined, coachName: coach.coachName } : {});
      onDone?.(coach.coachName ? '已確認預約並排課/排班' : '已確認預約');
    } catch (e) {
      setError(e.response?.data?.message || '確認失敗，請重試');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460, maxHeight: '88vh', overflowY: 'auto', border: '0.5px solid #E8D5D5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>🧗 體驗預約詳情</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: '#999', fontSize: 18 }}>×</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Row label="聯絡人">{record.contactName || '—'}{record.contactPhone ? `（${record.contactPhone}）` : ''}</Row>
          {record.contactEmail && <Row label="Email">{record.contactEmail}</Row>}
          <Row label="體驗日期">{record.bookingDate || '—'}{record.bookingTime ? ` ${record.bookingTime}` : ''}</Row>
          <Row label="課程類型">{record.courseType || '—'}</Row>
          <Row label="人數">{record.numParticipants || participants.length || '—'} 人</Row>
          <Row label="費用"><strong style={{ color: '#A32D2D' }}>NT${(record.totalFee || 0).toLocaleString()}</strong></Row>
          <Row label="館別">{GYM_LABEL[record.gymId] || record.gymId || '—'}</Row>
          <Row label="匯款銀行">{record.bankName || <span style={{ color: '#bbb' }}>—</span>}</Row>
          <Row label="匯款末五碼">{record.bankLastFive ? <strong>{record.bankLastFive}</strong> : <span style={{ color: '#bbb' }}>—</span>}</Row>
          <Row label="匯款日期">{record.paymentDate || '—'}</Row>
          {record.notes && <Row label="備註">{record.notes}</Row>}
        </div>

        {participants.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6 }}>參加者名單</div>
            <div style={{ border: '0.5px solid #E8D5D5', borderRadius: 8, overflow: 'hidden' }}>
              {participants.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 12px', fontSize: 12, borderTop: i > 0 ? '0.5px solid #F5EFEF' : 'none' }}>
                  <span style={{ color: '#999', width: 18 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{p.name || '—'}</span>
                  <span style={{ color: '#666' }}>{p.idNumber || ''}</span>
                  <span style={{ color: '#999' }}>{p.birthday || ''}{p.nationality ? ` · ${p.nationality}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6 }}>指定教練（選填）</div>
          <CoachSelect gymId={record.gymId} value={coach} onChange={setCoach} style={fieldStyle} />
          <div style={{ fontSize: 11, color: '#999', marginTop: 5 }}>指定後將自動建立體驗課程與該教練當日排班；不指定則僅確認收款。</div>
        </div>

        {error && <div style={{ background: '#FCEBEB', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#A32D2D', marginBottom: 12 }}>{error}</div>}

        <div style={{ background: '#FBF5F5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#854F0B', marginBottom: 14 }}>
          請核對預約與匯款資訊無誤後再確認；確認後將寄送確認通知給會員。
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} disabled={busy}
            style={{ flex: 1, height: 42, borderRadius: 8, background: '#f5f5f5', border: 'none', color: '#444', fontSize: 14, cursor: 'pointer' }}>關閉</button>
          <button onClick={confirm} disabled={busy}
            style={{ flex: 2, height: 42, borderRadius: 8, background: busy ? '#9CB9A6' : '#2D7D46', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? '處理中…' : '確認預約'}
          </button>
        </div>
      </div>
    </div>
  );
}
