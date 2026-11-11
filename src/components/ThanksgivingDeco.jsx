// 感恩節裝飾（純展示，無互動、無資料）。僅在 isThanksgiving() 為真時由 SeasonLayer／各頁引用。
// 全部用 SVG／CSS 程式繪製，沒有第三方素材（無授權問題）；吉祥物圖檔放 public/thanksgiving/mascot*.webp（沒有檔案就自動不顯示）。
import { useState, useEffect } from 'react';
import { tt } from '../utils/memberI18n';

export const TG = { brown:'#7A4A21', brownD:'#5A3414', orange:'#E07A1F', gold:'#F2B33D', red:'#B5382B', cream:'#FFF4E2', cream2:'#FBE3C0', ink:'#4A2C12' };
const LEAF_COLORS = ['#D9541E', '#F2A33A', '#B5382B', '#C9822B', '#E8C14A', '#9C4A1A'];

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

// ── 會飛的火雞（翅膀拍動）──────────────────────────────────────
export function TurkeySvg({ size = 90, flap = true }) {
  return (
    <svg width={size} height={size * 0.86} viewBox="0 0 120 104" aria-hidden="true" style={{ overflow:'visible' }}>
      {/* 尾羽扇 */}
      {[[-62,'#B5382B'],[-34,'#E07A1F'],[0,'#F2B33D'],[34,'#E07A1F'],[62,'#B5382B']].map(([r, c], i) => (
        <g key={i} transform={`rotate(${r} 60 62)`}><ellipse cx="60" cy="26" rx="9" ry="24" fill={c}/><ellipse cx="60" cy="18" rx="4" ry="10" fill="rgba(255,255,255,.35)"/></g>
      ))}
      {/* 翅膀 */}
      <g className={flap ? 'rr-tg-wing-l' : undefined} style={{ transformOrigin:'46px 66px' }}><ellipse cx="36" cy="68" rx="15" ry="9" fill={TG.brownD} transform="rotate(20 36 68)"/></g>
      <g className={flap ? 'rr-tg-wing-r' : undefined} style={{ transformOrigin:'74px 66px' }}><ellipse cx="84" cy="68" rx="15" ry="9" fill={TG.brownD} transform="rotate(-20 84 68)"/></g>
      {/* 身體、頭 */}
      <ellipse cx="60" cy="72" rx="22" ry="22" fill={TG.brown}/>
      <ellipse cx="60" cy="78" rx="14" ry="14" fill="#A8703B"/>
      <circle cx="60" cy="44" r="12" fill={TG.brown}/>
      <circle cx="55.5" cy="42" r="2.6" fill="#fff"/><circle cx="64.5" cy="42" r="2.6" fill="#fff"/>
      <circle cx="56" cy="42.4" r="1.3" fill="#222"/><circle cx="64" cy="42.4" r="1.3" fill="#222"/>
      <path d="M56 47l4 7 4-7z" fill="#F2A33A"/>
      <path d="M58.2 53c0 5 3.6 5 3.6 0z" fill="#C0392B"/>
      <path d="M52 34c2-6 6-8 8-8s6 2 8 8" stroke={TG.red} strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      {/* 腳 */}
      <path d="M52 92v8M52 100l-5 3M52 100l5 3M68 92v8M68 100l-5 3M68 100l5 3" stroke="#E0891F" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

// ── 烤火雞（盤子上）──────────────────────────────────────────
export function RoastTurkey({ size = 96 }) {
  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 120 94" aria-hidden="true">
      <ellipse cx="60" cy="78" rx="54" ry="13" fill="#fff" stroke="#E6D3BC" strokeWidth="2"/>
      <ellipse cx="60" cy="76" rx="42" ry="8" fill="#F3E6D2"/>
      {/* 雞腿 */}
      <g><ellipse cx="22" cy="62" rx="11" ry="8" fill="#B8651D" transform="rotate(-30 22 62)"/><path d="M14 70l-7 6" stroke="#fff" strokeWidth="4" strokeLinecap="round"/><circle cx="6" cy="78" r="3.4" fill="#fff"/></g>
      <g><ellipse cx="98" cy="62" rx="11" ry="8" fill="#B8651D" transform="rotate(30 98 62)"/><path d="M106 70l7 6" stroke="#fff" strokeWidth="4" strokeLinecap="round"/><circle cx="114" cy="78" r="3.4" fill="#fff"/></g>
      {/* 主體 */}
      <ellipse cx="60" cy="52" rx="34" ry="26" fill="#C8772B"/>
      <ellipse cx="60" cy="48" rx="30" ry="21" fill="#E39A3F"/>
      <path d="M40 40c6-8 16-11 28-8M44 56c10 5 24 5 34-2" stroke="rgba(255,255,255,.45)" strokeWidth="3.2" fill="none" strokeLinecap="round"/>
      <ellipse cx="50" cy="38" rx="8" ry="4" fill="rgba(255,255,255,.28)" transform="rotate(-20 50 38)"/>
      {/* 擺盤 */}
      <circle cx="86" cy="78" r="4.4" fill="#B5382B"/><circle cx="93" cy="80" r="4.4" fill="#C0392B"/><circle cx="79" cy="80" r="3.8" fill="#C0392B"/>
      <path d="M24 78c4-7 9-7 12 0-4 3-8 3-12 0zM36 80c4-6 8-6 11 1" fill="#6B8E3A"/>
    </svg>
  );
}

// ── 感謝卡片（首頁／各頁小卡）─────────────────────────────────
export function ThankCard({ title, lines = [], style, compact = false }) {
  return (
    <div style={{ position:'relative', borderRadius:16, padding: compact ? '12px 16px' : '16px 18px', background:'linear-gradient(135deg,#FFF9EC 0%,#FBE9C8 100%)',
      border:'1.5px dashed #D9A55A', boxShadow:'0 4px 14px rgba(122,74,33,.18)', ...style }}>
      <div aria-hidden="true" style={{ position:'absolute', top:-12, left:16 }}><Leaf size={26} color="#D9541E" rotate={-20} /></div>
      <div aria-hidden="true" style={{ position:'absolute', top:-10, left:38 }}><Leaf size={20} color="#F2A33A" rotate={25} /></div>
      <div aria-hidden="true" style={{ position:'absolute', top:-14, right:14 }}><Acorn size={26} /></div>
      {title && <div style={{ fontSize: compact ? 14 : 16, fontWeight:800, color:TG.red, textAlign:'center', marginBottom: lines.length ? 4 : 0, letterSpacing:.5 }}>{title}</div>}
      {lines.map((l, i) => <div key={i} style={{ fontSize:12, color:TG.ink, textAlign:'center', lineHeight:1.7 }}>{l}</div>)}
    </div>
  );
}

// 預先載入吉祥物圖檔，回傳是否存在（null＝檢查中、true／false）；版面（如首頁橫幅文字起點）依此調整，沒圖時不留空白
export function useMascotAvailable(name = 'mascot') {
  const [ok, setOk] = useState(null);
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setOk(true);
    img.onerror = () => alive && setOk(false);
    img.src = `/thanksgiving/${name}.webp`;
    return () => { alive = false; };
  }, [name]);
  return ok;
}

