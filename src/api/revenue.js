import client from './client';

export const getRevenueSummary = (gymId) =>
  client.get('/revenue/summary', { params: gymId ? { gymId } : {} });

export const getDailyReport = (params) =>
  client.get('/revenue/daily', { params });

export const getTransactions = (params) =>
  client.get('/revenue/transactions', { params });

export const getCheckinStats = (params) =>
  client.get('/revenue/checkin-stats', { params });

export const exportCsv = (params) =>
  client.get('/revenue/export-csv', { params, responseType: 'blob' });

export const exportCheckinCsv = (params) =>
  client.get('/revenue/export-checkin-csv', { params, responseType: 'blob' });
