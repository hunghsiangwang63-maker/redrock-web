import { useState, useEffect } from 'react';
import { getGyms, getAnnouncements, updateGymInfo, updateGymHours, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../api/gyms';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';

const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_LABELS = { mon:'週一', tue:'週二', wed:'週三', thu:'週四', fri:'週五', sat:'週六', sun:'週日' };

const Tag = ({ type='ok', children }) => {
  const s = { ok:{bg:'#E6F4EB',color:'#2D7D46'}, red:{bg:'#FCEBEB',color:'#A32D2D'}, warn:{bg:'#FAEEDA',color:'#854F0B'}, blue:{bg:'#E6F1FB',color:'#185FA5'}, gray:{bg:'#F0EDED',color:'#666'} };
  const st = s[type]||s.ok;
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:st.bg, color:st.color }}>{children}</span>;
};

export default function GymsPage({ embedded = false }) {
  const { staff } = useAuth();
  const isSuperAdmin = staff?.role === 'super_admin';
  const [gyms, setGyms] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddAnn, setShowAddAnn] = useState(false);
  const [annForm, setAnnForm] = useState({ title:'', content:'', type:'general', effectiveFrom:'', effectiveTo:'', specialOpen:'', specialClose:'' });
  const [annSaving, setAnnSaving] = useState(false);
  const [annMsg, setAnnMsg] = useState('');
  const [editingAnn, setEditingAnn] = useState(null);
  const [showEditGym, setShowEditGym] = useState(false);
  const [gymForm, setGymForm] = useState({ name:'', shortName:'', address:'', phone:'', googleMapsUrl:'', parkingInfo:'', transitInfo:'', description:'' });
  const [gymSaving, setGymSaving] = useState(false);
  const [gymMsg, setGymMsg] = useState('');
  const [showEditHours, setShowEditHours] = useState(false);
  const [hoursForm, setHoursForm] = useState({});
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursMsg, setHoursMsg] = useState('');

  useEffect(() => {
    Promise.all([getGyms(), getAnnouncements()])
      .then(([gRes, aRes]) => {
        setGyms(gRes.data.gyms || []);
        setAnnouncements(aRes.data.announcements || []);
        if (gRes.data.gyms?.length > 0) setSelected(gRes.data.gyms[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  const reloadGyms = async () => {
    const gRes = await getGyms();
    setGyms(gRes.data.gyms || []);
    if (selected) {
      const fresh = (gRes.data.gyms || []).find(g => g.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  };

  const handleAddAnn = async () => {
    if (!annForm.title || !annForm.effectiveFrom) { setAnnMsg('請填寫標題和開始日期'); return; }
    setAnnSaving(true);
    try {
      const gymPathId = selected?.id || 'all';
      if (editingAnn) {
        await updateAnnouncement(gymPathId, editingAnn.id, annForm);
        setAnnMsg('公告已更新');
      } else {
        await createAnnouncement(gymPathId, annForm);
        setAnnMsg('公告已新增');
      }
      setShowAddAnn(false);
      setEditingAnn(null);
      setAnnForm({ title:'', content:'', type:'general', effectiveFrom:'', effectiveTo:'', specialOpen:'', specialClose:'' });
      const aRes = await getAnnouncements();
      setAnnouncements(aRes.data.announcements || []);
    } catch (e) {
      setAnnMsg(e.response?.data?.message || (editingAnn ? '更新失敗' : '新增失敗'));
    } finally { setAnnSaving(false); }
  };

  const openEditAnn = (a) => {
    setEditingAnn(a);
    setAnnForm({ title:a.title, content:a.content||'', type:a.type, effectiveFrom:a.effectiveFrom, effectiveTo:a.effectiveTo||'', specialOpen:a.specialOpen||'', specialClose:a.specialClose||'' });
    setAnnMsg('');
    setShowAddAnn(true);
  };

  const handleDeleteAnn = async (a) => {
    if (!window.confirm(`確定要下架「${a.title}」？`)) return;
    try {
      await deleteAnnouncement(a.gymId || 'all', a.id);
      const aRes = await getAnnouncements();
      setAnnouncements(aRes.data.announcements || []);
    } catch (e) {
      alert(e.response?.data?.message || '下架失敗');
    }
  };

  const openEditGym = () => {
    setGymForm({
      name: selected.name || '', shortName: selected.shortName || '', address: selected.address || '',
      phone: selected.phone || '', googleMapsUrl: selected.googleMapsUrl || '',
      parkingInfo: selected.parkingInfo || '', transitInfo: selected.transitInfo || '', description: selected.description || '',
    });
    setGymMsg('');
    setShowEditGym(true);
  };

  const handleSaveGym = async () => {
    setGymSaving(true);
    try {
      await updateGymInfo(selected.id, gymForm);
      setGymMsg('已儲存');
      await reloadGyms();
      setTimeout(() => setShowEditGym(false), 600);
    } catch (e) {
      setGymMsg(e.response?.data?.message || '儲存失敗');
    } finally { setGymSaving(false); }
  };

  const openEditHours = () => {
    const base = {};
    DAYS.forEach(d => {
      const h = selected.regularHours?.[d];
      base[d] = h ? { open: h.open || '10:00', close: h.close || '22:00', closed: !!h.closed } : { open:'10:00', close:'22:00', closed:false };
    });
    setHoursForm(base);
    setHoursMsg('');
    setShowEditHours(true);
  };

  const handleSaveHours = async () => {
    setHoursSaving(true);
    try {
      await updateGymHours(selected.id, hoursForm);
      setHoursMsg('已儲存');
      await reloadGyms();
      setTimeout(() => setShowEditHours(false), 600);
    } catch (e) {
      setHoursMsg(e.response?.data?.message || '儲存失敗');
    } finally { setHoursSaving(false); }
  };

  const annTypeLabel = (type) => ({
    closure:'休館', special_hours:'特殊時間', route_change:'路線更換', general:'一般公告'
  }[type] || type);

  const annTypeTag = (type) => ({
    closure:'red', special_hours:'warn', route_change:'blue', general:'gray'
  }[type] || 'gray');

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'#999' }}>載入中...</div>;

  return (
    <div style={{ padding:20, background:'#F7F3F3', minHeight:'100vh' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        {gyms.map(g => (
          <div key={g.id} onClick={() => setSelected(g)}
            style={{ background:'#fff', borderRadius:12, border:`1.5px solid ${selected?.id===g.id ? '#8B1A1A' : '#E8D5D5'}`, padding:16, cursor:'pointer', transition:'border-color .15s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:15 }}>{g.name}</div>
                <div style={{ fontSize:12, color:'#999', marginTop:3 }}>{g.address}</div>
              </div>
              {g.todayStatus ? (
                <Tag type={g.todayStatus.isOpen ? 'ok' : 'red'}>
                  {g.todayStatus.isOpen ? '營業中' : '休館'}
                </Tag>
              ) : <Tag type="gray">載入中</Tag>}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div style={{ background:'#FBF5F5', borderRadius:8, padding:'8px 10px', fontSize:12 }}>
                <div style={{ color:'#999' }}>今日時間</div>
                <div style={{ fontWeight:500, marginTop:2 }}>{g.todayStatus?.todayHours || '—'}</div>
              </div>
              <div style={{ background:'#FBF5F5', borderRadius:8, padding:'8px 10px', fontSize:12 }}>
                <div style={{ color:'#999' }}>電話</div>
                <div style={{ fontWeight:500, marginTop:2 }}>{g.phone}</div>
              </div>
            </div>
            {selected?.id === g.id && isSuperAdmin && (
              <button onClick={e => { e.stopPropagation(); openEditGym(); }}
                style={{ width:'100%', marginTop:10, height:28, borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:11, cursor:'pointer' }}>
                修改場館資料
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* 標準營業時間 */}
        {selected && (
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <span style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>
                {selected.shortName} 標準營業時間
              </span>
              <button onClick={openEditHours} style={{ height:24, padding:'0 9px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:11, cursor: isSuperAdmin ? 'pointer' : 'not-allowed', opacity: isSuperAdmin ? 1 : 0.4 }} disabled={!isSuperAdmin}>修改</button>
            </div>
            {DAYS.map(d => {
              const h = selected.regularHours?.[d];
              const isToday = DAYS[dayjs().day()] === d;
              return (
                <div key={d} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F5EFEF', fontSize:13, background: isToday ? '#FBF5F5' : 'transparent', margin:'0 -8px', padding:'8px 8px' }}>
                  <span style={{ color: isToday ? '#8B1A1A' : '#6b6b6b', fontWeight: isToday ? 600 : 400 }}>
                    {DAY_LABELS[d]} {isToday && '（今日）'}
                  </span>
                  <span style={{ fontWeight:500 }}>
                    {h?.closed ? <Tag type="gray">公休</Tag> : h ? `${h.open} - ${h.close}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 公告列表 */}
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8D5D5', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>公告列表</span>
            <button onClick={() => setShowAddAnn(true)} style={{ height:28, padding:'0 10px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>＋ 新增公告</button>
          </div>
          {announcements.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:'#999', fontSize:13 }}>目前無公告</div>
          ) : announcements.map(a => (
            <div key={a.id} style={{ padding:'12px 16px', borderBottom:'1px solid #F5EFEF' }}>
              <div style={{ display:'flex', gap:6, marginBottom:5, alignItems:'center' }}>
                <Tag type={annTypeTag(a.type)}>{annTypeLabel(a.type)}</Tag>
                {a.showOnBanner && <Tag type="blue">輪播</Tag>}
                <span style={{ fontSize:11, color:'#999', marginLeft:'auto' }}>{a.effectiveFrom}</span>
              </div>
              <div style={{ fontSize:13, fontWeight:500 }}>{a.title}</div>
              {a.content && <div style={{ fontSize:12, color:'#6b6b6b', marginTop:3 }}>{a.content}</div>}
              {a.effectiveTo && <div style={{ fontSize:11, color:'#999', marginTop:4 }}>有效至 {a.effectiveTo}</div>}
              <div style={{ display:'flex', gap:6, marginTop:8 }}>
                <button onClick={() => openEditAnn(a)} style={{ height:24, padding:'0 9px', borderRadius:6, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:10, cursor:'pointer' }}>編輯</button>
                <button onClick={() => handleDeleteAnn(a)} style={{ height:24, padding:'0 9px', borderRadius:6, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:10, cursor:'pointer' }}>下架</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 新增/編輯公告 Modal */}
      {showAddAnn && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:480 }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>{editingAnn ? '編輯公告' : '新增公告'}</div>
            {annMsg && <div style={{ background: annMsg.includes('成功')||annMsg.includes('已') ? '#E6F4EB' : '#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:13, color: annMsg.includes('成功')||annMsg.includes('已') ? '#2D7D46' : '#A32D2D', marginBottom:12 }}>{annMsg}</div>}
            {[
              { label:'標題', key:'title', placeholder:'公告標題', type:'text' },
              { label:'內容（選填）', key:'content', placeholder:'公告詳細內容', type:'text' },
              { label:'開始日期', key:'effectiveFrom', placeholder:'', type:'date' },
              { label:'結束日期（選填）', key:'effectiveTo', placeholder:'', type:'date' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                <input type={f.type} value={annForm[f.key]} placeholder={f.placeholder}
                  onChange={e => setAnnForm(p => ({...p, [f.key]: e.target.value}))}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>類型</label>
              <select value={annForm.type} onChange={e => setAnnForm(p => ({...p, type: e.target.value}))}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
                <option value="general">一般公告</option>
                <option value="closure">休館</option>
                <option value="special_hours">特殊時間</option>
                <option value="route_change">路線更換</option>
              </select>
            </div>

            {annForm.type === 'closure' && (
              <div style={{ background:'#FCEBEB', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#A32D2D', marginBottom:16, lineHeight:1.6 }}>
                此類型會自動覆蓋有效期間內的營業狀態，會員端與場館卡片會顯示「今日休館」，不需另外調整標準營業時間。
              </div>
            )}

            {annForm.type === 'special_hours' && (
              <>
                <div style={{ background:'#FFF3E0', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#B5762B', marginBottom:12, lineHeight:1.6 }}>
                  此類型會自動覆蓋有效期間內當天顯示的營業時間，不需另外調整標準營業時間。請填寫當天實際的營業時段。
                </div>
                <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>當天開始時間</label>
                    <input type="time" value={annForm.specialOpen}
                      onChange={e => setAnnForm(p => ({...p, specialOpen: e.target.value}))}
                      style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>當天結束時間</label>
                    <input type="time" value={annForm.specialClose}
                      onChange={e => setAnnForm(p => ({...p, specialClose: e.target.value}))}
                      style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
                  </div>
                </div>
              </>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { setShowAddAnn(false); setEditingAnn(null); setAnnMsg(''); }}
                style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:13, cursor:'pointer' }}>取消</button>
              <button onClick={handleAddAnn} disabled={annSaving}
                style={{ flex:2, height:40, borderRadius:8, background: annSaving?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: annSaving?'not-allowed':'pointer' }}>
                {annSaving ? '處理中...' : editingAnn ? '儲存變更' : '確認新增'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改場館資料 Modal */}
      {showEditGym && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>修改場館資料</div>
            {gymMsg && <div style={{ background: gymMsg==='已儲存' ? '#E6F4EB' : '#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:13, color: gymMsg==='已儲存' ? '#2D7D46' : '#A32D2D', marginBottom:12 }}>{gymMsg}</div>}
            {[
              { label:'場館全名', key:'name' },
              { label:'簡稱', key:'shortName' },
              { label:'地址', key:'address' },
              { label:'電話', key:'phone' },
              { label:'Google地圖連結（選填）', key:'googleMapsUrl' },
              { label:'停車資訊（選填）', key:'parkingInfo' },
              { label:'交通資訊（選填）', key:'transitInfo' },
              { label:'場館描述（選填）', key:'description' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>{f.label}</label>
                <input value={gymForm[f.key]}
                  onChange={e => setGymForm(p => ({...p, [f.key]: e.target.value}))}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
              </div>
            ))}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowEditGym(false)}
                style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:13, cursor:'pointer' }}>取消</button>
              <button onClick={handleSaveGym} disabled={gymSaving}
                style={{ flex:2, height:40, borderRadius:8, background: gymSaving?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: gymSaving?'not-allowed':'pointer' }}>
                {gymSaving ? '儲存中...' : '儲存變更'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改標準營業時間 Modal */}
      {showEditHours && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:480, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>修改標準營業時間</div>
            {hoursMsg && <div style={{ background: hoursMsg==='已儲存' ? '#E6F4EB' : '#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:13, color: hoursMsg==='已儲存' ? '#2D7D46' : '#A32D2D', marginBottom:12 }}>{hoursMsg}</div>}
            {DAYS.map(d => (
              <div key={d} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, padding:'8px 0', borderBottom:'0.5px solid #F5EFEF' }}>
                <span style={{ width:44, fontSize:13, fontWeight:500 }}>{DAY_LABELS[d]}</span>
                {hoursForm[d]?.closed ? (
                  <span style={{ flex:1, fontSize:12, color:'#999' }}>公休</span>
                ) : (
                  <>
                    <input type="time" value={hoursForm[d]?.open || ''}
                      onChange={e => setHoursForm(p => ({...p, [d]: {...p[d], open: e.target.value}}))}
                      style={{ height:32, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:12, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }} />
                    <span style={{ fontSize:12, color:'#999' }}>–</span>
                    <input type="time" value={hoursForm[d]?.close || ''}
                      onChange={e => setHoursForm(p => ({...p, [d]: {...p[d], close: e.target.value}}))}
                      style={{ height:32, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:12, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }} />
                  </>
                )}
                <label style={{ display:'flex', alignItems:'center', gap:4, marginLeft:'auto', fontSize:11, color:'#666', cursor:'pointer' }}>
                  <input type="checkbox" checked={!!hoursForm[d]?.closed}
                    onChange={e => setHoursForm(p => ({...p, [d]: {...p[d], closed: e.target.checked}}))} />
                  公休
                </label>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={() => setShowEditHours(false)}
                style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:13, cursor:'pointer' }}>取消</button>
              <button onClick={handleSaveHours} disabled={hoursSaving}
                style={{ flex:2, height:40, borderRadius:8, background: hoursSaving?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: hoursSaving?'not-allowed':'pointer' }}>
                {hoursSaving ? '儲存中...' : '儲存變更'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
