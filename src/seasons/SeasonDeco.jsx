// 季節裝飾元件（純展示，無互動、無資料）。全部讀「目前這一季」的設定（seasons/index.js）；沒有圖檔就用該季設定提供的備用圖形，不留破圖。
// 文字一律程式寫（會員端有中英日三語，不能燒進圖）。
import { useState, useEffect } from 'react';
import { getMemberLang } from '../utils/memberI18n';

// 預先載入季節素材，回傳是否存在（null＝檢查中、true／false）；版面（如橫幅吉祥物）依此調整，沒圖時不留空白
export function useSeasonAsset(season, name) {
  const [ok, setOk] = useState(null);
  const base = season ? season.base : '';
  useEffect(() => {
    if (!season || !name) return undefined;
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setOk(true);
    img.onerror = () => alive && setOk(false);
    img.src = `${base}/${name}.webp`;
    return () => { alive = false; };
  }, [base, name, season]);
  return ok;
}
const A = (season, key) => (season.assets && season.assets[key]) || null;

// 季節素材圖（找不到檔案就整個不顯示）
export function SeasonImg({ season, name, size = 110, style }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return <img src={`${season.base}/${name}.webp`} alt="" aria-hidden="true" draggable="false" onError={() => setOk(false)}
    style={{ width:size, height:'auto', pointerEvents:'none', userSelect:'none', filter:`drop-shadow(0 4px 6px rgba(90,52,20,.3))`, ...style }} />;
}

// 貼紙圖（<base>/stickers/<id>.webp）；載入失敗就不顯示
export function StickerPic({ season, id, size, rotate = 0, shadow }) {
  return <img src={`${season.base}/stickers/${id}.webp`} alt="" draggable="false" onError={e => { e.currentTarget.style.display = 'none'; }}
    style={{ width:size, height:size, objectFit:'contain', display:'block', transform:`rotate(${rotate}deg)`, filter: shadow !== undefined ? shadow : season.stickerShadow }} />;
}

// ── 感謝卡片區（首頁／各頁小卡）──────────────────────────────
export function SeasonCard({ season, title, lines = [], style, compact = false }) {
  const hasBg = useSeasonAsset(season, A(season, 'cardBg'));
  const c = season.colors; const cd = season.card;
  const textBlock = (<>
    {title && <div style={{ fontSize: compact ? 14 : 16, fontWeight:800, color:c.red, textAlign:'center', marginBottom: lines.length ? 4 : 0, letterSpacing:.5 }}>{title}</div>}
    {lines.map((l, i) => <div key={i} style={{ fontSize:12, color:c.ink, textAlign:'center', lineHeight:1.7 }}>{l}</div>)}
  </>);
  if (hasBg) {
    return (
      <div style={{ position:'relative', borderRadius:18, overflow:'hidden', boxShadow:cd.shadow, aspectRatio:cd.ratio, display:'flex', flexDirection:'column', justifyContent:'center',
        padding:'0 24px', background:`url(${season.base}/${A(season, 'cardBg')}.webp) center / 100% 100% no-repeat`, ...style }}>
        {textBlock}
      </div>
    );
  }
  return (
    <div style={{ position:'relative', borderRadius:16, padding: compact ? '12px 16px' : '16px 18px', background:cd.fallbackBg, border:cd.fallbackBorder, boxShadow:cd.shadow, ...style }}>
      {cd.fallbackDeco && cd.fallbackDeco()}
      {textBlock}
    </div>
  );
}

