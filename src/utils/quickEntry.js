// 快速入場：記住「每一位入場人員」常用的入場選擇（只存在這台裝置的 localStorage）。
// 登入帳號底下有家庭成員時，本人與每位子會員各自一份記憶，首頁快速入場先選人再一鍵產 QR。
// 只記「可重複的選擇」：場館、身分、方案（單次付費／優惠券／黑卡／紅利／入場券／免費資格）、
// 租借器材與付款方式；不記購買定期票／購買優惠券、友館隊員／特約廠商優惠（需櫃檯核對）、續約。
// 一鍵產 QR 時，資格是否仍有效一律以後端 /checkin/verify 即時結果為準（見 MemberQRPage.resolveQuick）。
const key = (memberId, personId) => `memberQuickEntry_${memberId}${personId && personId !== memberId ? '_' + personId : ''}`;

// personId 省略＝登入者本人
export function loadQuickEntry(memberId, personId) {
  if (!memberId) return null;
  try {
    const q = JSON.parse(localStorage.getItem(key(memberId, personId)) || 'null');
    if (!(q && q.v === 1 && q.kind && q.type)) return null;
    // 舊版（一個帳號只存一份）曾把子會員的選擇存在本人這一格；本人這格若記的是子會員就不採用
    if ((!personId || personId === memberId) && q.targetId) return null;
    return q;
  } catch { return null; }
}

export function saveQuickEntry(memberId, personId, pref) {
  if (!memberId) return;
  try { localStorage.setItem(key(memberId, personId), JSON.stringify({ v: 1, ...pref, savedAt: Date.now() })); } catch (e) {}
}

export function clearQuickEntry(memberId, personId) {
  if (!memberId) return;
  try { localStorage.removeItem(key(memberId, personId)); } catch (e) {}
}
