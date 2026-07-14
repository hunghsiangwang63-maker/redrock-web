import { useState, useEffect } from 'react';
import { t } from '../../utils/memberI18n';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { memberClient } from '../../api/client';
import dayjs from 'dayjs';
import { isUnder5 } from '../../utils/age';
import PaymentSection from '../../components/PaymentSection';
import PaymentFlow, { ONLINE_PAYMENT_ENABLED } from '../../components/PaymentFlow';
import TransferReuploadModal from '../../components/TransferReuploadModal';

// 參加者生日為民國格式（如 "920110"＝民國92年）；相容 ISO。未滿 5 歲回 true。
const participantUnder5 = (s) => {
  if (!s) return false;
  const str = String(s).trim();
  let d;
  if (str.includes('-')) d = dayjs(str);
  else {
    const digits = str.replace(/\D/g, '');
    if (digits.length < 5) return false;
    const year = parseInt(digits.slice(0, -4), 10) + 1911;
    const mmdd = digits.slice(-4);
    d = dayjs(`${year}-${mmdd.slice(0, 2)}-${mmdd.slice(2, 4)}`);
  }
  return d.isValid() && dayjs().diff(d, 'year') < 5;
};

// 只留抱石體驗課程；小蜘蛛人（兒童）/抱石技巧班已併入「課程試上」報名
const FALLBACK_COURSE_TYPES = [
  { id:'general',    label:'抱石體驗課程（依人數計費）' },
];
const GENERAL_PRICE = { 1:975, 2:875, 3:875 };
const getGeneralPrice = (n) => n>=9?775:n>=6?775:n>=4?825:n>=3?875:n>=2?875:975;
const NATIONALITIES = ['台灣','中國','香港','澳門','美國','日本','韓國','其他'];

