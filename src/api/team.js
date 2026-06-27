import client, { memberClient } from './client';

export const getTeamFees = () => memberClient.get('/team/fees');
export const applyTeam = (data) => memberClient.post('/team/apply', data);
export const getMyTeamRecords = () => memberClient.get('/team/my');
export const getTeamMembers = (year) => client.get('/team/members', { params: { year } });
export const confirmTeamPayment = (id) => client.post(`/team/applications/${id}/confirm-payment`);
export const createTeamMember = (data) => client.post('/team/members', data);
export const updateTeamApplication = (id, data) => client.put(`/team/applications/${id}`, data);
export const deleteTeamApplication = (id) => client.delete(`/team/applications/${id}`);
export const downloadTeamFile = (year) => client.get('/team/members/download', { params: { year }, responseType: 'blob' });

// settings
export const getTeamFeeSettings = () => client.get('/settings/team-fees');
export const updateTeamFeeSettings = (data) => client.put('/settings/team-fees', data);
