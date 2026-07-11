import { useState, useEffect } from 'react';
import { getRevenueSummary, getDailyReport, getCheckinStats, getAdjustments, exportCheckinCsv, exportAdjustmentsCsv } from '../../api/revenue';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';
import SegmentedTabs from '../../components/SegmentedTabs';

// 日報表分類欄位（入場/租借/定期票 拆開）
const DAILY_COLS = [
  { key: 'checkin', label: '入場' },
  { key: 'rental',  label: '租借' },
  { key: 'pass',    label: '定期票' },
  { key: 'course',  label: '課程' },
  { key: 'product', label: '商品' },
];

const ENTRY_LABEL = {
  pass: '定期票', vip: 'VIP', course_access: '課程學員',
  discount_card: '優惠折扣券', black_card: '黑卡',
  single_entry_ticket: '單次入場券', single_ticket: '單次購票',
  child_free: '兒童免費', student_free: '學生免費',
};

const PAYMENT_LABEL = {
  cash: '現金', linepay: 'Line Pay', jkopay: '街口支付',
  taiwanpay: '台灣Pay', ecpay_atm: 'ATM轉帳',
};

const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };

export default function RevenuePage({ embedded = false }) {
  const { staff, viewGym } = useAuth();
  const [tab, setTab] = useState('overview');
  // 場館由頂部全域選擇器控制；營收屬報表類，「全館」(viewGym='') → undefined → 後端彙整所有館
  const gymFilter = staff?.role === 'super_admin' ? (viewGym || undefined) : (staff?.gymId || undefined);
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [checkinDaily, setCheckinDaily] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [adjNet, setAdjNet] = useState(0);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => { loadAll(); }, [days, gymFilter]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sumRes, dailyRes, checkinRes, adjRes] = await Promise.all([
        getRevenueSummary(gymFilter),
        getDailyReport({ days, gymId: gymFilter }),
        getCheckinStats({ days, gymId: gymFilter }),
        getAdjustments({ days, gymId: gymFilter }),
      ]);
      setSummary(sumRes.data);
      setDaily(dailyRes.data.daily || []);
      setCheckinDaily(checkinRes.data.daily || []);
      setAdjustments(adjRes.data.adjustments || []);
      setAdjNet(adjRes.data.netAdjust || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCheckin = async () => {
    try {
      const dateFrom = dayjs().subtract(days - 1, 'day').startOf('day').toISOString();
      const dateTo = dayjs().endOf('day').toISOString();
      const res = await exportCheckinCsv({ dateFrom, dateTo });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `checkin-${dayjs().format('YYYYMMDD')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('匯出失敗');
    }
  };

  const handleExportAdjustments = async () => {
    try {
      const res = await exportAdjustmentsCsv({ days, gymId: gymFilter });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `adjustments-${dayjs().format('YYYYMMDD')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('匯出失敗');
    }
  };

  const NT = (n) => `NT$${(n || 0).toLocaleString()}`;

  const TABS = [
    { key: 'overview', label: '營收總覽' },
    { key: 'checkin',  label: '入場統計' },
  ];

  return (
    <div style={{ padding: embedded?0:20, background:'#F7F3F3' }}>

      {/* Tab + 天數選擇 */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        {staff?.role === 'super_admin' && (
          <span style={{ fontSize:12, color:'#8B1A1A', fontWeight:600, marginRight:8, whiteSpace:'nowrap' }}>
            {viewGym === 'gym-hsinchu' ? '新竹館' : viewGym === 'gym-shilin' ? '士林館' : '🏛 全館彙整'}
          </span>
        )}
        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{ height:30, padding:'0 12px', borderRadius:6, border:'0.5px solid #E8D5D5', background: days===d ? '#8B1A1A' : '#fff', color: days===d ? '#fff' : '#666', fontSize:12, cursor:'pointer' }}>
              {d}天
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#999', fontSize:14 }}>載入中...</div>
      ) : (
        <>
          {/* ── 營收總覽 ── */}
          {tab === 'overview' && (
            <>
              {/* 統計卡片 */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
                {[
                  { label:'今日營收',   val: NT(summary?.today?.total), sub: `${summary?.today?.count || 0} 筆交易`, color:'#8B1A1A' },
                  { label:'本週營收',   val: NT(summary?.week?.total),  sub: `${summary?.week?.count || 0} 筆交易`,  color:'#2D7D46' },
                  { label:'本月累計',   val: NT(summary?.month?.total), sub: `${summary?.month?.count || 0} 筆交易`, color:'#185FA5' },
                ].map((s, i) => (
                  <div key={i} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'14px 16px', borderTop:`3px solid ${s.color}` }}>
                    <div style={{ fontSize:10, color:'#999', textTransform:'uppercase', letterSpacing:.8, fontWeight:600 }}>{s.label}</div>
                    <div style={{ fontSize:22, fontWeight:700, color:s.color, marginTop:5, fontFamily:'monospace' }}>{s.val}</div>
                    <div style={{ fontSize:11, color:'#999', marginTop:3 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* 預收貨款（課程/比賽已收款但尚未認列營收） */}
              {summary?.deferred > 0 && (
                <div style={{ background:'#FFF8E6', border:'0.5px solid #F0D68A', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#854F0B' }}>📦 預收貨款（已收未認列）</div>
                    <div style={{ fontSize:11, color:'#9A7B3A', marginTop:2 }}>課程／比賽已收款，營收於完成日（最後一堂課／比賽前一天）才認列</div>
                  </div>
                  <div style={{ fontSize:20, fontWeight:700, color:'#854F0B', fontFamily:'monospace', flexShrink:0 }}>{NT(summary.deferred)}</div>
                </div>
              )}

              {/* 付款方式分佈 */}
              {summary?.today?.byPayment && Object.keys(summary.today.byPayment).length > 0 && (
                <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginBottom:16 }}>
                  <div style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase', marginBottom:12 }}>今日付款方式</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {Object.entries(summary.today.byPayment).map(([method, amount]) => (
                      <div key={method} style={{ background:'#FBF5F5', borderRadius:8, padding:'8px 14px', fontSize:13 }}>
                        <span style={{ color:'#666' }}>{PAYMENT_LABEL[method] || method}</span>
                        <span style={{ fontWeight:700, color:'#8B1A1A', marginLeft:8, fontFamily:'monospace' }}>{NT(amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 日報表 */}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'0.5px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>日報表（近 {days} 天）</span>
                </div>
                {daily.length === 0 ? (
                  <div style={{ padding:32, textAlign:'center', color:'#999', fontSize:13 }}>此期間無交易紀錄</div>
                ) : (
                  <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:560 }}>
                    <thead>
                      <tr style={{ background:'#FBF5F5' }}>
                        {['日期', ...DAILY_COLS.map(c => c.label), '合計', '筆數'].map((h, i) => (
                          <th key={i} style={{ padding:'8px 10px', textAlign: i===0?'left':'right', fontSize:10, color:'#999', fontWeight:500, whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {daily.map((d, i) => (
                        <tr key={i} style={{ borderTop:'0.5px solid #F5EFEF' }}>
                          <td style={{ padding:'10px 10px', fontFamily:'monospace', fontSize:12, fontWeight:500, whiteSpace:'nowrap' }}>
                            {dayjs(d.date).format('MM/DD')}（{['日','一','二','三','四','五','六'][dayjs(d.date).day()]}）
                          </td>
                          {DAILY_COLS.map(c => (
                            <td key={c.key} style={{ padding:'10px 10px', textAlign:'right', fontFamily:'monospace', fontSize:12, whiteSpace:'nowrap', color: (d.byType?.[c.key] || 0) !== 0 ? '#1a1a1a' : '#ccc' }}>
                              {NT(d.byType?.[c.key] || 0)}
                            </td>
                          ))}
                          <td style={{ padding:'10px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#8B1A1A', fontSize:14, whiteSpace:'nowrap' }}>
                            {NT(d.total)}
                          </td>
                          <td style={{ padding:'10px 10px', textAlign:'right', color:'#999', fontSize:12, whiteSpace:'nowrap' }}>{d.count} 筆</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop:'2px solid #E8D5D5', background:'#FBF5F5' }}>
                        <td style={{ padding:'10px 10px', fontWeight:600, whiteSpace:'nowrap' }}>{days}天合計</td>
                        {DAILY_COLS.map(c => (
                          <td key={c.key} style={{ padding:'10px 10px', textAlign:'right', fontFamily:'monospace', fontSize:12, whiteSpace:'nowrap', color:'#666' }}>
                            {NT(daily.reduce((a, b) => a + (b.byType?.[c.key] || 0), 0))}
                          </td>
                        ))}
                        <td style={{ padding:'10px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:15, color:'#8B1A1A', whiteSpace:'nowrap' }}>
                          {NT(daily.reduce((a, b) => a + b.total, 0))}
                        </td>
                        <td style={{ padding:'10px 10px', textAlign:'right', color:'#999', fontSize:12, whiteSpace:'nowrap' }}>
                          {daily.reduce((a, b) => a + b.count, 0)} 筆
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  </div>
                )}
              </div>

              {/* 加減項（來源：每日結帳 deductions；抽屜現金加減、非銷售收入，不併入營收總數） */}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden', marginTop:16 }}>
                <div style={{ padding:'12px 16px', borderBottom:'0.5px solid #E8D5D5' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>加減項（近 {days} 天結帳）</span>
                    {adjustments.length > 0 && (
                      <button onClick={handleExportAdjustments}
                        style={{ height:28, padding:'0 12px', borderRadius:6, border:'0.5px solid #E8D5D5', background:'none', fontSize:12, color:'#6b6b6b', cursor:'pointer', flexShrink:0 }}>
                        ↓ 匯出 CSV
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:'#B08A3E', marginTop:3, textAlign:'left' }}>結帳時抽屜現金的手動加／減，非銷售收入、不併入上方營收總數</div>
                </div>
                {adjustments.length === 0 ? (
                  <div style={{ padding:32, textAlign:'center', color:'#999', fontSize:13 }}>此期間無加減項</div>
                ) : (
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#FBF5F5' }}>
                        {[['日期','left'],['館別','left'],['類型','left'],['金額','right'],['備註','left']].map(([h, al], i) => (
                          <th key={i} style={{ padding:'8px 14px', textAlign:al, fontSize:10, color:'#999', fontWeight:500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {adjustments.map((a, i) => (
                        <tr key={i} style={{ borderTop:'0.5px solid #F5EFEF' }}>
                          <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12, fontWeight:500 }}>
                            {dayjs(a.date).format('MM/DD')}（{['日','一','二','三','四','五','六'][dayjs(a.date).day()]}）
                          </td>
                          <td style={{ padding:'10px 14px', fontSize:12, color:'#666' }}>{GYM_LABEL[a.gymId] || a.gymId || '—'}</td>
                          <td style={{ padding:'10px 14px', fontSize:12 }}>{a.type || '—'}</td>
                          <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontSize:13, fontWeight:600, color: a.sign === '+' ? '#2D7D46' : '#B3261E' }}>
                            {a.sign === '+' ? '+' : '−'}{NT(a.amount)}
                          </td>
                          <td style={{ padding:'10px 14px', fontSize:12, color:'#666' }}>{a.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop:'2px solid #E8D5D5', background:'#FBF5F5' }}>
                        <td style={{ padding:'10px 14px', fontWeight:600 }} colSpan={3}>淨額小計</td>
                        <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:14, color: adjNet >= 0 ? '#2D7D46' : '#B3261E' }}>
                          {adjNet >= 0 ? '+' : '−'}{NT(Math.abs(adjNet))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ── 入場統計 ── */}
          {tab === 'checkin' && (
            <>
              {/* 統計卡片 */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
                {[
                  { label:'今日入場', val: checkinDaily[0]?.count || 0, color:'#8B1A1A' },
                  { label:'今日收費', val: NT(checkinDaily[0]?.revenue), color:'#2D7D46' },
                  { label:`${days}天入場`, val: checkinDaily.reduce((a,b) => a+b.count, 0), color:'#185FA5' },
                  { label:`${days}天收費`, val: NT(checkinDaily.reduce((a,b) => a+(b.revenue||0), 0)), color:'#854F0B' },
                ].map((s, i) => (
                  <div key={i} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'14px 16px', borderTop:`3px solid ${s.color}` }}>
                    <div style={{ fontSize:10, color:'#999', textTransform:'uppercase', letterSpacing:.8, fontWeight:600 }}>{s.label}</div>
                    <div style={{ fontSize:22, fontWeight:700, color:s.color, marginTop:5, fontFamily:'monospace' }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* 入場日報 */}
              <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'0.5px solid #E8D5D5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, color:'#999', fontWeight:600, letterSpacing:.5, textTransform:'uppercase' }}>入場日報（近 {days} 天）</span>
                  <button onClick={handleExportCheckin}
                    style={{ height:28, padding:'0 12px', borderRadius:6, border:'0.5px solid #E8D5D5', background:'none', fontSize:12, color:'#6b6b6b', cursor:'pointer' }}>
                    ↓ 匯出 CSV
                  </button>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#FBF5F5' }}>
                      {['日期', '入場人數', '定期票', '優惠卡', '黑卡', '單次', '免費', '收費'].map((h, i) => (
                        <th key={i} style={{ padding:'8px 14px', textAlign: i===0?'left':'right', fontSize:10, color:'#999', fontWeight:500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {checkinDaily.map((d, i) => (
                      <tr key={i} style={{ borderTop:'0.5px solid #F5EFEF' }}>
                        <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12, fontWeight:500 }}>
                          {dayjs(d.date).format('MM/DD')}（{['日','一','二','三','四','五','六'][dayjs(d.date).day()]}）
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:600, color:'#8B1A1A' }}>{d.count}</td>
                        <td style={{ padding:'10px 14px', textAlign:'right', color: d.byType?.pass > 0 ? '#2D7D46' : '#ccc' }}>{d.byType?.pass || 0}</td>
                        <td style={{ padding:'10px 14px', textAlign:'right', color: d.byType?.discount_card > 0 ? '#185FA5' : '#ccc' }}>{d.byType?.discount_card || 0}</td>
                        <td style={{ padding:'10px 14px', textAlign:'right', color: d.byType?.black_card > 0 ? '#854F0B' : '#ccc' }}>{d.byType?.black_card || 0}</td>
                        <td style={{ padding:'10px 14px', textAlign:'right', color: (d.byType?.single_ticket || 0) + (d.byType?.single_entry_ticket || 0) > 0 ? '#533AB7' : '#ccc' }}>
                          {(d.byType?.single_ticket || 0) + (d.byType?.single_entry_ticket || 0)}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', color: (d.byType?.child_free || 0) + (d.byType?.student_free || 0) + (d.byType?.vip || 0) > 0 ? '#0F6E56' : '#ccc' }}>
                          {(d.byType?.child_free || 0) + (d.byType?.student_free || 0) + (d.byType?.vip || 0)}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:'#8B1A1A' }}>{NT(d.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:'2px solid #E8D5D5', background:'#FBF5F5' }}>
                      <td style={{ padding:'10px 14px', fontWeight:600 }}>{days}天合計</td>
                      <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, color:'#8B1A1A' }}>
                        {checkinDaily.reduce((a,b) => a+b.count, 0)}
                      </td>
                      <td colSpan={5}></td>
                      <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#8B1A1A' }}>
                        {NT(checkinDaily.reduce((a,b) => a+(b.revenue||0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
