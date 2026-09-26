import { useEffect, useRef } from 'react';

// 「拿手機給店員掃 QR」類畫面（會員入場/補租器材/比賽報到、站台自助入場）保持螢幕常亮。
// 成因：回報 Android 手機顯示 QR 偶爾「黑屏」——最可能是等待被掃描期間系統螢幕逾時自動熄屏，
// 純網頁本無此防護（原生票證/登機證類 App 都會主動要求常亮），非畫面渲染錯誤。
// 不支援 Wake Lock 的瀏覽器（含部分舊版 Safari）安全地整段跳過、不影響原本流程。分頁切到
// 背景時系統會自動釋放鎖，切回來且 active 仍為 true 要重新請求一次。
export default function useScreenWakeLock(active) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let cancelled = false;
    const requestLock = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) { lock.release().catch(() => {}); return; }
        wakeLockRef.current = lock;
      } catch (e) { /* 裝置/瀏覽器不支援或被拒絕時安靜略過 */ }
    };
    requestLock();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) requestLock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
    };
  }, [active]);
}
