import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { memberClient } from '../../api/client';
import { getMemberCompetitions, getMemberRegistrations, registerForCompetition, getCompetition, cancelRegistration } from '../../api/competitions';
import PaymentFlow, { ONLINE_PAYMENT_ENABLED } from '../../components/PaymentFlow';
import SignaturePad from '../../components/SignaturePad.jsx';
import dayjs from 'dayjs';
import PaymentSection from '../../components/PaymentSection';

const STEPS = ['基本資料', '付款資訊', '同意書', '簽名'];

export default function MemberCompetitionsPage() {
  const { member } = useMember();
  const [competitions, setCompetitions] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open'); // open | my
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState('ok');

  // 報名 modal
  const [showModal, setShowModal] = useState(false);
  const [payFor, setPayFor] = useState(null); // { registrationId, fee, gymId }
  const [familyMembers, setFamilyMembers] = useState([]);
  const [registerForId, setRegisterForId] = useState(null); // null = 本人
  const [selectedComp, setSelectedComp] = useState(null);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [cancelModal, setCancelModal] = useState(null); // registration object
  const [cancelReason, setCancelReason] = useState('');
  const [refundBankName, setRefundBankName] = useState('');
  const [refundBankCode, setRefundBankCode] = useState('');
  const [refundAccount, setRefundAccount] = useState('');
  const [refundAccountName, setRefundAccountName] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (!refundBankCode.trim() || !refundAccount.trim()) {
      showMsg('請填寫退費銀行代碼與帳號', 'red'); return;
    }
    setCancelling(true);
    try {
      const res = await cancelRegistration(cancelModal.id, {
        reason: cancelReason,
        refundBankName, refundBankCode, refundAccount, refundAccountName,
      });
      showMsg(res.data.message || '已取消報名，名額已釋出');
      setCancelModal(null);
      setCancelReason(''); setRefundBankName(''); setRefundBankCode(''); setRefundAccount(''); setRefundAccountName('');
      await load();
    } catch (err) {
      showMsg(err.response?.data?.message || '取消失敗', 'red');
    } finally { setCancelling(false); }
  };

  // Step 1 fields
  const [divisionId, setDivisionId] = useState('');
  const [isHonorary, setIsHonorary] = useState(false);
  const [idNumber, setIdNumber] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [height, setHeight] = useState('');
  const [armSpan, setArmSpan] = useState('');
  // Step 2 fields
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [paymentDate, setPaymentDate] = useState('');
  const [bankLastFive, setBankLastFive] = useState('');
  // Step 3 — agreement
  const [agreedWaiver, setAgreedWaiver] = useState(false);
  const [agreedPhoto, setAgreedPhoto] = useState(false);
  // Step 4 — signatures
  const [memberSig, setMemberSig] = useState(null);
  const [guardianSig, setGuardianSig] = useState(null);


  const navigate = useNavigate();
  const location = useLocation();

  const NavBar = () => (
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
            <div style={{ fontSize:10, fontWeight: active ? 600 : 400 }}>{n.label}</div>
          </div>
        );
      })}
    </div>
  );
  const memberSigRef = useRef(null);
  const guardianSigRef = useRef(null);

  const showMsg = (t, type='ok') => { setMsg(t); setMsgType(type); setTimeout(()=>setMsg(''),5000); };

  // 報名對象（本人或選定的家庭成員）——年齡/監護人/費用一律以此人計算
  const registrant = registerForId ? (familyMembers.find(c => c.id === registerForId) || member) : member;

  const isMinor = (() => {
    if (!registrant?.birthday) return false;
    return dayjs().diff(dayjs(registrant.birthday), 'year') < 18;
  })();

  const calcFee = (comp) => {
    if (!comp) return null;
    const fees = comp.fees || {};
    const today = dayjs().format('YYYY-MM-DD');
    const isEarlyBird = comp.earlyBirdDeadline && today <= comp.earlyBirdDeadline;
    const childLimit = fees.childAgeLimit || 15;
    const age = registrant?.birthday ? dayjs().diff(dayjs(registrant.birthday), 'year') : 99;
    const isChild = age < childLimit;
    let fee = isChild
      ? (isEarlyBird ? fees.childEarlyBird : fees.childRegular) ?? 950
      : (isEarlyBird ? fees.adultEarlyBird : fees.adultRegular) ?? 1100;
    return { fee, isEarlyBird, isChild };
  };

  const feeInfo = calcFee(selectedComp);

  const load = async () => {
    setLoading(true);
    try {
      const [compRes, regRes] = await Promise.allSettled([
        getMemberCompetitions(),
        member?.id ? getMemberRegistrations(member.id) : Promise.resolve({ data: { registrations: [] } }),
      ]);
      setCompetitions(compRes.status==='fulfilled' ? compRes.value.data.competitions||[] : []);
      setMyRegistrations(regRes.status==='fulfilled' ? regRes.value.data.registrations||[] : []);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (member?.id) {
      memberClient.get('/members/my/children')
        .then(r => setFamilyMembers(r.data.children || []))
        .catch(() => {});
    }
  }, [member?.id]);

  useEffect(() => { load(); }, [member?.id]);

  const openRegister = async (comp) => {
    setSelectedComp(comp);
    setRegisterForId(null);
    setStep(1);
    setDivisionId(comp.divisions?.[0]?.id || '');
    setIsHonorary(false);
    setIdNumber(''); setEmergencyContact(''); setEmergencyPhone('');
    setHeight(''); setArmSpan('');
    setPaymentMethod('transfer'); setPaymentDate(''); setBankLastFive('');
    setAgreedWaiver(false); setAgreedPhoto(false);
    setMemberSig(null); setGuardianSig(null);
    setShowModal(true);
  };

  const nextStep = () => {
    if (step === 1) {
      if (!divisionId) { showMsg('請選擇報名組別', 'red'); return; }
      if (!idNumber.trim()) { showMsg('請填寫身分證/護照號碼（保險用）', 'red'); return; }
      if (!emergencyContact.trim() || !emergencyPhone.trim()) { showMsg('請填寫緊急聯絡人資訊', 'red'); return; }
    }
    if (step === 3) {
      if (!agreedWaiver || !agreedPhoto) { showMsg('請確認同意所有事項', 'red'); return; }
    }
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    if (!memberSig) { showMsg('請完成本人簽名', 'red'); return; }
    if (isMinor && !guardianSig) { showMsg('未滿18歲需法定代理人簽名', 'red'); return; }
    setSubmitting(true);
    try {
      const targetId = registerForId || member.id;
      const targetName = familyMembers.find(c=>c.id===targetId)?.name || member.name;
      const res = await registerForCompetition(selectedComp.id, {
        memberId: targetId,
        memberName: targetName,
        isMinor,
        divisionId,
        isHonorary,
        idNumber,
        emergencyContact,
        emergencyPhone,
        height: height ? Number(height) : null,
        armSpan: armSpan ? Number(armSpan) : null,
        paymentMethod,
        paymentDate: paymentMethod === 'transfer' ? paymentDate : null,
        bankLastFive: paymentMethod === 'transfer' ? bankLastFive : null,
        signatureData: memberSig,
        guardianSignature: guardianSig || null,
      });
      const reg = res?.data?.registration;
      // 轉帳：建立 transferRecords → 待辦頁確認收款（確認時自動確認此報名付款）
      if (paymentMethod === 'transfer' && reg?.id) {
        try {
          const { submitTransferRecord } = await import('../../api/transfers');
          await submitTransferRecord({
            memberId: targetId, memberName: targetName, gymId: selectedComp.gymId,
            orderType: 'competition', refId: reg.id, orderName: selectedComp.name || '比賽報名',
            amount: reg.registrationFee, bankLastFive, paymentDate,
          });
        } catch (e) { /* 不阻斷報名 */ }
      }
      setShowModal(false);
      await load();
      if (ONLINE_PAYMENT_ENABLED && reg && reg.registrationFee > 0 && reg.paymentStatus !== 'confirmed') {
        setPayFor({ registrationId: reg.id, fee: reg.registrationFee, gymId: selectedComp.gymId });
      } else {
        showMsg('報名成功！請完成繳費以確保名額。');
      }
    } catch (err) {
      showMsg(err.response?.data?.message || '報名失敗', 'red');
    } finally { setSubmitting(false); }
  };

  const alreadyRegistered = (compId) => myRegistrations.some(r => r.competitionId === compId && r.status !== 'cancelled');

  const payStatusBadge = (r) => {
    if (r.paymentStatus === 'confirmed') return { bg:'#E6F4EB', color:'#2D7D46', text:'已確認付款' };
    if (r.paymentStatus === 'refunded') return { bg:'#F0EDED', color:'#666', text:'已退費' };
    return { bg:'#FAEEDA', color:'#854F0B', text:'待確認付款' };
  };

  return (
    <div style={{ minHeight:'100vh', background:'#FBF5F5', paddingBottom:80 }}>
      <div style={{ background:'#8B1A1A', padding:'16px 20px 14px', color:'#fff' }}>
        <div style={{ fontSize:18, fontWeight:700 }}>🏆 比賽報名</div>
      </div>

      {msg && (
        <div style={{ margin:'12px 16px 0', background:msgType==='ok'?'#E6F4EB':'#FCEBEB', borderRadius:8, padding:'10px 14px', fontSize:13, color:msgType==='ok'?'#2D7D46':'#A32D2D' }}>{msg}</div>
      )}

      <div style={{ display:'flex', gap:0, margin:'14px 16px 0', background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
        {[{key:'open',label:'開放中報名'},{key:'my',label:'我的比賽報名'}].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ flex:1, height:38, border:'none', background:tab===t.key?'#8B1A1A':'#fff', color:tab===t.key?'#fff':'#666', fontSize:13, fontWeight:tab===t.key?600:400, cursor:'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding:'14px 16px' }}>
        {loading ? <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div> : (
          <>
            {tab === 'open' && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {competitions.filter(c=>c.status==='open').length === 0 && (
                  <div style={{ textAlign:'center', color:'#999', padding:40 }}>目前沒有開放的比賽</div>
                )}
                {competitions.filter(c=>c.status==='open').map(c => {
                  const fee = calcFee(c);
                  const registered = alreadyRegistered(c.id);
                  return (
                    <div key={c.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                      <div style={{ fontWeight:600, fontSize:15, marginBottom:4 }}>{c.name}</div>
                      <div style={{ fontSize:12, color:'#999', marginBottom:8 }}>
                        比賽日：{c.eventDate} ｜ 報名截止：{c.registrationEnd}
                        {c.earlyBirdDeadline && ` ｜ 早鳥至：${c.earlyBirdDeadline}`}
                      </div>
                      {fee && (
                        <div style={{ fontSize:12, color:'#8B1A1A', marginBottom:8 }}>
                          {fee.isEarlyBird ? `🐦 早鳥優惠！` : ''}報名費：NT${fee.fee}
                        </div>
                      )}
                      <div style={{ fontSize:12, color:'#666', marginBottom:10 }}>
                        組別：{(c.divisions||[]).map(d=>`${d.name}（${d.maxParticipants}人）`).join(' / ')}
                      </div>
                      {c.description && <div style={{ fontSize:12, color:'#666', marginBottom:12, lineHeight:1.6 }}>{c.description.slice(0,120)}...</div>}
                      {registered ? (
                        <div style={{ background:'#E6F4EB', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#2D7D46', fontWeight:500 }}>✓ 已報名</div>
                      ) : (
                        <button onClick={()=>openRegister(c)}
                          style={{ width:'100%', height:42, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                          立即報名
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'my' && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {myRegistrations.length === 0 && <div style={{ textAlign:'center', color:'#999', padding:40 }}>尚無報名記錄</div>}
                {myRegistrations.map(r => {
                  const ps = payStatusBadge(r);
                  return (
                    <div key={r.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                      <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>{r.competitionName}</div>
                      <div style={{ fontSize:12, color:'#666', marginBottom:6 }}>
                        組別：{r.divisionName} {r.isHonorary && '（榮譽參賽）'}
                        {r.status==='waitlist' && <span style={{ color:'#854F0B', marginLeft:6 }}>候補第 {r.waitlistPosition} 位</span>}
                      </div>
                      <div style={{ fontSize:12, marginBottom:6 }}>
                        報名費：NT${r.registrationFee} {r.isEarlyBird?'（早鳥）':''}
                      </div>
                      <div style={{ display:'inline-block', background:ps.bg, color:ps.color, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:8 }}>{ps.text}</div>
                      {r.paymentStatus==='pending' && r.paymentMethod==='transfer' && r.status !== 'cancelled' && (
                        <div style={{ marginTop:10, background:'#FFF8E6', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#8B6914' }}>
                          請匯款後等待館方確認，確認後即保留名額
                        </div>
                      )}
                      {r.status !== 'cancelled' && (
                        <button onClick={() => { setCancelModal(r); setCancelReason(''); setRefundBankName(''); setRefundBankCode(''); setRefundAccount(''); setRefundAccountName(''); }}
                          style={{ marginTop:10, height:30, padding:'0 14px', borderRadius:6, background:'#fff', color:'#A32D2D', border:'0.5px solid #A32D2D', fontSize:12, cursor:'pointer' }}>
                          取消報名
                        </button>
                      )}
                      {r.status === 'cancelled' && (
                        <div style={{ marginTop:8, fontSize:11, color:'#999' }}>已取消 {r.refundRequested?'・退費申請中':''}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* 線上付款 Modal（Phase 1：競賽報名）*/}
      {payFor && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:210, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:380, padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontWeight:600, fontSize:15 }}>完成繳費</div>
              <button onClick={()=>{ setPayFor(null); showMsg('報名已保留，可於「我的報名」完成繳費或改用匯款'); }} style={{ background:'none', border:'none', fontSize:20, color:'#999', cursor:'pointer' }}>✕</button>
            </div>
            <PaymentFlow
              client={memberClient}
              orderType="competition"
              orderRef={{ registrationId: payFor.registrationId }}
              amount={payFor.fee}
              gymId={payFor.gymId}
              onPaid={()=>{ setPayFor(null); showMsg('繳費完成，報名已確認！'); load(); }}
              onCancel={()=>{ setPayFor(null); showMsg('報名已保留，可於「我的報名」完成繳費或改用匯款'); }}
            />
          </div>
        </div>
      )}

      {/* 報名 Modal */}
      {showModal && selectedComp && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'16px 16px 0 0', width:'100%', maxHeight:'92vh', display:'flex', flexDirection:'column' }}>
            {/* Header */}
            <div style={{ padding:'16px 20px 10px', borderBottom:'0.5px solid #F0E8E8', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                <div style={{ fontWeight:600, fontSize:15 }}>{selectedComp.name}</div>
                <button onClick={()=>setShowModal(false)} style={{ background:'none', border:'none', fontSize:20, color:'#999', cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ display:'flex', gap:4, marginBottom:6 }}>
                {STEPS.map((s,i)=>(
                  <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                    <div style={{ width:'100%', height:5, borderRadius:3,
                      background: i+1 < step ? '#2D7D46' : i+1 === step ? '#8B1A1A' : '#E0D0D0' }}/>
                    <div style={{ fontSize:10, fontWeight: i+1===step?700:400,
                      color: i+1 < step ? '#2D7D46' : i+1 === step ? '#8B1A1A' : '#bbb' }}>
                      {i+1 < step ? '✓' : s}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ overflowY:'auto', flex:1, padding:'16px 20px' }}>

              {/* Step 1: 基本資料 */}
              {step===1 && (<>
                <div style={{ background:'#FBF5F5', borderRadius:8, padding:'10px 12px', marginBottom:14 }}>
                  <div style={{ fontSize:12, color:'#666' }}>姓名：{member?.name}　生日：{member?.birthday}</div>
                  {feeInfo && <div style={{ fontSize:13, color:'#8B1A1A', fontWeight:600, marginTop:4 }}>
                    {feeInfo.isEarlyBird ? '🐦 早鳥優惠　' : ''}報名費：NT${feeInfo.fee}
                  </div>}
                </div>
                {/* 為誰報名 */}
                {familyMembers.length > 0 && (
                  <div style={{ marginBottom:14 }}>
                    <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:8, fontWeight:500 }}>為誰報名</label>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <button onClick={()=>setRegisterForId(null)}
                        style={{ padding:'6px 14px', borderRadius:20, border:`1.5px solid ${!registerForId?'#8B1A1A':'#E8D5D5'}`, background:!registerForId?'#FBF5F5':'#fff', color:!registerForId?'#8B1A1A':'#666', fontSize:12, cursor:'pointer', fontWeight:!registerForId?600:400 }}>
                        👤 {member?.name}（本人）
                      </button>
                      {familyMembers.map(c=>(
                        <button key={c.id} onClick={()=>setRegisterForId(c.id)}
                          style={{ padding:'6px 14px', borderRadius:20, border:`1.5px solid ${registerForId===c.id?'#8B1A1A':'#E8D5D5'}`, background:registerForId===c.id?'#FBF5F5':'#fff', color:registerForId===c.id?'#8B1A1A':'#666', fontSize:12, cursor:'pointer', fontWeight:registerForId===c.id?600:400 }}>
                          {c.gender==='male'?'👦':c.gender==='female'?'👧':'🧒'} {c.name}
                        </button>
                      ))}
                    </div>
                    {registerForId && (
                      <div style={{ fontSize:11, color:'#8B1A1A', marginTop:6 }}>
                        ✦ 以下資料請填寫 {familyMembers.find(c=>c.id===registerForId)?.name} 的個人資訊
                      </div>
                    )}
                  </div>
                )}
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:6, fontWeight:500 }}>報名組別 *</label>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {selectedComp.divisions.map(d=>(
                      <label key={d.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8, border:`1.5px solid ${divisionId===d.id?'#8B1A1A':'#E8D5D5'}`, background:divisionId===d.id?'#FBF5F5':'#fff', cursor:'pointer' }}>
                        <input type="radio" name="division" value={d.id} checked={divisionId===d.id} onChange={()=>setDivisionId(d.id)} style={{ accentColor:'#8B1A1A' }}/>
                        <span style={{ fontSize:13, fontWeight:divisionId===d.id?600:400 }}>{d.name}</span>
                        <span style={{ fontSize:11, color:'#999', marginLeft:'auto' }}>上限 {d.maxParticipants} 人</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, cursor:'pointer' }}>
                  <input type="checkbox" checked={isHonorary} onChange={e=>setIsHonorary(e.target.checked)} style={{ width:16, height:16, accentColor:'#8B1A1A' }}/>
                  <span style={{ fontSize:13, color:'#666' }}>榮譽參賽（已於相近組別獲前三名，僅參賽不計名次）</span>
                </label>
                {[
                  { label:'身分證 / 護照號碼 *（保險用）', val:idNumber, set:setIdNumber, ph:'R123456789 / 外籍：國籍+護照號' },
                  { label:'緊急聯絡人姓名 *', val:emergencyContact, set:setEmergencyContact, ph:'請填寫緊急聯絡人姓名' },
                  { label:'緊急聯絡人手機 *', val:emergencyPhone, set:setEmergencyPhone, ph:'請填寫緊急聯絡人手機' },
                ].map(({label,val,set,ph})=>(
                  <div key={label} style={{ marginBottom:12 }}>
                    <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>{label}</label>
                    <input value={val} onChange={e=>set(e.target.value)} placeholder={ph}
                      style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                  </div>
                ))}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                  <div>
                    <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>身高（公分，定線參考）</label>
                    <input type="number" value={height} onChange={e=>setHeight(e.target.value)} placeholder="例：170"
                      style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>臂展（公分，定線參考）</label>
                    <input type="number" value={armSpan} onChange={e=>setArmSpan(e.target.value)} placeholder="例：175"
                      style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                  </div>
                </div>
              </>)}

              {/* Step 2: 付款資訊 */}
              {step===2 && (<>
                <div style={{ background:'#FBF5F5', borderRadius:8, padding:'12px 14px', marginBottom:14 }}>
                  <div style={{ fontSize:12, color:'#666', marginBottom:4 }}>報名費：<strong style={{ color:'#8B1A1A', fontSize:15 }}>NT${feeInfo?.fee}</strong> {feeInfo?.isEarlyBird?'（早鳥）':''}</div>
                  <div style={{ fontSize:11, color:'#999' }}>請於報名後 3 日內完成繳費，以確保名額</div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:8, fontWeight:500 }}>付款方式</label>
                  <div style={{ display:'flex', gap:8 }}>
                    {[{k:'transfer',l:'銀行轉帳'},{k:'cash',l:'臨櫃現金'},{k:'linepay',l:'Line Pay'},{k:'jkopay',l:'街口'},{k:'taiwanpay',l:'台灣Pay'}].map(pm=>(
                      <button key={pm.k} onClick={()=>setPaymentMethod(pm.k)}
                        style={{ flex:1, height:38, borderRadius:8, border:`1.5px solid ${paymentMethod===pm.k?'#8B1A1A':'#E8D5D5'}`, background:paymentMethod===pm.k?'#FBF5F5':'#fff', color:paymentMethod===pm.k?'#8B1A1A':'#666', fontSize:12, fontWeight:paymentMethod===pm.k?600:400, cursor:'pointer' }}>
                        {pm.l}
                      </button>
                    ))}
                  </div>
                </div>
                {paymentMethod==='transfer' && (<>
                  <div style={{ background:'#FBF5F5', borderRadius:8, padding:'12px 14px', marginBottom:14 }}>
                    <div style={{ fontSize:12, color:'#666', marginBottom:4 }}>轉帳帳號</div>
                    <div style={{ fontSize:13, fontWeight:600 }}>台新銀行(812) 關東橋分行</div>
                    <div style={{ fontSize:16, fontFamily:'monospace', letterSpacing:2, color:'#8B1A1A', margin:'6px 0' }}>21000100211430</div>
                    <div style={{ fontSize:13 }}>戶名：紅石攀岩有限公司</div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <div>
                      <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>匯款日期</label>
                      <input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}
                        style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                    </div>
                    <div>
                      <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>匯款末五碼</label>
                      <input type="text" maxLength={5} value={bankLastFive} onChange={e=>setBankLastFive(e.target.value)} placeholder="例：12345"
                        style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                    </div>
                  </div>
                </>)}
              </>)}

              {/* Step 3: 同意書 */}
              {step===3 && (<>
                <div style={{ background:'#FBF5F5', borderRadius:8, padding:'12px 14px', marginBottom:14, fontSize:12, color:'#444', lineHeight:1.9 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>參賽同意書</div>
                  {selectedComp.waiverContent?.zh || `1. 攀登比賽具有潛在之危險性，若發生意外會導致受傷或死亡。\n2. 參賽選手應遵守比賽規則，聽從大會工作人員之指導，隨時注意自身與他人的安全。倘因個人疏失導致意外事件發生，願由選手自行負責。\n3. 本人同意所提個人資料作為大會辦理本活動使用。\n4. 比賽場地已由主辦單位投保公共意外責任險，紅石攀岩館另為選手加保活動綜合保險。\n5. 本人同意比賽報名資料皆屬實，若填寫不實將自動喪失參賽資格。`}
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8, border:`1.5px solid ${agreedWaiver?'#2D7D46':'#E8D5D5'}`, background:agreedWaiver?'#E6F4EB':'#fff', cursor:'pointer', marginBottom:12 }}>
                  <input type="checkbox" checked={agreedWaiver} onChange={e=>setAgreedWaiver(e.target.checked)} style={{ width:18, height:18, accentColor:'#2D7D46' }}/>
                  <span style={{ fontSize:13, fontWeight:500, color:agreedWaiver?'#2D7D46':'#444' }}>本人已詳細閱讀並同意上述參賽規定與免責聲明</span>
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8, border:`1.5px solid ${agreedPhoto?'#2D7D46':'#E8D5D5'}`, background:agreedPhoto?'#E6F4EB':'#fff', cursor:'pointer' }}>
                  <input type="checkbox" checked={agreedPhoto} onChange={e=>setAgreedPhoto(e.target.checked)} style={{ width:18, height:18, accentColor:'#2D7D46' }}/>
                  <span style={{ fontSize:13, fontWeight:500, color:agreedPhoto?'#2D7D46':'#444' }}>本人同意比賽中的照片或影像可作為紅石攀岩館紀錄或宣傳使用</span>
                </label>
                {selectedComp.refundPolicies?.length > 0 && (
                  <div style={{ marginTop:14, background:'#FFF8E6', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#8B6914' }}>
                    <div style={{ fontWeight:600, marginBottom:6 }}>退費政策</div>
                    {selectedComp.refundPolicies.map((p,i)=>(
                      <div key={i}>• {p.deadline} 前取消：{p.rule==='full_minus_admin'?`全額退（扣行政費NT$${p.adminFee}）`:p.rule==='half_minus_admin'?`50%退（扣行政費NT$${p.adminFee}）`:'不退費'}</div>
                    ))}
                  </div>
                )}
              </>)}

              {/* Step 4: 簽名 */}
              {step===4 && (<>
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:13, fontWeight:500, color:'#333', display:'block', marginBottom:8 }}>本人簽名</label>
                  <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, background:'#FBF5F5', overflow:'hidden' }}>
                    <SignaturePad ref={memberSigRef} height={130}/>
                  </div>
                  <div style={{ display:'flex', gap:8, marginTop:6 }}>
                    <button type="button" onClick={()=>{ memberSigRef.current?.clear(); setMemberSig(null); }}
                      style={{ height:28, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#666', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer' }}>清除重簽</button>
                    <button type="button" onClick={()=>{ const d=memberSigRef.current?.toDataURL(); setMemberSig(d||null); }}
                      style={{ height:28, padding:'0 12px', borderRadius:6, background:'#2D7D46', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>儲存簽名</button>
                  </div>
                  {memberSig && <div style={{ fontSize:11, color:'#2D7D46', marginTop:4 }}>✓ 已儲存簽名</div>}
                </div>
                {isMinor && (
                  <div style={{ marginTop:16 }}>
                    <div style={{ background:'#FFF8E6', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12, color:'#8B6914' }}>
                      ⚠ 未滿18歲選手需法定代理人同時簽名
                    </div>
                    <label style={{ fontSize:13, fontWeight:500, color:'#333', display:'block', marginBottom:8 }}>法定代理人簽名</label>
                    <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, background:'#FBF5F5', overflow:'hidden' }}>
                      <SignaturePad ref={guardianSigRef} height={130}/>
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:6 }}>
                      <button type="button" onClick={()=>{ guardianSigRef.current?.clear(); setGuardianSig(null); }}
                        style={{ height:28, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#666', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer' }}>清除重簽</button>
                      <button type="button" onClick={()=>{ const d=guardianSigRef.current?.toDataURL(); setGuardianSig(d||null); }}
                        style={{ height:28, padding:'0 12px', borderRadius:6, background:'#2D7D46', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>儲存簽名</button>
                    </div>
                    {guardianSig && <div style={{ fontSize:11, color:'#2D7D46', marginTop:4 }}>✓ 監護人已儲存簽名</div>}
                  </div>
                )}
              </>)}

            </div>

            {/* Footer */}
            <div style={{ padding:'12px 20px', borderTop:'0.5px solid #F0E8E8', flexShrink:0, display:'flex', gap:8 }}>
              {step > 1 && (
                <button onClick={()=>setStep(s=>s-1)}
                  style={{ flex:1, height:44, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>← 上一步</button>
              )}
              {step < STEPS.length ? (
                <button onClick={nextStep}
                  style={{ flex:2, height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                  下一步 →
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting || !memberSig || (isMinor && !guardianSig)}
                  style={{ flex:2, height:44, borderRadius:10, background:(!memberSig||(isMinor&&!guardianSig))?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                  {submitting ? '送出中...' : '✓ 確認報名'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 取消報名 Modal */}
      {cancelModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'#fff', borderRadius:'16px 16px 0 0', width:'100%', padding:24, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:4 }}>取消報名</div>
            <div style={{ fontSize:13, color:'#999', marginBottom:14 }}>{cancelModal.competitionName}</div>

            {/* 退費說明 */}
            <div style={{ background:'#FFF8E6', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>💰 退費計算說明</div>
              {cancelModal.competitionName && (() => {
                const comp = competitions.find(c => c.id === cancelModal.competitionId);
                const policies = comp?.refundPolicies || [];
                const today = new Date().toISOString().slice(0,10);
                return policies.length > 0 ? (
                  <div>
                    {policies.map((p,i) => (
                      <div key={i} style={{ fontSize:12, color:'#8B6914', marginBottom:4 }}>
                        • {p.deadline} 前取消：{p.rule==='full_minus_admin'?`全額退費（扣行政費 NT$${p.adminFee}）`:p.rule==='half_minus_admin'?`50% 退費（扣行政費 NT$${p.adminFee}）`:'不予退費'}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize:12, color:'#8B6914' }}>請聯絡館方確認退費方式</div>
                );
              })()}
            </div>

            {/* 退費帳號填寫 */}
            <div style={{ background:'#FBF5F5', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>🏦 退費匯款帳號（必填）</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>銀行代碼 *</label>
                  <input value={refundBankCode} onChange={e=>setRefundBankCode(e.target.value)} placeholder="如：812"
                    style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>銀行名稱</label>
                  <input value={refundBankName} onChange={e=>setRefundBankName(e.target.value)} placeholder="如：台新銀行"
                    style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
                </div>
              </div>
              <div style={{ marginBottom:8 }}>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>帳號 *</label>
                <input value={refundAccount} onChange={e=>setRefundAccount(e.target.value)} placeholder="請填寫完整帳號"
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
              </div>
              <div>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>戶名</label>
                <input value={refundAccountName} onChange={e=>setRefundAccountName(e.target.value)} placeholder="請填寫帳戶戶名"
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
              </div>
              <div style={{ fontSize:11, color:'#A32D2D', marginTop:8 }}>退費將於比賽結束後一週內統一匯款至此帳號</div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>取消原因（選填）</label>
              <textarea value={cancelReason} onChange={e=>setCancelReason(e.target.value)} rows={2}
                placeholder="請說明取消原因"
                style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 10px', fontSize:13, resize:'none', outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
            </div>

            <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#A32D2D' }}>
              ⚠ 取消後名額立即釋出，其他報名者可補位
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setCancelModal(null)}
                style={{ flex:1, height:44, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>返回</button>
              <button onClick={handleCancel} disabled={cancelling}
                style={{ flex:2, height:44, borderRadius:10, background:'#A32D2D', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                {cancelling ? '處理中...' : '確認取消報名'}
              </button>
            </div>
          </div>
        </div>
      )}

      <NavBar />
    </div>
  );
}
