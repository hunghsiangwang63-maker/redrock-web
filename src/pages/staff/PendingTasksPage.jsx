import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';

const TYPE_CONFIG = {
  rental:             { icon:'👟', color:'#854F0B', bg:'#FAEEDA', label:'器材租借' },
  rental_pickup:      { icon:'📦', color:'#185FA5', bg:'#E6F1FB', label:'今日取件' },
  rental_return:      { icon:'✅', color:'#2D7D46', bg:'#E6F4EB', label:'今日歸還' },
  course_adjustment:  { icon:'📚', color:'#8B1A1A', bg:'#FBF5F5', label:'課程申請' },
  pass_adjustment:    { icon:'🎫', color:'#5B2D8B', bg:'#F3EEF9', label:'票券申請' },
  competition_payment:{ icon:'🏆', color:'#185FA5', bg:'#E6F1FB', label:'比賽收款' },
  team_member:        { icon:'⚡', color:'#2D7D46', bg:'#E6F4EB', label:'隊員申請' },
  experience:         { icon:'🧗', color:'#8B1A1A', bg:'#FBF5F5', label:'體驗課程' },
  transfer_payment:   { icon:'🏦', color:'#185FA5', bg:'#E6F1FB', label:'課程轉帳待確認' },
  experience_transfer:{ icon:'💳', color:'#185FA5', bg:'#E6F1FB', label:'體驗轉帳待確認' },
};

export default function PendingTasksPage() {
  const { staff } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gymFilter, setGymFilter] = useState('');
  const isAdmin = ['super_admin','gym_manager'].includes(staff?.role);
  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1,'day').format('YYYY-MM-DD');
  const weekAgo = dayjs().subtract(7,'day').format('YYYY-MM-DD');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/pending-tasks', {
        params: isAdmin && gymFilter ? { gymId: gymFilter } : {}
      });
      setTasks(res.data.tasks || []);
    } catch(e) { setTasks([]); } finally { setLoading(false); }
  }, [gymFilter, isAdmin]);

  useEffect(() => { load(); }, [load]);

  // 分組
  const groups = [
    { key:'today',    label:'今日', tasks: tasks.filter(t => t.date === today) },
    { key:'yesterday',label:'昨日', tasks: tasks.filter(t => t.date === yesterday) },
    { key:'week',     label:'近7天', tasks: tasks.filter(t => t.date < yesterday && t.date >= weekAgo) },
    { key:'older',    label:'更早', tasks: tasks.filter(t => t.date < weekAgo) },
  ].filter(g => g.tasks.length > 0);

  const total = tasks.length;

  return (
    <div style={{ padding:24, maxWidth:800, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:20, fontWeight:700 }}>🔔 待辦總覽</div>
          {total > 0 && (
            <span style={{ background:'#A32D2D', color:'#fff', borderRadius:12, padding:'2px 10px', fontSize:12, fontWeight:700 }}>{total}</span>
          )}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {isAdmin && (
            <select value={gymFilter} onChange={e => setGymFilter(e.target.value)}
              style={{ height:32, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', color:'#1a1a1a', cursor:'pointer' }}>
              <option value="">全部館別</option>
              <option value="gym-hsinchu">新竹館</option>
              <option value="gym-shilin">士林館</option>
            </select>
          )}
          <button onClick={load} style={{ height:32, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>
            重新整理
          </button>
        </div>
      </div>
      <div style={{ fontSize:12, color:'#999', marginBottom:16 }}>
        上次更新：{dayjs().format('HH:mm')}　·　涵蓋項目：器材租借、課程退費/暫停、票券調整、比賽收款、攀岩隊申請
      </div>

      {loading && <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div>}
      {!loading && total === 0 && (
        <div style={{ background:'#fff', borderRadius:14, border:'0.5px solid #E8D5D5', padding:40, textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#2D7D46' }}>目前沒有待處理事項</div>
          <div style={{ fontSize:13, color:'#999', marginTop:4 }}>所有申請均已處理完畢</div>
        </div>
      )}

      {!loading && groups.map(group => (
        <div key={group.key} style={{ marginBottom:20 }}>
          {/* 日期標題 */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#1a1a1a' }}>
              {group.key === 'today' ? '📅 今日' :
               group.key === 'yesterday' ? '📅 昨日' :
               group.key === 'week' ? '📅 近 7 天' : '📅 更早'}
            </div>
            <div style={{ flex:1, height:1, background:'#E8D5D5' }}/>
            <div style={{ fontSize:12, color:'#999' }}>{group.tasks.length} 項</div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {group.tasks.map(task => {
              const cfg = TYPE_CONFIG[task.type] || TYPE_CONFIG.rental;
              return (
                <div key={task.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
                  {/* 圖示 */}
                  <div style={{ width:40, height:40, borderRadius:10, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                    {cfg.icon}
                  </div>
                  {/* 內容 */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                      <span style={{ fontSize:10, fontWeight:600, padding:'1px 7px', borderRadius:6, background:cfg.bg, color:cfg.color }}>{cfg.label}</span>
                      <span style={{ fontSize:13, fontWeight:600 }}>{task.title}</span>
                    </div>
                    <div style={{ fontSize:12, color:'#666', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.desc}</div>
                    <div style={{ fontSize:11, color:'#bbb', marginTop:2 }}>
                      {task.gymId === 'gym-hsinchu' ? '新竹館' : task.gymId === 'gym-shilin' ? '士林館' : ''}
                      {task.gymId && task.date ? ' · ' : ''}
                      {task.date}
                    </div>
                  </div>
                  {/* 前往按鈕 */}
                  <button onClick={() => navigate(task.link)}
                    style={{ height:34, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, fontWeight:500, cursor:'pointer', flexShrink:0 }}>
                    前往處理
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
