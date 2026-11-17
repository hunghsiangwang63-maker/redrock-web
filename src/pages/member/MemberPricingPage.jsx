import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { memberClient } from '../../api/client';
import MemberLogoutButton from '../../components/MemberLogoutButton';
import MemberBottomNav from '../../components/MemberBottomNav';
import { useMember } from '../../store/memberStore.jsx';
import { t, tt, toggleMemberLang, nextLangLabel } from '../../utils/memberI18n';

// 入場收費資訊（兩館共用、免登入公開）：價格來自後端 GET /settings/entry-pricing（與收銀台同一份設定，後端快取 600 秒）。
const PASS_NAME_I18N = {
  '成人30日定期票': ['Adult 30-Day Pass', '一般30日パス'],
  '學生30日定期票': ['Student 30-Day Pass', '学生30日パス'],
  '90日定期票': ['90-Day Pass', '90日パス'],
  '半年定期票': ['6-Month Pass', '半年パス'],
  '新竹單館月票': ['Hsinchu Monthly Pass (Hsinchu only)', '新竹店 月間パス（新竹店のみ）'],
  '士林單館月票': ['Shilin Monthly Pass (Shilin only)', '士林店 月間パス（士林店のみ）'],
};
const passName = (n) => { const x = PASS_NAME_I18N[n]; return x ? tt(n, x[0], x[1]) : n; };
const SINGLE_I18N = {
  single_ticket: ['成人單次入場', 'Adult single entry', '一般 1回入場'],
  student_free: ['學生單次入場', 'Student single entry', '学生 1回入場'],
  child_free: ['兒童單次入場（12 歲以下）', 'Child single entry (12 and under)', '子ども 1回入場（12歳以下）'],
};
const SINGLE_ORDER = ['single_ticket', 'student_free', 'child_free'];
const rateLabel = (r) => tt(`${Math.round(r * 10)} 折`, `${Math.round((1 - r) * 100)}% off`, `${Math.round(r * 10)}掛け`);
const money = (n) => `NT$${Number(n || 0).toLocaleString()}`;

const card = { background: '#fff', borderRadius: 14, border: '0.5px solid #E8D5D5', padding: '14px 16px', margin: '12px 14px 0' };
const h = { fontSize: 13, fontWeight: 700, color: '#8B1A1A', marginBottom: 8 };
const row = { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: '2px 10px', padding: '7px 0', borderBottom: '0.5px solid #F3ECEC', fontSize: 14 };
const price = { fontWeight: 700, color: '#1a1a1a', whiteSpace: 'nowrap' };
const sub = { fontSize: 11, color: '#999', marginTop: 2, fontWeight: 400 };
const li = { fontSize: 13, color: '#444', lineHeight: 1.7, margin: '0 0 4px' };

