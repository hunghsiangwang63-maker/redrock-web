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
export function RealPrintPanel({ gymId, sourceType, refId, memberId, memberName, paymentMethod, title, subtitle, feeInfo, defaultItemName, defaultAmount, onClose }) {
  const [itemName, setItemName] = useState(defaultItemName || '費用');
  const [amount, setAmount] = useState(defaultAmount ?? 0);
  const [taxId, setTaxId] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('idle'); // idle | printing | success | error
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null);
  const [agentConnected, setAgentConnected] = useState(null);

  const refreshAgent = async () => setAgentConnected(await checkPrinterAgent());
  useEffect(() => { refreshAgent(); }, []);

  const doPrint = async () => {
    if (!(Number(amount) > 0)) { setError('請輸入大於 0 的金額'); return; }
    if (taxId.trim() && !isValidTaiwanTaxId(taxId)) { setError('統一編號檢查碼錯誤，請確認號碼是否正確'); return; }
    setStatus('printing'); setError('');
    try {
      // ① 先真的印——失敗不消耗號碼、不建立任何紀錄，可安全重試（見 invoice-integration-plan.md §6.1「失敗退路」）
      await printReceipt({
        gymId,
        items: [{ name: itemName, price: Number(amount), qty: 1 }],
        buyerTaxId: taxId.trim() || undefined,
        openDrawer: paymentMethod === 'cash',
      });
      // ② 印成功才配號 + 寫入正式發票紀錄
      const res = await client.post('/invoices/print-record', {
        gymId, sourceType, refId, memberId, memberName, itemName, amount: Number(amount), taxId: taxId.trim(), note,
      });
      setIssued(res.data.invoice);
      setStatus('success');
    } catch (err) {
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
          <div style={{ fontSize:13 }}>{issued.itemName}　NT${issued.amount}</div>
          {issued.taxId && <div style={{ fontSize:12, color:'#666', marginTop:2 }}>統編 {issued.taxId}</div>}
          {autoVoided && (
            <div style={{ fontSize:12, color:'#A32D2D', marginTop:8, lineHeight:1.6 }}>
              請勿將這張紙本收據交給客人——列印期間對應的訂單/入場已被取消，系統已將此發票號碼標記作廢（不會重複使用）。如需開立新發票，請確認交易狀態後重新操作。
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ width:'100%', height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>關閉</button>
      </Modal>
    );
  }

  return (
    <Modal title={`開立發票 · ${title || ''}`} onClose={onClose}>
      <div style={{ background:'#FBF5F5', borderRadius:8, padding:10, marginBottom:14, fontSize:12, color:'#666' }}>
        {subtitle}
        {feeInfo && <div style={{ marginTop:4 }}>{feeInfo}</div>}
        <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
          {agentConnected === null ? (
            <span style={{ color:'#999' }}>檢查印表機連線中...</span>
          ) : agentConnected ? (
            <span style={{ color:'#2D7D46', fontWeight:600 }}>🖨️ 印表機已連線</span>
          ) : (
            <span style={{ color:'#A32D2D', fontWeight:600 }}>⚠️ 無法連線到本機列印代理</span>
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
        <button onClick={doPrint} disabled={status === 'printing' || agentConnected === false}
          style={{ flex:2, height:40, borderRadius:9, background: agentConnected === false ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor: agentConnected === false ? 'not-allowed' : 'pointer' }}>
          {status === 'printing' ? '列印中...' : status === 'error' ? '🖨️ 重新列印' : '🖨️ 列印發票'}
        </button>
      </div>
    </Modal>
  );
}
