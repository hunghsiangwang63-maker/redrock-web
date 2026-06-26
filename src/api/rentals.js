import client, { memberClient } from './client';

export const getRentalSettings = () => memberClient.get('/rentals/settings');
export const updateRentalSettings = (data) => client.put('/rentals/settings', data);
export const applyRental = (data) => memberClient.post('/rentals/apply', data);
export const getMyRentals = () => memberClient.get('/rentals/my');
export const getRentals = (params) => client.get('/rentals', { params });
export const getRentalStats = (params) => client.get('/rentals/stats', { params });
export const confirmRental = (id) => client.post(`/rentals/${id}/confirm`);
export const returnRental = (id, data) => client.post(`/rentals/${id}/return`, data);
