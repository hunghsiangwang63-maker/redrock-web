import { useState } from 'react';
import PasswordInput from '../../components/PasswordInput';
import { useNavigate } from 'react-router-dom';
import { memberSelfRegister } from '../../api/memberAuth';
import { isUnder5, isMinor } from '../../utils/age';

const inputStyle = { width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 14px', fontSize:15, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };
const labelStyle = { fontSize:12, color:'#6b6b6b', display:'block', marginBottom:5 };

export default function MemberRegisterPage() {
  const [form, setForm] = useState({ name:'', phone:'', email:'', password:'', birthday:'', parentName:'', parentPhone:'', parentRelation:'' });
  const minor = isMinor(form.birthday);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // 前端友善提示（後端仍為權威）：未滿 5 歲無法成為會員
    if (isUnder5(form.birthday)) {
      setError('未滿 5 歲無法成為會員');
      return;
    }
    // 未滿 18 歲：家長姓名/電話/關係皆必填
    if (minor && (!form.parentName.trim() || !form.parentPhone.trim() || !form.parentRelation.trim())) {
      setError('未滿 18 歲需填寫法定代理人姓名、電話與關係');
      return;
    }
    setLoading(true);
    try {
      const payload = { ...form };
      if (!minor) { delete payload.parentName; delete payload.parentPhone; delete payload.parentRelation; }
      await memberSelfRegister(payload);
      setDone(true);
    } catch (err) {
      const details = err.response?.data?.details;
      setError(err.response?.data?.message || (details && details[0]?.msg) || '註冊失敗，請確認資料是否正確');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'#F7F3F3', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:360 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:36, color:'#8B1A1A' }}>RedRock</div>
          <div style={{ fontSize:12, color:'#999', marginTop:4, letterSpacing:1 }}>紅石攀岩館 會員註冊</div>
        </div>

        <div style={{ background:'#fff', borderRadius:16, padding:24, border:'0.5px solid #E8D5D5', boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>
          {done ? (
            <div style={{ textAlign:'center', padding:'12px 0' }}>
              <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
              <div style={{ fontWeight:600, fontSize:16, marginBottom:8 }}>註冊成功！</div>
              <div style={{ fontSize:13, color:'#888', lineHeight:1.7, marginBottom:20, textAlign:'left' }}>
                請至您的Email信箱完成驗證，<br />驗證完成後即可登入使用。
              </div>
              <button onClick={() => navigate('/member/login')}
                style={{ width:'100%', height:48, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:500, cursor:'pointer' }}>
                前往登入
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>姓名</label>
                <input value={form.name} onChange={set('name')} placeholder="王小明" required style={inputStyle} />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>手機號碼</label>
                <input type="tel" value={form.phone} onChange={set('phone')} placeholder="0912345678（外籍：+ 開頭國際格式）" required style={inputStyle} />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>Email</label>
                <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required style={inputStyle} />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>密碼（至少8碼）</label>
                <PasswordInput value={form.password} onChange={set('password')} placeholder="••••••••" required minLength={8} style={inputStyle} />
              </div>
              <div style={{ marginBottom: minor ? 14 : 20 }}>
                <label style={labelStyle}>生日</label>
                <input type="date" value={form.birthday} onChange={set('birthday')} required style={inputStyle} />
                <div style={{ fontSize:11, color:'#8B1A1A', marginTop:6, lineHeight:1.6, textAlign:'left' }}>
                  ※ 未滿 18 歲需法定代理人（家長／監護人）簽署風險安全聲明書，並填寫下方法定代理人資料。
                </div>
              </div>

              {minor && (
                <div style={{ background:'#FBF3F3', border:'0.5px solid #EAD3D3', borderRadius:10, padding:'12px 14px', marginBottom:20 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#8B1A1A', marginBottom:10 }}>法定代理人資料（未滿 18 歲必填）</div>
                  <div style={{ marginBottom:12 }}>
                    <label style={labelStyle}>法定代理人姓名</label>
                    <input value={form.parentName} onChange={set('parentName')} placeholder="王大明" required={minor} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={labelStyle}>法定代理人電話</label>
                    <input type="tel" value={form.parentPhone} onChange={set('parentPhone')} placeholder="0912345678" required={minor} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>與會員關係</label>
                    <input value={form.parentRelation} onChange={set('parentRelation')} placeholder="父/母/監護人" required={minor} style={inputStyle} />
                  </div>
                </div>
              )}

              {error && (
                <div style={{ background:'#FCEBEB', border:'0.5px solid #F5C4C4', borderRadius:8, padding:'9px 12px', fontSize:12, color:'#A32D2D', marginBottom:14 }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                style={{ width:'100%', height:48, borderRadius:12, background: loading ? '#C0B8B8' : '#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:500, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? '註冊中...' : '註冊'}
              </button>

              <div style={{ textAlign:'center', marginTop:16, fontSize:12, color:'#999' }}>
                已經有帳號？<span style={{ color:'#8B1A1A', cursor:'pointer' }} onClick={() => navigate('/member/login')}>前往登入</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
