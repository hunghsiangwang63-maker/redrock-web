import client from './client';

export const getStaffList = () => client.get('/staff');
export const createStaff = (data) => client.post('/staff', data);
export const updateStaff = (id, data) => client.put(`/staff/${id}`, data);
export const resetStaffPassword = (id, password) => client.post(`/staff/${id}/reset-password`, { password });
export const toggleStaffActive = (id) => client.post(`/staff/${id}/toggle-active`);
export const deleteStaff = (id) => client.delete(`/staff/${id}`);
