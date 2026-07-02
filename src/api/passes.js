import client, { memberClient } from './client';

// 定期票
export const getPassTypes = (gymId) => client.get('/passes/types', { params: gymId ? { gymId } : {} });
export const getMemberPasses = (memberId) => client.get(`/passes/member/${memberId}`);
export const getMemberPassesAsMember = (memberId) => memberClient.get(`/passes/member/${memberId}`);
export const createPass = (data) => client.post('/passes', data);
export const updatePass = (id, data) => client.put(`/passes/${id}`, data);
export const renewPass = (id, data) => client.put(`/passes/${id}`, { ...data, renew: true });

// 票種定義
export const createPassType = (data) => client.post('/passes/types', data);
export const updatePassType = (id, data) => client.put(`/passes/types/${id}`, data);
export const deactivatePassType = (id) => client.delete(`/passes/types/${id}`);

// 單次入場券
// 員工端專用：用 staff client（路由 authenticateAny 接受員工 token）。
// 先前誤用 memberClient，員工無 member_token → 401 → 攔截器導向 /member/login（點選會員會「跳出去」）。
export const getMemberSingleEntryTickets = (memberId) =>
  client.get(`/passes/single-entry/member/${memberId}`);
export const getPendingTickets = (gymId) =>
  client.get('/passes/single-entry/pending', { params: gymId ? { gymId } : {} });
export const issueSingleEntryTicket = (data) =>
  client.post('/passes/single-entry', data);
export const approveTicket = (id) =>
  client.post(`/passes/single-entry/${id}/approve`);
export const rejectTicket = (id, reason) =>
  client.post(`/passes/single-entry/${id}/reject`, { reason });
export const transferTicket = (id, toMemberId) =>
  client.post(`/passes/single-entry/${id}/transfer`, { toMemberId });
