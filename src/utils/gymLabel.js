// 場館標籤共用工具
export const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };

export const gymLabel = (gymId) => GYM_LABEL[gymId] || '';

// 課程/項目名稱前綴：【新竹館】；未知 / 雙館 / 空 → 回空字串（不前綴）
export const gymPrefix = (gymId) => {
  const l = GYM_LABEL[gymId];
  return l ? `【${l}】` : '';
};
