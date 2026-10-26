// 萬聖節裝飾（純展示，無互動、無資料）。僅在 isHalloween() 為真時由登入頁／首頁引用。
import { tt } from '../utils/memberI18n';

const OR = '#F28C28', OR_D = '#C2610C', PU = '#6B3FA0', PU_L = '#B79AE0';

export function Pumpkin({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 14c2-5 6-7 10-7" stroke="#4E8F3A" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <ellipse cx="20" cy="38" rx="14" ry="20" fill={OR_D}/><ellipse cx="44" cy="38" rx="14" ry="20" fill={OR_D}/>
      <ellipse cx="32" cy="38" rx="17" ry="22" fill={OR}/>
      <path d="M21 33l6 6-8 1zM43 33l-6 6 8 1z" fill="#3B2314"/>
      <path d="M22 47q10 8 20 0l-3-2-3 3-4-3-4 3-3-3z" fill="#3B2314"/>
    </svg>
  );
}
export function Bat({ size = 40, color = PU }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 64 38" aria-hidden="true">
      <path d="M32 10c3 0 4 3 5 5 4-6 10-9 17-8-3 4-3 8-2 12-3-1-6 0-8 3-2-3-5-4-8-3-1 5-2 9-4 14-2-5-3-9-4-14-3-1-6 0-8 3-2-3-5-4-8-3 1-4 1-8-2-12 7-1 13 2 17 8 1-2 2-5 5-5z" fill={color}/>
    </svg>
  );
}
export function Ghost({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 64" aria-hidden="true">
      <path d="M8 58V26C8 12 17 4 28 4s20 8 20 22v32l-7-6-6 6-7-6-7 6-6-6z" fill="#fff" stroke={PU_L} strokeWidth="3" strokeLinejoin="round"/>
      <circle cx="21" cy="28" r="4" fill="#2B2B33"/><circle cx="35" cy="28" r="4" fill="#2B2B33"/>
      <ellipse cx="28" cy="40" rx="5" ry="6" fill="#2B2B33"/>
    </svg>
  );
}

// 祝福語橫幅（首頁用）
export function HalloweenStrip({ style }) {
  return (
    <div style={{ margin:'12px 16px 0', borderRadius:14, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between',
      background:'linear-gradient(90deg,#FFF1DC 0%,#F3E8FA 100%)', border:'0.5px solid #EBCFA6', ...style }}>
      <Pumpkin size={40} />
      <div style={{ textAlign:'center', padding:'0 8px' }}>
        <div style={{ fontSize:15, fontWeight:800, color:OR_D }}>{tt('萬聖節快樂！🎃', 'Happy Halloween! 🎃', 'ハッピーハロウィン！🎃')}</div>
        <div style={{ fontSize:11, color:PU, marginTop:2 }}>{tt('紅石攀岩祝你玩得盡興', 'RedRock wishes you a spook-tacular climb', '紅石クライミングより、楽しい一日を')}</div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:2 }}><Bat size={30} /><Ghost size={34} /></div>
    </div>
  );
}

// 登入頁頂部裝飾
export function HalloweenTop() {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:6, padding:'0 6px' }} aria-hidden="true">
      <Pumpkin size={46} />
      <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}><Bat size={34} /><Bat size={24} color="#8E63C8" /></div>
      <Ghost size={42} />
    </div>
  );
}
export function HalloweenGreeting() {
  return (
    <div style={{ textAlign:'center', marginTop:18, fontSize:13, fontWeight:800, color:'#FFD9A0' }}>
      {tt('🎃 萬聖節快樂！紅石攀岩祝你玩得盡興', '🎃 Happy Halloween from RedRock!', '🎃 ハッピーハロウィン！紅石クライミング')}
    </div>
  );
}

// ───────── 重度版（2026-10-26 加）：更多南瓜、鬼怪、小紅石巫師、月亮、墓碑、蜘蛛 ─────────
export const HW = { night:'#2B1646', night2:'#5A2A82', orange:'#F28C28', orangeL:'#FFB45C', cream:'#FBEBD6', lilac:'#F3E8FA', ink:'#3B2314' };

