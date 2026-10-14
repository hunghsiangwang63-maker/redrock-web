import client from '../api/client';

// 員工端檔案下載（Excel/CSV）共用工具：一律走共用 client（自動帶正確 token、401 時自動清除失效登入）。
// 取代各頁手刻 fetch()+手讀 localStorage token（2026-09-28 月銷售紀錄 401 同型問題）。
// - 下載檔案可能較大/後端要現場產生，逾時放寬到 60 秒（共用 client 預設 10 秒，原手刻 fetch 無逾時）。
// - 失敗時拋出 Error（message 已整理好，可直接顯示）：403→「權限不足」，其餘「狀態碼 + 回應文字前 120 字」。
// - 後端回 JSON/文字錯誤時（responseType 為 blob），把 blob 讀回文字，避免把錯誤內容當成檔案存下來。
export async function downloadFile(url, { params, filename }) {
  let res;
  try {
    res = await client.get(url, { params, responseType: 'blob', timeout: 60000 });
  } catch (e) {
    const status = e.response?.status;
    if (status === 403) throw new Error('權限不足');
    let text = '';
    try { text = e.response?.data?.text ? await e.response.data.text() : ''; } catch (_) { /* 讀不到就略過 */ }
    if (status) throw new Error(`${status} ${text.slice(0, 120)}`.trim());
    throw new Error(e.code === 'ECONNABORTED' ? '連線逾時' : (e.message || '網路連線失敗'));
  }
  const objUrl = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = objUrl; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
}
