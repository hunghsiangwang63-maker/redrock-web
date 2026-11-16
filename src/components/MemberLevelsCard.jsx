import { useState, useEffect } from 'react';
import { memberClient } from '../api/client';
import { getMyMemberLevels } from '../api/climbLevels';
import { tt } from '../utils/memberI18n';

// 小蜘蛛人等級卡：本人與名下子會員中「有考核紀錄」者才顯示（沒有紀錄的人整張卡不出現）。
// 等級定義/考核內容目前只有繁中（管理員於員工端維護）。
// 等級 16 最入門、1 最高：階梯條由 16 往 1 填滿；「下一個目標」拆成練習內容／標準／體能三行；考核歷史用時間軸＋進度條。
const MAX_LEVEL = 16;
const RED = '#8B1A1A';
const GOLD = '#E8A317';

// 「正抓、倒拉、Pinch、Open；標準:固定路線」→ { drills:'正抓、倒拉、Pinch、Open', criteria:'固定路線' }
function splitStandard(std) {
  const s = String(std || '').trim();
  if (!s) return { drills: '', criteria: '' };
  const m = s.split(/[；;]\s*標準\s*[:：]\s*/);
  if (m.length >= 2) return { drills: m[0].trim(), criteria: m.slice(1).join('；').trim() };
  const m2 = s.match(/^標準\s*[:：]\s*(.+)$/);
  if (m2) return { drills: '', criteria: m2[1].trim() };
  return { drills: s, criteria: '' };
}

// 16 格階梯：由左（16 級）往右（1 級）填滿；已通過 N 級＝填到 N 那一格
function Ladder({ current }) {
  const passedCount = current ? MAX_LEVEL - current + 1 : 0;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: MAX_LEVEL }, (_, i) => {
          const filled = i < passedCount;
          const isNext = i === passedCount;
          return (
            <div key={i} style={{
              flex: 1, height: 10, borderRadius: 3,
              background: filled ? `linear-gradient(180deg, #C0392B, ${RED})` : isNext ? '#F6D9A8' : '#EFE6E6',
              border: isNext ? `1px dashed ${GOLD}` : 'none', boxSizing: 'border-box',
            }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#aaa', marginTop: 4 }}>
        <span>16 {tt('級', '', '級')}</span>
        <span>{tt(`已通過 ${passedCount} / ${MAX_LEVEL} 關`, `${passedCount} / ${MAX_LEVEL} cleared`, `${passedCount} / ${MAX_LEVEL} クリア`)}</span>
        <span>1 {tt('級', '', '級')}</span>
      </div>
    </div>
  );
}

function ProgressBar({ value, passed }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#EFE6E6', overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', borderRadius: 3, background: passed ? 'linear-gradient(90deg,#3FA66B,#2D7D46)' : `linear-gradient(90deg, ${GOLD}, #D9822B)` }} />
    </div>
  );
}

