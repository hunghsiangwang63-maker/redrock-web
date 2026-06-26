import { memberClient } from './client';

export const getFallTestSettings = () => memberClient.get('/fall-tests/settings');
export const getMyFallTestStatus = (memberId) => memberClient.get(`/fall-tests/member/${memberId}`);
export const signFallTestAgreement = (data) => memberClient.post('/fall-tests/sign', data);
export const getFallTestSignature = (memberId) => memberClient.get(`/fall-tests/signature/${memberId}`);

// 員工端（使用 staff client）
import client from './client';
export const getStaffFallTestStatus = (memberId) => client.get(`/fall-tests/member/${memberId}`);
export const getStaffFallTestSignature = (memberId) => client.get(`/fall-tests/signature/${memberId}`);
export const recordFallTestResult = (data) => client.post('/fall-tests', data);
export const resetFallTestSignature = (memberId, reason) => client.post(`/fall-tests/signature/${memberId}/reset`, { reason });
