// 快速入場：記住會員常用的入場選擇（只存在這台裝置的 localStorage，依會員 id 分開）。
// 只記「可重複的選擇」：場館、入場人員、身分、方案（單次付費／優惠券／黑卡／紅利／入場券／免費資格）、
// 租借器材與付款方式；不記購買定期票／購買優惠券、友館隊員／特約廠商優惠（需櫃檯核對）、續約。
// 一鍵產 QR 時，資格是否仍有效一律以後端 /checkin/verify 即時結果為準（見 MemberQRPage.resolveQuick）。
const key = (memberId) => `memberQuickEntry_${memberId}`;

export function loadQuickEntry(memberId) {
  if (!memberId) return null;
  try {
    const q = JSON.parse(localStorage.getItem(key(memberId)) || 'null');
    return q && q.v === 1 && q.kind && q.type ? q : null;
  } catch { return null; }
}

export function saveQuickEntry(memberId, pref) {
  if (!memberId) return;
  try { localStorage.setItem(key(memberId), JSON.stringify({ v: 1, ...pref, savedAt: Date.now() })); } catch (e) {}
}

export function clearQuickEntry(memberId) {
  if (!memberId) return;
  try { localStorage.removeItem(key(memberId)); } catch (e) {}
}
