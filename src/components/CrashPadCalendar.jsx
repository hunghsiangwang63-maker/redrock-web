import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getCrashPadCalendar } from '../api/rentals';
import MonthSelect from './MonthSelect';

// 抱石墊租借月曆（員工端 器材租借管理 → 「抱石墊月曆」）
// 一個月一張；每天分「士林／新竹」兩列；出借期間每天寫租借人姓名＋數量（數字），並用實心方塊表示張數。
// 借出日～歸還日前一天＝實際占用（實心方塊）；歸還當天標「還」並用空心方塊（當天即可再借出，不算占用）。
const GYMS = [{ id: 'gym-shilin', name: '士林' }, { id: 'gym-hsinchu', name: '新竹' }];
const STATUS_COLOR = { pending: '#E8A317', confirmed: '#8B1A1A', active: '#8B1A1A', returned: '#9CA3AF' };
const STATUS_TEXT = { pending: '待確認', confirmed: '已確認', active: '使用中', returned: '已歸還' };
const WD = ['日', '一', '二', '三', '四', '五', '六'];

const Squares = ({ n, color, hollow }) => (
  <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 2, maxWidth: '100%' }}>
    {Array.from({ length: Math.min(n, 12) }, (_, i) => (
      <span key={i} style={{ width: 8, height: 8, boxSizing: 'border-box', background: hollow ? 'transparent' : color, border: `1.5px solid ${color}` }} />
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Squares n={1} color="#555" hollow />歸還當天（可再借出，不算占用）</span>
        <span>方塊＝張數；列標右側數字＝當日該館占用張數</span>
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
                  <div key={d} style={{ background: d === today ? '#FFF8E6' : '#fff', minHeight: 120, padding: 4, boxSizing: 'border-box' }}>
                    <div style={{ fontSize: 12, fontWeight: d === today ? 800 : 600, color: d === today ? '#B7791F' : '#555', marginBottom: 2 }}>{Number(d.slice(8))}</div>
                    {GYMS.map(g => {
                      const here = list.filter(r => r.gymId === g.id && r.pickupDate <= d && d <= r.returnDate);
                      const sum = here.filter(r => d < r.returnDate).reduce((a, r) => a + r.quantity, 0);
                      return (
                        <div key={g.id} style={{ borderTop: '0.5px dashed #E8D5D5', padding: '3px 0', minHeight: 40 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#888', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{g.name}</span>{sum > 0 && <span style={{ color: '#8B1A1A' }}>{sum}</span>}
                          </div>
                          {here.map(r => {
                            const isReturn = d === r.returnDate;
                            const c = isReturn ? '#555' : (STATUS_COLOR[r.status] || '#8B1A1A');
                            return (
                              <div key={r.id} title={`${r.memberName} ${r.pickupDate.slice(5)}～${r.returnDate.slice(5)}（${STATUS_TEXT[r.status] || r.status}）${r.overStock ? '・需調度' : ''}`} style={{ marginTop: 2, lineHeight: 1.25 }}>
                                <div style={{ fontSize: 11, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {r.memberName}　<b style={{ color: c }}>{r.quantity}</b>{isReturn ? ' 還' : ''}{r.overStock ? ' ⚠' : ''}
                                </div>
                                <Squares n={r.quantity} color={c} hollow={isReturn} />
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
