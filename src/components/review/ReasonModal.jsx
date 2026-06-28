import { useState } from 'react';
import Modal from '../Modal';

// 通用「填寫原因」彈窗（票券拒絕、體驗取消…）
// props: title, label, placeholder, confirmText, confirmColor (default '#A32D2D'), required (default true),
//        onSubmit(reason) -> Promise (parent 執行 API；成功時請卸載本元件，失敗請 throw 以顯示錯誤), onClose()
export default function ReasonModal({ title, label, placeholder, confirmText = '確認', confirmColor = '#A32D2D', required = true, onSubmit, onClose }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (required && !reason.trim()) { setError('請填寫原因'); return; }
    setSaving(true); setError('');
    try {
      await onSubmit(reason);
    } catch (err) { setError(err.response?.data?.message || '操作失敗'); setSaving(false); }
  };

  return (
    <Modal title={title} onClose={onClose} width={400}>
      {label && <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>{label}</label>}
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder={placeholder}
        style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box', marginBottom:14 }}/>
      {error && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{error}</div>}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onClose} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
        <button onClick={submit} disabled={saving}
          style={{ flex:2, height:40, borderRadius:9, background:confirmColor, color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          {saving ? '處理中...' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
