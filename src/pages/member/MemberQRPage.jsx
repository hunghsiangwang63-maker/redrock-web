import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { memberClient } from '../../api/client';
import PaymentPlanChoice from '../../components/PaymentPlanChoice';
import QRCode from 'qrcode';
import dayjs from 'dayjs';
import { isChild } from '../../utils/age';

const PAYMENT_METHODS = [
  { key: 'cash',      label: '現金' },
  { key: 'linepay',   label: 'Line Pay' },
  { key: 'jkopay',    label: '街口支付' },
  { key: 'taiwanpay', label: '台灣 Pay' },
];

const ENTRY_TYPE_LABEL = {
  pass: '定期票', vip: 'VIP 免費入場', course_access: '課程學員',
  child_free: '兒童入場', student_free: '學生入場',
  discount_card: '使用優惠折扣券', black_card: '使用黑卡', bonus: '紅利免費入場',
  single_entry_ticket: '使用單次入場券', single_ticket: '單次購票',
  buy_discount_card: '購買優惠折扣券', buy_pass: '購買定期票',
};

// 入場身分顯示名稱（不帶金額）：成人入場 / 學生入場 / 兒童入場；其餘去除「單次」字樣
const ENTRY_ID_LABEL = { single_ticket: '成人入場', student_free: '學生入場', child_free: '兒童入場' };
const entryIdLabel = (opt) => ENTRY_ID_LABEL[opt?.type] || (opt?.label || '').replace(/單次/g, '').trim() || '入場';

