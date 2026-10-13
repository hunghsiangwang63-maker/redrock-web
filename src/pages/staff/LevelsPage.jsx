import { useState, useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import { useAuth } from '../../store/authStore';
import { getCourses } from '../../api/courses';
import { getLevelDefs, updateLevelDef, getLevelCourseStudents, createLevelRecords, voidLevelRecord, getMemberLevels } from '../../api/climbLevels';
import SegmentedTabs from '../../components/SegmentedTabs';
import Modal from '../../components/Modal';

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
  const [program, setProgram] = useState(null);
  const [defs, setDefs] = useState([]);

  const loadDefs = () => getLevelDefs().then(r => { setProgram(r.data.program); setDefs(r.data.defs || []); }).catch(() => {});
  useEffect(() => { loadDefs(); }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>🕷 小蜘蛛人等級考核</div>
      {isAdmin && <SegmentedTabs tabs={[{ key:'record', label:'考核登記' }, { key:'defs', label:'等級設定' }]} value={tab} onChange={setTab} style={{ marginBottom: 16 }} />}
      {tab === 'record' || !isAdmin
        ? <RecordTab program={program} defs={defs} gymId={gymId} isAdmin={isAdmin} />
        : <DefsTab defs={defs} reload={loadDefs} />}
    </div>
  );
}

// ── 考核登記 ──────────────────────────────────────────────
function RecordTab({ program, defs, gymId, isAdmin }) {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [data, setData] = useState(null);
  const [rows, setRows] = useState({});
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [coach, setCoach] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    if (!program) return;
    getCourses(gymId).then(r => {
      const list = (r.data.courses || []).filter(c => c.type !== 'workshop' && program.categoryIds?.includes(c.categoryId)
        && !['ended', 'cancelled'].includes(c.statusLabel) && (!program.gymIds?.length || program.gymIds.includes(c.gymId)));
      setCourses(list);
    }).catch(() => {});
  }, [program, gymId]);

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
    try { const r = await getMemberLevels(s.memberId); setHistory({ name: s.name, ...r.data }); } catch (e) { setMsg({ err: errMsg(e) }); }
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
                  <div style={{ fontWeight:600 }}>{s.name}</div>
                  <button onClick={() => openHistory(s)} style={{ background:'none', border:'none', color:'#C0392B', fontSize:12, cursor:'pointer' }}>
                    目前：{s.currentLevel ? `${s.currentLevel} 級已通過` : '尚未通過任何級'} ›
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
    </div>
  );
}

function HistoryModal({ h, isAdmin, onClose, onVoided }) {
  const [err, setErr] = useState('');
  const voidIt = async (r) => {
    const reason = window.prompt('作廢原因（誤登請填寫）：');
    if (reason === null) return;
    try { await voidLevelRecord(r.id, reason); onVoided(); } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Modal title={`${h.name} 的考核紀錄`} onClose={onClose} width={560}>
      <div style={{ fontSize:13, marginBottom:10 }}>目前等級：<b>{h.currentLevel ? `${h.currentLevel} 級` : '尚未通過任何級'}</b></div>
      {err && <div style={{ color:'#C0392B', fontSize:12 }}>{err}</div>}
      {h.records.length === 0 && <div style={{ color:'#888', fontSize:13 }}>尚無紀錄</div>}
      {h.records.map(r => (
        <div key={r.id} style={{ borderTop:'0.5px solid #F0E4E4', padding:'8px 0', fontSize:13, opacity: r.voided ? .45 : 1 }}>
          <div>{r.date}｜{r.level} 級｜{r.progress}%{r.passed ? ' ✅通過' : ''}｜教練：{r.coachName}{r.voided ? '（已作廢）' : ''}</div>
          {(r.description || r.note) && <div style={{ color:'#888', fontSize:12 }}>{[r.description, r.note].filter(Boolean).join('｜')}</div>}
          {isAdmin && !r.voided && <button onClick={() => voidIt(r)} style={{ background:'none', border:'none', color:'#999', fontSize:11, cursor:'pointer', padding:0 }}>作廢</button>}
        </div>
      ))}
    </Modal>
  );
}

// ── 等級設定（管理員）────────────────────────────────────
function DefsTab({ defs, reload }) {
  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState(null);
  const val = (d, k) => (edit[d.level]?.[k] ?? d[k] ?? '');
  const set = (d, k, v) => setEdit(p => ({ ...p, [d.level]: { ...(p[d.level] || {}), [k]: v } }));
  const save = async (d) => {
    try { await updateLevelDef('spider', d.level, edit[d.level]); setEdit(p => { const n = { ...p }; delete n[d.level]; return n; }); setMsg({ ok: `${d.level} 級已儲存` }); reload(); }
    catch (e) { setMsg({ err: errMsg(e) }); }
  };
  return (
    <div>
      <div style={{ fontSize:12, color:'#888', marginBottom:10 }}>16 級最入門、1 級最高。修改後只影響之後顯示，已登記的考核紀錄不變。</div>
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
