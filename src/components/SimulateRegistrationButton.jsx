import { useState } from 'react';
import client from '../api/client';

/*
 * 模擬報名按鈕（員工端驗證工具）
 * props: type='course'|'experience'|'competition', targetId, [sessionId], [divisionId], [label], [btnStyle]
 * 點擊 → 輸入收件 Email → 呼叫 /simulate/registration → 顯示結果（費用/欄位/規則）＋已寄確認信。
 * 不佔名額：後端只計算內容＋寄真實確認信＋10 分鐘自動刪日誌，不建真實報名。
 */
const RED = '#8B1A1A';
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const card = { background: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 440, maxHeight: '85vh', overflowY: 'auto', color: '#1a1a1a' };
const inp = { width: '100%', height: 40, borderRadius: 8, border: '0.5px solid #E8D5D5', padding: '0 12px', fontSize: 14, background: '#FBF5F5', outline: 'none', boxSizing: 'border-box', color: '#1a1a1a' };

export default function SimulateRegistrationButton({ type, targetId, sessionId, divisionId, label = '🧪 模擬報名', btnStyle }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState('input'); // input | loading | result | error
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const reset = () => { setOpen(false); setPhase('input'); setResult(null); setErr(''); };

  const run = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr('請輸入有效的 Email'); return; }
    setPhase('loading'); setErr('');
    try {
      const res = await client.post('/simulate/registration', { type, targetId, sessionId, divisionId, email: email.trim() });
      setResult(res.data); setPhase('result');
    } catch (e) {
      setErr(e.response?.data?.message || '模擬失敗'); setPhase('error');
    }
  };

  const s = result?.summary || {};
  const row = (k, v) => v == null || v === '' ? null : (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 13, borderBottom: '0.5px solid #F5EFEF' }}>
      <span style={{ color: '#888' }}>{k}</span><span style={{ fontWeight: 500, textAlign: 'right' }}>{v}</span>
    </div>
  );
  const ff = s.formFields || {};

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
                以假資料跑一次報名表流程，確認流程/費用/欄位是否正確。<br />
                <b>不會佔名額、不建真實報名</b>；會寄一封確認信到下方信箱、10 分鐘後自動刪除模擬紀錄。
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

            {phase === 'loading' && <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>模擬報名中…（寄送確認信）</div>}

            {phase === 'error' && (<>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#A32D2D', marginBottom: 10 }}>⚠️ 模擬失敗</div>
              <div style={{ fontSize: 14, color: '#444', marginBottom: 18 }}>{err}</div>
              <button onClick={() => setPhase('input')} style={{ width: '100%', height: 42, borderRadius: 9, background: RED, color: '#fff', border: 'none', fontSize: 14, cursor: 'pointer' }}>返回</button>
            </>)}

            {phase === 'result' && (<>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#2D7D46', marginBottom: 4 }}>✅ 模擬報名完成</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>已寄確認信至 <b>{result.emailedTo}</b>（請至該信箱確認內容）</div>

              <div style={{ background: '#FBF5F5', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                {row('項目', s.name)}
                {type === 'course' && row('場館', s.gym)}
                {type === 'course' && row(s.isWorkshop ? '場次' : '堂數', s.isWorkshop ? (s.sessions?.[0] || '') : `共 ${s.sessionCount} 堂`)}
                {type === 'course' && row('應繳金額', `NT$${Number(s.fee || 0).toLocaleString()}`)}
                {type === 'course' && row('付款方式', s.paymentLabel)}
                {type === 'experience' && row('體驗費（1 人・含保險）', `NT$${Number(s.fee || 0).toLocaleString()}`)}
                {type === 'experience' && row('預約日期／時段', `${s.bookingDate || ''} ${s.bookingTime || ''}`)}
                {type === 'competition' && row('組別', s.division)}
                {type === 'competition' && row('比賽日', s.eventDate)}
                {type === 'competition' && row('報名費', `NT$${Number(s.fee || 0).toLocaleString()}${s.isEarly ? '（早鳥）' : ''}`)}
              </div>

              {type === 'course' && !s.isWorkshop && s.sessions?.length > 1 && (
                <details style={{ marginBottom: 12 }}>
                  <summary style={{ fontSize: 12, color: RED, cursor: 'pointer' }}>展開全部 {s.sessionCount} 堂場次</summary>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 6, lineHeight: 1.8, maxHeight: 160, overflowY: 'auto' }}>
                    {s.sessions.map((x, i) => <div key={i}>{i + 1}. {x}</div>)}
                  </div>
                </details>
              )}

              <div style={{ fontSize: 12, fontWeight: 600, color: '#666', margin: '4px 0 6px' }}>報名表欄位</div>
              <div style={{ background: '#F7F7F7', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#555', lineHeight: 1.8, marginBottom: 12 }}>
                {type === 'course' && (<>
                  <div>簽名步驟：{ff.skipSignature ? '❌ 免簽名' : '✅ 需肖像授權簽名'}</div>
                  <div>性別/年齡欄：{ff.collectGenderAge ? '✅ 有' : '—'}</div>
                  {ff.enrollNoteLabel && <div>備註欄：「{ff.enrollNoteLabel}」{ff.enrollNoteRequired ? '（必填）' : '（選填）'}</div>}
                </>)}
                {(type === 'experience' || type === 'competition') && (ff.fields || []).map((f, i) => <span key={i}>{f}{i < ff.fields.length - 1 ? '、' : ''}</span>)}
                {type === 'competition' && ff.needsSignature && <div style={{ marginTop: 4 }}>簽名：✅ 需本人簽名（未成年加法定代理人）</div>}
                {type === 'experience' && ff.note && <div style={{ marginTop: 4, color: '#888' }}>{ff.note}</div>}
              </div>

              {type === 'course' && s.rules && (
                <div style={{ fontSize: 11, color: '#888', lineHeight: 1.7, marginBottom: 12 }}>
                  請假上限 {s.rules.maxLeaves} 次（課前 {s.rules.leaveDeadlineHours}h）｜補課 {s.rules.allowMakeup ? `結束後 ${s.rules.makeupDeadlineDays} 天` : '關閉'}｜退費手續費 開課前 {Math.round((s.rules.preStartFeeRate ?? 0) * 100)}%／開課後 {Math.round((s.rules.handlingFeeRate ?? 0) * 100)}%
                </div>
              )}

              <div style={{ fontSize: 11, color: '#B5651D', background: '#FFF7EC', borderRadius: 6, padding: '6px 10px', marginBottom: 14 }}>
                ⏱ 此模擬未佔用名額；模擬紀錄將於 {result.expiresInMin} 分鐘後自動刪除。
              </div>
              <button onClick={reset} style={{ width: '100%', height: 42, borderRadius: 9, background: RED, color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>完成</button>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
