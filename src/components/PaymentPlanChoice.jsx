// 報名/購買時的「一次付清 / 分期」選擇（僅在該課程/票種有開分期規則時顯示）
// 用法：<PaymentPlanChoice installment={course.installment} price={fee} plan={plan} paymentMethod={pm} onChange={({plan,paymentMethod})=>...} />
import { useEnabledPayments, filterPayments } from '../utils/paymentMethods';

const PAY = [{ k: 'cash', l: '現金' }, { k: 'transfer', l: '轉帳' }, { k: 'linepay', l: 'Line Pay' }, { k: 'jkopay', l: '街口支付' }, { k: 'taiwanpay', l: '台灣Pay' }];

function previewPeriods(installment, price) {
  const p = Number(price) || 0;
  const per = (installment?.periods || []).filter(x => (Number(x.percent) || 0) > 0);
  let alloc = 0;
  return per.map((x, i) => {
    const isLast = i === per.length - 1;
    const amt = isLast ? (p - alloc) : Math.round(p * (Number(x.percent) || 0) / 100);
    alloc += amt;
    return { amt, days: Number(x.dueOffsetDays) || 0 };
  });
}

export default function PaymentPlanChoice({ installment, price, plan, paymentMethod, onChange, hideMethod = false }) {
  const enabledPay = useEnabledPayments();
  const has = installment?.enabled && (installment.periods?.length >= 2);
  if (!has) return null;
  const rows = previewPeriods(installment, price);
  return (
    <div style={{ border: '0.5px solid #E8D5D5', borderRadius: 8, padding: 12, background: '#FBF5F5', marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>付款方式（此項目可分期）</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: plan === 'installment' ? 10 : 0 }}>
        {[{ k: 'full', l: '一次付清' }, { k: 'installment', l: `分期（${rows.length} 期）` }].map(o => (
          <button key={o.k} type="button" onClick={() => onChange({ plan: o.k, paymentMethod: paymentMethod || 'cash' })}
            style={{ flex: 1, height: 36, borderRadius: 8, border: `0.5px solid ${plan === o.k ? '#8B1A1A' : '#E8D5D5'}`, background: plan === o.k ? '#8B1A1A' : '#fff', color: plan === o.k ? '#fff' : '#666', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{o.l}</button>
        ))}
      </div>
      {plan === 'installment' && (
        <div>
          {rows.map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: '#555', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>第 {i + 1} 期{i === 0 ? '（簽約當下收）' : `（${r.days} 天後到期）`}</span>
              <span style={{ fontWeight: 600 }}>NT${r.amt.toLocaleString()}</span>
            </div>
          ))}
          {hideMethod
            ? <div style={{ fontSize: 11, color: '#854F0B', marginTop: 8 }}>選擇分期後，下方付款即為「第一期（頭款）」金額；其餘各期依上表到期繳交。</div>
            : (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>頭款（第一期）收款方式</div>
                <select value={paymentMethod || 'cash'} onChange={e => onChange({ plan, paymentMethod: e.target.value })}
                  style={{ width: '100%', height: 34, borderRadius: 7, border: '0.5px solid #E8D5D5', padding: '0 10px', fontSize: 13, background: '#fff', color: '#1a1a1a' }}>
                  {filterPayments(PAY, enabledPay).map(m => <option key={m.k} value={m.k}>{m.l}</option>)}
                </select>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
