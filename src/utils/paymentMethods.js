// 付款方式開關（系統管理員設定 systemSettings/paymentMethods）
// 現金/轉帳預設開放；LinePay/街口/台灣Pay 待金流 API 對接後開啟。
// 各付款頁以 useEnabledPayments() 取得開關、filterPayments() 過濾自己的清單。
import { useState, useEffect } from 'react';
import { memberClient } from '../api/client';

export const DEFAULT_ENABLED = { cash: true, transfer: true, linepay: false, jkopay: false, taiwanpay: false };

let _cache = null;
let _promise = null;

export const fetchEnabledPayments = () => {
  if (_cache) return Promise.resolve(_cache);
  if (!_promise) {
    _promise = memberClient.get('/settings/payment-methods')
      .then(r => { _cache = { ...DEFAULT_ENABLED, ...(r.data?.enabled || {}) }; return _cache; })
      .catch(() => ({ ...DEFAULT_ENABLED })); // 讀取失敗 → 安全預設（僅現金/轉帳）
  }
  return _promise;
};

export const useEnabledPayments = () => {
  const [enabled, setEnabled] = useState(_cache || DEFAULT_ENABLED);
  useEffect(() => { let ok = true; fetchEnabledPayments().then(e => { if (ok) setEnabled(e); }); return () => { ok = false; }; }, []);
  return enabled;
};

// 過濾付款清單（清單元素需有 key 或 k 欄位）；未知 key 不過濾（保守放行）
export const filterPayments = (list, enabled) =>
  list.filter(m => { const k = m.key ?? m.k; return !(k in enabled) || enabled[k] !== false; });
