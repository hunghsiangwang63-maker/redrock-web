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
    // 🧪 模擬報名：deepLink 帶 ?sim=<token> → 以模擬帳號自動登入（移除網址參數，避免外流）
    try {
      const params = new URLSearchParams(window.location.search);
      const simTok = params.get('sim');
      if (simTok) {
        localStorage.setItem('member_token', simTok);
        params.delete('sim');
        const q = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (q ? '?' + q : ''));
      }
    } catch (e) {}
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
      {member?.isSimulation && (
        <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:9999, background:'#8B6914', color:'#fff', textAlign:'center', fontSize:12, fontWeight:600, padding:'5px 8px', letterSpacing:0.3 }}>
          🧪 模擬報名模式 — 此為員工測試流程，送出不會真正報名、不佔名額
        </div>
      )}
      {children}
    </MemberContext.Provider>
  );
};

export const useMember = () => useContext(MemberContext);
