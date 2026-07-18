import client, { memberClient } from './client';

export const getRentalSettings = () => memberClient.get('/rentals/settings');           // 會員端（member token）
export const getRentalSettingsStaff = () => client.get('/rentals/settings');            // 員工端（staff token；誤用 memberClient 會 401 被攔截器踢去會員登入頁）
export const updateRentalSettings = (data) => client.put('/rentals/settings', data);
export const applyRental = (data) => memberClient.post('/rentals/apply', data);
export const getMyRentals = () => memberClient.get('/rentals/my');
export const getRentals = (params) => client.get('/rentals', { params });
export const getRentalStats = (params) => client.get('/rentals/stats', { params });
export const confirmRental = (id) => client.post(`/rentals/${id}/confirm`);
export const cancelRentalMember = (id) => memberClient.post(`/rentals/${id}/cancel`);
export const updateRentalMember = (id, data) => memberClient.put(`/rentals/${id}`, data);
export const cancelRentalStaff = (id) => client.post(`/rentals/${id}/cancel`);
export const updateRentalStaff = (id, data) => client.put(`/rentals/${id}`, data);
export const saveRentalStaffNote = (id, staffNote) => client.put(`/rentals/${id}/staff-note`, { staffNote });
export const returnRentalDeposit = (id) => client.post(`/rentals/${id}/return-deposit`);
export const returnRental = (id, data) => client.post(`/rentals/${id}/return`, data);
