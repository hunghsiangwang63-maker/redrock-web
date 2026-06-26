import client from './client';
import { memberClient } from './client';

export const memberLogin = (identifier, password) =>
  client.post('/auth/member/login', { identifier, password });

export const getMemberProfile = () =>
  client.get('/auth/member/profile');

export const memberSelfRegister = (data) =>
  memberClient.post('/members/self-register', data);

export const getMyWaiver = (memberId) =>
  memberClient.get(`/members/${memberId}/waiver`);
