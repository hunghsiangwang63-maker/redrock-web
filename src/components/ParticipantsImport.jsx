import { useState, useRef } from 'react';
import { tt } from '../utils/memberI18n';

// 體驗課程「參加人員」Excel 匯入（2026-10-16）：下載範本＋上傳解析。
// 解析在後端（POST /experience-bookings/participants-parse，免登入、不存檔）；本元件只負責顯示結果，
// 真正送出預約仍由各頁原本的流程（客人確認名單後才送出）。
// props: http＝該頁使用的 axios client（publicClient/memberClient/staff client）；plain＝員工端固定中文；
//        onImport(list)＝解析成功後回傳參加人員陣列，由各頁決定如何併入（見 mergeImported）。
export const MAX_PARTICIPANTS = 20;

const isBlank = (p) => !p.name?.trim() && !p.birthday && !p.idNumber?.trim();

// 名單目前全是空白列 → 直接取代；否則附加在後面（超過上限的截掉並回報）
export function mergeImported(existing, imported, max = MAX_PARTICIPANTS) {
  const base = existing.every(isBlank) ? [] : existing;
  const merged = [...base, ...imported];
  return { list: merged.slice(0, max), cut: Math.max(0, merged.length - max) };
}

export default function ParticipantsImport({ http, onImport, plain = false, accent = '#8B1A1A' }) {
  const T = plain ? (zh) => zh : tt;
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null); // { ok, text, issues }
  const fileRef = useRef(null);

  const errText = (e) => {
    const c = e.response?.data?.code;
    if (c === 'TOO_MANY') return T(`最多 ${MAX_PARTICIPANTS} 人，請分批報名`, `Up to ${MAX_PARTICIPANTS} people. Please split into batches.`, `最大${MAX_PARTICIPANTS}名までです。分けてお申し込みください`);
    if (c === 'EMPTY_FILE') return T('檔案內沒有參加人員資料', 'No participant rows found in the file', 'ファイルに参加者データがありません');
    if (c === 'BAD_FORMAT') return T('找不到「姓名」欄位，請使用範本格式填寫', 'Could not find the "Name" column. Please use the template.', '「氏名」列が見つかりません。テンプレートをご利用ください');
    if (c === 'BAD_TYPE') return T('僅支援 .xlsx／.xls／.csv 檔案', 'Only .xlsx / .xls / .csv files are supported', '.xlsx／.xls／.csv のみ対応しています');
    if (c === 'NO_FILE') return T('請選擇 Excel 檔案', 'Please choose an Excel file', 'Excelファイルを選択してください');
    return e.response?.data?.message || T('上傳失敗，請稍後再試', 'Upload failed. Please try again.', 'アップロードに失敗しました。しばらくしてからお試しください');
  };

  const downloadTemplate = async () => {
    setBusy(true); setInfo(null);
    try {
      const res = await http.get('/experience-bookings/participants-template', { responseType: 'blob', timeout: 30000 });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = '體驗課程參加人員範本.xlsx'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      setInfo({ ok: false, text: T('範本下載失敗，請稍後再試', 'Template download failed. Please try again.', 'テンプレートのダウンロードに失敗しました') });
    } finally { setBusy(false); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setInfo(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await http.post('/experience-bookings/participants-parse', fd, { timeout: 30000 });
      const { participants = [], issues = [] } = res.data;
      const cut = onImport(participants) || 0;
      const parts = [T(`已匯入 ${participants.length} 人，請逐一確認資料`, `Imported ${participants.length} people. Please review each entry.`, `${participants.length}名を取り込みました。内容をご確認ください`)];
      if (cut > 0) parts.push(T(`超過 ${MAX_PARTICIPANTS} 人上限，已略過 ${cut} 人`, `${cut} over the ${MAX_PARTICIPANTS}-person limit were skipped`, `上限${MAX_PARTICIPANTS}名を超えた${cut}名は取り込まれていません`));
      setInfo({ ok: issues.length === 0 && cut === 0, text: parts.join('；'), issues });
    } catch (err) {
      setInfo({ ok: false, text: errText(err) });
    } finally { setBusy(false); }
  };

  const btn = { height: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${accent}`, background: '#fff', color: accent, fontSize: 13, cursor: busy ? 'wait' : 'pointer' };
  return (
    <div style={{ background: '#FBF5F5', border: '0.5px dashed #D9B8B8', borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8, lineHeight: 1.6 }}>
        {T(`人數較多？可下載 Excel 範本填好後上傳（最多 ${MAX_PARTICIPANTS} 人）。`, `Large group? Download the Excel template, fill it in and upload it (up to ${MAX_PARTICIPANTS} people).`, `人数が多い場合は、Excelテンプレートに入力してアップロードできます（最大${MAX_PARTICIPANTS}名）。`)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={downloadTemplate} style={btn}>{T('下載 Excel 範本', 'Download Template', 'テンプレートをダウンロード')}</button>
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} style={{ ...btn, background: accent, color: '#fff' }}>{busy ? T('處理中…', 'Working…', '処理中…') : T('上傳 Excel 匯入', 'Upload Excel', 'Excelをアップロード')}</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
      </div>
      {info && (
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7, color: info.ok ? '#27500A' : '#A32D2D' }}>
          <div>{info.ok ? '✓ ' : '⚠️ '}{info.text}</div>
          {info.issues?.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: '#A32D2D' }}>
              {info.issues.slice(0, 10).map((x, i) => <li key={i}>{T(`第 ${x.row} 列`, `Row ${x.row}`, `${x.row}行目`)}{x.name ? `（${x.name}）` : ''}：{x.message}</li>)}
              {info.issues.length > 10 && <li>{T(`…另有 ${info.issues.length - 10} 項`, `…and ${info.issues.length - 10} more`, `ほか${info.issues.length - 10}件`)}</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
