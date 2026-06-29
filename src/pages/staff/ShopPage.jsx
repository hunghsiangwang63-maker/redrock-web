import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SalesPage from './SalesPage';
import RentalsPage from './RentalsPage';
import SegmentedTabs from '../../components/SegmentedTabs';

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
      <div style={{ background:'#fff', borderBottom:'0.5px solid #E8D5D5', padding:'12px 20px' }}>
        <SegmentedTabs tabs={TABS} value={tab} onChange={handleTab} />
      </div>
      {tab === 'sales'   && <SalesPage embedded />}
      {tab === 'rentals' && <RentalsPage embedded />}
    </div>
  );
}
