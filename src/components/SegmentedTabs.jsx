// 統一分頁按鍵：灰底膠囊分段控制（全站員工/會員頁共用）
// 用法：<SegmentedTabs tabs={[{key,label,icon?}]} value={tab} onChange={setTab} />
// 條件分頁由呼叫端組 tabs 陣列（例：[{...}, ...(isAdmin?[{...}]:[])]）
export default function SegmentedTabs({ tabs, value, onChange, style, size = 'md' }) {
  const h = size === 'sm' ? 30 : 34;
  return (
    <div style={{
      display: 'flex', gap: 2, background: '#FBF5F5', border: '0.5px solid #E8D5D5',
      borderRadius: 8, padding: 3, ...style,
    }}>
      {(tabs || []).filter(Boolean).map(t => {
        const active = value === t.key;
        return (
          <button key={t.key} type="button" onClick={() => onChange(t.key)}
            title={typeof t.label === 'string' ? t.label : undefined}
            style={{
              // flex:1 → 滿寬容器時平均分佈；min-width 取內容寬 → 並排(space-between)容器時不壓縮/不截字
              flex: 1, height: h, borderRadius: 6, padding: '0 14px',
              border: active ? '0.5px solid #E8D5D5' : 'none',
              background: active ? '#fff' : 'transparent',
              fontSize: size === 'sm' ? 12 : 13, fontWeight: active ? 600 : 500,
              color: active ? '#1a1a1a' : '#999', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              whiteSpace: 'nowrap',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,.04)' : 'none', transition: 'all .12s',
            }}>
            {t.icon && <span style={{ flexShrink: 0 }}>{t.icon}</span>}
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
