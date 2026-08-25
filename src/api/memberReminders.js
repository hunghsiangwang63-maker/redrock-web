import client, { memberClient } from './client';

// 員工端：管理某會員的自訂首頁提醒
export const getMemberReminders = (memberId) => client.get(`/member-reminders/member/${memberId}`);
export const createMemberReminder = (data) => client.post('/member-reminders', data);
export const updateMemberReminder = (id, data) => client.put(`/member-reminders/${id}`, data);
export const deleteMemberReminder = (id) => client.delete(`/member-reminders/${id}`);
export const broadcastCompetitionReminder = (competitionId, data) =>
  client.post(`/member-reminders/broadcast/competition/${competitionId}`, data);
export const broadcastCourseReminder = (courseId, data) =>
  client.post(`/member-reminders/broadcast/course/${courseId}`, data);

// 會員端：首頁讀取顯示期間內的提醒
export const getMyReminders = () => memberClient.get('/member-reminders/my');
