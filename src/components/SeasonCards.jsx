// 季節感謝卡片（會員互送／送給教練與櫃檯）：句子與貼紙都是預設選項，不能自由打字。
// 句子、貼紙、顏色都來自「目前這一季」的設定（seasons/*.jsx 的 cards／colors）；後端 routes/thanksCards.js 依季節驗證與計算。
import { useEffect, useState } from 'react';
import { tt } from '../utils/memberI18n';
import { useMember } from '../store/memberStore.jsx';
import { getThanksConfig, lookupThanksRecipient, getThanksStaff, sendThanksCard, getThanksInbox, hideThanksCard } from '../api/thanksCards';
import { getActiveSeason, getInboxSeason } from '../seasons';
import { SeasonImg } from '../seasons/SeasonDeco';

// 貼紙：有圖檔（<素材資料夾>/stickers/<id>.webp）就用圖檔，沒有就用該季提供的備用繪製
export function Sticker({ season, id, size = 56 }) {
  const [img, setImg] = useState(true);
  if (img) {
    return <img src={`${season.base}/stickers/${id}.webp`} alt="" aria-hidden="true" draggable="false" onError={() => setImg(false)}
      style={{ width:size, height:size, objectFit:'contain', display:'block' }} />;
  }
  const box = { width:size, height:size, display:'flex', alignItems:'center', justifyContent:'center' };
  return <div style={box} aria-hidden="true">{season.cards.stickerFallback ? season.cards.stickerFallback(id, size) : null}</div>;
}

// 一張卡片（預覽／收件匣共用）
export function CardFace({ season, stickerId, phraseId, from, to, compact = false }) {
  const f = season.cards.face; const c = season.colors;
  return (
    <div style={{ position:'relative', borderRadius:14, padding: compact ? '12px 14px' : '16px', background:f.bg,
      border:f.border, boxShadow:f.shadow, display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ flexShrink:0 }}><Sticker season={season} id={stickerId} size={compact ? 52 : 62} /></div>
      <div style={{ minWidth:0, flex:1 }}>
        {to && <div style={{ fontSize:11, color:f.toColor }}>{tt('寄給', 'To', '宛先')} {to}</div>}
        <div style={{ fontSize: compact ? 14 : 15, fontWeight:800, color:c.red, lineHeight:1.5 }}>{season.cards.phrases[phraseId]?.() || ''}</div>
        {from && <div style={{ fontSize:11, color:c.ink, marginTop:3 }}>— {from}</div>}
      </div>
    </div>
  );
}

