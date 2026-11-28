import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getCrashPadCalendar } from '../api/rentals';
import MonthSelect from './MonthSelect';

// 抱石墊租借月曆（員工端 器材租借管理 → 「抱石墊月曆」）
// 一個月一張；每天分「士林／新竹」兩列；出借期間每天寫租借人姓名＋數量（數字），並用實心方塊表示張數。
// 借出日～歸還日（含歸還當天）都用實心方塊、都算占用（歸還當天標「還」；現場當天無法再借出）。
// 新竹那一列加底色，方便和士林區分。
const GYMS = [{ id: 'gym-shilin', name: '士林' }, { id: 'gym-hsinchu', name: '新竹' }];
const STATUS_COLOR = { pending: '#F59E0B', confirmed: '#D32F2F', active: '#D32F2F', returned: '#6B7280' };
const ROW_BG = { 'gym-hsinchu': '#E3F0FF' };   // 新竹列底色
const STATUS_TEXT = { pending: '待確認', confirmed: '已確認', active: '使用中', returned: '已歸還' };
const WD = ['日', '一', '二', '三', '四', '五', '六'];

const Squares = ({ n, color, hollow }) => (
  <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 2, maxWidth: '100%' }}>
    {Array.from({ length: Math.min(n, 12) }, (_, i) => (
      <span key={i} style={{ width: 10, height: 10, boxSizing: 'border-box', background: hollow ? 'transparent' : color, border: '1px solid rgba(0,0,0,.35)' }} />
    ))}
    {n > 12 && <span style={{ fontSize: 9, color }}>+{n - 12}</span>}
  </span>
);

export default function CrashPadCalendar() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [rows, setRows] = useState(null); // null=載入中 | 'error'
  useEffect(() => {
    let alive = true;
    setRows(null);
    getCrashPadCalendar(month).then(r => { if (alive) setRows(r.data.rentals || []); }).catch(() => { if (alive) setRows('error'); });
    return () => { alive = false; };
  }, [month]);

  const first = dayjs(`${month}-01`);
  const days = [];
  for (let i = 0; i < first.day(); i++) days.push(null);
  for (let d = 1; d <= first.daysInMonth(); d++) days.push(first.date(d).format('YYYY-MM-DD'));
  while (days.length % 7) days.push(null);
  const today = dayjs().format('YYYY-MM-DD');
  const list = Array.isArray(rows) ? rows : [];
  const move = (n) => setMonth(dayjs(`${month}-01`).add(n, 'month').format('YYYY-MM'));
  const navBtn = { height: 34, padding: '0 12px', borderRadius: 8, border: '0.5px solid #E8D5D5', background: '#fff', fontSize: 13, cursor: 'pointer' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => move(-1)} style={navBtn}>‹ 上月</button>
        <MonthSelect value={month} onChange={setMonth} />
        <button onClick={() => move(1)} style={navBtn}>下月 ›</button>
        <button onClick={() => setMonth(dayjs().format('YYYY-MM'))} style={navBtn}>本月</button>
        <div style={{ fontSize: 15, fontWeight: 700, marginLeft: 6 }}>{first.format('YYYY 年 M 月')} 抱石墊租借</div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: '#666', marginBottom: 10, alignItems: 'center' }}>
        {['pending', 'confirmed', 'returned'].map(k => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Squares n={1} color={STATUS_COLOR[k]} />{k === 'confirmed' ? '已確認／使用中' : STATUS_TEXT[k]}</span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 14, background: '#E3F0FF', border: '1px solid #C9DDF5' }} />新竹列</span>
        <span>方塊＝張數（歸還當天也算占用、無法再借出，姓名後標「還」）；列標右側數字＝當日該館占用張數</span>
      </div>
      {rows === 'error' && <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 10 }}>⚠️ 月曆載入失敗，請稍後再試（空白不代表沒有租借）</div>}
      {rows === null && <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>載入中…</div>}
      {Array.isArray(rows) && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 840 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#E8D5D5', border: '1px solid #E8D5D5', borderRadius: 8, overflow: 'hidden' }}>
              {WD.map(w => <div key={w} style={{ background: '#F6EDED', textAlign: 'center', fontSize: 12, fontWeight: 600, padding: '6px 0', color: w === '日' || w === '六' ? '#A32D2D' : '#444' }}>週{w}</div>)}
              {days.map((d, i) => {
                if (!d) return <div key={'e' + i} style={{ background: '#FAF6F6', minHeight: 120 }} />;
                return (
                  <div key={d} style={{ background: d === today ? '#FFF8E6' : '#fff', minHeight: 120, padding: 4, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 12, fontWeight: d === today ? 800 : 600, color: d === today ? '#B7791F' : '#555', marginBottom: 2 }}>{Number(d.slice(8))}</div>
                    {GYMS.map(g => {
                      const here = list.filter(r => r.gymId === g.id && r.pickupDate <= d && d <= r.returnDate);
                      const sum = here.reduce((a, r) => a + r.quantity, 0);
                      return (
                        <div key={g.id} style={{ borderTop: '0.5px dashed #E8D5D5', padding: '3px 4px', minHeight: 40, margin: '0 -4px', background: ROW_BG[g.id] || 'transparent', flex: g.id === 'gym-hsinchu' ? 1 : '0 0 auto' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{g.name}</span>{sum > 0 && <span style={{ color: '#8B1A1A' }}>{sum}</span>}
                          </div>
                          {here.map(r => {
                            const isReturn = d === r.returnDate;
                            const c = STATUS_COLOR[r.status] || '#D32F2F';
                            return (
                              <div key={r.id} title={`${r.memberName} ${r.pickupDate.slice(5)}～${r.returnDate.slice(5)}（${STATUS_TEXT[r.status] || r.status}）${r.overStock ? '・需調度' : ''}`} style={{ marginTop: 2, lineHeight: 1.25 }}>
                                <div style={{ fontSize: 11, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {r.memberName}　<b style={{ color: c }}>{r.quantity}</b>{isReturn ? ' 還' : ''}{r.overStock ? ' ⚠' : ''}
                                </div>
                                <Squares n={r.quantity} color={c} />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
