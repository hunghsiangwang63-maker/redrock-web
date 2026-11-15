// 季節主題圖層（會員端共用，掛在 MemberRoutes 最外層）：
// 有「目前季節」（seasons/index.js 的 getActiveSeason）→ 在 <html> 設 data-season="<key>"（啟用 styles/seasons.css 的全域樣式），
// 並顯示全螢幕飄落物、會飛的東西、頁面底部裝飾、探頭吉祥物。沒有季節（期間外）完全不渲染、不設屬性。
// 簽署／墜測／家長簽署等「文件簽署」頁只套用背景與導覽列，不放動態圖層（避免干擾簽名）。
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getActiveSeason } from '../seasons';
import '../styles/seasons.css';
import { FallingItems, FlyingThing, SeasonGround, MascotPeek } from '../seasons/SeasonDeco';

const QUIET = /\/(waiver|fall-test|sign|verify|reset-password|forgot-password)/;

export default function SeasonLayer() {
  const season = getActiveSeason();
  const key = season ? season.key : null;
  const { pathname } = useLocation();
  useEffect(() => {
    if (!key) return undefined;
    document.documentElement.setAttribute('data-season', key);
    return () => document.documentElement.removeAttribute('data-season');
  }, [key]);
  if (!season) return null;
  const quiet = QUIET.test(pathname) || /\/(competitions\/waiver|sign\/)/.test(pathname);
  const hero = /\/member\/(home|login)\/?$/.test(pathname); // 首頁／登入頁已有大橫幅吉祥物
  const noNav = /\/member\/(login|register)/.test(pathname); // 沒有底部導覽列的頁面不放底部裝飾（會蓋到文字）
  return quiet ? null : <><FallingItems season={season} /><FlyingThing season={season} />{!noNav && <SeasonGround season={season} big={season.ground.homeOnly ? /\/member\/home\/?$/.test(pathname) : true} />}{!hero && <MascotPeek season={season} />}</>;
}
