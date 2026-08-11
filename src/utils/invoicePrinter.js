// 本機發票列印代理（local-print-agent）用戶端 —— 純函式，不含 React。
// 代理跑在櫃檯電腦本機 http://localhost:3399，由員工端網頁直接呼叫（非透過 RedRock 後端 API，
// 後端在雲端、沒有路徑連到現場電腦；見 docs/invoice-integration-plan.md 第 3 節「本地列印代理」設計）。
// ⚠️ 代理的 gymId 只吃短名（'hsinchu'/'shilin'），不是 RedRock 系統慣用的 'gym-hsinchu'/'gym-shilin'。

const AGENT_BASE = 'http://localhost:3399';

const shortGymId = (gymId) => String(gymId || '').replace(/^gym-/, '');

// 檢查代理是否連線中（印表機真的有回應，非只是 COM 埠開得起來，已於 2026-08-12 實機驗證通過）。
// 連不到本機服務或印表機斷線都回 false，不丟例外。
// ⚠️ 原本這裡還會回傳 positionOk（紙張定位偵測），已於 2026-08-12 實機測試證實這台印表機的
// DLE EOT 4 查詢不隨實際紙張狀態變化（回傳固定值），繼續使用會讓系統誤報「定位正常」掩蓋真正
// 異常，故撤回，見 local-print-agent/server.js 檔頭說明；紙張定位目前仍完全信任印表機自身既有的
// 自動對位機制（0x0C，已驗證可靠）。
export async function checkPrinterAgent() {
  try {
    const res = await fetch(`${AGENT_BASE}/status`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return !!data.connected;
  } catch {
    return false;
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
