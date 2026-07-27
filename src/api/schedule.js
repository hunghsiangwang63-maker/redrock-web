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
export const updateScheduleEvent = (eventId, data) => client.put(`/schedule/events/${eventId}`, data);
export const deleteScheduleEvent = (eventId) => client.delete(`/schedule/events/${eventId}`);
