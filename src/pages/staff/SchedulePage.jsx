import { useState, useEffect } from 'react';
import { getMonthlyShifts, getHoursSummary, getScheduleStaffList, createShift, createRecurringShifts, updateShift, deleteShift, clearMonthSchedule, copyPreviousMonthSchedule } from '../../api/schedule';
import { getGyms } from '../../api/gyms';
import { useAuth } from '../../store/authStore';
import dayjs from 'dayjs';

const Modal = ({ title, onClose, children, width=420 }) => (
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

const WEEKDAYS = ['日','一','二','三','四','五','六'];
const STAFF_COLORS = ['#8B1A1A','#185FA5','#2D7D46','#854F0B','#533AB7','#0F6E56','#A32D2D','#B5762B'];

export default function SchedulePage() {
  const { staff, activeGymId, viewGym } = useAuth();
  const isSuperAdmin = staff?.role === 'super_admin';
  const canManage = ['super_admin', 'gym_manager'].includes(staff?.role);

  const [gyms, setGyms] = useState([]);
  // 場館由頂部全域選擇器控制；排班為單館檢視，「全館」退回第一個館
  const targetGymId = isSuperAdmin ? (viewGym || gyms[0]?.id || '') : (activeGymId || staff?.gymId);

  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [shifts, setShifts] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [hoursSummary, setHoursSummary] = useState([]);
  const [showHours, setShowHours] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [standardHours, setStandardHours] = useState({ 0:11, 1:9, 2:9, 3:9, 4:9, 5:9, 6:12 });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [shiftForm, setShiftForm] = useState({ staffId:'', date:'', type:'full_day', startTime:'10:00', endTime:'18:00', note:'' });
  const [saving, setSaving] = useState(false);
  const [schedBusy, setSchedBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const monthLabel = () => dayjs(`${month}-01`).format('YYYY年MM月');
  const handleCopyPrevious = async () => {
    if (!targetGymId) return;
    const prev = dayjs(`${month}-01`).subtract(1, 'month').format('YYYY年MM月');
    if (!window.confirm(`確定要把「${prev}」的排班以星期對應複製到「${monthLabel()}」？\n（本月現有排班會保留，整天班重複會自動略過）`)) return;
    setSchedBusy(true);
    try {
      const res = await copyPreviousMonthSchedule(targetGymId, month);
      showMsg(res.data.message || '已複製上月排班');
      await loadData();
    } catch (e) { showMsg(e?.response?.data?.message || '複製失敗', 'red'); }
    finally { setSchedBusy(false); }
  };
  const handleClearMonth = async () => {
    setConfirmClear(false);
    if (!targetGymId) return;
    setSchedBusy(true);
    try {
      const res = await clearMonthSchedule(targetGymId, month);
      showMsg(res.data.message || '已清空本月排班');
      await loadData();
    } catch (e) { showMsg(e?.response?.data?.message || '清空失敗', 'red'); }
    finally { setSchedBusy(false); }
  };

  // 固定週班
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    staffId:'', weekdays:[], type:'full_day', startTime:'10:00', endTime:'18:00', note:'',
    rangeStart: dayjs().format('YYYY-MM-DD'), rangeEnd: dayjs().add(1,'month').format('YYYY-MM-DD'),
  });
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [recurringResult, setRecurringResult] = useState(null);
  const [recurringError, setRecurringError] = useState('');

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      const { default: client } = await import('../../api/client');
      await client.put('/schedule/settings/' + targetGymId, { standardHours });
      showMsg('工時設定已儲存', 'ok');
      setShowSettings(false);
    } catch(e) { showMsg('儲存失敗', 'red'); }
    finally { setSettingsSaving(false); }
  };

  const showMsg = (text, type='ok') => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(''), 3000); };

  useEffect(() => {
    if (isSuperAdmin) {
      getGyms().then(res => setGyms(res.data.gyms || [])).catch(() => {});
    }
  }, [isSuperAdmin]);

  const loadSettings = async () => {
    if (!targetGymId) return;
    try {
      const res = await import('../../api/client').then(m => m.default.get('/schedule/settings/' + targetGymId));
      const s = res.data?.settings?.standardHours;
      if (s) setStandardHours(s);
    } catch(e) {}
  };

  const loadData = async () => {
    if (!targetGymId) return;
    setLoading(true);
    try {
      const [shiftsRes, staffRes] = await Promise.all([
        getMonthlyShifts(targetGymId, month),
        canManage ? getScheduleStaffList(targetGymId) : Promise.resolve({ data: { staffList: [] } }),
      ]);
      setShifts(shiftsRes.data.shifts || []);
      setStaffList(staffRes.data.staffList || []);
    } catch (e) { setShifts([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); loadSettings(); }, [targetGymId, month]);

  const loadHoursSummary = async () => {
    try {
      const res = await getHoursSummary(targetGymId, month);
      setHoursSummary(res.data.summary || []);
      setShowHours(true);
    } catch (e) { showMsg('載入工時統計失敗', 'red'); }
  };

  // 依 staffId 全字串雜湊取色，確保「每個人」在任何登入模式（館別電腦/員工）都有穩定且不同的顏色
  // （原本 staffList 為空時只取首字元 charCode 易撞色；改用全字串雜湊）
  const staffColor = (staffId) => {
    if (!staffId) return STAFF_COLORS[0];
    // 有 staffList(管理員)→用索引保證不撞色；無 staffList(館別電腦/員工)→用全字串雜湊穩定取色
    const idx = staffList.findIndex(s => s.id === staffId);
    if (idx >= 0) return STAFF_COLORS[idx % STAFF_COLORS.length];
    let h = 0;
    for (let i = 0; i < staffId.length; i++) h = (h * 31 + staffId.charCodeAt(i)) >>> 0;
    return STAFF_COLORS[h % STAFF_COLORS.length];
  };

  // 建立月曆格子
  const startOfMonth = dayjs(`${month}-01`);
  const daysInMonth = startOfMonth.daysInMonth();
  const firstDayOfWeek = startOfMonth.day(); // 0=日
  const calendarCells = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(startOfMonth.date(d).format('YYYY-MM-DD'));

  const shiftsForDate = (date) => shifts.filter(s => s.date === date);

  const openAddShift = (date) => {
    if (!canManage) return;
    setEditingShift(null);
    setShiftForm({ staffId: staffList[0]?.id || '', date, type:'full_day', startTime:'10:00', endTime:'18:00', note:'' });
    setShowShiftModal(true);
  };

  const openEditShift = (shift) => {
    if (!canManage) return;
    setEditingShift(shift);
    setShiftForm({
      staffId: shift.staffId, date: shift.date, type: shift.type,
      startTime: shift.startTime || '10:00', endTime: shift.endTime || '18:00', note: shift.note || '',
    });
    setShowShiftModal(true);
  };

  const handleSaveShift = async () => {
    if (!shiftForm.staffId) { showMsg('請選擇員工', 'red'); return; }
    setSaving(true);
    try {
      const selectedStaff = staffList.find(s => s.id === shiftForm.staffId);
      const payload = {
        gymId: targetGymId,
        staffId: shiftForm.staffId,
        staffName: selectedStaff?.name || '',
        date: shiftForm.date,
        type: shiftForm.type,
        note: shiftForm.note,
        ...(shiftForm.type === 'custom' ? { startTime: shiftForm.startTime, endTime: shiftForm.endTime } : {}),
      };
      if (editingShift) {
        await updateShift(editingShift.id, payload);
        showMsg('排班已更新');
      } else {
        await createShift(payload);
        showMsg('排班已新增');
      }
      setShowShiftModal(false);
      await loadData();
    } catch (err) {
      showMsg(err.response?.data?.message || '儲存失敗', 'red');
    } finally { setSaving(false); }
  };

  const openRecurringModal = () => {
    setRecurringForm({
      staffId: staffList[0]?.id || '', weekdays:[], type:'full_day', startTime:'10:00', endTime:'18:00', note:'',
      rangeStart: dayjs().format('YYYY-MM-DD'), rangeEnd: dayjs().add(1,'month').format('YYYY-MM-DD'),
    });
    setRecurringResult(null);
    setRecurringError('');
    setShowRecurringModal(true);
  };

  const toggleRecurringWeekday = (d) => {
    setRecurringForm(f => ({
      ...f,
      weekdays: f.weekdays.includes(d) ? f.weekdays.filter(x => x !== d) : [...f.weekdays, d],
    }));
  };

  const handleSaveRecurring = async () => {
    setRecurringError('');
    if (!recurringForm.staffId) { setRecurringError('請選擇員工'); return; }
    if (recurringForm.weekdays.length === 0) { setRecurringError('請至少選擇一個星期幾'); return; }
    if (!recurringForm.rangeStart || !recurringForm.rangeEnd) { setRecurringError('請設定適用期間'); return; }
    if (recurringForm.rangeStart > recurringForm.rangeEnd) { setRecurringError('結束日期必須晚於開始日期'); return; }
    const maxEnd = dayjs(recurringForm.rangeStart).add(3, 'month').format('YYYY-MM-DD');
    if (recurringForm.rangeEnd > maxEnd) { setRecurringError('適用期間最長不可超過3個月，請縮短結束日期'); return; }

    setRecurringSaving(true);
    setRecurringResult(null);
    try {
      const selectedStaff = staffList.find(s => s.id === recurringForm.staffId);
      const payload = {
        gymId: targetGymId,
        staffId: recurringForm.staffId,
        staffName: selectedStaff?.name || '',
        weekdays: recurringForm.weekdays,
        type: recurringForm.type,
        note: recurringForm.note,
        rangeStart: recurringForm.rangeStart,
        rangeEnd: recurringForm.rangeEnd,
        ...(recurringForm.type === 'custom' ? { startTime: recurringForm.startTime, endTime: recurringForm.endTime } : {}),
      };
      const res = await createRecurringShifts(payload);
      setRecurringResult(res.data);
      showMsg(res.data.message);
      await loadData();
    } catch (err) {
      setRecurringError(err.response?.data?.message || '建立失敗，請確認設定後再試一次');
    } finally { setRecurringSaving(false); }
  };

  const handleDeleteShift = async () => {
    if (!editingShift) return;
    if (!window.confirm('確定要刪除這筆排班？')) return;
    try {
      await deleteShift(editingShift.id);
      showMsg('排班已刪除');
      setShowShiftModal(false);
      await loadData();
    } catch (err) {
      showMsg('刪除失敗', 'red');
    }
  };

  return (
    <div style={{ padding:20, background:'#F7F3F3', minHeight:'100vh' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:600 }}>排班表</div>
          <div style={{ fontSize:12, color:'#999', marginTop:3 }}>{canManage ? '點擊日期新增排班，點擊既有排班可編輯' : '僅供查詢，如需異動請聯絡館別管理員'}</div>
        </div>
        {canManage && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={openRecurringModal}
              style={{ height:38, padding:'0 16px', borderRadius:8, background:'#fff', border:'0.5px solid #8B1A1A', color:'#8B1A1A', fontSize:13, cursor:'pointer' }}>
              🔁 設定固定週班
            </button>
            <button onClick={loadHoursSummary}
              style={{ height:38, padding:'0 16px', borderRadius:8, background:'#fff', border:'0.5px solid #185FA5', color:'#185FA5', fontSize:13, cursor:'pointer' }}>
              📊 本月工時統計
            </button>
            <button onClick={() => setShowSettings(true)}
              style={{ height:38, padding:'0 16px', borderRadius:8, background:'#fff', border:'0.5px solid #854F0B', color:'#854F0B', fontSize:13, cursor:'pointer' }}>
              ⚙️ 標準工時設定
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div style={{ background: msgType==='ok'?'#E6F4EB':'#FCEBEB', border:`0.5px solid ${msgType==='ok'?'#B3DEC0':'#F09595'}`, borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color: msgType==='ok'?'#2D7D46':'#A32D2D' }}>
          {msg}
        </div>
      )}

      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
        {isSuperAdmin && gyms.length > 0 && (
          <span style={{ height:36, display:'inline-flex', alignItems:'center', padding:'0 12px', borderRadius:8, background:'#FBF5F5', border:'0.5px solid #E8D5D5', fontSize:13, color:'#8B1A1A', fontWeight:600 }}>
            {gyms.find(g => g.id === targetGymId)?.shortName || gyms.find(g => g.id === targetGymId)?.name || targetGymId}{!viewGym && '（全館預設）'}
          </span>
        )}
        <button onClick={() => setMonth(dayjs(`${month}-01`).subtract(1,'month').format('YYYY-MM'))}
          style={{ width:36, height:36, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', cursor:'pointer', fontSize:16, color:'#333', fontWeight:600 }}>‹</button>
        <div style={{ fontSize:15, fontWeight:600, minWidth:90, textAlign:'center' }}>{dayjs(`${month}-01`).format('YYYY年MM月')}</div>
        <button onClick={() => setMonth(dayjs(`${month}-01`).add(1,'month').format('YYYY-MM'))}
          style={{ width:36, height:36, borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', cursor:'pointer', fontSize:16, color:'#333', fontWeight:600 }}>›</button>
        <button onClick={() => setMonth(dayjs().format('YYYY-MM'))}
          style={{ height:36, padding:'0 12px', borderRadius:8, border:'0.5px solid #E8D5D5', background:'#fff', cursor:'pointer', fontSize:12, color:'#666' }}>回到本月</button>
        {canManage && (
          <div style={{ display:'flex', gap:8, marginLeft:'auto' }}>
            <button onClick={handleCopyPrevious} disabled={schedBusy}
              style={{ height:36, padding:'0 14px', borderRadius:8, border:'0.5px solid #185FA5', background:'#fff', color:'#185FA5', cursor:'pointer', fontSize:12, fontWeight:500 }}>📋 複製上月排班</button>
            <button onClick={() => setConfirmClear(true)} disabled={schedBusy}
              style={{ height:36, padding:'0 14px', borderRadius:8, border:'0.5px solid #A32D2D', background:'#fff', color:'#A32D2D', cursor:'pointer', fontSize:12, fontWeight:500 }}>🗑 清空本月排班</button>
          </div>
        )}
      </div>

      {canManage && staffList.length > 0 && (
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
          {staffList.map((s) => (
            <div key={s.id} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#666' }}>
              <span style={{ width:10, height:10, borderRadius:5, background: staffColor(s.id) }} />
              {s.name}
            </div>
          ))}
        </div>
      )}

      {confirmClear && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:400, maxWidth:'95vw', border:'0.5px solid #E8D5D5' }}>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:10 }}>清空本月排班</div>
            <div style={{ fontSize:14, color:'#1a1a1a', lineHeight:1.7, marginBottom:6 }}>確定要清空「<strong>{monthLabel()}</strong>」<strong style={{ color:'#A32D2D' }}>所有排班</strong>？</div>
            <div style={{ fontSize:12, color:'#A32D2D', background:'#FBEEEE', border:'0.5px solid #E8C5C5', borderRadius:6, padding:'8px 10px', marginBottom:18 }}>⚠ 此動作無法復原，該館本月的排班將全部刪除。</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setConfirmClear(false)} style={{ flex:1, height:42, borderRadius:9, border:'0.5px solid #E8D5D5', background:'#fff', color:'#444', fontSize:14, cursor:'pointer' }}>取消</button>
              <button onClick={handleClearMonth} style={{ flex:1, height:42, borderRadius:9, background:'#A32D2D', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor:'pointer' }}>確認清空</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#999', fontSize:13 }}>載入中...</div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', background:'#FBF5F5', minWidth:640 }}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{ padding:'8px 0', textAlign:'center', fontSize:11, color:'#999', fontWeight:600 }}>{d}</div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', minWidth:640 }}>
            {calendarCells.map((date, idx) => {
              // 排序：全天班放最上面（同為全天依姓名穩定排序）；自由時段依開始時間先後上下排列
              const dayShifts = date ? [...shiftsForDate(date)].sort((a, b) => {
                const af = a.type === 'full_day' ? 0 : 1, bf = b.type === 'full_day' ? 0 : 1;
                if (af !== bf) return af - bf;
                if (af === 0) return (a.staffName || '').localeCompare(b.staffName || '');
                return (a.startTime || '').localeCompare(b.startTime || '');
              }) : [];
              const isToday = date === dayjs().format('YYYY-MM-DD');
              return (
                <div key={idx} onClick={() => date && openAddShift(date)}
                  style={{
                    minHeight:84, borderRight:'0.5px solid #F5EFEF', borderBottom:'0.5px solid #F5EFEF',
                    padding:6, cursor: date && canManage ? 'pointer' : 'default',
                    background: isToday ? '#FFFBF0' : '#fff',
                  }}>
                  {date && (
                    <>
                      <div style={{ fontSize:11, color: isToday ? '#8B1A1A' : '#999', fontWeight: isToday ? 700 : 400, marginBottom:4 }}>
                        {dayjs(date).date()}
                      </div>
                      {dayShifts.map(s => (
                        <div key={s.id} onClick={e => { e.stopPropagation(); openEditShift(s); }}
                          style={{
                            fontSize:10, padding:'2px 5px', borderRadius:4, marginBottom:2,
                            // 全天：淡色填滿（員工色 +25% 透明度）＋員工色文字，讀得清楚又不搶眼
                            background: s.type === 'full_day' ? `${staffColor(s.staffId)}40` : 'transparent',
                            color: staffColor(s.staffId),
                            border: s.type === 'full_day' ? 'none' : `1.5px solid ${staffColor(s.staffId)}`,
                            cursor: canManage ? 'pointer' : 'default',
                            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                          }}>
                          {s.staffName} {s.type === 'full_day' ? '全天' : `${s.startTime}-${s.endTime}`}
                        </div>
                      ))}
                
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 標準工時設定 Modal */}
      {showSettings && (
        <Modal title={`標準工時設定 — ${gyms.find(g => g.id === targetGymId)?.name || targetGymId}`} onClose={() => setShowSettings(false)}>
          <div style={{ fontSize:12, color:'#999', marginBottom:16 }}>設定各星期的全天班標準工時（用於本月工時統計計算）</div>
          {[
            { dow:1, label:'週一' }, { dow:2, label:'週二' }, { dow:3, label:'週三' },
            { dow:4, label:'週四' }, { dow:5, label:'週五' }, { dow:6, label:'週六' }, { dow:0, label:'週日' },
          ].map(({ dow, label }) => (
            <div key={dow} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'0.5px solid #F5EFEF' }}>
              <span style={{ fontSize:14, fontWeight:500 }}>{label}</span>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="number" min={1} max={24} step={0.5}
                  value={standardHours[dow] ?? 9}
                  onChange={e => setStandardHours(prev => ({ ...prev, [dow]: parseFloat(e.target.value) || 0 }))}
                  style={{ width:70, height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:14, textAlign:'center', background:'#fff', color:'#1a1a1a' }} />
                <span style={{ fontSize:13, color:'#666' }}>小時</span>
              </div>
            </div>
          ))}
          <div style={{ display:'flex', gap:8, marginTop:20 }}>
            <button onClick={() => setShowSettings(false)}
              style={{ flex:1, height:40, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={saveSettings} disabled={settingsSaving}
              style={{ flex:2, height:40, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
              {settingsSaving ? '儲存中...' : '儲存設定'}
            </button>
          </div>
        </Modal>
      )}

      {/* 新增/編輯排班 Modal */}
      {showShiftModal && (
        <Modal title={editingShift ? '編輯排班' : `新增排班 — ${shiftForm.date}`} onClose={() => setShowShiftModal(false)}>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>員工</label>
            <select value={shiftForm.staffId} onChange={e => setShiftForm({...shiftForm, staffId:e.target.value})}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
              <option value="">選擇員工...</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>日期</label>
            <input type="date" value={shiftForm.date} onChange={e => setShiftForm({...shiftForm, date:e.target.value})}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>排班類型</label>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShiftForm({...shiftForm, type:'full_day'})}
                style={{ flex:1, height:38, borderRadius:8, border: shiftForm.type==='full_day'?'none':'0.5px solid #E8D5D5', background: shiftForm.type==='full_day'?'#8B1A1A':'#fff', color: shiftForm.type==='full_day'?'#fff':'#666', fontSize:13, cursor:'pointer' }}>
                整天
              </button>
              <button onClick={() => setShiftForm({...shiftForm, type:'custom'})}
                style={{ flex:1, height:38, borderRadius:8, border: shiftForm.type==='custom'?'none':'0.5px solid #E8D5D5', background: shiftForm.type==='custom'?'#8B1A1A':'#fff', color: shiftForm.type==='custom'?'#fff':'#666', fontSize:13, cursor:'pointer' }}>
                自由時段
              </button>
            </div>
          </div>
          {shiftForm.type === 'custom' && (
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>開始時間</label>
                <input type="time" value={shiftForm.startTime} onChange={e => setShiftForm({...shiftForm, startTime:e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>結束時間</label>
                <input type="time" value={shiftForm.endTime} onChange={e => setShiftForm({...shiftForm, endTime:e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>
            </div>
          )}
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>備註（選填）</label>
            <input value={shiftForm.note} onChange={e => setShiftForm({...shiftForm, note:e.target.value})}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {editingShift && (
              <button onClick={handleDeleteShift}
                style={{ height:42, padding:'0 16px', borderRadius:9, border:'0.5px solid #A32D2D', background:'none', color:'#A32D2D', fontSize:13, cursor:'pointer' }}>刪除</button>
            )}
            <button onClick={() => setShowShiftModal(false)}
              style={{ flex:1, height:42, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>取消</button>
            <button onClick={handleSaveShift} disabled={saving}
              style={{ flex:2, height:42, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {saving ? '儲存中...' : editingShift ? '儲存變更' : '確認新增'}
            </button>
          </div>
        </Modal>
      )}

      {/* 固定週班 Modal */}
      {showRecurringModal && (
        <Modal title="設定固定週班" onClose={() => setShowRecurringModal(false)}>
          <div style={{ fontSize:11, color:'#999', marginBottom:14, lineHeight:1.6, background:'#FBF5F5', borderRadius:8, padding:'8px 12px' }}>
            選擇員工、星期幾、班別與適用期間，系統會自動在期間內所有符合的星期幾建立排班。遇休館公告會自動跳過；若為整天班遇到特殊營業時間公告，會自動調整為當天公告時段。與既有排班共存，不會互相覆蓋。
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>員工</label>
            <select value={recurringForm.staffId} onChange={e => setRecurringForm({...recurringForm, staffId:e.target.value})}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a' }}>
              <option value="">選擇員工...</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:8 }}>星期幾（可複選）</label>
            <div style={{ display:'flex', gap:6 }}>
              {['日','一','二','三','四','五','六'].map((d, i) => (
                <button key={i} type="button" onClick={() => toggleRecurringWeekday(i)}
                  style={{ flex:1, height:36, borderRadius:8, border: recurringForm.weekdays.includes(i)?'none':'0.5px solid #E8D5D5', background: recurringForm.weekdays.includes(i)?'#8B1A1A':'#fff', color: recurringForm.weekdays.includes(i)?'#fff':'#666', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>班別類型</label>
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" onClick={() => setRecurringForm({...recurringForm, type:'full_day'})}
                style={{ flex:1, height:38, borderRadius:8, border: recurringForm.type==='full_day'?'none':'0.5px solid #E8D5D5', background: recurringForm.type==='full_day'?'#8B1A1A':'#fff', color: recurringForm.type==='full_day'?'#fff':'#666', fontSize:13, cursor:'pointer' }}>
                整天
              </button>
              <button type="button" onClick={() => setRecurringForm({...recurringForm, type:'custom'})}
                style={{ flex:1, height:38, borderRadius:8, border: recurringForm.type==='custom'?'none':'0.5px solid #E8D5D5', background: recurringForm.type==='custom'?'#8B1A1A':'#fff', color: recurringForm.type==='custom'?'#fff':'#666', fontSize:13, cursor:'pointer' }}>
                自由時段
              </button>
            </div>
          </div>

          {recurringForm.type === 'custom' && (
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>開始時間</label>
                <input type="time" value={recurringForm.startTime} onChange={e => setRecurringForm({...recurringForm, startTime:e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>結束時間</label>
                <input type="time" value={recurringForm.endTime} onChange={e => setRecurringForm({...recurringForm, endTime:e.target.value})}
                  style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginBottom:6 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>適用期間開始</label>
              <input type="date" value={recurringForm.rangeStart} onChange={e => setRecurringForm({...recurringForm, rangeStart:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>適用期間結束</label>
              <input type="date" value={recurringForm.rangeEnd} onChange={e => setRecurringForm({...recurringForm, rangeEnd:e.target.value})}
                style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
            </div>
          </div>
          <div style={{ fontSize:11, color:'#B5762B', marginBottom:14 }}>適用期間最長不可超過3個月</div>

          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:5 }}>備註（選填）</label>
            <input value={recurringForm.note} onChange={e => setRecurringForm({...recurringForm, note:e.target.value})}
              style={{ width:'100%', height:38, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 12px', fontSize:13, background:'#FBF5F5', outline:'none', color:'#1a1a1a', boxSizing:'border-box' }}/>
          </div>

          {recurringError && (
            <div style={{ background:'#FCEBEB', border:'0.5px solid #F09595', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#A32D2D', lineHeight:1.7 }}>
              ✕ {recurringError}
            </div>
          )}

          {recurringResult && (
            <div style={{ background:'#E6F4EB', border:'0.5px solid #B3DEC0', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#2D7D46', lineHeight:1.7 }}>
              ✓ 已建立 {recurringResult.createdCount} 筆排班
              {recurringResult.skippedClosed > 0 && <><br/>⊘ {recurringResult.skippedClosed} 天因休館公告跳過</>}
              {recurringResult.skippedDuplicate > 0 && <><br/>⊘ {recurringResult.skippedDuplicate} 天因當天已有整天班而跳過</>}
              {recurringResult.adjustedSpecial > 0 && <><br/>⚠ {recurringResult.adjustedSpecial} 天已自動調整為當天特殊營業時段</>}
            </div>
          )}

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowRecurringModal(false)}
              style={{ flex:1, height:42, borderRadius:9, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>關閉</button>
            <button onClick={handleSaveRecurring} disabled={recurringSaving}
              style={{ flex:2, height:42, borderRadius:9, background:'#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {recurringSaving ? '建立中...' : '確認建立'}
            </button>
          </div>
        </Modal>
      )}

      {/* 工時統計 Modal */}
      {showHours && (
        <Modal title={`${dayjs(`${month}-01`).format('YYYY年MM月')} 工時統計`} onClose={() => setShowHours(false)}>
          {hoursSummary.length === 0 ? (
            <div style={{ textAlign:'center', padding:30, color:'#999', fontSize:13 }}>本月尚無排班紀錄</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#FBF5F5' }}>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:500, color:'#999', fontSize:11 }}>員工</th>
                  <th style={{ padding:'8px 10px', textAlign:'right', fontWeight:500, color:'#999', fontSize:11 }}>班次數</th>
                  <th style={{ padding:'8px 10px', textAlign:'right', fontWeight:500, color:'#999', fontSize:11 }}>總工時</th>
                </tr>
              </thead>
              <tbody>
                {hoursSummary.sort((a,b) => b.totalHours - a.totalHours).map(s => (
                  <tr key={s.staffId} style={{ borderTop:'0.5px solid #F5EFEF' }}>
                    <td style={{ padding:'10px' }}>{s.staffName}</td>
                    <td style={{ padding:'10px', textAlign:'right', color:'#999' }}>{s.shiftCount} 班</td>
                    <td style={{ padding:'10px', textAlign:'right', fontWeight:600, color:'#8B1A1A' }}>{s.totalHours} 小時</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ fontSize:11, color:'#999', marginTop:14, lineHeight:1.6 }}>
            ⓘ 整天班以8小時計算工時，自由時段班按實際填寫的開始/結束時間計算。
          </div>
        </Modal>
      )}
    </div>
  );
}