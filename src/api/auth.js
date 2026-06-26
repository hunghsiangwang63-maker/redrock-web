import client from './client';
import { getDeviceToken } from '../utils/deviceToken';

export const staffLogin = (email, password) =>
  client.post('/auth/staff/login', { email, password, deviceToken: getDeviceToken() });

export const memberLogin = (identifier, password) =>
  client.post('/auth/member/login', { identifier, password });

export const verifyDeviceOtp = (verificationId, code) =>
  client.post('/auth/device/verify-otp', { verificationId, code });
