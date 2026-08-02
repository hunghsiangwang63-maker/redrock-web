/**
 * PaymentSection - 統一付款方式選擇區塊
 * 可嵌入任何 Modal 或步驟頁，支援現金/轉帳/LinePay/街口/台灣Pay。
 * 全站唯一的付款方式選擇元件——各頁以 methods 限制自己要開放哪些方式，
 * 再疊加系統管理員設定的全域開關（useEnabledPayments，目前僅現金/轉帳為預設開放，
 * 電子支付三種暫時關閉、待金流 API 對接後由管理員開啟）。
 *
 * Props:
 *   value        { method, paymentDate, bankLastFive, bankName, paidAmount, note }
 *   onChange     (newValue) => void   // 選擇/填寫時觸發，emit 完整合併後的 value
 *   onSelect     (key) => void        // 選填：點擊方式當下額外觸發（供「點選即送出」流程，如入場 QR）
 *   bankInfo     { bankName, branch, account, accountName }  // 顯示轉帳收款帳號
 *   amount       number   // 顯示應付金額
 *   showNote     boolean  // 是否顯示備註欄
 *   showLabel    boolean  // 是否顯示「付款方式」標題（預設 true；外層已有自訂說明文字時可關閉避免重複）
 *   disabled     boolean  // 送出中鎖定，不可再點選（搭配 onSelect 的即選即送流程使用）
 *   showPaidAmount boolean // 是否顯示「實際匯款金額」欄（預設 true，QR 等即時流程可關閉）
 *   dateMin/dateMax  string(YYYY-MM-DD)  // 選填，限制匯款/繳款日期範圍
 *   methods      string[]  // 選填，限制此處可選付款方式（如課程端僅 ['cash','transfer']）
 *   variant      'grid' | 'pill' | 'list'  // 按鈕視覺樣式，預設 'grid'
 *     grid：正方格 icon+文字（原本樣式，適合搭配下方轉帳欄位的完整表單）
 *     pill：藥丸型小按鈕（適合空間有限的快速選擇，如入場 QR 續約/加租）
 *     list：整排列表＋箭頭（適合單獨一個步驟頁、點選即送出）
 *   t            (zh:string) => string  // 選填，翻譯函式（如會員端 memberI18n 的 t）；未帶則原樣顯示中文
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

export default function PaymentSection({
  value = {}, onChange, onSelect, bankInfo, amount, showNote = false,
  showPaidAmount = true, showLabel = true, disabled = false, dateMin, dateMax, methods, variant = 'grid', t = (s) => s,
}) {
  const { method = 'cash', paymentDate = '', bankLastFive = '', bankName = '', note = '' } = value;
  const enabledPay = useEnabledPayments(); // 系統設定的付款方式開關（未開放者全站隱藏）
  // methods（選填）：限制可選付款方式（如課程端只留 ['cash','transfer'] 隱藏電子支付）
  const shownMethods = (methods ? METHODS.filter(m => methods.includes(m.key)) : METHODS)
    .filter(m => enabledPay[m.key] !== false);

  const set = (patch) => onChange({ ...value, ...patch });
  const pick = (key) => { if (disabled) return; set({ method: key }); onSelect?.(key); };

  return (
    <div>
      {/* 付款金額 */}
      {amount != null && (
        <div style={{ background:'#FBF5F5', borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, color:'#666' }}>{t('應付金額')}</span>
          <span style={{ fontSize:18, fontWeight:700, color:'#8B1A1A' }}>NT${amount.toLocaleString()}</span>
        </div>
      )}

      {/* 付款方式選擇 */}
      <div style={{ marginBottom:12 }}>
        {showLabel && <div style={{ fontSize:11, color:'#666', marginBottom:6 }}>{t('付款方式')}</div>}

        {variant === 'grid' && (
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${shownMethods.length},1fr)`, gap:6 }}>
            {shownMethods.map(m => {
              const active = method === m.key;
              return (
                <button key={m.key} onClick={() => pick(m.key)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'8px 4px', borderRadius:10, border:`1.5px solid ${active?'#8B1A1A':'#EDE5E5'}`, background:active?'#FBF5F5':'#fff', cursor:'pointer', transition:'all .15s' }}>
                  <span style={{ fontSize:18 }}>{m.icon}</span>
                  <span style={{ fontSize:10, color:active?'#8B1A1A':'#666', fontWeight:active?600:400 }}>{t(m.label)}</span>
                </button>
              );
            })}
          </div>
        )}

        {variant === 'pill' && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {shownMethods.map(m => {
              const active = method === m.key;
              return (
                <div key={m.key} onClick={() => pick(m.key)}
                  style={{ padding:'8px 14px', borderRadius:20, border:`1.5px solid ${active?'#8B1A1A':'#E8D5D5'}`, background:active?'#8B1A1A':'#fff', color:active?'#fff':'#666', fontSize:13, cursor:'pointer' }}>
                  {t(m.label)}
                </div>
              );
            })}
          </div>
        )}

        {variant === 'list' && (
          <div>
            {shownMethods.map(m => {
              const active = method === m.key;
              return (
                <div key={m.key} onClick={() => pick(m.key)}
                  style={{ background:'#fff', borderRadius:12, border:`0.5px solid ${active?'#8B1A1A':'#E8D5D5'}`, padding:'14px 16px', marginBottom:10, cursor: disabled?'wait':'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', opacity: disabled?0.6:1 }}>
                  <div style={{ fontWeight:500, fontSize:14, color:active?'#8B1A1A':'#1a1a1a' }}>{t(m.label)}</div>
                  <div style={{ fontSize:18, color:'#ccc' }}>›</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 轉帳：帳號資訊 + 填寫欄位 */}
      {method === 'transfer' && (
        <div style={{ background:'#F5F5F5', borderRadius:10, padding:'10px 14px', marginBottom:10 }}>
          {bankInfo && (
            <div style={{ fontSize:12, color:'#444', marginBottom:10, lineHeight:1.8 }}>
              <div style={{ fontWeight:600, color:'#1a1a1a', marginBottom:2 }}>{t('匯款帳號')}</div>
              <div>{bankInfo.bankName} {bankInfo.branch}</div>
              <div style={{ fontFamily:'monospace', fontSize:14, letterSpacing:2, color:'#8B1A1A' }}>{bankInfo.account}</div>
              <div>{t('戶名')}：{bankInfo.accountName}</div>
            </div>
          )}
          <div style={{ marginBottom:8 }}>
            <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>{t('匯款銀行名稱')}</label>
            <input value={bankName} onChange={e => set({ bankName: e.target.value })}
              placeholder={t('例：國泰世華、台新…')} style={inp}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>{t('匯款日期')}</label>
              <input type="date" value={paymentDate} onChange={e => set({ paymentDate: e.target.value })}
                min={dateMin} max={dateMax} style={inp}/>
            </div>
            <div>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>{t('末五碼')}</label>
              <input value={bankLastFive} onChange={e => set({ bankLastFive: e.target.value.slice(0,5) })}
                placeholder="12345" maxLength={5}
                style={{ ...inp, fontFamily:'monospace', letterSpacing:2 }}/>
            </div>
          </div>
          {showPaidAmount && (
            <div style={{ marginTop:8 }}>
              <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>{t('實際匯款金額')}</label>
              <input value={value.paidAmount ?? ''} inputMode="numeric"
                onChange={e => set({ paidAmount: e.target.value.replace(/\D/g,'') })}
                placeholder={amount != null ? String(amount) : t('實際匯出的金額')}
                style={inp}/>
            </div>
          )}
        </div>
      )}

      {/* 現金（臨櫃）：僅顯示繳款日期，供需要期限管控的流程使用 */}
      {method === 'cash' && (dateMin || dateMax) && (
        <div style={{ background:'#F5F5F5', borderRadius:10, padding:'10px 14px', marginBottom:10 }}>
          <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>{t('臨櫃繳款日期')}</label>
          <input type="date" value={paymentDate} onChange={e => set({ paymentDate: e.target.value })}
            min={dateMin} max={dateMax} style={inp}/>
        </div>
      )}

      {/* 非現金非轉帳提示 */}
      {method !== 'cash' && method !== 'transfer' && (
        <div style={{ background:'#F5F5F5', borderRadius:10, padding:'10px 14px', marginBottom:10, fontSize:12, color:'#666' }}>
          {t('請確認顧客已完成')} <strong>{t(METHODS.find(m=>m.key===method)?.label)}</strong> {t('付款後再按確認。')}
        </div>
      )}

      {/* 備註（選填）*/}
      {showNote && (
        <div>
          <label style={{ fontSize:11, color:'#666', display:'block', marginBottom:3 }}>{t('備註（選填）')}</label>
          <input value={note} onChange={e => set({ note: e.target.value })} placeholder={t('備註說明')}
            style={inp}/>
        </div>
      )}
    </div>
  );
}
