import client from './client';

export const getTeamMembers = () => client.get('/team-members');
export const getExpiringTeamMembers = (days) => client.get('/team-members/expiring', { params: days ? { days } : {} });
export const setTeamMember = (memberId, since, until) => client.post(`/team-members/${memberId}/set`, { since, until });
export const removeTeamMember = (memberId) => client.delete(`/team-members/${memberId}`);
