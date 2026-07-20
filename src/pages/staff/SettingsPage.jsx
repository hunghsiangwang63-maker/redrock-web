import { useState, useEffect } from 'react';
import PasswordInput from '../../components/PasswordInput';
import client from '../../api/client';
import { useAuth } from '../../store/authStore';
import { getGyms, getAllGyms } from '../../api/gyms';
import { getStaffList, createStaff, updateStaff, resetStaffPassword, toggleStaffActive, deleteStaff } from '../../api/staff';
import { getStations, createStation, updateStation } from '../../api/stations';
import SaveButton from '../../components/SaveButton';
import GymsPage from './GymsPage';

const TAB_GROUPS = [
  {
    group: '場館與帳號',
    items: [
      { key: 'gyms',         icon: '🏠', label: '場館設置',   superAdminOnly: true },
      { key: 'announcements', icon: '📢', label: '場館公告',  ownGymAnnounce: true },
      { key: 'staffAccounts',icon: '👤', label: '員工帳號',   superAdminOnly: true },
      { key: 'devices',      icon: '📱', label: '裝置審核',   adminOnly: true },
      { key: 'transition',   icon: '🔄', label: '系統轉換',   adminOnly: true },
    ],
  },
  {
    group: '入場規則',
    items: [
      { key: 'entryTypes',   icon: '🚪', label: '入場類型' },
      { key: 'waiver',       icon: '📄', label: 'Waiver 內容' },
      { key: 'fallTest',     icon: '🧗', label: '墜落測驗' },
      { key: 'shoeRental',   icon: '👟', label: '岩鞋／粉袋租借' },
      { key: 'bonus',        icon: '🎁', label: '紅利期限', superAdminOnly: true },
      { key: 'discountCardValidity', icon: '🎟️', label: '優惠卡期限', superAdminOnly: true },
      { key: 'partnerVendor',icon: '🤝', label: '特約廠商優惠', superAdminOnly: true },
      { key: 'partnerGyms',  icon: '🧗', label: '友館折扣清單', superAdminOnly: true },
      { key: 'paymentMethods',icon: '💳', label: '付款方式', superAdminOnly: true },
    ],
  },
];
const TAB_ITEMS = TAB_GROUPS.flatMap(g => g.items);

