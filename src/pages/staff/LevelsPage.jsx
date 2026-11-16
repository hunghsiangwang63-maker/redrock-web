import { useState, useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import { useAuth } from '../../store/authStore';
import { getCourses } from '../../api/courses';
import { getLevelDefs, updateLevelDef, getLevelCourseStudents, createLevelRecords, voidLevelRecord, getMemberLevels } from '../../api/climbLevels';
import SegmentedTabs from '../../components/SegmentedTabs';
import Modal from '../../components/Modal';
import UniformPanel from '../../components/UniformPanel';

const input = { height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };
const btn = { height:36, borderRadius:8, border:'none', padding:'0 16px', fontSize:13, fontWeight:600, cursor:'pointer', background:'#C0392B', color:'#fff' };
const PROGRESS = [50, 75, 90, 100];
const errMsg = (e) => e?.response?.data?.message || e?.message || '操作失敗';

export default function LevelsPage() {
  const { staff, operator, activeGymId, viewGym } = useAuth();
  const role = operator?.role || staff?.role;
  const isAdmin = ['super_admin', 'gym_manager'].includes(role);
  const gymId = activeGymId || staff?.gymId || (role === 'super_admin' ? (viewGym || '') : '');
  const [tab, setTab] = useState('record');
  const [programs, setPrograms] = useState([]);   // [{ key, name, categoryIds, gymIds, defs }]
  const [defsProgram, setDefsProgram] = useState('spider');

  const loadDefs = () => Promise.all(['spider', 'teen'].map(k => getLevelDefs(k).then(r => ({ ...r.data.program, defs: r.data.defs || [] })).catch(() => null)))
    .then(list => setPrograms(list.filter(Boolean)));
  useEffect(() => { loadDefs(); }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>🧗 攀岩等級考核</div>
      {isAdmin && <SegmentedTabs tabs={[{ key:'record', label:'考核登記' }, { key:'defs', label:'等級設定' }]} value={tab} onChange={setTab} style={{ marginBottom: 16 }} />}
      {tab === 'record' || !isAdmin
        ? <RecordTab programs={programs} gymId={gymId} isAdmin={isAdmin} />
        : <DefsTab programs={programs} programKey={defsProgram} setProgramKey={setDefsProgram} reload={loadDefs} />}
    </div>
  );
}

// ── 考核登記 ──────────────────────────────────────────────
function RecordTab({ programs, gymId, isAdmin }) {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [data, setData] = useState(null);
  const [rows, setRows] = useState({});
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [coach, setCoach] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [history, setHistory] = useState(null);
  const [uniformFor, setUniformFor] = useState(null);

  useEffect(() => {
    if (!programs.length) return;
    getCourses(gymId).then(r => {
      const list = (r.data.courses || []).filter(c => c.type !== 'workshop' && programs.some(p => p.categoryIds?.includes(c.categoryId) && (!p.gymIds?.length || p.gymIds.includes(c.gymId)))
        && !['ended', 'cancelled'].includes(c.statusLabel));
      setCourses(list);
    }).catch(() => {});
  }, [programs, gymId]);

  const loadStudents = async (id) => {
    setCourseId(id); setData(null); setRows({}); setMsg(null);
    if (!id) return;
    try {
      const r = await getLevelCourseStudents(id);
      setData(r.data); setCoach(r.data.course?.instructor || '');
    } catch (e) { setMsg({ err: errMsg(e) }); }
  };

  const nextLevel = (s) => (s.currentLevel ? Math.max(1, s.currentLevel - 1) : 16);
  const rowOf = (s) => rows[s.memberId] || { level: nextLevel(s), progress: '', description: '', note: '' };
  const setRow = (s, patch) => setRows(p => ({ ...p, [s.memberId]: { ...rowOf(s), ...patch } }));
  const defs = programs.find(p => p.key === data?.program?.key)?.defs || [];
  const defOf = (lv) => defs.find(d => d.level === Number(lv));
  const filled = useMemo(() => (data?.students || []).filter(s => rowOf(s).progress), [data, rows]); // eslint-disable-line

  const submit = async () => {
    setSaving(true); setMsg(null);
    try {
      await createLevelRecords({
        courseId, date, coachName: coach,
        records: filled.map(s => { const r = rowOf(s); return { memberId: s.memberId, level: Number(r.level), progress: Number(r.progress), description: r.description, note: r.note }; }),
      });
      setMsg({ ok: `已登記 ${filled.length} 筆` });
      await loadStudents(courseId);
    } catch (e) { setMsg({ err: errMsg(e) }); }
    setSaving(false);
  };

  const openHistory = async (s) => {
    try { const r = await getMemberLevels(s.memberId, data?.program?.key); setHistory({ name: s.name, ...r.data }); } catch (e) { setMsg({ err: errMsg(e) }); }
  };

  return (
    <div>
      <select value={courseId} onChange={e => loadStudents(e.target.value)} style={{ ...input, width:'100%', marginBottom: 12 }}>
        <option value="">選擇班級…</option>
        {courses.map(c => <option key={c.id} value={c.id}>{c.name}（{c.instructor || '未設教練'}）</option>)}
      </select>
      {msg?.err && <div style={{ color:'#C0392B', fontSize:13, marginBottom:8 }}>{msg.err}</div>}
      {msg?.ok && <div style={{ color:'#2e7d32', fontSize:13, marginBottom:8 }}>✓ {msg.ok}</div>}
      {data && !data.enabled && <div style={{ color:'#888', fontSize:13 }}>此班級未啟用等級制。</div>}
      {data?.enabled && (
        <>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
            <label style={{ fontSize:12, color:'#666' }}>考核日期<br /><input type="date" value={date} max={dayjs().format('YYYY-MM-DD')} onChange={e => setDate(e.target.value)} style={input} /></label>
            <label style={{ fontSize:12, color:'#666' }}>考核教練<br /><input value={coach} onChange={e => setCoach(e.target.value)} placeholder="預設為該班教練" style={input} /></label>
          </div>
          {data.students.length === 0 && <div style={{ color:'#888', fontSize:13 }}>這個班目前沒有正式學員。</div>}
          {data.students.map(s => {
            const r = rowOf(s); const d = defOf(r.level);
            return (
              <div key={s.memberId} style={{ border:'0.5px solid #E8D5D5', borderRadius:10, padding:12, marginBottom:10, background:'#fff' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:6 }}>
                  <div style={{ fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
                    {s.name}
                    <button onClick={() => setUniformFor(s)} title="制服領取紀錄" style={{ border:'none', cursor:'pointer', fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:10, background: s.uniformOver2y ? '#FAEEDA' : s.uniformCount ? '#E6F4EB' : '#FCEBEB', color: s.uniformOver2y ? '#854F0B' : s.uniformCount ? '#2D7D46' : '#A32D2D' }}>
                      👕 {s.uniformOver2y ? `已領超過2年（${(s.uniformLastDate || '').replace(/-/g, '/')}）` : s.uniformCount ? `已領${s.uniformCount > 1 ? ` ${s.uniformCount} 次` : ''}` : '未領'}
                    </button>
                  </div>
                  <button onClick={() => openHistory(s)} style={{ background:'#FBF5F5', border:'0.5px solid #E8D5D5', borderRadius:8, color:'#8B1A1A', fontSize:12, fontWeight:600, cursor:'pointer', padding:'4px 10px' }}>
                    目前：{s.currentLevel ? `${s.currentLevel} 級已通過` : '尚未通過任何級'}　📜 詳細歷史 ›
                  </button>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
                  <select value={r.level} onChange={e => setRow(s, { level: e.target.value })} style={{ ...input, width:110 }}>
                    {Array.from({ length: 16 }, (_, i) => 16 - i).map(n => <option key={n} value={n}>{n} 級</option>)}
                  </select>
                  <select value={r.progress} onChange={e => setRow(s, { progress: e.target.value })} style={{ ...input, width:130 }}>
                    <option value="">本次不登記</option>
                    {PROGRESS.map(p => <option key={p} value={p}>{p}%{p === 100 ? '（通過）' : ''}</option>)}
                  </select>
                  <input value={r.description} onChange={e => setRow(s, { description: e.target.value })} placeholder="說明" style={{ ...input, flex:1, minWidth:120 }} />
                  <input value={r.note} onChange={e => setRow(s, { note: e.target.value })} placeholder="備註" style={{ ...input, flex:1, minWidth:120 }} />
                </div>
                {d && <div style={{ fontSize:11, color:'#999', marginTop:6 }}>{d.title}{d.standard ? `｜${d.standard}` : ''}{d.fitness ? `｜體能：${d.fitness}` : ''}</div>}
              </div>
            );
          })}
          {data.students.length > 0 && (
            <button onClick={submit} disabled={saving || !filled.length || !coach.trim()} style={{ ...btn, opacity: (saving || !filled.length || !coach.trim()) ? .5 : 1, width:'100%' }}>
              {saving ? '儲存中…' : `登記 ${filled.length} 位學員的考核`}
            </button>
          )}
        </>
      )}
      {history && <HistoryModal h={history} isAdmin={isAdmin} onClose={() => setHistory(null)} onVoided={() => { setHistory(null); loadStudents(courseId); }} />}
      {uniformFor && (
        <Modal title={`${uniformFor.name} 的制服領取`} onClose={() => { setUniformFor(null); loadStudents(courseId); }} width={560}>
          <UniformPanel memberId={uniformFor.memberId} isAdmin={isAdmin} />
        </Modal>
      )}
    </div>
  );
}

function HistoryModal({ h, isAdmin, onClose, onVoided }) {
  const [err, setErr] = useState('');
  const [showAll, setShowAll] = useState(false);
  const voidIt = async (r) => {
    const reason = window.prompt('作廢原因（誤登請填寫）：');
    if (reason === null) return;
    try { await voidLevelRecord(r.id, reason); onVoided(); } catch (e) { setErr(errMsg(e)); }
  };
  const defs = h.defs || [];
  const defOf = (lv) => defs.find(d => d.level === lv);
  const all = [...(h.records || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.level - a.level));
  const valid = all.filter(r => !r.voided);
  const passedBy = {};                       // 級數 -> 該級最早通過的紀錄
  valid.filter(r => r.passed).forEach(r => { if (!passedBy[r.level] || (r.date || '') < (passedBy[r.level].date || '')) passedBy[r.level] = r; });
  const bestBy = {};                         // 級數 -> 最高進度（含未通過）
  valid.forEach(r => { if (!bestBy[r.level] || (r.progress || 0) > (bestBy[r.level].progress || 0)) bestBy[r.level] = r; });
  const passedList = Object.values(passedBy).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const cur = h.currentLevel;
  const nextLevel = cur ? Math.max(0, cur - 1) : 16;
  const first = passedList[0], last = [...valid].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const stat = (label, val) => (
    <div style={{ flex:'1 1 110px', background:'#FBF5F5', border:'0.5px solid #F0E0E0', borderRadius:10, padding:'8px 12px' }}>
      <div style={{ fontSize:11, color:'#9a8a8a' }}>{label}</div>
      <div style={{ fontSize:15, fontWeight:700, color:'#3a2a2a', marginTop:2 }}>{val}</div>
    </div>
  );
  // 各級列：有紀錄的級數＋下一個目標；展開「顯示全部 16 級」可看全部
  const levelRows = Array.from({ length: 16 }, (_, i) => 16 - i)
    .filter(lv => showAll || bestBy[lv] || lv === nextLevel);
  return (
    <Modal title={`${h.name} 的等級考核歷史`} onClose={onClose} width={680}>
      {err && <div style={{ color:'#C0392B', fontSize:12, marginBottom:8 }}>{err}</div>}

      {/* 摘要 */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
        {stat('目前等級', cur ? `已通過 ${cur} 級` : '尚未通過任何級')}
        {stat('通過關數', `${passedList.length} / 16`)}
        {stat('首次通過', first ? `${first.date}（${first.level} 級）` : '—')}
        {stat('最近考核', last ? `${last.date}（${last.level} 級 ${last.progress}%）` : '—')}
      </div>

      {/* 16 格階梯：由 16 級（最入門）到 1 級（最高） */}
      <div style={{ display:'flex', gap:3, marginBottom:4 }}>
        {Array.from({ length: 16 }, (_, i) => 16 - i).map(lv => {
          const r = passedBy[lv];
          return <div key={lv} title={r ? `${lv} 級　${r.date} 通過` : `${lv} 級　尚未通過`} style={{ flex:1, height:12, borderRadius:3, background: r ? 'linear-gradient(180deg,#C0392B,#8B1A1A)' : lv === nextLevel ? '#F6D9A8' : '#EFE6E6', border: !r && lv === nextLevel ? '1px dashed #E8A317' : 'none', boxSizing:'border-box' }} />;
        })}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#aaa', marginBottom:14 }}><span>16 級（入門）</span><span>1 級（最高）</span></div>

      {/* 各級進度 */}
      <div style={{ fontSize:12, fontWeight:700, color:'#6b6b6b', marginBottom:6 }}>各級進度</div>
      <div style={{ border:'0.5px solid #F0E4E4', borderRadius:10, overflow:'hidden', marginBottom:6 }}>
        {levelRows.map(lv => {
          const p = passedBy[lv], b = bestBy[lv], d = defOf(lv);
          return (
            <div key={lv} style={{ display:'flex', gap:10, alignItems:'center', padding:'7px 12px', borderBottom:'0.5px solid #F5EFEF', fontSize:13, background: p ? '#F6FBF7' : '#fff' }}>
              <span style={{ width:44, fontWeight:700, color: p ? '#2D7D46' : '#888' }}>{lv} 級</span>
              <span style={{ flex:1, minWidth:0, color:'#555', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={d?.title || ''}>{d?.title || ''}</span>
              <span style={{ width:170, textAlign:'right', fontSize:12, color: p ? '#2D7D46' : b ? '#D9822B' : '#bbb', fontWeight:600 }}>
                {p ? `✅ ${p.date} 通過` : b ? `進行中 ${b.progress}%（${b.date}）` : lv === nextLevel ? '🎯 下一個目標' : '尚未開始'}
              </span>
            </div>
          );
        })}
      </div>
      <button onClick={() => setShowAll(v => !v)} style={{ background:'none', border:'none', color:'#C0392B', fontSize:12, cursor:'pointer', padding:0, marginBottom:14 }}>
        {showAll ? '只顯示有紀錄的級數 ▲' : '顯示全部 16 級 ▼'}
      </button>

      {/* 完整考核紀錄（含作廢） */}
      <div style={{ fontSize:12, fontWeight:700, color:'#6b6b6b', marginBottom:6 }}>完整考核紀錄（共 {all.length} 筆，新到舊）</div>
      {all.length === 0 && <div style={{ color:'#888', fontSize:13 }}>尚無紀錄</div>}
      {all.map(r => (
        <div key={r.id} style={{ borderTop:'0.5px solid #F0E4E4', padding:'8px 0', fontSize:13, opacity: r.voided ? .45 : 1 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ color:'#9a8a8a', fontVariantNumeric:'tabular-nums' }}>{r.date}</span>
            <span style={{ fontWeight:700, padding:'1px 9px', borderRadius:10, background: r.passed ? '#E6F4EB' : '#FAEEDA', color: r.passed ? '#2D7D46' : '#854F0B' }}>{r.level} 級</span>
            <span style={{ fontWeight:600, color: r.passed ? '#2D7D46' : '#D9822B' }}>{r.passed ? '✅ 通過（100%）' : `${r.progress}%`}</span>
            <span style={{ color:'#888', fontSize:12 }}>教練：{r.coachName || '—'}</span>
            {r.courseName && <span style={{ color:'#aaa', fontSize:11 }}>{r.courseName}</span>}
            {r.source === 'xlsx-import' && <span style={{ color:'#bbb', fontSize:11 }}>Excel 匯入</span>}
            {r.voided && <span style={{ color:'#A32D2D', fontSize:11, fontWeight:700 }}>已作廢{r.voidedReason ? `：${r.voidedReason}` : ''}</span>}
            {isAdmin && !r.voided && <button onClick={() => voidIt(r)} style={{ marginLeft:'auto', background:'none', border:'none', color:'#999', fontSize:11, cursor:'pointer', padding:0 }}>作廢</button>}
          </div>
          {(r.description || (r.note && r.source !== 'xlsx-import')) && <div style={{ color:'#777', fontSize:12, marginTop:3, lineHeight:1.5 }}>{[r.description, r.source === 'xlsx-import' ? '' : r.note].filter(Boolean).join('｜')}</div>}
        </div>
      ))}

      {/* 制服領取 */}
      <div style={{ fontSize:12, fontWeight:700, color:'#6b6b6b', margin:'14px 0 6px' }}>👕 制服領取</div>
      <UniformPanel memberId={h.memberId} isAdmin={isAdmin} />
    </Modal>
  );
}

// ── 等級設定（管理員）────────────────────────────────────
function DefsTab({ programs, programKey, setProgramKey, reload }) {
  const defs = programs.find(p => p.key === programKey)?.defs || [];
  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState(null);
  const val = (d, k) => (edit[d.level]?.[k] ?? d[k] ?? '');
  const set = (d, k, v) => setEdit(p => ({ ...p, [d.level]: { ...(p[d.level] || {}), [k]: v } }));
  const save = async (d) => {
    try { await updateLevelDef(programKey, d.level, edit[d.level]); setEdit(p => { const n = { ...p }; delete n[d.level]; return n; }); setMsg({ ok: `${d.level} 級已儲存` }); reload(); }
    catch (e) { setMsg({ err: errMsg(e) }); }
  };
  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
        {programs.map(p => (
          <button key={p.key} onClick={() => { setProgramKey(p.key); setEdit({}); setMsg(null); }}
            style={{ border:'0.5px solid #E8D5D5', borderRadius:16, padding:'5px 14px', fontSize:13, fontWeight:600, cursor:'pointer', background: p.key === programKey ? '#8B1A1A' : '#fff', color: p.key === programKey ? '#fff' : '#8B1A1A' }}>{p.name}</button>
        ))}
      </div>
      <div style={{ fontSize:12, color:'#888', marginBottom:10 }}>16 級最入門、1 級最高。小蜘蛛人與青少年各自一套內容，互不影響；修改後只影響之後顯示，已登記的考核紀錄不變。</div>
      {msg?.err && <div style={{ color:'#C0392B', fontSize:13 }}>{msg.err}</div>}
      {msg?.ok && <div style={{ color:'#2e7d32', fontSize:13 }}>✓ {msg.ok}</div>}
      {defs.map(d => (
        <div key={d.level} style={{ border:'0.5px solid #E8D5D5', borderRadius:10, padding:12, marginBottom:10, background:'#fff' }}>
          <div style={{ fontWeight:600, marginBottom:6 }}>{d.level} 級 <span style={{ fontSize:11, color:'#999', fontWeight:400 }}>{d.group}</span></div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:8 }}>
            <label style={{ fontSize:11, color:'#666' }}>練習項目<input value={val(d, 'title')} onChange={e => set(d, 'title', e.target.value)} style={{ ...input, width:'100%' }} /></label>
            <label style={{ fontSize:11, color:'#666' }}>標準<input value={val(d, 'standard')} onChange={e => set(d, 'standard', e.target.value)} style={{ ...input, width:'100%' }} /></label>
            <label style={{ fontSize:11, color:'#666' }}>體能<input value={val(d, 'fitness')} onChange={e => set(d, 'fitness', e.target.value)} style={{ ...input, width:'100%' }} /></label>
            <label style={{ fontSize:11, color:'#666' }}>說明<input value={val(d, 'description')} onChange={e => set(d, 'description', e.target.value)} style={{ ...input, width:'100%' }} /></label>
          </div>
          {edit[d.level] && <button onClick={() => save(d)} style={{ ...btn, marginTop:8 }}>儲存 {d.level} 級</button>}
        </div>
      ))}
    </div>
  );
}
