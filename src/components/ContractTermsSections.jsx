// ── 合約條款共用顯示元件（課程/定期票共用）──────────────────────────────
// 2026-09-07 新增：原本 MemberCoursesPage.jsx（FullContractTermsBox）與 PassContractReview.jsx
// （PassContractTermsBox/GymContractInfoBox）各自維護一份硬編條款文字＋場館資料格線，這裡統一
// 抽成單一共用元件，兩處改為 import——條款文字改由設定頁（GET /settings/contract-terms/member）
// 動態提供，兩處自動同步不再各自維護；場館合約基本資料的手機版兩欄斷行問題也在此一次修正。
//
// fillTemplate 邏輯需與後端 src/utils/contractTermsDefaults.js 完全一致（{{tokenName}} 樣板變數）。
export function fillTemplate(text, vars) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : `{{${k}}}`));
}

// 場館合約基本資料——手機版原為固定 2 欄 grid + 11.5px 字，長標籤（如「公共意外責任險額度與效期」）
// 在窄螢幕會斷行斷得很難看；改用 <=480px 單欄 + 縮小字級（scoped <style>，比照專案既有
// PaymentMethodFixBox 的 scoped class 慣例）。
export function GymContractInfoBox({ contract }) {
  const g = contract || {};
  const rows = [
    ['場所名稱', g.venueName], ['負責人', g.personInCharge], ['履約地點', g.contractLocation],
    ['坪數', g.areaPing], ['場館可容納人數', g.maxCapacity], ['預計招收會員人數', g.expectedMembers],
    ['聯絡電話', g.contactPhone], ['電子信箱', g.contactEmail], ['公司登記或行號證明', g.businessRegistrationNo],
    ['公共意外責任險額度與效期', g.liabilityInsurancePeriod], ['每一人體傷責任', g.perPersonInjuryLiability],
  ];
  return (
    <>
      <style>{`
        .gym-contract-info-box { display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; }
        @media (max-width: 480px) {
          .gym-contract-info-box { grid-template-columns:1fr; font-size:10px; gap:3px 0; }
        }
      `}</style>
      <div style={{ background:'#fff', border:'0.5px solid #E8D5D5', borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:11.5, color:'#444', textAlign:'left' }}>
        <div className="gym-contract-info-box">
          {rows.map(([label, val], i) => (<div key={i}><span style={{ color:'#999' }}>{label}：</span>{val || '－'}</div>))}
        </div>
      </div>
    </>
  );
}

// 動態合約條款區塊——sections: [{title, body}]，body 支援換行分段＋「・」開頭轉條列（與後端
// contractPdfShared.js termsSections() 完全對應的排版慣例），vars 供 {{token}} 樣板變數代入。
export function ContractTermsSections({ sections, vars }) {
  const list = Array.isArray(sections) ? sections : [];
  const S = { background:'#FBF5F5', borderRadius:8, padding:'12px 14px', fontSize:12, color:'#444', lineHeight:1.8, marginBottom:10, textAlign:'left' };
  const sub = { paddingLeft: 14 };
  return (
    <div style={{ ...S, fontSize: 11.5 }}>
      {list.map((s, i) => {
        const bodyLines = fillTemplate(s.body, vars).split('\n');
        const blocks = [];
        let bulletBuf = [];
        const flush = () => { if (bulletBuf.length) { blocks.push(<div key={`b${blocks.length}`} style={sub}>{bulletBuf.map((b, j) => (<span key={j}>・{b}<br/></span>))}</div>); bulletBuf = []; } };
        bodyLines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          if (trimmed.startsWith('・')) bulletBuf.push(trimmed.slice(1).trim());
          else { flush(); blocks.push(<div key={`p${blocks.length}`} style={{ marginTop: blocks.length ? 4 : 0 }}>{trimmed}</div>); }
        });
        flush();
        return (
          <div key={i} style={{ marginTop: i ? 8 : 0 }}>
            <div style={{ fontWeight: 600 }}>{fillTemplate(s.title, vars)}</div>
            {blocks}
          </div>
        );
      })}
    </div>
  );
}
