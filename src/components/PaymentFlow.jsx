/**
 * 統一線上付款流程元件
 *
 * 用法：
 *   <PaymentFlow client={memberClient} orderType="course" orderRef={{...}}
 *                amount={1500} gymId="gym-hsinchu"
 *                onPaid={(p)=>...} onCancel={()=>...} />
 *
 * 「該館有哪些付款方式」由後端 GET /payments/methods?gymId 決定（per-gym + per-gateway）：
 *   - 全域啟用某 gateway：後端 env PAYMENT_PROVIDERS
 *   - 啟用某館：填該館 paymentSettings 金鑰
 *   兩者皆無需改前端程式 → 分段開放 = 改設定。
 *
 * 流程：選付款方式 → POST /payments 建立 →
 *   - mock：顯示「模擬付款完成」→ POST /payments/mock/pay → 輪詢
 *   - 真實 gateway：導轉 paymentUrl，回來後輪詢 GET /payments/:id
 */
import { useState, useRef, useEffect } from 'react';

// 是否「全域」啟用線上付款入口（控制各頁要不要開付款 Modal）。
// 實際可用方式仍以後端 /payments/methods 為準（per-gym）。
// 正式環境預設關閉；要開啟以 VITE_ONLINE_PAYMENT=1 build。dev 預設開（搭配本機後端 mock 測試）。
export const ONLINE_PAYMENT_ENABLED = !!import.meta.env.DEV || import.meta.env.VITE_ONLINE_PAYMENT === '1';

const red = '#8B1A1A';

export default function PaymentFlow({ client, orderType, orderRef = {}, amount, gymId, onPaid, onCancel }) {
  const [stage, setStage] = useState('select'); // select | creating | awaiting | paid | error
  const [methods, setMethods] = useState(null);  // null=載入中, []=無, [...]=可用
  const [payment, setPayment] = useState(null);
  const [msg, setMsg] = useState('');
  const pollRef = useRef(null);

  useEffect(() => {
    let alive = true;
    client.get('/payments/methods', { params: { gymId } })
      .then(r => { if (alive) setMethods(r.data.methods || []); })
      .catch(() => { if (alive) setMethods([]); });
    return () => { alive = false; clearInterval(pollRef.current); };
  }, [gymId]);

  const poll = (paymentId) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await client.get(`/payments/${paymentId}`);
        if (data.status === 'paid') {
          clearInterval(pollRef.current);
          setStage('paid');
          onPaid && onPaid(data);
        } else if (['failed', 'expired', 'cancelled'].includes(data.status)) {
          clearInterval(pollRef.current);
          setMsg('付款未完成，請重試'); setStage('error');
        }
      } catch (e) { /* 暫時性錯誤，繼續輪詢 */ }
    }, 2000);
  };

  const startPayment = async (provider) => {
    setStage('creating'); setMsg('');
    try {
      const { data } = await client.post('/payments', { provider, orderType, orderRef, gymId, amount });
      setPayment(data);
      setStage('awaiting');
      if (provider !== 'mock' && data.paymentUrl) {
        window.location.href = data.paymentUrl; // 真實 gateway：導轉
      }
      poll(data.paymentId);
    } catch (err) {
      setMsg(err.response?.data?.message || '建立付款失敗'); setStage('error');
    }
  };

  const simulatePay = async () => {
    try {
      await client.post('/payments/mock/pay', { paymentId: payment.paymentId });
    } catch (err) {
      setMsg('模擬付款失敗'); setStage('error');
    }
  };

  const cancel = () => { clearInterval(pollRef.current); onCancel && onCancel(); };

  const btn = (extra = {}) => ({
    height: 44, borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 500,
    cursor: 'pointer', ...extra,
  });

  return (
    <div style={{ padding: 4 }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#666' }}>應付金額</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: red }}>NT${Number(amount || 0).toLocaleString()}</div>
      </div>

      {stage === 'select' && (
        <>
          {methods === null && <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>載入付款方式…</div>}

          {methods && methods.length === 0 && (
            <div style={{ textAlign: 'center', padding: 12 }}>
              <div style={{ color: '#666', marginBottom: 14, fontSize: 13 }}>此館目前無可用線上付款，請改用匯款。</div>
              <button onClick={cancel} style={btn({ width: '100%', background: red, color: '#fff' })}>關閉</button>
            </div>
          )}

          {methods && methods.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>選擇付款方式</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                {methods.map(m => (
                  <button key={m.key} onClick={() => startPayment(m.key)}
                    style={btn({ background: '#fff', border: '1.5px solid #E8D5D5', color: '#1a1a1a' })}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
              {onCancel && (
                <button onClick={cancel} style={btn({ width: '100%', marginTop: 14, background: 'none', border: '0.5px solid #E8D5D5', color: '#666' })}>取消</button>
              )}
            </>
          )}
        </>
      )}

      {stage === 'creating' && <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>建立付款中…</div>}

      {stage === 'awaiting' && (
        <div style={{ textAlign: 'center', padding: 12 }}>
          {payment?.provider === 'mock' ? (
            <>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>🧪 測試模式：點擊下方按鈕模擬使用者完成付款</div>
              <button onClick={simulatePay} style={btn({ width: '100%', background: red, color: '#fff' })}>模擬付款完成</button>
            </>
          ) : (
            <div style={{ color: '#999', padding: 12 }}>等待付款完成…（請於開啟的付款頁完成付款）</div>
          )}
          <button onClick={cancel} style={btn({ width: '100%', marginTop: 12, background: 'none', border: '0.5px solid #E8D5D5', color: '#666' })}>取消</button>
        </div>
      )}

      {stage === 'paid' && (
        <div style={{ textAlign: 'center', padding: 24, color: '#2D7D46', fontWeight: 600 }}>✅ 付款成功</div>
      )}

      {stage === 'error' && (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ color: '#A32D2D', marginBottom: 14 }}>{msg || '發生錯誤'}</div>
          <button onClick={() => setStage('select')} style={btn({ width: '100%', background: red, color: '#fff' })}>重試</button>
        </div>
      )}
    </div>
  );
}
