import { useState, useEffect } from 'react';
import { getVipList, addVip, updateVip, removeVip } from '../../api/vip';
import { getTeamFeeSettings, updateTeamFeeSettings, getTeamMembers, createTeamMember, updateTeamApplication, deleteTeamApplication, downloadTeamFile } from '../../api/team';
import { searchMembers } from '../../api/members';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';

const feeLabel = { fontSize:12, color:'#666', display:'block', marginBottom:5 };
const feeInput = { width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };

export default function VipPage({ embedded = false }) {
  const { staff } = useAuth();
  const isSuperAdmin = staff?.role === 'super_admin';

  const [tab, setTab] = useState('vip'); // vip | team

  const [vips, setVips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // 攀岩隊員申請名單（會員端「加入攀岩隊」自動彙整 + 管理員手動）
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamYear, setTeamYear] = useState(dayjs().year());
  const [teamFilter, setTeamFilter] = useState('');
  const [teamError, setTeamError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  // 手動新增
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [teamSearchResults, setTeamSearchResults] = useState([]);
  const [selectedTeamMember, setSelectedTeamMember] = useState(null);
  const [addForm, setAddForm] = useState({ paymentAmount:'', jerseySize:'', noJersey:false });
  const [teamSaving, setTeamSaving] = useState(false);
  // 編輯
  const [editingApp, setEditingApp] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  // 攀岩隊費設定
  const [teamFees, setTeamFees] = useState({ fullYearFee:3000, midYearFee:2000, lateYearFee:1000, midYearCutoff:'03-15', lateYearCutoff:'09-15', jerseyDiscount:300 });
  const [teamFeesSaving, setTeamFeesSaving] = useState(false);

  useEffect(() => { loadTeamFees(); }, []);
  useEffect(() => { loadTeamMembers(); }, [teamYear]);

  const loadTeamFees = async () => {
    try {
      const res = await getTeamFeeSettings();
      if (res.data) setTeamFees(res.data);
    } catch (e) {}
  };

  const handleSaveTeamFees = async () => {
    setTeamFeesSaving(true);
    try { await updateTeamFeeSettings(teamFees); alert('已儲存'); }
    catch { alert('儲存失敗'); }
    finally { setTeamFeesSaving(false); }
  };

  const loadTeamMembers = async () => {
    setTeamLoading(true);
    setTeamError(null);
    try {
      const res = await getTeamMembers(teamYear);
      setTeamMembers(res.data.members || []);
    } catch (e) {
      setTeamError(e.response?.data?.message || '載入失敗');
      setTeamMembers([]);
    } finally {
      setTeamLoading(false);
    }
  };


  const handleTeamSearch = async (q) => {
    setTeamSearchQuery(q);
    if (q.length < 2) { setTeamSearchResults([]); return; }
    try {
      const res = await searchMembers(q);
      setTeamSearchResults(res.data.members || []);
    } catch (e) {}
  };

  const openAddTeam = () => {
    setSelectedTeamMember(null); setTeamSearchQuery(''); setTeamSearchResults([]);
    setAddForm({ paymentAmount:'', jerseySize:'', noJersey:false });
    setTeamError(null); setShowAddTeam(true);
  };

  const handleAddTeamMember = async () => {
    if (!selectedTeamMember) { setTeamError('請先選擇會員'); return; }
    setTeamSaving(true); setTeamError(null);
    try {
      await createTeamMember({ memberId: selectedTeamMember.id, year: teamYear, ...addForm });
      setShowAddTeam(false);
      await loadTeamMembers();
    } catch (e) {
      setTeamError(e.response?.data?.message || '新增失敗');
    } finally { setTeamSaving(false); }
  };

  const openEdit = (app) => {
    setEditingApp(app);
    setEditForm({
      memberName: app.memberName || '', memberPhone: app.memberPhone || '', primaryGym: app.primaryGym || '',
      paymentAmount: app.paymentAmount ?? '', paymentDate: app.paymentDate || '', bankLastFive: app.bankLastFive || '',
      jerseySize: app.jerseySize || '', noJersey: !!app.noJersey,
      paymentStatus: app.paymentStatus || 'pending', status: app.status || 'pending',
    });
  };

  const handleSaveEdit = async () => {
    setEditSaving(true);
    try {
      await updateTeamApplication(editingApp.id, editForm);
      setEditingApp(null);
      await loadTeamMembers();
    } catch (e) {
      alert(e.response?.data?.message || '更新失敗');
    } finally { setEditSaving(false); }
  };

  const handleDeleteTeam = async (app) => {
    if (!window.confirm(`確定刪除 ${app.memberName} 的隊員資料？將同時撤銷其九折資格。`)) return;
    try {
      await deleteTeamApplication(app.id);
      await loadTeamMembers();
    } catch (e) {
      alert(e.response?.data?.message || '刪除失敗');
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await downloadTeamFile(teamYear);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `攀岩隊員_${teamYear}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('下載失敗');
    } finally { setDownloading(false); }
  };

  useEffect(() => { loadVips(); }, []);

  const loadVips = async () => {
    setLoading(true);
    try {
      const res = await getVipList();
      setVips(res.data.vips || []);
    } catch (e) {
      setError(null); setVips([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await searchMembers(q);
      setSearchResults(res.data.members || []);
    } catch (e) {}
  };

  const handleAdd = async () => {
    if (!selectedMember) return;
    setSaving(true);
    setError(null);
    try {
      await addVip(selectedMember.id, note);
      setShowAdd(false);
      setSelectedMember(null);
      setSearchQuery('');
      setSearchResults([]);
      setNote('');
      await loadVips();
    } catch (err) {
      setError(err.response?.data?.message || '新增失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateNote = async (id) => {
    try {
      await updateVip(id, editNote);
      setEditingId(null);
      await loadVips();
    } catch (e) {
      alert('更新失敗');
    }
  };

  const handleRemove = async (id, name) => {
    if (!window.confirm(`確定要移除 ${name} 的 VIP 身份？`)) return;
    try {
      await removeVip(id);
      await loadVips();
    } catch (e) {
      alert('移除失敗');
    }
  };

  return (
    <div style={{ padding: embedded ? 0 : 24, maxWidth:800, margin:'0 auto' }}>
      {/* Tab 切換 */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        <button onClick={() => setTab('vip')}
          style={{ height:36, padding:'0 16px', borderRadius:8, border: tab==='vip' ? 'none' : '0.5px solid #E8D5D5', background: tab==='vip' ? '#8B1A1A' : '#fff', color: tab==='vip' ? '#fff' : '#666', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          VIP 名單
        </button>
        <button onClick={() => setTab('team')}
          style={{ height:36, padding:'0 16px', borderRadius:8, border: tab==='team' ? 'none' : '0.5px solid #E8D5D5', background: tab==='team' ? '#8B1A1A' : '#fff', color: tab==='team' ? '#fff' : '#666', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          🏔️ 攀岩隊員
        </button>
      </div>

      {tab === 'vip' && (
      <>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:600, color:'#1a1a1a' }}>VIP 名單管理</div>
          <div style={{ fontSize:13, color:'#999', marginTop:3 }}>永久免費入場會員</div>
        </div>
        {isSuperAdmin && (
          <button onClick={() => setShowAdd(true)}
            style={{ height:40, padding:'0 20px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            + 新增 VIP
          </button>
        )}
      </div>

      {error && (
        <div style={{ background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#A32D2D' }}>
          {error}
        </div>
      )}

      {/* 新增 VIP 面板 */}
      {showAdd && (
        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:20, marginBottom:16 }}>
          <div style={{ fontWeight:600, fontSize:14, marginBottom:14 }}>新增 VIP 會員</div>

          {/* 搜尋會員 */}
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>搜尋會員（姓名或手機）</label>
            <input value={searchQuery} onChange={e => handleSearch(e.target.value)}
              placeholder="輸入姓名或手機號碼..."
              style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
            {searchResults.length > 0 && !selectedMember && (
              <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, background:'#fff', marginTop:4, overflow:'hidden' }}>
                {searchResults.slice(0, 5).map(m => (
                  <div key={m.id} onClick={() => { setSelectedMember(m); setSearchQuery(m.name); setSearchResults([]); }}
                    style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'0.5px solid #F5EFEF', fontSize:13, display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontWeight:500 }}>{m.name}</span>
                    <span style={{ color:'#999' }}>{m.phone}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedMember && (
            <div style={{ background:'#E6F4EB', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>已選擇：<strong>{selectedMember.name}</strong>（{selectedMember.phone}）</span>
              <span onClick={() => { setSelectedMember(null); setSearchQuery(''); }} style={{ cursor:'pointer', color:'#999', fontSize:16 }}>×</span>
            </div>
          )}

          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>備註（選填）</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="如：創辦人、贊助商..."
              style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { setShowAdd(false); setSelectedMember(null); setSearchQuery(''); setNote(''); }}
              style={{ flex:1, height:40, borderRadius:8, background:'#f5f5f5', border:'none', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleAdd} disabled={!selectedMember || saving}
              style={{ flex:2, height:40, borderRadius:8, background: selectedMember ? '#8B1A1A' : '#ccc', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: selectedMember ? 'pointer' : 'not-allowed' }}>
              {saving ? '新增中...' : '確認新增'}
            </button>
          </div>
        </div>
      )}

      {/* VIP 列表 */}
      <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'0.5px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:600, fontSize:13 }}>VIP 名單</span>
          <span style={{ fontSize:12, color:'#999' }}>共 {vips.length} 人</span>
        </div>

        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#999', fontSize:13 }}>載入中...</div>
        ) : vips.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#999', fontSize:13 }}>目前無 VIP 會員</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#FBF5F5' }}>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>會員</th>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>備註</th>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>新增日期</th>
                {isSuperAdmin && <th style={{ padding:'10px 16px', textAlign:'center', fontWeight:500, color:'#999', fontSize:11 }}>操作</th>}
              </tr>
            </thead>
            <tbody>
              {vips.map(v => (
                <tr key={v.id} style={{ borderTop:'0.5px solid #F5EFEF' }}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontWeight:600 }}>{v.memberName}</div>
                    <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{v.memberId}</div>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    {editingId === v.id ? (
                      <div style={{ display:'flex', gap:6 }}>
                        <input value={editNote} onChange={e => setEditNote(e.target.value)}
                          style={{ flex:1, height:32, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:13, outline:'none' }} />
                        <button onClick={() => handleUpdateNote(v.id)}
                          style={{ height:32, padding:'0 10px', borderRadius:6, background:'#2D7D46', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>儲存</button>
                        <button onClick={() => setEditingId(null)}
                          style={{ height:32, padding:'0 10px', borderRadius:6, background:'#f5f5f5', border:'none', fontSize:12, cursor:'pointer' }}>取消</button>
                      </div>
                    ) : (
                      <span style={{ color: v.note ? '#1a1a1a' : '#ccc' }}>{v.note || '—'}</span>
                    )}
                  </td>
                  <td style={{ padding:'12px 16px', color:'#999', fontSize:12 }}>
                    {v.createdAt?._seconds ? new Date(v.createdAt._seconds * 1000).toLocaleDateString('zh-TW') : '—'}
                  </td>
                  {isSuperAdmin && (
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>
                      <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                        <button onClick={() => { setEditingId(v.id); setEditNote(v.note || ''); }}
                          style={{ height:30, padding:'0 10px', borderRadius:6, background:'#f5f5f5', border:'0.5px solid #ddd', fontSize:12, cursor:'pointer' }}>備註</button>
                        <button onClick={() => handleRemove(v.id, v.memberName)}
                          style={{ height:30, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:12, cursor:'pointer' }}>移除</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}

      {tab === 'team' && (
      <>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, gap:12, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:20, fontWeight:600, color:'#1a1a1a' }}>攀岩隊員管理</div>
          <div style={{ fontSize:13, color:'#999', marginTop:3 }}>會員「加入攀岩隊」後自動彙整於此，確認收款即為正式隊員</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <select value={teamYear} onChange={e => setTeamYear(Number(e.target.value))}
            style={{ height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#fff', color:'#1a1a1a', cursor:'pointer' }}>
            {Array.from({ length: 4 }, (_, i) => dayjs().year() - i).map(y => (
              <option key={y} value={y}>{y} 年度</option>
            ))}
          </select>
          <button onClick={handleDownload} disabled={downloading}
            style={{ height:40, padding:'0 14px', borderRadius:8, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:13, cursor: downloading ? 'not-allowed' : 'pointer' }}>
            {downloading ? '下載中...' : '⬇ 下載 Excel'}
          </button>
          <button onClick={openAddTeam}
            style={{ height:40, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            + 新增隊員
          </button>
        </div>
      </div>

      {teamError && (
        <div style={{ background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#A32D2D' }}>
          {teamError}
        </div>
      )}

      {/* 攀岩隊年費設定 */}
      <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:20, marginBottom:16 }}>
        <div style={{ fontWeight:600, fontSize:14, marginBottom:14 }}>⚡ 攀岩隊年費設定</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          {[
            { label:`全年隊費（${teamFees.midYearCutoff?.replace('-','/')} 前加入）`, key:'fullYearFee' },
            { label:`中途加入（${teamFees.midYearCutoff?.replace('-','/')}～${teamFees.lateYearCutoff?.replace('-','/')}）`, key:'midYearFee' },
            { label:`晚加入（${teamFees.lateYearCutoff?.replace('-','/')} 後）`, key:'lateYearFee' },
            { label:'舊隊員不拿隊服減免金額', key:'jerseyDiscount' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label style={feeLabel}>{label}（NT$）</label>
              <input type="number" style={feeInput} value={teamFees[key] ?? ''} onChange={e => setTeamFees(f => ({ ...f, [key]: Number(e.target.value) }))}/>
            </div>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          {[
            { label:'中途加入截止日（MM-DD）', key:'midYearCutoff' },
            { label:'晚加入截止日（MM-DD）', key:'lateYearCutoff' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label style={feeLabel}>{label}</label>
              <input type="text" style={feeInput} placeholder="03-15" value={teamFees[key] ?? ''} onChange={e => setTeamFees(f => ({ ...f, [key]: e.target.value }))}/>
            </div>
          ))}
        </div>
        <div style={{ background:'#FBF5F5', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#666' }}>
          目前費率：全年 NT${teamFees.fullYearFee} ／ {teamFees.midYearCutoff}後 NT${teamFees.midYearFee} ／ {teamFees.lateYearCutoff}後 NT${teamFees.lateYearFee}；不拿隊服減 NT${teamFees.jerseyDiscount}
        </div>
        {isSuperAdmin && (
          <button disabled={teamFeesSaving} onClick={handleSaveTeamFees}
            style={{ height:38, padding:'0 20px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: teamFeesSaving ? 'not-allowed' : 'pointer' }}>
            {teamFeesSaving ? '儲存中...' : '儲存設定'}
          </button>
        )}
      </div>

      {/* 名單 */}
      <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'0.5px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontWeight:600, fontSize:13 }}>{teamYear} 年度名單（共 {teamMembers.length} 人）</span>
          <input value={teamFilter} onChange={e => setTeamFilter(e.target.value)} placeholder="搜尋姓名或手機..."
            style={{ flex:1, minWidth:160, maxWidth:280, height:32, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:12, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
        </div>

        {teamLoading ? (
          <div style={{ padding:40, textAlign:'center', color:'#999', fontSize:13 }}>載入中...</div>
        ) : (() => {
          const q = teamFilter.trim();
          const ft = teamMembers.filter(a => !q || (a.memberName||'').includes(q) || (a.memberPhone||'').includes(q));
          if (ft.length === 0) return <div style={{ padding:40, textAlign:'center', color:'#999', fontSize:13 }}>{q ? '無符合搜尋的隊員' : '本年度尚無名單'}</div>;
          return (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#FBF5F5' }}>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>會員</th>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>繳費</th>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>隊服</th>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>狀態</th>
                <th style={{ padding:'10px 16px', textAlign:'center', fontWeight:500, color:'#999', fontSize:11 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {ft.map(a => {
                const paid = a.paymentStatus === 'confirmed';
                const stTag = a.status === 'active'
                  ? { bg:'#E6F4EB', color:'#2D7D46', t:'正式隊員' }
                  : a.status === 'cancelled'
                  ? { bg:'#FCEBEB', color:'#A32D2D', t:'已退隊' }
                  : { bg:'#FAEEDA', color:'#854F0B', t:'待審核' };
                return (
                  <tr key={a.id} style={{ borderTop:'0.5px solid #F5EFEF' }}>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ fontWeight:600 }}>{a.memberName || '—'}</div>
                      <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{a.memberPhone}{a.primaryGym ? ` · ${a.primaryGym}` : ''}</div>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12 }}>
                      <div>應繳 NT${a.expectedFee ?? '—'}{a.paymentAmount ? `／實繳 NT$${a.paymentAmount}` : ''}</div>
                      <div style={{ color:'#999', marginTop:2 }}>{a.paymentDate || '—'}{a.bankLastFive ? ` · 末五碼 ${a.bankLastFive}` : ''}</div>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12 }}>
                      {a.noJersey ? <span style={{ color:'#999' }}>不拿隊服</span> : (a.jerseySize || '—')}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-start' }}>
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background: paid ? '#E6F4EB' : '#FAEEDA', color: paid ? '#2D7D46' : '#854F0B' }}>
                          {paid ? '已收款' : '待確認付款'}
                        </span>
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background: stTag.bg, color: stTag.color }}>{stTag.t}</span>
                      </div>
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>
                      <div style={{ display:'flex', gap:6, justifyContent:'center', flexWrap:'wrap', alignItems:'center' }}>
                        {a.status !== 'cancelled' && !paid && (
                          <span style={{ fontSize:11, color:'#854F0B' }}>待收款（待辦總覽）</span>
                        )}
                        <button onClick={() => openEdit(a)}
                          style={{ height:30, padding:'0 10px', borderRadius:6, background:'#f5f5f5', border:'0.5px solid #ddd', fontSize:12, cursor:'pointer' }}>編輯</button>
                        <button onClick={() => handleDeleteTeam(a)}
                          style={{ height:30, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:12, cursor:'pointer' }}>刪除</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          );
        })()}
      </div>

      {/* 手動新增隊員 Modal */}
      {showAddTeam && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:440, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>手動新增隊員 — {teamYear} 年度</div>
            {teamError && <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#A32D2D', marginBottom:12 }}>{teamError}</div>}
            <div style={{ marginBottom:12 }}>
              <label style={feeLabel}>搜尋會員（姓名或手機）</label>
              <input value={teamSearchQuery} onChange={e => handleTeamSearch(e.target.value)} placeholder="輸入姓名或手機號碼..." style={feeInput} />
              {teamSearchResults.length > 0 && !selectedTeamMember && (
                <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, background:'#fff', marginTop:4, overflow:'hidden' }}>
                  {teamSearchResults.slice(0,5).map(m => (
                    <div key={m.id} onClick={() => { setSelectedTeamMember(m); setTeamSearchQuery(m.name); setTeamSearchResults([]); }}
                      style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'0.5px solid #F5EFEF', fontSize:13, display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontWeight:500 }}>{m.name}</span><span style={{ color:'#999' }}>{m.phone}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedTeamMember && (
              <div style={{ background:'#E6F4EB', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>已選擇：<strong>{selectedTeamMember.name}</strong>（{selectedTeamMember.phone}）</span>
                <span onClick={() => { setSelectedTeamMember(null); setTeamSearchQuery(''); }} style={{ cursor:'pointer', color:'#999', fontSize:16 }}>×</span>
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <div>
                <label style={feeLabel}>隊費金額（NT$）</label>
                <input type="number" style={feeInput} value={addForm.paymentAmount} onChange={e => setAddForm(f => ({...f, paymentAmount: e.target.value}))} />
              </div>
              <div>
                <label style={feeLabel}>隊服尺寸</label>
                <input type="text" style={feeInput} placeholder="如 M / L" value={addForm.jerseySize} onChange={e => setAddForm(f => ({...f, jerseySize: e.target.value}))} disabled={addForm.noJersey} />
              </div>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'#666', marginBottom:16, cursor:'pointer' }}>
              <input type="checkbox" checked={addForm.noJersey} onChange={e => setAddForm(f => ({...f, noJersey: e.target.checked}))} /> 不拿隊服
            </label>
            <div style={{ background:'#FBF5F5', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#854F0B', marginBottom:16 }}>新增後即為正式隊員並開通九折資格。</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowAddTeam(false)} style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:13, cursor:'pointer' }}>取消</button>
              <button onClick={handleAddTeamMember} disabled={!selectedTeamMember || teamSaving}
                style={{ flex:2, height:40, borderRadius:8, background: selectedTeamMember ? '#8B1A1A' : '#ccc', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: selectedTeamMember && !teamSaving ? 'pointer' : 'not-allowed' }}>
                {teamSaving ? '新增中...' : '確認新增'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯隊員 Modal */}
      {editingApp && editForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'100%', maxWidth:460, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontWeight:600, fontSize:16, marginBottom:20 }}>編輯隊員 — {editingApp.memberName}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div><label style={feeLabel}>姓名</label><input style={feeInput} value={editForm.memberName} onChange={e=>setEditForm(f=>({...f, memberName:e.target.value}))} /></div>
              <div><label style={feeLabel}>手機</label><input style={feeInput} value={editForm.memberPhone} onChange={e=>setEditForm(f=>({...f, memberPhone:e.target.value}))} /></div>
              <div><label style={feeLabel}>主要岩館</label><input style={feeInput} value={editForm.primaryGym} onChange={e=>setEditForm(f=>({...f, primaryGym:e.target.value}))} /></div>
              <div><label style={feeLabel}>繳費金額（NT$）</label><input type="number" style={feeInput} value={editForm.paymentAmount} onChange={e=>setEditForm(f=>({...f, paymentAmount:e.target.value}))} /></div>
              <div><label style={feeLabel}>匯款日期</label><input style={feeInput} value={editForm.paymentDate} onChange={e=>setEditForm(f=>({...f, paymentDate:e.target.value}))} placeholder="YYYY-MM-DD" /></div>
              <div><label style={feeLabel}>匯款末五碼</label><input style={feeInput} value={editForm.bankLastFive} onChange={e=>setEditForm(f=>({...f, bankLastFive:e.target.value}))} /></div>
              <div><label style={feeLabel}>隊服尺寸</label><input style={feeInput} value={editForm.jerseySize} onChange={e=>setEditForm(f=>({...f, jerseySize:e.target.value}))} disabled={editForm.noJersey} /></div>
              <div style={{ display:'flex', alignItems:'flex-end' }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'#666', height:40, cursor:'pointer' }}>
                  <input type="checkbox" checked={editForm.noJersey} onChange={e=>setEditForm(f=>({...f, noJersey:e.target.checked}))} /> 不拿隊服
                </label>
              </div>
              <div><label style={feeLabel}>付款狀態</label>
                <select style={feeInput} value={editForm.paymentStatus} onChange={e=>setEditForm(f=>({...f, paymentStatus:e.target.value}))}>
                  <option value="pending">待確認</option><option value="confirmed">已確認</option>
                </select>
              </div>
              <div><label style={feeLabel}>隊員狀態</label>
                <select style={feeInput} value={editForm.status} onChange={e=>setEditForm(f=>({...f, status:e.target.value}))}>
                  <option value="pending">待審核</option><option value="active">正式隊員</option><option value="cancelled">已退隊</option>
                </select>
              </div>
            </div>
            <div style={{ background:'#FBF5F5', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#854F0B', margin:'14px 0' }}>狀態設為「正式隊員」會開通九折；設「已退隊」會撤銷。</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setEditingApp(null)} style={{ flex:1, height:40, borderRadius:8, border:'0.5px solid #E8D5D5', background:'none', color:'#333', fontSize:13, cursor:'pointer' }}>取消</button>
              <button onClick={handleSaveEdit} disabled={editSaving} style={{ flex:2, height:40, borderRadius:8, background: editSaving?'#ccc':'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: editSaving?'not-allowed':'pointer' }}>{editSaving ? '儲存中...' : '儲存變更'}</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
