// 簽署文件段落渲染（風險安全聲明書／墜落測驗同意書共用）
// 規則：第一行若是短標題（不以編號/破折號開頭、不以句號結尾、≤40字）→ 粗體標題；
//       「1. 」編號行 → 編號欄＋懸掛縮排；「- 」條列行 → 再往內縮的圓點；其餘為一般內文。
const NUM_RE = /^(\d+)[.、)]\s*(.*)$/;
const DASH_RE = /^[-–˙•]\s*(.*)$/;
const isHeading = (line) =>
  line.length <= 40 && !NUM_RE.test(line) && !DASH_RE.test(line) && !/[。.!！?？]$/.test(line);

export default function DocParagraph({ text }) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const hasHeading = lines.length > 1 && isHeading(lines[0]);
  const body = hasHeading ? lines.slice(1) : lines;

  return (
    <div style={{ fontSize: 13, lineHeight: 1.75, color: '#333', textAlign: 'left', flex: 1, minWidth: 0 }}>
      {hasHeading && (
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#8B1A1A', marginBottom: 6 }}>{lines[0]}</div>
      )}
      {body.map((line, i) => {
        const num = line.match(NUM_RE);
        if (num) {
          return (
            <div key={i} style={{ display: 'flex', gap: 6, marginTop: i ? 3 : 0 }}>
              <span style={{ flexShrink: 0, minWidth: 18, color: '#8B1A1A', fontWeight: 600 }}>{num[1]}.</span>
              <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{num[2]}</span>
            </div>
          );
        }
        const dash = line.match(DASH_RE);
        if (dash) {
          return (
            <div key={i} style={{ display: 'flex', gap: 6, marginTop: 2, paddingLeft: 24 }}>
              <span style={{ flexShrink: 0, color: '#B08A8A' }}>•</span>
              <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{dash[1]}</span>
            </div>
          );
        }
        return <div key={i} style={{ marginTop: i ? 4 : 0, wordBreak: 'break-word' }}>{line}</div>;
      })}
    </div>
  );
}
