// 季節主題圖層（會員端共用，掛在 MemberRoutes 最外層）：
// 感恩節期間（isThanksgiving）→ 在 <html> 設 data-season="thanksgiving"（啟用 styles/thanksgiving.css 的全域樣式）、
// 並顯示全螢幕飄落葉片、會飛的火雞、頁面底部小景。期間外完全不渲染、不設屬性。
// 簽署／墜測／家長簽署等「文件簽署」頁只套用背景與導覽列，不放動態圖層（避免干擾簽名）。
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isThanksgiving } from '../utils/thanksgiving';
import '../styles/thanksgiving.css';
import { FallingLeaves, FlyingTurkey, AutumnGround } from './ThanksgivingDeco';

const QUIET = /\/(waiver|fall-test|sign|verify|reset-password|forgot-password)/;

export default function SeasonLayer() {
  const on = isThanksgiving();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!on) return undefined;
    document.documentElement.setAttribute('data-season', 'thanksgiving');
    return () => document.documentElement.removeAttribute('data-season');
  }, [on]);
  if (!on) return null;
  const quiet = QUIET.test(pathname) || /\/(competitions\/waiver|sign\/)/.test(pathname);
  return quiet ? null : <><FallingLeaves /><FlyingTurkey /><AutumnGround /></>;
}
