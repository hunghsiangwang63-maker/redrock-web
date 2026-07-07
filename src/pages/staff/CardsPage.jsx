import { useState } from 'react';
import { useAuth } from '../../store/authStore';
import { searchMembers } from '../../api/members';
import {
  getMemberDiscountCards, purchaseDiscountCard, bindDiscountCard,
  discountCardTransferPreview, transferDiscountCard,
  getMemberBlackCards, bindBlackCard,
  blackCardTransferPreview, transferBlackCard,
  getMemberBonuses, getOutgoingTransfers, cancelCardTransfer,
} from '../../api/cards';
import dayjs from 'dayjs';

const Tag = ({ type='ok', children }) => {
  const s = { ok:{bg:'#E6F4EB',color:'#2D7D46'}, red:{bg:'#FCEBEB',color:'#A32D2D'}, warn:{bg:'#FAEEDA',color:'#854F0B'}, blue:{bg:'#E6F1FB',color:'#185FA5'}, gray:{bg:'#F0EDED',color:'#666'}, rr:{bg:'#F5E8E8',color:'#8B1A1A'} };
  const st = s[type]||s.ok;
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:st.bg, color:st.color }}>{children}</span>;
};

const Modal = ({ title, onClose, children, width=480 }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(3px)' }}>
    <div style={{ background:'#fff', borderRadius:16, padding:24, width, maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto', border:'1px solid #E8D5D5' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:600 }}>{title}</div>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const MemberSearch = ({ onSelect, label='搜尋會員' }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const search = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    const res = await searchMembers(q.trim());
    setResults(res.data.members || []);
  };
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>{label}</label>
      <form onSubmit={search} style={{ display:'flex', gap:8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="姓名或電話..."
          style={{ flex:1, height:36, borderRadius:8, border:'1px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}/>
        <button type="submit" style={{ height:36, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>搜尋</button>
      </form>
      {results.length > 0 && (
        <div style={{ border:'1px solid #E8D5D5', borderRadius:8, overflow:'hidden', marginTop:6 }}>
          {results.map(m => (
            <div key={m.id} onClick={() => { onSelect(m); setResults([]); setQ(m.name); }}
              style={{ padding:'9px 12px', cursor:'pointer', fontSize:13, borderBottom:'1px solid #F5EFEF', display:'flex', gap:8, alignItems:'center' }}
              onMouseEnter={e => e.currentTarget.style.background='#FBF5F5'}
              onMouseLeave={e => e.currentTarget.style.background='#fff'}>
              <div style={{ width:26, height:26, borderRadius:'50%', background:'#F5E8E8', color:'#8B1A1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600 }}>{m.name[0]}</div>
              <div><div style={{ fontWeight:500 }}>{m.name}</div><div style={{ fontSize:11, color:'#999' }}>{m.phone}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── 優惠卡區塊 ────────────────────────────────────────────────────
function DiscountCards({ member, cards, onRefresh }) {
  const { staff, operator } = useAuth();
  const isManager = ['super_admin', 'gym_manager'].includes(staff?.role);
  const canBind = isManager || !!operator;   // 轉入優惠卡 = Group A（值班/管理員）
  const canPurchase = isManager;             // 購買(新增)優惠卡 = Group B（僅管理員）
  const [showBuy, setShowBuy] = useState(false);
  const [showBind, setShowBind] = useState(false);
  const [bindForm, setBindForm] = useState({ barcode:'', remainingCredits:'' });
  const [showTransfer, setShowTransfer] = useState(null);
  const [preview, setPreview] = useState(null);
  const [transferForm, setTransferForm] = useState({ toMember:null, credits:1 });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleBuy = async () => {
    setLoading(true);
    try {
      await purchaseDiscountCard({ memberId: member.id, price: 600 });
      setMsg('優惠卡購買成功！');
      setShowBuy(false);
      onRefresh();
    } catch (e) { setMsg(e.response?.data?.message || '購買失敗'); }
    finally { setLoading(false); }
  };

  const handleBind = async () => {
    if (!bindForm.remainingCredits || parseInt(bindForm.remainingCredits) < 1) { setMsg('請輸入剩餘次數（至少 1）'); return; }
    if (parseInt(bindForm.remainingCredits) > 10) { setMsg('優惠卡剩餘次數上限為 10'); return; }
    setLoading(true);
    try {
      await bindDiscountCard({ memberId: member.id, remainingCredits: parseInt(bindForm.remainingCredits), barcode: bindForm.barcode || undefined });
      setMsg('優惠卡轉入成功！');
      setShowBind(false); setBindForm({ barcode:'', remainingCredits:'' });
      onRefresh();
    } catch (e) { setMsg(e.response?.data?.message || '轉入失敗'); }
    finally { setLoading(false); }
  };

  const handleTransferPreview = async () => {
    if (!transferForm.toMember || !showTransfer) return;
    try {
      const res = await discountCardTransferPreview(showTransfer.id, {
        toMemberId: transferForm.toMember.id,
        credits: parseInt(transferForm.credits),
      });
      setPreview(res.data);
    } catch (e) { setMsg(e.response?.data?.message || '預覽失敗'); }
  };

  const handleTransfer = async () => {
    setLoading(true);
    try {
      await transferDiscountCard(showTransfer.id, {
        toMemberId: transferForm.toMember.id,
        credits: parseInt(transferForm.credits),
        confirmedExpiry: 'true',
      });
      setMsg('移轉成功！');
      setShowTransfer(null);
      setPreview(null);
      onRefresh();
    } catch (e) { setMsg(e.response?.data?.message || '移轉失敗'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      {msg && <div style={{ background:'#E6F4EB', border:'1px solid #B3DEC0', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#2D7D46', display:'flex', justifyContent:'space-between' }}>{msg}<span style={{cursor:'pointer'}} onClick={() => setMsg('')}>✕</span></div>}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'#6b6b6b' }}>優惠卡（{cards.length} 張有效）</div>
        <div style={{ display:'flex', gap:6 }}>
          {canBind && (
          <button onClick={() => { setShowBind(true); setBindForm({ barcode:'', remainingCredits:'' }); }}
            style={{ height:28, padding:'0 12px', borderRadius:6, background:'#fff', color:'#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:11, cursor:'pointer' }}>
            🎫 轉入優惠卡
          </button>
          )}
          {canPurchase && (
          <button onClick={() => setShowBuy(true)}
            style={{ height:28, padding:'0 12px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>
            ＋ 購買優惠卡
          </button>
          )}
        </div>
      </div>

      {cards.length === 0 ? (
        <div style={{ padding:'16px 0', textAlign:'center', color:'#999', fontSize:12 }}>目前無優惠卡</div>
      ) : cards.map(c => (
        <div key={c.id} style={{ background:'linear-gradient(135deg,#8B1A1A,#C0392B)', borderRadius:10, padding:14, color:'#fff', marginBottom:8, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', right:12, top:10, fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:13, opacity:.16, fontWeight:700, whiteSpace:'nowrap' }}>RedRock 紅石攀岩館</div>
          <div style={{ fontSize:10, opacity:.8, letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>
            {c.source === 'transferred' ? '移轉優惠卡' : c.source === 'migrated' ? '轉入優惠卡' : '優惠卡'}
          </div>
          <div style={{ fontSize:28, fontWeight:700 }}>{c.remainingCredits} 次</div>
          <div style={{ fontSize:11, opacity:.75, marginTop:3 }}>
            {c.expiresAtFormatted ? `有效至 ${c.expiresAtFormatted}` : '無期限'}
            {c.isExpiringSoon && ' ⚠ 即將到期'}
          </div>
          {c.bonusToOriginalOwner && (
            <div style={{ marginTop:6, background:'rgba(255,255,255,.2)', borderRadius:6, padding:'4px 8px', fontSize:11 }}>
              🎁 移轉取得，用完後紅利歸原購買者{c.originalOwnerName ? `「${c.originalOwnerName}」` : ''}
            </div>
          )}
          {c.bonusEarned && !c.bonusUsed && (
            <div style={{ background:'rgba(255,255,255,.2)', borderRadius:6, padding:'3px 8px', fontSize:11, marginTop:6, display:'inline-block' }}>
              🎁 紅利已解鎖
            </div>
          )}
          <div style={{ display:'flex', gap:6, marginTop:10 }}>
            <button onClick={() => { setShowTransfer(c); setPreview(null); setTransferForm({ toMember:null, credits:1 }); }}
              style={{ height:26, padding:'0 10px', borderRadius:5, background:'rgba(255,255,255,.2)', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>
              移轉次數
            </button>
          </div>
        </div>
      ))}

      {/* 轉入 Modal（舊優惠卡轉入、設定剩餘次數）*/}
      {showBind && (
        <Modal title={`轉入優惠卡 — ${member.name}`} onClose={() => setShowBind(false)} width={400}>
          <div style={{ fontSize:12, color:'#888', marginBottom:14, lineHeight:1.6 }}>
            將既有（舊系統／實體）優惠卡轉入本系統並設定剩餘次數。轉入後即可 8 折入場、可移轉；用完（含移轉子卡累計）觸發紅利，與購買卡相同。有效期自轉入日起 1 年。
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>卡片條碼（選填）</label>
            <input value={bindForm.barcode} onChange={e => setBindForm(f => ({ ...f, barcode:e.target.value }))}
              placeholder="可手動輸入或留空" style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', boxSizing:'border-box' }} />
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>剩餘次數</label>
            <input type="number" min={1} max={10} required value={bindForm.remainingCredits}
              onChange={e => setBindForm(f => ({ ...f, remainingCredits:e.target.value }))}
              placeholder="輸入卡片目前剩餘的八折入場次數（上限 10）" style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', boxSizing:'border-box' }} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowBind(false)}
              style={{ flex:1, height:40, borderRadius:9, border:'1px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleBind} disabled={loading}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>{loading ? '處理中...' : '確認轉入'}</button>
          </div>
        </Modal>
      )}

      {/* 購買 Modal */}
      {showBuy && (
        <Modal title="購買優惠卡" onClose={() => setShowBuy(false)} width={400}>
          <div style={{ background:'#FBF5F5', borderRadius:10, padding:14, marginBottom:16, fontSize:13 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ color:'#6b6b6b' }}>購買者</span><span style={{ fontWeight:500 }}>{member.name}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ color:'#6b6b6b' }}>內含</span><span style={{ fontWeight:500 }}>10次八折入場</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ color:'#6b6b6b' }}>有效期</span><span style={{ fontWeight:500 }}>購買日起1年</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', paddingTop:10, borderTop:'1px solid #E8D5D5' }}>
              <span style={{ fontWeight:600 }}>費用</span>
              <span style={{ fontSize:20, fontWeight:700, color:'#8B1A1A' }}>NT$600</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowBuy(false)}
              style={{ flex:1, height:40, borderRadius:9, border:'1px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleBuy} disabled={loading}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {loading ? '處理中...' : '確認購買 NT$600'}
            </button>
          </div>
        </Modal>
      )}

      {/* 移轉 Modal */}
      {showTransfer && (
        <Modal title="移轉優惠卡次數" onClose={() => { setShowTransfer(null); setPreview(null); }}>
          <div style={{ background:'#FBF5F5', borderRadius:8, padding:12, marginBottom:14, fontSize:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ color:'#6b6b6b' }}>目前剩餘</span>
              <span style={{ fontWeight:600 }}>{showTransfer.remainingCredits} 次</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
              <span style={{ color:'#6b6b6b' }}>到期日</span>
              <span style={{ fontWeight:500, color: showTransfer.isExpiringSoon ? '#854F0B' : '#1a1a1a' }}>
                {showTransfer.expiresAtFormatted || '無期限'}
                {showTransfer.isExpiringSoon && ' ⚠'}
              </span>
            </div>
          </div>

          <MemberSearch label="移轉給（接收方）" onSelect={m => setTransferForm(f => ({ ...f, toMember:m }))}/>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>移轉次數</label>
            <input type="number" min={1} max={showTransfer.remainingCredits}
              value={transferForm.credits} onChange={e => setTransferForm(f => ({ ...f, credits: e.target.value }))}
              style={{ width:'100%', height:36, borderRadius:8, border:'1px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>

          {!preview ? (
            <button onClick={handleTransferPreview} disabled={!transferForm.toMember}
              style={{ width:'100%', height:40, borderRadius:9, background: transferForm.toMember ? '#185FA5' : '#C0B8B8', color:'#fff', border:'none', fontSize:13, cursor: transferForm.toMember ? 'pointer' : 'not-allowed' }}>
              預覽到期日
            </button>
          ) : (
            <>
              <div style={{ background:'#FAEEDA', border:'1px solid #FAC775', borderRadius:8, padding:12, marginBottom:12, fontSize:12, color:'#633806' }}>
                {preview.warning || `接收方到期日：${preview.transfer?.receiverExpiresAt}（與原卡相同，不延長）`}
                {preview.bonusNote && <div style={{ marginTop:6, color:'#854F0B' }}>{preview.bonusNote}</div>}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setPreview(null)}
                  style={{ flex:1, height:40, borderRadius:9, border:'1px solid #E8D5D5', background:'none', fontSize:13, cursor:'pointer', color:'#6b6b6b' }}>重新選擇</button>
                <button onClick={handleTransfer} disabled={loading}
                  style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  {loading ? '移轉中...' : `確認移轉 ${transferForm.credits} 次`}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ── 黑卡區塊 ──────────────────────────────────────────────────────
function BlackCards({ member, cards, onRefresh }) {
  const { staff, operator } = useAuth();
  const canBind = ['super_admin', 'gym_manager'].includes(staff?.role) || !!operator; // 黑卡綁定 = Group A
  const [showBind, setShowBind] = useState(false);
  const [showTransfer, setShowTransfer] = useState(null);
  const [bindForm, setBindForm] = useState({ barcode:'', remainingCredits:'' });
  const [preview, setPreview] = useState(null);
  const [transferForm, setTransferForm] = useState({ toMember:null, credits:1 });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleBind = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await bindBlackCard({
        memberId: member.id,
        barcode: bindForm.barcode || undefined,
        remainingCredits: parseInt(bindForm.remainingCredits),
      });
      setMsg('黑卡綁定成功！');
      setShowBind(false);
      onRefresh();
    } catch (e) { setMsg(e.response?.data?.message || '綁定失敗'); }
    finally { setLoading(false); }
  };

  const handleTransferPreview = async () => {
    if (!transferForm.toMember || !showTransfer) return;
    try {
      const res = await blackCardTransferPreview(showTransfer.id, {
        toMemberId: transferForm.toMember.id,
        credits: parseInt(transferForm.credits),
      });
      setPreview(res.data);
    } catch (e) { setMsg(e.response?.data?.message || '預覽失敗'); }
  };

  const handleTransfer = async () => {
    setLoading(true);
    try {
      await transferBlackCard(showTransfer.id, {
        toMemberId: transferForm.toMember.id,
        credits: parseInt(transferForm.credits),
        confirmedExpiry: 'true',
      });
      setMsg('黑卡移轉成功！');
      setShowTransfer(null);
      setPreview(null);
      onRefresh();
    } catch (e) { setMsg(e.response?.data?.message || '移轉失敗'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      {msg && <div style={{ background:'#E6F4EB', border:'1px solid #B3DEC0', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#2D7D46', display:'flex', justifyContent:'space-between' }}>{msg}<span style={{cursor:'pointer'}} onClick={() => setMsg('')}>✕</span></div>}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'#6b6b6b' }}>黑卡（{cards.length} 張有效）</div>
        {canBind && (
        <button onClick={() => setShowBind(true)}
          style={{ height:28, padding:'0 12px', borderRadius:6, background:'#1a1a1a', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>
          🖤 綁定黑卡
        </button>
        )}
      </div>

      {cards.length === 0 ? (
        <div style={{ padding:'16px 0', textAlign:'center', color:'#999', fontSize:12 }}>目前無黑卡</div>
      ) : cards.map(c => (
        <div key={c.id} style={{ background:'#1a1a1a', borderRadius:10, padding:14, color:'#fff', marginBottom:8 }}>
          <div style={{ fontSize:10, opacity:.6, letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>
            黑卡 {c.barcode && `· ${c.barcode}`}
          </div>
          <div style={{ fontSize:28, fontWeight:700 }}>{c.remainingCredits} 次</div>
          <div style={{ fontSize:11, opacity:.6, marginTop:3 }}>
            {c.expiresAtFormatted ? `有效至 ${c.expiresAtFormatted}${c.isExpiringSoon ? ' ⚠' : ''}` : '無期限（原始卡）'}
          </div>
          <div style={{ display:'flex', gap:6, marginTop:10 }}>
            <button onClick={() => { setShowTransfer(c); setPreview(null); setTransferForm({ toMember:null, credits:1 }); }}
              style={{ height:26, padding:'0 10px', borderRadius:5, background:'rgba(255,255,255,.15)', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>
              移轉次數
            </button>
          </div>
        </div>
      ))}

      {/* 綁定 Modal */}
      {showBind && (
        <Modal title={`綁定黑卡 — ${member.name}`} onClose={() => setShowBind(false)} width={400}>
          <form onSubmit={handleBind}>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>黑卡條碼（選填，可手動輸入）</label>
              <input value={bindForm.barcode} onChange={e => setBindForm(f => ({ ...f, barcode:e.target.value }))}
                placeholder="BC-XXXX-XXXXX"
                style={{ width:'100%', height:36, borderRadius:8, border:'1px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>剩餘次數（店員目視確認）</label>
              <input type="number" min={1} max={12} required value={bindForm.remainingCredits}
                onChange={e => setBindForm(f => ({ ...f, remainingCredits:e.target.value }))}
                placeholder="1 - 12"
                style={{ width:'100%', height:36, borderRadius:8, border:'1px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
            <div style={{ background:'#FAEEDA', border:'1px solid #FAC775', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#633806', marginBottom:14 }}>
              ⚠ 請先確認剩餘格數後再輸入，綁定後即以此數字為準
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" onClick={() => setShowBind(false)}
                style={{ flex:1, height:40, borderRadius:9, border:'1px solid #E8D5D5', background:'none', fontSize:13, cursor:'pointer', color:'#6b6b6b' }}>取消</button>
              <button type="submit" disabled={loading}
                style={{ flex:2, height:40, borderRadius:9, background:'#1a1a1a', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                {loading ? '綁定中...' : '確認綁定'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 移轉 Modal */}
      {showTransfer && (
        <Modal title="移轉黑卡次數" onClose={() => { setShowTransfer(null); setPreview(null); }}>
          <div style={{ background:'#1a1a1a', color:'#fff', borderRadius:8, padding:12, marginBottom:14, fontSize:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ opacity:.7 }}>目前剩餘</span>
              <span style={{ fontWeight:600 }}>{showTransfer.remainingCredits} 次</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
              <span style={{ opacity:.7 }}>到期日</span>
              <span>{showTransfer.expiresAtFormatted || '無期限（原始卡）'}</span>
            </div>
          </div>
          <MemberSearch label="移轉給（接收方）" onSelect={m => setTransferForm(f => ({ ...f, toMember:m }))}/>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:5 }}>移轉次數</label>
            <input type="number" min={1} max={showTransfer.remainingCredits}
              value={transferForm.credits} onChange={e => setTransferForm(f => ({ ...f, credits:e.target.value }))}
              style={{ width:'100%', height:36, borderRadius:8, border:'1px solid #E8D5D5', padding:'0 11px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          {!preview ? (
            <button onClick={handleTransferPreview} disabled={!transferForm.toMember}
              style={{ width:'100%', height:40, borderRadius:9, background: transferForm.toMember ? '#185FA5' : '#C0B8B8', color:'#fff', border:'none', fontSize:13, cursor: transferForm.toMember ? 'pointer' : 'not-allowed' }}>
              預覽到期日
            </button>
          ) : (
            <>
              <div style={{ background:'#FAEEDA', border:'1px solid #FAC775', borderRadius:8, padding:12, marginBottom:12, fontSize:12, color:'#633806' }}>
                {preview.warning || (preview.transfer?.isFirstTransfer
                  ? `首次移轉：接收方到期日設為 ${preview.transfer?.receiverExpiresAt}（移轉日起1年）`
                  : `接收方到期日：${preview.transfer?.receiverExpiresAt}（繼承，不延長）`)}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setPreview(null)}
                  style={{ flex:1, height:40, borderRadius:9, border:'1px solid #E8D5D5', background:'none', fontSize:13, cursor:'pointer', color:'#6b6b6b' }}>重新選擇</button>
                <button onClick={handleTransfer} disabled={loading}
                  style={{ flex:2, height:40, borderRadius:9, background:'#1a1a1a', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  {loading ? '移轉中...' : `確認移轉 ${transferForm.credits} 次`}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ── 主頁面 ────────────────────────────────────────────────────────
export default function CardsPage({ embedded = false }) {
  const [member, setMember] = useState(null);
  const [discountCards, setDiscountCards] = useState([]);
  const [blackCards, setBlackCards] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [pendingXfers, setPendingXfers] = useState([]);

  const loadCards = async (m) => {
    const [dc, bc, bn, px] = await Promise.all([
      getMemberDiscountCards(m.id),
      getMemberBlackCards(m.id),
      getMemberBonuses(m.id),
      getOutgoingTransfers(m.id).catch(() => ({ data: { transfers: [] } })),
    ]);
    setDiscountCards(dc.data.cards || []);
    setBlackCards(bc.data.cards || []);
    setBonuses(bn.data.bonuses || []);
    setPendingXfers(px.data.transfers || []);
  };

  const handleCancelXfer = async (t) => {
    try { await cancelCardTransfer(t.id); await loadCards(member); }
    catch (e) { alert(e?.response?.data?.message || '取消失敗'); }
  };

  const handleSelectMember = async (m) => {
    setMember(m);
    await loadCards(m);
  };

  return (
    <div style={{ padding:20, background:'#F7F3F3', minHeight:'100vh' }}>
      {/* 搜尋會員 */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:16, marginBottom:16 }}>
        <MemberSearch label="選擇會員" onSelect={handleSelectMember}/>
        {member && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#FBF5F5', borderRadius:8, fontSize:13 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'#F5E8E8', color:'#8B1A1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600 }}>{member.name[0]}</div>
            <div><div style={{ fontWeight:500 }}>{member.name}</div><div style={{ fontSize:11, color:'#999' }}>{member.phone}</div></div>
          </div>
        )}
      </div>

      {member && pendingXfers.length > 0 && (
        <div style={{ background:'#FFF6E9', border:'1px solid #E0C08A', borderRadius:12, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#854F0B', marginBottom:10 }}>🔄 移轉中（待對方接收，可取消回沖）</div>
          {pendingXfers.map(t => (
            <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'10px 12px', background:'#fff', border:'0.5px solid #E8D5D5', borderRadius:8, marginBottom:8 }}>
              <div style={{ fontSize:13 }}>
                <span style={{ fontWeight:600 }}>{t.cardType === 'black' ? '黑卡' : '優惠卡'} {t.credits} 次</span> → {t.toMemberName || '對方'}
                <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{t.expiresAtISO ? dayjs(t.expiresAtISO).format('MM/DD HH:mm') : ''} 前未接收將自動回沖</div>
              </div>
              <button onClick={() => handleCancelXfer(t)}
                style={{ height:30, padding:'0 12px', borderRadius:7, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:12, cursor:'pointer' }}>取消</button>
            </div>
          ))}
        </div>
      )}

      {member && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {/* 優惠卡 */}
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:16 }}>
            <DiscountCards member={member} cards={discountCards} onRefresh={() => loadCards(member)}/>
          </div>

          {/* 黑卡 + 紅利 */}
          <div>
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:16, marginBottom:12 }}>
              <BlackCards member={member} cards={blackCards} onRefresh={() => loadCards(member)}/>
            </div>

            {/* 紅利 */}
            {bonuses.length > 0 && (
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:16 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'#6b6b6b', marginBottom:10 }}>🎁 免費入場紅利</div>
                {bonuses.map(b => (
                  <div key={b.id} style={{ background:'#E6F4EB', border:'1px solid #B3DEC0', borderRadius:8, padding:12, marginBottom:8 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'#2D7D46' }}>免費入場 1 次</div>
                    <div style={{ fontSize:12, color:'#3B6D11', marginTop:3 }}>
                      {b.expiresAtFormatted ? `有效至 ${b.expiresAtFormatted}` : '無期限'}
                      {b.isExpiringSoon && ' ⚠ 即將到期'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!member && (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:40, textAlign:'center', color:'#999' }}>
          <div style={{ fontSize:36, marginBottom:8, opacity:.3 }}>🃏</div>
          請先搜尋並選擇會員
        </div>
      )}
    </div>
  );
}
