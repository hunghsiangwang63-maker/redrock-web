import { useState, createContext, useContext } from 'react';

const MemberContext = createContext(null);

export const MemberProvider = ({ children }) => {
  const [member, setMember] = useState(() => {
    const m = localStorage.getItem('member');
    return m ? JSON.parse(m) : null;
  });

  const login = (token, memberData) => {
    localStorage.setItem('member_token', token);
    localStorage.setItem('member', JSON.stringify(memberData));
    // 會員用不同的 key 避免跟工作人員衝突
    setMember(memberData);
  };

  const logout = () => {
    localStorage.removeItem('member_token');
    localStorage.removeItem('member');
    setMember(null);
  };

  // 局部更新會員資料（例如簽署waiver後刷新blockReasons，不需重新登入）
  const updateMember = (patch) => {
    setMember(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem('member', JSON.stringify(next));
      return next;
    });
  };

  return (
    <MemberContext.Provider value={{ member, login, logout, updateMember, isLoggedIn: !!member }}>
      {children}
    </MemberContext.Provider>
  );
};

export const useMember = () => useContext(MemberContext);
