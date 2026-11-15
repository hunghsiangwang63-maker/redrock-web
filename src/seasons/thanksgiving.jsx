// 感恩節（2026-11-22～11-29；收件匣顯示到 12/06）——季節設定＋程式繪製的備用圖形（沒有圖檔時才用）。
// 新增一季（如聖誕節）：複製這份設定改成新季節的日期／素材／文字／色票，再到 seasons/index.js 註冊，並在 styles/seasons.css 加一段 html[data-season="<key>"] 變數。
import { tt } from '../utils/memberI18n';

const TG = { brown:'#7A4A21', brownD:'#5A3414', orange:'#E07A1F', gold:'#F2B33D', red:'#B5382B', cream:'#FFF4E2', cream2:'#FBE3C0', ink:'#4A2C12' };

// ── 程式繪製的備用圖形（圖檔缺失時才顯示；沒有第三方素材）────────────────
export function Leaf({ size = 28, color = '#D9541E', rotate = 0, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ transform:`rotate(${rotate}deg)`, ...style }}>
      <path d="M32 3c5 7 14 11 21 12-3 5-2 9 1 13-6 1-10 4-11 9 3 1 6 0 9-1-4 9-11 14-20 15v8h-0v-8C23 51 16 46 12 37c3 1 6 2 9 1-1-5-5-8-11-9 3-4 4-8 1-13 7-1 16-5 21-13z" fill={color}/>
      <path d="M32 12v46M32 30l-10-8M32 30l10-8M32 40l-12-6M32 40l12-6" stroke="rgba(255,255,255,.45)" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    </svg>
  );
}
export function Acorn({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 56" aria-hidden="true">
      <path d="M24 2v8" stroke={TG.brownD} strokeWidth="4" strokeLinecap="round"/>
      <path d="M8 24c0-8 7-13 16-13s16 5 16 13z" fill={TG.brownD}/>
      <path d="M10 24h28c0 12-6 28-14 28S10 36 10 24z" fill={TG.gold}/>
      <path d="M18 30c0 8 3 14 6 18" stroke="rgba(255,255,255,.5)" strokeWidth="3" strokeLinecap="round" fill="none"/>
    </svg>
  );
}
export function Wheat({ size = 44 }) {
  const grains = [-2, 8, 18, 28];
  return (
    <svg width={size * 0.5} height={size} viewBox="0 0 24 64" aria-hidden="true">
      <path d="M12 62V8" stroke="#B98A2E" strokeWidth="2.5" strokeLinecap="round"/>
      {grains.map((y, i) => (<g key={i}>
        <ellipse cx="6" cy={14 + y} rx="3.4" ry="6" fill="#E8B84A" transform={`rotate(-28 6 ${14 + y})`}/>
        <ellipse cx="18" cy={14 + y} rx="3.4" ry="6" fill="#E8B84A" transform={`rotate(28 18 ${14 + y})`}/>
      </g>))}
      <ellipse cx="12" cy="6" rx="3.4" ry="6" fill="#E8B84A"/>
    </svg>
  );
}
export function Pumpkin({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 14c2-5 6-7 10-7" stroke="#6B8E3A" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <ellipse cx="20" cy="38" rx="14" ry="20" fill="#D26A12"/><ellipse cx="44" cy="38" rx="14" ry="20" fill="#D26A12"/>
      <ellipse cx="32" cy="38" rx="17" ry="22" fill="#EE8A1E"/>
      <path d="M32 18v40M24 20c-4 10-4 26 0 36M40 20c4 10 4 26 0 36" stroke="rgba(150,70,0,.35)" strokeWidth="2" fill="none"/>
    </svg>
  );
}
export function TurkeySvg({ size = 90, flap = true }) {
  return (
    <svg width={size} height={size * 0.86} viewBox="0 0 120 104" aria-hidden="true" style={{ overflow:'visible' }}>
      {[[-62,'#B5382B'],[-34,'#E07A1F'],[0,'#F2B33D'],[34,'#E07A1F'],[62,'#B5382B']].map(([r, c], i) => (
        <g key={i} transform={`rotate(${r} 60 62)`}><ellipse cx="60" cy="26" rx="9" ry="24" fill={c}/><ellipse cx="60" cy="18" rx="4" ry="10" fill="rgba(255,255,255,.35)"/></g>
      ))}
      <g className={flap ? 'rr-ss-wing-l' : undefined} style={{ transformOrigin:'46px 66px' }}><ellipse cx="36" cy="68" rx="15" ry="9" fill={TG.brownD} transform="rotate(20 36 68)"/></g>
      <g className={flap ? 'rr-ss-wing-r' : undefined} style={{ transformOrigin:'74px 66px' }}><ellipse cx="84" cy="68" rx="15" ry="9" fill={TG.brownD} transform="rotate(-20 84 68)"/></g>
      <ellipse cx="60" cy="72" rx="22" ry="22" fill={TG.brown}/>
      <ellipse cx="60" cy="78" rx="14" ry="14" fill="#A8703B"/>
      <circle cx="60" cy="44" r="12" fill={TG.brown}/>
      <circle cx="55.5" cy="42" r="2.6" fill="#fff"/><circle cx="64.5" cy="42" r="2.6" fill="#fff"/>
      <circle cx="56" cy="42.4" r="1.3" fill="#222"/><circle cx="64" cy="42.4" r="1.3" fill="#222"/>
      <path d="M56 47l4 7 4-7z" fill="#F2A33A"/>
      <path d="M58.2 53c0 5 3.6 5 3.6 0z" fill="#C0392B"/>
      <path d="M52 34c2-6 6-8 8-8s6 2 8 8" stroke={TG.red} strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      <path d="M52 92v8M52 100l-5 3M52 100l5 3M68 92v8M68 100l-5 3M68 100l5 3" stroke="#E0891F" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
    </svg>
  );
}
export function RoastTurkey({ size = 96 }) {
  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 120 94" aria-hidden="true">
      <ellipse cx="60" cy="78" rx="54" ry="13" fill="#fff" stroke="#E6D3BC" strokeWidth="2"/>
      <ellipse cx="60" cy="76" rx="42" ry="8" fill="#F3E6D2"/>
      <g><ellipse cx="22" cy="62" rx="11" ry="8" fill="#B8651D" transform="rotate(-30 22 62)"/><path d="M14 70l-7 6" stroke="#fff" strokeWidth="4" strokeLinecap="round"/><circle cx="6" cy="78" r="3.4" fill="#fff"/></g>
      <g><ellipse cx="98" cy="62" rx="11" ry="8" fill="#B8651D" transform="rotate(30 98 62)"/><path d="M106 70l7 6" stroke="#fff" strokeWidth="4" strokeLinecap="round"/><circle cx="114" cy="78" r="3.4" fill="#fff"/></g>
      <ellipse cx="60" cy="52" rx="34" ry="26" fill="#C8772B"/>
      <ellipse cx="60" cy="48" rx="30" ry="21" fill="#E39A3F"/>
      <path d="M40 40c6-8 16-11 28-8M44 56c10 5 24 5 34-2" stroke="rgba(255,255,255,.45)" strokeWidth="3.2" fill="none" strokeLinecap="round"/>
      <ellipse cx="50" cy="38" rx="8" ry="4" fill="rgba(255,255,255,.28)" transform="rotate(-20 50 38)"/>
      <circle cx="86" cy="78" r="4.4" fill="#B5382B"/><circle cx="93" cy="80" r="4.4" fill="#C0392B"/><circle cx="79" cy="80" r="3.8" fill="#C0392B"/>
      <path d="M24 78c4-7 9-7 12 0-4 3-8 3-12 0zM36 80c4-6 8-6 11 1" fill="#6B8E3A"/>
    </svg>
  );
}
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
// 貼紙圖缺檔時的備用繪製
const stickerFallback = (id, size) => (
  <>
    {id === 'pumpkin' && <Pumpkin size={size} />}
    {id === 'maple' && <Leaf size={size} color="#D9541E" />}
    {id === 'ginkgo' && <GinkgoSvg size={size} />}
    {id === 'acorn' && <Acorn size={size * 0.85} />}
    {id === 'wheat' && <Wheat size={size} />}
    {id === 'pie' && <PieSvg size={size} />}
    {['pumpkin2', 'star', 'cranberry', 'cocoa', 'candy', 'pumpkinpie', 'hat', 'sunflower', 'turkey', 'apple', 'greenpumpkin'].includes(id) && <Pumpkin size={size} />}
    {id === 'maple2' && <Leaf size={size} color="#C0281E" />}
  </>
);

