// 年／月下拉選單（輸出 'YYYY-MM'）——取代 <input type="month">：
// 桌面版 Safari 等瀏覽器不支援 month 輸入，會退化成純文字框，選不到月份、送出的值不是 YYYY-MM，
// 後端會當成無效月份（曾悄悄改用當月，造成「不管選幾月都下載到當月資料」）。下拉選單各瀏覽器行為一致。
import dayjs from 'dayjs';

export default function MonthSelect({ value, onChange, style, startYear = 2024 }) {
  const now = dayjs();
  const m = /^(\d{4})-(\d{2})$/.exec(value || '');
  const year = m ? Number(m[1]) : now.year();
  const month = m ? Number(m[2]) : now.month() + 1;
  const endYear = Math.max(now.year() + 1, year);
  const years = [];
  for (let y = endYear; y >= Math.min(startYear, year); y--) years.push(y);
  const emit = (y, mo) => onChange(`${y}-${String(mo).padStart(2, '0')}`);
  const sel = { color: '#1a1a1a', ...style };
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <select value={year} onChange={e => emit(Number(e.target.value), month)} style={sel} aria-label="年">
        {years.map(y => <option key={y} value={y}>{y} 年</option>)}
      </select>
      <select value={month} onChange={e => emit(year, Number(e.target.value))} style={sel} aria-label="月">
        {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => <option key={mo} value={mo}>{mo} 月</option>)}
      </select>
    </span>
  );
}
