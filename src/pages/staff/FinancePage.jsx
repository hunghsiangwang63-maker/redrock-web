import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import RevenuePage from './RevenuePage';
import InstallmentsPage from './InstallmentsPage';
import SegmentedTabs from '../../components/SegmentedTabs';
import client from '../../api/client';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';

const TABS = [
  { key:'revenue',      icon:'📊', label:'營收報表' },
  { key:'installments', icon:'📆', label:'分期付款' },
  { key:'monthly',      icon:'📥', label:'月銷售紀錄' },
];

export default function FinancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'revenue');
  const { staff } = useAuth();
  const isSuper = staff?.role === 'super_admin';
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [gym, setGym] = useState(staff?.gymId || 'gym-hsinchu');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // 發票明細（每兩個月）
  const [ivYear, setIvYear] = useState(dayjs().year());
  const [bimonth, setBimonth] = useState(Math.ceil((dayjs().month() + 1) / 2));
  const [track, setTrack] = useState('');
  const [busy2, setBusy2] = useState(false);
  const [err2, setErr2] = useState('');

  const handleTab = (key) => { setTab(key); setSearchParams({ tab: key }); };

  const downloadInvoice = async () => {
    setBusy2(true); setErr2('');
    try {
      const API = import.meta.env.VITE_API_BASE || 'https://api.redrocktaiwan.com';
      const tok = localStorage.getItem('operatorToken') || localStorage.getItem('token') || localStorage.getItem('stationToken') || '';
      const r = await fetch(`${API}/daily-settlements/invoice-export?year=${ivYear}&bimonth=${bimonth}&gymId=${gym}&track=${encodeURIComponent(track)}`, { headers: { Authorization: `Bearer ${tok}` } });
      if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`${r.status} ${t.slice(0, 220)}`); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const m1 = String((bimonth - 1) * 2 + 1).padStart(2, '0');
      const a = document.createElement('a'); a.href = url;
      a.download = `發票明細_${gym === 'gym-hsinchu' ? '新竹' : '士林'}_${ivYear}${m1}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) { setErr2('下載失敗：' + e.message); }
    finally { setBusy2(false); }
  };

  const downloadMonthly = async () => {
    setBusy(true); setErr('');
    try {
      const API = import.meta.env.VITE_API_BASE || 'https://api.redrocktaiwan.com';
      const tok = localStorage.getItem('operatorToken') || localStorage.getItem('token') || localStorage.getItem('stationToken') || '';
      const r = await fetch(`${API}/daily-settlements/monthly-export?month=${month}&gymId=${gym}`, { headers: { Authorization: `Bearer ${tok}` } });
      if (!r.ok) { throw new Error(r.status === 403 ? '僅管理員可下載' : `伺服器錯誤 ${r.status}`); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `月銷售紀錄_${gym === 'gym-hsinchu' ? '新竹' : '士林'}_${month}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) { setErr('下載失敗：' + e.message); }
    finally { setBusy(false); }
  };

  const ctl = { height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', color:'#1a1a1a' };

  return (
    <div style={{ background:'#F7F3F3' }}>
      <div style={{ background:'#fff', borderBottom:'0.5px solid #E8D5D5', padding:'12px 20px' }}>
        <SegmentedTabs tabs={TABS} value={tab} onChange={handleTab} />
      </div>
      {tab === 'revenue'      && <RevenuePage embedded />}
      {tab === 'installments' && <InstallmentsPage embedded />}
      {tab === 'monthly' && (
        <div style={{ padding:24, maxWidth:600 }}>
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:20 }}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>📥 下載月銷售紀錄</div>
            <div style={{ fontSize:12, color:'#999', marginBottom:16, lineHeight:1.6 }}>
              整月每日一欄的 Excel，自動帶入每日結帳：實收總額／行動支付／現金清點與差異／發票起訖·作廢號／票卡最前號／check-in 人數／品項銷售明細（入場·票種·岩鞋·商品·課程）。<br/>
              （資料來源＝每日結帳紀錄；未結帳的日期該欄留空。）
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
              {isSuper && (
                <select value={gym} onChange={e => setGym(e.target.value)} style={ctl}>
                  <option value="gym-hsinchu">新竹館</option>
                  <option value="gym-shilin">士林館</option>
                </select>
              )}
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={ctl} />
              <button onClick={downloadMonthly} disabled={busy}
                style={{ height:36, padding:'0 18px', borderRadius:8, background: busy ? '#9CB9A6' : '#2D7D46', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? '產生中…' : '下載 Excel'}
              </button>
            </div>
            {err && <div style={{ marginTop:12, fontSize:12, color:'#A32D2D' }}>{err}</div>}
          </div>

          {/* 發票明細表（每兩個月 · FOR 記帳士） */}
          <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:20, marginTop:14 }}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>📑 發票明細表（每兩個月 · FOR 記帳士）</div>
            <div style={{ fontSize:12, color:'#999', marginBottom:16, lineHeight:1.6 }}>
              一期兩個月、逐日列：開立發票起迄號／發票總金額／作廢號／優惠卡·全票最前號／交易客次（依起迄號計）。表頭含統一編號·營業人名稱·發票字軌（字軌每期會換，請填當期）。
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
              {isSuper && (
                <select value={gym} onChange={e => setGym(e.target.value)} style={ctl}>
                  <option value="gym-hsinchu">新竹館</option>
                  <option value="gym-shilin">士林館</option>
                </select>
              )}
              <select value={ivYear} onChange={e => setIvYear(Number(e.target.value))} style={ctl}>
                {[0,1,2,3].map(o => { const y = dayjs().year() - o; return <option key={y} value={y}>{y} 年</option>; })}
              </select>
              <select value={bimonth} onChange={e => setBimonth(Number(e.target.value))} style={ctl}>
                {['1/2月','3/4月','5/6月','7/8月','9/10月','11/12月'].map((l, i) => <option key={i} value={i+1}>{l}</option>)}
              </select>
              <input value={track} onChange={e => setTrack(e.target.value)} placeholder="發票字軌 例:JF" style={{ ...ctl, width:120 }} />
              <button onClick={downloadInvoice} disabled={busy2}
                style={{ height:36, padding:'0 18px', borderRadius:8, background: busy2 ? '#9CB9A6' : '#185FA5', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: busy2 ? 'not-allowed' : 'pointer' }}>
                {busy2 ? '產生中…' : '下載 Excel'}
              </button>
            </div>
            {err2 && <div style={{ marginTop:12, fontSize:12, color:'#A32D2D' }}>{err2}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
