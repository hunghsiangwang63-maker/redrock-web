// 場館「今日場館」三態顯示：營業中（現在時刻在營業時段內）／休息中（今天有營業時段但現在不在其中）／
// 今日休館（休館公告或公休、今天沒有營業時段）。依後端 todayStatus.isOpenNow（true/false/null）判斷，
// 已含特殊營業時間與臨時休館覆寫（getGymStatusForDate 算好才回傳）。
export function gymOpenLabel(todayStatus) {
  if (!todayStatus) return { label: '—', color: '#999', bg: '#F5F5F5' };
  if (todayStatus.isOpenNow === true) return { label: '營業中', color: '#2D7D46', bg: '#E6F4EB' };
  if (todayStatus.isOpenNow === false) return { label: '休息中', color: '#854F0B', bg: '#FAEEDA' };
  return { label: '今日休館', color: '#A32D2D', bg: '#FCEBEB' };
}
