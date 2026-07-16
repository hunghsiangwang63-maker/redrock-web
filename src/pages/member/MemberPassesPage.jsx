import { useState, useEffect } from 'react';
import MemberLogoutButton from '../../components/MemberLogoutButton';
import { t } from '../../utils/memberI18n';
import { useNavigate } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { memberClient } from '../../api/client';
import { getMemberReasons, uploadEvidence, createPassRequest, getMyPassRequests } from '../../api/passAdjustments';
import dayjs from 'dayjs';

const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };
// Firestore Timestamp（{_seconds}/{seconds}）或 ISO 字串 → dayjs；無效回 null
const tsToDay = (ts) => {
  if (!ts) return null;
  const s = ts._seconds ?? ts.seconds;
  const d = dayjs(s ? s * 1000 : ts);
  return d.isValid() ? d : null;
};

const BottomNav = ({ navigate }) => (
  <div style={{ position:'fixed', bottom:0, left:0, right:0, width:'100%', background:'#fff', borderTop:'0.5px solid #E8D5D5', display:'flex', height:60, paddingBottom:'env(safe-area-inset-bottom)', zIndex:50 }}>
    {[
      { icon:'🏠', label:'首頁', path:'/member/home' },
      { icon:'📚', label:'課程總覽', path:'/member/courses' },
      { icon:'🎫', label:'我的票券', path:'/member/passes' },
      { icon:'👤', label:'我的', path:'/member/profile' },
    ].map(n => {
      const active = location.pathname === n.path;
      return (
        <div key={n.path} onClick={() => navigate(n.path)}
          style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, cursor:'pointer', color: active ? '#8B1A1A' : '#999' }}>
          <div style={{ fontSize:20 }}>{n.icon}</div>
          <div style={{ fontSize:10, fontWeight: active ? 600 : 400 }}>{t(n.label)}</div>
        </div>
      );
    })}
  </div>
);

