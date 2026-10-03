// 文件語言切換（中文／English／日本語）——segmented 風格，簽署頁與家長簽署頁共用
const OPTIONS = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
  { key: 'ja', label: '日本語' },
];

// hideJa：日文內容尚未設定時隱藏「日本語」鈕，避免點了卻看到中文
export default function DocLangSwitch({ value, onChange, fullWidth = false, hideJa = false }) {
  return (
    <div style={{
      display: fullWidth ? 'flex' : 'inline-flex', gap: 2, padding: 2, borderRadius: 9,
      background: '#F3EAEA', width: fullWidth ? '100%' : 'auto',
    }}>
      {OPTIONS.filter(o => !(hideJa && o.key === 'ja')).map(o => {
        const active = value === o.key;
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)}
            style={{
              flex: fullWidth ? 1 : 'none', height: 28, padding: '0 12px', borderRadius: 7, border: 'none',
              background: active ? '#8B1A1A' : 'transparent', color: active ? '#fff' : '#6b4a4a',
              fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{o.label}</button>
        );
      })}
    </div>
  );
}
