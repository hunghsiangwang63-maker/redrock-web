// 感恩節感謝卡片（會員互送／送給教練與櫃檯）：句子與貼紙都是預設選項，不能自由打字。
// 後端：routes/thanksCards.js（開放期間 2026-11-22～11-29，收件匣顯示到 12/06；上線前可由 systemSettings/thanksCards.forceOpen 提前開放測試）。
import { useEffect, useState } from 'react';
import { tt } from '../utils/memberI18n';
import { useMember } from '../store/memberStore.jsx';
import { getThanksConfig, lookupThanksRecipient, getThanksStaff, sendThanksCard, getThanksInbox, hideThanksCard } from '../api/thanksCards';
import { Leaf, Acorn, Wheat, Pumpkin, TG } from './ThanksgivingDeco';

// 預設句子（id 與後端 config/thanksCards.js 一致）
export const PHRASES = {
  p1: () => tt('謝謝你，有你真好！', 'Thank you — so glad you are here!', 'ありがとう、あなたがいてよかった！'),
  p2: () => tt('感謝你的陪伴與鼓勵！', 'Thanks for your company and encouragement!', '寄り添って励ましてくれてありがとう！'),
  p3: () => tt('謝謝你教我攀岩！', 'Thanks for teaching me to climb!', 'クライミングを教えてくれてありがとう！'),
  p4: () => tt('感謝你的照顧與幫助！', 'Thanks for your care and help!', '気にかけて助けてくれてありがとう！'),
  p5: () => tt('一起爬的日子好開心！', 'So happy climbing together!', '一緒に登る日々が楽しい！'),
  p6: () => tt('你是我最棒的岩友！', 'You are my best climbing buddy!', '最高のクライミング仲間！'),
  p7: () => tt('感恩有你，一起放手爬！', 'Grateful for you — keep climbing!', 'ありがとう、これからも一緒に登ろう！'),
  p8: () => tt('祝你感恩節快樂，天天平安！', 'Happy Thanksgiving, stay safe!', '感謝祭おめでとう、毎日無事で！'),
  // 俏皮打氣（攀岩哏）
  p9: () => tt('跳出去就有了！', "Just go for the dyno — you've got it!", '思い切って飛べば、つかめるよ！'),
  p10: () => tt('這條你一定行，相信自己！', 'You can send this one — believe in yourself!', 'このルート、きっと登れる。自分を信じて！'),
  p11: () => tt('放手爬，保護交給我！', "Let go and climb — I've got your belay!", '思い切って登って、ビレイは任せて！'),
  p12: () => tt('今天的你比昨天更強！', "You're stronger than yesterday!", '昨日より強くなってるよ！'),
  p13: () => tt('卡關沒關係，休息一下再來！', 'Stuck? Rest a bit and try again!', '行き詰まったら、少し休んでもう一度！'),
  p14: () => tt('手抓緊，心放鬆，加油！', 'Grip tight, stay relaxed — go!', '手はしっかり、心はリラックス、がんばれ！'),
  p15: () => tt('下一條紅點就是你的！', 'Your next redpoint is coming!', '次のレッドポイントはあなたのもの！'),
  p16: () => tt('你笑著爬的樣子最棒！', 'You look best climbing with a smile!', '笑顔で登る姿が一番素敵！'),
  p17: () => tt('慢慢爬也沒關係，風景都一樣好！', 'Slow is fine — the view is just as good!', 'ゆっくりでも大丈夫、景色は同じだよ！'),
  p18: () => tt('掉下來只是重來一次，再來！', 'A fall is just a reset — go again!', '落ちてもリセット、もう一回！'),
};
const THANKS_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const CHEER_IDS = ['p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17', 'p18'];

