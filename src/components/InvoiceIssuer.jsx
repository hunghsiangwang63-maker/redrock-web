import { useState, useEffect } from 'react';
import Modal from './Modal';
import client from '../api/client';
import InvoiceModal from './InvoiceModal';
import { checkPrinterAgent, printReceipt } from '../utils/invoicePrinter';
import { isValidTaiwanTaxId } from '../utils/taiwanTaxId';

// 五流程（POS/入場/課程/比賽報名/器材租借）共用的「開立發票」入口——比照 invoice-integration-plan.md §6.1：
// 依該館「發票列印」開關（GET /invoices/printing-status）決定顯示哪一種：
//   關閉 → 沿用現有 InvoiceModal（手動記帳版，行為完全不變）
//   開啟 → 真的呼叫本機列印代理列印，成功後才配號＋寫入正式 invoices 紀錄
// 呼叫端只需把原本傳給 InvoiceModal 的 props 原封不動傳進來，再多帶 gymId/sourceType/refId/
// memberId/memberName/paymentMethod 五個欄位即可（呼叫端本就握有這些值）。
//
// props:
//   gymId, sourceType, refId, memberId, memberName, paymentMethod（'cash' 才會開錢櫃）
//   title, subtitle, feeInfo, defaultItemName, defaultAmount, onClose
//   itemBreakdown - 選填，[{name, amount}]，列印紙本時若加總等於目前金額欄位的值，改印成多行明細
//     （如「成人入場」+「租借岩鞋」分開兩行）；不提供或加總對不上（店員手動改過金額）則印單一行。
//     只影響印在紙上的內容，發票「紀錄」（invoices 集合）仍只存單一 itemName/amount，不受影響。
//   listInvoices, createInvoice, voidInvoiceFn（開關關閉時原封不動轉給 InvoiceModal）
export default function InvoiceIssuer(props) {
  const { gymId, sourceType, refId, memberId, memberName, paymentMethod, ...rest } = props;
  const [enabled, setEnabled] = useState(null); // null=載入中，避免畫面閃一下手動版又跳真列印版

  useEffect(() => {
    if (!gymId) { setEnabled(false); return; }
    let alive = true;
    client.get('/invoices/printing-status', { params: { gymId } })
      .then(r => { if (alive) setEnabled(!!r.data.enabled); })
      .catch(() => { if (alive) setEnabled(false); });
    return () => { alive = false; };
  }, [gymId]);

  if (enabled === null) return null;
  if (!enabled) return <InvoiceModal {...rest} />;
  return (
    <RealPrintPanel gymId={gymId} sourceType={sourceType} refId={refId} memberId={memberId}
      memberName={memberName} paymentMethod={paymentMethod} {...rest} />
  );
}

