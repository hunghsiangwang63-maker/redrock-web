// 工作坊退費分級編輯器（僅 type==='workshop' 用）
// value = null（套用系統預設）或 [{ daysBefore, rate }]（自訂級距，rate 為 0~1 小數，UI 顯示為 0~100 整數百分比）
const inp = { width: 66, height: 30, borderRadius: 6, border: '0.5px solid #E8D5D5', padding: '0 8px', fontSize: 13, background: '#fff', boxSizing: 'border-box', outline: 'none', color: '#1a1a1a' };
const DEFAULT_TIERS = [
  { daysBefore: 7, rate: 1.0 },
  { daysBefore: 3, rate: 0.5 },
  { daysBefore: 1, rate: 0.2 },
];

export default function WorkshopRefundTiersEditor({ value, onChange }) {
  const custom = Array.isArray(value) && value.length > 0;
  const tiers = custom ? value : DEFAULT_TIERS;
  const setTier = (i, patch) => onChange(tiers.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  const addTier = () => onChange([...tiers, { daysBefore: 0, rate: 0 }]);
  const removeTier = (i) => onChange(tiers.filter((_, idx) => idx !== i));

  return (
    <div style={{ border: '0.5px solid #E8D5D5', borderRadius: 8, padding: 12, background: '#FBF5F5' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#1a1a1a' }}>
        <input type="checkbox" checked={custom}
          onChange={e => onChange(e.target.checked ? DEFAULT_TIERS.map(t => ({ ...t })) : null)}
          style={{ width: 15, height: 15 }} />
        自訂此梯次退費級距（未勾選＝套用系統預設：7天以上100%／3~6天50%／1~2天20%）
      </label>
      {custom && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 8, lineHeight: 1.5 }}>
            整筆退課，依「距開課天數」決定退費比例。天數由大到小排列，第一個「距開課天數 ≥ 設定值」的級距即適用；皆不符（含開課當天或之後）不予退費。
          </div>
          {tiers.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#999' }}>距開課</span>
              <input type="number" min="0" value={t.daysBefore} onChange={e => setTier(i, { daysBefore: Number(e.target.value) || 0 })} style={inp} />
              <span style={{ fontSize: 11, color: '#999' }}>天以上，退</span>
              <input type="number" min="0" max="100" value={Math.round((t.rate || 0) * 100)}
                onChange={e => setTier(i, { rate: (Number(e.target.value) || 0) / 100 })} style={inp} />
              <span style={{ fontSize: 11, color: '#999' }}>%</span>
              <button type="button" onClick={() => removeTier(i)}
                style={{ border: '0.5px solid #E8D5D5', background: '#fff', color: '#A32D2D', borderRadius: 6, width: 28, height: 30, cursor: 'pointer' }}>✕</button>
            </div>
          ))}
          <button type="button" onClick={addTier} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer' }}>＋ 新增級距</button>
        </div>
      )}
    </div>
  );
}
