import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import RevenuePage from './RevenuePage';
import InstallmentsPage from './InstallmentsPage';

const TABS = [
  { key:'revenue',      icon:'📊', label:'營收報表' },
  { key:'installments', icon:'📆', label:'分期付款' },
];

export default function FinancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'revenue');

  const handleTab = (key) => { setTab(key); setSearchParams({ tab: key }); };

  return (
    <div style={{ background:'#F7F3F3' }}>
      <div style={{ background:'#fff', borderBottom:'0.5px solid #E8D5D5', padding:'12px 20px 0', display:'flex', gap:0 }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => handleTab(t.key)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px 12px', border:'none', borderBottom: active?'2.5px solid #8B1A1A':'2.5px solid transparent', background:'none', color:active?'#8B1A1A':'#666', fontSize:13, fontWeight:active?700:400, cursor:'pointer' }}>
              <span style={{ fontSize:16 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      {tab === 'revenue'      && <RevenuePage embedded />}
      {tab === 'installments' && <InstallmentsPage embedded />}
    </div>
  );
}
