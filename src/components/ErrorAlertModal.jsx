// 通知彈窗（全會員頁共用）：成功/錯誤訊息一律彈窗顯示（取代原頂部橫幅，數秒消失易被忽略）。
// 用法：const [alertModal, setAlertModal] = useState(null);
//       showMsg → setAlertModal({ message, type: 'ok'|'red' }); render <ErrorAlertModal modal={alertModal} onClose={() => setAlertModal(null)} />
export default function ErrorAlertModal({ modal, onClose }) {
  if (!modal) return null;
  const kind = modal.type === 'red' ? 'red' : modal.type === 'orange' ? 'orange' : 'ok';
  const title = modal.title || (kind === 'ok' ? '✅ 完成' : kind === 'orange' ? '⚠️ 提醒' : '⚠️ 無法完成操作');
  const color = kind === 'ok' ? '#2D7D46' : kind === 'orange' ? '#B26A00' : '#A32D2D';
  const btn = kind === 'ok' ? '#2D7D46' : kind === 'orange' ? '#B26A00' : '#8B1A1A';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '24px 22px', width: 320, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color, marginBottom: 8, textAlign: 'left' }}>{title}</div>
        <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7, marginBottom: 20, textAlign: 'left', whiteSpace: 'pre-wrap' }}>{modal.message}</div>
        <button onClick={onClose}
          style={{ width: '100%', height: 44, borderRadius: 12, background: btn, color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>知道了</button>
      </div>
    </div>
  );
}
