// 共用表單欄位：新增/編輯首頁提醒（MembersPage 單一會員）與比賽/課程推播（CompetitionsPage/CoursesPage）三處共用，
// 確保欄位、驗證上限、字數/圖片建議文字三邊一致，改一處不用記得同步另外兩處。
const HINT = { fontSize: 10, color: '#aaa', marginTop: 4, lineHeight: 1.5 };
const LABEL = { fontSize: 11, color: '#6b6b6b', display: 'block', marginBottom: 5 };
const INPUT = { width: '100%', height: 38, borderRadius: 8, border: '0.5px solid #E8D5D5', padding: '0 10px', fontSize: 13, boxSizing: 'border-box' };

export default function ReminderFormFields({
  form, setForm, imageFile, setImageFile,
  titlePlaceholder = '', subtitlePlaceholder = '', showUntilHint = '',
}) {
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <label style={LABEL}>標題 *</label>
        <input value={form.title} onChange={set('title')} placeholder={titlePlaceholder} style={INPUT} />
        <div style={HINT}>建議 18 字以內，避免在手機上換行（系統上限 100 字）</div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={LABEL}>副標（選填）</label>
        <input value={form.subtitle} onChange={set('subtitle')} placeholder={subtitlePlaceholder} style={INPUT} />
        <div style={HINT}>建議 30 字以內一行講完（系統上限 200 字）</div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={LABEL}>圖示</label>
          <input value={form.icon} onChange={set('icon')} placeholder="🏆" maxLength={4}
            style={{ ...INPUT, fontSize: 16, textAlign: 'center' }} />
          <div style={HINT}>單一 emoji（有設圖片時圖示不顯示）</div>
        </div>
        <div style={{ flex: 2 }}>
          <label style={LABEL}>點擊後前往（選填）</label>
          <input value={form.link} onChange={set('link')} placeholder="/member/competitions" style={INPUT} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={LABEL}>圖片（選填，會取代圖示顯示在卡片上）</label>
        {form.imageUrl && !imageFile && (
          <img src={form.imageUrl} alt="" style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', marginBottom: 6, display: 'block' }} />
        )}
        <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} style={{ fontSize: 12, width: '100%' }} />
        {imageFile && <div style={{ fontSize: 11, color: '#2D7D46', marginTop: 4 }}>✓ {imageFile.name}（儲存後上傳）</div>}
        {(form.imageUrl || imageFile) && (
          <button type="button"
            onClick={() => { setImageFile(null); setForm(f => ({ ...f, imageUrl: '' })); }}
            style={{ marginTop: 6, fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '0.5px solid #A32D2D', background: '#fff', color: '#A32D2D', cursor: 'pointer' }}>
            移除圖片
          </button>
        )}
        <div style={HINT}>建議正方形縮圖，尺寸約 200×200px、檔案 500KB 以內（系統上限 5MB，過大會拖慢卡片載入）</div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={LABEL}>開始顯示（選填）</label>
          <input type="date" value={form.showFrom} onChange={set('showFrom')} style={{ ...INPUT, padding: '0 8px' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={LABEL}>結束顯示（選填{showUntilHint}）</label>
          <input type="date" value={form.showUntil} onChange={set('showUntil')} style={{ ...INPUT, padding: '0 8px' }} />
        </div>
      </div>
    </>
  );
}
