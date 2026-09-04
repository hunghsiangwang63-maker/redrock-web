import { useState } from 'react';
import Modal from '../Modal';
import client from '../../api/client';

// 會員問題諮詢——回覆彈窗（2026-09-02 新增）。顯示會員的完整提問內容供閱讀後回覆；
// 已回覆過的提問（record.status==='replied'）改唯讀顯示既有回覆，不能重複回覆。
export default function InquiryReplyModal({ record, onClose, onDone }) {
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const already = record.status === 'replied';
  const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };

  const submit = async () => {
    if (!reply.trim()) { setError('請填寫回覆內容'); return; }
    setSaving(true); setError('');
    try {
      await client.post(`/member-inquiries/${record.id}/reply`, { reply: reply.trim() });
      onDone('已回覆');
    } catch (err) { setError(err.response?.data?.message || '回覆失敗'); setSaving(false); }
  };

  return (
    <Modal title="會員問題諮詢" onClose={onClose} width={440}>
      <div style={{ background:'#F7F3F3', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
        <div style={{ fontSize:11, color:'#999', marginBottom:4 }}>
          {record.memberName}{record.memberPhone ? `（${record.memberPhone}）` : ''}
          {GYM_LABEL[record.gymId] && <span style={{ marginLeft:8, padding:'1px 7px', borderRadius:6, background:'#F3EEF9', color:'#5B2D8B', fontWeight:600 }}>{GYM_LABEL[record.gymId]}</span>}
        </div>
        <div style={{ fontSize:13, fontWeight:700, color:'#333', marginBottom:6 }}>{record.subject}</div>
        <div style={{ fontSize:12, color:'#555', lineHeight:1.8, whiteSpace:'pre-wrap' }}>{record.content}</div>
      </div>
      {already ? (
        <div style={{ background:'#E6F4EB', borderRadius:10, padding:'12px 14px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#2D7D46', marginBottom:4 }}>已回覆{record.repliedByName ? `（${record.repliedByName}）` : ''}</div>
          <div style={{ fontSize:12, color:'#333', lineHeight:1.8, whiteSpace:'pre-wrap' }}>{record.reply}</div>
        </div>
      ) : (
        <>
          <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>回覆內容</label>
          <textarea value={reply} onChange={e => setReply(e.target.value)} rows={5}
            placeholder="請輸入回覆內容，會員會在「問題諮詢」看到"
            style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:8, border:'0.5px solid #E8D5D5', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', resize:'vertical', fontFamily:'inherit', marginBottom:14 }}/>
          {error && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{error}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={submit} disabled={saving}
              style={{ flex:2, height:40, borderRadius:9, background:'#2D7D46', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {saving ? '送出中...' : '送出回覆'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