// 移轉 Modal
function TransferModal({ ticket, ticketType, onClose, memberName, onDone }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [success, setSuccess] = useState(false);
  // 優惠卡/黑卡：走新版兩段式，可設定移轉次數
  const isCreditCard = ticketType === 'discount_card' || ticketType === 'black_card';
  const maxCredits = ticket.remainingCredits || 1;
  const [credits, setCredits] = useState(1);
  // 輸入電話即時帶出受贈者姓名（確認用）
  const [recipient, setRecipient] = useState(null); // { found, self, name } | null（次數型用）
  const [looking, setLooking] = useState(false);
  // 整張券：同一手機下的家庭成員（家長+子女），供挑選實際收件人（可轉給指定子女）
  const [recipients, setRecipients] = useState([]);
  const [pickId, setPickId] = useState('');

  useEffect(() => {
    if (!phone || phone.length < 10) { setRecipient(null); return; }
    let cancelled = false;
    setLooking(true);
    const t = setTimeout(async () => {
      try {
        const res = await memberClient.get('/cards/transfers/lookup', { params: { phone } });
        if (!cancelled) setRecipient(res.data);
      } catch { if (!cancelled) setRecipient({ found: false }); }
      finally { if (!cancelled) setLooking(false); }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [phone]);

  // 整張券（紅利/單次券/體驗券）：載入該手機下家庭成員清單，預設家長（後端已家長排前）
  useEffect(() => {
    if (isCreditCard) return;
    if (!phone || phone.length < 10) { setRecipients([]); setPickId(''); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await memberClient.get('/ticket-transfers/recipients', { params: { phone } });
        if (cancelled) return;
        const list = res.data.recipients || [];
        setRecipients(list);
        setPickId(list.length ? list[0].id : '');
      } catch { if (!cancelled) { setRecipients([]); setPickId(''); } }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [phone, isCreditCard]);

  const handleTransfer = async () => {
    if (!phone || phone.length < 10) { setMsg('請輸入有效手機號碼'); return; }
    if (isCreditCard) {
      if (!recipient?.found) { setMsg('查無此手機號碼的會員'); return; }
      if (recipient.self) { setMsg('不能移轉給自己'); return; }
      const c = parseInt(credits);
      if (!c || c < 1 || c > maxCredits) { setMsg(`移轉次數需介於 1 ～ ${maxCredits}`); return; }
    } else {
      if (!pickId) { setMsg('請選擇接收人'); return; }
    }
    setLoading(true);
    try {
      if (isCreditCard) {
        // 新版兩段式：暫扣→對方於會員 App 接收（24h 未接收自動回沖）
        await memberClient.post('/cards/transfers/initiate', {
          cardType: ticketType === 'black_card' ? 'black' : 'discount',
          fromCardId: ticket.id,
          toPhone: phone,
          credits: parseInt(credits),
        });
      } else {
        // 紅利/單次券/體驗券：整張移轉；toMemberId 指定實際收件人（可為子女）
        await memberClient.post('/ticket-transfers/request', {
          ticketType,
          ticketId: ticket.id,
          targetPhone: phone,
          toMemberId: pickId,
        });
      }
      setSuccess(true);
      setMsg('移轉申請已送出，等待對方確認');
      onDone?.();
    } catch (e) {
      setMsg(e.response?.data?.message || '申請失敗');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 20px 40px', width:'100%' }}>
        <div style={{ width:36, height:4, background:'#DDD', borderRadius:2, margin:'0 auto 16px' }}/>
        <div style={{ fontWeight:600, fontSize:16, marginBottom:6 }}>{isCreditCard ? '移轉卡片次數' : '申請票券移轉'}</div>
        <div style={{ fontSize:13, color:'#666', marginBottom:20 }}>移轉後對方需在 24 小時內接收，逾期自動回沖；到期日依票券規則計算</div>
        {success ? (
          <div style={{ background:'#E6F4EB', borderRadius:12, padding:16, textAlign:'center', marginBottom:16 }}>
            <div style={{ fontSize:24, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:14, color:'#2D7D46', fontWeight:500 }}>申請已送出！</div>
            <div style={{ fontSize:13, color:'#666', marginTop:4 }}>等待對方接受移轉</div>
          </div>
        ) : (
          <>
            {isCreditCard && (
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6 }}>移轉次數（剩餘 {maxCredits} 次）</label>
                <input type="number" min={1} max={maxCredits} value={credits}
                  onChange={e => setCredits(e.target.value)}
                  style={{ width:'100%', height:48, borderRadius:12, border:'0.5px solid #E8D5D5', padding:'0 16px', fontSize:16, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              </div>
            )}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6 }}>對方手機號碼</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="0912345678" maxLength={10}
                style={{ width:'100%', height:48, borderRadius:12, border:'0.5px solid #E8D5D5', padding:'0 16px', fontSize:16, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              {/* 接收人：次數型用 cards lookup；整張券用家庭成員清單（可挑子女）*/}
              {phone.length >= 10 && (isCreditCard ? (
                looking ? (
                  <div style={{ fontSize:13, color:'#999', marginTop:8 }}>查詢中…</div>
                ) : recipient?.self ? (
                  <div style={{ fontSize:13, color:'#A32D2D', marginTop:8 }}>⚠ 這是你自己的號碼，不能移轉給自己</div>
                ) : recipient?.found ? (
                  <div style={{ fontSize:13, color:'#2D7D46', marginTop:8, fontWeight:500 }}>✅ 接收人：{recipient.name}</div>
                ) : (
                  <div style={{ fontSize:13, color:'#A32D2D', marginTop:8 }}>查無此手機號碼的會員</div>
                )
              ) : (
                recipients.length === 0 ? (
                  <div style={{ fontSize:13, color:'#A32D2D', marginTop:8 }}>查無此手機號碼的會員</div>
                ) : recipients.length === 1 ? (
                  <div style={{ fontSize:13, color:'#2D7D46', marginTop:8, fontWeight:500 }}>✅ 接收人：{recipients[0].name}{recipients[0].isChildAccount ? '（子女）' : ''}</div>
                ) : (
                  <div style={{ marginTop:8 }}>
                    <div style={{ fontSize:12, color:'#666', marginBottom:6 }}>此號碼有多個帳號，請選擇接收人</div>
                    <select value={pickId} onChange={e => setPickId(e.target.value)}
                      style={{ width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', color:'#1a1a1a', boxSizing:'border-box' }}>
                      {recipients.map(r => <option key={r.id} value={r.id}>{r.name}{r.isChildAccount ? '（子女）' : '（家長）'}</option>)}
                    </select>
                  </div>
                )
              ))}
            </div>
            {msg && <div style={{ background:'#FCEBEB', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#A32D2D', marginBottom:12 }}>{msg}</div>}
            {(() => {
              const pickedName = recipients.find(r => r.id === pickId)?.name;
              const canSend = !loading && (isCreditCard ? (recipient?.found && !recipient?.self) : !!pickId);
              return (
                <button onClick={handleTransfer} disabled={!canSend}
                  style={{ width:'100%', height:50, borderRadius:14, background: canSend?'#8B1A1A':'#ccc', color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor: canSend?'pointer':'not-allowed', marginBottom:10 }}>
                  {loading ? '送出中...' : (isCreditCard ? `確認移轉 ${credits} 次${recipient?.name ? ` 給 ${recipient.name}` : ''}` : `確認申請移轉${pickedName ? ` 給 ${pickedName}` : ''}`)}
                </button>
              );
            })()}
          </>
        )}
        <button onClick={onClose}
          style={{ width:'100%', height:48, borderRadius:14, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:14, cursor:'pointer' }}>關閉</button>
      </div>
    </div>
  );
}

// 票券詳細 Modal
function TicketDetailModal({ ticket, ticketType, onClose, onTransfer, canTransfer = true }) {
  const [history, setHistory] = useState([]);
  const [transfers, setTransfers] = useState([]); // 移轉紀錄（優惠卡/黑卡）
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 載入使用紀錄
    memberClient.get(`/checkin/history?ticketId=${ticket.id}&ticketType=${ticketType}`)
      .then(r => setHistory(r.data.records || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
    // 載入移轉紀錄（僅優惠卡/舊折扣卡/黑卡走卡片移轉）
    if (['discount_card', 'legacy_discount', 'black_card'].includes(ticketType)) {
      memberClient.get(`/cards/transfers/history/${ticket.id}`)
        .then(r => setTransfers(r.data.records || []))
        .catch(() => setTransfers([]));
    }
  }, [ticket.id]);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 20px 0', width:'100%', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
        <div style={{ width:36, height:4, background:'#DDD', borderRadius:2, margin:'0 auto 16px' }}/>
        <div style={{ fontWeight:600, fontSize:16, marginBottom:4 }}>票券詳情</div>
        <div style={{ fontSize:13, color:'#666', marginBottom:16 }}>
          {ticketType === 'discount_card' && `優惠卡 · 剩餘 ${ticket.remainingCredits} 次`}
          {ticketType === 'legacy_discount' && `舊折扣卡 · 剩餘 ${ticket.remainingCredits} 次`}
          {ticketType === 'black_card' && `黑卡 · 剩餘 ${ticket.remainingCredits} 次`}
          {ticketType === 'bonus' && '紅利入場'}
          {ticketType === 'single_entry' && '單日入場券'}
          {ticketType === 'pass' && `${ticket.passTypeName || '定期票'} · ${ticket.startDate || ''}～${ticket.endDate || ''}`}
        </div>

        <div style={{ flex:1, overflowY:'auto', paddingBottom:120 }}>
          {/* 移轉按鈕（僅本人票券可移轉；家庭成員持有的票券唯讀；定期票不走此移轉，另有申請流程） */}
          {['discount_card','legacy_discount','black_card','bonus','single_entry'].includes(ticketType) && (
            canTransfer ? (
              <button onClick={onTransfer}
                style={{ width:'100%', height:46, borderRadius:12, border:'0.5px solid #8B1A1A', background:'#fff', color:'#8B1A1A', fontSize:14, fontWeight:500, cursor:'pointer', marginBottom:16 }}>
                📤 申請移轉給他人
              </button>
            ) : (
              <div style={{ background:'#F5EFEF', borderRadius:12, padding:'12px 14px', fontSize:12, color:'#999', textAlign:'center', marginBottom:16 }}>
                家庭成員持有 · 僅供檢視（移轉需由持有者本人操作）
              </div>
            )
          )}

          {/* 移轉紀錄（優惠卡/黑卡：轉入/轉出，含對方姓名） */}
          {['discount_card','legacy_discount','black_card'].includes(ticketType) && transfers.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontWeight:600, fontSize:13, color:'#666', marginBottom:10 }}>移轉紀錄</div>
              {transfers.map((t, i) => {
                const when = tsToDay(t.at);
                return (
                  <div key={i} style={{ padding:'10px 0', borderBottom:'0.5px solid #F5EFEF', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color: t.direction==='in' ? '#185FA5' : '#8B1A1A' }}>
                        {t.direction === 'in' ? `🔽 由 ${t.memberName || '他人'} 轉入` : `🔼 轉出給 ${t.memberName || '他人'}`}
                      </div>
                      <div style={{ fontSize:12, color:'#999', marginTop:2 }}>{when ? when.format('YYYY/MM/DD HH:mm') : '—'}</div>
                    </div>
                    <span style={{ fontSize:12, fontWeight:600, color: t.direction==='in' ? '#2D7D46' : '#8B1A1A' }}>
                      {t.direction==='in' ? '+' : '-'}{t.credits} 次
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 使用紀錄（定期票＝入場紀錄，無限次不顯示扣次） */}
          {(() => { const unlimited = ticketType === 'pass'; return (<>
          <div style={{ fontWeight:600, fontSize:13, color:'#666', marginBottom:10 }}>{unlimited ? '入場紀錄' : '使用紀錄'}</div>
          {loading ? (
            <div style={{ textAlign:'center', padding:20, color:'#999', fontSize:13 }}>載入中...</div>
          ) : history.length === 0 ? (
            <div style={{ textAlign:'center', padding:20, color:'#ccc', fontSize:13 }}>{unlimited ? '尚無入場紀錄' : '尚無使用紀錄'}</div>
          ) : history.map((r, i) => {
            const cancelled = !!r.isCancelled;
            const when = tsToDay(cancelled ? (r.cancelledAt || r.checkedInAt) : r.checkedInAt);
            const gymName = GYM_LABEL[r.gymId] || r.gymName || r.gymId || '—';
            return (
              <div key={i} style={{ padding:'10px 0', borderBottom:'0.5px solid #F5EFEF', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500 }}>
                    {gymName}
                    {cancelled && <span style={{ fontSize:11, fontWeight:600, color:'#B26A00', marginLeft:6 }}>入場取消{unlimited ? '' : '返還'}</span>}
                  </div>
                  <div style={{ fontSize:12, color:'#999', marginTop:2 }}>
                    {when ? when.format('YYYY/MM/DD HH:mm') : '—'}
                  </div>
                </div>
                {!unlimited && (
                  <span style={{ fontSize:12, fontWeight:600, color: cancelled ? '#2D7D46' : '#8B1A1A' }}>
                    {cancelled ? '+1 次' : '-1 次'}
                  </span>
                )}
                {unlimited && cancelled && <span style={{ fontSize:12, fontWeight:600, color:'#999' }}>已取消</span>}
              </div>
            );
          })}
          </>); })()}
        </div>

        <div style={{ padding:'12px 0 36px', background:'#fff' }}>
          <button onClick={onClose}
            style={{ width:'100%', height:48, borderRadius:12, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:14, cursor:'pointer' }}>關閉</button>
        </div>
      </div>
    </div>
  );
}

export default function MemberPassesPage() {
  const { member } = useMember();
  const navigate = useNavigate();
  const [passes, setPasses] = useState([]);
  const [discountCards, setDiscountCards] = useState([]);
  const [blackCards, setBlackCards] = useState([]);
  const [singleTickets, setSingleTickets] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('passes');
  const [xferIn, setXferIn] = useState([]);   // 待接收的卡片移轉（優惠卡/黑卡次數）
  const [tXferIn, setTXferIn] = useState([]); // 待接收的整張券移轉（紅利/單次券/體驗券）
  const [xferOut, setXferOut] = useState([]); // 我送出的移轉中
  const [xferBusy, setXferBusy] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedTicketType, setSelectedTicketType] = useState(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [msg, setMsg] = useState('');

  // 展延/退費/轉讓申請
  const [myRequests, setMyRequests] = useState([]);
  const [requestingPass, setRequestingPass] = useState(null);
  const [requestType, setRequestType] = useState('extension');
  const [reasons, setReasons] = useState([]);
  const [reasonKey, setReasonKey] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [transferToPhone, setTransferToPhone] = useState('');
  const [transferRecipients, setTransferRecipients] = useState([]); // 轉讓：該電話對應的家庭成員
  const [transferPickId, setTransferPickId] = useState('');          // 選定接收會員 id
  const [transferLookupDone, setTransferLookupDone] = useState(false);
  const [suspendStart, setSuspendStart] = useState(''); // 展延：停用開始日
  const [suspendEnd, setSuspendEnd] = useState('');      // 展延：停用結束日
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');

  // 轉讓：輸入電話 → 查該電話的會員（含家庭成員），供選定接收對象（排除本人）
  useEffect(() => {
    if (requestType !== 'transfer') { setTransferRecipients([]); setTransferPickId(''); setTransferLookupDone(false); return; }
    const phone = (transferToPhone || '').trim();
    if (phone.length < 10) { setTransferRecipients([]); setTransferPickId(''); setTransferLookupDone(false); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await memberClient.get('/ticket-transfers/recipients', { params: { phone } });
        if (cancelled) return;
        const list = (res.data.recipients || []).filter(r => r.id !== member?.id); // 不能轉給自己
        setTransferRecipients(list);
        const selectable = list.filter(r => !r.under13); // 未滿13歲不可接收定期票
        setTransferPickId(selectable.length ? selectable[0].id : '');
        setTransferLookupDone(true);
      } catch { if (!cancelled) { setTransferRecipients([]); setTransferPickId(''); setTransferLookupDone(true); } }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [transferToPhone, requestType, member?.id]);

  // 每筆票券附上持有人資訊（供顯示標籤＋判斷是否本人）
  const tagOwner = (arr, o) => (arr || []).map(x => ({ ...x, _ownerId: o.id, _ownerName: o.name, _isSelf: o.isSelf }));

  // 載入「本人＋子會員」全部票券，攤平合併、每筆標持有人（本人優先，其次依子女順序）
  const loadAll = async () => {
    if (!member) return;
    setLoading(true);
    try {
      let children = [];
      try { children = (await memberClient.get('/members/my/children')).data.children || []; } catch (e) {}
      const owners = [
        { id: member.id, name: member.name, isSelf: true },
        ...children.map(c => ({ id: c.id, name: c.name, isSelf: false })),
      ];
      const perOwner = await Promise.all(owners.map(async (o) => {
        const [p, dc, bc, ldc, se, bn, reqs] = await Promise.all([
          memberClient.get(`/passes/member/${o.id}`).catch(() => ({ data: { passes: [] } })),
          memberClient.get(`/cards/discount/member/${o.id}`).catch(() => ({ data: { cards: [] } })),
          memberClient.get(`/cards/black/member/${o.id}`).catch(() => ({ data: { cards: [] } })),
          memberClient.get(`/cards/legacy-discount/member/${o.id}`).catch(() => ({ data: { cards: [] } })),
          memberClient.get(`/passes/single-entry/member/${o.id}`).catch(() => ({ data: { tickets: [] } })),
          memberClient.get(`/cards/bonus/member/${o.id}`).catch(() => ({ data: { bonuses: [] } })),
          // 定期票異動申請：後端限本人查詢（帶子女 id 會 403）→ 僅本人載入，子女視為無
          o.isSelf ? getMyPassRequests(o.id).catch(() => ({ data: { requests: [] } })) : Promise.resolve({ data: { requests: [] } }),
        ]);
        return {
          passes: tagOwner(p.data.passes, o),
          discount: [...tagOwner(dc.data.cards, o), ...tagOwner(ldc.data.cards, o)],
          black: tagOwner(bc.data.cards, o),
          single: tagOwner(se.data.tickets, o),
          bonus: tagOwner(bn.data.bonuses, o),
          requests: tagOwner(reqs.data.requests, o),
        };
      }));
      setPasses(perOwner.flatMap(x => x.passes));
      setDiscountCards(perOwner.flatMap(x => x.discount));
      setBlackCards(perOwner.flatMap(x => x.black));
      setSingleTickets(perOwner.flatMap(x => x.single));
      setBonuses(perOwner.flatMap(x => x.bonus));
      setMyRequests(perOwner.flatMap(x => x.requests));
    } catch (e) {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!member) return;
    loadAll();
    loadTransfers();
  }, [member]);

  const loadTransfers = async () => {
    if (!member) return;
    try {
      const [inc, out, tPend] = await Promise.all([
        memberClient.get('/cards/transfers/incoming').catch(() => ({ data: { transfers: [] } })),
        memberClient.get('/cards/transfers/outgoing').catch(() => ({ data: { transfers: [] } })),
        memberClient.get('/ticket-transfers/pending').catch(() => ({ data: { transfers: [] } })),
      ]);
      setXferIn(inc.data.transfers || []);
      setXferOut(out.data.transfers || []);
      setTXferIn(tPend.data.transfers || []);
    } catch (e) {}
  };
  // 移轉/接收後重新載入：重跑完整合併（含子女），避免只刷新本人卡而漏掉家庭成員票券
  const reloadCards = async () => { await loadAll(); };
  const acceptXfer = async (t) => {
    setXferBusy(true);
    try { await memberClient.post(`/cards/transfers/${t.id}/accept`, {}); setMsg('已接收，次數已入卡'); await loadTransfers(); await reloadCards(); }
    catch (e) { setMsg(e?.response?.data?.message || '接收失敗'); }
    finally { setXferBusy(false); }
  };
  const cancelXfer = async (t) => {
    setXferBusy(true);
    try { await memberClient.post(`/cards/transfers/${t.id}/cancel`, {}); setMsg('已取消移轉，次數已回沖'); await loadTransfers(); await reloadCards(); }
    catch (e) { setMsg(e?.response?.data?.message || '取消失敗'); }
    finally { setXferBusy(false); }
  };
  const ticketTypeLabel = (ty) => ({ bonus:'紅利入場', single_entry:'單次入場券', discount_card:'優惠卡', legacy_discount_card:'舊優惠卡', black_card:'黑卡' }[ty] || '票券');
  const acceptTicketXfer = async (t) => {
    setXferBusy(true);
    try { await memberClient.post(`/ticket-transfers/${t.id}/accept`, { confirmedExpiry: 'true' }); setMsg('已接收此票券'); await loadTransfers(); await reloadCards(); }
    catch (e) { setMsg(e?.response?.data?.message || '接收失敗'); }
    finally { setXferBusy(false); }
  };
  const rejectTicketXfer = async (t) => {
    setXferBusy(true);
    try { await memberClient.post(`/ticket-transfers/${t.id}/reject`, {}); setMsg('已拒絕此移轉'); await loadTransfers(); }
    catch (e) { setMsg(e?.response?.data?.message || '拒絕失敗'); }
    finally { setXferBusy(false); }
  };
  const cardLabel = (ty) => ty === 'black' ? '黑卡' : '優惠卡';
  const xferDeadline = (iso) => iso ? dayjs(iso).format('MM/DD HH:mm') : '';

  const passStatus = (p) => {
    if (p.status === 'cancelled') return { color:'#999', label:'已取消', bg:'#F0EDED' };
    if (p.endDate < dayjs().format('YYYY-MM-DD')) return { color:'#A32D2D', label:'已過期', bg:'#FCEBEB' };
    const d = dayjs(p.endDate).diff(dayjs(), 'day');
    if (d <= 7) return { color:'#854F0B', label:`剩 ${d} 天`, bg:'#FAEEDA' };
    return { color:'#2D7D46', label:'有效', bg:'#E6F4EB' };
  };

  // 定期票申請狀態：只有「核准(佔用限一次額度)」或「審核中(有待審)」才擋再次申請；
  // 「退回(rejected)」不佔額度、無待審 → 可再次申請（與後端一致）。
  const passRequestState = (passId) => {
    const reqs = myRequests.filter(r => r.passId === passId);
    if (reqs.some(r => r.status === 'approved')) return 'used';
    if (reqs.some(r => r.status === 'pending')) return 'pending';
    return 'none';
  };

  const openRequest = async (pass) => {
    setRequestingPass(pass);
    setRequestType('extension');
    setReasonKey('');
    setReasonDetail('');
    setEvidenceFile(null);
    setTransferToPhone(''); setTransferRecipients([]); setTransferPickId(''); setTransferLookupDone(false);
    setSuspendStart(''); setSuspendEnd('');
    setRequestError('');
    if (reasons.length === 0) {
      try {
        const res = await getMemberReasons();
        setReasons(res.data.reasons || []);
      } catch (e) {}
    }
  };

  const handleSubmitRequest = async () => {
    setRequestError('');
    if (!reasonKey) { setRequestError('請選擇符合的事由'); return; }
    if (!evidenceFile) { setRequestError('請上傳證明文件'); return; }
    if (requestType === 'transfer') {
      if (!transferToPhone.trim()) { setRequestError('請輸入轉讓對象的手機號碼'); return; }
      if (!transferPickId) { setRequestError('請確認轉讓對象（查無此電話的會員或尚未選擇）'); return; }
    }
    // 展延：停用期間驗證（後端仍為權威，前端先友善擋）
    if (requestType === 'extension') {
      const today = dayjs().format('YYYY-MM-DD');
      if (!suspendStart || !suspendEnd) { setRequestError('請填寫停用期間（起訖日）'); return; }
      if (suspendStart < today) { setRequestError('停用開始日不可早於今天'); return; }
      const days = dayjs(suspendEnd).diff(dayjs(suspendStart), 'day');
      if (days <= 0) { setRequestError('停用結束日必須晚於開始日'); return; }
      const origEnd = requestingPass.endDate;
      const newEnd = dayjs(origEnd).add(days, 'day').format('YYYY-MM-DD');
      const maxEnd = dayjs(origEnd).add(6, 'month').format('YYYY-MM-DD');
      if (newEnd > maxEnd) { setRequestError(`展延後到期日（${newEnd}）不可比原到期日（${origEnd}）晚超過 6 個月`); return; }
    }

    setRequestSubmitting(true);
    try {
      setEvidenceUploading(true);
      const formData = new FormData();
      formData.append('file', evidenceFile);
      const uploadRes = await uploadEvidence(formData);
      setEvidenceUploading(false);

      await createPassRequest({
        passId: requestingPass.id,
        memberId: member.id,
        type: requestType,
        reasonKey,
        reasonDetail,
        evidenceUrl: uploadRes.data.url,
        transferToPhone: requestType === 'transfer' ? transferToPhone.trim() : undefined,
        transferToMemberId: requestType === 'transfer' ? transferPickId : undefined,
        suspendStart: requestType === 'extension' ? suspendStart : undefined,
        suspendEnd: requestType === 'extension' ? suspendEnd : undefined,
      });

      setMsg('申請已送出，請等待館方審核');
      setRequestingPass(null);
      const reqs = await getMyPassRequests(member.id);
      setMyRequests(reqs.data.requests || []);
    } catch (err) {
      setRequestError(err.response?.data?.message || '申請失敗，請再試一次');
    } finally {
      setRequestSubmitting(false);
      setEvidenceUploading(false);
    }
  };

  // ── 有效/失效判定（分頁數字只算有效；失效收折疊區）──────────────
  const [expiredOpen, setExpiredOpen] = useState({}); // 各分頁「已失效」展開狀態
  const _today = dayjs().format('YYYY-MM-DD');
  const _notExpired = (raw) => { if (!raw) return true; const d = tsToDay(raw); return d ? d.format('YYYY-MM-DD') >= _today : true; };
  const isValidTicket = (item, type) => {
    switch (type) {
      case 'passes': return item.status === 'active' && (item.endDate || '') >= _today;
      case 'single':  return item.status === 'active' && _notExpired(item.expiresAt);
      case 'discount':
      case 'black':   return item.status !== 'cancelled' && item.isActive !== false && (item.remainingCredits || 0) > 0 && _notExpired(item.expiresAt);
      case 'bonus':   return item.status !== 'used' && item.status !== 'inactive' && item.status !== 'cancelled' && _notExpired(item.expiresAt);
      default: return true;
    }
  };
  const invalidReason = (item, type) => {
    switch (type) {
      case 'passes': return item.status === 'cancelled' ? '已取消' : ((item.endDate || '') < _today ? '已過期' : '已失效');
      case 'single':  return item.status === 'cancelled' ? '已取消' : item.status === 'used' ? '已使用' : (!_notExpired(item.expiresAt) ? '已過期' : '已失效');
      case 'discount':
      case 'black':   return (item.remainingCredits || 0) <= 0 ? '已用完' : (!_notExpired(item.expiresAt) ? '已過期' : (item.status === 'cancelled' || item.isActive === false) ? '已取消' : '已失效');
      case 'bonus':   return item.status === 'used' ? '已使用' : (!_notExpired(item.expiresAt) ? '已過期' : '已失效');
      default: return '已失效';
    }
  };
  const splitValid = (arr, type) => {
    const valid = [], invalid = [];
    (arr || []).forEach(x => (isValidTicket(x, type) ? valid : invalid).push(x));
    return { valid, invalid };
  };
  // 失效再細分：consumed（已消耗、有使用紀錄：已使用/已用完） vs dead（已作廢/過期：已取消/已過期/已失效）
  const splitInvalid = (invalid, type) => {
    const consumed = [], dead = [];
    (invalid || []).forEach(x => (['已使用', '已用完'].includes(invalidReason(x, type)) ? consumed : dead).push(x));
    return { consumed, dead };
  };
  // consumed 區「最近使用在最上」：single/bonus 依 usedAt、discount/black 依 updatedAt（Firestore Timestamp），缺欄位排後
  const sortConsumed = (items, type) => {
    const field = (type === 'discount' || type === 'black') ? 'updatedAt' : 'usedAt';
    const ms = (x) => { const d = tsToDay(x?.[field]); return d ? d.valueOf() : -Infinity; };
    return [...(items || [])].sort((a, b) => ms(b) - ms(a));
  };
  // 折疊區（放分頁底部、預設收合）— 以函式回傳 JSX（避免元件內定義元件的 remount 問題）
  // keySuffix 讓「已使用」與「已失效」兩區各自獨立展開（展開 state key = `${type}:${keySuffix}`）
  const renderCollapseSection = (items, type, keySuffix, title, render) => {
    if (!items || items.length === 0) return null;
    const k = `${type}:${keySuffix}`;
    return (
      <div style={{ marginTop:4 }}>
        <div onClick={() => setExpiredOpen(o => ({ ...o, [k]: !o[k] }))}
          style={{ cursor:'pointer', fontSize:12, color:'#999', padding:'12px 6px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'0.5px solid #E8D5D5' }}>
          <span>{title}（{items.length}）</span>
          <span style={{ color:'#8B1A1A' }}>{expiredOpen[k] ? '收合 ▲' : '展開 ▼'}</span>
        </div>
        {expiredOpen[k] && <div>{items.map(it => render(it))}</div>}
      </div>
    );
  };
  // 失效卡片小標籤（dark：深色卡如優惠卡/黑卡）
  const invalidBadge = (item, type, dark) => (
    <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:10, background: dark ? 'rgba(255,255,255,.22)' : '#F0EDED', color: dark ? '#fff' : '#999' }}>{invalidReason(item, type)}</span>
  );

  const TABS = [
    { key:'passes', label:'定期票', count: splitValid(passes, 'passes').valid.length },
    { key:'discount', label:'優惠卡', count: splitValid(discountCards, 'discount').valid.length },
    { key:'black', label:'黑卡', count: splitValid(blackCards, 'black').valid.length },
    { key:'single', label:'單日券', count: splitValid(singleTickets, 'single').valid.length },
    { key:'bonus', label:'紅利', count: splitValid(bonuses, 'bonus').valid.length },
  ];

  const handleTicketClick = (ticket, type) => {
    setSelectedTicket(ticket);
    setSelectedTicketType(type);
  };

  // 持有人標籤：本人不標；子女顯示「👦 姓名」。dark=true 用於深色卡片（優惠卡/黑卡）
  const ownerTag = (t, dark = false) => (t && t._isSelf === false) ? (
    <span style={{ fontSize:10, fontWeight:600, borderRadius:10, padding:'2px 8px', whiteSpace:'nowrap',
      background: dark ? 'rgba(255,255,255,.22)' : '#E6F1FB', color: dark ? '#fff' : '#185FA5' }}>
      👦 {t._ownerName}
    </span>
  ) : null;

  // ── 卡片 render（有效與失效折疊區共用；dim=失效樣式）──────────────
  const renderPassCard = (p, dim) => {
    const st = passStatus(p);
    const total = dayjs(p.endDate).diff(dayjs(p.startDate), 'day') || 1;
    const used = dayjs().diff(dayjs(p.startDate), 'day');
    const pct = Math.min(100, Math.max(0, (used/total)*100));
    return (
      <div key={p.id} onClick={() => handleTicketClick(p, 'pass')}
        style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12, overflow:'hidden', position:'relative', cursor:'pointer', opacity: dim ? 0.6 : 1 }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:st.color }}/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
          <div><div style={{ fontWeight:600, fontSize:16 }}>{p.passTypeName}</div><div style={{ fontSize:12, color:'#999', marginTop:2 }}>{p.scope === 'shared' ? '全館適用' : '單館'}</div></div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {ownerTag(p)}
            {dim ? invalidBadge(p, 'passes') : <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:st.bg, color:st.color }}>{st.label}</span>}
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#6b6b6b', marginBottom:8 }}><span>{p.startDate}</span><span>～</span><span>{p.endDate}</span></div>
        <div style={{ height:5, background:'#EEE', borderRadius:3, overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:st.color, borderRadius:3 }}/></div>
        {/* 轉入註記：這張票是由他人轉讓進來的 */}
        {p.transferredFrom && (
          <div style={{ marginTop:10, fontSize:11, color:'#185FA5', background:'#E6F1FB', borderRadius:6, padding:'5px 9px', display:'inline-block' }}>
            🔄 由 {p.transferredFromName || '他人'} 轉入{p.transferredAt ? `（${p.transferredAt}）` : ''}
          </div>
        )}
        {p.credits !== null && <div style={{ marginTop:10, fontSize:13, display:'flex', justifyContent:'space-between' }}><span style={{ color:'#6b6b6b' }}>剩餘次數</span><span style={{ fontWeight:600, fontFamily:'monospace', fontSize:16, color:'#8B1A1A' }}>{p.credits} 次</span></div>}
        {!dim && p.status === 'active' && (
          p._isSelf === false ? (
            <div style={{ marginTop:10, fontSize:11, color:'#999', textAlign:'center' }}>家庭成員持有 · 僅供檢視</div>
          ) : (() => {
            const rs = passRequestState(p.id);
            if (rs === 'used') return <div style={{ marginTop:10, fontSize:11, color:'#999', textAlign:'center' }}>已申請過展延/退費/轉讓（限一次）</div>;
            if (rs === 'pending') return <div style={{ marginTop:10, fontSize:11, color:'#854F0B', textAlign:'center' }}>申請審核中，請等待審核結果</div>;
            return (
              <button onClick={(e) => { e.stopPropagation(); openRequest(p); }}
                style={{ width:'100%', marginTop:10, height:34, borderRadius:8, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:12, cursor:'pointer' }}>
                申請展延／退費／轉讓
              </button>
            );
          })()
        )}
        <div style={{ marginTop:8, fontSize:11, color:'#8B1A1A', opacity:.65, textAlign:'right' }}>點擊查看使用紀錄 →</div>
      </div>
    );
  };
  const renderDiscountCard = (c, dim) => (
    <div key={c.id} onClick={() => handleTicketClick(c, c.source === 'legacy' ? 'legacy_discount' : 'discount_card')}
      style={{ background:'linear-gradient(135deg,#8B1A1A,#C0392B)', borderRadius:14, padding:18, color:'#fff', marginBottom:12, position:'relative', overflow:'hidden', cursor:'pointer', opacity: dim ? 0.55 : 1 }}>
      <div style={{ position:'absolute', right:14, top:12, fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:15, opacity:.16, fontWeight:700, whiteSpace:'nowrap' }}>RedRock 紅石攀岩館</div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <div style={{ fontSize:10, opacity:.75, letterSpacing:1 }}>{c.source === 'legacy' ? '舊折扣卡' : c.source === 'transferred' ? '移轉優惠卡' : '優惠卡'}{!dim && c.isExpiringSoon && ' ⚠ 即將到期'}</div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {ownerTag(c, true)}
          {dim && invalidBadge(c, 'discount', true)}
        </div>
      </div>
      <div style={{ fontSize:36, fontWeight:700, marginBottom:4 }}>{c.remainingCredits} <span style={{ fontSize:18, opacity:.8 }}>次</span></div>
      <div style={{ fontSize:12, opacity:.75 }}>{c.expiresAtFormatted ? `有效至 ${c.expiresAtFormatted}` : '無期限'}</div>
      <div style={{ marginTop:12, height:4, background:'rgba(255,255,255,.2)', borderRadius:2, overflow:'hidden' }}><div style={{ height:'100%', width:`${Math.max(0,(c.remainingCredits/10)*100)}%`, background:'rgba(255,255,255,.6)', borderRadius:2 }}/></div>
      <div style={{ marginTop:4, fontSize:11, opacity:.65, display:'flex', justifyContent:'space-between' }}><span>已使用 {Math.max(0, 10 - c.remainingCredits)} 次</span><span>剩餘 {c.remainingCredits}/10</span></div>
      {c.bonusToOriginalOwner && (
        <div style={{ marginTop:8, background:'rgba(255,255,255,.18)', borderRadius:8, padding:'6px 10px', fontSize:11, lineHeight:1.5 }}>
          🎁 此卡由{c.originalOwnerName ? `「${c.originalOwnerName}」` : '原購買者'}移轉，全部次數用完後紅利歸原購買者所有
        </div>
      )}
      <div style={{ marginTop:10, fontSize:11, opacity:.6, textAlign:'right' }}>點擊查看詳情 →</div>
    </div>
  );
  const renderBlackCard = (c, dim) => (
    <div key={c.id} onClick={() => handleTicketClick(c, 'black_card')}
      style={{ background:'linear-gradient(135deg,#1a1a1a,#444)', borderRadius:14, padding:18, color:'#fff', marginBottom:12, position:'relative', overflow:'hidden', cursor:'pointer', opacity: dim ? 0.55 : 1 }}>
      <div style={{ position:'absolute', right:14, top:12, fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:15, opacity:.16, fontWeight:700, whiteSpace:'nowrap' }}>RedRock 紅石攀岩館</div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <div style={{ fontSize:10, opacity:.75, letterSpacing:1 }}>黑卡</div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {ownerTag(c, true)}
          {dim && invalidBadge(c, 'black', true)}
        </div>
      </div>
      <div style={{ fontSize:36, fontWeight:700, marginBottom:4 }}>{c.remainingCredits} <span style={{ fontSize:18, opacity:.8 }}>次</span></div>
      <div style={{ fontSize:12, opacity:.75 }}>{c.expiresAtFormatted ? `有效至 ${c.expiresAtFormatted}` : '無期限'}</div>
      <div style={{ marginTop:12, height:4, background:'rgba(255,255,255,.2)', borderRadius:2, overflow:'hidden' }}><div style={{ height:'100%', width:`${Math.max(0,(c.remainingCredits/12)*100)}%`, background:'rgba(255,255,255,.6)', borderRadius:2 }}/></div>
      <div style={{ marginTop:4, fontSize:11, opacity:.65, display:'flex', justifyContent:'space-between' }}><span>已使用 {Math.max(0, 12 - c.remainingCredits)} 次</span><span>剩餘 {c.remainingCredits}/12</span></div>
      <div style={{ marginTop:10, fontSize:11, opacity:.6, textAlign:'right' }}>點擊查看詳情 →</div>
    </div>
  );
  const renderSingleCard = (t, dim) => (
    <div key={t.id} onClick={() => handleTicketClick(t, 'single_entry')}
      style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', opacity: dim ? 0.6 : 1 }}>
      <div>
        <div style={{ fontWeight:600, fontSize:15 }}>單日入場券</div>
        <div style={{ fontSize:12, color:'#999', marginTop:3 }}>有效至 {(tsToDay(t.expiresAt)?.format('YYYY/MM/DD')) || '—'}</div>
      </div>
      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
        {ownerTag(t)}
        {dim ? invalidBadge(t, 'single') : <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#E6F4EB', color:'#2D7D46' }}>有效</span>}
      </div>
    </div>
  );
  const renderBonusCard = (b, dim) => (
    <div key={b.id} onClick={() => handleTicketClick(b, 'bonus')}
      style={{ background:'#fff', borderRadius:14, border:'1px solid #B3DEC0', padding:16, marginBottom:12, cursor:'pointer', opacity: dim ? 0.6 : 1 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ fontSize:18 }}>🎁</div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {ownerTag(b)}
          {dim ? invalidBadge(b, 'bonus') : <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background: b.isExpiringSoon ? '#FAEEDA' : '#E6F4EB', color: b.isExpiringSoon ? '#854F0B' : '#2D7D46' }}>{b.isExpiringSoon ? `剩 ${b.daysLeft} 天` : '有效'}</span>}
        </div>
      </div>
      <div style={{ fontWeight:600, fontSize:16, color:'#2D7D46' }}>免費入場 1 次</div>
      <div style={{ fontSize:12, color:'#6b6b6b', marginTop:4 }}>{b.expiresAtFormatted ? `有效至 ${b.expiresAtFormatted}` : '無期限'}</div>
      <div style={{ fontSize:11, color:'#999', marginTop:8, textAlign:'right' }}>點擊查看詳情 →</div>
    </div>
  );

  return (
    <div style={{ width:'100%', minHeight:'100vh', background:'#F7F3F3', paddingBottom:80 }}>
      {/* 頂部 */}
      <div style={{ background:'#fff', padding:'16px 20px', borderBottom:'0.5px solid #E8D5D5', display:'flex', alignItems:'center', gap:10 }}>
        <div onClick={() => navigate('/member/home')} style={{ fontSize:20, cursor:'pointer', color:'#8B1A1A' }}>←</div>
        <div style={{ fontWeight:600, fontSize:15 }}>我的票券</div>
      </div>

      {/* Tab 列 */}
      <div style={{ background:'#fff', borderBottom:'0.5px solid #E8D5D5', display:'flex', overflowX:'auto' }}>
        {TABS.map(t => (
          <div key={t.key} onClick={() => setTab(t.key)}
            style={{ flexShrink:0, height:44, padding:'0 16px', display:'flex', alignItems:'center', justifyContent:'center', gap:5, cursor:'pointer', fontSize:13, fontWeight: tab===t.key ? 600 : 400, color: tab===t.key ? '#8B1A1A' : '#999', borderBottom: tab===t.key ? '2px solid #8B1A1A' : '2px solid transparent' }}>
            {t.label}
            {t.count > 0 && <span style={{ fontSize:10, background: tab===t.key ? '#8B1A1A' : '#E0E0E0', color: tab===t.key ? '#fff' : '#999', borderRadius:10, padding:'1px 6px', fontWeight:600 }}>{t.count}</span>}
          </div>
        ))}
      </div>

      {msg && (
        <div style={{ margin:'12px 16px 0', background:'#E6F4EB', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#2D7D46' }}>{msg}</div>
      )}

      {/* 待接收的卡片移轉 */}
      {xferIn.length > 0 && (
        <div style={{ margin:'12px 16px 0' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#2D7D46', marginBottom:6 }}>🎁 待接收的卡片移轉</div>
          {xferIn.map(t => (
            <div key={t.id} style={{ background:'#E6F4EB', border:'0.5px solid #B3DEC0', borderRadius:12, padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <div style={{ fontSize:13, color:'#1a1a1a' }}>
                <div style={{ fontWeight:600 }}>{cardLabel(t.cardType)} {t.credits} 次</div>
                <div style={{ fontSize:11, color:'#666', marginTop:2 }}>來自 {t.fromMemberName || '會員'} · 請於 {xferDeadline(t.expiresAtISO)} 前接收</div>
              </div>
              <button onClick={() => acceptXfer(t)} disabled={xferBusy}
                style={{ height:34, padding:'0 16px', borderRadius:8, background:'#2D7D46', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>接收</button>
            </div>
          ))}
        </div>
      )}

      {/* 待接收的票券移轉（紅利/單次券/體驗券）*/}
      {tXferIn.length > 0 && (
        <div style={{ margin:'12px 16px 0' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#2D7D46', marginBottom:6 }}>🎁 待接收的票券移轉</div>
          {tXferIn.map(t => (
            <div key={t.id} style={{ background:'#E6F4EB', border:'0.5px solid #B3DEC0', borderRadius:12, padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <div style={{ fontSize:13, color:'#1a1a1a' }}>
                <div style={{ fontWeight:600 }}>{ticketTypeLabel(t.ticketType)}</div>
                <div style={{ fontSize:11, color:'#666', marginTop:2 }}>來自 {t.fromMemberName || '會員'} · 請於 {xferDeadline(t.expiresAt?._seconds ? new Date(t.expiresAt._seconds*1000).toISOString() : t.expiresAt)} 前接收</div>
              </div>
              <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                <button onClick={() => rejectTicketXfer(t)} disabled={xferBusy}
                  style={{ height:34, padding:'0 12px', borderRadius:8, background:'#fff', color:'#A32D2D', border:'0.5px solid #A32D2D', fontSize:13, cursor:'pointer', whiteSpace:'nowrap' }}>拒絕</button>
                <button onClick={() => acceptTicketXfer(t)} disabled={xferBusy}
                  style={{ height:34, padding:'0 16px', borderRadius:8, background:'#2D7D46', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>接收</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 我送出的移轉中（可取消） */}
      {xferOut.length > 0 && (
        <div style={{ margin:'12px 16px 0' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#854F0B', marginBottom:6 }}>🔄 移轉中（我送出）</div>
          {xferOut.map(t => (
            <div key={t.id} style={{ background:'#FFF6E9', border:'0.5px solid #E0C08A', borderRadius:12, padding:'12px 14px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <div style={{ fontSize:13, color:'#1a1a1a' }}>
                <div style={{ fontWeight:600 }}>{cardLabel(t.cardType)} {t.credits} 次 → {t.toMemberName || '對方'}</div>
                <div style={{ fontSize:11, color:'#666', marginTop:2 }}>待接收 · {xferDeadline(t.expiresAtISO)} 前未接收將自動回沖</div>
              </div>
              <button onClick={() => cancelXfer(t)} disabled={xferBusy}
                style={{ height:34, padding:'0 14px', borderRadius:8, background:'#fff', color:'#A32D2D', border:'0.5px solid #A32D2D', fontSize:13, cursor:'pointer', whiteSpace:'nowrap' }}>取消</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding:16 }}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#999' }}>載入中...</div> : (
          <>
            {/* 定期票 */}
            {tab === 'passes' && (() => {
              // 轉出紀錄（本人已核准的轉讓申請）：票已離開帳號、以紀錄呈現
              const transferOut = (myRequests || []).filter(r => r.type === 'transfer' && r.status === 'approved');
              if (passes.length === 0 && transferOut.length === 0) return (<div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}><div style={{ fontSize:36, marginBottom:8, opacity:.3 }}>🎫</div>目前沒有定期票</div>);
              const { valid, invalid } = splitValid(passes, 'passes');
              const { consumed, dead } = splitInvalid(invalid, 'passes');
              return (<>
                {passes.length > 0 && valid.length === 0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#999', fontSize:13 }}>目前沒有有效定期票</div>}
                {valid.map(p => renderPassCard(p, false))}
                {renderCollapseSection(sortConsumed(consumed, 'passes'), 'passes', 'used', '已使用', (p) => renderPassCard(p, true))}
                {renderCollapseSection(dead, 'passes', 'expired', '已失效', (p) => renderPassCard(p, true))}
                {transferOut.length > 0 && (
                  <div style={{ marginTop:12 }}>
                    <div style={{ fontSize:12, color:'#999', padding:'12px 6px 8px', borderTop:'0.5px solid #E8D5D5' }}>轉出紀錄（{transferOut.length}）</div>
                    {transferOut.map(r => (
                      <div key={r.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px', marginBottom:10, opacity:.85 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:14, fontWeight:600 }}>{r.passTypeName || '定期票'}</span>
                          <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#F0EDED', color:'#999' }}>已轉出</span>
                        </div>
                        <div style={{ fontSize:12, color:'#185FA5', marginTop:6 }}>↗ 已轉出給 {r.transferToName || '他人'}{(() => { const d = tsToDay(r.reviewedAt || r.createdAt); return d ? `（${d.format('YYYY/MM/DD')}）` : ''; })()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>);
            })()}

            {/* 優惠卡（含舊折扣卡）*/}
            {tab === 'discount' && (() => {
              if (discountCards.length === 0) return (<div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}><div style={{ fontSize:36, marginBottom:8, opacity:.3 }}>🃏</div>目前沒有優惠卡</div>);
              const { valid, invalid } = splitValid(discountCards, 'discount');
              const { consumed, dead } = splitInvalid(invalid, 'discount');
              return (<>
                {valid.length === 0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#999', fontSize:13 }}>目前沒有有效優惠卡</div>}
                {valid.map(c => renderDiscountCard(c, false))}
                {renderCollapseSection(sortConsumed(consumed, 'discount'), 'discount', 'used', '已用完', (c) => renderDiscountCard(c, true))}
                {renderCollapseSection(dead, 'discount', 'expired', '已失效', (c) => renderDiscountCard(c, true))}
              </>);
            })()}

            {/* 黑卡 */}
            {tab === 'black' && (() => {
              if (blackCards.length === 0) return (<div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}><div style={{ fontSize:36, marginBottom:8, opacity:.3 }}>🖤</div>目前沒有黑卡</div>);
              const { valid, invalid } = splitValid(blackCards, 'black');
              const { consumed, dead } = splitInvalid(invalid, 'black');
              return (<>
                {valid.length === 0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#999', fontSize:13 }}>目前沒有有效黑卡</div>}
                {valid.map(c => renderBlackCard(c, false))}
                {renderCollapseSection(sortConsumed(consumed, 'black'), 'black', 'used', '已用完', (c) => renderBlackCard(c, true))}
                {renderCollapseSection(dead, 'black', 'expired', '已失效', (c) => renderBlackCard(c, true))}
              </>);
            })()}

            {/* 單日入場券 */}
            {tab === 'single' && (() => {
              if (singleTickets.length === 0) return (<div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}><div style={{ fontSize:36, marginBottom:8, opacity:.3 }}>🎟️</div>目前沒有單日入場券</div>);
              const { valid, invalid } = splitValid(singleTickets, 'single');
              const { consumed, dead } = splitInvalid(invalid, 'single');
              return (<>
                {valid.length === 0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#999', fontSize:13 }}>目前沒有有效單日券</div>}
                {valid.map(t => renderSingleCard(t, false))}
                {renderCollapseSection(sortConsumed(consumed, 'single'), 'single', 'used', '已使用', (t) => renderSingleCard(t, true))}
                {renderCollapseSection(dead, 'single', 'expired', '已失效', (t) => renderSingleCard(t, true))}
              </>);
            })()}

            {/* 紅利 */}
            {tab === 'bonus' && (() => {
              if (bonuses.length === 0) return (<div style={{ textAlign:'center', padding:40, color:'#999', fontSize:13 }}><div style={{ fontSize:36, marginBottom:8, opacity:.3 }}>🎁</div>目前沒有紅利<br/><span style={{ fontSize:12 }}>優惠卡全部次數用完後即可獲得</span></div>);
              const { valid, invalid } = splitValid(bonuses, 'bonus');
              const { consumed, dead } = splitInvalid(invalid, 'bonus');
              return (<>
                {valid.length === 0 && <div style={{ textAlign:'center', padding:'20px 0', color:'#999', fontSize:13 }}>目前沒有有效紅利</div>}
                {valid.map(b => renderBonusCard(b, false))}
                {renderCollapseSection(sortConsumed(consumed, 'bonus'), 'bonus', 'used', '已使用', (b) => renderBonusCard(b, true))}
                {renderCollapseSection(dead, 'bonus', 'expired', '已失效', (b) => renderBonusCard(b, true))}
              </>);
            })()}
          </>
        )}
      </div>

      {/* 票券詳細 Modal */}
      {selectedTicket && !showTransfer && (
        <TicketDetailModal
          ticket={selectedTicket}
          ticketType={selectedTicketType}
          canTransfer={selectedTicket?._isSelf !== false}
          onClose={() => setSelectedTicket(null)}
          onTransfer={() => setShowTransfer(true)}
        />
      )}

      {/* 移轉 Modal */}
      {selectedTicket && showTransfer && (
        <TransferModal
          ticket={selectedTicket}
          ticketType={selectedTicketType}
          memberName={member?.name}
          onClose={() => { setShowTransfer(false); setSelectedTicket(null); }}
          onDone={() => { loadTransfers(); reloadCards(); }}
        />
      )}

      {/* 展延/退費/轉讓申請 Modal */}
      {requestingPass && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 20px 0', width:'100%', maxHeight:'88vh', display:'flex', flexDirection:'column' }}>
            <div style={{ width:36, height:4, background:'#DDD', borderRadius:2, margin:'0 auto 16px' }}/>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:4 }}>申請 — {requestingPass.passTypeName}</div>
            <div style={{ fontSize:12, color:'#999', marginBottom:16 }}>展延、退費、轉讓三者擇一，且每張定期票限申請一次</div>

            <div style={{ flex:1, overflowY:'auto', paddingBottom:20 }}>
              <div style={{ display:'flex', gap:6, marginBottom:16 }}>
                {[{key:'extension',label:'展延'},{key:'refund',label:'退費'},{key:'transfer',label:'轉讓'}].map(t => (
                  <button key={t.key} onClick={() => setRequestType(t.key)}
                    style={{ flex:1, height:38, borderRadius:8, border: requestType===t.key?'none':'0.5px solid #E8D5D5', background: requestType===t.key?'#8B1A1A':'#fff', color: requestType===t.key?'#fff':'#666', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 共用：四法定事由 + 需檢附證明、經審核（三種申請皆適用，集中寫一次）*/}
              <div style={{ fontSize:11, color:'#854F0B', background:'#FAEEDA', borderRadius:8, padding:'8px 12px', marginBottom:8, lineHeight:1.6, textAlign:'left' }}>
                展延／退費／轉讓皆須符合下列法定事由並檢附證明文件，經館方審核通過後生效：
                ① 出國逾 2 個月以上 ② 傷害／疾病／身體不適不宜運動 ③ 懷孕或育養未逾 6 個月嬰兒 ④ 職務異動或遷居致難以行使權利。
              </div>
              {requestType === 'refund' && (
                <div style={{ fontSize:11, color:'#854F0B', background:'#FAEEDA', borderRadius:8, padding:'8px 12px', marginBottom:14, lineHeight:1.6, textAlign:'left' }}>
                  退費需持發票正本親至櫃檯辦理，扣除手續費 NT$600 後依剩餘天數比例退費（四捨五入）。經審核通過後由櫃檯人工退款（非即時到帳）；退費核准後，該定期票即失效。
                </div>
              )}
              {requestType === 'extension' && (
                <>
                  <div style={{ fontSize:11, color:'#854F0B', background:'#FAEEDA', borderRadius:8, padding:'8px 12px', marginBottom:14, lineHeight:1.6, textAlign:'left' }}>
                    展延以一次為限。請填寫停用期間（起訖日）：開始日不可早於今天；票期依停用天數自原到期日順延，且展延後到期日不可比原到期日晚超過 6 個月。
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>停用期間 *</label>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <input type="date" value={suspendStart} min={dayjs().format('YYYY-MM-DD')}
                        onChange={e => setSuspendStart(e.target.value)}
                        style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
                      <span style={{ color:'#999', fontSize:13 }}>至</span>
                      <input type="date" value={suspendEnd} min={suspendStart || dayjs().format('YYYY-MM-DD')}
                        onChange={e => setSuspendEnd(e.target.value)}
                        style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
                    </div>
                    {suspendStart && suspendEnd && dayjs(suspendEnd).diff(dayjs(suspendStart), 'day') > 0 && (() => {
                      const days = dayjs(suspendEnd).diff(dayjs(suspendStart), 'day');
                      const origEnd = requestingPass?.endDate;
                      const newEnd = dayjs(origEnd).add(days, 'day').format('YYYY-MM-DD');
                      const over = newEnd > dayjs(origEnd).add(6, 'month').format('YYYY-MM-DD');
                      return (
                        <div style={{ fontSize:11.5, marginTop:6, color: over ? '#A32D2D' : '#2D7D46', textAlign:'left' }}>
                          停用 {days} 天 → 到期日 {origEnd} 順延為 <strong>{newEnd}</strong>
                          {over && '（超過原到期日 +6 個月上限，請縮短停用期間）'}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
              {requestType === 'transfer' && (
                <div style={{ fontSize:11, color:'#854F0B', background:'#FAEEDA', borderRadius:8, padding:'8px 12px', marginBottom:14, lineHeight:1.6, textAlign:'left' }}>
                  轉讓需收取手續費 NT$300，效期與剩餘次數等原權益不變。經審核通過後移轉予指定對象（請於下方填寫對方手機號碼）。
                </div>
              )}

              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>請選擇符合的事由</label>
                <select value={reasonKey} onChange={e => setReasonKey(e.target.value)}
                  style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                  <option value="">請選擇...</option>
                  {reasons.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>

              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>補充說明（選填）</label>
                <input value={reasonDetail} onChange={e => setReasonDetail(e.target.value)}
                  style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>

              {requestType === 'transfer' && (
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>轉讓對象手機號碼</label>
                  <input type="tel" value={transferToPhone} onChange={e => setTransferToPhone(e.target.value)}
                    placeholder="0912345678"
                    style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
                  {/* 查該電話的會員（含家庭成員）供確認/選擇；未滿13歲不可接收、查無則擋 */}
                  {transferToPhone.trim().length >= 10 && (() => {
                    const selectable = transferRecipients.filter(r => !r.under13); // 未滿13歲不可接收定期票
                    if (transferRecipients.length === 0) {
                      return transferLookupDone
                        ? <div style={{ fontSize:12, color:'#A32D2D', marginTop:8 }}>查無此手機號碼的可轉讓會員（不可轉給自己）</div>
                        : <div style={{ fontSize:12, color:'#999', marginTop:8 }}>查詢中…</div>;
                    }
                    if (selectable.length === 0) {
                      return <div style={{ fontSize:12, color:'#A32D2D', marginTop:8 }}>此電話的會員未滿 13 歲，無法接收定期票轉讓。</div>;
                    }
                    if (selectable.length === 1) {
                      const r = selectable[0];
                      return (
                        <div style={{ fontSize:13, color:'#2D7D46', marginTop:8, fontWeight:500 }}>
                          ✅ 接收人：{r.name}{r.isChildAccount ? '（子女）' : '（家長）'}
                        </div>
                      );
                    }
                    return (
                      <div style={{ marginTop:8 }}>
                        <div style={{ fontSize:12, color:'#666', marginBottom:5 }}>此電話有多位家庭成員，請選擇接收對象：</div>
                        <select value={transferPickId} onChange={e => setTransferPickId(e.target.value)}
                          style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                          {selectable.map(r => <option key={r.id} value={r.id}>{r.name}{r.isChildAccount ? '（子女）' : '（家長）'}</option>)}
                        </select>
                        {transferRecipients.some(r => r.under13) && <div style={{ fontSize:11, color:'#999', marginTop:5 }}>※ 未滿 13 歲的家庭成員不可接收定期票，已排除。</div>}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>證明文件（圖片或PDF）</label>
                <input type="file" accept="image/*,application/pdf" onChange={e => setEvidenceFile(e.target.files?.[0] || null)}
                  style={{ width:'100%', fontSize:13 }}/>
                {evidenceFile && <div style={{ fontSize:11, color:'#2D7D46', marginTop:4 }}>已選擇：{evidenceFile.name}</div>}
              </div>

              {requestError && <div style={{ color:'#A32D2D', fontSize:12, marginTop:6 }}>{requestError}</div>}
            </div>

            <div style={{ padding:'12px 0 36px', display:'flex', gap:8 }}>
              <button onClick={() => setRequestingPass(null)}
                style={{ flex:1, height:46, borderRadius:10, border:'0.5px solid #E8D5D5', background:'none', fontSize:14, color:'#666', cursor:'pointer' }}>取消</button>
              <button onClick={handleSubmitRequest} disabled={requestSubmitting}
                style={{ flex:2, height:46, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                {evidenceUploading ? '上傳文件中...' : requestSubmitting ? '送出中...' : '送出申請'}
              </button>
            </div>
          </div>
        </div>
      )}

      <MemberLogoutButton />
      <BottomNav navigate={navigate} />
    </div>
  );
}
