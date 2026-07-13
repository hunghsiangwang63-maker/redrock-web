import { useNavigate, useSearchParams } from 'react-router-dom';

// Email 驗證結果頁（後端 GET /members/verify-email/:token 驗證後 redirect 到此）。
// 修「點驗證連結後被丟回登入頁、成功失敗零回饋」：status=success|error、code=INVALID_TOKEN|TOKEN_EXPIRED。
export default function MemberVerifyResultPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const status = params.get('status');
  const code = params.get('code');
  const already = params.get('already') === '1';
  const ok = status === 'success';

  const errText = code === 'TOKEN_EXPIRED'
    ? '驗證連結已過期（超過 24 小時）。請回登入頁輸入帳號密碼，登入時會提示重寄驗證信。'
    : '驗證連結無效。若您重寄過驗證信，請點「最新一封」信中的連結；或回登入頁重寄驗證信。';

  return (
    <div style={{ minHeight:'100vh', background:'#F7F3F3', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, border:'0.5px solid #E8D5D5', padding:'32px 24px', width:'100%', maxWidth:380, textAlign:'center' }}>
        <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:22, color:'#8B1A1A', marginBottom:20 }}>RedRock</div>
        <div style={{ fontSize:44, marginBottom:12 }}>{ok ? '✅' : '⚠️'}</div>
        <div style={{ fontSize:17, fontWeight:700, color: ok ? '#2D7D46' : '#A32D2D', marginBottom:10 }}>
          {ok ? (already ? 'Email 已完成驗證' : 'Email 驗證成功！') : 'Email 驗證未完成'}
        </div>
        <div style={{ fontSize:13, color:'#666', lineHeight:1.7, textAlign:'left', marginBottom:24 }}>
          {ok
            ? (already
                ? '此帳號的 Email 先前已驗證完成，直接登入即可。'
                : '您的帳號已完成 Email 驗證，現在可以登入使用會員服務。')
            : errText}
        </div>
        <button onClick={() => navigate('/member/login')}
          style={{ width:'100%', height:46, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:15, fontWeight:600, cursor:'pointer' }}>
          前往登入
        </button>
      </div>
    </div>
  );
}
