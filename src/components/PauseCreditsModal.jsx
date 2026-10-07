import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import Modal from './Modal';
import { getPauseCredits, arrangePauseResume } from '../api/courseAdjustments';
import { getCourses } from '../api/courses';

const STATUS = {
  paused: { t: '暫停中（原課程未結束）', c: '#854F0B' },
  awaiting_resume: { t: '待安排回課', c: '#185FA5' },
  resumed: { t: '已排完', c: '#2D7D46' },
};
const inp = { width:'100%', height:36, borderRadius:8, border:'0.5px solid #E8D5D5', padding:'0 10px', fontSize:13, background:'#FBF5F5', boxSizing:'border-box', color:'#1a1a1a' };

// 員工端：暫停餘額清單＋安排回課（指定回課梯次＋開始日 → 預覽 → 以補課方式依序排入剩餘堂數）
export default function PauseCreditsModal({ onClose }) {
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [target, setTarget] = useState(null);       // 正在安排的暫停餘額
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({ targetCourseId: '', startDate: dayjs().format('YYYY-MM-DD') });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try { const r = await getPauseCredits(); setCredits(r.data.credits || []); }
    catch (e) { setErr(e.response?.data?.message || '載入失敗'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openArrange = async (c) => {
    setTarget(c); setPreview(null); setDone(''); setErr('');
    setForm({ targetCourseId: '', startDate: dayjs().format('YYYY-MM-DD') });
    try {
      const r = await getCourses(c.gymId || undefined);
      const list = (r.data.courses || []).filter(x =>
        x.id !== c.courseId && x.type !== 'workshop' && x.status !== 'cancelled' && x.isActive !== false
        && x.categoryId === c.categoryId && x.statusLabel !== 'ended');
      setCourses(list);
    } catch (e) { setCourses([]); }
  };

  const run = async (apply) => {
    if (!form.targetCourseId) { setErr('請選擇回課的課程梯次'); return; }
    setBusy(true); setErr('');
    try {
      const r = await arrangePauseResume(target.id, { targetCourseId: form.targetCourseId, startDate: form.startDate, apply });
      if (apply) { setDone(`已排入 ${r.data.dates.length} 堂：${r.data.dates.join('、')}`); setPreview(null); await load(); }
      else setPreview(r.data);
    } catch (e) { setErr(e.response?.data?.message || '操作失敗'); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="⏸ 暫停回課" onClose={onClose} width={640}>
      <div style={{ fontSize:12, color:'#888', marginBottom:12, lineHeight:1.6 }}>
        暫停核准後會記下「剩餘堂數」。原課程結束後（自動轉為「待安排回課」），指定回課的梯次與開始日期，系統從該日起依序以<strong>補課方式</strong>排入剩餘堂數；
        回課期間（開始日～最後一堂）學員享有<strong>課程學員免費入場</strong>。補課堂數用完後若要續上，請走一般「插班報名」（舊生折扣，從最後一堂補課之後起算）。
      </div>
      {err && <div style={{ background:'#FCEBEB', color:'#A32D2D', borderRadius:8, padding:'8px 12px', fontSize:12, marginBottom:10 }}>{err}</div>}
      {done && <div style={{ background:'#E6F4EB', color:'#2D7D46', borderRadius:8, padding:'8px 12px', fontSize:12, marginBottom:10 }}>✓ {done}</div>}

      {!target && (loading ? <div style={{ color:'#999', textAlign:'center', padding:20 }}>載入中…</div> : credits.length === 0 ? (
        <div style={{ color:'#999', textAlign:'center', padding:20 }}>目前沒有暫停餘額</div>
      ) : credits.map(c => {
        const st = STATUS[c.status] || { t: c.status, c: '#666' };
        return (
          <div key={c.id} style={{ border:'0.5px solid #E8D5D5', borderRadius:10, padding:12, marginBottom:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'flex-start' }}>
              <div>
                <div style={{ fontWeight:600, fontSize:14 }}>{c.memberName}</div>
                <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{c.courseName}</div>
                <div style={{ fontSize:12, color:'#666', marginTop:2 }}>剩餘 <strong style={{ color:'#8B1A1A' }}>{c.remainingSessions}</strong> / {c.totalSessions} 堂
                  <span style={{ marginLeft:8, color: st.c, fontWeight:600 }}>{st.t}</span></div>
                {c.arrangedDates?.length > 0 && <div style={{ fontSize:11, color:'#2D7D46', marginTop:3 }}>已排：{c.arrangedCourseName}（{c.resumeStartDate}～{c.resumeEndDate}，共 {c.arrangedDates.length} 堂）</div>}
              </div>
              {c.remainingSessions > 0 && c.status === 'awaiting_resume' && (
                <button onClick={() => openArrange(c)} style={{ height:32, padding:'0 12px', borderRadius:8, background:'#8B1A1A', color:'#fff', border:'none', fontSize:12, cursor:'pointer', flexShrink:0 }}>安排回課</button>
              )}
            </div>
            {c.status === 'paused' && <div style={{ fontSize:11, color:'#999', marginTop:6 }}>原課程尚未結束；同一期中途回來請用「恢復」，下一期回課待原課程結束後在這裡安排。</div>}
          </div>
        );
      }))}

      {target && (
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>{target.memberName}｜{target.courseName}｜剩餘 {target.remainingSessions} 堂</div>
          <label style={{ fontSize:11, color:'#6b6b6b', display:'block', marginBottom:4 }}>回課的課程梯次（同班別、同館）</label>
          <select style={inp} value={form.targetCourseId} onChange={e => { setForm(f => ({ ...f, targetCourseId: e.target.value })); setPreview(null); }}>
            <option value="">請選擇…</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}（{c.startDate}～{c.endDate}）</option>)}
          </select>
          <label style={{ fontSize:11, color:'#6b6b6b', display:'block', margin:'10px 0 4px' }}>回課開始日期</label>
          <input type="date" style={inp} value={form.startDate} min={dayjs().format('YYYY-MM-DD')} onChange={e => { setForm(f => ({ ...f, startDate: e.target.value })); setPreview(null); }} />
          {preview && (
            <div style={{ marginTop:12, background:'#FBF5F5', borderRadius:10, padding:12, fontSize:13, lineHeight:1.7 }}>
              <div style={{ fontWeight:600 }}>預計排入 {preview.dates.length} 堂（{preview.target.name}）</div>
              <div style={{ color:'#444' }}>{preview.dates.join('、') || '—'}</div>
              {preview.accessEnd && <div style={{ fontSize:12, color:'#2D7D46' }}>課程學員免費入場：{preview.startDate} ～ {preview.accessEnd}</div>}
              {preview.skipped.length > 0 && <div style={{ fontSize:12, color:'#854F0B' }}>略過：{preview.skipped.map(s => `${s.date}（${s.reason}）`).join('、')}</div>}
              {preview.shortage > 0 && <div style={{ fontSize:12, color:'#A32D2D' }}>⚠ 場次不足，還有 {preview.shortage} 堂排不進去（會保留為剩餘堂數）</div>}
            </div>
          )}
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={() => { setTarget(null); setPreview(null); setErr(''); }} style={{ flex:1, height:40, borderRadius:9, border:'1px solid #E8D5D5', background:'none', fontSize:13, color:'#6b6b6b', cursor:'pointer' }}>返回</button>
            <button onClick={() => run(false)} disabled={busy} style={{ flex:1, height:40, borderRadius:9, border:'1px solid #185FA5', background:'#fff', color:'#185FA5', fontSize:13, cursor:'pointer' }}>預覽</button>
            <button onClick={() => run(true)} disabled={busy || !preview || preview.dates.length === 0} style={{ flex:2, height:40, borderRadius:9, background: (!preview || !preview.dates.length) ? '#ccc' : '#8B1A1A', color:'#fff', border:'none', fontSize:13, fontWeight:500, cursor:'pointer' }}>{busy ? '處理中…' : '確認排入'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