export default function MemberPricingPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useMember();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { memberClient.get('/settings/entry-pricing').then(r => setD(r.data)).catch(() => setErr(true)); }, []);

  const durationText = (p) => {
    if (p.durationMonths) return p.durationMonths === 6 ? tt('6 個月', '6 months', '6か月') : tt(`${p.durationMonths} 個月`, `${p.durationMonths} month${p.durationMonths > 1 ? 's' : ''}`, `${p.durationMonths}か月`);
    if (p.durationDays) return tt(`${p.durationDays} 日`, `${p.durationDays} days`, `${p.durationDays}日間`);
    return '';
  };
  const single = d ? [...d.single].sort((a, b) => SINGLE_ORDER.indexOf(a.id) - SINGLE_ORDER.indexOf(b.id)) : [];
  const price_of = (id) => d?.single.find(x => x.id === id)?.price;
  const adult = price_of('single_ticket'), student = price_of('student_free');
  const dc = d?.discountCard;
  const payNames = { cash: tt('現金', 'Cash', '現金'), transfer: tt('轉帳', 'Bank transfer', '銀行振込'), linepay: 'LINE Pay', jkopay: tt('街口支付', 'JKOPay', 'JKOペイ'), taiwanpay: tt('台灣Pay', 'Taiwan Pay', '台湾Pay') };

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: '#F7F3F3', paddingBottom: isLoggedIn ? 90 : 28 }}>
      <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', right: 10, zIndex: 120, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div onClick={toggleMemberLang} style={{ height: 36, padding: '0 14px', borderRadius: 18, background: 'rgba(255,255,255,.92)', border: '0.5px solid #E8D5D5', color: '#8B1A1A', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.12)' }}>🌐 {nextLangLabel()}</div>
        {isLoggedIn && <MemberLogoutButton inline />}
      </div>
      <div style={{ background: '#fff', padding: '16px 20px', borderBottom: '0.5px solid #E8D5D5', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div onClick={() => navigate(isLoggedIn ? '/member/home' : '/member/gyms')} style={{ fontSize: 20, cursor: 'pointer', color: '#8B1A1A' }}>←</div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{tt('入場收費資訊', 'Entry Fees', '入場料金のご案内')}</div>
      </div>

      {err && <div style={{ ...card, color: '#A32D2D', fontSize: 13 }}>{tt('載入失敗，請稍後再試。', 'Failed to load. Please try again later.', '読み込みに失敗しました。しばらくしてからお試しください。')}</div>}
      {!d && !err && <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 40 }}>{t('載入中...')}</div>}

      {d && (<>
        <div style={{ margin: '12px 14px 0', fontSize: 12, color: '#999' }}>{tt('兩館（新竹館、士林館）價格相同。實際收費以櫃檯現場為準。', 'Prices are the same at both gyms (Hsinchu and Shilin). Final prices are confirmed at the front desk.', '両店（新竹店・士林店）共通料金です。最終的な料金は受付でご確認ください。')}</div>

        <div style={card}>
          <div style={h}>{tt('單次入場', 'Single Entry', '1回入場')}</div>
          {single.map(s => {
            const n = SINGLE_I18N[s.id];
            return <div key={s.id} style={row}><span>{n ? tt(n[0], n[1], n[2]) : s.name}</span><span style={price}>{money(s.price)}</span></div>;
          })}
          <div style={{ ...sub, marginTop: 8 }}>{tt('學生票適用 22 歲以下，或已驗證學生證者。12 歲以下須成人陪同。', 'Student rate: age 22 or under, or verified student ID. Children 12 and under must be accompanied by an adult.', '学生料金は22歳以下、または学生証確認済みの方が対象です。12歳以下は大人の同伴が必要です。')}</div>
        </div>

        <div style={card}>
          <div style={h}>{tt('優惠折扣券與各項折扣', 'Discount Card & Discounts', '割引券・各種割引')}</div>
          <div style={row}><span>{tt(`購買優惠折扣券（含本次入場，另享 ${dc.credits} 次八折）`, `Buy a discount card (includes today\'s entry, plus ${dc.credits} discounted entries)`, `割引券の購入（本日の入場込み・さらに${dc.credits}回割引）`)}</span><span style={price}>{money(dc.price)}</span></div>
          <div style={row}><span>{tt('使用優惠折扣券入場', 'Entry with a discount card', '割引券で入場')}
            <div style={sub}>{tt(`原價 ${Math.round(dc.rate * 10)} 折；兒童不適用`, `${Math.round((1 - dc.rate) * 100)}% off the regular price; not for children`, `通常料金の${Math.round(dc.rate * 10)}掛け；子どもは対象外`)}</div></span>
            <span style={price}>{adult != null ? `${tt('成人', 'Adult', '一般')} ${money(Math.round(adult * dc.rate))}` : ''}{student != null ? ` / ${tt('學生', 'Student', '学生')} ${money(Math.round(student * dc.rate))}` : ''}</span></div>
          <div style={row}><span>{tt('紅石攀岩隊隊員', 'RedRock climbing team members', '紅石クライミングチーム')}<div style={sub}>{tt(`入場費 ${Math.round(d.teamDiscount.rate * 10)} 折（${money(d.teamDiscount.minAmount)} 以上適用）`, `${Math.round((1 - d.teamDiscount.rate) * 100)}% off (amounts of ${money(d.teamDiscount.minAmount)} or more)`, `入場料${Math.round(d.teamDiscount.rate * 10)}掛け（${money(d.teamDiscount.minAmount)}以上）`)}</div></span><span style={price}>{rateLabel(d.teamDiscount.rate)}</span></div>
          {d.partnerGymMember.enabled && <div style={row}><span>{tt('友館攀岩隊員', 'Partner-gym team members', '提携ジム会員')}<div style={sub}>{tt('僅限成人全票（不含學生票），不與其他折扣併用；出示證明、櫃檯查驗', 'Adult full-price single entry only (not the student rate); cannot be combined with other discounts; show proof at the front desk', '一般（全額）1回入場のみ（学生料金は対象外）。他の割引との併用不可。証明を受付で提示')}</div></span><span style={price}>{rateLabel(d.partnerGymMember.rate)}</span></div>}
          {d.partnerVendor.enabled && <div style={row}><span>{tt('特約廠商', 'Partner vendors', '提携企業')}<div style={sub}>{tt('僅限成人單次票，不含學生票；不與其他折扣併用', 'Adult single entry only (not the student rate); cannot combine with other discounts', '一般1回入場のみ（学生料金は対象外）。他の割引との併用不可')}</div></span><span style={price}>−{money(d.partnerVendor.discount)}</span></div>}
          <div style={{ ...sub, marginTop: 8 }}>{tt(`優惠折扣券用完後可獲得一次免費入場紅利，有效 ${d.bonus.validityMonths} 個月。`, `Using up a discount card earns one free-entry bonus, valid for ${d.bonus.validityMonths} months.`, `割引券を使い切ると無料入場ボーナスが1回付与されます（有効期間${d.bonus.validityMonths}か月）。`)}</div>
        </div>

        <div style={card}>
          <div style={h}>{tt('定期票', 'Passes', '定期パス')}</div>
          {[...d.passes].sort((a, b) => ((a.durationMonths || 0) * 30 + (a.durationDays || 0)) - ((b.durationMonths || 0) * 30 + (b.durationDays || 0)) || (a.scope === b.scope ? 0 : a.scope === 'shared' ? -1 : 1) || b.price - a.price).map(p => (
            <div key={p.id} style={row}>
              <span>{passName(p.name)}
                <div style={sub}>{durationText(p)}{p.scope === 'single' ? ` · ${tt('單館使用', 'single gym', '単館利用')}` : ` · ${tt('兩館通用', 'both gyms', '両店共通')}`}{p.renewalDiscount?.mode === 'percent' ? ` · ${tt(`期限內續約 ${100 - p.renewalDiscount.value}% 價`, `renew before expiry for ${p.renewalDiscount.value}% off`, `期間内の更新は${p.renewalDiscount.value}%オフ`)}` : ''}</div></span>
              <span style={price}>{money(p.price)}</span>
            </div>
          ))}
          <div style={{ ...sub, marginTop: 8 }}>{tt(`隊員另享 ${Math.round(d.teamDiscount.rate * 10)} 折優惠`, `Team members get an additional ${Math.round((1 - d.teamDiscount.rate) * 100)}% off`, `チームメンバーはさらに${Math.round(d.teamDiscount.rate * 10)}掛けでご利用いただけます`)}</div>
        </div>

        <div style={card}>
          <div style={h}>{tt('器材租借', 'Rentals', 'レンタル')}</div>
          {d.rentals.shoe.active && <div style={row}><span>{tt('岩鞋', 'Climbing shoes', 'クライミングシューズ')}</span><span style={price}>{money(d.rentals.shoe.price)}</span></div>}
          {d.rentals.chalk.active && <div style={row}><span>{tt('粉袋', 'Chalk bag', 'チョークバッグ')}</span><span style={price}>{money(d.rentals.chalk.price)}</span></div>}
        </div>

        <div style={card}>
          <div style={h}>{tt('入場須知', 'Good to Know', 'ご利用案内')}</div>
          <p style={li}>• {tt('首次入場須先簽署風險安全聲明書，並通過抱石墜落測驗（未滿 10 歲須通過親子版）。', 'First-time visitors must sign the liability waiver and pass the bouldering fall test (children under 10 take the parent-child version).', '初回は同意書への署名と、ボルダリング墜落テストの合格が必要です（10歳未満は親子版）。')}</p>
          <p style={li}>• {tt('墜落測驗有效 1 年；有效期內入場滿 2 次，到期時系統會自動延長 1 年。', 'The fall test is valid for 1 year. If you visit at least twice during that year, it is extended by 1 year automatically when it expires.', '墜落テストの有効期間は1年。期間中に2回以上入場すると、期限切れ時に自動で1年延長されます。')}</p>
          <p style={li}>• {tt('入場費用請於櫃檯付款：', 'Pay at the front desk: ', 'ご利用料金は受付でお支払いください：')}{d.payments.map(k => payNames[k] || k).join(tt('、', ', ', '、'))}</p>
        </div>
      </>)}
      {isLoggedIn && <MemberBottomNav />}
    </div>
  );
}
