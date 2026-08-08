import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SalesPage from './SalesPage';
import RentalsPage from './RentalsPage';
import SegmentedTabs from '../../components/SegmentedTabs';
import { useAuth } from '../../store/authStore';

const ALL_TABS = [
  { key:'sales',   icon:'🛍️', label:'商品' },
  { key:'rentals', icon:'🎒', label:'器材租借' },
];

export default function ShopPage() {
  const { staff, operator } = useAuth();
  // 正職個人帳號（未打卡值班）權限收斂（2026-08-08 拍板）：整個「商品/租借」只開放庫存管理，
  // 器材租借整個分頁拿掉（商品分頁本身也只剩庫存管理子分頁，見 SalesPage.jsx）
  const isInventoryOnly = staff?.role === 'full_time' && !operator;
  const TABS = isInventoryOnly ? ALL_TABS.filter(t => t.key === 'sales') : ALL_TABS;
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState((TABS.some(t => t.key === searchParams.get('tab')) && searchParams.get('tab')) || TABS[0].key);

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
