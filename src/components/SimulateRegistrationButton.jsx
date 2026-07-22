import { useState } from 'react';
import client from '../api/client';

/*
 * 模擬報名按鈕（員工端）
 * props: type='course'|'experience'|'competition', targetId, [label], [btnStyle]
 * 點擊 → 輸入收件 Email → /simulate/start 建臨時模擬帳號 → 新分頁開「真實會員報名表」，
 * 員工逐步操作每一步再送出；送出不佔名額、寄確認信、模擬紀錄自動刪除。
 */
const RED = '#8B1A1A';
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const card = { background: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 420, color: '#1a1a1a' };
const inp = { width: '100%', height: 40, borderRadius: 8, border: '0.5px solid #E8D5D5', padding: '0 12px', fontSize: 14, background: '#FBF5F5', outline: 'none', boxSizing: 'border-box', color: '#1a1a1a' };

export default function SimulateRegistrationButton({ type, targetId, label = '🧪 模擬報名', btnStyle }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState('input'); // input | loading | done | error
  const [err, setErr] = useState('');
  const [link, setLink] = useState('');

  const reset = () => { setOpen(false); setPhase('input'); setErr(''); setLink(''); };

  const run = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr('請輸入有效的 Email'); return; }
    setPhase('loading'); setErr('');
    try {
      const res = await client.post('/simulate/start', { type, targetId, email: email.trim() });
      const url = res.data.deepLink;
      setLink(url);
      const win = window.open(url, '_blank');
      setPhase('done');
      if (!win) setErr('瀏覽器擋了新分頁，請點下方連結手動開啟');
    } catch (e) {
      setErr(e.response?.data?.message || '啟動模擬失敗'); setPhase('error');
    }
  };

  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={btnStyle || { height: 28, padding: '0 10px', borderRadius: 6, background: '#fff', border: '0.5px solid #C99', color: '#8B4513', fontSize: 11, cursor: 'pointer' }}>
        {label}
      </button>

      {open && (
        <div style={overlay} onClick={(e) => { e.stopPropagation(); if (phase !== 'loading') reset(); }}>
          <div style={card} onClick={(e) => e.stopPropagation()}>
            {phase === 'input' && (<>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🧪 模擬報名</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                會在<b>新分頁</b>開啟真實會員報名表（以臨時模擬帳號登入），你可<b>逐步操作每一個報名步驟</b>再送出。<br />
                送出<b>不會真正報名、不佔名額</b>；會寄一封確認信到下方信箱、模擬紀錄稍後自動刪除。
              </div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 5 }}>確認信收件 Email *</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="輸入要收確認信的 Email" style={inp} autoFocus
                onKeyDown={(e) => e.key === 'Enter' && run()} />
              {err && <div style={{ color: '#A32D2D', fontSize: 12, marginTop: 8 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <button onClick={reset} style={{ flex: 1, height: 42, borderRadius: 9, border: '0.5px solid #E8D5D5', background: '#fff', color: '#444', fontSize: 14, cursor: 'pointer' }}>取消</button>
                <button onClick={run} style={{ flex: 2, height: 42, borderRadius: 9, background: RED, color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>開始模擬</button>
              </div>
            </>)}

            {phase === 'loading' && <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>準備模擬報名表…</div>}

            {phase === 'error' && (<>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#A32D2D', marginBottom: 10 }}>⚠️ 啟動失敗</div>
              <div style={{ fontSize: 14, color: '#444', marginBottom: 18 }}>{err}</div>
              <button onClick={() => setPhase('input')} style={{ width: '100%', height: 42, borderRadius: 9, background: RED, color: '#fff', border: 'none', fontSize: 14, cursor: 'pointer' }}>返回</button>
            </>)}

            {phase === 'done' && (<>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#2D7D46', marginBottom: 8 }}>✅ 已開啟模擬報名分頁</div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.7, marginBottom: 14 }}>
                請切到新分頁，<b>逐步操作每個報名步驟</b>並送出。<br />
                送出後確認信會寄到 <b>{email.trim()}</b>；此為模擬、不佔名額。
              </div>
              {err && <div style={{ fontSize: 12, color: '#A32D2D', marginBottom: 8 }}>{err}</div>}
              {link && <a href={link} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12, color: '#185FA5', wordBreak: 'break-all', marginBottom: 14 }}>手動開啟模擬報名表 ↗</a>}
              <button onClick={reset} style={{ width: '100%', height: 42, borderRadius: 9, background: RED, color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>完成</button>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
