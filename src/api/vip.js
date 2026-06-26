import client from './client';

export const getVipList = () => client.get('/vip');
export const addVip = (memberId, note) => client.post('/vip', { memberId, note });
export const updateVip = (id, note) => client.put(`/vip/${id}`, { note });
export const removeVip = (id) => client.delete(`/vip/${id}`);
