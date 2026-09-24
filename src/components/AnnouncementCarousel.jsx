// 輪播公告——首頁（已登入）與登入頁（免登入，2026-09-24 拍板放登入頁）共用同一份，
// 避免各自維護一份漸行漸遠（見 MemberHomePage.jsx 原本的內嵌版本，此為抽出後的單一權威）。
// 資料來源 GET /gyms/announcements/all 本就不需要登入（後端無 authenticate），故登入前後皆可顯示；
// 沒有任何公告時回傳 null，各頁自行決定要不要顯示其他佔位內容。
import { useState, useEffect, useRef } from 'react';
import { getMemberAnnouncements } from '../api/gyms';
import { t } from '../utils/memberI18n';

export default function AnnouncementCarousel({ style }) {
  const [banners, setBanners] = useState([]);
  const [bannerIdx, setBannerIdx] = useState(0);
  const touchStartX = useRef(null);
  const bannerLen = banners.length || 1;

  useEffect(() => {
    getMemberAnnouncements().then(r => setBanners(r.data.banner || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setBannerIdx(i => (i + 1) % bannerLen), 4000);
    return () => clearInterval(timer);
  }, [bannerLen]);

  const annTypeLabel = (type) => t({
    closure:'休館', special_hours:'特殊時間', route_change:'路線更換', general:'公告'
  }[type] || '公告');
  // 館別標示（null=全館；勿用二元寫法，否則全館會被誤標成士林）
  const annGymLabel = (gymId) => t(gymId==='gym-hsinchu' ? '新竹館' : gymId==='gym-shilin' ? '士林館' : '全館');

  if (!banners.length) return null;

  return (
    <div
      style={{ margin:'14px 16px 0', borderRadius:12, overflow:'hidden', position:'relative', height:120, cursor:'grab', ...style }}
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchStartX.current === null) return;
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) {
          setBannerIdx(i => diff > 0
            ? (i + 1) % bannerLen
            : (i - 1 + bannerLen) % bannerLen
          );
        }
        touchStartX.current = null;
      }}
    >
      <div style={{ background:'linear-gradient(135deg,#8B1A1A,#C0392B)', height:'100%', display:'flex', alignItems:'center', padding:'0 20px', position:'relative' }}>
        {banners[bannerIdx % bannerLen]?.bannerImage && (
          <>
            <img src={banners[bannerIdx % bannerLen].bannerImage} alt=""
              style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain' }} />
            {/* 文字可讀性：圖上壓左深右淺漸層 */}
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.15))' }} />
          </>
        )}
        <div style={{ color:'#fff', flex:1, position:'relative', zIndex:1 }}>
          <div style={{ fontSize:10, opacity:.75, letterSpacing:.5, marginBottom:4 }}>
            {annTypeLabel(banners[bannerIdx % bannerLen]?.type)}
          </div>
          <div style={{ fontSize:16, fontWeight:600, lineHeight:1.4 }}>
            {`【${annGymLabel(banners[bannerIdx % bannerLen]?.gymId)}】${banners[bannerIdx % bannerLen]?.title || ''}`}
          </div>
          <div style={{ fontSize:12, opacity:.8, marginTop:4 }}>
            {banners[bannerIdx % bannerLen]?.effectiveFrom}
            {banners[bannerIdx % bannerLen]?.effectiveTo && ` ～ ${banners[bannerIdx % bannerLen]?.effectiveTo}`}
          </div>
        </div>
        {banners.length > 1 && (
          <div style={{ position:'absolute', bottom:10, right:14, display:'flex', gap:4, zIndex:1 }}>
            {banners.map((_,i) => {
              const active = i === bannerIdx % bannerLen;
              return (
                <div key={i} onClick={() => setBannerIdx(i)}
                  style={{ width:14, height:14, borderRadius:3, boxSizing:'border-box',
                    border:'1px solid rgba(255,255,255,.85)',
                    background: active ? 'rgba(255,255,255,.95)' : 'transparent',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    cursor:'pointer', transition:'all .2s' }}>
                  {active && (
                    // 純 CSS 打勾（不用字型字元，避免缺字變黑方塊）
                    <span style={{ display:'block', width:3, height:6, marginTop:-1,
                      borderRight:'2px solid #8B1A1A', borderBottom:'2px solid #8B1A1A',
                      transform:'rotate(45deg)' }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* 左右箭頭（手機上半透明） */}
        {banners.length > 1 && (
          <>
            <div onClick={() => setBannerIdx(i => (i - 1 + bannerLen) % bannerLen)}
              style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.5)', fontSize:20, cursor:'pointer', padding:'4px 8px' }}>‹</div>
            <div onClick={() => setBannerIdx(i => (i + 1) % bannerLen)}
              style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.5)', fontSize:20, cursor:'pointer', padding:'4px 8px' }}>›</div>
          </>
        )}
      </div>
    </div>
  );
}
