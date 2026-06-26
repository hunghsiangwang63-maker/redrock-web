import { useState, useEffect } from 'react';
import { getVipList, addVip, updateVip, removeVip } from '../../api/vip';
import { getTeamMembers, setTeamMember, removeTeamMember } from '../../api/teamMembers';
import { searchMembers } from '../../api/members';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';

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

  // 攀岩隊員管理
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [teamSearchResults, setTeamSearchResults] = useState([]);
  const [selectedTeamMember, setSelectedTeamMember] = useState(null);
  const [teamSince, setTeamSince] = useState(dayjs().format('YYYY-MM-DD'));
  const [teamUntil, setTeamUntil] = useState(dayjs().add(1, 'year').format('YYYY-MM-DD'));
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamError, setTeamError] = useState(null);

  useEffect(() => { loadTeamMembers(); }, []);

  const loadTeamMembers = async () => {
    setTeamLoading(true);
    try {
      const res = await getTeamMembers();
      setTeamMembers(res.data.members || []);
    } catch (e) {
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

  const handleAddTeamMember = async () => {
    if (!selectedTeamMember) return;
    setTeamSaving(true);
    setTeamError(null);
    try {
      await setTeamMember(selectedTeamMember.id, teamSince, teamUntil);
      setShowAddTeam(false);
      setSelectedTeamMember(null);
      setTeamSearchQuery('');
      setTeamSearchResults([]);
      setTeamSince(dayjs().format('YYYY-MM-DD'));
      setTeamUntil(dayjs().add(1, 'year').format('YYYY-MM-DD'));
      await loadTeamMembers();
    } catch (err) {
      setTeamError(err.response?.data?.message || '設定失敗');
    } finally {
      setTeamSaving(false);
    }
  };

  const handleRemoveTeamMember = async (memberId, name) => {
    if (!window.confirm(`確定要移除 ${name} 的攀岩隊員身份？`)) return;
    try {
      await removeTeamMember(memberId);
      await loadTeamMembers();
    } catch (e) {
      alert('移除失敗');
    }
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
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:600, color:'#1a1a1a' }}>攀岩隊員管理</div>
          <div style={{ fontSize:13, color:'#999', marginTop:3 }}>年度隊員身份，消費滿NT$100享九折優惠</div>
        </div>
        {isSuperAdmin && (
          <button onClick={() => setShowAddTeam(true)}
            style={{ height:40, padding:'0 20px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            + 新增隊員
          </button>
        )}
      </div>

      {teamError && (
        <div style={{ background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#A32D2D' }}>
          {teamError}
        </div>
      )}

      {/* 新增隊員面板 */}
      {showAddTeam && (
        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:20, marginBottom:16 }}>
          <div style={{ fontWeight:600, fontSize:14, marginBottom:14 }}>新增攀岩隊員</div>

          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>搜尋會員（姓名或手機）</label>
            <input value={teamSearchQuery} onChange={e => handleTeamSearch(e.target.value)}
              placeholder="輸入姓名或手機號碼..."
              style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
            {teamSearchResults.length > 0 && !selectedTeamMember && (
              <div style={{ border:'0.5px solid #E8D5D5', borderRadius:8, background:'#fff', marginTop:4, overflow:'hidden' }}>
                {teamSearchResults.slice(0, 5).map(m => (
                  <div key={m.id} onClick={() => { setSelectedTeamMember(m); setTeamSearchQuery(m.name); setTeamSearchResults([]); }}
                    style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'0.5px solid #F5EFEF', fontSize:13, display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontWeight:500 }}>{m.name}</span>
                    <span style={{ color:'#999' }}>{m.phone}</span>
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

          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>起始日期</label>
              <input type="date" value={teamSince} onChange={e => setTeamSince(e.target.value)}
                style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>到期日期</label>
              <input type="date" value={teamUntil} onChange={e => setTeamUntil(e.target.value)}
                style={{ width:'100%', height:40, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }} />
            </div>
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { setShowAddTeam(false); setSelectedTeamMember(null); setTeamSearchQuery(''); setTeamError(null); }}
              style={{ flex:1, height:40, borderRadius:8, background:'#f5f5f5', border:'none', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleAddTeamMember} disabled={!selectedTeamMember || teamSaving}
              style={{ flex:2, height:40, borderRadius:8, background: selectedTeamMember ? '#8B1A1A' : '#ccc', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: selectedTeamMember ? 'pointer' : 'not-allowed' }}>
              {teamSaving ? '設定中...' : '確認設定'}
            </button>
          </div>
        </div>
      )}

      {/* 隊員列表 */}
      <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'0.5px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:600, fontSize:13 }}>隊員名單</span>
          <span style={{ fontSize:12, color:'#999' }}>共 {teamMembers.length} 人</span>
        </div>

        {teamLoading ? (
          <div style={{ padding:40, textAlign:'center', color:'#999', fontSize:13 }}>載入中...</div>
        ) : teamMembers.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#999', fontSize:13 }}>目前無攀岩隊員</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#FBF5F5' }}>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>會員</th>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>有效期間</th>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>狀態</th>
                {isSuperAdmin && <th style={{ padding:'10px 16px', textAlign:'center', fontWeight:500, color:'#999', fontSize:11 }}>操作</th>}
              </tr>
            </thead>
            <tbody>
              {teamMembers.map(m => {
                const daysLeft = dayjs(m.teamMemberUntil).diff(dayjs(), 'day');
                const expiringSoon = daysLeft <= 30;
                return (
                  <tr key={m.id} style={{ borderTop:'0.5px solid #F5EFEF' }}>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ fontWeight:600 }}>{m.name}</div>
                      <div style={{ fontSize:11, color:'#999', marginTop:2 }}>{m.phone}</div>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12 }}>
                      {m.teamMemberSince} ~ {m.teamMemberUntil}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background: expiringSoon ? '#FAEEDA' : '#E6F4EB', color: expiringSoon ? '#854F0B' : '#2D7D46' }}>
                        {expiringSoon ? `剩 ${daysLeft} 天` : '有效中'}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td style={{ padding:'12px 16px', textAlign:'center' }}>
                        <button onClick={() => handleRemoveTeamMember(m.id, m.name)}
                          style={{ height:30, padding:'0 10px', borderRadius:6, background:'#fff', border:'0.5px solid #A32D2D', color:'#A32D2D', fontSize:12, cursor:'pointer' }}>移除</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}
    </div>
  );
}
