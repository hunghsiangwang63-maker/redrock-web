import client, { memberClient } from './client';

// 工作人員端
export const verifyEntry = (identifier, gymId) =>
  client.post('/checkin/verify', { identifier, gymId });

export const scanQrCode = (qrToken) =>
  client.post('/checkin/qr/scan', { qrToken });

export const confirmCheckIn = (qrToken) =>
  client.post('/checkin/qr/confirm', { qrToken });

export const cancelCheckIn = (checkInId) =>
  client.post('/checkin/cancel', { checkInId });

export const recordCheckIn = (data) =>
  client.post('/checkin/record', data);

export const getTodayStats = (gymId) =>
  client.get('/checkin/today', { params: gymId ? { gymId } : {} });

export const getTodayCourseStudents = (gymId) =>
  client.get('/checkin/today-course-students', { params: { gymId } });

export const getCheckInHistory = (params) =>
  client.get('/checkin/history', { params });

// 會員端
export const memberVerifyEntry = (gymId) =>
  memberClient.post('/checkin/verify-member', { gymId });

export const createQrCode = (data) =>
  memberClient.post('/checkin/qr/create', data);
