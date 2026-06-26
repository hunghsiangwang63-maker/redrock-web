import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { memberLogin } from '../../api/memberAuth';
import { useMember } from '../../store/memberStore.jsx';

export default function MemberLoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isLoggedIn } = useMember();
  const navigate = useNavigate();

  // 等 isLoggedIn 真的變成 true 才跳頁，避免手機上 setState 還沒完成就 navigate 的 race condition
  useEffect(() => {
    if (isLoggedIn) navigate('/member/home', { replace: true });
  }, [isLoggedIn]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const normalized = identifier.includes('@') ? identifier.trim() : identifier.replace(/[\s-]/g, '');
      const res = await memberLogin(normalized, password);
      login(res.data.token, res.data.member);
      // navigate 移到 useEffect，等 isLoggedIn 更新後再跳
    } catch (err) {
      setError(err.response?.data?.message || '登入失敗，請確認手機號碼與密碼');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', background:'#F7F3F3', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:360 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:36, color:'#8B1A1A' }}>RedRock</div>
          <div style={{ fontSize:12, color:'#999', marginTop:4, letterSpacing:1 }}>紅石攀岩館 會員</div>
        </div>

        <div style={{ background:'#fff', borderRadius:16, padding:24, border:'0.5px solid #E8D5D5', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#6b6b6b', display:'block', marginBottom:5 }}>手機號碼 / Email</label>
              <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
                placeholder="09XXXXXXXX 或 email@example.com" required
                style={{ width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:15, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:'#6b6b6b', display:'block', marginBottom:5 }}>密碼</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{ width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:15, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>

            {error && (
              <div style={{ background:'#FCEBEB', border:'0.5px solid #F5C4C4', borderRadius:8, padding:'9px 12px', fontSize:12, color:'#A32D2D', marginBottom:14 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width:'100%', height:48, borderRadius:12, background: loading ? '#C0B8B8' : '#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:500, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? '登入中...' : '登入'}
            </button>
            <button type="button" onClick={() => navigate('/member/forgot-password')}
              style={{ marginTop:12, width:'100%', background:'none', border:'none', color:'#8B1A1A', fontSize:13, cursor:'pointer', textDecoration:'underline' }}>
              忘記密碼？
            </button>
          </form>

          <div style={{ textAlign:'center', marginTop:16, fontSize:12, color:'#999' }}>
            還沒有帳號？<span style={{ color:'#8B1A1A', cursor:'pointer' }} onClick={() => navigate('/member/register')}>立即註冊</span>
          </div>
        </div>
      </div>
    </div>
  );
}
