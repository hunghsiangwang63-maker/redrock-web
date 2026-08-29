import { useState, useEffect } from 'react';
import MemberLogoutButton from '../../components/MemberLogoutButton';
import { useNavigate } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { memberClient } from '../../api/client';

// 會員端「路線攻略」（2026-08-29 新增）：
// 路線清單（IG 示範影片）＋完攀記錄（入場當日限定、七級嘗試層級計分）＋全館排名。
// 分數/資格皆後端權威（/climbing-routes），此處僅顯示與友善提示。

const GYMS = [ { id:'gym-hsinchu', label:'新竹館' }, { id:'gym-shilin', label:'士林館' } ];
const GRADE_COLORS = {
  V0:'#5CA85C', V1:'#4E9E7E', V2:'#3E8FA8', V3:'#3D6FB5', V4:'#5B54B8',
  V5:'#8B48B0', V6:'#B03E96', V7:'#C13A5E', V8:'#C1462A', V9:'#8A3A1E', V10:'#3A3A3A',
};

export default function MemberRoutesPage() {
  const { member } = useMember();
  const navigate = useNavigate();
  const [tab, setTab] = useState('routes'); // routes | rankings
  const [gymId, setGymId] = useState(() => localStorage.getItem('memberRouteGym') || 'gym-hsinchu');
  const [data, setData] = useState(null);       // GET /climbing-routes/member 回應
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);
  const [recordTarget, setRecordTarget] = useState(null); // 開啟記錄 modal 的路線
  const [pickedTier, setPickedTier] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalMsg, setModalMsg] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 排名
  const [period, setPeriod] = useState('month'); // month | all
  const [rankGym, setRankGym] = useState('');    // ''=全部合併 | gym id（排名分館/合併檢視）
  const [ranking, setRanking] = useState(null);
  const [rankLoading, setRankLoading] = useState(false);
  const [prefOpen, setPrefOpen] = useState(false);   // 排名設定 modal
  const [pref, setPref] = useState({ optOut:false, nickname:'' });
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefMsg, setPrefMsg] = useState(null);
  const [shareToast, setShareToast] = useState('');

  const changeGym = (g) => { setGymId(g); localStorage.setItem('memberRouteGym', g); };

  const load = () => {
    setLoading(true); setLoadErr(false);
    memberClient.get('/climbing-routes/member', { params: { gymId } })
      .then(r => setData(r.data))
      .catch(() => setLoadErr(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, [gymId]);

  useEffect(() => {
    if (tab !== 'rankings') return;
    setRankLoading(true);
    memberClient.get('/climbing-routes/rankings', { params: { ...(rankGym ? { gymId: rankGym } : {}), period } })
      .then(r => setRanking(r.data))
      .catch(() => setRanking(null))
      .finally(() => setRankLoading(false));
  }, [tab, rankGym, period]);

  const openPref = () => {
    setPrefMsg(null);
    memberClient.get('/climbing-routes/ranking-settings')
      .then(r => setPref({ optOut: !!r.data.optOut, nickname: r.data.nickname || '' }))
      .catch(() => {});
    setPrefOpen(true);
  };
  const savePref = async () => {
    setPrefSaving(true); setPrefMsg(null);
    try {
      await memberClient.put('/climbing-routes/ranking-settings', pref);
      setPrefOpen(false);
      if (tab === 'rankings') { // 重載排名反映開關/暱稱
        setRankLoading(true);
        memberClient.get('/climbing-routes/rankings', { params: { ...(rankGym ? { gymId: rankGym } : {}), period } })
          .then(r => setRanking(r.data)).catch(() => {}).finally(() => setRankLoading(false));
      }
    } catch (e) { setPrefMsg(e.response?.data?.message || '儲存失敗'); }
    finally { setPrefSaving(false); }
  };
  const shareIg = async (r) => {
    const title = `${r.area || ''} ${r.color || ''} ${r.grade} 路線示範`.trim();
    try {
      if (navigator.share) { await navigator.share({ title, url: r.igUrl }); return; }
      await navigator.clipboard.writeText(r.igUrl);
      setShareToast('已複製示範影片連結'); setTimeout(() => setShareToast(''), 2000);
    } catch (e) { /* 使用者取消分享等，靜默 */ }
  };

  const tiers = data?.tiers || [];
  const routes = data?.routes || [];
  const myAscents = data?.myAscents || {};
  const checkedIn = !!data?.checkedInToday;
  const byArea = routes.reduce((m, r) => { (m[r.area || '未分區'] = m[r.area || '未分區'] || []).push(r); return m; }, {});
  const tierLabel = (key) => tiers.find(t => t.key === key)?.label || key;

  const openRecord = (r) => {
    setRecordTarget(r);
    setPickedTier(myAscents[r.id]?.tier || null);
    setModalMsg(null); setConfirmDelete(false);
  };

  const submitRecord = async () => {
    if (!pickedTier) { setModalMsg({ ok:false, text:'請選擇完攀方式' }); return; }
    setSaving(true); setModalMsg(null);
    try {
      await memberClient.post(`/climbing-routes/${recordTarget.id}/ascents`, { tier: pickedTier });
      setRecordTarget(null); load();
    } catch (e) {
      setModalMsg({ ok:false, text: e.response?.data?.message || '記錄失敗，請稍後再試' });
    } finally { setSaving(false); }
  };

  const deleteRecord = async () => {
    setSaving(true); setModalMsg(null);
    try {
      await memberClient.delete(`/climbing-routes/${recordTarget.id}/ascents`);
      setRecordTarget(null); load();
    } catch (e) {
      setModalMsg({ ok:false, text: e.response?.data?.message || '刪除失敗' });
    } finally { setSaving(false); }
  };

  const GymChips = () => (
    <div style={{ display:'flex', gap:8 }}>
      {GYMS.map(g => (
        <button key={g.id} onClick={() => changeGym(g.id)}
          style={{ flex:1, padding:'8px 0', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer',
            border: gymId === g.id ? '1.5px solid #8B1A1A' : '1px solid #E8D5D5',
            background: gymId === g.id ? '#8B1A1A' : '#fff', color: gymId === g.id ? '#fff' : '#666' }}>
          {g.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#F7F3F3', paddingBottom:40 }}>
      <MemberLogoutButton />
      {/* 頂部 */}
      <div style={{ background:'linear-gradient(135deg,#8B1A1A,#6B1414)', padding:'18px 16px 16px', color:'#fff' }}>
        <div onClick={() => navigate('/member/home')} style={{ fontSize:13, opacity:.85, cursor:'pointer', marginBottom:8 }}>← 返回首頁</div>
        <div style={{ fontSize:19, fontWeight:700 }}>🪨 路線攻略</div>
        <div style={{ fontSize:11, opacity:.8, marginTop:3 }}>看路線示範影片、記錄完攀、累積積分排名</div>
      </div>

      {/* 分頁 */}
      <div style={{ display:'flex', background:'#fff', borderBottom:'0.5px solid #E8D5D5' }}>
        {[{ key:'routes', label:'🪨 路線' }, { key:'rankings', label:'🏆 排名' }].map(t => (
          <div key={t.key} onClick={() => setTab(t.key)}
            style={{ flex:1, textAlign:'center', padding:'11px 0', fontSize:13, fontWeight:600, cursor:'pointer',
              color: tab === t.key ? '#8B1A1A' : '#999', borderBottom: tab === t.key ? '2px solid #8B1A1A' : '2px solid transparent' }}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'routes' && (
        <div style={{ padding:'14px 16px 0' }}>
          <GymChips />
        </div>
      )}

      {tab === 'routes' && (
        <div style={{ padding:'12px 16px 0' }}>
          {/* 我的積分摘要 */}
          {data?.myTotals && (() => {
            const cur = data.myTotals.byGym?.[gymId] || { points:0, ascents:0 };
            const all = data.myTotals.all || { points:0, ascents:0 };
            return (
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 14px', display:'flex', gap:18, marginBottom:12 }}>
              <div>
                <div style={{ fontSize:10, color:'#999' }}>{GYMS.find(g=>g.id===gymId)?.label}積分</div>
                <div style={{ fontSize:20, fontWeight:700, color:'#8B1A1A' }}>{cur.points.toLocaleString()}</div>
                <div style={{ fontSize:10, color:'#999' }}>{cur.ascents} 條</div>
              </div>
              <div>
                <div style={{ fontSize:10, color:'#999' }}>全館合併</div>
                <div style={{ fontSize:20, fontWeight:700, color:'#333' }}>{all.points.toLocaleString()}</div>
                <div style={{ fontSize:10, color:'#999' }}>{all.ascents} 條</div>
              </div>
              <div style={{ flex:1, alignSelf:'center', fontSize:10, color:'#999', textAlign:'right' }}>僅計目前上架中的路線<br/>（換線下架後積分不再計入）</div>
            </div>
            );
          })()}

          {/* 入場狀態提示 */}
          {!loading && !loadErr && (
            checkedIn ? (
              <div style={{ background:'#E6F4EB', color:'#2D7D46', borderRadius:10, padding:'8px 12px', fontSize:12, marginBottom:12 }}>
                ✅ 今日已入場——完攀後點路線即可記錄成績
              </div>
            ) : (
              <div style={{ background:'#FAEEDA', color:'#854F0B', borderRadius:10, padding:'8px 12px', fontSize:12, marginBottom:12, textAlign:'left', lineHeight:1.6 }}>
                ⏳ 記錄完攀需於「入場當日」進行——今日尚未於{GYMS.find(g=>g.id===gymId)?.label}入場，可先瀏覽路線與示範影片
              </div>
            )
          )}

          {loading ? (
            <div style={{ color:'#999', fontSize:13, padding:24, textAlign:'center' }}>載入中...</div>
          ) : loadErr ? (
            <div style={{ color:'#A32D2D', fontSize:13, padding:24, textAlign:'center' }}>
              載入失敗 <button onClick={load} style={{ marginLeft:8, fontSize:12, padding:'4px 10px', borderRadius:8, border:'1px solid #ddd', background:'#fff', cursor:'pointer', color:'#444' }}>重試</button>
            </div>
          ) : routes.length === 0 ? (
            <div style={{ color:'#999', fontSize:13, padding:24, textAlign:'center', background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5' }}>
              此館尚未建立路線資料
            </div>
          ) : (
            Object.entries(byArea).map(([area, list]) => (
              <div key={area} style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#8B1A1A', marginBottom:6 }}>{area}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {list.map(r => {
                    const mine = myAscents[r.id];
                    return (
                      <div key={r.id} style={{ background:'#fff', borderRadius:12, border: mine ? '1px solid #C9DFC9' : '0.5px solid #E8D5D5', padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:'#fff', background: GRADE_COLORS[r.grade]||'#666', padding:'3px 9px', borderRadius:8, minWidth:28, textAlign:'center' }}>{r.grade}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:'#333' }}>{r.color}{r.name ? ` · ${r.name}` : ''}</div>
                            <div style={{ fontSize:11, color:'#999', marginTop:2 }}>基本分 {r.basePoints}{r.setter ? ` · 定線 ${r.setter}` : ''}{r.plannedRemoveAt ? ` · 預計換線 ${r.plannedRemoveAt}` : ''}</div>
                            {r.note && <div style={{ fontSize:11, color:'#854F0B', marginTop:2, textAlign:'left' }}>💬 {r.note}</div>}
                          </div>
                          {r.igUrl && (<>
                            <button onClick={() => window.open(r.igUrl, '_blank', 'noopener')}
                              style={{ fontSize:11, fontWeight:600, color:'#B03E96', background:'#fff', border:'1px solid #E8C9E0', borderRadius:8, padding:'5px 9px', cursor:'pointer', whiteSpace:'nowrap' }}>
                              📹 示範
                            </button>
                            <button onClick={() => shareIg(r)} aria-label="分享示範影片連結"
                              style={{ fontSize:12, fontWeight:600, color:'#B03E96', background:'#fff', border:'1px solid #E8C9E0', borderRadius:8, padding:'5px 8px', cursor:'pointer' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                            </button>
                          </>)}
                        </div>
                        <div style={{ marginTop:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          {mine ? (
                            <div style={{ fontSize:11, color:'#2D7D46', fontWeight:600 }}>
                              ✅ {tierLabel(mine.tier)} · +{mine.points} 分
                            </div>
                          ) : (
                            <div style={{ fontSize:11, color:'#bbb' }}>尚未完攀</div>
                          )}
                          <button onClick={() => openRecord(r)} disabled={!checkedIn && !mine}
                            style={{ fontSize:11, fontWeight:600, padding:'5px 12px', borderRadius:8, cursor: (checkedIn || mine) ? 'pointer' : 'default',
                              border:'none', background: mine ? '#F0EDED' : (checkedIn ? '#8B1A1A' : '#E5E0E0'), color: mine ? '#666' : '#fff' }}>
                            {mine ? '修改記錄' : '記錄完攀'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'rankings' && (
        <div style={{ padding:'12px 16px 0' }}>
          {/* 分館/合併 */}
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            {[{ id:'', label:'全館合併' }, ...GYMS].map(g => (
              <button key={g.id || 'all'} onClick={() => setRankGym(g.id)}
                style={{ flex:1, padding:'8px 0', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer',
                  border: rankGym === g.id ? '1.5px solid #8B1A1A' : '1px solid #E8D5D5',
                  background: rankGym === g.id ? '#8B1A1A' : '#fff', color: rankGym === g.id ? '#fff' : '#666' }}>
                {g.label}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:12, alignItems:'center' }}>
            {[{ key:'month', label:'本月' }, { key:'all', label:'全部' }].map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                style={{ padding:'6px 16px', borderRadius:16, fontSize:12, fontWeight:600, cursor:'pointer',
                  border: period === p.key ? '1.5px solid #8B1A1A' : '1px solid #E8D5D5',
                  background: period === p.key ? '#FBEFEF' : '#fff', color: period === p.key ? '#8B1A1A' : '#999' }}>
                {p.label}
              </button>
            ))}
            <div style={{ flex:1 }} />
            <button onClick={openPref}
              style={{ padding:'6px 12px', borderRadius:16, fontSize:12, fontWeight:600, cursor:'pointer', border:'1px solid #E8D5D5', background:'#fff', color:'#666' }}>
              ⚙️ 排名設定
            </button>
          </div>
          {ranking?.myOptedOut && (
            <div style={{ background:'#F0EDED', color:'#666', borderRadius:10, padding:'8px 12px', fontSize:12, marginBottom:10, textAlign:'left' }}>
              你目前<strong>未參加排名</strong>（積分照常累計{ranking.myStats ? `：${ranking.myStats.points.toLocaleString()} 分` : ''}）——到「⚙️ 排名設定」可重新公開參加
            </div>
          )}

          {rankLoading ? (
            <div style={{ color:'#999', fontSize:13, padding:24, textAlign:'center' }}>載入中...</div>
          ) : !ranking || ranking.rankings.length === 0 ? (
            <div style={{ color:'#999', fontSize:13, padding:24, textAlign:'center', background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5' }}>
              {period === 'month' ? '本月尚無完攀記錄' : '尚無完攀記錄'}
            </div>
          ) : (
            <>
              {ranking.myRank && (
                <div style={{ background:'#8B1A1A', color:'#fff', borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                  <div style={{ fontSize:18, fontWeight:700 }}>#{ranking.myRank.rank}</div>
                  <div style={{ flex:1, fontSize:13, fontWeight:600 }}>我的排名</div>
                  <div style={{ fontSize:14, fontWeight:700 }}>{ranking.myRank.points.toLocaleString()} 分</div>
                  <div style={{ fontSize:11, opacity:.8 }}>{ranking.myRank.ascents} 條</div>
                </div>
              )}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                {ranking.rankings.map(r => {
                  const isMe = member?.id === r.memberId;
                  return (
                    <div key={r.memberId} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', borderBottom:'0.5px solid #F0EDED',
                      background: isMe ? '#FBEFEF' : '#fff' }}>
                      <div style={{ width:32, fontSize:13, fontWeight:700, color: r.rank <= 3 ? '#C1462A' : '#999' }}>
                        {r.rank <= 3 ? ['🥇','🥈','🥉'][r.rank-1] : `#${r.rank}`}
                      </div>
                      <div style={{ flex:1, fontSize:13, fontWeight: isMe ? 700 : 500, color:'#333' }}>
                        {r.memberName || '會員'}{isMe && <span style={{ fontSize:10, color:'#8B1A1A', marginLeft:5 }}>（我）</span>}
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#8B1A1A' }}>{r.points.toLocaleString()}</div>
                      <div style={{ fontSize:11, color:'#999', width:38, textAlign:'right' }}>{r.ascents} 條</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize:11, color:'#999', marginTop:8, textAlign:'left' }}>
                顯示前 50 名（共 {ranking.total} 位）· 分數＝路線難度基本分 × 完攀方式係數
              </div>
            </>
          )}
        </div>
      )}

      {/* 分享連結 toast */}
      {shareToast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#1a1a1a', color:'#fff', fontSize:12, padding:'8px 16px', borderRadius:20, zIndex:300 }}>
          ✅ {shareToast}
        </div>
      )}

      {/* 排名設定 Modal */}
      {prefOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:20, width:360, maxWidth:'95vw' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#333' }}>⚙️ 排名設定</div>
              <button onClick={() => setPrefOpen(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
            </div>
            <div onClick={() => setPref(f => ({ ...f, optOut: !f.optOut }))}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, border:'1px solid #E8D5D5', cursor:'pointer', marginBottom:10 }}>
              <div style={{ width:18, height:18, borderRadius:5, flexShrink:0, border: pref.optOut ? '1px solid #ccc' : 'none', background: pref.optOut ? '#fff' : '#2D7D46', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {!pref.optOut && <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6.5 4.8 9.2 10 3.2"/></svg>}
              </div>
              <div style={{ textAlign:'left' }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#333' }}>公開積分並參加排名</div>
                <div style={{ fontSize:11, color:'#999', marginTop:2 }}>取消勾選＝不出現在排行榜（積分仍照常累計，只有自己看得到）</div>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, color:'#666', fontWeight:600, marginBottom:4, textAlign:'left' }}>排行榜暱稱（選填，最多 10 字）</div>
              <input value={pref.nickname} maxLength={10}
                onChange={e => setPref(f => ({ ...f, nickname: e.target.value }))}
                placeholder="留空＝顯示本名"
                style={{ width:'100%', boxSizing:'border-box', padding:'9px 10px', borderRadius:8, border:'1px solid #ddd', fontSize:13, color:'#333', background:'#fff' }} />
              <div style={{ fontSize:10, color:'#bbb', marginTop:3, textAlign:'right' }}>{[...pref.nickname].length}/10</div>
            </div>
            {prefMsg && <div style={{ fontSize:12, color:'#A32D2D', marginBottom:8, textAlign:'left' }}>{prefMsg}</div>}
            <button onClick={savePref} disabled={prefSaving}
              style={{ width:'100%', background: prefSaving ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', borderRadius:10, padding:'11px 0', fontSize:14, fontWeight:600, cursor: prefSaving ? 'default' : 'pointer' }}>
              {prefSaving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      )}

      {/* 記錄完攀 Modal */}
      {recordTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:20, width:400, maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#333' }}>記錄完攀</div>
              <button onClick={() => setRecordTarget(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
            </div>
            <div style={{ fontSize:12, color:'#666', marginBottom:12 }}>
              <span style={{ fontWeight:700, color:'#fff', background: GRADE_COLORS[recordTarget.grade]||'#666', padding:'2px 7px', borderRadius:6, marginRight:6 }}>{recordTarget.grade}</span>
              {recordTarget.area} · {recordTarget.color}{recordTarget.name ? ` · ${recordTarget.name}` : ''}
            </div>
            {!checkedIn && (
              <div style={{ background:'#FAEEDA', color:'#854F0B', borderRadius:8, padding:'7px 10px', fontSize:11, marginBottom:10, textAlign:'left' }}>
                今日尚未入場，無法新增或修改記錄（可刪除既有記錄）
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {tiers.map(t => {
                const pts = Math.round((recordTarget.basePoints || 0) * (t.multiplier || 0));
                const sel = pickedTier === t.key;
                return (
                  <div key={t.key} onClick={() => checkedIn && setPickedTier(t.key)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 12px', borderRadius:10, cursor: checkedIn ? 'pointer' : 'default',
                      border: sel ? '1.5px solid #8B1A1A' : '1px solid #E8D5D5', background: sel ? '#FBEFEF' : '#fff', opacity: checkedIn ? 1 : .6 }}>
                    <div style={{ fontSize:13, fontWeight: sel ? 700 : 500, color:'#333', textAlign:'left' }}>{t.label}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#8B1A1A', whiteSpace:'nowrap', marginLeft:8 }}>+{pts} 分</div>
                  </div>
                );
              })}
            </div>
            {modalMsg && (
              <div style={{ marginTop:10, padding:'7px 10px', borderRadius:8, fontSize:12, background:'#FCEBEB', color:'#A32D2D', textAlign:'left' }}>{modalMsg.text}</div>
            )}
            {checkedIn && (
              <button onClick={submitRecord} disabled={saving}
                style={{ width:'100%', marginTop:14, background: saving ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', borderRadius:10, padding:'12px 0', fontSize:14, fontWeight:600, cursor: saving ? 'default' : 'pointer' }}>
                {saving ? '送出中...' : (myAscents[recordTarget.id] ? '更新記錄' : '✓ 記錄完攀')}
              </button>
            )}
            {myAscents[recordTarget.id] && (
              confirmDelete ? (
                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                  <button onClick={() => setConfirmDelete(false)} style={{ flex:1, padding:'9px 0', borderRadius:10, border:'1px solid #ddd', background:'#fff', fontSize:12, cursor:'pointer', color:'#666' }}>返回</button>
                  <button onClick={deleteRecord} disabled={saving} style={{ flex:1, padding:'9px 0', borderRadius:10, border:'none', background:'#A32D2D', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>確定刪除記錄</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  style={{ width:'100%', marginTop:8, background:'#fff', color:'#A32D2D', border:'1px solid #EBC9C9', borderRadius:10, padding:'9px 0', fontSize:12, cursor:'pointer' }}>
                  刪除此記錄
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
