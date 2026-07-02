import client from './client';

// 館別電腦帳號管理（系統管理員）
export const getStations = () => client.get('/stations');
export const createStation = (data) => client.post('/stations', data);
export const updateStation = (id, data) => client.put(`/stations/${id}`, data);
