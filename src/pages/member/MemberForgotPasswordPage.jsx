import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function MemberForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await client.post('/auth/member/forgot-password', { email });
      setSent(true);
    } catch(err) {
      setError(err.response?.data?.message || '發送失敗，請稍後再試');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'#F7F3F3', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, border:'0.5px solid #E8D5D5', padding:32, width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:24, color:'#8B1A1A', marginBottom:4 }}>RedRock 紅石攀岩館</div>
          <div style={{ fontSize:18, fontWeight:600 }}>忘記密碼</div>
        </div>
        {sent ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>📧</div>
            <div style={{ fontSize:14, color:'#2D7D46', fontWeight:500, marginBottom:8 }}>重設連結已寄出</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:24 }}>請查看 {email} 的信箱，點擊連結重設密碼（連結 1 小時內有效）</div>
            <button onClick={() => navigate('/member/login')}
              style={{ width:'100%', height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, cursor:'pointer' }}>
              回到登入
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>註冊時填寫的 Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com" required
              style={{ width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:14, outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a', marginBottom:12 }}/>
            {error && <div style={{ color:'#A32D2D', fontSize:12, marginBottom:10 }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ width:'100%', height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, cursor:'pointer', marginBottom:12 }}>
              {loading ? '發送中...' : '發送重設連結'}
            </button>
            <button type="button" onClick={() => navigate('/member/login')}
              style={{ width:'100%', height:40, borderRadius:10, background:'none', color:'#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:13, cursor:'pointer' }}>
              返回登入
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