// 吉祥物（小紅石穿秋裝）：圖檔由使用者提供，放 public/thanksgiving/ 下；找不到檔案就整個不顯示，不留破圖
export function MascotImg({ name = 'mascot', size = 110, style }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return <img src={`/thanksgiving/${name}.webp`} alt="" aria-hidden="true" draggable="false" onError={() => setOk(false)}
    style={{ width:size, height:'auto', pointerEvents:'none', userSelect:'none', filter:'drop-shadow(0 4px 6px rgba(90,52,20,.3))', ...style }} />;
}

// ── 全螢幕飄落葉片＋會飛的火雞 ─────────────────────────────────
const LEAVES = [
  { x:6, s:22, d:14, delay:0 }, { x:19, s:28, d:18, delay:4 }, { x:33, s:18, d:12, delay:8 }, { x:47, s:26, d:20, delay:2 },
  { x:61, s:20, d:15, delay:10 }, { x:74, s:30, d:19, delay:6 }, { x:86, s:22, d:13, delay:12 }, { x:94, s:18, d:17, delay:1 },
];
export function FallingLeaves() {
  return (
    <div className="rr-tg-leaves" aria-hidden="true">
      {LEAVES.map((l, i) => (
        <div key={i} className="rr-tg-leaf" style={{ left:`${l.x}%`, animationDuration:`${l.d}s`, animationDelay:`-${l.delay}s` }}>
          <div className="rr-tg-leaf-sway" style={{ animationDuration:`${3 + (i % 3)}s` }}><Leaf size={l.s} color={LEAF_COLORS[i % LEAF_COLORS.length]} rotate={(i * 47) % 360} /></div>
        </div>
      ))}
    </div>
  );
}
export function FlyingTurkey() {
  return (
    <div className="rr-tg-fly-wrap" aria-hidden="true">
      <div className="rr-tg-fly-a"><div className="rr-tg-bob"><TurkeySvg size={84} /></div></div>
      <div className="rr-tg-fly-b"><div className="rr-tg-bob"><TurkeySvg size={64} /></div></div>
    </div>
  );
}