// ───────────── 首頁：收到的感謝卡片 ─────────────
export function SeasonCardInbox() {
  const { member } = useMember();
  const season = getInboxSeason() || getActiveSeason();
  const [cards, setCards] = useState([]);
  const [menuFor, setMenuFor] = useState(null);
  const [canSend, setCanSend] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  useEffect(() => {
    let alive = true;
    getThanksInbox().then(d => { if (alive) setCards(d.cards || []); }).catch(() => {});
    getThanksConfig().then(c => { if (alive) setCanSend(!!c.sendOpen); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!season || !cards.length) return null;
  const hide = async (c, block) => {
    try { await hideThanksCard(c.id, block); setCards(list => list.filter(x => x.id !== c.id)); } catch (e) { /* 失敗就保留 */ }
    setMenuFor(null);
  };
  return (
    <div style={{ margin:'18px 16px 0' }}>
      <div style={{ fontSize:12, fontWeight:700, color:season.colors.inboxTitle || season.colors.brown, marginBottom:8 }}>💌 {tt('收到的感謝卡片', 'Thank-you cards for you', '届いた感謝カード')}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {cards.map(c => (
          <div key={c.id} style={{ position:'relative' }}>
            <CardFace season={season} stickerId={c.stickerId} phraseId={c.phraseId} from={c.fromDisplay} compact />
            {canSend && (
              <button onClick={() => setReplyTo({ id: c.id, fromDisplay: c.fromDisplay })}
                style={{ position:'absolute', right:10, bottom:8, height:28, padding:'0 12px', borderRadius:14, border:'none', background:season.cta.replyBg, color:'#fff', fontSize:12, fontWeight:800, cursor:'pointer' }}>
                💌 {tt('回送卡片', 'Send one back', 'お返しする')}
              </button>
            )}
            <button onClick={() => setMenuFor(menuFor === c.id ? null : c.id)} aria-label="more"
              style={{ position:'absolute', top:4, right:6, border:'none', background:'transparent', color:'#B08850', fontSize:18, cursor:'pointer', padding:'0 6px' }}>⋯</button>
            {menuFor === c.id && (
              <div style={{ position:'absolute', top:28, right:6, zIndex:5, background:'#fff', borderRadius:10, boxShadow:'0 4px 14px rgba(0,0,0,.2)', overflow:'hidden', minWidth:170 }}>
                <div onClick={() => hide(c, false)} style={{ padding:'10px 14px', fontSize:13, cursor:'pointer' }}>{tt('隱藏這張卡片', 'Hide this card', 'このカードを非表示')}</div>
                <div onClick={() => hide(c, true)} style={{ padding:'10px 14px', fontSize:13, color:'#A32D2D', cursor:'pointer', borderTop:'0.5px solid #eee' }}>{tt('隱藏並不再收到此人的卡片', 'Hide & stop cards from this person', '非表示にして今後このユーザーのカードを受け取らない')}</div>
              </div>
            )}
          </div>
        ))}
      </div>
      {replyTo && <SendSheet season={season} member={member} replyTo={replyTo} onClose={() => setReplyTo(null)} />}
    </div>
  );
}

// ───────────── 首頁：送感謝卡片（按鈕＋底部彈窗）─────────────
export function SendSeasonCard() {
  const { member } = useMember();
  const season = getActiveSeason();
  const [cfg, setCfg] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { getThanksConfig().then(setCfg).catch(() => {}); }, []);
  if (!season || !cfg || !cfg.sendOpen) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} style={season.cta.style}>
        💌 {tt('送一張感謝卡片', 'Send a thank-you card', '感謝カードを送る')}
      </button>
      {open && <SendSheet season={season} member={member} onClose={() => setOpen(false)} />}
    </>
  );
}

