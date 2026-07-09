// 前端年齡工具（友善提示用；後端仍為權威）——以出生日期計算實際年齡。
import dayjs from 'dayjs';

export const ageOf = (birthday) => {
  const b = (birthday && typeof birthday === 'object') ? birthday.birthday : birthday;
  if (!b) return null;
  const d = dayjs(b);
  if (!d.isValid()) return null;
  return dayjs().diff(d, 'year');
};

// 未滿 5 歲（有生日才判斷）
export const isUnder5 = (memberOrBirthday) => {
  const a = ageOf(memberOrBirthday);
  return a !== null && a < 5;
};

// 兒童：未滿 13 歲（用出生日期，不看 memberType）
export const isChild = (memberOrBirthday) => {
  const a = ageOf(memberOrBirthday);
  return a !== null && a < 13;
};
