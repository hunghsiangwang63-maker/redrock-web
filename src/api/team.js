import client, { memberClient } from './client';

export const getTeamFees = () => memberClient.get('/team/fees');
export const applyTeam = (data) => memberClient.post('/team/apply', data);
export const getMyTeamRecords = () => memberClient.get('/team/my');
export const getTeamMembers = (year) => client.get('/team/members', { params: { year } });
export const confirmTeamPayment = (id) => client.post(`/team/applications/${id}/confirm-payment`);
export const downloadTeamCSV = (year) =>
  `${import.meta.env.VITE_API_BASE || 'https://redrock-api-production.up.railway.app'}/team/members/download?year=${year}`;

// settings
export const getTeamFeeSettings = () => client.get('/settings/team-fees');
export const updateTeamFeeSettings = (data) => client.put('/settings/team-fees', data);
