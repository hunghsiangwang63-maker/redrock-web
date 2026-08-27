import { useState, useEffect, useRef } from 'react';
import { getCompetitions, createCompetition, updateCompetition, getCompetitionRegistrations, returnCompetitionForm, rejectCompetitionForm, rejectCompetitionPayment } from '../../api/competitions';
import client from '../../api/client';
import SimulateRegistrationButton from '../../components/SimulateRegistrationButton';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';
import CompetitionActionModal from '../../components/review/CompetitionActionModal';
import { verifyCompetitionPartnerGym, getRegistrationInvoices, createRegistrationInvoice, voidCompetitionInvoice, updateCompetitionReceivedAmount, adminUpdateCompetitionRegistration } from '../../api/competitions';
import SegmentedTabs from '../../components/SegmentedTabs';
import InvoiceIssuer from '../../components/InvoiceIssuer';
import { InvoiceButtonView } from '../../components/InvoiceButton';
import { broadcastCompetitionReminder, uploadReminderImage } from '../../api/memberReminders';
import ReminderFormFields from '../../components/ReminderFormFields';
import { ssoCompAuth } from '../../api/compAuth';

// 「實收金額」就地編修（管理員；扣除保費，供開發票/結帳共用）——比照課程學員頁的實收金額編輯器
// 2026-08-27 改制：預設「檢視模式」（純文字），管理員按「✏️ 編輯」才出現輸入框＋儲存/取消
// ——名單列不再就地編輯，實收金額編輯統一走詳細彈窗的這個元件。
const RegReceivedAmountEditor = ({ reg, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(reg.receivedAmount ?? 0);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVal(reg.receivedAmount ?? 0); setEditing(false); }, [reg.receivedAmount, reg.id]);
  const commit = async () => {
    const num = Number(val);
    if (isNaN(num) || num < 0) { setVal(reg.receivedAmount ?? 0); setEditing(false); return; }
    if (num === (reg.receivedAmount ?? 0)) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateCompetitionReceivedAmount(reg.id, num);
      onSaved?.(reg.id, num);
      setEditing(false);
    } catch (err) {
      alert(err.response?.data?.message || '更新實收金額失敗');
      setVal(reg.receivedAmount ?? 0);
    } finally { setSaving(false); }
  };
  if (!editing) {
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
        <span style={{ fontWeight:600, color:'#8B1A1A' }}>NT${reg.receivedAmount ?? 0}{reg.receivedAmountOverride != null ? '（管理員已編修）' : ''}</span>
        <button onClick={() => setEditing(true)}
          style={{ height:24, padding:'0 8px', borderRadius:6, background:'#fff', color:'#8B1A1A', border:'1px solid #E8D5D5', fontSize:11, cursor:'pointer' }}>✏️ 編輯</button>
      </span>
    );
  }
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
      <input type="number" value={val} disabled={saving} autoFocus
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(reg.receivedAmount ?? 0); setEditing(false); } }}
        style={{ width:90, height:28, fontSize:12, borderRadius:6, border:'1px solid #E8D5D5', padding:'0 8px', boxSizing:'border-box' }} />
      <button onClick={commit} disabled={saving}
        style={{ height:28, padding:'0 10px', borderRadius:6, background:'#8B1A1A', color:'#fff', border:'none', fontSize:11, cursor:'pointer' }}>{saving ? '儲存中' : '儲存'}</button>
      <button onClick={() => { setVal(reg.receivedAmount ?? 0); setEditing(false); }} disabled={saving}
        style={{ height:28, padding:'0 10px', borderRadius:6, background:'none', color:'#666', border:'1px solid #E8D5D5', fontSize:11, cursor:'pointer' }}>取消</button>
    </span>
  );
};

// 館方人工更正組別／榮譽參賽——不影響費用/收款狀態，異動後系統自動寄信通知會員（見 admin-update 端點）
const RegDivisionHonoraryEditor = ({ reg, divisions, onSaved }) => {
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const commit = async (patch) => {
    setSaving(true);
    try {
      await adminUpdateCompetitionRegistration(reg.id, patch);
      onSaved?.(reg.id, patch);
      setJustSaved(true); setTimeout(() => setJustSaved(false), 1500);
    } catch (err) {
      alert(err.response?.data?.message || '更新失敗');
    } finally { setSaving(false); }
  };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
      <select value={reg.divisionId || ''} disabled={saving}
        onChange={e => { if (e.target.value && e.target.value !== reg.divisionId) commit({ divisionId: e.target.value }); }}
        style={{ height:26, fontSize:12, borderRadius:6, border:'1px solid #E8D5D5', padding:'0 4px' }}>
        {(divisions || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <label style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:12, color:'#666', cursor:'pointer' }}>
        <input type="checkbox" checked={!!reg.isHonorary} disabled={saving}
          onChange={e => commit({ isHonorary: e.target.checked })} />
        榮譽參賽
      </label>
      {justSaved && <span style={{ color:'#2D7D46', fontSize:11 }}>✓ 已更新並寄信通知</span>}
    </span>
  );
};

const Tag = ({ type='ok', children }) => {
  const s = { ok:{bg:'#E6F4EB',color:'#2D7D46'}, red:{bg:'#FCEBEB',color:'#A32D2D'}, warn:{bg:'#FAEEDA',color:'#854F0B'}, blue:{bg:'#E6F1FB',color:'#185FA5'}, gray:{bg:'#F0EDED',color:'#666'} };
  const st = s[type]||s.ok;
  return <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:st.bg, color:st.color }}>{children}</span>;
};

