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
    <div style={{ textAlign:'center', marginTop:18, fontSize:13, fontWeight:700, color:OR_D }}>
      {tt('🎃 萬聖節快樂！紅石攀岩祝你玩得盡興', '🎃 Happy Halloween from RedRock!', '🎃 ハッピーハロウィン！紅石クライミング')}
    </div>
  );
}
