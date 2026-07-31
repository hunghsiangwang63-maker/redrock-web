// 台灣公司統一編號（8 碼）檢查碼驗證——與後端 src/utils/taiwanTaxId.js 同一套演算法，前端僅供即時提示，後端才是權威。
const WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

export const isValidTaiwanTaxId = (id) => {
  const s = String(id || '').trim();
  if (!/^\d{8}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const prod = Number(s[i]) * WEIGHTS[i];
    sum += Math.floor(prod / 10) + (prod % 10);
  }
  if (s[6] === '7') return sum % 5 === 0 || (sum + 1) % 5 === 0;
  return sum % 5 === 0;
};
