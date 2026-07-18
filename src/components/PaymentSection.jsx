/**
 * PaymentSection - 統一付款方式選擇區塊
 * 可嵌入任何 Modal，支援現金/轉帳/LinePay/街口/台灣Pay
 *
 * Props:
 *   value        { method, paymentDate, bankLastFive, note }
 *   onChange     (newValue) => void
 *   bankInfo     { bankName, branch, account, accountName }  // 顯示轉帳帳號
 *   amount       number  // 顯示金額
 *   showNote     boolean // 是否顯示備註欄
 */

import { useEnabledPayments } from '../utils/paymentMethods';

const METHODS = [
  { key:'cash',      label:'現金',    icon:'💵' },
  { key:'transfer',  label:'轉帳',    icon:'🏦' },
  { key:'linepay',   label:'LinePay', icon:'💚' },
  { key:'jkopay',    label:'街口',    icon:'🔵' },
  { key:'taiwanpay', label:'台灣Pay', icon:'🇹🇼' },
];

const inp = {
  width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5',
  padding:'0 10px', fontSize:13, background:'#fff', color:'#1a1a1a',
  outline:'none', boxSizing:'border-box',
};

export default function PaymentSection({ value = {}, onChange, bankInfo, amount, showNote = false, methods }) {
  const { method = 'cash', paymentDate = '', bankLastFive = '', bankName = '', note = '' } = value;
  const enabledPay = useEnabledPayments(); // 系統設定的付款方式開關（未開放者全站隱藏）
  // methods（選填）：限制可選付款方式（如課程端只留 ['cash','transfer'] 隱藏電子支付）
  const shownMethods = (methods ? METHODS.filter(m => methods.includes(m.key)) : METHODS)
    .filter(m => enabledPay[m.key] !== false);

  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div>
      {/* 付款金額 */}
      {amount != null && (
        <div style={{ background:'#FBF5F5', borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, color:'#666' }}>應付金額</span>
          <span style={{ fontSize:18, fontWeight:700, color:'#8B1A1A' }}>NT${amount.toLocaleString()}</span>
        </div>
      )}

      {/* 付款方式選擇 */}
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:11, color:'#666', marginBottom:6 }}>付款方式</div>
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${shownMethods.length},1fr)`, gap:6 }}>
          {shownMethods.map(m => {
            const active = method === m.key;
            return (
              <button key={m.key} onClick={() => set({ method: m.key })}
                style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'8px 4px', borderRadius:10, border:`1.5px solid ${active?'#8B1A1A':'#EDE5E5'}`, background:active?'#FBF5F5':'#fff', cursor:'pointer', transition:'all .15s' }}>
                <span style={{ fontSize:18 }}>{m.icon}</span>
                <span style={{ fontSize:10, color:active?'#8B1A1A':'#666', fontWeight:active?600:400 }}>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 轉帳：帳號資訊 + 填寫欄位 */}
      {method === 'transfer' && (
        <div style={{ background:'#F5F5F5', borderRadius:10, padding:'10px 14px', marginBottom:10 }}>
          {bankInfo && (
            <div style={{ fontSize:12, color:'#444', marginBottom:10, lineHeight:1.8 }}>
              <div style={{ fontWeight:600, color:'#1a1a1a', marginBottom:2 }}>匯款帳號</div>
              <div>{bankInfo.bankName} {bankInfo.branch}</div>
              <div style={{ fontFamily:'monospace', fontSize:14, letterSpacing:2, color:'#8B1A1A' }}>{bankInfo.account}</div>
              <div>戶名：{bankInfo.accountName}</div>
            </div>
          )}
          <div style={{ marginBottom:8 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>匯款銀行名稱</label>
            <input value={bankName} onChange={e => set({ bankName: e.target.value })}
              placeholder="例：國泰世華、台新…" style={inp}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>匯款日期</label>
              <input type="date" value={paymentDate} onChange={e => set({ paymentDate: e.target.value })} style={inp}/>
            </div>
            <div>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>末五碼</label>
              <input value={bankLastFive} onChange={e => set({ bankLastFive: e.target.value.slice(0,5) })}
                placeholder="12345" maxLength={5}
                style={{ ...inp, fontFamily:'monospace', letterSpacing:2 }}/>
            </div>
          </div>
          <div style={{ marginTop:8 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>實際匯款金額</label>
            <input value={value.paidAmount ?? ''} inputMode="numeric"
              onChange={e => set({ paidAmount: e.target.value.replace(/\D/g,'') })}
              placeholder={amount != null ? String(amount) : '實際匯出的金額'}
              style={inp}/>
          </div>
        </div>
      )}

      {/* 非現金提示 */}
      {method !== 'cash' && method !== 'transfer' && (
        <div style={{ background:'#F5F5F5', borderRadius:10, padding:'10px 14px', marginBottom:10, fontSize:12, color:'#666' }}>
          請確認顧客已完成 <strong>{METHODS.find(m=>m.key===method)?.label}</strong> 付款後再按確認。
        </div>
      )}

      {/* 備註（選填）*/}
      {showNote && (
        <div>
          <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>備註（選填）</label>
          <input value={note} onChange={e => set({ note: e.target.value })} placeholder="備註說明"
            style={inp}/>
        </div>
      )}
    </div>
  );
}
