import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { memberLogin, resendMemberVerification } from '../../api/memberAuth';
import { useMember } from '../../store/memberStore.jsx';
import PasswordInput from '../../components/PasswordInput';

const inputStyle = { width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:15, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };

export default function MemberLoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isLoggedIn } = useMember();
  const navigate = useNavigate();

  // Email 未驗證面板狀態
  const [needsVerify, setNeedsVerify] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  // 等 isLoggedIn 真的變成 true 才跳頁，避免手機上 setState 還沒完成就 navigate 的 race condition
  useEffect(() => {
    if (isLoggedIn) navigate('/member/home', { replace: true });
  }, [isLoggedIn]);

  const normId = () => identifier.includes('@') ? identifier.trim() : identifier.replace(/[\s-]/g, '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResendMsg('');
    setLoading(true);
    try {
      const res = await memberLogin(normId(), password);
      login(res.data.token, res.data.member);
      // navigate 移到 useEffect，等 isLoggedIn 更新後再跳
    } catch (err) {
      // Email 尚未驗證：切到驗證面板（可重寄 / 改 email）
      if (err.response?.status === 403 && err.response?.data?.error === 'EMAIL_NOT_VERIFIED') {
        setVerifyEmail(err.response.data.email || '');
        setNewEmail(err.response.data.email || '');
        setNeedsVerify(true);
      } else {
        setError(err.response?.data?.message || '登入失敗，請確認手機號碼與密碼');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendMsg('');
    setError('');
    setResendLoading(true);
    try {
      const changed = editingEmail && newEmail && newEmail !== verifyEmail ? newEmail : undefined;
      const res = await resendMemberVerification(normId(), password, changed);
      if (res.data.alreadyVerified) {
        // 已驗證（可能剛在別的分頁點了連結）→ 回登入讓他直接登入
        setNeedsVerify(false);
        setError('此帳號已完成驗證，請重新登入');
        return;
      }
      if (res.data.email) setVerifyEmail(res.data.email);
      setEditingEmail(false);
      setResendMsg(`驗證信已寄至 ${res.data.email || verifyEmail}，請至信箱點擊連結完成驗證`);
    } catch (err) {
      setError(err.response?.data?.message || '重寄失敗，請確認密碼是否正確');
    } finally {
      setResendLoading(false);
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
          {needsVerify ? (
            /* ── Email 未驗證面板 ── */
            <div>
              <div style={{ textAlign:'center', marginBottom:16 }}>
                <div style={{ fontSize:36, marginBottom:8 }}>✉️</div>
                <div style={{ fontWeight:600, fontSize:16, marginBottom:6 }}>請先完成 Email 驗證</div>
                <div style={{ fontSize:13, color:'#888', lineHeight:1.7 }}>
                  您的帳號尚未驗證，無法登入。<br />
                  驗證信已寄至：
                </div>
                <div style={{ fontSize:14, color:'#8B1A1A', fontWeight:600, margin:'6px 0 2px', wordBreak:'break-all' }}>{verifyEmail || '（未設定）'}</div>
              </div>

              {editingEmail ? (
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:12, color:'#6b6b6b', display:'block', marginBottom:5 }}>更正 Email</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    placeholder="you@example.com" style={inputStyle}/>
                </div>
              ) : (
                <div style={{ textAlign:'center', marginBottom:12 }}>
                  <span style={{ color:'#8B1A1A', fontSize:13, cursor:'pointer', textDecoration:'underline' }}
                    onClick={() => { setEditingEmail(true); setNewEmail(verifyEmail); }}>
                    Email 打錯了？點此更正
                  </span>
                </div>
              )}

              {resendMsg && (
                <div style={{ background:'#EAF6EC', border:'0.5px solid #BFE3C6', borderRadius:8, padding:'9px 12px', fontSize:12, color:'#2E7D3A', marginBottom:14 }}>
                  {resendMsg}
                </div>
              )}
              {error && (
                <div style={{ background:'#FCEBEB', border:'0.5px solid #F5C4C4', borderRadius:8, padding:'9px 12px', fontSize:12, color:'#A32D2D', marginBottom:14 }}>
                  {error}
                </div>
              )}

              <button type="button" onClick={handleResend} disabled={resendLoading}
                style={{ width:'100%', height:48, borderRadius:12, background: resendLoading ? '#C0B8B8' : '#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:500, cursor: resendLoading ? 'not-allowed' : 'pointer' }}>
                {resendLoading ? '寄送中...' : (editingEmail ? '更正並重寄驗證信' : '重寄驗證信')}
              </button>
              <button type="button" onClick={() => { setNeedsVerify(false); setEditingEmail(false); setResendMsg(''); setError(''); }}
                style={{ marginTop:12, width:'100%', background:'none', border:'none', color:'#8B1A1A', fontSize:13, cursor:'pointer', textDecoration:'underline' }}>
                返回登入
              </button>
            </div>
          ) : (
            /* ── 登入表單 ── */
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, color:'#6b6b6b', display:'block', marginBottom:5 }}>手機號碼 / Email</label>
                <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
                  placeholder="09XXXXXXXX 或 email@example.com" required
                  style={inputStyle}/>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, color:'#6b6b6b', display:'block', marginBottom:5 }}>密碼</label>
                <PasswordInput value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  style={inputStyle}/>
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
          )}

          {!needsVerify && (
            <div style={{ textAlign:'center', marginTop:16, fontSize:12, color:'#999' }}>
              還沒有帳號？<span style={{ color:'#8B1A1A', cursor:'pointer' }} onClick={() => navigate('/member/register')}>立即註冊</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
