import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SalesPage from './SalesPage';
import RentalsPage from './RentalsPage';

const TABS = [
  { key:'sales',   icon:'🛍️', label:'商品' },
  { key:'rentals', icon:'🎒', label:'器材租借' },
];

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'sales');

  const handleTab = (key) => {
    setTab(key);
    setSearchParams({ tab: key });
  };

  return (
    <div style={{ background:'#F7F3F3' }}>
      <div style={{ background:'#fff', borderBottom:'0.5px solid #E8D5D5', padding:'12px 20px 0', display:'flex', gap:0 }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => handleTab(t.key)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px 12px', border:'none', borderBottom: active?'2.5px solid #8B1A1A':'2.5px solid transparent', background:'none', color:active?'#8B1A1A':'#666', fontSize:13, fontWeight:active?700:400, cursor:'pointer', transition:'all .15s' }}>
              <span style={{ fontSize:16 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      {tab === 'sales'   && <SalesPage embedded />}
      {tab === 'rentals' && <RentalsPage embedded />}
    </div>
  );
}