// ── 全螢幕飄落物（葉片／雪花…）────────────────────────────────
const FALL_POS = [
  { x:6, s:22, d:14, delay:0 }, { x:19, s:28, d:18, delay:4 }, { x:33, s:18, d:12, delay:8 }, { x:47, s:26, d:20, delay:2 },
  { x:61, s:20, d:15, delay:10 }, { x:74, s:30, d:19, delay:6 }, { x:86, s:22, d:13, delay:12 }, { x:94, s:18, d:17, delay:1 },
];
export function FallingItems({ season }) {
  const f = season.falling;
  return (
    <div className="rr-ss-falling" aria-hidden="true">
      {FALL_POS.map((l, i) => (
        <div key={i} className={'rr-ss-fall' + (f.rotate === false ? ' rr-ss-fall-norot' : '')} style={{ left:`${l.x}%`, animationDuration:`${l.d}s`, animationDelay:`-${l.delay}s` }}>
          <div className="rr-ss-sway" style={{ animationDuration:`${3 + (i % 3)}s` }}><StickerPic season={season} id={f.items[i % f.items.length]} size={l.s + 12} rotate={f.rotate === false ? 0 : (i * 47) % 360} shadow={f.shadow} /></div>
        </div>
      ))}
    </div>
  );
}

// ── 會飛的東西（火雞／雪橇…）：兩格動作疊在一起輪流顯示＝拍翅；A 由左往右飛（高處）、B 由右往左飛（低處）──
function FlyerImg({ season, width }) {
  const f = season.flyer;
  return (
    <div className="rr-ss-flyer-img" style={{ width, aspectRatio:f.frameRatio, position:'relative' }}>
      {f.frames.map((n, i) => (
        <img key={n} src={`${season.base}/${n}.webp`} alt="" draggable="false" className={i === 0 ? 'rr-ss-f1' : 'rr-ss-f2'} style={{ filter:f.shadow }} />
      ))}
    </div>
  );
}
export function FlyingThing({ season }) {
  const f = season.flyer;
  const ok1 = useSeasonAsset(season, f.frames[0]);
  const ok2 = useSeasonAsset(season, f.frames[1]);
  const hasImg = !!(ok1 && ok2);
  // 圖檔朝向：faces==='left'＝圖朝左，往右飛的 A 要翻面、往左飛的 B 不翻；程式繪製備用版以 fallbackFlip 指定哪一隻翻面
  const flipA = hasImg ? f.faces === 'left' : f.fallbackFlip === 'a';
  const flipB = hasImg ? f.faces === 'right' : f.fallbackFlip === 'b';
  return (
    <div className="rr-ss-fly-wrap" aria-hidden="true">
      <div className="rr-ss-fly-a"><div className="rr-ss-bob" style={{ transform: flipA ? 'scaleX(-1)' : 'none' }}>{hasImg ? <FlyerImg season={season} width={f.widthA} /> : f.fallbackA()}</div></div>
      <div className="rr-ss-fly-b"><div className="rr-ss-bob" style={{ transform: flipB ? 'scaleX(-1)' : 'none' }}>{hasImg ? <FlyerImg season={season} width={f.widthB} /> : f.fallbackB()}</div></div>
    </div>
  );
}

// ── 右下角探頭吉祥物（其他頁用；首頁／登入頁已有大橫幅吉祥物，不放）：偶爾冒出一句話，不擋點擊 ──
export function MascotPeek({ season }) {
  const peekName = A(season, 'peek'); const fbName = A(season, 'peekFallback');
  const hasPeek = useSeasonAsset(season, peekName);
  const hasFb = useSeasonAsset(season, fbName);
  if (!hasPeek && !hasFb) return null;
  const lines = season.text.peekLines();
  return (
    <div className="rr-ss-peek" aria-hidden="true">
      {lines.map((l, i) => <div key={i} className="rr-ss-bubble" style={{ animationDelay:`${i * 8}s` }}>{l}</div>)}
      <img src={`${season.base}/${hasPeek ? peekName : fbName}.webp`} alt="" draggable="false" className={hasPeek ? 'rr-ss-peek-img rr-ss-peek-edge' : 'rr-ss-peek-img'} />
    </div>
  );
}

