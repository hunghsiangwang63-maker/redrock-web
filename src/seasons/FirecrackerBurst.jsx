import { useEffect } from 'react';
import { playFirecrackers } from './firecrackerEngine';

// 鞭炮爆破效果（播一次就結束）：<FirecrackerBurst playKey={...} /> —— playKey 變動就重播。
// 「減少動態效果」的使用者不播放；元件卸載時立即清除。尚未掛到任何頁面（農曆新年季節設定時才使用）。
export default function FirecrackerBurst({ playKey = 'once', onDone, imgSrc, count, heightVh, rightPct }) {
  useEffect(() => {
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* 無法判斷就當作可播放 */ }
    if (reduce) { if (onDone) onDone(); return undefined; }
    const h = playFirecrackers({ imgSrc, count, heightVh, rightPct, onDone });
    return () => h.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);
  return null;
}
