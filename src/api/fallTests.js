import { memberClient } from './client';

export const getFallTestSettings = () => memberClient.get('/fall-tests/settings');
export const getMyFallTestStatus = (memberId) => memberClient.get(`/fall-tests/member/${memberId}`);
// 簽署本身已於 2026-09-26 合併進 /member/waiver（見 api/memberAuth.js signEntryDocs）；
// 後端 POST /fall-tests/sign 仍保留（供修復情境直接呼叫 API），故未移除該端點本身。
export const getFallTestSignature = (memberId) => memberClient.get(`/fall-tests/signature/${memberId}`);

// 員工端（使用 staff client）
import client from './client';
export const getStaffFallTestStatus = (memberId) => client.get(`/fall-tests/member/${memberId}`);
export const getStaffFallTestSignature = (memberId) => client.get(`/fall-tests/signature/${memberId}`);
export const recordFallTestResult = (data) => client.post('/fall-tests', data);
export const resetFallTestSignature = (memberId, reason) => client.post(`/fall-tests/signature/${memberId}/reset`, { reason });
