import { useState } from 'react';
import dayjs from 'dayjs';

const RECORD_TABS = [
  { key:'checkins',     icon:'🚪', label:'入場' },
  { key:'passes',       icon:'🎫', label:'定期票' },
  { key:'courses',      icon:'📚', label:'課程' },
  { key:'competitions', icon:'🏆', label:'比賽' },
  { key:'adjustments',  icon:'📋', label:'退費/調整' },
];

function MemberRecords({ records }) {
  const [tab, setTab] = useState('checkins');
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, marginBottom:14 }}>
        {RECORD_TABS.map(t => {
          const active = tab===t.key;
          const count = records[t.key]?.length || 0;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ height:42, borderRadius:8, border:`1.5px solid ${active?'#8B1A1A':'#EDE5E5'}`, background:active?'#8B1A1A':'#fff', color:active?'#fff':'#666', fontSize:11, fontWeight:active?600:400, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1 }}>
              <span style={{ fontSize:14 }}>{t.icon}</span>
              <span>{t.label}{count>0 ? ' (' + count + ')' : ''}</span>
            </button>
          );
        })}
      </div>
      {tab==='checkins' && (
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {!records.checkins.length && <div style={{ color:'#999', fontSize:12, textAlign:'center', padding:16 }}>無入場紀錄</div>}
          {records.checkins.slice(0,30).map((c,i) => (
            <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:12, fontWeight:500 }}>{c.gymId==='gym-hsinchu'?'新竹館':'士林館'}</div>
                <div style={{ fontSize:11, color:'#999' }}>{c.entryType}{c.paymentMethod ? ' · ' + c.paymentMethod : ''}</div>
              </div>
              <div style={{ fontSize:11, color:'#999' }}>{c.createdAt?._seconds ? dayjs(c.createdAt._seconds*1000).format('MM/DD HH:mm') : c.date||''}</div>
            </div>
          ))}
        </div>
      )}
      {tab==='passes' && (
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {!records.passes.length && <div style={{ color:'#999', fontSize:12, textAlign:'center', padding:16 }}>無定期票紀錄</div>}
          {records.passes.map((p,i) => (
            <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:12, fontWeight:500 }}>{p.passTypeName||p.passType}</div>
                <span style={{ fontSize:10, padding:'1px 8px', borderRadius:6, background:p.status==='active'?'#E6F4EB':'#F0EDED', color:p.status==='active'?'#2D7D46':'#999' }}>{p.status==='active'?'使用中':p.status==='expired'?'已到期':p.status}</span>
              </div>
              <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{p.startDate} ～ {p.endDate}</div>
            </div>
          ))}
        </div>
      )}
      {tab==='courses' && (
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {!records.courses.length && <div style={{ color:'#999', fontSize:12, textAlign:'center', padding:16 }}>無課程紀錄</div>}
          {records.courses.slice(0,30).map((e,i) => (
            <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:12, fontWeight:500 }}>{e.courseName}{e.isMakeup?' 🔄':''}</div>
                <div style={{ fontSize:11, color:'#999' }}>{e.date} {e.startTime}</div>
              </div>
              <span style={{ fontSize:10, padding:'1px 8px', borderRadius:6, background:e.status==='confirmed'?'#E6F4EB':e.status==='leave'?'#F0EDED':'#FAEEDA', color:e.status==='confirmed'?'#2D7D46':e.status==='leave'?'#999':'#854F0B' }}>
                {e.status==='confirmed'?'已報名':e.status==='leave'?'已請假':e.status}
              </span>
            </div>
          ))}
        </div>
      )}
      {tab==='competitions' && (
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {!records.competitions.length && <div style={{ color:'#999', fontSize:12, textAlign:'center', padding:16 }}>無比賽紀錄</div>}
          {records.competitions.map((r,i) => (
            <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:12, fontWeight:500 }}>{r.competitionName}</div>
                <span style={{ fontSize:10, padding:'1px 8px', borderRadius:6, background:r.paymentStatus==='confirmed'?'#E6F4EB':'#FAEEDA', color:r.paymentStatus==='confirmed'?'#2D7D46':'#854F0B' }}>
                  {r.paymentStatus==='confirmed'?'已繳費':'待繳費'}
                </span>
              </div>
              <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{r.divisionName} · {r.eventDate||''}</div>
            </div>
          ))}
        </div>
      )}
      {tab==='adjustments' && (
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {!records.adjustments?.length && <div style={{ color:'#999', fontSize:12, textAlign:'center', padding:16 }}>無退費/調整紀錄</div>}
          {(records.adjustments||[]).map((r,i) => {
            const typeLabel = r.type==='refund'?'退費申請':r.type==='pause'?'暫停申請':r.type==='makeup'?'補課紀錄':r.type||'申請';
            const statusLabel = r.status==='pending'?'待審核':r.status==='approved'?'已核准':r.status==='rejected'?'已拒絕':r.status;
            const statusColor = r.status==='approved'?'#2D7D46':r.status==='rejected'?'#A32D2D':'#854F0B';
            const statusBg = r.status==='approved'?'#E6F4EB':r.status==='rejected'?'#FCEBEB':'#FAEEDA';
            return (
              <div key={i} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:12, fontWeight:500 }}>{r.courseName||typeLabel}</div>
                  <span style={{ fontSize:10, padding:'1px 8px', borderRadius:6, background:statusBg, color:statusColor }}>{statusLabel}</span>
                </div>
                <div style={{ fontSize:11, color:'#666', marginTop:2 }}>
                  {typeLabel}{r.reason ? ' · ' + r.reason : ''}
                </div>
                <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
                  {r.createdAt?._seconds ? dayjs(r.createdAt._seconds*1000).format('YYYY/MM/DD') : ''}
                  {r.refundAmount ? ' · 退款 NT$' + r.refundAmount : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { MemberRecords };