const inp = { width:'100%', height:36, borderRadius:8, border:'1px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };
const lab = { fontSize:12, color:'#666', display:'block', marginBottom:5 };

// 匯出供「發票號碼管理」設定頁的「手動開立發票（無來源）」直接重用——不透過 InvoiceIssuer 的
// 開關判斷（那個是給五流程各自的既有入口用的），無來源發票本就只在真列印啟用時才有意義。
export function RealPrintPanel({ gymId, sourceType, refId, memberId, memberName, paymentMethod, title, subtitle, feeInfo, defaultItemName, defaultAmount, itemBreakdown, onClose }) {
  const [itemName, setItemName] = useState(defaultItemName || '費用');
  const [amount, setAmount] = useState(defaultAmount ?? 0);
  const [taxId, setTaxId] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('idle'); // idle | printing | success | error
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null);
  const [rollStatus, setRollStatus] = useState(null); // 印完這張後的紙捲剩餘狀態（後端 print-record 回傳）
  const [agentConnected, setAgentConnected] = useState(null);
  const [positionOk, setPositionOk] = useState(null); // 存根聯/收執聯定位狀態（true/false/null＝未知不擋）；已於 2026-08-12 實機驗證通過（含極性校正）
  const [rollState, setRollState] = useState(null); // 開啟面板當下的紙捲狀態（供列印前預先擋下已用完的情況）
  const [checkingExisting, setCheckingExisting] = useState(true); // 開面板時先查有沒有已開立過，查完前不顯示表單/按鈕
  const [printedItems, setPrintedItems] = useState(null); // 這次實際送去列印的明細（供成功彈窗逐行顯示；重開既有發票/競態情況下沒有值，退回顯示單一品項）

  const refreshAgent = async () => {
    const s = await checkPrinterAgent();
    setAgentConnected(s.connected);
    setPositionOk(s.positionOk);
  };
  useEffect(() => {
    refreshAgent();
    if (!gymId) return;
    client.get('/invoices/state', { params: { gymId } })
      .then(r => setRollState(r.data.invoiceState || null))
      .catch(() => setRollState(null));
  }, [gymId]);

  // 這筆訂單如果已經開立過發票（不論是這次操作剛印的，還是之前印過、這次只是重新打開這個面板），
  // 一律直接顯示唯讀摘要——不重新顯示可以再按一次「列印發票」的空白表單，避免重複列印/重複消耗號碼。
  useEffect(() => {
    if (!sourceType || !refId) { setCheckingExisting(false); return; }
    let alive = true;
    client.get('/invoices/active', { params: { sourceType, refId } })
      .then(r => {
        if (!alive) return;
        if (r.data.invoice) { setIssued(r.data.invoice); setStatus('success'); }
        setCheckingExisting(false);
      })
      .catch(() => { if (alive) setCheckingExisting(false); }); // 查詢失敗不擋（後端 print-record 仍有最後一道防線）
    return () => { alive = false; };
  }, [sourceType, refId]);

  const rollDepleted = !!rollState?.rollDepleted;

  const doPrint = async () => {
    if (rollDepleted) { setError('這捲發票紙已用完，請先到「系統設定 → 發票號碼管理」設定新捲起始號'); return; }
    // 這裡用開面板時查到的快取值先擋一次（避免明顯已知異常還讓店員點下去）；印表機自己的 /print
    // 端點在真正列印前也會重新即時查一次（見 server.js），才是真正的最後防線。
    if (positionOk === false) { setError('偵測到發票紙未正確定位（存根聯/收執聯黑點感應異常），請確認紙張裝妥後點「重新檢查」再試'); return; }
    if (!(Number(amount) > 0)) { setError('請輸入大於 0 的金額'); return; }
    if (taxId.trim() && !isValidTaiwanTaxId(taxId)) { setError('統一編號檢查碼錯誤，請確認號碼是否正確'); return; }
    setStatus('printing'); setError('');
    try {
      // 有提供明細、且加總仍等於目前金額欄位（店員沒手動改過總額）→ 紙本印成多行明細（如「成人入場」
      // 「租借岩鞋」分開列）；否則印成單一行——只影響紙本排版，發票紀錄仍只存 itemName/amount 這一組。
      const breakdownSum = Array.isArray(itemBreakdown) ? itemBreakdown.reduce((s, i) => s + Number(i.amount || 0), 0) : null;
      const printItems = Array.isArray(itemBreakdown) && itemBreakdown.length > 0 && breakdownSum === Number(amount)
        ? itemBreakdown.map(i => ({ name: i.name, price: Number(i.amount), qty: 1 }))
        : [{ name: itemName, price: Number(amount), qty: 1 }];
      setPrintedItems(printItems); // 記下這次實際送印的明細，成功彈窗要逐行顯示
      // ① 先真的印——失敗不消耗號碼、不建立任何紀錄，可安全重試（見 invoice-integration-plan.md §6.1「失敗退路」）
      await printReceipt({
        gymId,
        items: printItems,
        buyerTaxId: taxId.trim() || undefined,
        openDrawer: paymentMethod === 'cash',
      });
      // ② 印成功才配號 + 寫入正式發票紀錄
      const res = await client.post('/invoices/print-record', {
        gymId, sourceType, refId, memberId, memberName, itemName, amount: Number(amount), taxId: taxId.trim(), note, paymentMethod,
      });
      setIssued(res.data.invoice);
      setRollStatus(res.data.rollStatus || null);
      setStatus('success');
    } catch (err) {
      // 極少數競態情況（如雙分頁/雙人同時操作同一筆訂單）：紙本已在①印出，但②配號時被後端擋下
      // 「已有作用中發票」——這張紙已經印出去、浪費掉了，但沒有多消耗一個號碼、也沒建立重複紀錄。
      // 直接切到唯讀摘要（顯示既有那張正確的發票），不要再讓店員誤以為「列印失敗」而重新按一次。
      if (err.response?.data?.error === 'ALREADY_INVOICED' && err.response.data.invoice) {
        setIssued(err.response.data.invoice);
        setStatus('success');
        return;
      }
      // 紙本已印出但配號失敗（如列印當下剛好被別人用到最後一張）——同樣要醒目提醒換捲，
      // 而非只顯示一般錯誤訊息。
      if (err.response?.data?.error === 'ROLL_DEPLETED') {
        setRollState(prev => ({ ...(prev || {}), rollDepleted: true }));
      }
      setError(err.message || err.response?.data?.message || '列印失敗，請確認印表機連線後重試');
      setStatus('error');
    }
  };

  if (status === 'success' && issued) {
    // 印製過程中（紙本已印出、配號完成前）對應交易被取消/退貨/退費時，後端會直接把這筆記為
    // 已作廢（號碼仍消耗、仍建紀錄，只是狀態不是 issued）——這裡要用明顯不同的警示樣式提醒店員，
    // 紙本雖已印出但這筆已經作廢，不該交給客人當正式收據。
    const autoVoided = issued.status === 'void';
    return (
      <Modal title={autoVoided ? `⚠️ 已自動作廢 · ${title || ''}` : `發票已列印 · ${title || ''}`} onClose={onClose}>
        <div style={{ background: autoVoided ? '#FCEBEB' : '#E6F4EB', border: `1px solid ${autoVoided ? '#A32D2D33' : '#2D7D4633'}`, borderRadius:8, padding:14, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color: autoVoided ? '#A32D2D' : '#2D7D46', marginBottom:6 }}>
            {autoVoided ? '⚠️ 紙本已印出，但對應交易已失效，此號碼已自動作廢' : '✅ 已列印'}
          </div>
          <div style={{ fontSize:18, fontWeight:700, color:'#8B1A1A', fontFamily:'monospace', marginBottom:4 }}>{issued.invoiceNo}</div>
          {Array.isArray(printedItems) && printedItems.length > 1 ? (
            <div style={{ fontSize:13 }}>
              {printedItems.map((it, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'2px 0' }}>
                  <span>{it.name}</span><span>NT${it.price}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, borderTop:'1px solid #2D7D4633', marginTop:4, paddingTop:4 }}>
                <span>合計</span><span>NT${issued.amount}</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize:13 }}>{issued.itemName}　NT${issued.amount}</div>
          )}
          {issued.taxId && <div style={{ fontSize:12, color:'#666', marginTop:2 }}>統編 {issued.taxId}</div>}
          {autoVoided && (
            <div style={{ fontSize:12, color:'#A32D2D', marginTop:8, lineHeight:1.6 }}>
              請勿將這張紙本收據交給客人——列印期間對應的訂單/入場已被取消，系統已將此發票號碼標記作廢（不會重複使用）。如需開立新發票，請確認交易狀態後重新操作。
            </div>
          )}
        </div>
        {rollStatus?.rollDepleted && (
          <div style={{ background:'#A32D2D', color:'#fff', borderRadius:8, padding:12, marginBottom:16, fontSize:13, fontWeight:700 }}>
            🚨 這捲發票紙已用完！請立即更換新捲，並到「系統設定 → 發票號碼管理」設定新捲起始號。
          </div>
        )}
        {!rollStatus?.rollDepleted && rollStatus?.rollLow && (
          <div style={{ background:'#FCEBD6', color:'#A66A00', border:'1.5px solid #E8A73C', borderRadius:8, padding:12, marginBottom:16, fontSize:13, fontWeight:700 }}>
            ⚠️ 發票紙捲即將用完！剩餘 {rollStatus.remaining} 張，請盡快準備下一捲。
          </div>
        )}
        <button onClick={onClose} style={{ width:'100%', height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>關閉</button>
      </Modal>
    );
  }

  // 還沒查完「這筆訂單是否已開過發票」之前，先不要顯示表單/按鈕——避免在查詢結果回來、
  // 切換成上方唯讀摘要之前，讓店員看到一瞬間可以按的空白表單、搶快點下去。
  if (checkingExisting) {
    return (
      <Modal title={`開立發票 · ${title || ''}`} onClose={onClose}>
        <div style={{ fontSize:13, color:'#999', textAlign:'center', padding:'30px 0' }}>查詢中...</div>
      </Modal>
    );
  }

  return (
    <Modal title={`開立發票 · ${title || ''}`} onClose={onClose}>
      {rollDepleted && (
        <div style={{ background:'#A32D2D', color:'#fff', borderRadius:8, padding:12, marginBottom:14, fontSize:13, fontWeight:700, lineHeight:1.6 }}>
          🚨 這捲發票紙已用完，無法繼續開票！請先更換新捲，並到「系統設定 → 發票號碼管理」設定新捲起始號。
        </div>
      )}
      {!rollDepleted && rollState?.rollLow && (
        <div style={{ background:'#FCEBD6', color:'#A66A00', border:'1.5px solid #E8A73C', borderRadius:8, padding:12, marginBottom:14, fontSize:13, fontWeight:700 }}>
          ⚠️ 發票紙捲即將用完！剩餘 {rollState.remaining} 張，請盡快準備下一捲。
        </div>
      )}
      <div style={{ background:'#FBF5F5', borderRadius:8, padding:10, marginBottom:14, fontSize:12, color:'#666' }}>
        {subtitle}
        {feeInfo && <div style={{ marginTop:4 }}>{feeInfo}</div>}
        <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {agentConnected === null ? (
            <span style={{ color:'#999' }}>檢查印表機連線中...</span>
          ) : agentConnected ? (
            <span style={{ color:'#2D7D46', fontWeight:600 }}>🖨️ 印表機已連線</span>
          ) : (
            <span style={{ color:'#A32D2D', fontWeight:600 }}>⚠️ 無法連線到本機列印代理</span>
          )}
          {agentConnected && positionOk === false && (
            <span style={{ color:'#A32D2D', fontWeight:600 }}>／⚠️ 紙張未正確定位</span>
          )}
          <button onClick={refreshAgent} style={{ fontSize:11, color:'#185FA5', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>重新檢查</button>
        </div>
      </div>
      <div style={{ marginBottom:12 }}>
        <label style={lab}>品項</label>
        <input style={inp} value={itemName} onChange={e => setItemName(e.target.value)} placeholder="如：課程費用" />
      </div>
      <div style={{ marginBottom:12 }}>
        <label style={lab}>金額</label>
        <input type="number" style={inp} value={amount} onChange={e => setAmount(e.target.value)} />
      </div>
      <div style={{ marginBottom:12 }}>
        <label style={lab}>統一編號（選填）</label>
        <input style={inp} value={taxId} maxLength={8}
          onChange={e => setTaxId(e.target.value.replace(/\D/g, ''))} placeholder="8 碼統編（三聯式）" />
        {taxId.length === 8 && !isValidTaiwanTaxId(taxId) && (
          <div style={{ fontSize:11, color:'#A32D2D', marginTop:4 }}>⚠️ 檢查碼不符，請確認統一編號是否正確</div>
        )}
      </div>
      <div style={{ marginBottom:14 }}>
        <label style={lab}>備註（選填）</label>
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
          style={{ ...inp, height:'auto', paddingTop:8, paddingBottom:8, resize:'vertical', fontFamily:'inherit' }} />
      </div>
      {error && (
        <div style={{ fontSize:12, color:'#A32D2D', marginBottom:10, lineHeight:1.6 }}>
          ⚠️ {error}<br/>尚未消耗發票號碼，可直接重試。
        </div>
      )}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onClose} style={{ flex:1, height:40, borderRadius:9, border:'1px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>關閉</button>
        {(() => {
          const printDisabled = status === 'printing' || agentConnected === false || positionOk === false;
          return (
            <button onClick={doPrint} disabled={printDisabled}
              style={{ flex:2, height:40, borderRadius:9, background: printDisabled ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: printDisabled ? 'not-allowed' : 'pointer' }}>
              {status === 'printing' ? '列印中...' : status === 'error' ? '🖨️ 重新列印' : '🖨️ 列印發票'}
            </button>
          );
        })()}
      </div>
    </Modal>
  );
}
