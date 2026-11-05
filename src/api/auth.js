import client from './client';
import { getDeviceToken } from '../utils/deviceToken';

export const staffLogin = (email, password) =>
  client.post('/auth/staff/login', { email, password, deviceToken: getDeviceToken() }, { withCredentials: true }); // 帶／收裝置 cookie（rr_device）

export const memberLogin = (identifier, password) =>
  client.post('/auth/member/login', { identifier, password });

export const verifyDeviceOtp = (verificationId, code) =>
  client.post('/auth/device/verify-otp', { verificationId, code }, { withCredentials: true });
