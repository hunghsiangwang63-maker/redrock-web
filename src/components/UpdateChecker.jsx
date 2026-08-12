import { useEffect, useRef, useState } from 'react';

// 主動偵測新版本：定期 no-store 問 /version.json（每次 build 都會換新 buildId，見 vite.config.js），
// 跟這次打包內嵌的 VITE_BUILD_ID 不同就顯示更新提示。解決純被動等瀏覽器 cache 標頭生效的兩個痛點：
// ①分頁一直開著不會自己發現有新版 ②加到主畫面（standalone PWA）重新打開常是恢復背景狀態、
// 不會真的重新從網路抓一次 index.html，index.html 的 no-cache 標頭派不上用場。
const CURRENT_BUILD_ID = import.meta.env.VITE_BUILD_ID || '';
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 開著的分頁每 5 分鐘也主動查一次

export default function UpdateChecker() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!CURRENT_BUILD_ID) return; // 本機 dev（無 build 流程）不檢查

    const check = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.buildId && data.buildId !== CURRENT_BUILD_ID) {
            setHasUpdate(true);
            setDismissed(false); // 偵測到「新的」不同版本才重新彈出，避免同一版本被關掉又立刻彈
          }
        }
      } catch { /* 離線/網路異常，靜默略過，下次再試 */ }
      checkingRef.current = false;
    };

    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(timer);
    };
  }, []);

  if (!hasUpdate || dismissed) return null;

  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 9999,
      maxWidth: 420, margin: '0 auto',
      background: '#1a1a1a', color: '#fff', borderRadius: 12,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,.25)', fontSize: 13,
    }}>
      <span style={{ flex: 1 }}>發現新版本，重新整理即可更新</span>
      <button
        onClick={() => window.location.reload()}
        style={{ height: 30, padding: '0 12px', borderRadius: 8, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >重新整理</button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="稍後再說"
        style={{ width: 24, height: 24, borderRadius: 6, background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <line x1="1" y1="1" x2="11" y2="11" />
          <line x1="11" y1="1" x2="1" y2="11" />
        </svg>
      </button>
    </div>
  );
}
