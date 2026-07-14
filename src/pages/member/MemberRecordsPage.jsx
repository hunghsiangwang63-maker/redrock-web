import { useState, useEffect } from 'react';
import { t } from '../../utils/memberI18n';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { memberClient } from '../../api/client';
import dayjs from 'dayjs';
import { entryTypeLabel, entryLabelOf } from '../../utils/entryLabel';
import { gymPrefix } from '../../utils/gymLabel';

const TABS = [
  { key:'checkins',    icon:'🚪', label:'入場紀錄' },
  { key:'passes',      icon:'🎫', label:'定期票' },
  { key:'courses',     icon:'📚', label:'課程' },
  { key:'adjustments', icon:'📋', label:'退費/請假' },
  { key:'competitions',icon:'🏆', label:'比賽' },
];

export default function MemberRecordsPage() {
  const { member } = useMember();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState('checkins');
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);       // 家庭成員（本人＋子女）
  const [viewId, setViewId] = useState(null);      // 目前檢視對象

  // 載入家庭成員（本人＋子女）供下拉選單
  useEffect(() => {
    if (!member?.id) return;
    setViewId(member.id);
    memberClient.get('/members/my/children')
      .then(r => {
        const children = (r.data.children || r.data || []).map(c => ({ id: c.id, name: c.name, isSelf: false }));
        setPeople([{ id: member.id, name: member.name || '本人', isSelf: true }, ...children]);
      })
      .catch(() => setPeople([{ id: member.id, name: member.name || '本人', isSelf: true }]));
  }, [member?.id]);

  useEffect(() => {
    if (!viewId) return;
    setLoading(true);
    Promise.allSettled([
      memberClient.get('/checkin/history', { params: { memberId: viewId, limit: 50 } }),
      memberClient.get(`/passes/member/${viewId}`),
      memberClient.get(`/courses/member/${viewId}/enrollments`),
      memberClient.get(`/course-adjustments/member/${viewId}`),
      memberClient.get(`/competitions/registrations/member/${viewId}`),
    ]).then(([checkins, passes, courses, adjustments, comps]) => {
      setRecords({
        checkins: checkins.status==='fulfilled' ? checkins.value.data.checkIns || checkins.value.data || [] : [],
        passes: passes.status==='fulfilled' ? passes.value.data.passes || [] : [],
        courses: courses.status==='fulfilled' ? courses.value.data.enrollments || [] : [],
        adjustments: adjustments.status==='fulfilled' ? adjustments.value.data.requests || [] : [],
        competitions: comps.status==='fulfilled' ? comps.value.data.registrations || [] : [],
      });
    }).finally(() => setLoading(false));
  }, [viewId]);

  const NavBar = () => (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#fff', borderTop:'0.5px solid #E8D5D5', display:'flex', height:60, paddingBottom:'env(safe-area-inset-bottom)', zIndex:50 }}>
      {[{icon:'🏠',label:'首頁',path:'/member/home'},{icon:'📚',label:'課程總覽',path:'/member/courses'},{icon:'🎫',label:'我的票券',path:'/member/passes'},{icon:'👤',label:'我的',path:'/member/profile'}].map(n=>{
        const active = location.pathname===n.path;
        return <div key={n.path} onClick={()=>navigate(n.path)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, cursor:'pointer', color:active?'#8B1A1A':'#999' }}>
          <div style={{ fontSize:20 }}>{n.icon}</div>
          <div style={{ fontSize:10, fontWeight:active?600:400 }}>{t(n.label)}</div>
        </div>;
      })}
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#FBF5F5', paddingBottom:80 }}>
      <div style={{ background:'#8B1A1A', padding:'16px 20px 14px', color:'#fff', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={()=>navigate('/member/profile')} style={{ background:'none', border:'none', color:'#fff', fontSize:20, cursor:'pointer', padding:0 }}>‹</button>
        <div style={{ fontSize:18, fontWeight:700 }}>📋 我的紀錄</div>
      </div>

      {/* 家庭成員下拉（有子女才顯示） */}
      {people.length > 1 && (
        <div style={{ background:'#fff', borderBottom:'0.5px solid #E8D5D5', padding:'10px 16px', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:12, color:'#666', flexShrink:0 }}>檢視對象</span>
          <select value={viewId || ''} onChange={e => setViewId(e.target.value)}
            style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'0.5px solid #D9C4C4', background:'#FBF5F5', fontSize:13, color:'#333' }}>
            {people.map(p => (
              <option key={p.id} value={p.id}>{p.isSelf ? p.name : `👦 ${p.name}`}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tab */}
      <div style={{ background:'#fff', borderBottom:'0.5px solid #E8D5D5', display:'flex', overflowX:'auto', gap:0 }}>
        {TABS.map(t => {
          const active = tab===t.key;
          const count = records?.[t.key]?.length || 0;
          return (
            <button key={t.key} onClick={()=>setTab(t.key)}
              style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'10px 16px', border:'none', borderBottom:active?'2.5px solid #8B1A1A':'2.5px solid transparent', background:'none', color:active?'#8B1A1A':'#666', fontSize:11, fontWeight:active?700:400, cursor:'pointer' }}>
              <span style={{ fontSize:16 }}>{t.icon}</span>
              <span>{t.label}{count>0?` (${count})`:''}</span>
            </button>
          );
        })}
      </div>

      <div style={{ padding:'12px 16px' }}>
        {loading && <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div>}

        {!loading && tab==='checkins' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!records?.checkins?.length && <Empty text="無入場紀錄"/>}
            {(records?.checkins||[]).map((c,i) => {
              const cancelled = c.isCancelled === true || c.status === 'cancelled';
              return (
                <Card key={i}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', opacity: cancelled ? 0.6 : 1 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ textDecoration: cancelled ? 'line-through' : 'none', color: cancelled ? '#999' : '#333' }}>
                          {c.gymId==='gym-hsinchu'?'新竹館':'士林館'}
                        </span>
                        {cancelled && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'#F0EDED', color:'#999', fontWeight:600 }}>已取消</span>}
                      </div>
                      <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{entryLabelOf(c)}</div>
                    </div>
                    <div style={{ fontSize:12, color:'#999' }}>{c.createdAt?._seconds ? dayjs(c.createdAt._seconds*1000).format('MM/DD HH:mm') : c.date}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && tab==='passes' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!records?.passes?.length && <Empty text="無定期票紀錄"/>}
            {(records?.passes||[]).map((p,i) => (
              <Card key={i}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{p.passTypeName||p.passType}</div>
                  <StatusBadge status={p.status} labels={{ active:'使用中', expired:'已到期' }}/>
                </div>
                <div style={{ fontSize:11, color:'#999', marginTop:4 }}>{p.startDate} ～ {p.endDate}</div>
              </Card>
            ))}
          </div>
        )}

        {!loading && tab==='courses' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!records?.courses?.length && <Empty text="無課程報名紀錄"/>}
            {(records?.courses||[]).map((e,i) => (
              <Card key={i}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{gymPrefix(e.gymId)}{e.courseName}{e.isMakeup?' 🔄 補課':''}</div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{e.date} {e.startTime}</div>
                  </div>
                  <StatusBadge status={e.status} labels={{ confirmed:'已報名', leave:'已請假', cancelled:'已取消', course_cancelled:'課程已取消' }}/>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!loading && tab==='adjustments' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!records?.adjustments?.length && <Empty text="無退費/請假申請紀錄"/>}
            {(records?.adjustments||[]).map((r,i) => {
              const typeLabel = r.type==='refund'?'退費申請':r.type==='pause'?'暫停申請':'申請';
              return (
                <Card key={i}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500 }}>{r.courseName||typeLabel}</div>
                      <div style={{ fontSize:11, color:'#666', marginTop:2 }}>{typeLabel}{r.reason?` · ${r.reason}`:''}</div>
                      <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                        {r.createdAt?._seconds ? dayjs(r.createdAt._seconds*1000).format('YYYY/MM/DD') : ''}
                        {r.refundAmount ? ` · 退款 NT$${r.refundAmount}` : ''}
                      </div>
                    </div>
                    <StatusBadge status={r.status} labels={{ pending:'待審核', approved:'已核准', rejected:'已拒絕' }}/>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && tab==='competitions' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!records?.competitions?.length && <Empty text="無比賽報名紀錄"/>}
            {(records?.competitions||[]).map((r,i) => (
              <Card key={i}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{r.competitionName}</div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{r.divisionName} · {r.eventDate||''}</div>
                  </div>
                  <StatusBadge status={r.paymentStatus} labels={{ confirmed:'已繳費', pending:'待繳費' }}/>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <NavBar/>
    </div>
  );
}

const Card = ({ children }) => (
  <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px' }}>{children}</div>
);
const Empty = ({ text }) => (
  <div style={{ textAlign:'center', color:'#999', padding:32, fontSize:13 }}>{text}</div>
);
const STATUS_STYLE = {
  active:    { bg:'#E6F4EB', color:'#2D7D46' },
  confirmed: { bg:'#E6F4EB', color:'#2D7D46' },
  approved:  { bg:'#E6F4EB', color:'#2D7D46' },
  expired:   { bg:'#F0EDED', color:'#999' },
  cancelled: { bg:'#F0EDED', color:'#999' },
  rejected:  { bg:'#FCEBEB', color:'#A32D2D' },
  pending:   { bg:'#FAEEDA', color:'#854F0B' },
  leave:     { bg:'#F0EDED', color:'#999' },
};
// Add course_cancelled to STATUS_STYLE
STATUS_STYLE['course_cancelled'] = { bg:'#FCEBEB', color:'#A32D2D' };

const StatusBadge = ({ status, labels }) => {
  const s = STATUS_STYLE[status] || { bg:'#F0EDED', color:'#666' };
  return <span style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:s.bg, color:s.color, flexShrink:0 }}>{labels?.[status]||status}</span>;
};
