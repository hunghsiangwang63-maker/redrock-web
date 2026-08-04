import client from './client';

export const searchMembers = (q) =>
  client.get('/members', { params: { q } });

export const getMember = (id) =>
  client.get(`/members/${id}`);

export const createMember = (data) =>
  client.post('/members', data);

export const updateMember = (id, data) =>
  client.put(`/members/${id}`, data);

export const promoteChild = (childId, data) =>
  client.post(`/members/${childId}/promote`, data);

export const getMemberWaiver = (memberId) => client.get(`/members/${memberId}/waiver`);
export const resetMemberWaiver = (memberId, reason) => client.post(`/members/${memberId}/waiver/reset`, { reason });

// 名單報表（會員頁分頁用）
export const getActivePasses = (gymId) => client.get('/members/reports/active-passes', { params: gymId ? { gymId } : {} });
export const getActiveCourseStudents = (gymId) => client.get('/members/reports/active-course-students', { params: gymId ? { gymId } : {} });
export const downloadActiveCourseStudents = (gymId, courseId) =>
  client.get('/members/reports/active-course-students/download', { params: { ...(gymId ? { gymId } : {}), ...(courseId ? { courseId } : {}) }, responseType: 'blob' });

// 歷史開課資料（已過期梯次）：輕量清單（供下拉選單）＋單一梯次完整名單
export const getCourseStudentsHistoryList = (gymId) => client.get('/members/reports/course-students-history', { params: gymId ? { gymId } : {} });
export const getCourseStudentsHistoryDetail = (gymId, courseId) =>
  client.get(`/members/reports/course-students-history/${courseId}`, { params: gymId ? { gymId } : {} });

// 尚未開課資料（總表，practiceStart > today）：已報名/已收款但入館效期還沒開始的梯次
export const getFutureCourseStudents = (gymId) => client.get('/members/reports/future-course-students', { params: gymId ? { gymId } : {} });
export const downloadFutureCourseStudents = (gymId, courseId) =>
  client.get('/members/reports/future-course-students/download', { params: { ...(gymId ? { gymId } : {}), ...(courseId ? { courseId } : {}) }, responseType: 'blob' });

// 課程學員：開立發票（預先建立，待日後發票機串接）
export const getCourseInvoices = (params) => client.get('/members/course-invoices', { params });
export const createCourseInvoice = (data) => client.post('/members/course-invoices', data);
export const voidCourseInvoice = (id, voidReason) => client.post(`/members/course-invoices/${id}/void`, { voidReason });

// 課程學員：直接編修實收金額（管理員；amount=null 清除覆蓋、回自動判斷）
export const updateReceivedAmount = (enrollmentId, amount) =>
  client.put(`/members/course-enrollments/${enrollmentId}/received-amount`, { amount });
