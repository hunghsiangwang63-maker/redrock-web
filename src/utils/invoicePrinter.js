// 本機發票列印代理（local-print-agent）用戶端 —— 純函式，不含 React。
// 代理跑在櫃檯電腦本機 http://localhost:3399，由員工端網頁直接呼叫（非透過 RedRock 後端 API，
// 後端在雲端、沒有路徑連到現場電腦；見 docs/invoice-integration-plan.md 第 3 節「本地列印代理」設計）。
// ⚠️ 代理的 gymId 只吃短名（'hsinchu'/'shilin'），不是 RedRock 系統慣用的 'gym-hsinchu'/'gym-shilin'。

const AGENT_BASE = 'http://localhost:3399';

const shortGymId = (gymId) => String(gymId || '').replace(/^gym-/, '');

// 查詢代理狀態：connected＝印表機是否真的有回應；positionOk＝存根聯/收執聯定位是否正常
// （true/false/null，null＝查詢無回應，未知不代表異常）。兩者皆已於 2026-08-12 在真實 WP-560
// 上實機驗證通過（含極性校正，見 local-print-agent/server.js 檔頭說明）。
// 連不到本機服務時回全 false/null，不丟例外。
export async function checkPrinterAgent() {
  try {
    const res = await fetch(`${AGENT_BASE}/status`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return { connected: !!data.connected, positionOk: data.positionOk ?? null };
  } catch {
    return { connected: false, positionOk: null };
  }
}

// 送出實際列印。代理永遠回 HTTP 200（成功/失敗都用 body.ok 表示，見 server.js），
// 這裡統一轉成「失敗就丟例外」，方便呼叫端用同一套 try/catch 處理。
export async function printReceipt({ gymId, items, buyerTaxId, openDrawer }) {
  let res;
  try {
    res = await fetch(`${AGENT_BASE}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gymId: shortGymId(gymId), items, buyerTaxId: buyerTaxId || undefined, openDrawer: !!openDrawer }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new Error('無法連線到本機列印代理，請確認 local-print-agent 是否已在此電腦啟動');
  }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '印表機回應失敗，請確認紙張與連線後重試');
  return data;
}
