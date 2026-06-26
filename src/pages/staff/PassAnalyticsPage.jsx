import { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import client from '../../api/client';
import { useAuth } from '../../store/authStore';

const API = import.meta.env.VITE_API_BASE || 'https://redrock-api-production.up.railway.app';

const COLORS = {
  active:   '#2D7D46',
  expired:  '#A32D2D',
  used:     '#185FA5',
  unused:   '#E8D5D5',
  cancelled:'#999',
  pending:  '#854F0B',
  fullyUsed:'#8B1A1A',
};

const Stat = ({ label, value, color='#1a1a1a', sub }) => (
  <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'14px 16px', textAlign:'center' }}>
    <div style={{ fontSize:11, color:'#999', marginBottom:6 }}>{label}</div>
    <div style={{ fontSize:28, fontWeight:700, color }}>{value?.toLocaleString()}</div>
    {sub && <div style={{ fontSize:11, color:'#aaa', marginTop:4 }}>{sub}</div>}
  </div>
);

const SectionHeader = ({ title, type, token }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
    <div style={{ fontSize:15, fontWeight:700 }}>{title}</div>
    <a href={`${API}/pass-adjustments/analytics/download?type=${type}`}
      target="_blank" rel="noreferrer"
      onClick={e => {
        // Add auth header via fetch
        e.preventDefault();
        fetch(`${API}/pass-adjustments/analytics/download?type=${type}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.blob()).then(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${type}_${new Date().toISOString().slice(0,10)}.csv`;
          a.click(); URL.revokeObjectURL(url);
        });
      }}
      style={{ height:30, padding:'0 12px', borderRadius:6, background:'#185FA5', color:'#fff', fontSize:12, fontWeight:500, display:'flex', alignItems:'center', gap:4, textDecoration:'none', cursor:'pointer' }}>
      ⬇ 下載 CSV
    </a>
  </div>
);