function PieSvg({ size }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 64 52" aria-hidden="true">
      <ellipse cx="32" cy="40" rx="28" ry="9" fill="#C98A3C"/><path d="M6 34c0-12 12-22 26-22s26 10 26 22c0 6-12 10-26 10S6 40 6 34z" fill="#E8B05A"/>
      <path d="M14 26l36 14M14 38L50 24M22 18l24 30M42 16L18 44" stroke="#C98A3C" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
      <path d="M6 34c0-12 12-22 26-22s26 10 26 22" stroke="#B87625" strokeWidth="3" fill="none"/>
    </svg>
  );
}
function GinkgoSvg({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 60V40" stroke="#B98A2E" strokeWidth="3" strokeLinecap="round"/>
      <path d="M32 40C14 36 6 22 10 10c8 2 14 4 22 4s14-2 22-4c4 12-4 26-22 30z" fill="#F4C842"/>
      <path d="M32 40V16M32 40L18 18M32 40l14-22" stroke="rgba(255,255,255,.55)" strokeWidth="1.8" fill="none"/>
    </svg>
  );
}
// 貼紙：有圖檔（public/thanksgiving/stickers/<id>.webp）就用圖檔，沒有就用程式繪製版
export function Sticker({ id, size = 56 }) {
  const [img, setImg] = useState(true);
  if (img) {
    return <img src={`/thanksgiving/stickers/${id}.webp`} alt="" aria-hidden="true" draggable="false" onError={() => setImg(false)}
      style={{ width:size, height:size, objectFit:'contain', display:'block' }} />;
  }
  const box = { width:size, height:size, display:'flex', alignItems:'center', justifyContent:'center' };
  return (
    <div style={box} aria-hidden="true">
      {id === 'pumpkin' && <Pumpkin size={size} />}
      {id === 'maple' && <Leaf size={size} color="#D9541E" />}
      {id === 'ginkgo' && <GinkgoSvg size={size} />}
      {id === 'acorn' && <Acorn size={size * 0.85} />}
      {id === 'wheat' && <Wheat size={size} />}
      {id === 'pie' && <PieSvg size={size} />}
    </div>
  );
}
const STICKER_IDS = ['pumpkin', 'maple', 'ginkgo', 'acorn', 'wheat', 'pie'];

// 一張卡片（預覽／收件匣共用）
export function CardFace({ stickerId, phraseId, from, to, compact = false }) {
  return (
    <div style={{ position:'relative', borderRadius:14, padding: compact ? '12px 14px' : '16px', background:'linear-gradient(135deg,#FFF9EC 0%,#FBE9C8 100%)',
      border:'1.5px dashed #D9A55A', boxShadow:'0 3px 10px rgba(122,74,33,.18)', display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ flexShrink:0 }}><Sticker id={stickerId} size={compact ? 52 : 62} /></div>
      <div style={{ minWidth:0, flex:1 }}>
        {to && <div style={{ fontSize:11, color:'#9A6A2C' }}>{tt('寄給', 'To', '宛先')} {to}</div>}
        <div style={{ fontSize: compact ? 14 : 15, fontWeight:800, color:TG.red, lineHeight:1.5 }}>{PHRASES[phraseId]?.() || ''}</div>
        {from && <div style={{ fontSize:11, color:TG.ink, marginTop:3 }}>— {from}</div>}
      </div>
    </div>
  );
}

