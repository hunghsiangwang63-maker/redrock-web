import client, { memberClient } from './client';

export const getCompetitions = (params) => client.get('/competitions', { params });
export const createCompetition = (data) => client.post('/competitions', data);
export const updateCompetition = (id, data) => client.put(`/competitions/${id}`, data);
export const deleteCompetition = (id) => client.delete(`/competitions/${id}`);
export const getCompetition = (id) => memberClient.get(`/competitions/${id}`);
export const getCompetitionRegistrations = (id) => client.get(`/competitions/${id}/registrations`);
export const downloadCompetitionCSV = (id) => `${import.meta.env.VITE_API_BASE || ''}/competitions/${id}/registrations/download`;
export const confirmCompetitionPayment = (regId, data) => client.post(`/competitions/registrations/${regId}/confirm-payment`, data);
export const rejectCompetitionPayment = (regId, data) => client.post(`/competitions/registrations/${regId}/reject-payment`, data);
export const refundCompetitionRegistration = (regId, data) => client.post(`/competitions/registrations/${regId}/refund`, data);
// 管理員退回報名表（會員修改重送）/ 駁回取消
export const returnCompetitionForm = (regId, data) => client.post(`/competitions/registrations/${regId}/return-form`, data);
export const rejectCompetitionForm = (regId, data) => client.post(`/competitions/registrations/${regId}/reject-form`, data);
// 會員修改報名資料後重送（被退回後）
export const updateCompetitionForm = (regId, data) => memberClient.post(`/competitions/registrations/${regId}/update-form`, data);

export const cancelRegistration = (regId, data) => memberClient.post(`/competitions/registrations/${regId}/cancel`, data);
export const getMemberCompetitions = () => memberClient.get('/competitions');
export const getMemberRegistrations = (memberId) => memberClient.get(`/competitions/registrations/member/${memberId}`);
export const registerForCompetition = (competitionId, data) => memberClient.post(`/competitions/${competitionId}/register`, data);