const Modal = ({ title, onClose, children, width=620 }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
    <div style={{ background:'#fff', borderRadius:16, padding:24, width, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:600 }}>{title}</div>
        <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const inp = { width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' };
const lbl = { fontSize:12, color:'#666', display:'block', marginBottom:5 };

const STATUS_LABEL = {
  draft:  { type:'gray', label:'草稿' },
  open:   { type:'ok',   label:'開放報名' },
  closed: { type:'red',  label:'已截止' },
};

const emptyForm = () => ({
  name:'', description:'', gymId:'gym-hsinchu',
  registrationStart: dayjs().format('YYYY-MM-DD'),
  registrationEnd: dayjs().add(14,'day').format('YYYY-MM-DD'),
  earlyBirdDeadline: dayjs().add(7,'day').format('YYYY-MM-DD'),
  eventDate: dayjs().add(21,'day').format('YYYY-MM-DD'),
  divisions: [
    { id:`d${Date.now()}1`, name:'V2-V3組', maxParticipants:40, waitlistMax:5 },
    { id:`d${Date.now()}2`, name:'V4-V5組', maxParticipants:40, waitlistMax:5 },
  ],
  fees: { adultEarlyBird:990, adultRegular:1100, childEarlyBird:840, childRegular:950, teamMemberDiscount:0.9, childAgeLimit:15, insuranceAdult:261, insuranceChild:118 },
  refundPolicies: [
    { deadline: dayjs().add(5,'day').format('YYYY-MM-DD'), rule:'full_minus_admin', adminFee:100 },
    { deadline: dayjs().add(12,'day').format('YYYY-MM-DD'), rule:'half_minus_admin', adminFee:100 },
  ],
  waiverContent: { zh:'', en:'' },
  scoringSystem:'competition_management_v2',  // 固定紅石賽事管理 V2（直寫計分系統 Firestore）
  status:'draft',
  paymentDeadlineDays: 3,  // 繳款期限：報名日 + N 天內須完成繳費（含臨櫃繳款），逾期自動剔除
});

export default function CompetitionsPage() {
  const { staff, operator } = useAuth();
  // 2026-08-08：後端 competitions.manage 早已開放 full_time 編輯，前端這裡漏更新（一直卡在只認管理員）
  // 2026-08-24：competitions.manage 在後端 COUNTER_PERMS 內，值班 operator 不論本人角色一律放行
  // （checkPermission 對 type==='operator' 是無條件通過，跟角色無關）——原本這裡漏加 operator 判斷，
  // 導致館別電腦（值班中）完全看不到「賽前通知」等管理按鈕，即使後端其實允許。比照下面 canInvoice
  // 已有的 isManagerOnly || !!operator 寫法補上。
  const canManage = ['super_admin','gym_manager','full_time'].includes(staff?.role) || !!operator;
  // 實收金額覆寫（PUT /registrations/:regId/received-amount）後端走 requireManager，維持僅管理員（full_time 不含）
  const isManagerOnly = ['super_admin','gym_manager'].includes(staff?.role);
  // 開立發票（POST /registrations/:regId/invoices、/invoices/:id/void）2026-08-17 放寬值班站台可開，
  // 與入場/補租/租借/課程四個發票流程對齊；與上面 isManagerOnly 分開，不影響實收金額覆寫的權限
  const canInvoice = isManagerOnly || !!operator;
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState('ok');
  const [tab, setTab] = useState('list');
  const [showForm, setShowForm] = useState(false);
  // 贊助商 Logo 管理（顯示於計分系統首頁，可設顯示期間；資料存計分系統專案、經後端推送）
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [sponsors, setSponsors] = useState(null);
  const [spForm, setSpForm] = useState({ name:'', startDate:'', endDate:'', logo:'' });
  const [spBusy, setSpBusy] = useState(false);
  const loadSponsors = async () => {
    try { const r = await client.get('/competitions/sponsors'); setSponsors(r.data.sponsors || []); }
    catch (e) { setSponsors([]); showMsg(e.response?.data?.message || '贊助商清單載入失敗', 'err'); }
  };
  const openSponsors = () => { setSponsorOpen(true); setSponsors(null); setSpForm({ name:'', startDate:'', endDate:'', logo:'' }); loadSponsors(); };
  // 上傳前縮圖（最長邊 600px、PNG 保留透明背景），避免 base64 過大
  const readSponsorLogo = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('圖片讀取失敗'));
      img.src = fr.result;
    };
    fr.onerror = () => reject(new Error('檔案讀取失敗'));
    fr.readAsDataURL(file);
  });
  const submitSponsor = async () => {
    if (!spForm.name.trim()) return showMsg('請填寫贊助商名稱', 'err');
    if (!spForm.logo) return showMsg('請選擇 Logo 圖檔', 'err');
    if (!spForm.startDate || !spForm.endDate) return showMsg('請設定顯示期間', 'err');
    setSpBusy(true);
    try {
      await client.post('/competitions/sponsors', spForm);
      showMsg('已新增贊助商，計分系統首頁將於顯示期間內呈現', 'ok');
      setSpForm({ name:'', startDate:'', endDate:'', logo:'' });
      loadSponsors();
    } catch (e) { showMsg(e.response?.data?.message || '新增失敗', 'err'); }
    finally { setSpBusy(false); }
  };
  const updateSponsorPeriod = async (sp) => {
    try {
      await client.put(`/competitions/sponsors/${sp.id}`, { startDate: sp.startDate, endDate: sp.endDate });
      showMsg('顯示期間已更新', 'ok'); loadSponsors();
    } catch (e) { showMsg(e.response?.data?.message || '更新失敗', 'err'); }
  };
  const deleteSponsor = async (sp) => {
    if (!window.confirm(`確定刪除贊助商「${sp.name}」的 Logo？計分系統首頁將不再顯示。`)) return;
    try { await client.delete(`/competitions/sponsors/${sp.id}`); showMsg('已刪除', 'ok'); loadSponsors(); }
    catch (e) { showMsg(e.response?.data?.message || '刪除失敗', 'err'); }
  };
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showRegistrations, setShowRegistrations] = useState(null);
  const [confirmDeleteComp, setConfirmDeleteComp] = useState(null); // 刪除賽事二次確認 Modal
  const [registrations, setRegistrations] = useState([]);
  const [regLoading, setRegLoading] = useState(false);
  const [regTab, setRegTab] = useState('all'); // all | refunds
  const [statusFilter, setStatusFilter] = useState('all'); // 依報名狀態下拉篩選
  const [regDetail, setRegDetail] = useState(null); // 點列開詳細資料
  const [actionModal, setActionModal] = useState(null); // { type:'pay'|'refund', reg }
  const [invoiceTarget, setInvoiceTarget] = useState(null); // 開立發票 modal 目標（registration 物件）
  const [formAction, setFormAction] = useState(null); // { type:'return'|'reject', reg }
  const [formReason, setFormReason] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // 賽前通知：櫃檯編輯草稿後直接發送給該賽事目前有效（非取消）報名者
  const [noticeModal, setNoticeModal] = useState(null); // 目前開啟通知 Modal 的賽事物件
  const [noticeSubject, setNoticeSubject] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [noticeRecipients, setNoticeRecipients] = useState(null); // null=載入中 | {recipients,count} | {error:true}
  const [noticeSending, setNoticeSending] = useState(false);

  // 首頁提醒推播：對該賽事目前有效（非取消）報名者，各自建一則會員 App 首頁自訂提醒卡片
  const [reminderModal, setReminderModal] = useState(null); // 目前開啟推播 Modal 的賽事物件
  const [reminderForm, setReminderForm] = useState({ title:'', subtitle:'', icon:'🏆', link:'/member/competitions', imageUrl:'', showFrom:'', showUntil:'' });
  const [reminderImageFile, setReminderImageFile] = useState(null); // 本機選取待上傳的圖片
  const [reminderSending, setReminderSending] = useState(false);
  const openReminderBroadcast = (c) => {
    setReminderModal(c);
    setReminderForm({
      title: `${c.name} 即將開賽`,
      subtitle: `比賽日 ${c.eventDate}，請提前 30 分鐘完成報到`,
      icon: '🏆', link: '/member/competitions', imageUrl:'', showFrom: '', showUntil: c.eventDate || '',
    });
    setReminderImageFile(null);
  };
  const sendReminderBroadcast = async () => {
    if (!reminderForm.title.trim()) { showMsg('請填寫標題', 'red'); return; }
    setReminderSending(true);
    try {
      let payload = reminderForm;
      if (reminderImageFile) {
        const up = await uploadReminderImage(reminderImageFile);
        payload = { ...reminderForm, imageUrl: up.data.imageUrl };
      }
      const r = await broadcastCompetitionReminder(reminderModal.id, payload);
      showMsg(`已推播給 ${r.data.count} 位正取報名者`);
      setReminderModal(null);
    } catch (e) { showMsg(e.response?.data?.message || '推播失敗', 'red'); }
    finally { setReminderSending(false); }
  };

  const showMsg = (t, type='ok') => { setMsg(t); setMsgType(type); setTimeout(()=>setMsg(''),4000); };

  // 開立發票 modal 關閉時重查一次狀態並同步畫面上的按鍵（不論剛才有沒有真的印，都查一次最保險）
  const closeInvoiceTarget = () => {
    const target = invoiceTarget;
    setInvoiceTarget(null);
    if (target?.id) {
      client.get('/invoices/status', { params: { sourceType: 'competition', refId: target.id } })
        .then(r => {
          const invoiceNo = r.data.invoiceNo || null, invoicedAmount = r.data.amount ?? null;
          setRegistrations(list => list.map(x => x.id === target.id ? { ...x, invoiceNo, invoicedAmount } : x));
          setRegDetail(d => d && d.id === target.id ? { ...d, invoiceNo, invoicedAmount } : d);
        })
        .catch(() => {});
    }
  };
  const copyCompLink = (c) => {
    const url = `https://app.redrocktaiwan.com/member/competitions?comp=${c.id}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => showMsg('報名連結已複製，可貼到 LINE 分享：\n' + url), () => window.prompt('複製此報名連結：', url));
    else window.prompt('複製此報名連結：', url);
  };
  // 公開報名連結（免登入、訪客可用，不需要先註冊帳號）
  const copyPublicCompLink = (c) => {
    const url = `https://app.redrocktaiwan.com/book/competition?id=${c.id}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => showMsg('公開報名連結已複製，可分享給非會員：\n' + url), () => window.prompt('複製此公開報名連結：', url));
    else window.prompt('複製此公開報名連結：', url);
  };

  const submitFormAction = async () => {
    if (!formReason.trim()) { showMsg('請填寫原因（報名者會看到）', 'red'); return; }
    setFormSaving(true);
    try {
      const fn = formAction.type === 'return' ? returnCompetitionForm
        : formAction.type === 'rejectPayment' ? rejectCompetitionPayment
        : rejectCompetitionForm;
      const res = await fn(formAction.reg.id, { reason: formReason.trim() });
      showMsg(res.data.message || '已處理');
      setFormAction(null); setFormReason('');
      if (showRegistrations) { const r = await getCompetitionRegistrations(showRegistrations.id); setRegistrations(r.data.registrations||[]); }
    } catch (err) { showMsg(err.response?.data?.message || '處理失敗', 'red'); }
    finally { setFormSaving(false); }
  };

  // ⚠️ 由 mount effect 與多個報名狀態異動動作觸發，連續處理多筆報名（核准A→立刻核准B）容易讓
  // 兩次載入重疊，序號只採用最新一次回應，避免過期資料蓋掉剛處理完成後的最新賽事清單。
  const competitionsSeqRef = useRef(0);
  const loadCompetitions = async () => {
    const seq = ++competitionsSeqRef.current;
    setLoading(true);
    try {
      const r = await getCompetitions();
      if (seq !== competitionsSeqRef.current) return;
      setCompetitions(r.data.competitions||[]);
    }
    catch(e) { if (seq === competitionsSeqRef.current) setCompetitions([]); }
    finally { if (seq === competitionsSeqRef.current) setLoading(false); }
  };
  useEffect(()=>{ loadCompetitions(); },[]);
  // 深連結：?comp=<id> → 賽事載入後自動開啟該賽事的報名名單（供通知「查看」按鈕使用；只開一次）
  const _compDeepLinkDone = useRef(false);
  useEffect(() => {
    if (_compDeepLinkDone.current || !competitions.length) return;
    const cid = new URLSearchParams(window.location.search).get('comp');
    if (!cid) { _compDeepLinkDone.current = true; return; }
    const c = competitions.find(x => x.id === cid);
    if (c) {
      _compDeepLinkDone.current = true;
      openRegistrations(c);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [competitions]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setShowForm(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name:c.name, description:c.description||'', gymId:c.gymId||'gym-hsinchu',
      registrationStart:c.registrationStart, registrationEnd:c.registrationEnd,
      earlyBirdDeadline:c.earlyBirdDeadline||'', eventDate:c.eventDate,
      divisions: c.divisions?.length ? c.divisions.map(d=>({ id:d.id, name:d.name, maxParticipants:d.maxParticipants||40, waitlistMax:d.waitlistMax||5 })) : emptyForm().divisions,
      fees: { ...emptyForm().fees, ...(c.fees || {}) }, // 舊賽事若缺新欄位（如保險費）→ 補上預設值，避免輸入框空白
      refundPolicies: c.refundPolicies || emptyForm().refundPolicies,
      waiverContent: c.waiverContent||{zh:'',en:''},
      scoringSystem:c.scoringSystem, webhookUrl:c.webhookUrl||'', status:c.status,
      paymentDeadlineDays: c.paymentDeadlineDays ?? 3,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showMsg('請輸入賽事名稱','red'); return; }
    if (form.divisions.some(d=>!d.name.trim())) { showMsg('請填寫所有組別名稱','red'); return; }
    setSaving(true);
    try {
      const payload = { ...form, scoringSystem:'competition_management_v2', webhookUrl:null };
      let promotedCount = 0;
      if (editingId) { const r = await updateCompetition(editingId, payload); promotedCount = r.data?.competition?.promotedCount || 0; }
      else await createCompetition(payload);
      showMsg(editingId ? (promotedCount > 0 ? `賽事已更新，並自動遞補 ${promotedCount} 位候補為正取` : '賽事已更新') : '賽事已建立');
      setShowForm(false); await loadCompetitions();
    } catch(err) { showMsg(err.response?.data?.message||'儲存失敗','red'); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (c, status) => {
    try { await updateCompetition(c.id, { status }); showMsg('狀態已更新'); await loadCompetitions(); }
    catch(err) { showMsg('更新失敗','red'); }
  };

  const [syncingId, setSyncingId] = useState(null);
  const startScoring = async (c) => {
    if (!c.scoringSyncEnabled && !window.confirm(`開始與計分系統對接「${c.name}」？\n會在計分系統建立此賽事，並把目前所有正取報名推送過去。之後新報名也會即時同步。`)) return;
    setSyncingId(c.id);
    try {
      const r = await client.post(`/competitions/${c.id}/sync-scoring`);
      showMsg(r.data.message || '已開始對接');
      await loadCompetitions();
    } catch(e){ showMsg(e.response?.data?.message || '對接失敗','red'); }
    finally { setSyncingId(null); }
  };

  // 2026-08-27：賽事已結束、計分系統總管理者在計分系統按過「回寫成績至會員紀錄」後，這裡拉一次
  // 把組別名次/參賽人數寫進 RedRock 自己的報名紀錄（competitionRegistrations.result），供會員在
  // 「我的紀錄」看到自己的比賽成績——與上面「開始對接」方向相反，各自獨立按鈕、獨立呼叫。
  const [pullingId, setPullingId] = useState(null);
  const pullResults = async (c) => {
    if (!window.confirm(`拉取「${c.name}」的最終成績並寫回會員報名紀錄？\n請先確認在計分系統已標記「此賽事已結束」並按過「回寫成績至會員紀錄」，否則會拉取失敗。`)) return;
    setPullingId(c.id);
    try {
      const r = await client.post(`/competitions/${c.id}/pull-results`);
      showMsg(r.data.message || '已寫回成績');
    } catch(e){ showMsg(e.response?.data?.message || '拉取失敗，請確認計分系統是否已回寫成績','red'); }
    finally { setPullingId(null); }
  };

  // 計分系統（comp.redrocktaiwan.com）SSO 進入點——2026-08-26 起，計分系統管理員一律從這裡進入
  // （首頁「管理員功能」卡片、底部導覽「設定」分頁、頁面頂部原本常駐的 ⚙️ 圖示皆已從計分系統
  // 移除）。原本每場賽事各自一顆「計分系統設定」深連結按鈕已拿掉——計分系統登入後右上角本身就
  // 有一顆「僅登入者可見」的 ⚙️ 設定圖示，可在系統內直接切換到任一場賽事再進設定，不需要每場都
  // 從員工端另開一個深連結；只留這顆「+新增賽事」旁的通用進入點。
  //
  // ⚠️ 2026-08-26 修：原本先 await SSO 換 token、拿到後才 window.open——中間隔了一次 await，
  // 部分瀏覽器會判定這次 window.open 已經脫離「使用者手勢」的當下，直接靜默擋掉彈窗（沒有跳出
  // 「已封鎖彈出式視窗」提示，只是新分頁完全沒開，或開了一個空白分頁但沒有導向），導致按鈕看起來
  // 「按了沒反應／沒有跳轉到設定頁」。改法：window.open 一定要在 onClick 的同一個事件循環（await
  // 之前）就先呼叫、拿到分頁的 window 參考，換好 token 之後再用 win.location.href 導頁——這樣
  // window.open 本身仍在使用者手勢的當下觸發，不會被擋。
  const [scoringOpeningGeneral, setScoringOpeningGeneral] = useState(false);
  const openScoringSystemGeneral = async () => {
    const win = window.open('', '_blank');
    setScoringOpeningGeneral(true);
    try {
      const r = await ssoCompAuth();
      const url = `https://comp.redrocktaiwan.com/?${new URLSearchParams({ ssoToken: r.data.token }).toString()}`;
      if (win && !win.closed) win.location.href = url;
      else window.open(url, '_blank', 'noopener');
    } catch (e) {
      if (win && !win.closed) win.close();
      showMsg(e.response?.data?.message || '無法進入計分系統（此帳號可能未被指派為計分系統管理員）', 'red');
    } finally { setScoringOpeningGeneral(false); }
  };

  const handleDelete = async (c) => {
    setConfirmDeleteComp(null);
    try {
      await client.delete(`/competitions/${c.id}`);
      showMsg('比賽已刪除');
      await loadCompetitions();
    } catch(err) { showMsg('刪除失敗','red'); }
  };

  const openRegistrations = async (c) => {
    setShowRegistrations(c); setRegLoading(true);
    try { const r = await getCompetitionRegistrations(c.id); setRegistrations(r.data.registrations||[]); }
    catch(e) { setRegistrations([]); } finally { setRegLoading(false); }
  };

  const handleDownloadRefundCSV = (c) => {
    const refunds = registrations.filter(r => r.refundRequested || r.status === 'cancelled');
    if (!refunds.length) { alert('目前沒有退費申請記錄'); return; }
    const headers = ['序號','姓名','組別','報名費','付款狀態','取消時間','原匯款末五碼','退費銀行代碼','退費銀行','退費帳號','退費戶名','取消原因'];
    const rows = refunds.map((r,i) => [
      i+1, `"${r.memberName||''}"`, `"${r.divisionName||''}"`,
      r.registrationFee||'', r.paymentStatus||'pending',
      r.cancelledAt?._seconds ? new Date(r.cancelledAt._seconds*1000).toLocaleString('zh-TW') : '',
      r.bankLastFive||'',
      r.refundBankCode||'', `"${r.refundBankName||''}"`, r.refundAccount||'', `"${r.refundAccountName||''}"`,
      `"${r.cancelReason||''}"`,
    ].join(','));
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`refunds_${c.name}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const handleDownloadCSV = async (c) => {
    try {
      const API = import.meta.env.VITE_API_BASE || 'https://api.redrocktaiwan.com';
      const tok = localStorage.getItem('operatorToken') || localStorage.getItem('token') || localStorage.getItem('stationToken') || '';
      const r = await fetch(`${API}/competitions/${c.id}/registrations/download`, { headers: { Authorization: `Bearer ${tok}` } });
      if (!r.ok) { const t = await r.text().catch(()=>''); throw new Error(r.status === 403 ? '權限不足' : `${r.status} ${t.slice(0,120)}`); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `${c.name}_報名名單_${new Date().toISOString().slice(0,10)}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) { showMsg('下載失敗：' + e.message, 'red'); }
  };

  const handleDownloadInsuranceRoster = async (c, format) => {
    try {
      const API = import.meta.env.VITE_API_BASE || 'https://api.redrocktaiwan.com';
      const tok = localStorage.getItem('operatorToken') || localStorage.getItem('token') || localStorage.getItem('stationToken') || '';
      const r = await fetch(`${API}/competitions/${c.id}/insurance-roster/download?format=${format}`, { headers: { Authorization: `Bearer ${tok}` } });
      if (!r.ok) { const t = await r.text().catch(()=>''); throw new Error(r.status === 403 ? '權限不足' : `${r.status} ${t.slice(0,120)}`); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `${c.name}_簽到表暨保險名冊_${new Date().toISOString().slice(0,10)}.${format}`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) { showMsg('下載失敗：' + e.message, 'red'); }
  };

  // 賽前通知：開啟 Modal 時預帶一份可編輯草稿 + 併行載入收件人數量
  const openNotice = async (c) => {
    setNoticeModal(c);
    setNoticeSubject(`【紅石攀岩】${c.name} 賽前提醒`);
    setNoticeBody(`您好，\n\n「${c.name}」即將於 ${c.eventDate} 舉行，提醒您：\n\n・請提前 30 分鐘完成報到\n・攜帶身分證件供現場核對確認\n・如有任何問題請聯繫櫃檯\n\n紅石攀岩館 敬上`);
    setNoticeRecipients(null);
    try {
      const r = await client.get(`/competitions/${c.id}/participant-emails`);
      setNoticeRecipients(r.data);
    } catch (e) { setNoticeRecipients({ recipients: [], count: 0, error: true }); }
  };
  const sendNotice = async () => {
    if (!noticeSubject.trim() || !noticeBody.trim()) { showMsg('請填寫主旨與內容', 'red'); return; }
    setNoticeSending(true);
    try {
      // 純文字草稿轉簡易 HTML（escape 防注入 + 換行轉段落）
      const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const html = noticeBody.split('\n').map(line => line.trim() ? `<p style="margin:0 0 8px">${esc(line)}</p>` : '<br/>').join('');
      const r = await client.post(`/competitions/${noticeModal.id}/send-notice`, { subject: noticeSubject, body: html });
      showMsg(r.data.message || '已發送');
      setNoticeModal(null);
    } catch (e) { showMsg(e.response?.data?.message || '發送失敗', 'red'); }
    finally { setNoticeSending(false); }
  };

  const updateDivision = (idx, patch) => setForm(f=>({ ...f, divisions: f.divisions.map((d,i)=>i===idx?{...d,...patch}:d) }));
  const addDivision = () => setForm(f=>({ ...f, divisions:[...f.divisions,{ id:`d${Date.now()}`, name:'', maxParticipants:40, waitlistMax:5 }] }));
  const removeDivision = (idx) => { if(form.divisions.length<=1) return; setForm(f=>({ ...f, divisions:f.divisions.filter((_,i)=>i!==idx) })); };
  const updatePolicy = (idx, patch) => setForm(f=>({ ...f, refundPolicies: f.refundPolicies.map((p,i)=>i===idx?{...p,...patch}:p) }));
  const addPolicy = () => setForm(f=>({ ...f, refundPolicies:[...f.refundPolicies,{ deadline:'', rule:'full_minus_admin', adminFee:100 }] }));
  const removePolicy = (idx) => setForm(f=>({ ...f, refundPolicies:f.refundPolicies.filter((_,i)=>i!==idx) }));

  const payStatusInfo = (r) => {
    if (r.paymentStatus==='confirmed') return { type:'ok', label:'已付款' };
    if (r.paymentStatus==='refunded') return { type:'gray', label:'已退費' };
    if (r.paymentStatus==='transfer_rejected') return { type:'red', label:'已退回待補正' };
    return { type:'warn', label:'待付款' };
  };
  const fmtDeadline = (d) => {
    const s = d?._seconds ?? d?.seconds;
    if (s) return dayjs(s*1000).format('MM/DD HH:mm');
    return typeof d==='string' ? dayjs(d).format('MM/DD HH:mm') : '—';
  };
  // 報名付款狀態機（供名單依狀態顯示按鈕 + 下拉篩選）
  const regState = (r) => {
    if (r.status==='cancelled') return 'cancelled';
    if (r.status==='waitlist') return 'waitlist';
    if (r.paymentStatus==='confirmed') return 'paid';           // C 已收款
    if (r.paymentStatus==='transfer_rejected') return 'rejected'; // 已要求重填，待會員
    const hasInfo = !!(r.bankLastFive || r.paymentStatus==='pending_confirm' || r.paymentMethod==='cash');
    return hasInfo ? 'awaitConfirm' : 'awaitPayment';           // B 待確認 / A 未填匯款
  };
  const STATE_LABEL = { awaitPayment:'未填匯款', awaitConfirm:'待確認收款', paid:'已收款', rejected:'已要求重填', waitlist:'候補中', cancelled:'已取消' };
  // 名單精簡列：繳費狀態文字+顏色、備註（特殊狀況）。注意勿與模組層 STATUS_LABEL（競賽狀態）同名 → 用 PAY_STATUS
  const PAY_STATUS = {
    awaitPayment:{t:'未填匯款',c:'#854F0B'}, awaitConfirm:{t:'待確認收款',c:'#185FA5'}, paid:{t:'已收款',c:'#2D7D46'},
    rejected:{t:'已要求重填',c:'#A32D2D'}, waitlist:{t:'候補中',c:'#854F0B'}, cancelled:{t:'已取消',c:'#999'},
  };
  const regRemark = (r) => {
    const a = [];
    if (r.isHonorary) a.push('榮譽');
    if (r.memberNote || r.customFieldValues?.notes) a.push('備註');
    if (r.isPartnerGymDiscount) a.push(r.partnerGymPending ? '友館待核' : '友館');
    if (r.isEarlyBird) a.push('早鳥');
    if (r.isTeamDiscount) a.push('隊員9折');
    if (r.paymentMethod==='cash' && r.status!=='cancelled') a.push('臨櫃');
    if (r.status==='waitlist' && r.waitlistPosition) a.push(`候補#${r.waitlistPosition}`);
    if (r.formReturned && r.status!=='cancelled') a.push('退回修改中');
    if (!r.isComplete && r.status!=='cancelled') a.push('待法代簽');
    if (r.refundRequested && r.status==='cancelled') a.push('申請退費');
    if (r.formRejected && r.status==='cancelled') a.push('已駁回');
    if (r.cancelReason==='payment_expired') a.push('逾期取消');
    return a;
  };

  return (
    <div style={{ padding:24, maxWidth:900, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:20, fontWeight:700, color:'#1a1a1a' }}>🏆 賽事管理</div>
        {canManage && <div style={{ display:'flex', gap:8 }}>
          <button onClick={openScoringSystemGeneral} disabled={scoringOpeningGeneral}
            style={{ height:36, padding:'0 16px', borderRadius:8, background:'#fff', color:'#185FA5', border:'0.5px solid #185FA5', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            {scoringOpeningGeneral ? '進入中…' : '🎯 進入賽事計分系統'}
          </button>
          <button onClick={openSponsors}
            style={{ height:36, padding:'0 16px', borderRadius:8, background:'#fff', color:'#8B6914', border:'0.5px solid #C9A227', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            🤝 贊助商 Logo
          </button>
          <button onClick={openCreate} style={{ height:36, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>+ 新增賽事</button>
        </div>}
      </div>

      {msg && <div style={{ background:msgType==='ok'?'#E6F4EB':'#FCEBEB', border:`0.5px solid ${msgType==='ok'?'#B3DEC0':'#F5C4C4'}`, borderRadius:8, padding:'8px 14px', marginBottom:14, fontSize:13, color:msgType==='ok'?'#2D7D46':'#A32D2D' }}>{msg}</div>}

      {/* 贊助商 Logo 管理 Modal（顯示於計分系統首頁，設顯示期間） */}
      {sponsorOpen && (
        <div onClick={() => setSponsorOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:560, maxHeight:'85vh', overflowY:'auto', WebkitOverflowScrolling:'touch', padding:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:16, fontWeight:700, color:'#1a1a1a' }}>🤝 贊助商 Logo（計分系統首頁）</div>
              <button onClick={() => setSponsorOpen(false)} style={{ border:'none', background:'none', fontSize:18, cursor:'pointer', color:'#999' }}>✕</button>
            </div>
            <div style={{ fontSize:12, color:'#666', marginBottom:14, textAlign:'left', lineHeight:1.6 }}>
              Logo 會顯示在 comp.redrocktaiwan.com 首頁「比賽清單」下方，只在顯示期間內出現、到期自動下架。各場比賽共用同一份清單。
            </div>
            {/* 新增 */}
            <div style={{ background:'#F7F3F3', borderRadius:10, padding:12, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#8B1A1A', marginBottom:8, textAlign:'left' }}>＋ 新增贊助商</div>
              <input value={spForm.name} onChange={e => setSpForm(p2 => ({ ...p2, name:e.target.value }))} placeholder="贊助商名稱"
                style={{ width:'100%', height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, marginBottom:8, boxSizing:'border-box' }} />
              <div style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
                <input type="date" value={spForm.startDate} onChange={e => setSpForm(p2 => ({ ...p2, startDate:e.target.value }))}
                  style={{ flex:1, height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:13, boxSizing:'border-box' }} />
                <span style={{ color:'#999' }}>～</span>
                <input type="date" value={spForm.endDate} onChange={e => setSpForm(p2 => ({ ...p2, endDate:e.target.value }))}
                  style={{ flex:1, height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:13, boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <input type="file" accept="image/*" onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  try { const dataUrl = await readSponsorLogo(f); setSpForm(p2 => ({ ...p2, logo:dataUrl })); }
                  catch { showMsg('圖片處理失敗，請換一張圖檔', 'err'); }
                }} style={{ fontSize:12, flex:1 }} />
                {spForm.logo && <img src={spForm.logo} alt="預覽" style={{ height:36, maxWidth:90, objectFit:'contain', background:'#fff', borderRadius:6, border:'0.5px solid #eee' }} />}
                <button onClick={submitSponsor} disabled={spBusy}
                  style={{ height:34, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer', opacity:spBusy?0.6:1 }}>
                  {spBusy ? '上傳中…' : '新增'}
                </button>
              </div>
            </div>
            {/* 清單 */}
            {sponsors === null ? <div style={{ color:'#999', fontSize:13, padding:12 }}>載入中…</div>
              : sponsors.length === 0 ? <div style={{ color:'#999', fontSize:13, padding:12 }}>尚無贊助商 Logo</div>
              : sponsors.map(sp => {
                  const today = dayjs().format('YYYY-MM-DD');
                  const live = (sp.startDate || '') <= today && today <= (sp.endDate || '');
                  return (
                    <div key={sp.id} style={{ border:'0.5px solid #eee', borderRadius:10, padding:10, marginBottom:10, display:'flex', gap:10, alignItems:'center' }}>
                      <img src={sp.logo} alt={sp.name} style={{ height:40, width:90, objectFit:'contain', background:'#fafafa', borderRadius:6, flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0, textAlign:'left' }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{sp.name}
                          <span style={{ marginLeft:6, fontSize:10.5, padding:'1px 6px', borderRadius:4, background: live ? '#E6F4EB' : '#F5F5F5', color: live ? '#2D7D46' : '#999' }}>{live ? '顯示中' : '未在期間'}</span>
                        </div>
                        <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:4 }}>
                          <input type="date" value={sp.startDate || ''} onChange={e => setSponsors(prev => prev.map(x => x.id === sp.id ? { ...x, startDate:e.target.value } : x))}
                            style={{ height:28, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 6px', fontSize:12 }} />
                          <span style={{ color:'#999', fontSize:12 }}>～</span>
                          <input type="date" value={sp.endDate || ''} onChange={e => setSponsors(prev => prev.map(x => x.id === sp.id ? { ...x, endDate:e.target.value } : x))}
                            style={{ height:28, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 6px', fontSize:12 }} />
                          <button onClick={() => updateSponsorPeriod(sp)}
                            style={{ height:28, padding:'0 10px', borderRadius:6, border:'0.5px solid #185FA5', background:'#fff', color:'#185FA5', fontSize:12, cursor:'pointer' }}>儲存期間</button>
                        </div>
                      </div>
                      <button onClick={() => deleteSponsor(sp)}
                        style={{ height:30, padding:'0 10px', borderRadius:6, border:'0.5px solid #F5C4C4', background:'#fff', color:'#A32D2D', fontSize:12, cursor:'pointer', flexShrink:0 }}>刪除</button>
                    </div>
                  );
                })}
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign:'center', color:'#999', padding:40 }}>載入中...</div> : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {competitions.length===0 && <div style={{ textAlign:'center', color:'#999', padding:40 }}>尚無賽事</div>}
          {competitions.map(c => {
            const sl = STATUS_LABEL[c.status]||STATUS_LABEL.draft;
            const regEnded = c.status==='open' && c.registrationEnd && dayjs().format('YYYY-MM-DD') > c.registrationEnd;
            return (
              <div key={c.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:15 }}>{c.name}</div>
                    <div style={{ fontSize:12, color:'#999', marginTop:3, lineHeight:1.8 }}>
                      <div>🗓 比賽日：{c.eventDate}</div>
                      <div style={regEnded ? { color:'#A32D2D', fontWeight:700 } : undefined}>⏰ 報名截止：{c.registrationEnd}{regEnded ? '（已過期，會員端已自動擋新報名，仍開放中如需下架請手動改狀態）' : ''}</div>
                      {c.earlyBirdDeadline && <div>🐦 早鳥：{c.earlyBirdDeadline}</div>}
                    </div>
                    <div style={{ fontSize:12, color:'#999', marginTop:2, lineHeight:1.8 }}>
                      <div>🧗 組別：</div>
                      {(c.divisions||[]).map(d=>(
                        <div key={d.id} style={{ paddingLeft:18 }}>{d.name}（{d.maxParticipants} 人＋候補 {d.waitlistMax}）</div>
                      ))}
                    </div>
                  </div>
                  <Tag type={sl.type}>{sl.label}</Tag>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {canManage && <>
                    <button onClick={()=>openEdit(c)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#8B1A1A', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer' }}>編輯</button>
                    {c.status==='draft' && <button onClick={()=>handleStatusChange(c,'open')} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#E6F4EB', color:'#2D7D46', border:'0.5px solid #B3DEC0', fontSize:12, cursor:'pointer' }}>開放報名</button>}
                    {c.status==='open'   && <button onClick={()=>handleStatusChange(c,'closed')} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FCEBEB', color:'#A32D2D', border:'0.5px solid #F5C4C4', fontSize:12, cursor:'pointer' }}>關閉報名</button>}
                    {c.status==='closed' && <button onClick={()=>handleStatusChange(c,'open')} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#E6F4EB', color:'#2D7D46', border:'0.5px solid #B3DEC0', fontSize:12, cursor:'pointer' }}>重新開放</button>}
                    <button onClick={()=>openRegistrations(c)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#E6F1FB', color:'#185FA5', border:'0.5px solid #B5D4F4', fontSize:12, cursor:'pointer' }}>查看名單</button>
                    {c.status==='open' && <button onClick={()=>copyCompLink(c)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#fff', color:'#2D7D46', border:'0.5px solid #2D7D46', fontSize:12, cursor:'pointer' }}>🔗 連結</button>}
                    {c.status==='open' && <button onClick={()=>copyPublicCompLink(c)} title="免登入，非會員也能用此連結報名" style={{ height:30, padding:'0 12px', borderRadius:6, background:'#fff', color:'#185FA5', border:'0.5px solid #185FA5', fontSize:12, cursor:'pointer' }}>🔗 公開報名連結</button>}
                    {c.status==='open' && <SimulateRegistrationButton type="competition" targetId={c.id} btnStyle={{ height:30, padding:'0 12px', borderRadius:6, background:'#fff', color:'#8B4513', border:'0.5px solid #C99', fontSize:12, cursor:'pointer' }} />}
                    {c.scoringSystem==='competition_management_v2' && (
                      <button onClick={()=>startScoring(c)} disabled={syncingId===c.id}
                        title={c.scoringSyncEnabled ? '已對接，可重新推送目前名單' : '在計分系統建立此賽事並推送目前正取名單'}
                        style={{ height:30, padding:'0 12px', borderRadius:6,
                          background: c.scoringSyncEnabled ? '#fff' : '#8B1A1A',
                          color: c.scoringSyncEnabled ? '#2D7D46' : '#fff',
                          border: c.scoringSyncEnabled ? '0.5px solid #2D7D46' : 'none', fontSize:12, cursor:'pointer' }}>
                        {syncingId===c.id ? '對接中…' : c.scoringSyncEnabled ? '✅ 已對接·重新推送' : '🔗 開始與計分系統對接'}
                      </button>
                    )}
                    {c.scoringSystem==='competition_management_v2' && c.scoringSyncEnabled && (
                      <button onClick={()=>pullResults(c)} disabled={pullingId===c.id}
                        title="賽事已結束、計分系統已回寫成績後，拉取最終名次寫進會員自己的「我的紀錄」"
                        style={{ height:30, padding:'0 12px', borderRadius:6, background:'#fff', color:'#4e8ef7', border:'0.5px solid #4e8ef7', fontSize:12, cursor:'pointer' }}>
                        {pullingId===c.id ? '拉取中…' : '📥 拉取成績寫回會員紀錄'}
                      </button>
                    )}
                    <button onClick={()=>openNotice(c)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#8B4513', border:'0.5px solid #D4B896', fontSize:12, cursor:'pointer' }}>📧 賽前通知</button>
                    <button onClick={()=>openReminderBroadcast(c)} title="在會員 App 首頁「課程活動提醒」加一則自訂卡片給全部正取報名者" style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#8B1A1A', border:'0.5px solid #E8B4B4', fontSize:12, cursor:'pointer' }}>🔔 首頁提醒</button>
                    <button onClick={()=>handleDownloadCSV(c)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#185FA5', border:'0.5px solid #B5D4F4', fontSize:12, cursor:'pointer' }}>⬇ 下載名單</button>
                    <button onClick={()=>handleDownloadInsuranceRoster(c,'xlsx')} title="簽到表暨保險名冊（含簽名截圖）" style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#2D7D46', border:'0.5px solid #B5E4C4', fontSize:12, cursor:'pointer' }}>⬇ 保險名冊(xlsx)</button>
                    <button onClick={()=>handleDownloadInsuranceRoster(c,'pdf')} title="簽到表暨保險名冊（含簽名截圖）" style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FBF5F5', color:'#A32D2D', border:'0.5px solid #F0C4C4', fontSize:12, cursor:'pointer' }}>⬇ 保險名冊(PDF)</button>
                    <button onClick={()=>setConfirmDeleteComp(c)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#FCEBEB', color:'#A32D2D', border:'0.5px solid #F5C4C4', fontSize:12, cursor:'pointer' }}>🗑 刪除</button>
                  </>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 建立/編輯 Modal */}
      {showForm && (
        <Modal title={editingId?'編輯賽事':'新增賽事'} onClose={()=>setShowForm(false)} width={680}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <div style={{ gridColumn:'1/-1' }}><label style={lbl}>賽事名稱</label><input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><label style={lbl}>比賽日期</label><input type="date" style={inp} value={form.eventDate} onChange={e=>setForm(f=>({...f,eventDate:e.target.value}))}/></div>
            <div><label style={lbl}>場館</label>
              <select style={inp} value={form.gymId} onChange={e=>setForm(f=>({...f,gymId:e.target.value}))}>
                <option value="gym-hsinchu">新竹館</option>
                <option value="gym-shilin">士林館</option>
              </select>
            </div>
            <div><label style={lbl}>報名開始</label><input type="date" style={inp} value={form.registrationStart} onChange={e=>setForm(f=>({...f,registrationStart:e.target.value}))}/></div>
            <div><label style={lbl}>報名截止</label><input type="date" style={inp} value={form.registrationEnd} onChange={e=>setForm(f=>({...f,registrationEnd:e.target.value}))}/></div>
            <div><label style={lbl}>早鳥截止日</label><input type="date" style={inp} value={form.earlyBirdDeadline} onChange={e=>setForm(f=>({...f,earlyBirdDeadline:e.target.value}))}/></div>
          </div>

          {/* 組別設定 */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>組別設定</div>
              <button onClick={addDivision} style={{ height:26, padding:'0 10px', borderRadius:6, background:'#FBF5F5', color:'#8B1A1A', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer' }}>+ 新增組別</button>
            </div>
            {form.divisions.map((d,i)=>(
              <div key={d.id} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 28px', gap:8, marginBottom:8, alignItems:'center' }}>
                <input style={inp} placeholder="組別名稱（如 V2-V3組）" value={d.name} onChange={e=>updateDivision(i,{name:e.target.value})}/>
                <input type="number" style={{...inp, padding:'0 8px'}} placeholder="人數" value={d.maxParticipants} onChange={e=>updateDivision(i,{maxParticipants:Number(e.target.value)})}/>
                <input type="number" style={{...inp, padding:'0 8px'}} placeholder="候補" value={d.waitlistMax} onChange={e=>updateDivision(i,{waitlistMax:Number(e.target.value)})}/>
                <button onClick={()=>removeDivision(i)} style={{ width:28, height:28, borderRadius:6, background:'#FCEBEB', color:'#A32D2D', border:'none', fontSize:14, cursor:'pointer' }}>✕</button>
              </div>
            ))}
            <div style={{ fontSize:11, color:'#999' }}>欄位順序：組別名稱 / 人數上限 / 候補名額</div>
          </div>

          {/* 費用設定 */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>費用設定</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              {[
                { k:'adultEarlyBird', label:'成人早鳥' },
                { k:'adultRegular', label:'成人一般' },
                { k:'teamMemberDiscount', label:'隊員折扣（如0.9）' },
                { k:'childEarlyBird', label:'兒童早鳥' },
                { k:'childRegular', label:'兒童一般' },
                { k:'childAgeLimit', label:'兒童年齡上限（歲）' },
                { k:'partnerGymDiscount', label:'友館折扣（如0.95，空=不開放）' },
                { k:'insuranceAdult', label:'成人保險費' },
                { k:'insuranceChild', label:'兒童保險費' },
              ].map(({k,label})=>(
                <div key={k}>
                  <label style={lbl}>{label}</label>
                  <input type="number" style={inp} value={form.fees[k]} onChange={e=>setForm(f=>({...f,fees:{...f.fees,[k]:Number(e.target.value)}}))}/>
                </div>
              ))}
            </div>
          </div>

          {/* 退費政策 */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>退費政策</div>
              <button onClick={addPolicy} style={{ height:26, padding:'0 10px', borderRadius:6, background:'#FBF5F5', color:'#8B1A1A', border:'0.5px solid #E8D5D5', fontSize:12, cursor:'pointer' }}>+ 新增</button>
            </div>
            {form.refundPolicies.map((p,i)=>(
              <div key={i} style={{ display:'grid', gridTemplateColumns:'120px 1fr 80px 28px', gap:8, marginBottom:8, alignItems:'center' }}>
                <input type="date" style={inp} value={p.deadline} onChange={e=>updatePolicy(i,{deadline:e.target.value})}/>
                <select style={inp} value={p.rule} onChange={e=>updatePolicy(i,{rule:e.target.value})}>
                  <option value="full_minus_admin">全額退（扣行政費）</option>
                  <option value="half_minus_admin">半額退（扣行政費）</option>
                  <option value="no_refund">不退費</option>
                </select>
                <input type="number" style={inp} placeholder="行政費" value={p.adminFee} onChange={e=>updatePolicy(i,{adminFee:Number(e.target.value)})}/>
                <button onClick={()=>removePolicy(i)} style={{ width:28, height:28, borderRadius:6, background:'#FCEBEB', color:'#A32D2D', border:'none', fontSize:14, cursor:'pointer' }}>✕</button>
              </div>
            ))}
          </div>

          {/* Webhook & waiver */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div><label style={lbl}>狀態</label>
              <select style={inp} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                <option value="draft">草稿</option>
                <option value="open">開放報名</option>
                <option value="closed">已截止</option>
              </select>
            </div>
            <div><label style={lbl}>繳款期限（報名日 + N 天）</label>
              <input type="number" min={1} style={inp} value={form.paymentDeadlineDays}
                onChange={e=>setForm(f=>({...f,paymentDeadlineDays:e.target.value}))}/>
              <div style={{ fontSize:10, color:'#999', marginTop:3 }}>逾期未完成繳費（含臨櫃繳款）自動剔除名單</div>
            </div>
            <div style={{ gridColumn:'1/-1' }}><label style={lbl}>賽事說明</label><textarea rows={3} style={{...inp, height:'auto', padding:'8px 12px', resize:'none'}} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
            <div style={{ gridColumn:'1/-1' }}><label style={lbl}>同意書內容（繁中）</label><textarea rows={4} style={{...inp, height:'auto', padding:'8px 12px', resize:'none'}} value={form.waiverContent.zh} onChange={e=>setForm(f=>({...f,waiverContent:{...f.waiverContent,zh:e.target.value}}))}/></div>
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>setShowForm(false)} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
            <button onClick={handleSave} disabled={saving} style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>{saving?'儲存中...':'儲存賽事'}</button>
          </div>
        </Modal>
      )}

      {/* 報名名單 Modal */}
      {showRegistrations && (
        <Modal title={`報名名單 — ${showRegistrations.name}`} onClose={()=>setShowRegistrations(null)} width={760}>
          {/* 一行總計 */}
          <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>
            有效報名 <strong style={{ color:'#2D7D46' }}>{registrations.filter(r=>r.status!=='cancelled').length}</strong>
            {' · '}申請退費 <strong style={{ color:'#A32D2D' }}>{registrations.filter(r=>r.refundRequested).length}</strong>
            {' · '}已取消 <strong style={{ color:'#999' }}>{registrations.filter(r=>r.status==='cancelled'&&!r.refundRequested).length}</strong>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <SegmentedTabs wrap minTabWidth={130} value={regTab} onChange={setRegTab} style={{ flex:'1 1 280px', minWidth:0 }} tabs={[
              { key:'all',       label:`全部 (${registrations.filter(r=>r.status!=='cancelled').length})` },
              // 各組別分頁：點了直接看該組名單
              ...(showRegistrations.divisions||[]).map(dv => ({ key:`div_${dv.id}`, label:`${dv.name} (${registrations.filter(r=>r.divisionId===dv.id && r.status!=='cancelled').length})` })),
              { key:'refund',    label:`申請退費 (${registrations.filter(r=>r.refundRequested).length})` },
              { key:'cancelled', label:`已取消 (${registrations.filter(r=>r.status==='cancelled'&&!r.refundRequested).length})` },
            ]} />
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {regTab==='all' && (
                <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
                  style={{ height:30, borderRadius:6, border:'0.5px solid #E8D5D5', padding:'0 8px', fontSize:12, background:'#fff', color:'#444', cursor:'pointer' }}>
                  <option value="all">全部狀態</option>
                  <option value="awaitPayment">未填匯款</option>
                  <option value="awaitConfirm">待確認收款</option>
                  <option value="paid">已收款</option>
                  <option value="rejected">已要求重填</option>
                  <option value="waitlist">候補中</option>
                </select>
              )}
              <button onClick={()=>handleDownloadCSV(showRegistrations)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#185FA5', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>⬇ 名單</button>
              <button onClick={()=>handleDownloadRefundCSV(showRegistrations)} style={{ height:30, padding:'0 12px', borderRadius:6, background:'#A32D2D', color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>⬇ 退費清單</button>
            </div>
          </div>
          {regLoading ? <div style={{ textAlign:'center', color:'#999', padding:20 }}>載入中...</div> : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {registrations.length===0 && <div style={{ textAlign:'center', color:'#999', padding:20 }}>尚無報名記錄</div>}
              {(() => {
                const secOf = r => r.registeredAt?._seconds || r.registeredAt?.seconds || 0;
                let base;
                if (regTab==='refund') base = registrations.filter(r=>r.refundRequested);
                else if (regTab==='cancelled') base = registrations.filter(r=>r.status==='cancelled' && !r.refundRequested);
                else if (regTab.startsWith('div_')) { const did = regTab.slice(4); base = registrations.filter(r=>r.divisionId===did && r.status!=='cancelled'); }
                else base = registrations.filter(r=>r.status!=='cancelled');
                if (regTab==='all' && statusFilter!=='all') base = base.filter(r => regState(r)===statusFilter);
                return [...base].sort((a,b)=> secOf(a)-secOf(b));   // 依報名日期排序（早→晚）
              })().map(r => {
                const st = regState(r);
                const stl = PAY_STATUS[st] || { t:"—", c:"#666" };
                const remark = regRemark(r);
                const sec = r.registeredAt?._seconds || r.registeredAt?.seconds || 0;
                return (
                  <div key={r.id} onClick={()=>setRegDetail(r)} style={{ background:'#fff', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'10px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap' }}>
                        <span style={{ fontSize:14, fontWeight:600 }}>{r.memberName}</span>
                        {isManagerOnly && (
                          <span style={{ fontSize:11, color:'#666', whiteSpace:'nowrap' }}>實收 NT${r.receivedAmount ?? 0}</span>
                        )}
                        <span style={{ fontSize:11, color:'#888' }}>{r.divisionName}</span>
                        <span style={{ fontSize:11, color:'#888' }}>{r.gender==='male'?'男':r.gender==='female'?'女':'—'}</span>
                        <span style={{ fontSize:12, color:'#8B1A1A', fontWeight:600 }}>NT${r.registrationFee}</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4, flexWrap:'wrap' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:stl.c }}>{stl.t}</span>
                        <span style={{ fontSize:10, color:'#bbb' }}>報名 {sec?dayjs(sec*1000).format('MM/DD'):'—'}</span>
                        {remark.map((rm,i)=><span key={i} style={{ fontSize:10, background:'#FFF8E6', color:'#854F0B', padding:'1px 6px', borderRadius:6 }}>{rm}</span>)}
                      </div>
                    </div>
                    {canInvoice && r.status !== 'cancelled' && !r.refundRequested
                      && (r.invoiceNo || (r.receivedAmount ?? Math.max(0, (r.paidAmount ?? r.memberPaidAmount ?? r.registrationFee ?? 0) - (r.insuranceFee || 0))) > 0) && (
                      <InvoiceButtonView invoiceNo={r.invoiceNo}
                        onClick={(e) => { e.stopPropagation(); setInvoiceTarget(r); }} />
                    )}
                    <span style={{ fontSize:11, color:'#185FA5', flexShrink:0, whiteSpace:'nowrap' }}>詳細 ›</span>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {/* 報名詳細資料 Modal（點列開）：全部欄位 + 狀態動作鍵 */}
      {regDetail && (() => {
        const r = regDetail; const st = regState(r); const stl = PAY_STATUS[st] || { t:"—", c:"#666" };
        const sec = r.registeredAt?._seconds || r.registeredAt?.seconds || 0;
        const Row = (k, v) => <div key={k} style={{ display:'flex', fontSize:12, padding:'3px 0' }}><div style={{ width:84, color:'#999', flexShrink:0 }}>{k}</div><div style={{ color:'#333', wordBreak:'break-word' }}>{v || '—'}</div></div>;
        const act = () => {
          const B = (label,color,onClick,key) => <button key={key} onClick={onClick} style={{ height:34, padding:'0 14px', borderRadius:8, background:'#fff', color, border:`0.5px solid ${color}`, fontSize:13, cursor:'pointer' }}>{label}</button>;
          // 已收款後取消（退費申請）：「已取消」中唯一還需要人工動作的情境——按下即開退費 modal
          // （呼叫 /refund：標記已退費＋沖銷營收＋自動作廢已開發票；銀行匯款仍在系統外由店員自行處理）
          if (st === 'cancelled') {
            if (r.refundRequested && r.paymentStatus === 'confirmed') {
              return <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:14 }}>{B('處理退費','#A32D2D',()=>{ setRegDetail(null); setActionModal({type:'refund',reg:r}); },'refund')}</div>;
            }
            return null;
          }
          const btns = [];
          if (st==='awaitConfirm') {
            btns.push(B('確認收款','#2D7D46',()=>{ setRegDetail(null); setActionModal({type:'pay',reg:r}); },'pay'));
            if (r.paymentMethod!=='cash') btns.push(B('要求重填匯款','#854F0B',()=>{ setRegDetail(null); setFormAction({type:'rejectPayment',reg:r}); setFormReason(''); },'rp'));
          }
          if (st!=='awaitPayment' && st!=='rejected') {
            if (r.formReturned) btns.push(<span key="fr" style={{ fontSize:12, color:'#854F0B', alignSelf:'center' }}>已退回・待會員修正</span>);
            else btns.push(B('退回修改','#854F0B',()=>{ setRegDetail(null); setFormAction({type:'return',reg:r}); setFormReason(''); },'ret'));
          }
          btns.push(B('駁回報名','#A32D2D',()=>{ setRegDetail(null); setFormAction({type:'reject',reg:r}); setFormReason(''); },'rej'));
          if (r.isPartnerGymDiscount && r.partnerGymPending) {
            btns.push(B('核准友館折扣','#2D7D46',async()=>{ try { await verifyCompetitionPartnerGym(r.id, true); setRegDetail(null); await load(); } catch(e){ alert(e.response?.data?.message||'操作失敗'); } },'vpg'));
            btns.push(B('取消友館折扣','#854F0B',async()=>{ if(!window.confirm('確定取消此友館折扣、費用改回原價？')) return; try { await verifyCompetitionPartnerGym(r.id, false); setRegDetail(null); await load(); } catch(e){ alert(e.response?.data?.message||'操作失敗'); } },'rpg'));
          }
          return <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:14 }}>{btns}</div>;
        };
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={()=>setRegDetail(null)}>
            <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, padding:20, width:'100%', maxWidth:440, maxHeight:'88vh', overflowY:'auto' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:700 }}>{r.memberName} {r.isHonorary && <span style={{ fontSize:10, background:'#FAEEDA', color:'#854F0B', padding:'1px 6px', borderRadius:6 }}>榮譽</span>}</div>
                  <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{r.gender==='male'?'男':r.gender==='female'?'女':'—'} · NT${r.registrationFee}</div>
                </div>
                <span style={{ fontSize:12, fontWeight:600, color:stl.c, whiteSpace:'nowrap' }}>{stl.t}</span>
              </div>
              <div style={{ marginBottom:8 }}>
                {canManage ? (
                  <RegDivisionHonoraryEditor reg={r} divisions={showRegistrations?.divisions}
                    onSaved={(id, patch) => {
                      const resolved = { ...patch };
                      if (patch.divisionId) {
                        const dv = (showRegistrations?.divisions || []).find(d => d.id === patch.divisionId);
                        if (dv) resolved.divisionName = dv.name;
                      }
                      setRegDetail(d => d && d.id === id ? { ...d, ...resolved } : d);
                      setRegistrations(list => list.map(x => x.id === id ? { ...x, ...resolved } : x));
                    }} />
                ) : (
                  <span style={{ fontSize:12, color:'#666' }}>{r.divisionName}</span>
                )}
              </div>
              <div style={{ borderTop:'0.5px solid #F0E4E4', paddingTop:8 }}>
                {Row('報名日期', sec?dayjs(sec*1000).format('YYYY-MM-DD HH:mm'):'—')}
                {Row('費用', `NT$${r.registrationFee}${r.isEarlyBird?'（早鳥）':''}${r.isTeamDiscount?'（隊員9折）':''}${r.isPartnerGymDiscount?'（友館折扣）':''}`)}
                {r.isPartnerGymDiscount && Row('友館', `${r.partnerGym||'友館'}${r.partnerGymPending?'（⏳ 待核對）':'（✓ 已核對）'}`)}
                {Row('付款方式', r.paymentMethod==='cash'?'臨櫃現金':r.paymentMethod==='transfer'?'銀行轉帳':(r.paymentMethod||'—'))}
                {(r.paymentMethod==='transfer' || r.bankLastFive) && Row('匯款末五碼', r.bankLastFive)}
                {(r.paymentMethod==='transfer' || r.bankName) && Row('匯款銀行', r.bankName)}
                {r.paymentDate && Row('繳款日期', r.paymentDate)}
                {r.paymentStatus==='confirmed' && Row('確認收款', `NT$${r.paidAmount||r.registrationFee}｜${r.paidConfirmedByName||'—'}`)}
                {r.insuranceFee != null && Row('保險費', `NT$${r.insuranceFee}${r.isChild?'（兒童）':'（成人）'}`)}
                {Row('實收金額', isManagerOnly
                  ? <RegReceivedAmountEditor reg={r} onSaved={(id, amt) => {
                      setRegDetail(d => d && d.id === id ? { ...d, receivedAmount: amt, receivedAmountOverride: amt } : d);
                      setRegistrations(list => list.map(x => x.id === id ? { ...x, receivedAmount: amt, receivedAmountOverride: amt } : x));
                    }} />
                  : <span style={{ fontWeight:600, color:'#8B1A1A' }}>NT${r.receivedAmount ?? 0}</span>)}
                {Row('身高／臂展', `${r.height||'—'} ／ ${r.armSpan||'—'}`)}
                {Row('身分證', r.idNumber)}
                {Row('緊急聯絡', `${r.emergencyContact||'—'}${r.emergencyRelation?`（${r.emergencyRelation}）`:''} ${r.emergencyPhone||''}`)}
                {Row('手機／Email', `${r.phone||'—'} ／ ${r.email||'—'}`)}
                {Row('簽署狀態', r.isComplete?'已簽署':'待法定代理人簽')}
                {r.refundAccount && Row('退費帳號', `(${r.refundBankCode||''}) ${r.refundBankName||''} ${r.refundAccount} ${r.refundAccountName||''}`)}
                {(r.formReturnReason && r.status!=='cancelled') && <div style={{ fontSize:12, color:'#854F0B', marginTop:6, background:'#FFF8E6', borderRadius:6, padding:'6px 10px' }}>↩ 退回原因：{r.formReturnReason}</div>}
                {r.paymentRejectReason && r.paymentStatus==='transfer_rejected' && <div style={{ fontSize:12, color:'#A32D2D', marginTop:6, background:'#FCEBEB', borderRadius:6, padding:'6px 10px' }}>要求重填原因：{r.paymentRejectReason}</div>}
                {r.cancelReason && r.status==='cancelled' && <div style={{ fontSize:12, color:'#999', marginTop:6 }}>取消原因：{r.cancelReason==='payment_expired'?'逾期未繳費自動取消':r.cancelReason}</div>}
                {(r.memberNote || r.customFieldValues?.notes) && <div style={{ fontSize:12, color:'#555', marginTop:6, background:'#F3F4F6', borderRadius:6, padding:'6px 10px' }}>💬 會員備註：{r.memberNote || r.customFieldValues?.notes}</div>}
                {r.staffNote && <div style={{ fontSize:12, color:'#854F0B', marginTop:6, background:'#FFF8E6', borderRadius:6, padding:'6px 10px' }}>📝 員工備註：{r.staffNote}</div>}
              </div>
              {act()}
              <button onClick={()=>setRegDetail(null)} style={{ marginTop:14, width:'100%', height:42, borderRadius:10, background:'#8B1A1A', color:'#fff', border:'none', fontSize:14, cursor:'pointer' }}>關閉</button>
            </div>
          </div>
        );
      })()}

      {/* 刪除賽事二次確認 Modal（取代原 window.confirm） */}
      {confirmDeleteComp && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={()=>setConfirmDeleteComp(null)}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:14, padding:20, width:'100%', maxWidth:400 }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:10 }}>刪除賽事</div>
            <div style={{ fontSize:14, color:'#1a1a1a', lineHeight:1.7, marginBottom:6 }}>
              確定要<strong style={{ color:'#A32D2D' }}>刪除</strong>「<strong>{confirmDeleteComp.name}</strong>」？
            </div>
            <div style={{ fontSize:12, color:'#A32D2D', marginBottom:8, lineHeight:1.6, background:'#FBEEEE', border:'0.5px solid #E8C5C5', borderRadius:6, padding:'8px 10px' }}>
              ⚠ 此動作<strong>無法復原</strong>，賽事將從資料庫完全移除。若此賽事已有報名紀錄，這些報名不會一併刪除，但會找不到對應賽事（孤兒資料）；若只是想暫時關閉報名，請改用「關閉報名」。
            </div>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button onClick={()=>setConfirmDeleteComp(null)}
                style={{ flex:1, height:42, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
              <button onClick={()=>handleDelete(confirmDeleteComp)}
                style={{ flex:1, height:42, borderRadius:9, background:'#A32D2D', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>確認刪除</button>
            </div>
          </div>
        </div>
      )}

      {/* 賽前通知 Modal：編輯草稿 → 發送給該賽事目前有效（非取消）報名者（BCC，彼此不見信箱） */}
      {noticeModal && (
        <Modal title={`賽前通知 — ${noticeModal.name}`} onClose={()=>setNoticeModal(null)} width={640}>
          <div style={{ fontSize:12, color:'#666', marginBottom:12, background:'#FBF5F5', borderRadius:8, padding:'8px 12px' }}>
            {noticeRecipients === null ? '載入收件人中…' :
              noticeRecipients.error ? <span style={{ color:'#A32D2D' }}>載入收件人清單失敗，請關閉重試</span> :
              noticeRecipients.count === 0 ? <span style={{ color:'#A32D2D' }}>目前沒有可寄送的參賽者信箱（報名可能都還未填 email 或皆已取消）</span> :
              `將以密件副本(BCC)寄給 ${noticeRecipients.count} 位有效報名者，彼此不會看到對方信箱`}
          </div>
          {noticeRecipients?.count > 0 && (
            <details style={{ marginBottom:14, fontSize:12, color:'#999' }}>
              <summary style={{ cursor:'pointer' }}>查看收件人清單（{noticeRecipients.count}）</summary>
              <div style={{ maxHeight:120, overflowY:'auto', marginTop:6, lineHeight:1.9, borderTop:'0.5px solid #eee', paddingTop:6 }}>
                {noticeRecipients.recipients.map((r,i) => <div key={i}>{r.name || '（無姓名）'} — {r.email}</div>)}
              </div>
            </details>
          )}
          <label style={lbl}>主旨</label>
          <input style={{ ...inp, marginBottom:12 }} value={noticeSubject} onChange={e=>setNoticeSubject(e.target.value)} />
          <label style={lbl}>內容</label>
          <textarea rows={10} style={{ ...inp, height:'auto', padding:10, fontFamily:'inherit', lineHeight:1.7, resize:'vertical' }}
            value={noticeBody} onChange={e=>setNoticeBody(e.target.value)} />
          <div style={{ display:'flex', gap:8, marginTop:16, justifyContent:'flex-end' }}>
            <button onClick={()=>setNoticeModal(null)} disabled={noticeSending}
              style={{ height:40, padding:'0 18px', borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
            <button onClick={sendNotice} disabled={noticeSending || !noticeRecipients?.count}
              style={{ height:40, padding:'0 18px', borderRadius:8, background: (noticeSending || !noticeRecipients?.count) ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: (noticeSending || !noticeRecipients?.count) ? 'not-allowed' : 'pointer' }}>
              {noticeSending ? '發送中…' : `📧 發送給 ${noticeRecipients?.count || 0} 人`}
            </button>
          </div>
        </Modal>
      )}

      {/* 首頁提醒推播 Modal：對該賽事目前有效（非取消）報名者，各自建一則自訂提醒卡片（店員可事後於會員的紀錄查詢個別編輯/刪除） */}
      {reminderModal && (
        <Modal title={`首頁提醒 — ${reminderModal.name}`} onClose={()=>setReminderModal(null)} width={520}>
          <div style={{ fontSize:12, color:'#666', marginBottom:14, background:'#FBF5F5', borderRadius:8, padding:'8px 12px', lineHeight:1.6 }}>
            會為該賽事「目前有效（非取消）」的每位報名者，各自在其會員 App 首頁「課程活動提醒」清單新增一則相同內容的卡片。之後如需個別修改或刪除，請至該會員的紀錄查詢頁「🔔 首頁提醒」處理。
          </div>
          <ReminderFormFields form={reminderForm} setForm={setReminderForm}
            imageFile={reminderImageFile} setImageFile={setReminderImageFile}
            titlePlaceholder="例：202608 抱石賽即將開賽" subtitlePlaceholder="例：請提前 30 分鐘完成報到"
            showUntilHint="，預設帶賽事日期" />
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setReminderModal(null)} disabled={reminderSending}
              style={{ height:40, padding:'0 18px', borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
            <button onClick={sendReminderBroadcast} disabled={reminderSending}
              style={{ height:40, padding:'0 18px', borderRadius:8, background: reminderSending ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: reminderSending ? 'not-allowed' : 'pointer' }}>
              {reminderSending ? '推播中…' : '🔔 推播提醒'}
            </button>
          </div>
        </Modal>
      )}

      {/* 收款/退費 Modal（共用元件） */}
      {actionModal && (
        <CompetitionActionModal
          action={actionModal.type}
          reg={actionModal.reg}
          onClose={()=>setActionModal(null)}
          onDone={(m)=>{ setActionModal(null); showMsg(m); openRegistrations(showRegistrations); }}
        />
      )}

      {/* 開立發票（共用元件，與員工端報到頁/課程學員頁同一套；依開關自動切換真列印／手動記帳版） */}
      {invoiceTarget && (() => {
        const r = invoiceTarget;
        return (
          <InvoiceIssuer
            gymId={r.gymId}
            sourceType="competition"
            refId={r.id}
            memberId={r.memberId}
            memberName={r.memberName}
            paymentMethod={r.paymentMethod}
            title={r.memberName || ''}
            subtitle={`${r.competitionName || ''}・${r.divisionName || ''}`}
            feeInfo={`報名費用 NT$${r.registrationFee ?? 0}`
              + (r.insuranceFee != null ? `　保費 NT$${r.insuranceFee}` : '')
              + (r.memberPaidAmount != null ? `　會員自報 NT$${r.memberPaidAmount}` : '')
              + (r.paidAmount != null ? `　店員核對 NT$${r.paidAmount}` : '')}
            defaultItemName={`${r.competitionName || '比賽'}報名費`}
            defaultAmount={r.receivedAmount ?? Math.max(0, (r.paidAmount ?? r.memberPaidAmount ?? r.registrationFee ?? 0) - (r.insuranceFee || 0))}
            hideTrackNumber
            hidePaymentMethodFix
            hideWarning
            hideNote
            onClose={closeInvoiceTarget}
            listInvoices={() => getRegistrationInvoices(r.id).then(res => res.data.invoices || [])}
            createInvoice={(payload) => createRegistrationInvoice(r.id, payload).then(res => res.data.invoice)}
            voidInvoiceFn={(id) => voidCompetitionInvoice(id)}
          />
        );
      })()}

      {/* 退回修改 / 駁回取消 / 要求重填轉帳 原因 Modal */}
      {formAction && (() => {
        const CFG = {
          return:       { title:'退回報名表（會員可修改重送）', desc:'會員會收到通知，可在「我的比賽報名」修改資料後重新送出，名額仍保留。', ph:'例：組別選錯、身分證號有誤，請修正', btn:'確認退回', color:'#854F0B', bg:'#FFF8E6' },
          rejectPayment:{ title:'要求會員重填轉帳資訊', desc:'會員會收到通知，可在「我的比賽報名」重新填寫匯款末五碼與日期後送出。此非退費（尚未收款）。', ph:'例：查無此筆匯款 / 請填寫正確匯款末五碼與日期', btn:'確認送出', color:'#854F0B', bg:'#FFF8E6' },
          reject:       { title:'駁回取消此報名', desc:'此報名將直接取消、釋出名額並通知會員。' + (formAction.reg.paymentStatus==='confirmed' ? '（已收款項將列入退費待辦）' : ''), ph:'例：不符參賽資格', btn:'確認駁回取消', color:'#A32D2D', bg:'#FCEBEB' },
        };
        const c = CFG[formAction.type] || CFG.reject;
        return (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:20, width:'100%', maxWidth:380 }}>
            <div style={{ fontWeight:600, fontSize:15, marginBottom:4 }}>{c.title}</div>
            <div style={{ fontSize:12, color:'#666', marginBottom:12 }}>{formAction.reg.memberName}・{formAction.reg.divisionName}</div>
            <div style={{ fontSize:12, color:c.color, background:c.bg, borderRadius:8, padding:'8px 10px', marginBottom:12, lineHeight:1.6 }}>{c.desc}</div>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>原因（報名者會看到）*</label>
            <textarea value={formReason} onChange={e=>setFormReason(e.target.value)} rows={3} placeholder={c.ph}
              style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 10px', fontSize:13, resize:'none', outline:'none', boxSizing:'border-box', background:'#FBF5F5', color:'#1a1a1a', marginBottom:14 }}/>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>{ setFormAction(null); setFormReason(''); }}
                style={{ flex:1, height:42, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
              <button onClick={submitFormAction} disabled={formSaving}
                style={{ flex:2, height:42, borderRadius:10, background:c.color, color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                {formSaving ? '處理中…' : c.btn}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