const Row = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.55, marginTop: 4 }}>
    <span style={{ flex: '0 0 auto', minWidth: 44, color: '#9a8a8a', fontWeight: 600 }}>{label}</span>
    <span style={{ flex: 1, color: '#4a3a3a' }}>{children}</span>
  </div>
);

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
          // 有考核紀錄、或目前是小蜘蛛人週課的正式學員（還沒通過任何級也要顯示「尚未通過、下一個目標」）才顯示
          if (r.data.records?.length || r.data.enrolled) out.push({ ...p, ...r.data });
        } catch (e) { /* 單人失敗不影響其他人 */ }
      }
      if (alive) setItems(out);
    })();
    return () => { alive = false; };
  }, [memberId]);

  if (!items.length) return null;
  return (
    <div style={{ margin: '12px 16px 0' }}>
      {items.map(it => {
        const cur = it.currentLevel || 0;
        const nextLevel = cur ? cur - 1 : MAX_LEVEL;
        const next = nextLevel >= 1 ? it.defs.find(d => d.level === nextLevel) : null;
        const { drills, criteria } = splitStandard(next?.standard);
        // 目前這一級的挑戰中最高進度（尚未通過的紀錄）
        const attempt = nextLevel >= 1
          ? it.records.filter(r => r.level === nextLevel && !r.passed).reduce((m, r) => Math.max(m, r.progress || 0), 0)
          : 0;
        const isOpen = open === it.id;
        const history = [...it.records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return (
          <div key={it.id} style={{ background: '#fff', border: '0.5px solid #E8D5D5', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 2px 10px rgba(139,26,26,.06)' }}>
            {/* 標題列：名字＋大等級徽章 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                flex: '0 0 auto', width: 64, height: 64, borderRadius: '50%',
                background: cur ? `linear-gradient(145deg, #C0392B, ${RED})` : '#F3ECEC',
                color: cur ? '#fff' : '#b8a8a8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                boxShadow: cur ? '0 3px 10px rgba(139,26,26,.28)' : 'none',
              }}>
                <div style={{ fontSize: cur ? 26 : 22, fontWeight: 800, lineHeight: 1 }}>{cur || '—'}</div>
                <div style={{ fontSize: 10, marginTop: 3, opacity: .9 }}>{tt('級', 'LEVEL', '級')}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#9a8a8a' }}>
                  🕷 {tt('小蜘蛛人等級', 'Spider Kid Level', 'スパイダーキッズ等級')}
                  {it.name && <span style={{ marginLeft: 6, background: '#F5E8E8', color: RED, borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>{it.name}</span>}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: RED, marginTop: 3 }}>
                  {cur ? tt(`已通過 ${cur} 級`, `Passed Level ${cur}`, `${cur}級 合格`) : tt('尚未通過任何級', 'No level passed yet', 'まだ合格した級はありません')}
                </div>
              </div>
            </div>

            <Ladder current={cur} />

            {/* 下一個目標 */}
            {next ? (
              <div style={{ marginTop: 14, background: '#FBF5F5', border: '0.5px solid #F0E0E0', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: GOLD, fontWeight: 800, letterSpacing: .5 }}>🎯 {tt('下一個目標', 'NEXT GOAL', '次の目標')}　{nextLevel} {tt('級', '', '級')}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#3a2a2a', marginTop: 4 }}>{next.title}</div>
                {drills && <Row label={tt('練習內容', 'Drills', '練習内容')}>{drills}</Row>}
                {criteria && <Row label={tt('標準', 'Standard', '基準')}>{criteria}</Row>}
                {next.fitness && <Row label={tt('體能', 'Fitness', '体力')}>{next.fitness}</Row>}
                {attempt > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 11, color: '#9a8a8a', fontWeight: 600 }}>{tt('目前進度', 'Progress', '進捗')}</span>
                    <ProgressBar value={attempt} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#D9822B', minWidth: 34, textAlign: 'right' }}>{attempt}%</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 14, background: '#FFF8E6', border: `0.5px solid ${GOLD}`, borderRadius: 12, padding: '12px 14px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#B7791F' }}>
                🏆 {tt('已通過全部 16 關，太厲害了！', 'All 16 levels cleared — amazing!', '全16級クリア！すごい！')}
              </div>
            )}

            {/* 考核歷史 */}
            {history.length > 0 && <>
            <div onClick={() => setOpen(isOpen ? null : it.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '0.5px solid #F0E4E4', cursor: 'pointer', fontSize: 12, color: '#8a7a7a' }}>
              <span>{tt(`考核紀錄（${history.length}）`, `History (${history.length})`, `履歴（${history.length}）`)}</span>
              <span style={{ color: RED, fontWeight: 600 }}>{isOpen ? tt('收合 ▲', 'Hide ▲', '閉じる ▲') : tt('展開 ▼', 'Show ▼', '開く ▼')}</span>
            </div>
            {isOpen && (
              <div style={{ marginTop: 8, position: 'relative', paddingLeft: 16 }}>
                <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 2, background: '#F0E0E0', borderRadius: 1 }} />
                {history.map(r => (
                  <div key={r.id} style={{ position: 'relative', padding: '7px 0' }}>
                    <div style={{ position: 'absolute', left: -16, top: 12, width: 10, height: 10, borderRadius: '50%', background: r.passed ? '#2D7D46' : GOLD, border: '2px solid #fff', boxShadow: '0 0 0 1px #E8D5D5' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ color: '#9a8a8a', fontVariantNumeric: 'tabular-nums' }}>{r.date}</span>
                      <span style={{ background: r.passed ? '#E6F4EB' : '#FAEEDA', color: r.passed ? '#2D7D46' : '#854F0B', borderRadius: 10, padding: '1px 9px', fontWeight: 700 }}>{r.level} {tt('級', '', '級')}</span>
                      <ProgressBar value={r.progress} passed={r.passed} />
                      <span style={{ fontWeight: 700, color: r.passed ? '#2D7D46' : '#D9822B', minWidth: 40, textAlign: 'right' }}>{r.passed ? tt('通過 ✅', 'Passed ✅', '合格 ✅') : `${r.progress}%`}</span>
                    </div>
                    {r.description && <div style={{ fontSize: 12, color: '#6a5a5a', marginTop: 3, lineHeight: 1.5 }}>{r.description}</div>}
                  </div>
                ))}
              </div>
            )}
            </>}
          </div>
        );
      })}
    </div>
  );
}