// ── 感謝卡片句子（id 與後端 config/thanksCards.js 的感恩節 phrases 一致）──
const PHRASES = {
  p1: () => tt('謝謝你，有你真好！', 'Thank you — so glad you are here!', 'ありがとう、あなたがいてよかった！'),
  p2: () => tt('感謝你的陪伴與鼓勵！', 'Thanks for your company and encouragement!', '寄り添って励ましてくれてありがとう！'),
  p3: () => tt('謝謝你教我攀岩！', 'Thanks for teaching me to climb!', 'クライミングを教えてくれてありがとう！'),
  p4: () => tt('感謝你的照顧與幫助！', 'Thanks for your care and help!', '気にかけて助けてくれてありがとう！'),
  p5: () => tt('一起爬的日子好開心！', 'So happy climbing together!', '一緒に登る日々が楽しい！'),
  p6: () => tt('你是我最棒的岩友！', 'You are my best climbing buddy!', '最高のクライミング仲間！'),
  p7: () => tt('感恩有你，一起放手爬！', 'Grateful for you — keep climbing!', 'ありがとう、これからも一緒に登ろう！'),
  p8: () => tt('祝你感恩節快樂，天天平安！', 'Happy Thanksgiving, stay safe!', '感謝祭おめでとう、毎日無事で！'),
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

// 功能格（首頁八格）：入場 QR＝楓葉紅、快速入場＝南瓜橘、其餘奶油色（不用外部素材）
const tileStyle = (f, fi) => {
  const base = { position:'relative', borderRadius:18, minHeight:62, padding:'12px 8px', textAlign:'center', cursor:'pointer', transition:'all .15s' };
  if (f.highlight && fi === 0) return { ...base, background:'linear-gradient(160deg,#B92727 0%,#8F1C1C 100%)', border:'none', boxShadow:'0 4px 10px rgba(142,27,20,.4), inset 0 1px 0 rgba(255,255,255,.25)' };
  if (f.highlight) return { ...base, background:'linear-gradient(160deg,#FF850D 0%,#E06A00 100%)', border:'none', boxShadow:'0 4px 10px rgba(212,99,15,.4), inset 0 1px 0 rgba(255,255,255,.3)' };
  return { ...base, background:'linear-gradient(180deg,#FFF9ED 0%,#FDEFD0 100%)', border:'1px solid #F1D8A8', boxShadow:'0 2px 8px rgba(160,100,40,.15)' };
};

const thanksgiving = {
  key: 'thanksgiving',
  start: '2026-11-22', end: '2026-11-29', inboxEnd: '2026-12-06',   // 與後端 config/thanksCards.js 的 SEASONS 一致
  base: '/thanksgiving',                                               // 素材資料夾（public/thanksgiving/）
  stickerShadow: 'drop-shadow(0 2px 2px rgba(90,52,20,.25))',     // 貼紙圖（飄落物、底部小景）預設陰影
  colors: { brown: TG.brown, ink: TG.ink, red: TG.red, inboxTitle: TG.brown },
  assets: { heroBg: 'hero-bg', loginBg: 'hero-bg2', welcomeBg: 'welcome-bg', cardBg: 'card-bg', ground: 'ground', mascotLeft: 'mascot', mascotRight: 'mascot3', mailer: 'mascot5', sent: 'mascot4', peek: 'mascot6', peekFallback: 'mascot2' },
  text: {
    title: () => tt('感恩節快樂！', 'Happy Thanksgiving!', '感謝祭おめでとう！'),
    sub: () => tt('感謝有你，一起放手爬！', 'Thankful for you — keep climbing!', 'ありがとう、これからも一緒に！'),
    script: 'Happy Thanksgiving',   // 中日文版橫幅上方的斜體字；英文版不顯示（主標已是英文）
    greeting: () => tt('🍂 感謝有你，一起放手爬！紅石攀岩祝你感恩節快樂', '🍂 Thankful for you — happy climbing! Happy Thanksgiving from RedRock', '🍂 ありがとう、一緒に登ろう！紅石クライミングより感謝祭おめでとう'),
    cardTitle: () => tt('感謝您一路相伴', 'Thank you for climbing with us', 'いつもありがとうございます'),
    cardLines: () => [tt('這一年有你的支持，紅石才能一起長大。', 'Your support helped RedRock grow this year.', '今年もご利用いただき、ありがとうございました。'),
                      tt('感恩節期間，祝你天天爬得開心！', 'Wishing you happy climbing this Thanksgiving week!', '感謝祭の週も、楽しいクライミングを！')],
    peekLines: () => [tt('感謝有你！', 'Thank you!', 'ありがとう！'), tt('一起放手爬！', "Let's climb!", '一緒に登ろう！'), tt('感恩節快樂', 'Happy Thanksgiving', '感謝祭おめでとう')],
  },
  banner: {
    home: { bg: 'heroBg', ratio: '2 / 1', mascotW: 23, sub: true, script: true, titleSize: 7.6, margin: '12px 16px 0' },
    login: { bg: 'loginBg', ratio: '2172 / 724', mascotW: 25, sub: false, script: false, titleSize: 6.4, titleTop: '36%', margin: '0 -6px 10px', shadow: '0 8px 22px rgba(122,74,33,.35)' },
    fallbackBg: 'linear-gradient(135deg,#F7B05A 0%,#E9812A 55%,#C45E1A 100%)', baseBg: '#F7D9A0', border: '1.5px solid #F2D08C', shadow: '0 8px 20px rgba(122,74,33,.35)',
    titleColor: '#FFF4E2', titleShadow: '0 2px 0 #5A2F10, 0 0 6px rgba(90,47,16,.6)', subColor: '#FFE9C4', subShadow: '0 1px 0 #5A2F10',
    scriptColor: '#9A4A12', scriptShadow: '0 1px 0 rgba(255,255,255,.7)', mascotShadow: 'drop-shadow(0 4px 6px rgba(90,52,20,.35))',
    fallbackBgDeco: () => <div style={{ position:'absolute', right:-10, top:-14, opacity:.85 }}><Leaf size={64} color="#F9D27D" rotate={-15}/></div>,
    fallbackRight: () => <div style={{ position:'absolute', right:'3%', bottom:'4%' }}><RoastTurkey size={100}/></div>,
  },
  card: {
    ratio: '1000 / 305', shadow: '0 4px 14px rgba(122,74,33,.18)',
    mailerSize: 72, mailerPos: { right: 6, top: 26 },
    fallbackDeco: () => (<>
      <div aria-hidden="true" style={{ position:'absolute', top:-12, left:16 }}><Leaf size={26} color="#D9541E" rotate={-20} /></div>
      <div aria-hidden="true" style={{ position:'absolute', top:-10, left:38 }}><Leaf size={20} color="#F2A33A" rotate={25} /></div>
      <div aria-hidden="true" style={{ position:'absolute', top:-14, right:14 }}><Acorn size={26} /></div>
    </>),
    fallbackBg: 'linear-gradient(135deg,#FFF9EC 0%,#FBE9C8 100%)', fallbackBorder: '1.5px dashed #D9A55A',
  },
  cta: { style: { marginTop:12, width:'100%', height:48, borderRadius:24, border:'none', background:'linear-gradient(180deg,#F7A23E 0%,#E27B1B 55%,#C85F0E 100%)', color:'#fff', fontSize:16, fontWeight:800, letterSpacing:.5, cursor:'pointer', textShadow:'0 1px 2px rgba(120,50,0,.45)', boxShadow:'0 6px 14px rgba(200,95,14,.4), inset 0 1px 0 rgba(255,255,255,.45)' },
         replyBg: 'linear-gradient(90deg,#E9812A,#C45E1A)' },
  falling: { items: ['maple', 'ginkgo', 'maple2', 'acorn', 'maple', 'ginkgo', 'maple2', 'acorn'], rotate: true, sway: 14, shadow: 'drop-shadow(0 2px 2px rgba(90,52,20,.25))' },
  flyer: {
    frames: ['turkey-fly1', 'turkey-fly2'], frameRatio: '265 / 220', faces: 'left', widthA: 104, widthB: 80,
    fallbackA: () => <TurkeySvg size={84} />, fallbackB: () => <TurkeySvg size={64} />, fallbackFlip: 'b',   // 程式繪製版：只有由右往左飛的那隻翻面
    shadow: 'drop-shadow(0 3px 4px rgba(90,52,20,.3))',
  },
  ground: {
    homeOnly: true,
    fallbackStickers: { left: [['wheat', 36], ['pumpkin2', 32], ['maple', 22, 20]], right: [['acorn', 24], ['cranberry', 24], ['pumpkin', 30], ['sunflower', 34]] },
  },
  tiles: { style: tileStyle, labelColor: '#7A4A21', labelShadow: '0 1px 2px rgba(80,20,0,.4)',
    deco: [{ index: 0, sticker: 'maple', pos: { left: -8, top: -10 } }, { index: 3, sticker: 'maple2', pos: { right: -9, bottom: -8 } }], decoSize: 26 },
  cards: {
    phrases: PHRASES,
    groups: [{ label: () => tt('感謝', 'Thanks', '感謝'), ids: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'] },
             { label: () => tt('打氣（攀岩哏）', 'Cheer-ups (climbing talk)', '応援（クライミング用語）'), ids: ['p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17', 'p18'] }],
    stickers: ['pumpkin', 'maple', 'ginkgo', 'acorn', 'wheat', 'pumpkin2', 'star', 'cranberry', 'maple2', 'pie', 'cocoa', 'candy', 'pumpkinpie', 'hat', 'sunflower', 'turkey', 'apple', 'greenpumpkin'],
    stickerFallback,
    face: { bg: 'linear-gradient(135deg,#FFF9EC 0%,#FBE9C8 100%)', border: '1.5px dashed #D9A55A', shadow: '0 3px 10px rgba(122,74,33,.18)', toColor: '#9A6A2C' },
  },
};
export default thanksgiving;
