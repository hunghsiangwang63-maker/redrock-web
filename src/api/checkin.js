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

export const getTodayStats = (gymId) =>
  client.get('/checkin/today', { params: gymId ? { gymId } : {} });

export const getTodayCourseStudents = (gymId) =>
  client.get('/checkin/today-course-students', { params: { gymId } });

export const getCheckInHistory = (params) =>
  client.get('/checkin/history', { params });

// 入場開立發票（手動記帳版，比照課程/比賽同一套 InvoiceModal）
export const getCheckinInvoices = (checkInId) =>
  client.get(`/checkin/${checkInId}/invoices`);

export const createCheckinInvoice = (checkInId, data) =>
  client.post(`/checkin/${checkInId}/invoices`, data);

export const voidCheckinInvoice = (id, voidReason) =>
  client.post(`/checkin/invoices/${id}/void`, { voidReason });

// 補租器材開立發票（手動記帳版；作廢共用上面 voidCheckinInvoice，不分 sourceType）
export const getRentalAddonInvoices = (addonId) =>
  client.get(`/checkin/add-rental/${addonId}/invoices`);

export const createRentalAddonInvoice = (addonId, data) =>
  client.post(`/checkin/add-rental/${addonId}/invoices`, data);

// 事後補加租借：店員掃碼確認（會員自助 QR 流程）
export const scanRentalAddon = (token) =>
  client.post('/checkin/add-rental/scan', { token });

export const confirmRentalAddon = (token) =>
  client.post('/checkin/add-rental/confirm', { token });

// 會員端
export const memberVerifyEntry = (gymId) =>
  memberClient.post('/checkin/verify-member', { gymId });

export const createQrCode = (data) =>
  memberClient.post('/checkin/qr/create', data);

// 會員輪詢自己 QR 的入場狀態（pending/confirmed/cancelled/expired）
export const getQrStatus = (qrToken) =>
  memberClient.get(`/checkin/qr/status/${qrToken}`);

// 會員首頁橫幅：今日是否已入場
export const getMyToday = () =>
  memberClient.get('/checkin/my-today');

// 會員自助「補租器材」：已入場後補租岩鞋/粉袋，選付款方式後產生 QR，店員掃碼確認才扣費
export const requestRentalAddon = (checkInId, data) =>
  memberClient.post(`/checkin/${checkInId}/add-rental/request`, data);

export const getRentalAddonStatus = (token) =>
  memberClient.get(`/checkin/add-rental/status/${token}`);
