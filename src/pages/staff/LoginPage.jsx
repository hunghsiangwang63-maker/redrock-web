import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffLogin, verifyDeviceOtp } from '../../api/auth';
import { useAuth } from '../../store/authStore';
import client from '../../api/client';
import { getDeviceToken } from '../../utils/deviceToken';

export default function LoginPage() {
  const [mode, setMode] = useState('station'); // 'staff' | 'station'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(null); // { verificationId, forMode }
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const { login, loginStation, staff, station } = useAuth();
  const navigate = useNavigate();

  // 等 state 真的更新後才跳頁，避免手機上 race condition
  useEffect(() => {
    if (staff || station) navigate('/staff/checkin', { replace: true });
  }, [staff, station]);

  const handleStaffLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await staffLogin(email, password);
      login(res.data.token, res.data.staff);
      // navigate 由 useEffect 處理
    } catch (err) {
      if (err.response?.data?.error === 'DEVICE_VERIFICATION_REQUIRED') {
        setPendingVerification({ verificationId: err.response.data.verificationId, forMode: 'staff' });
        setError('');
      } else {
        setError(err.response?.data?.message || '登入失敗，請確認帳號密碼');
      }
    } finally { setLoading(false); }
  };

  const handleStationLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await client.post('/stations/login', { email, password, deviceToken: getDeviceToken() });
      loginStation(res.data.token, res.data.station);
      // navigate 由 useEffect 處理
    } catch (err) {
      if (err.response?.data?.error === 'DEVICE_VERIFICATION_REQUIRED') {
        setPendingVerification({ verificationId: err.response.data.verificationId, forMode: 'station' });
        setError('');
      } else {
        setError(err.response?.data?.message || '登入失敗，請確認電腦帳號密碼');
      }
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError(''); setOtpLoading(true);
    try {
      const res = await verifyDeviceOtp(pendingVerification.verificationId, otpCode);
      if (pendingVerification.forMode === 'staff') {
        login(res.data.token, res.data.staff);
      } else {
        loginStation(res.data.token, res.data.station);
      }
      // navigate 由 useEffect 處理
    } catch (err) {
      setError(err.response?.data?.message || '驗證失敗，請確認驗證碼');
    } finally { setOtpLoading(false); }
  };

  const s = {
    page: { minHeight:'100vh', background:'#F7F3F3', display:'flex', alignItems:'center', justifyContent:'center' },
    card: { background:'#fff', borderRadius:16, padding:32, width:360, boxShadow:'0 4px 24px rgba(0,0,0,.08)', border:'1px solid #E8D5D5' },
    input: { width:'100%', height:40, borderRadius:8, border:'1px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' },
    label: { fontSize:12, color:'#6b6b6b', display:'block', marginBottom:5 },
    btn: (disabled) => ({ width:'100%', height:44, borderRadius:10, background: disabled?'#C0B8B8':'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor: disabled?'not-allowed':'pointer' }),
    tabStation: (active) => ({ flex:1, height:38, borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer',
      border: active ? 'none' : '1.5px solid #8B1A1A',
      background: active ? '#8B1A1A' : '#fff',
      color: active ? '#fff' : '#8B1A1A' }),
    tabPersonal: (active) => ({ flex:1, height:38, borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer',
      border: active ? 'none' : '1.5px solid #8B1A1A',
      background: active ? '#8B1A1A' : '#fff',
      color: active ? '#fff' : '#8B1A1A' }),
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:28, color:'#8B1A1A' }}>RedRock</div>
          <div style={{ fontSize:12, color:'#999', marginTop:4, letterSpacing:1 }}>紅石攀岩館 管理系統</div>
        </div>

        {pendingVerification ? (
          <form onSubmit={handleVerifyOtp}>
            <div style={{ background:'#FFF3E0', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#B5762B', marginBottom:16, lineHeight:1.6 }}>
              此{pendingVerification.forMode === 'station' ? '電腦' : '裝置'}尚未授權。已嘗試發送驗證碼至註冊Email，請輸入驗證碼，或請管理員到「設定」核准此裝置後重新登入。
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={s.label}>6位數驗證碼</label>
              <input value={otpCode} onChange={e => setOtpCode(e.target.value)} maxLength={6}
                placeholder="000000" required style={{ ...s.input, textAlign:'center', fontSize:20, letterSpacing:6 }} />
            </div>
            {error && (
              <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#A32D2D', marginBottom:14 }}>{error}</div>
            )}
            <button type="submit" disabled={otpLoading} style={s.btn(otpLoading)}>
              {otpLoading ? '驗證中...' : '確認驗證碼'}
            </button>
            <button type="button" onClick={() => { setPendingVerification(null); setOtpCode(''); setError(''); }}
              style={{ width:'100%', marginTop:10, height:36, background:'none', border:'none', color:'#999', fontSize:12, cursor:'pointer' }}>
              返回重新登入
            </button>
          </form>
        ) : (
          <>
            {/* 模式切換 */}
            <div style={{ display:'flex', gap:6, marginBottom:20 }}>
              <button style={s.tabPersonal(mode==='staff')} onClick={() => { setMode('staff'); setError(''); }}>
                個人帳號登入
              </button>
              <button style={s.tabStation(mode==='station')} onClick={() => { setMode('station'); setError(''); }}>
                館別電腦登入
              </button>
            </div>

            {mode === 'station' && (
              <div style={{ background:'#E6F1FB', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#185FA5', marginBottom:16 }}>
                使用館別電腦帳號登入後，值班人員再各自打卡上班。
              </div>
            )}

            <form onSubmit={mode === 'staff' ? handleStaffLogin : handleStationLogin}>
              <div style={{ marginBottom:14 }}>
                <label style={s.label}>{mode === 'station' ? '電腦帳號 Email' : 'Email'}</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder={mode === 'station' ? 'hsinchu@redrock.app' : 'staff@redrock.app'}
                  required style={s.input} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={s.label}>密碼</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required style={s.input} />
              </div>

              {error && (
                <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#A32D2D', marginBottom:14 }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={s.btn(loading)}>
                {loading ? '登入中...' : mode === 'station' ? '館別電腦登入' : '登入'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