// ───────────── 首頁：收到的感謝卡片 ─────────────
export function ThanksCardInbox() {
  const { member } = useMember();
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
  if (!cards.length) return null;
  const hide = async (c, block) => {
    try { await hideThanksCard(c.id, block); setCards(list => list.filter(x => x.id !== c.id)); } catch (e) { /* 失敗就保留 */ }
    setMenuFor(null);
  };
  return (
    <div style={{ margin:'18px 16px 0' }}>
      <div style={{ fontSize:12, fontWeight:700, color:TG.brown, marginBottom:8 }}>💌 {tt('收到的感謝卡片', 'Thank-you cards for you', '届いた感謝カード')}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {cards.map(c => (
          <div key={c.id} style={{ position:'relative' }}>
            <CardFace stickerId={c.stickerId} phraseId={c.phraseId} from={c.fromDisplay} compact />
            {canSend && (
              <button onClick={() => setReplyTo({ id: c.id, fromDisplay: c.fromDisplay })}
                style={{ position:'absolute', right:10, bottom:8, height:28, padding:'0 12px', borderRadius:14, border:'none', background:'linear-gradient(90deg,#E9812A,#C45E1A)', color:'#fff', fontSize:12, fontWeight:800, cursor:'pointer' }}>
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
      {replyTo && <SendSheet member={member} replyTo={replyTo} onClose={() => setReplyTo(null)} />}
    </div>
  );
}

// ───────────── 首頁：送感謝卡片（按鈕＋底部彈窗）─────────────
export function SendThanksCard() {
  const { member } = useMember();
  const [cfg, setCfg] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { getThanksConfig().then(setCfg).catch(() => {}); }, []);
  if (!cfg || !cfg.sendOpen) return null;
  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ marginTop:10, width:'100%', height:40, borderRadius:12, border:'none', background:'linear-gradient(90deg,#E9812A,#C45E1A)', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer', boxShadow:'0 3px 8px rgba(196,94,26,.35)' }}>
        💌 {tt('送一張感謝卡片', 'Send a thank-you card', '感謝カードを送る')}
      </button>
      {open && <SendSheet member={member} onClose={() => setOpen(false)} />}
    </>
  );
}

// replyTo：{ id, fromDisplay }＝回送卡片（收件人固定為寄件人，直接從第 2 步開始）
function SendSheet({ member, onClose, replyTo = null }) {
  const [step, setStep] = useState(replyTo ? 2 : 1);
  const [tab, setTab] = useState('phone');
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState(null);   // { toMemberId, maskedName }
  const [staff, setStaff] = useState([]);
  const [staffPick, setStaffPick] = useState(null);
  const [sticker, setSticker] = useState('pumpkin');
  const [phrase, setPhrase] = useState('p1');
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
          <div style={{ fontSize:16, fontWeight:800, color:TG.red }}>💌 {replyTo ? tt(`回送卡片給 ${replyTo.fromDisplay}`, `Reply to ${replyTo.fromDisplay}`, `${replyTo.fromDisplay} さんに返信`) : tt('送一張感謝卡片', 'Send a thank-you card', '感謝カードを送る')}</div>
          <span onClick={onClose} style={{ fontSize:22, color:'#999', cursor:'pointer' }}>×</span>
        </div>

        {done ? (
          <div style={{ textAlign:'center', padding:'10px 0' }}>
            <CardFace stickerId={sticker} phraseId={phrase} to={toName} />
            <div style={{ marginTop:14, fontSize:15, fontWeight:800, color:'#2D7D46' }}>✓ {tt('已送出！', 'Sent!', '送信しました！')}</div>
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
              {STICKER_IDS.map(id => (
                <div key={id} onClick={() => setSticker(id)} style={{ borderRadius:10, padding:4, display:'flex', justifyContent:'center', cursor:'pointer', background: sticker === id ? '#FFEFD8' : '#fff', border: sticker === id ? '2px solid #C45E1A' : '1px solid #EEE' }}>
                  <Sticker id={id} size={40} />
                </div>
              ))}
            </div>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>{tt('③ 選一句話', '③ Pick a message', '③ メッセージを選ぶ')}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14, maxHeight:240, overflowY:'auto' }}>
              {[[tt('感謝', 'Thanks', '感謝'), THANKS_IDS], [tt('打氣（攀岩哏）', 'Cheer-ups (climbing talk)', '応援（クライミング用語）'), CHEER_IDS]].map(([label, ids]) => (
                <div key={label}>
                  <div style={{ fontSize:11, color:'#9A6A2C', fontWeight:700, margin:'4px 0 6px' }}>{label}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {ids.map(id => (
                      <div key={id} onClick={() => setPhrase(id)} style={{ padding:'9px 12px', borderRadius:10, fontSize:13, cursor:'pointer', background: phrase === id ? '#FFEFD8' : '#fff', border: phrase === id ? '1.5px solid #C45E1A' : '1px solid #EEE', color: phrase === id ? '#8B3A0E' : '#444', fontWeight: phrase === id ? 700 : 500 }}>{PHRASES[id]()}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {member?.nickname && (
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
                <span style={{ fontSize:12, color:'#666' }}>{tt('署名：', 'Signed as:', '署名：')}</span>
                <span style={chip(displayAs === 'nickname')} onClick={() => setDisplayAs('nickname')}>{member.nickname}</span>
                <span style={chip(displayAs === 'name')} onClick={() => setDisplayAs('name')}>{member.name}</span>
              </div>
            )}
            <div style={{ fontSize:12, color:'#888', marginBottom:6 }}>{tt('預覽', 'Preview', 'プレビュー')}</div>
            <CardFace stickerId={sticker} phraseId={phrase} to={toName} from={displayAs === 'nickname' && member?.nickname ? member.nickname : member?.name} />
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