export default function SettingsPage() {
  const { staff, operator } = useAuth();
  const _role = operator?.role || staff?.role;
  const isSuperAdmin = _role === 'super_admin';
  // 場館公告分頁：非 super 的館別管理員或值班 operator 可見（super 走「場館設置」）
  const canOwnGymAnnounce = !isSuperAdmin && (_role === 'gym_manager' || !!operator);
  const [gyms, setGyms] = useState([]);
  const [showAddGym, setShowAddGym] = useState(false);
  const [newGymName, setNewGymName] = useState('');
  const [newGymId, setNewGymId] = useState('');
  const [newGymAddress, setNewGymAddress] = useState('');
  const [gymSaving, setGymSaving] = useState(false);
  const [gymMsg, setGymMsg] = useState('');
  const [confirmGym, setConfirmGym] = useState(null); // { gym, newStatus }
  useEffect(() => {
    getAllGyms().then(res => setGyms(res.data.gyms || [])).catch(() => {});
  }, []);
  const isAdmin = ['super_admin', 'admin'].includes(staff?.role);
  const [activeTab, setActiveTab] = useState('entryTypes');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // ─── 員工帳號 ───────────────────────────────────────────────────
  const [staffList, setStaffList] = useState([]);
  // isDirty 追蹤各區塊是否有未儲存的修改
  const [entryDirty, setEntryDirty] = useState(false);
  const [shoeDirty, setShoeDirty] = useState(false);
  const [waiverDirty, setWaiverDirty] = useState(false);
  const [fallTestDirty, setFallTestDirty] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false); // 課程設定
  const [gymDirty, setGymDirty] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [staffForm, setStaffForm] = useState({ name:'', email:'', phone:'', role:'full_time', gymId:'', notificationEmail:'', password:'' });
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffFormMsg, setStaffFormMsg] = useState('');
  const [resettingPasswordFor, setResettingPasswordFor] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  // ─── 館別電腦帳號 ───────────────────────────────────────────────
  const [stationList, setStationList] = useState([]);
  const [stationLoading, setStationLoading] = useState(false);
  const [showStationForm, setShowStationForm] = useState(false);
  const [editingStation, setEditingStation] = useState(null);
  const [stationForm, setStationForm] = useState({ name:'', email:'', gymId:'', notificationEmail:'', password:'' });
  const [stationSaving, setStationSaving] = useState(false);
  const [stationFormMsg, setStationFormMsg] = useState('');

  // ─── 裝置綁定總開關（super_admin）───────────────────────────────
  const [deviceBindingEnabled, setDeviceBindingEnabled] = useState(true);
  const [deviceBindingSaving, setDeviceBindingSaving] = useState(false);
  const loadDeviceBinding = async () => {
    try { const res = await client.get('/settings/device-binding'); setDeviceBindingEnabled(res.data.enabled !== false); }
    catch (e) {}
  };
  const toggleDeviceBinding = async () => {
    const next = !deviceBindingEnabled;
    if (!next && !window.confirm('確定關閉裝置綁定？關閉後，員工個人帳號與館別電腦登入將不再需要裝置驗證（僅測試/轉換期使用，完成後請重新開啟）。')) return;
    setDeviceBindingSaving(true);
    try {
      await client.put('/settings/device-binding', { enabled: next });
      setDeviceBindingEnabled(next);
      showMsg(next ? '已開啟裝置綁定' : '已關閉裝置綁定');
    } catch (e) { showMsg(e.response?.data?.message || '設定失敗'); }
    finally { setDeviceBindingSaving(false); }
  };

  // ─── Email 認證總開關（super_admin）─────────────────────────────
  const [emailVerifyEnabled, setEmailVerifyEnabled] = useState(true);
  const [emailVerifySaving, setEmailVerifySaving] = useState(false);
  const loadEmailVerify = async () => {
    try { const res = await client.get('/settings/email-verification'); setEmailVerifyEnabled(res.data.enabled !== false); }
    catch (e) {}
  };
  const toggleEmailVerify = async () => {
    const next = !emailVerifyEnabled;
    if (!next && !window.confirm('確定關閉 Email 認證？關閉後，會員自助註冊將不需驗證 Email 即可登入（僅測試/轉換期使用，完成後請重新開啟）。')) return;
    setEmailVerifySaving(true);
    try {
      await client.put('/settings/email-verification', { enabled: next });
      setEmailVerifyEnabled(next);
      showMsg(next ? '已開啟 Email 認證' : '已關閉 Email 認證');
    } catch (e) { showMsg(e.response?.data?.message || '設定失敗'); }
    finally { setEmailVerifySaving(false); }
  };

  const loadStaffList = async () => {
    setStaffLoading(true);
    try {
      const res = await getStaffList();
      setStaffList(res.data.staffList || []);
    } catch (e) { setStaffList([]); }
    finally { setStaffLoading(false); }
  };

  const loadStationList = async () => {
    setStationLoading(true);
    try {
      const res = await getStations();
      setStationList(res.data.stations || []);
    } catch (e) { setStationList([]); }
    finally { setStationLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'staffAccounts' && isSuperAdmin) { loadStaffList(); loadStationList(); loadDeviceBinding(); loadEmailVerify(); }
    if (activeTab === 'gyms') getAllGyms().then(r => setGyms(r.data.gyms || [])).catch(()=>{});
    if (activeTab === 'bonus' && isSuperAdmin) loadBonus();
    if (activeTab === 'discountCardValidity' && isSuperAdmin) loadDcv();
    if (activeTab === 'partnerVendor' && isSuperAdmin) loadPartnerVendor();
    if (activeTab === 'partnerGyms' && isSuperAdmin) loadPartnerGyms();
    if (activeTab === 'paymentMethods' && isSuperAdmin) loadPayMethods();
  }, [activeTab]);

  const openAddStation = () => {
    setEditingStation(null);
    setStationForm({ name:'', email:'', gymId: gyms[0]?.id || '', notificationEmail:'', password:'' });
    setStationFormMsg('');
    setShowStationForm(true);
  };
  const openEditStation = (st) => {
    setEditingStation(st);
    setStationForm({ name:st.name||'', email:st.email||'', gymId:st.gymId||'', notificationEmail:st.notificationEmail||'', password:'' });
    setStationFormMsg('');
    setShowStationForm(true);
  };
  const handleSaveStation = async () => {
    if (!stationForm.name.trim() || !stationForm.email.trim() || !stationForm.gymId) { setStationFormMsg('請填寫名稱、Email 與館別'); return; }
    if (!editingStation && stationForm.password.length < 6) { setStationFormMsg('密碼至少 6 碼'); return; }
    if (editingStation && stationForm.password && stationForm.password.length < 6) { setStationFormMsg('密碼至少 6 碼'); return; }
    setStationSaving(true); setStationFormMsg('');
    try {
      if (editingStation) {
        const payload = { name: stationForm.name, gymId: stationForm.gymId, notificationEmail: stationForm.notificationEmail };
        if (stationForm.password) payload.password = stationForm.password;
        await updateStation(editingStation.id, payload);
      } else {
        await createStation(stationForm);
      }
      setShowStationForm(false);
      await loadStationList();
    } catch (e) {
      setStationFormMsg(e?.response?.data?.message || '儲存失敗');
    } finally { setStationSaving(false); }
  };
  const handleToggleStation = async (st) => {
    try { await updateStation(st.id, { isActive: !st.isActive }); await loadStationList(); } catch (e) {}
  };

  const openAddStaff = () => {
    setEditingStaff(null);
    setStaffForm({ name:'', email:'', phone:'', role:'full_time', gymId: gyms[0]?.id || '', notificationEmail:'', password:'' });
    setStaffFormMsg('');
    setShowStaffForm(true);
  };

  const openEditStaff = (s) => {
    setEditingStaff(s);
    setStaffForm({ name:s.name, email:s.email, phone:s.phone||'', role:s.role, gymId:s.gymId||'', notificationEmail:s.notificationEmail||'', password:'' });
    setStaffFormMsg('');
    setShowStaffForm(true);
  };

  const handleSaveStaff = async () => {
    if (!staffForm.name.trim() || !staffForm.email.trim()) { setStaffFormMsg('請填寫姓名與Email'); return; }
    if (staffForm.role !== 'super_admin' && !staffForm.gymId) { setStaffFormMsg('此角色需指定所屬場館'); return; }
    if (!editingStaff && staffForm.password.length < 6) { setStaffFormMsg('密碼至少需要6個字元'); return; }
    setStaffSaving(true);
    setStaffFormMsg('');
    try {
      if (editingStaff) {
        await updateStaff(editingStaff.id, {
          name: staffForm.name, email: staffForm.email, phone: staffForm.phone,
          role: staffForm.role, gymId: staffForm.role === 'super_admin' ? null : staffForm.gymId,
          notificationEmail: staffForm.notificationEmail,
        });
      } else {
        await createStaff({
          name: staffForm.name, email: staffForm.email, phone: staffForm.phone,
          role: staffForm.role, gymId: staffForm.role === 'super_admin' ? null : staffForm.gymId,
          notificationEmail: staffForm.notificationEmail, password: staffForm.password,
        });
      }
      setShowStaffForm(false);
      await loadStaffList();
    } catch (err) {
      setStaffFormMsg(err.response?.data?.message || '儲存失敗');
    } finally { setStaffSaving(false); }
  };

  const handleToggleActive = async (s) => {
    const actionLabel = s.isActive ? '停用' : '啟用';
    if (!window.confirm(`確定要${actionLabel}「${s.name}」的帳號？`)) return;
    try {
      await toggleStaffActive(s.id);
      await loadStaffList();
    } catch (err) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleDeleteStaff = async (s) => {
    if (!window.confirm(`確定要永久刪除「${s.name}」的帳號？此操作無法復原。`)) return;
    try {
      await deleteStaff(s.id);
      await loadStaffList();
    } catch (err) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const handleResetPassword = async () => {
    if (resetPasswordValue.length < 6) { alert('密碼至少需要6個字元'); return; }
    try {
      await resetStaffPassword(resettingPasswordFor.id, resetPasswordValue);
      setResettingPasswordFor(null);
      setResetPasswordValue('');
      alert('密碼已重設');
    } catch (err) {
      alert(err.response?.data?.message || '重設失敗');
    }
  };

  const ROLE_LABELS = { super_admin:'系統管理員', gym_manager:'館長', full_time:'正職', part_time:'兼職' };


  // ─── 入場類型 ───────────────────────────────────────────────────
  const [entryTypes, setEntryTypes] = useState([]);

  const loadEntryTypes = async () => {
    try {
      const res = await client.get('/settings/entry-types');
      setEntryTypes(res.data);
    } catch (e) {}
  };

  const handleSaveEntryTypes = async () => {
    setLoading(true);
    try {
      await client.post('/settings/entry-types', { types: entryTypes });
      showMsg('入場類型已儲存');
    } catch (err) { showMsg(err.response?.data?.message || '儲存失敗', 'err'); }
    finally { setLoading(false); }
  };

  const updateEntryType = (i, field, value) => {
    const next = [...entryTypes];
    next[i] = { ...next[i], [field]: value };
    setEntryTypes(next);
  };

  const addEntryType = () => {
    setEntryTypes(prev => [...prev, { id: `type_${Date.now()}`, name: '', price: 0, active: true, memberTypes: [] }]);
  };

  const removeEntryType = (i) => {
    setEntryTypes(prev => prev.filter((_, j) => j !== i));
  };

  // ─── Waiver 內容 ────────────────────────────────────────────────
  const [waiver, setWaiver] = useState({ zh: '', en: '' });

  const loadWaiver = async () => {
    try {
      const res = await client.get('/settings/waiver');
      setWaiver(res.data);
    } catch (e) {}
  };

  const handleSaveWaiver = async () => {
    setLoading(true);
    try {
      await client.put('/settings/waiver', waiver);
      showMsg('Waiver 內容已儲存');
    } catch (err) { showMsg(err.response?.data?.message || '儲存失敗', 'err'); }
    finally { setLoading(false); }
  };

  // ─── 系統轉換期設定 ─────────────────────────────────────────────
  const [transition, setTransition] = useState({ settlementManualInput: false, settlementShowCardNumbers: true, checkinAlreadyPaid: false, checkinLegacyDiscountCard: false });
  const loadTransition = async () => {
    try { const res = await client.get('/settings/transition'); setTransition(res.data); } catch (e) {}
  };
  const handleSaveTransition = async () => {
    setLoading(true);
    try { await client.put('/settings/transition', transition); showMsg('系統轉換設定已儲存'); }
    catch (err) { showMsg(err.response?.data?.message || '儲存失敗', 'err'); }
    finally { setLoading(false); }
  };

  // ─── 岩鞋及粉袋租借 ─────────────────────────────────────────────
  const [shoeRental, setShoeRental] = useState({ price: 100, active: true });
  const [chalkRental, setChalkRental] = useState({ price: 50, active: true });

  const loadShoeRental = async () => {
    try {
      const res = await client.get('/settings/shoe-rental');
      setShoeRental(res.data);
    } catch (e) {}
    try {
      const res = await client.get('/settings/chalk-rental');
      setChalkRental(res.data);
    } catch (e) {}
  };

  const handleSaveShoeRental = async () => {
    setLoading(true);
    try {
      await client.put('/settings/shoe-rental', shoeRental);
      await client.put('/settings/chalk-rental', chalkRental);
      showMsg('租借設定已儲存');
    } catch (err) { showMsg(err.response?.data?.message || '儲存失敗', 'err'); }
    finally { setLoading(false); }
  };

  // ─── 紅利（免費入場）使用期限 ────────────────────────────────────
  const [bonus, setBonus] = useState({ validityMonths: 6 });
  // 新購優惠折扣卡使用期限（''＝無限期）
  const [dcv, setDcv] = useState({ validityMonths: '' });
  const [dcvDirty, setDcvDirty] = useState(false);
  const loadDcv = async () => {
    try { const res = await client.get('/settings/discount-card-validity'); setDcv({ validityMonths: res.data.validityMonths ?? '' }); setDcvDirty(false); } catch (e) {}
  };
  const handleSaveDcv = async () => {
    try {
      const raw = dcv.validityMonths;
      const res = await client.put('/settings/discount-card-validity', { validityMonths: raw === '' ? null : Number(raw) });
      setDcv({ validityMonths: res.data.validityMonths ?? '' }); setDcvDirty(false);
      showMsg(res.data.validityMonths ? `已設定 ${res.data.validityMonths} 個月` : '已設定為無限期');
    } catch (e) { showMsg(e.response?.data?.message || '儲存失敗', 'err'); }
  };
  const [bonusDirty, setBonusDirty] = useState(false);
  const loadBonus = async () => {
    try { const res = await client.get('/settings/bonus'); setBonus({ validityMonths: res.data.validityMonths ?? 6 }); setBonusDirty(false); } catch (e) {}
  };
  const handleSaveBonus = async () => {
    setLoading(true);
    try {
      const res = await client.put('/settings/bonus', { validityMonths: Number(bonus.validityMonths) });
      setBonus({ validityMonths: res.data.validityMonths }); setBonusDirty(false);
      showMsg('紅利使用期限已儲存');
    } catch (err) { showMsg(err.response?.data?.message || '儲存失敗', 'err'); }
    finally { setLoading(false); }
  };

  // ─── 付款方式開關（現金/轉帳/LinePay/街口/台灣Pay）────────────────
  const PAY_KEYS = [
    { key:'cash', label:'現金', note:'櫃檯現金收款' },
    { key:'transfer', label:'轉帳', note:'銀行轉帳（會員上傳末五碼、待確認收款）' },
    { key:'linepay', label:'Line Pay', note:'待金流 API 對接後開放' },
    { key:'jkopay', label:'街口支付', note:'待金流 API 對接後開放' },
    { key:'taiwanpay', label:'台灣 Pay', note:'待金流 API 對接後開放' },
  ];
  const [payMethods, setPayMethods] = useState({ cash:true, transfer:true, linepay:false, jkopay:false, taiwanpay:false });
  const [payMethodsDirty, setPayMethodsDirty] = useState(false);
  const loadPayMethods = async () => {
    try { const res = await client.get('/settings/payment-methods'); setPayMethods(res.data.enabled || {}); setPayMethodsDirty(false); } catch (e) {}
  };
  const handleSavePayMethods = async () => {
    try {
      const res = await client.put('/settings/payment-methods', { enabled: payMethods });
      setPayMethods(res.data.enabled); setPayMethodsDirty(false);
      showMsg('付款方式設定已儲存');
    } catch (e) { showMsg(e.response?.data?.message || '儲存失敗', 'red'); }
  };

  // ─── 特約廠商入場優惠（啟用 + 折扣金額）──────────────────────────
  const [partnerVendor, setPartnerVendor] = useState({ enabled: true, discount: 20 });
  const [partnerVendorDirty, setPartnerVendorDirty] = useState(false);
  const [partnerGyms, setPartnerGyms] = useState([]);   // [{id?,name}]
  const [partnerGymsDirty, setPartnerGymsDirty] = useState(false);
  const loadPartnerGyms = async () => {
    try { const res = await client.get('/settings/partner-gyms'); setPartnerGyms(res.data.gyms || []); setPartnerGymsDirty(false); } catch (e) {}
  };
  const handleSavePartnerGyms = async () => {
    setLoading(true);
    try {
      const clean = partnerGyms.map(g => ({ id: g.id, name: (g.name || '').trim() })).filter(g => g.name);
      const res = await client.put('/settings/partner-gyms', { gyms: clean });
      setPartnerGyms(res.data.gyms || []); setPartnerGymsDirty(false);
      showMsg('友館清單已儲存');
    } catch (err) { showMsg(err.response?.data?.message || '儲存失敗', 'err'); }
    finally { setLoading(false); }
  };
  const loadPartnerVendor = async () => {
    try { const res = await client.get('/settings/partner-vendor'); setPartnerVendor({ enabled: res.data.enabled !== false, discount: res.data.discount ?? 20 }); setPartnerVendorDirty(false); } catch (e) {}
  };
  const handleSavePartnerVendor = async () => {
    setLoading(true);
    try {
      const res = await client.put('/settings/partner-vendor', { enabled: !!partnerVendor.enabled, discount: Number(partnerVendor.discount) });
      setPartnerVendor({ enabled: res.data.enabled, discount: res.data.discount }); setPartnerVendorDirty(false);
      showMsg('特約廠商優惠設定已儲存');
    } catch (err) { showMsg(err.response?.data?.message || '儲存失敗', 'err'); }
    finally { setLoading(false); }
  };

  // ─── 裝置審核 ───────────────────────────────────────────────────
  const [pendingDevices, setPendingDevices] = useState([]);
  const [deviceActionLoading, setDeviceActionLoading] = useState(null);

  const loadPendingDevices = async () => {
    try {
      const res = await client.get('/auth/device/pending');
      setPendingDevices(res.data.devices || []);
    } catch (e) {}
  };

  const handleApproveDevice = async (id) => {
    setDeviceActionLoading(id);
    try {
      await client.post(`/auth/device/pending/${id}/approve`);
      showMsg('已核准此裝置');
      await loadPendingDevices();
    } catch (err) { showMsg(err.response?.data?.message || '核准失敗', 'err'); }
    finally { setDeviceActionLoading(null); }
  };

  const handleRejectDevice = async (id) => {
    setDeviceActionLoading(id);
    try {
      await client.post(`/auth/device/pending/${id}/reject`);
      showMsg('已拒絕此裝置');
      await loadPendingDevices();
    } catch (err) { showMsg(err.response?.data?.message || '拒絕失敗', 'err'); }
    finally { setDeviceActionLoading(null); }
  };

  // 已核准（信任）裝置
  const [trustedDevices, setTrustedDevices] = useState([]);
  const loadTrustedDevices = async () => {
    try {
      const res = await client.get('/auth/device/trusted');
      setTrustedDevices(res.data.devices || []);
    } catch (e) {}
  };
  const handleRemoveTrusted = async (d) => {
    if (!window.confirm(`確定移除「${d.accountName}」的這台信任裝置？該裝置下次登入需重新驗證（Email 驗證碼或管理員核准）。`)) return;
    setDeviceActionLoading(d.id);
    try {
      await client.delete(`/auth/device/trusted/${d.id}`);
      showMsg('已移除信任裝置');
      await loadTrustedDevices();
    } catch (err) { showMsg(err.response?.data?.message || '移除失敗', 'err'); }
    finally { setDeviceActionLoading(null); }
  };
  const deviceUA = (label) => {
    if (!label) return '（未記錄裝置資訊）';
    if (/iPad/.test(label)) return 'iPad';
    if (/iPhone/.test(label)) return 'iPhone';
    if (/Android/.test(label)) return 'Android';
    if (/Macintosh/.test(label)) return 'Mac' + (/Chrome/.test(label) ? ' · Chrome' : /Safari/.test(label) ? ' · Safari' : '');
    if (/Windows/.test(label)) return 'Windows' + (/Edg/.test(label) ? ' · Edge' : /Chrome/.test(label) ? ' · Chrome' : '');
    return label.slice(0, 40);
  };
  const tsDay = (v) => v?._seconds ? new Date(v._seconds * 1000).toLocaleDateString('zh-TW') : '—';

  // ─── 共用 ────────────────────────────────────────────────────────
  const handleAddGym = async () => {
    if (!newGymId.trim() || !newGymName.trim()) { setGymMsg('請填寫場館 ID 和名稱'); return; }
    setGymSaving(true);
    try {
      await client.post('/gyms', { id: newGymId.trim(), name: newGymName.trim(), address: newGymAddress.trim() });
      setGymMsg('場館已新增'); setShowAddGym(false); setNewGymId(''); setNewGymName(''); setNewGymAddress('');
      const r = await getAllGyms(); setGyms(r.data.gyms || []);
    } catch(e) { setGymMsg(e.response?.data?.message || '新增失敗'); }
    finally { setGymSaving(false); }
  };

  const handleToggleGym = (gym) => {
    const newStatus = gym.status === 'active' ? 'suspended' : 'active';
    setConfirmGym({ gym, newStatus });
  };

  const doToggleGym = async () => {
    if (!confirmGym) return;
    const { gym, newStatus } = confirmGym;
    setConfirmGym(null);
    try {
      await client.put(`/gyms/${gym.id}`, { status: newStatus });
      const r = await getAllGyms(); setGyms(r.data.gyms || []);
      setGymMsg(`已${newStatus==='suspended'?'暫停':'恢復'}「${gym.name}」`);
    } catch(e) { setGymMsg('操作失敗'); }
  };

  const showMsg = (text, type='ok') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(''), 3000);
  };

  useEffect(() => {
    loadEntryTypes();
    loadWaiver();
    loadShoeRental();
    loadFallTest();
    if (isAdmin) { loadPendingDevices(); loadTrustedDevices(); loadTransition(); }
  }, []);

  // ─── 墜落測驗設定 ───────────────────────────────────────────────
  const [fallTest, setFallTest] = useState({
    requiredCheckins: 2,
    validYears: 1,
    youtubeUrl: '',
    watchPercentRequired: 90,
    contentZh: '',
    contentEn: '',
  });

  const loadFallTest = async () => {
    try {
      const res = await client.get('/fall-tests/settings');
      setFallTest(res.data);
    } catch (e) {}
  };

  const handleSaveFallTest = async () => {
    setLoading(true);
    try {
      await client.put('/fall-tests/settings', fallTest);
      showMsg('墜落測驗設定已儲存');
    } catch (err) { showMsg(err.response?.data?.message || '儲存失敗', 'err'); }
    finally { setLoading(false); }
  };

  const s = {
    page: { padding:20, background:'#F7F3F3', minHeight:'100vh' },
    card: { background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden', marginBottom:16 },
    cardHead: { padding:'12px 16px', borderBottom:'0.5px solid #E8D5D5', fontWeight:600, fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' },
    row: { padding:'14px 16px', borderBottom:'0.5px solid #F5EFEF', display:'flex', justifyContent:'space-between', alignItems:'center' },
    tab: (active) => ({ padding:'7px 18px', borderRadius:20, border:'0.5px solid #E8D5D5', background: active?'#8B1A1A':'#fff', color: active?'#fff':'#444', fontSize:13, cursor:'pointer', fontWeight: active?500:400 }),
    btn: { height:32, padding:'0 14px', borderRadius:8, background:'#fff', border:'0.5px solid #8B1A1A', color:'#8B1A1A', fontSize:12, cursor:'pointer' },
    btnPrimary: { height:36, padding:'0 18px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer', fontWeight:500 },
    input: { width:'100%', height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' },
    label: { fontSize:11, color:'#666', display:'block', marginBottom:4 },
  };

  return (
    <div style={s.page}>
      {msg && (
        <div style={{ background: msg.type==='ok'?'#E6F4EB':'#FCEBEB', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color: msg.type==='ok'?'#2D7D46':'#A32D2D' }}>
          {msg.text}
        </div>
      )}

      <div style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>系統設定</div>

      {/* Tab 選單 - 分組格狀 */}
      <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
        {TAB_GROUPS.map(group => {
          const visible = group.items.filter(t =>
            (!t.superAdminOnly || isSuperAdmin) && (!t.adminOnly || isAdmin) && (!t.ownGymAnnounce || canOwnGymAnnounce)
          );
          if (!visible.length) return null;
          return (
            <div key={group.group}>
              <div style={{ fontSize:10, fontWeight:700, color:'#999', letterSpacing:1, textTransform:'uppercase', marginBottom:6, textAlign:'left' }}>{group.group}</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:6 }}>
                {visible.map(t => {
                  const active = activeTab === t.key;
                  return (
                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, border:`1.5px solid ${active?'#8B1A1A':'#EDE5E5'}`, background:active?'#8B1A1A':'#fff', color:active?'#fff':'#444', fontSize:12, fontWeight:active?600:400, cursor:'pointer', textAlign:'left', transition:'all .15s' }}>
                      <span style={{ fontSize:16, lineHeight:1 }}>{t.icon}</span>
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 入場類型 ── */}
      {activeTab === 'entryTypes' && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>入場類型設定</span>
            <div style={{ display:'flex', gap:8, flex:1, marginLeft:16 }}>
              <button style={{ ...s.btn, flex:1, height:44, fontSize:14, fontWeight:500, borderRadius:10 }} onClick={addEntryType}>+ 新增</button>
              {isAdmin && <SaveButton onSave={handleSaveEntryTypes} isDirty={entryDirty} label='儲存入場類型' style={{ flex:1 }} />}
            </div>
          </div>
          <div style={{ padding:16 }}>
            {/* 標題列 */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 60px 32px', gap:8, marginBottom:8 }}>
              <span style={{ fontSize:11, color:'#999' }}>名稱</span>
              <span style={{ fontSize:11, color:'#999' }}>價格（NT$）</span>
              <span style={{ fontSize:11, color:'#999' }}>啟用</span>
              <span></span>
            </div>
            {entryTypes.map((t, i) => (
              <div key={t.id} style={{ border:'0.5px solid #F0EDED', borderRadius:8, padding:10, marginBottom:8 }}>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 60px 32px', gap:8, alignItems:'center', marginBottom: isAdmin ? 8 : 0 }}>
                  <input style={s.input} value={t.name} placeholder="類型名稱"
                    onChange={e => updateEntryType(i, 'name', e.target.value)} disabled={!isAdmin} />
                  <input style={s.input} type="number" value={t.price} min="0"
                    onChange={e => updateEntryType(i, 'price', Number(e.target.value))} disabled={!isAdmin} />
                  <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:13 }}>
                    <input type="checkbox" checked={t.active}
                      onChange={e => updateEntryType(i, 'active', e.target.checked)} disabled={!isAdmin} />
                    啟用
                  </label>
                  {isAdmin && (
                    <button onClick={() => removeEntryType(i)}
                      style={{ width:28, height:28, borderRadius:6, border:'0.5px solid #E8D5D5', background:'#fff', color:'#A32D2D', cursor:'pointer', fontSize:14 }}>
                      ✕
                    </button>
                  )}
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, color:'#999' }}>適用身份：</span>
                  {[{key:'general',label:'一般成人'},{key:'child',label:'兒童'},{key:'student',label:'學生'},{key:'course_member',label:'課程學員（不限身份）'}].map(mt => {
                    const checked = (t.memberTypes || []).includes(mt.key);
                    return (
                      <label key={mt.key} style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'#666', cursor: isAdmin ? 'pointer' : 'default' }}>
                        <input type="checkbox" checked={checked} disabled={!isAdmin}
                          onChange={e => {
                            const cur = t.memberTypes || [];
                            const next = e.target.checked ? [...cur, mt.key] : cur.filter(k => k !== mt.key);
                            updateEntryType(i, 'memberTypes', next);
                          }} />
                        {mt.label}
                      </label>
                    );
                  })}
                  {(!t.memberTypes || t.memberTypes.length === 0) && (
                    <span style={{ fontSize:11, color:'#B5762B' }}>（未勾選＝不限身份皆顯示）</span>
                  )}
                </div>
              </div>
            ))}
            {!entryTypes.length && (
              <div style={{ textAlign:'center', padding:'20px 0', color:'#999', fontSize:13 }}>尚無入場類型，點「新增」加入</div>
            )}
          </div>
        </div>
      )}

      {/* ── Waiver 內容 ── */}
      {/* ── 岩鞋及粉袋租借 ── */}
      {activeTab === 'transition' && isAdmin && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>🔄 系統轉換期設定</span>
            <button onClick={handleSaveTransition} disabled={loading}
              style={{ height:32, padding:'0 16px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>儲存</button>
          </div>
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:18, textAlign:'left' }}>
            <div style={{ fontSize:12, color:'#999', lineHeight:1.6 }}>新舊系統轉換期間的暫時選項，轉換完成後可關閉／移除。</div>
            <label style={{ display:'flex', gap:10, alignItems:'flex-start', fontSize:14, cursor:'pointer' }}>
              <input type="checkbox" checked={!!transition.settlementManualInput}
                onChange={e => setTransition(p => ({...p, settlementManualInput: e.target.checked}))}
                style={{ width:16, height:16, marginTop:2 }} />
              <span>
                <div style={{ fontWeight:600 }}>結帳：手動輸入與系統值並列</div>
                <div style={{ fontSize:12, color:'#888', marginTop:2 }}>結帳頁每個收入項與付款方式都多一欄手動輸入；系統值與手動值都會存檔。</div>
              </span>
            </label>
            <label style={{ display:'flex', gap:10, alignItems:'flex-start', fontSize:14, cursor:'pointer' }}>
              <input type="checkbox" checked={!!transition.settlementShowCardNumbers}
                onChange={e => setTransition(p => ({...p, settlementShowCardNumbers: e.target.checked}))}
                style={{ width:16, height:16, marginTop:2 }} />
              <span>
                <div style={{ fontWeight:600 }}>結帳：顯示優惠卡／全票最前號碼</div>
                <div style={{ fontSize:12, color:'#888', marginTop:2 }}>關閉後結帳頁隱藏這兩個欄位（轉換完成後預計拿掉）。</div>
              </span>
            </label>
            <label style={{ display:'flex', gap:10, alignItems:'flex-start', fontSize:14, cursor:'pointer' }}>
              <input type="checkbox" checked={!!transition.checkinAlreadyPaid}
                onChange={e => setTransition(p => ({...p, checkinAlreadyPaid: e.target.checked}))}
                style={{ width:16, height:16, marginTop:2 }} />
              <span>
                <div style={{ fontWeight:600 }}>入場：電話搜尋顯示「已付費」放行</div>
                <div style={{ fontSize:12, color:'#888', marginTop:2 }}>會員於舊系統已付「入場費」者，員工電話搜尋後可直接放行入場（入場費記 NT$0）。若加購岩鞋／粉袋仍另收費。仍須完成 Waiver／墜測。</div>
              </span>
            </label>
            <label style={{ display:'flex', gap:10, alignItems:'flex-start', fontSize:14, cursor:'pointer' }}>
              <input type="checkbox" checked={!!transition.checkinLegacyDiscountCard}
                onChange={e => setTransition(p => ({...p, checkinLegacyDiscountCard: e.target.checked}))}
                style={{ width:16, height:16, marginTop:2 }} />
              <span>
                <div style={{ fontWeight:600 }}>入場：電話搜尋可用「舊折扣卡 8 折」</div>
                <div style={{ fontSize:12, color:'#888', marginTop:2 }}>持實體舊折扣卡、未轉入新優惠卡者，員工電話搜尋入場可手動套 8 折（有效隊員再疊 9 折）。轉換完成後關閉。</div>
              </span>
            </label>
          </div>
        </div>
      )}

      {activeTab === 'shoeRental' && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>租借設定</span>
            {isAdmin && <SaveButton onSave={handleSaveShoeRental} isDirty={shoeDirty} label='儲存租借費率' fullWidth />}
          </div>
          <div style={{ padding:16 }}>
            {/* 岩鞋 */}
            <div style={{ marginBottom:24 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:600, color:'#444', marginBottom:12 }}><img src="/climbing-shoe.webp" alt="岩鞋" style={{ width:28, height:28, objectFit:"contain" }} /> 岩鞋租借</div>
              <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:12 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:14 }}>
                  <input type="checkbox" checked={shoeRental.active}
                    onChange={e => setShoeRental(p => ({...p, active: e.target.checked}))}
                    disabled={!isAdmin} style={{ width:16, height:16 }} />
                  啟用岩鞋租借
                </label>
              </div>
              <div style={{ maxWidth:240 }}>
                <label style={{ ...s.label, fontSize:13, marginBottom:8, display:'block' }}>租借費用（NT$）</label>
                <input type="number" value={shoeRental.price} min="0"
                  onChange={e => setShoeRental(p => ({...p, price: Number(e.target.value)}))}
                  disabled={!isAdmin}
                  style={{ ...s.input, width:'100%' }} />
              </div>
            </div>
            {/* 粉袋 */}
            <div style={{ borderTop:'0.5px solid #F0E8E8', paddingTop:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:600, color:'#444', marginBottom:12 }}><img src="/chalk-bag.webp" alt="粉袋" style={{ width:28, height:28, objectFit:"contain", borderRadius:4 }} /> 粉袋租借</div>
              <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:12 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:14 }}>
                  <input type="checkbox" checked={chalkRental.active}
                    onChange={e => setChalkRental(p => ({...p, active: e.target.checked}))}
                    disabled={!isAdmin} style={{ width:16, height:16 }} />
                  啟用粉袋租借
                </label>
              </div>
              <div style={{ maxWidth:240 }}>
                <label style={{ ...s.label, fontSize:13, marginBottom:8, display:'block' }}>租借費用（NT$）</label>
                <input type="number" value={chalkRental.price} min="0"
                  onChange={e => setChalkRental(p => ({...p, price: Number(e.target.value)}))}
                  disabled={!isAdmin}
                  style={{ ...s.input, width:'100%' }} />
              </div>
            </div>
            <div style={{ marginTop:16, fontSize:12, color:'#999' }}>
              啟用後，入場時會顯示對應的租借勾選選項。
            </div>
          </div>
        </div>
      )}

      {activeTab === 'bonus' && isSuperAdmin && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>🎁 紅利使用期限</span>
            <SaveButton onSave={handleSaveBonus} isDirty={bonusDirty} label='儲存紅利期限' fullWidth />
          </div>
          <div style={{ padding:16 }}>
            <div style={{ fontSize:12, color:'#999', lineHeight:1.6, marginBottom:16 }}>
              優惠卡（新／舊）所有次數用完時，原購買者獲得一次免費入場紅利。此設定為紅利自「發出當日」起的有效月數；
              調整後<strong>只影響之後新發出的紅利</strong>，既有紅利不變。
            </div>
            <div style={{ maxWidth:260 }}>
              <label style={{ ...s.label, fontSize:13, marginBottom:8, display:'block' }}>紅利使用期限（個月）</label>
              <input type="number" value={bonus.validityMonths} min="1" max="60"
                onChange={e => { setBonus({ validityMonths: e.target.value }); setBonusDirty(true); }}
                style={{ ...s.input, width:'100%' }} />
              <div style={{ fontSize:11, color:'#999', marginTop:6 }}>可填 1～60 個月，預設 6 個月。</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'discountCardValidity' && isSuperAdmin && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>🎟️ 新購優惠折扣卡使用期限</span>
            <SaveButton onSave={handleSaveDcv} isDirty={dcvDirty} label='儲存優惠卡期限' fullWidth />
          </div>
          <div style={{ padding:16 }}>
            <div style={{ fontSize:12, color:'#999', lineHeight:1.6, marginBottom:16 }}>
              會員<strong>新購買</strong>優惠折扣卡（櫃檯新增或入場購買）的使用期限。<strong>留空或 0＝無限期</strong>。
              調整後<strong>只影響之後售出</strong>的卡，既有已售出的卡不受影響（不追溯）。
              轉入／綁定的優惠卡本就無期限、不受此設定影響。
            </div>
            <div style={{ maxWidth:260 }}>
              <label style={{ ...s.label, fontSize:13, marginBottom:8, display:'block' }}>使用期限（個月，留空＝無限期）</label>
              <input type="number" value={dcv.validityMonths} min="0" max="60" placeholder="無限期"
                onChange={e => { setDcv({ validityMonths: e.target.value }); setDcvDirty(true); }}
                style={{ ...s.input, width:'100%' }} />
              <div style={{ fontSize:11, color:'#999', marginTop:6 }}>目前：{dcv.validityMonths ? `${dcv.validityMonths} 個月` : '無限期'}。可填 1～60，或留空／0 為無限期。</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'partnerVendor' && isSuperAdmin && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>🤝 特約廠商入場優惠</span>
            <SaveButton onSave={handleSavePartnerVendor} isDirty={partnerVendorDirty} label='儲存特約優惠' fullWidth />
          </div>
          <div style={{ padding:16 }}>
            <div style={{ fontSize:12, color:'#999', lineHeight:1.6, marginBottom:16 }}>
              全票／學生票在<strong>無其他折扣</strong>時，入場費定額折抵。與隊員 9 折、舊折扣卡 8 折<strong>互斥</strong>（隊員或折扣卡任一成立即不套用）；兒童票不適用。會員入場 QR 自選是否使用，櫃檯掃碼時提示請會員出示特約廠商證件。
            </div>
            <label onClick={() => { setPartnerVendor(p => ({ ...p, enabled: !p.enabled })); setPartnerVendorDirty(true); }}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderRadius:10, border:'0.5px solid #E8D5D5', marginBottom:16, cursor:'pointer' }}>
              <span style={{ fontSize:14, fontWeight:600 }}>啟用特約廠商優惠</span>
              <span style={{ width:44, height:26, borderRadius:13, background: partnerVendor.enabled ? '#2D7D46' : '#ccc', position:'relative', transition:'.2s', flexShrink:0 }}>
                <span style={{ position:'absolute', top:3, left: partnerVendor.enabled ? 21 : 3, width:20, height:20, borderRadius:10, background:'#fff', transition:'.2s' }} />
              </span>
            </label>
            <div style={{ maxWidth:260, opacity: partnerVendor.enabled ? 1 : 0.5 }}>
              <label style={{ ...s.label, fontSize:13, marginBottom:8, display:'block' }}>折扣金額（NT$）</label>
              <input type="number" value={partnerVendor.discount} min="0" max="1000" disabled={!partnerVendor.enabled}
                onChange={e => { setPartnerVendor(p => ({ ...p, discount: e.target.value })); setPartnerVendorDirty(true); }}
                style={{ ...s.input, width:'100%' }} />
              <div style={{ fontSize:11, color:'#999', marginTop:6 }}>可填 0～1000 元，預設 20 元。停用或金額 0 時，會員端不顯示特約選項。</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'partnerGyms' && isSuperAdmin && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>🧗 友館折扣清單</span>
            <SaveButton onSave={handleSavePartnerGyms} isDirty={partnerGymsDirty} label='儲存友館清單' fullWidth />
          </div>
          <div style={{ padding:16 }}>
            <div style={{ fontSize:12, color:'#999', lineHeight:1.6, marginBottom:16, textAlign:'left' }}>
              管理與紅石有互惠優惠的友館（如心流、爬森）。名單維護於此，各<strong>比賽／講座</strong>可在其設定中開啟折扣並填折扣率。
              會員報名時可選擇所屬友館先享折扣，<strong>櫃檯依友館提供名單人工核對</strong>後確認；折扣與隊員 9 折<strong>擇優不疊加</strong>。
            </div>
            {partnerGyms.map((g, i) => (
              <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
                <input value={g.name} placeholder="友館名稱（如 心流攀岩館）"
                  onChange={e => { const v=[...partnerGyms]; v[i]={ ...v[i], name:e.target.value }; setPartnerGyms(v); setPartnerGymsDirty(true); }}
                  style={{ ...s.input, flex:1 }} />
                <button onClick={() => { setPartnerGyms(partnerGyms.filter((_,j)=>j!==i)); setPartnerGymsDirty(true); }}
                  style={{ height:38, padding:'0 12px', borderRadius:8, border:'0.5px solid #A32D2D', background:'#fff', color:'#A32D2D', fontSize:13, cursor:'pointer', whiteSpace:'nowrap' }}>移除</button>
              </div>
            ))}
            {partnerGyms.length === 0 && <div style={{ fontSize:13, color:'#999', padding:'8px 0' }}>尚無友館，點下方新增。</div>}
            <button onClick={() => { setPartnerGyms([...partnerGyms, { name:'' }]); setPartnerGymsDirty(true); }}
              style={{ marginTop:6, height:38, padding:'0 16px', borderRadius:8, border:'0.5px dashed #8B1A1A', background:'#fff', color:'#8B1A1A', fontSize:13, cursor:'pointer' }}>＋ 新增友館</button>
          </div>
        </div>
      )}

      {activeTab === 'paymentMethods' && isSuperAdmin && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>💳 付款方式開關</span>
            <SaveButton onSave={handleSavePayMethods} isDirty={payMethodsDirty} label='儲存付款方式' fullWidth />
          </div>
          <div style={{ padding:16 }}>
            <div style={{ fontSize:12, color:'#999', lineHeight:1.6, marginBottom:16, textAlign:'left' }}>
              控制<strong>全站所有付款頁</strong>（入場、課程、體驗、比賽、租借、定期票、分期、商品銷售…）可選的付款方式。
              關閉的方式各付款頁一律不顯示。LinePay／街口／台灣 Pay 請於金流 API 對接完成後再開放。
            </div>
            {PAY_KEYS.map(pk => (
              <label key={pk.key} onClick={() => { setPayMethods(p => ({ ...p, [pk.key]: !p[pk.key] })); setPayMethodsDirty(true); }}
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderRadius:10, border:'0.5px solid #E8D5D5', marginBottom:10, cursor:'pointer' }}>
                <span style={{ textAlign:'left' }}>
                  <span style={{ fontSize:14, fontWeight:600, display:'block' }}>{pk.label}</span>
                  <span style={{ fontSize:11, color:'#999' }}>{pk.note}</span>
                </span>
                <span style={{ width:44, height:26, borderRadius:13, background: payMethods[pk.key] ? '#2D7D46' : '#ccc', position:'relative', transition:'.2s', flexShrink:0 }}>
                  <span style={{ position:'absolute', top:3, left: payMethods[pk.key] ? 21 : 3, width:20, height:20, borderRadius:10, background:'#fff', transition:'.2s' }} />
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'waiver' && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>Waiver 風險說明書內容</span>
            {isAdmin && <SaveButton onSave={handleSaveWaiver} isDirty={waiverDirty} label='儲存 Waiver 內容' fullWidth />}
          </div>
          <div style={{ padding:16 }}>
            <div style={{ marginBottom:16 }}>
              <label style={{ ...s.label, fontSize:13, fontWeight:500, marginBottom:8 }}>中文版</label>
              <textarea value={waiver.zh} rows={14}
                onChange={e => setWaiver(p => ({...p, zh: e.target.value}))}
                disabled={!isAdmin}
                style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:12, fontSize:13, fontFamily:'inherit', background:'#FBF5F5', outline:'none', resize:'vertical', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ ...s.label, fontSize:13, fontWeight:500, marginBottom:8 }}>英文版</label>
              <textarea value={waiver.en} rows={14}
                onChange={e => setWaiver(p => ({...p, en: e.target.value}))}
                disabled={!isAdmin}
                style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:12, fontSize:13, fontFamily:'inherit', background:'#FBF5F5', outline:'none', resize:'vertical', boxSizing:'border-box' }} />
            </div>
          </div>
        </div>
      )}

      {/* 銀行帳號編輯 Modal */}
      {/* ── 墜落測驗 ── */}
      {activeTab === 'fallTest' && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>墜落測驗設定</span>
            {isAdmin && <SaveButton onSave={handleSaveFallTest} isDirty={fallTestDirty} label='儲存墜落測驗設定' fullWidth />}
          </div>
          <div style={{ padding:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <label style={{ ...s.label, display:'block', marginBottom:5 }}>有效年數</label>
                <input type="number" min="1" max="5" value={fallTest.validYears}
                  onChange={e => setFallTest(p => ({...p, validYears: Number(e.target.value)}))}
                  disabled={!isAdmin} style={s.input} />
              </div>
              <div>
                <label style={{ ...s.label, display:'block', marginBottom:5 }}>展延所需入場次數</label>
                <input type="number" min="1" max="10" value={fallTest.requiredCheckins}
                  onChange={e => setFallTest(p => ({...p, requiredCheckins: Number(e.target.value)}))}
                  disabled={!isAdmin} style={s.input} />
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ ...s.label, display:'block', marginBottom:5 }}>YouTube 安全影片連結</label>
              <input value={fallTest.youtubeUrl} placeholder="https://youtube.com/watch?v=..."
                onChange={e => setFallTest(p => ({...p, youtubeUrl: e.target.value}))}
                disabled={!isAdmin} style={{ ...s.input, width:'100%' }} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ ...s.label, display:'block', marginBottom:5 }}>觀看比例解鎖簽名（%）</label>
              <input type="number" min="50" max="100" value={fallTest.watchPercentRequired}
                onChange={e => setFallTest(p => ({...p, watchPercentRequired: Number(e.target.value)}))}
                disabled={!isAdmin} style={s.input} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ ...s.label, display:'block', marginBottom:5 }}>同意書內容（中文）</label>
              <textarea value={fallTest.contentZh} rows={6} placeholder="墜落測驗風險說明書（中文）..."
                onChange={e => setFallTest(p => ({...p, contentZh: e.target.value}))}
                disabled={!isAdmin}
                style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', fontSize:13, background:'#FBF5F5', outline:'none', resize:'vertical', boxSizing:'border-box', color:'#1a1a1a' }} />
            </div>
            <div>
              <label style={{ ...s.label, display:'block', marginBottom:5 }}>同意書內容（英文）</label>
              <textarea value={fallTest.contentEn} rows={6} placeholder="Fall Test Risk Disclaimer (English)..."
                onChange={e => setFallTest(p => ({...p, contentEn: e.target.value}))}
                disabled={!isAdmin}
                style={{ width:'100%', borderRadius:8, border:'0.5px solid #E8D5D5', padding:'8px 12px', fontSize:13, background:'#FBF5F5', outline:'none', resize:'vertical', boxSizing:'border-box', color:'#1a1a1a' }} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'devices' && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>待審核裝置（員工個人帳號 / 館別電腦首次登入）</span>
            <button style={s.btn} onClick={loadPendingDevices}>重新整理</button>
          </div>
          {pendingDevices.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:'#999', fontSize:13 }}>目前沒有待審核的裝置</div>
          ) : pendingDevices.map(d => (
            <div key={d.id} style={s.row}>
              <div>
                <div style={{ fontWeight:600, fontSize:13 }}>
                  {d.accountName || d.accountId} <span style={{ fontSize:11, color:'#999', fontWeight:400 }}>（{d.accountType === 'station' ? '館別電腦' : '員工個人帳號'}）</span>
                </div>
                <div style={{ fontSize:11, color:'#999', marginTop:3 }}>{d.accountEmail}</div>
                <div style={{ fontSize:11, color:'#bbb', marginTop:2, maxWidth:320, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.deviceLabel}</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => handleRejectDevice(d.id)} disabled={deviceActionLoading===d.id}
                  style={{ ...s.btn, color:'#A32D2D', borderColor:'#F09595' }}>拒絕</button>
                <button onClick={() => handleApproveDevice(d.id)} disabled={deviceActionLoading===d.id}
                  style={s.btnPrimary}>{deviceActionLoading===d.id ? '處理中...' : '核准'}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'devices' && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>已核准裝置（{trustedDevices.length}）</span>
            <button style={s.btn} onClick={loadTrustedDevices}>重新整理</button>
          </div>
          {trustedDevices.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:'#999', fontSize:13 }}>目前沒有已核准的裝置</div>
          ) : trustedDevices.map(d => (
            <div key={d.id} style={s.row}>
              <div>
                <div style={{ fontWeight:600, fontSize:13 }}>
                  {d.accountName} <span style={{ fontSize:11, color:'#999', fontWeight:400 }}>（{d.accountType === 'station' ? '館別電腦' : '員工個人帳號'}）</span>
                </div>
                <div style={{ fontSize:11, color:'#999', marginTop:3 }}>
                  📱 {deviceUA(d.deviceLabel)}　·　核准 {tsDay(d.approvedAt)}　·　最後使用 {tsDay(d.lastUsedAt)}
                </div>
              </div>
              <button onClick={() => handleRemoveTrusted(d)} disabled={deviceActionLoading===d.id}
                style={{ ...s.btn, color:'#A32D2D', borderColor:'#F09595' }}>
                {deviceActionLoading===d.id ? '處理中...' : '移除'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── 裝置綁定總開關 ── */}
      {activeTab === 'staffAccounts' && isSuperAdmin && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>🔒 裝置綁定</span>
          </div>
          <div style={{ padding:'14px 4px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:16 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:500 }}>強制裝置驗證</div>
              <div style={{ fontSize:12, color:'#888', marginTop:3, lineHeight:1.6 }}>
                開啟後，員工個人帳號與館別電腦於新裝置首次登入須經 Email 驗證碼／管理員核准（系統管理員不受限）。
                測試或系統轉換期可暫時關閉；完成後請務必重新開啟。
              </div>
            </div>
            <button onClick={toggleDeviceBinding} disabled={deviceBindingSaving}
              title={deviceBindingEnabled ? '點擊關閉' : '點擊開啟'}
              style={{ position:'relative', width:52, height:30, borderRadius:15, border:'none', flexShrink:0,
                background: deviceBindingEnabled ? '#2D7D46' : '#C0B8B8', cursor: deviceBindingSaving ? 'wait' : 'pointer', transition:'background .2s' }}>
              <span style={{ position:'absolute', top:3, left: deviceBindingEnabled ? 25 : 3, width:24, height:24, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.3)' }}/>
            </button>
          </div>
          <div style={{ padding:'8px 12px', borderRadius:8, background: deviceBindingEnabled ? '#E6F4EB' : '#FCEBEB', fontSize:12, color: deviceBindingEnabled ? '#2D7D46' : '#A32D2D' }}>
            目前狀態：{deviceBindingEnabled ? '✅ 已開啟（登入須裝置驗證）' : '⚠ 已關閉（登入不驗證裝置，僅測試/轉換期）'}
          </div>
        </div>
      )}

      {/* ── Email 認證總開關 ── */}
      {activeTab === 'staffAccounts' && isSuperAdmin && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>✉️ Email 認證</span>
          </div>
          <div style={{ padding:'14px 4px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:16 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:500 }}>強制 Email 驗證</div>
              <div style={{ fontSize:12, color:'#888', marginTop:3, lineHeight:1.6 }}>
                開啟後，會員自助註冊須點擊驗證信連結完成 Email 驗證才能登入（員工建立／舊系統移轉的帳號不受限）。
                資料移轉或測試期可暫時關閉；完成後請務必重新開啟。
              </div>
            </div>
            <button onClick={toggleEmailVerify} disabled={emailVerifySaving}
              title={emailVerifyEnabled ? '點擊關閉' : '點擊開啟'}
              style={{ position:'relative', width:52, height:30, borderRadius:15, border:'none', flexShrink:0,
                background: emailVerifyEnabled ? '#2D7D46' : '#C0B8B8', cursor: emailVerifySaving ? 'wait' : 'pointer', transition:'background .2s' }}>
              <span style={{ position:'absolute', top:3, left: emailVerifyEnabled ? 25 : 3, width:24, height:24, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.3)' }}/>
            </button>
          </div>
          <div style={{ padding:'8px 12px', borderRadius:8, background: emailVerifyEnabled ? '#E6F4EB' : '#FCEBEB', fontSize:12, color: emailVerifyEnabled ? '#2D7D46' : '#A32D2D' }}>
            目前狀態：{emailVerifyEnabled ? '✅ 已開啟（自助註冊須驗證 Email 才能登入）' : '⚠ 已關閉（自助註冊免驗證即可登入，僅測試/轉換期）'}
          </div>
        </div>
      )}

      {/* ── 員工帳號 ── */}
      {activeTab === 'staffAccounts' && isSuperAdmin && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <span>員工帳號管理</span>
            <button onClick={openAddStaff} style={s.btnPrimary}>＋ 新增員工</button>
          </div>
          {staffLoading ? (
            <div style={{ padding:30, textAlign:'center', color:'#999', fontSize:13 }}>載入中...</div>
          ) : staffList.length === 0 ? (
            <div style={{ padding:30, textAlign:'center', color:'#999', fontSize:13 }}>尚無員工帳號</div>
          ) : (
            staffList.map(st => (
              <div key={st.id} style={s.row}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
                    {st.name}
                    <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#E6F1FB', color:'#185FA5' }}>{ROLE_LABELS[st.role]}</span>
                    {!st.isActive && (
                      <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#FCEBEB', color:'#A32D2D' }}>已停用</span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:'#999', marginTop:3 }}>
                    {st.email}{st.phone ? ` · ${st.phone}` : ''}{st.gymId ? ` · ${gyms.find(g=>g.id===st.gymId)?.name || st.gymId}` : ''}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => openEditStaff(st)} style={{ height:30, padding:'0 12px', borderRadius:7, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:12, cursor:'pointer' }}>編輯</button>
                  <button onClick={() => { setResettingPasswordFor(st); setResetPasswordValue(''); }} style={{ height:30, padding:'0 12px', borderRadius:7, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:12, cursor:'pointer' }}>重設密碼</button>
                  <button onClick={() => handleToggleActive(st)}
                    style={{ height:30, padding:'0 12px', borderRadius:7, background:'#fff', border:`0.5px solid ${st.isActive?'#A32D2D':'#2D7D46'}`, color: st.isActive?'#A32D2D':'#2D7D46', fontSize:12, cursor:'pointer' }}>
                    {st.isActive ? '停用' : '啟用'}
                  </button>
                  {st.role !== 'super_admin' && (
                    <button onClick={() => handleDeleteStaff(st)}
                      style={{ height:30, padding:'0 12px', borderRadius:7, background:'#A32D2D', border:'none', color:'#fff', fontSize:12, cursor:'pointer' }}>
                      刪除
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── 館別電腦帳號 ── */}
      {activeTab === 'staffAccounts' && isSuperAdmin && (
        <div style={{ ...s.card, marginTop:16 }}>
          <div style={s.cardHead}>
            <span>🖥️ 館別電腦帳號</span>
            <button onClick={openAddStation} style={s.btnPrimary}>＋ 新增電腦帳號</button>
          </div>
          <div style={{ fontSize:12, color:'#888', margin:'0 0 10px', lineHeight:1.6 }}>
            館別電腦以此帳號長期登入（前台固定電腦），員工再於其上打卡值班。結帳、退費審核等須由此電腦打卡後操作。
          </div>
          {stationLoading ? (
            <div style={{ padding:24, textAlign:'center', color:'#999', fontSize:13 }}>載入中...</div>
          ) : stationList.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:'#999', fontSize:13 }}>尚無館別電腦帳號</div>
          ) : (
            stationList.map(st => (
              <div key={st.id} style={s.row}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
                    {st.name}
                    <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#E6F1FB', color:'#185FA5' }}>{gyms.find(g=>g.id===st.gymId)?.name || st.gymName || st.gymId}</span>
                    {!st.isActive && <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#FCEBEB', color:'#A32D2D' }}>已停用</span>}
                  </div>
                  <div style={{ fontSize:12, color:'#999', marginTop:3 }}>{st.email}</div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => openEditStation(st)} style={{ height:30, padding:'0 12px', borderRadius:7, background:'#fff', border:'0.5px solid #E8D5D5', color:'#666', fontSize:12, cursor:'pointer' }}>編輯</button>
                  <button onClick={() => handleToggleStation(st)}
                    style={{ height:30, padding:'0 12px', borderRadius:7, background:'#fff', border:`0.5px solid ${st.isActive?'#A32D2D':'#2D7D46'}`, color: st.isActive?'#A32D2D':'#2D7D46', fontSize:12, cursor:'pointer' }}>
                    {st.isActive ? '停用' : '啟用'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 新增/編輯館別電腦帳號 Modal */}
      {showStationForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:440, maxWidth:'95vw', maxHeight:'88vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:16 }}>{editingStation ? `編輯電腦帳號 — ${editingStation.name}` : '新增館別電腦帳號'}</div>
            {stationFormMsg && <div style={{ background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#A32D2D' }}>{stationFormMsg}</div>}
            <label style={s.label}>帳號名稱</label>
            <input value={stationForm.name} onChange={e => setStationForm({ ...stationForm, name:e.target.value })} placeholder="如：新竹館電腦" style={s.input} />
            <label style={s.label}>登入 Email{editingStation && <span style={{ color:'#999', fontWeight:400 }}>（不可修改）</span>}</label>
            <input value={stationForm.email} disabled={!!editingStation} onChange={e => setStationForm({ ...stationForm, email:e.target.value })} placeholder="station@redrock.app" style={{ ...s.input, background: editingStation?'#F3F3F3':'#FBF5F5' }} />
            <label style={s.label}>館別</label>
            <select value={stationForm.gymId} onChange={e => setStationForm({ ...stationForm, gymId:e.target.value })} style={s.input}>
              <option value="">請選擇館別</option>
              {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <label style={s.label}>通知 Email<span style={{ color:'#999', fontWeight:400 }}>（選填，新裝置驗證碼寄送用）</span></label>
            <input value={stationForm.notificationEmail} onChange={e => setStationForm({ ...stationForm, notificationEmail:e.target.value })} placeholder="收驗證碼的真實信箱" style={s.input} />
            <label style={s.label}>{editingStation ? '重設密碼（留空則不變）' : '密碼'}</label>
            <PasswordInput value={stationForm.password} onChange={e => setStationForm({ ...stationForm, password:e.target.value })} placeholder={editingStation ? '留空不修改' : '至少 6 碼'} style={s.input} />
            <div style={{ display:'flex', gap:8, marginTop:18 }}>
              <button onClick={() => setShowStationForm(false)} style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
              <button onClick={handleSaveStation} disabled={stationSaving} style={{ ...s.btnPrimary, flex:2, height:40 }}>{stationSaving ? '儲存中...' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 新增/編輯員工 Modal */}
      {showStaffForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:440, maxWidth:'95vw', maxHeight:'88vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:600 }}>{editingStaff ? `編輯員工 — ${editingStaff.name}` : '新增員工'}</div>
              <button onClick={() => setShowStaffForm(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={s.label}>姓名</label>
              <input value={staffForm.name} onChange={e => setStaffForm({...staffForm, name:e.target.value})} style={s.input} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={s.label}>Email（登入帳號）</label>
              <input type="email" value={staffForm.email} onChange={e => setStaffForm({...staffForm, email:e.target.value})} style={s.input} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={s.label}>電話（選填）</label>
              <input value={staffForm.phone} onChange={e => setStaffForm({...staffForm, phone:e.target.value})} style={s.input} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={s.label}>角色</label>
              <select value={staffForm.role} onChange={e => setStaffForm({...staffForm, role:e.target.value})} style={s.input}>
                <option value="part_time">兼職</option>
                <option value="full_time">正職</option>
                <option value="gym_manager">館長</option>
                <option value="super_admin">系統管理員</option>
              </select>
            </div>
            {staffForm.role !== 'super_admin' && (
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>所屬場館</label>
                <select value={staffForm.gymId} onChange={e => setStaffForm({...staffForm, gymId:e.target.value})} style={s.input}>
                  <option value="">請選擇...</option>
                  {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ marginBottom:12 }}>
              <label style={s.label}>通知信箱（選填，用於新裝置登入OTP，留空則使用上方Email）</label>
              <input type="email" value={staffForm.notificationEmail} onChange={e => setStaffForm({...staffForm, notificationEmail:e.target.value})} style={s.input} />
              <div style={{ fontSize:11, color:'#854F0B', background:'#FFFBF0', border:'0.5px solid #F0D9A8', borderRadius:6, padding:'6px 10px', marginTop:6, lineHeight:1.6 }}>
                ⚠ 若留空，新裝置登入時的驗證碼會寄到上方「登入帳號」Email。若該Email不是真實能收信的信箱（例如僅作為帳號用途），員工將無法完成首次登入驗證，請務必填寫一個真實可收信的地址。
              </div>
            </div>
            {!editingStaff && (
              <div style={{ marginBottom:12 }}>
                <label style={s.label}>初始密碼（至少6個字元）</label>
                <PasswordInput value={staffForm.password} onChange={e => setStaffForm({...staffForm, password:e.target.value})} style={s.input} />
              </div>
            )}
            {staffFormMsg && (
              <div style={{ background:'#FCEBEB', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#A32D2D', marginBottom:14 }}>{staffFormMsg}</div>
            )}
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button onClick={() => setShowStaffForm(false)}
                style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
              <button onClick={handleSaveStaff} disabled={staffSaving} style={{ ...s.btnPrimary, flex:2, height:40 }}>
                {staffSaving ? '儲存中...' : editingStaff ? '儲存變更' : '確認新增'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重設密碼 Modal */}
      {resettingPasswordFor && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:360, maxWidth:'95vw', border:'0.5px solid #E8D5D5' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontSize:16, fontWeight:600 }}>重設密碼 — {resettingPasswordFor.name}</div>
              <button onClick={() => setResettingPasswordFor(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={s.label}>新密碼（至少6個字元）</label>
              <PasswordInput value={resetPasswordValue} onChange={e => setResetPasswordValue(e.target.value)} style={s.input} />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setResettingPasswordFor(null)}
                style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
              <button onClick={handleResetPassword} style={{ ...s.btnPrimary, flex:2, height:40 }}>確認重設</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 場館設置 ── */}
      {activeTab === 'gyms' && isSuperAdmin && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:600 }}>場館列表</div>
            <button onClick={()=>{ setShowAddGym(true); setGymMsg(''); }}
              style={{ height:34, padding:'0 14px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>+ 新增場館</button>
          </div>
          {gymMsg && <div style={{ background:'#E6F4EB', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#2D7D46' }}>{gymMsg}</div>}
          {gyms.map(gym => (
            <div key={gym.id} style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', padding:'12px 16px', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:600, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
                  {gym.name}
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background: gym.status==='suspended'?'#FCEBEB':'#E6F4EB', color: gym.status==='suspended'?'#A32D2D':'#2D7D46' }}>
                    {gym.status==='suspended'?'已暫停':'營運中'}
                  </span>
                </div>
                <div style={{ fontSize:12, color:'#999', marginTop:3 }}>{gym.id}{gym.address ? ` · ${gym.address}` : ''}</div>
              </div>
              <button onClick={()=>handleToggleGym(gym)}
                style={{ height:32, padding:'0 14px', borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', color: gym.status==='suspended'?'#2D7D46':'#A32D2D', fontSize:12, cursor:'pointer' }}>
                {gym.status==='suspended'?'恢復營運':'暫停場館'}
              </button>
            </div>
          ))}
          {showAddGym && (
            <div style={{ background:'#FBF5F5', borderRadius:12, border:'0.5px solid #E8D5D5', padding:16, marginTop:12 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>新增場館</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>場館 ID *（英文，不可重複）</label>
                  <input value={newGymId} onChange={e=>setNewGymId(e.target.value)} placeholder="gym-example"
                    style={{ width:'100%', height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
                </div>
                <div>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>場館名稱 *</label>
                  <input value={newGymName} onChange={e=>setNewGymName(e.target.value)} placeholder="XX館"
                    style={{ width:'100%', height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>地址</label>
                  <input value={newGymAddress} onChange={e=>setNewGymAddress(e.target.value)} placeholder="地址（選填）"
                    style={{ width:'100%', height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff', color:'#1a1a1a' }}/>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setShowAddGym(false)} style={{ flex:1, height:38, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:13, cursor:'pointer' }}>取消</button>
                <button onClick={handleAddGym} disabled={gymSaving}
                  style={{ flex:2, height:38, borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
                  {gymSaving?'新增中...':'確認新增'}
                </button>
              </div>
            </div>
          )}
          {/* 場館資訊編輯 */}
          <div style={{ marginTop:24 }}>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:14, paddingBottom:8, borderBottom:'0.5px solid #E8D5D5' }}>場館資訊管理</div>
            <GymsPage embedded />
          </div>
        </div>
      )}

      {activeTab === 'announcements' && canOwnGymAnnounce && (
        <div style={s.card}>
          <div style={s.cardHead}><span>📢 場館公告（本館輪播／一般公告）</span></div>
          <div style={{ padding:'4px 0' }}><GymsPage embedded /></div>
        </div>
      )}

      {/* 暫停/恢復確認 Modal */}
      {confirmGym && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, maxWidth:360, width:'100%', boxShadow:'0 8px 32px rgba(0,0,0,.15)' }}>
            <div style={{ fontSize:20, textAlign:'center', marginBottom:12 }}>
              {confirmGym.newStatus === 'suspended' ? '⏸️' : '▶️'}
            </div>
            <div style={{ fontSize:15, fontWeight:600, textAlign:'center', marginBottom:8 }}>
              確定要{confirmGym.newStatus === 'suspended' ? '暫停' : '恢復'}場館？
            </div>
            <div style={{ fontSize:13, color:'#666', textAlign:'center', marginBottom:20, background:'#FBF5F5', borderRadius:8, padding:'10px 14px' }}>
              <strong>{confirmGym.gym.name}</strong>
              {confirmGym.newStatus === 'suspended'
                ? '　將暫停對外開放，會員無法選擇此場館入場'
                : '　將恢復正常營運'}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmGym(null)}
                style={{ flex:1, height:44, borderRadius:10, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>
                取消
              </button>
              <button onClick={doToggleGym}
                style={{ flex:1, height:44, borderRadius:10, background: confirmGym.newStatus==='suspended'?'#A32D2D':'#2D7D46', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                確認{confirmGym.newStatus === 'suspended' ? '暫停' : '恢復'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
