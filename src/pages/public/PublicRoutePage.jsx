import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicClient } from '../../api/client';
import { t, tt, toggleMemberLang, nextLangLabel } from '../../utils/memberI18n';

const RED = '#8B1A1A';
const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };
const GRADE_COLORS = {
  V0: '#5CA85C', V1: '#4E9E7E', V2: '#3E8FA8', V3: '#3D6FB5', V4: '#5B54B8',
  V5: '#8B48B0', V6: '#B03E96', V7: '#C13A5E', V8: '#C1462A', V9: '#8A3A1E', V10: '#3A3A3A',
};

// 公開單一路線頁（免登入可瀏覽；記錄完攀/按讚/標記朋友/分享自己的完攀影片需先登入或註冊）。
// 連結格式：/route?id=<routeId>——供「路線攻略」的分享功能使用（見 MemberRoutesPage.jsx shareRoute），
// 讓分享出去的連結不需要登入也看得到路線資料（2026-09-16 新增，原本連到需要登入的 /member/routes）。
export default function PublicRoutePage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const routeId = params.get('id') || '';

  const [route, setRoute] = useState(null);
  const [tags, setTags] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    if (!routeId) { setLoadErr(t('連結缺少路線資訊，請聯繫櫃檯')); return; }
    publicClient.get(`/climbing-routes/public/${routeId}`)
      .then(r => { setRoute(r.data.route); setTags(r.data.tags || []); setVideos(r.data.videos || []); })
      .catch(() => setLoadErr(t('找不到此路線，可能已下架或連結錯誤')));
  }, [routeId]);

  // 帶館別一起登入，讓 MemberRoutesPage 深連結能正確切到這條路線所在的館別（否則預設/上次選的館別
  // 可能不是這條路線的館別，會找不到而無法高亮定位）。
  const goRoute = () => navigate(`/member/routes?route=${routeId}${route?.gymId ? `&gym=${route.gymId}` : ''}`);

  const wrap = { maxWidth: 600, margin: '0 auto', padding: '0 16px 60px', fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' };
  const card = { background: '#fff', borderRadius: 16, border: '1px solid #EEE2E2', padding: 18, marginTop: 16, boxShadow: '0 1px 3px rgba(80,20,20,.05)' };
  const langBtn = { position: 'absolute', right: 16, top: 16, height: 26, padding: '0 10px', borderRadius: 13, border: '0.5px solid rgba(255,255,255,.5)', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' };

  if (loadErr) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#A32D2D' }}>{loadErr}</div>;
  if (!route) return <div style={{ ...wrap, paddingTop: 60, textAlign: 'center', color: '#999' }}>{t('載入中…')}</div>;

  const title = `${route.area || ''} ${route.color || ''}${route.name ? ' · ' + route.name : ''}`.trim();

  return (
    <div style={{ background: '#FBF7F7', minHeight: '100vh' }}>
      <div style={{ background: RED, color: '#fff', padding: '22px 16px', textAlign: 'center', position: 'relative' }}>
        <div onClick={toggleMemberLang} style={langBtn}>🌐 {nextLangLabel()}</div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <img src="/climbing-routes.jpg" alt="" style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 5, display: 'block' }}/>
          {t('紅石路線攻略')}
        </div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 4 }}>{t('免登入瀏覽路線資訊，登入或註冊會員後可記錄完攀、按讚、分享你的完攀影片')}</div>
      </div>
      <div style={wrap}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: GRADE_COLORS[route.grade] || '#666', padding: '4px 10px', borderRadius: 8 }}>{route.grade}</span>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
            {t(GYM_LABEL[route.gymId] || route.gymId)}
            {route.status === 'archived' && <span style={{ marginLeft: 8, color: '#999' }}>{t('（已下架）')}</span>}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#999' }}>
            {t('基本分')} {route.basePoints}
            {route.setter ? ` · ${t('定線')} ${route.setter}` : ''}
            {route.plannedRemoveAt ? ` · ${tt('預計換線', 'Planned removal', '交換予定')} ${route.plannedRemoveAt}` : ''}
          </div>
          {route.note && <div style={{ marginTop: 8, fontSize: 13, color: '#854F0B', whiteSpace: 'pre-wrap', textAlign: 'left' }}>💬 {route.note}</div>}
          {route.igUrl && (
            <button onClick={() => window.open(route.igUrl, '_blank', 'noopener')}
              style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: '#B03E96', background: '#fff', border: '1px solid #E8C9E0', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>
              📹 {t('觀看示範影片')}
            </button>
          )}
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13, color: '#666' }}>
            <div>❤️ {route.likeCount || 0}</div>
            <div>🔗 {route.shareCount || 0}</div>
          </div>
          {tags.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#999', textAlign: 'left', lineHeight: 1.8 }}>
              {tags.slice(0, 5).map((tg, i) => (
                <span key={i}>👥 {tt(`${tg.from} 標記了 ${tg.tagged}`, `${tg.from} tagged ${tg.tagged}`, `${tg.from}が${tg.tagged}をタグ付け`)}{i < Math.min(tags.length, 5) - 1 ? '、' : ''}</span>
              ))}
              {tags.length > 5 && <span>{tt(`　等共 ${tags.length} 筆`, ` and ${tags.length} more`, `　他計${tags.length}件`)}</span>}
            </div>
          )}
          {videos.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#B03E96', textAlign: 'left', lineHeight: 1.8 }}>
              🎥 {t('會員完攀影片')}：
              {videos.map((v, i) => (
                <span key={i}>
                  <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ color: '#B03E96', fontWeight: 600, textDecoration: 'underline' }}>{v.name}</a>
                  {i < videos.length - 1 ? '、' : ''}
                </span>
              ))}
            </div>
          )}
          {tags.length === 0 && videos.length === 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#bbb' }}>{t('目前尚無標記或會員分享的完攀影片')}</div>
          )}
        </div>

        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{t('登入或註冊會員即可完整使用')}</div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 6, lineHeight: 1.7 }}>{t('記錄完攀、累積積分排名、按讚、標記朋友、分享你自己的完攀影片')}</div>
          <button onClick={goRoute}
            style={{ width: '100%', height: 50, borderRadius: 12, background: RED, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 16 }}>
            {t('登入 / 註冊 →')}
          </button>
        </div>

        <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 14, lineHeight: 1.8 }}>紅石攀岩 RedRock<br/>新竹館 03-6686635 · 士林館 02-28837591</div>
      </div>
    </div>
  );
}