export default function PassAnalyticsPage() {
  const { staff, token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/pass-adjustments/analytics')
      .then(r => setData(r.data))
      .catch(() => setError('載入失敗'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'#999' }}>載入統計資料中...</div>;
  if (error) return <div style={{ padding:40, textAlign:'center', color:'#A32D2D' }}>{error}</div>;
  if (!data) return null;

  const { passStats, discountStats, blackStats, ticketStats, bonusStats } = data;

  // 定期票 pie data
  const passPieData = [
    { name:'有效', value: passStats.active, color: COLORS.active },
    { name:'已過期', value: passStats.expired, color: COLORS.expired },
    { name:'已取消', value: passStats.cancelled, color: COLORS.cancelled },
  ].filter(d => d.value > 0);

  // 定期票 by type bar data
  const passByTypeData = Object.entries(passStats.byType||{}).map(([name, v]) => ({ name, ...v }));

  // 優惠卡 bar
  const discountBarData = [
    { name:'已發張數', value: discountStats.total },
    { name:'有效張數', value: discountStats.active },
    { name:'已用完', value: discountStats.fullyUsed },
    { name:'已過期', value: discountStats.expired },
  ];

  // 優惠卡次數 pie
  const discountCreditsPie = [
    { name:'已使用', value: discountStats.totalCreditsUsed, color: COLORS.used },
    { name:'剩餘', value: discountStats.totalCreditsRemaining, color: COLORS.active },
  ].filter(d => d.value > 0);

  // 單日券 pie
  const ticketPieData = [
    { name:'有效', value: ticketStats.valid, color: COLORS.active },
    { name:'已使用', value: ticketStats.used, color: COLORS.used },
    { name:'已過期', value: ticketStats.expired, color: COLORS.expired },
    { name:'待核准', value: ticketStats.pending, color: COLORS.pending },
  ].filter(d => d.value > 0);

  // 黑卡次數 pie
  const blackCreditsPie = [
    { name:'已使用', value: blackStats.totalCreditsUsed, color: COLORS.used },
    { name:'剩餘', value: blackStats.totalCreditsRemaining, color: COLORS.active },
  ].filter(d => d.value > 0);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background:'#fff', border:'0.5px solid #E8D5D5', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
        {label && <div style={{ fontWeight:600, marginBottom:4 }}>{label}</div>}
        {payload.map((p,i) => <div key={i} style={{ color: p.color||p.fill }}>{p.name}：{p.value?.toLocaleString()}</div>)}
      </div>
    );
  };

  return (
    <div style={{ padding:24, maxWidth:1000, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <div style={{ fontSize:20, fontWeight:700, color:'#1a1a1a' }}>📊 票券統計分析</div>
        <div style={{ fontSize:11, color:'#999' }}>更新時間：{data.generatedAt ? new Date(data.generatedAt).toLocaleString('zh-TW') : '—'}</div>
      </div>

      {/* ── 定期票 ── */}
      <div style={{ background:'#FBF5F5', borderRadius:14, border:'0.5px solid #E8D5D5', padding:20, marginBottom:16 }}>
        <SectionHeader title="📋 定期票" type="passes" token={token}/>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
          <Stat label="總發出數" value={passStats.total}/>
          <Stat label="有效" value={passStats.active} color={COLORS.active}/>
          <Stat label="已過期" value={passStats.expired} color={COLORS.expired}/>
          <Stat label="已取消" value={passStats.cancelled} color={COLORS.cancelled}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <div style={{ fontSize:12, color:'#666', marginBottom:8, fontWeight:500 }}>狀態分佈</div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={passPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({name,percent}) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {passPieData.map((e,i) => <Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip content={<CustomTooltip/>}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          {passByTypeData.length > 0 && (
            <div>
              <div style={{ fontSize:12, color:'#666', marginBottom:8, fontWeight:500 }}>各票種狀況</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={passByTypeData} layout="vertical" margin={{ left:8, right:8 }}>
                  <CartesianGrid strokeDasharray="3 3"/>
                  <XAxis type="number" fontSize={10}/>
                  <YAxis dataKey="name" type="category" fontSize={10} width={80}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Legend wrapperStyle={{ fontSize:11 }}/>
                  <Bar dataKey="active" name="有效" fill={COLORS.active} stackId="a"/>
                  <Bar dataKey="expired" name="過期" fill={COLORS.expired} stackId="a"/>
                  <Bar dataKey="cancelled" name="取消" fill={COLORS.cancelled} stackId="a"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── 優惠卡 ── */}
      <div style={{ background:'#FBF5F5', borderRadius:14, border:'0.5px solid #E8D5D5', padding:20, marginBottom:16 }}>
        <SectionHeader title="🎫 優惠卡" type="discounts" token={token}/>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
          <Stat label="總張數" value={discountStats.total}/>
          <Stat label="有效張數" value={discountStats.active} color={COLORS.active}/>
          <Stat label="已用完" value={discountStats.fullyUsed} color={COLORS.fullyUsed}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
          <Stat label="總發出次數" value={discountStats.totalCreditsIssued}/>
          <Stat label="已使用次數" value={discountStats.totalCreditsUsed} color={COLORS.used}/>
          <Stat label="剩餘次數" value={discountStats.totalCreditsRemaining} color={COLORS.active}/>
        </div>
        <div>
          <div style={{ fontSize:12, color:'#666', marginBottom:8, fontWeight:500 }}>次數使用率</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={discountCreditsPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({name,percent}) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                {discountCreditsPie.map((e,i) => <Cell key={i} fill={e.color}/>)}
              </Pie>
              <Tooltip content={<CustomTooltip/>}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 黑卡 ── */}
      <div style={{ background:'#FBF5F5', borderRadius:14, border:'0.5px solid #E8D5D5', padding:20, marginBottom:16 }}>
        <SectionHeader title="⬛ 黑卡" type="blacks" token={token}/>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
          <Stat label="總張數" value={blackStats.total}/>
          <Stat label="有效張數" value={blackStats.active} color={COLORS.active}/>
          <Stat label="已用完" value={blackStats.fullyUsed} color={COLORS.fullyUsed}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
          <Stat label="總發出次數" value={blackStats.totalCreditsIssued}/>
          <Stat label="已使用次數" value={blackStats.totalCreditsUsed} color={COLORS.used}/>
          <Stat label="剩餘次數" value={blackStats.totalCreditsRemaining} color={COLORS.active}/>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie data={blackCreditsPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} label={({name,percent}) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
              {blackCreditsPie.map((e,i) => <Cell key={i} fill={e.color}/>)}
            </Pie>
            <Tooltip content={<CustomTooltip/>}/>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* ── 單日券 ── */}
      <div style={{ background:'#FBF5F5', borderRadius:14, border:'0.5px solid #E8D5D5', padding:20, marginBottom:16 }}>
        <SectionHeader title="🎟 單日券" type="tickets" token={token}/>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
          <Stat label="總張數" value={ticketStats.total}/>
          <Stat label="有效" value={ticketStats.valid} color={COLORS.active}/>
          <Stat label="已使用" value={ticketStats.used} color={COLORS.used}/>
          <Stat label="已過期" value={ticketStats.expired} color={COLORS.expired}/>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie data={ticketPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({name,percent}) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
              {ticketPieData.map((e,i) => <Cell key={i} fill={e.color}/>)}
            </Pie>
            <Tooltip content={<CustomTooltip/>}/>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* ── 紅利 ── */}
      <div style={{ background:'#FBF5F5', borderRadius:14, border:'0.5px solid #E8D5D5', padding:20 }}>
        <SectionHeader title="🎁 紅利（無限練習權益）" type="bonuses" token={token}/>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
          <Stat label="總筆數" value={bonusStats.total}/>
          <Stat label="仍有效" value={bonusStats.active} color={COLORS.active}/>
          <Stat label="總天數" value={bonusStats.totalDaysIssued}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Stat label="已使用天數" value={bonusStats.totalDaysUsed} color={COLORS.used}/>
          <Stat label="剩餘天數" value={bonusStats.totalDaysRemaining} color={COLORS.active}/>
        </div>
      </div>
    </div>
  );
}
