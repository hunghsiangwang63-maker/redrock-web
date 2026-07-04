import client, { memberClient } from './client';

// ── 會員端 ──
// 安排墜落測驗（本人或子女，選場館）
export const createFallTestBooking = (data) => memberClient.post('/fall-test-bookings', data);
// 查自己 + 子女的待測預約
export const getMyFallTestBookings = () => memberClient.get('/fall-test-bookings/my');
// 取消待測預約（換館用）
export const cancelFallTestBooking = (id) => memberClient.delete(`/fall-test-bookings/${id}`);

// ── 員工／站台端 ──
// 登記測驗結果（passed / failed）
export const completeFallTestBooking = (id, result, notes) =>
  client.post(`/fall-test-bookings/${id}/complete`, { result, notes });
