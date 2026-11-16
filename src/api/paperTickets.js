import client from './client';

// 紙本單張入場券「使用回收」（管理員／館長）
export const getPaperTicketSummary = () => client.get('/paper-tickets/summary');
export const lookupPaperTickets = (no) => client.get('/paper-tickets/lookup', { params: { no } });
export const redeemPaperTickets = (data) => client.post('/paper-tickets/redeem', data);
export const undoPaperTicket = (data) => client.post('/paper-tickets/undo', data);
export const getPaperTicketLog = (params) => client.get('/paper-tickets/log', { params });
