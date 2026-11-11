import { memberClient } from './client';

// 感恩節感謝卡片（會員端）；後端 routes/thanksCards.js
export const getThanksConfig = () => memberClient.get('/thanks-cards/config').then(r => r.data);
export const lookupThanksRecipient = (phone) => memberClient.post('/thanks-cards/lookup', { phone }).then(r => r.data);
export const getThanksStaff = () => memberClient.get('/thanks-cards/staff').then(r => r.data.staff || []);
export const sendThanksCard = (payload) => memberClient.post('/thanks-cards', payload).then(r => r.data);
export const getThanksInbox = () => memberClient.get('/thanks-cards/inbox').then(r => r.data);
export const hideThanksCard = (id, block = false) => memberClient.post(`/thanks-cards/${id}/hide`, { block }).then(r => r.data);
