import { forwardRef, useState, useRef, useEffect, useImperativeHandle } from 'react';
import SignaturePad from './SignaturePad';
import { memberClient } from '../api/client';
import { GymContractInfoBox, ContractTermsSections } from './ContractTermsSections.jsx';

// 定期票服務同意書（合約）完整條款檢閱＋簽名——比照週課報名的「合約條款」＋「簽名」兩步驟，套用於：
//   ①入場當下購買定期票（MemberQRPage.jsx buy_pass）②我的票券頁線上續約（MemberPassesPage.jsx pass_renewal）
// 場館合約基本資料／合約條款內容皆即時讀取設定頁資料（GET /settings/gym-contracts/member、
// /settings/contract-terms/member），與後端產生 PDF 時讀的是同一份資料來源，兩者自動同步
// （2026-09-07 起條款文字改為設定頁可編輯，二館共用，不再於此硬編）。
// 供 forwardRef 使用：ref.current.isValid() / ref.current.getData()。

const SCOPE_LABEL = { shared: '全館', 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };

function PassContentSummary({ passTypeName, scope, targetGymId, startDate, endDate, totalFee }) {
  const scopeLabel = scope === 'shared' ? SCOPE_LABEL.shared : (SCOPE_LABEL[targetGymId] || '全館');
  const rows = [
    ['1. 票種與會籍費用', `${passTypeName || ''}：NT$${(totalFee || 0).toLocaleString()}`],
    ['2. 使用館別', scopeLabel],
    ['3. 起迄日期', `${startDate || ''} 至 ${endDate || ''} 止`],
    ['4. 使用方式', '本人得於上述效期營業時間內不限次數入場'],
    ['5. 使用限制', '限本人使用'],
  ];
  return (
    <div style={{ background: '#fff', border: '0.5px solid #E8D5D5', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 12, color: '#444', textAlign: 'left' }}>
      {rows.map(([l, v], i) => (<div key={i} style={{ marginTop: i ? 4 : 0 }}><span style={{ color: '#999' }}>{l}：</span>{v}</div>))}
    </div>
  );
}

// 分期購買提示——各期精確金額由後端於實際確認當下才計算（見 checkin/flow.js buildPeriodsFromConfig），
// 前端不重算避免顯示與實際入帳金額有落差；僅告知「有分期」與期數，詳細各期金額於完成後寄送的合約
// PDF 上會有完整「按月逐月繳」期別表（見 contractPdfShared.js paymentBlock）。
function InstallmentNote({ periods }) {
  if (!Array.isArray(periods) || periods.length < 2) return null;
  return (
    <div style={{ background: '#FFF8E6', border: '0.5px solid #F5D87A', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#8B6914', textAlign: 'left' }}>
      本次選擇分期付款（共 {periods.length} 期），各期精確金額與繳款期限將列於完成後寄送之合約 PDF。
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.gymId 場館合約基本資料所屬館別
 * @param {string} props.passTypeName
 * @param {string} props.scope 'shared' 或單館 scope
 * @param {string} [props.targetGymId]
 * @param {string} props.startDate
 * @param {string} props.endDate
 * @param {number} props.totalFee
 * @param {boolean} props.isMinor 持有人是否未成年（決定是否需要法定代理人簽名）
 * @param {Array} [props.installmentPeriods] 選了分期時的期數陣列（僅用於顯示「共 N 期」提示，不重算金額）
 * @param {(s:string)=>string} [props.t] 選填翻譯函式（MemberQRPage.jsx 有 i18n 字典，未傳則原樣顯示中文）
 */
const PassContractReview = forwardRef(function PassContractReview(
  { gymId, passTypeName, scope, targetGymId, startDate, endDate, totalFee, isMinor, installmentPeriods, t = (s) => s },
  ref,
) {
  const [gymContracts, setGymContracts] = useState({});
  const [passTerms, setPassTerms] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const portraitRef = useRef(null);
  const guardianRef = useRef(null);

  useEffect(() => {
    memberClient.get('/settings/gym-contracts/member')
      .then(r => setGymContracts(r.data?.contracts || {}))
      .catch(() => {});
    memberClient.get('/settings/contract-terms/member')
      .then(r => setPassTerms(r.data?.pass || ''))
      .catch(() => {});
  }, []);

  useImperativeHandle(ref, () => ({
    isValid: () => confirmed && !portraitRef.current?.isEmpty() && (!isMinor || !guardianRef.current?.isEmpty()),
    getData: () => ({
      confirmedContractTerms: confirmed,
      portraitSignature: portraitRef.current?.toDataURL() || null,
      guardianSignature: isMinor ? (guardianRef.current?.toDataURL() || null) : null,
    }),
  }), [confirmed, isMinor]);

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, textAlign: 'left' }}>{t('📜 定期票服務同意書 完整條款內容')}</div>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 12, textAlign: 'left' }}>{t('以下為「紅石攀岩館 定期票服務同意書」完整內容，請詳閱後同意並簽名：')}</div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, textAlign: 'left' }}>{t('場館合約基本資料')}</div>
      <GymContractInfoBox contract={gymContracts[gymId]} />
      <PassContentSummary passTypeName={passTypeName} scope={scope} targetGymId={targetGymId} startDate={startDate} endDate={endDate} totalFee={totalFee} />
      <InstallmentNote periods={installmentPeriods} />
      <ContractTermsSections text={passTerms} vars={{ refundFee: 600, transferFee: 600 }} />
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${confirmed ? '#2D7D46' : '#E8D5D5'}`, background: confirmed ? '#F3FAF4' : '#fff', cursor: 'pointer', marginTop: 6, marginBottom: 16 }}>
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
        <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'left' }}>{t('我已詳閱並同意本定期票服務同意書之完整條款內容')}</span>
      </label>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, textAlign: 'left' }}>{t('本人簽名（請以正楷書寫）')}</div>
      <SignaturePad ref={portraitRef} height={200} />
      {isMinor && (<>
        <div style={{ fontWeight: 600, fontSize: 13, margin: '16px 0 6px', textAlign: 'left' }}>{t('法定代理人簽名（持有人未滿 18 歲必填）')}</div>
        <SignaturePad ref={guardianRef} height={200} />
      </>)}
    </div>
  );
});

export default PassContractReview;
