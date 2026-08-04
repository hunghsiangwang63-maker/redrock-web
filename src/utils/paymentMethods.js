// 付款方式開關（系統管理員設定 systemSettings/paymentMethods）
// 現金/轉帳預設開放；LinePay/街口/台灣Pay 待金流 API 對接後開啟。
// 各付款頁以 useEnabledPayments() 取得開關、filterPayments() 過濾自己的清單。
//
// 各流程「是否開放線上支付入口」（見 docs/payment-integration-plan.md §11）：
// 以 useOnlineFlowEnabled(flowKey) 取代原本寫死的 ONLINE_PAYMENT_ENABLED 常數。
import { useState, useEffect } from 'react';
import { memberClient } from '../api/client';

export const DEFAULT_ENABLED = { cash: true, transfer: true, linepay: false, jkopay: false, taiwanpay: false };
export const DEFAULT_ONLINE_FLOWS = { checkin: false, course: false, experience: false, competition: false, rental: false, pass: false, installment: false };

let _cache = null;      // enabled
let _flowsCache = null; // onlineFlows
let _promise = null;

export const fetchEnabledPayments = () => {
  if (_cache) return Promise.resolve(_cache);
  if (!_promise) {
    _promise = memberClient.get('/settings/payment-methods')
      .then(r => {
        _cache = { ...DEFAULT_ENABLED, ...(r.data?.enabled || {}) };
        _flowsCache = { ...DEFAULT_ONLINE_FLOWS, ...(r.data?.onlineFlows || {}) };
        return _cache;
      })
      .catch(() => {
        _flowsCache = { ...DEFAULT_ONLINE_FLOWS }; // 讀取失敗 → 安全預設（線上支付一律關閉）
        return { ...DEFAULT_ENABLED };             // 讀取失敗 → 安全預設（僅現金/轉帳）
      });
  }
  return _promise;
};

export const useEnabledPayments = () => {
  const [enabled, setEnabled] = useState(_cache || DEFAULT_ENABLED);
  useEffect(() => { let ok = true; fetchEnabledPayments().then(e => { if (ok) setEnabled(e); }); return () => { ok = false; }; }, []);
  return enabled;
};

// 某流程是否要顯示「線上支付」入口（course/experience/competition/rental/pass/installment/checkin）。
// 本機開發（import.meta.env.DEV）恆為 true，維持原本搭配 mock 免額外設定即可測的行為；
// 正式環境改讀後端 systemSettings/paymentMethods.onlineFlows（管理員可在後台調整，免重新 build）。
export const useOnlineFlowEnabled = (flowKey) => {
  const [enabled, setEnabled] = useState(() => !!import.meta.env.DEV || !!(_flowsCache && _flowsCache[flowKey]));
  useEffect(() => {
    if (import.meta.env.DEV) { setEnabled(true); return; }
    let ok = true;
    fetchEnabledPayments().then(() => { if (ok) setEnabled(!!(_flowsCache && _flowsCache[flowKey])); });
    return () => { ok = false; };
  }, [flowKey]);
  return enabled;
};

// 過濾付款清單（清單元素需有 key 或 k 欄位）；未知 key 不過濾（保守放行）
export const filterPayments = (list, enabled) =>
  list.filter(m => { const k = m.key ?? m.k; return !(k in enabled) || enabled[k] !== false; });
