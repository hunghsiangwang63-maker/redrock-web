import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import client from '../../api/client';

const RED = '#8B1A1A';

// 員工入館 QR：正職/管理員免費；兼職依上月工時分級（≥40免費、≥20半價、<20一般）
export default function StaffEntryQrPage() {
  const [elig, setElig] = useState(null);
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [expiry, setExpiry] = useState(null);

  const gen = async () => {
    setLoading(true); setErr('');
    try {
      const res = await client.post('/staff-entry/qr', {});
      setElig(res.data);
      const dataUrl = await QRCode.toDataURL(res.data.token, { width: 240, margin: 2 });
      setQr(dataUrl);
      setExpiry(Date.now() + 30 * 60000);
    } catch (e) {
      setErr(e.response?.data?.message || '產生失敗，請重新登入或稍後再試');
    } finally { setLoading(false); }
  };
  useEffect(() => { gen(); }, []);

  const tierColor = elig?.free ? '#2D7D46' : elig?.tier === 'half' ? '#B5651D' : '#A32D2D';
  const tierLabel = elig?.free ? '免費入館' : elig?.tier === 'half' ? `半價 NT$${elig.fee}` : `一般價 NT$${elig?.fee}`;

  return (
    <div style={{ maxWidth: 460, margin: '0 auto', padding: '10px 16px 40px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>🎫 員工入館</div>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>出示此 QR 給櫃檯掃描入館</div>

      {err && <div style={{ color: '#A32D2D', fontSize: 14, textAlign: 'center', padding: 20 }}>{err}</div>}

      {!err && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #EEE2E2', padding: 22, textAlign: 'center', boxShadow: '0 1px 3px rgba(80,20,20,.06)' }}>
          {loading ? (
            <div style={{ padding: 60, color: '#999' }}>產生中…</div>
          ) : (
            <>
              <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, background: tierColor + '18', color: tierColor, fontWeight: 700, fontSize: 15, marginBottom: 14 }}>{tierLabel}</div>
              {qr && <img src={qr} alt="員工入館 QR" style={{ width: 220, height: 220, display: 'block', margin: '0 auto' }} />}
              <div style={{ fontSize: 12, color: '#666', marginTop: 12, lineHeight: 1.7 }}>{elig?.reason}</div>
              {elig?.hours != null && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>（上月工時 {elig.hours} 小時）</div>}
              {!elig?.free && <div style={{ fontSize: 12, color: '#B5651D', marginTop: 8 }}>入館時請於櫃檯付現 NT${elig?.fee}</div>}
              <button onClick={gen} style={{ marginTop: 18, height: 40, padding: '0 20px', borderRadius: 10, background: '#fff', color: RED, border: `1px solid ${RED}`, fontSize: 13, cursor: 'pointer' }}>重新產生</button>
              <div style={{ fontSize: 11, color: '#bbb', marginTop: 10 }}>QR 有效 30 分鐘</div>
            </>
          )}
        </div>
      )}

      <div style={{ fontSize: 11, color: '#999', marginTop: 18, lineHeight: 1.8, background: '#FBF7F7', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontWeight: 600, color: '#666', marginBottom: 4 }}>入館優惠規則</div>
        · 正職員工：免費入館<br />
        · 兼職人員：依<b>上一個月</b>排班表排定的<b>值班時數</b>（不含課程/體驗授課），<b>次月</b>適用——<br />
        　工時 ≥ 40 小時 → 免費｜≥ 20 小時 → 半價｜未滿 20 小時 → 一般價
      </div>
    </div>
  );
}
