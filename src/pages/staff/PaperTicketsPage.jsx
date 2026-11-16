import { useState, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import { useAuth } from '../../store/authStore';
import { getAllGyms } from '../../api/gyms';
import { GYM_LABEL } from '../../utils/gymLabel';
import { getPaperTicketSummary, lookupPaperTickets, redeemPaperTickets, undoPaperTicket, getPaperTicketLog } from '../../api/paperTickets';

const input = { height: 38, borderRadius: 8, border: '0.5px solid #E8D5D5', padding: '0 10px', fontSize: 14, background: '#FBF5F5', outline: 'none', color: '#1a1a1a', boxSizing: 'border-box' };
const btn = (bg = '#C0392B') => ({ height: 38, borderRadius: 8, border: 'none', padding: '0 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', background: bg, color: '#fff' });
const card = { background: '#fff', border: '0.5px solid #E8D5D5', borderRadius: 12, padding: 16, marginBottom: 14 };
const errMsg = (e) => e?.response?.data?.message || e?.message || '操作失敗';

// 每種結果的顯示
const STATUS = {
  redeemed:  { icon: '✅', text: '已登記使用', bg: '#E6F4EB', color: '#2D7D46' },
  available: { icon: '🟢', text: '可使用（尚未用過）', bg: '#E6F4EB', color: '#2D7D46' },
  already_used: { icon: '⚠️', text: '已使用過', bg: '#FAEEDA', color: '#854F0B' },
  not_found: { icon: '❌', text: '查無此票號', bg: '#FCEBEB', color: '#A32D2D' },
  not_sold:  { icon: '❌', text: '清冊顯示此票尚未售出', bg: '#FCEBEB', color: '#A32D2D' },
  invalid:   { icon: '❌', text: '票號格式不正確（需 9 碼數字）', bg: '#FCEBEB', color: '#A32D2D' },
  duplicate_in_request: { icon: '➖', text: '本次輸入重複，已略過', bg: '#F0EDED', color: '#666' },
};
const fmt = (iso) => (iso ? dayjs(iso).format('YYYY/MM/DD HH:mm') : '');

function ResultRow({ r }) {
  const s = STATUS[r.status] || STATUS.invalid;
  const who = r.legacy ? '匯入前就已使用（無詳細紀錄）' : [fmt(r.usedAt), GYM_LABEL[r.usedGymId] || r.usedGymId, r.usedByName && `經手：${r.usedByName}`, r.useNote].filter(Boolean).join('　');
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: s.bg, marginBottom: 6 }}>
      <span style={{ fontSize: 15 }}>{s.icon}</span>
      <div style={{ flex: 1, fontSize: 13 }}>
        <b style={{ fontVariantNumeric: 'tabular-nums' }}>{r.ticketNo || r.input}</b>
        <span style={{ color: s.color, marginLeft: 8, fontWeight: 600 }}>{s.text}</span>
        {r.status === 'already_used' && who && <div style={{ color: '#666', marginTop: 2 }}>{who}</div>}
      </div>
    </div>
  );
}

