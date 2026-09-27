import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicClient } from '../../api/client';
import { t, tt, isEn, toggleMemberLang, nextLangLabel } from '../../utils/memberI18n';

const RED = '#8B1A1A';
const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };
const GYMS = [{ id: 'gym-hsinchu', label: '新竹館' }, { id: 'gym-shilin', label: '士林館' }];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_JA = ['日', '月', '火', '水', '木', '金', '土'];
const wdShort = (idx) => tt(WEEKDAYS[idx], WD_EN[idx], WD_JA[idx]);
const wdList = (days) => (days || []).map(wdShort).join(isEn() ? ', ' : '、');

// 公開班別瀏覽頁（免登入）：一個班別（如「入門班」）底下可能有多個梯次（不同星期/館別），
// 訪客在這裡先看班別介紹，再挑要報名的梯次（週課→進報名頁；工作坊→再挑一個場次）。
// 連結格式：/book/category?id=<categoryId>
export default function PublicCourseCategoryPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const categoryId = params.get('id') || '';
  const gymFromLink = params.get('gym');

  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [expandedWorkshop, setExpandedWorkshop] = useState(null);
  // 場館分類：一個班別常橫跨兩館各自開梯次，讓訪客只看自己方便去的那一館。
  // 可由分類總覽頁帶入 ?gym= 深連結（GYMS 之外的值一律視為「全部場館」）。
  const [gymFilter, setGymFilter] = useState(GYMS.some(g => g.id === gymFromLink) ? gymFromLink : 'all');

  useEffect(() => {
    if (!categoryId) { setLoadErr(t('連結缺少班別資訊，請聯繫櫃檯')); return; }
    publicClient.get(`/courses/public/category/${categoryId}`)
      .then(r => setData(r.data))
      .catch(() => setLoadErr(t('找不到此班別，可能已下架或連結錯誤')));
  }, [categoryId]);

  const wrap = { maxWidth: 600, margin: '0 auto', padding: '0 16px 60px', fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' };
  const card = { background: '#fff', borderRadius: 16, border: '1px solid #EEE2E2', padding: 18, marginTop: 16, boxShadow: '0 1px 3px rgba(80,20,20,.05)' };
  const langBtn = { position: 'absolute', right: 16, top: 16, height: 26, padding: '0 10px', borderRadius: 13, border: '0.5px solid rgba(255,255,255,.5)', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' };

  if (loadErr) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#A32D2D' }}>{loadErr}</div>;
  if (!data) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#999' }}>{t('載入中…')}</div>;

  const { category, cohorts } = data;
  const gymIdsHere = [...new Set(cohorts.map(c => c.gymId).filter(Boolean))];
  const filteredCohorts = gymFilter === 'all' ? cohorts : cohorts.filter(c => c.gymId === gymFilter);

  return (
    <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
      <div style={{ background: RED, color: '#fff', padding: '22px 16px', textAlign: 'center', position: 'relative' }}>
        <div onClick={toggleMemberLang} style={langBtn}>🌐 {nextLangLabel()}</div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>{t('紅石攀岩')} · {category.name}</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 4 }}>{t('免登入即可瀏覽，選擇梯次後登入或註冊會員即可報名')}</div>
      </div>
      <div style={wrap}>
        {(category.imageUrl || category.description) && (
          <div style={card}>
            {category.imageUrl && <img src={category.imageUrl} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: 10, display: 'block' }} />}
            {category.description && <div style={{ fontSize: 13, color: '#666', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{category.description}</div>}
          </div>
        )}

        {gymIdsHere.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            {[{ id: 'all', label: '全部場館' }, ...GYMS].map(g => (
              <button key={g.id} onClick={() => setGymFilter(g.id)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: gymFilter === g.id ? `1.5px solid ${RED}` : '1px solid #E8D5D5',
                  background: gymFilter === g.id ? RED : '#fff', color: gymFilter === g.id ? '#fff' : '#666' }}>
                {t(g.label)}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 20, marginBottom: 10, fontWeight: 700, fontSize: 15 }}>{tt(`選擇梯次（共 ${filteredCohorts.length} 個）`, `Select a Batch (${filteredCohorts.length} total)`, `期を選択（全${filteredCohorts.length}期）`)}</div>

        {filteredCohorts.length === 0 && (
          <div style={{ ...card, textAlign: 'center', color: '#999' }}>{t('目前沒有開放中的梯次，請聯繫櫃檯')}</div>
        )}

        {filteredCohorts.map(c => {
          // 非工作坊梯次（週課）的額滿判斷：statusLabel 由 getCourses() 依 enrolledCount>=maxStudents 算好，
          // 與會員端/工作坊場次判斷同一套口徑，這裡不用再另外拉 enrolledCount/maxStudents 兩個欄位。
          const cohortFull = c.type !== 'workshop' && c.statusLabel === 'full';
          return (
          <div key={c.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {t(GYM_LABEL[c.gymId] || c.gymId)}
                  {c.startDate && c.endDate && ` · ${c.startDate} ~ ${c.endDate}`}
                </div>
                {c.type !== 'workshop' && c.weekdays && c.weekdays.length > 0 && (
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                    🗓 {tt('每週', 'Every ', '毎週')}{wdList(c.weekdays)} {c.startTime}～{c.endTime}
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: 14 }}>{t('費用')} <b style={{ color: RED }}>NT${c.price}</b></div>
              </div>
              {c.type !== 'workshop' && (
                cohortFull ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#A32D2D', padding: '4px 10px', flexShrink: 0 }}>{t('已額滿')}</span>
                ) : (
                  <button onClick={() => navigate(`/book/course?course=${c.id}`)}
                    style={{ height: 38, padding: '0 16px', borderRadius: 10, background: RED, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    {t('報名 →')}
                  </button>
                )
              )}
              {c.type === 'workshop' && (
                <button onClick={() => setExpandedWorkshop(expandedWorkshop === c.id ? null : c.id)}
                  style={{ height: 38, padding: '0 16px', borderRadius: 10, background: '#fff', color: RED, border: `1px solid ${RED}`, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                  {expandedWorkshop === c.id ? t('收合') : t('選場次 ▾')}
                </button>
              )}
            </div>

            {c.type === 'workshop' && expandedWorkshop === c.id && (
              <div style={{ marginTop: 12, borderTop: '1px dashed #EEE', paddingTop: 12 }}>
                {(!c.sessions || c.sessions.length === 0) && <div style={{ fontSize: 13, color: '#999' }}>{t('目前沒有開放中的場次')}</div>}
                {(c.sessions || []).map(s => {
                  // 已額滿（如每時段限 1 人的運動按摩）：maxStudents 為 null 代表無上限，不判定額滿。
                  const full = s.maxStudents != null && s.enrolledCount >= s.maxStudents;
                  return (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F5EFEF' }}>
                      <div style={{ fontSize: 13 }}>🗓 {s.date}　⏰ {s.startTime}–{s.endTime}</div>
                      {full ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#A32D2D', padding: '4px 10px' }}>{t('已額滿')}</span>
                      ) : (
                        <button onClick={() => navigate(`/book/workshop?course=${c.id}&session=${s.id}`)}
                          style={{ height: 32, padding: '0 12px', borderRadius: 8, background: RED, color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' }}>
                          {t('報名 →')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          );
        })}
        <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 20, lineHeight: 1.8 }}>紅石攀岩 RedRock<br/>新竹館 03-6686635 · 士林館 02-28837591</div>
      </div>
    </div>
  );
}
