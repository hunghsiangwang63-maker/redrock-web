import { useEffect, useRef, useState } from 'react';

// 主動偵測新版本：定期 no-store 問 /version.json（每次 build 都會換新 buildId，見 vite.config.js），
// 跟這次打包內嵌的 VITE_BUILD_ID 不同就顯示更新提示。解決純被動等瀏覽器 cache 標頭生效的兩個痛點：
// ①分頁一直開著不會自己發現有新版 ②加到主畫面（standalone PWA）重新打開常是恢復背景狀態、
// 不會真的重新從網路抓一次 index.html，index.html 的 no-cache 標頭派不上用場。
const CURRENT_BUILD_ID = import.meta.env.VITE_BUILD_ID || '';
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 開著的分頁每 5 分鐘也主動查一次
// 「稍後再說」要記住的是哪一個遠端版本——存進 localStorage（非單純記憶體 state），這樣
// PWA/分頁重新 mount（常只是恢復背景狀態，並非真的重新連網抓新版，見上方註解②）時，同一個
// 早就看過並關掉的版本不會又被判定成「新版本」反覆跳出；偵測到比這個紀錄更新的 buildId
// 時，仍會正常再提醒（不是整個關掉這個功能）。
const DISMISS_KEY = 'rr_update_dismissed_build';
// 自動重新載入（2026-10-17）：手機重開瀏覽器／從背景切回 App 時常是「還原舊頁」，舊頁一開始就落後伺服器，
// 偵測到新版才跳提示，使用者幾乎每次重開都看到。→ 這兩種情況在「使用者還沒開始操作」時直接換新版，不打擾：
//   ①頁面載入後 10 秒內 ②從背景切回且隱藏超過 60 秒、且目前沒有聚焦在輸入框（避免丟掉填到一半的資料）。
// 每個版本只自動重載一次（sessionStorage 記住），重載後仍不一致就退回原本的提示，避免無限重載。
const AUTO_RELOAD_KEY = 'rr_auto_reloaded_build';
const FRESH_LOAD_MS = 10 * 1000;
const RESUME_HIDDEN_MS = 60 * 1000;
const isTyping = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};
const hardReload = () => {
  // 帶變動查詢參數導去同一頁，保證真的重新連網（理由見下方「重新整理」按鈕的註解）
  const url = new URL(window.location.href);
  url.searchParams.set('_v', Date.now());
  window.location.href = url.toString();
};

export default function UpdateChecker() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [latestBuildId, setLatestBuildId] = useState('');
  const checkingRef = useRef(false);
  const hiddenAtRef = useRef(0);
  const resumedAtRef = useRef(0);   // 最近一次「隱藏超過門檻後切回」的時間

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
            setLatestBuildId(data.buildId);
            const now = Date.now();
            const freshLoad = performance.now() < FRESH_LOAD_MS;
            const justResumed = resumedAtRef.current && now - resumedAtRef.current < FRESH_LOAD_MS && !isTyping();
            if (freshLoad || justResumed) {
              let canReload = false;
              try {
                if (sessionStorage.getItem(AUTO_RELOAD_KEY) !== data.buildId) {
                  sessionStorage.setItem(AUTO_RELOAD_KEY, data.buildId);
                  canReload = true;
                }
              } catch { /* 無法記住「已重載過」就不自動重載，退回提示，避免無限重載 */ }
              if (canReload) { hardReload(); return; }
            }
            let lastDismissed = '';
            try { lastDismissed = localStorage.getItem(DISMISS_KEY) || ''; } catch { /* 無痕模式等情況，視為從未關過 */ }
            if (data.buildId !== lastDismissed) {
              setHasUpdate(true);
              setDismissed(false); // 偵測到「比上次關掉的那版更新」的版本才重新彈出
            }
          }
        }
      } catch { /* 離線/網路異常，靜默略過，下次再試 */ }
      checkingRef.current = false;
    };

    check();
    const onVisible = () => {
      if (document.visibilityState === 'hidden') { hiddenAtRef.current = Date.now(); return; }
      if (document.visibilityState !== 'visible') return;
      if (hiddenAtRef.current && Date.now() - hiddenAtRef.current >= RESUME_HIDDEN_MS) resumedAtRef.current = Date.now();
      hiddenAtRef.current = 0;
      check();
    };
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
        onClick={() => {
          // 純 reload() 在部分行動瀏覽器（尤其 iOS Safari／已加到主畫面的 standalone PWA）
          // 對「重新整理」這個導覽的快取判斷不完全可靠，曾發生按了卻仍載到舊版、
          // 下次一開又被判定「有新版本」的迴圈。改成帶一個變動的查詢參數導去同一頁，
          // 讓瀏覽器視為全新網址、無法沿用任何啟發式/磁碟快取比對，保證真的重新連網抓取。
          const url = new URL(window.location.href);
          url.searchParams.set('_v', Date.now());
          window.location.href = url.toString();
        }}
        style={{ height: 30, padding: '0 12px', borderRadius: 8, background: '#8B1A1A', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >重新整理</button>
      <button
        onClick={() => {
          try { localStorage.setItem(DISMISS_KEY, latestBuildId); } catch { /* 無痕模式等情況，本次關掉仍有效，只是不會跨次記住 */ }
          setDismissed(true);
        }}
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