export function Moon({ size = 60 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="26" fill="#FFE9A0"/><circle cx="32" cy="32" r="30" fill="#FFE9A0" opacity=".25"/>
      <circle cx="24" cy="26" r="5" fill="#F3D679"/><circle cx="40" cy="38" r="7" fill="#F3D679"/><circle cx="36" cy="20" r="3" fill="#F3D679"/>
    </svg>
  );
}
export function Spider({ size = 34, line = 30 }) {
  return (
    <svg width={size} height={size + line} viewBox={`0 0 40 ${40 + line}`} aria-hidden="true">
      <path d={`M20 0V${line + 8}`} stroke="#B9A6D6" strokeWidth="2"/>
      <g transform={`translate(0 ${line})`}>
        <path d="M8 18l-6-8M10 24l-8 2M32 18l6-8M30 24l8 2M12 14l-4-9M28 14l4-9M12 30l-5 8M28 30l5 8" stroke="#2B2B33" strokeWidth="2.5" strokeLinecap="round"/>
        <ellipse cx="20" cy="26" rx="10" ry="11" fill="#2B2B33"/><circle cx="20" cy="14" r="6" fill="#2B2B33"/>
        <circle cx="18" cy="13" r="1.6" fill="#FF5A5A"/><circle cx="23" cy="13" r="1.6" fill="#FF5A5A"/>
      </g>
    </svg>
  );
}
export function Tombstone({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 56" aria-hidden="true">
      <path d="M6 54V22C6 10 14 4 24 4s18 6 18 18v32z" fill="#8F8A99" stroke="#6C677A" strokeWidth="3"/>
      <text x="24" y="34" textAnchor="middle" fontSize="13" fontWeight="900" fill="#4B4658">RIP</text>
    </svg>
  );
}
export function Candy({ size = 30 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 60 36" aria-hidden="true">
      <path d="M2 6l14 12L2 30zM58 6L44 18l14 12z" fill="#FF8FB0"/><ellipse cx="30" cy="18" rx="16" ry="14" fill="#FFB45C" stroke="#C2610C" strokeWidth="2.5"/>
      <path d="M20 10l12 16M28 6l12 16" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".8"/>
    </svg>
  );
}
// ───────── 圖檔版（2026-10-26 重度版 v2）：素材放在 /public/halloween/*.webp（只在萬聖節期間才會被載入）─────────
export const hwImg = (name) => `/halloween/${name}.webp`;
export function Sprite({ name, size = 40, style }) {
  return <img src={hwImg(name)} alt="" aria-hidden="true" draggable="false" style={{ width:size, height:'auto', display:'block', pointerEvents:'none', userSelect:'none', ...style }} />;
}
// 底部一排南瓜田
export function PumpkinPatch({ style, compact }) {
  const row = compact ? [['pk1',34],['ghost1',32],['pumpkin-big',44],['candy',28],['pk3',34],['ghost2',30],['pk2',36]]
                      : [['pk1',44],['ghost1',42],['tomb',34],['pumpkin-big',58],['candy',34],['pk3',44],['ghost2',38],['lantern',30],['pk2',48]];
  return (
    <div aria-hidden="true" style={{ display:'flex', justifyContent:'space-around', alignItems:'flex-end', padding:'0 6px', pointerEvents:'none', ...style }}>
      {row.map(([n, w], i) => <Sprite key={i} name={n} size={w} />)}
    </div>
  );
}
// 登入頁頂部：夜空城堡橫幅＋巫師小紅石
export function HalloweenScene() {
  return (
    <div aria-hidden="true" style={{ position:'relative', height:170, margin:'0 -6px 10px', borderRadius:18, overflow:'hidden',
      background:`url(${hwImg('banner')}) right bottom / auto 100% no-repeat, linear-gradient(135deg,${HW.night},${HW.night2})`, boxShadow:'0 8px 24px rgba(0,0,0,.35)', border:'1.5px solid #C2610C' }}>
      <div style={{ position:'absolute', left:6, bottom:-6 }}><Sprite name="mascot2" size={118} /></div>
      <div style={{ position:'absolute', right:70, top:10 }}><Sprite name="bat2" size={44} /></div><div style={{ position:'absolute', left:150, top:0 }}><Sprite name="spider" size={26} /></div>
    </div>
  );
}
// 首頁大橫幅：橫幅底圖＋巫師小紅石＋祝福語（文字用程式寫，三語都能顯示）
export function HalloweenHero() {
  return (
    <div style={{ margin:'12px 16px 0', borderRadius:18, height:150, position:'relative', overflow:'hidden',
      background:`url(${hwImg('banner')}) right bottom / auto 100% no-repeat, linear-gradient(135deg,${HW.night},${HW.night2})`, boxShadow:'0 8px 22px rgba(43,22,70,.4)', border:'1.5px solid #C2610C' }}>
      <div aria-hidden="true" style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,rgba(30,15,56,.92) 0%,rgba(30,15,56,.7) 50%,rgba(30,15,56,0) 85%)' }} />
      <div aria-hidden="true" style={{ position:'absolute', left:4, bottom:-8 }}><Sprite name="mascot2" size={118} /></div>
      <div style={{ position:'absolute', left:118, top:22, right:10 }}>
        <div style={{ fontSize:20, fontWeight:900, color:HW.orangeL, textShadow:'0 2px 0 rgba(0,0,0,.45)', lineHeight:1.25 }}>{tt('萬聖節快樂！', 'Happy Halloween!', 'ハッピーハロウィン！')}</div>
        <div style={{ fontSize:12, color:'#F1E6FF', marginTop:6, lineHeight:1.5, textShadow:'0 1px 0 rgba(0,0,0,.5)' }}>{tt('紅石攀岩祝你玩得盡興', 'RedRock wishes you a spook-tacular climb', '紅石クライミングより、楽しい一日を')}</div>
      </div>
      <div aria-hidden="true" style={{ position:'absolute', right:6, bottom:2, display:'flex', gap:2, alignItems:'flex-end' }}><Sprite name="pk1" size={34} /><Sprite name="ghost1" size={32} /><Sprite name="pk3" size={38} /></div>
    </div>
  );
}
