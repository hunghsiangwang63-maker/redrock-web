import client from './client';

export const searchMembers = (q) =>
  client.get('/members', { params: { q } });

export const getMember = (id) =>
  client.get(`/members/${id}`);

export const createMember = (data) =>
  client.post('/members', data);

export const updateMember = (id, data) =>
  client.put(`/members/${id}`, data);

export const promoteChild = (childId, data) =>
  client.post(`/members/${childId}/promote`, data);

export const getMemberWaiver = (memberId) => client.get(`/members/${memberId}/waiver`);
export const resetMemberWaiver = (memberId, reason) => client.post(`/members/${memberId}/waiver/reset`, { reason });
