// 分期規則編輯器（用於課程 / 定期票種設定）
// mode='days'（預設，定期票用）：value = { enabled, periods:[{ percent, dueOffsetDays }] }，到期＝報名/購買日起算天數。
// mode='session'（課程用）：value = { enabled, periods:[{ percent, dueAtSession }] }，dueAtSession：0＝報名當天、
//   N(>=1)＝第N堂課到期（依會員實際上課場次排序，插班則從其加入後的場次算起）。
// 兩種模式比例合計皆應=100，第一期通常0（天/堂）＝簽約當下收。
const inp = { width: 66, height: 30, borderRadius: 6, border: '0.5px solid #E8D5D5', padding: '0 8px', fontSize: 13, background: '#fff', boxSizing: 'border-box', outline: 'none', color: '#1a1a1a' };
const DUE_FIELD = { days: 'dueOffsetDays', session: 'dueAtSession' };

export default function InstallmentRuleEditor({ value, onChange, price, mode = 'days' }) {
  const dueField = DUE_FIELD[mode] || DUE_FIELD.days;
  const cfg = value || { enabled: false, periods: [] };
  const set = (patch) => onChange({ ...cfg, ...patch });
  const setPeriod = (i, patch) => set({ periods: (cfg.periods || []).map((p, idx) => idx === i ? { ...p, ...patch } : p) });
  const addPeriod = () => set({ periods: [...(cfg.periods || []), { percent: '', [dueField]: (cfg.periods || []).length === 0 ? 0 : (mode === 'session' ? (cfg.periods || []).length : 30) }] });
  const removePeriod = (i) => set({ periods: (cfg.periods || []).filter((_, idx) => idx !== i) });
  const sumPct = (cfg.periods || []).reduce((s, p) => s + (Number(p.percent) || 0), 0);
  const priceNum = Number(price) || 0;
  const defaultPeriods = mode === 'session'
    ? [{ percent: 50, dueAtSession: 0 }, { percent: 50, dueAtSession: 1 }]
    : [{ percent: 50, dueOffsetDays: 0 }, { percent: 50, dueOffsetDays: 30 }];

  return (
    <div style={{ border: '0.5px solid #E8D5D5', borderRadius: 8, padding: 12, background: '#FBF5F5' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#1a1a1a' }}>
        <input type="checkbox" checked={!!cfg.enabled}
          onChange={e => set({ enabled: e.target.checked, periods: e.target.checked && (!cfg.periods || cfg.periods.length < 2) ? defaultPeriods : cfg.periods })}
          style={{ width: 15, height: 15 }} />
        開放分期付款（報名/購買時可選一次付清或分期）
      </label>
      {cfg.enabled && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 8, lineHeight: 1.5 }}>
            {mode === 'session'
              ? '各期「比例(%)」與「到期時點（第幾堂課，0＝報名當天）」。第一期通常填 0（簽約當下收頭款）。比例合計需 = 100%。'
              : '各期「比例(%)」與「到期間隔（自報名/購買日起算天數）」。第一期間隔通常填 0（簽約當下收頭款）。比例合計需 = 100%。'}
          </div>
          {(cfg.periods || []).map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#999', width: 32 }}>第{i + 1}期</span>
              <input type="number" value={p.percent} placeholder="比例" onChange={e => setPeriod(i, { percent: e.target.value })} style={inp} />
              <span style={{ fontSize: 11, color: '#999' }}>%</span>
              {priceNum > 0 && <span style={{ fontSize: 11, color: '#8B1A1A', minWidth: 60 }}>≈NT${Math.round(priceNum * (Number(p.percent) || 0) / 100).toLocaleString()}</span>}
              <input type="number" value={p[dueField]} placeholder={mode === 'session' ? '第幾堂' : '間隔'} onChange={e => setPeriod(i, { [dueField]: e.target.value })} style={inp} />
              <span style={{ fontSize: 11, color: '#999' }}>{mode === 'session' ? (Number(p[dueField]) > 0 ? '堂課後到期' : '（報名當天）') : '天後到期'}</span>
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
