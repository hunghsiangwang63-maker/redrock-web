// 入場類型顯示名稱（全站統一）：pass=定期票、buy_pass=購買定期票…
// 各頁面顯示 entryType 一律走此表，避免有些地方顯示原始英文 key（pass / buy_pass）。
export const ENTRY_TYPE_LABEL = {
  pass: '定期票', competition: '比賽報到', staff_entry: '員工入館',
  monthly_pass: '定期票',
  buy_pass: '購買定期票',
  vip: 'VIP',
  course_access: '課程學員',
  child_free: '兒童入場',
  student_free: '學生入場',
  discount_card: '優惠折扣券',
  black_card: '黑卡',
  bonus: '紅利入場',
  single_entry_ticket: '單次入場券',
  single_ticket: '單次購票',
  buy_discount_card: '購買優惠折扣券',
  experience: '體驗',
  already_paid: '已付費（舊系統）',
};

export const entryTypeLabel = (type) => ENTRY_TYPE_LABEL[type] || type || '入場';

// 依「入場紀錄」給顯示標籤：舊折扣卡8折（實體優惠卡）優先於 entryType
export const entryLabelOf = (rec) =>
  rec?.legacyDiscount === true ? '實體優惠卡' : entryTypeLabel(rec?.entryType);

// ── 結帳用的入場分類（與後端 dailySettlements.js 的 entryCategory 同一套邏輯，供發票品項預設名稱
// 使用——讓「開立發票」看到的品項跟「今日結帳」的入場分類一致，不是另一套獨立的英文 entryType 標籤）。
// ⚠️ 折扣互斥優先序（隊員/優惠券/特約商店）需與後端 checkin/pricing.js 保持一致，改動請兩邊同步。
const SETTLEMENT_ENTRY_LABEL = {
  single_ticket: '成人', pass: '定期票', competition: '比賽報到', buy_pass: '購買定期票',
  buy_discount_card: '購買優惠折扣券', vip: 'VIP', course_access: '課程學員', discount_card: '優惠折扣券',
  black_card: '黑卡', child_free: '兒童', student_free: '學生', bonus: '紅利', experience: '體驗',
  single_entry_ticket: '單次入場券',
};
const ENTRY_APPEND_SET = ['成人', '學生', '兒童', '成人使用優惠券', '學生使用優惠券', '隊員折扣', '隊員＋優惠券'];
export const entrySettlementCategory = (rec) => {
  const team = rec?.isTeamDiscount === true;
  const coupon = rec?.legacyDiscount === true || rec?.entryType === 'discount_card';
  if (team && coupon) return '隊員＋優惠券';
  if (team) return '隊員折扣';
  if (coupon) return (rec?.entryType === 'student_free' || rec?.baseEntryType === 'student_free') ? '學生使用優惠券' : '成人使用優惠券';
  return SETTLEMENT_ENTRY_LABEL[rec?.entryType] || rec?.entryType || '其他入場';
};

// 發票「入場」品項預設名稱：結帳分類＋特約商店註記（僅發票標註，settlement 報表本身不拆這項）＋
// 成人/學生/兒童系列補「入場」二字（單獨顯示「成人」在收據上不夠清楚），其餘分類（VIP/定期票…）維持原樣。
export const invoiceEntryItemName = (rec) => {
  const cat = entrySettlementCategory(rec);
  const withPartner = rec?.partnerVendor === true ? `${cat}（特約商店）` : cat;
  return ENTRY_APPEND_SET.includes(cat) ? `${withPartner}入場` : withPartner;
};

// 發票「租借器材」品項名稱（岩鞋/粉袋跟入場費分開列，比照結帳「租借」與「入場」本就是分開的兩個分類）；
// 兩者皆無租借則回傳 null（呼叫端據此判斷要不要另外加一行）。
export const invoiceRentalItemName = (rec) => {
  const shoes = Number(rec?.shoesPrice) > 0;
  const chalk = Number(rec?.chalkPrice) > 0;
  if (shoes && chalk) return '租借岩鞋+粉袋';
  if (shoes) return '租借岩鞋';
  if (chalk) return '租借粉袋';
  return null;
};
