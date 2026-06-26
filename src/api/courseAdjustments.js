import client, { memberClient } from './client';

// 取得所有課程申請（員工）
export const getCourseAdjustmentRequests = (params) =>
  client.get('/course-adjustments/requests', { params });

// 會員申請退費
export const requestCourseRefund = (enrollmentId, data) =>
  memberClient.post(`/course-adjustments/enrollments/${enrollmentId}/refund-request`, data);

// 會員申請暫停
export const requestCoursePause = (enrollmentId, data) =>
  memberClient.post(`/course-adjustments/enrollments/${enrollmentId}/pause-request`, data);

// 員工核准
export const approveCourseAdjustment = (requestId, data) =>
  client.post(`/course-adjustments/requests/${requestId}/approve`, data);

// 員工拒絕
export const rejectCourseAdjustment = (requestId, data) =>
  client.post(`/course-adjustments/requests/${requestId}/reject`, data);

// 員工恢復暫停
export const restoreCourseEnrollment = (enrollmentId) =>
  client.post(`/course-adjustments/enrollments/${enrollmentId}/restore`);
