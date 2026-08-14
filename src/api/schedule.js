import client from './client';

export const getMonthlyShifts = (gymId, month) => client.get('/schedule', { params: { gymId, month } });
export const getHoursSummary = (gymId, month) => client.get('/schedule/hours-summary', { params: { gymId, month } });
export const getScheduleStaffList = (gymId) => client.get('/schedule/staff-list', { params: gymId ? { gymId } : {} });
export const getMyUpcomingShifts = (from, to) => client.get('/schedule/my-upcoming', { params: { from, to } });
export const createShift = (data) => client.post('/schedule', data);
export const createRecurringShifts = (data) => client.post('/schedule/recurring', data);
export const updateShift = (shiftId, data) => client.put(`/schedule/${shiftId}`, data);
export const deleteShift = (shiftId) => client.delete(`/schedule/${shiftId}`);
export const clearMonthSchedule = (gymId, month) => client.post('/schedule/clear-month', { gymId, month });
export const copyPreviousMonthSchedule = (gymId, month) => client.post('/schedule/copy-previous', { gymId, month });

// 重要事項標籤（休館/比賽/維修等）
export const getScheduleEvents = (gymId, month) => client.get('/schedule/events', { params: { gymId, month } });
export const createScheduleEvent = (data) => client.post('/schedule/events', data);
export const createRecurringScheduleEvent = (data) => client.post('/schedule/events/recurring', data);
// scope（'single'｜'following'｜'all'）：只在該筆屬於循環系列時才有意義，套用到「這筆及之後」
// 或「整個系列」；非系列的一次性事項後端會自動視同 single。
export const updateScheduleEvent = (eventId, data, scope = 'single') => client.put(`/schedule/events/${eventId}`, { ...data, scope });
export const deleteScheduleEvent = (eventId, scope = 'single') => client.delete(`/schedule/events/${eventId}`, { params: { scope } });
