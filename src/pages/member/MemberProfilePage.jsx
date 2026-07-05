import { useState, useEffect } from 'react';
import PasswordInput from '../../components/PasswordInput';
import { useNavigate } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { getMyWaiver } from '../../api/memberAuth';
import { getMyFallTestStatus } from '../../api/fallTests';
import { getMyFallTestBookings, createFallTestBooking, cancelFallTestBooking } from '../../api/fallTestBookings';
import { memberClient } from '../../api/client';
import dayjs from 'dayjs';

const FT_GYMS = [{ id:'gym-hsinchu', name:'新竹館' }, { id:'gym-shilin', name:'士林館' }];
const ftGymName = (id) => FT_GYMS.find(g => g.id === id)?.name || id;

const BottomNav = ({ navigate }) => (
  <div style={{ position:'fixed', bottom:0, left:0, right:0, width:'100%', background:'#fff', borderTop:'0.5px solid #E8D5D5', display:'flex', height:60, paddingBottom:"env(safe-area-inset-bottom)", zIndex:50 }}>
    {[
      { icon:'🏠', label:'首頁',     path:'/member/home' },
      { icon:'📚', label:'課程總覽', path:'/member/courses' },
      { icon:'🎫', label:'我的票券', path:'/member/passes' },
      { icon:'👤', label:'我的',     path:'/member/profile' },
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

export default function MemberProfilePage() {
  const { member, logout, updateMember } = useMember();
  const navigate = useNavigate();
  const [showLogout, setShowLogout] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [showCheckinHistory, setShowCheckinHistory] = useState(false);
  const [showFamily, setShowFamily] = useState(false);
  // 每次開啟家庭成員面板都重新載入（確保簽署後狀態更新）
  useEffect(() => { if (showFamily) loadChildren(); }, [showFamily]);
  const [children, setChildren] = useState([]);
  const [showAddChild, setShowAddChild] = useState(false);
  const [childName, setChildName] = useState('');
  const [childBirthday, setChildBirthday] = useState('');
  const [childGender, setChildGender] = useState('');
  const [addingChild, setAddingChild] = useState(false);
  const [familyMsg, setFamilyMsg] = useState('');
  const [childBookings, setChildBookings] = useState({}); // memberId -> pending booking
  const [ftBusyChild, setFtBusyChild] = useState(null);

  const loadChildBookings = async () => {
    try {
      const r = await getMyFallTestBookings();
      const map = {};
      (r.data.bookings || []).forEach(b => { map[b.memberId] = b; });
      setChildBookings(map);
    } catch (e) {}
  };

  const scheduleChildFallTest = async (childId, gymId) => {
    setFtBusyChild(childId); setFamilyMsg('');
    try {
      await createFallTestBooking({ gymId, targetMemberId: childId });
      setFamilyMsg('已為家庭成員安排墜落測驗');
      await loadChildBookings();
    } catch (e) {
      setFamilyMsg(e.response?.data?.message || '安排失敗');
    } finally { setFtBusyChild(null); }
  };

  const cancelChildFallTest = async (childId, bookingId) => {
    setFtBusyChild(childId); setFamilyMsg('');
    try {
      await cancelFallTestBooking(bookingId);
      await loadChildBookings();
    } catch (e) {
      setFamilyMsg(e.response?.data?.message || '取消失敗');
    } finally { setFtBusyChild(null); }
  };

  const loadChildren = async () => {
    try {
      loadChildBookings();
      const r = await memberClient.get('/members/my/children');
      const list = r.data.children || [];
      // 每位子會員抓 waiver + fallTest 狀態
      const enriched = await Promise.all(list.map(async c => {
        const [waiverRes, ftRes, ftSigRes] = await Promise.allSettled([
          memberClient.get(`/members/${c.id}/waiver`),
          memberClient.get(`/fall-tests/member/${c.id}`),
          memberClient.get(`/fall-tests/signature/${c.id}`),
        ]);
        return {
          ...c,
          waiverSigned: waiverRes.status==='fulfilled' ? waiverRes.value.data?.waiverSigned : c.waiverSigned,
          fallTestPassed: ftRes.status==='fulfilled' ? ftRes.value.data?.status === 'passed' : false,
          fallTestSigned: ftSigRes.status==='fulfilled' ? !!ftSigRes.value.data?.signature : false,
        };
      }));
      setChildren(enriched);
    } catch(e) {}
  };

  const handleAddChild = async () => {
    if (!childName.trim()) { setFamilyMsg('請填寫姓名'); return; }
    if (!childBirthday) { setFamilyMsg('請填寫生日（用於判斷入場資格）'); return; }
    if (dayjs().diff(dayjs(childBirthday), 'year') >= 18) { setFamilyMsg('家庭成員僅限未滿 18 歲，滿 18 歲請註冊正式會員'); return; }
    setAddingChild(true);
    try {
      const r = await memberClient.post('/members/my/children', {
        name: childName.trim(), birthday: childBirthday||null, gender: childGender||null,
      });
      setFamilyMsg(r.data.message || '新增成功');
      setChildName(''); setChildBirthday(''); setChildGender('');
      setShowAddChild(false);
      await loadChildren();
    } catch(err) {
      setFamilyMsg(err.response?.data?.message || '新增失敗');
    } finally { setAddingChild(false); }
  };
  const [showWaiver, setShowWaiver] = useState(false);
  const [myWaiver, setMyWaiver] = useState(null);
  const [fallTestStatus, setFallTestStatus] = useState(null);
  const [fallTestSignature, setFallTestSignature] = useState(null);
  const [fallTestLoading, setFallTestLoading] = useState(true);

  useEffect(() => {
    if (!member?.id) return;
    memberClient.get('/auth/member/me').then(res => {
      if (res.data?.member) updateMember(res.data.member);
    }).catch(() => {});
    getMyFallTestStatus(member.id).then(res => setFallTestStatus(res.data)).catch(() => {});
    import('../../api/fallTests').then(({ getFallTestSignature }) => {
      getFallTestSignature(member.id).then(res => {
        setFallTestSignature(res.data.signature);
        setFallTestLoading(false);
      }).catch(() => setFallTestLoading(false));
    });
  }, [member?.id]);
  const [waiverLoading, setWaiverLoading] = useState(false);

  const handleViewWaiver = async () => {
    setShowWaiver(true);
    setWaiverLoading(true);
    try {
      const res = await getMyWaiver(member.id);
      setMyWaiver(res.data.waiver);
    } catch (err) {
      setMyWaiver(null);
    } finally {
      setWaiverLoading(false);
    }
  };
  const [editForm, setEditForm] = useState({ name:'', email:'', birthday:'', gender:'', ecName:'', ecRelation:'', ecPhone:'' });
  const [editOpen, setEditOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current:'', newPw:'', confirm:'' });
  const [checkinHistory, setCheckinHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const age = member?.birthday ? dayjs().diff(dayjs(member.birthday), 'year') : null;

  return (
    <div style={{ width:'100%', minHeight:'100vh', background:'#F7F3F3', paddingBottom:80 }}>
      <div style={{ background:'#fff', padding:'16px 20px', borderBottom:'0.5px solid #E8D5D5', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div onClick={() => navigate('/member/home')} style={{ fontSize:20, cursor:'pointer', color:'#8B1A1A' }}>←</div>
        <div style={{ fontWeight:600, fontSize:15 }}>個人資料</div>
        <div style={{ fontSize:13, color:'#8B1A1A', cursor:'pointer' }} onClick={() => setShowLogout(true)}>登出</div>
      </div>
      <div style={{ padding:16 }}>
        {/* 頭像 */}
        <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:20, textAlign:'center', marginBottom:12 }}>
          <div style={{ width:64, height:64, borderRadius:'50%', background:'#F5E8E8', color:'#8B1A1A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, fontWeight:600, margin:'0 auto 12px' }}>{member?.name?.[0]}</div>
          <div style={{ fontWeight:600, fontSize:18 }}>{member?.name}</div>
          <div style={{ fontSize:12, color:'#999', marginTop:3 }}>{member?.phone}</div>
          <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:8, flexWrap:'wrap' }}>
            {member?.isTeamMember && <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#FAEEDA', color:'#854F0B' }}>🏔️ 隊員</span>}
            {member?.emailVerified && <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#E6F4EB', color:'#2D7D46' }}>✓ Email 已驗證</span>}
          </div>
        </div>
        {/* 基本資訊 */}
        <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:12 }}>基本資訊</div>
          {[
            { label:'姓名', value: member?.name },
            { label:'手機', value: member?.phone },
            { label:'Email', value: member?.email },
            { label:'生日', value: member?.birthday ? `${member.birthday}（${age}歲）` : '—' },
            { label:'性別', value: { male:'男', female:'女' }[member?.gender] || '不公開' },
          ].map(r => (
            <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'0.5px solid #F5EFEF', fontSize:13 }}>
              <span style={{ color:'#6b6b6b' }}>{r.label}</span>
              <span style={{ fontWeight:500 }}>{r.value || '—'}</span>
            </div>
          ))}
        </div>
        {/* 緊急聯絡人 */}
        {member?.emergencyContact && (
          <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
            <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:12 }}>緊急聯絡人</div>
            <div style={{ fontSize:13, fontWeight:500 }}>{member.emergencyContact}</div>
          </div>
        )}
        {/* Waiver */}
        <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:12 }}>Waiver 免責聲明書</div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div><div style={{ fontSize:13, fontWeight:500 }}>免責聲明書</div><div style={{ fontSize:12, color:'#999', marginTop:2 }}>入場必要條件</div></div>
            {member?.blockReasons?.includes('waiver_unsigned') ? (
              <div><span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#FCEBEB', color:'#A32D2D' }}>未完成</span>
                <div style={{ marginTop:8 }}><button onClick={() => navigate('/member/waiver')} style={{ height:32, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>立即簽署</button></div>
              </div>
            ) : member?.blockReasons?.includes('parent_waiver_pending') ? (
              <div style={{ textAlign:'right' }}>
                <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#FFF3E0', color:'#B5762B' }}>等待家長簽署</span>
                <div style={{ marginTop:8 }}><button onClick={() => navigate('/member/waiver')} style={{ height:32, padding:'0 14px', borderRadius:8, background:'#fff', color:'#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:12, cursor:'pointer' }}>查看狀態</button></div>
              </div>
            ) : (
              <div style={{ textAlign:'right' }}>
                <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#E6F4EB', color:'#2D7D46' }}>已完成</span>
                <div style={{ fontSize:11, color:'#999', marginTop:4 }}>永久鎖定 🔒</div>
                <div style={{ marginTop:8 }}><button onClick={handleViewWaiver} style={{ height:30, padding:'0 14px', borderRadius:8, background:'#fff', color:'#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:12, cursor:'pointer' }}>查看簽署內容</button></div>
              </div>
            )}
          </div>
        </div>
        {/* 墜落測驗 */}
        <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:16, marginBottom:12 }}>
          <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:12 }}>墜落測驗</div>
          {/* 同意書狀態 */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: fallTestStatus?.status === 'passed' ? 0 : 12 }}>
            <div><div style={{ fontSize:13, fontWeight:500 }}>安全墜落測驗同意書</div><div style={{ fontSize:12, color:'#999', marginTop:2 }}>入場必要條件</div></div>
            {fallTestLoading ? (
              <span style={{ fontSize:11, color:'#999' }}>載入中...</span>
            ) : fallTestSignature ? (
              <div style={{ textAlign:'right' }}>
                <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#E6F4EB', color:'#2D7D46' }}>已完成</span>
                <div style={{ marginTop:6 }}><button onClick={() => navigate('/member/fall-test')} style={{ height:30, padding:'0 12px', borderRadius:8, background:'#fff', color:'#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:12, cursor:'pointer' }}>檢視副本</button></div>
              </div>
            ) : (
              <div style={{ textAlign:'right' }}>
                <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#FCEBEB', color:'#A32D2D' }}>尚未完成</span>
                <div style={{ marginTop:6 }}><button onClick={() => navigate('/member/fall-test')} style={{ height:32, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>立即簽署</button></div>
              </div>
            )}
          </div>
          {/* 測驗通過狀態（簽署後才顯示） */}
          {fallTestSignature && (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:10, borderTop:'0.5px solid #F5EFEF' }}>
              <div><div style={{ fontSize:13, fontWeight:500 }}>墜落測驗</div><div style={{ fontSize:12, color:'#999', marginTop:2 }}>需工作人員測驗</div></div>
              {fallTestStatus?.status === 'passed' ? (
                <div style={{ textAlign:'right' }}>
                  <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#E6F4EB', color:'#2D7D46' }}>已通過</span>
                  <div style={{ fontSize:11, color:'#999', marginTop:4 }}>有效至 {fallTestStatus.expiresAt}</div>
                </div>
              ) : fallTestStatus?.status === 'expired' ? (
                <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#FAEEDA', color:'#854F0B' }}>已到期</span>
              ) : (
                <span style={{ fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#F5F0FF', color:'#6B21A8' }}>等待測驗</span>
              )}
            </div>
          )}
        </div>
        {/* 隊員 */}
        {member?.isTeamMember && (
          <div style={{ background:'linear-gradient(135deg,#8B1A1A,#C0392B)', borderRadius:14, padding:16, color:'#fff', marginBottom:12 }}>
            <div style={{ fontSize:10, opacity:.75, letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>🏔️ 紅石攀岩隊員</div>
            <div style={{ fontSize:15, fontWeight:600 }}>隊員折扣資格</div>
            <div style={{ fontSize:12, opacity:.8, marginTop:4 }}>NT$100以上消費享九折優惠</div>
            {member.teamMemberUntil && <div style={{ fontSize:12, opacity:.7, marginTop:6 }}>有效期至 {member.teamMemberUntil}</div>}
          </div>
        )}
        {/* 功能清單 */}
        <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', overflow:'hidden', marginBottom:12 }}>
          {[
            { icon:'✏️', label:'修改個人資料', action: () => { const ec = (member?.emergencyContact||'').split('/').map(s => s.trim()); setEditForm({ name: member?.name||'', email: member?.email||'', birthday: member?.birthday||'', gender: member?.gender||'', ecName: ec[0]||'', ecRelation: ec[1]||'', ecPhone: ec[2]||'' }); setShowEditProfile(true); } },
            { icon:'🔑', label:'修改密碼', action: () => setShowChangePassword(true) },
            { icon:'🔔', label:'Line 官方通知設定', action: () => setShowNotification(true) },
            { icon:'👨‍👩‍👧‍👦', label:'家庭成員（限兒童及青少年）', action: () => { loadChildren(); setShowFamily(true); } },
          ].map((item, i) => (
            <div key={i} style={{ padding:'14px 16px', borderBottom:'0.5px solid #F5EFEF', display:'flex', alignItems:'center', gap:12, cursor:'pointer', fontSize:14 }}
              onClick={item.action}
              onMouseEnter={e => e.currentTarget.style.background='#FBF5F5'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <span style={{ fontSize:18 }}>{item.icon}</span>
              <span>{item.label}</span>
              <span style={{ marginLeft:'auto', color:'#CCC' }}>›</span>
            </div>
          ))}
        </div>
        <button onClick={() => setShowLogout(true)} style={{ width:'100%', height:44, borderRadius:12, border:'0.5px solid #E8D5D5', background:'#fff', fontSize:14, color:'#A32D2D', cursor:'pointer' }}>登出</button>
      </div>
      {/* 家庭成員 Modal */}
      {showFamily && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'#fff', borderRadius:'16px 16px 0 0', width:'100%', padding:24, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:16, fontWeight:600 }}>👨‍👩‍👧‍👦 家庭成員</div>
              <button onClick={()=>{ setShowFamily(false); setShowAddChild(false); setFamilyMsg(''); }}
                style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
            </div>
            {familyMsg && <div style={{ background:'#E6F4EB', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#2D7D46' }}>{familyMsg}</div>}
            {children.length === 0 && !showAddChild && (
              <div style={{ textAlign:'center', color:'#999', padding:'24px 0', fontSize:13 }}>尚未新增家庭成員</div>
            )}
            {children.map(c => (
              <div key={c.id} style={{ background:'#FBF5F5', borderRadius:12, padding:'12px 14px', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
                  <div style={{ width:38, height:38, borderRadius:19, background:'#E8D5D5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
                    {c.gender==='male'?'👦':c.gender==='female'?'👧':'🧒'}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:14 }}>{c.name}</div>
                    {c.birthday && <div style={{ fontSize:12, color:'#999', marginTop:2 }}>生日：{c.birthday}</div>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {/* Waiver 狀態 */}
                  {c.waiverSigned ? (
                    <span style={{ fontSize:11, padding:'3px 10px', borderRadius:8, background:'#E6F4EB', color:'#2D7D46' }}>✓ 已簽免責聲明</span>
                  ) : (
                    <button onClick={() => navigate(`/member/waiver?forChild=${c.id}&childName=${encodeURIComponent(c.name)}`)}
                      style={{ fontSize:11, padding:'3px 10px', borderRadius:8, background:'#FCEBEB', color:'#A32D2D', border:'none', cursor:'pointer' }}>
                      ⚠ 代簽免責聲明
                    </button>
                  )}
                  {/* 墜落測驗同意書（代簽）狀態：以「同意書是否已簽」判斷，而非測驗是否通過 */}
                  {c.fallTestSigned ? (
                    <span style={{ fontSize:11, padding:'3px 10px', borderRadius:8, background:'#E6F4EB', color:'#2D7D46' }}>✓ 已簽墜測同意書</span>
                  ) : (
                    <button onClick={() => navigate(`/member/fall-test?forChild=${c.id}&childName=${encodeURIComponent(c.name)}`)}
                      style={{ fontSize:11, padding:'3px 10px', borderRadius:8, background:'#FBF5F5', color:'#8B1A1A', border:'0.5px solid #E8D5D5', cursor:'pointer' }}>
                      代簽墜落測驗同意書
                    </button>
                  )}
                </div>

                {/* 墜落測驗：安排 / 待測 / 已通過（waiver + 同意書皆完成後才出現） */}
                {c.waiverSigned && c.fallTestSigned && (
                  c.fallTestPassed ? (
                    <div style={{ marginTop:8, fontSize:11, color:'#2D7D46', fontWeight:600 }}>✓ 已通過墜落測驗</div>
                  ) : childBookings[c.id] ? (
                    <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, padding:'3px 10px', borderRadius:8, background:'#FFF3E0', color:'#B5762B', fontWeight:600 }}>
                        ⏳ 已排 {ftGymName(childBookings[c.id].gymId)}，待現場測驗
                      </span>
                      <button disabled={ftBusyChild===c.id} onClick={() => cancelChildFallTest(c.id, childBookings[c.id].id)}
                        style={{ fontSize:11, padding:'3px 10px', borderRadius:8, background:'#fff', color:'#888', border:'0.5px solid #E8D5D5', cursor:'pointer' }}>
                        {ftBusyChild===c.id ? '處理中…' : '更改場館'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop:8 }}>
                      <div style={{ fontSize:11, color:'#666', marginBottom:6 }}>安排墜落測驗（選擇場館）：</div>
                      <div style={{ display:'flex', gap:8 }}>
                        {FT_GYMS.map(g => (
                          <button key={g.id} disabled={ftBusyChild===c.id} onClick={() => scheduleChildFallTest(c.id, g.id)}
                            style={{ flex:1, height:34, borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, fontWeight:500, cursor:'pointer' }}>
                            {ftBusyChild===c.id ? '…' : g.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            ))}

            {!showAddChild ? (
              <button onClick={()=>{ setShowAddChild(true); setFamilyMsg(''); }}
                style={{ width:'100%', height:44, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer', marginTop:8 }}>
                + 新增家庭成員
              </button>
            ) : (
              <div style={{ background:'#FBF5F5', borderRadius:12, padding:16, marginTop:8 }}>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>新增家庭成員</div>
                <div style={{ marginBottom:10 }}>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>姓名 *</label>
                  <input value={childName} onChange={e=>setChildName(e.target.value)} placeholder="請填寫真實姓名"
                    style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                  <div>
                    <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>生日 *</label>
                    <input type="date" value={childBirthday} onChange={e=>setChildBirthday(e.target.value)}
                      style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>性別</label>
                    <select value={childGender} onChange={e=>setChildGender(e.target.value)}
                      style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a', cursor:'pointer' }}>
                      <option value="">不填</option>
                      <option value="male">男</option>
                      <option value="female">女</option>
                    </select>
                  </div>
                </div>
                <div style={{ fontSize:11, color:'#999', marginBottom:12 }}>
                  ※ 家庭成員共用您的手機號碼登入，入場時一併顯示
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>{ setShowAddChild(false); setChildName(''); setChildBirthday(''); setChildGender(''); }}
                    style={{ flex:1, height:40, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
                  <button onClick={handleAddChild} disabled={addingChild}
                    style={{ flex:2, height:40, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                    {addingChild?'新增中...':'確認新增'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showLogout && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 20px 36px', width:'100%' }}>
            <div style={{ width:36, height:4, background:'#DDD', borderRadius:2, margin:'0 auto 16px' }}/>
            <div style={{ fontSize:16, fontWeight:600, textAlign:'center', marginBottom:6 }}>確認登出？</div>
            <div style={{ fontSize:13, color:'#999', textAlign:'center', marginBottom:20 }}>登出後需重新輸入手機號碼與密碼</div>
            <button onClick={() => { logout(); navigate('/member/login'); }} style={{ width:'100%', height:48, borderRadius:12, background:'#A32D2D', color:'#fff', border:'none', fontSize:15, fontWeight:500, cursor:'pointer', marginBottom:10 }}>確認登出</button>
            <button onClick={() => setShowLogout(false)} style={{ width:'100%', height:48, borderRadius:12, background:'none', border:'0.5px solid #E8D5D5', fontSize:15, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
          </div>
        </div>
      )}

      {/* 修改個人資料 */}
      {showEditProfile && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 20px 36px', width:'100%', maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ width:36, height:4, background:'#DDD', borderRadius:2, margin:'0 auto 16px' }}/>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:20 }}>修改個人資料</div>
            {[
              { label:'姓名', key:'name', placeholder: member?.name, type:'text' },
              { label:'Email', key:'email', placeholder: member?.email, type:'email' },
              { label:'生日', key:'birthday', placeholder: member?.birthday || 'YYYY-MM-DD', type:'date' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                <input type={f.type} value={editForm[f.key]} onChange={e => setEditForm(p => ({...p, [f.key]: e.target.value}))}
                  placeholder={f.placeholder}
                  style={{ width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              </div>
            ))}
            {/* 緊急聯絡人：姓名 / 關係 / 電話 三格 */}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>緊急聯絡人</label>
              <div style={{ display:'flex', gap:8 }}>
                <input value={editForm.ecName} onChange={e => setEditForm(p => ({...p, ecName: e.target.value}))}
                  placeholder="姓名"
                  style={{ flex:'1.2 1 0', minWidth:0, height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
                <input value={editForm.ecRelation} onChange={e => setEditForm(p => ({...p, ecRelation: e.target.value}))}
                  placeholder="關係"
                  style={{ flex:'1 1 0', minWidth:0, height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
                <input value={editForm.ecPhone} onChange={e => setEditForm(p => ({...p, ecPhone: e.target.value}))}
                  placeholder="電話" inputMode="tel"
                  style={{ flex:'1.6 1 0', minWidth:0, height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>性別</label>
              <select value={editForm.gender} onChange={e => setEditForm(p => ({...p, gender: e.target.value}))}
                style={{ width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}>
                <option value="">不公開</option>
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </div>
            {msg && <div style={{ background:'#E6F4EB', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#2D7D46', marginBottom:12 }}>{msg}</div>}
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button onClick={() => setShowEditProfile(false)}
                style={{ flex:1, height:48, borderRadius:12, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:14, cursor:'pointer' }}>取消</button>
              <button onClick={async () => {
                try {
                  const ecParts = [editForm.ecName, editForm.ecRelation, editForm.ecPhone].map(s => (s || '').trim());
                  const emergencyContact = ecParts.some(Boolean) ? ecParts.join(' / ') : '';
                  const payload = { name: editForm.name, email: editForm.email, birthday: editForm.birthday, gender: editForm.gender, emergencyContact };
                  const { memberClient } = await import('../../api/client');
                  await memberClient.put('/auth/member/profile', payload);
                  updateMember(payload);
                  setMsg('資料已更新');
                  setTimeout(() => { setMsg(''); setShowEditProfile(false); }, 1500);
                } catch { setMsg('更新失敗，請稍後再試'); }
              }}     style={{ flex:2, height:48, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* 修改密碼 */}
      {showChangePassword && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 20px 36px', width:'100%' }}>
            <div style={{ width:36, height:4, background:'#DDD', borderRadius:2, margin:'0 auto 16px' }}/>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:20 }}>修改密碼</div>
            {[
              { label:'目前密碼', key:'current' },
              { label:'新密碼', key:'newPw' },
              { label:'確認新密碼', key:'confirm' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                <PasswordInput value={pwForm[f.key]} onChange={e => setPwForm(p => ({...p, [f.key]: e.target.value}))}
                  placeholder="••••••••"
                  style={{ width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              </div>
            ))}
            {msg && <div style={{ background: msg.includes('失敗')?'#FCEBEB':'#E6F4EB', borderRadius:8, padding:'8px 12px', fontSize:13, color: msg.includes('失敗')?'#A32D2D':'#2D7D46', marginBottom:12 }}>{msg}</div>}
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button onClick={() => { setShowChangePassword(false); setPwForm({ current:'', newPw:'', confirm:'' }); }}
                style={{ flex:1, height:48, borderRadius:12, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:14, cursor:'pointer' }}>取消</button>
              <button onClick={async () => {
                if (pwForm.newPw !== pwForm.confirm) { setMsg('新密碼不一致'); return; }
                if (pwForm.newPw.length < 6) { setMsg('密碼至少6碼'); return; }
                try {
                  const { memberClient } = await import('../../api/client');
                  await memberClient.put('/auth/member/password', { currentPassword: pwForm.current, newPassword: pwForm.newPw });
                  setMsg('密碼已更新');
                  setTimeout(() => { setMsg(''); setShowChangePassword(false); setPwForm({ current:'', newPw:'', confirm:'' }); }, 1500);
                } catch { setMsg('修改失敗，請確認目前密碼'); }
              }}
                style={{ flex:2, height:48, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>確認修改</button>
            </div>
          </div>
        </div>
      )}

      {/* 通知設定 */}
      {showNotification && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 20px 36px', width:'100%' }}>
            <div style={{ width:36, height:4, background:'#DDD', borderRadius:2, margin:'0 auto 16px' }}/>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:8 }}>紅石官方 Line 通知設定</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:20 }}>綁定 Line 接收課程、票券、比賽通知</div>
            <div style={{ background:'#F5EFEF', borderRadius:12, padding:16, marginBottom:20, textAlign:'center' }}>
              <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>尚未綁定 Line</div>
              <button style={{ height:44, padding:'0 24px', borderRadius:10, background:'#06C755', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                綁定 Line 通知
              </button>
            </div>
            <button onClick={() => setShowNotification(false)}
              style={{ width:'100%', height:48, borderRadius:12, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:14, cursor:'pointer' }}>關閉</button>
          </div>
        </div>
      )}

      {/* 入場紀錄 */}
      {showCheckinHistory && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 20px 0', width:'100%', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ width:36, height:4, background:'#DDD', borderRadius:2, margin:'0 auto 16px' }}/>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:16 }}>入場紀錄</div>
            <div style={{ flex:1, overflowY:'auto', paddingBottom:36 }}>
              {checkinHistory.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px 0', color:'#999', fontSize:14 }}>尚無入場紀錄</div>
              ) : checkinHistory.map((r, i) => (
                <div key={i} style={{ padding:'12px 0', borderBottom:'0.5px solid #F5EFEF' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:13, fontWeight:500 }}>{r.gymName || r.gymId}</span>
                    <span style={{ fontSize:12, color:'#999' }}>{dayjs(r.checkedInAt?.seconds ? r.checkedInAt.seconds*1000 : r.checkedInAt).format('MM/DD HH:mm')}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#666', display:'flex', gap:8 }}>
                    <span>{r.entryType === 'monthly_pass' ? '定期票' : r.entryType === 'single_ticket' ? '單次' : r.entryType || '入場'}</span>
                    {r.paymentMethod && <span>・{r.paymentMethod === 'cash' ? '現金' : r.paymentMethod}</span>}
                    {r.amountPaid > 0 && <span>・NT${r.amountPaid}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding:'12px 0 36px' }}>
              <button onClick={() => setShowCheckinHistory(false)}
                style={{ width:'100%', height:48, borderRadius:12, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:14, cursor:'pointer' }}>關閉</button>
            </div>
          </div>
        </div>
      )}

      {/* 已簽署的 Waiver 內容 */}
      {showWaiver && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 20px 0', width:'100%', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ width:36, height:4, background:'#DDD', borderRadius:2, margin:'0 auto 16px' }}/>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:16, textAlign:'left' }}>已簽署的免責聲明書</div>
            <div style={{ flex:1, overflowY:'auto', paddingBottom:36 }}>
              {waiverLoading ? (
                <div style={{ textAlign:'center', padding:'40px 0', color:'#999', fontSize:14 }}>載入中...</div>
              ) : !myWaiver ? (
                <div style={{ textAlign:'center', padding:'40px 0', color:'#999', fontSize:14 }}>找不到簽署紀錄</div>
              ) : (
                <>
                  {myWaiver.contentSnapshot && (
                    <div style={{ marginBottom:20 }}>
                      <div style={{ fontSize:11, color:'#999', marginBottom:6, textAlign:'left' }}>聲明書內容</div>
                      {myWaiver.contentIsFallback && (
                        <div style={{ fontSize:11, color:'#B5762B', background:'#FFF3E0', borderRadius:6, padding:'6px 10px', marginBottom:8 }}>
                          此筆紀錄簽署時間較早，系統未保留當時的逐字版本，以下顯示為目前版本內容
                        </div>
                      )}
                      <div style={{ fontSize:13, color:'#333', lineHeight:1.7, whiteSpace:'pre-wrap', background:'#FBF5F5', borderRadius:8, padding:12, border:'0.5px solid #E8D5D5', textAlign:'left' }}>
                        {myWaiver.contentSnapshot.zh || '（無內容）'}
                      </div>
                    </div>
                  )}
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, color:'#999', marginBottom:6, textAlign:'left' }}>本人簽名</div>
                    {myWaiver.memberSignatureUrl ? (
                      <img src={myWaiver.memberSignatureUrl} alt="簽名"
                        style={{ width:'100%', maxWidth:280, border:'0.5px solid #E8D5D5', borderRadius:8, background:'#FBF5F5' }}/>
                    ) : <div style={{ fontSize:13, color:'#999' }}>無簽名圖檔</div>}
                  </div>
                  <div style={{ fontSize:13, color:'#666', marginBottom:8 }}>
                    簽署時間：{myWaiver.memberSignedAt ? dayjs(myWaiver.memberSignedAt?.seconds ? myWaiver.memberSignedAt.seconds*1000 : myWaiver.memberSignedAt).format('YYYY/MM/DD HH:mm') : '—'}
                  </div>
                  {myWaiver.parentRequired && (
                    <div style={{ marginTop:16, paddingTop:16, borderTop:'0.5px solid #F5EFEF' }}>
                      <div style={{ fontSize:11, color:'#999', marginBottom:6 }}>家長/監護人共同簽署</div>
                      {myWaiver.parentSignatureUrl ? (
                        <img src={myWaiver.parentSignatureUrl} alt="家長簽名"
                          style={{ width:'100%', maxWidth:280, border:'0.5px solid #E8D5D5', borderRadius:8, background:'#FBF5F5', marginBottom:8 }}/>
                      ) : <div style={{ fontSize:13, color:'#999', marginBottom:8 }}>尚未簽署</div>}
                      {myWaiver.parentName && <div style={{ fontSize:13, color:'#666' }}>簽署人：{myWaiver.parentName}（{myWaiver.parentRelation || '監護人'}）</div>}
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{ padding:'12px 0 36px' }}>
              <button onClick={() => setShowWaiver(false)}
                style={{ width:'100%', height:48, borderRadius:12, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:14, cursor:'pointer' }}>關閉</button>
            </div>
          </div>
        </div>
      )}

      <BottomNav navigate={navigate} />
    </div>
  );
}
