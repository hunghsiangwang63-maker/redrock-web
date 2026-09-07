import { forwardRef, useState, useRef, useEffect, useImperativeHandle } from 'react';
import SignaturePad from './SignaturePad';
import { memberClient } from '../api/client';

// 定期票服務同意書（合約）完整條款檢閱＋簽名——比照週課報名的「合約條款」＋「簽名」兩步驟
// （見 MemberCoursesPage.jsx 的 FullContractTermsBox/GymContractInfoBox），條款文字逐字重現後端
// passContractPdf.js 的 passTermsBlock()／passContentBlock()，套用於：
//   ①入場當下購買定期票（MemberQRPage.jsx buy_pass）②我的票券頁線上續約（MemberPassesPage.jsx pass_renewal）
// 場館合約基本資料即時讀取 GET /settings/gym-contracts/member（與 PDF 產生時同一份資料來源、非快照）。
// 供 forwardRef 使用：ref.current.isValid() / ref.current.getData()。

const BOX_STYLE = { background: '#FBF5F5', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#444', lineHeight: 1.8, marginBottom: 10, textAlign: 'left' };
const SCOPE_LABEL = { shared: '全館', 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };
// ⚠️ 2026-09-07 待確認：合約模板寫轉讓手續費 600 元，系統 passAdjustmentService.js 現行 TRANSFER_FEE
// 實收 300 元——使用者已拍板「先用系統現行值、記下來待確認」，此處暫沿用 300 元；若之後確認要改 600，
// 這裡須與後端 passContractPdf.js 的同名常數一併更新。
const TRANSFER_FEE_PENDING_CONFIRM = 300;

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

function PassContractTermsBox() {
  const sub = { paddingLeft: 14 };
  return (
    <div style={{ ...BOX_STYLE, lineHeight: 1.6, fontSize: 11.5 }}>
      <div>1. 服務相關條款皆有三天審閱期，未開始使用前可全額退費。</div>
      <div style={{ marginTop: 8 }}>2. 乙方於營業時間內，應提供下列服務內容：</div>
      <div style={sub}>
        ・合格可供正常使用之運動器材設備、中文標示及使用說明。<br />
        ・各種設備於明顯處所張貼不當使用可能產生危險之警告標示及緊急處理危險方法之說明。
      </div>
      <div style={{ marginTop: 8 }}>3. 乙方除經甲方同意外，不得調高上述已約定之費用。</div>
      <div style={{ marginTop: 8 }}>4. 甲方若遇以下事項可辦理暫停與展延，甲方須事先提出相關文件證明/釋明下列事由之一者，乙方應於七工作日內辦理暫停會籍，會籍有效期間順延：</div>
      <div style={sub}>
        ・出國逾一個月。<br />
        ・受傷、疾病或身體不適致不宜運動。<br />
        ・懷孕、育嬰、侍親之需要。<br />
        ・服兵役致難以履約。<br />
        ・職務異動或遷居致難以履約。<br />
        ・其他事由致難以履約。
      </div>
      <div style={{ marginTop: 8 }}>5. 契約終止</div>
      <div style={sub}>
        ・可歸責甲方事由之契約終止，扣除手續費 600 元後，依未到期時間比例計算餘額退還予甲方，退款於 10 個工作天內匯入甲方指定之金融帳戶。<br />
        ・不可歸責甲方事由之契約終止，不扣除手續費，依未到期時間比例計算餘額退還予甲方，退款於 10 個工作天內匯入甲方指定之金融帳戶。
      </div>
      <div style={{ marginTop: 8 }}>6. 終止契約之通知：甲方得以線上填單通知乙方。</div>
      <div style={{ marginTop: 8 }}>7. 契約讓與第三人</div>
      <div style={sub}>
        ・甲方於契約期間屆滿前經業者同意，得讓與契約予第三人，契約之內容不因讓與而受影響。<br />
        ・乙方以有約定者為限，得向甲方請求因處理前項讓與所生之必要費用 {TRANSFER_FEE_PENDING_CONFIRM} 元。
      </div>
      <div style={{ marginTop: 8 }}>8. 乙方服務之異動通知：乙方所提供服務內容與時間如有異動，須事先通知，且應與原定開始服務時間相距24個小時以上，其通知方式約定如下：</div>
      <div style={sub}>
        ・公告於乙方網站：app.redrocktaiwan.com<br />
        ・若乙方未依前項約定時間方式通知，甲方得請求乙方於限期 7 日內提供甲方同意之補償方案。
      </div>
      <div style={{ marginTop: 8 }}>9. 贈品約款及其效果：無贈品。</div>
      <div style={{ marginTop: 8 }}>10. 會籍轉點：無轉點需求。</div>
      <div style={{ marginTop: 8 }}>11. 消費資訊及廣告：乙方之廣告，均為契約內容。乙方應確保其廣告內容真實，其對甲方所應負義務不得低於前項廣告內容。</div>
      <div style={{ marginTop: 8 }}>12. 合意管轄：因本契約發生訴訟時，雙方同意以新竹地方法院為第一審管轄法院，但不得排除消費者保護法第四十七條或民事訴訟法第二十八條第二項、第四百三十六條之九規定之小額訴訟管轄法院之適用。</div>
    </div>
  );
}

// 場館合約基本資料——欄位順序與後端 gymInfoBlock() 一致，資料來源 GET /settings/gym-contracts/member。
function GymContractInfoBox({ contract }) {
  const g = contract || {};
  const rows = [
    ['場所名稱', g.venueName], ['負責人', g.personInCharge], ['履約地點', g.contractLocation],
    ['坪數', g.areaPing], ['場館可容納人數', g.maxCapacity], ['預計招收會員人數', g.expectedMembers],
    ['聯絡電話', g.contactPhone], ['電子信箱', g.contactEmail], ['公司登記或行號證明', g.businessRegistrationNo],
    ['公共意外責任險額度與效期', g.liabilityInsurancePeriod], ['每一人體傷責任', g.perPersonInjuryLiability],
  ];
  return (
    <div style={{ background: '#fff', border: '0.5px solid #E8D5D5', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 11.5, color: '#444', textAlign: 'left' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
        {rows.map(([label, val], i) => (<div key={i}><span style={{ color: '#999' }}>{label}：</span>{val || '－'}</div>))}
      </div>
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
 * @param {(s:string)=>string} [props.t] 選填翻譯函式（MemberQRPage.jsx 有 i18n 字典，未傳則原樣顯示中文）
 */
const PassContractReview = forwardRef(function PassContractReview(
  { gymId, passTypeName, scope, targetGymId, startDate, endDate, totalFee, isMinor, t = (s) => s },
  ref,
) {
  const [gymContracts, setGymContracts] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const portraitRef = useRef(null);
  const guardianRef = useRef(null);

  useEffect(() => {
    memberClient.get('/settings/gym-contracts/member')
      .then(r => setGymContracts(r.data?.contracts || {}))
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
      <PassContractTermsBox />
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
