import client from './client';

export const createInstallmentPlan = (data) => client.post('/installments', data);
export const markInstallmentPaid = (planId, seq, paymentMethod) =>
  client.post(`/installments/${planId}/pay`, { seq, paymentMethod });
// 整筆標記已一次繳清（實際上非依原分期時間分次繳，管理員直接登記結清；未繳清各期一次補記帳，狀態轉 completed 後不再發任何提醒）
export const markInstallmentPaidInFull = (planId, paymentMethod, note) =>
  client.post(`/installments/${planId}/mark-paid-in-full`, { paymentMethod, note });
export const getMemberInstallments = (memberId) => client.get(`/installments/member/${memberId}`);
export const getAllInstallments = (status) => client.get('/installments', { params: status ? { status } : {} });
export const runOverdueCheck = () => client.post('/installments/run-overdue-check');
export const sendInstallmentReminders = () => client.post('/installments/send-reminders');
