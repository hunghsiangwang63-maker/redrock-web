import { useState, useEffect } from 'react';
import client from '../../api/client';
import { useAuth } from '../../store/authStore';
import { gymLabel } from '../../utils/gymLabel';

// 抱石路線管理（2026-08-29 新增）：路線 CRUD＋IG 示範影片連結＋下架保留成績。
// 編輯權限＝管理員/場館電腦(值班)/正職（後端 routeEditorGate 權威，此處僅同步顯示）。

const GRADES = ['V0','V1','V2','V3','V4','V5','V6','V7','V8','V9','V10'];
// 難度色階（淺→深，供 badge 用）
const GRADE_COLORS = {
  V0:'#5CA85C', V1:'#4E9E7E', V2:'#3E8FA8', V3:'#3D6FB5', V4:'#5B54B8',
  V5:'#8B48B0', V6:'#B03E96', V7:'#C13A5E', V8:'#C1462A', V9:'#8A3A1E', V10:'#3A3A3A',
};

const emptyForm = { area:'', color:'', grade:'V0', name:'', note:'', setter:'', igUrl:'', setAt:'' };
const GYM_OPTIONS = [ { id:'gym-hsinchu', label:'新竹館' }, { id:'gym-shilin', label:'士林館' } ];
const emptyItem = () => ({ color:'', grade:'V0', name:'' });

