import QRCode from 'qrcode';

// 用 SVG 字串產生 QR code data URL，取代 canvas 版 QRCode.toDataURL()。
// 回報：兩位新會員（Grace ko／Sabrina Raso，2026-09-26 士林館現場）產生入場 QR 時卡住、
// 最終要靠店員手動查詢入場——追查發現後端 `/checkin/qr/create` 其實已成功建立
// pendingCheckIn 記錄（token 正常，長度/格式皆無異常），問題卡在**產生 QR 圖片這一步**：
// canvas 版 `QRCode.toDataURL()` 在瀏覽器內部呼叫 Canvas API 繪圖再轉成 PNG data URL，
// 若特定裝置/瀏覽器環境對 Canvas API 有限制（記憶體/隱私設定/罕見 WebView 版本等，
// 在此環境無法重現確切原因），這一步就可能拋出例外，導致畫面卡在「產生 QR Code 失敗」，
// 即使後端資料已經正確建立。
// 改用 `QRCode.toString(text, {type:'svg'})`：純字串運算產生 SVG，完全不經過 Canvas API，
// 對瀏覽器環境的依賴少很多。輸出包成 `data:image/svg+xml` URI，可直接餵給 `<img src>`，
// 跟原本 canvas 版 `<img src="data:image/png...">` 的用法完全相容，呼叫端不用改渲染邏輯。
export async function generateQrDataUrl(text, opts = {}) {
  const svg = await QRCode.toString(text, { type: 'svg', ...opts });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
