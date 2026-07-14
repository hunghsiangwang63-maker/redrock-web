// 會員端功能鍵輕量雙語（第一層：只翻導航與功能按鈕，不動內文）
// 原則：以「中文原文」為 key —— 中文模式或查無對照時一律原樣返回 → 中文版行為零改動。
// 切換語言後 window.location.reload() 重載，所有頁面同步生效（免 React 全域狀態）。

const DICT = {
  // 底部導航
  '首頁': 'Home',
  '課程總覽': 'Courses',
  '我的票券': 'My Passes',
  '我的': 'Me',
  // 首頁快速功能
  '入場QR碼': 'Entry QR',
  '我的紀錄': 'My Records',
  '比賽報名': 'Competitions',
  '體驗課程': 'Trial Class',
  '加入攀岩隊': 'Join Team',
  '器材租借': 'Gear Rental',
};

export const getMemberLang = () => {
  try { return localStorage.getItem('memberLang') || 'zh'; } catch { return 'zh'; }
};

export const toggleMemberLang = () => {
  try { localStorage.setItem('memberLang', getMemberLang() === 'en' ? 'zh' : 'en'); } catch {}
  window.location.reload();
};

// 中文模式（預設）→ 原樣返回；英文模式 → 查字典，查無仍原樣返回（安全 fallback）
export const t = (zh) => (getMemberLang() === 'en' && DICT[zh]) || zh;
