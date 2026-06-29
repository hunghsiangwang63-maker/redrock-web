import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import RevenuePage from './RevenuePage';
import InstallmentsPage from './InstallmentsPage';
import SegmentedTabs from '../../components/SegmentedTabs';

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
      <div style={{ background:'#fff', borderBottom:'0.5px solid #E8D5D5', padding:'12px 20px' }}>
        <SegmentedTabs tabs={TABS} value={tab} onChange={handleTab} />
      </div>
      {tab === 'revenue'      && <RevenuePage embedded />}
      {tab === 'installments' && <InstallmentsPage embedded />}
    </div>
  );
}
