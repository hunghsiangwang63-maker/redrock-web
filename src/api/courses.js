import client, { memberClient } from './client';

// ── 課程 ────────────────────────────────────────────────────────
export const getCourses = (gymId) =>
  client.get('/courses', { params: gymId ? { gymId } : {} });

export const createCourse = (data) =>
  client.post('/courses', data);

export const updateCourse = (id, data) =>
  client.put(`/courses/${id}`, data);

// ── 場次 ────────────────────────────────────────────────────────
export const getSessions = (params) =>
  client.get('/courses/sessions', { params });

export const createSession = (courseId, data) =>
  client.post(`/courses/${courseId}/sessions`, data);

export const getSessionRoster = (sessionId) =>
  client.get(`/courses/sessions/${sessionId}/roster`);

export const markAttendance = (sessionId, data) =>
  client.post(`/courses/sessions/${sessionId}/attendance`, data);

// ── 報名 ────────────────────────────────────────────────────────
export const enrollCourse = (sessionId, data) =>
  client.post(`/courses/sessions/${sessionId}/enroll`, data);

export const getMemberEnrollments = (memberId) =>
  client.get(`/courses/member/${memberId}/enrollments`);

// ── 請假/補課 ────────────────────────────────────────────────────
export const requestLeave = (enrollmentId, data) =>
  client.post(`/courses/enrollments/${enrollmentId}/leave`, data);

export const getMemberMakeupRights = (memberId) =>
  client.get(`/courses/makeup/member/${memberId}`);

export const useMakeupRight = (makeupId, data) =>
  client.post(`/courses/makeup/${makeupId}/use`, data);

// ── 會員端 ────────────────────────────────────────────────────────
export const memberGetCourses = (gymId) =>
  memberClient.get('/courses', { params: gymId ? { gymId } : {} });

export const memberGetSessions = (params) =>
  memberClient.get('/courses/sessions', { params });

export const memberEnrollCourse = (sessionId, data) =>
  memberClient.post(`/courses/sessions/${sessionId}/enroll`, data);

export const memberGetMyEnrollments = (memberId) =>
  memberClient.get(`/courses/member/${memberId}/enrollments`);

export const memberRequestLeave = (enrollmentId, data) =>
  memberClient.post(`/courses/enrollments/${enrollmentId}/leave`, data);

export const memberGetMakeupRights = (memberId) =>
  memberClient.get(`/courses/makeup/member/${memberId}`);

export const memberUseMakeupRight = (makeupId, data) =>
  memberClient.post(`/courses/makeup/${makeupId}/use`, data);

export const generateWeeklySessions = (courseId) =>
  client.post(`/courses/${courseId}/generate-sessions`);

export const updateSession = (sessionId, data) =>
  client.put(`/courses/sessions/${sessionId}`, data);

export const deleteCourse = (courseId) =>
  client.delete(`/courses/${courseId}`);

// 永久刪除（含場次/報名，僅限無在籍學員）
export const permanentDeleteCourse = (courseId) =>
  client.delete(`/courses/${courseId}/permanent`);
