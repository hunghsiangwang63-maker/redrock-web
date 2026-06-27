import client, { memberClient } from './client';

export const getGyms = () => client.get('/gyms');
export const getAllGyms = () => client.get('/gyms/all'); // 員工用，含暫停場館
export const getGymStatus = (gymId) => client.get(`/gyms/${gymId}/today-status`);
export const getAnnouncements = () => client.get('/gyms/announcements/all', { params: { all: 1 } });
export const getMemberGyms = () => memberClient.get('/gyms');
export const getMemberAnnouncements = () => memberClient.get('/gyms/announcements/all');

export const updateGymInfo = (gymId, data) => client.put(`/gyms/${gymId}`, data);
export const updateGymHours = (gymId, regularHours) => client.put(`/gyms/${gymId}/hours`, { regularHours });
export const createAnnouncement = (gymId, data) => client.post(`/gyms/${gymId}/announcements`, data);
export const updateAnnouncement = (gymId, aid, data) => client.put(`/gyms/${gymId}/announcements/${aid}`, data);
export const deleteAnnouncement = (gymId, aid) => client.delete(`/gyms/${gymId}/announcements/${aid}`);
