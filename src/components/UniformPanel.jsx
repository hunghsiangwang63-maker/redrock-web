import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { getMemberUniforms, createUniform, updateUniform, voidUniform } from '../api/uniforms';

// 小蜘蛛人制服領取紀錄（員工端）：列出每次發放（首次／再次、日期、尺寸、備註），任何員工可新增，管理員／館長可修改、作廢。
const input = { height: 34, borderRadius: 8, border: '0.5px solid #E8D5D5', padding: '0 8px', fontSize: 13, background: '#FBF5F5', outline: 'none', color: '#1a1a1a', boxSizing: 'border-box' };
const smallBtn = (c = '#8B1A1A') => ({ background: 'none', border: 'none', color: c, fontSize: 12, cursor: 'pointer', padding: 0 });
const errMsg = (e) => e?.response?.data?.message || e?.message || '操作失敗';
const KIND = { first: '首次發放', replacement: '再次發放' };
const fmtDate = (v) => (!v ? '日期不詳' : v.length === 7 ? `${v.replace('-', '/')}（月份）` : v.replace(/-/g, '/'));

export default function UniformPanel({ memberId, isAdmin, onChange }) {
  const [issues, setIssues] = useState(null);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ kind: 'first', issuedAt: dayjs().format('YYYY-MM-DD'), size: '', note: '' });
  const [edit, setEdit] = useState(null); // {id, ...}
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setErr('');
    getMemberUniforms(memberId).then(r => setIssues(r.data.issues || [])).catch(e => { setIssues([]); setErr(errMsg(e)); });
  }, [memberId]);
  useEffect(() => { load(); }, [load]);

  const after = () => { load(); if (onChange) onChange(); };
  const add = async () => {
    setBusy(true); setErr('');
    try {
      await createUniform({ memberId, kind: f.kind, issuedAt: f.issuedAt || null, size: f.size, note: f.note });
      setAdding(false); setF({ kind: issues && issues.length ? 'replacement' : 'first', issuedAt: dayjs().format('YYYY-MM-DD'), size: '', note: '' }); after();
    } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  const saveEdit = async () => {
    setBusy(true); setErr('');
    try { await updateUniform(edit.id, { kind: edit.kind, issuedAt: edit.issuedAt || null, size: edit.size, note: edit.note }); setEdit(null); after(); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  const del = async (u) => {
    const reason = window.prompt('作廢這筆領取紀錄的原因（誤登請填寫）：');
    if (reason === null) return;
    try { await voidUniform(u.id, reason); after(); } catch (e) { setErr(errMsg(e)); }
  };

  if (issues === null) return <div style={{ fontSize: 12, color: '#999' }}>載入中…</div>;
  // 最近一次領取已滿兩年（滿 2 年可再次發放）：日期以當日／月份最後一天算，日期不詳者不判斷
  const lastIssued = issues.map(u => (!u.issuedAt ? null : u.issuedAt.length === 7 ? dayjs(u.issuedAt + '-01').endOf('month').format('YYYY-MM-DD') : u.issuedAt)).filter(Boolean).sort().pop();
  const over2y = !!lastIssued && dayjs(lastIssued).add(2, 'year').format('YYYY-MM-DD') <= dayjs().format('YYYY-MM-DD');
  return (
    <div>
      {over2y && <div style={{ background: '#FAEEDA', color: '#854F0B', fontSize: 12, fontWeight: 600, borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>⏰ 最近一次領取是 {lastIssued.replace(/-/g, '/')}，已超過兩年，可再次發放。</div>}
      {err && <div style={{ color: '#C0392B', fontSize: 12, marginBottom: 6 }}>{err}</div>}
      {issues.length === 0 && !adding && <div style={{ fontSize: 13, color: '#999' }}>尚無制服領取紀錄</div>}
      {issues.map(u => (
        <div key={u.id} style={{ borderBottom: '0.5px solid #F5EFEF', padding: '7px 0', fontSize: 13 }}>
          {edit && edit.id === u.id ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={edit.kind} onChange={e => setEdit({ ...edit, kind: e.target.value })} style={{ ...input, width: 96 }}>
                <option value="first">首次發放</option><option value="replacement">再次發放</option>
              </select>
              <input value={edit.issuedAt || ''} onChange={e => setEdit({ ...edit, issuedAt: e.target.value })} placeholder="YYYY-MM-DD" style={{ ...input, width: 118 }} />
              <input value={edit.size || ''} onChange={e => setEdit({ ...edit, size: e.target.value })} placeholder="尺寸" style={{ ...input, width: 70 }} />
              <input value={edit.note || ''} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="備註" style={{ ...input, flex: 1, minWidth: 100 }} />
              <button disabled={busy} onClick={saveEdit} style={smallBtn('#2D7D46')}>儲存</button>
              <button onClick={() => setEdit(null)} style={smallBtn('#999')}>取消</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10, background: u.kind === 'first' ? '#E6F1FB' : '#FAEEDA', color: u.kind === 'first' ? '#185FA5' : '#854F0B' }}>{KIND[u.kind] || u.kind}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(u.issuedAt)}</span>
              {u.size && <span style={{ color: '#555' }}>尺寸 {u.size}</span>}
              {u.note && <span style={{ color: '#888', fontSize: 12 }}>{u.note}</span>}
              {u.source === 'xlsx-import' && <span style={{ color: '#bbb', fontSize: 11 }} title={u.rawText || ''}>Excel 匯入</span>}
              {isAdmin && (
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 10 }}>
                  <button onClick={() => setEdit({ id: u.id, kind: u.kind, issuedAt: u.issuedAt, size: u.size, note: u.note })} style={smallBtn('#185FA5')}>修改</button>
                  <button onClick={() => del(u)} style={smallBtn('#999')}>作廢</button>
                </span>
              )}
            </div>
          )}
        </div>
      ))}
      {adding ? (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })} style={{ ...input, width: 96 }}>
            <option value="first">首次發放</option><option value="replacement">再次發放</option>
          </select>
          <input type="date" value={f.issuedAt} max={dayjs().format('YYYY-MM-DD')} onChange={e => setF({ ...f, issuedAt: e.target.value })} style={{ ...input, width: 140 }} />
          <input value={f.size} onChange={e => setF({ ...f, size: e.target.value })} placeholder="尺寸（例 12、M）" style={{ ...input, width: 110 }} />
          <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="備註（選填）" style={{ ...input, flex: 1, minWidth: 110 }} />
          <button disabled={busy} onClick={add} style={{ ...input, background: '#C0392B', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', padding: '0 14px' }}>登記領取</button>
          <button onClick={() => setAdding(false)} style={smallBtn('#999')}>取消</button>
        </div>
      ) : (
        <button onClick={() => { setAdding(true); setF(p => ({ ...p, kind: issues.length ? 'replacement' : 'first' })); }} style={{ ...smallBtn('#C0392B'), marginTop: 8, fontSize: 13 }}>＋ 記錄制服領取</button>
      )}
    </div>
  );
}
