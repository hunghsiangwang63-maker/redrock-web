import { useState, useEffect, useRef } from 'react';
import MemberLogoutButton from '../../components/MemberLogoutButton';
import CheckTick from '../../components/CheckTick';
import MemberBottomNav from '../../components/MemberBottomNav';
import { t, tt } from '../../utils/memberI18n';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMember } from '../../store/memberStore.jsx';
import { memberClient } from '../../api/client';
import PaymentPlanChoice from '../../components/PaymentPlanChoice';
import { generateQrDataUrl } from '../../utils/generateQrDataUrl';
import { reportClientError } from '../../utils/reportClientError';
import useScreenWakeLock from '../../hooks/useScreenWakeLock';
import dayjs from 'dayjs';
import { isChild } from '../../utils/age';
import PaymentSection from '../../components/PaymentSection';
import PassContractReview from '../../components/PassContractReview';
import { isMinor } from '../../utils/age';
import { useEnabledPayments } from '../../utils/paymentMethods';
import { loadQuickEntry, saveQuickEntry, clearQuickEntry } from '../../utils/quickEntry';

const PAYMENT_METHODS = [
  { key: 'cash',      label: '現金' },
  { key: 'linepay',   label: 'Line Pay' },
  { key: 'jkopay',    label: '街口支付' },
  { key: 'taiwanpay', label: '台灣 Pay' },
];

const ENTRY_TYPE_LABEL = {
  pass: '定期票', vip: 'VIP 免費入場', course_access: '課程學員',
  child_free: '兒童入場', student_free: '學生入場',
  discount_card: '使用優惠折扣券', black_card: '使用黑卡', bonus: '紅利免費入場',
  single_entry_ticket: '使用單次入場券', single_ticket: '單次購票',
  buy_discount_card: '購買優惠折扣券', buy_pass: '購買定期票',
};

// 入場身分顯示名稱（不帶金額）：成人入場 / 學生入場 / 兒童入場；其餘去除「單次」字樣
const ENTRY_ID_LABEL = { single_ticket: '成人入場', student_free: '學生入場', child_free: '兒童入場' };
const entryIdLabel = (opt) => ENTRY_ID_LABEL[opt?.type] || (opt?.label || '').replace(/單次/g, '').trim() || '入場';

// 入場方案清單（單次付費／優惠券／黑卡／紅利／入場券）。選方案畫面與快速入場共用，避免兩處各自維護。
function buildMethods(st, inst, t) {
  const basePrice = st.discountedPrice ?? st.price ?? 0;       // 一般付款（含隊員折扣）
  const methods = [
    { kind:'pay', type:st.type, baseEntryType:st.type, label:t('單次入場'), price:st.price, discountedPrice:basePrice,
      teamDiscount:st.teamDiscount, partnerVendorEligible:st.partnerVendorEligible === true, partnerGymMemberEligible:st.partnerGymMemberEligible === true, freeEntry:false, requiresPayment:true },
  ];
  if (inst.discountCard?.available) {
    const dp = Math.round((st.price || 0) * (inst.discountCard.rate || 0.8));
    methods.push({ kind:'discountCard', type:'discount_card', baseEntryType:st.type, label:t('使用優惠折扣券（原價 8 折）'),
      price:st.price, discountedPrice:dp, freeEntry:false, requiresPayment:true,
      instrumentKind:'discountCard', cards:inst.discountCard.cards });
  }
  if (inst.blackCard?.available) methods.push({ kind:'blackCard', type:'black_card', label:t('使用黑卡（免費）'), freeEntry:true, instrumentKind:'blackCard', cards:inst.blackCard.cards });
  if (inst.bonus?.available) methods.push({ kind:'bonus', type:'bonus', label:t('使用紅利（免費）'), freeEntry:true, instrumentKind:'bonus', cards:inst.bonus.bonuses });
  if (inst.singleEntryTicket?.available) methods.push({ kind:'ticket', type:'single_entry_ticket', label:t('使用單次入場券（免費）'), freeEntry:true, instrumentKind:'singleEntryTicket', cards:inst.singleEntryTicket.tickets });
  return methods;
}

// 快速入場可記住的方案種類（購買類、友館/特約優惠、續約不記）
const QUICK_KINDS = ['pay', 'discountCard', 'blackCard', 'bonus', 'ticket', 'free'];
const QUICK_EXHAUST_MSG = {
  discountCard: '優惠折扣券已用完或失效',
  blackCard: '黑卡已用完或失效',
  bonus: '紅利已用完或已過期',
  ticket: '單次入場券已用完或已過期',
  pay: '這個入場方案目前不可選',
};