const Modal = ({ title, onClose, children }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
    <div style={{ background:'#fff', borderRadius:16, padding:24, width:480, maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto', WebkitOverflowScrolling:'touch', border:'0.5px solid #E8D5D5' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:600, color:'#333' }}>{title}</div>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const inputStyle = { width:'100%', padding:'9px 10px', borderRadius:8, border:'1px solid #ddd', fontSize:13, boxSizing:'border-box', color:'#333', background:'#fff' };
const labelStyle = { fontSize:12, color:'#666', fontWeight:600, marginBottom:4, display:'block' };

export default function RoutesPage() {
  const { staff, operator, activeGymId, viewGym } = useAuth();
  const role = operator?.role || staff?.role;
  const isSuperAdmin = role === 'super_admin';
  // 值班(operator) 或 管理員/正職 可編輯（後端 routeEditorGate 權威，此處僅同步顯示）
  const canEdit = !!operator || ['super_admin','gym_manager','full_time'].includes(role);
  const effectiveGymId = activeGymId || staff?.gymId || (isSuperAdmin ? (viewGym || 'gym-hsinchu') : '');

  const [routes, setRoutes] = useState([]);
  const [scoring, setScoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null | 'new' | route 物件
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  const load = () => {
    if (!effectiveGymId) return;
    setLoading(true);
    client.get('/climbing-routes', { params: { gymId: effectiveGymId, includeArchived: 1 } })
      .then(r => setRoutes(r.data.routes || []))
      .catch(() => setMsg({ ok:false, text:'路線載入失敗' }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [effectiveGymId]);
  useEffect(() => { client.get('/climbing-routes/scoring-config').then(r => setScoring(r.data)).catch(() => {}); }, []);

  const [items, setItems] = useState([emptyItem()]);     // 批次新增：每條路線（顏色/難度/名稱）
  const [formGym, setFormGym] = useState('');             // 批次新增：館別（super_admin 可選、其他鎖自己館）

  const openNew = () => {
    setForm({ ...emptyForm, setAt: new Date().toISOString().slice(0,10) });
    setItems([emptyItem()]);
    setFormGym(effectiveGymId || 'gym-hsinchu');
    setEditTarget('new');
  };
  const openEdit = (r) => { setForm({ area:r.area||'', color:r.color||'', grade:r.grade||'V0', name:r.name||'', note:r.note||'', setter:r.setter||'', igUrl:r.igUrl||'', setAt:r.setAt||'' }); setEditTarget(r); };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      if (editTarget === 'new') {
        if (!form.area.trim()) { setMsg({ ok:false, text:'牆面/區域為必填' }); setSaving(false); return; }
        const valid = items.filter(it => it.color.trim());
        if (!valid.length) { setMsg({ ok:false, text:'至少填寫一條路線的岩點顏色' }); setSaving(false); return; }
        // 同一支 IG 影片對應多條路線：共用欄位＋routes 陣列一次建立
        await client.post('/climbing-routes', {
          gymId: formGym, area: form.area, setter: form.setter, igUrl: form.igUrl, setAt: form.setAt, note: form.note,
          routes: valid.map(it => ({ color: it.color, grade: it.grade, name: it.name })),
        });
        setMsg({ ok:true, text: `已新增 ${valid.length} 條路線` });
      } else {
        if (!form.area.trim() || !form.color.trim()) { setMsg({ ok:false, text:'牆面/區域與岩點顏色為必填' }); setSaving(false); return; }
        await client.put(`/climbing-routes/${editTarget.id}`, form);
        setMsg({ ok:true, text:'路線已更新' });
      }
      setEditTarget(null); load();
    } catch (e) {
      setMsg({ ok:false, text: e.response?.data?.message || e.response?.data?.details?.[0]?.msg || '儲存失敗' });
    } finally { setSaving(false); }
  };

  const setStatus = async (r, status) => {
    try {
      await client.put(`/climbing-routes/${r.id}`, { status });
      setMsg({ ok:true, text: status === 'archived' ? '路線已下架（完攀成績保留）' : '路線已重新上架' });
      load();
    } catch (e) { setMsg({ ok:false, text: e.response?.data?.message || '操作失敗' }); }
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const doDelete = async () => {
    try {
      await client.delete(`/climbing-routes/${deleteTarget.id}`);
      setMsg({ ok:true, text:'路線已刪除' }); setDeleteTarget(null); load();
    } catch (e) { setMsg({ ok:false, text: e.response?.data?.message || '刪除失敗' }); setDeleteTarget(null); }
  };

  const active = routes.filter(r => r.status !== 'archived');
  const archived = routes.filter(r => r.status === 'archived');
  // 依區域分組
  const byArea = active.reduce((m, r) => { (m[r.area || '未分區'] = m[r.area || '未分區'] || []).push(r); return m; }, {});

  const RouteRow = ({ r, isArchived }) => (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#fff', borderRadius:10, border:'0.5px solid #E8D5D5', opacity: isArchived ? .55 : 1 }}>
      <span style={{ fontSize:12, fontWeight:700, color:'#fff', background: GRADE_COLORS[r.grade]||'#666', padding:'3px 9px', borderRadius:8, minWidth:30, textAlign:'center' }}>{r.grade}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#333' }}>
          {r.color}{r.name ? ` · ${r.name}` : ''}
          {isArchived && <span style={{ fontSize:10, color:'#999', marginLeft:6 }}>已下架</span>}
        </div>
        <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
          {r.setter && `定線 ${r.setter} · `}{r.setAt || ''} · 完攀 {r.ascentCount} 人
          {scoring && ` · 基本分 ${scoring.gradePoints?.[r.grade] ?? '—'}`}
        </div>
        {r.note && <div style={{ fontSize:11, color:'#854F0B', marginTop:2 }}>💬 {r.note}</div>}
      </div>
      {r.igUrl && (
        <a href={r.igUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize:11, fontWeight:600, color:'#B03E96', textDecoration:'none', border:'1px solid #E8C9E0', borderRadius:8, padding:'4px 9px', whiteSpace:'nowrap' }}>
          📹 IG 示範
        </a>
      )}
      {canEdit && (
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => openEdit(r)} style={{ fontSize:11, padding:'4px 9px', borderRadius:8, border:'1px solid #ddd', background:'#fff', cursor:'pointer', color:'#444' }}>編輯</button>
          {isArchived
            ? <button onClick={() => setStatus(r, 'active')} style={{ fontSize:11, padding:'4px 9px', borderRadius:8, border:'1px solid #C9DFC9', background:'#fff', cursor:'pointer', color:'#2D7D46' }}>上架</button>
            : <button onClick={() => setStatus(r, 'archived')} style={{ fontSize:11, padding:'4px 9px', borderRadius:8, border:'1px solid #E8D5A9', background:'#fff', cursor:'pointer', color:'#854F0B' }}>下架</button>}
          <button onClick={() => setDeleteTarget(r)} style={{ fontSize:11, padding:'4px 9px', borderRadius:8, border:'1px solid #EBC9C9', background:'#fff', cursor:'pointer', color:'#A32D2D' }}>刪除</button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding:16, maxWidth:900, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:'#333' }}>🪨 路線管理</div>
          <div style={{ fontSize:12, color:'#999', marginTop:3 }}>{gymLabel(effectiveGymId) || '—'} · 現有路線 {active.length} 條 · 換線後請「下架」保留會員完攀成績</div>
        </div>
        {canEdit && (
          <button onClick={openNew} style={{ background:'#8B1A1A', color:'#fff', border:'none', borderRadius:10, padding:'9px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            ＋ 新增路線
          </button>
        )}
      </div>

      {msg && (
        <div style={{ marginBottom:12, padding:'8px 12px', borderRadius:8, fontSize:12, background: msg.ok ? '#E6F4EB' : '#FCEBEB', color: msg.ok ? '#2D7D46' : '#A32D2D' }}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div style={{ color:'#999', fontSize:13, padding:24, textAlign:'center' }}>載入中...</div>
      ) : active.length === 0 ? (
        <div style={{ color:'#999', fontSize:13, padding:24, textAlign:'center', background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5' }}>
          尚無路線——點右上「＋ 新增路線」建立第一條
        </div>
      ) : (
        Object.entries(byArea).map(([area, list]) => (
          <div key={area} style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#8B1A1A', marginBottom:6 }}>{area}（{list.length}）</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {list.map(r => <RouteRow key={r.id} r={r} />)}
            </div>
          </div>
        ))
      )}

      {archived.length > 0 && (
        <div style={{ marginTop:20 }}>
          <div onClick={() => setShowArchived(v => !v)} style={{ fontSize:12, fontWeight:600, color:'#999', cursor:'pointer', marginBottom:6 }}>
            {showArchived ? '▼' : '▶'} 已下架（{archived.length}）
          </div>
          {showArchived && (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {archived.map(r => <RouteRow key={r.id} r={r} isArchived />)}
            </div>
          )}
        </div>
      )}

      {editTarget === 'new' && (
        <Modal title="新增路線" onClose={() => setEditTarget(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={labelStyle}>館別 *</label>
                {isSuperAdmin ? (
                  <select style={inputStyle} value={formGym} onChange={e => setFormGym(e.target.value)}>
                    {GYM_OPTIONS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                ) : (
                  <div style={{ ...inputStyle, background:'#F5F2F2', color:'#666' }}>{gymLabel(formGym) || '—'}</div>
                )}
              </div>
              <div>
                <label style={labelStyle}>牆面/區域 *</label>
                <input style={inputStyle} value={form.area} onChange={e => setForm(f => ({ ...f, area:e.target.value }))} placeholder="例：B區、斜板牆" />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={labelStyle}>定線員（選填）</label>
                <input style={inputStyle} value={form.setter} onChange={e => setForm(f => ({ ...f, setter:e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>上架日期</label>
                <input type="date" style={inputStyle} value={form.setAt} onChange={e => setForm(f => ({ ...f, setAt:e.target.value }))} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>IG 示範影片連結（選填）</label>
              <input style={inputStyle} value={form.igUrl} onChange={e => setForm(f => ({ ...f, igUrl:e.target.value }))} placeholder="https://www.instagram.com/p/..." />
              <div style={{ fontSize:11, color:'#999', marginTop:4 }}>同一支影片示範多條路線時，下方一次加多條——全部共用這個連結</div>
            </div>
            <div>
              <label style={labelStyle}>備註（選填，會員看得到）</label>
              <textarea style={{ ...inputStyle, minHeight:56, resize:'vertical' }} maxLength={200} value={form.note}
                onChange={e => setForm(f => ({ ...f, note:e.target.value }))} placeholder="例：起攀點在左側標記、限用標示岩點" />
            </div>

            <div style={{ borderTop:'1px solid #F0EDED', paddingTop:10 }}>
              <label style={labelStyle}>路線清單（{items.length} 條）</label>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {items.map((it, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 28px', gap:6, alignItems:'center' }}>
                    <input style={inputStyle} value={it.color} placeholder="顏色 *"
                      onChange={e => setItems(arr => arr.map((x, j) => j === i ? { ...x, color:e.target.value } : x))} />
                    <select style={inputStyle} value={it.grade}
                      onChange={e => setItems(arr => arr.map((x, j) => j === i ? { ...x, grade:e.target.value } : x))}>
                      {GRADES.map(g => <option key={g} value={g}>{g}{scoring ? `・${scoring.gradePoints?.[g] ?? ''}分` : ''}</option>)}
                    </select>
                    <input style={inputStyle} value={it.name} placeholder="名稱（選填）"
                      onChange={e => setItems(arr => arr.map((x, j) => j === i ? { ...x, name:e.target.value } : x))} />
                    <button onClick={() => setItems(arr => arr.length > 1 ? arr.filter((_, j) => j !== i) : arr)}
                      style={{ background:'none', border:'none', color: items.length > 1 ? '#A32D2D' : '#ddd', fontSize:16, cursor: items.length > 1 ? 'pointer' : 'default', padding:0 }}>✕</button>
                  </div>
                ))}
              </div>
              <button onClick={() => setItems(arr => arr.length < 20 ? [...arr, emptyItem()] : arr)}
                style={{ marginTop:8, fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px dashed #C9A0A0', background:'#fff', color:'#8B1A1A', cursor:'pointer' }}>
                ＋ 再加一條（同一支影片）
              </button>
            </div>

            <button onClick={save} disabled={saving}
              style={{ background: saving ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', borderRadius:10, padding:'11px 0', fontSize:14, fontWeight:600, cursor: saving ? 'default' : 'pointer', marginTop:4 }}>
              {saving ? '儲存中...' : `新增 ${items.filter(it => it.color.trim()).length || ''} 條路線`}
            </button>
          </div>
        </Modal>
      )}

      {editTarget && editTarget !== 'new' && (
        <Modal title="編輯路線" onClose={() => setEditTarget(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:11, color:'#999' }}>館別：{gymLabel(editTarget.gymId) || '—'}（不可變更，建錯館請刪除重建）</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={labelStyle}>牆面/區域 *</label>
                <input style={inputStyle} value={form.area} onChange={e => setForm(f => ({ ...f, area:e.target.value }))} placeholder="例：B區、斜板牆" />
              </div>
              <div>
                <label style={labelStyle}>岩點顏色 *</label>
                <input style={inputStyle} value={form.color} onChange={e => setForm(f => ({ ...f, color:e.target.value }))} placeholder="例：紅、螢光綠" />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={labelStyle}>難度 *</label>
                <select style={inputStyle} value={form.grade} onChange={e => setForm(f => ({ ...f, grade:e.target.value }))}>
                  {GRADES.map(g => <option key={g} value={g}>{g}{scoring ? `（基本分 ${scoring.gradePoints?.[g] ?? ''}）` : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>上架日期</label>
                <input type="date" style={inputStyle} value={form.setAt} onChange={e => setForm(f => ({ ...f, setAt:e.target.value }))} />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={labelStyle}>路線名稱（選填）</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>定線員（選填）</label>
                <input style={inputStyle} value={form.setter} onChange={e => setForm(f => ({ ...f, setter:e.target.value }))} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>IG 示範影片連結（選填）</label>
              <input style={inputStyle} value={form.igUrl} onChange={e => setForm(f => ({ ...f, igUrl:e.target.value }))} placeholder="https://www.instagram.com/p/..." />
            </div>
            <div>
              <label style={labelStyle}>備註（選填，會員看得到）</label>
              <textarea style={{ ...inputStyle, minHeight:56, resize:'vertical' }} maxLength={200} value={form.note}
                onChange={e => setForm(f => ({ ...f, note:e.target.value }))} placeholder="例：起攀點在左側標記、限用標示岩點" />
            </div>
            <button onClick={save} disabled={saving}
              style={{ background: saving ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', borderRadius:10, padding:'11px 0', fontSize:14, fontWeight:600, cursor: saving ? 'default' : 'pointer', marginTop:4 }}>
              {saving ? '儲存中...' : '儲存變更'}
            </button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="刪除路線" onClose={() => setDeleteTarget(null)}>
          <div style={{ fontSize:13, color:'#444', lineHeight:1.7, textAlign:'left' }}>
            確定要永久刪除「{deleteTarget.area} {deleteTarget.color} {deleteTarget.grade}」？<br/>
            已有會員完攀記錄的路線無法刪除（請改用「下架」保留成績）。
          </div>
          <div style={{ display:'flex', gap:10, marginTop:18 }}>
            <button onClick={() => setDeleteTarget(null)} style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid #ddd', background:'#fff', fontSize:13, cursor:'pointer', color:'#666' }}>取消</button>
            <button onClick={doDelete} style={{ flex:1, padding:'10px 0', borderRadius:10, border:'none', background:'#A32D2D', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>確定刪除</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
