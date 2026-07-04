import { useState, useEffect } from 'react';
import client from '../../api/client';
import { getStaffFallTestSignature } from '../../api/fallTests';
import { completeFallTestBooking } from '../../api/fallTestBookings';

// 站台待辦：墜落測驗待安排 → 檢視 waiver / 同意書副本，登記「通過 / 未通過」
const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };

const Row = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '0.5px solid #F5EFEF', fontSize: 13 }}>
    <span style={{ width: 80, color: '#999', flexShrink: 0 }}>{label}</span>
    <span style={{ flex: 1, color: '#1a1a1a', wordBreak: 'break-all' }}>{children}</span>
  </div>
);

export default function FallTestBookingModal({ record, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failMode, setFailMode] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [waiver, setWaiver] = useState(undefined);      // undefined=載入中, null=無
  const [signature, setSignature] = useState(undefined);
  const memberId = record?.memberId;

  useEffect(() => {
    if (!memberId) return;
    client.get(`/members/${memberId}/waiver`)
      .then(r => setWaiver(r.data.waiver || null)).catch(() => setWaiver(null));
    getStaffFallTestSignature(memberId)
      .then(r => setSignature(r.data.signature || null)).catch(() => setSignature(null));
  }, [memberId]);

  if (!record) return null;

  const submit = async (result, notes) => {
    setBusy(true); setError('');
    try {
      await completeFallTestBooking(record.id, result, notes);
      onDone?.(result === 'passed' ? '已登記：測驗通過' : '已登記：測驗未通過');
    } catch (e) {
      setError(e.response?.data?.message || '登記失敗，請重試');
      setBusy(false);
    }
  };

  const CopyBlock = ({ title, state, imgSrc, doneText }) => (
    <div style={{ border: '0.5px solid #E8D5D5', borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {state === undefined ? (
        <div style={{ fontSize: 12, color: '#999' }}>載入中…</div>
      ) : state === null ? (
        <div style={{ fontSize: 12, color: '#A32D2D' }}>查無簽署副本</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#2D7D46', marginBottom: imgSrc ? 8 : 0 }}>✓ {doneText}</div>
          {imgSrc && (
            <a href={imgSrc} target="_blank" rel="noreferrer">
              <img src={imgSrc} alt={title}
                style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6, border: '0.5px solid #eee', background: '#fff' }} />
            </a>
          )}
        </>
      )}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', border: '0.5px solid #E8D5D5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>🧗 墜落測驗登記</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: '#999', fontSize: 18 }}>×</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Row label="會員">{record.memberName || '—'}</Row>
          <Row label="場館">{GYM_LABEL[record.gymId] || record.gymId || '—'}</Row>
        </div>

        <CopyBlock title="免責聲明書（Waiver）" state={waiver === undefined ? undefined : (waiver && waiver.isComplete ? waiver : null)}
          imgSrc={waiver?.memberSignatureUrl || waiver?.parentSignatureUrl} doneText="已完成簽署" />
        <CopyBlock title="墜落測驗同意書" state={signature}
          imgSrc={signature?.signatureData || signature?.guardianSignatureData} doneText="已簽署同意書" />

        {error && <div style={{ background: '#FCEBEB', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#A32D2D', margin: '4px 0 12px' }}>{error}</div>}

        {!failMode ? (
          <>
            <div style={{ background: '#FBF5F5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#854F0B', marginBottom: 14 }}>
              現場完成墜落測驗後登記結果。通過後會員即可正常入場。
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setFailMode(true)} disabled={busy}
                style={{ flex: 1, height: 42, borderRadius: 8, background: '#fff', border: '0.5px solid #A32D2D', color: '#A32D2D', fontSize: 14, cursor: 'pointer' }}>未通過</button>
              <button onClick={() => submit('passed')} disabled={busy}
                style={{ flex: 2, height: 42, borderRadius: 8, background: busy ? '#9CB9A6' : '#2D7D46', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? '處理中…' : '✓ 通過'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>未通過原因（選填）</div>
            <textarea value={failReason} onChange={e => setFailReason(e.target.value)} rows={3}
              placeholder="例：尚未掌握確保動作，需再練習"
              style={{ width: '100%', borderRadius: 8, border: '0.5px solid #E8D5D5', padding: 10, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setFailMode(false)} disabled={busy}
                style={{ flex: 1, height: 42, borderRadius: 8, background: '#f5f5f5', border: 'none', color: '#444', fontSize: 14, cursor: 'pointer' }}>返回</button>
              <button onClick={() => submit('failed', failReason)} disabled={busy}
                style={{ flex: 2, height: 42, borderRadius: 8, background: busy ? '#C99' : '#A32D2D', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? '處理中…' : '確認未通過'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
