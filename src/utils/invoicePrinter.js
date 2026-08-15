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
// ⚠️ 2026-08-15 修：逾時原本設 3 秒，但 server.js 檔頭本就記錄過「部分機器（USB轉序列埠硬體/
// 驅動較慢）直接查詢一次要 6 秒才有回應」，伺服器端自己的等待時間早就因此拉長到 15 秒——這裡
// 卻還停在 3 秒，士林那台機器每次都在伺服器真的回應之前就被這裡的前端逾時打斷，UI 因此永遠顯示
// 「無法連線」、列印鍵也跟著鎖死（agentConnected===false 會 disable 按鈕，見 InvoiceIssuer.jsx），
// 跟印表機/CORS 都無關、純粹是這裡等太短。拉長到 15 秒對齊伺服器端；同時把原本完全安靜的失敗
// 補上一行 console.warn（帶實際錯誤名稱/訊息），下次類似狀況不用再靠這樣一輪一輪排除法才找到。
export async function checkPrinterAgent() {
  try {
    const res = await fetch(`${AGENT_BASE}/status`, { signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    return { connected: !!data.connected, positionOk: data.positionOk ?? null };
  } catch (e) {
    console.warn('[invoicePrinter] 印表機連線狀態查詢失敗：', e && (e.name + ': ' + e.message));
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