export default function MemberQRPage() {
  const { member } = useMember();
  const navigate = useNavigate();
  const location = useLocation();
  const enabledPay = useEnabledPayments(); // 系統層付款方式開關；街口尚未接金鑰前可能被關閉，此時即使 onlineFlows.entry 開著也不該顯示線上金流文案/入口

  const [step, setStep] = useState('loading');
  const [verifyResult, setVerifyResult] = useState(null);
  const [selectedType, setSelectedType] = useState(null);   // 第一段：身分（入場類型）
  const [selectedEntry, setSelectedEntry] = useState(null); // 第二段：付款/票券方式
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [buyPassPlan, setBuyPassPlan] = useState('full'); // 購定期票：'full' | 'installment'
  const [partnerVendor, setPartnerVendor] = useState(false); // 特約廠商優惠（−20，需出示證件；後端權威）
  const [partnerGymMember, setPartnerGymMember] = useState(false); // 友館隊員優惠（9折，需出示證明；後端權威；與特約廠商互斥）
  const [renewOptIn, setRenewOptIn] = useState(false);    // 續約：是否順便續約
  const [renewPlan, setRenewPlan] = useState('full');     // 續約：'full' | 'installment'
  const [rentShoes, setRentShoes] = useState(false);
  const [rentChalk, setRentChalk] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [qrToken, setQrToken] = useState(null);
  const [qrExpiry, setQrExpiry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [verifyFailed, setVerifyFailed] = useState(false); // 驗票請求本身失敗（逾時/斷線），不是「資格不符」——畫面要區分，避免客人誤以為被拒絕入場
  const [qrClosedReason, setQrClosedReason] = useState(null); // 'cancelled' | 'expired' → 停止輪詢並提示
  const [autoGenQR, setAutoGenQR] = useState(false); // 快速入場：selectedEntry 就緒後自動產生 QR（跳過租借器材／選付款方式）
  const passContractRef = useRef(null); // 定期票服務同意書（合約）條款檢閱＋簽名步驟（僅 buy_pass 適用）
  const [passContractData, setPassContractData] = useState(null); // 離開 pass_contract 步驟時存下（元件會 unmount，需先取出資料）
  const [passContractErr, setPassContractErr] = useState(false);

  // ── 快速入場（見 utils/quickEntry.js）：首頁「快速入場」進來帶 ?quick=1，依記住的選擇一鍵產 QR ──
  const quickPrefRef = useRef(undefined);
  if (quickPrefRef.current === undefined) {
    const qs = new URLSearchParams(location.search);
    const want = qs.get('quick') === '1';
    quickPrefRef.current = want ? loadQuickEntry(member?.id, qs.get('who') || member?.id) : null; // who＝入場人員（家庭成員各自一份記憶）
  }
  const quickRef = useRef(quickPrefRef.current);        // 待套用的記憶（驗票成功後用掉一次）
  const quickAppliedRef = useRef(false);
  const quickGenRef = useRef(false);                    // 目前的 QR 產生是快速入場觸發的（失敗時要顯示警示頁）
  const noRememberRef = useRef(false);                  // 自動產生（快速入場／線上付款票券）不覆寫記憶
  const [quickReady, setQuickReady] = useState(() => !quickPrefRef.current); // 等子會員清單載入、套用記住的人員/場館後才驗票
  const [quickWarn, setQuickWarn] = useState(null);     // 快速入場無法使用的原因（顯示警示頁）
  const [quickNotice, setQuickNotice] = useState(null); // 頁首提示（如記住的入場人員已不存在）
  const [qrFromQuick, setQrFromQuick] = useState(false);  // 目前的 QR 由快速入場產生（顯示「更改付款方式」鈕）
  const [rememberQuick, setRememberQuick] = useState(true); // 本次選擇是否記為快速入場

  // 親子帳號：可選擇要產生「誰」的入場 QR（家長本人 / 各子會員）
  const [children, setChildren] = useState([]);
  const [targetId, setTargetId] = useState(null); // null → 家長本人
  const entrant = (targetId && children.find(c => c.id === targetId)) || member;
  const isChildTarget = !!entrant && !!member && entrant.id !== member.id;

  // 入場場館：會員自選（兩館），記住上次選擇。QR 依此館 verify＋產碼，站台掃碼須同館。
  const [gymId, setGymId] = useState(() => {
    try { return localStorage.getItem('memberEntryGymId') || 'gym-hsinchu'; } catch { return 'gym-hsinchu'; }
  });
  const changeGym = (id) => {
    if (id === gymId) return;
    try { localStorage.setItem('memberEntryGymId', id); } catch (e) {}
    setGymId(id);
  };

  // 續約資訊（到期前14天由後端 verify 回傳）；分期各期前 n-1 照原價比例、折扣集中末期（與後端 buildRenewalPeriods 一致）
  const renewal = verifyResult?.renewal || null;
  const renewInstEnabled = !!renewal?.installment?.enabled && (renewal?.installment?.periods?.length >= 2) && renewal?.renewalPrice > 0;
  const computeRenewPeriods = () => {
    if (!renewInstEnabled) return [];
    const ps = renewal.installment.periods;
    let alloc = 0;
    return ps.map((p, i) => {
      const amt = i === ps.length - 1 ? Math.max(0, renewal.renewalPrice - alloc) : Math.round((renewal.fullPrice || 0) * (Number(p.percent) || 0) / 100);
      alloc += amt;
      return amt;
    });
  };
  const renewPeriods = computeRenewPeriods();
  // 續約本次應收：一次付清＝折後全額；分期＝首期
  const renewDueNow = !renewOptIn ? 0 : (renewPlan === 'installment' && renewPeriods.length ? renewPeriods[0] : (renewal?.renewalPrice || 0));

  // 載入子會員清單
  useEffect(() => {
    if (!member) return;
    // 快速入場：子會員清單回來後，才套用記住的入場人員／場館並開始驗票（否則會先驗到家長本人）
    const applyQuick = (ch) => {
      const q = quickPrefRef.current;
      if (!q) {
        // 沒有記憶（首頁選了某位家庭成員、尚未設定）：只預選入場人員，走一般入場流程
        const who = new URLSearchParams(location.search).get('who');
        if (who && who !== member.id && ch.some(c => c.id === who)) setTargetId(who);
        return;
      }
      if (quickAppliedRef.current) return;
      quickAppliedRef.current = true;
      if (q.targetId) {
        if (ch.some(c => c.id === q.targetId)) setTargetId(q.targetId);
        else { quickRef.current = null; setQuickNotice(t('原本記住的入場人員已不在家庭成員中，請重新選擇入場方式。')); }
      }
      if (q.gymId && q.gymId !== gymId) {
        try { localStorage.setItem('memberEntryGymId', q.gymId); } catch (e) {}
        setGymId(q.gymId);
      }
      setQuickReady(true);
    };
    memberClient.get('/members/my/children')
      .then(r => { const ch = r.data.children || []; setChildren(ch); applyQuick(ch); })
      .catch(() => applyQuick([]));
  }, [member]); // eslint-disable-line

  // 本人不入場：入場對象預設落在第一個家庭成員（不驗本人）
  useEffect(() => { if (member?.selfEntrySkipped && !targetId && children.length) setTargetId(children[0].id); }, [member, children]); // eslint-disable-line
  // 切換入場人員 / 場館（或初次進入）時重新驗票
  useEffect(() => { if (member && quickReady) doVerify(); /* eslint-disable-next-line */ }, [member, targetId, gymId, quickReady]);

  // 產生 QR 後輪詢入場狀態：confirmed→自動跳首頁（首頁橫幅顯示已入場）；
  // cancelled/expired→停止並提示；元件卸載/QR 變更時清除 timer（不無限輪詢）。
  // ⚠️ 間隔隨等待時間拉長（多數幾秒內就被掃描確認，維持 3 秒近即時體感；久未確認代表
  // 會員可能沒馬上去給店員掃、放著頁面不管，此時放慢查詢頻率——QR 效期 30 分鐘，
  // 最壞情況（放著整段效期沒掃）從 ~600 次查詢降到 ~140 次）。
  useEffect(() => {
    if (!qrToken) return;
    setQrClosedReason(null);
    let cancelled = false;
    let timer = null;
    const startedAt = Date.now();
    const nextDelay = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 30000) return 3000;   // 前 30 秒：3 秒一次
      if (elapsed < 180000) return 8000;  // 30 秒~3 分鐘：8 秒一次
      return 15000;                        // 3 分鐘後：15 秒一次
    };
    const poll = async () => {
      try {
        const r = await memberClient.get(`/checkin/qr/status/${qrToken}`);
        if (cancelled) return;
        const st = r.data?.status;
        if (st === 'confirmed') { navigate('/member/home'); return; }
        if (st === 'cancelled' || st === 'expired') { setQrClosedReason(st); return; }
      } catch (e) { /* 網路暫時錯誤：忽略，下次再試 */ }
      if (!cancelled) timer = setTimeout(poll, nextDelay());
    };
    timer = setTimeout(poll, nextDelay());
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [qrToken]); // eslint-disable-line

  // ⚠️ 由「切換入場人員/場館」的 effect 觸發，快速連續切換（如連點場館按鈕、快速切換家庭成員）
  // 沒有取消前一次呼叫，兩次驗票請求可能重疊；較舊的回應若較晚到達，會用錯的館別/對象驗票結果
  // 蓋掉畫面（可能顯示錯誤的入場資格/金額）。序號只採用最新一次回應——上方清空選取狀態是同步、
  // 每次呼叫都該立即生效，只有 await 之後的結果套用需要防過期。
  const verifySeqRef = useRef(0);
  const autoGenRentalRef = useRef({ shoes: false, chalk: false }); // 快速入場自動產 QR 時帶入的租借選擇
  // 依記住的選擇比對「這次驗票回來的即時資格」：身分／票卡仍可用才一鍵產 QR，否則顯示警示讓會員改選。
  const resolveQuick = (q, data) => {
    const warn = (msg) => { setQuickWarn(msg); setStep('quick_warn'); };
    let entry;
    if (q.kind === 'free') {
      if (!data.freeEntry || data.entryType !== q.type) {
        return warn(t('您目前的入場資格和上次不同（例如定期票、課程學員資格已到期或變更）。'));
      }
      entry = { type: data.entryType, freeEntry: true, passId: data.pass?.id };
    } else {
      if (data.freeEntry) return warn(t('您目前已有免費入場資格，入場方式和上次不同。'));
      const st = (data.entryTypeOptions || []).find(o => o.type === q.entryTypeId);
      if (!st) return warn(tt(`入場身分「${t(q.entryLabel || '')}」目前無法選擇，請重新選擇。`, `The entry type "${t(q.entryLabel || '')}" is no longer available. Please choose again.`, `入場区分「${t(q.entryLabel || '')}」は現在選択できません。選び直してください。`));
      const m = buildMethods(st, data.instruments || {}, t).find(x => x.kind === q.kind);
      if (!m || (m.instrumentKind && !(m.cards && m.cards.length))) {
        return warn(t(QUICK_EXHAUST_MSG[q.kind] || '這個入場方案目前不可選'));
      }
      entry = { ...m, baseEntryType: m.baseEntryType || m.type, cardId: m.cards?.[0]?.id || null };
      setSelectedType(st);
    }
    const needPay = (entry.requiresPayment && !entry.freeEntry) || (entry.freeEntry && (q.shoes || q.chalk));
    if (needPay) {
      if (!q.payMethod) return warn(t('這個入場方式需要先選擇付款方式。'));
      if (enabledPay[q.payMethod] === false) return warn(t('上次使用的付款方式目前未開放，請重新選擇。'));
    }
    setSelectedEntry(entry);
    setSelectedPayment(needPay ? q.payMethod : null);
    autoGenRentalRef.current = { shoes: !!q.shoes, chalk: !!q.chalk };
    quickGenRef.current = true;
    setAutoGenQR(true);
  };

  const doVerify = async () => {
    const seq = ++verifySeqRef.current;
    setStep('loading');
    setError(null);
    setVerifyFailed(false);
    // 切換對象時清空上一位的流程狀態
    setSelectedType(null); setSelectedEntry(null); setSelectedCard(null); setSelectedPayment(null); setBuyPassPlan('full');
    setRenewOptIn(false); setRenewPlan('full');
    setRentShoes(false); setRentChalk(false);
    setQrDataUrl(null); setQrToken(null); setQrExpiry(null); setQrFromQuick(false);
    try {
      // timeout 放寬到 25 秒（共用 client 預設 10 秒；後端偶爾落在慢實例時，驗票要查多筆資料會超過 10 秒而誤顯示失敗，2026-10-14）
      const res = await memberClient.post('/checkin/verify', { identifier: member.phone, gymId, targetMemberId: entrant.id }, { timeout: 25000 });
      if (seq !== verifySeqRef.current) return;
      const data = res.data;
      setVerifyResult(data);
      if (!data.allowed) {
        quickRef.current = null;
        setStep('blocked');
      } else if (quickRef.current) {
        const q = quickRef.current;
        quickRef.current = null;
        resolveQuick(q, data);
      } else if (data.freeEntry) {
        setSelectedEntry({ type: data.entryType, freeEntry: true, passId: data.pass?.id });
        setStep('shoes');
      } else {
        setStep('select_entry');
      }
    } catch (err) {
      if (seq !== verifySeqRef.current) return;
      setError(err.response?.data?.message || t('驗票失敗'));
      // 沒有伺服器回應（逾時/斷線）或 5xx＝驗票本身失敗，不是資格不符：清掉舊結果、畫面改顯示「連線問題，請重試」
      if (!err.response || err.response.status >= 500) { setVerifyResult(null); setVerifyFailed(true); }
      setStep('blocked');
    }
  };

  const handleGenerateQR = async (shoes, chalk = false, payMethod = selectedPayment) => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        memberId: entrant.id,
        gymId,
        entryType: selectedEntry.type,
        baseEntryType: selectedEntry.baseEntryType || null,
        rentShoes: shoes,
        shoesPrice: shoes ? 100 : 0,
        rentChalk: chalk,
        chalkPrice: chalk ? 50 : 0,
        amount: 0,
        originalAmount: 0,
      };
      if (selectedEntry.passId) payload.passId = selectedEntry.passId;
      if (selectedEntry.buyPassTypeId) {
        payload.buyPassTypeId = selectedEntry.buyPassTypeId;
        payload.paymentPlan = buyPassPlan; // 'full' | 'installment'（後端權威依票種 installment 決定是否真分期）
        // 定期票服務同意書（合約）簽名——於 pass_contract 步驟收集，此為現金/一般付款方式的即建路徑
        // （/checkin/qr/create → confirmCheckIn 立即建票）；選線上金流(entry orderType)另走票券延後
        // 兌換流程，簽名暫無法帶入，屬已知範圍外缺口（見 checkin/flow.js buy_pass 分支註解）。
        if (passContractData) {
          payload.passContractPortraitSignature = passContractData.portraitSignature;
          payload.passContractGuardianSignature = passContractData.guardianSignature;
        }
      }
      const cardId = selectedEntry.cardId || selectedCard;
      if (cardId) {
        if (selectedEntry.instrumentKind === 'discountCard') payload.discountCardId = cardId;
        if (selectedEntry.instrumentKind === 'blackCard') payload.blackCardId = cardId;
        if (selectedEntry.instrumentKind === 'singleEntryTicket') payload.singleEntryTicketId = cardId;
        if (selectedEntry.instrumentKind === 'bonus') payload.bonusId = cardId;
      }
      if (!selectedEntry.freeEntry) {
        payload.paymentMethod = payMethod;
        payload.originalAmount = selectedEntry.price || 0;
        // 友館隊員(9折)／特約廠商(−20)：全票/學生票、非隊員、一般付款；互斥、友館隊員優先（後端權威覆核，前端僅顯示一致）
        const _base = selectedEntry.discountedPrice ?? selectedEntry.price ?? 0;
        const pgmActive = selectedEntry.kind === 'pay' && selectedEntry.partnerGymMemberEligible === true && partnerGymMember;
        const pgmRate = verifyResult?.partnerGymMemberRate || 0.9;
        const pvActive = !pgmActive && selectedEntry.kind === 'pay' && selectedEntry.partnerVendorEligible === true && partnerVendor;
        const pvCut = pvActive ? (verifyResult?.partnerVendorDiscount || 20) : 0;
        payload.amount = pgmActive ? Math.round(_base * pgmRate) : Math.max(0, _base - pvCut);
        payload.isTeamDiscount = selectedEntry.teamDiscount || false;
        if (pvActive) payload.partnerVendor = true;
        if (pgmActive) payload.partnerGymMember = true;
      }
      // 免費入場但有加租器材（岩鞋/粉袋）：帶「租借付款方式」（供結帳付款方式正確歸類，不再一律現金）
      if (selectedEntry.freeEntry && (shoes || chalk)) {
        payload.paymentMethod = payMethod || 'cash';
      }
      // 續約附加（免費入場定期票、到期前14天）：帶要續約的票 + 分期選擇 + 續約款付款方式
      if (renewOptIn && renewal?.passId) {
        payload.renewPassId = renewal.passId;
        payload.renewPaymentPlan = renewPlan;
        payload.paymentMethod = payMethod || 'cash';
      }

      const res = await memberClient.post('/checkin/qr/create', payload);
      const { qrToken, expiresAt } = res.data;
      const dataUrl = await generateQrDataUrl(qrToken, { width: 220, margin: 2 });
      setQrToken(qrToken);
      setQrExpiry(expiresAt);
      setQrDataUrl(dataUrl);
      setRentShoes(shoes); setRentChalk(chalk);
      if (quickGenRef.current) setQrFromQuick(true);
      // 記住這次選擇（快速入場）：只記可重複的方案；購買類／友館特約優惠／續約不記
      try {
        const kind = selectedEntry.kind || (selectedEntry.freeEntry ? 'free' : null);
        const rememberable = rememberQuick && !noRememberRef.current && QUICK_KINDS.includes(kind)
          && !(partnerVendor || partnerGymMember || renewOptIn) && !selectedEntry.buyPassTypeId;
        if (rememberable) {
          const usesPay = (selectedEntry.requiresPayment && !selectedEntry.freeEntry) || (selectedEntry.freeEntry && (shoes || chalk));
          saveQuickEntry(member.id, isChildTarget ? entrant.id : member.id, {
            targetId: isChildTarget ? entrant.id : null, gymId,
            entryTypeId: selectedType?.type || null, entryLabel: selectedType ? entryIdLabel(selectedType) : null,
            kind, type: selectedEntry.type,
            methodLabel: selectedEntry.label || ENTRY_TYPE_LABEL[selectedEntry.type] || null,
            shoes: !!shoes, chalk: !!chalk, payMethod: usesPay ? (payMethod || null) : null,
            who: entrant.name,
          });
        }
      } catch (e) {}
      quickGenRef.current = false; noRememberRef.current = false;
      setStep('qr');
    } catch (err) {
      // 後端 pendingCheckIn 可能已成功建立（見下方 qrToken 判斷），只是產生 QR 圖片這步失敗——
      // 回報實際錯誤內容，供之後查（2026-09-26 曾發生此路徑靜默失敗、無法定位根因）。
      reportClientError(err, 'MemberQRPage.handleGenerateQR');
      const msg = err.response?.data?.message || t('產生 QR Code 失敗');
      setError(msg);
      noRememberRef.current = false;
      if (quickGenRef.current) { quickGenRef.current = false; setQuickWarn(msg); setStep('quick_warn'); }
    } finally {
      setLoading(false);
    }
  };

  // autoGenQR 只在快速入場（resolveQuick）判定可用時被設 true；等 selectedEntry 的
  // setState 真的提交、下一次 render 完成後才呼叫 handleGenerateQR（此時讀到的 selectedEntry
  // 才是剛設好的新值，不是呼叫當下 closure 捕捉到的舊值）——用過即清，不會重複觸發。
  useEffect(() => {
    if (autoGenQR && selectedEntry) {
      setAutoGenQR(false);
      noRememberRef.current = true; // 快速入場自動產生，不需要再存記憶
      handleGenerateQR(autoGenRentalRef.current.shoes, autoGenRentalRef.current.chalk);
    }
  }, [autoGenQR, selectedEntry]); // eslint-disable-line

  // 顯示入場 QR 時保持螢幕常亮，見 hooks/useScreenWakeLock.js 檔頭說明
  useScreenWakeLock(step === 'qr');

  const NavBar = () => <MemberBottomNav navigate={navigate} />;

  const Header = ({ title, onBack }) => (
    <div style={{ background:'#fff', padding:'16px 20px', borderBottom:'0.5px solid #E8D5D5', display:'flex', alignItems:'center', gap:10 }}>
      {onBack && <div onClick={onBack} style={{ fontSize:20, cursor:'pointer', color:'#8B1A1A' }}>←</div>}
      <div style={{ fontWeight:600, fontSize:15 }}>{title}</div>
    </div>
  );

  const wrap = (kids) => (
    <div style={{ width:'100%', minHeight:'100vh', background:'#F7F3F3', paddingBottom:80 }}>
      {verifyResult?.member?.fallTestWarning && (
        <div style={{ margin:'12px 20px 0', background:'#FCEBEB', border:'1.5px solid #E8A5A5', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#A32D2D', fontWeight:600, lineHeight:1.6 }}>
          ⚠️ {tt(verifyResult.member.fallTestWarning.message, 'Fall test consent form or test not yet completed', '墜落テスト同意書またはテストが完了していません')}
        </div>
      )}
      {quickNotice && (
        <div style={{ margin:'12px 20px 0', background:'#FFF8E6', border:'0.5px solid #F5D87A', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#8B6914', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, textAlign:'left' }}>
          <span>⚠️ {quickNotice}</span>
          <span onClick={() => setQuickNotice(null)} style={{ cursor:'pointer', flexShrink:0 }}>✕</span>
        </div>
      )}
      {kids}
      <MemberLogoutButton />
      <NavBar />
    </div>
  );

  // 入場場館選擇器（兩館皆可入場；選定後 QR 依此館產生，須至同館掃碼）。QR 已產生後不顯示。
  const GymSelector = () => {
    if (step === 'qr') return null;
    return (
    <div style={{ padding:'14px 20px 0' }}>
      <div style={{ fontSize:11, color:'#999', marginBottom:6 }}>{t('選擇入場場館')}</div>
      <div style={{ display:'flex', gap:8 }}>
        {[{ id:'gym-hsinchu', name:t('新竹館') }, { id:'gym-shilin', name:t('士林館') }].map(g => {
          const active = gymId === g.id;
          return (
            <button key={g.id} type="button" onClick={() => changeGym(g.id)}
              style={{ flex:1, height:38, borderRadius:10, border:`1.5px solid ${active?'#8B1A1A':'#E8D5D5'}`, background: active?'#8B1A1A':'#fff', color: active?'#fff':'#666', fontSize:14, fontWeight: active?600:400, cursor:'pointer' }}>
              {g.name}
            </button>
          );
        })}
      </div>
    </div>
    );
  };

  // 入場人員選擇器（僅當帳號底下有子會員時顯示）
  const MemberSelector = () => {
    if (!member || children.length === 0) return null;
    return (
      <div style={{ padding:'14px 20px 0' }}>
        <div style={{ fontSize:11, color:'#999', marginBottom:6 }}>{t('選擇入場人員')}</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {[member, ...children].map(m => {
            const active = entrant?.id === m.id;
            const isChild = m.id !== member.id;
            const selfDisabled = !isChild && member?.selfEntrySkipped; // 本人不入場 → 反白不可選
            return (
              <button key={m.id} type="button" disabled={selfDisabled}
                onClick={() => { if (!active && !selfDisabled) setTargetId(isChild ? m.id : null); }}
                style={{ height:34, padding:'0 14px', borderRadius:18, border:`1.5px solid ${active?'#8B1A1A':'#E8D5D5'}`, background: active?'#8B1A1A':'#fff', color: selfDisabled?'#bbb':(active?'#fff':'#666'), fontSize:13, fontWeight: active?600:400, cursor: selfDisabled?'not-allowed':'pointer', opacity: selfDisabled?0.55:1 }}>
                {m.name}{isChild ? t('（子）') : (selfDisabled ? t('（本人不入場）') : '')}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // 快速入場無法使用（身分／票卡用罄、資格變更、付款方式停用、產生失敗）：提示原因，讓會員重新選擇
  if (step === 'quick_warn') {
    const goManual = () => {
      setQuickWarn(null);
      if (verifyResult?.freeEntry) {
        setSelectedEntry({ type: verifyResult.entryType, freeEntry: true, passId: verifyResult.pass?.id });
        setStep('shoes');
      } else {
        setStep('select_entry');
      }
    };
    return wrap(
      <>
        <Header title={t('快速入場')} onBack={() => navigate('/member/home')} />
        <div style={{ padding:20 }}>
          <div style={{ background:'#FFF8E6', border:'1px solid #F5D87A', borderRadius:12, padding:20, textAlign:'left' }}>
            <div style={{ fontSize:32, textAlign:'center', marginBottom:8 }}>⚠️</div>
            <div style={{ fontWeight:600, fontSize:15, color:'#8B6914', marginBottom:8, textAlign:'center' }}>{t('無法使用快速入場')}</div>
            <div style={{ fontSize:13, color:'#8B6914', lineHeight:1.7 }}>{quickWarn}</div>
            <div style={{ fontSize:12, color:'#999', marginTop:10 }}>{t('請重新選擇入場方式；完成後會自動記住新的選擇。')}</div>
          </div>
          <button onClick={goManual}
            style={{ width:'100%', marginTop:16, height:46, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>
            {t('重新選擇入場方式')}
          </button>
          <button onClick={() => { clearQuickEntry(member.id, isChildTarget ? entrant.id : member.id); navigate('/member/home'); }}
            style={{ width:'100%', marginTop:10, height:40, borderRadius:10, background:'#fff', color:'#999', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer' }}>
            {t('清除快速入場設定')}
          </button>
        </div>
      </>
    );
  }

  if (step === 'loading') return wrap(
    <>
      <Header title={t('入場 QR Code')} onBack={() => navigate('/member/home')} />
      <GymSelector /><MemberSelector />
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:60, gap:16 }}>
        <div style={{ fontSize:32 }}>⏳</div>
        <div style={{ fontSize:14, color:'#999' }}>{quickGenRef.current ? t('快速入場：產生 QR 中...') : t('驗票中...')}</div>
      </div>
    </>
  );






















  if (step === 'blocked') {
    const isAlreadyIn = verifyResult?.reason === 'already_checked_in';
    const needsWaiver = verifyResult?.reason === 'waiver_required';
    const pendingParent = verifyResult?.reason === 'parent_waiver_pending';
    const netFail = verifyFailed && !verifyResult; // 驗票請求失敗（非資格不符）
    return wrap(
      <>
        <Header title={t('入場 QR Code')} onBack={() => navigate('/member/home')} />
        <GymSelector /><MemberSelector />
        <div style={{ padding:20 }}>
          <div style={{ background: isAlreadyIn ? '#E6F4EB' : '#FCEBEB', borderRadius:12, border: `0.5px solid ${isAlreadyIn ? '#B3DEC0' : '#F09595'}`, padding:24, textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>{isAlreadyIn ? '✅' : netFail ? '⚠️' : pendingParent ? '📧' : '🚫'}</div>
            <div style={{ fontWeight:600, fontSize:16, color: isAlreadyIn ? '#2D7D46' : '#A32D2D', marginBottom:8 }}>
              {isAlreadyIn ? t('今日已完成入場') :
               netFail ? t('驗票失敗') :
               needsWaiver ? t('Waiver 尚未完成') :
               pendingParent ? t('等待法定代理人簽署') :
               verifyResult?.reason === 'fall_test_required' ? t('尚未通過墜落測驗') :
               verifyResult?.reason === 'fall_test_expired' ? t('墜落測驗已到期') : t('無法入場')}
            </div>
            <div style={{ fontSize:13, color: isAlreadyIn ? '#2D7D46' : '#A32D2D', opacity:.8, textAlign:'left' }}>
              {isAlreadyIn ? verifyResult?.message :
               netFail ? t('連線逾時或網路不穩，並非無法入場。請按「重新驗票」再試一次；若一直失敗請洽服務台。') :
               needsWaiver ? t('請先完成 Waiver 風險安全聲明書簽署，才能入場') :
               verifyResult?.reason === 'parent_waiver_pending' ? t('已送出，等待法定代理人完成線上簽署') :
               verifyResult?.reason === 'fall_test_required' ? t('請先至服務台完成安全墜落測驗同意書簽署及墜落測驗') :
               verifyResult?.reason === 'fall_test_expired' ? t('墜落測驗已到期，請至服務台重新進行測驗') :
               verifyResult?.message || t('請聯絡服務台')}
            </div>
          </div>
          {needsWaiver ? (
            <button onClick={() => navigate(isChildTarget ? `/member/waiver?forChild=${entrant.id}&childName=${encodeURIComponent(entrant.name)}` : '/member/waiver')}
              style={{ width:'100%', marginTop:16, height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
              {t('前往簽署 Waiver')}
            </button>
          ) : pendingParent ? (
            <button onClick={() => navigate('/member/waiver')}
              style={{ width:'100%', marginTop:16, height:44, borderRadius:10, background:'#fff', color:'#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:14, fontWeight:500, cursor:'pointer' }}>
              {t('查看簽署狀態 / 重新發送連結')}
            </button>
          ) : (verifyResult?.reason === 'fall_test_required' || verifyResult?.reason === 'fall_test_expired') ? (
            <button onClick={() => navigate(isChildTarget ? `/member/fall-test?forChild=${entrant.id}&childName=${encodeURIComponent(entrant.name)}` : '/member/fall-test')}
              style={{ width:'100%', marginTop:16, height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
              {t('前往墜落測驗同意書')}
            </button>
          ) : (
            <button onClick={doVerify}
              style={{ width:'100%', marginTop:16, height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:500, cursor:'pointer' }}>
              {t('重新驗票')}
            </button>
          )}
        </div>
      </>
    );
  }

  // 第一段：選身分（入場類型）
  if (step === 'select_entry') {
    const types = verifyResult?.entryTypeOptions || [];
    return wrap(
      <>
        <Header title={t('選擇身分')} onBack={() => navigate('/member/home')} />
        <GymSelector /><MemberSelector />
        <div style={{ padding:20 }}>
          {verifyResult?.member?.isTeamMember && (
            <div style={{ background:'#E6F1FB', border:'0.5px solid #B5D4F4', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#185FA5' }}>
              {t('🏅 隊員身份：NT$100 以上消費享九折優惠')}
            </div>
          )}
          <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>{t('請選擇入場身分')}</div>
          {types.map(opt => (
            <div key={opt.type}
              onClick={() => { setSelectedType(opt); setStep('select_method'); }}
              style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'14px 16px', marginBottom:10, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:600, fontSize:14, color:'#1a1a1a' }}>{t(entryIdLabel(opt))}</div>
              <div style={{ fontSize:18, color:'#ccc' }}>›</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // 第二段：選擇付款方式 / 票券（已選身分後）
  if (step === 'select_method') {
    const st = selectedType || {};
    const inst = verifyResult?.instruments || {};
    const methods = buildMethods(st, inst, t);
    // 未滿 13 歲（兒童，以出生日期判定）不可購買優惠券／定期票（友善提示，後端仍為權威）
    const entrantIsChild = isChild(entrant);
    if (!entrantIsChild && inst.buyDiscountCard?.available) methods.push({ kind:'buy', type:'buy_discount_card', label:t('購買優惠折扣券入場'), note:t('含本次入場＋10次八折＋紅利'), price:inst.buyDiscountCard.price, discountedPrice:inst.buyDiscountCard.price, freeEntry:false, requiresPayment:true });
    // 購買新定期票入場改為下拉選單（單館票僅該館可買，QR 綁該館）
    const buyPassTypes = (!entrantIsChild && inst.buyPass?.available) ? (inst.buyPass.passTypes || []) : [];
    const pickBuyPass = (id) => {
      const pt = buyPassTypes.find(p => p.id === id);
      if (!pt) return;
      const dur = pt.durationMonths ? `${pt.durationMonths} ${t('個月')}` : pt.durationDays ? `${pt.durationDays} ${t('天')}` : '';
      const scopeLabel = pt.scope === 'shared' ? t('雙館通用') : t('單館');
      setBuyPassPlan('full');
      setSelectedEntry({ kind:'buyPass', type:'buy_pass', buyPassTypeId:pt.id, baseEntryType:st.type,
        label:`${t('購買定期票')}：${pt.name}`, note:[dur, scopeLabel].filter(Boolean).join('・'),
        price:pt.price, discountedPrice:pt.price, freeEntry:false, requiresPayment:true,
        installment:pt.installment || null,
        // 供「定期票服務同意書」條款檢閱步驟顯示用（PassContractReview）
        passTypeName: pt.name, passScope: pt.scope, passTargetGymId: pt.targetGymId || null,
        passDurationMonths: pt.durationMonths || null, passDurationDays: pt.durationDays || null });
      setSelectedPayment(null);
      setStep('shoes'); // 先問租借器材，付費方式改到租借之後
    };
    return wrap(
      <>
        <Header title={t('選擇入場方案')} onBack={() => setStep('select_entry')} />
        <GymSelector /><MemberSelector />
        <div style={{ padding:20 }}>
          <div style={{ fontSize:13, color:'#666', marginBottom:4 }}>{t('身分：')}<b>{t(st.label)}</b></div>
          <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>{t('請選擇入場方案或使用票券')}</div>
          {methods.map(m => (
            <div key={m.kind}
              onClick={() => {
                const cardId = m.cards && m.cards.length === 1 ? m.cards[0].id : (m.cards && m.cards.length ? m.cards[0].id : null);
                setPartnerVendor(false); // 換方式時重置特約勾選
                setSelectedPayment(null);
                setSelectedEntry({ ...m, baseEntryType: m.baseEntryType || m.type, cardId });
                setStep('shoes'); // 先問租借器材，付費方式改到租借之後
              }}
              style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'14px 16px', marginBottom:10, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:14, color:'#1a1a1a', textAlign:'left' }}>{t(m.label)}</div>
                {m.note && <div style={{ fontSize:11, color:'#999', marginTop:3 }}>{m.note}</div>}
                {(m.cards?.length > 0) && <div style={{ fontSize:11, color:'#185FA5', marginTop:3 }}>{tt(`共 ${m.cards.length} 張可用`, `${m.cards.length} available`, `${m.cards.length}枚利用可能`)}</div>}
              </div>
              <div style={{ textAlign:'right' }}>
                {m.freeEntry ? (
                  <span style={{ fontSize:12, color:'#2D7D46', fontWeight:600 }}>{t('免費')}</span>
                ) : m.discountedPrice !== undefined && m.discountedPrice < m.price ? (
                  <div>
                    <div style={{ fontSize:11, color:'#999', textDecoration:'line-through' }}>NT${m.price}</div>
                    <div style={{ fontSize:16, fontWeight:700, color:'#8B1A1A' }}>NT${m.discountedPrice}</div>
                  </div>
                ) : (
                  <div style={{ fontSize:16, fontWeight:700, color:'#8B1A1A' }}>NT${m.discountedPrice ?? m.price}</div>
                )}
                <span style={{ fontSize:18, color:'#ccc', marginLeft:8 }}>›</span>
              </div>
            </div>
          ))}
          {buyPassTypes.length > 0 && (
            <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'14px 16px', marginBottom:10 }}>
              <div style={{ fontWeight:600, fontSize:14, color:'#1a1a1a', textAlign:'left', marginBottom:8 }}>{t('購買定期票入場')}</div>
              <select defaultValue="" onChange={e => pickBuyPass(e.target.value)}
                style={{ width:'100%', height:44, borderRadius:10, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:14, background:'#FBF5F5', color:'#1a1a1a', appearance:'auto' }}>
                <option value="" disabled>{t('請選擇定期票方案…')}</option>
                {buyPassTypes.map(pt => {
                  const dur = pt.durationMonths ? `${pt.durationMonths}${tt('個月', ' mo', 'ヶ月')}` : pt.durationDays ? `${pt.durationDays}${tt('天', ' days', '日')}` : '';
                  const scopeLabel = pt.scope === 'shared' ? t('雙館') : t('單館');
                  const canInst = pt.installment?.enabled ? ` · ${t('可分期')}` : '';
                  return <option key={pt.id} value={pt.id}>{pt.name}（{[dur, scopeLabel].filter(Boolean).join('・')}）NT${pt.price}{canInst}</option>;
                })}
              </select>
            </div>
          )}
        </div>
      </>
    );
  }

  if (step === 'select_payment') {
   const pvDiscount = verifyResult?.partnerVendorDiscount || 20;
   const pgmRate = verifyResult?.partnerGymMemberRate || 0.9;
   const pvEligible = selectedEntry?.kind === 'pay' && selectedEntry?.partnerVendorEligible === true && !selectedEntry?.freeEntry;
   const pgmEligible = selectedEntry?.kind === 'pay' && selectedEntry?.partnerGymMemberEligible === true && !selectedEntry?.freeEntry;
   const basePayPrice = selectedEntry?.discountedPrice ?? selectedEntry?.price ?? 0;
   const _pgmOn = pgmEligible && partnerGymMember;
   const _pvOn = !_pgmOn && pvEligible && partnerVendor;
   const pvShownPrice = _pgmOn ? Math.round(basePayPrice * pgmRate) : (basePayPrice - (_pvOn ? pvDiscount : 0));
   return wrap(
    <>
      <Header title={t('選擇付款方式')} onBack={() => setStep('shoes')} />
      <GymSelector /><MemberSelector />
      <div style={{ padding:20 }}>
        <div style={{ background:'#FBF5F5', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13 }}>
          <div style={{ color:'#999', marginBottom:4 }}>{t('入場方式')}</div>
          <div style={{ fontWeight:600 }}>{t(selectedEntry?.label)}</div>
          {(selectedEntry?.discountedPrice !== undefined || selectedEntry?.price > 0) && (
            <div style={{ color:'#8B1A1A', fontWeight:700, fontSize:16, marginTop:4 }}>NT${pvShownPrice}</div>
          )}
          {(rentShoes || rentChalk) && (
            <div style={{ fontSize:12, color:'#666', marginTop:6 }}>
              {tt('＋租借器材 NT$', '+ Rental gear NT$', '＋レンタル器材 NT$')}{(rentShoes?100:0)+(rentChalk?50:0)}（{[rentShoes&&tt('岩鞋','shoes','シューズ'),rentChalk&&tt('粉袋','chalk bag','チョークバッグ')].filter(Boolean).join(tt('、', ' and ', '・'))}）
            </div>
          )}
        </div>
        {/* 友館隊員優惠（全票/學生票、非隊員、非票券）：勾選 9折，需櫃檯出示友館隊員證明；與特約廠商互斥；金額後端權威 */}
        {pgmEligible && (
          <div onClick={() => { setPartnerGymMember(v => !v); setPartnerVendor(false); }}
            style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', marginBottom:12, borderRadius:12, border:`1.5px solid ${partnerGymMember?'#8B1A1A':'#E8D5D5'}`, background: partnerGymMember?'#FBF5F5':'#fff', cursor:'pointer' }}>
            <div style={{ width:22, height:22, borderRadius:6, border:`1.5px solid ${partnerGymMember?'#8B1A1A':'#ccc'}`, background:partnerGymMember?'#8B1A1A':'#fff', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', marginTop:1 }}>
              {partnerGymMember && <CheckTick color="#fff" size={11} />}
            </div>
            <div style={{ flex:1, textAlign:'left' }}>
              <div style={{ fontWeight:600, fontSize:14, color:'#1a1a1a' }}>{tt(`友館隊員優惠（${(pgmRate*10).toFixed(pgmRate*10%1?1:0)}折）`, `Partner-gym athlete (${Math.round(pgmRate*100)}% off)`, `提携ジームチーム会員優惠（${Math.round(pgmRate*100)}%）`)}</div>
              <div style={{ fontSize:11.5, color:'#999', marginTop:3 }}>{tt('需於櫃檯出示友館隊員證明核對，未出示或不符將以原價計。', 'Show partner-gym athlete proof at counter; otherwise full price.', 'フロントで提携ジームの会員証をご提示ください。提示がない場合は通常料金となります。')}</div>
            </div>
          </div>
        )}
        {/* 特約廠商優惠（全票/學生票、非隊員、非票券）：勾選 −NT$20，需櫃檯出示證件；金額後端權威 */}
        {pvEligible && (
          <div onClick={() => { setPartnerVendor(v => !v); setPartnerGymMember(false); }}
            style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', marginBottom:16, borderRadius:12, border:`1.5px solid ${partnerVendor?'#8B1A1A':'#E8D5D5'}`, background: partnerVendor?'#FBF5F5':'#fff', cursor:'pointer' }}>
            <div style={{ width:22, height:22, borderRadius:6, border:`1.5px solid ${partnerVendor?'#8B1A1A':'#ccc'}`, background:partnerVendor?'#8B1A1A':'#fff', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', marginTop:1 }}>
              {partnerVendor && <CheckTick color="#fff" size={11} />}
            </div>
            <div style={{ flex:1, textAlign:'left' }}>
              <div style={{ fontWeight:600, fontSize:14, color:'#1a1a1a' }}>{tt(`特約廠商優惠（−NT$${pvDiscount}）`, `Partner discount (−NT$${pvDiscount})`, `提携業者割引（−NT$${pvDiscount}）`)}</div>
              <div style={{ fontSize:11.5, color:'#999', marginTop:3 }}>{t('需於櫃檯出示特約廠商證件核對，未出示或不符將以原價計。')}</div>
            </div>
          </div>
        )}
        {selectedEntry?.type === 'buy_pass' && selectedEntry?.installment?.enabled && (
          <PaymentPlanChoice installment={selectedEntry.installment} price={selectedEntry.price}
            plan={buyPassPlan} hideMethod onChange={({ plan }) => setBuyPassPlan(plan)} />
        )}
        <div style={{ fontSize:13, color:'#666', marginBottom:12 }}>
          {selectedEntry?.type === 'buy_pass' && buyPassPlan === 'installment' ? t('請選擇「頭款（第一期）」付款方式') : t('請選擇付款方式')}
        </div>
        <div style={{ fontSize:12, color:'#999', marginBottom:10, textAlign:'left' }}>
          {t('選擇 LinePay／台灣Pay／街口支付皆需至櫃檯掃描店內立牌條碼付款。')}
        </div>
        <PaymentSection
          value={{ method: selectedPayment }}
          methods={['cash','linepay','jkopay','taiwanpay']}
          variant="list"
          showLabel={false}
          disabled={loading}
          t={t}
          onChange={v => setSelectedPayment(v.method)}
          onSelect={key => handleGenerateQR(rentShoes, rentChalk, key)}
        />
        {error && <div style={{ marginTop:10, fontSize:12, color:'#A32D2D', background:'#FCEBEB', borderRadius:8, padding:'8px 12px' }}>{error}</div>}
      </div>
    </>
   );
  }

  if (step === 'shoes') return wrap(
    <>
      <Header title={t('租借器材')} onBack={() => {
        if (selectedType) setStep('select_method');
        else doVerify();
      }} />
      <GymSelector /><MemberSelector />
      <div style={{ padding:20 }}>
        {/* 續約（定期票到期前14天）*/}
        {renewal && (
          <div style={{ background:'#fff', borderRadius:16, border:`1.5px solid ${renewOptIn?'#8B1A1A':'#E8D5D5'}`, padding:20, marginBottom:16 }}>
            <div style={{ fontWeight:600, fontSize:15, marginBottom:4 }}>{t('🎫 定期票即將到期')}</div>
            <div style={{ fontSize:12, color:'#999', marginBottom:14 }}>
              {renewal.passTypeName}{tt(`・剩 ${renewal.daysLeft} 天（${renewal.currentEndDate} 到期）`, ` · ${renewal.daysLeft} days left (expires ${renewal.currentEndDate})`, `・残り${renewal.daysLeft}日（${renewal.currentEndDate} 期限）`)}
            </div>
            <div onClick={() => setRenewOptIn(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, border:`1.5px solid ${renewOptIn?'#8B1A1A':'#E8D5D5'}`, background: renewOptIn?'#FBF5F5':'#fff', cursor:'pointer' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14 }}>{tt(`順便續約（延長至 ${renewal.newEndDate}）`, `Renew now (extend to ${renewal.newEndDate})`, `更新する（${renewal.newEndDate}まで延長）`)}</div>
                <div style={{ fontSize:13, marginTop:2 }}>
                  {renewal.renewalPrice < renewal.fullPrice && (
                    <span style={{ color:'#bbb', textDecoration:'line-through', marginRight:6 }}>NT${renewal.fullPrice.toLocaleString()}</span>
                  )}
                  <span style={{ color:'#8B1A1A', fontWeight:700 }}>NT${renewal.renewalPrice.toLocaleString()}</span>
                  {renewal.renewalDiscount && <span style={{ fontSize:11, color:'#A32D2D', marginLeft:6 }}>{t('續約優惠')}</span>}
                </div>
              </div>
              <div style={{ width:24, height:24, borderRadius:12, border:`2px solid ${renewOptIn?'#8B1A1A':'#ccc'}`, background: renewOptIn?'#8B1A1A':'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {renewOptIn && <CheckTick color="#fff" size={11} />}
              </div>
            </div>
            {renewOptIn && renewInstEnabled && (
              <div style={{ display:'flex', gap:10, marginTop:12 }}>
                {[{ k:'full', t:t('一次付清'), s:`NT$${renewal.renewalPrice.toLocaleString()}` },
                  { k:'installment', t:tt(`分期 ${renewal.installment.periods.length} 期`, `${renewal.installment.periods.length} installments`, `${renewal.installment.periods.length}回分割`), s:tt(`首期 NT$${(renewPeriods[0]||0).toLocaleString()}`, `1st NT$${(renewPeriods[0]||0).toLocaleString()}`, `第1回 NT$${(renewPeriods[0]||0).toLocaleString()}`) }].map(o => (
                  <div key={o.k} onClick={() => setRenewPlan(o.k)}
                    style={{ flex:1, padding:'10px 12px', borderRadius:10, border:`1.5px solid ${renewPlan===o.k?'#8B1A1A':'#E8D5D5'}`, background: renewPlan===o.k?'#FBF5F5':'#fff', cursor:'pointer', textAlign:'center' }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{o.t}</div>
                    <div style={{ fontSize:12, color:'#8B1A1A', marginTop:2 }}>{o.s}</div>
                  </div>
                ))}
              </div>
            )}
            {renewOptIn && (
              <div style={{ marginTop:12 }}>
                <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>
                  {renewPlan === 'installment' ? t('續約頭款（第一期）付款方式') : t('續約付款方式')}
                </div>
                <PaymentSection
                  value={{ method: selectedPayment }}
                  methods={['cash','linepay','jkopay','taiwanpay']}
                  variant="pill"
                  showLabel={false}
                  t={t}
                  onChange={v => setSelectedPayment(v.method)}
                />
              </div>
            )}
          </div>
        )}
        <div style={{ background:'#fff', borderRadius:16, border:'0.5px solid #E8D5D5', padding:24 }}>
          <div style={{ fontWeight:600, fontSize:17, marginBottom:20, textAlign:'center' }}>{t('需要租借器材嗎？')}</div>
          {/* 岩鞋 */}
          <div onClick={() => setRentShoes(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:12, border:`1.5px solid ${rentShoes?'#8B1A1A':'#E8D5D5'}`, background: rentShoes?'#FBF5F5':'#fff', marginBottom:12, cursor:'pointer' }}>
            <img src="/climbing-shoe.webp" alt="岩鞋" style={{ width:36, height:36, objectFit:"contain" }} />
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:15 }}>{t('岩鞋租借')}</div>
              <div style={{ fontSize:13, color:'#999' }}>NT$100</div>
            </div>
            <div style={{ width:24, height:24, borderRadius:12, border:`2px solid ${rentShoes?'#8B1A1A':'#ccc'}`, background: rentShoes?'#8B1A1A':'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {rentShoes && <CheckTick color="#fff" size={11} />}
            </div>
          </div>
          {/* 粉袋 */}
          <div onClick={() => setRentChalk(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:12, border:`1.5px solid ${rentChalk?'#8B1A1A':'#E8D5D5'}`, background: rentChalk?'#FBF5F5':'#fff', marginBottom:12, cursor:'pointer' }}>
            <img src="/chalk-bag.webp" alt="粉袋" style={{ width:36, height:36, objectFit:"contain", borderRadius:4 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:15 }}>{t('粉袋租借')}</div>
              <div style={{ fontSize:13, color:'#999' }}>NT$50</div>
            </div>
            <div style={{ width:24, height:24, borderRadius:12, border:`2px solid ${rentChalk?'#8B1A1A':'#ccc'}`, background: rentChalk?'#8B1A1A':'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {rentChalk && <CheckTick color="#fff" size={11} />}
            </div>
          </div>
          {/* 都不需要 */}
          <div onClick={() => { setRentShoes(false); setRentChalk(false); }}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:12, border:`1.5px solid ${(!rentShoes && !rentChalk)?'#8B1A1A':'#E8D5D5'}`, background: (!rentShoes && !rentChalk)?'#FBF5F5':'#fff', marginBottom:24, cursor:'pointer' }}>
            <div style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-ban" style={{ fontSize:28, color:(!rentShoes && !rentChalk)?'#8B1A1A':'#bbb' }} aria-hidden="true" />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:15 }}>{t('都不需要')}</div>
              <div style={{ fontSize:13, color:'#999' }}>{t('不租借任何器材')}</div>
            </div>
            <div style={{ width:24, height:24, borderRadius:12, border:`2px solid ${(!rentShoes && !rentChalk)?'#8B1A1A':'#ccc'}`, background: (!rentShoes && !rentChalk)?'#8B1A1A':'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {(!rentShoes && !rentChalk) && <CheckTick color="#fff" size={11} />}
            </div>
          </div>
          {/* 免費入場但有加租器材 → 選租借付款方式（不再一律現金）*/}
          {selectedEntry?.freeEntry && (rentShoes || rentChalk) && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>{t('租借付款方式')}</div>
              <PaymentSection
                value={{ method: selectedPayment }}
                methods={['cash','linepay','jkopay','taiwanpay']}
                variant="pill"
                showLabel={false}
                t={t}
                onChange={v => setSelectedPayment(v.method)}
              />
            </div>
          )}
          {/* 快速入場：記住這次的選擇（購買定期票/優惠券、友館特約優惠、續約不記） */}
          {(!selectedEntry?.buyPassTypeId && !partnerVendor && !partnerGymMember && !renewOptIn) && (
            <div onClick={() => setRememberQuick(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, cursor:'pointer', textAlign:'left' }}>
              <div style={{ width:20, height:20, borderRadius:5, border:`1.5px solid ${rememberQuick?'#8B1A1A':'#ccc'}`, background:rememberQuick?'#8B1A1A':'#fff', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {rememberQuick && <CheckTick color="#fff" size={10} />}
              </div>
              <div style={{ fontSize:13, color:'#555' }}>{t('記住這次的選擇，下次用首頁「快速入場」一鍵產生 QR')}</div>
            </div>
          )}
          {error && <div style={{ marginBottom:12, fontSize:12, color:'#A32D2D', background:'#FCEBEB', borderRadius:8, padding:'8px 12px' }}>{error}</div>}
          {(() => {
            // 付費入場（一般付款/優惠券/購券/購定期票）：租借選完 → 下一步「選擇付款方式」
            const needsMainPayment = selectedEntry?.requiresPayment && !selectedEntry?.freeEntry;
            if (needsMainPayment) {
              return (
                <button onClick={() => setStep(selectedEntry?.type === 'buy_pass' ? 'pass_contract' : 'select_payment')} disabled={loading}
                  style={{ width:'100%', height:50, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:16, fontWeight:600, cursor:'pointer' }}>
                  {selectedEntry?.type === 'buy_pass' ? t('下一步：合約條款 →') : t('下一步：選擇付款方式 →')}
                </button>
              );
            }
            // 免費入場（含加租器材 / 續約）：需先選租借/續約付款方式後才可產生 QR
            const needPay = (renewOptIn || (selectedEntry?.freeEntry && (rentShoes || rentChalk))) && !selectedPayment;
            return (<>
              {needPay && (
                <div style={{ marginBottom:12, fontSize:12, color:'#A32D2D', textAlign:'center' }}>
                  {tt(`請先選擇${renewOptIn ? '續約' : '租借'}付款方式`, `Please select ${renewOptIn ? 'renewal' : 'rental'} payment method first`, `先に${renewOptIn ? '更新' : 'レンタル'}のお支払い方法を選択してください`)}
                </div>
              )}
              <button onClick={() => handleGenerateQR(rentShoes, rentChalk)} disabled={loading || needPay}
                style={{ width:'100%', height:50, borderRadius:12, background: needPay ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:16, fontWeight:600, cursor: needPay ? 'not-allowed' : 'pointer' }}>
                {loading ? '...' : `${t('確認')}${(renewDueNow + (rentShoes?100:0) + (rentChalk?50:0)) > 0 ? `（+NT$${(renewDueNow + (rentShoes?100:0)+(rentChalk?50:0)).toLocaleString()}）` : ''}`}
              </button>
            </>);
          })()}
        </div>
      </div>
    </>
  );

  // 定期票服務同意書（合約）條款檢閱＋簽名——僅 buy_pass（入場當下購買定期票）適用，插在
  // 租借器材與選擇付款方式之間；離開此步驟時把簽名資料存進 passContractData（元件會 unmount）。
  if (step === 'pass_contract') {
    const bpDur = selectedEntry?.passDurationMonths
      ? dayjs().add(selectedEntry.passDurationMonths, 'month')
      : (selectedEntry?.passDurationDays ? dayjs().add(selectedEntry.passDurationDays, 'day') : null);
    const bpStart = dayjs().format('YYYY-MM-DD');
    const bpEnd = bpDur ? bpDur.format('YYYY-MM-DD') : '';
    const entrantIsMinor = isMinor(entrant);
    return wrap(
      <>
        <Header title={t('合約條款')} onBack={() => setStep('shoes')} />
        <div style={{ padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, border:'0.5px solid #E8D5D5', padding:24 }}>
            <PassContractReview
              ref={passContractRef}
              gymId={gymId}
              passTypeName={selectedEntry?.passTypeName}
              scope={selectedEntry?.passScope}
              targetGymId={selectedEntry?.passTargetGymId}
              startDate={bpStart}
              endDate={bpEnd}
              totalFee={selectedEntry?.price}
              installmentPeriods={buyPassPlan === 'installment' ? selectedEntry?.installment?.periods : null}
              isMinor={entrantIsMinor}
              t={t}
            />
            {passContractErr && (
              <div style={{ marginBottom:12, fontSize:12, color:'#A32D2D', background:'#FCEBEB', borderRadius:8, padding:'8px 12px', textAlign:'left' }}>
                {t('請詳閱並勾選同意，並完成簽名後才能繼續')}
              </div>
            )}
            <button onClick={() => {
              if (!passContractRef.current?.isValid()) { setPassContractErr(true); return; }
              setPassContractErr(false);
              setPassContractData(passContractRef.current.getData());
              setStep('select_payment');
            }} style={{ width:'100%', height:50, borderRadius:12, background:'#8B1A1A', color:'#fff', border:'none', fontSize:16, fontWeight:600, cursor:'pointer' }}>
              {t('確認並繼續 →')}
            </button>
          </div>
        </div>
      </>
    );
  }

  if (step === 'qr') {
    // 分期購定期票：本次只收「第一期（頭款）」，合計顯示頭款而非全額（與後端一致）
    const bpInst = selectedEntry?.type === 'buy_pass' && buyPassPlan === 'installment'
      && (selectedEntry?.installment?.periods?.length >= 2);
    const firstPeriod = bpInst
      ? Math.round((selectedEntry.price || 0) * (Number(selectedEntry.installment.periods[0].percent) || 0) / 100)
      : null;
    const pgmActive = selectedEntry?.kind === 'pay' && selectedEntry?.partnerGymMemberEligible === true && partnerGymMember && !selectedEntry?.freeEntry;
    const pgmRate = verifyResult?.partnerGymMemberRate || 0.9;
    const pvActive = !pgmActive && selectedEntry?.kind === 'pay' && selectedEntry?.partnerVendorEligible === true && partnerVendor && !selectedEntry?.freeEntry;
    const pvCut = pvActive ? (verifyResult?.partnerVendorDiscount || 20) : 0;
    const _qbase = selectedEntry?.discountedPrice ?? selectedEntry?.price ?? 0;
    const entryPrice = selectedEntry?.freeEntry ? 0 : (bpInst ? firstPeriod : (pgmActive ? Math.round(_qbase * pgmRate) : Math.max(0, _qbase - pvCut)));
    const totalAmount = entryPrice + (rentShoes ? 100 : 0) + (rentChalk ? 50 : 0) + renewDueNow;
    const minutesLeft = qrExpiry ? Math.max(0, dayjs(qrExpiry).diff(dayjs(), 'minute')) : 0;
    return wrap(
      <>
        <Header title={t('入場 QR Code')} onBack={() => navigate('/member/home')} />
        <GymSelector /><MemberSelector />
        <div style={{ padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, border:'0.5px solid #E8D5D5', padding:24, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,.06)' }}>
            <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontWeight:700, fontSize:16, color:'#8B1A1A', marginBottom:16 }}>RedRock</div>
            {qrDataUrl && <img src={qrDataUrl} alt="QR Code" style={{ width:220, height:220, borderRadius:10 }} />}
            <div style={{ marginTop:16 }}>
              <div style={{ fontWeight:600, fontSize:18 }}>{entrant?.name}</div>
              <div style={{ fontSize:12, color:'#999', marginTop:3 }}>{selectedType?.label ? `${t(selectedType.label)}・${t(selectedEntry?.label) || ''}` : (t(selectedEntry?.label) || t(ENTRY_TYPE_LABEL[selectedEntry?.type]) || selectedEntry?.type)}</div>
            </div>
            <div style={{ marginTop:16, padding:'12px 0', borderTop:'0.5px solid #E8D5D5', fontSize:13 }}>
              {entryPrice > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ color:'#666' }}>{selectedEntry?.type === 'buy_discount_card' ? t('折扣優惠券') : selectedEntry?.type === 'buy_pass' ? (bpInst ? t('定期票（頭款・第1期）') : t('定期票')) : (pgmActive ? tt(`入場費（友館隊員 ${(pgmRate*10).toFixed(pgmRate*10%1?1:0)}折）`, `Entry Fee (partner-gym ${Math.round(pgmRate*100)}%)`, `入場料（提携ジーム ${Math.round(pgmRate*100)}%）`) : (pvActive ? tt(`入場費（特約 −${pvCut}）`, `Entry Fee (partner −${pvCut})`, `入場料（提携 −${pvCut}）`) : t('入場費')))}</span>
                  <span>NT${entryPrice}</span>
                </div>
              )}
              {bpInst && (
                <div style={{ fontSize:11, color:'#999', textAlign:'right', marginBottom:6, marginTop:-2 }}>
                  {tt(`分期 ${selectedEntry.installment.periods.length} 期 · 全額 NT$${(selectedEntry.price || 0).toLocaleString()}`, `${selectedEntry.installment.periods.length} installments · Full NT$${(selectedEntry.price || 0).toLocaleString()}`, `${selectedEntry.installment.periods.length}回分割・全額 NT$${(selectedEntry.price || 0).toLocaleString()}`)}
                </div>
              )}
              {renewOptIn && renewal && (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ color:'#666' }}>{t('定期票續約')}{renewPlan === 'installment' ? t('（頭款・第1期）') : ''}</span>
                    <span>NT${renewDueNow.toLocaleString()}</span>
                  </div>
                  {renewPlan === 'installment' && renewPeriods.length >= 2 && (
                    <div style={{ fontSize:11, color:'#999', textAlign:'right', marginBottom:6, marginTop:-2 }}>
                      {tt(`分期 ${renewPeriods.length} 期 · 折後全額 NT$${renewal.renewalPrice.toLocaleString()}（末期 NT$${renewPeriods[renewPeriods.length-1].toLocaleString()}）`, `${renewPeriods.length} installments · Discounted total NT$${renewal.renewalPrice.toLocaleString()} (last NT$${renewPeriods[renewPeriods.length-1].toLocaleString()})`, `${renewPeriods.length}回分割・割引後全額 NT$${renewal.renewalPrice.toLocaleString()}（最終回 NT$${renewPeriods[renewPeriods.length-1].toLocaleString()}）`)}
                    </div>
                  )}
                </>
              )}
              {rentShoes && (
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ color:'#666' }}>{t('岩鞋租借')}</span>
                  <span>NT$100</span>
                </div>
              )}
              {rentChalk && (
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ color:'#666' }}>{t('粉袋租借')}</span>
                  <span>NT$50</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, paddingTop:6, borderTop:'0.5px solid #F5EFEF' }}>
                <span>{t('合計')}</span>
                <span style={{ color:'#8B1A1A', fontSize:16 }}>NT${totalAmount}</span>
              </div>
              {selectedPayment && (
                <div style={{ marginTop:6, fontSize:12, color:'#999' }}>
                  {t('付款方式：')}{t(PAYMENT_METHODS.find(p => p.key === selectedPayment)?.label)}
                </div>
              )}
            </div>
            <div style={{ marginTop:8, fontSize:11, color:'#999' }}>{tt(`⏱ 有效時間剩餘約 ${minutesLeft} 分鐘`, `⏱ Valid for about ${minutesLeft} more minutes`, `⏱ 有効期限まで残り約${minutesLeft}分`)}</div>
          </div>
          {/* 特約廠商 / 學生入場：提醒會員入場時於櫃檯出示證件（櫃檯員工端亦有查驗提醒）*/}
          {(pvActive || pgmActive || selectedEntry?.type === 'student_free') && (
            <div style={{ background:'#FEF3E2', border:'1px solid #F0C889', borderRadius:10, padding:'12px 14px', marginTop:14, fontSize:13, color:'#8A5A00', fontWeight:600, display:'flex', gap:8, textAlign:'left', alignItems:'flex-start' }}>
              <span style={{ flexShrink:0 }}>🪪</span>
              <span>{tt(
                `入場時請於櫃檯出示${[selectedEntry?.type === 'student_free' && '學生證', pvActive && '特約廠商證件', pgmActive && '友館隊員證明'].filter(Boolean).join('、')}供核對，未出示或不符將以原價計。`,
                `Please show your ${[selectedEntry?.type === 'student_free' && 'student ID', pvActive && 'partner-company ID', pgmActive && 'partner-gym athlete proof'].filter(Boolean).join(' and ')} at the front desk; full price applies if not presented.`,
                `入場時にフロントで${[selectedEntry?.type === 'student_free' && '学生証', pvActive && '提携業者証明', pgmActive && '提携ジーム会員証明'].filter(Boolean).join('・')}をご提示ください。提示がない場合は通常料金となります。`
              )}</span>
            </div>
          )}
          {/* LinePay / 街口 / 台灣Pay：目前皆無線上金流（街口在真正串接 API 前也走此路徑），需至櫃檯掃描實體立牌付款 */}
          {(selectedPayment === 'linepay' || selectedPayment === 'jkopay' || selectedPayment === 'taiwanpay') && (() => {
            const appName = { linepay: ['LINE App', 'LINE App', 'LINEアプリ'], jkopay: ['街口 App', 'JKOPay App', 'ジェイコペイアプリ'], taiwanpay: ['台灣Pay App', 'Taiwan Pay App', 'Taiwan Payアプリ'] }[selectedPayment];
            return (
              <div style={{ background:'#FEF3E2', border:'1px solid #F0C889', borderRadius:10, padding:'12px 14px', marginTop:14, fontSize:13, color:'#8A5A00', fontWeight:600, display:'flex', gap:8, textAlign:'left', alignItems:'flex-start' }}>
                <span style={{ flexShrink:0 }}>📷</span>
                <span>{tt(
                  `請先出示此入場 QR 供工作人員掃描確認入場，再至櫃檯以${appName[0]}掃描店內立牌 QR 碼完成付款。`,
                  `Please show this entry QR code to staff to confirm entry first, then scan the counter's standee QR code with your ${appName[1]} to pay.`,
                  `まずこの入場QRコードをスタッフにご提示のうえ入場確認を行い、その後カウンターの立て看板QRコードを${appName[2]}でスキャンしてお支払いください。`
                )}</span>
              </div>
            );
          })()}
          {qrClosedReason === 'expired' ? (
            <div style={{ background:'#FCEBEB', border:'0.5px solid #F0C4C4', borderRadius:10, padding:'10px 14px', marginTop:14, fontSize:12, color:'#A32D2D', display:'flex', gap:8 }}>
              <span>⏱</span><span>{t('此 QR Code 已逾時，請按下方「重新產生」。')}</span>
            </div>
          ) : qrClosedReason === 'cancelled' ? (
            <div style={{ background:'#FCEBEB', border:'0.5px solid #F0C4C4', borderRadius:10, padding:'10px 14px', marginTop:14, fontSize:12, color:'#A32D2D', display:'flex', gap:8 }}>
              <span>⚠</span><span>{t('此入場已被取消，請重新產生或洽櫃檯。')}</span>
            </div>
          ) : (
            <div style={{ background:'#E6F1FB', border:'0.5px solid #B5D4F4', borderRadius:10, padding:'10px 14px', marginTop:14, fontSize:12, color:'#185FA5', display:'flex', gap:8 }}>
              <span>💡</span><span>{t('請出示此 QR Code 給工作人員掃描；掃描確認後會')}<b>{t('自動完成入場並跳回首頁')}</b>{t('。')}</span>
            </div>
          )}
          {/* 快速入場產生的 QR：保留「改付款方式並重新產生」（其餘選擇不變，只換付款方式） */}
          {qrFromQuick && ((selectedEntry?.requiresPayment && !selectedEntry?.freeEntry) || selectedPayment) && (
            <button onClick={() => { setQrToken(null); setQrDataUrl(null); setQrExpiry(null); setError(null); setStep('select_payment'); }}
              style={{ width:'100%', marginTop:12, height:44, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>
              {t('更改付款方式並重新產生 QR')}
            </button>
          )}
          <button onClick={doVerify}
            style={{ width:'100%', marginTop:12, height:44, borderRadius:10, background:'#fff', color:'#8B1A1A', border:'0.5px solid #8B1A1A', fontSize:14, fontWeight:500, cursor:'pointer' }}>
            {t('重新產生')}
          </button>
        </div>
      </>
    );
  }

  return null;
}
