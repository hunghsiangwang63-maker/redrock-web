import client from './client';

// 計分系統（redrock-comp）SSO 進入點——用員工端已登入的身分直接換取計分系統的 custom token，
// 不需要再輸入一次 email/密碼。見 redrock-api src/routes/compAuth.js POST /sso。
export const ssoCompAuth = () => client.post('/comp-auth/sso');
