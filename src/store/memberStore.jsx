import { useState, useEffect, createContext, useContext } from 'react';
import { memberClient } from '../api/client';

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

  // App 載入時若已登入 → 向後端刷新最新會員資料（含即時 isTeamMember/blockReasons），
  // 避免「登入後才被加入隊員」的人身分卡在登入當下的快取（需手動 refresh 才更新）。
  useEffect(() => {
    if (!localStorage.getItem('member_token')) return;
    memberClient.get('/auth/member/me')
      .then(res => {
        const fresh = res.data?.member;
        if (fresh && fresh.id) {
          setMember(prev => {
            const next = { ...(prev || {}), ...fresh };
            localStorage.setItem('member', JSON.stringify(next));
            return next;
          });
        }
      })
      .catch(() => {}); // 失敗（離線等）維持既有快取；401 由 client 攔截器處理
  }, []);

  return (
    <MemberContext.Provider value={{ member, login, logout, updateMember, isLoggedIn: !!member }}>
      {children}
    </MemberContext.Provider>
  );
};

export const useMember = () => useContext(MemberContext);
