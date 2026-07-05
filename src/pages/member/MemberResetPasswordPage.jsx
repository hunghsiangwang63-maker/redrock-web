import { useState, useEffect } from 'react';
import PasswordInput from '../../components/PasswordInput';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';

export default function MemberResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('連結無效'); }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('兩次密碼不一致'); return; }
    if (password.length < 8) { setError('密碼至少 8 碼'); return; }
    setLoading(true); setError('');
    try {
      await client.post('/auth/member/reset-password', { token, newPassword: password });
      setDone(true);
    } catch(err) {
      setError(err.response?.data?.message || '重設失敗，連結可能已過期');
    } finally { setLoading(false); }
  };

  const inp = { width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:14, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a', marginBottom:12 };

  return (
    <div style={{ minHeight:'100vh', background:'#F7F3F3', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, border:'0.5px solid #E8D5D5', padding:32, width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:24, color:'#8B1A1A', marginBottom:4 }}>RedRock 紅石攀岩館</div>
          <div style={{ fontSize:18, fontWeight:600 }}>設定新密碼</div>
        </div>
        {done ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>✅</div>
            <div style={{ fontSize:14, color:'#2D7D46', fontWeight:500, marginBottom:8 }}>密碼已成功重設</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:24 }}>請用新密碼登入</div>
            <button onClick={() => navigate('/member/login')}
              style={{ width:'100%', height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, cursor:'pointer' }}>
              前往登入
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>新密碼（至少 8 碼）</label>
            <PasswordInput value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={inp}/>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>確認新密碼</label>
            <PasswordInput value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required style={inp}/>
            {error && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{error}</div>}
            <button type="submit" disabled={loading || !token}
              style={{ width:'100%', height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, cursor:'pointer' }}>
              {loading ? '設定中...' : '確認設定新密碼'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
