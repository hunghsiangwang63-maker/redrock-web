/**
 * 統一線上付款流程元件（Phase 0）
 *
 * 用法：
 *   <PaymentFlow client={memberClient} orderType="course" orderRef={{...}}
 *                amount={1500} gymId="gym-hsinchu"
 *                onPaid={(p)=>...} onCancel={()=>...} />
 *
 * 流程：選付款方式 → POST /payments 建立付款 →
 *   - mock：顯示「模擬付款完成」按鈕 → POST /payments/mock/pay → 輪詢狀態
 *   - 真實 gateway：導轉到 paymentUrl，回來後輪詢 GET /payments/:id
 * 付款成功（status:paid）後呼叫 onPaid。
 *
 * Phase 0：僅 mock 可實際運作；linepay/jkopay/taiwanpay 待後端 adapter 完成。
 */
import { useState, useRef, useEffect } from 'react';

const ONLINE_METHODS = [
  // ⚠️ mock 只在本機 dev 開放（會在未實際付款下標記已付）；正式環境一律關閉，避免零元確認
  { key: 'mock',      label: '測試付款', icon: '🧪', enabled: !!import.meta.env.DEV },
  { key: 'linepay',   label: 'LinePay', icon: '💚', enabled: false }, // Phase 2 啟用
  { key: 'jkopay',    label: '街口',    icon: '🔵', enabled: false },
  { key: 'taiwanpay', label: '台灣Pay', icon: '🇹🇼', enabled: false },
];

// 是否有任何可用的線上付款方式（正式環境在真實 gateway 上線前為 false）
export const ONLINE_PAYMENT_ENABLED = ONLINE_METHODS.some(m => m.enabled);

const red = '#8B1A1A';

export default function PaymentFlow({ client, orderType, orderRef = {}, amount, gymId, onPaid, onCancel }) {
  const [stage, setStage] = useState('select'); // select | creating | awaiting | paid | error
  const [payment, setPayment] = useState(null);
  const [msg, setMsg] = useState('');
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

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
          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>選擇付款方式</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
            {ONLINE_METHODS.map(m => (
              <button key={m.key} disabled={!m.enabled} onClick={() => startPayment(m.key)}
                style={btn({
                  background: m.enabled ? '#fff' : '#F5F5F5',
                  border: `1.5px solid ${m.enabled ? '#E8D5D5' : '#EEE'}`,
                  color: m.enabled ? '#1a1a1a' : '#bbb',
                  cursor: m.enabled ? 'pointer' : 'not-allowed',
                })}>
                {m.icon} {m.label}{!m.enabled ? '（即將推出）' : ''}
              </button>
            ))}
          </div>
          {onCancel && (
            <button onClick={cancel} style={btn({ width: '100%', marginTop: 14, background: 'none', border: '0.5px solid #E8D5D5', color: '#666' })}>取消</button>
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
