import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { getRentalSettings, applyRental, getMyRentals } from '../../api/rentals';
import { memberClient } from '../../api/client';
import dayjs from 'dayjs';
import PaymentSection from '../../components/PaymentSection';
import PaymentFlow, { ONLINE_PAYMENT_ENABLED } from '../../components/PaymentFlow';

const ITEM_ICONS = { crashPad:'🪨', helmet:'⛑️', harness:'🔗' };
const STATUS_LABEL = {
  pending:   { bg:'#FAEEDA', color:'#854F0B', text:'待確認' },
  confirmed: { bg:'#E6F4EB', color:'#2D7D46', text:'已確認' },
  active:    { bg:'#E6F1FB', color:'#185FA5', text:'使用中' },
  returned:  { bg:'#F0EDED', color:'#666',    text:'已歸還' },
  cancelled: { bg:'#FCEBEB', color:'#A32D2D', text:'已取消' },
};

export default function MemberRentalPage() {
  const { member } = useMember();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState('apply'); // apply | history
  const [settings, setSettings] = useState(null);
  const [myRentals, setMyRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState('ok');
  const [payFor, setPayFor] = useState(null); // { rentalId, total, gymId }

  // 申請表單狀態
  const [gymId, setGymId] = useState('gym-hsinchu');
  const [rentalType, setRentalType] = useState('weekend');
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [quantities, setQuantities] = useState({ crashPad: 0, helmet: 0, harness: 0 });
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState('transfer');
  const [payDate, setPayDate] = useState('');
  const [bankLastFive, setBankLastFive] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const showMsg = (t, type='ok') => { setMsg(t); setMsgType(type); setTimeout(()=>setMsg(''),5000); };

  useEffect(() => {
    Promise.allSettled([
      getRentalSettings(),
      member?.id ? getMyRentals() : Promise.resolve({ data: { rentals: [] } }),
    ]).then(([sr, rr]) => {
      if (sr.status === 'fulfilled') setSettings(sr.value.data);
      if (rr.status === 'fulfilled') setMyRentals(rr.value.data.rentals || []);
    }).finally(() => setLoading(false));
  }, [member?.id]);

  // 自動算歸還日期
  useEffect(() => {
    if (!pickupDate) return;
    if (rentalType === 'weekend') {
      // 週五借出 → 週一歸還
      setReturnDate(dayjs(pickupDate).add(3, 'day').format('YYYY-MM-DD'));
    } else {
      setReturnDate(dayjs(pickupDate).add(7, 'day').format('YYYY-MM-DD'));
    }
  }, [pickupDate, rentalType]);

  const calcTotal = () => {
    if (!settings) return { rentalFee: 0, deposit: 0 };
    let rentalFee = 0, deposit = 0;
    Object.entries(quantities).forEach(([type, qty]) => {
      if (qty > 0 && settings[type]) {
        const cfg = settings[type];
        rentalFee += (rentalType === 'weekend' ? cfg.weekendFee : cfg.sevenDayFee) * qty;
        deposit += cfg.deposit * qty;
      }
    });
    return { rentalFee, deposit };
  };

  const hasItems = Object.values(quantities).some(q => q > 0);
  const { rentalFee, deposit } = calcTotal();

  const handleApply = async () => {
    if (!pickupDate) { showMsg('請選擇借出日期', 'red'); return; }
    setSubmitting(true);
    try {
      const items = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([type, quantity]) => ({ type, quantity }));
      const res = await applyRental({
        memberId: member.id,
        memberName: member.name,
        memberPhone: member.phone,
        gymId, pickupDate, returnDate, rentalType, items,
        paymentMethod: payMethod,
        paymentDate: payMethod === 'transfer' ? payDate : null,
        bankLastFive: payMethod === 'transfer' ? bankLastFive : null,
      });
      showMsg(res.data.message || '申請成功！');
      const rentalId = res.data.id;
      const total = (res.data.totalRentalFee || 0) + (res.data.totalDeposit || 0);
      setShowPayModal(false);
      setQuantities({ crashPad: 0, helmet: 0, harness: 0 });
      setPickupDate(''); setReturnDate('');
      const rr = await getMyRentals();
      setMyRentals(rr.data.rentals || []);
      setTab('history');
      if (ONLINE_PAYMENT_ENABLED && rentalId && total > 0) setPayFor({ rentalId, total, gymId });
    } catch (err) {
      showMsg(err.response?.data?.message || '申請失敗', 'red');
    } finally { setSubmitting(false); }
  };

  const NavBar = () => (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#fff', borderTop:'0.5px solid #E8D5D5', display:'flex', height:60, paddingBottom:'env(safe-area-inset-bottom)', zIndex:50 }}>
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
            <div style={{ fontSize:10, fontWeight: active ? 600 : 400 }}>{n.label}</div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#FBF5F5', paddingBottom:80 }}>
      {/* 線上付款 Modal（Phase 1：器材租借）*/}
      {payFor && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:210, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:380, padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontWeight:600, fontSize:15 }}>完成付款（含押金）</div>
              <button onClick={()=>{ setPayFor(null); showMsg('申請已保留，可於「租借紀錄」完成付款或改用匯款'); }} style={{ background:'none', border:'none', fontSize:20, color:'#999', cursor:'pointer' }}>✕</button>
            </div>
            <PaymentFlow
              client={memberClient}
              orderType="rental"
              orderRef={{ rentalId: payFor.rentalId }}
              amount={payFor.total}
              gymId={payFor.gymId}
              onPaid={()=>{ setPayFor(null); showMsg('付款完成，租借已確認！'); getMyRentals().then(rr=>setMyRentals(rr.data.rentals||[])); }}
              onCancel={()=>{ setPayFor(null); showMsg('申請已保留，可於「租借紀錄」完成付款或改用匯款'); }}
            />
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{ background:'#8B1A1A', padding:'16px 20px 14px', color:'#fff', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => navigate('/member/home')} style={{ background:'none', border:'none', color:'#fff', fontSize:20, cursor:'pointer', padding:0 }}>‹</button>
        <div style={{ fontSize:18, fontWeight:700 }}>👟 器材租借</div>
      </div>

      {msg && <div style={{ margin:'12px 16px 0', background:msgType==='ok'?'#E6F4EB':'#FCEBEB', borderRadius:8, padding:'10px 14px', fontSize:13, color:msgType==='ok'?'#2D7D46':'#A32D2D' }}>{msg}</div>}

      {/* Tabs */}
      <div style={{ display:'flex', margin:'14px 16px 0', background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
        {[{key:'apply',label:'申請租借'},{key:'history',label:'租借紀錄'}].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex:1, height:38, border:'none', background:tab===t.key?'#8B1A1A':'#fff', color:tab===t.key?'#fff':'#666', fontSize:13, fontWeight:tab===t.key?600:400, cursor:'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding:'14px 16px' }}>
        {loading ? <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div> : (<>

          {/* ── 申請頁 ── */}
          {tab === 'apply' && (<>
            {/* 說明 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, marginBottom:12 }}>
              <div style={{ fontSize:12, color:'#666', lineHeight:1.8 }}>
                ⚠ 填表前請致電確認器材數量是否足夠<br/>
                ◆ 週末方案：週五借出，週一歸還<br/>
                ◆ 七天方案：使用前一天借出，使用後一天歸還<br/>
                歸還時保持清潔乾燥，確認狀態後退還押金
              </div>
            </div>

            {/* 取貨場館 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>取貨場館</div>
              <div style={{ display:'flex', gap:8 }}>
                {[{id:'gym-hsinchu',label:'新竹館'},{id:'gym-shilin',label:'士林館'}].map(g => (
                  <button key={g.id} onClick={() => setGymId(g.id)}
                    style={{ flex:1, height:40, borderRadius:8, border:`1.5px solid ${gymId===g.id?'#8B1A1A':'#E8D5D5'}`, background:gymId===g.id?'#FBF5F5':'#fff', color:gymId===g.id?'#8B1A1A':'#666', fontSize:13, fontWeight:gymId===g.id?600:400, cursor:'pointer' }}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 租借方案 + 日期 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>租借方案</div>
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                {[{k:'weekend',l:'週末方案（3天）'},{k:'sevenDay',l:'七天方案'}].map(rt => (
                  <button key={rt.k} onClick={() => setRentalType(rt.k)}
                    style={{ flex:1, height:38, borderRadius:8, border:`1.5px solid ${rentalType===rt.k?'#8B1A1A':'#E8D5D5'}`, background:rentalType===rt.k?'#FBF5F5':'#fff', color:rentalType===rt.k?'#8B1A1A':'#666', fontSize:12, fontWeight:rentalType===rt.k?600:400, cursor:'pointer' }}>
                    {rt.l}
                  </button>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>
                    借出日期{rentalType==='weekend'?' （建議週五）':''}
                  </label>
                  <input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)}
                    min={dayjs().add(1,'day').format('YYYY-MM-DD')}
                    style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:5 }}>歸還日期</label>
                  <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
                    min={pickupDate || dayjs().format('YYYY-MM-DD')}
                    style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                </div>
              </div>
            </div>

            {/* 器材選擇 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>器材選擇</div>
              {settings && Object.entries(settings)
                .filter(([, cfg]) => cfg.active !== false && cfg.name)
                .map(([type, cfg]) => {
                const unitFee = rentalType === 'weekend' ? cfg.weekendFee : cfg.sevenDayFee;
                const qty = quantities[type] || 0;
                return (
                  <div key={type} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'0.5px solid #F0E8E8' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500 }}>{ITEM_ICONS[type]} {cfg.name}</div>
                      <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                        租金 NT${unitFee}/件　押金 NT${cfg.deposit}/件
                      </div>
                      {cfg.description && <div style={{ fontSize:11, color:'#aaa' }}>{cfg.description}</div>}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <button onClick={() => setQuantities(q => ({ ...q, [type]: Math.max(0, (q[type]||0)-1) }))}
                        style={{ width:32, height:32, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#FBF5F5', fontSize:18, cursor:'pointer', color:'#8B1A1A' }}>−</button>
                      <span style={{ fontSize:16, fontWeight:600, minWidth:20, textAlign:'center' }}>{qty}</span>
                      <button onClick={() => setQuantities(q => ({ ...q, [type]: (q[type]||0)+1 }))}
                        style={{ width:32, height:32, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#FBF5F5', fontSize:18, cursor:'pointer', color:'#8B1A1A' }}>＋</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 費用小計 */}
            {hasItems && (
              <div style={{ background:'#FBF5F5', borderRadius:10, border:'0.5px solid #E8D5D5', padding:14, marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
                  <span style={{ color:'#666' }}>租金</span>
                  <span style={{ fontWeight:600 }}>NT${rentalFee}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:8 }}>
                  <span style={{ color:'#666' }}>押金（歸還後退回）</span>
                  <span style={{ fontWeight:600 }}>NT${deposit}</span>
                </div>
                <div style={{ borderTop:'0.5px solid #E8D5D5', paddingTop:8, display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700 }}>
                  <span>合計</span>
                  <span style={{ color:'#8B1A1A' }}>NT${rentalFee + deposit}</span>
                </div>
              </div>
            )}

            <button onClick={() => setShowPayModal(true)} disabled={!hasItems || !pickupDate}
              style={{ width:'100%', height:48, borderRadius:12, background: (!hasItems||!pickupDate)?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor: (!hasItems||!pickupDate)?'not-allowed':'pointer' }}>
              {!pickupDate ? '請選擇借出日期' : !hasItems ? '請選擇租借器材' : '確認申請'}
            </button>
          </>)}

          {/* ── 歷史紀錄 ── */}
          {tab === 'history' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {myRentals.length === 0 && <div style={{ textAlign:'center', color:'#999', padding:40 }}>尚無租借紀錄</div>}
              {myRentals.map(r => {
                const sl = STATUS_LABEL[r.status] || STATUS_LABEL.pending;
                return (
                  <div key={r.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:14 }}>
                          {r.gymId==='gym-hsinchu'?'新竹館':'士林館'} ·
                          {r.rentalType==='weekend'?' 週末方案':' 七天方案'}
                        </div>
                        <div style={{ fontSize:12, color:'#999', marginTop:2 }}>
                          {r.pickupDate} ～ {r.returnDate}
                        </div>
                      </div>
                      <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:8, background:sl.bg, color:sl.color }}>{sl.text}</span>
                    </div>
                    <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>
                      {r.items?.map(i => `${ITEM_ICONS[i.type]||''}${i.name} ×${i.quantity}`).join('　')}
                    </div>
                    <div style={{ fontSize:12, color:'#8B1A1A', fontWeight:500 }}>
                      租金 NT${r.totalRentalFee}　押金 NT${r.totalDeposit}
                      {r.depositReturned ? '　✓ 押金已退回' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </>)}
      </div>

      {/* 付款 Modal */}
      {showPayModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'#fff', borderRadius:'16px 16px 0 0', width:'100%', padding:24, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:4 }}>確認申請</div>
            <div style={{ fontSize:12, color:'#999', marginBottom:16 }}>
              {gymId==='gym-hsinchu'?'新竹館':'士林館'} ·
              {rentalType==='weekend'?' 週末方案':' 七天方案'} ·
              {pickupDate} ～ {returnDate}
            </div>

            {/* 費用摘要 */}
            <div style={{ background:'#FBF5F5', borderRadius:10, padding:'10px 14px', marginBottom:16 }}>
              {Object.entries(quantities).filter(([,q])=>q>0).map(([type,qty])=>{
                const cfg = settings?.[type];
                if (!cfg) return null;
                const fee = (rentalType==='weekend'?cfg.weekendFee:cfg.sevenDayFee)*qty;
                return <div key={type} style={{ fontSize:12, color:'#666', marginBottom:3 }}>
                  {cfg.name} ×{qty}　租金 NT${fee}　押金 NT${cfg.deposit*qty}
                </div>;
              })}
              <div style={{ borderTop:'0.5px solid #E8D5D5', paddingTop:8, marginTop:6, fontSize:14, fontWeight:700, color:'#8B1A1A' }}>
                合計 NT${rentalFee + deposit}（含押金 NT${deposit}）
              </div>
            </div>

            {/* 付款方式 */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>付款方式</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {[{k:'transfer',l:'現金/轉帳'},{k:'linepay',l:'Line Pay'},{k:'jkopay',l:'街口'},{k:'taiwanpay',l:'台灣Pay'}].map(pm => (
                  <button key={pm.k} onClick={() => setPayMethod(pm.k)}
                    style={{ height:36, padding:'0 14px', borderRadius:8, border:`1.5px solid ${payMethod===pm.k?'#8B1A1A':'#E8D5D5'}`, background:payMethod===pm.k?'#FBF5F5':'#fff', color:payMethod===pm.k?'#8B1A1A':'#666', fontSize:12, fontWeight:payMethod===pm.k?600:400, cursor:'pointer' }}>
                    {pm.l}
                  </button>
                ))}
              </div>
            </div>

            {payMethod === 'transfer' && (
              <div style={{ background:'#FBF5F5', borderRadius:8, padding:'12px 14px', marginBottom:14 }}>
                <div style={{ fontSize:11, color:'#999', marginBottom:4 }}>轉帳帳號</div>
                <div style={{ fontSize:13, fontWeight:600 }}>台新銀行(812) 關東橋分行</div>
                <div style={{ fontSize:16, fontFamily:'monospace', letterSpacing:2, color:'#8B1A1A', margin:'6px 0' }}>21000100211430</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:10 }}>
                  <div>
                    <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>匯款日期</label>
                    <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                      style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:12, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>末五碼</label>
                    <input type="text" maxLength={5} value={bankLastFive} onChange={e => setBankLastFive(e.target.value)} placeholder="12345"
                      style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:12, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowPayModal(false)}
                style={{ flex:1, height:44, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
              <button onClick={handleApply} disabled={submitting}
                style={{ flex:2, height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                {submitting ? '送出中...' : '✓ 送出申請'}
              </button>
            </div>
          </div>
        </div>
      )}

      <NavBar />
    </div>
  );
}
