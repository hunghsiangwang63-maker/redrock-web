// 瀏覽器裝置綁定用的唯一識別碼，首次使用時產生並永久存在這支瀏覽器的 localStorage。
// 用於員工個人帳號登入 / 館別電腦登入的裝置綁定機制。
const KEY = 'device_token';

export function getDeviceToken() {
  let token = localStorage.getItem(KEY);
  if (!token) {
    token = (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(KEY, token);
  }
  return token;
}
