import { useState, useEffect } from 'react';
import client from '../../api/client';
import { getStaffFallTestSignature } from '../../api/fallTests';
import { completeFallTestBooking, returnFallTestBooking } from '../../api/fallTestBookings';

// 站台待辦：墜落測驗待安排 → 檢視 waiver / 同意書副本（可展開看條款＋簽名），登記通過/未通過/退回
const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };

const Row = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '0.5px solid #F5EFEF', fontSize: 13 }}>
    <span style={{ width: 80, color: '#999', flexShrink: 0 }}>{label}</span>
    <span style={{ flex: 1, color: '#1a1a1a', wordBreak: 'break-all' }}>{children}</span>
  </div>
);

// 相容 Firestore Timestamp（_seconds/seconds）、字串、毫秒數
const fmtTime = (t) => {
  if (!t) return null;
  const ms = t._seconds ? t._seconds * 1000
    : t.seconds ? t.seconds * 1000
    : typeof t === 'number' ? t
    : typeof t === 'string' ? Date.parse(t) : NaN;
  if (!ms || isNaN(ms)) return null;
  return new Date(ms).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// 文件區塊：狀態徽章 + 「檢視內容」展開（條款文字快照 + 簽名圖）
function DocBlock({ title, status, doneText, signedAt, content, images, open, onToggle }) {
  const imgs = (images || []).filter(im => im.src);
  return (
    <div style={{ border: '0.5px solid #E8D5D5', borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        {status === 'loading' ? (
          <span style={{ fontSize: 12, color: '#999' }}>載入中…</span>
        ) : status === 'none' ? (
          <span style={{ fontSize: 12, color: '#A32D2D' }}>查無簽署</span>
        ) : (
          <button onClick={onToggle}
            style={{ height: 28, padding: '0 12px', borderRadius: 7, background: open ? '#8B1A1A' : '#FBF5F5', color: open ? '#fff' : '#8B1A1A', border: '0.5px solid #E8D5D5', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            {open ? '收合' : '檢視內容'}
          </button>
        )}
      </div>
      {status === 'done' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 6 }}>
          <span style={{ fontSize: 12, color: '#2D7D46' }}>✓ {doneText}</span>
          {signedAt && <span style={{ fontSize: 11, color: '#999' }}>· 簽署時間 {signedAt}</span>}
        </div>
      )}
      {open && status === 'done' && (
        <div style={{ marginTop: 10 }}>
          {signedAt && (
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>簽署時間：{signedAt}</div>
          )}
          {content ? (
            <div style={{ maxHeight: 200, overflowY: 'auto', background: '#FBF7F7', borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#444' }}>{content}</div>
          ) : (
            <div style={{ fontSize: 12, color: '#999' }}>（無條款文字快照）</div>
          )}
          {imgs.map((im, i) => (
            <div key={i} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: '#6b6b6b', marginBottom: 4 }}>{im.label}</div>
              <img src={im.src} alt={im.label}
                style={{ width: '100%', maxWidth: 320, border: '0.5px solid #eee', borderRadius: 8, background: '#fff' }} />
            </div>
          ))}
          {imgs.length === 0 && (
            <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>（此筆無簽名圖檔，僅文字紀錄）</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FallTestBookingModal({ record, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null);       // null | 'fail' | 'return'
  const [reason, setReason] = useState('');
  const [waiver, setWaiver] = useState(undefined);      // undefined=載入中, null=無
  const [signature, setSignature] = useState(undefined);
  const [openDoc, setOpenDoc] = useState(null);         // 'waiver' | 'consent'
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

  const doReturn = async (r) => {
    setBusy(true); setError('');
    try {
      await returnFallTestBooking(record.id, r);
      onDone?.('已退回申請，會員需重新安排');
    } catch (e) {
      setError(e.response?.data?.message || '退回失敗，請重試');
      setBusy(false);
    }
  };

  const toggle = (key) => setOpenDoc(prev => (prev === key ? null : key));
  const waiverStatus = waiver === undefined ? 'loading' : (waiver && waiver.isComplete ? 'done' : 'none');
  const consentStatus = signature === undefined ? 'loading' : (signature ? 'done' : 'none');

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

        <DocBlock title="風險安全聲明書（Waiver）" status={waiverStatus} doneText="已完成簽署"
          signedAt={fmtTime(waiver?.memberSignedAt)}
          content={waiver?.contentSnapshot?.zh}
          images={[{ label: '會員簽名', src: waiver?.memberSignatureUrl }, { label: '家長/監護人簽名', src: waiver?.parentSignatureUrl }]}
          open={openDoc === 'waiver'} onToggle={() => toggle('waiver')} />
        <DocBlock title="墜落測驗同意書" status={consentStatus} doneText="已簽署同意書"
          signedAt={fmtTime(signature?.signedAt)}
          content={signature?.contentSnapshot?.zh}
          images={[{ label: '會員簽名', src: signature?.signatureData }, { label: `家長/監護人簽名${signature?.guardianName ? `（${signature.guardianName}）` : ''}`, src: signature?.guardianSignatureData }]}
          open={openDoc === 'consent'} onToggle={() => toggle('consent')} />

        {error && <div style={{ background: '#FCEBEB', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#A32D2D', margin: '4px 0 12px' }}>{error}</div>}

        {!mode ? (
          <>
            <div style={{ background: '#FBF5F5', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#854F0B', marginBottom: 14 }}>
              現場完成墜落測驗後登記結果（通過後會員即可入場）。若資料有誤或無法測驗，可「退回申請」讓會員重新安排。
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => setMode('fail')} disabled={busy}
                style={{ flex: 1, height: 42, borderRadius: 8, background: '#fff', border: '0.5px solid #A32D2D', color: '#A32D2D', fontSize: 14, cursor: 'pointer' }}>未通過</button>
              <button onClick={() => submit('passed')} disabled={busy}
                style={{ flex: 2, height: 42, borderRadius: 8, background: busy ? '#9CB9A6' : '#2D7D46', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? '處理中…' : '✓ 通過'}
              </button>
            </div>
            <button onClick={() => setMode('return')} disabled={busy}
              style={{ width: '100%', height: 38, borderRadius: 8, background: '#fff', border: '0.5px solid #E8D5D5', color: '#888', fontSize: 13, cursor: 'pointer' }}>
              ↩ 退回申請（退回會員重新安排）
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {mode === 'fail' ? '未通過原因（選填）' : '退回原因（選填）'}
            </div>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder={mode === 'fail' ? '例：尚未掌握確保動作，需再練習' : '例：資料有誤／今日無法測驗，請重新安排'}
              style={{ width: '100%', borderRadius: 8, border: '0.5px solid #E8D5D5', padding: 10, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setMode(null); setReason(''); }} disabled={busy}
                style={{ flex: 1, height: 42, borderRadius: 8, background: '#f5f5f5', border: 'none', color: '#444', fontSize: 14, cursor: 'pointer' }}>返回</button>
              <button onClick={() => mode === 'fail' ? submit('failed', reason) : doReturn(reason)} disabled={busy}
                style={{ flex: 2, height: 42, borderRadius: 8, background: busy ? '#C99' : '#A32D2D', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? '處理中…' : (mode === 'fail' ? '確認未通過' : '確認退回')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
