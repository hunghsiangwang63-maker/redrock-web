import { useState, useEffect } from 'react';
import MemberLogoutButton from '../../components/MemberLogoutButton';
import MemberBottomNav from '../../components/MemberBottomNav';
import { useNavigate } from 'react-router-dom';
import { memberClient } from '../../api/client';

// 會員端「問題諮詢」（2026-09-02 新增）：常見問題（制式回覆，瀏覽不進員工端待辦）
// ＋自訂提問（自由輸入標題/內容，送出後進員工端待辦頁，待人工回覆；有新回覆時底部導航
// 「問題諮詢」項目會顯示紅點，讀取該筆後自動消失）。

export default function MemberInquiriesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('faq'); // faq | mine
  const [faq, setFaq] = useState([]);
  const [faqLoading, setFaqLoading] = useState(true);
  const [openFaqId, setOpenFaqId] = useState(null);
  const [mine, setMine] = useState([]);
  const [mineLoading, setMineLoading] = useState(true);
  const [openMineId, setOpenMineId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [gymId, setGymId] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState(null);
  const GYM_OPTIONS = [{ id: 'gym-hsinchu', label: '新竹館' }, { id: 'gym-shilin', label: '士林館' }];
  const gymLabel = (id) => GYM_OPTIONS.find(g => g.id === id)?.label || '';

  const loadFaq = () => {
    setFaqLoading(true);
    memberClient.get('/member-inquiries/faq').then(r => setFaq(r.data.items || [])).catch(() => {}).finally(() => setFaqLoading(false));
  };
  const loadMine = () => {
    setMineLoading(true);
    memberClient.get('/member-inquiries/my').then(r => setMine(r.data.items || [])).catch(() => {}).finally(() => setMineLoading(false));
  };
  useEffect(() => { loadFaq(); loadMine(); }, []);

  const openMine = (item) => {
    setOpenMineId(id => id === item.id ? null : item.id);
    // 有回覆且尚未讀取 → 標記已讀，底部導航角標下次載入時消失
    if (item.status === 'replied' && item.unread) {
      memberClient.post(`/member-inquiries/${item.id}/read`).then(() => {
        setMine(list => list.map(x => x.id === item.id ? { ...x, unread: false } : x));
      }).catch(() => {});
    }
  };

  const submit = async () => {
    if (!gymId) { setFormMsg({ ok:false, text:'請選擇相關場館' }); return; }
    if (!subject.trim() || !content.trim()) { setFormMsg({ ok:false, text:'請填寫標題與內容' }); return; }
    setSubmitting(true); setFormMsg(null);
    try {
      await memberClient.post('/member-inquiries', { gymId, subject: subject.trim(), content: content.trim() });
      setGymId(''); setSubject(''); setContent(''); setShowForm(false);
      setFormMsg(null);
      loadMine();
    } catch (e) { setFormMsg({ ok:false, text: e.response?.data?.message || '送出失敗，請稍後再試' }); }
    finally { setSubmitting(false); }
  };

  const statusBadge = (item) => item.status === 'replied'
    ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background: item.unread ? '#FCEBEB' : '#E6F4EB', color: item.unread ? '#A32D2D' : '#2D7D46' }}>{item.unread ? '🔴 有新回覆' : '✓ 已回覆'}</span>
    : <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'#F0EDED', color:'#999' }}>待回覆</span>;

  return (
    <div style={{ minHeight:'100vh', background:'#F7F3F3', paddingBottom:80 }}>
      <MemberLogoutButton />
      <div style={{ background:'linear-gradient(135deg,#8B1A1A,#6B1414)', padding:'18px 16px 16px', color:'#fff' }}>
        <div onClick={() => navigate('/member/home')} style={{ fontSize:13, opacity:.85, cursor:'pointer', marginBottom:8 }}>← 返回首頁</div>
        <div style={{ fontSize:19, fontWeight:700 }}>❓ 問題諮詢</div>
        <div style={{ fontSize:11, opacity:.8, marginTop:3 }}>常見問題快速查詢，或直接提出您的問題</div>
      </div>

      <div style={{ display:'flex', background:'#fff', borderBottom:'0.5px solid #E8D5D5' }}>
        {[{ key:'faq', label:'常見問題' }, { key:'mine', label:'我的提問' }].map(tItem => (
          <div key={tItem.key} onClick={() => setTab(tItem.key)}
            style={{ flex:1, textAlign:'center', padding:'11px 0', fontSize:13, fontWeight:600, cursor:'pointer',
              color: tab === tItem.key ? '#8B1A1A' : '#999', borderBottom: tab === tItem.key ? '2px solid #8B1A1A' : '2px solid transparent' }}>
            {tItem.label}
          </div>
        ))}
      </div>

      {tab === 'faq' && (
        <div style={{ padding:'12px 16px 0' }}>
          {faqLoading ? (
            <div style={{ color:'#999', fontSize:13, padding:24, textAlign:'center' }}>載入中...</div>
          ) : faq.length === 0 ? (
            <div style={{ color:'#999', fontSize:13, padding:24, textAlign:'center', background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5' }}>目前尚無常見問題</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {faq.map(item => {
                const open = openFaqId === item.id;
                return (
                  <div key={item.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                    <div onClick={() => setOpenFaqId(o => o === item.id ? null : item.id)}
                      style={{ padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#333', textAlign:'left', flex:1, paddingRight:8 }}>Q. {item.question}</div>
                      <div style={{ fontSize:14, color:'#999', flexShrink:0 }}>{open ? '−' : '+'}</div>
                    </div>
                    {open && (
                      <div style={{ padding:'0 14px 14px', fontSize:12, color:'#666', lineHeight:1.8, textAlign:'left', borderTop:'0.5px solid #F0EDED', paddingTop:10, whiteSpace:'pre-wrap' }}>
                        A. {item.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ fontSize:11, color:'#999', marginTop:16, marginBottom:8, textAlign:'left' }}>沒有找到您想問的問題？</div>
          <button onClick={() => { setTab('mine'); setShowForm(true); }}
            style={{ width:'100%', height:44, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>
            ✏️ 直接提出問題
          </button>
        </div>
      )}

      {tab === 'mine' && (
        <div style={{ padding:'12px 16px 0' }}>
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              style={{ width:'100%', height:44, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:12 }}>
              ＋ 提出新問題
            </button>
          )}
          {showForm && (
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#333', marginBottom:10, textAlign:'left' }}>提出問題</div>
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4, textAlign:'left' }}>相關場館</label>
                <div style={{ display:'flex', gap:8 }}>
                  {GYM_OPTIONS.map(g => (
                    <button key={g.id} onClick={() => setGymId(g.id)}
                      style={{ flex:1, height:38, borderRadius:8, border: gymId===g.id ? '1.5px solid #8B1A1A' : '1px solid #ddd', background: gymId===g.id ? '#FBF0F0' : '#fff', color: gymId===g.id ? '#8B1A1A' : '#666', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4, textAlign:'left' }}>標題</label>
                <input value={subject} maxLength={60} onChange={e => setSubject(e.target.value)}
                  placeholder="簡短描述您的問題"
                  style={{ width:'100%', boxSizing:'border-box', height:38, padding:'0 12px', borderRadius:8, border:'1px solid #ddd', fontSize:13, background:'#fff' }} />
              </div>
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4, textAlign:'left' }}>內容</label>
                <textarea value={content} maxLength={1000} onChange={e => setContent(e.target.value)}
                  placeholder="請詳細描述您的問題，館方人員會盡快回覆"
                  rows={5}
                  style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:8, border:'1px solid #ddd', fontSize:13, background:'#fff', resize:'vertical', fontFamily:'inherit' }} />
              </div>
              {formMsg && <div style={{ fontSize:12, color:'#A32D2D', marginBottom:8, textAlign:'left' }}>{formMsg.text}</div>}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => { setShowForm(false); setFormMsg(null); }}
                  style={{ flex:1, height:42, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
                <button onClick={submit} disabled={submitting}
                  style={{ flex:2, height:42, borderRadius:9, background: submitting ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor: submitting ? 'default' : 'pointer' }}>
                  {submitting ? '送出中...' : '送出'}
                </button>
              </div>
            </div>
          )}

          {mineLoading ? (
            <div style={{ color:'#999', fontSize:13, padding:24, textAlign:'center' }}>載入中...</div>
          ) : mine.length === 0 ? (
            <div style={{ color:'#999', fontSize:13, padding:24, textAlign:'center', background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5' }}>尚未提出過問題</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {mine.map(item => {
                const open = openMineId === item.id;
                return (
                  <div key={item.id} style={{ background:'#fff', borderRadius:12, border: item.unread ? '1.5px solid #C0392B' : '0.5px solid #E8D5D5', overflow:'hidden' }}>
                    <div onClick={() => openMine(item)} style={{ padding:'12px 14px', cursor:'pointer' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#333', textAlign:'left', flex:1 }}>{item.subject}</div>
                        {statusBadge(item)}
                      </div>
                      <div style={{ fontSize:10, color:'#bbb', marginTop:4, textAlign:'left' }}>
                        {gymLabel(item.gymId) && `${gymLabel(item.gymId)} · `}
                        {item.createdAt?._seconds ? new Date(item.createdAt._seconds * 1000).toLocaleDateString('zh-TW') : ''}
                      </div>
                    </div>
                    {open && (
                      <div style={{ padding:'0 14px 14px', borderTop:'0.5px solid #F0EDED', paddingTop:10 }}>
                        <div style={{ fontSize:12, color:'#666', lineHeight:1.8, textAlign:'left', whiteSpace:'pre-wrap' }}>{item.content}</div>
                        {item.reply && (
                          <div style={{ marginTop:10, background:'#F7F3F3', borderRadius:8, padding:'10px 12px' }}>
                            <div style={{ fontSize:11, fontWeight:700, color:'#8B1A1A', marginBottom:4, textAlign:'left' }}>館方回覆</div>
                            <div style={{ fontSize:12, color:'#444', lineHeight:1.8, textAlign:'left', whiteSpace:'pre-wrap' }}>{item.reply}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <MemberBottomNav navigate={navigate} />
    </div>
  );
}
