import { useEffect, useRef } from 'react';

// 頁面長開（站台入場頁/待辦頁/會員首頁）不會自動重抓資料，只有手動整頁重整才會更新。
// 這個 hook 在使用者切回分頁（visibilitychange）或視窗重新取得焦點（focus）時，
// 呼叫傳入的 refetch 函式重抓一次；minIntervalMs 內重複觸發會被節流（避免快速切換分頁時打太多次 API）。
export default function useRefetchOnFocus(refetch, { minIntervalMs = 10000 } = {}) {
  const lastRunRef = useRef(0);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const trigger = () => {
      const now = Date.now();
      if (now - lastRunRef.current < minIntervalMs) return;
      lastRunRef.current = now;
      refetchRef.current?.();
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') trigger(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', trigger);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', trigger);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minIntervalMs]);
}
