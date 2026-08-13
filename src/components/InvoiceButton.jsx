// 「🧾 開立發票」固定按鍵共用樣式——已開立時反白顯示發票號碼（不再永遠是同一個空白可點的按鍵）。
// 點擊行為不變（仍呼叫 onClick 開啟各流程自己的 InvoiceIssuer modal；modal 內部本就會再次查一次
// 「是否已開立」並顯示唯讀摘要，不會重複列印/重複消耗號碼——這裡純粹是讓店員不用點進去就能一眼
// 看到狀態與號碼）。
import { useState, useEffect } from 'react';
import client from '../api/client';

const BASE = { height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid #E8D5D5', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 };

// 純顯示版：呼叫端已經知道 invoiceNo（如課程/比賽名單，後端批次 join 好一次帶入），不用再各自打一次 API。
// style 選填：多數地方是小顆藥丸狀（BASE 預設），少數（如比賽報到掃描結果頁）是滿版主要按鈕，
// 這裡只覆蓋尺寸/排版類樣式、已開立/未開立的底色與文字色仍統一由本元件決定。
// merged：這筆訂單是被「合併列印發票」涵蓋（多筆入場合開一張），非自己單獨的發票——標示清楚避免
// 誤會這個號碼只對應這一筆金額。
export function InvoiceButtonView({ invoiceNo, merged, onClick, style }) {
  const issued = !!invoiceNo;
  return (
    <button onClick={onClick}
      style={{ ...BASE, ...style, background: issued ? '#F0EDED' : '#FBF5F5', color: issued ? '#777' : '#8B1A1A' }}>
      {issued ? `🧾 已開立 ${invoiceNo}${merged ? '（合併列印）' : ''}` : '🧾 開立發票'}
    </button>
  );
}

// 自動查詢版：畫面上同時只會出現一筆（如剛完成的這筆入場/銷售/歸還），沒有現成的 invoiceNo 可用，
// 改由這顆按鈕自己查一次 GET /invoices/status（單筆非列表，成本可忽略；同時涵蓋真實列印版與過渡期
// 手動記帳版兩套）。refreshToken 變動時（如剛關閉發票 modal）會重新查一次，讓狀態立刻反映最新結果。
export function InvoiceButtonAuto({ sourceType, refId, refreshToken, onClick, style }) {
  const [invoiceNo, setInvoiceNo] = useState(null);
  const [merged, setMerged] = useState(false);
  useEffect(() => {
    if (!sourceType || !refId) { setInvoiceNo(null); setMerged(false); return; }
    let alive = true;
    client.get('/invoices/status', { params: { sourceType, refId } })
      .then(r => { if (alive) { setInvoiceNo(r.data.invoiceNo || null); setMerged(!!r.data.merged); } })
      .catch(() => { if (alive) { setInvoiceNo(null); setMerged(false); } });
    return () => { alive = false; };
  }, [sourceType, refId, refreshToken]);
  return <InvoiceButtonView invoiceNo={invoiceNo} merged={merged} onClick={onClick} style={style} />;
}