// replyTo：{ id, fromDisplay }＝回送卡片（收件人固定為寄件人，直接從第 2 步開始）
function SendSheet({ season, member, onClose, replyTo = null }) {
  const [step, setStep] = useState(replyTo ? 2 : 1);
  const [tab, setTab] = useState('phone');
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState(null);   // { toMemberId, maskedName }
  const [staff, setStaff] = useState([]);
  const [staffPick, setStaffPick] = useState(null);
  const [sticker, setSticker] = useState(season.cards.stickers[0]);
  const [phrase, setPhrase] = useState(season.cards.groups[0].ids[0]);
  const [displayAs, setDisplayAs] = useState(member?.nickname ? 'nickname' : 'name');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => { getThanksStaff().then(setStaff).catch(() => {}); }, []);
  const gymName = (g) => g === 'gym-shilin' ? tt('士林館', 'Shilin', '士林店') : g === 'gym-hsinchu' ? tt('新竹館', 'Hsinchu', '新竹店') : '';
  const errMsg = (e, fallback) => e?.response?.data?.message || fallback;

  const lookup = async () => {
    setErr(''); setFound(null); setBusy(true);
    try { setFound(await lookupThanksRecipient(phone)); } catch (e) { setErr(errMsg(e, tt('查詢失敗，請稍後再試', 'Lookup failed, please try again', '検索に失敗しました'))); }
    finally { setBusy(false); }
  };
  const recipientReady = tab === 'phone' ? !!found : !!staffPick;
  const toName = replyTo ? replyTo.fromDisplay : (tab === 'phone' ? found?.maskedName : staffPick?.name);
  const send = async () => {
    setErr(''); setBusy(true);
    try {
      const payload = replyTo ? { replyToCardId: replyTo.id } : (tab === 'phone' ? { toType:'member', toMemberId: found.toMemberId } : { toType:'staff', toStaffId: staffPick.id });
      const r = await sendThanksCard({ ...payload, stickerId: sticker, phraseId: phrase, displayAs });
      setDone(r);
    } catch (e) { setErr(errMsg(e, tt('送出失敗，請稍後再試', 'Could not send, please try again', '送信に失敗しました'))); }
    finally { setBusy(false); }
  };
  const again = () => { setDone(null); setStep(replyTo ? 2 : 1); setFound(null); setStaffPick(null); setPhone(''); setErr(''); };

  const chip = (active) => ({ padding:'7px 12px', borderRadius:18, fontSize:13, cursor:'pointer', border: active ? '1.5px solid #C45E1A' : '1px solid #E8D5D5', background: active ? '#FFEFD8' : '#fff', color: active ? '#8B3A0E' : '#666', fontWeight: active ? 700 : 500 });
  const btn = (disabled) => ({ width:'100%', height:44, borderRadius:12, border:'none', background: disabled ? '#CFC6C0' : 'linear-gradient(90deg,#E9812A,#C45E1A)', color:'#fff', fontSize:15, fontWeight:800, cursor: disabled ? 'default' : 'pointer' });

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:300, display:'flex', alignItems:'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#FFF8EC', borderRadius:'18px 18px 0 0', width:'100%', maxHeight:'88vh', overflowY:'auto', padding:'18px 18px 28px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:16, fontWeight:800, color:season.colors.red }}>💌 {replyTo ? tt(`回送卡片給 ${replyTo.fromDisplay}`, `Reply to ${replyTo.fromDisplay}`, `${replyTo.fromDisplay} さんに返信`) : tt('送一張感謝卡片', 'Send a thank-you card', '感謝カードを送る')}</div>
          <span onClick={onClose} style={{ fontSize:22, color:'#999', cursor:'pointer' }}>×</span>
        </div>

        {done ? (
          <div style={{ textAlign:'center', padding:'10px 0' }}>
            <CardFace season={season} stickerId={sticker} phraseId={phrase} to={toName} />
            <div style={{ display:'flex', justifyContent:'center', marginTop:10 }}><SeasonImg season={season} name={season.assets.sent} size={96} /></div>
            <div style={{ marginTop:6, fontSize:15, fontWeight:800, color:'#2D7D46' }}>✓ {tt('已送出！', 'Sent!', '送信しました！')}</div>
            <div style={{ fontSize:12, color:'#888', marginTop:4 }}>{tt(`對同一個人還可以再送 ${done.remaining} 張`, `You can send ${done.remaining} more to the same person`, `同じ相手にあと${done.remaining}枚送れます`)}</div>
            <button onClick={again} style={{ ...btn(false), marginTop:14 }}>{tt('再送一張', 'Send another', 'もう1枚送る')}</button>
            <button onClick={onClose} style={{ marginTop:8, width:'100%', height:40, borderRadius:12, border:'1px solid #E0C08A', background:'#fff', color:'#8B3A0E', fontSize:14, cursor:'pointer' }}>{tt('完成', 'Done', '完了')}</button>
          </div>
        ) : step === 1 ? (
          <>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>{tt('① 要送給誰？', '① Who is it for?', '① 誰に送りますか？')}</div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <span style={chip(tab === 'phone')} onClick={() => setTab('phone')}>{tt('輸入對方手機', 'By phone number', '電話番号で')}</span>
              <span style={chip(tab === 'staff')} onClick={() => setTab('staff')}>{tt('教練與櫃檯', 'Coaches & front desk', 'コーチ・スタッフ')}</span>
            </div>
            {tab === 'phone' ? (
              <>
                <div style={{ display:'flex', gap:8 }}>
                  <input value={phone} onChange={e => { setPhone(e.target.value); setFound(null); }} inputMode="tel" placeholder="09XXXXXXXX"
                    style={{ flex:1, height:42, borderRadius:10, border:'1px solid #E8D5D5', padding:'0 12px', fontSize:15, outline:'none', boxSizing:'border-box' }} />
                  <button onClick={lookup} disabled={busy || phone.replace(/\D/g, '').length < 8}
                    style={{ height:42, padding:'0 16px', borderRadius:10, border:'none', background:'#8B1A1A', color:'#fff', fontSize:14, cursor:'pointer', opacity: (busy || phone.replace(/\D/g, '').length < 8) ? .5 : 1 }}>{tt('查詢', 'Find', '検索')}</button>
                </div>
                {found && <div style={{ marginTop:10, padding:'10px 12px', background:'#E6F4EB', borderRadius:10, fontSize:14, color:'#1F5F34', fontWeight:700 }}>✓ {tt('要送給', 'Send to', '宛先：')} {found.maskedName}</div>}
                <div style={{ fontSize:11, color:'#999', marginTop:8, lineHeight:1.6 }}>{tt('為了保護隱私，只會顯示對方姓名的一部分。', 'To protect privacy, only part of the name is shown.', 'プライバシー保護のため、お名前の一部のみ表示されます。')}</div>
              </>
            ) : (
              <div style={{ maxHeight:260, overflowY:'auto' }}>
                {staff.length === 0 && <div style={{ fontSize:12, color:'#999' }}>{tt('目前沒有可選的人員', 'No staff available', '選択できるスタッフがいません')}</div>}
                {['gym-hsinchu', 'gym-shilin'].map(g => {
                  const list = staff.filter(s => s.gymId === g); if (!list.length) return null;
                  return (
                    <div key={g} style={{ marginBottom:10 }}>
                      <div style={{ fontSize:11, color:'#9A6A2C', fontWeight:700, marginBottom:6 }}>{gymName(g)}</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                        {list.map(s => <span key={s.id} style={chip(staffPick?.id === s.id)} onClick={() => setStaffPick(s)}>{s.name}</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {err && <div style={{ marginTop:10, fontSize:12, color:'#A32D2D' }}>{err}</div>}
            <button disabled={!recipientReady} onClick={() => { setErr(''); setStep(2); }} style={{ ...btn(!recipientReady), marginTop:14 }}>{tt('下一步', 'Next', '次へ')}</button>
          </>
        ) : (
          <>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>{tt('② 選貼紙', '② Pick a sticker', '② ステッカーを選ぶ')}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:6, marginBottom:14 }}>
              {season.cards.stickers.map(id => (
                <div key={id} onClick={() => setSticker(id)} style={{ borderRadius:10, padding:4, display:'flex', justifyContent:'center', cursor:'pointer', background: sticker === id ? '#FFEFD8' : '#fff', border: sticker === id ? '2px solid #C45E1A' : '1px solid #EEE' }}>
                  <Sticker season={season} id={id} size={40} />
                </div>
              ))}
            </div>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>{tt('③ 選一句話', '③ Pick a message', '③ メッセージを選ぶ')}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14, maxHeight:240, overflowY:'auto' }}>
              {season.cards.groups.map(({ label: labelFn, ids }) => { const label = labelFn(); return (
                <div key={label}>
                  <div style={{ fontSize:11, color:'#9A6A2C', fontWeight:700, margin:'4px 0 6px' }}>{label}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {ids.map(id => (
                      <div key={id} onClick={() => setPhrase(id)} style={{ padding:'9px 12px', borderRadius:10, fontSize:13, cursor:'pointer', background: phrase === id ? '#FFEFD8' : '#fff', border: phrase === id ? '1.5px solid #C45E1A' : '1px solid #EEE', color: phrase === id ? '#8B3A0E' : '#444', fontWeight: phrase === id ? 700 : 500 }}>{season.cards.phrases[id]()}</div>
                    ))}
                  </div>
                </div>
              ); })}
            </div>
            {member?.nickname && (
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
                <span style={{ fontSize:12, color:'#666' }}>{tt('署名：', 'Signed as:', '署名：')}</span>
                <span style={chip(displayAs === 'nickname')} onClick={() => setDisplayAs('nickname')}>{member.nickname}</span>
                <span style={chip(displayAs === 'name')} onClick={() => setDisplayAs('name')}>{member.name}</span>
              </div>
            )}
            <div style={{ fontSize:12, color:'#888', marginBottom:6 }}>{tt('預覽', 'Preview', 'プレビュー')}</div>
            <CardFace season={season} stickerId={sticker} phraseId={phrase} to={toName} from={displayAs === 'nickname' && member?.nickname ? member.nickname : member?.name} />
            {err && <div style={{ marginTop:10, fontSize:12, color:'#A32D2D' }}>{err}</div>}
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              {replyTo ? <button onClick={onClose} style={{ width:90, height:44, borderRadius:12, border:'1px solid #E0C08A', background:'#fff', color:'#8B3A0E', fontSize:14, cursor:'pointer' }}>{tt('取消', 'Cancel', 'キャンセル')}</button>
                : <button onClick={() => setStep(1)} style={{ width:90, height:44, borderRadius:12, border:'1px solid #E0C08A', background:'#fff', color:'#8B3A0E', fontSize:14, cursor:'pointer' }}>{tt('上一步', 'Back', '戻る')}</button>}
              <button onClick={send} disabled={busy} style={{ ...btn(busy), flex:1 }}>{busy ? tt('送出中…', 'Sending…', '送信中…') : tt('送出感謝卡片', 'Send card', 'カードを送る')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
