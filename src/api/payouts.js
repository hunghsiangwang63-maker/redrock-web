import client from './client';

export const getPayouts = (params) =>
  client.get('/payouts', { params });

export const createPayout = (data) =>
  client.post('/payouts', data);

export const updatePayout = (id, data) =>
  client.put(`/payouts/${id}`, data);

export const deletePayout = (id) =>
  client.delete(`/payouts/${id}`);

export const exportPayouts = (params) =>
  client.get('/payouts/export', { params, responseType: 'blob' });
