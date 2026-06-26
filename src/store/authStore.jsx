import { useState, createContext, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // 電腦帳號（station）— 長期登入
  const [station, setStation] = useState(() => {
    const s = localStorage.getItem('station');
    return s ? JSON.parse(s) : null;
  });
  const [stationToken, setStationToken] = useState(() => localStorage.getItem('stationToken') || null);

  // 值班人員（operator）— 打卡後有效 8 小時
  const [operator, setOperator] = useState(() => {
    const o = localStorage.getItem('operator');
    return o ? JSON.parse(o) : null;
  });
  const [operatorToken, setOperatorToken] = useState(() => localStorage.getItem('operatorToken') || null);

  // 傳統 staff 登入（admin/super_admin 直接登入用）
  const [staff, setStaff] = useState(() => {
    const s = localStorage.getItem('staff');
    return s ? JSON.parse(s) : null;
  });

  const loginStation = (token, stationData) => {
    localStorage.setItem('stationToken', token);
    localStorage.setItem('station', JSON.stringify(stationData));
    setStationToken(token);
    setStation(stationData);
  };

  const clockIn = (token, operatorData) => {
    localStorage.setItem('operatorToken', token);
    localStorage.setItem('operator', JSON.stringify(operatorData));
    setOperatorToken(token);
    setOperator(operatorData);
  };

  const clockOut = () => {
    localStorage.removeItem('operatorToken');
    localStorage.removeItem('operator');
    setOperatorToken(null);
    setOperator(null);
  };

  const logoutStation = () => {
    localStorage.removeItem('stationToken');
    localStorage.removeItem('station');
    localStorage.removeItem('operatorToken');
    localStorage.removeItem('operator');
    setStation(null); setStationToken(null);
    setOperator(null); setOperatorToken(null);
  };

  const login = (token, staffData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('staff', JSON.stringify(staffData));
    setStaff(staffData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('staff');
    setStaff(null);
  };

  const activeGymId = operator?.gymId || station?.gymId || staff?.gymId || null;
  const activeToken = operatorToken || localStorage.getItem('token') || null;
  const isOperational = !!(operator || staff);
  const isStationMode = !!station;

  return (
    <AuthContext.Provider value={{
      station, stationToken, operator, operatorToken, staff,
      activeGymId, activeToken, isOperational, isStationMode,
      loginStation, clockIn, clockOut, logoutStation,
      login, logout,
      isLoggedIn: !!(staff || station),
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
