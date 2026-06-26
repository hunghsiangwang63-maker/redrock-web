import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import CoursesPage from './CoursesPage';
import ExperienceBookingsPage from './ExperienceBookingsPage';
import CompetitionsPage from './CompetitionsPage';

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

      {/* 內容 */}
      {tab === 'courses'      && <CoursesPage embedded />}
      {tab === 'experience'   && <ExperienceBookingsPage />}
      {tab === 'competitions' && <CompetitionsPage />}
    </div>
  );
}
