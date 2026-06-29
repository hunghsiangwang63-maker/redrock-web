import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import CoursesPage from './CoursesPage';
import ExperienceBookingsPage from './ExperienceBookingsPage';
import CompetitionsPage from './CompetitionsPage';
import SegmentedTabs from '../../components/SegmentedTabs';

const TABS = [
  { key:'courses',     icon:'📚', label:'課程' },
  { key:'experience',  icon:'🧗', label:'體驗課程' },
  { key:'competitions',icon:'🏆', label:'比賽報名' },
];

export default function CourseActivitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'courses');

  const handleTab = (key) => {
    setTab(key);
    setSearchParams({ tab: key });
  };

  return (
    <div style={{ background:'#F7F3F3' }}>
      {/* Tab 選單 */}
      <div style={{ background:'#fff', borderBottom:'0.5px solid #E8D5D5', padding:'12px 20px' }}>
        <SegmentedTabs tabs={TABS} value={tab} onChange={handleTab} />
      </div>

      {/* 內容 */}
      {tab === 'courses'      && <CoursesPage embedded />}
      {tab === 'experience'   && <ExperienceBookingsPage />}
      {tab === 'competitions' && <CompetitionsPage />}
    </div>
  );
}
