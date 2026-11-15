// 純函式：依「台灣日期」從季節清單挑出目前套用外觀／顯示收件匣的季節（不依賴 React、方便測試）。
export const pickActive = (list, today) => list.find(s => today >= s.start && today <= s.end) || null;
// 寄送期間＋之後到 inboxEnd；多季重疊時取開始日最晚者
export const pickInbox = (list, today) => list.filter(s => today >= s.start && today <= s.inboxEnd).sort((a, b) => b.start.localeCompare(a.start))[0] || null;
