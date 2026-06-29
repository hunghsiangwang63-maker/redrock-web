import { memberClient } from './client';

// 會員提交轉帳待確認（截圖或末五碼擇一）→ 建立 transferRecords，員工於待辦頁「轉帳確認」確認收款。
// orderType: course | experience | competition | rental | team_member；refId = 該訂單 id。
export const submitTransferRecord = ({
  memberId, memberName, gymId, orderType, refId, orderName,
  amount, bankLastFive, bankName, paymentDate, screenshot,
}) => {
  const fd = new FormData();
  if (screenshot) fd.append('screenshot', screenshot);
  fd.append('memberId', memberId || '');
  fd.append('memberName', memberName || '');
  fd.append('gymId', gymId || '');
  fd.append('orderType', orderType);
  fd.append('refId', refId);
  fd.append('orderName', orderName || '');
  fd.append('amount', amount || 0);
  if (bankLastFive) fd.append('bankLastFive', bankLastFive);
  if (bankName) fd.append('bankName', bankName);
  if (paymentDate) fd.append('paymentDate', paymentDate);
  return memberClient.post('/transfers/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
