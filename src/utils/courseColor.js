// 課程月曆配色：依課程給不同淺色底 + 對應深色文字（員工/會員月曆共用）。
// 底色一律淺色；文字用同色系深色確保可讀。以課程 key 雜湊取色，穩定不隨機。
const COURSE_PALETTE = [
  { bg: '#FBF0F0', fg: '#A32D2D' }, // 紅
  { bg: '#EAF3FB', fg: '#185FA5' }, // 藍
  { bg: '#E9F6EE', fg: '#2D7D46' }, // 綠
  { bg: '#FBF3E3', fg: '#B26A00' }, // 琥珀
  { bg: '#F1ECFA', fg: '#6B3FA0' }, // 紫
  { bg: '#FCEEF4', fg: '#A83668' }, // 粉
  { bg: '#E7F5F4', fg: '#1F7A7A' }, // 青
  { bg: '#ECEEFB', fg: '#3B4C9A' }, // 靛
  { bg: '#F3F1E6', fg: '#6E6524' }, // 橄欖
  { bg: '#F6EEE8', fg: '#8A4B2A' }, // 棕
];

// key 建議傳 courseId（同一課程各場次同色）；退而用 courseName。
export function courseColor(key) {
  const s = String(key || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COURSE_PALETTE[h % COURSE_PALETTE.length];
}