// ── 頁面底部（導覽列上方）的裝飾：整條大圖（僅首頁）或貼紙小景——不擋點擊 ──
export function SeasonGround({ season, big = false }) {
  const g = season.ground;
  const hasImg = useSeasonAsset(season, A(season, 'ground'));
  if (big && hasImg) return <div className="rr-ss-ground rr-ss-ground-img" aria-hidden="true"><img src={`${season.base}/${A(season, 'ground')}.webp`} alt="" draggable="false" /></div>;
  const row = (list) => <div style={{ display:'flex', alignItems:'flex-end', gap:0 }}>{list.map(([id, size, rot], i) => <StickerPic key={i} season={season} id={id} size={size} rotate={rot || 0} />)}</div>;
  return (
    <div className="rr-ss-ground" aria-hidden="true">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', padding:'0 8px' }}>
        {row(g.fallbackStickers.left)}{row(g.fallbackStickers.right)}
      </div>
    </div>
  );
}

// ── 橫幅（登入頁／首頁共用）：背景圖＋程式寫上的三語文字＋兩位吉祥物；字級用 container query 單位（cqw）隨寬度縮放 ──
function SeasonBanner({ season, kind }) {
  const b = season.banner; const o = b[kind];
  const bgName = A(season, o.bg);
  const hasBg = useSeasonAsset(season, bgName);
  const hasLeft = useSeasonAsset(season, A(season, 'mascotLeft'));
  const hasRight = useSeasonAsset(season, A(season, 'mascotRight'));
  const lang = getMemberLang();
  return (
    <div aria-hidden="true" style={{ position:'relative', aspectRatio:o.ratio, margin:o.margin, borderRadius:18, overflow:'hidden', containerType:'inline-size',
      background: hasBg ? `${b.baseBg} url(${season.base}/${bgName}.webp) center / cover no-repeat` : b.fallbackBg,
      boxShadow: o.shadow || b.shadow, border:b.border }}>
      {!hasBg && b.fallbackBgDeco && b.fallbackBgDeco()}
      {o.script && b.scriptText !== false && season.text.script && lang !== 'en' && <div style={{ position:'absolute', left:'22%', right:'22%', top:'3%', textAlign:'center', fontFamily:'Georgia, "Times New Roman", serif', fontStyle:'italic', fontWeight:700,
        fontSize:'6.2cqw', color:b.scriptColor, textShadow:b.scriptShadow }}>{season.text.script}</div>}
      <div style={{ position:'absolute', left:'25%', right:'25%', top: o.titleTop || (o.sub ? '35%' : '39%'), textAlign:'center', fontWeight:900, fontSize:`${o.titleSize}cqw`, lineHeight:1.15, whiteSpace:'nowrap', color:b.titleColor,
        textShadow:b.titleShadow }}>{season.text.title()}</div>
      {o.sub && <div style={{ position:'absolute', left:'25%', right:'25%', top:'55%', textAlign:'center', fontWeight:700, fontSize:'3.7cqw', color:b.subColor, textShadow:b.subShadow }}>{season.text.sub()}</div>}
      {hasLeft && <img src={`${season.base}/${A(season, 'mascotLeft')}.webp`} alt="" draggable="false" style={{ position:'absolute', left:'1%', bottom:'-4%', width:`${o.mascotW}%`, height:'auto', filter:b.mascotShadow }} />}
      {hasRight ? <img src={`${season.base}/${A(season, 'mascotRight')}.webp`} alt="" draggable="false" style={{ position:'absolute', right:'1%', bottom:'-4%', width:`${o.mascotW + 2}%`, height:'auto', filter:b.mascotShadow }} />
        : (b.fallbackRight && b.fallbackRight())}
    </div>
  );
}
export const SeasonScene = ({ season }) => <SeasonBanner season={season} kind="login" />;   // 登入頁頂部橫幅
export const SeasonHero = ({ season }) => <SeasonBanner season={season} kind="home" />;     // 首頁大橫幅
export function SeasonGreeting({ season }) {
  return <div style={{ textAlign:'center', marginTop:18, fontSize:13, fontWeight:800, color:season.colors.brown }}>{season.text.greeting()}</div>;
}
