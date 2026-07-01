// 分期規則編輯器（用於課程 / 定期票種設定）
// value = { enabled, periods:[{ percent, dueOffsetDays }] }；比例合計應=100，第一期間隔通常0天（簽約當下收）
const inp = { width: 66, height: 30, borderRadius: 6, border: '0.5px solid #E8D5D5', padding: '0 8px', fontSize: 13, background: '#fff', boxSizing: 'border-box', outline: 'none', color: '#1a1a1a' };

export default function InstallmentRuleEditor({ value, onChange, price }) {
  const cfg = value || { enabled: false, periods: [] };
  const set = (patch) => onChange({ ...cfg, ...patch });
  const setPeriod = (i, patch) => set({ periods: (cfg.periods || []).map((p, idx) => idx === i ? { ...p, ...patch } : p) });
  const addPeriod = () => set({ periods: [...(cfg.periods || []), { percent: '', dueOffsetDays: (cfg.periods || []).length === 0 ? 0 : 30 }] });
  const removePeriod = (i) => set({ periods: (cfg.periods || []).filter((_, idx) => idx !== i) });
  const sumPct = (cfg.periods || []).reduce((s, p) => s + (Number(p.percent) || 0), 0);
  const priceNum = Number(price) || 0;

  return (
    <div style={{ border: '0.5px solid #E8D5D5', borderRadius: 8, padding: 12, background: '#FBF5F5' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#1a1a1a' }}>
        <input type="checkbox" checked={!!cfg.enabled}
          onChange={e => set({ enabled: e.target.checked, periods: e.target.checked && (!cfg.periods || cfg.periods.length < 2) ? [{ percent: 50, dueOffsetDays: 0 }, { percent: 50, dueOffsetDays: 30 }] : cfg.periods })}
          style={{ width: 15, height: 15 }} />
        開放分期付款（報名/購買時可選一次付清或分期）
      </label>
      {cfg.enabled && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 8, lineHeight: 1.5 }}>各期「比例(%)」與「到期間隔（自報名/購買日起算天數）」。第一期間隔通常填 0（簽約當下收頭款）。比例合計需 = 100%。</div>
          {(cfg.periods || []).map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#999', width: 32 }}>第{i + 1}期</span>
              <input type="number" value={p.percent} placeholder="比例" onChange={e => setPeriod(i, { percent: e.target.value })} style={inp} />
              <span style={{ fontSize: 11, color: '#999' }}>%</span>
              {priceNum > 0 && <span style={{ fontSize: 11, color: '#8B1A1A', minWidth: 60 }}>≈NT${Math.round(priceNum * (Number(p.percent) || 0) / 100).toLocaleString()}</span>}
              <input type="number" value={p.dueOffsetDays} placeholder="間隔" onChange={e => setPeriod(i, { dueOffsetDays: e.target.value })} style={inp} />
              <span style={{ fontSize: 11, color: '#999' }}>天後到期</span>
              <button type="button" onClick={() => removePeriod(i)} style={{ border: '0.5px solid #E8D5D5', background: '#fff', color: '#A32D2D', borderRadius: 6, width: 28, height: 30, cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <button type="button" onClick={addPeriod} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer' }}>＋ 新增一期</button>
            <span style={{ fontSize: 12, fontWeight: 600, color: sumPct === 100 ? '#2D7D46' : '#A32D2D' }}>比例合計 {sumPct}%{sumPct !== 100 ? '（需=100）' : ' ✓'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
