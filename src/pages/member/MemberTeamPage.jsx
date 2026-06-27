import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { getTeamFees, applyTeam, getMyTeamRecords } from '../../api/team';
import dayjs from 'dayjs';
import PaymentSection from '../../components/PaymentSection';

const STATUS = {
  pending:   { bg:'#FAEEDA', color:'#854F0B', text:'待確認付款' },
  active:    { bg:'#E6F4EB', color:'#2D7D46', text:'正式隊員' },
  cancelled: { bg:'#FCEBEB', color:'#A32D2D', text:'已退隊' },
};

export default function MemberTeamPage() {
  const { member } = useMember();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState('info');
  const [fees, setFees] = useState(null);
  const [myRecords, setMyRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState('ok');
  const [submitting, setSubmitting] = useState(false);

  // 表單欄位
  const [idNumber, setIdNumber] = useState('');
  const [address, setAddress] = useState('');
  const [primaryGym, setPrimaryGym] = useState('新竹紅石');
  const [lineId, setLineId] = useState(member?.lineId || '');
  const [joinReasons, setJoinReasons] = useState([]);
  const [trainingContent, setTrainingContent] = useState('');
  const [wishActivities, setWishActivities] = useState('');
  const [currentGrade, setCurrentGrade] = useState('');
  const [weeklyFrequency, setWeeklyFrequency] = useState('');
  const [noJersey, setNoJersey] = useState(false);
  const [jerseySize, setJerseySize] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [bankLastFive, setBankLastFive] = useState('');
  const [otherSuggestions, setOtherSuggestions] = useState('');
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);

  const year = dayjs().year();
  const showMsg = (t, type='ok') => { setMsg(t); setMsgType(type); setTimeout(()=>setMsg(''),5000); };

  useEffect(() => {
    Promise.allSettled([
      getTeamFees(),
      member?.id ? getMyTeamRecords() : Promise.resolve({ data: { records: [] } }),
    ]).then(([fr, rr]) => {
      if (fr.status==='fulfilled') {
        const f = fr.value.data;
        setFees(f);
        setPaymentAmount(String(f.currentFee || f.fullYearFee || 3000));
      }
      if (rr.status==='fulfilled') setMyRecords(rr.value.data.records || []);
    }).finally(() => setLoading(false));
  }, [member?.id]);

  const currentYearRecord = myRecords.find(r => r.year === year);
  const expectedFee = fees ? (noJersey ? Math.max(0, Number(paymentAmount) - fees.jerseyDiscount) : Number(paymentAmount)) : 0;

  const toggleReason = (r) => setJoinReasons(prev =>
    prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
  );

  const handleSubmit = async () => {
    if (!idNumber.trim()) { showMsg('請填寫身分證字號（山協保險用）', 'red'); return; }
    if (!address.trim()) { showMsg('請填寫地址', 'red'); return; }
    if (!lineId.trim()) { showMsg('請填寫 Line ID（加入隊群組用）', 'red'); return; }
    if (!joinReasons.length) { showMsg('請選擇至少一項加入原因', 'red'); return; }
    if (!currentGrade) { showMsg('請選擇目前抱石最高級數', 'red'); return; }
    if (!weeklyFrequency) { showMsg('請選擇每週頻率', 'red'); return; }
    if (!agreedPrivacy) { showMsg('請同意個資使用聲明', 'red'); return; }
    setSubmitting(true);
    try {
      await applyTeam({
        memberId: member.id,
        memberName: member.name,
        memberPhone: member.phone,
        memberEmail: member.email,
        memberGender: member.gender,
        memberBirthday: member.birthday,
        idNumber, address, primaryGym, lineId,
        joinReasons, trainingContent, wishActivities,
        currentGrade, weeklyFrequency,
        paymentAmount: noJersey ? expectedFee : Number(paymentAmount),
        paymentDate, bankLastFive,
        noJersey, jerseySize: noJersey ? '' : jerseySize,
        otherSuggestions, agreedPrivacy,
      });
      showMsg(`申請已送出！年費 NT$${noJersey ? expectedFee : paymentAmount}，請完成匯款後等待確認`);
      setShowPayModal(false);
      setTab('my');
      const rr = await getMyTeamRecords();
      setMyRecords(rr.data.records || []);
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
      <div style={{ background:'#8B1A1A', padding:'16px 20px 14px', color:'#fff', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => navigate('/member/home')} style={{ background:'none', border:'none', color:'#fff', fontSize:20, cursor:'pointer', padding:0 }}>‹</button>
        <div style={{ fontSize:18, fontWeight:700 }}>⚡ RedFlash 紅石攀岩隊</div>
      </div>

      {msg && <div style={{ margin:'12px 16px 0', background:msgType==='ok'?'#E6F4EB':'#FCEBEB', borderRadius:8, padding:'10px 14px', fontSize:13, color:msgType==='ok'?'#2D7D46':'#A32D2D' }}>{msg}</div>}

      <div style={{ display:'flex', margin:'14px 16px 0', background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
        {[{key:'info',label:'隊伍介紹'},{key:'apply',label:'申請加入'},{key:'my',label:'我的紀錄'}].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex:1, height:38, border:'none', background:tab===t.key?'#8B1A1A':'#fff', color:tab===t.key?'#fff':'#666', fontSize:13, fontWeight:tab===t.key?600:400, cursor:'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding:'14px 16px' }}>
        {loading ? <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div> : (<>

        {/* ── 隊伍介紹 ── */}
        {tab === 'info' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:10 }}>⚡ 歡迎加入 RedFlash 紅石攀岩隊</div>
              <div style={{ fontSize:13, color:'#444', lineHeight:1.9 }}>
                一起約爬、週期性訓練、讀書會、比賽、約吃宵夜或唱歌……
                RedFlash 開放接受各種攀岩及其他交流，讓夥伴感受大家庭的溫暖，帶領大家一起精進！
              </div>
            </div>
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
              <div style={{ fontWeight:600, fontSize:14, marginBottom:10 }}>✅ 隊員福利</div>
              {[
                '加入山協團體會員，可報名全國賽事（每年2月、9月更新）',
                '每週一次團練',
                '定期肢體評估（預計3月、8月各一次）',
                '館內九折優惠（門票、季票、課程及百元以上商品）',
                '優先報名紅石主辦比賽與講座',
                '優惠參加戶外攀岩及隊內模擬賽',
                '特約復健科診所優惠',
                '優惠運動按摩',
                '免費使用 InBody 體組成測量',
              ].map((b, i) => (
                <div key={i} style={{ fontSize:13, color:'#444', marginBottom:6, display:'flex', gap:8 }}>
                  <span style={{ color:'#8B1A1A', flexShrink:0 }}>{i+1}.</span><span>{b}</span>
                </div>
              ))}
            </div>
            {fees && (
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:10 }}>💰 {year} 年度費用</div>
                <div style={{ fontSize:13, color:'#444', lineHeight:2 }}>
                  • {fees.midYearCutoff?.replace('-','/')} 前加入：NT$ {fees.fullYearFee}<br/>
                  • {fees.midYearCutoff?.replace('-','/')} 後加入：NT$ {fees.midYearFee}<br/>
                  • {fees.lateYearCutoff?.replace('-','/')} 後加入：NT$ {fees.lateYearFee}<br/>
                  • 舊隊員不拿隊服減免：NT$ {fees.jerseyDiscount}
                </div>
                <div style={{ marginTop:10, background:'#FBF5F5', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#8B1A1A', fontWeight:500 }}>
                  ⚡ 目前費率：{fees.feeLabel}
                </div>
                <div style={{ marginTop:8, fontSize:12, color:'#666' }}>
                  請匯款至：台新銀行(812) 關東橋分行<br/>
                  帳號：21000100211430　戶名：紅石攀岩有限公司<br/>
                  ※ 恕不接受電子支付
                </div>
              </div>
            )}
            <button onClick={() => setTab('apply')}
              style={{ width:'100%', height:48, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor:'pointer' }}>
              立即申請加入
            </button>
          </div>
        )}

        {/* ── 申請表單 ── */}
        {tab === 'apply' && (<>
          {currentYearRecord ? (
            <div style={{ background:'#E6F4EB', border:'0.5px solid #B3DEC0', borderRadius:12, padding:16, textAlign:'center' }}>
              <div style={{ fontSize:15, fontWeight:600, color:'#2D7D46', marginBottom:4 }}>✓ 已申請 {year} 年度</div>
              <div style={{ fontSize:13, color:'#666' }}>狀態：{STATUS[currentYearRecord.status]?.text}</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {fees && (
                <div style={{ background:'#FBF5F5', borderRadius:10, border:'0.5px solid #E8D5D5', padding:12 }}>
                  <div style={{ fontSize:12, color:'#8B1A1A', fontWeight:600 }}>⚡ {fees.feeLabel}</div>
                </div>
              )}
              {/* 基本資料補充 */}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>基本資料（山協保險用）</div>
                {[
                  { label:'身分證字號 *', val:idNumber, set:setIdNumber, ph:'請填寫身分證字號' },
                  { label:'地址 *', val:address, set:setAddress, ph:'請填寫通訊地址' },
                  { label:'Line ID *', val:lineId, set:setLineId, ph:'請填寫 Line ID（加入隊群組用）' },
                ].map(({ label, val, set, ph }) => (
                  <div key={label} style={{ marginBottom:10 }}>
                    <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>{label}</label>
                    <input value={val} onChange={e => set(e.target.value)} placeholder={ph}
                      style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                  </div>
                ))}
                <div style={{ marginBottom:10 }}>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>主要活動岩館 *</label>
                  <div style={{ display:'flex', gap:8 }}>
                    {['新竹紅石','士林紅石'].map(g => (
                      <button key={g} onClick={() => setPrimaryGym(g)}
                        style={{ flex:1, height:38, borderRadius:8, border:`1.5px solid ${primaryGym===g?'#8B1A1A':'#E8D5D5'}`, background:primaryGym===g?'#FBF5F5':'#fff', color:primaryGym===g?'#8B1A1A':'#666', fontSize:13, fontWeight:primaryGym===g?600:400, cursor:'pointer' }}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 攀岩資訊 */}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>攀岩資訊</div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:6 }}>加入原因 * （可複選）</label>
                  {['想要有夥伴「一起週期性訓練」','來交朋友爬開心的','希望能夠加強訓練','其他'].map(r => (
                    <label key={r} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, cursor:'pointer' }}>
                      <input type="checkbox" checked={joinReasons.includes(r)} onChange={() => toggleReason(r)} style={{ width:16, height:16, accentColor:'#8B1A1A' }}/>
                      <span style={{ fontSize:13 }}>{r}</span>
                    </label>
                  ))}
                </div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>目前抱石最高級數 *</label>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {['V0','V1','V2','V3','V4','V5','V6','V7','V8','V9','V10+'].map(g => (
                      <button key={g} onClick={() => setCurrentGrade(g)}
                        style={{ height:34, padding:'0 12px', borderRadius:8, border:`1.5px solid ${currentGrade===g?'#8B1A1A':'#E8D5D5'}`, background:currentGrade===g?'#8B1A1A':'#fff', color:currentGrade===g?'#fff':'#666', fontSize:12, fontWeight:currentGrade===g?600:400, cursor:'pointer' }}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:6 }}>每週抱石頻率 *</label>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {['1-2次','2-3次','3-4次','4-5次','5次以上'].map(f => (
                      <button key={f} onClick={() => setWeeklyFrequency(f)}
                        style={{ height:34, padding:'0 12px', borderRadius:8, border:`1.5px solid ${weeklyFrequency===f?'#8B1A1A':'#E8D5D5'}`, background:weeklyFrequency===f?'#8B1A1A':'#fff', color:weeklyFrequency===f?'#fff':'#666', fontSize:12, fontWeight:weeklyFrequency===f?600:400, cursor:'pointer' }}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>建議團練內容</label>
                  <textarea value={trainingContent} onChange={e => setTrainingContent(e.target.value)} rows={2}
                    placeholder="什麼樣的團練好玩又有趣？"
                    style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', fontSize:13, resize:'none', outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>許願活動／月份</label>
                  <input value={wishActivities} onChange={e => setWishActivities(e.target.value)} placeholder="希望安排的活動或月份"
                    style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
                </div>
              </div>

              {/* 隊服 */}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>隊服</div>
                <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, cursor:'pointer' }}>
                  <input type="checkbox" checked={noJersey} onChange={e => setNoJersey(e.target.checked)} style={{ width:16, height:16, accentColor:'#8B1A1A' }}/>
                  <span style={{ fontSize:13 }}>舊隊員不拿隊服（減免 NT${fees?.jerseyDiscount || 300}）</span>
                </label>
                {!noJersey && (
                  <div>
                    <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:6 }}>隊服尺寸</label>
                    <div style={{ display:'flex', gap:8 }}>
                      {['XS','S','M','L','XL','2XL'].map(s => (
                        <button key={s} onClick={() => setJerseySize(s)}
                          style={{ flex:1, height:36, borderRadius:8, border:`1.5px solid ${jerseySize===s?'#8B1A1A':'#E8D5D5'}`, background:jerseySize===s?'#FBF5F5':'#fff', color:jerseySize===s?'#8B1A1A':'#666', fontSize:12, fontWeight:jerseySize===s?600:400, cursor:'pointer' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 個資同意 */}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
                <div style={{ fontSize:12, color:'#666', lineHeight:1.8, marginBottom:10 }}>
                  本人同意「紅石攀岩有限公司」、「紅石攀岩隊」依「個人資料保護法」蒐集、處理或利用個人資料，並知曉得行使查詢、閱覽、更正、刪除等相關權利。
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, border:`1.5px solid ${agreedPrivacy?'#2D7D46':'#E8D5D5'}`, background:agreedPrivacy?'#E6F4EB':'#fff', cursor:'pointer' }}>
                  <input type="checkbox" checked={agreedPrivacy} onChange={e => setAgreedPrivacy(e.target.checked)} style={{ width:18, height:18, accentColor:'#2D7D46' }}/>
                  <span style={{ fontSize:13, fontWeight:500, color:agreedPrivacy?'#2D7D46':'#444' }}>本人已閱讀並同意個資使用聲明</span>
                </label>
              </div>

              <div>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>其他建議</label>
                <textarea value={otherSuggestions} onChange={e => setOtherSuggestions(e.target.value)} rows={2}
                  style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', fontSize:13, resize:'none', outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
              </div>

              <button onClick={() => setShowPayModal(true)}
                style={{ width:'100%', height:48, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor:'pointer' }}>
                繼續填寫繳費資料
              </button>
            </div>
          )}
        </>)}

        {/* ── 我的紀錄 ── */}
        {tab === 'my' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {myRecords.length === 0 && <div style={{ textAlign:'center', color:'#999', padding:40 }}>尚無申請記錄</div>}
            {myRecords.map(r => {
              const sl = STATUS[r.status] || STATUS.pending;
              return (
                <div key={r.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <div style={{ fontWeight:600, fontSize:15 }}>{r.year} 年度</div>
                    <span style={{ fontSize:11, fontWeight:600, padding:'2px 10px', borderRadius:8, background:sl.bg, color:sl.color }}>{sl.text}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#666' }}>
                    主要岩館：{r.primaryGym}　·　{r.primaryGym === '新竹紅石' ? '新竹隊群組' : '士林隊群組'}
                  </div>
                  <div style={{ fontSize:12, color:'#666', marginTop:2 }}>
                    年費：NT${r.paymentAmount}　{r.noJersey ? '（不拿隊服）' : r.jerseySize ? `隊服：${r.jerseySize}` : ''}
                  </div>
                  {r.paymentStatus === 'pending' && (
                    <div style={{ marginTop:10, background:'#FFF8E6', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#8B6914' }}>
                      ⚠ 請匯款 NT${r.paymentAmount} 至台新銀行(812) 21000100211430，並等待館方確認
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        </>)}
      </div>

      {/* 繳費 Modal */}
      {showPayModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'#fff', borderRadius:'16px 16px 0 0', width:'100%', padding:24, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:4 }}>繳費資料</div>
            <div style={{ background:'#FBF5F5', borderRadius:10, padding:'10px 14px', marginBottom:16 }}>
              <div style={{ fontSize:12, color:'#666', marginBottom:4 }}>
                {year} 年度隊費
                {noJersey ? `（不拿隊服，已減 NT$${fees?.jerseyDiscount}）` : ''}
              </div>
              <div style={{ fontSize:18, fontWeight:700, color:'#8B1A1A' }}>NT${noJersey ? expectedFee : paymentAmount}</div>
              <div style={{ fontSize:12, color:'#666', marginTop:6 }}>
                匯款至：台新銀行(812) 21000100211430<br/>戶名：紅石攀岩有限公司<br/>
                <span style={{ color:'#A32D2D' }}>※ 恕不接受電子支付</span>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>匯款日期</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                  style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
              </div>
              <div>
                <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:4 }}>匯款末五碼</label>
                <input type="text" maxLength={5} value={bankLastFive} onChange={e => setBankLastFive(e.target.value)} placeholder="12345"
                  style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a' }}/>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowPayModal(false)}
                style={{ flex:1, height:44, borderRadius:10, border:'0.5px solid #E8D5D5', background:'none', fontSize:14, cursor:'pointer' }}>返回</button>
              <button onClick={handleSubmit} disabled={submitting}
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
