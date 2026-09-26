import client from './client';
import { memberClient } from './client';

export const memberLogin = (identifier, password) =>
  client.post('/auth/member/login', { identifier, password });

// 重寄 Email 驗證信（登入被 EMAIL_NOT_VERIFIED 擋下時使用）。
// newEmail 選填：當初 email 打錯時可順便更正並改寄到新地址。
export const resendMemberVerification = (identifier, password, newEmail) =>
  client.post('/auth/member/resend-verification', {
    identifier, password, ...(newEmail ? { newEmail } : {}),
  });

export const getMemberProfile = () =>
  client.get('/auth/member/profile');

export const memberSelfRegister = (data) =>
  memberClient.post('/members/self-register', data);

export const getMyWaiver = (memberId) =>
  memberClient.get(`/members/${memberId}/waiver`);

// 合併簽署：風險安全聲明書＋墜落測驗同意書一次簽名（2026-09-26）。data 依實際需要簽署的
// 部分帶對應欄位：waiver 相關 signatureData/parentEmail/parentName/parentPhone/parentRelation，
// 墜測同意書相關另加 watchPercent/agreedParagraphs；只需要簽其中一份時對方欄位可省略。
export const signEntryDocs = (memberId, data) =>
  memberClient.post(`/members/${memberId}/entry-docs/sign`, data);
