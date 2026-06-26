import client from './client';

export const createInstallmentPlan = (data) => client.post('/installments', data);
export const markInstallmentPaid = (planId, seq, paymentMethod) =>
  client.post(`/installments/${planId}/pay`, { seq, paymentMethod });
export const getMemberInstallments = (memberId) => client.get(`/installments/member/${memberId}`);
export const getAllInstallments = (status) => client.get('/installments', { params: status ? { status } : {} });
export const runOverdueCheck = () => client.post('/installments/run-overdue-check');
export const sendInstallmentReminders = () => client.post('/installments/send-reminders');