// 頁面底部（導覽列上方）的小景：南瓜、麥穗、橡實、落葉——只蓋在頁面底部留白處
export function AutumnGround() {
  return (
    <div className="rr-tg-ground" aria-hidden="true">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', padding:'0 10px' }}>
        <div style={{ display:'flex', alignItems:'flex-end', gap:2 }}><Wheat size={28}/><Pumpkin size={26}/><Leaf size={16} color="#D9541E" rotate={30}/></div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:2 }}><Acorn size={16}/><Leaf size={18} color="#F2A33A" rotate={-25}/><Pumpkin size={24}/><Wheat size={26}/></div>
      </div>
    </div>
  );
}

// 登入頁頂部橫幅：秋日暖光＋吉祥物＋烤火雞
export function ThanksgivingScene() {
  const hasMascot = useMascotAvailable('mascot');
  return (
    <div aria-hidden="true" style={{ position:'relative', height:150, margin:'0 -6px 10px', borderRadius:18, overflow:'hidden',
      background:'linear-gradient(135deg,#F7B05A 0%,#E9812A 55%,#C45E1A 100%)', boxShadow:'0 8px 22px rgba(122,74,33,.35)', border:'1.5px solid #F2D08C' }}>
      <div style={{ position:'absolute', left:-16, top:-16, opacity:.9 }}><Leaf size={56} color="#F9D27D" rotate={20}/></div>
      <div style={{ position:'absolute', right:90, top:6 }}><Leaf size={34} color="#B5382B" rotate={-40}/></div>
      <div style={{ position:'absolute', left:62, top:16 }}><Acorn size={26}/></div>
      <div style={{ position:'absolute', left:6, bottom:-4 }}><MascotImg size={112} /></div>
      <div style={{ position:'absolute', right: hasMascot ? 8 : '50%', marginRight: hasMascot ? 0 : -60, bottom:6 }}><RoastTurkey size={120}/></div>
      <div style={{ position:'absolute', left:'50%', top:10, transform:'translateX(-50%)', width:60 }}><Wheat size={50}/></div>
    </div>
  );
}
export function ThanksgivingGreeting() {
  return (
    <div style={{ textAlign:'center', marginTop:18, fontSize:13, fontWeight:800, color:TG.brown }}>
      {tt('🍂 感謝有你，一起放手爬！紅石攀岩祝你感恩節快樂', '🍂 Thankful for you — happy climbing! Happy Thanksgiving from RedRock', '🍂 ありがとう、一緒に登ろう！紅石クライミングより感謝祭おめでとう')}
    </div>
  );
}

// 首頁大橫幅：秋日橫幅＋吉祥物＋祝福語＋烤火雞
export function ThanksgivingHero() {
  const hasMascot = useMascotAvailable('mascot');
  return (
    <div style={{ margin:'12px 16px 0', borderRadius:18, height:150, position:'relative', overflow:'hidden',
      background:'linear-gradient(135deg,#F7B05A 0%,#E9812A 55%,#C45E1A 100%)', boxShadow:'0 8px 20px rgba(122,74,33,.35)', border:'1.5px solid #F2D08C' }}>
      <div aria-hidden="true" style={{ position:'absolute', right:-10, top:-14, opacity:.85 }}><Leaf size={64} color="#F9D27D" rotate={-15}/></div>
      <div aria-hidden="true" style={{ position:'absolute', left:6, bottom:-6 }}><MascotImg size={104} /></div>
      <div aria-hidden="true" style={{ position:'absolute', right:6, bottom:4 }}><RoastTurkey size={112}/></div>
      <div style={{ position:'absolute', left: hasMascot ? 112 : 20, top:22, right:116 }}>
        <div style={{ fontSize:19, fontWeight:900, color:'#FFF4E2', textShadow:'0 2px 0 rgba(90,52,20,.5)', lineHeight:1.25 }}>{tt('感恩節快樂！', 'Happy Thanksgiving!', '感謝祭おめでとう！')}</div>
        <div style={{ fontSize:12, color:'#FFEBC9', marginTop:6, lineHeight:1.5, textShadow:'0 1px 0 rgba(90,52,20,.5)' }}>{tt('感謝有你，一起放手爬', 'Thankful for you — keep climbing', 'ありがとう、これからも一緒に')}</div>
      </div>
    </div>
  );
}
