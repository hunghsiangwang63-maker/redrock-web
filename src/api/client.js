import axios from 'axios';

const BASE = 'https://redrock-api-production.up.railway.app';

// 工作人員 client — 優先用 operatorToken，其次 stationToken，最後 token
const client = axios.create({ baseURL: BASE, timeout: 10000 });
client.interceptors.request.use(config => {
  const token = localStorage.getItem('operatorToken')
    || localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
client.interceptors.response.use(res => res, err => {
  // 登入端點本身的401是正常的「帳密錯誤/裝置驗證」回應，不是「已登入後token失效」，
  // 不該觸發清空登入狀態+整頁重導，否則登入表單永遠來不及顯示真正的錯誤訊息給使用者看
  const isLoginEndpoint = err.config?.url?.includes('/auth/staff/login')
    || err.config?.url?.includes('/auth/member/login')
    || err.config?.url?.includes('/stations/login');
  if (err.response?.status === 401 && !isLoginEndpoint) {
    // operator token 過期 → 清除 operator，保留 station
    if (localStorage.getItem('operatorToken')) {
      localStorage.removeItem('operatorToken');
      localStorage.removeItem('operator');
      window.location.reload();
      return Promise.reject(err);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('staff');
    localStorage.removeItem('stationToken');
    localStorage.removeItem('station');
    window.location.href = '/login';
  }
  return Promise.reject(err);
});

// 會員 client
export const memberClient = axios.create({ baseURL: BASE, timeout: 10000 });
memberClient.interceptors.request.use(config => {
  const token = localStorage.getItem('member_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
memberClient.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401 && !window.location.pathname.includes('/member/login')) {
    localStorage.removeItem('member_token');
    localStorage.removeItem('member');
    window.location.href = '/member/login';
  }
  return Promise.reject(err);
});

export default client;
