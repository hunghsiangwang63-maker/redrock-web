import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { getPayouts, createPayout, updatePayout, deletePayout, exportPayouts } from '../../api/payouts';
import { useAuth } from '../../store/authStore';
import Modal from '../../components/Modal';

const GYM_LABEL = { 'gym-hsinchu': '新竹館', 'gym-shilin': '士林館' };
const CATEGORY_SUGGESTIONS = ['教練費', '定線費', '拆點費', '其他'];
const NT = (n) => `NT$${(n || 0).toLocaleString()}`;

const emptyForm = (defaultGymId) => ({
  date: dayjs().format('YYYY-MM-DD'), payeeName: '', amount: '', category: '', gymId: defaultGymId, note: '',
});

// 人事報酬記錄（教練費/定線費/拆點費等）——供日後申報所得時查資料清楚用。
// 與每日結帳「加減項」是兩個獨立機制，刻意不互相同步（見後端 payouts.js 檔頭說明）。
export default function PayoutsPanel({ gymFilter }) {
  const { staff, viewGym } = useAuth();
  const isSuperAdmin = staff?.role === 'super_admin';

  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [dateTo, setDateTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [nameFilter, setNameFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [modal, setModal] = useState(null); // { mode:'add'|'edit', form, id? }
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getPayouts({ gymId: gymFilter, dateFrom, dateTo, category: categoryFilter || undefined, name: nameFilter || undefined });
      setRecords(res.data.records || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [gymFilter, dateFrom, dateTo, categoryFilter, nameFilter]);

  const defaultGymId = () => (isSuperAdmin ? (viewGym || 'gym-hsinchu') : staff?.gymId);

  const openAdd = () => setModal({ mode: 'add', form: emptyForm(defaultGymId()) });
  const openEdit = (r) => setModal({ mode: 'edit', id: r.id, form: { date: r.date, payeeName: r.payeeName, amount: r.amount, category: r.category, gymId: r.gymId, note: r.note || '' } });
  const closeModal = () => setModal(null);

  const setField = (k, v) => setModal(m => ({ ...m, form: { ...m.form, [k]: v } }));

  const save = async () => {
    const f = modal.form;
    if (!f.date || !f.payeeName.trim() || !(Number(f.amount) > 0) || !f.category.trim()) {
      alert('請完整填寫日期／姓名／金額／付款項目');
      return;
    }
    setSaving(true);
    try {
      if (modal.mode === 'add') {
        await createPayout(f);
      } else {
        await updatePayout(modal.id, f);
      }
      closeModal();
      load();
    } catch (e) {
      alert(e.response?.data?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`確定刪除這筆紀錄？\n${r.date}・${r.payeeName}・${r.category}・${NT(r.amount)}`)) return;
    try {
      await deletePayout(r.id);
      load();
    } catch (e) {
      alert(e.response?.data?.message || '刪除失敗');
    }
  };

  const handleExport = async () => {
    try {
      const res = await exportPayouts({ gymId: gymFilter, dateFrom, dateTo, category: categoryFilter || undefined, name: nameFilter || undefined });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payouts_${dateFrom}_${dateTo}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      alert('匯出失敗');
    }
  };

  const showGymCol = isSuperAdmin && !gymFilter;

  return (
    <div>
      {/* 篩選列 */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:16 }}>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ height:32, padding:'0 10px', borderRadius:6, border:'0.5px solid #E8D5D5', fontSize:13 }} />
        <span style={{ color:'#999', fontSize:13 }}>至</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ height:32, padding:'0 10px', borderRadius:6, border:'0.5px solid #E8D5D5', fontSize:13 }} />
        <input type="text" placeholder="搜尋姓名" value={nameFilter} onChange={e => setNameFilter(e.target.value)}
          style={{ height:32, padding:'0 10px', borderRadius:6, border:'0.5px solid #E8D5D5', fontSize:13, width:120 }} />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          style={{ height:32, padding:'0 8px', borderRadius:6, border:'0.5px solid #E8D5D5', fontSize:13 }}>
          <option value="">全部項目</option>
          {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ flex:1 }} />
        <button onClick={openAdd}
          style={{ height:32, padding:'0 14px', borderRadius:6, border:'none', background:'#8B1A1A', color:'#fff', fontSize:13, cursor:'pointer', fontWeight:600 }}>
          ＋ 新增
        </button>
        <button onClick={handleExport}
          style={{ height:32, padding:'0 12px', borderRadius:6, border:'0.5px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>
          ↓ 匯出 Excel
        </button>
      </div>

      <div style={{ background:'#fff', borderRadius:12, border:'0.5px solid #E8D5D5', overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:32, textAlign:'center', color:'#999', fontSize:13 }}>載入中...</div>
        ) : records.length === 0 ? (
          <div style={{ padding:32, textAlign:'center', color:'#999', fontSize:13 }}>此區間無紀錄</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:560 }}>
            <thead>
              <tr style={{ background:'#FBF5F5' }}>
                {['日期', ...(showGymCol ? ['館別'] : []), '姓名', '付款項目', '金額', '備註', ''].map((h, i) => (
                  <th key={i} style={{ padding:'8px 12px', textAlign: i===0?'left':(h==='金額'?'right':'left'), fontSize:10, color:'#999', fontWeight:500, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} style={{ borderTop:'0.5px solid #F5EFEF' }}>
                  <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:12, whiteSpace:'nowrap' }}>{r.date}</td>
                  {showGymCol && <td style={{ padding:'10px 12px', fontSize:12, color:'#666', whiteSpace:'nowrap' }}>{GYM_LABEL[r.gymId] || r.gymId}</td>}
                  <td style={{ padding:'10px 12px', fontSize:13, fontWeight:500, whiteSpace:'nowrap' }}>{r.payeeName}</td>
                  <td style={{ padding:'10px 12px', fontSize:12, color:'#666', whiteSpace:'nowrap' }}>{r.category}</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#8B1A1A', whiteSpace:'nowrap' }}>{NT(r.amount)}</td>
                  <td style={{ padding:'10px 12px', fontSize:12, color:'#999' }}>{r.note || '—'}</td>
                  <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>
                    <button onClick={() => openEdit(r)} style={{ border:'none', background:'none', color:'#185FA5', fontSize:12, cursor:'pointer', marginRight:8 }}>編輯</button>
                    <button onClick={() => remove(r)} style={{ border:'none', background:'none', color:'#B3261E', fontSize:12, cursor:'pointer' }}>刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop:'2px solid #E8D5D5', background:'#FBF5F5' }}>
                <td style={{ padding:'10px 12px', fontWeight:600, whiteSpace:'nowrap' }} colSpan={showGymCol ? 3 : 2}>合計（{records.length} 筆）</td>
                <td colSpan={0}></td>
                <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:14, color:'#8B1A1A', whiteSpace:'nowrap' }}>{NT(total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal.mode === 'add' ? '新增報酬記錄' : '編輯報酬記錄'} onClose={closeModal} width={420}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>日期</label>
              <input type="date" value={modal.form.date} onChange={e => setField('date', e.target.value)}
                style={{ width:'100%', height:36, padding:'0 10px', borderRadius:6, border:'0.5px solid #E8D5D5', fontSize:14, boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>姓名</label>
              <input type="text" value={modal.form.payeeName} onChange={e => setField('payeeName', e.target.value)}
                style={{ width:'100%', height:36, padding:'0 10px', borderRadius:6, border:'0.5px solid #E8D5D5', fontSize:14, boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>付款項目</label>
              <input type="text" list="payout-category-list" value={modal.form.category} onChange={e => setField('category', e.target.value)}
                placeholder="教練費 / 定線費 / 拆點費 / 其他"
                style={{ width:'100%', height:36, padding:'0 10px', borderRadius:6, border:'0.5px solid #E8D5D5', fontSize:14, boxSizing:'border-box' }} />
              <datalist id="payout-category-list">
                {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>金額</label>
              <input type="number" value={modal.form.amount} onChange={e => setField('amount', e.target.value)}
                style={{ width:'100%', height:36, padding:'0 10px', borderRadius:6, border:'0.5px solid #E8D5D5', fontSize:14, boxSizing:'border-box' }} />
            </div>
            {isSuperAdmin && (
              <div>
                <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>館別</label>
                <select value={modal.form.gymId} onChange={e => setField('gymId', e.target.value)}
                  style={{ width:'100%', height:36, padding:'0 10px', borderRadius:6, border:'0.5px solid #E8D5D5', fontSize:14, boxSizing:'border-box' }}>
                  {Object.entries(GYM_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>備註（選填）</label>
              <input type="text" value={modal.form.note} onChange={e => setField('note', e.target.value)}
                style={{ width:'100%', height:36, padding:'0 10px', borderRadius:6, border:'0.5px solid #E8D5D5', fontSize:14, boxSizing:'border-box' }} />
            </div>
            <button onClick={save} disabled={saving}
              style={{ height:40, marginTop:6, border:'none', borderRadius:8, background: saving ? '#ccc' : '#8B1A1A', color:'#fff', fontSize:14, fontWeight:600, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
