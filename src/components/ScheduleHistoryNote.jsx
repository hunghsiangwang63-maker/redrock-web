import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getScheduleHistory } from '../api/schedule';

// 排班／重要事項內容視窗下方的異動歷程（小字）：誰、何時、改了什麼。
// targetType：'shift'＝顯示當天（該館）所有個人排班的異動；'event'＝只顯示這一筆重要事項（targetId）。
// 歷程從 2026-11-28 起才開始記錄，舊的異動沒有紀錄。
export default function ScheduleHistoryNote({ gymId, date, targetType, targetId }) {
  const [rows, setRows] = useState(null); // null=載入中 | []=沒有 | 'error'
  useEffect(() => {
    let alive = true;
    setRows(null);
    getScheduleHistory(date, gymId || '__all__')
      .then(r => {
        if (!alive) return;
        const list = (r.data.history || []).filter(h => h.targetType === targetType && (targetType !== 'event' || h.targetId === targetId));
        setRows(list);
      })
      .catch(() => { if (alive) setRows('error'); });
    return () => { alive = false; };
  }, [gymId, date, targetType, targetId]);

  const box = { marginTop: 14, paddingTop: 10, borderTop: '0.5px dashed #E8D5D5', fontSize: 11, lineHeight: 1.7, color: '#999' };
  return (
    <div style={box}>
      <div style={{ fontWeight: 600, color: '#8a7a7a', marginBottom: 2 }}>📝 異動記錄{targetType === 'shift' ? `（${date} 當天排班）` : ''}</div>
      {rows === null && <div>載入中…</div>}
      {rows === 'error' && <div style={{ color: '#A32D2D' }}>異動記錄載入失敗，請稍後再試</div>}
      {Array.isArray(rows) && rows.length === 0 && <div>尚無異動記錄（2026/11/28 起開始記錄）</div>}
      {Array.isArray(rows) && rows.map(h => (
        <div key={h.id} style={{ wordBreak: 'break-word' }}>
          {dayjs(h.at).format('MM/DD HH:mm')}　{h.byName || '系統'}　{h.summary}
        </div>
      ))}
    </div>
  );
}