const inp = { width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' };

export default function MemberExperiencePage() {
  const { member } = useMember();
  const navigate = useNavigate();
  const location = useLocation();
  const [myBookings, setMyBookings] = useState([]);
  const [reupTarget, setReupTarget] = useState(null); // 轉帳被退回 → 重新上傳補正
  const [courseSettings, setCourseSettings] = useState(null);
  const [tab, setTab] = useState('apply');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState('ok');
  const [payFor, setPayFor] = useState(null); // { bookingId, fee, gymId }

  const [gymId, setGymId] = useState('gym-hsinchu');
  const [courseType, setCourseType] = useState('general');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [facebookName, setFacebookName] = useState('');
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState({ method:'transfer', paymentDate:'', bankLastFive:'' });
  const [participants, setParticipants] = useState([{ name:'', idNumber:'', birthday:'', nationality:'台灣' }]);
  const [submitting, setSubmitting] = useState(false);
  // 課程試上
  const [trialSessions, setTrialSessions] = useState([]);
  const [trialModal, setTrialModal] = useState(null);          // 選中的可試上場次
  const [trialConsent, setTrialConsent] = useState(false);
  const [trialPay, setTrialPay] = useState({ method:'transfer', paymentDate:'', bankLastFive:'' });
  const [trialSubmitting, setTrialSubmitting] = useState(false);
  const [children, setChildren] = useState([]);          // 子會員（家長可代報名）
  const [trialFor, setTrialFor] = useState('self');      // 報名對象：'self' 或子會員 id

  const showMsg = (t,type='ok') => { setMsg(t); setMsgType(type); setTimeout(()=>setMsg(''),6000); };

  const loadTrialSessions = () => {
    memberClient.get('/courses/trial-sessions', { params:{ gymId } })
      .then(r => setTrialSessions(r.data.sessions||[])).catch(()=>setTrialSessions([]));
  };

  useEffect(() => {
    memberClient.get('/experience-bookings/settings').then(r => setCourseSettings(r.data)).catch(()=>{});
    if (member?.id) {
      memberClient.get('/experience-bookings/my').then(r => setMyBookings(r.data.bookings||[])).catch(()=>{});
      memberClient.get('/members/my/children').then(r => setChildren(r.data.children||[])).catch(()=>setChildren([]));
    }
  }, [member?.id]);

  useEffect(() => { loadTrialSessions(); }, [gymId]);

  // 試上報名對象（本人或子女）——未滿 5 歲擋（友善提示，後端仍為權威）
  const trialTarget = trialFor === 'self' ? member : children.find(c => c.id === trialFor);
  const trialTargetUnder5 = isUnder5(trialTarget);

  const submitTrial = async () => {
    if (trialTargetUnder5) { showMsg('未滿 5 歲無法報名課程/體驗','red'); return; }
    if (!trialConsent) { showMsg('請先勾選同意免責同意書','red'); return; }
    if (trialPay.method==='transfer' && (!trialPay.paymentDate || !trialPay.bankLastFive)) { showMsg('請填寫匯款日期與末五碼','red'); return; }
    setTrialSubmitting(true);
    try {
      const res = await memberClient.post('/experience-bookings', {
        memberId: member.id, trialSessionId: trialModal.id, consentSigned: true,
        ...(trialFor !== 'self' ? { childMemberId: trialFor } : {}),
        paymentMethod: trialPay.method, paymentDate: trialPay.paymentDate, bankLastFive: trialPay.bankLastFive,
      });
      const bookingId = res.data.id; const fee = res.data.totalFee || trialModal.trialPrice || 0;
      if (trialPay.method==='transfer' && bookingId) {
        try {
          const fd = new FormData();
          fd.append('type','experience'); fd.append('referenceId',bookingId);
          fd.append('amount', fee); fd.append('bankLastFive', trialPay.bankLastFive||'');
          fd.append('paymentDate', trialPay.paymentDate||'');
          await memberClient.post('/transfers', fd, { headers:{ 'Content-Type':'multipart/form-data' } });
        } catch(e) { /* 不阻斷 */ }
      }
      setTrialModal(null); setTrialConsent(false); setTrialFor('self'); setTrialPay({ method:'transfer', paymentDate:'', bankLastFive:'' });
      loadTrialSessions();
      memberClient.get('/experience-bookings/my').then(r => setMyBookings(r.data.bookings||[])).catch(()=>{});
      if (trialPay.method==='online' && ONLINE_PAYMENT_ENABLED) setPayFor({ bookingId, fee, gymId: trialModal.gymId });
      else if (res.data.isWaitlist) showMsg('此場次已額滿，已為您排入候補；名額釋出將依序轉正', 'orange');
      else {
        const dl = res.data.paymentDeadline ? dayjs(res.data.paymentDeadline).format('MM/DD HH:mm') : '';
        showMsg(`名額已保留！請於${dl ? ` ${dl} 前` : '期限內'}完成付款，逾期名額將釋出`);
      }
      setTab('my');
    } catch (e) { showMsg(e.response?.data?.message || '送出失敗','red'); }
    finally { setTrialSubmitting(false); }
  };

  const addParticipant = () => setParticipants(p=>[...p,{ name:'', idNumber:'', birthday:'', nationality:'台灣' }]);
  const removeParticipant = (i) => { if (participants.length>1) setParticipants(p=>p.filter((_,idx)=>idx!==i)); };
  const updateParticipant = (i, field, val) => setParticipants(p=>p.map((item,idx)=>idx===i?{...item,[field]:val}:item));

  const n = participants.length;
  const currentCT = (courseSettings?.courseTypes || FALLBACK_COURSE_TYPES).find(c=>c.id===courseType);
  const needsIns = currentCT ? currentCT.needsInsurance !== false : true; // 該課程是否需保險（決定是否填身分證/國籍）
  const unitPrice = courseType==='general' ? getGeneralPrice(n) : (courseSettings?.courseTypes || FALLBACK_COURSE_TYPES).find(c=>c.id===courseType)?.price||0;
  const totalFee = courseType==='general' ? unitPrice * n : unitPrice * n;

  const anyParticipantUnder5 = participants.some(p => participantUnder5(p.birthday));

  const handleSubmit = async () => {
    if (!bookingDate) { showMsg('請填寫預約體驗日期','red'); return; }
    if (!bookingTime) { showMsg('請填寫預約時間','red'); return; }
    const invalid = participants.find(p => !p.name.trim() || (needsIns && (!p.idNumber.trim() || !p.birthday.trim())));
    if (invalid) { showMsg(needsIns ? '請填寫所有參加者的姓名、身分證字號、生日' : '請填寫所有參加者的姓名','red'); return; }
    if (anyParticipantUnder5) { showMsg('未滿 5 歲無法報名課程/體驗','red'); return; }
    if (payment.method==='transfer' && !payment.paymentDate) { showMsg('請填寫匯款日期','red'); return; }
    if (payment.method==='transfer' && !payment.bankLastFive) { showMsg('請填寫匯款末五碼','red'); return; }
    setSubmitting(true);
    try {
      const res = await memberClient.post('/experience-bookings', {
        memberId: member.id, gymId, courseType, bookingDate, bookingTime,
        contactName: member.name, contactEmail: member.email, contactPhone: member.phone, facebookName,
        participants, totalFee, paymentDate: payment.paymentDate, bankLastFive: payment.bankLastFive, paymentMethod: payment.method, notes,
      });
      const bookingId = res.data.id; const fee = totalFee;
      // 轉帳：建立 transferRecords（填末五碼）→ 待辦頁確認收款（確認時自動確認此預約）
      if (payment.method === 'transfer' && bookingId) {
        try {
          const fd = new FormData();
          fd.append('memberId', member.id);
          fd.append('memberName', member.name || '');
          fd.append('gymId', gymId);
          fd.append('orderType', 'experience');
          fd.append('refId', bookingId);
          fd.append('orderName', '體驗課程');
          fd.append('amount', totalFee || 0);
          fd.append('bankLastFive', payment.bankLastFive || '');
          fd.append('bankName', payment.bankName || '');
          fd.append('paymentDate', payment.paymentDate || '');
          await memberClient.post('/transfers/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        } catch (e) { /* 不阻斷預約 */ }
      }
      setParticipants([{ name:'', idNumber:'', birthday:'', nationality:'台灣' }]);
      setBookingDate(''); setBookingTime(''); setPayment({ method:'transfer', paymentDate:'', bankLastFive:'' }); setNotes('');
      const r = await memberClient.get('/experience-bookings/my');
      setMyBookings(r.data.bookings||[]);
      setTab('my');
      if (ONLINE_PAYMENT_ENABLED && fee > 0) setPayFor({ bookingId, fee, gymId });
      else showMsg(res.data.message || '預約已送出！');
    } catch(err) { showMsg(err.response?.data?.message||'送出失敗','red'); }
    finally { setSubmitting(false); }
  };

  const NavBar = () => (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#fff', borderTop:'0.5px solid #E8D5D5', display:'flex', height:60, paddingBottom:'env(safe-area-inset-bottom)', zIndex:50 }}>
      {[{icon:'🏠',label:'首頁',path:'/member/home'},{icon:'📚',label:'課程總覽',path:'/member/courses'},{icon:'🎫',label:'我的票券',path:'/member/passes'},{icon:'👤',label:'我的',path:'/member/profile'}].map(n=>{
        const active=location.pathname===n.path;
        return <div key={n.path} onClick={()=>navigate(n.path)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, cursor:'pointer', color:active?'#8B1A1A':'#999' }}>
          <div style={{ fontSize:20 }}>{n.icon}</div>
          <div style={{ fontSize:10, fontWeight:active?600:400 }}>{t(n.label)}</div>
        </div>;
      })}
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#FBF5F5', paddingBottom:80 }}>
      {/* 線上付款 Modal（Phase 1：體驗預約）*/}
      {payFor && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:210, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:380, padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontWeight:600, fontSize:15 }}>完成繳費</div>
              <button onClick={()=>{ setPayFor(null); showMsg('預約已保留，可於「我的預約」完成繳費或改用匯款'); }} style={{ background:'none', border:'none', fontSize:20, color:'#999', cursor:'pointer' }}>✕</button>
            </div>
            <PaymentFlow
              client={memberClient}
              orderType="experience"
              orderRef={{ bookingId: payFor.bookingId }}
              amount={payFor.fee}
              gymId={payFor.gymId}
              onPaid={()=>{ setPayFor(null); showMsg('繳費完成，預約已確認！'); memberClient.get('/experience-bookings/my').then(r=>setMyBookings(r.data.bookings||[])); }}
              onCancel={()=>{ setPayFor(null); showMsg('預約已保留，可於「我的預約」完成繳費或改用匯款'); }}
            />
          </div>
        </div>
      )}

      {/* 試上報名 Modal */}
      {trialModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:20, width:'100%', maxWidth:420, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontWeight:700, fontSize:16 }}>🧗 報名試上</div>
              <button onClick={()=>{ setTrialModal(null); setTrialFor('self'); }} style={{ background:'none', border:'none', fontSize:20, color:'#999', cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ background:'#FBF5F5', borderRadius:10, padding:12, marginBottom:14, fontSize:13 }}>
              <div style={{ fontWeight:600 }}>{trialModal.courseName}</div>
              <div style={{ color:'#666', marginTop:4 }}>{dayjs(trialModal.date).format('YYYY/MM/DD')}（{['日','一','二','三','四','五','六'][dayjs(trialModal.date).day()]}）{trialModal.startTime}～{trialModal.endTime}{trialModal.instructor?` · 教練 ${trialModal.instructor}`:''}</div>
              <div style={{ color:'#8B1A1A', fontWeight:700, marginTop:6 }}>試上費 NT${(trialModal.trialPrice||0).toLocaleString()}</div>
            </div>
            {/* 報名對象（有子會員時可代子女報名；券與名單會綁到所選對象）*/}
            {children.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, color:'#666', marginBottom:6 }}>報名對象</div>
                <select value={trialFor} onChange={e=>setTrialFor(e.target.value)} style={{ ...inp, width:'100%' }}>
                  <option value="self">{member?.name || '本人'}（本人）</option>
                  {children.map(c => <option key={c.id} value={c.id}>{c.name}（子女）</option>)}
                </select>
              </div>
            )}
            {/* 匯款資訊 */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:'#666', marginBottom:6 }}>付款方式：銀行匯款</div>
              <div style={{ display:'flex', gap:8 }}>
                <input type="date" value={trialPay.paymentDate} onChange={e=>setTrialPay({...trialPay, paymentDate:e.target.value})} style={{ ...inp, flex:1 }} placeholder="匯款日期"/>
                <input value={trialPay.bankLastFive} onChange={e=>setTrialPay({...trialPay, bankLastFive:e.target.value.replace(/\D/g,'').slice(0,5)})} maxLength={5} style={{ ...inp, flex:1 }} placeholder="帳號末五碼"/>
              </div>
            </div>
            {/* 免責同意 */}
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:12, color:'#444', cursor:'pointer', marginBottom:14, lineHeight:1.6 }}>
              <input type="checkbox" checked={trialConsent} onChange={e=>setTrialConsent(e.target.checked)} style={{ marginTop:2 }}/>
              <span>我已閱讀並同意<strong>免責同意書／攀岩活動風險告知</strong>，並瞭解試上為單堂體驗、不含保險。</span>
            </label>
            {trialTargetUnder5 && (
              <div style={{ background:'#FDECEC', border:'0.5px solid #F0C4C4', borderRadius:10, padding:'10px 12px', marginBottom:12, fontSize:13, color:'#B3261E', textAlign:'left' }}>
                {trialTarget?.name || '報名對象'} 未滿 5 歲，無法報名課程／體驗。
              </div>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>{ setTrialModal(null); setTrialFor('self'); }} disabled={trialSubmitting} style={{ flex:1, height:44, borderRadius:10, background:'#f5f5f5', border:'none', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
              <button onClick={submitTrial} disabled={trialSubmitting || trialTargetUnder5} style={{ flex:2, height:44, borderRadius:10, background:(trialSubmitting||trialTargetUnder5)?'#C0B8B8':'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:(trialTargetUnder5?'not-allowed':'pointer') }}>{trialSubmitting?'送出中…':'送出試上報名'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background:'#8B1A1A', padding:'16px 20px 14px', color:'#fff', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={()=>navigate('/member/home')} style={{ background:'none', border:'none', color:'#fff', fontSize:20, cursor:'pointer', padding:0 }}>‹</button>
        <div style={{ fontSize:18, fontWeight:700 }}>🧗 體驗課程預約</div>
      </div>

      {msg && <div style={{ margin:'12px 16px 0', background:msgType==='ok'?'#E6F4EB':'#FCEBEB', borderRadius:8, padding:'10px 14px', fontSize:13, color:msgType==='ok'?'#2D7D46':'#A32D2D' }}>{msg}</div>}

      <div style={{ display:'flex', margin:'14px 16px 0', background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
        {[{key:'apply',label:'填寫預約'},{key:'trial',label:`課程試上${trialSessions.length?` (${trialSessions.length})`:''}`},{key:'my',label:`我的預約${myBookings.length?` (${myBookings.length})`:''}`}].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ flex:1, height:38, border:'none', background:tab===t.key?'#8B1A1A':'#fff', color:tab===t.key?'#fff':'#666', fontSize:13, fontWeight:tab===t.key?600:400, cursor:'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding:'14px 16px' }}>
        {tab==='apply' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {/* 說明 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, fontSize:12, color:'#666', lineHeight:1.9 }}>
              📋 {courseSettings?.notice || '請先透過粉絲頁確認體驗日期、時間及費用後再填寫本預約單'}<br/>
              💳 請於 <strong>{courseSettings?.paymentDeadlineDays||3} 日內</strong> 匯款以確保預約
            </div>

            {/* 場館 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>體驗場館</div>
              <div style={{ display:'flex', gap:8 }}>
                {[{id:'gym-hsinchu',label:'新竹館'},{id:'gym-shilin',label:'士林館'}].map(g=>(
                  <button key={g.id} onClick={()=>setGymId(g.id)}
                    style={{ flex:1, height:40, borderRadius:8, border:`1.5px solid ${gymId===g.id?'#8B1A1A':'#E8D5D5'}`, background:gymId===g.id?'#FBF5F5':'#fff', color:gymId===g.id?'#8B1A1A':'#666', fontSize:13, fontWeight:gymId===g.id?600:400, cursor:'pointer' }}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 課程類型 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>課程類型</div>
              {(courseSettings?.courseTypes?.filter(ct=>ct.active!==false) || FALLBACK_COURSE_TYPES).map(ct=>(
                <label key={ct.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'0.5px solid #F5EFEF', cursor:'pointer' }}>
                  <input type="radio" checked={courseType===ct.id} onChange={()=>setCourseType(ct.id)} style={{ accentColor:'#8B1A1A' }}/>
                  <span style={{ fontSize:13 }}>{ct.label}</span>
                </label>
              ))}
              {courseType==='general' && (
                <div style={{ marginTop:10, background:'#FBF5F5', borderRadius:8, padding:'8px 12px', fontSize:11, color:'#666' }}>
                  1人:975｜2-3人:875｜4-5人:825｜6-12人:775 元/人
                </div>
              )}
            </div>

            {/* 日期時間 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>預約日期與時間</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>體驗日期 *</label>
                  <input type="date" value={bookingDate} onChange={e=>setBookingDate(e.target.value)}
                    min={dayjs().add(1,'day').format('YYYY-MM-DD')} style={inp}/>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>時間（如16:00）*</label>
                  <input value={bookingTime} onChange={e=>setBookingTime(e.target.value)} placeholder="ex: 16:00-17:30" style={inp}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>Facebook 用戶名（便於聯繫）</label>
                <input value={facebookName} onChange={e=>setFacebookName(e.target.value)} placeholder="請填寫 Facebook 用戶名" style={inp}/>
              </div>
            </div>

            {/* 參加者名單 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>參加者資料{needsIns ? '（保險用）' : ''}</div>
                <button onClick={addParticipant}
                  style={{ height:30, padding:'0 12px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>+ 新增人員</button>
              </div>
              {participants.map((p,i)=>(
                <div key={i} style={{ background:'#FBF5F5', borderRadius:10, padding:12, marginBottom:10, border:'0.5px solid #E8D5D5' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'#8B1A1A' }}>第 {i+1} 位</div>
                    {participants.length>1 && (
                      <button onClick={()=>removeParticipant(i)}
                        style={{ width:24, height:24, borderRadius:6, background:'#FCEBEB', color:'#A32D2D', border:'none', fontSize:14, cursor:'pointer', lineHeight:1 }}>✕</button>
                    )}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>姓名 *</label>
                      <input value={p.name} onChange={e=>updateParticipant(i,'name',e.target.value)} placeholder="請填寫真實姓名" style={{ ...inp, background:'#fff' }}/>
                    </div>
                    {needsIns && (<>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>身分證字號 / 居留證號 *</label>
                      <input value={p.idNumber} onChange={e=>updateParticipant(i,'idNumber',e.target.value)} placeholder="A123456789" style={{ ...inp, background:'#fff', fontFamily:'monospace', letterSpacing:1 }}/>
                    </div>
                    <div>
                      <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>生日（民國）*</label>
                      <input value={p.birthday} onChange={e=>updateParticipant(i,'birthday',e.target.value)} placeholder="920110" maxLength={7}
                        style={{ ...inp, background:'#fff', fontFamily:'monospace', letterSpacing:1 }}/>
                    </div>
                    <div>
                      <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>國籍</label>
                      <select value={NATIONALITIES.includes(p.nationality)?p.nationality:'其他'} onChange={e=>{
                        if (e.target.value==='其他') updateParticipant(i,'nationality','');
                        else updateParticipant(i,'nationality',e.target.value);
                      }} style={{ ...inp, background:'#fff', cursor:'pointer' }}>
                        {NATIONALITIES.map(nat=><option key={nat} value={nat}>{nat}</option>)}
                      </select>
                      {!NATIONALITIES.slice(0,-1).includes(p.nationality) && (
                        <input value={p.nationality} onChange={e=>updateParticipant(i,'nationality',e.target.value)}
                          placeholder="請填寫國籍" style={{ ...inp, background:'#fff', marginTop:6 }}/>
                      )}
                    </div>
                    </>)}
                  </div>
                </div>
              ))}
              {/* 費用小計 */}
              <div style={{ marginTop:8, background:'#FBF5F5', borderRadius:8, padding:'8px 12px', display:'flex', justifyContent:'space-between', fontSize:13 }}>
                <span style={{ color:'#666' }}>{n} 人 × NT${unitPrice}/人</span>
                <span style={{ fontWeight:700, color:'#8B1A1A' }}>合計 NT${totalFee}</span>
              </div>
            </div>

            {/* 付款 */}
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>付款資訊</div>
              {(() => {
                const bankKey = gymId === 'gym-hsinchu' ? 'hsinchu' : 'shilin';
                const bank = courseSettings?.bankInfo?.[bankKey] || {};
                return <PaymentSection value={payment} onChange={setPayment}
                  amount={totalFee}
                  bankInfo={{ bankName: bank.bankName||'富邦銀行(012)', branch: bank.branch||'竹北分行', account: bank.account||'746102003014', accountName: bank.accountName||'紅石攀岩有限公司' }}/>;
              })()}
            </div>

            <div>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>其他備註</label>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
                style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', fontSize:13, resize:'none', outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
            </div>

            {anyParticipantUnder5 && (
              <div style={{ background:'#FDECEC', border:'0.5px solid #F0C4C4', borderRadius:10, padding:'10px 12px', marginBottom:10, fontSize:13, color:'#B3261E', textAlign:'left' }}>
                參加者中有未滿 5 歲者，無法報名體驗。
              </div>
            )}
            <button onClick={handleSubmit} disabled={submitting || anyParticipantUnder5}
              style={{ width:'100%', height:48, borderRadius:12, background:(submitting||anyParticipantUnder5)?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor:(submitting||anyParticipantUnder5)?'not-allowed':'pointer' }}>
              {submitting ? '送出中...' : '✓ 送出預約申請'}
            </button>
          </div>
        )}

        {tab==='trial' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, fontSize:12, color:'#666', lineHeight:1.9 }}>
              🧗 以下為開放試上的課程場次（單堂）。試上另收費用、<strong>免保險</strong>；額滿的場次不會顯示。<br/>
              💳 報名後請於期限內匯款，待館方確認收款即完成。
            </div>
            {/* 場館切換沿用填寫預約的 gymId */}
            <div style={{ display:'flex', gap:8 }}>
              {[{id:'gym-hsinchu',label:'新竹館'},{id:'gym-shilin',label:'士林館'}].map(g=>(
                <button key={g.id} onClick={()=>setGymId(g.id)}
                  style={{ flex:1, height:38, borderRadius:8, border:`1.5px solid ${gymId===g.id?'#8B1A1A':'#E8D5D5'}`, background:gymId===g.id?'#FBF5F5':'#fff', color:gymId===g.id?'#8B1A1A':'#666', fontSize:13, fontWeight:gymId===g.id?600:400, cursor:'pointer' }}>
                  {g.label}
                </button>
              ))}
            </div>
            {trialSessions.length===0 && <div style={{ textAlign:'center', color:'#999', padding:40 }}>目前沒有開放試上的場次</div>}
            {trialSessions.map(s=>(
              <div key={s.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{s.courseName}</div>
                  <div style={{ fontSize:12, color:'#666', marginTop:3 }}>
                    {dayjs(s.date).format('MM/DD')}（{['日','一','二','三','四','五','六'][dayjs(s.date).day()]}）{s.startTime}～{s.endTime}{s.instructor?` · 👟 ${s.instructor}`:''}
                  </div>
                  <div style={{ fontSize:12, color:'#8B1A1A', fontWeight:600, marginTop:3 }}>
                    試上費 NT${(s.trialPrice||0).toLocaleString()} · {s.isFull || s.remaining <= 0
                      ? <span style={{ color:'#B5651D' }}>額滿・可候補</span>
                      : `剩餘 ${s.remaining} 位`}
                  </div>
                </div>
                <button onClick={()=>{ setTrialModal(s); setTrialConsent(false); setTrialPay({ method:'transfer', paymentDate:'', bankLastFive:'' }); }}
                  style={{ height:38, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:600, cursor:'pointer', flexShrink:0 }}>試上</button>
              </div>
            ))}
          </div>
        )}

        {tab==='my' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {myBookings.length===0 && <div style={{ textAlign:'center', color:'#999', padding:40 }}>尚無預約記錄</div>}
            {myBookings.map(b=>{
              const sl = { pending:{bg:'#FAEEDA',color:'#854F0B',text:'待確認'}, confirmed:{bg:'#E6F4EB',color:'#2D7D46',text:'已確認'}, cancelled:{bg:'#FCEBEB',color:'#A32D2D',text:'已取消'} }[b.status]||{bg:'#F0EDED',color:'#666',text:b.status};
              return (
                <div key={b.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:14 }}>{b.gymId==='gym-hsinchu'?'新竹館':'士林館'} · {b.bookingDate} {b.bookingTime}</div>
                      <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{b.numParticipants} 人 · NT${b.totalFee}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 9px', borderRadius:8, background:sl.bg, color:sl.color }}>{sl.text}</span>
                  </div>
                  <div style={{ fontSize:11, color:'#999' }}>
                    {(b.participants||[]).map((p,i)=>`${p.name}`).join('、')}
                  </div>
                  {/* 轉帳被退回 → 補正 */}
                  {b.paymentStatus==='transfer_rejected' && b.status!=='cancelled' && (
                    <div style={{ marginTop:10, background:'#FCEBEB', border:'0.5px solid #EEC1C1', borderRadius:8, padding:'8px 12px' }}>
                      <div style={{ fontSize:12, color:'#A32D2D', fontWeight:600, textAlign:'left' }}>轉帳被退回{b.paymentRejectReason?`：${b.paymentRejectReason}`:''}</div>
                      <button onClick={()=>setReupTarget({ orderType:'experience', refId:b.id, orderName:`體驗預約 ${b.bookingDate}`, amount:b.totalFee, gymId:b.gymId, reason:b.paymentRejectReason })}
                        style={{ marginTop:6, height:30, padding:'0 14px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>
                        重新上傳轉帳
                      </button>
                    </div>
                  )}
                  {b.paymentStatus==='pending_confirm' && b.status!=='cancelled' && (
                    <div style={{ marginTop:8, fontSize:11, color:'#854F0B' }}>轉帳已重新送出，等待館方確認</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {reupTarget && (
        <TransferReuploadModal target={reupTarget} memberName={member?.name}
          onClose={()=>setReupTarget(null)}
          onDone={()=>{ setReupTarget(null); showMsg('已重新送出，等待館方確認收款'); memberClient.get('/experience-bookings/my').then(r=>setMyBookings(r.data.bookings||[])).catch(()=>{}); }} />
      )}
      <NavBar/>
    </div>
  );
}
