import client, { memberClient } from './client';

// 員工端
export const getLevelDefs = (program = 'spider') => client.get(`/climb-levels/${program}/defs`);
export const updateLevelDef = (program, level, data) => client.put(`/climb-levels/${program}/defs/${level}`, data);
export const getLevelCourseStudents = (courseId) => client.get(`/climb-levels/course/${courseId}/students`);
export const createLevelRecords = (data) => client.post('/climb-levels/records', data);
export const voidLevelRecord = (id, reason) => client.post(`/climb-levels/records/${id}/void`, { reason });
export const getMemberLevels = (memberId) => client.get(`/climb-levels/member/${memberId}`);

// 會員端
export const getMyMemberLevels = (memberId) => memberClient.get(`/climb-levels/member/${memberId}`);
