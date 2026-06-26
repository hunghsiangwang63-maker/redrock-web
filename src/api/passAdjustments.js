import client, { memberClient } from './client';

export const getReasons = () => client.get('/pass-adjustments/reasons');
export const getPassHistory = (passId) => client.get(`/pass-adjustments/history/${passId}`);
export const editPassWithReason = (passId, data) => client.put(`/pass-adjustments/${passId}/edit`, data);

// 員工審核
export const getAllPassRequests = (status) => client.get('/pass-adjustments/requests', { params: status ? { status } : {} });
export const approvePassRequest = (id, data) => client.post(`/pass-adjustments/requests/${id}/approve`, data);
export const rejectPassRequest = (id, rejectReason) => client.post(`/pass-adjustments/requests/${id}/reject`, { rejectReason });

// 年假批次展延
export const runHolidayBatchExtension = (holidayRanges) => client.post('/pass-adjustments/holiday-batch', { holidayRanges });
export const getHolidayHistory = () => client.get('/pass-adjustments/holiday-history');

// 會員端
export const getMemberReasons = () => memberClient.get('/pass-adjustments/reasons');
export const uploadEvidence = (formData) => memberClient.post('/pass-adjustments/evidence', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const createPassRequest = (data) => memberClient.post('/pass-adjustments/requests', data);
export const getMyPassRequests = (memberId) => memberClient.get(`/pass-adjustments/requests/member/${memberId}`);