export default function PaperTicketsPage({ embedded = false }) {
  const { staff, operator } = useAuth();
  const role = operator?.role || staff?.role;
  const isAdmin = ['super_admin', 'gym_manager'].includes(role);
  const ownGym = operator?.gymId || staff?.gymId || '';
  const [gyms, setGyms] = useState([]);
  const [gymId, setGymId] = useState(ownGym);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [resultKind, setResultKind] = useState('');
  const [msg, setMsg] = useState(null);
  const [summary, setSummary] = useState([]);
  const [log, setLog] = useState([]);
  const [loadErr, setLoadErr] = useState('');
  const [undoFor, setUndoFor] = useState(null);
  const [undoReason, setUndoReason] = useState('');
  const taRef = useRef(null);

  const loadAll = () => {
    setLoadErr('');
    getPaperTicketSummary().then(r => setSummary(r.data.series || [])).catch(e => setLoadErr(errMsg(e)));
    getPaperTicketLog({ limit: 100 }).then(r => setLog(r.data.log || [])).catch(e => setLoadErr(errMsg(e)));
  };
  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin]);
  useEffect(() => {
    if (role !== 'super_admin') return;
    getAllGyms().then(r => setGyms(r.data.gyms || [])).catch(() => {});
  }, [role]);

  if (!isAdmin) return <div style={{ padding: 24, color: '#999' }}>此功能僅限管理員／館長使用</div>;

  const run = async (kind) => {
    const t = text.trim();
    if (!t) { setMsg({ ok: false, t: '請輸入票號' }); return; }
    if (kind === 'redeem' && !gymId) { setMsg({ ok: false, t: '請先選擇使用的場館' }); return; }
    setBusy(true); setMsg(null);
    try {
      if (kind === 'lookup') {
        const r = await lookupPaperTickets(t);
        setResults(r.data.results); setResultKind('lookup');
      } else {
        const r = await redeemPaperTickets({ ticketNos: t, gymId, note });
        setResults(r.data.results); setResultKind('redeem');
        const s = r.data.summary;
        setMsg({ ok: s.redeemed > 0 && !s.alreadyUsed && !s.notFound && !s.invalid, t: `已登記 ${s.redeemed} 張${s.alreadyUsed ? `；已使用過 ${s.alreadyUsed} 張` : ''}${s.notFound ? `；查無／未售 ${s.notFound} 張` : ''}${s.invalid ? `；格式不正確 ${s.invalid} 筆` : ''}` });
        if (s.redeemed > 0) { setText(''); loadAll(); }
        taRef.current?.focus();
      }
    } catch (e) {
      setMsg({ ok: false, t: errMsg(e) }); setResults(null);
    } finally { setBusy(false); }
  };

  const doUndo = async () => {
    if (!undoReason.trim()) { setMsg({ ok: false, t: '請填寫復原原因' }); return; }
    try {
      await undoPaperTicket({ ticketNo: undoFor, reason: undoReason.trim() });
      setMsg({ ok: true, t: `已復原 ${undoFor}（可再次登記使用）` });
      setUndoFor(null); setUndoReason(''); loadAll();
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }); }
  };

  return (
    <div style={{ maxWidth: 900, margin: embedded ? 0 : '0 auto', padding: embedded ? 0 : 16, color: '#1a1a1a' }}>
      <div style={{ fontSize: embedded ? 16 : 18, fontWeight: 600, marginBottom: 4 }}>🧾 紙本入場券使用回收</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>先前售出的紙本單張入場券。客人繳回時登記票號，系統會擋下重複使用與查無的票號（不會自動建立入場紀錄）。票號首碼不代表館別，兩館的票都可在任一館使用。</div>

      {loadErr && <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>⚠️ 讀取失敗：{loadErr}。畫面上的數字可能不完整。 <button onClick={loadAll} style={{ marginLeft: 8, border: 'none', background: 'none', color: '#8B1A1A', textDecoration: 'underline', cursor: 'pointer' }}>重新載入</button></div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {summary.map(s => (
          <div key={s.series} style={{ ...card, marginBottom: 0, flex: '1 1 200px' }}>
            <div style={{ fontSize: 13, color: '#888' }}>字軌 {s.series}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12, color: '#666' }}>
              <span>已售 <b style={{ fontSize: 16, color: '#1a1a1a' }}>{s.sold.toLocaleString()}</b></span>
              <span>已使用 <b style={{ fontSize: 16, color: '#1a1a1a' }}>{s.used.toLocaleString()}</b></span>
              <span>尚未使用 <b style={{ fontSize: 16, color: '#2D7D46' }}>{s.unused.toLocaleString()}</b></span>
            </div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>登記使用</div>
        <textarea ref={taRef} value={text} onChange={e => setText(e.target.value)} rows={5}
          placeholder={'輸入或掃描票號，一行一張（也可用空白或逗號隔開）\n例：11506-0123'}
          style={{ ...input, width: '100%', height: 'auto', padding: 10, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
          {role === 'super_admin' && (
            <select value={gymId} onChange={e => setGymId(e.target.value)} style={{ ...input, minWidth: 130 }}>
              <option value="">選擇使用場館</option>
              {gyms.map(g => <option key={g.id} value={g.id}>{GYM_LABEL[g.id] || g.name}</option>)}
            </select>
          )}
          {role !== 'super_admin' && <span style={{ fontSize: 13, color: '#666' }}>場館：{GYM_LABEL[ownGym] || ownGym}</span>}
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="備註（選填）" maxLength={200} style={{ ...input, flex: '1 1 160px' }} />
          <button disabled={busy} onClick={() => run('redeem')} style={{ ...btn(), opacity: busy ? .6 : 1 }}>登記使用</button>
          <button disabled={busy} onClick={() => run('lookup')} style={{ ...btn('#888'), opacity: busy ? .6 : 1 }}>只查詢</button>
        </div>
        {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: msg.ok ? '#2D7D46' : '#A32D2D' }}>{msg.t}</div>}
        {results && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{resultKind === 'lookup' ? '查詢結果（未登記）' : '登記結果'}</div>
            {results.map((r, i) => <ResultRow key={i} r={r} />)}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>最近的登記紀錄 <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>（最近 100 筆；匯入前就已使用的舊資料不在此列）</span></div>
        {log.length === 0 ? <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>目前沒有登記紀錄</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ textAlign: 'left', color: '#888', fontSize: 12 }}>
                <th style={{ padding: '6px 8px' }}>票號</th><th style={{ padding: '6px 8px' }}>登記時間</th><th style={{ padding: '6px 8px' }}>場館</th><th style={{ padding: '6px 8px' }}>經手人</th><th style={{ padding: '6px 8px' }}>備註</th><th />
              </tr></thead>
              <tbody>
                {log.map(l => (
                  <tr key={l.ticketNo} style={{ borderTop: '0.5px solid #F0E5E5' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{l.ticketNo}</td>
                    <td style={{ padding: '6px 8px' }}>{fmt(l.usedAt)}</td>
                    <td style={{ padding: '6px 8px' }}>{GYM_LABEL[l.usedGymId] || l.usedGymId || '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{l.usedByName || '—'}</td>
                    <td style={{ padding: '6px 8px', color: '#666' }}>{l.useNote || ''}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <button onClick={() => { setUndoFor(l.ticketNo); setUndoReason(''); }} style={{ border: '0.5px solid #E8D5D5', background: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: '#8B1A1A' }}>復原</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {undoFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, width: 380, maxWidth: '100%' }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>復原 {undoFor} 的使用登記？</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>復原後此票回到「尚未使用」，可再次登記；原本的使用紀錄會保留在歷史中。</div>
            <input value={undoReason} onChange={e => setUndoReason(e.target.value)} placeholder="復原原因（必填，例：輸入錯誤票號）" maxLength={200} style={{ ...input, width: '100%' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setUndoFor(null)} style={btn('#aaa')}>取消</button>
              <button onClick={doUndo} style={btn()}>確認復原</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
