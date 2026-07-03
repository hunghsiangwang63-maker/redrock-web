import { useState, useEffect } from 'react';
import { getScheduleStaffList } from '../api/schedule';

// 教練選擇器：優先用館內員工清單（需 schedule.manage 權限，載不到就只給自訂輸入）。
// value = { coachId, coachName }；onChange(next) 回傳同結構。coachId 為 null 代表自訂姓名。
const CUSTOM = '__custom__';

export default function CoachSelect({ gymId, value, onChange, style }) {
  const [staffList, setStaffList] = useState([]);
  const [custom, setCustom] = useState(() => !!(value?.coachName && !value?.coachId));

  useEffect(() => {
    let alive = true;
    getScheduleStaffList(gymId)
      .then(r => { if (alive) setStaffList(r.data.staffList || []); })
      .catch(() => {}); // 無權限/失敗→僅自訂輸入
    return () => { alive = false; };
  }, [gymId]);

  const selValue = custom ? CUSTOM : (value?.coachId || '');

  const handleSelect = (v) => {
    if (v === '') { setCustom(false); onChange({ coachId: null, coachName: '' }); return; }
    if (v === CUSTOM) { setCustom(true); onChange({ coachId: null, coachName: value?.coachName || '' }); return; }
    setCustom(false);
    const s = staffList.find(x => x.id === v);
    onChange({ coachId: v, coachName: s?.name || '' });
  };

  return (
    <div>
      <select value={selValue} onChange={e => handleSelect(e.target.value)} style={style}>
        <option value="">先不指定教練</option>
        {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        <option value={CUSTOM}>其他（自訂輸入）</option>
      </select>
      {custom && (
        <input value={value?.coachName || ''} onChange={e => onChange({ coachId: null, coachName: e.target.value })}
          placeholder="輸入教練姓名" style={{ ...style, marginTop: 8 }} />
      )}
    </div>
  );
}
