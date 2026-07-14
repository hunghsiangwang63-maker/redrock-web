// 入場類型顯示名稱（全站統一）：pass=定期票、buy_pass=購買定期票…
// 各頁面顯示 entryType 一律走此表，避免有些地方顯示原始英文 key（pass / buy_pass）。
export const ENTRY_TYPE_LABEL = {
  pass: '定期票', competition: '比賽報到',
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
