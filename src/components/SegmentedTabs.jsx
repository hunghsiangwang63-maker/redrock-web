// 統一分頁按鍵：灰底膠囊分段控制（全站員工/會員頁共用）
// 用法：<SegmentedTabs tabs={[{key,label,icon?}]} value={tab} onChange={setTab} />
// 條件分頁由呼叫端組 tabs 陣列（例：[{...}, ...(isAdmin?[{...}]:[])]）
// wrap：分頁較多時（如會員/票券）允許換行，空間不夠自動分多行（每格最小 minTabWidth）
export default function SegmentedTabs({ tabs, value, onChange, style, size = 'md', wrap = false, minTabWidth = 120 }) {
  const h = size === 'sm' ? 30 : 34;
  return (
    <div style={{
      display: 'flex', flexWrap: wrap ? 'wrap' : 'nowrap', gap: wrap ? 4 : 2,
      background: '#FBF5F5', border: '0.5px solid #E8D5D5',
      borderRadius: 8, padding: 3, ...style,
    }}>
      {(tabs || []).filter(Boolean).map(t => {
        const active = value === t.key;
        return (
          <button key={t.key} type="button" onClick={() => onChange(t.key)}
            title={typeof t.label === 'string' ? t.label : undefined}
            style={{
              // wrap 時每格至少 minTabWidth，超出容器寬就換行；否則 flex:1 單行平均分佈
              flex: wrap ? `1 1 ${minTabWidth}px` : 1, height: h, borderRadius: 6, padding: '0 14px',
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
