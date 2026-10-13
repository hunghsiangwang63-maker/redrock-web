import { useState, useEffect } from 'react';
import { memberClient } from '../api/client';
import { getMyMemberLevels } from '../api/climbLevels';
import { tt } from '../utils/memberI18n';

// 小蜘蛛人等級卡：本人與名下子會員中「有考核紀錄」者才顯示（沒有紀錄的人整張卡不出現）。
// 等級定義/考核內容目前只有繁中（管理員於員工端維護）。
export default function MemberLevelsCard({ memberId }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (!memberId) return;
    let alive = true;
    (async () => {
      let people = [{ id: memberId, name: '' }];
      try {
        const r = await memberClient.get('/members/my/children');
        people = people.concat((r.data.children || []).map(c => ({ id: c.id, name: c.name })));
      } catch (e) { /* 沒有家庭成員或讀取失敗：只看本人 */ }
      const out = [];
      for (const p of people) {
        try {
          const r = await getMyMemberLevels(p.id);
          if (r.data.records?.length) out.push({ ...p, ...r.data });
        } catch (e) { /* 單人失敗不影響其他人 */ }
      }
      if (alive) setItems(out);
    })();
    return () => { alive = false; };
  }, [memberId]);

  if (!items.length) return null;
  return (
    <div style={{ margin:'12px 16px 0' }}>
      {items.map(it => {
        const next = it.currentLevel ? it.defs.find(d => d.level === it.currentLevel - 1) : it.defs.find(d => d.level === 16);
        const isOpen = open === it.id;
        return (
          <div key={it.id} style={{ background:'#fff', border:'0.5px solid #E8D5D5', borderRadius:12, padding:14, marginBottom:10 }}>
            <div onClick={() => setOpen(isOpen ? null : it.id)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
              <div>
                <div style={{ fontSize:12, color:'#999' }}>🕷 {tt('小蜘蛛人等級', 'Spider Kid Level', 'スパイダーキッズ等級')}{it.name ? `｜${it.name}` : ''}</div>
                <div style={{ fontSize:18, fontWeight:700, color:'#8B1A1A', marginTop:2 }}>
                  {it.currentLevel ? tt(`已通過 ${it.currentLevel} 級`, `Passed Level ${it.currentLevel}`, `${it.currentLevel}級 合格`) : tt('尚未通過任何級', 'No level passed yet', 'まだ合格した級はありません')}
                </div>
              </div>
              <div style={{ color:'#999' }}>{isOpen ? '▲' : '▼'}</div>
            </div>
            {next && (
              <div style={{ fontSize:12, color:'#666', marginTop:8, lineHeight:1.6 }}>
                {tt('下一個目標', 'Next goal', '次の目標')}：{next.level} {tt('級', '', '級')} {next.title}
                {next.standard ? `（${next.standard}）` : ''}{next.fitness ? `｜${tt('體能', 'Fitness', '体力')}：${next.fitness}` : ''}
              </div>
            )}
            {isOpen && (
              <div style={{ marginTop:10, borderTop:'0.5px solid #F0E4E4', paddingTop:8 }}>
                {it.records.map(r => (
                  <div key={r.id} style={{ fontSize:12, color:'#555', padding:'4px 0' }}>
                    {r.date}｜{r.level} {tt('級', '', '級')}｜{r.progress}%{r.passed ? ' ✅' : ''}
                    {r.description ? `｜${r.description}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