export default function MemberQRPage() {
  const { member } = useMember();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState('loading');
  const [verifyResult, setVerifyResult] = useState(null);
  const [selectedType, setSelectedType] = useState(null);   // 第一段：身分（入場類型）
  const [selectedEntry, setSelectedEntry] = useState(null); // 第二段：付款/票券方式
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [buyPassPlan, setBuyPassPlan] = useState('full'); // 購定期票：'full' | 'installment'
  const [renewOptIn, setRenewOptIn] = useState(false);    // 續約：是否順便續約
  const [renewPlan, setRenewPlan] = useState('full');     // 續約：'full' | 'installment'
  const [rentShoes, setRentShoes] = useState(false);
  const [rentChalk, setRentChalk] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [qrToken, setQrToken] = useState(null);
  const [qrExpiry, setQrExpiry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 親子帳號：可選擇要產生「誰」的入場 QR（家長本人 / 各子會員）
  const [children, setChildren] = useState([]);
  const [targetId, setTargetId] = useState(null); // null → 家長本人
  const entrant = (targetId && children.find(c => c.id === targetId)) || member;
  const isChildTarget = !!entrant && !!member && entrant.id !== member.id;

  const gymId = member?.defaultGymId || 'gym-hsinchu';

  // 續約資訊（到期前14天由後端 verify 回傳）；分期各期前 n-1 照原價比例、折扣集中末期（與後端 buildRenewalPeriods 一致）
  const renewal = verifyResult?.renewal || null;
  const renewInstEnabled = !!renewal?.installment?.enabled && (renewal?.installment?.periods?.length >= 2) && renewal?.renewalPrice > 0;
  const computeRenewPeriods = () => {
    if (!renewInstEnabled) return [];
    const ps = renewal.installment.periods;
    let alloc = 0;
    return ps.map((p, i) => {
      const amt = i === ps.length - 1 ? Math.max(0, renewal.renewalPrice - alloc) : Math.round((renewal.fullPrice || 0) * (Number(p.percent) || 0) / 100);
      alloc += amt;
      return amt;
    });
  };
  const renewPeriods = computeRenewPeriods();
  // 續約本次應收：一次付清＝折後全額；分期＝首期
  const renewDueNow = !renewOptIn ? 0 : (renewPlan === 'installment' && renewPeriods.length ? renewPeriods[0] : (renewal?.renewalPrice || 0));

  // 載入子會員清單
  useEffect(() => {
    if (!member) return;
    memberClient.get('/members/my/children')
      .then(r => setChildren(r.data.children || []))
      .catch(() => {});
  }, [member]);

  // 切換入場人員（或初次進入）時重新驗票
  useEffect(() => { if (member) doVerify(); /* eslint-disable-next-line */ }, [member, targetId]);

  const doVerify = async () => {
    setStep('loading');
    setError(null);
    // 切換對象時清空上一位的流程狀態
    setSelectedType(null); setSelectedEntry(null); setSelectedCard(null); setSelectedPayment(null); setBuyPassPlan('full');
    setRenewOptIn(false); setRenewPlan('full');
    setRentShoes(false); setRentChalk(false);
    setQrDataUrl(null); setQrToken(null); setQrExpiry(null);
    try {
      const res = await memberClient.post('/checkin/verify', { identifier: member.phone, gymId, targetMemberId: entrant.id });
      const data = res.data;
      setVerifyResult(data);
      if (!data.allowed) {
        setStep('blocked');
      } else if (data.freeEntry) {
        setSelectedEntry({ type: data.entryType, freeEntry: true, passId: data.pass?.id });
        setStep('shoes');
      } else {
        setStep('select_entry');
      }
    } catch (err) {
      setError(err.response?.data?.message || '驗票失敗');
      setStep('blocked');
    }
  };

  const handleGenerateQR = async (shoes, chalk = false) => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        memberId: entrant.id,
        gymId,
        entryType: selectedEntry.type,
        baseEntryType: selectedEntry.baseEntryType || null,
        rentShoes: shoes,
        shoesPrice: shoes ? 100 : 0,
        rentChalk: chalk,
        chalkPrice: chalk ? 50 : 0,
        amount: 0,
        originalAmount: 0,
      };
      if (selectedEntry.passId) payload.passId = selectedEntry.passId;
      if (selectedEntry.buyPassTypeId) {
        payload.buyPassTypeId = selectedEntry.buyPassTypeId;
        payload.paymentPlan = buyPassPlan; // 'full' | 'installment'（後端權威依票種 installment 決定是否真分期）
      }
      const cardId = selectedEntry.cardId || selectedCard;
      if (cardId) {
        if (selectedEntry.instrumentKind === 'discountCard') payload.discountCardId = cardId;
        if (selectedEntry.instrumentKind === 'blackCard') payload.blackCardId = cardId;
        if (selectedEntry.instrumentKind === 'singleEntryTicket') payload.singleEntryTicketId = cardId;
        if (selectedEntry.instrumentKind === 'bonus') payload.bonusId = cardId;
      }
      if (!selectedEntry.freeEntry) {
        payload.paymentMethod = selectedPayment;
        payload.originalAmount = selectedEntry.price || 0;
        payload.amount = selectedEntry.discountedPrice ?? selectedEntry.price ?? 0;
        payload.isTeamDiscount = selectedEntry.teamDiscount || false;
      }
      // 續約附加（免費入場定期票、到期前14天）：帶要續約的票 + 分期選擇 + 續約款付款方式
      if (renewOptIn && renewal?.passId) {
        payload.renewPassId = renewal.passId;
        payload.renewPaymentPlan = renewPlan;
        payload.paymentMethod = selectedPayment || 'cash';
      }

      const res = await memberClient.post('/checkin/qr/create', payload);
      const { qrToken, expiresAt } = res.data;
      const dataUrl = await QRCode.toDataURL(qrToken, { width: 220, margin: 2 });
      setQrToken(qrToken);
      setQrExpiry(expiresAt);
      setQrDataUrl(dataUrl);
      setRentShoes(shoes);
      setStep('qr');
    } catch (err) {
      setError(err.response?.data?.message || '產生 QR Code 失敗');
    } finally {
      setLoading(false);
    }
  };

  const NavBar = () => (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, width:'100%', background:'#fff', borderTop:'0.5px solid #E8D5D5', display:'flex', height:60, paddingBottom:"env(safe-area-inset-bottom)", zIndex:50 }}>
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

  const Header = ({ title, onBack }) => (
    <div style={{ background:'#fff', padding:'16px 20px', borderBottom:'0.5px solid #E8D5D5', display:'flex', alignItems:'center', gap:10 }}>
      {onBack && <div onClick={onBack} style={{ fontSize:20, cursor:'pointer', color:'#8B1A1A' }}>←</div>}
      <div style={{ fontWeight:600, fontSize:15 }}>{title}</div>
    </div>
  );

  const wrap = (kids) => (
    <div style={{ width:'100%', minHeight:'100vh', background:'#F7F3F3', paddingBottom:80 }}>
      {kids}
      <NavBar />
    </div>
  );

  // 入場人員選擇器（僅當帳號底下有子會員時顯示）
  const MemberSelector = () => {
    if (!member || children.length === 0) return null;
    return (
      <div style={{ padding:'14px 20px 0' }}>
        <div style={{ fontSize:11, color:'#999', marginBottom:6 }}>選擇入場人員</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {[member, ...children].map(m => {
            const active = entrant?.id === m.id;
            const isChild = m.id !== member.id;
            return (
              <button key={m.id} type="button"
                onClick={() => { if (!active) setTargetId(isChild ? m.id : null); }}
                style={{ height:34, padding:'0 14px', borderRadius:18, border:`1.5px solid ${active?'#8B1A1A':'#E8D5D5'}`, background: active?'#8B1A1A':'#fff', color: active?'#fff':'#666', fontSize:13, fontWeight: active?600:400, cursor:'pointer' }}>
                {m.name}{isChild ? '（子）' : ''}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (step === 'loading') return wrap(
    <>
      <Header title="入場 QR Code" onBack={() => navigate('/member/home')} />
      <MemberSelector />
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:60, gap:16 }}>
        <div style={{ fontSize:32 }}>⏳</div>
        <div style={{ fontSize:14, color:'#999' }}>驗票中...</div>
      </div>
    </>
  );






















  if (step === 'blocked') {
    const isAlreadyIn = verifyResult?.reason === 'already_checked_in';
    const needsWaiver = verifyResult?.reason === 'waiver_required';
    const pendingParent = verifyResult?.reason === 'parent_waiver_pending';
    return wrap(
      <>
        <Header title="入場 QR Code" onBack={() => navigate('/member/home')} />
        <MemberSelector />
        <div style={{ padding:20 }}>
          <div style={{ background: isAlreadyIn ? '#E6F4EB' : '#FCEBEB', borderRadius:12, border: `0.5px solid ${isAlreadyIn ? '#B3DEC0' : '#F09595'}`, padding:24, textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>{isAlreadyIn ? '✅' : pendingParent ? '📧' : '🚫'}</div>
            <div style={{ fontWeight:600, fontSize:16, color: isAlreadyIn ? '#2D7D46' : '#A32D2D', marginBottom:8 }}>
              {isAlreadyIn ? '今日已完成入場' :
               needsWaiver ? 'Waiver 尚未完成' :
               pendingParent ? '等待家長/監護人簽署' :
               verifyResult?.reason === 'fall_test_required' ? '尚未通過墜落測驗' :
               verifyResult?.reason === 'fall_test_expired' ? '墜落測驗已到期' : '無法入場'}
            </div>
            <div style={{ fontSize:13, color: isAlreadyIn ? '#2D7D46' : '#A32D2D', opacity:.8, textAlign:'left' }}>
              {isAlreadyIn ? verifyResult?.message :
               needsWaiver ? '請先完成 Waiver 免責聲明書簽署，才能入場' :
               verifyResult?.reason === 'parent_waiver_pending' ? '已送出，等待家長/監護人完成線上簽署' :
               verifyResult?.reason === 'fall_test_required' ? '請先至服務台完成安全墜落測驗同意書簽署及墜落測驗' :
               verifyResult?.reason === 'fall_test_expired' ? '墜落測驗已到期，請至服務台重新進行測驗' :
               verifyResult?.message || '請聯絡服務台'}
            </div>
          </div>
          {needsWaiver ? (
            <button onClick={() => navigate(isChildTarget ? `/member/waiver?forChild=${entrant.id}&childName=${encodeURIComponent(entrant.name)}` : '/member/waiver')}
              style={{ width:'100%', marginTop:16, height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
              前往簽署 Waiver
            </button>
          ) : pendingParent ? (
            <button onClick={() => navigate('/member/waiver')}
              style={{ width:'100%', marginTop:16, height:44, borderRadius:10, background:'#fff', color:'#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:14, fontWeight:500, cursor:'pointer' }}>
              查看簽署狀態 / 重新發送連結
            </button>
          ) : (verifyResult?.reason === 'fall_test_required' || verifyResult?.reason === 'fall_test_expired') ? (
            <button onClick={() => navigate(isChildTarget ? `/member/fall-test?forChild=${entrant.id}&childName=${encodeURIComponent(entrant.name)}` : '/member/fall-test')}
              style={{ width:'100%', marginTop:16, height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
              前往墜落測驗同意書
            </button>
          ) : (
            <button onClick={doVerify}
              style={{ width:'100%', marginTop:16, height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
              重新驗票
            </button>
          )}
        </div>
      </>
    );
  }

  // 第一段：選身分（入場類型）
  if (step === 'select_entry') {
    const types = verifyResult?.entryTypeOptions || [];
    return wrap(
      <>
        <Header title="選擇身分" onBack={() => navigate('/member/home')} />
        <MemberSelector />
        <div style={{ padding:20 }}>
          {verifyResult?.member?.isTeamMember && (
            <div style={{ background:'#E6F1FB', border:'0.5px solid #B5D4F4', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#185FA5' }}>
              🏅 隊員身份：NT$100 以上消費享九折優惠
            </div>
          )}
          <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>請選擇入場身分</div>
          {types.map(opt => (
            <div key={opt.type}
              onClick={() => { setSelectedType(opt); setStep('select_method'); }}
              style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'14px 16px', marginBottom:10, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:600, fontSize:14, color:'#1a1a1a' }}>{entryIdLabel(opt)}</div>
              <div style={{ fontSize:18, color:'#ccc' }}>›</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // 第二段：選擇付款方式 / 票券（已選身分後）
  if (step === 'select_method') {
    const t = selectedType || {};
    const inst = verifyResult?.instruments || {};
    const basePrice = t.discountedPrice ?? t.price ?? 0;       // 一般付款（含隊員折扣）
    const methods = [
      { kind:'pay', type:t.type, baseEntryType:t.type, label:'一般付款', price:t.price, discountedPrice:basePrice,
        teamDiscount:t.teamDiscount, freeEntry:false, requiresPayment:true },
    ];
    if (inst.discountCard?.available) {
      const dp = Math.round((t.price || 0) * (inst.discountCard.rate || 0.8));
      methods.push({ kind:'discountCard', type:'discount_card', baseEntryType:t.type, label:'使用優惠折扣券（原價 8 折）',
        price:t.price, discountedPrice:dp, freeEntry:false, requiresPayment:true,
        instrumentKind:'discountCard', cards:inst.discountCard.cards });
    }
    if (inst.blackCard?.available) methods.push({ kind:'blackCard', type:'black_card', label:'使用黑卡（免費）', freeEntry:true, instrumentKind:'blackCard', cards:inst.blackCard.cards });
    if (inst.bonus?.available) methods.push({ kind:'bonus', type:'bonus', label:'使用紅利（免費）', freeEntry:true, instrumentKind:'bonus', cards:inst.bonus.bonuses });
    if (inst.singleEntryTicket?.available) methods.push({ kind:'ticket', type:'single_entry_ticket', label:'使用單次入場券（免費）', freeEntry:true, instrumentKind:'singleEntryTicket', cards:inst.singleEntryTicket.tickets });
    // 未滿 13 歲（兒童，以出生日期判定）不可購買優惠券／定期票（友善提示，後端仍為權威）
    const entrantIsChild = isChild(entrant);
    if (!entrantIsChild && inst.buyDiscountCard?.available) methods.push({ kind:'buy', type:'buy_discount_card', label:'購買優惠折扣券入場', note:'含本次入場＋10次八折＋紅利', price:inst.buyDiscountCard.price, discountedPrice:inst.buyDiscountCard.price, freeEntry:false, requiresPayment:true });
    // 購買新定期票入場改為下拉選單（單館票僅該館可買，QR 綁該館）
    const buyPassTypes = (!entrantIsChild && inst.buyPass?.available) ? (inst.buyPass.passTypes || []) : [];
    const pickBuyPass = (id) => {
      const pt = buyPassTypes.find(p => p.id === id);
      if (!pt) return;
      const dur = pt.durationMonths ? `${pt.durationMonths} 個月` : pt.durationDays ? `${pt.durationDays} 天` : '';
      const scopeLabel = pt.scope === 'shared' ? '雙館通用' : '單館';
      setBuyPassPlan('full');
      setSelectedEntry({ kind:'buyPass', type:'buy_pass', buyPassTypeId:pt.id, baseEntryType:t.type,
        label:`購買定期票：${pt.name}`, note:[dur, scopeLabel].filter(Boolean).join('・'),
        price:pt.price, discountedPrice:pt.price, freeEntry:false, requiresPayment:true,
        installment:pt.installment || null });
      setStep('select_payment');
    };
    return wrap(
      <>
        <Header title="選擇付款方式" onBack={() => setStep('select_entry')} />
        <MemberSelector />
        <div style={{ padding:20 }}>
          <div style={{ fontSize:13, color:'#666', marginBottom:4 }}>身分：<b>{t.label}</b></div>
          <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>請選擇付款方式或使用票券</div>
          {methods.map(m => (
            <div key={m.kind}
              onClick={() => {
                const cardId = m.cards && m.cards.length === 1 ? m.cards[0].id : (m.cards && m.cards.length ? m.cards[0].id : null);
                setSelectedEntry({ ...m, baseEntryType: m.baseEntryType || m.type, cardId });
                setStep(m.requiresPayment ? 'select_payment' : 'shoes');
              }}
              style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'14px 16px', marginBottom:10, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:14, color:'#1a1a1a', textAlign:'left' }}>{m.label}</div>
                {m.note && <div style={{ fontSize:11, color:'#999', marginTop:3 }}>{m.note}</div>}
                {(m.cards?.length > 0) && <div style={{ fontSize:11, color:'#185FA5', marginTop:3 }}>共 {m.cards.length} 張可用</div>}
              </div>
              <div style={{ textAlign:'right' }}>
                {m.freeEntry ? (
                  <span style={{ fontSize:12, color:'#2D7D46', fontWeight:600 }}>免費</span>
                ) : m.discountedPrice !== undefined && m.discountedPrice < m.price ? (
                  <div>
                    <div style={{ fontSize:11, color:'#999', textDecoration:'line-through' }}>NT${m.price}</div>
                    <div style={{ fontSize:16, fontWeight:700, color:'#8B1A1A' }}>NT${m.discountedPrice}</div>
                  </div>
                ) : (
                  <div style={{ fontSize:16, fontWeight:700, color:'#8B1A1A' }}>NT${m.discountedPrice ?? m.price}</div>
                )}
                <span style={{ fontSize:18, color:'#ccc', marginLeft:8 }}>›</span>
              </div>
            </div>
          ))}
          {buyPassTypes.length > 0 && (
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'14px 16px', marginBottom:10 }}>
              <div style={{ fontWeight:600, fontSize:14, color:'#1a1a1a', textAlign:'left', marginBottom:8 }}>購買定期票入場</div>
              <select defaultValue="" onChange={e => pickBuyPass(e.target.value)}
                style={{ width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', color:'#1a1a1a', appearance:'auto' }}>
                <option value="" disabled>請選擇定期票方案…</option>
                {buyPassTypes.map(pt => {
                  const dur = pt.durationMonths ? `${pt.durationMonths}個月` : pt.durationDays ? `${pt.durationDays}天` : '';
                  const scopeLabel = pt.scope === 'shared' ? '雙館' : '單館';
                  const canInst = pt.installment?.enabled ? ' · 可分期' : '';
                  return <option key={pt.id} value={pt.id}>{pt.name}（{[dur, scopeLabel].filter(Boolean).join('・')}）NT${pt.price}{canInst}</option>;
                })}
              </select>
            </div>
          )}
        </div>
      </>
    );
  }

  if (step === 'select_payment') return wrap(
    <>
      <Header title="選擇付款方式" onBack={() => setStep('select_method')} />
      <MemberSelector />
      <div style={{ padding:20 }}>
        <div style={{ background:'#FBF5F5', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13 }}>
          <div style={{ color:'#999', marginBottom:4 }}>入場方式</div>
          <div style={{ fontWeight:600 }}>{selectedEntry?.label}</div>
          {selectedEntry?.discountedPrice !== undefined ? (
            <div style={{ color:'#8B1A1A', fontWeight:700, fontSize:16, marginTop:4 }}>NT${selectedEntry.discountedPrice}</div>
          ) : selectedEntry?.price > 0 ? (
            <div style={{ color:'#8B1A1A', fontWeight:700, fontSize:16, marginTop:4 }}>NT${selectedEntry.price}</div>
          ) : null}
        </div>
        {selectedEntry?.type === 'buy_pass' && selectedEntry?.installment?.enabled && (
          <PaymentPlanChoice installment={selectedEntry.installment} price={selectedEntry.price}
            plan={buyPassPlan} hideMethod onChange={({ plan }) => setBuyPassPlan(plan)} />
        )}
        <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>
          {selectedEntry?.type === 'buy_pass' && buyPassPlan === 'installment' ? '請選擇「頭款（第一期）」付款方式' : '請選擇付款方式'}
        </div>
        {PAYMENT_METHODS.map(pm => (
          <div key={pm.key} onClick={() => { setSelectedPayment(pm.key); setStep('shoes'); }}
            style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'14px 16px', marginBottom:10, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontWeight:500, fontSize:14 }}>{pm.label}</div>
            <div style={{ fontSize:18, color:'#ccc' }}>›</div>
          </div>
        ))}
      </div>
    </>
  );

  if (step === 'shoes') return wrap(
    <>
      <Header title="租借器材" onBack={() => {
        if (selectedPayment) setStep('select_payment');
        else if (selectedType) setStep('select_method');
        else doVerify();
      }} />
      <MemberSelector />
      <div style={{ padding:20 }}>
        {/* 續約（定期票到期前14天）*/}
        {renewal && (
          <div style={{ background:'#fff', borderRadius:16, border:`1.5px solid ${renewOptIn?'#8B1A1A':'#E8D5D5'}`, padding:20, marginBottom:16 }}>
            <div style={{ fontWeight:600, fontSize:15, marginBottom:4 }}>🎫 定期票即將到期</div>
            <div style={{ fontSize:12, color:'#999', marginBottom:14 }}>
              {renewal.passTypeName}・剩 {renewal.daysLeft} 天（{renewal.currentEndDate} 到期）
            </div>
            <div onClick={() => setRenewOptIn(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, border:`1.5px solid ${renewOptIn?'#8B1A1A':'#E8D5D5'}`, background: renewOptIn?'#FBF5F5':'#fff', cursor:'pointer' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14 }}>順便續約（延長至 {renewal.newEndDate}）</div>
                <div style={{ fontSize:13, marginTop:2 }}>
                  {renewal.renewalPrice < renewal.fullPrice && (
                    <span style={{ color:'#bbb', textDecoration:'line-through', marginRight:6 }}>NT${renewal.fullPrice.toLocaleString()}</span>
                  )}
                  <span style={{ color:'#8B1A1A', fontWeight:700 }}>NT${renewal.renewalPrice.toLocaleString()}</span>
                  {renewal.renewalDiscount && <span style={{ fontSize:11, color:'#A32D2D', marginLeft:6 }}>續約優惠</span>}
                </div>
              </div>
              <div style={{ width:24, height:24, borderRadius:12, border:`2px solid ${renewOptIn?'#8B1A1A':'#ccc'}`, background: renewOptIn?'#8B1A1A':'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {renewOptIn && <span style={{ color:'#fff', fontSize:14 }}>✓</span>}
              </div>
            </div>
            {renewOptIn && renewInstEnabled && (
              <div style={{ display:'flex', gap:10, marginTop:12 }}>
                {[{ k:'full', t:'一次付清', s:`NT$${renewal.renewalPrice.toLocaleString()}` },
                  { k:'installment', t:`分期 ${renewal.installment.periods.length} 期`, s:`首期 NT$${(renewPeriods[0]||0).toLocaleString()}` }].map(o => (
                  <div key={o.k} onClick={() => setRenewPlan(o.k)}
                    style={{ flex:1, padding:'10px 12px', borderRadius:10, border:`1.5px solid ${renewPlan===o.k?'#8B1A1A':'#E8D5D5'}`, background: renewPlan===o.k?'#FBF5F5':'#fff', cursor:'pointer', textAlign:'center' }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{o.t}</div>
                    <div style={{ fontSize:12, color:'#8B1A1A', marginTop:2 }}>{o.s}</div>
                  </div>
                ))}
              </div>
            )}
            {renewOptIn && (
              <div style={{ marginTop:12 }}>
                <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>
                  {renewPlan === 'installment' ? '續約頭款（第一期）付款方式' : '續約付款方式'}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {PAYMENT_METHODS.map(pm => (
                    <div key={pm.key} onClick={() => setSelectedPayment(pm.key)}
                      style={{ padding:'8px 14px', borderRadius:20, border:`1.5px solid ${selectedPayment===pm.key?'#8B1A1A':'#E8D5D5'}`, background: selectedPayment===pm.key?'#8B1A1A':'#fff', color: selectedPayment===pm.key?'#fff':'#666', fontSize:13, cursor:'pointer' }}>
                      {pm.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{ background:'#fff', borderRadius:16, border:'0.5px solid #E8D5D5', padding:24 }}>
          <div style={{ fontWeight:600, fontSize:17, marginBottom:20, textAlign:'center' }}>需要租借器材嗎？</div>
          {/* 岩鞋 */}
          <div onClick={() => setRentShoes(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:12, border:`1.5px solid ${rentShoes?'#8B1A1A':'#E8D5D5'}`, background: rentShoes?'#FBF5F5':'#fff', marginBottom:12, cursor:'pointer' }}>
            <img src="/climbing-shoe.webp" alt="岩鞋" style={{ width:36, height:36, objectFit:"contain" }} />
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:15 }}>岩鞋租借</div>
              <div style={{ fontSize:13, color:'#999' }}>NT$100</div>
            </div>
            <div style={{ width:24, height:24, borderRadius:12, border:`2px solid ${rentShoes?'#8B1A1A':'#ccc'}`, background: rentShoes?'#8B1A1A':'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {rentShoes && <span style={{ color:'#fff', fontSize:14 }}>✓</span>}
            </div>
          </div>
          {/* 粉袋 */}
          <div onClick={() => setRentChalk(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:12, border:`1.5px solid ${rentChalk?'#8B1A1A':'#E8D5D5'}`, background: rentChalk?'#FBF5F5':'#fff', marginBottom:12, cursor:'pointer' }}>
            <img src="/chalk-bag.webp" alt="粉袋" style={{ width:36, height:36, objectFit:"contain", borderRadius:4 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:15 }}>粉袋租借</div>
              <div style={{ fontSize:13, color:'#999' }}>NT$50</div>
            </div>
            <div style={{ width:24, height:24, borderRadius:12, border:`2px solid ${rentChalk?'#8B1A1A':'#ccc'}`, background: rentChalk?'#8B1A1A':'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {rentChalk && <span style={{ color:'#fff', fontSize:14 }}>✓</span>}
            </div>
          </div>
          {/* 都不需要 */}
          <div onClick={() => { setRentShoes(false); setRentChalk(false); }}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:12, border:`1.5px solid ${(!rentShoes && !rentChalk)?'#8B1A1A':'#E8D5D5'}`, background: (!rentShoes && !rentChalk)?'#FBF5F5':'#fff', marginBottom:24, cursor:'pointer' }}>
            <div style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-ban" style={{ fontSize:28, color:(!rentShoes && !rentChalk)?'#8B1A1A':'#bbb' }} aria-hidden="true" />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:15 }}>都不需要</div>
              <div style={{ fontSize:13, color:'#999' }}>不租借任何器材</div>
            </div>
            <div style={{ width:24, height:24, borderRadius:12, border:`2px solid ${(!rentShoes && !rentChalk)?'#8B1A1A':'#ccc'}`, background: (!rentShoes && !rentChalk)?'#8B1A1A':'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {(!rentShoes && !rentChalk) && <span style={{ color:'#fff', fontSize:14 }}>✓</span>}
            </div>
          </div>
          {error && <div style={{ marginBottom:12, fontSize:12, color:'#A32D2D', background:'#FCEBEB', borderRadius:8, padding:'8px 12px' }}>{error}</div>}
          {renewOptIn && !selectedPayment && (
            <div style={{ marginBottom:12, fontSize:12, color:'#A32D2D', textAlign:'center' }}>請先選擇續約付款方式</div>
          )}
          <button onClick={() => handleGenerateQR(rentShoes, rentChalk)} disabled={loading || (renewOptIn && !selectedPayment)}
            style={{ width:'100%', height:50, borderRadius:12, background: (renewOptIn && !selectedPayment) ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:16, fontWeight:600, cursor: (renewOptIn && !selectedPayment) ? 'not-allowed' : 'pointer' }}>
            {loading ? '...' : `確認${(renewDueNow + (rentShoes?100:0) + (rentChalk?50:0)) > 0 ? `（+NT$${(renewDueNow + (rentShoes?100:0)+(rentChalk?50:0)).toLocaleString()}）` : ''}`}
          </button>
        </div>
      </div>
    </>
  );

  if (step === 'qr') {
    // 分期購定期票：本次只收「第一期（頭款）」，合計顯示頭款而非全額（與後端一致）
    const bpInst = selectedEntry?.type === 'buy_pass' && buyPassPlan === 'installment'
      && (selectedEntry?.installment?.periods?.length >= 2);
    const firstPeriod = bpInst
      ? Math.round((selectedEntry.price || 0) * (Number(selectedEntry.installment.periods[0].percent) || 0) / 100)
      : null;
    const entryPrice = selectedEntry?.freeEntry ? 0 : (bpInst ? firstPeriod : (selectedEntry?.discountedPrice ?? selectedEntry?.price ?? 0));
    const totalAmount = entryPrice + (rentShoes ? 100 : 0) + (rentChalk ? 50 : 0) + renewDueNow;
    const minutesLeft = qrExpiry ? Math.max(0, dayjs(qrExpiry).diff(dayjs(), 'minute')) : 0;
    return wrap(
      <>
        <Header title="入場 QR Code" onBack={() => navigate('/member/home')} />
        <MemberSelector />
        <div style={{ padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, border:'0.5px solid #E8D5D5', padding:24, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,.06)' }}>
            <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:16, color:'#8B1A1A', marginBottom:16 }}>RedRock</div>
            {qrDataUrl && <img src={qrDataUrl} alt="QR Code" style={{ width:220, height:220, borderRadius:10 }} />}
            <div style={{ marginTop:16 }}>
              <div style={{ fontWeight:600, fontSize:18 }}>{entrant?.name}</div>
              <div style={{ fontSize:12, color:'#999', marginTop:3 }}>{selectedType?.label ? `${selectedType.label}・${selectedEntry?.label || ''}` : (selectedEntry?.label || ENTRY_TYPE_LABEL[selectedEntry?.type] || selectedEntry?.type)}</div>
            </div>
            <div style={{ marginTop:16, padding:'12px 0', borderTop:'0.5px solid #E8D5D5', fontSize:13 }}>
              {entryPrice > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ color:'#666' }}>{selectedEntry?.type === 'buy_discount_card' ? '折扣優惠券' : selectedEntry?.type === 'buy_pass' ? (bpInst ? '定期票（頭款・第1期）' : '定期票') : '入場費'}</span>
                  <span>NT${entryPrice}</span>
                </div>
              )}
              {bpInst && (
                <div style={{ fontSize:11, color:'#999', textAlign:'right', marginBottom:6, marginTop:-2 }}>
                  分期 {selectedEntry.installment.periods.length} 期 · 全額 NT${(selectedEntry.price || 0).toLocaleString()}
                </div>
              )}
              {renewOptIn && renewal && (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ color:'#666' }}>定期票續約{renewPlan === 'installment' ? '（頭款・第1期）' : ''}</span>
                    <span>NT${renewDueNow.toLocaleString()}</span>
                  </div>
                  {renewPlan === 'installment' && renewPeriods.length >= 2 && (
                    <div style={{ fontSize:11, color:'#999', textAlign:'right', marginBottom:6, marginTop:-2 }}>
                      分期 {renewPeriods.length} 期 · 折後全額 NT${renewal.renewalPrice.toLocaleString()}（末期 NT${renewPeriods[renewPeriods.length-1].toLocaleString()}）
                    </div>
                  )}
                </>
              )}
              {rentShoes && (
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ color:'#666' }}>岩鞋租借</span>
                  <span>NT$100</span>
                </div>
              )}
              {rentChalk && (
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ color:'#666' }}>粉袋租借</span>
                  <span>NT$50</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, paddingTop:6, borderTop:'0.5px solid #F5EFEF' }}>
                <span>合計</span>
                <span style={{ color:'#8B1A1A', fontSize:16 }}>NT${totalAmount}</span>
              </div>
              {selectedPayment && (
                <div style={{ marginTop:6, fontSize:12, color:'#999' }}>
                  付款方式：{PAYMENT_METHODS.find(p => p.key === selectedPayment)?.label}
                </div>
              )}
            </div>
            <div style={{ marginTop:8, fontSize:11, color:'#999' }}>⏱ 有效時間剩餘約 {minutesLeft} 分鐘</div>
          </div>
          <div style={{ background:'#E6F1FB', border:'0.5px solid #B5D4F4', borderRadius:10, padding:'10px 14px', marginTop:14, fontSize:12, color:'#185FA5', display:'flex', gap:8 }}>
            <span>💡</span><span>請出示此 QR Code 給工作人員掃描，掃描後完成入場</span>
          </div>
          <button onClick={doVerify}
            style={{ width:'100%', marginTop:12, height:44, borderRadius:10, background:'#fff', color:'#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:14, fontWeight:500, cursor:'pointer' }}>
            重新產生
          </button>
        </div>
      </>
    );
  }

  return null;
}
